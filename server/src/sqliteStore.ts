import fs from 'fs';
import path from 'path';
import type { Message } from './types.js';

export interface FtsSearchHit {
  id: string;
  channelId: string;
  author: string;
  content: string;
}

/**
 * Zero-native optional SQLite (WAL + FTS5) primary message & snapshot adapter powered by `node:sqlite`.
 * Gracefully stays disabled on runtimes without `node:sqlite` or when `STORAGE_ENGINE=json`.
 */
export class SqliteStore {
  private db: any = null;
  private active = false;
  private nextSeq = 0;
  private readonly dbPath: string;
  private initReason = 'not-initialized';

  constructor(private readonly dataDir: string) {
    this.dbPath = path.join(dataDir, 'cakma.sqlite');
  }

  async init(): Promise<boolean> {
    if (process.env.STORAGE_ENGINE === 'json') {
      this.active = false;
      this.initReason = 'forced-json';
      return false;
    }
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const modName = 'node:sqlite';
      const sqliteMod = (await import(modName)) as any;
      const DatabaseSync = sqliteMod?.DatabaseSync;
      if (typeof DatabaseSync !== 'function') {
        this.initReason = 'no-DatabaseSync';
        return false;
      }
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_channel_seq ON messages(channel_id, seq);
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          id UNINDEXED,
          channel_id UNINDEXED,
          author,
          content
        );
      `);
      const seqRow = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM messages').get();
      this.nextSeq = Number(seqRow?.maxSeq || 0);
      this.active = true;
      this.initReason = 'ok';
      return true;
    } catch (err: any) {
      this.db = null;
      this.active = false;
      this.initReason = err?.message || 'unavailable';
      return false;
    }
  }

  isActive(): boolean {
    return this.active && Boolean(this.db);
  }

  getEngineName(): 'sqlite-wal-fts5' | 'json-sharded' {
    return this.isActive() ? 'sqlite-wal-fts5' : 'json-sharded';
  }

  getInfo() {
    return {
      engine: this.getEngineName(),
      sqliteAvailable: this.isActive(),
      dbPath: this.dbPath,
      reason: this.initReason,
    };
  }

  putJsonSnapshot(key: string, value: unknown): void {
    if (!this.isActive()) return;
    try {
      const stmt = this.db.prepare(
        'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)'
      );
      stmt.run(key, JSON.stringify(value), new Date().toISOString());
    } catch {}
  }

  getJsonSnapshot<T = any>(key: string): T | null {
    if (!this.isActive()) return null;
    try {
      const row = this.db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
      if (row && typeof row.value === 'string') {
        return JSON.parse(row.value) as T;
      }
    } catch {}
    return null;
  }

  getMessageCount(): number {
    if (!this.isActive()) return 0;
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM messages').get();
      return Number(row?.cnt || 0);
    } catch {
      return 0;
    }
  }

  upsertMessage(channelId: string, msg: Message): void {
    if (!this.isActive() || !msg?.id || !channelId) return;
    try {
      const serialized = JSON.stringify(msg);
      const existing = this.db.prepare('SELECT seq FROM messages WHERE id = ?').get(msg.id);
      if (existing) {
        this.db.prepare('UPDATE messages SET payload = ?, channel_id = ? WHERE id = ?').run(serialized, channelId, msg.id);
      } else {
        this.nextSeq += 1;
        this.db
          .prepare('INSERT INTO messages (id, channel_id, seq, payload) VALUES (?, ?, ?, ?)')
          .run(msg.id, channelId, this.nextSeq, serialized);
      }
      this.indexMessage(channelId, msg);
    } catch {}
  }

  deleteMessage(id: string): void {
    if (!this.isActive() || !id) return;
    try {
      this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
      this.removeMessage(id);
    } catch {}
  }

  deleteChannelMessages(channelId: string): void {
    if (!this.isActive() || !channelId) return;
    try {
      this.db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
      this.db.prepare('DELETE FROM messages_fts WHERE channel_id = ?').run(channelId);
    } catch {}
  }

  replaceChannelMessages(channelId: string, list: Message[]): void {
    if (!this.isActive() || !channelId) return;
    try {
      this.db.exec('BEGIN');
      this.db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
      this.db.prepare('DELETE FROM messages_fts WHERE channel_id = ?').run(channelId);
      const insMsg = this.db.prepare(
        'INSERT INTO messages (id, channel_id, seq, payload) VALUES (?, ?, ?, ?)'
      );
      const insFts = this.db.prepare(
        'INSERT INTO messages_fts (id, channel_id, author, content) VALUES (?, ?, ?, ?)'
      );
      for (const msg of list || []) {
        if (!msg?.id) continue;
        this.nextSeq += 1;
        insMsg.run(msg.id, channelId, this.nextSeq, JSON.stringify(msg));
        const author = String(msg.author?.username || '');
        const content = String(msg.content || '');
        if (content.trim() || author.trim()) {
          insFts.run(msg.id, channelId, author, content);
        }
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
    }
  }

  importMessagesMap(messagesMap: Record<string, Message[]>, clearExisting = false): number {
    if (!this.isActive()) return 0;
    let imported = 0;
    try {
      this.db.exec('BEGIN');
      if (clearExisting) {
        this.db.exec('DELETE FROM messages');
        this.db.exec('DELETE FROM messages_fts');
        this.nextSeq = 0;
      }
      const insMsg = this.db.prepare(
        'INSERT OR IGNORE INTO messages (id, channel_id, seq, payload) VALUES (?, ?, ?, ?)'
      );
      const delFts = this.db.prepare('DELETE FROM messages_fts WHERE id = ?');
      const insFts = this.db.prepare(
        'INSERT INTO messages_fts (id, channel_id, author, content) VALUES (?, ?, ?, ?)'
      );
      for (const [channelId, list] of Object.entries(messagesMap || {})) {
        if (!Array.isArray(list)) continue;
        for (const msg of list) {
          if (!msg?.id) continue;
          this.nextSeq += 1;
          const info = insMsg.run(msg.id, channelId, this.nextSeq, JSON.stringify(msg));
          if (info && Number(info.changes) > 0) {
            imported++;
            const author = String(msg.author?.username || '');
            const content = String(msg.content || '');
            if (content.trim() || author.trim()) {
              delFts.run(msg.id);
              insFts.run(msg.id, channelId, author, content);
            }
          }
        }
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
    }
    return imported;
  }

  loadRecentMessagesPerChannel(limitPerChannel = 300): Record<string, Message[]> {
    if (!this.isActive()) return {};
    const limit = Math.min(Math.max(Number(limitPerChannel) || 300, 1), 2000);
    const out: Record<string, Message[]> = {};
    try {
      const channels = this.db.prepare('SELECT DISTINCT channel_id as channelId FROM messages').all() as Array<{ channelId: string }>;
      const selectStmt = this.db.prepare(
        'SELECT payload FROM messages WHERE channel_id = ? ORDER BY seq DESC LIMIT ?'
      );
      for (const ch of channels) {
        const rows = selectStmt.all(ch.channelId, limit) as Array<{ payload: string }>;
        const parsed: Message[] = [];
        for (let i = rows.length - 1; i >= 0; i--) {
          try {
            parsed.push(JSON.parse(rows[i].payload) as Message);
          } catch {}
        }
        out[ch.channelId] = parsed;
      }
    } catch {}
    return out;
  }

  exportAllMessagesMap(): Record<string, Message[]> {
    if (!this.isActive()) return {};
    const out: Record<string, Message[]> = {};
    try {
      const rows = this.db.prepare('SELECT channel_id as channelId, payload FROM messages ORDER BY seq ASC').all() as Array<{
        channelId: string;
        payload: string;
      }>;
      for (const row of rows) {
        try {
          const msg = JSON.parse(row.payload) as Message;
          if (!out[row.channelId]) out[row.channelId] = [];
          out[row.channelId].push(msg);
        } catch {}
      }
    } catch {}
    return out;
  }

  getChannelMessagesPage(
    channelId: string,
    beforeId?: string,
    limit = 50
  ): { messages: Message[]; hasMore: boolean } {
    if (!this.isActive() || !channelId) return { messages: [], hasMore: false };
    const clampedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    try {
      let rows: Array<{ payload: string }> = [];
      if (beforeId) {
        const anchor = this.db
          .prepare('SELECT seq FROM messages WHERE channel_id = ? AND id = ?')
          .get(channelId, beforeId) as { seq?: number } | undefined;
        if (!anchor || typeof anchor.seq !== 'number') {
          return { messages: [], hasMore: false };
        }
        rows = this.db
          .prepare('SELECT payload FROM messages WHERE channel_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?')
          .all(channelId, anchor.seq, clampedLimit + 1) as Array<{ payload: string }>;
      } else {
        rows = this.db
          .prepare('SELECT payload FROM messages WHERE channel_id = ? ORDER BY seq DESC LIMIT ?')
          .all(channelId, clampedLimit + 1) as Array<{ payload: string }>;
      }

      const hasMore = rows.length > clampedLimit;
      const slice = hasMore ? rows.slice(0, clampedLimit) : rows;
      const messages: Message[] = [];
      for (let i = slice.length - 1; i >= 0; i--) {
        try {
          messages.push(JSON.parse(slice[i].payload) as Message);
        } catch {}
      }
      return { messages, hasMore };
    } catch {
      return { messages: [], hasMore: false };
    }
  }

  getMessageById(id: string): { channelId: string; message: Message } | null {
    if (!this.isActive() || !id) return null;
    try {
      const row = this.db
        .prepare('SELECT channel_id as channelId, payload FROM messages WHERE id = ?')
        .get(id) as { channelId: string; payload: string } | undefined;
      if (!row) return null;
      return {
        channelId: row.channelId,
        message: JSON.parse(row.payload) as Message,
      };
    } catch {
      return null;
    }
  }

  indexMessage(channelId: string, msg: Pick<Message, 'id' | 'content' | 'author'>): void {
    if (!this.isActive() || !msg?.id) return;
    try {
      this.db.prepare('DELETE FROM messages_fts WHERE id = ?').run(msg.id);
      const author = String(msg.author?.username || '');
      const content = String(msg.content || '');
      if (content.trim() || author.trim()) {
        this.db
          .prepare('INSERT INTO messages_fts (id, channel_id, author, content) VALUES (?, ?, ?, ?)')
          .run(msg.id, channelId, author, content);
      }
    } catch {}
  }

  removeMessage(id: string): void {
    if (!this.isActive() || !id) return;
    try {
      this.db.prepare('DELETE FROM messages_fts WHERE id = ?').run(id);
    } catch {}
  }

  syncAllMessages(messagesMap: Record<string, Message[]>): number {
    if (!this.isActive()) return 0;
    let count = 0;
    try {
      this.db.exec('BEGIN');
      this.db.exec('DELETE FROM messages_fts');
      const ins = this.db.prepare(
        'INSERT INTO messages_fts (id, channel_id, author, content) VALUES (?, ?, ?, ?)'
      );
      for (const [channelId, list] of Object.entries(messagesMap || {})) {
        if (!Array.isArray(list)) continue;
        for (const msg of list) {
          if (!msg?.id) continue;
          const author = String(msg.author?.username || '');
          const content = String(msg.content || '');
          if (content.trim() || author.trim()) {
            ins.run(msg.id, channelId, author, content);
            count++;
          }
        }
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
    }
    return count;
  }

  searchMessagesFts(query: string, limit = 50): FtsSearchHit[] {
    if (!this.isActive()) return [];
    const tokens = String(query || '')
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter(Boolean)
      .slice(0, 6);
    if (tokens.length === 0) return [];

    const matchQuery = tokens.map((t) => `"${t}"*`).join(' AND ');
    try {
      const rows = this.db
        .prepare(
          'SELECT id, channel_id as channelId, author, content FROM messages_fts WHERE messages_fts MATCH ? LIMIT ?'
        )
        .all(matchQuery, Math.min(Math.max(limit, 1), 200));
      return Array.isArray(rows) ? (rows as FtsSearchHit[]) : [];
    } catch {
      return [];
    }
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
      this.active = false;
    }
  }
}
