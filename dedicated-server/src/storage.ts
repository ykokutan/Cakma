import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPasswordAsync } from './authCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../data');

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

export interface DedicatedWikiRevision {
  id: string;
  content: string;
  editedBy: string;
  editedAt: string;
  summary?: string;
}

export interface DedicatedWikiPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  updatedBy: string;
  updatedAt: string;
  revisions: DedicatedWikiRevision[];
}

export interface DedicatedKanbanCard {
  id: string;
  title: string;
  description?: string;
  columnId: 'todo' | 'in_progress' | 'done';
  assigneeUsername?: string;
  labels?: string[];
  dueDate?: string;
  position: number;
  createdBy: string;
  updatedAt: string;
}

export interface DedicatedStoredChannel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'wiki' | 'kanban';
  serverId: string;
  categoryId?: string | null;
  position?: number;
  topic?: string;
  isLocked?: boolean;
  password?: string;
  collabMode?: 'members' | 'admins_only';
  wikiPages?: DedicatedWikiPage[];
  kanbanCards?: DedicatedKanbanCard[];
}

export interface DedicatedChannelCategory {
  id: string;
  name: string;
  position: number;
  collapsedByDefault?: boolean;
}

export interface DedicatedWebhook {
  id: string;
  channelId: string;
  name: string;
  avatar?: string;
  token: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface DedicatedScheduledMessage {
  id: string;
  channelId: string;
  authorUsername: string;
  authorAvatar: string;
  content: string;
  scheduledFor: string;
  repeatIntervalMinutes?: number;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: string;
  lastSentAt?: string;
}

export interface DedicatedPersistedState {
  accounts: DedicatedStoredAccount[];
  channels: DedicatedStoredChannel[];
  messages: Record<string, any[]>;
  friendRequests: any[];
  categories?: DedicatedChannelCategory[];
  webhooks?: DedicatedWebhook[];
  scheduledMessages?: DedicatedScheduledMessage[];
  nicknames?: Record<string, string>;
}

export interface LoadDedicatedStateOptions {
  defaultChannels: DedicatedStoredChannel[];
  hashPassword?: (password: string) => Promise<string>;
  getBadges: (role: string, username: string) => DedicatedStoredBadge[];
  dataDir?: string;
}

const MAX_MESSAGES_PER_CHANNEL = 500;
let saveTimer: NodeJS.Timeout | null = null;
let pendingSnapshot: { stateFile: string; snapshot: DedicatedPersistedState } | null = null;

function resolveStateFile(dataDir = DEFAULT_DATA_DIR): string {
  return path.join(dataDir, 'state.json');
}

export function writeDedicatedStateSync(snapshot: DedicatedPersistedState, dataDir = DEFAULT_DATA_DIR) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
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
      ...(Array.isArray(snapshot.categories) ? { categories: snapshot.categories } : {}),
      ...(Array.isArray(snapshot.webhooks) ? { webhooks: snapshot.webhooks } : {}),
      ...(Array.isArray(snapshot.scheduledMessages) ? { scheduledMessages: snapshot.scheduledMessages } : {}),
      ...(snapshot.nicknames && typeof snapshot.nicknames === 'object' ? { nicknames: snapshot.nicknames } : {}),
    };
    const stateFile = resolveStateFile(dataDir);
    const tmpPath = `${stateFile}.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpPath, JSON.stringify(cleanSnapshot, null, 2), 'utf-8');
    fs.renameSync(tmpPath, stateFile);
  } catch (err) {
    console.error('❌ [Dedicated Storage] state.json yazılamadı:', err);
  }
}

export async function loadDedicatedState(opts: LoadDedicatedStateOptions): Promise<{
  accounts: Map<string, DedicatedStoredAccount>;
  channels: DedicatedStoredChannel[];
  messages: Record<string, any[]>;
  friendRequests: Map<string, any>;
  categories: DedicatedChannelCategory[];
  webhooks: DedicatedWebhook[];
  scheduledMessages: DedicatedScheduledMessage[];
  nicknames: Record<string, string>;
}> {
  const targetDir = opts.dataDir || DEFAULT_DATA_DIR;
  const stateFile = resolveStateFile(targetDir);

  if (fs.existsSync(stateFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as Partial<DedicatedPersistedState>;
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
      const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
      const webhooks = Array.isArray(parsed.webhooks) ? parsed.webhooks : [];
      const scheduledMessages = Array.isArray(parsed.scheduledMessages) ? parsed.scheduledMessages : [];
      const nicknames =
        parsed.nicknames && typeof parsed.nicknames === 'object' && !Array.isArray(parsed.nicknames)
          ? (parsed.nicknames as Record<string, string>)
          : {};
      console.log(
        `💾 [Dedicated Storage] ${accounts.size} hesap, ${channels.length} kanal, ${categories.length} kategori, ${Object.keys(messages).length} kanal mesajı yüklendi.`
      );
      return { accounts, channels, messages, friendRequests, categories, webhooks, scheduledMessages, nicknames };
    } catch (err) {
      console.warn('⚠️ [Dedicated Storage] state.json okunamadı, temiz başlatılıyor:', err);
    }
  }

  const envPass = (process.env.DEDICATED_ADMIN_PASSWORD || '').trim();
  const usesEnvPass = envPass.length >= 8;
  const initialPassword = usesEnvPass ? envPass : crypto.randomBytes(12).toString('base64url');
  const hasher = opts.hashPassword || hashPasswordAsync;

  const adminAccount: DedicatedStoredAccount = {
    username: 'admin',
    email: 'admin@dedicated.local',
    password: await hasher(initialPassword),
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
  const categories: DedicatedChannelCategory[] = [];
  const webhooks: DedicatedWebhook[] = [];
  const scheduledMessages: DedicatedScheduledMessage[] = [];
  const nicknames: Record<string, string> = {};

  writeDedicatedStateSync(
    {
      accounts: [adminAccount],
      channels,
      messages,
      friendRequests: [],
      categories,
      webhooks,
      scheduledMessages,
      nicknames,
    },
    targetDir
  );

  if (usesEnvPass) {
    console.log('🔐 [Dedicated Storage] İlk kurulum admin hesabı DEDICATED_ADMIN_PASSWORD ile oluşturuldu.');
  } else {
    console.log('============================================================');
    console.log('🔐 [Dedicated Storage] İLK KURULUM ADMIN ŞİFRESİ (TEK SEFERLİK)');
    console.log(`   Kullanıcı: admin | Şifre: ${initialPassword}`);
    console.log('   Not: İlk giriş sonrası DEDICATED_ADMIN_PASSWORD veya hesap ayarlarıyla güncelleyin.');
    console.log('============================================================');
  }

  return { accounts, channels, messages, friendRequests, categories, webhooks, scheduledMessages, nicknames };
}

export function scheduleDedicatedStateSave(
  accounts: Map<string, DedicatedStoredAccount>,
  channels: DedicatedStoredChannel[],
  messages: Record<string, any[]>,
  friendRequests: Map<string, any>,
  delayMs = 250,
  dataDir = DEFAULT_DATA_DIR,
  extra?: {
    categories?: DedicatedChannelCategory[];
    webhooks?: DedicatedWebhook[];
    scheduledMessages?: DedicatedScheduledMessage[];
    nicknames?: Record<string, string>;
  }
) {
  pendingSnapshot = {
    stateFile: dataDir,
    snapshot: {
      accounts: Array.from(accounts.values()),
      channels: [...channels],
      messages,
      friendRequests: Array.from(friendRequests.values()),
      ...(extra?.categories ? { categories: [...extra.categories] } : {}),
      ...(extra?.webhooks ? { webhooks: [...extra.webhooks] } : {}),
      ...(extra?.scheduledMessages ? { scheduledMessages: [...extra.scheduledMessages] } : {}),
      ...(extra?.nicknames ? { nicknames: { ...extra.nicknames } } : {}),
    },
  };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingSnapshot) {
      const pending = pendingSnapshot;
      pendingSnapshot = null;
      writeDedicatedStateSync(pending.snapshot, pending.stateFile);
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
    const pending = pendingSnapshot;
    pendingSnapshot = null;
    writeDedicatedStateSync(pending.snapshot, pending.stateFile);
  }
}
