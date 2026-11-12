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
