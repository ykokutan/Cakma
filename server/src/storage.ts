import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { RegisteredAccount, Server, Message, IssuedLicense, StoreSettings, AuditLog, FriendRequest, UserConnectionRecord, MemberLevelData, GroupDmRoom, ServerWebhook, ServerAuditEntry, ServerModerationCase, ScheduledMessage, ServerBot, ServerAutomationRule, ContentReport } from './types.js';
import { ShardedMessageStore, getInitialMessagesSlice, getChannelMessagesPage, searchAllMessages } from './messageStore.js';
import { SqliteStore } from './sqliteStore.js';

export { getInitialMessagesSlice, getChannelMessagesPage, searchAllMessages };

// Resolve persistent data directory
export function getPersistentDir(): string {
  const override = process.env.CAKMA_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  const cwd = process.cwd();
  if (path.basename(cwd) === 'server' && fs.existsSync(path.resolve(cwd, '..', 'package.json'))) {
    return path.resolve(cwd, '..', 'data');
  }
  return path.resolve(cwd, 'data');
}

const DATA_DIR = getPersistentDir();
export const messageStore = new ShardedMessageStore(DATA_DIR);
export const sqliteStore = new SqliteStore(DATA_DIR);

export async function initStorageEngine(
  messagesMap?: Record<string, Message[]>,
  opts?: { accounts?: Map<string, RegisteredAccount>; auditLogs?: AuditLog[] }
) {
  const ok = await sqliteStore.init();
  if (ok && messagesMap) {
    const existingCount = sqliteStore.getMessageCount();
    if (existingCount === 0) {
      const imported = sqliteStore.importMessagesMap(messagesMap);
      console.log(`🗄️ [Storage] SQLite WAL + FTS5 aktif (${imported} mesaj JSON'dan SQLite'a aktarıldı).`);
    } else {
      const recent = sqliteStore.loadRecentMessagesPerChannel(300);
      for (const chId of Object.keys(messagesMap)) {
        if (!recent[chId]) {
          delete messagesMap[chId];
        }
      }
      for (const [chId, msgs] of Object.entries(recent)) {
        messagesMap[chId] = msgs;
      }
      console.log(`🗄️ [Storage] SQLite WAL + FTS5 aktif (toplam ${existingCount} mesaj, son pencere yüklendi).`);
    }
  } else {
    console.log(`💾 [Storage] Depolama motoru: ${sqliteStore.getEngineName()} (${sqliteStore.getInfo().reason})`);
  }

  if (ok && opts?.accounts) {
    sqliteStore.syncAccountsIndex(opts.accounts);
    const sqlCursors = sqliteStore.getAllReadCursors();
    for (const [unameLower, acc] of opts.accounts.entries()) {
      const sqlMap = sqlCursors.get(unameLower);
      const jsonMap = acc.readCursors || {};
      if (sqlMap) {
        acc.readCursors = { ...jsonMap, ...sqlMap };
      } else if (Object.keys(jsonMap).length > 0) {
        for (const [chId, msgId] of Object.entries(jsonMap)) {
          sqliteStore.upsertReadCursor(unameLower, chId, msgId);
        }
      }
    }
  }

  if (ok && opts?.auditLogs) {
    const sqlLogs = sqliteStore.listAuditLogs(200);
    if (sqlLogs.length === 0 && opts.auditLogs.length > 0) {
      sqliteStore.importAuditLogs(opts.auditLogs);
    } else if (sqlLogs.length > 0) {
      opts.auditLogs.splice(0, opts.auditLogs.length, ...sqlLogs);
    }
  }

  return sqliteStore.getInfo();
}

export function getStorageEngineInfo() {
  return sqliteStore.getInfo();
}

export function searchMessagesSmart(
  allMessages: Record<string, Message[]>,
  query: string,
  allowedChannelIds?: Set<string>,
  limit = 50
) {
  if (sqliteStore.isActive()) {
    const ftsHits = sqliteStore.searchMessagesFts(query, limit * 2);
    if (ftsHits.length > 0) {
      const byId = new Map<string, Message>();
      const chIds = new Set(ftsHits.map((h) => h.channelId));
      for (const chId of chIds) {
        if (allowedChannelIds && !allowedChannelIds.has(chId)) continue;
        for (const msg of allMessages[chId] || []) {
          byId.set(msg.id, msg);
        }
      }
      const hydrated: Array<{ channelId: string; message: Message }> = [];
      for (const hit of ftsHits) {
        if (allowedChannelIds && !allowedChannelIds.has(hit.channelId)) continue;
        let found = byId.get(hit.id);
        if (!found) {
          const fromDb = sqliteStore.getMessageById(hit.id);
          if (fromDb && fromDb.channelId === hit.channelId) {
            found = fromDb.message;
          }
        }
        if (found) hydrated.push({ channelId: hit.channelId, message: found });
        if (hydrated.length >= limit) break;
      }
      if (hydrated.length > 0) return hydrated;
    }
  }
  return searchAllMessages(allMessages, query, allowedChannelIds, limit);
}

export function getChannelMessagesPageSmart(
  allMessages: Record<string, Message[]>,
  channelId: string,
  beforeId?: string,
  limit = 50
): { messages: Message[]; hasMore: boolean } {
  if (sqliteStore.isActive()) {
    const page = sqliteStore.getChannelMessagesPage(channelId, beforeId, limit);
    if (page.messages.length > 0 || !allMessages[channelId]?.length) {
      return page;
    }
  }
  return getChannelMessagesPage(allMessages[channelId], beforeId, limit);
}

export function getChannelMessageContextSmart(
  allMessages: Record<string, Message[]>,
  channelId: string,
  messageId: string,
  radius = 25
): { messages: Message[]; hasMoreBefore: boolean; hasMoreAfter: boolean; found: boolean } {
  if (sqliteStore.isActive()) {
    const ctx = sqliteStore.getMessagesAround(channelId, messageId, radius);
    if (ctx.found) {
      return ctx;
    }
  }
  const list = allMessages[channelId] || [];
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    return { messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false };
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(list.length, idx + radius + 1);
  return {
    messages: list.slice(start, end),
    hasMoreBefore: start > 0,
    hasMoreAfter: end < list.length,
    found: true,
  };
}

export function saveUserReadCursor(
  username: string,
  channelId: string,
  lastMessageId: string,
  accounts: Map<string, RegisteredAccount>
) {
  if (sqliteStore.isActive()) {
    sqliteStore.upsertReadCursor(username, channelId, lastMessageId);
    return;
  }
  saveAccounts(accounts);
}

export function deleteUserReadCursors(username: string) {
  sqliteStore.deleteReadCursorsForUser(username);
}

export function appendAuditLogRecord(entry: AuditLog, logs: AuditLog[]) {
  if (sqliteStore.isActive()) {
    sqliteStore.insertAuditLog(entry);
    return;
  }
  saveAuditLogs(logs);
}

const pendingWrites = new Map<string, any>();
const pendingTimers = new Map<string, NodeJS.Timeout>();
const inFlightWrites = new Map<string, Promise<void>>();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function safeWriteJson(filename: string, data: any) {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    const tempPath = `${filePath}.tmp-${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    if (sqliteStore.isActive()) {
      sqliteStore.putJsonSnapshot(filename, data);
    }
  } catch (err) {
    console.error(`❌ [Storage] ${filename} yazılamadı:`, err);
  }
}

async function writeJsonAsync(filename: string, data: any) {
  const prev = inFlightWrites.get(filename) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      try {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        const filePath = path.join(DATA_DIR, filename);
        const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        await fs.promises.rename(tempPath, filePath);
        if (sqliteStore.isActive()) {
          sqliteStore.putJsonSnapshot(filename, data);
        }
      } catch (err) {
        console.error(`❌ [Storage] ${filename} asenkron yazılamadı:`, err);
      }
    });
  inFlightWrites.set(filename, next);
  try {
    await next;
  } finally {
    if (inFlightWrites.get(filename) === next) {
      inFlightWrites.delete(filename);
    }
  }
}

export function scheduleWriteJson(filename: string, data: any, delayMs = 250) {
  pendingWrites.set(filename, data);
  const existing = pendingTimers.get(filename);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(filename);
    const snapshot = pendingWrites.get(filename);
    if (snapshot !== undefined) {
      pendingWrites.delete(filename);
      void writeJsonAsync(filename, snapshot);
    }
  }, delayMs);
  timer.unref?.();
  pendingTimers.set(filename, timer);
}

export function flushPendingWritesSync() {
  for (const [filename, timer] of pendingTimers.entries()) {
    clearTimeout(timer);
    pendingTimers.delete(filename);
  }
  const batchSnapshots: Array<[string, unknown]> = [];
  for (const [filename, data] of pendingWrites.entries()) {
    pendingWrites.delete(filename);
    try {
      ensureDataDir();
      const filePath = path.join(DATA_DIR, filename);
      const tempPath = `${filePath}.tmp-${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, filePath);
      batchSnapshots.push([filename, data]);
    } catch (err) {
      console.error(`❌ [Storage] ${filename} yazılamadı:`, err);
    }
  }
  if (batchSnapshots.length > 0 && sqliteStore.isActive()) {
    sqliteStore.putJsonSnapshotBatch(batchSnapshots);
  }
  messageStore.flushSync();
}

export function flushAllSnapshotsToSqlite(snapshots: Array<[string, unknown]>): number {
  return sqliteStore.putJsonSnapshotBatch(snapshots);
}

export function getPendingWriteCount(): number {
  return pendingWrites.size + inFlightWrites.size + messageStore.getPendingCount();
}

function safeReadJson<T>(filename: string, defaultValue: T): T {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`⚠️ [Storage] ${filename} okunamadı, varsayılan kullanılıyor:`, err);
  }
  return defaultValue;
}

// 1. ACCOUNTS (Kullanıcı Hesapları)
export function loadAccounts(): Map<string, RegisteredAccount> {
  const map = new Map<string, RegisteredAccount>();
  const list = safeReadJson<RegisteredAccount[]>('users.json', []);
  list.forEach(acc => {
    if (acc.username) {
      map.set(acc.username.toLowerCase(), acc);
    }
  });
  console.log(`💾 [Storage] ${map.size} kayıtlı kullanıcı veritabanından yüklendi.`);
  return map;
}

export function saveAccounts(accounts: Map<string, RegisteredAccount>) {
  const list = Array.from(accounts.values());
  scheduleWriteJson('users.json', list);
  if (sqliteStore.isActive()) {
    sqliteStore.syncAccountsIndex(accounts);
  }
}

// 2. SERVERS (Sunucular & Roller & Kanallar)
export function loadServers(defaultServers: Server[]): Server[] {
  const loaded = safeReadJson<Server[]>('servers.json', []);
  if (loaded && loaded.length > 0) {
    console.log(`💾 [Storage] ${loaded.length} sunucu ve rol yapılandırması yüklendi.`);
    return loaded;
  }
  // Initialize with defaults if empty
  safeWriteJson('servers.json', defaultServers);
  return defaultServers;
}

export function saveServers(servers: Server[]) {
  scheduleWriteJson('servers.json', servers);
}

// 3. MESSAGES (Kanal Mesajları — Parçalı Asenkron Depolama)
export function loadMessages(defaultMessages: Record<string, Message[]>): Record<string, Message[]> {
  return messageStore.loadAll(defaultMessages);
}

export function saveChannelMessages(channelId: string, channelMessages: Message[]) {
  if (sqliteStore.isActive()) {
    sqliteStore.replaceChannelMessages(channelId, channelMessages);
    return;
  }
  messageStore.scheduleSaveChannel(channelId, channelMessages);
}

export function saveChannelMessageUpsert(channelId: string, channelMessages: Message[], msg: Message) {
  if (sqliteStore.isActive()) {
    sqliteStore.upsertMessage(channelId, msg);
    return;
  }
  messageStore.scheduleSaveChannel(channelId, channelMessages);
}

export function saveChannelMessageDelete(channelId: string, channelMessages: Message[], messageId: string) {
  if (sqliteStore.isActive()) {
    sqliteStore.deleteMessage(messageId);
    return;
  }
  messageStore.scheduleSaveChannel(channelId, channelMessages);
}

export function saveChannelMessagesBulkDelete(
  channelId: string,
  channelMessages: Message[],
  messageIds: string[]
) {
  if (sqliteStore.isActive()) {
    sqliteStore.deleteMessagesBulk(messageIds);
    return;
  }
  messageStore.scheduleSaveChannel(channelId, channelMessages);
}

export function saveChannelMessageBulkReplace(channelId: string, channelMessages: Message[]) {
  if (sqliteStore.isActive()) {
    sqliteStore.replaceChannelMessages(channelId, channelMessages);
    return;
  }
  messageStore.scheduleSaveChannel(channelId, channelMessages);
}

export function indexChannelMessage(channelId: string, msg: Message) {
  if (!sqliteStore.isActive()) return;
  sqliteStore.indexMessage(channelId, msg);
}

export function removeIndexedMessage(id: string) {
  sqliteStore.removeMessage(id);
}

export function closeStorageEngine() {
  sqliteStore.close();
}

export function saveMessages(messages: Record<string, Message[]>) {
  if (sqliteStore.isActive()) {
    for (const [chId, list] of Object.entries(messages)) {
      if (Array.isArray(list)) {
        sqliteStore.replaceChannelMessages(chId, list);
      }
    }
    return;
  }
  for (const [chId, list] of Object.entries(messages)) {
    if (Array.isArray(list)) {
      messageStore.scheduleSaveChannel(chId, list);
    }
  }
}

// 4. LICENSES (Dedicated Lisansları)
export function loadLicenses(): Map<string, IssuedLicense> {
  const map = new Map<string, IssuedLicense>();
  const list = safeReadJson<IssuedLicense[]>('licenses.json', []);
  list.forEach(lic => {
    if (lic.id) {
      map.set(lic.id, lic);
    }
  });
  return map;
}

export function saveLicenses(licenses: Map<string, IssuedLicense>) {
  const list = Array.from(licenses.values());
  safeWriteJson('licenses.json', list);
}

// 5. STORE SETTINGS (Mağaza Ayarları)
export function loadStoreSettings(defaultSettings: StoreSettings): StoreSettings {
  return safeReadJson<StoreSettings>('store.json', defaultSettings);
}

export function saveStoreSettings(settings: StoreSettings) {
  safeWriteJson('store.json', settings);
}

// 6. AUDIT LOGS (Denetim Kayıtları)
export function loadAuditLogs(defaultLogs: AuditLog[]): AuditLog[] {
  return safeReadJson<AuditLog[]>('audit.json', defaultLogs);
}

export function saveAuditLogs(logs: AuditLog[]) {
  // Keep last 500 logs max
  const trimmed = logs.slice(0, 500);
  scheduleWriteJson('audit.json', trimmed);
}

// 7. FRIEND REQUESTS (Arkadaşlık İstekleri)
export function loadFriendRequests(): Map<string, FriendRequest> {
  const map = new Map<string, FriendRequest>();
  const list = safeReadJson<FriendRequest[]>('friend_requests.json', []);
  list.forEach(req => {
    if (req.id) {
      map.set(req.id, req);
    }
  });
  return map;
}

export function saveFriendRequests(requests: Map<string, FriendRequest>) {
  const list = Array.from(requests.values());
  scheduleWriteJson('friend_requests.json', list);
}

// 8. CONNECTION & IP LOGS (Kullanıcı IP ve Bağlantı Kayıtları)
export function loadConnectionLogs(): UserConnectionRecord[] {
  return safeReadJson<UserConnectionRecord[]>('connection_logs.json', []);
}

export function saveConnectionLogs(logs: UserConnectionRecord[]) {
  // Keep last 300 logs max
  const trimmed = logs.slice(0, 300);
  scheduleWriteJson('connection_logs.json', trimmed);
}

// 9. SERVER LEVELS & XP (Kullanıcı XP ve Seviyeleri)
export function loadServerLevels(): Record<string, Record<string, MemberLevelData>> {
  return safeReadJson<Record<string, Record<string, MemberLevelData>>>('server_levels.json', {});
}

export function saveServerLevels(levels: Record<string, Record<string, MemberLevelData>>) {
  scheduleWriteJson('server_levels.json', levels);
}

// 10. SYSTEM CONFIGURATION (Sistem Yapılandırması)
export interface PinnedBanner {
  message: string;
  sender: string;
  updatedAt: string;
}

export interface RegistrationInvite {
  code: string;
  createdBy: string;
  createdAt: string;
  maxUses: number;
  uses: number;
  expiresAt?: number | null;
}

export interface SystemConfig {
  registrationEnabled: boolean;
  inviteOnlyRegistration?: boolean;
  registrationInvites?: RegistrationInvite[];
  defaultWalletBalance?: number;
  maxAccountsPerIpPerDay?: number;
  requireUniqueEmail?: boolean;
  requireEmailVerification?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  mailRelayUrl?: string;
  mailRelaySecret?: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  maxMessageLength: number;
  defaultSlowmodeSeconds: number;
  maxUploadSizeMb: number;
  requireStrongPasswords: boolean;
  requireAdmin2FA?: boolean;
  maxLoginAttempts?: number;
  loginLockoutMinutes?: number;
  globalBlockLinks?: boolean;
  globalBannedWords?: string[];
  pinnedBanner?: PinnedBanner | null;
  autoBackupEnabled?: boolean;
  autoBackupIntervalHours?: number;
  maxBackupsToKeep?: number;
  backupS3Enabled?: boolean;
  backupS3Endpoint?: string;
  backupS3Bucket?: string;
  backupS3Region?: string;
  backupS3AccessKey?: string;
  backupS3SecretKey?: string;
  backupS3Prefix?: string;
  backupS3AutoPush?: boolean;
  mediaS3Enabled?: boolean;
  mediaS3UseBackupCredentials?: boolean;
  mediaS3Endpoint?: string;
  mediaS3Bucket?: string;
  mediaS3Region?: string;
  mediaS3AccessKey?: string;
  mediaS3SecretKey?: string;
  mediaS3Prefix?: string;
  mediaS3PublicBaseUrl?: string;
  mediaS3MinSizeKb?: number;
  steamAuthEnabled?: boolean;
  steamWebApiKey?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  oauthPublicBaseUrl?: string;
  webhookUrl?: string;
  giphyApiKey?: string;
  aiSummaryProvider?: 'builtin' | 'gemini' | 'openai';
  aiSummaryApiKey?: string;
  aiSummaryModel?: string;
  sfuEnabled?: boolean;
  sfuThreshold?: number;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
  webhookEvents?: {
    security?: boolean;
    bans?: boolean;
    dedicated?: boolean;
    backups?: boolean;
  };
}

export function loadSystemConfig(defaultConfig: SystemConfig): SystemConfig {
  return {
    ...defaultConfig,
    ...safeReadJson<Partial<SystemConfig>>('system_config.json', {}),
  };
}

export function saveSystemConfig(config: SystemConfig) {
  safeWriteJson('system_config.json', config);
}

// 11. BANNED IPS (IP Yasaklama Listesi)
export interface BannedIpRecord {
  ip: string;
  reason: string;
  bannedBy: string;
  bannedAt: string;
  expiresAt?: number | null;
}

export function loadBannedIps(): BannedIpRecord[] {
  return safeReadJson<BannedIpRecord[]>('banned_ips.json', []);
}

export function saveBannedIps(ips: BannedIpRecord[]) {
  safeWriteJson('banned_ips.json', ips);
}

// 12. STORAGE OBSERVABILITY & FULL BACKUP / RESTORE
const BACKUP_FILENAMES = [
  'users.json',
  'servers.json',
  'messages.json',
  'licenses.json',
  'store.json',
  'audit.json',
  'friend_requests.json',
  'connection_logs.json',
  'server_levels.json',
  'system_config.json',
  'banned_ips.json',
] as const;

export function getStorageStats(): {
  dataDir: string;
  totalBytes: number;
  engine: string;
  files: { name: string; bytes: number }[];
} {
  ensureDataDir();
  const files: { name: string; bytes: number }[] = [];
  let totalBytes = 0;
  try {
    const entries = fs.readdirSync(DATA_DIR);
    for (const name of entries) {
      if (!name.endsWith('.json') && !name.endsWith('.sqlite')) continue;
      try {
        const st = fs.statSync(path.join(DATA_DIR, name));
        if (st.isFile()) {
          files.push({ name, bytes: st.size });
          totalBytes += st.size;
        }
      } catch {}
    }
  } catch {}
  files.sort((a, b) => b.bytes - a.bytes);
  return { dataDir: DATA_DIR, totalBytes, engine: sqliteStore.getEngineName(), files };
}

export function exportAllDataBundle(): {
  version: number;
  exportedAt: string;
  files: Record<string, any>;
} {
  ensureDataDir();
  const files: Record<string, any> = {};
  for (const filename of BACKUP_FILENAMES) {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        files[filename] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {}
    }
  }
  if (sqliteStore.isActive()) {
    files['messages.json'] = sqliteStore.exportAllMessagesMap();
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    files,
  };
}

export function importAllDataBundle(bundle: { files?: Record<string, any> }): string[] {
  if (!bundle || typeof bundle !== 'object' || !bundle.files || typeof bundle.files !== 'object') {
    throw new Error('Geçersiz yedek dosyası formatı.');
  }
  ensureDataDir();
  const restored: string[] = [];
  for (const filename of BACKUP_FILENAMES) {
    if (Object.prototype.hasOwnProperty.call(bundle.files, filename)) {
      safeWriteJson(filename, bundle.files[filename]);
      if (filename === 'messages.json' && bundle.files[filename] && typeof bundle.files[filename] === 'object') {
        if (sqliteStore.isActive()) {
          sqliteStore.importMessagesMap(bundle.files[filename], true);
        }
        saveMessages(bundle.files[filename]);
      }
      restored.push(filename);
    }
  }
  return restored;
}

// 13. SCHEDULED AUTO-BACKUPS (data/backups/)
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function ensureBackupsDir() {
  ensureDataDir();
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

export interface ScheduledBackupInfo {
  filename: string;
  bytes: number;
  createdAt: string;
}

function getBackupEncryptionKey(): Buffer {
  const envKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  ensureDataDir();
  const keyFile = path.join(DATA_DIR, '.backup.key');
  let hexKey = '';
  try {
    if (fs.existsSync(keyFile)) {
      hexKey = fs.readFileSync(keyFile, 'utf-8').trim();
    }
  } catch {}
  if (!hexKey) {
    hexKey = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(keyFile, hexKey, { mode: 0o600 });
    } catch {}
  }
  return crypto.createHash('sha256').update(hexKey).digest();
}

export function createScheduledBackup(maxToKeep = 10): ScheduledBackupInfo {
  ensureBackupsDir();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${stamp}.json`;
  const bundle = exportAllDataBundle();
  const filePath = path.join(BACKUPS_DIR, filename);

  const key = getBackupEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plainJson = JSON.stringify(bundle);
  const encrypted = Buffer.concat([cipher.update(plainJson, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = {
    encrypted: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf-8');
  const stat = fs.statSync(filePath);

  // Prune old backups beyond maxToKeep
  const limit = Math.min(Math.max(maxToKeep || 10, 1), 50);
  const all = listScheduledBackups();
  if (all.length > limit) {
    for (const old of all.slice(limit)) {
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, old.filename));
      } catch {}
    }
  }

  return {
    filename,
    bytes: stat.size,
    createdAt: now.toISOString(),
  };
}

export function listScheduledBackups(): ScheduledBackupInfo[] {
  ensureBackupsDir();
  const list: ScheduledBackupInfo[] = [];
  try {
    const entries = fs.readdirSync(BACKUPS_DIR);
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      try {
        const st = fs.statSync(path.join(BACKUPS_DIR, name));
        if (st.isFile()) {
          list.push({
            filename: name,
            bytes: st.size,
            createdAt: st.mtime.toISOString(),
          });
        }
      } catch {}
    }
  } catch {}
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
}

export function readScheduledBackup(filename: string): any {
  ensureBackupsDir();
  const safeName = path.basename(filename);
  const filePath = path.join(BACKUPS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error('Yedek dosyası bulunamadı.');
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (parsed?.encrypted === 'aes-256-gcm' && parsed.iv && parsed.tag && parsed.data) {
    const key = getBackupEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted);
  }
  return parsed;
}

export function deleteScheduledBackup(filename: string): boolean {
  ensureBackupsDir();
  const safeName = path.basename(filename);
  const filePath = path.join(BACKUPS_DIR, safeName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// 14. WEB PUSH SUBSCRIPTIONS
export interface PushSubscriptionRecord {
  username: string;
  endpoint: string;
  subscription: Record<string, any>;
  updatedAt: string;
}

export function loadPushSubscriptions(): PushSubscriptionRecord[] {
  return safeReadJson<PushSubscriptionRecord[]>('push_subscriptions.json', []);
}

export function savePushSubscriptions(records: PushSubscriptionRecord[]) {
  scheduleWriteJson('push_subscriptions.json', records);
}

// 15. GROUP DMs & WEBHOOKS
export function loadGroupDms(): GroupDmRoom[] {
  return safeReadJson<GroupDmRoom[]>('group-dms.json', []);
}

export function saveGroupDms(rooms: GroupDmRoom[]): void {
  scheduleWriteJson('group-dms.json', rooms);
}

export function loadWebhooks(): ServerWebhook[] {
  return safeReadJson<ServerWebhook[]>('webhooks.json', []);
}

export function saveWebhooks(webhooks: ServerWebhook[]): void {
  scheduleWriteJson('webhooks.json', webhooks);
}

// 16. v1.0.0 GOVERNANCE, SCHEDULED MESSAGES, BOTS & AUTOMATIONS
export function loadServerAuditLogs(): Record<string, ServerAuditEntry[]> {
  return safeReadJson<Record<string, ServerAuditEntry[]>>('server-audit.json', {});
}

export function saveServerAuditLogs(data: Record<string, ServerAuditEntry[]>): void {
  scheduleWriteJson('server-audit.json', data);
}

export function loadServerModerationCases(): Record<string, ServerModerationCase[]> {
  return safeReadJson<Record<string, ServerModerationCase[]>>('server-cases.json', {});
}

export function saveServerModerationCases(data: Record<string, ServerModerationCase[]>): void {
  scheduleWriteJson('server-cases.json', data);
}

export function loadScheduledMessages(): ScheduledMessage[] {
  return safeReadJson<ScheduledMessage[]>('scheduled-messages.json', []);
}

export function saveScheduledMessages(items: ScheduledMessage[]): void {
  scheduleWriteJson('scheduled-messages.json', items);
}

export function loadServerBots(): ServerBot[] {
  return safeReadJson<ServerBot[]>('server-bots.json', []);
}

export function saveServerBots(bots: ServerBot[]): void {
  scheduleWriteJson('server-bots.json', bots);
}

export function loadServerAutomations(): ServerAutomationRule[] {
  return safeReadJson<ServerAutomationRule[]>('server-automations.json', []);
}

export function saveServerAutomations(rules: ServerAutomationRule[]): void {
  scheduleWriteJson('server-automations.json', rules);
}

// 17. CONTENT & 5651 COMPLIANCE REPORTS
export function loadContentReports(): ContentReport[] {
  return safeReadJson<ContentReport[]>('reports.json', []);
}

export function saveContentReports(reports: ContentReport[]): void {
  const bounded = Array.isArray(reports) ? reports.slice(0, 1000) : [];
  scheduleWriteJson('reports.json', bounded);
  if (sqliteStore.isActive()) {
    sqliteStore.syncContentReports(bounded);
  }
}

export interface S3UploadRecord {
  objectKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function loadS3UploadsIndex(): Record<string, S3UploadRecord> {
  return safeReadJson<Record<string, S3UploadRecord>>('s3_uploads_index.json', {});
}

export function saveS3UploadsIndex(index: Record<string, S3UploadRecord>): void {
  scheduleWriteJson('s3_uploads_index.json', index);
}
