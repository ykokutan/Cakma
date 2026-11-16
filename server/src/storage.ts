import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RegisteredAccount, Server, Message, IssuedLicense, StoreSettings, AuditLog, FriendRequest, UserConnectionRecord, MemberLevelData } from './types.js';

// Resolve persistent data directory
function getPersistentDir(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === 'server' && fs.existsSync(path.resolve(cwd, '..', 'package.json'))) {
    return path.resolve(cwd, '..', 'data');
  }
  return path.resolve(cwd, 'data');
}

const DATA_DIR = getPersistentDir();

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
  } catch (err) {
    console.error(`❌ [Storage] ${filename} yazılamadı:`, err);
  }
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
  safeWriteJson('users.json', list);
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
  safeWriteJson('servers.json', servers);
}

// 3. MESSAGES (Kanal Mesajları)
export function loadMessages(defaultMessages: Record<string, Message[]>): Record<string, Message[]> {
  const loaded = safeReadJson<Record<string, Message[]>>('messages.json', defaultMessages);
  console.log(`💾 [Storage] Mesaj geçmişi yüklendi.`);
  return loaded;
}

export function saveMessages(messages: Record<string, Message[]>) {
  safeWriteJson('messages.json', messages);
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
  safeWriteJson('audit.json', trimmed);
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
  safeWriteJson('friend_requests.json', list);
}

// 8. CONNECTION & IP LOGS (Kullanıcı IP ve Bağlantı Kayıtları)
export function loadConnectionLogs(): UserConnectionRecord[] {
  return safeReadJson<UserConnectionRecord[]>('connection_logs.json', []);
}

export function saveConnectionLogs(logs: UserConnectionRecord[]) {
  // Keep last 300 logs max
  const trimmed = logs.slice(0, 300);
  safeWriteJson('connection_logs.json', trimmed);
}

// 9. SERVER LEVELS & XP (Kullanıcı XP ve Seviyeleri)
export function loadServerLevels(): Record<string, Record<string, MemberLevelData>> {
  return safeReadJson<Record<string, Record<string, MemberLevelData>>>('server_levels.json', {});
}

export function saveServerLevels(levels: Record<string, Record<string, MemberLevelData>>) {
  safeWriteJson('server_levels.json', levels);
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
  webhookUrl?: string;
  giphyApiKey?: string;
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
  files: { name: string; bytes: number }[];
} {
  ensureDataDir();
  const files: { name: string; bytes: number }[] = [];
  let totalBytes = 0;
  try {
    const entries = fs.readdirSync(DATA_DIR);
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
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
  return { dataDir: DATA_DIR, totalBytes, files };
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

export function createScheduledBackup(maxToKeep = 10): ScheduledBackupInfo {
  ensureBackupsDir();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${stamp}.json`;
  const bundle = exportAllDataBundle();
  const filePath = path.join(BACKUPS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
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
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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
