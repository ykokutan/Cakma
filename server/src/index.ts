import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { initialServers, initialMessages, getDefaultRoles } from './mockData.js';
import { User, Message, Server, Channel, AuditLog, SystemStats, DedicatedServerInfo, IssuedLicense, StoreSettings, UserBadge, MessageAttachment, FriendRequest, FriendUser, ServerRole, ServerMember, ServerPermission, RegisteredAccount, UserActivity, UserConnectionRecord, MemberLevelData, WatchTogetherState, MiniGameState, ServerAnalyticsData } from './types.js';
import { generateLicenseKey, verifyLicenseKey } from './licenseGenerator.js';
import {
  generateBase32Secret,
  generateOtpAuthUri,
  verifyTotpCode,
  generateBackupCodes,
} from './totp.js';
import {
  loadAccounts, saveAccounts,
  loadServers, saveServers,
  loadMessages, saveMessages,
  loadLicenses, saveLicenses,
  loadStoreSettings, saveStoreSettings,
  loadAuditLogs, saveAuditLogs,
  loadFriendRequests, saveFriendRequests,
  loadConnectionLogs, saveConnectionLogs,
  loadServerLevels, saveServerLevels,
  loadSystemConfig, saveSystemConfig, SystemConfig,
  loadBannedIps, saveBannedIps, BannedIpRecord,
  getStorageStats, exportAllDataBundle, importAllDataBundle,
  createScheduledBackup, listScheduledBackups, readScheduledBackup, deleteScheduledBackup
} from './storage.js';

// --- SECURITY & CRYPTOGRAPHIC HELPERS ---
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const originalHash = parts[2];
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(testHash, 'hex'));
    } catch {
      return false;
    }
  }
  // Fallback for legacy plain text:
  return password === stored;
}

export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isSafeImageMedia(val: string): boolean {
  if (val.startsWith('data:image/')) {
    return /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(val) && val.length <= 3_500_000;
  }
  if (val.startsWith('https://') || val.startsWith('http://')) {
    return val.length <= 600 && !/[<>"']/.test(val);
  }
  return false;
}

export function isSafeEmojiOrShortIcon(val: string): boolean {
  return val.length > 0 && val.length <= 16 && !/[:/<>"']/.test(val);
}

export function getClientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || socket.id;
}

interface RateLimitEntry {
  count: number;
  blockedUntil?: number;
}

const loginRateLimits = new Map<string, RateLimitEntry>();
const registerRateLimits = new Map<string, RateLimitEntry>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = loginRateLimits.get(ip);
  if (entry && entry.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000)
    };
  }
  return { allowed: true };
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const maxAttempts = systemConfig?.maxLoginAttempts ? Math.min(Math.max(systemConfig.maxLoginAttempts, 3), 20) : 5;
  const lockoutMins = systemConfig?.loginLockoutMinutes ? Math.min(Math.max(systemConfig.loginLockoutMinutes, 1), 120) : 15;
  const entry = loginRateLimits.get(ip) || { count: 0 };
  entry.count++;
  if (entry.count >= maxAttempts) {
    entry.blockedUntil = now + lockoutMins * 60 * 1000;
    entry.count = 0;
  }
  loginRateLimits.set(ip, entry);
}

export function clearLoginRateLimit(ip: string): void {
  loginRateLimits.delete(ip);
}

export function checkRegisterRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = registerRateLimits.get(ip);
  if (entry && entry.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000)
    };
  }
  return { allowed: true };
}

export function recordRegisterAttempt(ip: string): void {
  const now = Date.now();
  const entry = registerRateLimits.get(ip) || { count: 0 };
  entry.count++;
  if (entry.count >= 3) {
    entry.blockedUntil = now + 10 * 60 * 1000; // 10 minutes block
    entry.count = 0;
  }
  registerRateLimits.set(ip, entry);
}

const ALLOWED_ORIGINS = [
  'https://ses.yahyakemalokutan.com',
  'http://ses.yahyakemalokutan.com',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

const app = express();

// 1. Native HTTP Security Headers (Equivalent to Helmet, zero external dependencies)
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// 2. Strict CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB packet limit to prevent memory DoS
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = Number(process.env.PORT) || 4000;
const SERVER_START_TIME = Date.now();


export function getUserBadges(role: string, username: string, hasDedicatedServer: boolean = false): UserBadge[] {
  const badges: UserBadge[] = [];
  if (role === 'admin') {
    badges.push({
      id: 'badge-admin',
      name: 'Sistem Yöneticisi',
      icon: '🛡️',
      description: 'Platform ve merkezi sunucu yöneticisi',
      color: 'from-amber-500 to-yellow-400'
    });
  }
  if (role === 'admin' || hasDedicatedServer) {
    badges.push({
      id: 'badge-owner',
      name: 'Dedicated Sunucu Sahibi',
      icon: '👑',
      description: 'Lisanslı bağımsız Dedicated ses sunucusu sahibi',
      color: 'from-orange-500 to-amber-400'
    });
  }
  if (role === 'admin') {
    badges.push({
      id: 'badge-vip',
      name: 'VIP Destekçi',
      icon: '💎',
      description: 'Özel yetkili topluluk destekçisi',
      color: 'from-purple-500 to-pink-500'
    });
  }
  badges.push({
    id: 'badge-beta',
    name: 'Beta Tester',
    icon: '🚀',
    description: 'Erken erişim test kullanıcısı',
    color: 'from-blue-500 to-cyan-400'
  });
  badges.push({
    id: 'badge-lowlatency',
    name: 'TS Ultra HD Ses',
    icon: '⚡',
    description: 'Ultra düşük gecikmeli TeamSpeak tarzı Opus HD ses motoru',
    color: 'from-emerald-500 to-teal-400'
  });
  return badges;
}

const registeredAccounts = loadAccounts();
const pendingFriendRequests = loadFriendRequests();

function getFriendsData(username: string): { friends: FriendUser[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[] } {
  const account = registeredAccounts.get(username.toLowerCase());
  const friendUsernames = account?.friends || [];

  const friends: FriendUser[] = friendUsernames.map(fName => {
    const fAcc = registeredAccounts.get(fName.toLowerCase());
    let onlineUser: User | undefined;
    for (const u of activeUsers.values()) {
      if (u.username.toLowerCase() === fName.toLowerCase()) {
        onlineUser = u;
        break;
      }
    }

    return {
      id: onlineUser ? onlineUser.id : (fAcc?.id || fName),
      username: fAcc?.username || fName,
      avatar: fAcc?.avatar || '👤',
      status: onlineUser ? onlineUser.status : 'offline',
      statusMessage: onlineUser?.statusMessage || fAcc?.statusMessage,
      role: fAcc?.role || 'user',
      currentVoiceChannelId: onlineUser?.currentVoiceChannelId,
      addedAt: 'Arkadaş'
    };
  });

  const incomingRequests: FriendRequest[] = [];
  const outgoingRequests: FriendRequest[] = [];

  for (const req of pendingFriendRequests.values()) {
    if (req.toUsername.toLowerCase() === username.toLowerCase()) {
      incomingRequests.push(req);
    }
    if (req.fromUsername.toLowerCase() === username.toLowerCase()) {
      outgoingRequests.push(req);
    }
  }

  return { friends, incomingRequests, outgoingRequests };
}

// Active online users mapped by socket.id
const activeUsers = new Map<string, User>();
const servers: Server[] = loadServers(initialServers);
const messages: Record<string, Message[]> = loadMessages(initialMessages);

// Dedicated Servers Registry (Reported by standalone licensed servers)
const dedicatedServersRegistry = new Map<string, DedicatedServerInfo>();

// Server XP & Levels
const serverLevels = loadServerLevels();

// Watch Together Rooms (channelId -> WatchTogetherState)
const watchTogetherRooms = new Map<string, WatchTogetherState>();

// Mini Game Rooms (channelId -> MiniGameState)
const miniGameRooms = new Map<string, MiniGameState>();

function addMemberXP(serverId: string, user: User, amount: number, isMessage = false) {
  if (!serverId || !user) return;
  if (!serverLevels[serverId]) serverLevels[serverId] = {};
  const userLevels = serverLevels[serverId];
  if (!userLevels[user.id]) {
    userLevels[user.id] = {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      xp: 0,
      level: 1,
      messageCount: 0,
      voiceMinutes: 0
    };
  }
  const data = userLevels[user.id];
  data.username = user.username;
  data.avatar = user.avatar;
  data.xp += amount;
  if (isMessage) data.messageCount += 1;
  const newLevel = Math.max(1, Math.floor(0.2 * Math.sqrt(data.xp)));
  if (newLevel > data.level) {
    data.level = newLevel;
    io.emit('member_level_up', {
      serverId,
      userId: user.id,
      username: user.username,
      level: newLevel,
      xp: data.xp
    });
  }
  saveServerLevels(serverLevels);
}

// Voice XP interval: award active users in voice channels XP every minute
setInterval(() => {
  for (const user of activeUsers.values()) {
    if (user.currentVoiceChannelId) {
      const server = servers.find(s => s.channels.some(c => c.id === user.currentVoiceChannelId));
      if (server) {
        if (!serverLevels[server.id]) serverLevels[server.id] = {};
        const userLevels = serverLevels[server.id];
        if (!userLevels[user.id]) {
          userLevels[user.id] = {
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            xp: 0,
            level: 1,
            messageCount: 0,
            voiceMinutes: 0
          };
        }
        userLevels[user.id].xp += 10;
        userLevels[user.id].voiceMinutes += 1;
        const newLevel = Math.max(1, Math.floor(0.2 * Math.sqrt(userLevels[user.id].xp)));
        if (newLevel > userLevels[user.id].level) {
          userLevels[user.id].level = newLevel;
          io.emit('member_level_up', {
            serverId: server.id,
            userId: user.id,
            username: user.username,
            level: newLevel,
            xp: userLevels[user.id].xp
          });
        }
      }
    }
  }
  saveServerLevels(serverLevels);
}, 60000);

function ensureUserInServers(user: User) {
  let changed = false;
  servers.forEach(srv => {
    if (!srv.members) { srv.members = []; changed = true; }
    if (!srv.roles) { srv.roles = getDefaultRoles(); changed = true; }
    const existing = srv.members.find(m => m.userId === user.id || m.username.toLowerCase() === user.username.toLowerCase());
    if (!existing) {
      const isOwner = srv.ownerId === user.id;
      const initialRoles = isOwner
        ? ['role-owner', 'role-admin']
        : ['role-everyone'];
      if (!isOwner && srv.autoRoleId && !initialRoles.includes(srv.autoRoleId)) {
        initialRoles.push(srv.autoRoleId);
      }
      srv.members.push({
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        roleIds: initialRoles,
        joinedAt: new Date().toLocaleDateString('tr-TR'),
        isOwner
      });
      changed = true;

      // Welcome bot message if enabled
      if (srv.welcomeEnabled && srv.welcomeChannelId) {
        const targetChannel = srv.channels.find(c => c.id === srv.welcomeChannelId);
        if (targetChannel) {
          const welcomeText = srv.welcomeMessage
            ? srv.welcomeMessage.replace(/{user}/g, user.username).replace(/{server}/g, srv.name)
            : `🎉 **${user.username}** sunucumuza katıldı! Hoş geldin! 🚀`;

          const welcomeMsg: Message = {
            id: `msg-welcome-${Date.now()}`,
            serverId: srv.id,
            channelId: srv.welcomeChannelId,
            author: {
              id: 'system-bot',
              username: 'Karşılama Botu 🤖',
              avatar: '👋'
            },
            content: welcomeText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            reactions: { '🎉': [user.username] }
          };
          if (!messages[srv.welcomeChannelId]) messages[srv.welcomeChannelId] = [];
          messages[srv.welcomeChannelId].push(welcomeMsg);
          saveMessages(messages);
          io.emit('new_message', welcomeMsg);
        }
      }
    } else {
      if (existing.userId !== user.id || existing.avatar !== user.avatar || existing.username !== user.username) {
        existing.userId = user.id;
        existing.avatar = user.avatar;
        existing.username = user.username;
        changed = true;
      }
    }
  });
  if (changed) {
    saveServers(servers);
  }
}

// Persistent Issued Licenses Registry (Admin generated & Store purchased)
const issuedLicenses = loadLicenses();
if (issuedLicenses.size === 0) {
  const initialLicenseKey = 'LIC-eyJsaWNlbnNlZSI6IkNTMiAmIFZhbG9yYW50IFRvcGx1bHVndSIsIm1heFNsb3RzIjo2NCwiZXhwaXJlc0F0IjoiMjAyOC0xMi0zMVQyMzo1OTo1OS4wMDBaIiwidGllciI6IlBybyIsImlzc3VlZEF0IjoiMjAyNi0xMS0xMVQyMjo1MToxNC42ODVaIn0=.b1d1018b51675e4d8efb0480e5d7727a2d10996d32ae8888efd0b2c215bc9b08';
  issuedLicenses.set('lic-init-1', {
    id: 'lic-init-1',
    licenseKey: initialLicenseKey,
    licensee: 'CS2 & Valorant Toplulugu',
    assignedUsername: 'admin',
    maxSlots: 64,
    tier: 'Pro',
    status: 'active',
    issuedAt: '2026-11-11T22:51:14.685Z',
    expiresAt: '2028-12-31T23:59:59.000Z',
    price: 249,
    source: 'admin',
    activeServerHost: 'localhost:4001'
  });
  saveLicenses(issuedLicenses);
}

// Runtime System Configuration (Admin configurable)
const defaultSystemConfig: SystemConfig = {
  registrationEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.',
  maxMessageLength: 2000,
  defaultSlowmodeSeconds: 0,
  maxUploadSizeMb: 5,
  requireStrongPasswords: false,
  maxLoginAttempts: 5,
  loginLockoutMinutes: 15,
  globalBlockLinks: false,
  globalBannedWords: [],
  pinnedBanner: null,
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  maxBackupsToKeep: 7,
  webhookUrl: '',
  webhookEvents: {
    security: true,
    bans: true,
    dedicated: true,
    backups: false,
  },
};
let systemConfig: SystemConfig = loadSystemConfig(defaultSystemConfig);
let bannedIps: BannedIpRecord[] = loadBannedIps();

async function sendAdminWebhook(
  eventType: 'security' | 'bans' | 'dedicated' | 'backups' | 'test',
  title: string,
  details: string
): Promise<boolean> {
  const url = (systemConfig.webhookUrl || '').trim();
  if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) return false;
  if (eventType !== 'test') {
    const enabled = systemConfig.webhookEvents?.[eventType];
    if (!enabled) return false;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        content: `🛡️ **[Sistem Uyarı — ${eventType.toUpperCase()}] ${title}**\n${details}`,
        event: eventType,
        title,
        details,
        timestamp: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Background Scheduled Auto-Backup Checker (every 15 minutes)
setInterval(() => {
  if (!systemConfig.autoBackupEnabled) return;
  try {
    const intervalMs = Math.max(1, systemConfig.autoBackupIntervalHours || 24) * 3600 * 1000;
    const existing = listScheduledBackups();
    const lastTs = existing.length > 0 ? new Date(existing[0].createdAt).getTime() : 0;
    if (Date.now() - lastTs >= intervalMs) {
      const info = createScheduledBackup(systemConfig.maxBackupsToKeep || 7);
      addAuditLog('OTOMATIK_YEDEK', `Zamanlanmış otomatik yedek oluşturuldu: ${info.filename}`, 'info');
      sendAdminWebhook('backups', 'Otomatik Yedek Oluşturuldu', `${info.filename} (${(info.bytes / 1024).toFixed(1)} KB)`);
    }
  } catch {}
}, 15 * 60 * 1000);

function findActiveIpBan(ip: string): BannedIpRecord | undefined {
  const now = Date.now();
  const active = bannedIps.filter((b) => !b.expiresAt || b.expiresAt > now);
  if (active.length !== bannedIps.length) {
    bannedIps = active;
    saveBannedIps(bannedIps);
  }
  return bannedIps.find((b) => b.ip === ip);
}

// Store Settings & Pricing (Admin configurable)
const defaultStoreSettings: StoreSettings = {
  isOpen: true,
  closedReason: 'Mağazamız planlı bakım çalışması nedeniyle geçici olarak hizmete kapalıdır. Lütfen daha sonra tekrar deneyiniz.',
  currencySymbol: '₺',
  customSlotUnitPrice: 4,
  discountPercentage: 0,
  campaignBanner: '🔥 Lansmana Özel İndirimli Dedicated Sunucu Lisansları!',
  packages: {
    starter: {
      tier: 'Starter',
      name: 'Başlangıç Topluluğu',
      slots: 16,
      price: 99,
      enabled: true,
      description: 'Küçük arkadaş grupları ve mini ekipler için ideal.'
    },
    pro: {
      tier: 'Pro',
      name: 'Klan Pro Sunucu',
      slots: 64,
      price: 249,
      enabled: true,
      description: 'WebRTC Opus HD Ses & e-Spor klanları için optimize.'
    },
    enterprise: {
      tier: 'Enterprise',
      name: 'Kurumsal & Mega',
      slots: 256,
      price: 799,
      enabled: true,
      description: 'Öncelikli bant genişliği, sınırsız yetki ve özel SLA.'
    }
  },
  paymentMethods: [
    { id: 'wallet', name: 'Cüzdan Bakiyesi', enabled: true, icon: 'Wallet', description: 'Hesabınızdaki bakiye ile anında onay.' },
    { id: 'credit_card', name: 'Kredi / Banka Kartı', enabled: true, icon: 'CreditCard', description: '3D Secure korumalı güvenli kart ödemesi.' },
    { id: 'bank_transfer', name: 'Havale / FAST / EFT', enabled: true, icon: 'Building2', description: '7/24 Anında banka transferi ile manuel onay.' },
    { id: 'crypto', name: 'Kripto Para (USDT/BTC)', enabled: false, icon: 'Coins', description: 'TRC20 / ERC20 ağı ile anonim hızlı ödeme.' },
  ]
};
const storeSettings: StoreSettings = loadStoreSettings(defaultStoreSettings);

// Audit Logs
const auditLogs: AuditLog[] = loadAuditLogs([
  {
    id: 'log-init-1',
    action: 'SUNUCU_BASLATILDI',
    details: 'Discord/TeamSpeak Hibrit Backend ve WebRTC Sunucusu baslatildi.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type: 'info'
  }
]);

function addAuditLog(action: string, details: string, type: 'info' | 'warn' | 'voice' | 'auth' = 'info') {
  const newLog: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    action,
    details,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type
  };
  auditLogs.unshift(newLog);
  if (auditLogs.length > 200) auditLogs.pop(); // Keep last 200 logs
  saveAuditLogs(auditLogs);

  // Notify any active admin panels listening
  io.to('admins').emit('admin_new_log', newLog);
}

// User Connection & IP Logs
const connectionLogs: UserConnectionRecord[] = loadConnectionLogs();

function extractClientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  let ip = '';
  if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    ip = forwarded[0].trim();
  } else {
    ip = socket.handshake.address || (socket.conn as any)?.remoteAddress || '127.0.0.1';
  }
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1' || ip === '127.0.0.1') {
    return '127.0.0.1 (Yerel/Localhost)';
  }
  return ip;
}

function parseUserAgent(ua?: string): string {
  if (!ua) return 'Bilinmiyor';
  let os = 'Masaüstü';
  if (ua.includes('Windows NT 10.0') || ua.includes('Windows')) os = 'Windows PC';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';

  let browser = '';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';

  return browser ? `${os} · ${browser}` : os;
}

function recordUserConnection(socket: Socket, username: string, role: 'admin' | 'user', serverName: string = 'Ana Topluluk', channelName: string = '#genel-sohbet') {
  const ip = extractClientIp(socket);
  const ua = parseUserAgent(socket.handshake.headers['user-agent']);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + now.toLocaleDateString('tr-TR');

  // Close any existing active connection record for this socket or user
  for (const log of connectionLogs) {
    if (log.socketId === socket.id && log.status === 'online') {
      log.status = 'disconnected';
      log.disconnectedAt = timeStr;
    }
  }

  const newRecord: UserConnectionRecord = {
    id: `conn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    socketId: socket.id,
    username,
    role,
    ip,
    userAgent: ua,
    connectedServer: serverName,
    connectedChannel: channelName,
    connectedAt: timeStr,
    status: 'online',
    lastActiveAt: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  };

  connectionLogs.unshift(newRecord);
  if (connectionLogs.length > 300) connectionLogs.pop();
  saveConnectionLogs(connectionLogs);
  return newRecord;
}

function updateUserConnectionLocation(socketId: string, serverName?: string, channelName?: string) {
  const record = connectionLogs.find(l => l.socketId === socketId && l.status === 'online');
  if (record) {
    if (serverName) record.connectedServer = serverName;
    if (channelName) record.connectedChannel = channelName;
    record.lastActiveAt = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    saveConnectionLogs(connectionLogs);
  }
}

function recordUserDisconnection(socketId: string) {
  const record = connectionLogs.find(l => l.socketId === socketId && l.status === 'online');
  if (record) {
    record.status = 'disconnected';
    const now = new Date();
    record.disconnectedAt = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + now.toLocaleDateString('tr-TR');
    saveConnectionLogs(connectionLogs);
  }
}

// System Stats Helper
function getSystemStats(): SystemStats {
  const memoryUsage = process.memoryUsage();
  let totalMsgCount = 0;
  for (const channelMsgs of Object.values(messages)) {
    totalMsgCount += channelMsgs.length;
  }

  const voiceRoomsWithUsers = new Set<string>();
  for (const u of activeUsers.values()) {
    if (u.currentVoiceChannelId) {
      voiceRoomsWithUsers.add(u.currentVoiceChannelId);
    }
  }

  return {
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    totalRegisteredUsers: registeredAccounts.size,
    activeSocketsCount: io.engine.clientsCount,
    activeVoiceRoomsCount: voiceRoomsWithUsers.size,
    totalMessagesCount: totalMsgCount,
    totalDedicatedServersCount: dedicatedServersRegistry.size
  };
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    onlineUsers: activeUsers.size,
    serverCount: servers.length,
    stats: getSystemStats()
  });
});

// Dedicated Server Heartbeat & Registry Endpoints
app.post('/api/dedicated/heartbeat', (req, res) => {
  const {
    id,
    serverName,
    host,
    port,
    licenseKey,
    channelsCount,
    onlineCount,
    uptimeSeconds
  } = req.body;

  if (!id || !licenseKey || !serverName) {
    return res.status(400).json({ success: false, error: 'Eksik sunucu veya lisans parametresi.' });
  }

  const licVerify = verifyLicenseKey(licenseKey);
  if (!licVerify.valid || !licVerify.data) {
    return res.status(403).json({ success: false, error: licVerify.error || 'Geçersiz lisans anahtarı.' });
  }

  // Check if license was revoked by Admin
  let matchedIssuedLicense: IssuedLicense | undefined;
  for (const lic of issuedLicenses.values()) {
    if (lic.licenseKey === licenseKey || (licVerify.data && lic.licensee.toLowerCase() === licVerify.data.licensee.toLowerCase())) {
      matchedIssuedLicense = lic;
      break;
    }
  }

  if (matchedIssuedLicense) {
    if (matchedIssuedLicense.status === 'revoked') {
      const existing = dedicatedServersRegistry.get(id);
      if (existing) {
        existing.status = 'revoked';
        io.to('admins').emit('admin_dedicated_updated', existing);
      }
      return res.status(403).json({
        success: false,
        revoked: true,
        error: 'LİSANS İPTAL EDİLDİ: Bu lisans sistem yöneticisi tarafından feshedilmiştir.'
      });
    }
    matchedIssuedLicense.activeServerHost = host || `localhost:${port || 4001}`;
  }

  const isNew = !dedicatedServersRegistry.has(id);
  const serverInfo: DedicatedServerInfo = {
    id,
    serverName,
    host: host || `localhost:${port || 4001}`,
    port: port || 4001,
    licenseKey,
    licensee: licVerify.data.licensee,
    tier: licVerify.data.tier,
    maxSlots: licVerify.data.maxSlots,
    onlineCount: onlineCount || 0,
    channelsCount: channelsCount || 0,
    uptimeSeconds: uptimeSeconds || 0,
    lastHeartbeat: new Date().toISOString(),
    status: 'online'
  };

  dedicatedServersRegistry.set(id, serverInfo);

  if (isNew) {
    addAuditLog('DEDICATED_SUNUCU_BAGLANDI', `Yeni Dedicated Ses Sunucusu sinyal verdi: "${serverName}" (${serverInfo.host}) - Lisans: ${serverInfo.licensee}`, 'info');
  }

  // Real-time broadcast to connected admin panels
  io.to('admins').emit('admin_dedicated_updated', serverInfo);

  res.json({ success: true, message: 'Heartbeat kabul edildi.' });
});

app.post('/api/dedicated/shutdown', (req, res) => {
  const { id, licenseKey } = req.body || {};
  if (id && dedicatedServersRegistry.has(id)) {
    const s = dedicatedServersRegistry.get(id)!;
    const isMaster = isMasterRequest(req);
    const hasMatchingLicense =
      typeof licenseKey === 'string' &&
      licenseKey.length > 0 &&
      typeof s.licenseKey === 'string' &&
      s.licenseKey.length > 0 &&
      crypto.timingSafeEqual(
        crypto.createHash('sha256').update(licenseKey).digest(),
        crypto.createHash('sha256').update(s.licenseKey).digest()
      );
    if (!isMaster && !hasMatchingLicense) {
      return res.status(401).json({ success: false, error: 'Yetkisiz erişim: Geçersiz sunucu lisans anahtarı.' });
    }
    s.status = 'offline';
    addAuditLog('DEDICATED_SUNUCU_KAPANDI', `Dedicated Ses Sunucusu kapandi: "${s.serverName}" (${s.host})`, 'warn');
    io.to('admins').emit('admin_dedicated_updated', s);
  }
  res.json({ success: true });
});

app.get('/api/dedicated/list', (req, res) => {
  const sessionUser = getSessionUserFromRequest(req);
  const isAdminSession = sessionUser ? registeredAccounts.get(sessionUser.toLowerCase())?.role === 'admin' : false;
  if (!isMasterRequest(req) && !isAdminSession) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
  }
  res.json({
    total: dedicatedServersRegistry.size,
    servers: Array.from(dedicatedServersRegistry.values())
  });
});

app.get('/api/dedicated/verify-license', (req, res) => {
  const licenseKey = (req.query.licenseKey as string)?.trim();
  if (!licenseKey) {
    return res.status(400).json({ valid: false, error: 'Lisans anahtarı parametresi eksik.' });
  }

  const licVerify = verifyLicenseKey(licenseKey);
  if (!licVerify.valid || !licVerify.data) {
    return res.status(403).json({ valid: false, error: licVerify.error || 'Lisans anahtarı imza kontrolünü geçemedi.' });
  }

  for (const lic of issuedLicenses.values()) {
    if (lic.licenseKey === licenseKey || (licVerify.data && lic.licensee.toLowerCase() === licVerify.data.licensee.toLowerCase())) {
      if (lic.status !== 'active') {
        return res.status(403).json({
          valid: false,
          status: lic.status,
          error: lic.status === 'revoked'
            ? 'Bu lisans sistem yöneticisi tarafından feshedilmiştir.'
            : 'Bu lisans henüz aktif değildir (Ödeme veya yönetici onayı bekleniyor).'
        });
      }
      return res.json({ valid: true, status: lic.status, data: licVerify.data });
    }
  }

  return res.json({ valid: true, status: 'active', data: licVerify.data });
});

// Master REST API Key Auth Middleware
const MASTER_API_KEY = process.env.MASTER_API_KEY || 'cakma_master_sec_2026';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(MASTER_API_KEY + '_session_secret').digest('hex');

const soundboardCooldowns = new Map<string, number>();

export function generateSessionToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({
    u: username,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionTokenWithMeta(token: string): { username: string; iat: number } | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!parsed.u || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return { username: parsed.u, iat: parsed.iat || 0 };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string): string | null {
  return verifySessionTokenWithMeta(token)?.username ?? null;
}

const activeSessions = new Map<string, { socketId: string; username: string; ip: string; userAgent: string; connectedAt: string }>();
const userVoiceActivity = new Map<string, number>();

export function generatePending2faToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({
    u: username,
    purpose: '2fa',
    exp: Date.now() + 5 * 60 * 1000 // 5 minutes
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyPending2faToken(token: string): string | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!parsed.u || parsed.purpose !== '2fa' || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.u;
  } catch {
    return null;
  }
}

function isMasterRequest(req: express.Request): boolean {
  const authHeader = req.headers['authorization'];
  const adminKey = req.headers['x-admin-key'];
  const token = adminKey || (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader);
  if (typeof token === 'string' && token.length > 0) {
    const tokenDigest = crypto.createHash('sha256').update(token).digest();
    const expectedDigest = crypto.createHash('sha256').update(MASTER_API_KEY).digest();
    return crypto.timingSafeEqual(tokenDigest, expectedDigest);
  }
  return false;
}

function getSessionUserFromRequest(req: express.Request): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    return verifySessionToken(bearer);
  }
  return null;
}

function requireMasterAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isMasterRequest(req)) {
    return next();
  }
  return res.status(401).json({ success: false, error: 'Yetkisiz erişim: Geçersiz master API anahtarı.' });
}

// Master REST API for syncing licenses & settings across all dedicated servers & clients
app.get('/api/master/licenses', requireMasterAuth, (req, res) => {
  res.json({
    success: true,
    licenses: Array.from(issuedLicenses.values())
  });
});

app.get('/api/master/user-licenses', (req, res) => {
  const username = (req.query.username as string)?.trim()?.toLowerCase();
  const isMaster = isMasterRequest(req);
  const sessionUser = getSessionUserFromRequest(req);
  const isAdminSession = sessionUser ? registeredAccounts.get(sessionUser.toLowerCase())?.role === 'admin' : false;

  if (!isMaster && (!sessionUser || (!isAdminSession && sessionUser.toLowerCase() !== username))) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
  }

  if (!username) {
    return res.json({ success: true, licenses: [] });
  }
  const userLics = Array.from(issuedLicenses.values()).filter(
    l => l.assignedUsername.toLowerCase() === username
  );
  res.json({ success: true, licenses: userLics });
});

app.post('/api/master/license/generate', requireMasterAuth, (req, res) => {
  const { licensee, maxSlots, expireDays, tier, assignedUsername } = req.body;
  const cleanLicensee = (licensee || 'Ozel Musteri').trim();
  const slots = Number(maxSlots) || 64;
  const days = Number(expireDays) || 365;
  const selectedTier = tier || 'Pro';
  const targetUsername = assignedUsername?.trim() || 'admin';

  const licenseKey = generateLicenseKey(cleanLicensee, slots, days, selectedTier);
  const expiresAt = days === -1
    ? 'lifetime'
    : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const newLicense: IssuedLicense = {
    id: `lic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    licenseKey,
    licensee: cleanLicensee,
    assignedUsername: targetUsername,
    maxSlots: slots,
    tier: selectedTier,
    status: 'active',
    issuedAt: new Date().toISOString(),
    expiresAt,
    source: 'admin'
  };

  issuedLicenses.set(newLicense.id, newLicense);
  saveLicenses(issuedLicenses);
  io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  res.json({ success: true, license: newLicense });
});

app.post('/api/master/license/revoke', requireMasterAuth, (req, res) => {
  const { licenseId, reason } = req.body;
  const lic = issuedLicenses.get(licenseId);
  if (lic) {
    lic.status = 'revoked';
    saveLicenses(issuedLicenses);
    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));

    for (const s of dedicatedServersRegistry.values()) {
      if (s.licenseKey === lic.licenseKey || s.licensee.toLowerCase() === lic.licensee.toLowerCase()) {
        s.status = 'revoked';
        io.to('admins').emit('admin_dedicated_updated', s);
      }
    }
    const directFallbacks = ['http://127.0.0.1:4001/api/license/revoked', 'http://localhost:4001/api/license/revoked'];
    for (const endpoint of directFallbacks) {
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || 'Sistem yöneticisi tarafından lisans feshedildi.' })
        }).catch(() => {});
      } catch {}
    }
    io.emit('dedicated_server_terminated', {
      title: 'Sunucu Lisansı İptal Edildi',
      reason: reason || 'Sistem yöneticisi bu lisansı feshetti.',
      action: 'disconnect'
    });
    return res.json({ success: true, message: 'Lisans iptal edildi.' });
  }
  res.status(404).json({ success: false, error: 'Lisans bulunamadı.' });
});

app.post('/api/master/license/extend', requireMasterAuth, (req, res) => {
  const { licenseId, addDays } = req.body;
  const lic = issuedLicenses.get(licenseId);
  if (!lic) return res.status(404).json({ success: false, error: 'Lisans bulunamadı.' });

  const days = Number(addDays);
  let newExpiresAt: string;
  if (days === -1) {
    newExpiresAt = 'lifetime';
  } else {
    const currentExpiry = (lic.expiresAt === 'lifetime' || lic.expiresAt.startsWith('2099'))
      ? Date.now()
      : new Date(lic.expiresAt).getTime();
    const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
    newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const newLicenseKey = generateLicenseKey(lic.licensee, lic.maxSlots, newExpiresAt, lic.tier);
  lic.licenseKey = newLicenseKey;
  lic.expiresAt = newExpiresAt;
  if (lic.status === 'expired') {
    lic.status = 'active';
  }

  saveLicenses(issuedLicenses);
  io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  res.json({ success: true, license: lic });
});

app.get('/api/master/store-settings', (req, res) => {
  res.json(storeSettings);
});

app.post('/api/master/store-settings', requireMasterAuth, (req, res) => {
  Object.assign(storeSettings, req.body);
  saveStoreSettings(storeSettings);
  io.emit('store_settings_updated', storeSettings);
  res.json({ success: true, storeSettings });
});

// Periodic Heartbeat Sweeper: 30 saniye sinyal vermeyenleri offline yap
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const server of dedicatedServersRegistry.values()) {
    if (server.status === 'online' && now - new Date(server.lastHeartbeat).getTime() > 30000) {
      server.status = 'offline';
      changed = true;
      io.to('admins').emit('admin_dedicated_updated', server);
    }
  }
  if (changed) {
    io.to('admins').emit('admin_dedicated_list', Array.from(dedicatedServersRegistry.values()));
  }
}, 15000);

// Intelligent AI Assistant Response Generator
function generateAIResponse(prompt: string, senderName: string): string {
  const p = prompt.toLowerCase();
  if (p.includes('cs2') || p.includes('counter-strike') || p.includes('aim') || p.includes('crosshair')) {
    return `Selam @${senderName}! 🎯 CS2 için önerim: Mirage A bomba alanı için rampa smoke'unu mutlaka öğren, crosshair'ını her zaman kafa hizasında tut ve spray yaparken ilk 5 mermiden sonra hafif aşağı-sağa çek. Bol HS'ler!`;
  }
  if (p.includes('valorant') || p.includes('rank') || p.includes('lineup')) {
    return `Hey @${senderName}! 🏹 Valorant'ta derecelide yükselmek için: İletişimi asla kesme, eco rauntlarda Sheriff veya Marshal ile cross tut, ultileri saklama ve takımınla info eşliğinde trade yap!`;
  }
  if (p.includes('ping') || p.includes('gecikme') || p.includes('lag') || p.includes('bitrate')) {
    return `Selam @${senderName}! ⚡ Platformumuz WebRTC Full-Mesh mimarisiyle çalışır. Sol alttaki yeşil kapsüle tıklayarak gerçek zamanlı Ping/Jitter dalga grafiğini inceleyebilir, sunucu ayarlarından ses kalitesini 384 kbps Ultra Studio seviyesine çıkarabilirsin!`;
  }
  if (p.includes('pelican') || p.includes('wings') || p.includes('sunucu')) {
    return `Selam @${senderName}! 🐧 Pelican Panel ve Wings hizmetimiz %100 güncel ve sağlıklı durumda. Dedicated sunucunu Mağaza'dan lisans anahtarıyla anında bağlayıp yönetebilirsin!`;
  }
  if (p.includes('kod') || p.includes('react') || p.includes('javascript') || p.includes('typescript')) {
    return `Harika bir soru @${senderName}! 💻 Platformumuz React 18, Vite ve TailwindCSS ile derlenmiştir. Ses hattında WebRTC RTCPeerConnection ve 48kHz Opus kodek kullanılır. Kod bloklarını \`\`\` kullanarak paylaşabilirsin!`;
  }
  if (p.includes('merhaba') || p.includes('selam') || p.includes('naber') || p.includes('hey')) {
    return `Merhaba @${senderName}! ✨ Ben sunucu içi yapay zeka asistanınım. Ses odaları, oyun taktikleri, sunucu ayarları veya genel sorularında bana @ai yazarak dilediğin zaman danışabilirsin! 🚀`;
  }
  return `@${senderName}, sorun için buradayım! ✨ Bu platformda 384 kbps stüdyo ses kalitesi, ekran paylaşımı, YouTube müzik botu ve WebRTC teşhisi bulunur. Başka bir konuda yardıma ihtiyacın olursa bana yazmaktan çekinme! 🎮`;
}

// --- WEBRTC & CHAT INTEGRITY SECURITY ---
const activeDirectCallPairs = new Map<string, string>(); // socketId -> socketId
const pendingDirectCalls = new Map<string, { callerSocketId: string; callerUserId: string; callerUsername: string }>(); // targetUsernameLower -> caller info
const messageRateLimits = new Map<string, number[]>(); // userId -> timestamps

function isMessageFlooding(userId: string): boolean {
  const now = Date.now();
  const timestamps = (messageRateLimits.get(userId) || []).filter(t => now - t < 3000);
  if (timestamps.length >= 5) {
    return true; // Exceeded 5 messages in 3 seconds
  }
  timestamps.push(now);
  messageRateLimits.set(userId, timestamps);
  return false;
}

const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.ps1', '.ps2', '.scr', '.msi', '.msp', '.com', '.pif', '.reg', '.hta',
  '.jar', '.sh', '.bash', '.app', '.dmg', '.pkg', '.apk'
];

function hasDangerousAttachment(attachments?: MessageAttachment[]): boolean {
  if (!attachments || attachments.length === 0) return false;
  return attachments.some(att => {
    const lowerName = (att.name || '').toLowerCase();
    const lowerType = (att.type || '').toLowerCase();
    const isDangerousExt = DANGEROUS_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    const isDangerousMime =
      lowerType.includes('executable') ||
      lowerType.includes('x-msdownload') ||
      lowerType.includes('x-sh') ||
      lowerType.includes('x-bat');
    return isDangerousExt || isDangerousMime;
  });
}

io.on('connection', (socket: Socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);
  const initialIp = getClientIp(socket);
  const activeIpBan = findActiveIpBan(initialIp);
  if (activeIpBan) {
    socket.emit('kicked_by_admin', {
      reason: `IP adresiniz (${initialIp}) sistem yöneticisi tarafından engellendi. Sebep: ${activeIpBan.reason}`
    });
    socket.disconnect(true);
    return;
  }

  socket.emit('system_maintenance_status', {
    active: Boolean(systemConfig.maintenanceMode),
    message: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır.'
  });
  socket.emit('pinned_banner_updated', systemConfig.pinnedBanner || null);
  socket.emit('store_settings_response', storeSettings);

  // Real-time Ping & Network Measurement Check
  socket.on('ping_check', (_ts: number, callback: any) => {
    if (typeof callback === 'function') {
      callback(Date.now());
    } else {
      socket.emit('pong_reply', { clientTimestamp: _ts, serverTime: Date.now() });
    }
  });

  // 1. REGISTER (Kayıt Olma)
  socket.on('auth_register', ({ username, email, password, avatar }: any) => {
    const clientIp = getClientIp(socket);
    const ipBan = findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('auth_response', {
        success: false,
        error: `IP adresiniz sistemden engellenmiştir. Sebep: ${ipBan.reason}`
      });
    }
    if (systemConfig.maintenanceMode) {
      return socket.emit('auth_response', {
        success: false,
        error: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.'
      });
    }
    if (!systemConfig.registrationEnabled) {
      return socket.emit('auth_response', {
        success: false,
        error: 'Yeni üye kayıtları sistem yöneticisi tarafından geçici olarak kapatılmıştır.'
      });
    }
    const regCheck = checkRegisterRateLimit(clientIp);
    if (!regCheck.allowed) {
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla kayıt denemesi yapıldı! Lütfen ${regCheck.retryAfterSeconds} saniye sonra tekrar deneyin.`
      });
    }

    const cleanUsername = sanitizeText(username?.trim()).replace(/[\u200B-\u200D\uFEFF]/g, '').slice(0, 32);
    const cleanEmail = email?.trim()?.toLowerCase().slice(0, 64);

    if (!cleanUsername || cleanUsername.length < 3 || !password || password.length < (systemConfig.requireStrongPasswords ? 8 : 4)) {
      return socket.emit('auth_response', {
        success: false,
        error: systemConfig.requireStrongPasswords
          ? 'Kullanıcı adı en az 3, güçlü şifre politikası gereği şifre en az 8 karakter olmalıdır.'
          : 'Kullanıcı adı en az 3, şifre en az 4 karakter olmalıdır.'
      });
    }

    if (registeredAccounts.has(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Role assignment: only the very first account on a fresh DB becomes admin; prevent admin hijacking
    const isFirstUser = registeredAccounts.size === 0;
    const reservedAdminNames = ['admin', 'administrator', 'system', 'root', 'sistem'];
    if (!isFirstUser && reservedAdminNames.includes(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı sistem tarafından ayrılmıştır.' });
    }
    const role = isFirstUser ? 'admin' : 'user';

    // Hash password with cryptographically secure scrypt
    const hashedPassword = hashPassword(password);
    recordRegisterAttempt(clientIp);

    const newAccount: RegisteredAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      username: cleanUsername,
      email: cleanEmail || `${cleanUsername.toLowerCase()}@local.com`,
      password: hashedPassword,
      avatar: avatar || '🎮',
      role,
      createdAt: new Date().toLocaleDateString('tr-TR'),
      walletBalance: 1000,
      statusMessage: '✨ Yeni Katıldı',
      bannerColor: 'from-blue-600 via-indigo-600 to-purple-600',
      bio: 'Sohbet ve sesli odalara yeni katıldı.',
      badges: getUserBadges(role, cleanUsername, false),
      friends: []
    };

    registeredAccounts.set(cleanUsername.toLowerCase(), newAccount);
    saveAccounts(registeredAccounts);
    addAuditLog('YENI_KAYIT', `Yeni kullanıcı kaydoldu: ${cleanUsername} (${role}, IP: ${clientIp})`, 'auth');

    // Create session user
    const user: User = {
      id: socket.id,
      username: newAccount.username,
      email: newAccount.email,
      role: newAccount.role,
      avatar: newAccount.avatar,
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      createdAt: newAccount.createdAt,
      walletBalance: newAccount.walletBalance,
      statusMessage: newAccount.statusMessage,
      bannerColor: newAccount.bannerColor,
      bio: newAccount.bio,
      badges: newAccount.badges,
      friends: newAccount.friends
    };

    activeUsers.set(socket.id, user);
    activeSessions.set(socket.id, {
      socketId: socket.id,
      username: user.username,
      ip: getClientIp(socket),
      userAgent: (socket.handshake.headers['user-agent'] || 'Bilinmeyen Cihaz').slice(0, 80),
      connectedAt: new Date().toISOString()
    });
    if (user.role === 'admin') socket.join('admins');
    ensureUserInServers(user);
    recordUserConnection(socket, user.username, user.role);

    const token = generateSessionToken(user.username);
    socket.emit('auth_response', { success: true, user, token });
    socket.emit('init_data', {
      currentUser: user,
      servers,
      onlineUsers: Array.from(activeUsers.values()),
      messages
    });
    socket.emit('friends_data', getFriendsData(user.username));

    socket.broadcast.emit('user_connected', user);
  });

  // 2. LOGIN (Giriş Yapma)
  socket.on('auth_login', ({ usernameOrEmail, password }: any) => {
    const clientIp = getClientIp(socket);
    const ipBan = findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('auth_response', {
        success: false,
        error: `IP adresiniz sistemden engellenmiştir. Sebep: ${ipBan.reason}`
      });
    }
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      addAuditLog('GUVENLIK_ENGELI', `IP (${clientIp}) çok fazla başarısız giriş denemesi nedeniyle engellendi.`, 'auth');
      sendAdminWebhook('security', 'Brute-Force Giriş Engeli', `IP: ${clientIp} (${rateCheck.retryAfterSeconds}sn kilitlendi)`);
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla başarısız giriş denemesi! Güvenlik gereği ${rateCheck.retryAfterSeconds} saniye boyunca giriş engellendi.`
      });
    }

    const query = usernameOrEmail?.trim()?.toLowerCase();
    if (!query || !password) {
      return socket.emit('auth_response', { success: false, error: 'Lütfen kullanıcı adı ve şifrenizi girin.' });
    }

    // Find account by username or email
    let foundAccount: RegisteredAccount | undefined;
    for (const acc of registeredAccounts.values()) {
      if (acc.username.toLowerCase() === query || acc.email.toLowerCase() === query) {
        foundAccount = acc;
        break;
      }
    }

    if (!foundAccount) {
      recordFailedLogin(clientIp);
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    if (foundAccount.isBanned) {
      if (foundAccount.bannedUntil && Date.now() >= foundAccount.bannedUntil) {
        foundAccount.isBanned = false;
        foundAccount.bannedReason = '';
        foundAccount.bannedUntil = null;
        saveAccounts(registeredAccounts);
        addAuditLog('YASAK_SURESI_DOLDU', `"${foundAccount.username}" hesabının süreli yasağı otomatik olarak sona erdi.`, 'info');
      } else {
        const remainingText = foundAccount.bannedUntil
          ? ` (Kalan süre: ~${Math.max(1, Math.ceil((foundAccount.bannedUntil - Date.now()) / 60000))} dk)`
          : '';
        return socket.emit('auth_response', {
          success: false,
          error: `Hesabınız sistem yöneticisi tarafından yasaklandı.${remainingText}${foundAccount.bannedReason ? ` Sebep: ${foundAccount.bannedReason}` : ''}`
        });
      }
    }

    if (systemConfig.maintenanceMode && foundAccount.role !== 'admin') {
      return socket.emit('auth_response', {
        success: false,
        error: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Yalnızca sistem yöneticileri giriş yapabilir.'
      });
    }

    // Verify password with secure scrypt (supports legacy plain text with auto-upgrade)
    const isPasswordValid = verifyPassword(password, foundAccount.password);
    if (isPasswordValid && !foundAccount.password.startsWith('scrypt$')) {
      // Auto-upgrade legacy plain-text password to scrypt hash on successful login!
      foundAccount.password = hashPassword(password);
      saveAccounts(registeredAccounts);
      console.log(`[Security] Account '${foundAccount.username}' legacy password upgraded to scrypt hash.`);
    }

    if (!isPasswordValid) {
      recordFailedLogin(clientIp);
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    // Successful password check -> check 2FA if enabled
    clearLoginRateLimit(clientIp);

    if (foundAccount.twoFactorEnabled && foundAccount.twoFactorSecret) {
      const pending2faToken = generatePending2faToken(foundAccount.username);
      return socket.emit('auth_response', {
        success: false,
        requires2fa: true,
        pending2faToken,
        username: foundAccount.username,
      });
    }

    // Bind socket to account
    const user: User = {
      id: socket.id,
      username: foundAccount.username,
      email: foundAccount.email,
      role: foundAccount.role,
      avatar: foundAccount.avatar,
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      createdAt: foundAccount.createdAt,
      walletBalance: foundAccount.walletBalance,
      statusMessage: foundAccount.statusMessage || 'Çevrimiçi',
      bannerColor: foundAccount.bannerColor || 'from-indigo-600 to-purple-600',
      bannerImage: foundAccount.bannerImage || '',
      bio: foundAccount.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.',
      badges: foundAccount.badges || getUserBadges(foundAccount.role, foundAccount.username, foundAccount.role === 'admin'),
      friends: foundAccount.friends || [],
      blockedUsers: foundAccount.blockedUsers || [],
      twoFactorEnabled: Boolean(foundAccount.twoFactorEnabled),
    };

    activeUsers.set(socket.id, user);
    activeSessions.set(socket.id, {
      socketId: socket.id,
      username: user.username,
      ip: getClientIp(socket),
      userAgent: (socket.handshake.headers['user-agent'] || 'Bilinmeyen Cihaz').slice(0, 80),
      connectedAt: new Date().toISOString()
    });
    if (user.role === 'admin') socket.join('admins');
    ensureUserInServers(user);
    addAuditLog('GIRIS_BASARILI', `${user.username} (${user.role}) sisteme giriş yaptı (IP: ${clientIp}).`, 'auth');
    recordUserConnection(socket, user.username, user.role);

    const token = generateSessionToken(user.username);
    socket.emit('auth_response', { success: true, user, token });
    socket.emit('init_data', {
      currentUser: user,
      servers,
      onlineUsers: Array.from(activeUsers.values()),
      messages
    });
    socket.emit('friends_data', getFriendsData(user.username));

    socket.broadcast.emit('user_connected', user);
  });

  // 2.2 VERIFY 2FA LOGIN
  socket.on('auth_2fa_verify', ({ pending2faToken, code }: { pending2faToken: string; code: string }) => {
    const clientIp = getClientIp(socket);
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return socket.emit('auth_response', {
        success: false,
        error: `Çok fazla başarısız 2FA denemesi! ${rateCheck.retryAfterSeconds} saniye bekleyin.`
      });
    }

    const verifiedUsername = verifyPending2faToken(pending2faToken);
    if (!verifiedUsername) {
      return socket.emit('auth_response', {
        success: false,
        error: '2FA doğrulama süresi doldu, lütfen tekrar giriş yapın.'
      });
    }

    const foundAccount = registeredAccounts.get(verifiedUsername.toLowerCase());
    if (!foundAccount || !foundAccount.twoFactorEnabled || !foundAccount.twoFactorSecret) {
      return socket.emit('auth_response', { success: false, error: '2FA yapılandırması bulunamadı.' });
    }

    const cleanCode = (code || '').trim().toUpperCase();
    let isValid = verifyTotpCode(foundAccount.twoFactorSecret, cleanCode);

    // Check one-time backup codes if TOTP didn't match
    if (!isValid && Array.isArray(foundAccount.twoFactorBackupCodes) && foundAccount.twoFactorBackupCodes.length > 0) {
      const matchIdx = foundAccount.twoFactorBackupCodes.findIndex((hashed) => verifyPassword(cleanCode, hashed));
      if (matchIdx !== -1) {
        isValid = true;
        foundAccount.twoFactorBackupCodes.splice(matchIdx, 1);
        saveAccounts(registeredAccounts);
        addAuditLog('2FA_YEDEK_KOD', `${foundAccount.username} yedek kurtarma kodu ile giriş yaptı.`, 'auth');
      }
    }

    if (!isValid) {
      recordFailedLogin(clientIp);
      return socket.emit('auth_response', {
        success: false,
        requires2fa: true,
        pending2faToken,
        error: 'Geçersiz 2FA kodu! Lütfen doğrulayıcı uygulamanızdaki güncel 6 haneli kodu girin.'
      });
    }

    clearLoginRateLimit(clientIp);

    const user: User = {
      id: socket.id,
      username: foundAccount.username,
      email: foundAccount.email,
      role: foundAccount.role,
      avatar: foundAccount.avatar,
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      createdAt: foundAccount.createdAt,
      walletBalance: foundAccount.walletBalance,
      statusMessage: foundAccount.statusMessage || 'Çevrimiçi',
      bannerColor: foundAccount.bannerColor || 'from-indigo-600 to-purple-600',
      bannerImage: foundAccount.bannerImage || '',
      bio: foundAccount.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.',
      badges: foundAccount.badges || getUserBadges(foundAccount.role, foundAccount.username, foundAccount.role === 'admin'),
      friends: foundAccount.friends || [],
      blockedUsers: foundAccount.blockedUsers || [],
      twoFactorEnabled: true,
    };

    activeUsers.set(socket.id, user);
    activeSessions.set(socket.id, {
      socketId: socket.id,
      username: user.username,
      ip: getClientIp(socket),
      userAgent: (socket.handshake.headers['user-agent'] || 'Bilinmeyen Cihaz').slice(0, 80),
      connectedAt: new Date().toISOString()
    });
    if (user.role === 'admin') socket.join('admins');
    ensureUserInServers(user);
    addAuditLog('GIRIS_BASARILI', `${user.username} (${user.role}) 2FA ile giriş yaptı (IP: ${clientIp}).`, 'auth');
    recordUserConnection(socket, user.username, user.role);

    const token = generateSessionToken(user.username);
    socket.emit('auth_response', { success: true, user, token });
    socket.emit('init_data', {
      currentUser: user,
      servers,
      onlineUsers: Array.from(activeUsers.values()),
      messages
    });
    socket.emit('friends_data', getFriendsData(user.username));
    socket.broadcast.emit('user_connected', user);
  });

  // 2.5 TOKEN LOGIN (Otomatik Oturum Doğrulama - Şifresiz)
  socket.on('auth_token_login', ({ token }: { token: string }) => {
    const clientIp = getClientIp(socket);
    const ipBan = findActiveIpBan(clientIp);
    if (ipBan) {
      return socket.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: `IP adresiniz sistemden engellenmiştir. Sebep: ${ipBan.reason}`
      });
    }
    const verified = verifySessionTokenWithMeta(token);
    if (!verified) {
      return socket.emit('auth_response', { success: false, tokenExpired: true, error: 'Oturum süresi doldu, lütfen tekrar giriş yapın.' });
    }

    const foundAccount = registeredAccounts.get(verified.username.toLowerCase());
    if (!foundAccount) {
      return socket.emit('auth_response', { success: false, tokenExpired: true, error: 'Hesap bulunamadı.' });
    }

    if (foundAccount.minTokenIssuedAt && verified.iat < foundAccount.minTokenIssuedAt) {
      return socket.emit('auth_response', { success: false, tokenExpired: true, error: 'Bu oturum başka bir cihazdan sonlandırıldı.' });
    }

    if (foundAccount.isBanned) {
      if (foundAccount.bannedUntil && Date.now() >= foundAccount.bannedUntil) {
        foundAccount.isBanned = false;
        foundAccount.bannedReason = '';
        foundAccount.bannedUntil = null;
        saveAccounts(registeredAccounts);
      } else {
        return socket.emit('auth_response', {
          success: false,
          tokenExpired: true,
          error: `Hesabınız sistem yöneticisi tarafından yasaklandı.${foundAccount.bannedReason ? ` Sebep: ${foundAccount.bannedReason}` : ''}`
        });
      }
    }

    if (systemConfig.maintenanceMode && foundAccount.role !== 'admin') {
      return socket.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.'
      });
    }

    const user: User = {
      id: socket.id,
      username: foundAccount.username,
      email: foundAccount.email,
      role: foundAccount.role,
      avatar: foundAccount.avatar,
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      createdAt: foundAccount.createdAt,
      walletBalance: foundAccount.walletBalance,
      statusMessage: foundAccount.statusMessage || 'Çevrimiçi',
      bannerColor: foundAccount.bannerColor || 'from-indigo-600 to-purple-600',
      bannerImage: foundAccount.bannerImage || '',
      bio: foundAccount.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.',
      badges: foundAccount.badges || getUserBadges(foundAccount.role, foundAccount.username, foundAccount.role === 'admin'),
      friends: foundAccount.friends || [],
      blockedUsers: foundAccount.blockedUsers || [],
      twoFactorEnabled: Boolean(foundAccount.twoFactorEnabled),
    };

    activeUsers.set(socket.id, user);
    activeSessions.set(socket.id, {
      socketId: socket.id,
      username: user.username,
      ip: getClientIp(socket),
      userAgent: (socket.handshake.headers['user-agent'] || 'Bilinmeyen Cihaz').slice(0, 80),
      connectedAt: new Date().toISOString()
    });
    if (user.role === 'admin') socket.join('admins');
    ensureUserInServers(user);
    recordUserConnection(socket, user.username, user.role);

    const refreshedToken = generateSessionToken(user.username);
    socket.emit('auth_response', { success: true, user, token: refreshedToken });
    socket.emit('init_data', {
      currentUser: user,
      servers,
      onlineUsers: Array.from(activeUsers.values()),
      messages
    });
    socket.emit('friends_data', getFriendsData(user.username));
    socket.broadcast.emit('user_connected', user);
  });

  // 3. LOGOUT (Çıkış Yapma)
  socket.on('auth_logout', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      socket.leave('admins');
      recordUserDisconnection(socket.id);
      addAuditLog('CIKIS_YAPILDI', `${user.username} sistemden çıkış yaptı.`, 'auth');
      if (user.currentVoiceChannelId) {
        socket.to(user.currentVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: user.currentVoiceChannelId });
      }
      activeUsers.delete(socket.id);
      io.emit('user_disconnected', socket.id);
      socket.emit('logged_out');
    }
  });

  // Mandatory Auth Check Helper
  const requireAuth = (): User | null => {
    const user = activeUsers.get(socket.id);
    if (!user) {
      socket.emit('auth_required', { message: 'Bu eylemi gerçekleştirmek için lütfen önce giriş yapın.' });
      return null;
    }
    return user;
  };

  // Text Messaging (Supports text, file attachments, replies & interactive polls)
  socket.on('send_message', ({ serverId, channelId, content, attachments, poll, replyTo }: { serverId: string; channelId: string; content?: string; attachments?: MessageAttachment[]; poll?: any; replyTo?: { id: string; username: string; content: string } }) => {
    const sender = activeUsers.get(socket.id);
    const rawContent = (content || '').trim();
    if (!sender || (!rawContent && (!attachments || attachments.length === 0) && !poll)) return;

    // 0. Server Timeout Check
    const targetSrv = servers.find(s => s.id === serverId);
    const timeoutUntil = targetSrv?.timeouts?.[sender.username.toLowerCase()];
    if (timeoutUntil && timeoutUntil > Date.now()) {
      const minsLeft = Math.ceil((timeoutUntil - Date.now()) / 60000);
      return socket.emit('chat_flood_error', {
        message: `Bu sunucuda geçici olarak susturuldunuz. Kalan süre: ~${minsLeft} dakika.`
      });
    }

    // 0.5 Global & Server AutoMod Filter (non-admins)
    if (sender.role !== 'admin') {
      const maxLen = systemConfig.maxMessageLength || 2000;
      if (rawContent.length > maxLen) {
        return socket.emit('chat_flood_error', {
          message: `Mesajınız sistem mesaj uzunluğu sınırını (${maxLen} karakter) aşıyor.`
        });
      }
      if (systemConfig.globalBlockLinks && /(https?:\/\/|discord\.gg\/|www\.)/i.test(rawContent)) {
        return socket.emit('chat_flood_error', {
          message: 'Sistem Güvenlik Filtresi: Harici bağlantı paylaşımı tüm sunucularda kapatılmıştır.'
        });
      }
      if (Array.isArray(systemConfig.globalBannedWords) && systemConfig.globalBannedWords.length > 0) {
        const lowerRawGlobal = rawContent.toLowerCase();
        if (systemConfig.globalBannedWords.some((w) => w && lowerRawGlobal.includes(w.toLowerCase()))) {
          return socket.emit('chat_flood_error', {
            message: 'Sistem Güvenlik Filtresi: Mesajınız global yasaklı kelime içerdiği için engellendi.'
          });
        }
      }
    }

    if (targetSrv?.autoModEnabled && sender.role !== 'admin') {
      if (targetSrv.autoModConfig?.blockLinks && /(https?:\/\/|discord\.gg\/|www\.)/i.test(rawContent)) {
        return socket.emit('chat_flood_error', {
          message: 'Otomatik Moderasyon: Bu sunucuda harici bağlantı paylaşımı engellenmiştir.'
        });
      }
      const bannedWords = targetSrv.autoModConfig?.bannedWords || ['amk', 'aq', 'orospu', 'piç', 'sik'];
      const lowerRaw = rawContent.toLowerCase();
      if (bannedWords.some((w) => w && lowerRaw.includes(w.toLowerCase()))) {
        return socket.emit('chat_flood_error', {
          message: 'Otomatik Moderasyon: Mesajınız yasaklı kelime içerdiği için engellendi.'
        });
      }
    }

    // 1. Anti-Spam / Flood Limiting Check
    if (isMessageFlooding(sender.id)) {
      return socket.emit('chat_flood_error', {
        message: 'Çok hızlı mesaj gönderiyorsunuz! Lütfen birkaç saniye bekleyin.'
      });
    }

    // 2. Malware & Executable File Attachment Blocking + Upload Size Limit
    if (hasDangerousAttachment(attachments)) {
      addAuditLog('GUVENLIK_ENGELI', `${sender.username} zararlı/çalıştırılabilir dosya (.exe, .bat vb.) yüklemeye çalıştı ve engellendi.`, 'warn');
      return socket.emit('file_security_error', {
        message: 'Güvenlik gereği çalıştırılabilir veya tehlikeli dosya türleri (.exe, .bat, .cmd, .scr vb.) yüklenemez.'
      });
    }
    if (Array.isArray(attachments) && attachments.length > 0) {
      const maxBytes = (systemConfig.maxUploadSizeMb || 5) * 1024 * 1024;
      const oversized = attachments.some((att) => (att.size || 0) > maxBytes || (att.url && att.url.length > maxBytes * 1.4));
      if (oversized) {
        return socket.emit('file_security_error', {
          message: `Dosya boyutu sistem limitini (${systemConfig.maxUploadSizeMb || 5} MB) aşıyor.`
        });
      }
    }

    // 3. Sanitize message content to prevent XSS / HTML injection attacks while preserving formatting
    const textContent = sanitizeText(rawContent).slice(0, systemConfig.maxMessageLength || 2000);

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      serverId,
      channelId,
      author: {
        id: sender.id,
        username: sender.username,
        avatar: sender.avatar
      },
      content: textContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachments || [],
      reactions: {},
      isPinned: false,
      poll: poll || undefined,
      replyTo: replyTo ? { id: replyTo.id, username: sanitizeText(replyTo.username), content: sanitizeText(replyTo.content).slice(0, 140) } : undefined
    };

    if (!messages[channelId]) {
      messages[channelId] = [];
    }
    messages[channelId].push(newMessage);
    saveMessages(messages);

    io.emit('new_message', newMessage);

    // 1. Leveling & XP System (+20 XP per message)
    const userAcc = registeredAccounts.get(sender.username.toLowerCase());
    if (userAcc) {
      userAcc.xp = (userAcc.xp || 0) + 20;
      const newLevel = Math.floor(Math.sqrt(userAcc.xp / 100)) + 1;
      const oldLevel = userAcc.level || 1;
      userAcc.level = newLevel;
      saveAccounts(registeredAccounts);

      if (newLevel > oldLevel) {
        addAuditLog('SEVIYE_ATLAMA', `${sender.username} Seviye ${newLevel}'e yükseldi! 🎉`, 'info');
        io.emit('user_level_up', { username: sender.username, level: newLevel, xp: userAcc.xp });
      }
    }

    // Award Server Member XP
    addMemberXP(serverId, sender, 15 + Math.floor(Math.random() * 10), true);

    // 2. Intelligent AI Bot Trigger (@ai / @bot / /ai)
    const lowerContent = textContent.toLowerCase();
    if (lowerContent.includes('@ai') || lowerContent.includes('@bot') || lowerContent.startsWith('/ai ')) {
      setTimeout(() => {
        const cleanPrompt = textContent.replace(/@ai|@bot|\/ai/gi, '').trim() || 'merhaba';
        const aiAnswer = generateAIResponse(cleanPrompt, sender.username);
        const aiMessage: Message = {
          id: `msg-ai-${Date.now()}`,
          serverId,
          channelId,
          author: {
            id: 'bot-gemini-ai',
            username: 'Gemini AI Asistan 🤖',
            avatar: '✨'
          },
          content: aiAnswer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false
        };

        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(aiMessage);
        saveMessages(messages);
        io.emit('new_message', aiMessage);
      }, 600);
    }

    // 3. Fun Bot Commands (/zar, /roll, /yazitura, /coinflip, /8ball)
    if (lowerContent === '/zar' || lowerContent === '/roll') {
      setTimeout(() => {
        const rollNum = Math.floor(Math.random() * 6) + 1;
        const rollMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-game', username: 'Oyun Botu 🎲', avatar: '🎲' },
          content: `🎲 **@${sender.username}** zar attı: **${rollNum}** (1-6)`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(rollMsg);
        saveMessages(messages);
        io.emit('new_message', rollMsg);
      }, 300);
    } else if (lowerContent === '/yazitura' || lowerContent === '/coinflip' || lowerContent === '/yazi-tura') {
      setTimeout(() => {
        const result = Math.random() > 0.5 ? 'YAZI 🪙' : 'TURA 🦅';
        const coinMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-game', username: 'Oyun Botu 🎲', avatar: '🪙' },
          content: `🪙 **@${sender.username}** madeni para attı: **${result}**`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(coinMsg);
        saveMessages(messages);
        io.emit('new_message', coinMsg);
      }, 300);
    } else if (lowerContent.startsWith('/8ball')) {
      setTimeout(() => {
        const answers = [
          'Kesinlikle evet! ✨',
          'Gözlerim evet diyor. 🎱',
          'Şüphesiz öyle. 👍',
          'Büyük ihtimalle. 🔮',
          'Şu an kestiremiyorum, sonra tekrar sor. ⏳',
          'Buna şimdi odaklanmasan iyi olur. 🤔',
          'Pek olası görünmüyor. ❌',
          'Cevabım hayır. 🛑',
          'Yıldızlar bugün seninle değil! 🌌'
        ];
        const ans = answers[Math.floor(Math.random() * answers.length)];
        const ballMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-game', username: 'Sihirli 8-Ball 🎱', avatar: '🎱' },
          content: `🎱 **Soru:** "${textContent.replace(/\/8ball/gi, '').trim() || 'Geleceğim nasıl?'}"\n🔮 **Cevap:** ${ans}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(ballMsg);
        saveMessages(messages);
        io.emit('new_message', ballMsg);
      }, 300);
    } else if (lowerContent === '/rank' || lowerContent === '/seviye') {
      setTimeout(() => {
        const sLevels = serverLevels[serverId] || {};
        const memberData = sLevels[sender.id] || {
          userId: sender.id,
          username: sender.username,
          avatar: sender.avatar,
          xp: 20,
          level: 1,
          messageCount: 1,
          voiceMinutes: 0
        };
        const rankMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-rank', username: 'Seviye Botu 🏆', avatar: '⭐' },
          content: `🏆 **@${sender.username}** Sunucu İstatistikleri:\n⭐ **Seviye:** ${memberData.level} | ⚡ **XP:** ${memberData.xp}\n💬 **Toplam Mesaj:** ${memberData.messageCount} | 🎙️ **Ses Odası Süresi:** ${memberData.voiceMinutes} dakika`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(rankMsg);
        saveMessages(messages);
        io.emit('new_message', rankMsg);
      }, 300);
    } else if (lowerContent === '/liderlik' || lowerContent === '/top') {
      setTimeout(() => {
        const sLevels = serverLevels[serverId] || {};
        const sorted = Object.values(sLevels).sort((a, b) => b.xp - a.xp).slice(0, 5);
        let leaderText = '🏆 **Sunucu Liderlik Tablosu (En Aktif Üyeler):**\n';
        if (sorted.length === 0) {
          leaderText += 'Henüz yeterli XP kaydı bulunmuyor!';
        } else {
          sorted.forEach((m, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
            leaderText += `${medal} **${idx + 1}. ${m.username}** — Seviye ${m.level} (${m.xp} XP | ${m.messageCount} mesaj)\n`;
          });
        }
        const leadMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-rank', username: 'Liderlik Botu 👑', avatar: '🥇' },
          content: leaderText.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(leadMsg);
        saveMessages(messages);
        io.emit('new_message', leadMsg);
      }, 300);
    }
  });

  // Emoji Reactions
  socket.on('add_reaction', ({ channelId, messageId, emoji }: { channelId: string; messageId: string; emoji: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const msg = channelMsgs.find(m => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const existingIdx = msg.reactions[emoji].indexOf(user.username);
    if (existingIdx !== -1) {
      msg.reactions[emoji].splice(existingIdx, 1);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      msg.reactions[emoji].push(user.username);
    }

    saveMessages(messages);
    io.emit('message_reaction_updated', { channelId, messageId, reactions: msg.reactions });
  });

  // Pin / Unpin Message (Requires manage_messages permission)
  socket.on('toggle_pin_message', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const msg = channelMsgs.find(m => m.id === messageId);
    if (!msg) return;

    const targetServer = servers.find(s => s.id === msg.serverId || s.channels.some(c => c.id === channelId));
    if (targetServer && !checkServerPermission(user, targetServer, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Mesaj sabitlemek için Kanalları Yönet yetkiniz yok.' });
    }

    msg.isPinned = !msg.isPinned;
    saveMessages(messages);
    io.emit('message_pin_updated', { channelId, messageId, isPinned: msg.isPinned });
  });

  // Edit Message (Only message author)
  socket.on('edit_message', ({ channelId, messageId, newContent }: { channelId: string; messageId: string; newContent: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const msg = channelMsgs.find(m => m.id === messageId);
    if (!msg) return;
    if (msg.author.username.toLowerCase() !== user.username.toLowerCase()) return;

    const clean = sanitizeText((newContent || '').trim()).slice(0, 4000);
    if (!clean) return;
    msg.content = clean;
    msg.isEdited = true;
    saveMessages(messages);
    io.emit('message_edited', { channelId, messageId, content: msg.content, isEdited: true });
  });

  // Delete Message (Author or moderator/admin)
  socket.on('delete_message', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const idx = channelMsgs.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const msg = channelMsgs[idx];

    const targetServer = servers.find(s => s.id === msg.serverId || s.channels.some(c => c.id === channelId));
    const isAuthor = msg.author.username.toLowerCase() === user.username.toLowerCase();
    const canManage = targetServer ? checkServerPermission(user, targetServer, 'manage_channels') : false;
    if (!isAuthor && !canManage && user.role !== 'admin') {
      return socket.emit('server_action_error', { message: 'Bu mesajı silmek için yetkiniz yok.' });
    }

    channelMsgs.splice(idx, 1);
    saveMessages(messages);
    io.emit('message_deleted', { channelId, messageId });
  });

  // Typing Indicator
  socket.on('typing_start', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId) return;
    socket.broadcast.emit('user_typing', { channelId, username: user.username, isTyping: true });
  });

  socket.on('typing_stop', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId) return;
    socket.broadcast.emit('user_typing', { channelId, username: user.username, isTyping: false });
  });

  // Change Password (Self-Service)
  socket.on('change_password', ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc) return socket.emit('change_password_response', { success: false, error: 'Hesap bulunamadı.' });

    if (!verifyPassword(currentPassword, acc.password)) {
      return socket.emit('change_password_response', { success: false, error: 'Mevcut şifreniz hatalı.' });
    }
    if (!newPassword || newPassword.length < 4) {
      return socket.emit('change_password_response', { success: false, error: 'Yeni şifre en az 4 karakter olmalıdır.' });
    }

    acc.password = hashPassword(newPassword);
    saveAccounts(registeredAccounts);
    addAuditLog('SIFRE_DEGISTIRILDI', `${user.username} kendi şifresini güncelledi.`, 'auth');
    socket.emit('change_password_response', { success: true, message: 'Şifreniz başarıyla güncellendi.' });
  });

  // 2FA Setup Init
  socket.on('2fa_setup_init', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc) return;
    if (acc.twoFactorEnabled) {
      return socket.emit('2fa_status_response', { success: false, error: '2FA zaten aktif.' });
    }
    const secret = generateBase32Secret(20);
    acc.pendingTwoFactorSecret = secret;
    saveAccounts(registeredAccounts);
    const otpauthUri = generateOtpAuthUri(acc.username, secret, 'Çakma');
    socket.emit('2fa_setup_data', { secret, otpauthUri });
  });

  // 2FA Setup Verify & Enable
  socket.on('2fa_setup_verify', ({ code }: { code: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc || !acc.pendingTwoFactorSecret) {
      return socket.emit('2fa_status_response', { success: false, error: 'Önce 2FA kurulumunu başlatın.' });
    }
    if (!verifyTotpCode(acc.pendingTwoFactorSecret, code)) {
      return socket.emit('2fa_status_response', { success: false, error: 'Doğrulama kodu geçersiz. Saatinizin senkronize olduğundan emin olun.' });
    }

    const backupCodes = generateBackupCodes(6);
    acc.twoFactorSecret = acc.pendingTwoFactorSecret;
    delete acc.pendingTwoFactorSecret;
    acc.twoFactorEnabled = true;
    acc.twoFactorBackupCodes = backupCodes.map((c) => hashPassword(c));
    saveAccounts(registeredAccounts);

    user.twoFactorEnabled = true;
    socket.emit('user_updated', user);
    addAuditLog('2FA_AKTIF_EDILDI', `${user.username} hesabında 2FA (TOTP) korumasını aktif etti.`, 'auth');
    socket.emit('2fa_status_response', {
      success: true,
      enabled: true,
      backupCodes,
      message: 'İki faktörlü doğrulama (2FA) başarıyla etkinleştirildi!'
    });
  });

  // 2FA Disable
  socket.on('2fa_disable', ({ password, code }: { password: string; code: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc || !acc.twoFactorEnabled || !acc.twoFactorSecret) {
      return socket.emit('2fa_status_response', { success: false, error: '2FA zaten devre dışı.' });
    }
    if (!verifyPassword(password || '', acc.password)) {
      return socket.emit('2fa_status_response', { success: false, error: 'Mevcut şifreniz hatalı.' });
    }
    const cleanCode = (code || '').trim().toUpperCase();
    const isTotpValid = verifyTotpCode(acc.twoFactorSecret, cleanCode);
    const isBackupValid = Array.isArray(acc.twoFactorBackupCodes) && acc.twoFactorBackupCodes.some((h) => verifyPassword(cleanCode, h));
    if (!isTotpValid && !isBackupValid) {
      return socket.emit('2fa_status_response', { success: false, error: '2FA doğrulama kodu geçersiz.' });
    }

    acc.twoFactorEnabled = false;
    delete acc.twoFactorSecret;
    delete acc.pendingTwoFactorSecret;
    delete acc.twoFactorBackupCodes;
    saveAccounts(registeredAccounts);

    user.twoFactorEnabled = false;
    socket.emit('user_updated', user);
    addAuditLog('2FA_DEVRE_DISI', `${user.username} hesabında 2FA korumasını devre dışı bıraktı.`, 'auth');
    socket.emit('2fa_status_response', {
      success: true,
      enabled: false,
      message: 'İki faktörlü doğrulama devre dışı bırakıldı.'
    });
  });

  // Active Sessions List & Revoke Other Sessions
  socket.on('get_active_sessions', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const list = Array.from(activeSessions.values())
      .filter((s) => s.username.toLowerCase() === user.username.toLowerCase())
      .map((s) => ({ ...s, isCurrent: s.socketId === socket.id }));
    socket.emit('active_sessions_list', list);
  });

  socket.on('revoke_other_sessions', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (acc) {
      acc.minTokenIssuedAt = Date.now();
      saveAccounts(registeredAccounts);
    }
    let revokedCount = 0;
    for (const [sid, sess] of activeSessions.entries()) {
      if (sess.username.toLowerCase() === user.username.toLowerCase() && sid !== socket.id) {
        const targetSock = io.sockets.sockets.get(sid);
        if (targetSock) {
          targetSock.emit('auth_response', {
            success: false,
            tokenExpired: true,
            error: 'Oturumunuz başka bir cihazdan sonlandırıldı.'
          });
          targetSock.emit('logged_out');
          targetSock.disconnect(true);
        }
        activeSessions.delete(sid);
        activeUsers.delete(sid);
        revokedCount++;
      }
    }
    addAuditLog('OTURUMLAR_SONLANDIRILDI', `${user.username} diğer ${revokedCount} oturumu sonlandırdı.`, 'auth');
    const remaining = Array.from(activeSessions.values())
      .filter((s) => s.username.toLowerCase() === user.username.toLowerCase())
      .map((s) => ({ ...s, isCurrent: s.socketId === socket.id }));
    socket.emit('active_sessions_list', remaining);
    socket.emit('revoke_sessions_result', { success: true, revokedCount });
  });

  // Raise Hand / Stage Mode Toggle
  socket.on('toggle_raise_hand', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    user.isHandRaised = !user.isHandRaised;
    io.emit('user_updated', user);
  });

  // Voice Activity Ping (for AFK auto-move)
  socket.on('voice_activity', () => {
    userVoiceActivity.set(socket.id, Date.now());
  });

  // Custom Server Emojis
  socket.on('add_server_emoji', ({ serverId, name, url }: { serverId: string; name: string; url: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !name || !url) return;
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) return;
    if (user.role !== 'admin' && srv.ownerId !== user.username && !checkServerPermission(user, srv, 'manage_server')) return;
    if (url.length > 512 * 1024) return;
    if (!srv.customEmojis) srv.customEmojis = [];
    const cleanName = sanitizeText(name).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'emoji';
    srv.customEmojis.push({ id: `emj-${Date.now()}`, name: cleanName, url });
    saveServers(servers);
    io.emit('server_updated', srv);
  });

  socket.on('delete_server_emoji', ({ serverId, emojiId }: { serverId: string; emojiId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !emojiId) return;
    const srv = servers.find((s) => s.id === serverId);
    if (!srv || !srv.customEmojis) return;
    if (user.role !== 'admin' && srv.ownerId !== user.username && !checkServerPermission(user, srv, 'manage_server')) return;
    srv.customEmojis = srv.customEmojis.filter((e) => e.id !== emojiId);
    saveServers(servers);
    io.emit('server_updated', srv);
  });

  // Block / Unblock User
  socket.on('block_user', ({ targetUsername }: { targetUsername: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !targetUsername || targetUsername.toLowerCase() === user.username.toLowerCase()) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc) return;
    if (!acc.blockedUsers) acc.blockedUsers = [];
    if (!acc.blockedUsers.includes(targetUsername.toLowerCase())) {
      acc.blockedUsers.push(targetUsername.toLowerCase());
      saveAccounts(registeredAccounts);
    }
    user.blockedUsers = [...acc.blockedUsers];
    socket.emit('user_updated', user);
  });

  socket.on('unblock_user', ({ targetUsername }: { targetUsername: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !targetUsername) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc || !acc.blockedUsers) return;
    acc.blockedUsers = acc.blockedUsers.filter(u => u !== targetUsername.toLowerCase());
    saveAccounts(registeredAccounts);
    user.blockedUsers = [...acc.blockedUsers];
    socket.emit('user_updated', user);
  });

  // Vote on Poll
  socket.on('vote_poll', ({ channelId, messageId, optionId }: { channelId: string; messageId: string; optionId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const msg = channelMsgs.find(m => m.id === messageId);
    if (!msg || !msg.poll || msg.poll.closed) return;

    msg.poll.options.forEach(opt => {
      const voteIdx = opt.votes.indexOf(user.username);
      if (opt.id === optionId) {
        if (voteIdx !== -1) {
          opt.votes.splice(voteIdx, 1);
        } else {
          opt.votes.push(user.username);
        }
      } else {
        if (voteIdx !== -1) {
          opt.votes.splice(voteIdx, 1);
        }
      }
    });

    let total = 0;
    msg.poll.options.forEach(o => total += o.votes.length);
    msg.poll.totalVotes = total;

    saveMessages(messages);
    io.emit('poll_updated', { channelId, messageId, poll: msg.poll });
  });

  // Soundboard in Voice Channel (Scoped to active room & 2s anti-spam cooldown)
  socket.on('voice_soundboard_play', ({ channelId, soundId }: { channelId: string; soundId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;

    const now = Date.now();
    const lastPlayed = soundboardCooldowns.get(user.id) || 0;
    if (now - lastPlayed < 2000) {
      return;
    }
    soundboardCooldowns.set(user.id, now);

    io.to(channelId).emit('voice_soundboard_played', {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      soundId,
      channelId
    });
  });

  // Synchronized Radio & YouTube Music Bot in Voice Channel (Scoped to active room)
  socket.on('voice_radio_state', (payload: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !payload?.channelId || user.currentVoiceChannelId !== payload.channelId) return;
    io.to(payload.channelId).emit('voice_radio_synced', {
      ...payload,
      initiatedBy: user.username
    });
  });

  // User Game / Activity Status Update
  socket.on('user_update_activity', ({ activity }: { activity: UserActivity | null }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    user.activity = activity || undefined;

    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (acc) {
      acc.activity = activity || undefined;
      saveAccounts(registeredAccounts);
    }

    io.emit('user_updated', user);
  });

  // Profile Update (Status message, bio, bannerColor, bannerImage, avatar, status - with XSS sanitization & size limits)
  socket.on('update_profile', ({ statusMessage, bio, bannerColor, bannerImage, avatar, status }: { statusMessage?: string; bio?: string; bannerColor?: string; bannerImage?: string; avatar?: string; status?: 'online' | 'idle' | 'dnd' | 'offline' }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const acc = registeredAccounts.get(user.username.toLowerCase());

    if (statusMessage !== undefined) {
      const cleanStatus = sanitizeText(statusMessage).trim().slice(0, 150);
      user.statusMessage = cleanStatus;
      if (acc) acc.statusMessage = cleanStatus;
    }
    if (bio !== undefined) {
      const cleanBio = sanitizeText(bio).trim().slice(0, 500);
      user.bio = cleanBio;
      if (acc) acc.bio = cleanBio;
    }
    if (bannerColor !== undefined && typeof bannerColor === 'string' && bannerColor.length <= 120) {
      user.bannerColor = bannerColor;
      if (acc) acc.bannerColor = bannerColor;
    }
    if (bannerImage !== undefined && typeof bannerImage === 'string') {
      if (bannerImage === '' || isSafeImageMedia(bannerImage)) {
        user.bannerImage = bannerImage;
        if (acc) acc.bannerImage = bannerImage;
      }
    }
    if (avatar !== undefined && typeof avatar === 'string') {
      const trimmedAvatar = avatar.trim();
      if (isSafeImageMedia(trimmedAvatar) || isSafeEmojiOrShortIcon(trimmedAvatar)) {
        user.avatar = trimmedAvatar;
        if (acc) acc.avatar = trimmedAvatar;
      }
    }
    if (status !== undefined && ['online', 'idle', 'dnd', 'offline'].includes(status)) {
      user.status = status;
    }

    if (acc) {
      saveAccounts(registeredAccounts);
    }

    io.emit('user_updated', user);
    socket.emit('profile_updated', user);
    addAuditLog('PROFIL_GUNCELLE', `${user.username} profil bilgilerini güncelledi.`, 'info');
  });

  // Direct 1-on-1 Voice Calling Relay (multi-session & username-aware)
  socket.on('direct_call_start', ({ targetUserId, targetUsername }: { targetUserId?: string; targetUsername?: string }) => {
    const caller = activeUsers.get(socket.id);
    if (!caller) return;

    // Resolve canonical target username from targetUsername, activeUsers, or registeredAccounts
    let resolvedUsername = (targetUsername || '').trim().toLowerCase();
    if (!resolvedUsername && targetUserId) {
      const bySocket = activeUsers.get(targetUserId);
      if (bySocket) {
        resolvedUsername = bySocket.username.toLowerCase();
      } else {
        for (const u of activeUsers.values()) {
          if (u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase()) {
            resolvedUsername = u.username.toLowerCase();
            break;
          }
        }
        if (!resolvedUsername) {
          resolvedUsername = targetUserId.toLowerCase();
        }
      }
    }

    const targetSocketIds: string[] = [];
    let isBlocked = false;
    for (const [sId, u] of activeUsers.entries()) {
      if (sId === socket.id) continue;
      const matchesId = Boolean(targetUserId && u.id === targetUserId);
      const matchesName = Boolean(resolvedUsername && u.username.toLowerCase() === resolvedUsername);
      if (matchesId || matchesName) {
        if (u.blockedUsers?.includes(caller.username.toLowerCase())) {
          isBlocked = true;
        }
        targetSocketIds.push(sId);
      }
    }

    if (isBlocked) {
      return socket.emit('direct_call_declined', { reason: 'Bu kullanıcıya şu anda ulaşılamıyor.' });
    }

    if (targetSocketIds.length > 0) {
      const targetKey = resolvedUsername || (targetUserId || '').toLowerCase();
      if (targetKey) {
        pendingDirectCalls.set(targetKey, {
          callerSocketId: socket.id,
          callerUserId: caller.id,
          callerUsername: caller.username.toLowerCase(),
        });
      }
      for (const sId of targetSocketIds) {
        io.to(sId).emit('direct_call_incoming', { callerUser: caller });
      }
    } else {
      socket.emit('direct_call_declined', { reason: 'Kullanıcı şu anda çevrimdışı.' });
    }
  });

  socket.on('direct_call_accept', ({ callerUserId, callerUsername }: { callerUserId?: string; callerUsername?: string }) => {
    const acceptor = activeUsers.get(socket.id);
    if (!acceptor) return;

    const pending = pendingDirectCalls.get(acceptor.username.toLowerCase());
    pendingDirectCalls.delete(acceptor.username.toLowerCase());

    const targetName = (callerUsername || '').trim().toLowerCase();
    let callerSocketId: string | null = null;
    if (pending && activeUsers.has(pending.callerSocketId)) {
      callerSocketId = pending.callerSocketId;
    } else {
      for (const [sId, u] of activeUsers.entries()) {
        if (
          (callerUserId && u.id === callerUserId) ||
          (targetName && u.username.toLowerCase() === targetName) ||
          (callerUserId && u.username.toLowerCase() === callerUserId.toLowerCase())
        ) {
          callerSocketId = sId;
          break;
        }
      }
    }

    if (callerSocketId) {
      activeDirectCallPairs.set(socket.id, callerSocketId);
      activeDirectCallPairs.set(callerSocketId, socket.id);
      io.to(callerSocketId).emit('direct_call_accepted', { targetUser: acceptor });
    }

    // Dismiss incoming ring on any other open sessions of the acceptor
    for (const [sId, u] of activeUsers.entries()) {
      if (sId !== socket.id && u.username.toLowerCase() === acceptor.username.toLowerCase()) {
        io.to(sId).emit('direct_call_handled');
      }
    }
  });

  socket.on('direct_call_decline', ({ callerUserId, callerUsername }: { callerUserId?: string; callerUsername?: string }) => {
    const decliner = activeUsers.get(socket.id);
    const pending = decliner ? pendingDirectCalls.get(decliner.username.toLowerCase()) : undefined;
    if (decliner) {
      pendingDirectCalls.delete(decliner.username.toLowerCase());
    }
    const paired = activeDirectCallPairs.get(socket.id);
    if (paired) {
      activeDirectCallPairs.delete(paired);
      activeDirectCallPairs.delete(socket.id);
    }
    if (pending && activeUsers.has(pending.callerSocketId)) {
      activeDirectCallPairs.delete(pending.callerSocketId);
      io.to(pending.callerSocketId).emit('direct_call_declined', { reason: 'Arama reddedildi.' });
    } else {
      const targetName = (callerUsername || '').trim().toLowerCase();
      for (const [sId, u] of activeUsers.entries()) {
        if (
          (callerUserId && u.id === callerUserId) ||
          (targetName && u.username.toLowerCase() === targetName) ||
          (callerUserId && u.username.toLowerCase() === callerUserId.toLowerCase())
        ) {
          activeDirectCallPairs.delete(sId);
          io.to(sId).emit('direct_call_declined', { reason: 'Arama reddedildi.' });
        }
      }
    }
    if (decliner) {
      for (const [sId, u] of activeUsers.entries()) {
        if (sId !== socket.id && u.username.toLowerCase() === decliner.username.toLowerCase()) {
          io.to(sId).emit('direct_call_handled');
        }
      }
    }
  });

  socket.on('direct_call_end', ({ targetUserId, targetUsername }: { targetUserId?: string; targetUsername?: string }) => {
    const paired = activeDirectCallPairs.get(socket.id);
    if (paired) {
      activeDirectCallPairs.delete(paired);
      activeDirectCallPairs.delete(socket.id);
      io.to(paired).emit('direct_call_ended');
    }
    const targetName = (targetUsername || '').trim().toLowerCase();
    for (const [sId, u] of activeUsers.entries()) {
      if (
        sId !== paired &&
        ((targetUserId && u.id === targetUserId) ||
          (targetName && u.username.toLowerCase() === targetName) ||
          (targetUserId && u.username.toLowerCase() === targetUserId.toLowerCase()))
      ) {
        activeDirectCallPairs.delete(sId);
        io.to(sId).emit('direct_call_ended');
      }
    }
  });

  // 1-on-1 Remote Assistance (TeamViewer-style) Relay — strictly scoped to activeDirectCallPairs
  socket.on('remote_assist_request', () => {
    const caller = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!caller || !pairedSocketId) return;
    io.to(pairedSocketId).emit('remote_assist_incoming_request', {
      fromUserId: socket.id,
      fromUsername: caller.username
    });
  });

  socket.on('remote_assist_response', ({ accepted, hostDesktopCapable }: { accepted: boolean; hostDesktopCapable?: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    io.to(pairedSocketId).emit('remote_assist_response', {
      accepted: Boolean(accepted),
      hostDesktopCapable: Boolean(hostDesktopCapable)
    });
  });

  socket.on('remote_assist_stop', () => {
    const user = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    io.to(pairedSocketId).emit('remote_assist_stopped', {
      stoppedBy: user?.username || 'Karşı taraf'
    });
  });

  socket.on('remote_assist_input', (payload: {
    kind: string;
    x?: number;
    y?: number;
    button?: number;
    delta_y?: number;
    key?: string;
    code?: string;
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload || typeof payload.kind !== 'string') return;
    io.to(pairedSocketId).emit('remote_assist_input', payload);
  });

  socket.on('direct_screen_share_state', ({ isSharing }: { isSharing: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    io.to(pairedSocketId).emit('direct_screen_share_state', {
      userId: socket.id,
      isSharing: Boolean(isSharing)
    });
  });

  // Friends System Events
  socket.on('get_friends_data', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    socket.emit('friends_data', getFriendsData(user.username));
  });

  socket.on('send_friend_request', ({ targetUsername }: { targetUsername: string }) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) return;

    const cleanTarget = targetUsername?.trim()?.toLowerCase();
    if (!cleanTarget) {
      return socket.emit('friend_request_response', { success: false, error: 'Lütfen bir kullanıcı adı girin.' });
    }

    if (cleanTarget === sender.username.toLowerCase()) {
      return socket.emit('friend_request_response', { success: false, error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });
    }

    const targetAccount = registeredAccounts.get(cleanTarget);
    if (!targetAccount) {
      return socket.emit('friend_request_response', { success: false, error: `"${targetUsername}" adlı kullanıcı bulunamadı.` });
    }

    const senderAccount = registeredAccounts.get(sender.username.toLowerCase());
    if (!senderAccount) return;

    if (senderAccount.friends?.map(f => f.toLowerCase()).includes(targetAccount.username.toLowerCase())) {
      return socket.emit('friend_request_response', { success: false, error: `"${targetAccount.username}" ile zaten arkadaşsınız.` });
    }

    // Check if duplicate request already exists
    for (const req of pendingFriendRequests.values()) {
      if (req.fromUsername.toLowerCase() === sender.username.toLowerCase() &&
          req.toUsername.toLowerCase() === targetAccount.username.toLowerCase()) {
        return socket.emit('friend_request_response', { success: false, error: 'Bu kullanıcıya zaten bekleyen bir istek gönderdiniz.' });
      }
      if (req.fromUsername.toLowerCase() === targetAccount.username.toLowerCase() &&
          req.toUsername.toLowerCase() === sender.username.toLowerCase()) {
        // Automatic mutual acceptance
        if (!senderAccount.friends) senderAccount.friends = [];
        if (!targetAccount.friends) targetAccount.friends = [];
        senderAccount.friends.push(targetAccount.username.toLowerCase());
        targetAccount.friends.push(sender.username.toLowerCase());
        pendingFriendRequests.delete(req.id);
        saveAccounts(registeredAccounts);
        saveFriendRequests(pendingFriendRequests);

        socket.emit('friend_request_response', { success: true, message: `${targetAccount.username} ile arkadaş oldunuz!` });
        socket.emit('friends_data', getFriendsData(sender.username));

        for (const [sId, u] of activeUsers.entries()) {
          if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
            io.to(sId).emit('friends_data', getFriendsData(targetAccount.username));
            io.to(sId).emit('friend_request_accepted', { friendUsername: sender.username });
          }
        }
        return;
      }
    }

    // Create new friend request
    const newReq: FriendRequest = {
      id: `freq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fromUserId: sender.id,
      fromUsername: sender.username,
      fromAvatar: sender.avatar,
      toUserId: targetAccount.id,
      toUsername: targetAccount.username,
      createdAt: new Date().toLocaleDateString('tr-TR')
    };

    pendingFriendRequests.set(newReq.id, newReq);
    saveFriendRequests(pendingFriendRequests);
    socket.emit('friend_request_response', { success: true, message: `${targetAccount.username} adlı kullanıcıya arkadaşlık isteği gönderildi!` });
    socket.emit('friends_data', getFriendsData(sender.username));

    // If target is online, notify them immediately
    for (const [sId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
        io.to(sId).emit('friend_request_received', newReq);
        io.to(sId).emit('friends_data', getFriendsData(targetAccount.username));
      }
    }
  });

  socket.on('accept_friend_request', ({ requestId }: { requestId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const req = pendingFriendRequests.get(requestId);
    if (!req) return;

    const userAccount = registeredAccounts.get(user.username.toLowerCase());
    const senderAccount = registeredAccounts.get(req.fromUsername.toLowerCase());

    if (userAccount && senderAccount) {
      if (!userAccount.friends) userAccount.friends = [];
      if (!senderAccount.friends) senderAccount.friends = [];

      if (!userAccount.friends.map(f => f.toLowerCase()).includes(senderAccount.username.toLowerCase())) {
        userAccount.friends.push(senderAccount.username.toLowerCase());
      }
      if (!senderAccount.friends.map(f => f.toLowerCase()).includes(userAccount.username.toLowerCase())) {
        senderAccount.friends.push(userAccount.username.toLowerCase());
      }

      pendingFriendRequests.delete(requestId);
      saveAccounts(registeredAccounts);
      saveFriendRequests(pendingFriendRequests);

      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === senderAccount.username.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(senderAccount.username));
          io.to(sId).emit('friend_request_accepted', { friendUsername: user.username });
        }
      }
    }
  });

  socket.on('decline_friend_request', ({ requestId }: { requestId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const req = pendingFriendRequests.get(requestId);
    if (req) {
      pendingFriendRequests.delete(requestId);
      saveFriendRequests(pendingFriendRequests);
      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === req.fromUsername.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(req.fromUsername));
        }
      }
    }
  });

  socket.on('cancel_friend_request', ({ requestId }: { requestId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const req = pendingFriendRequests.get(requestId);
    if (req) {
      pendingFriendRequests.delete(requestId);
      saveFriendRequests(pendingFriendRequests);
      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === req.toUsername.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(req.toUsername));
        }
      }
    }
  });

  socket.on('remove_friend', ({ targetUsername }: { targetUsername: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const userAccount = registeredAccounts.get(user.username.toLowerCase());
    const targetAccount = registeredAccounts.get(targetUsername.toLowerCase());

    if (userAccount && targetAccount) {
      userAccount.friends = (userAccount.friends || []).filter(f => f.toLowerCase() !== targetUsername.toLowerCase());
      targetAccount.friends = (targetAccount.friends || []).filter(f => f.toLowerCase() !== user.username.toLowerCase());
      saveAccounts(registeredAccounts);

      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(targetAccount.username));
        }
      }
    }
  });

  // Channel Creation
  socket.on('create_channel', ({ serverId, name, type, isLocked, password, topic }: { serverId: string; name: string; type: 'text' | 'voice'; isLocked?: boolean; password?: string; topic?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;

    if (!checkServerPermission(user, targetServer, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Kanal oluşturmak için Kanalları Yönet yetkiniz yok.' });
    }

    const cleanName = sanitizeText(name).toLowerCase().replace(/\s+/g, '-').slice(0, 32);
    const cleanTopic = topic ? sanitizeText(topic.trim()).slice(0, 100) : undefined;

    const newChannel: Channel = {
      id: `ch-${type}-${Date.now()}`,
      name: cleanName,
      type,
      serverId,
      isLocked: !!isLocked,
      password: password?.trim() || undefined,
      topic: cleanTopic
    };

    targetServer.channels.push(newChannel);
    saveServers(servers);
    addAuditLog('KANAL_OLUSTURULDU', `${targetServer.name} sunucusunda #${newChannel.name} (${type}${newChannel.password ? ' - Şifreli' : ''}) oluşturuldu.`);
    io.emit('channel_created', { serverId, channel: newChannel });
    io.emit('servers_updated', servers);
  });

  // Update Channel Notice & Topic
  socket.on('update_channel_notice', ({ serverId, channelId, notice, topic }: { serverId: string; channelId: string; notice?: string | null; topic?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;

    if (!checkServerPermission(user, targetServer, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Kanal duyurusunu düzenlemek için yetkiniz yok.' });
    }

    const ch = targetServer.channels.find(c => c.id === channelId);
    if (!ch) return;

    if (notice !== undefined) {
      ch.stickyNotice = notice ? {
        text: sanitizeText(notice.trim()).slice(0, 300),
        author: user.username,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } : null;
    }
    if (topic !== undefined) {
      ch.topic = sanitizeText(topic.trim()).slice(0, 100);
    }

    saveServers(servers);
    io.emit('channel_updated', { serverId, channel: ch });
    io.emit('servers_updated', servers);
  });

  // Server Creation
  socket.on('create_server', ({ name, icon }: { name: string; icon?: string }) => {
    const user = activeUsers.get(socket.id);
    const ownerId = user ? user.id : `usr-${Date.now()}`;
    const newServerId = `server-${Date.now()}`;
    const roles = getDefaultRoles();
    const members: ServerMember[] = user ? [
      {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        roleIds: ['role-owner', 'role-admin'],
        joinedAt: new Date().toLocaleDateString('tr-TR'),
        isOwner: true
      }
    ] : [];

    const newServer: Server = {
      id: newServerId,
      name,
      icon: icon || '⚡',
      description: '',
      ownerId,
      bitrateKbps: 128,
      roles,
      members,
      channels: [
        { id: `ch-text-${Date.now()}-1`, name: 'genel', type: 'text', serverId: newServerId },
        { id: `ch-voice-${Date.now()}-2`, name: 'Genel Ses', type: 'voice', serverId: newServerId },
      ]
    };

    servers.push(newServer);
    saveServers(servers);
    addAuditLog('SUNUCU_OLUSTURULDU', `Yeni sunucu olusturuldu: ${name} (Sahip: ${user?.username || 'Bilinmiyor'})`);
    io.emit('server_created', newServer);
  });

  // Helper to check user permission in server
  function checkServerPermission(user: User, server: Server, permission: ServerPermission): boolean {
    if (server.ownerId === user.id) return true;
    if (user.role === 'admin') return true;
    const member = server.members?.find(m => m.userId === user.id);
    if (!member) return false;
    if (member.isOwner) return true;

    for (const rId of member.roleIds) {
      const role = server.roles.find(r => r.id === rId);
      if (role && role.permissions.includes(permission)) return true;
    }
    const defaultRole = server.roles.find(r => r.isDefault);
    if (defaultRole && defaultRole.permissions.includes(permission)) return true;
    return false;
  }

  // Update Server Settings
  socket.on('update_server_settings', (data: {
    serverId: string;
    name?: string;
    icon?: string;
    bannerGradient?: string;
    bannerImage?: string;
    description?: string;
    afkChannelId?: string | null;
    afkTimeoutMinutes?: number;
    bitrateKbps?: number;
    voiceRegion?: string;
    systemChannelId?: string | null;
    verificationLevel?: 'none' | 'low' | 'medium' | 'high';
    defaultNotification?: 'all' | 'mentions';
    autoModEnabled?: boolean;
    vanityCode?: string;
    welcomeChannelId?: string | null;
    welcomeMessage?: string;
    welcomeEnabled?: boolean;
    autoRoleId?: string | null;
  }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === data.serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_server')) {
      return socket.emit('server_action_error', { message: 'Bu ayarları değiştirmek için Sunucu Yönetimi yetkiniz yok.' });
    }

    if (data.name) s.name = sanitizeText(data.name).trim().slice(0, 80);
    if (data.icon !== undefined && typeof data.icon === 'string') {
      const trimmedIcon = data.icon.trim();
      if (isSafeImageMedia(trimmedIcon) || isSafeEmojiOrShortIcon(trimmedIcon)) {
        s.icon = trimmedIcon;
      }
    }
    if (data.bannerGradient !== undefined) s.bannerGradient = data.bannerGradient;
    if (data.bannerImage !== undefined && typeof data.bannerImage === 'string') {
      if (data.bannerImage === '' || isSafeImageMedia(data.bannerImage)) {
        s.bannerImage = data.bannerImage;
      }
    }
    if (data.description !== undefined) s.description = sanitizeText(data.description).trim().slice(0, 500);
    if (data.afkChannelId !== undefined) s.afkChannelId = data.afkChannelId;
    if (data.afkTimeoutMinutes !== undefined) s.afkTimeoutMinutes = data.afkTimeoutMinutes;
    if (data.bitrateKbps !== undefined) s.bitrateKbps = data.bitrateKbps;
    if (data.voiceRegion !== undefined) s.voiceRegion = data.voiceRegion;
    if (data.systemChannelId !== undefined) s.systemChannelId = data.systemChannelId;
    if (data.verificationLevel !== undefined) s.verificationLevel = data.verificationLevel;
    if (data.defaultNotification !== undefined) s.defaultNotification = data.defaultNotification;
    if (data.autoModEnabled !== undefined) s.autoModEnabled = data.autoModEnabled;
    if (data.vanityCode !== undefined) s.vanityCode = data.vanityCode.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    if (data.welcomeChannelId !== undefined) s.welcomeChannelId = data.welcomeChannelId;
    if (data.welcomeMessage !== undefined) s.welcomeMessage = sanitizeText(data.welcomeMessage).trim().slice(0, 500);
    if (data.welcomeEnabled !== undefined) s.welcomeEnabled = data.welcomeEnabled;
    if (data.autoRoleId !== undefined) s.autoRoleId = data.autoRoleId;

    saveServers(servers);

    addAuditLog('SUNUCU_GUNCELLENDI', `${s.name} sunucu ayarları güncellendi (Bitrate: ${s.bitrateKbps || 128}kbps, Yetkili: ${user.username})`);
    io.emit('server_updated', s);
  });

  // Restore Server Backup / Template
  socket.on('restore_server_backup', ({ serverId, backupData }: { serverId: string; backupData: any }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_server')) {
      return socket.emit('server_action_error', { message: 'Sunucu yedeğini yüklemek için Sunucu Yönetimi yetkiniz yok.' });
    }

    if (backupData.name) s.name = backupData.name.trim();
    if (backupData.icon) s.icon = backupData.icon;
    if (backupData.bannerGradient) s.bannerGradient = backupData.bannerGradient;
    if (backupData.description !== undefined) s.description = backupData.description;
    if (backupData.bitrateKbps) s.bitrateKbps = backupData.bitrateKbps;
    if (backupData.voiceRegion) s.voiceRegion = backupData.voiceRegion;
    if (backupData.verificationLevel) s.verificationLevel = backupData.verificationLevel;
    if (backupData.autoModEnabled !== undefined) s.autoModEnabled = backupData.autoModEnabled;

    if (Array.isArray(backupData.channels) && backupData.channels.length > 0) {
      s.channels = backupData.channels.map((ch: any, idx: number) => ({
        id: ch.id || `ch-${ch.type || 'text'}-${Date.now() + idx}`,
        name: ch.name || 'kanal',
        type: ch.type === 'voice' ? 'voice' : 'text',
        serverId: s.id,
        topic: ch.topic || '',
        bitrateKbps: ch.bitrateKbps || s.bitrateKbps || 128,
        userLimit: ch.userLimit || 0,
        isTempCreatorChannel: !!ch.isTempCreatorChannel
      }));
    }

    if (Array.isArray(backupData.roles) && backupData.roles.length > 0) {
      s.roles = backupData.roles.map((r: any, idx: number) => ({
        id: r.id || `role-${Date.now() + idx}`,
        name: r.name || 'Yeni Rol',
        color: r.color || '#3b82f6',
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
        isDefault: !!r.isDefault
      }));
    }

    saveServers(servers);
    addAuditLog('SUNUCU_YEDEKTEN_YUKLENDI', `${s.name} sunucusu şablondan/yedekten yüklendi (Yetkili: ${user.username})`);
    io.emit('server_updated', s);
    socket.emit('server_restore_success', { message: 'Sunucu şablonu/yedeği başarıyla geri yüklendi!' });
  });

  // Create Server Role
  socket.on('create_server_role', ({ serverId, name, color, permissions }: {
    serverId: string;
    name: string;
    color: string;
    permissions: ServerPermission[];
  }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_roles')) {
      return socket.emit('server_action_error', { message: 'Rol oluşturmak için Rolleri Yönet yetkiniz yok.' });
    }

    if (!s.roles) s.roles = getDefaultRoles();

    const newRole: ServerRole = {
      id: `role-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: name.trim() || 'Yeni Rol',
      color: color || '#3b82f6',
      position: s.roles.length + 1,
      permissions: permissions || ['send_messages', 'connect_voice', 'speak_voice']
    };

    s.roles.push(newRole);
    saveServers(servers);
    addAuditLog('ROL_OLUSTURULDU', `${s.name} sunucusunda yeni rol olusturuldu: ${newRole.name}`);
    io.emit('server_updated', s);
  });

  // Update Server Role
  socket.on('update_server_role', ({ serverId, roleId, name, color, permissions, position }: {
    serverId: string;
    roleId: string;
    name: string;
    color: string;
    permissions: ServerPermission[];
    position?: number;
  }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_roles')) {
      return socket.emit('server_action_error', { message: 'Rol düzenlemek için Rolleri Yönet yetkiniz yok.' });
    }

    if (!s.roles) s.roles = getDefaultRoles();
    const role = s.roles.find(r => r.id === roleId);
    if (!role) return;

    role.name = name.trim() || role.name;
    role.color = color || role.color;
    role.permissions = permissions;
    if (position !== undefined) role.position = position;
    saveServers(servers);

    io.emit('server_updated', s);
  });

  // Delete Server Role
  socket.on('delete_server_role', ({ serverId, roleId }: { serverId: string; roleId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_roles')) {
      return socket.emit('server_action_error', { message: 'Rol silmek için yetkiniz yok.' });
    }

    if (!s.roles) s.roles = getDefaultRoles();
    const role = s.roles.find(r => r.id === roleId);
    if (!role || role.isDefault || role.id === 'role-owner') {
      return socket.emit('server_action_error', { message: 'Bu rol korumalıdır ve silinemez.' });
    }

    s.roles = s.roles.filter(r => r.id !== roleId);
    if (s.members) {
      s.members.forEach(m => {
        m.roleIds = m.roleIds.filter(id => id !== roleId);
      });
    }
    saveServers(servers);

    io.emit('server_updated', s);
  });

  // Toggle Member Role
  socket.on('toggle_member_role', ({ serverId, targetUserId, roleId }: { serverId: string; targetUserId: string; roleId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_roles')) {
      return socket.emit('server_action_error', { message: 'Üyelere rol atamak için yetkiniz yok.' });
    }

    if (!s.members) s.members = [];
    let member = s.members.find(m => m.userId === targetUserId);
    if (!member) {
      let targetUser: User | undefined;
      for (const u of activeUsers.values()) {
        if (u.id === targetUserId) { targetUser = u; break; }
      }
      if (targetUser) {
        member = {
          userId: targetUser.id,
          username: targetUser.username,
          avatar: targetUser.avatar,
          roleIds: [],
          joinedAt: new Date().toLocaleDateString('tr-TR')
        };
        s.members.push(member);
      } else {
        return;
      }
    }

    if (member.roleIds.includes(roleId)) {
      member.roleIds = member.roleIds.filter(id => id !== roleId);
    } else {
      member.roleIds.push(roleId);
    }
    saveServers(servers);

    io.emit('server_updated', s);
  });

  // Kick Member
  socket.on('kick_server_member', ({ serverId, targetUserId }: { serverId: string; targetUserId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'kick_members')) {
      return socket.emit('server_action_error', { message: 'Üyeyi atmak için yetkiniz yok.' });
    }
    if (targetUserId === s.ownerId) {
      return socket.emit('server_action_error', { message: 'Sunucu sahibini atamazsınız!' });
    }

    if (s.members) {
      s.members = s.members.filter(m => m.userId !== targetUserId);
    }
    saveServers(servers);
    addAuditLog('UYE_ATILDI', `${targetUserId} sunucudan atildi (Yetkili: ${user.username})`, 'warn');
    io.emit('server_updated', s);
  });

  // Timeout / Mute Member Temporarily
  socket.on('timeout_server_member', ({ serverId, targetUsername, durationMinutes }: { serverId: string; targetUsername: string; durationMinutes: number }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'kick_members') && !checkServerPermission(user, s, 'mute_members')) {
      return socket.emit('server_action_error', { message: 'Üyeyi susturmak için yetkiniz yok.' });
    }
    const targetLower = targetUsername.toLowerCase();
    const targetAcc = registeredAccounts.get(targetLower);
    if (targetAcc?.role === 'admin' || s.ownerId === targetAcc?.id) {
      return socket.emit('server_action_error', { message: 'Yöneticilere veya sunucu sahibine zaman aşımı uygulanamaz.' });
    }

    if (!s.timeouts) s.timeouts = {};
    if (durationMinutes <= 0) {
      delete s.timeouts[targetLower];
      addAuditLog('ZAMAN_ASIMI_KALDIRILDI', `${targetUsername} kullanıcısının susturması kaldırıldı (Yetkili: ${user.username})`, 'info');
    } else {
      s.timeouts[targetLower] = Date.now() + durationMinutes * 60 * 1000;
      addAuditLog('ZAMAN_ASIMI_UYGULANDI', `${targetUsername} ${durationMinutes} dakika susturuldu (Yetkili: ${user.username})`, 'warn');
    }
    saveServers(servers);
    io.emit('server_updated', s);
  });

  // Create Server Invite Link
  socket.on('create_server_invite', ({ serverId, maxUses, expireMinutes }: { serverId: string; maxUses?: number; expireMinutes?: number }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;

    if (!s.invites) s.invites = [];
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newInvite = {
      code,
      serverId,
      createdBy: user.username,
      createdAt: new Date().toISOString(),
      expiresAt: expireMinutes && expireMinutes > 0 ? Date.now() + expireMinutes * 60 * 1000 : null,
      maxUses: maxUses && maxUses > 0 ? maxUses : undefined,
      uses: 0
    };
    s.invites.unshift(newInvite);
    if (s.invites.length > 20) s.invites = s.invites.slice(0, 20);
    saveServers(servers);
    io.emit('server_updated', s);
    socket.emit('server_invite_created', newInvite);
  });

  // Preview Server via Invite Code (for Invite Card Banner/Icon Preview)
  socket.on('preview_server_invite', ({ code }: { code: string }) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      return socket.emit('preview_invite_response', { success: false, error: 'Davet kodu boş olamaz.' });
    }

    for (const s of servers) {
      const inv = s.invites?.find(i => i.code === cleanCode);
      if (inv) {
        if (inv.expiresAt && inv.expiresAt < Date.now()) {
          return socket.emit('preview_invite_response', { success: false, error: 'Bu davet linkinin süresi dolmuş.' });
        }
        if (inv.maxUses && inv.uses >= inv.maxUses) {
          return socket.emit('preview_invite_response', { success: false, error: 'Bu davet linki maksimum kullanım sınırına ulaşmış.' });
        }
        return socket.emit('preview_invite_response', {
          success: true,
          server: {
            id: s.id,
            name: s.name,
            icon: s.icon,
            bannerGradient: s.bannerGradient,
            bannerImage: s.bannerImage,
            description: s.description,
            memberCount: s.members?.length || 0,
          },
        });
      }
    }

    socket.emit('preview_invite_response', { success: false, error: 'Geçersiz veya bulunamayan davet kodu.' });
  });

  // Join Server via Invite Code
  socket.on('join_server_by_invite', ({ code }: { code: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !code) return;
    const cleanCode = code.trim().toUpperCase();

    for (const s of servers) {
      const inv = s.invites?.find(i => i.code === cleanCode);
      if (inv) {
        if (inv.expiresAt && inv.expiresAt < Date.now()) {
          return socket.emit('join_invite_response', { success: false, error: 'Bu davet linkinin süresi dolmuş.' });
        }
        if (inv.maxUses && inv.uses >= inv.maxUses) {
          return socket.emit('join_invite_response', { success: false, error: 'Bu davet linki maksimum kullanım sınırına ulaşmış.' });
        }

        const alreadyMember = s.members?.some(m => m.username.toLowerCase() === user.username.toLowerCase());
        if (!alreadyMember) {
          if (!s.members) s.members = [];
          const defaultRole = s.roles?.find(r => r.isDefault);
          s.members.push({
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            roleIds: defaultRole ? [defaultRole.id] : [],
            joinedAt: new Date().toLocaleDateString('tr-TR')
          });
        }

        inv.uses += 1;
        saveServers(servers);
        io.emit('server_updated', s);
        return socket.emit('join_invite_response', { success: true, serverId: s.id, serverName: s.name });
      }
    }

    socket.emit('join_invite_response', { success: false, error: 'Geçersiz veya bulunamayan davet kodu.' });
  });

  // Reorder Channels within a server (up / down within same type)
  socket.on('reorder_channels', ({ serverId, channelId, direction }: { serverId: string; channelId: string; direction: 'up' | 'down' }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const s = servers.find(srv => srv.id === serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) return;

    const idx = s.channels.findIndex(c => c.id === channelId);
    if (idx === -1) return;

    const targetType = s.channels[idx].type;
    const sameTypeIndices: number[] = [];
    s.channels.forEach((ch, i) => {
      if (ch.type === targetType) sameTypeIndices.push(i);
    });

    const posInType = sameTypeIndices.indexOf(idx);
    if (posInType === -1) return;

    const swapPosInType = direction === 'up' ? posInType - 1 : posInType + 1;
    if (swapPosInType < 0 || swapPosInType >= sameTypeIndices.length) return;

    const swapIdx = sameTypeIndices[swapPosInType];
    const temp = s.channels[idx];
    s.channels[idx] = s.channels[swapIdx];
    s.channels[swapIdx] = temp;

    saveServers(servers);
    io.emit('server_updated', s);
  });

  // Message Threads (Alt Konu Yanıtı)
  socket.on('send_thread_message', ({ channelId, parentMessageId, content }: { channelId: string; parentMessageId: string; content: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !parentMessageId) return;
    const clean = sanitizeText(content).trim().slice(0, 2000);
    if (!clean) return;

    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const parent = channelMsgs.find(m => m.id === parentMessageId);
    if (!parent) return;

    if (!parent.threadMessages) parent.threadMessages = [];
    const threadMsg = {
      id: `thr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
      content: clean,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    parent.threadMessages.push(threadMsg);
    saveMessages(messages);
    io.emit('thread_message_added', { channelId, parentMessageId, threadMessage: threadMsg });
  });

  // Clear last N messages in a channel (Slash Command /temizle)
  socket.on('clear_channel_messages', ({ serverId, channelId, count }: { serverId: string; channelId: string; count: number }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !channelId) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Mesaj temizlemek için Kanal/Sunucu Yönetimi yetkiniz yok.' });
    }
    const safeCount = Math.min(Math.max(Number(count) || 10, 1), 100);
    const list = messages[channelId] || [];
    if (list.length === 0) return;
    messages[channelId] = list.slice(0, Math.max(0, list.length - safeCount));
    saveMessages(messages);
    io.emit('channel_messages_cleared', { channelId, messages: messages[channelId] });
  });

  // Server Events (Etkinlik Takvimi)
  socket.on('create_server_event', ({ serverId, title, description, startTime, voiceChannelId }: { serverId: string; title: string; description?: string; startTime: string; voiceChannelId?: string | null }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Etkinlik oluşturmak için yetkiniz yok.' });
    }
    const cleanTitle = sanitizeText(title).trim().slice(0, 100);
    if (!cleanTitle || !startTime) return;
    if (!s.events) s.events = [];
    s.events.unshift({
      id: `evt-${Date.now()}`,
      title: cleanTitle,
      description: sanitizeText(description || '').trim().slice(0, 400),
      startTime: sanitizeText(startTime).trim().slice(0, 64),
      voiceChannelId: voiceChannelId || null,
      createdBy: user.username,
      rsvps: [user.username],
    });
    if (s.events.length > 30) s.events = s.events.slice(0, 30);
    saveServers(servers);
    io.emit('server_updated', s);
  });

  socket.on('rsvp_server_event', ({ serverId, eventId }: { serverId: string; eventId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !eventId) return;
    const s = servers.find(srv => srv.id === serverId);
    const ev = s?.events?.find(e => e.id === eventId);
    if (!s || !ev) return;
    const idx = ev.rsvps.findIndex(u => u.toLowerCase() === user.username.toLowerCase());
    if (idx === -1) {
      ev.rsvps.push(user.username);
    } else {
      ev.rsvps.splice(idx, 1);
    }
    saveServers(servers);
    io.emit('server_updated', s);
  });

  socket.on('delete_server_event', ({ serverId, eventId }: { serverId: string; eventId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !eventId) return;
    const s = servers.find(srv => srv.id === serverId);
    const ev = s?.events?.find(e => e.id === eventId);
    if (!s || !ev) return;
    const canDelete = ev.createdBy.toLowerCase() === user.username.toLowerCase() || checkServerPermission(user, s, 'manage_server');
    if (!canDelete) return;
    s.events = (s.events || []).filter(e => e.id !== eventId);
    saveServers(servers);
    io.emit('server_updated', s);
  });

  // Delete Server
  socket.on('delete_server', ({ serverId }: { serverId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const sIdx = servers.findIndex(srv => srv.id === serverId);
    if (sIdx === -1) return;
    const s = servers[sIdx];

    if (s.ownerId !== user.id && user.role !== 'admin') {
      return socket.emit('server_action_error', { message: 'Yalnızca sunucu sahibi veya Sistem Yöneticisi sunucuyu silebilir!' });
    }

    const sName = s.name;
    servers.splice(sIdx, 1);
    saveServers(servers);
    addAuditLog('SUNUCU_SILINDI', `${sName} sunucusu silindi (Silen: ${user.username})`, 'warn');
    io.emit('server_deleted', { serverId });
  });

  function cleanupTemporaryChannels() {
    let changed = false;
    for (const server of servers) {
      const toRemove: string[] = [];
      for (const channel of server.channels) {
        if (channel.isTemporary) {
          const usersInCh = Array.from(activeUsers.values()).filter(u => u.currentVoiceChannelId === channel.id);
          if (usersInCh.length === 0) {
            toRemove.push(channel.id);
          }
        }
      }
      if (toRemove.length > 0) {
        server.channels = server.channels.filter(c => !toRemove.includes(c.id));
        changed = true;
      }
    }
    if (changed) {
      saveServers(servers);
      io.emit('servers_updated', servers);
    }
  }

  // Voice Channel Join
  socket.on('join_voice', ({ channelId, password }: { channelId: string; password?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    let targetChannelId = channelId;
    const targetChannel = servers.flatMap(s => s.channels).find(c => c.id === channelId);
    const parentServer = servers.find(s => s.channels.some(c => c.id === channelId));
    const voiceTimeoutUntil = parentServer?.timeouts?.[user.username.toLowerCase()];
    if (voiceTimeoutUntil && voiceTimeoutUntil > Date.now()) {
      const minsLeft = Math.ceil((voiceTimeoutUntil - Date.now()) / 60000);
      return socket.emit('server_action_error', {
        message: `Bu sunucuda geçici olarak susturuldunuz (~${minsLeft} dk). Ses kanallarına katılamazsınız.`
      });
    }

    // Password verification for locked channels
    if (targetChannel && targetChannel.password && user.role !== 'admin') {
      const server = servers.find(s => s.id === targetChannel.serverId);
      const isOwner = server?.ownerId === user.id;
      if (!isOwner && password !== targetChannel.password) {
        return socket.emit('voice_password_error', {
          channelId,
          channelName: targetChannel.name,
          message: 'Bu oda şifrelidir. Hatalı şifre girdiniz.'
        });
      }
    }

    // Check if user is joining the "➕ Oda Kur (+)" channel to spawn a temporary room
    if (targetChannel && (targetChannel.isTempCreatorChannel || targetChannel.name.includes('➕ Oda Kur'))) {
      const server = servers.find(s => s.id === targetChannel.serverId);
      if (server) {
        const tempChannelId = `ch-temp-${Date.now()}`;
        const tempChannel: Channel = {
          id: tempChannelId,
          name: `🔊 ${user.username} Odası`,
          type: 'voice',
          serverId: server.id,
          isTemporary: true,
          createdByUserId: user.id
        };
        server.channels.push(tempChannel);
        saveServers(servers);
        io.emit('servers_updated', servers);
        targetChannelId = tempChannelId;
      }
    }

    if (user.currentVoiceChannelId && user.currentVoiceChannelId !== targetChannelId) {
      socket.leave(user.currentVoiceChannelId);
      io.to(user.currentVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: user.currentVoiceChannelId });
      cleanupTemporaryChannels();
    }

    user.currentVoiceChannelId = targetChannelId;
    userVoiceActivity.set(socket.id, Date.now());
    socket.join(targetChannelId);

    const peersInRoom: User[] = [];
    for (const [sId, u] of activeUsers.entries()) {
      if (u.currentVoiceChannelId === targetChannelId && sId !== socket.id) {
        peersInRoom.push(u);
      }
    }

    socket.emit('voice_room_users', {
      channelId: targetChannelId,
      peers: peersInRoom
    });

    socket.to(targetChannelId).emit('user_joined_voice', {
      user,
      channelId: targetChannelId
    });

    io.emit('voice_state_update', {
      userId: socket.id,
      channelId: targetChannelId,
      isMuted: user.isMuted,
      isDeafened: user.isDeafened
    });

    addAuditLog('SESE_KATILDI', `${user.username} ses kanalina baglandi (${targetChannelId})`, 'voice');

    let channelName = targetChannelId;
    let sName = 'Ana Topluluk';
    for (const s of servers) {
      const ch = s.channels.find(c => c.id === targetChannelId);
      if (ch) {
        channelName = ch.name;
        sName = s.name;
        break;
      }
    }
    updateUserConnectionLocation(socket.id, sName, `Ses: ${channelName}`);
  });

  // Move user between voice channels (Self or Admin / Server Owner)
  socket.on('move_voice_user', ({ targetUserId, targetChannelId }: { targetUserId: string; targetChannelId: string }) => {
    const requester = activeUsers.get(socket.id);
    const targetUser = activeUsers.get(targetUserId);
    if (!requester || !targetUser) return;

    const targetChannel = servers.flatMap(s => s.channels).find(c => c.id === targetChannelId);
    const parentServer = servers.find(s => s.channels.some(c => c.id === targetChannelId));
    if (!targetChannel || targetChannel.type !== 'voice') return;
    if (targetChannel.isTempCreatorChannel || targetChannel.name.includes('➕ Oda Kur')) return;

    const isSelf = targetUserId === socket.id;
    const isAdmin = requester.role === 'admin';
    const isOwner = parentServer?.ownerId === requester.id;

    if (!isSelf && !isAdmin && !isOwner) {
      return socket.emit('server_action_error', { message: 'Kullanıcıları başka odaya taşıma yetkiniz yok.' });
    }

    if (targetUser.currentVoiceChannelId === targetChannelId) return;

    const targetSock = io.sockets.sockets.get(targetUserId);
    if (!targetSock) return;

    const oldChannelId = targetUser.currentVoiceChannelId;
    if (oldChannelId) {
      targetSock.leave(oldChannelId);
      io.to(oldChannelId).emit('user_left_voice', { userId: targetUserId, channelId: oldChannelId });
      cleanupTemporaryChannels();
    }

    targetUser.currentVoiceChannelId = targetChannelId;
    userVoiceActivity.set(targetUserId, Date.now());
    targetSock.join(targetChannelId);

    const peersInRoom: User[] = [];
    for (const [sId, u] of activeUsers.entries()) {
      if (u.currentVoiceChannelId === targetChannelId && sId !== targetUserId) {
        peersInRoom.push(u);
      }
    }

    targetSock.emit('moved_to_voice_channel', {
      channelId: targetChannelId,
      channelName: targetChannel.name,
      movedBy: requester.username,
      isSelf
    });

    targetSock.emit('voice_room_users', {
      channelId: targetChannelId,
      peers: peersInRoom
    });

    targetSock.to(targetChannelId).emit('user_joined_voice', {
      user: targetUser,
      channelId: targetChannelId
    });

    io.emit('voice_state_update', {
      userId: targetUserId,
      channelId: targetChannelId,
      isMuted: targetUser.isMuted,
      isDeafened: targetUser.isDeafened
    });

    if (!isSelf) {
      addAuditLog('KULLANICI_TASINDI', `${requester.username}, ${targetUser.username} kullanıcısını #${targetChannel.name} odasına taşıdı.`, 'voice');
    }
    updateUserConnectionLocation(targetUserId, parentServer?.name || 'Ana Topluluk', `Ses: ${targetChannel.name}`);
  });

  // Voice Channel Leave
  socket.on('leave_voice', () => {
    const user = activeUsers.get(socket.id);
    if (!user || !user.currentVoiceChannelId) return;

    const oldChannelId = user.currentVoiceChannelId;
    socket.leave(oldChannelId);
    user.currentVoiceChannelId = undefined;
    user.isSpeaking = false;
    user.isScreenSharing = false;

    socket.to(oldChannelId).emit('user_left_voice', {
      userId: socket.id,
      channelId: oldChannelId
    });

    io.emit('voice_state_update', {
      userId: socket.id,
      channelId: null,
      isMuted: user.isMuted,
      isDeafened: user.isDeafened
    });

    addAuditLog('SESTEN_AYRILDI', `${user.username} ses kanalindan ayrildi`, 'voice');
    updateUserConnectionLocation(socket.id, undefined, '#genel-sohbet');
    cleanupTemporaryChannels();
  });

  // Priority Speaker relay
  socket.on('priority_speaker_toggle', ({ active }: { active: boolean }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    io.emit('priority_speaker_active', { userId: socket.id, username: user.username, active });
  });

  // Webcam state update relay
  socket.on('webcam_state_update', ({ active }: { active: boolean }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    io.emit('user_webcam_update', { userId: socket.id, active });
  });

  // Whiteboard Canvas Relay (Scoped to user's active voice channel)
  socket.on('whiteboard_draw', (data: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !user.currentVoiceChannelId) return;
    socket.to(user.currentVoiceChannelId).emit('whiteboard_draw', data);
  });
  socket.on('whiteboard_clear', () => {
    const user = activeUsers.get(socket.id);
    if (!user || !user.currentVoiceChannelId) return;
    socket.to(user.currentVoiceChannelId).emit('whiteboard_clear');
  });

  // 1. Watch Together (YouTube Sineması - Scoped to active voice room)
  socket.on('watch_together_start', ({ channelId, videoId, title }: { channelId: string; videoId: string; title: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState: WatchTogetherState = {
      channelId,
      active: true,
      videoId,
      title: title || 'YouTube Video',
      isPlaying: true,
      currentTime: 0,
      startedBy: user.username
    };
    watchTogetherRooms.set(channelId, roomState);
    io.to(channelId).emit('watch_together_update', roomState);
    addAuditLog('WATCH_TOGETHER', `${user.username} ${channelId} odasinda YouTube sinemasi baslatti: "${title}"`);
  });

  socket.on('watch_together_action', ({ channelId, action, currentTime }: { channelId: string; action: 'play' | 'pause' | 'seek'; currentTime: number }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState = watchTogetherRooms.get(channelId);
    if (!roomState) return;
    if (action === 'play') roomState.isPlaying = true;
    if (action === 'pause') roomState.isPlaying = false;
    roomState.currentTime = currentTime;
    socket.to(channelId).emit('watch_together_sync', { action, currentTime, isPlaying: roomState.isPlaying });
  });

  socket.on('watch_together_stop', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    watchTogetherRooms.delete(channelId);
    io.to(channelId).emit('watch_together_ended');
  });

  socket.on('watch_together_get', ({ channelId }: { channelId: string }) => {
    const roomState = watchTogetherRooms.get(channelId);
    if (roomState) {
      socket.emit('watch_together_update', roomState);
    }
  });

  // 2. Mini Games (XOX & TypeRacer)
  socket.on('minigame_start', ({ channelId, game }: { channelId: string; game: 'xox' | 'typeracer' }) => {
    const user = activeUsers.get(socket.id);
    const state: MiniGameState = {
      channelId,
      game,
      board: Array(9).fill(null),
      turn: 'X',
      winner: null,
      players: { X: socket.id, O: '' },
      playerNames: { X: user?.username || 'Oyuncu 1', O: 'Bekleniyor...' }
    };
    miniGameRooms.set(channelId, state);
    io.to(channelId).emit('minigame_update', state);
  });

  socket.on('minigame_join', ({ channelId }: { channelId: string }) => {
    const state = miniGameRooms.get(channelId);
    const user = activeUsers.get(socket.id);
    if (state && !state.players?.O && state.players?.X !== socket.id) {
      state.players!.O = socket.id;
      state.playerNames!.O = user?.username || 'Oyuncu 2';
      io.to(channelId).emit('minigame_update', state);
    }
  });

  socket.on('minigame_move', ({ channelId, index }: { channelId: string; index: number }) => {
    const state = miniGameRooms.get(channelId);
    if (!state || state.winner || !state.board) return;
    const currentSymbol = state.turn || 'X';
    if (state.board[index] !== null) return;

    state.board[index] = currentSymbol;

    const lines = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];
    let won = false;
    for (const [a, b, c] of lines) {
      if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
        state.winner = currentSymbol;
        won = true;
        break;
      }
    }
    if (!won && state.board.every(cell => cell !== null)) {
      state.winner = 'draw';
    } else if (!won) {
      state.turn = currentSymbol === 'X' ? 'O' : 'X';
    }

    io.to(channelId).emit('minigame_update', state);
  });

  socket.on('minigame_reset', ({ channelId }: { channelId: string }) => {
    const state = miniGameRooms.get(channelId);
    if (!state) return;
    state.board = Array(9).fill(null);
    state.turn = 'X';
    state.winner = null;
    io.to(channelId).emit('minigame_update', state);
  });

  socket.on('minigame_stop', ({ channelId }: { channelId: string }) => {
    miniGameRooms.delete(channelId);
    io.to(channelId).emit('minigame_ended');
  });

  // 3. TeamSpeak Whisper (Fısıltı) Relay
  socket.on('whisper_send', ({ targetUserId, active }: { targetUserId: string; active: boolean }) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) return;
    io.to(targetUserId).emit('whisper_receive', {
      senderId: socket.id,
      senderUsername: sender.username,
      active
    });
  });

  // 4. Server Leaderboard Request
  socket.on('get_server_leaderboard', ({ serverId }: { serverId: string }) => {
    const sLevels = serverLevels[serverId] || {};
    const list = Object.values(sLevels).sort((a, b) => b.xp - a.xp).slice(0, 20);
    socket.emit('server_leaderboard_data', { serverId, list });
  });

  // 5. Server Analytics & Live Statistics
  socket.on('get_server_analytics', ({ serverId }: { serverId: string }) => {
    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;

    const totalMembers = targetServer.members?.length || 0;
    const onlineMembers = targetServer.members
      ? targetServer.members.filter(m => Array.from(activeUsers.values()).some(u => u.id === m.userId && u.status !== 'offline')).length
      : 0;

    let totalMessages = 0;
    const channelMessageCounts: { channelName: string; count: number }[] = [];
    (targetServer.channels || []).forEach(ch => {
      const count = (messages[ch.id] || []).length;
      totalMessages += count;
      if (ch.type === 'text') {
        channelMessageCounts.push({ channelName: `#${ch.name}`, count });
      }
    });

    const popularVoiceChannels: { channelName: string; userCount: number }[] = [];
    (targetServer.channels || []).filter(c => c.type === 'voice').forEach(ch => {
      const uCount = Array.from(activeUsers.values()).filter(u => u.currentVoiceChannelId === ch.id).length;
      popularVoiceChannels.push({ channelName: ch.name, userCount: uCount });
    });

    let totalVoiceMinutes = 0;
    const sLevels = serverLevels[serverId] || {};
    const tiers: Record<string, number> = { 'Bronz': 0, 'Gümüş': 0, 'Altın': 0, 'Elmas': 0, 'Efsane': 0 };
    Object.values(sLevels).forEach(m => {
      totalVoiceMinutes += m.voiceMinutes || 0;
      if (m.level >= 50) tiers['Efsane']++;
      else if (m.level >= 30) tiers['Elmas']++;
      else if (m.level >= 15) tiers['Altın']++;
      else if (m.level >= 5) tiers['Gümüş']++;
      else tiers['Bronz']++;
    });

    const tierDistribution = Object.entries(tiers).map(([tier, count]) => ({ tier, count }));

    const analyticsData: ServerAnalyticsData = {
      totalMembers,
      onlineMembers: Math.max(1, onlineMembers),
      totalMessages,
      totalVoiceMinutes,
      channelMessageCounts: channelMessageCounts.sort((a, b) => b.count - a.count).slice(0, 6),
      popularVoiceChannels: popularVoiceChannels.sort((a, b) => b.userCount - a.userCount).slice(0, 5),
      tierDistribution
    };

    socket.emit('server_analytics_data', { serverId, data: analyticsData });
  });

  // WebRTC Signaling Relay (Secured with Room & Call Isolation)
  socket.on('webrtc_signal', ({ targetUserId, signal, type }: { targetUserId: string; signal: any; type: 'offer' | 'answer' | 'candidate' }) => {
    const sender = activeUsers.get(socket.id);
    const target = activeUsers.get(targetUserId);
    if (!sender || !target) return;

    // Security Check: Sender and Target must be in the exact same voice room OR in an accepted direct call
    const inSameVoiceRoom = Boolean(sender.currentVoiceChannelId && sender.currentVoiceChannelId === target.currentVoiceChannelId);
    const inDirectCall = activeDirectCallPairs.get(socket.id) === targetUserId;

    if (!inSameVoiceRoom && !inDirectCall) {
      // Reject unauthorized signaling packet - strictly protects room privacy against eavesdropping
      return;
    }

    io.to(targetUserId).emit('webrtc_signal', {
      senderUserId: socket.id,
      signal,
      type
    });
  });

  // Speaking indicator
  socket.on('user_speaking', ({ isSpeaking }: { isSpeaking: boolean }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    user.isSpeaking = isSpeaking;
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('user_speaking_change', {
        userId: socket.id,
        isSpeaking
      });
    }
  });

  // Screen Share Status
  socket.on('screen_share_status', ({ isSharing, settings }: { isSharing: boolean; settings?: any }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    user.isScreenSharing = isSharing;
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('screen_share_change', {
        userId: socket.id,
        isSharing,
        settings: isSharing ? settings : undefined
      });
    }

    addAuditLog(
      isSharing ? 'EKRAN_YAYINI_BASLADI' : 'EKRAN_YAYINI_DURDU',
      `${user.username} ekran yayinini ${isSharing ? 'baslatti' : 'durdurdu'}.`,
      'voice'
    );
  });

  // User State Update (Mute, Deafen, Online Status - Username change is prohibited here to prevent spoofing)
  socket.on('update_user_state', ({ isMuted, isDeafened, status, avatar }: Partial<User>) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    if (isMuted !== undefined) user.isMuted = isMuted;
    if (isDeafened !== undefined) user.isDeafened = isDeafened;
    if (status !== undefined) user.status = status;
    if (avatar !== undefined) user.avatar = avatar;

    io.emit('user_updated', user);
  });

  // ================= ADMIN DASHBOARD EVENTS =================
  socket.on('admin_request_data', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') {
      return socket.emit('admin_error', 'Yetkisiz erişim! Bu işlem için Sistem Yöneticisi olmalısınız.');
    }

    socket.emit('admin_data_response', {
      stats: getSystemStats(),
      registeredUsers: Array.from(registeredAccounts.values()).map(acc => ({
        id: acc.id,
        username: acc.username,
        email: acc.email,
        role: acc.role,
        avatar: acc.avatar,
        status: Array.from(activeUsers.values()).some(u => u.username === acc.username) ? 'online' : 'offline',
        createdAt: acc.createdAt,
        walletBalance: acc.walletBalance ?? 0,
        isBanned: Boolean(acc.isBanned),
        bannedReason: acc.bannedReason || '',
        bannedUntil: acc.bannedUntil || null,
        twoFactorEnabled: Boolean(acc.twoFactorEnabled),
      })),
      servers,
      auditLogs,
      dedicatedServers: Array.from(dedicatedServersRegistry.values()),
      issuedLicenses: Array.from(issuedLicenses.values()),
      storeSettings,
      connectionLogs,
      systemConfig,
      bannedIps: bannedIps.filter((b) => !b.expiresAt || b.expiresAt > Date.now()),
      storageStats: getStorageStats(),
      pinnedBanner: systemConfig.pinnedBanner || null,
      activeSessions: Array.from(activeSessions.values()),
      scheduledBackups: listScheduledBackups(),
    });
  });

  // Admin: Update Runtime System Configuration
  socket.on('admin_update_system_config', (nextCfg: Partial<SystemConfig>) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    if (typeof nextCfg.registrationEnabled === 'boolean') systemConfig.registrationEnabled = nextCfg.registrationEnabled;
    if (typeof nextCfg.maintenanceMode === 'boolean') systemConfig.maintenanceMode = nextCfg.maintenanceMode;
    if (typeof nextCfg.maintenanceMessage === 'string') systemConfig.maintenanceMessage = sanitizeText(nextCfg.maintenanceMessage.trim()).slice(0, 240);
    if (typeof nextCfg.requireStrongPasswords === 'boolean') systemConfig.requireStrongPasswords = nextCfg.requireStrongPasswords;
    if (typeof nextCfg.maxMessageLength === 'number') systemConfig.maxMessageLength = Math.min(Math.max(nextCfg.maxMessageLength, 200), 8000);
    if (typeof nextCfg.defaultSlowmodeSeconds === 'number') systemConfig.defaultSlowmodeSeconds = Math.min(Math.max(nextCfg.defaultSlowmodeSeconds, 0), 120);
    if (typeof nextCfg.maxUploadSizeMb === 'number') systemConfig.maxUploadSizeMb = Math.min(Math.max(nextCfg.maxUploadSizeMb, 1), 25);
    if (typeof nextCfg.maxLoginAttempts === 'number') systemConfig.maxLoginAttempts = Math.min(Math.max(nextCfg.maxLoginAttempts, 3), 20);
    if (typeof nextCfg.loginLockoutMinutes === 'number') systemConfig.loginLockoutMinutes = Math.min(Math.max(nextCfg.loginLockoutMinutes, 1), 120);
    if (typeof nextCfg.globalBlockLinks === 'boolean') systemConfig.globalBlockLinks = nextCfg.globalBlockLinks;
    if (Array.isArray(nextCfg.globalBannedWords)) {
      systemConfig.globalBannedWords = nextCfg.globalBannedWords
        .map((w) => sanitizeText(String(w).trim()).toLowerCase())
        .filter(Boolean)
        .slice(0, 100);
    }
    if (typeof nextCfg.autoBackupEnabled === 'boolean') systemConfig.autoBackupEnabled = nextCfg.autoBackupEnabled;
    if (typeof nextCfg.autoBackupIntervalHours === 'number') systemConfig.autoBackupIntervalHours = Math.min(Math.max(nextCfg.autoBackupIntervalHours, 1), 168);
    if (typeof nextCfg.maxBackupsToKeep === 'number') systemConfig.maxBackupsToKeep = Math.min(Math.max(nextCfg.maxBackupsToKeep, 1), 50);
    if (typeof nextCfg.webhookUrl === 'string') systemConfig.webhookUrl = nextCfg.webhookUrl.trim().slice(0, 500);
    if (nextCfg.webhookEvents && typeof nextCfg.webhookEvents === 'object') {
      systemConfig.webhookEvents = {
        security: Boolean(nextCfg.webhookEvents.security),
        bans: Boolean(nextCfg.webhookEvents.bans),
        dedicated: Boolean(nextCfg.webhookEvents.dedicated),
        backups: Boolean(nextCfg.webhookEvents.backups),
      };
    }

    saveSystemConfig(systemConfig);
    io.emit('system_maintenance_status', {
      active: Boolean(systemConfig.maintenanceMode),
      message: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır.'
    });
    addAuditLog('SISTEM_AYARLARI_GUNCELLENDI', `${requester.username} sistem yapılandırmasını güncelledi.${systemConfig.maintenanceMode ? ' [BAKIM MODU AKTİF]' : ''}`, systemConfig.maintenanceMode ? 'warn' : 'info');
    socket.emit('admin_feedback', { type: 'success', message: 'Sistem yapılandırması başarıyla kaydedildi.' });
    socket.emit('admin_action_success', 'Sistem yapılandırması başarıyla kaydedildi.');
    io.emit('audit_log_added', auditLogs[0]);
  });

  // Admin: Clear connection logs
  socket.on('admin_clear_connection_logs', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    connectionLogs.length = 0;
    saveConnectionLogs(connectionLogs);
    addAuditLog('BAGLANTI_LOGLARI_TEMIZLENDI', `${requester.username} bağlantı ve IP geçmişini temizledi.`, 'warn');
    socket.emit('admin_action_success', 'Bağlantı ve IP kayıtları temizlendi.');
  });

  // Admin: Clear audit logs
  socket.on('admin_clear_audit_logs', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    auditLogs.length = 0;
    saveAuditLogs(auditLogs);
    addAuditLog('DENETIM_GUNLUGU_TEMIZLENDI', `${requester.username} denetim günlüklerini temizledi.`, 'warn');
    socket.emit('admin_action_success', 'Denetim günlükleri temizlendi.');
  });

  // Admin: Update user wallet balance
  socket.on('admin_update_wallet', ({ targetUsername, amount, mode }: { targetUsername: string; amount: number; mode?: 'set' | 'add' }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get((targetUsername || '').toLowerCase());
    if (!acc) {
      return socket.emit('admin_action_error', 'Hedef kullanıcı hesabı bulunamadı.');
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount)) {
      return socket.emit('admin_action_error', 'Geçerli bir tutar giriniz.');
    }

    const nextBalance = mode === 'add'
      ? Math.max(0, Math.round((acc.walletBalance || 0) + numAmount))
      : Math.max(0, Math.round(numAmount));

    acc.walletBalance = nextBalance;
    saveAccounts(registeredAccounts);

    for (const [sockId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) {
        u.walletBalance = nextBalance;
        io.to(sockId).emit('user_updated', u);
      }
    }

    addAuditLog('BAKIYE_GUNCELLEME', `${requester.username}, "${acc.username}" kullanıcısının cüzdan bakiyesini ₺${nextBalance} olarak güncelledi.`, 'info');
    socket.emit('admin_action_success', `"${acc.username}" bakiyesi ₺${nextBalance} olarak güncellendi.`);
  });

  // Admin: Ban user account (supports permanent or temporary durationMinutes)
  socket.on('admin_ban_user', ({ targetUsername, reason, durationMinutes }: { targetUsername: string; reason?: string; durationMinutes?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get((targetUsername || '').toLowerCase());
    if (!acc) {
      return socket.emit('admin_action_error', 'Hedef kullanıcı hesabı bulunamadı.');
    }
    if (acc.username.toLowerCase() === requester.username.toLowerCase()) {
      return socket.emit('admin_action_error', 'Kendi yönetici hesabınızı yasaklayamazsınız.');
    }

    const cleanReason = sanitizeText((reason || 'Yönetici tarafından sistemden yasaklandı.').trim()).slice(0, 160);
    const mins = typeof durationMinutes === 'number' && durationMinutes > 0 ? Math.min(durationMinutes, 525600) : 0;
    acc.isBanned = true;
    acc.bannedReason = cleanReason;
    acc.bannedUntil = mins > 0 ? Date.now() + mins * 60 * 1000 : null;
    saveAccounts(registeredAccounts);

    for (const [sockId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) {
        io.to(sockId).emit('kicked_by_admin', { reason: `Hesabınız yasaklandı${mins > 0 ? ` (${mins} dk)` : ''}: ${cleanReason}` });
        const targetSock = io.sockets.sockets.get(sockId);
        if (targetSock) targetSock.disconnect(true);
      }
    }

    addAuditLog('KULLANICI_YASAKLANDI', `${requester.username}, "${acc.username}" hesabını ${mins > 0 ? `${mins} dk süreli` : 'kalıcı'} yasakladı. Sebep: ${cleanReason}`, 'warn');
    sendAdminWebhook('bans', 'Kullanıcı Yasaklandı', `Yetkili: ${requester.username} | Hedef: ${acc.username} | Süre: ${mins > 0 ? `${mins} dk` : 'Kalıcı'} | Sebep: ${cleanReason}`);
    socket.emit('admin_action_success', `"${acc.username}" hesabı ${mins > 0 ? `${mins} dakika süreli` : 'kalıcı'} yasaklandı.`);
  });

  // Admin: Unban user account
  socket.on('admin_unban_user', ({ targetUsername }: { targetUsername: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get((targetUsername || '').toLowerCase());
    if (!acc) {
      return socket.emit('admin_action_error', 'Hedef kullanıcı hesabı bulunamadı.');
    }

    acc.isBanned = false;
    acc.bannedReason = '';
    acc.bannedUntil = null;
    saveAccounts(registeredAccounts);

    addAuditLog('YASAK_KALDIRILDI', `${requester.username}, "${acc.username}" hesabının yasağını kaldırdı.`, 'info');
    socket.emit('admin_action_success', `"${acc.username}" hesabının yasağı kaldırıldı.`);
  });

  // Admin: Reset user 2FA
  socket.on('admin_reset_user_2fa', ({ targetUsername }: { targetUsername: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get((targetUsername || '').toLowerCase());
    if (!acc) {
      return socket.emit('admin_action_error', 'Hedef kullanıcı hesabı bulunamadı.');
    }
    acc.twoFactorEnabled = false;
    acc.twoFactorSecret = undefined;
    acc.pendingTwoFactorSecret = undefined;
    acc.twoFactorBackupCodes = undefined;
    saveAccounts(registeredAccounts);

    addAuditLog('2FA_SIFIRLANDI', `${requester.username}, "${acc.username}" kullanıcısının 2FA korumasını sıfırladı.`, 'warn');
    socket.emit('admin_action_success', `"${acc.username}" kullanıcısının 2FA koruması sıfırlandı.`);
  });

  // Admin: Ban IP address
  socket.on('admin_ban_ip', ({ ip, reason, durationMinutes }: { ip: string; reason?: string; durationMinutes?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const cleanIp = (ip || '').trim().slice(0, 64);
    if (!cleanIp) return socket.emit('admin_action_error', 'Geçerli bir IP adresi girin.');
    if (cleanIp === getClientIp(socket)) {
      return socket.emit('admin_action_error', 'Kendi aktif IP adresinizi engelleyemezsiniz.');
    }

    const cleanReason = sanitizeText((reason || 'Yönetici tarafından engellendi.').trim()).slice(0, 160);
    const mins = typeof durationMinutes === 'number' && durationMinutes > 0 ? Math.min(durationMinutes, 525600) : 0;
    const record: BannedIpRecord = {
      ip: cleanIp,
      reason: cleanReason,
      bannedBy: requester.username,
      bannedAt: new Date().toISOString(),
      expiresAt: mins > 0 ? Date.now() + mins * 60 * 1000 : null,
    };
    bannedIps = [record, ...bannedIps.filter((b) => b.ip !== cleanIp)];
    saveBannedIps(bannedIps);

    for (const [sockId] of activeUsers.entries()) {
      const targetSock = io.sockets.sockets.get(sockId);
      if (targetSock && getClientIp(targetSock) === cleanIp) {
        targetSock.emit('kicked_by_admin', { reason: `IP adresiniz (${cleanIp}) engellendi: ${cleanReason}` });
        targetSock.disconnect(true);
      }
    }

    addAuditLog('IP_ENGELLENDI', `${requester.username}, ${cleanIp} IP adresini engelledi. Sebep: ${cleanReason}`, 'warn');
    sendAdminWebhook('bans', 'IP Adresi Engellendi', `Yetkili: ${requester.username} | IP: ${cleanIp} | Sebep: ${cleanReason}`);
    socket.emit('admin_action_success', `${cleanIp} IP adresi engellendi.`);
  });

  // Admin: Unban IP address
  socket.on('admin_unban_ip', ({ ip }: { ip: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const cleanIp = (ip || '').trim();
    bannedIps = bannedIps.filter((b) => b.ip !== cleanIp);
    saveBannedIps(bannedIps);
    addAuditLog('IP_ENGELI_KALDIRILDI', `${requester.username}, ${cleanIp} IP engelini kaldırdı.`, 'info');
    socket.emit('admin_action_success', `${cleanIp} IP engeli kaldırıldı.`);
  });

  // Admin: Full Backup Export
  socket.on('admin_export_full_backup', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const bundle = exportAllDataBundle();
    addAuditLog('TAM_YEDEK_ALINDI', `${requester.username} tam sistem yedeğini dışa aktardı.`, 'info');
    socket.emit('admin_full_backup_response', bundle);
  });

  // Admin: Full Backup Restore
  socket.on('admin_restore_full_backup', (bundle: any) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    try {
      const restoredFiles = importAllDataBundle(bundle);
      // Reload runtime config & banned IPs immediately; full reload notice for heavy collections
      systemConfig = loadSystemConfig(defaultSystemConfig);
      bannedIps = loadBannedIps();
      addAuditLog('YEDEK_GERI_YUKLENDI', `${requester.username} sistem yedeğini geri yükledi (${restoredFiles.length} dosya).`, 'warn');
      socket.emit('admin_action_success', `${restoredFiles.length} veri dosyası geri yüklendi. Tüm verilerin tam etkinleşmesi için sunucuyu yeniden başlatmanız önerilir.`);
    } catch (err: any) {
      socket.emit('admin_action_error', err?.message || 'Yedek geri yüklenemedi.');
    }
  });

  // Admin: Trigger Scheduled Backup Now
  socket.on('admin_trigger_backup_now', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    try {
      const info = createScheduledBackup(systemConfig.maxBackupsToKeep || 7);
      addAuditLog('MANUEL_YEDEK_ALINDI', `${requester.username} sunucu yedeği oluşturdu: ${info.filename}`, 'info');
      sendAdminWebhook('backups', 'Manuel Sunucu Yedeği Oluşturuldu', `Yetkili: ${requester.username} | Dosya: ${info.filename}`);
      socket.emit('admin_action_success', `Sunucu yedeği oluşturuldu: ${info.filename}`);
    } catch (err: any) {
      socket.emit('admin_action_error', err?.message || 'Yedek oluşturulamadı.');
    }
  });

  // Admin: Restore Scheduled Backup
  socket.on('admin_restore_scheduled_backup', ({ filename }: { filename: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    try {
      const bundle = readScheduledBackup(filename);
      const restoredFiles = importAllDataBundle(bundle);
      systemConfig = loadSystemConfig(defaultSystemConfig);
      bannedIps = loadBannedIps();
      addAuditLog('YEDEK_GERI_YUKLENDI', `${requester.username}, "${filename}" yedeğini geri yükledi (${restoredFiles.length} dosya).`, 'warn');
      socket.emit('admin_action_success', `"${filename}" yedeği geri yüklendi (${restoredFiles.length} dosya).`);
    } catch (err: any) {
      socket.emit('admin_action_error', err?.message || 'Yedek geri yüklenemedi.');
    }
  });

  // Admin: Delete Scheduled Backup
  socket.on('admin_delete_scheduled_backup', ({ filename }: { filename: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    if (deleteScheduledBackup(filename)) {
      addAuditLog('YEDEK_SILINDI', `${requester.username}, "${filename}" yedeğini sildi.`, 'info');
      socket.emit('admin_action_success', `"${filename}" yedeği silindi.`);
    } else {
      socket.emit('admin_action_error', 'Yedek dosyası bulunamadı.');
    }
  });

  // Admin: Test Webhook
  socket.on('admin_test_webhook', async () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const ok = await sendAdminWebhook('test', 'Webhook Bağlantı Testi', `Yetkili ${requester.username} tarafından test bildirimi gönderildi.`);
    if (ok) {
      socket.emit('admin_action_success', 'Test webhook bildirimi başarıyla gönderildi.');
    } else {
      socket.emit('admin_action_error', 'Webhook gönderilemedi! URL adresini kontrol edin.');
    }
  });

  // Admin: Bulk Purge Channel Messages
  socket.on('admin_purge_messages', ({ channelId, mode, count }: { channelId: string; mode: 'last_n' | 'all'; count?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    if (!channelId || !messages[channelId]) {
      return socket.emit('admin_action_error', 'Kanalda temizlenecek mesaj bulunamadı.');
    }
    const totalBefore = messages[channelId].length;
    if (mode === 'all') {
      messages[channelId] = [];
    } else {
      const n = Math.min(Math.max(Number(count) || 50, 1), 1000);
      messages[channelId] = messages[channelId].slice(0, Math.max(0, totalBefore - n));
    }
    const deletedCount = totalBefore - messages[channelId].length;
    saveMessages(messages);
    io.emit('channel_messages_purged', { channelId, remainingMessages: messages[channelId] });
    addAuditLog('MESAJ_TEMIZLENDI', `${requester.username}, #${channelId} kanalından ${deletedCount} mesaj temizledi.`, 'warn');
    socket.emit('admin_action_success', `${deletedCount} mesaj başarıyla temizlendi.`);
  });

  // Admin: Reset user password
  socket.on('admin_reset_user_password', ({ targetUsername, newPassword }: { targetUsername: string; newPassword: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get((targetUsername || '').toLowerCase());
    if (!acc) {
      return socket.emit('admin_action_error', 'Hedef kullanıcı hesabı bulunamadı.');
    }
    if (!newPassword || newPassword.length < 6) {
      return socket.emit('admin_action_error', 'Yeni şifre en az 6 karakter olmalıdır.');
    }

    acc.password = hashPassword(newPassword);
    saveAccounts(registeredAccounts);

    addAuditLog('SIFRE_SIFIRLANDI', `${requester.username}, "${acc.username}" kullanıcısının şifresini sıfırladı.`, 'auth');
    socket.emit('admin_action_success', `"${acc.username}" kullanıcısının şifresi sıfırlandı.`);
  });

  // Admin: Create channel in any server
  socket.on('admin_create_channel', ({ serverId, name, type }: { serverId: string; name: string; type: 'text' | 'voice' }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const srv = servers.find(s => s.id === serverId);
    if (!srv) {
      return socket.emit('admin_action_error', 'Hedef sunucu bulunamadı.');
    }
    const cleanName = sanitizeText((name || '').trim()).slice(0, 40);
    if (!cleanName) {
      return socket.emit('admin_action_error', 'Kanal adı boş olamaz.');
    }

    const newChannel: Channel = {
      id: `ch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      type: type === 'voice' ? 'voice' : 'text',
      serverId: srv.id,
    };
    srv.channels.push(newChannel);
    saveServers(servers);
    io.emit('server_updated', srv);
    addAuditLog('KANAL_OLUSTURULDU', `${requester.username}, "${srv.name}" sunucusunda #${cleanName} kanalını oluşturdu.`, 'info');
    socket.emit('admin_action_success', `"${srv.name}" içinde #${cleanName} kanalı oluşturuldu.`);
  });

  // Admin: Delete entire server (except default-server)
  socket.on('admin_delete_server', ({ serverId }: { serverId: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    if (serverId === 'default-server' || serverId === 'direct-messages') {
      return socket.emit('admin_action_error', 'Ana topluluk sunucusu silinemez.');
    }

    const idx = servers.findIndex(s => s.id === serverId);
    if (idx === -1) {
      return socket.emit('admin_action_error', 'Sunucu bulunamadı.');
    }

    const [removed] = servers.splice(idx, 1);
    saveServers(servers);
    io.emit('server_deleted', serverId);
    addAuditLog('SUNUCU_SILINDI', `${requester.username}, "${removed.name}" sunucusunu sildi.`, 'warn');
    socket.emit('admin_action_success', `"${removed.name}" sunucusu silindi.`);
  });

  // Admin: Change user role
  socket.on('admin_change_role', ({ targetUsername, newRole }: { targetUsername: string; newRole: 'admin' | 'user' }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get(targetUsername.toLowerCase());
    if (acc) {
      acc.role = newRole;
      saveAccounts(registeredAccounts);
      addAuditLog('YETKI_DEGISTIRILDI', `${targetUsername} kullanicisinin rolu [${newRole}] yapildi (Yetkili: ${requester.username})`, 'warn');

      // Update online user if active
      for (const u of activeUsers.values()) {
        if (u.username.toLowerCase() === targetUsername.toLowerCase()) {
          u.role = newRole;
          io.emit('user_updated', u);
          break;
        }
      }

      socket.emit('admin_action_success', `Kullanıcı rolü "${newRole}" olarak güncellendi.`);
    }
  });

  // Admin: Kick user
  socket.on('admin_kick_user', ({ targetSocketId, reason }: { targetSocketId: string; reason?: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const targetUser = activeUsers.get(targetSocketId);
    if (targetUser) {
      addAuditLog('KULLANICI_ATILDI', `${targetUser.username} sunucudan atildi. Sebep: ${reason || 'Belirtilmedi'} (Yetkili: ${requester.username})`, 'warn');
      io.to(targetSocketId).emit('kicked_by_admin', { reason: reason || 'Yönetici tarafından sunucudan atıldınız.' });
      const targetSock = io.sockets.sockets.get(targetSocketId);
      if (targetSock) {
        targetSock.disconnect(true);
      }
      activeUsers.delete(targetSocketId);
      io.emit('user_disconnected', targetSocketId);
      socket.emit('admin_action_success', `${targetUser.username} başarıyla atıldı.`);
    }
  });

  // Admin: Delete Channel
  socket.on('admin_delete_channel', ({ serverId, channelId }: { serverId: string; channelId: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;

    const chIndex = targetServer.channels.findIndex(c => c.id === channelId);
    if (chIndex !== -1) {
      const removedCh = targetServer.channels.splice(chIndex, 1)[0];
      saveServers(servers);
      addAuditLog('KANAL_SILINDI', `${targetServer.name} sunucusundan #${removedCh.name} kanali silindi.`, 'warn');
      io.emit('channel_deleted', { serverId, channelId });
      socket.emit('admin_action_success', 'Kanal başarıyla silindi.');
    }
  });

  // Admin: System Broadcast Announcement (supports targeted & pinned banner)
  socket.on('admin_broadcast_announcement', ({ message, target = 'all', serverId, pinBanner = false }: { message: string; target?: 'all' | 'admins' | 'server'; serverId?: string; pinBanner?: boolean }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const cleanMsg = sanitizeText((message || '').trim()).slice(0, 500);
    if (!cleanMsg) return;

    const payload = {
      sender: requester.username,
      message: cleanMsg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (pinBanner) {
      systemConfig.pinnedBanner = {
        message: cleanMsg,
        sender: requester.username,
        updatedAt: new Date().toISOString(),
      };
      saveSystemConfig(systemConfig);
      io.emit('pinned_banner_updated', systemConfig.pinnedBanner);
    }

    if (target === 'admins') {
      io.to('admins').emit('system_announcement', payload);
      addAuditLog('SISTEM_DUYURUSU', `Yöneticilere özel duyuru yapıldı: "${cleanMsg}" (Yetkili: ${requester.username})`, 'warn');
    } else if (target === 'server' && serverId) {
      const srv = servers.find((s) => s.id === serverId);
      const memberSet = new Set((srv?.members || []).map((m) => m.username.toLowerCase()));
      for (const [sockId, u] of activeUsers.entries()) {
        if (memberSet.has(u.username.toLowerCase())) {
          io.to(sockId).emit('system_announcement', payload);
        }
      }
      addAuditLog('SISTEM_DUYURUSU', `"${srv?.name || serverId}" sunucusuna duyuru yapıldı: "${cleanMsg}" (Yetkili: ${requester.username})`, 'warn');
    } else {
      io.emit('system_announcement', payload);
      addAuditLog('SISTEM_DUYURUSU', `Genel duyuru yapıldı: "${cleanMsg}" (Yetkili: ${requester.username})`, 'warn');
    }
    socket.emit('admin_action_success', pinBanner ? 'Duyuru yayınlandı ve üst banner olarak sabitlendi.' : 'Duyuru başarıyla yayınlandı.');
  });

  // Admin: Clear Pinned Banner
  socket.on('admin_clear_pinned_banner', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    systemConfig.pinnedBanner = null;
    saveSystemConfig(systemConfig);
    io.emit('pinned_banner_updated', null);
    addAuditLog('SABIT_BANNER_KALDIRILDI', `${requester.username} sabit duyuru bannerını kaldırdı.`, 'info');
    socket.emit('admin_action_success', 'Sabit duyuru bannerı kaldırıldı.');
  });

  // Admin: Generate Dedicated Server Cryptographic License (Assigned to registered user)
  socket.on('admin_generate_license', ({ licensee, maxSlots, expireDays, tier, assignedUsername }: any) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const cleanLicensee = (licensee || 'Ozel Musteri').trim();
    const slots = Number(maxSlots) || 64;
    const days = Number(expireDays) || 365;
    const selectedTier = tier || 'Pro';
    const targetUsername = assignedUsername?.trim() || requester.username;

    const licenseKey = generateLicenseKey(cleanLicensee, slots, days, selectedTier);

    const expiresAt = days === -1
      ? 'lifetime'
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const newLicense: IssuedLicense = {
      id: `lic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      licenseKey,
      licensee: cleanLicensee,
      assignedUsername: targetUsername,
      maxSlots: slots,
      tier: selectedTier,
      status: 'active',
      issuedAt: new Date().toISOString(),
      expiresAt,
      source: 'admin'
    };

    issuedLicenses.set(newLicense.id, newLicense);
    saveLicenses(issuedLicenses);

    addAuditLog('LISANS_URETILDI', `Musteri: ${cleanLicensee} | Atanan Kullanici: ${targetUsername} | Slot: ${slots} (${selectedTier}) (Yetkili: ${requester.username})`, 'warn');

    socket.emit('admin_license_generated', newLicense);
    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  });

  // Admin: Revoke License (İptal Et)
  socket.on('admin_revoke_license', ({ licenseId, reason }: any) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const lic = issuedLicenses.get(licenseId);
    if (lic) {
      lic.status = 'revoked';
      saveLicenses(issuedLicenses);
      addAuditLog('LISANS_IPTAL_EDILDI', `Lisans iptal edildi: "${lic.licensee}" (${lic.assignedUsername}) - Sebep: ${reason || 'Yönetici kararı'}`, 'warn');
      io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
      socket.emit('admin_action_success', `"${lic.licensee}" lisansı iptal edildi.`);

      // Broadcast to user's my_licenses as well
      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === lic.assignedUsername.toLowerCase()) {
          const userLicenses = Array.from(issuedLicenses.values()).filter(
            l => l.assignedUsername.toLowerCase() === u.username.toLowerCase()
          );
          io.to(sId).emit('my_licenses_response', userLicenses);
        }
      }

      // Active Dedicated Server termination: update registry & send instant shutdown webhook to all candidate hosts
      for (const s of dedicatedServersRegistry.values()) {
        if (s.licenseKey === lic.licenseKey || s.licensee.toLowerCase() === lic.licensee.toLowerCase()) {
          s.status = 'revoked';
          io.to('admins').emit('admin_dedicated_updated', s);

          const hostsToTry = [
            s.host,
            s.host.replace('localhost', '127.0.0.1'),
            `127.0.0.1:${s.port || 4001}`,
            `localhost:${s.port || 4001}`
          ];
          for (const h of hostsToTry) {
            try {
              fetch(`http://${h}/api/license/revoked`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'Sistem yöneticisi tarafından lisans feshedildi.' })
              }).catch(() => {});
            } catch {}
          }
        }
      }

      // Direct fallback to port 4001 and localhost:4001 in case server was not in registry
      const directFallbacks = ['http://127.0.0.1:4001/api/license/revoked', 'http://localhost:4001/api/license/revoked'];
      for (const endpoint of directFallbacks) {
        try {
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || 'Sistem yöneticisi tarafından lisans feshedildi.' })
          }).catch(() => {});
        } catch {}
      }

      // Broadcast termination event to all connected sockets
      io.emit('dedicated_server_terminated', {
        title: 'Sunucu Lisansı İptal Edildi',
        reason: reason || 'Sistem yöneticisi bu özel sunucunun lisansını feshetti.',
        action: 'disconnect'
      });
    }
  });

  // Admin: Extend License (Lisans Süresini Uzat / Tarih Ekle)
  socket.on('admin_extend_license', ({ licenseId, addDays }: { licenseId: string; addDays: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const lic = issuedLicenses.get(licenseId);
    if (!lic) return;

    const rawDays = Number(addDays);
    const allowedDays = [30, 90, 180, 365, -1];
    if (!Number.isFinite(rawDays) || (!allowedDays.includes(rawDays) && rawDays < 1)) {
      return socket.emit('admin_error', 'Geçersiz süre uzatma değeri.');
    }
    const days = rawDays === -1 ? -1 : Math.floor(rawDays);
    let newExpiresAt: string;

    if (days === -1) {
      newExpiresAt = 'lifetime';
    } else {
      const currentExpiry = (lic.expiresAt === 'lifetime' || lic.expiresAt.startsWith('2099'))
        ? Date.now()
        : new Date(lic.expiresAt).getTime();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Cryptographically re-sign with updated date
    const newLicenseKey = generateLicenseKey(lic.licensee, lic.maxSlots, newExpiresAt, lic.tier);
    lic.licenseKey = newLicenseKey;
    lic.expiresAt = newExpiresAt;
    if (lic.status === 'expired') {
      lic.status = 'active';
    }
    saveLicenses(issuedLicenses);

    addAuditLog(
      'LISANS_UZATILDI',
      `"${lic.licensee}" (${lic.assignedUsername}) lisansı ${days === -1 ? 'Ömür Boyu (Lifetime)' : '+' + days + ' gün'} uzatıldı. Yeni Bitiş: ${newExpiresAt === 'lifetime' ? 'Ömür Boyu' : new Date(newExpiresAt).toLocaleDateString('tr-TR')} (Yetkili: ${requester.username})`,
      'info'
    );

    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
    socket.emit('admin_action_success', `"${lic.licensee}" lisansı başarıyla ${days === -1 ? 'Ömür Boyu yapıldı' : days + ' gün uzatıldı'}.`);

    // Sync to user if online
    for (const [sId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === lic.assignedUsername.toLowerCase()) {
        const userLics = Array.from(issuedLicenses.values()).filter(l => l.assignedUsername.toLowerCase() === u.username.toLowerCase());
        io.to(sId).emit('my_licenses_response', userLics);
      }
    }
  });

  // Admin: Re-activate License (Yeniden Aktifleştir)
  socket.on('admin_activate_license', ({ licenseId }: any) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const lic = issuedLicenses.get(licenseId);
    if (lic) {
      lic.status = 'active';
      saveLicenses(issuedLicenses);
      addAuditLog('LISANS_AKTIFLESTIRILDI', `Lisans yeniden aktifleştirildi: "${lic.licensee}"`, 'info');
      io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
      socket.emit('admin_action_success', `"${lic.licensee}" lisansı aktif duruma getirildi.`);
    }
  });

  // Admin: Store Settings & Pricing Management (Mağaza Ayarları & Fiyatlandırma)
  socket.on('admin_update_store_settings', (newSettings: StoreSettings) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') {
      socket.emit('admin_action_error', 'Mağaza ayarlarını güncellemek için yönetici yetkisi gereklidir.');
      return;
    }

    if (!newSettings || typeof newSettings !== 'object') return;

    storeSettings.isOpen = Boolean(newSettings.isOpen);
    storeSettings.closedReason = typeof newSettings.closedReason === 'string' ? newSettings.closedReason.trim() : '';
    storeSettings.currencySymbol = newSettings.currencySymbol || '₺';
    storeSettings.customSlotUnitPrice = Math.max(1, Number(newSettings.customSlotUnitPrice) || 4);
    storeSettings.discountPercentage = Math.min(90, Math.max(0, Number(newSettings.discountPercentage) || 0));
    storeSettings.campaignBanner = typeof newSettings.campaignBanner === 'string' ? newSettings.campaignBanner.trim() : '';
    if (newSettings.durationMultipliers && typeof newSettings.durationMultipliers === 'object') {
      storeSettings.durationMultipliers = {
        days90: Math.min(20, Math.max(1, Number(newSettings.durationMultipliers.days90) || 2.5)),
        days180: Math.min(30, Math.max(1, Number(newSettings.durationMultipliers.days180) || 4.5)),
        days365: Math.min(50, Math.max(1, Number(newSettings.durationMultipliers.days365) || 8)),
        lifetime: Math.min(100, Math.max(1, Number(newSettings.durationMultipliers.lifetime) || 12)),
      };
    }
    if (typeof newSettings.allowCustomSlots === 'boolean') storeSettings.allowCustomSlots = newSettings.allowCustomSlots;
    if (typeof newSettings.minCustomSlots === 'number') storeSettings.minCustomSlots = Math.min(100, Math.max(2, Math.floor(newSettings.minCustomSlots)));
    if (typeof newSettings.maxCustomSlots === 'number') storeSettings.maxCustomSlots = Math.min(500, Math.max(16, Math.floor(newSettings.maxCustomSlots)));
    if (typeof newSettings.allowLifetimePurchase === 'boolean') storeSettings.allowLifetimePurchase = newSettings.allowLifetimePurchase;
    if (typeof newSettings.renewalDiscountPercentage === 'number') storeSettings.renewalDiscountPercentage = Math.min(75, Math.max(0, Number(newSettings.renewalDiscountPercentage) || 0));

    if (newSettings.packages) {
      storeSettings.packages = {
        starter: { ...storeSettings.packages.starter, ...newSettings.packages.starter },
        pro: { ...storeSettings.packages.pro, ...newSettings.packages.pro },
        enterprise: { ...storeSettings.packages.enterprise, ...newSettings.packages.enterprise },
      };
    }

    if (Array.isArray(newSettings.paymentMethods)) {
      storeSettings.paymentMethods = newSettings.paymentMethods.map((m) => ({
        id: m.id,
        name: (m.name || '').trim() || m.id,
        enabled: Boolean(m.enabled),
        icon: m.icon || 'Wallet',
        description: (m.description || '').trim(),
      }));
    }

    saveStoreSettings(storeSettings);
    addAuditLog(
      'MAGAZA_AYARLARI_GUNCEL',
      `Mağaza ayarları güncellendi. Satış: ${storeSettings.isOpen ? 'AÇIK' : 'KAPALI (BAKIM)'} | İndirim: %${storeSettings.discountPercentage}`,
      'info'
    );

    io.emit('store_settings_updated', storeSettings);
    io.emit('store_settings_response', storeSettings);
    socket.emit('admin_action_success', 'Mağaza ayarları ve ödeme yöntemleri başarıyla kaydedildi.');
  });

  // ================= STORE & USER LICENSE EVENTS =================

  // Get Store Settings
  socket.on('get_store_settings', () => {
    socket.emit('store_settings_response', storeSettings);
  });

  // Public Explore: List Online Dedicated Servers (without exposing license keys)
  socket.on('get_public_dedicated_servers', () => {
    const publicList = Array.from(dedicatedServersRegistry.values())
      .filter(s => s.status === 'online')
      .map(s => ({
        id: s.id,
        serverName: s.serverName,
        host: s.host,
        port: s.port,
        onlineCount: s.onlineCount,
        maxSlots: s.maxSlots,
        tier: s.tier,
        status: s.status
      }));
    socket.emit('public_dedicated_servers_list', publicList);
  });

  // Store: Lisans Satın Alma (Dinamik Fiyat, Kampanya & Çoklu Ödeme Yöntemi)
  socket.on('store_purchase_license', ({ serverName, maxSlots, expireDays, tier, paymentMethod }: any) => {
    const user = activeUsers.get(socket.id);
    if (!user) {
      return socket.emit('store_purchase_response', { success: false, error: 'Satın almak için oturum açmalısınız.' });
    }

    if (!storeSettings.isOpen) {
      return socket.emit('store_purchase_response', {
        success: false,
        error: storeSettings.closedReason || 'Mağazamız şu anda satışa kapalıdır. Lütfen daha sonra tekrar deneyiniz.'
      });
    }

    const selectedMethod = (paymentMethod || 'wallet') as 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
    const methodConfig = storeSettings.paymentMethods.find(m => m.id === selectedMethod);
    if (!methodConfig || !methodConfig.enabled) {
      return socket.emit('store_purchase_response', {
        success: false,
        error: 'Seçilen ödeme yöntemi şu anda aktif değildir.'
      });
    }

    const rawSlots = Number(maxSlots);
    const slots = Number.isFinite(rawSlots) ? Math.max(2, Math.min(500, Math.floor(rawSlots))) : 16;
    const rawDays = Number(expireDays);
    const allowedDays = [30, 90, 180, 365, -1];
    const days = allowedDays.includes(rawDays) ? rawDays : (Number.isFinite(rawDays) && rawDays >= 1 ? Math.floor(rawDays) : 30);
    const selectedTier = (tier as 'Starter' | 'Pro' | 'Enterprise') || 'Starter';
    const cleanName = sanitizeText((serverName || `${user.username} Sunucusu`).trim()).slice(0, 64);

    // Dynamic Price calculation based on storeSettings
    let basePrice = 99;
    if (selectedTier === 'Starter') {
      if (storeSettings.packages.starter.enabled === false) {
        return socket.emit('store_purchase_response', { success: false, error: 'Starter paketi şu anda satışa kapalıdır.' });
      }
      basePrice = storeSettings.packages.starter.price;
    } else if (selectedTier === 'Pro') {
      if (storeSettings.packages.pro.enabled === false) {
        return socket.emit('store_purchase_response', { success: false, error: 'Pro paketi şu anda satışa kapalıdır.' });
      }
      basePrice = storeSettings.packages.pro.price;
    } else if (selectedTier === 'Enterprise') {
      if (storeSettings.packages.enterprise.enabled === false) {
        return socket.emit('store_purchase_response', { success: false, error: 'Enterprise paketi şu anda satışa kapalıdır.' });
      }
      basePrice = storeSettings.packages.enterprise.price;
    } else {
      basePrice = slots * (storeSettings.customSlotUnitPrice || 4);
    }

    if (days === -1 && storeSettings.allowLifetimePurchase === false) {
      return socket.emit('store_purchase_response', { success: false, error: 'Ömür boyu lisans satışı şu anda devre dışıdır.' });
    }

    const mults = storeSettings.durationMultipliers || { days90: 2.5, days180: 4.5, days365: 8, lifetime: 12 };
    let multiplier = 1;
    if (days === 90) multiplier = mults.days90 ?? 2.5;
    else if (days === 180) multiplier = mults.days180 ?? 4.5;
    else if (days === 365) multiplier = mults.days365 ?? 8;
    else if (days === -1) multiplier = mults.lifetime ?? 12; // Lifetime

    let totalPrice = Math.max(1, Math.round(basePrice * multiplier));

    // Apply campaign discount
    if (storeSettings.discountPercentage > 0) {
      totalPrice = Math.max(1, Math.round(totalPrice * (1 - storeSettings.discountPercentage / 100)));
    }

    // Process payment
    const isWallet = selectedMethod === 'wallet';
    let licenseStatus: 'active' | 'pending_payment' = 'active';

    if (isWallet) {
      const account = registeredAccounts.get(user.username.toLowerCase());
      if (!account) {
        return socket.emit('store_purchase_response', { success: false, error: 'Kullanıcı hesabı bulunamadı.' });
      }

      if (account.walletBalance < totalPrice) {
        return socket.emit('store_purchase_response', {
          success: false,
          error: `Yetersiz cüzdan bakiyesi! Bu lisans için ₺${totalPrice} gerekiyor. Mevcut bakiyeniz: ₺${account.walletBalance}`
        });
      }

      account.walletBalance -= totalPrice;
      user.walletBalance = account.walletBalance;
      saveAccounts(registeredAccounts);
      socket.emit('user_updated', user);
    } else {
      // Non-wallet payments (credit card, bank transfer, crypto) require manual admin confirmation before activation
      licenseStatus = 'pending_payment';
    }

    const licenseKey = generateLicenseKey(cleanName, slots, days, selectedTier);
    const expiresAt = days === -1
      ? 'lifetime'
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const newLicense: IssuedLicense = {
      id: `lic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      licenseKey,
      licensee: cleanName,
      assignedUsername: user.username,
      assignedUserId: user.id,
      maxSlots: slots,
      tier: selectedTier,
      status: licenseStatus,
      issuedAt: new Date().toISOString(),
      expiresAt,
      price: totalPrice,
      source: 'store'
    };

    issuedLicenses.set(newLicense.id, newLicense);
    saveLicenses(issuedLicenses);

    addAuditLog(
      licenseStatus === 'active' ? 'MAGAZA_SATIS' : 'MAGAZA_SIPARIS_BEKLEMEDE',
      `${user.username} mağazadan "${cleanName}" için ${slots} slot (${selectedTier}) lisans siparişi verdi (₺${totalPrice} - Ödeme: ${methodConfig.name} - Durum: ${licenseStatus === 'active' ? 'Aktif' : 'Ödeme Onayı Bekleniyor'})`,
      licenseStatus === 'active' ? 'auth' : 'warn'
    );

    socket.emit('store_purchase_response', {
      success: true,
      license: newLicense,
      message: licenseStatus === 'active'
        ? 'Lisansınız başarıyla oluşturuldu ve aktifleştirildi.'
        : 'Siparişiniz alındı. Havale/kredi kartı ödemeniz yönetici tarafından onaylandığında lisansınız aktifleşecektir.'
    });

    // Emit user's updated licenses
    const userLics = Array.from(issuedLicenses.values()).filter(l => l.assignedUsername.toLowerCase() === user.username.toLowerCase());
    socket.emit('my_licenses_response', userLics);

    // Broadcast to admins
    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  });

  // Store: Extend License (Kullanıcının Mağazadan Var Olan Lisansını Uzatması)
  socket.on('store_extend_license', ({ licenseId, addDays, paymentMethod }: any) => {
    const user = activeUsers.get(socket.id);
    if (!user) {
      return socket.emit('store_extend_response', { success: false, error: 'Oturum açmalısınız.' });
    }

    if (!storeSettings.isOpen) {
      return socket.emit('store_extend_response', {
        success: false,
        error: storeSettings.closedReason || 'Mağazamız şu anda hizmete kapalıdır.'
      });
    }

    const lic = issuedLicenses.get(licenseId);
    if (!lic || lic.assignedUsername.toLowerCase() !== user.username.toLowerCase()) {
      return socket.emit('store_extend_response', { success: false, error: 'Lisans bulunamadı veya bu lisans size ait değil.' });
    }

    if (lic.status === 'revoked') {
      return socket.emit('store_extend_response', { success: false, error: 'İptal edilmiş lisansların süresi uzatılamaz.' });
    }

    const rawDays = Number(addDays);
    const allowedDays = [30, 90, 180, 365, -1];
    if (!Number.isFinite(rawDays) || (!allowedDays.includes(rawDays) && rawDays < 1)) {
      return socket.emit('store_extend_response', { success: false, error: 'Geçersiz süre uzatma değeri.' });
    }
    const days = rawDays === -1 ? -1 : Math.floor(rawDays);
    const baseMonthlyPrice = Math.round(lic.maxSlots * (storeSettings.customSlotUnitPrice || 4));
    let rawPrice = 0;
    if (days === 30) rawPrice = baseMonthlyPrice;
    else if (days === 90) rawPrice = Math.round(baseMonthlyPrice * 2.7);
    else if (days === 180) rawPrice = Math.round(baseMonthlyPrice * 5.2);
    else if (days === 365) rawPrice = Math.round(baseMonthlyPrice * 9.5);
    else if (days === -1) rawPrice = Math.round(baseMonthlyPrice * 20);
    else rawPrice = Math.round(baseMonthlyPrice * (days / 30));

    // Apply campaign discount
    const finalPrice = Math.max(1, Math.round(rawPrice * (1 - (storeSettings.discountPercentage || 0) / 100)));

    const selectedMethod = (paymentMethod || 'wallet') as 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
    const methodConfig = storeSettings.paymentMethods.find(m => m.id === selectedMethod);
    if (!methodConfig || !methodConfig.enabled) {
      return socket.emit('store_extend_response', { success: false, error: 'Seçilen ödeme yöntemi aktif değildir.' });
    }

    if (selectedMethod !== 'wallet') {
      return socket.emit('store_extend_response', {
        success: false,
        error: 'Süre uzatma işlemi şu an yalnızca cüzdan bakiyesi ile yapılabilmektedir. Lütfen cüzdanınıza bakiye yükleyiniz veya yönetici ile iletişime geçiniz.'
      });
    }

    const account = registeredAccounts.get(user.username.toLowerCase());
    if (!account || account.walletBalance < finalPrice) {
      return socket.emit('store_extend_response', {
        success: false,
        error: `Yetersiz bakiye! Gereken: ${finalPrice} ${storeSettings.currencySymbol}, Mevcut Cüzdan: ${account?.walletBalance ?? 0} ${storeSettings.currencySymbol}`
      });
    }
    account.walletBalance -= finalPrice;
    user.walletBalance = account.walletBalance;
    saveAccounts(registeredAccounts);
    socket.emit('user_updated', user);

    let newExpiresAt: string;
    if (days === -1) {
      newExpiresAt = 'lifetime';
    } else {
      const currentExpiry = (lic.expiresAt === 'lifetime' || lic.expiresAt.startsWith('2099'))
        ? Date.now()
        : new Date(lic.expiresAt).getTime();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const newLicenseKey = generateLicenseKey(lic.licensee, lic.maxSlots, newExpiresAt, lic.tier);
    lic.licenseKey = newLicenseKey;
    lic.expiresAt = newExpiresAt;
    if (lic.status === 'expired') {
      lic.status = 'active';
    }
    saveLicenses(issuedLicenses);

    addAuditLog(
      'LISANS_MAGAZA_UZATILDI',
      `${user.username} adlı kullanıcı "${lic.licensee}" lisansını ${days === -1 ? 'Ömür Boyu' : '+' + days + ' gün'} uzattı (${finalPrice} ${storeSettings.currencySymbol} - ${methodConfig.name})`,
      'info'
    );

    socket.emit('store_extend_response', { success: true, license: lic });

    // Sync to user
    const userLics = Array.from(issuedLicenses.values()).filter(l => l.assignedUsername.toLowerCase() === user.username.toLowerCase());
    socket.emit('my_licenses_response', userLics);
    io.to('admins').emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  });

  // Get user's own licenses
  socket.on('get_my_licenses', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const userLics = Array.from(issuedLicenses.values()).filter(l => l.assignedUsername.toLowerCase() === user.username.toLowerCase());
    socket.emit('my_licenses_response', userLics);
  });

  // Disconnect
  socket.on('disconnect', () => {
    // Clean up active direct calls & rate limits
    const paired = activeDirectCallPairs.get(socket.id);
    if (paired) {
      activeDirectCallPairs.delete(paired);
      activeDirectCallPairs.delete(socket.id);
    }
    messageRateLimits.delete(socket.id);

    recordUserDisconnection(socket.id);
    const user = activeUsers.get(socket.id);
    if (user) {
      if (user.currentVoiceChannelId) {
        socket.to(user.currentVoiceChannelId).emit('user_left_voice', {
          userId: socket.id,
          channelId: user.currentVoiceChannelId
        });
      }
      activeUsers.delete(socket.id);
      io.emit('user_disconnected', socket.id);
      cleanupTemporaryChannels();
      activeSessions.delete(socket.id);
      userVoiceActivity.delete(socket.id);
      console.log(`[User Disconnected] ${user.username} (${socket.id})`);
    }
  });
});

// Automatic AFK Voice Channel Mover (runs every 30s)
setInterval(() => {
  const now = Date.now();
  for (const [sid, user] of activeUsers.entries()) {
    if (!user.currentVoiceChannelId) continue;
    const srv = servers.find((s) => s.channels.some((c) => c.id === user.currentVoiceChannelId));
    if (!srv || !srv.afkChannelId || !srv.afkTimeoutMinutes || srv.afkTimeoutMinutes <= 0) continue;
    if (user.currentVoiceChannelId === srv.afkChannelId) continue;

    const afkChannel = srv.channels.find((c) => c.id === srv.afkChannelId && c.type === 'voice');
    if (!afkChannel) continue;

    const lastActive = userVoiceActivity.get(sid) || now;
    if (now - lastActive >= srv.afkTimeoutMinutes * 60_000) {
      const sock = io.sockets.sockets.get(sid);
      const oldChannelId = user.currentVoiceChannelId;
      if (sock) {
        sock.leave(oldChannelId);
        sock.join(afkChannel.id);
        sock.emit('afk_moved', { channelId: afkChannel.id, channelName: afkChannel.name });
      }
      user.currentVoiceChannelId = afkChannel.id;
      user.isSpeaking = false;
      user.isMuted = true;
      userVoiceActivity.set(sid, now);

      io.to(oldChannelId).emit('user_left_voice', { userId: sid, channelId: oldChannelId });
      io.to(afkChannel.id).emit('user_joined_voice', { user, channelId: afkChannel.id });
      io.emit('voice_state_update', {
        userId: sid,
        channelId: afkChannel.id,
        isMuted: user.isMuted,
        isDeafened: user.isDeafened
      });
      addAuditLog('AFK_TASIMA', `${user.username} hareketsiz kaldığı için AFK odasına (${afkChannel.name}) taşındı.`, 'voice');
    }
  }
}, 30_000);

// Production Static Client Serving (Single-Port Pelican / Docker Deployment)
const clientDistCandidates = [
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(__dirname, '../public'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), '../client/dist')
];

let activeStaticDir: string | null = null;
for (const cand of clientDistCandidates) {
  if (fs.existsSync(cand) && fs.existsSync(path.join(cand, 'index.html'))) {
    activeStaticDir = cand;
    break;
  }
}

if (activeStaticDir) {
  app.use(express.static(activeStaticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(activeStaticDir!, 'index.html'));
  });
  console.log(`🌐 [Web Arayüzü] Statik React arayüzü tek port üzerinden yayında: ${activeStaticDir}`);
} else {
  console.warn(`⚠️ [Web Arayüzü] 'client/dist' bulunamadı! 'client' klasöründe 'npm run build' çalıştırın.`);
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head><meta charset="UTF-8"><title>Discord Clone Backend</title>
      <style>body { font-family: sans-serif; background: #121318; color: #dbdee1; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } .card { background: #1c1d24; padding: 2rem; border-radius: 12px; text-align: center; }</style>
      </head>
      <body>
        <div class="card">
          <h2>⚠️ Web Arayüzü Henüz Derlenmemiş</h2>
          <p>client/dist klasörü bulunamadı. Lütfen 'npm run build' komutu ile derleyin.</p>
        </div>
      </body>
      </html>
    `);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Backend Server] Discord/TeamSpeak Clone running on http://127.0.0.1:${PORT}`);
});
