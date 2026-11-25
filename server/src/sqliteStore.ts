import fs from 'fs';
import path from 'path';
import type { AuditLog, ContentReport, Message, RegisteredAccount } from './types.js';

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
        CREATE TABLE IF NOT EXISTS read_cursors (
          username TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          last_message_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (username, channel_id)
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          details TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS accounts_index (
          username_lower TEXT PRIMARY KEY,
          id TEXT NOT NULL,
          username TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          is_banned INTEGER NOT NULL DEFAULT 0,
          wallet_balance REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS content_reports (
          id TEXT PRIMARY KEY,
          reporter_username TEXT NOT NULL,
          target_username TEXT NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status, created_at DESC);
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

  putJsonSnapshotBatch(entries: Array<[string, unknown]>): number {
    if (!this.isActive() || !Array.isArray(entries) || entries.length === 0) return 0;
    let written = 0;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const stmt = this.db.prepare(
        'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)'
      );
      const nowIso = new Date().toISOString();
      for (const [key, value] of entries) {
        if (!key) continue;
        stmt.run(key, JSON.stringify(value), nowIso);
        written += 1;
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      return 0;
    }
    return written;
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

  deleteMessagesBulk(ids: string[]): number {
    if (!this.isActive() || !Array.isArray(ids) || ids.length === 0) return 0;
    const unique = Array.from(
      new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    ).slice(0, 100);
    if (unique.length === 0) return 0;

    let deleted = 0;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const delMsg = this.db.prepare('DELETE FROM messages WHERE id = ?');
      const delFts = this.db.prepare('DELETE FROM messages_fts WHERE id = ?');
      for (const id of unique) {
        const info = delMsg.run(id);
        if (info && Number(info.changes) > 0) deleted += 1;
        delFts.run(id);
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      return 0;
    }
    return deleted;
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

  getMessagesAround(
    channelId: string,
    messageId: string,
    radius = 25
  ): { messages: Message[]; hasMoreBefore: boolean; hasMoreAfter: boolean; found: boolean } {
    if (!this.isActive() || !channelId || !messageId) {
      return { messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false };
    }
    const clampedRadius = Math.min(Math.max(Number(radius) || 25, 1), 100);
    try {
      const target = this.db
        .prepare('SELECT seq FROM messages WHERE channel_id = ? AND id = ?')
        .get(channelId, messageId) as { seq?: number } | undefined;
      if (!target || typeof target.seq !== 'number') {
        return { messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false };
      }

      const beforeRows = this.db
        .prepare('SELECT payload FROM messages WHERE channel_id = ? AND seq <= ? ORDER BY seq DESC LIMIT ?')
        .all(channelId, target.seq, clampedRadius + 2) as Array<{ payload: string }>;
      const hasMoreBefore = beforeRows.length > clampedRadius + 1;
      const beforeSlice = hasMoreBefore ? beforeRows.slice(0, clampedRadius + 1) : beforeRows;

      const afterRows = this.db
        .prepare('SELECT payload FROM messages WHERE channel_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?')
        .all(channelId, target.seq, clampedRadius + 1) as Array<{ payload: string }>;
      const hasMoreAfter = afterRows.length > clampedRadius;
      const afterSlice = hasMoreAfter ? afterRows.slice(0, clampedRadius) : afterRows;

      const result: Message[] = [];
      for (let i = beforeSlice.length - 1; i >= 0; i--) {
        try {
          result.push(JSON.parse(beforeSlice[i].payload) as Message);
        } catch {}
      }
      for (const row of afterSlice) {
        try {
          result.push(JSON.parse(row.payload) as Message);
        } catch {}
      }
      return { messages: result, hasMoreBefore, hasMoreAfter, found: true };
    } catch {
      return { messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false };
    }
  }

  upsertReadCursor(username: string, channelId: string, lastMessageId: string): void {
    if (!this.isActive() || !username || !channelId || !lastMessageId) return;
    try {
      this.db
        .prepare(
          `INSERT INTO read_cursors (username, channel_id, last_message_id, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(username, channel_id)
           DO UPDATE SET last_message_id = excluded.last_message_id, updated_at = excluded.updated_at`
        )
        .run(username.trim().toLowerCase(), channelId, lastMessageId, new Date().toISOString());
    } catch {}
  }

  getReadCursorsForUser(username: string): Record<string, string> {
    if (!this.isActive() || !username) return {};
    const out: Record<string, string> = {};
    try {
      const rows = this.db
        .prepare('SELECT channel_id as channelId, last_message_id as lastMessageId FROM read_cursors WHERE username = ?')
        .all(username.trim().toLowerCase()) as Array<{ channelId: string; lastMessageId: string }>;
      for (const row of rows) {
        out[row.channelId] = row.lastMessageId;
      }
    } catch {}
    return out;
  }

  getAllReadCursors(): Map<string, Record<string, string>> {
    const out = new Map<string, Record<string, string>>();
    if (!this.isActive()) return out;
    try {
      const rows = this.db
        .prepare('SELECT username, channel_id as channelId, last_message_id as lastMessageId FROM read_cursors')
        .all() as Array<{ username: string; channelId: string; lastMessageId: string }>;
      for (const row of rows) {
        const key = row.username.toLowerCase();
        const existing = out.get(key) || {};
        existing[row.channelId] = row.lastMessageId;
        out.set(key, existing);
      }
    } catch {}
    return out;
  }

  deleteReadCursorsForUser(username: string): void {
    if (!this.isActive() || !username) return;
    try {
      this.db.prepare('DELETE FROM read_cursors WHERE username = ?').run(username.trim().toLowerCase());
    } catch {}
  }

  insertAuditLog(entry: AuditLog): void {
    if (!this.isActive() || !entry?.id) return;
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO audit_logs (id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)')
        .run(entry.id, entry.action, entry.details, entry.type, entry.timestamp);
    } catch {}
  }

  importAuditLogs(entries: AuditLog[]): number {
    if (!this.isActive() || !Array.isArray(entries) || entries.length === 0) return 0;
    let inserted = 0;
    try {
      this.db.exec('BEGIN');
      const stmt = this.db.prepare(
        'INSERT OR IGNORE INTO audit_logs (id, action, details, type, timestamp) VALUES (?, ?, ?, ?, ?)'
      );
      // entries are newest-first; insert oldest-first so rowid ordering stays consistent
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (!e?.id) continue;
        const info = stmt.run(e.id, e.action, e.details, e.type || 'info', e.timestamp || '');
        if (info && Number(info.changes) > 0) inserted += 1;
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
    }
    return inserted;
  }

  listAuditLogs(limit = 200): AuditLog[] {
    if (!this.isActive()) return [];
    const clamped = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    try {
      const rows = this.db
        .prepare('SELECT id, action, details, type, timestamp FROM audit_logs ORDER BY rowid DESC LIMIT ?')
        .all(clamped) as AuditLog[];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
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

  backupToFile(destPath: string): { ok: boolean; bytes?: number; error?: string } {
    if (!this.isActive() || !this.db) {
      return { ok: false, error: 'SQLite depolama motoru aktif değil.' };
    }
    try {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      const escaped = destPath.replace(/'/g, "''");
      this.db.exec(`VACUUM INTO '${escaped}'`);
      const st = fs.statSync(destPath);
      return { ok: true, bytes: st.size };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'SQLite yedekleme başarısız.' };
    }
  }

  getAllReferencedAttachmentUrls(): string[] {
    if (!this.isActive() || !this.db) return [];
    const out = new Set<string>();
    const urlRegex = /(?:\/api\/sounds\/|\/uploads\/)([a-zA-Z0-9._-]+)/g;
    try {
      const rows = this.db
        .prepare("SELECT payload FROM messages WHERE payload LIKE '%/uploads/%' OR payload LIKE '%/api/sounds/%'")
        .all() as Array<{ payload?: string }>;
      for (const row of rows) {
        if (!row?.payload) continue;
        try {
          const msg = JSON.parse(row.payload) as Message;
          if (Array.isArray(msg.attachments)) {
            for (const att of msg.attachments) {
              if (typeof att?.url === 'string' && att.url) out.add(att.url);
            }
          }
          if (typeof msg.content === 'string' && msg.content) {
            urlRegex.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = urlRegex.exec(msg.content)) !== null) {
              if (m[0]) out.add(m[0]);
            }
          }
        } catch {}
      }
    } catch {}
    return Array.from(out);
  }

  syncAccountsIndex(accounts: Map<string, RegisteredAccount>): number {
    if (!this.isActive() || !this.db || !accounts || accounts.size === 0) return 0;
    const nowIso = new Date().toISOString();
    let count = 0;
    try {
      this.db.exec('BEGIN');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO accounts_index
          (username_lower, id, username, email, role, is_banned, wallet_balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [unameLower, acc] of accounts.entries()) {
        stmt.run(
          unameLower,
          acc.id,
          acc.username,
          acc.email || '',
          acc.role || 'user',
          acc.isBanned ? 1 : 0,
          Number(acc.walletBalance) || 0,
          acc.createdAt || nowIso,
          nowIso
        );
        count += 1;
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
    }
    return count;
  }

  listAccountSummaries(limit = 500): Array<{
    id: string;
    username: string;
    email: string;
    role: string;
    isBanned: boolean;
    walletBalance: number;
  }> {
    if (!this.isActive() || !this.db) return [];
    try {
      const rows = this.db
        .prepare(
          'SELECT id, username, email, role, is_banned as isBanned, wallet_balance as walletBalance FROM accounts_index ORDER BY username_lower ASC LIMIT ?'
        )
        .all(Math.min(Math.max(limit, 1), 2000)) as Array<{
        id: string;
        username: string;
        email: string;
        role: string;
        isBanned: number;
        walletBalance: number;
      }>;
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id),
        username: String(r.username),
        email: String(r.email || ''),
        role: String(r.role || 'user'),
        isBanned: Boolean(r.isBanned),
        walletBalance: Number(r.walletBalance) || 0,
      }));
    } catch {
      return [];
    }
  }

  upsertContentReport(report: ContentReport): void {
    if (!this.isActive() || !this.db || !report?.id) return;
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO content_reports
            (id, reporter_username, target_username, reason, status, created_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          report.id,
          report.reporterUsername,
          report.targetUsername,
          report.reason,
          report.status,
          report.createdAt,
          JSON.stringify(report)
        );
    } catch {}
  }

  syncContentReports(reports: ContentReport[]): number {
    if (!this.isActive() || !this.db || !Array.isArray(reports)) return 0;
    let count = 0;
    try {
      this.db.exec('BEGIN');
      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO content_reports
          (id, reporter_username, target_username, reason, status, created_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of reports) {
        if (!r?.id) continue;
        stmt.run(
          r.id,
          r.reporterUsername,
          r.targetUsername,
          r.reason,
          r.status,
          r.createdAt,
          JSON.stringify(r)
        );
        count += 1;
      }
      this.db.exec('COMMIT');
    } catch {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
    }
    return count;
  }

  listContentReports(status?: ContentReport['status'], limit = 200): ContentReport[] {
    if (!this.isActive() || !this.db) return [];
    const capped = Math.min(Math.max(limit, 1), 1000);
    try {
      const rows = status
        ? (this.db
            .prepare('SELECT payload FROM content_reports WHERE status = ? ORDER BY created_at DESC LIMIT ?')
            .all(status, capped) as Array<{ payload?: string }>)
        : (this.db
            .prepare('SELECT payload FROM content_reports ORDER BY created_at DESC LIMIT ?')
            .all(capped) as Array<{ payload?: string }>);
      const out: ContentReport[] = [];
      for (const row of rows || []) {
        if (!row?.payload) continue;
        try {
          out.push(JSON.parse(row.payload) as ContentReport);
        } catch {}
      }
      return out;
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
