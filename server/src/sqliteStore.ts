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
 * Zero-native optional SQLite (WAL + FTS5) adapter powered by Node's built-in `node:sqlite`.
 * Gracefully stays disabled on older Node runtimes (e.g., Node 20) where `node:sqlite` does not exist.
 */
export class SqliteStore {
  private db: any = null;
  private active = false;
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
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          id UNINDEXED,
          channel_id UNINDEXED,
          author,
          content
        );
      `);
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
