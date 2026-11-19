import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export interface DedicatedStoredBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface DedicatedStoredAccount {
  username: string;
  email: string;
  password: string;
  avatar: string;
  role: 'admin' | 'user';
  statusMessage?: string;
  bannerColor?: string;
  bio?: string;
  badges?: DedicatedStoredBadge[];
  friends?: string[];
}

export interface DedicatedStoredChannel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  serverId: string;
}

export interface DedicatedPersistedState {
  accounts: DedicatedStoredAccount[];
  channels: DedicatedStoredChannel[];
  messages: Record<string, any[]>;
  friendRequests: any[];
}

export interface LoadDedicatedStateOptions {
  defaultChannels: DedicatedStoredChannel[];
  hashPasswordScrypt: (password: string) => string;
  getBadges: (role: string, username: string) => DedicatedStoredBadge[];
}

const MAX_MESSAGES_PER_CHANNEL = 500;
let saveTimer: NodeJS.Timeout | null = null;
let pendingSnapshot: DedicatedPersistedState | null = null;

function writeStateSync(snapshot: DedicatedPersistedState) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const boundedMessages: Record<string, any[]> = {};
    for (const [chId, list] of Object.entries(snapshot.messages || {})) {
      if (Array.isArray(list)) {
        boundedMessages[chId] = list.slice(-MAX_MESSAGES_PER_CHANNEL);
      }
    }
    const cleanSnapshot: DedicatedPersistedState = {
      accounts: snapshot.accounts || [],
      channels: snapshot.channels || [],
      messages: boundedMessages,
      friendRequests: snapshot.friendRequests || [],
    };
    const tmpPath = `${STATE_FILE}.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpPath, JSON.stringify(cleanSnapshot, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STATE_FILE);
  } catch (err) {
    console.error('❌ [Dedicated Storage] state.json yazılamadı:', err);
  }
}

export function loadDedicatedState(opts: LoadDedicatedStateOptions): {
  accounts: Map<string, DedicatedStoredAccount>;
  channels: DedicatedStoredChannel[];
  messages: Record<string, any[]>;
  friendRequests: Map<string, any>;
} {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as Partial<DedicatedPersistedState>;
      const accounts = new Map<string, DedicatedStoredAccount>();
      for (const acc of parsed.accounts || []) {
        if (acc?.username) {
          accounts.set(acc.username.toLowerCase(), acc);
        }
      }
      const channels =
        Array.isArray(parsed.channels) && parsed.channels.length > 0
          ? parsed.channels
          : opts.defaultChannels;
      const messages = parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {};
      const friendRequests = new Map<string, any>();
      for (const req of parsed.friendRequests || []) {
        if (req?.id) {
          friendRequests.set(req.id, req);
        }
      }
      console.log(
        `💾 [Dedicated Storage] ${accounts.size} hesap, ${channels.length} kanal, ${Object.keys(messages).length} kanal mesajı yüklendi.`
      );
      return { accounts, channels, messages, friendRequests };
    } catch (err) {
      console.warn('⚠️ [Dedicated Storage] state.json okunamadı, temiz başlatılıyor:', err);
    }
  }

  const envPass = (process.env.DEDICATED_ADMIN_PASSWORD || '').trim();
  const usesEnvPass = envPass.length >= 8;
  const initialPassword = usesEnvPass ? envPass : crypto.randomBytes(12).toString('base64url');

  const adminAccount: DedicatedStoredAccount = {
    username: 'admin',
    email: 'admin@dedicated.local',
    password: opts.hashPasswordScrypt(initialPassword),
    avatar: '🛡️',
    role: 'admin',
    statusMessage: '👑 Dedicated Sunucu Aktif',
    bannerColor: 'from-indigo-600 via-purple-600 to-pink-600',
    bio: 'Bu bağımsız lisanslı Dedicated ses sunucusunun sahibi ve yöneticisi.',
    badges: opts.getBadges('admin', 'admin'),
    friends: [],
  };

  const accounts = new Map<string, DedicatedStoredAccount>([['admin', adminAccount]]);
  const channels = [...opts.defaultChannels];
  const messages: Record<string, any[]> = {};
  const friendRequests = new Map<string, any>();

  writeStateSync({
    accounts: [adminAccount],
    channels,
    messages,
    friendRequests: [],
  });

  if (usesEnvPass) {
    console.log('🔐 [Dedicated Storage] İlk kurulum admin hesabı DEDICATED_ADMIN_PASSWORD ile oluşturuldu.');
  } else {
    console.log('============================================================');
    console.log('🔐 [Dedicated Storage] İLK KURULUM ADMIN ŞİFRESİ (TEK SEFERLİK)');
    console.log(`   Kullanıcı: admin | Şifre: ${initialPassword}`);
    console.log('   Not: İlk giriş sonrası DEDICATED_ADMIN_PASSWORD veya hesap ayarlarıyla güncelleyin.');
    console.log('============================================================');
  }

  return { accounts, channels, messages, friendRequests };
}

export function scheduleDedicatedStateSave(
  accounts: Map<string, DedicatedStoredAccount>,
  channels: DedicatedStoredChannel[],
  messages: Record<string, any[]>,
  friendRequests: Map<string, any>,
  delayMs = 250
) {
  pendingSnapshot = {
    accounts: Array.from(accounts.values()),
    channels: [...channels],
    messages,
    friendRequests: Array.from(friendRequests.values()),
  };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingSnapshot) {
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      writeStateSync(snap);
    }
  }, delayMs);
  saveTimer.unref?.();
}

export function flushDedicatedStateSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSnapshot) {
    const snap = pendingSnapshot;
    pendingSnapshot = null;
    writeStateSync(snap);
  }
}
