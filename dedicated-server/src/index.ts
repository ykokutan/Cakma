import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyLicenseKey, OFFICIAL_CLIENT_SIGNATURE, type LicenseData } from './licenseValidator.js';
import {
  loadDedicatedState,
  scheduleDedicatedStateSave,
  flushDedicatedStateSync,
  type DedicatedChannelCategory,
  type DedicatedScheduledMessage,
  type DedicatedStoredAccount,
  type DedicatedStoredChannel,
  type DedicatedWebhook,
} from './storage.js';
import { hashPasswordAsync, verifyPasswordAsync } from './authCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. CONFIGURATION LOADING
const configPath = path.resolve(__dirname, '../server.config.json');
if (!fs.existsSync(configPath)) {
  console.error('\n❌ [HATA]: server.config.json dosyası bulunamadı!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// 2. CRYPTOGRAPHIC LICENSE VERIFICATION
console.log('\n============================================================');
console.log('🛡️  DEDICATED SES SUNUCUSU LİSANS DENETİMİ YAPILIYOR...');
console.log('============================================================');

const rawMaster = config.masterServerUrl || 'http://127.0.0.1:4000';
const MASTER_SERVER_URL = rawMaster.replace('localhost', '127.0.0.1');

let licenseResult = verifyLicenseKey(config.licenseKey, config.licensePublicKey);

async function resolveAndVerifyLicenseAtStartup(): Promise<LicenseData> {
  const urls = Array.from(new Set([MASTER_SERVER_URL, 'http://127.0.0.1:4000', 'http://localhost:4000']));

  // 1) If LIC2- Ed25519 without local public key, try fetching Master's Ed25519 public key
  if (!licenseResult.valid && licenseResult.needsOnlineVerification && config.licenseKey.startsWith('LIC2-')) {
    for (const u of urls) {
      try {
        const pkRes = await fetch(`${u}/api/dedicated/public-key`, { signal: AbortSignal.timeout(2000) });
        const pkJson: any = await pkRes.json().catch(() => ({}));
        if (pkRes.ok && pkJson?.publicKeyPem) {
          licenseResult = verifyLicenseKey(config.licenseKey, pkJson.publicKeyPem);
          if (licenseResult.valid && licenseResult.data) {
            break;
          }
        }
      } catch {}
    }
  }

  console.log('📡 Merkezi Lisans Sunucusu ile iletişim kuruluyor...');
  for (const u of urls) {
    try {
      const res = await fetch(`${u}/api/dedicated/verify-license?licenseKey=${encodeURIComponent(config.licenseKey)}`, {
        signal: AbortSignal.timeout(2000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.status === 403 || data.revoked || data.status === 'revoked') {
        console.error('\n❌ ============================================================');
        console.error('🚨 [LİSANS İPTAL EDİLMİŞ]: SUNUCU BAŞLATILAMAZ!');
        console.error(`🚨 Sebep: ${data.error || 'Bu lisans anahtarı sistem yöneticisi tarafından feshedilmiştir.'}`);
        console.error('❌ ============================================================\n');
        process.exit(1);
      }
      if (res.ok && data.valid && data.data) {
        if (!licenseResult.valid) {
          licenseResult = { valid: true, data: data.data };
        }
        console.log('✓ MERKEZİ SUNUCU ONAYI: Lisans aktif ve onaylandı.');
        return licenseResult.data || data.data;
      }
    } catch {}
  }

  if (!licenseResult.valid || !licenseResult.data) {
    console.error('\n❌ ============================================================');
    console.error('❌ [LİSANS HATASI]: SUNUCU BAŞLATILAMADI!');
    console.error(`❌ Sebep: ${licenseResult.error || 'Geçersiz lisans anahtarı veya ana sunucuya ulaşılamadı.'}`);
    console.error('❌ Lütfen sunucu sahibinden geçerli bir lisans temin edin.');
    console.error('============================================================\n');
    process.exit(1);
  }

  return licenseResult.data;
}

const license = await resolveAndVerifyLicenseAtStartup();
console.log(`✓ LİSANS GEÇERLİ: ${license.licensee}`);
console.log(`✓ MAKSİMUM KAPASİTE: ${license.maxSlots} Kişi (Slots)`);
console.log(`✓ LİSANS PAKETİ: ${license.tier}`);
console.log(`✓ GEÇERLİLİK TARİHİ: ${license.expiresAt === 'lifetime' ? 'Ömür Boyu (Lifetime)' : new Date(license.expiresAt).toLocaleDateString('tr-TR')}`);
console.log('============================================================\n');

// 3. SERVER SETUP & SECURITY HARDENING
const app = express();
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const defaultAllowedOrigins = [
  'https://ses.yahyakemalokutan.com',
  'http://ses.yahyakemalokutan.com',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:17420',
  'http://127.0.0.1:17420',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];
try {
  const mOrigin = new URL(MASTER_SERVER_URL).origin;
  if (!defaultAllowedOrigins.includes(mOrigin)) defaultAllowedOrigins.push(mOrigin);
} catch {}

const envOrigins = [process.env.CORS_ALLOWED_ORIGINS, process.env.ALLOWED_ORIGINS]
  .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  .join(',')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const configOrigins = Array.isArray(config.allowedOrigins)
  ? config.allowedOrigins.map((s: any) => String(s).trim()).filter(Boolean)
  : [];
const allowedOriginsSet = new Set([...defaultAllowedOrigins, ...envOrigins, ...configOrigins]);
const allowAllOrigins = Boolean(config.allowAllOrigins === true || process.env.ALLOW_ALL_ORIGINS === 'true');
const corsWarnedAt = new Map<string, number>();

function warnBlockedCors(origin: string, host?: string) {
  const now = Date.now();
  const prev = corsWarnedAt.get(origin) || 0;
  if (now - prev < 60_000) return;
  if (corsWarnedAt.size >= 500) {
    const first = corsWarnedAt.keys().next().value;
    if (first) corsWarnedAt.delete(first);
  }
  corsWarnedAt.set(origin, now);
  console.warn(`⚠️ [CORS] Engellenen origin: ${origin}${host ? ` (host=${host})` : ''}`);
}

function isDedicatedOriginAllowed(origin: string | undefined, requestHost?: string): boolean {
  if (!origin || allowAllOrigins || allowedOriginsSet.has(origin)) return true;
  if (requestHost) {
    try {
      if (new URL(origin).host.toLowerCase() === requestHost.trim().toLowerCase()) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

const expressCorsDelegate: cors.CorsOptionsDelegate = (req, callback) => {
  const rawOrigin = req.headers.origin;
  const origin = typeof rawOrigin === 'string' ? rawOrigin : undefined;
  const rawHost = req.headers.host;
  const host = typeof rawHost === 'string' ? rawHost : undefined;
  if (isDedicatedOriginAllowed(origin, host)) {
    callback(null, { origin: true, credentials: true });
    return;
  }
  if (origin) warnBlockedCors(origin, host);
  callback(null, { origin: false, credentials: true });
};

const corsOriginValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (isDedicatedOriginAllowed(origin)) {
    callback(null, true);
  } else {
    if (origin) warnBlockedCors(origin);
    callback(null, false);
  }
};

app.use(cors(expressCorsDelegate));
app.use(express.json({ limit: '1mb' }));

const apiRateLimits = new Map<string, { count: number; resetAt: number }>();
app.use('/api', (req, res, next) => {
  const ip = req.socket?.remoteAddress || req.ip || 'unknown';
  const now = Date.now();
  const entry = apiRateLimits.get(ip);
  if (!entry || now >= entry.resetAt) {
    apiRateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 120) {
    return res.status(429).json({ success: false, error: 'Çok fazla istek gönderildi.' });
  }
  next();
});
const rateLimitCleaner = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of apiRateLimits.entries()) {
    if (now >= entry.resetAt) apiRateLimits.delete(ip);
  }
}, 5 * 60_000);
rateLimitCleaner.unref?.();

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOriginValidator,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = config.port || 4001;

// Internal state
interface DedicatedUserBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

interface DedicatedUser {
  id: string;
  username: string;
  email?: string;
  avatar: string;
  status: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  role: string;
  currentVoiceChannelId?: string;
  isScreenSharing?: boolean;
  statusMessage?: string;
  bannerColor?: string;
  bio?: string;
  badges?: DedicatedUserBadge[];
  friends?: string[];
}

interface Account {
  username: string;
  email: string;
  password: string;
  avatar: string;
  role: 'admin' | 'user';
  statusMessage?: string;
  bannerColor?: string;
  bio?: string;
  badges?: DedicatedUserBadge[];
  friends?: string[];
}

function getDedicatedBadges(role: string, username: string): DedicatedUserBadge[] {
  const badges: DedicatedUserBadge[] = [];
  if (role === 'admin') {
    badges.push({
      id: 'badge-admin',
      name: 'Sistem Yöneticisi',
      icon: '🛡️',
      description: 'Dedicated sunucu yöneticisi',
      color: 'from-amber-500 to-yellow-400'
    });
    badges.push({
      id: 'badge-owner',
      name: 'Dedicated Sunucu Sahibi',
      icon: '👑',
      description: 'Lisanslı bağımsız Dedicated ses sunucusu sahibi',
      color: 'from-orange-500 to-amber-400'
    });
  }
  if (role === 'admin' || username.toLowerCase() === 'ahmet') {
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

const defaultDedicatedChannels: DedicatedStoredChannel[] = (config.defaultChannels || [
  { name: 'genel-sohbet', type: 'text' },
  { name: 'Lobi Ses', type: 'voice' },
]).map((c: any, idx: number) => {
  const chType: DedicatedStoredChannel['type'] =
    c.type === 'voice' || c.type === 'announcement' || c.type === 'forum' || c.type === 'stage' ? c.type : 'text';
  return {
    id: `ch-${chType}-${idx + 1}`,
    name: String(c.name || `kanal-${idx + 1}`),
    type: chType,
    serverId: 'dedicated-server-root',
    position: idx,
  };
});

const initialDedicatedState = await loadDedicatedState({
  defaultChannels: defaultDedicatedChannels,
  hashPassword: hashPasswordAsync,
  getBadges: getDedicatedBadges,
});

const registeredAccounts = initialDedicatedState.accounts;
const pendingDedicatedFriendRequests = initialDedicatedState.friendRequests;
const serverChannels = initialDedicatedState.channels;
const serverCategories: DedicatedChannelCategory[] = initialDedicatedState.categories;
const dedicatedWebhooks: DedicatedWebhook[] = initialDedicatedState.webhooks;
const dedicatedScheduledMessages: DedicatedScheduledMessage[] = initialDedicatedState.scheduledMessages;
const serverNicknames: Record<string, string> = initialDedicatedState.nicknames;
const messages: Record<string, any[]> = initialDedicatedState.messages;

const DEDICATED_SESSION_SECRET = crypto
  .createHash('sha256')
  .update(String(config.licenseKey || process.env.DEDICATED_SESSION_SECRET || 'dedicated-fallback-secret'))
  .digest('hex');

const UPLOADS_DIR = path.resolve(__dirname, '../data/uploads');
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {}

const DEDICATED_BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.msi', '.ps1', '.scr', '.vbs', '.js', '.sh', '.com', '.hta', '.jar',
]);

const DEDICATED_INLINE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

function generateDedicatedToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', DEDICATED_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyDedicatedToken(token: string): string | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', DEDICATED_SESSION_SECRET).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { u?: string; exp?: number };
    if (!parsed.u || !parsed.exp || parsed.exp < Date.now()) return null;
    return registeredAccounts.has(parsed.u.toLowerCase()) ? parsed.u : null;
  } catch {
    return null;
  }
}

function extractDedicatedToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const tok = authHeader.slice(7).trim();
    if (tok && tok !== '__cookie__') return tok;
  }
  const cookieHeader = Array.isArray(req.headers.cookie) ? req.headers.cookie.join('; ') : req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      if (part.slice(0, idx).trim() === 'cakma_session') {
        try {
          const val = decodeURIComponent(part.slice(idx + 1).trim());
          if (val && val !== '__cookie__') return val;
        } catch {}
      }
    }
  }
  return null;
}

function persistDedicatedState() {
  scheduleDedicatedStateSave(
    registeredAccounts,
    serverChannels,
    messages,
    pendingDedicatedFriendRequests,
    250,
    undefined,
    {
      categories: serverCategories,
      webhooks: dedicatedWebhooks,
      scheduledMessages: dedicatedScheduledMessages,
      nicknames: serverNicknames,
    }
  );
}

const DEFAULT_DEDICATED_ROLES = [
  {
    id: 'role-admin',
    name: 'Yönetici',
    color: '#f59e0b',
    icon: '👑',
    position: 0,
    permissions: [
      'manage_server',
      'manage_roles',
      'manage_channels',
      'kick_members',
      'ban_members',
      'send_messages',
      'attach_files',
      'connect_voice',
      'speak_voice',
      'mute_members',
      'priority_speaker',
    ],
  },
  {
    id: 'role-member',
    name: '@everyone',
    color: '#94a3b8',
    position: 1,
    permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice'],
    isDefault: true,
  },
];

function buildDedicatedServerPayload() {
  const members = Array.from(registeredAccounts.values()).map((acc) => {
    const unameLower = acc.username.toLowerCase();
    const nick = serverNicknames[unameLower];
    return {
      userId: `usr-${unameLower}`,
      username: acc.username,
      avatar: acc.avatar || '🎮',
      ...(nick ? { nickname: nick } : {}),
      roleIds: acc.role === 'admin' ? ['role-admin'] : ['role-member'],
      joinedAt: 'Üye',
      isOwner: acc.role === 'admin',
    };
  });

  return {
    id: 'dedicated-server-root',
    name: config.serverName,
    icon: '🛡️',
    ownerId: 'usr-admin',
    categories: serverCategories,
    channels: serverChannels,
    roles: DEFAULT_DEDICATED_ROLES,
    members,
  };
}

function getDedicatedFriendsData(username: string) {
  const account = registeredAccounts.get(username.toLowerCase());
  const friendUsernames = account?.friends || [];

  const friends = friendUsernames.map(fName => {
    const fAcc = registeredAccounts.get(fName.toLowerCase());
    let onlineUser: any;
    for (const u of connectedUsers.values()) {
      if (u.username.toLowerCase() === fName.toLowerCase()) {
        onlineUser = u;
        break;
      }
    }

    return {
      id: onlineUser ? onlineUser.id : (fAcc?.username || fName),
      username: fAcc?.username || fName,
      avatar: fAcc?.avatar || '👤',
      status: onlineUser ? onlineUser.status : 'offline',
      statusMessage: onlineUser?.statusMessage || fAcc?.statusMessage,
      role: fAcc?.role || 'user',
      currentVoiceChannelId: onlineUser?.currentVoiceChannelId,
      addedAt: 'Arkadaş'
    };
  });

  const incomingRequests: any[] = [];
  const outgoingRequests: any[] = [];

  for (const req of pendingDedicatedFriendRequests.values()) {
    if (req.toUsername.toLowerCase() === username.toLowerCase()) {
      incomingRequests.push(req);
    }
    if (req.fromUsername.toLowerCase() === username.toLowerCase()) {
      outgoingRequests.push(req);
    }
  }

  return { friends, incomingRequests, outgoingRequests };
}

const connectedUsers = new Map<string, DedicatedUser>();

let isLicenseRevoked = false;
let isShuttingDown = false;

// 4. PROPRIETARY CLIENT & SECURITY HANDSHAKE (Sadece resmi uygulamadan girişe izin verilir)
io.use(async (socket, next) => {
  if (isLicenseRevoked || isShuttingDown) {
    return next(new Error('LİSANS_İPTAL: Sunucu lisansı iptal edildiği için bağlantı kurulamaz!'));
  }

  // Active check on every incoming connection attempt
  try {
    const res = await fetch(`${MASTER_SERVER_URL}/api/dedicated/verify-license?licenseKey=${encodeURIComponent(config.licenseKey)}`, {
      signal: AbortSignal.timeout(1500)
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.status === 403 || data.revoked || data.status === 'revoked') {
      shutdownDueToLicenseRevocation(data.error || 'Lisans anahtarı sistem yöneticisi tarafından feshedilmiştir.');
      return next(new Error('LİSANS_İPTAL: Sunucu lisansı iptal edilmiştir!'));
    }
  } catch {}

  const auth = socket.handshake.auth || {};
  const clientSignature = auth.clientSignature || socket.handshake.headers['x-client-signature'];

  // Check proprietary client token
  if (clientSignature !== OFFICIAL_CLIENT_SIGNATURE) {
    console.warn(`[GÜVENLİK ENGELİ] Yabancı/korsan istemci bağlantısı reddedildi! IP: ${socket.handshake.address}`);
    return next(new Error('YETKISIZ_ISTEMCI: Bu sunucuya yalnızca resmi Discord/TeamSpeak uygulaması bağlanabilir!'));
  }

  // Check maximum slot capacity allowed by license
  if (connectedUsers.size >= license.maxSlots) {
    console.warn(`[KAPASİTE DOLDU] Bağlantı reddedildi. Max slot: ${license.maxSlots}`);
    return next(new Error(`SUNUCU_DOLU: Sunucu maksimum lisans kapasitesine (${license.maxSlots} kişi) ulaştı!`));
  }

  next();
});

// REST Healthcheck
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>${config.serverName} - Dedicated Voice Server</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0c0d12; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: rgba(25, 27, 36, 0.85); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.1); padding: 2.5rem; border-radius: 24px; text-align: center; max-width: 450px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
        h1 { font-size: 20px; color: #3b82f6; margin-top: 0; }
        .badge { display: inline-block; background: #10b981; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-bottom: 12px; }
        .info { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.6; }
        .protected { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b; padding: 8px 14px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">● LİSANSLI SUNUCU AKTİF</div>
        <h1>${config.serverName}</h1>
        <p class="info">Lisans Sahibi: <b>${license.licensee}</b><br>Kapasite: <b>${connectedUsers.size} / ${license.maxSlots} Slot</b></p>
        <div class="protected">🔒 Korumalı Sunucu: Sadece resmi Discord / TeamSpeak uygulaması üzerinden doğrudan bağlanabilirsiniz.</div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/dedicated/telemetry', (_req, res) => {
  const mem = process.memoryUsage();
  const totalMessages = Object.values(messages).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0
  );
  res.json({
    ok: true,
    serverName: config.serverName,
    version: '1.3.0',
    uptimeSeconds: Math.round(process.uptime()),
    memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    memoryHeapMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
    onlineUsers: connectedUsers.size,
    maxSlots: license.maxSlots,
    totalChannels: serverChannels.length,
    totalMessages,
  });
});

app.get('/api/storage/usage', (_req, res) => {
  let totalBytes = 0;
  let fileCount = 0;
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      for (const name of fs.readdirSync(UPLOADS_DIR)) {
        const full = path.join(UPLOADS_DIR, name);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) {
            totalBytes += st.size;
            fileCount += 1;
          }
        } catch {}
      }
    }
  } catch {}
  const quotaBytes = (Number(process.env.MAX_UPLOADS_DISK_MB) || 2048) * 1024 * 1024;
  const usagePercent = Math.min(100, Math.round((totalBytes / Math.max(1, quotaBytes)) * 1000) / 10);
  res.json({ ok: true, totalBytes, fileCount, quotaBytes, usagePercent });
});

// Socket Events
io.on('connection', (socket: Socket) => {
  const auth = socket.handshake.auth || {};
  const reqUsername = auth.username?.trim();
  const matchedAccount = reqUsername ? registeredAccounts.get(reqUsername.toLowerCase()) : undefined;

  const initialRole = matchedAccount ? matchedAccount.role : (reqUsername?.toLowerCase() === 'admin' ? 'admin' : 'user');
  const initialEmail = matchedAccount ? matchedAccount.email : (reqUsername ? `${reqUsername}@dedicated.local` : undefined);
  const initialAvatar = matchedAccount ? matchedAccount.avatar : (auth.avatar || '🎮');
  const initialUsername = matchedAccount ? matchedAccount.username : (reqUsername || `Kullanıcı_${socket.id.substring(0, 4)}`);

  const user: DedicatedUser = {
    id: socket.id,
    username: initialUsername,
    email: initialEmail,
    avatar: initialAvatar,
    status: 'online',
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    role: initialRole,
    statusMessage: matchedAccount?.statusMessage || 'Çevrimiçi',
    bannerColor: matchedAccount?.bannerColor || 'from-indigo-600 to-purple-600',
    bio: matchedAccount?.bio || 'Dedicated ses sunucusu üyesi.',
    badges: matchedAccount?.badges || getDedicatedBadges(initialRole, initialUsername),
    friends: matchedAccount?.friends || []
  };

  connectedUsers.set(socket.id, user);
  console.log(`[Yeni Bağlantı] ${user.username} (${user.role}) sunucuya girdi (${connectedUsers.size}/${license.maxSlots})`);

  // Send Initial dedicated server info
  socket.emit('init_data', {
    currentUser: user,
    servers: [buildDedicatedServerPayload()],
    onlineUsers: Array.from(connectedUsers.values()),
    messages
  });
  socket.emit('friends_data', getDedicatedFriendsData(user.username));

  socket.broadcast.emit('user_connected', user);

  // 1. AUTH LOGIN
  socket.on('auth_login', async ({ usernameOrEmail, password }: any) => {
    if (isLicenseRevoked || isShuttingDown) {
      return socket.emit('auth_response', { success: false, error: 'LİSANS İPTAL: Bu sunucunun lisansı feshedilmiştir. Giriş yapılamaz!' });
    }

    const query = typeof usernameOrEmail === 'string' ? usernameOrEmail.trim().toLowerCase() : '';
    if (!query || typeof password !== 'string' || !password) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    let foundAccount: Account | undefined;
    for (const acc of registeredAccounts.values()) {
      if (acc.username.toLowerCase() === query || acc.email.toLowerCase() === query) {
        foundAccount = acc;
        break;
      }
    }

    if (!foundAccount || !(await verifyPasswordAsync(password, foundAccount.password))) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    user.username = foundAccount.username;
    user.email = foundAccount.email;
    user.role = foundAccount.role;
    user.avatar = foundAccount.avatar;

    connectedUsers.set(socket.id, user);
    console.log(`[Giriş Başarılı] ${user.username} (${user.role}) yetkilendirildi.`);

    const token = generateDedicatedToken(user.username);
    socket.emit('auth_response', { success: true, user, token, mediaToken: token });
    socket.emit('init_data', {
      currentUser: user,
      servers: [buildDedicatedServerPayload()],
      onlineUsers: Array.from(connectedUsers.values()),
      messages
    });

    io.emit('user_updated', user);
  });

  // 2. AUTH REGISTER
  socket.on('auth_register', async ({ username, email, password, avatar, acceptedTerms }: any) => {
    if (acceptedTerms !== true) {
      return socket.emit('auth_response', {
        success: false,
        error: "Kayıt olabilmek için Kullanıcı Sözleşmesi, Gizlilik Politikası ve KVKK Aydınlatma Metni'ni kabul etmeniz zorunludur.",
      });
    }
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    if (!cleanUsername || typeof password !== 'string' || !password) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    if (registeredAccounts.has(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    const role = cleanUsername.toLowerCase() === 'admin' ? 'admin' : 'user';
    const newAcc: Account = {
      username: cleanUsername,
      email: (typeof email === 'string' ? email.trim() : '') || `${cleanUsername.toLowerCase()}@dedicated.local`,
      password: await hashPasswordAsync(password),
      avatar: (typeof avatar === 'string' ? avatar : '') || '🎮',
      role
    };

    registeredAccounts.set(cleanUsername.toLowerCase(), newAcc);
    persistDedicatedState();
    user.username = newAcc.username;
    user.email = newAcc.email;
    user.role = newAcc.role;
    user.avatar = newAcc.avatar;

    connectedUsers.set(socket.id, user);
    console.log(`[Yeni Kayıt] ${user.username} (${user.role}) kaydoldu.`);

    const token = generateDedicatedToken(user.username);
    socket.emit('auth_response', { success: true, user, token, mediaToken: token, isNewUser: true });
    socket.emit('init_data', {
      currentUser: user,
      servers: [buildDedicatedServerPayload()],
      onlineUsers: Array.from(connectedUsers.values()),
      messages
    });

    io.emit('user_updated', user);
  });

  // 2.5 TOKEN LOGIN
  socket.on('auth_token_login', ({ token }: { token?: string }) => {
    const verifiedUsername = token ? verifyDedicatedToken(token) : null;
    if (!verifiedUsername) {
      return socket.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: 'Oturum süresi doldu, lütfen tekrar giriş yapın.',
      });
    }
    const foundAccount = registeredAccounts.get(verifiedUsername.toLowerCase());
    if (!foundAccount) {
      return socket.emit('auth_response', {
        success: false,
        tokenExpired: true,
        error: 'Hesap bulunamadı.',
      });
    }
    user.username = foundAccount.username;
    user.email = foundAccount.email;
    user.role = foundAccount.role;
    user.avatar = foundAccount.avatar;
    connectedUsers.set(socket.id, user);

    const refreshed = generateDedicatedToken(user.username);
    socket.emit('auth_response', { success: true, user, token: refreshed, mediaToken: refreshed });
    socket.emit('init_data', {
      currentUser: user,
      servers: [buildDedicatedServerPayload()],
      onlineUsers: Array.from(connectedUsers.values()),
      messages,
    });
    socket.emit('friends_data', getDedicatedFriendsData(user.username));
    io.emit('user_updated', user);
  });

  // Messaging (Supports text, announcement gating, forum/reply, rich polls & file attachments)
  socket.on('send_message', ({ channelId, content, attachments, forumPost, replyTo, poll }: any) => {
    const textContent = (content || '').trim();
    if (!textContent && (!attachments || attachments.length === 0) && !poll) return;
    const targetCh = serverChannels.find((c) => c.id === channelId);
    if (targetCh?.type === 'announcement' && user.role !== 'admin') {
      return socket.emit('server_action_error', {
        message: 'Bu duyuru kanalında yalnızca yöneticiler paylaşım yapabilir.',
      });
    }
    let cleanPoll: any;
    if (poll && typeof poll === 'object' && typeof poll.question === 'string' && Array.isArray(poll.options)) {
      const q = poll.question.trim().slice(0, 200);
      const opts = poll.options
        .filter((o: any) => o && typeof o.text === 'string' && o.text.trim())
        .slice(0, 10)
        .map((o: any, idx: number) => ({
          id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 64) : `opt-${idx + 1}-${Date.now()}`,
          text: o.text.trim().slice(0, 120),
          votes: [] as string[],
        }));
      if (q && opts.length >= 2) {
        cleanPoll = {
          question: q,
          options: opts,
          closed: false,
          totalVotes: 0,
          ...(poll.allowMultiple ? { allowMultiple: true } : {}),
          ...(poll.isAnonymous ? { isAnonymous: true } : {}),
          ...(typeof poll.closesAt === 'string' && poll.closesAt.trim() ? { closesAt: poll.closesAt.trim() } : {}),
        };
      }
    }
    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      serverId: 'dedicated-server-root',
      channelId,
      author: {
        id: user.id,
        username: user.username,
        avatar: user.avatar
      },
      content: textContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachments || [],
      ...(cleanPoll ? { poll: cleanPoll } : {}),
      ...(forumPost && typeof forumPost === 'object' ? { forumPost } : {}),
      ...(replyTo && typeof replyTo === 'object' ? { replyTo } : {}),
    };

    if (!messages[channelId]) messages[channelId] = [];
    messages[channelId].push(msg);
    persistDedicatedState();

    io.emit('new_message', msg);
  });

  // Rich Poll Voting (v1.3.0 Parity)
  socket.on('vote_poll', ({ channelId, messageId, optionId }: any) => {
    if (!channelId || !messageId) return;
    const list = messages[channelId];
    if (!Array.isArray(list)) return;
    const msg = list.find((m) => m.id === messageId);
    if (!msg || !msg.poll || msg.poll.closed) return;
    if (msg.poll.closesAt) {
      const closesMs = Date.parse(msg.poll.closesAt);
      if (Number.isFinite(closesMs) && Date.now() >= closesMs) {
        msg.poll.closed = true;
        persistDedicatedState();
        io.emit('poll_updated', { channelId, messageId, poll: msg.poll });
        return;
      }
    }
    const allowMultiple = Boolean(msg.poll.allowMultiple);
    msg.poll.options.forEach((opt: any) => {
      const idx = Array.isArray(opt.votes) ? opt.votes.indexOf(user.username) : -1;
      if (opt.id === optionId) {
        if (idx !== -1) opt.votes.splice(idx, 1);
        else opt.votes.push(user.username);
      } else if (!allowMultiple && idx !== -1) {
        opt.votes.splice(idx, 1);
      }
    });
    msg.poll.totalVotes = msg.poll.options.reduce((s: number, o: any) => s + (o.votes?.length || 0), 0);
    persistDedicatedState();
    io.emit('poll_updated', { channelId, messageId, poll: msg.poll });
  });

  // Server Nickname Update (v1.1.0 Parity)
  socket.on('update_server_nickname', ({ targetUsername, nickname }: any) => {
    const rawTarget = typeof targetUsername === 'string' && targetUsername.trim() ? targetUsername.trim() : user.username;
    const targetLower = rawTarget.toLowerCase();
    const isSelf = targetLower === user.username.toLowerCase();
    if (!isSelf && user.role !== 'admin') {
      return socket.emit('server_action_error', { message: 'Başkasının sunucu takma adını değiştirme yetkiniz yok.' });
    }
    if (!registeredAccounts.has(targetLower)) {
      return socket.emit('server_action_error', { message: 'Sunucu üyesi bulunamadı.' });
    }
    const cleanNick = typeof nickname === 'string'
      ? nickname.replace(/[<>]/g, '').trim().slice(0, 32)
      : '';
    if (cleanNick) {
      serverNicknames[targetLower] = cleanNick;
    } else {
      delete serverNicknames[targetLower];
    }
    persistDedicatedState();
    const updatedServer = buildDedicatedServerPayload();
    io.emit('server_updated', updatedServer);
    io.emit('servers_updated', [updatedServer]);
  });

  // Bulk Message Delete (v1.1.0 Moderator Parity)
  socket.on('bulk_delete_messages', ({ channelId, messageIds }: any, ack?: (res: any) => void) => {
    if (user.role !== 'admin') {
      ack?.({ ok: false, error: 'Toplu mesaj silmek için yönetici yetkisi gerekir.' });
      return socket.emit('server_action_error', { message: 'Toplu mesaj silmek için yönetici yetkisi gerekir.' });
    }
    if (!channelId || !Array.isArray(messageIds) || messageIds.length === 0) {
      ack?.({ ok: false, error: 'Geçersiz kanal veya mesaj listesi.' });
      return;
    }
    const idSet = new Set(
      messageIds
        .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
        .slice(0, 100)
    );
    const list = messages[channelId];
    if (!Array.isArray(list) || idSet.size === 0) {
      ack?.({ ok: true, deletedCount: 0 });
      return;
    }
    const removedIds: string[] = [];
    const remaining: any[] = [];
    for (const m of list) {
      if (idSet.has(m.id)) removedIds.push(m.id);
      else remaining.push(m);
    }
    if (removedIds.length > 0) {
      messages[channelId] = remaining;
      persistDedicatedState();
      io.emit('messages_bulk_deleted', {
        serverId: 'dedicated-server-root',
        channelId,
        messageIds: removedIds,
      });
    }
    ack?.({ ok: true, deletedCount: removedIds.length });
  });

  // Forum Post Solved Toggle (v1.2.0 Parity)
  socket.on('toggle_forum_solved', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    if (!channelId || !messageId) return;
    const list = messages[channelId];
    if (!Array.isArray(list)) return;
    const msg = list.find((m) => m.id === messageId);
    if (!msg || !msg.forumPost) return;
    const isAuthor = msg.author?.username?.toLowerCase() === user.username.toLowerCase();
    if (!isAuthor && user.role !== 'admin') {
      return socket.emit('server_action_error', {
        message: 'Bu forum konusunun çözüm durumunu yalnızca konu sahibi veya yönetici değiştirebilir.',
      });
    }
    const nextSolved = !msg.forumPost.solved;
    msg.forumPost = {
      ...msg.forumPost,
      solved: nextSolved,
      solvedAt: nextSolved ? new Date().toISOString() : undefined,
      solvedBy: nextSolved ? user.username : undefined,
    };
    persistDedicatedState();
    io.emit('forum_post_updated', {
      channelId,
      messageId,
      forumPost: msg.forumPost,
    });
  });

  // Channel & Category Admin Management (Parity v1.0.0)
  socket.on('create_channel', ({ name, type, categoryId, topic, isLocked, password }: any) => {
    if (user.role !== 'admin') {
      return socket.emit('server_action_error', { message: 'Kanal oluşturmak için yönetici yetkisi gerekir.' });
    }
    const cleanName = String(name || '').trim().slice(0, 48);
    if (!cleanName) return;
    const chType: DedicatedStoredChannel['type'] =
      type === 'voice' || type === 'announcement' || type === 'forum' || type === 'stage' ? type : 'text';
    const validCatId =
      typeof categoryId === 'string' && serverCategories.some((c) => c.id === categoryId) ? categoryId : null;
    const newCh: DedicatedStoredChannel = {
      id: `ch-${chType}-${Date.now()}`,
      name: chType === 'voice' || chType === 'stage' ? cleanName : cleanName.toLowerCase().replace(/\s+/g, '-').slice(0, 32),
      type: chType,
      serverId: 'dedicated-server-root',
      categoryId: validCatId,
      position: serverChannels.length,
      ...(typeof topic === 'string' && topic.trim() ? { topic: topic.trim().slice(0, 100) } : {}),
      ...(isLocked ? { isLocked: true } : {}),
      ...(typeof password === 'string' && password.trim() ? { password: password.trim() } : {}),
    };
    serverChannels.push(newCh);
    persistDedicatedState();
    io.emit('servers_updated', [buildDedicatedServerPayload()]);
  });

  socket.on('delete_channel', ({ channelId }: { channelId: string }) => {
    if (user.role !== 'admin' || !channelId) return;
    const idx = serverChannels.findIndex((c) => c.id === channelId);
    if (idx === -1) return;
    serverChannels.splice(idx, 1);
    persistDedicatedState();
    io.emit('servers_updated', [buildDedicatedServerPayload()]);
  });

  socket.on('create_category', ({ name }: { name: string }) => {
    if (user.role !== 'admin') return;
    const cleanName = String(name || '').trim().slice(0, 40);
    if (!cleanName || serverCategories.length >= 25) return;
    serverCategories.push({
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      position: serverCategories.length,
    });
    persistDedicatedState();
    io.emit('servers_updated', [buildDedicatedServerPayload()]);
  });

  socket.on('rename_category', ({ categoryId, name }: { categoryId: string; name: string }) => {
    if (user.role !== 'admin') return;
    const cat = serverCategories.find((c) => c.id === categoryId);
    const cleanName = String(name || '').trim().slice(0, 40);
    if (!cat || !cleanName) return;
    cat.name = cleanName;
    persistDedicatedState();
    io.emit('servers_updated', [buildDedicatedServerPayload()]);
  });

  socket.on('delete_category', ({ categoryId }: { categoryId: string }) => {
    if (user.role !== 'admin') return;
    const idx = serverCategories.findIndex((c) => c.id === categoryId);
    if (idx === -1) return;
    serverCategories.splice(idx, 1);
    serverChannels.forEach((ch) => {
      if (ch.categoryId === categoryId) ch.categoryId = null;
    });
    persistDedicatedState();
    io.emit('servers_updated', [buildDedicatedServerPayload()]);
  });

  socket.on('reorder_channels', ({ updates, categoryOrder }: any) => {
    if (user.role !== 'admin') return;
    if (Array.isArray(updates)) {
      const validCats = new Set(serverCategories.map((c) => c.id));
      for (const upd of updates) {
        if (!upd || typeof upd.channelId !== 'string') continue;
        const ch = serverChannels.find((c) => c.id === upd.channelId);
        if (!ch) continue;
        if (upd.categoryId === null || upd.categoryId === '') ch.categoryId = null;
        else if (typeof upd.categoryId === 'string' && validCats.has(upd.categoryId)) ch.categoryId = upd.categoryId;
        if (typeof upd.position === 'number' && Number.isFinite(upd.position)) {
          ch.position = Math.max(0, Math.floor(upd.position));
        }
      }
      serverChannels.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    if (Array.isArray(categoryOrder)) {
      const orderMap = new Map<string, number>();
      categoryOrder.forEach((id: string, i: number) => orderMap.set(id, i));
      serverCategories.forEach((cat) => {
        if (orderMap.has(cat.id)) cat.position = orderMap.get(cat.id)!;
      });
      serverCategories.sort((a, b) => a.position - b.position);
    }
    persistDedicatedState();
    io.emit('servers_updated', [buildDedicatedServerPayload()]);
  });

  socket.on('dedicated_list_webhooks', () => {
    if (user.role !== 'admin') return;
    socket.emit('dedicated_webhooks_list', dedicatedWebhooks);
  });

  socket.on('dedicated_create_webhook', ({ channelId, name, avatar }: { channelId: string; name: string; avatar?: string }) => {
    if (user.role !== 'admin') return;
    const ch = serverChannels.find((c) => c.id === channelId && c.type !== 'voice' && c.type !== 'stage');
    const cleanName = String(name || '').trim().slice(0, 48);
    if (!ch || !cleanName || dedicatedWebhooks.length >= 25) return;
    const wh: DedicatedWebhook = {
      id: `dwh-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      channelId: ch.id,
      name: cleanName,
      avatar: avatar || '🔗',
      token: crypto.randomBytes(20).toString('base64url'),
      createdBy: user.username,
      createdAt: new Date().toISOString(),
    };
    dedicatedWebhooks.push(wh);
    persistDedicatedState();
    socket.emit('dedicated_webhooks_list', dedicatedWebhooks);
  });

  socket.on('dedicated_delete_webhook', ({ webhookId }: { webhookId: string }) => {
    if (user.role !== 'admin') return;
    const idx = dedicatedWebhooks.findIndex((w) => w.id === webhookId);
    if (idx === -1) return;
    dedicatedWebhooks.splice(idx, 1);
    persistDedicatedState();
    socket.emit('dedicated_webhooks_list', dedicatedWebhooks);
  });

  socket.on('dedicated_list_scheduled_messages', () => {
    if (user.role !== 'admin') return;
    socket.emit('dedicated_scheduled_messages_list', dedicatedScheduledMessages.filter((m) => m.status !== 'cancelled'));
  });

  socket.on('dedicated_create_scheduled_message', ({ channelId, content, scheduledFor, repeatIntervalMinutes }: any) => {
    if (user.role !== 'admin') return;
    const ch = serverChannels.find((c) => c.id === channelId && c.type !== 'voice' && c.type !== 'stage');
    const cleanContent = String(content || '').trim().slice(0, 2000);
    const parsed = new Date(String(scheduledFor || ''));
    if (!ch || !cleanContent || !Number.isFinite(parsed.getTime())) return;
    const repeat = Number(repeatIntervalMinutes);
    const entry: DedicatedScheduledMessage = {
      id: `dsched-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      channelId: ch.id,
      authorUsername: user.username,
      authorAvatar: user.avatar || '⏰',
      content: cleanContent,
      scheduledFor: parsed.toISOString(),
      ...(Number.isFinite(repeat) && repeat >= 5 ? { repeatIntervalMinutes: Math.min(43_200, Math.floor(repeat)) } : {}),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    dedicatedScheduledMessages.push(entry);
    persistDedicatedState();
    socket.emit('dedicated_scheduled_messages_list', dedicatedScheduledMessages.filter((m) => m.status !== 'cancelled'));
  });

  socket.on('dedicated_delete_scheduled_message', ({ id }: { id: string }) => {
    if (user.role !== 'admin') return;
    const item = dedicatedScheduledMessages.find((m) => m.id === id);
    if (!item) return;
    item.status = 'cancelled';
    persistDedicatedState();
    socket.emit('dedicated_scheduled_messages_list', dedicatedScheduledMessages.filter((m) => m.status !== 'cancelled'));
  });

  // Profile Update (Status message, bio, banner, avatar)
  socket.on('update_profile', ({ statusMessage, bio, bannerColor, avatar }: any) => {
    if (statusMessage !== undefined) user.statusMessage = statusMessage;
    if (bio !== undefined) user.bio = bio;
    if (bannerColor !== undefined) user.bannerColor = bannerColor;
    if (avatar !== undefined) user.avatar = avatar;

    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (acc) {
      if (statusMessage !== undefined) acc.statusMessage = statusMessage;
      if (bio !== undefined) acc.bio = bio;
      if (bannerColor !== undefined) acc.bannerColor = bannerColor;
      if (avatar !== undefined) acc.avatar = avatar;
      persistDedicatedState();
    }

    io.emit('user_updated', user);
    socket.emit('profile_updated', user);
  });

  // Direct 1-on-1 Voice Calling Relay
  socket.on('direct_call_start', ({ targetUserId }: { targetUserId: string }) => {
    let targetSocketId: string | null = null;
    for (const [sId, u] of connectedUsers.entries()) {
      if (u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase()) {
        targetSocketId = sId;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('direct_call_incoming', { callerUser: user });
    } else {
      socket.emit('direct_call_declined', { reason: 'Kullanıcı şu anda çevrimdışı.' });
    }
  });

  socket.on('direct_call_accept', ({ callerUserId }: { callerUserId: string }) => {
    for (const [sId, u] of connectedUsers.entries()) {
      if (u.id === callerUserId || u.username.toLowerCase() === callerUserId.toLowerCase()) {
        io.to(sId).emit('direct_call_accepted', { targetUser: user });
        break;
      }
    }
  });

  socket.on('direct_call_decline', ({ callerUserId }: { callerUserId: string }) => {
    for (const [sId, u] of connectedUsers.entries()) {
      if (u.id === callerUserId || u.username.toLowerCase() === callerUserId.toLowerCase()) {
        io.to(sId).emit('direct_call_declined', { reason: 'Arama reddedildi.' });
        break;
      }
    }
  });

  socket.on('direct_call_end', ({ targetUserId }: { targetUserId: string }) => {
    for (const [sId, u] of connectedUsers.entries()) {
      if (u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase()) {
        io.to(sId).emit('direct_call_ended');
        break;
      }
    }
  });

  // Friends System Events on Dedicated Server
  socket.on('get_friends_data', () => {
    socket.emit('friends_data', getDedicatedFriendsData(user.username));
  });

  socket.on('send_friend_request', ({ targetUsername }: { targetUsername: string }) => {
    const cleanTarget = targetUsername?.trim()?.toLowerCase();
    if (!cleanTarget) {
      return socket.emit('friend_request_response', { success: false, error: 'Lütfen bir kullanıcı adı girin.' });
    }

    if (cleanTarget === user.username.toLowerCase()) {
      return socket.emit('friend_request_response', { success: false, error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });
    }

    const targetAccount = registeredAccounts.get(cleanTarget);
    if (!targetAccount) {
      return socket.emit('friend_request_response', { success: false, error: `"${targetUsername}" adlı kullanıcı bulunamadı.` });
    }

    const senderAccount = registeredAccounts.get(user.username.toLowerCase());
    if (!senderAccount) return;

    if (senderAccount.friends?.map(f => f.toLowerCase()).includes(targetAccount.username.toLowerCase())) {
      return socket.emit('friend_request_response', { success: false, error: `"${targetAccount.username}" ile zaten arkadaşsınız.` });
    }

    for (const req of pendingDedicatedFriendRequests.values()) {
      if (req.fromUsername.toLowerCase() === user.username.toLowerCase() &&
          req.toUsername.toLowerCase() === targetAccount.username.toLowerCase()) {
        return socket.emit('friend_request_response', { success: false, error: 'Bu kullanıcıya zaten bekleyen bir istek gönderdiniz.' });
      }
      if (req.fromUsername.toLowerCase() === targetAccount.username.toLowerCase() &&
          req.toUsername.toLowerCase() === user.username.toLowerCase()) {
        if (!senderAccount.friends) senderAccount.friends = [];
        if (!targetAccount.friends) targetAccount.friends = [];
        senderAccount.friends.push(targetAccount.username.toLowerCase());
        targetAccount.friends.push(user.username.toLowerCase());
        pendingDedicatedFriendRequests.delete(req.id);
        persistDedicatedState();

        socket.emit('friend_request_response', { success: true, message: `${targetAccount.username} ile arkadaş oldunuz!` });
        socket.emit('friends_data', getDedicatedFriendsData(user.username));

        for (const [sId, u] of connectedUsers.entries()) {
          if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
            io.to(sId).emit('friends_data', getDedicatedFriendsData(targetAccount.username));
            io.to(sId).emit('friend_request_accepted', { friendUsername: user.username });
          }
        }
        return;
      }
    }

    const newReq = {
      id: `freq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fromUserId: socket.id,
      fromUsername: user.username,
      fromAvatar: user.avatar,
      toUserId: targetAccount.username,
      toUsername: targetAccount.username,
      createdAt: new Date().toLocaleDateString('tr-TR')
    };

    pendingDedicatedFriendRequests.set(newReq.id, newReq);
    persistDedicatedState();
    socket.emit('friend_request_response', { success: true, message: `${targetAccount.username} adlı kullanıcıya arkadaşlık isteği gönderildi!` });
    socket.emit('friends_data', getDedicatedFriendsData(user.username));

    for (const [sId, u] of connectedUsers.entries()) {
      if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
        io.to(sId).emit('friend_request_received', newReq);
        io.to(sId).emit('friends_data', getDedicatedFriendsData(targetAccount.username));
      }
    }
  });

  socket.on('accept_friend_request', ({ requestId }: { requestId: string }) => {
    const req = pendingDedicatedFriendRequests.get(requestId);
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

      pendingDedicatedFriendRequests.delete(requestId);
      persistDedicatedState();
      socket.emit('friends_data', getDedicatedFriendsData(user.username));

      for (const [sId, u] of connectedUsers.entries()) {
        if (u.username.toLowerCase() === senderAccount.username.toLowerCase()) {
          io.to(sId).emit('friends_data', getDedicatedFriendsData(senderAccount.username));
          io.to(sId).emit('friend_request_accepted', { friendUsername: user.username });
        }
      }
    }
  });

  socket.on('decline_friend_request', ({ requestId }: { requestId: string }) => {
    const req = pendingDedicatedFriendRequests.get(requestId);
    if (req) {
      pendingDedicatedFriendRequests.delete(requestId);
      persistDedicatedState();
      socket.emit('friends_data', getDedicatedFriendsData(user.username));

      for (const [sId, u] of connectedUsers.entries()) {
        if (u.username.toLowerCase() === req.fromUsername.toLowerCase()) {
          io.to(sId).emit('friends_data', getDedicatedFriendsData(req.fromUsername));
        }
      }
    }
  });

  socket.on('cancel_friend_request', ({ requestId }: { requestId: string }) => {
    const req = pendingDedicatedFriendRequests.get(requestId);
    if (req) {
      pendingDedicatedFriendRequests.delete(requestId);
      persistDedicatedState();
      socket.emit('friends_data', getDedicatedFriendsData(user.username));

      for (const [sId, u] of connectedUsers.entries()) {
        if (u.username.toLowerCase() === req.toUsername.toLowerCase()) {
          io.to(sId).emit('friends_data', getDedicatedFriendsData(req.toUsername));
        }
      }
    }
  });

  socket.on('remove_friend', ({ targetUsername }: { targetUsername: string }) => {
    const userAccount = registeredAccounts.get(user.username.toLowerCase());
    const targetAccount = registeredAccounts.get(targetUsername.toLowerCase());

    if (userAccount && targetAccount) {
      userAccount.friends = (userAccount.friends || []).filter(f => f.toLowerCase() !== targetUsername.toLowerCase());
      targetAccount.friends = (targetAccount.friends || []).filter(f => f.toLowerCase() !== user.username.toLowerCase());
      persistDedicatedState();

      socket.emit('friends_data', getDedicatedFriendsData(user.username));

      for (const [sId, u] of connectedUsers.entries()) {
        if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
          io.to(sId).emit('friends_data', getDedicatedFriendsData(targetAccount.username));
        }
      }
    }
  });

  // Voice Join
  socket.on('join_voice', ({ channelId }: any) => {
    if (user.currentVoiceChannelId && user.currentVoiceChannelId !== channelId) {
      socket.leave(user.currentVoiceChannelId);
      io.to(user.currentVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: user.currentVoiceChannelId });
    }

    user.currentVoiceChannelId = channelId;
    socket.join(channelId);

    const peersInRoom: any[] = [];
    for (const [sId, u] of connectedUsers.entries()) {
      if (u.currentVoiceChannelId === channelId && sId !== socket.id) {
        peersInRoom.push(u);
      }
    }

    socket.emit('voice_room_users', { channelId, peers: peersInRoom });
    socket.to(channelId).emit('user_joined_voice', { user, channelId });

    io.emit('voice_state_update', {
      userId: socket.id,
      channelId,
      isMuted: user.isMuted,
      isDeafened: user.isDeafened
    });
  });

  // Move user between voice channels
  socket.on('move_voice_user', ({ targetUserId, targetChannelId }: { targetUserId: string; targetChannelId: string }) => {
    const targetUser = connectedUsers.get(targetUserId);
    if (!targetUser) return;

    const targetChannel = serverChannels.find((c: any) => c.id === targetChannelId);
    if (!targetChannel || (targetChannel.type !== 'voice' && targetChannel.type !== 'stage')) return;

    const isSelf = targetUserId === socket.id;
    const isAdmin = user.role === 'admin';
    if (!isSelf && !isAdmin) return;
    if (targetUser.currentVoiceChannelId === targetChannelId) return;

    const targetSock = io.sockets.sockets.get(targetUserId);
    if (!targetSock) return;

    if (targetUser.currentVoiceChannelId) {
      const oldCh = targetUser.currentVoiceChannelId;
      targetSock.leave(oldCh);
      io.to(oldCh).emit('user_left_voice', { userId: targetUserId, channelId: oldCh });
    }

    targetUser.currentVoiceChannelId = targetChannelId;
    targetSock.join(targetChannelId);

    const peersInRoom: any[] = [];
    for (const [sId, u] of connectedUsers.entries()) {
      if (u.currentVoiceChannelId === targetChannelId && sId !== targetUserId) {
        peersInRoom.push(u);
      }
    }

    targetSock.emit('moved_to_voice_channel', {
      channelId: targetChannelId,
      channelName: targetChannel.name,
      movedBy: user.username,
      isSelf
    });
    targetSock.emit('voice_room_users', { channelId: targetChannelId, peers: peersInRoom });
    targetSock.to(targetChannelId).emit('user_joined_voice', { user: targetUser, channelId: targetChannelId });

    io.emit('voice_state_update', {
      userId: targetUserId,
      channelId: targetChannelId,
      isMuted: targetUser.isMuted,
      isDeafened: targetUser.isDeafened
    });
  });

  // Voice Leave
  socket.on('leave_voice', () => {
    if (!user.currentVoiceChannelId) return;
    const oldCh = user.currentVoiceChannelId;
    socket.leave(oldCh);
    user.currentVoiceChannelId = undefined;

    socket.to(oldCh).emit('user_left_voice', { userId: socket.id, channelId: oldCh });
    io.emit('voice_state_update', { userId: socket.id, channelId: null, isMuted: user.isMuted, isDeafened: user.isDeafened });
  });

  // WebRTC Signal Relay
  socket.on('webrtc_signal', ({ targetUserId, signal, type }: any) => {
    io.to(targetUserId).emit('webrtc_signal', {
      senderUserId: socket.id,
      signal,
      type
    });
  });

  socket.on('user_speaking', ({ isSpeaking }: any) => {
    user.isSpeaking = isSpeaking;
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('user_speaking_change', { userId: socket.id, isSpeaking });
    }
  });

  socket.on('screen_share_status', ({ isSharing }: any) => {
    user.isScreenSharing = isSharing;
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('screen_share_change', { userId: socket.id, isSharing });
    }
  });

  // Admin Request Data on Dedicated Server
  socket.on('admin_request_data', async () => {
    let masterDedicatedServers: any[] = [];
    let masterLicenses: any[] = [];
    let masterStoreSettings: any = null;

    try {
      const [resDed, resLic, resStore] = await Promise.all([
        fetch(`${MASTER_SERVER_URL}/api/dedicated/list`).catch(() => null),
        fetch(`${MASTER_SERVER_URL}/api/master/licenses`).catch(() => null),
        fetch(`${MASTER_SERVER_URL}/api/master/store-settings`).catch(() => null)
      ]);

      if (resDed && resDed.ok) {
        const json: any = await resDed.json();
        masterDedicatedServers = json.servers || [];
      }
      if (resLic && resLic.ok) {
        const json: any = await resLic.json();
        masterLicenses = json.licenses || [];
      }
      if (resStore && resStore.ok) {
        masterStoreSettings = await resStore.json();
      }
    } catch {}

    // If master list is empty or unreachable, include this dedicated server itself
    if (masterDedicatedServers.length === 0) {
      masterDedicatedServers = [{
        id: DEDICATED_SERVER_ID,
        serverName: config.serverName,
        host: config.host || `localhost:${PORT}`,
        port: PORT,
        licenseKey: config.licenseKey,
        licensee: license.licensee,
        tier: license.tier,
        maxSlots: license.maxSlots,
        onlineCount: connectedUsers.size,
        channelsCount: serverChannels.length,
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        lastHeartbeat: new Date().toISOString(),
        status: isLicenseRevoked ? 'revoked' : 'online'
      }];
    }

    // Ensure this dedicated server's own license is in the licenses list
    const hasOwnLicense = masterLicenses.some((l: any) => l.licenseKey === config.licenseKey || l.licensee === license.licensee);
    if (!hasOwnLicense) {
      masterLicenses.unshift({
        id: 'lic-dedicated-current',
        licenseKey: config.licenseKey,
        licensee: license.licensee,
        assignedUsername: 'admin',
        maxSlots: license.maxSlots,
        tier: license.tier,
        status: isLicenseRevoked ? 'revoked' : 'active',
        issuedAt: license.issuedAt || new Date().toISOString(),
        expiresAt: license.expiresAt,
        source: 'admin',
        activeServerHost: config.host || `localhost:${PORT}`
      });
    }

    socket.emit('admin_data_response', {
      stats: {
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        totalRegisteredUsers: registeredAccounts.size,
        activeSocketsCount: connectedUsers.size,
        activeVoiceRoomsCount: 0,
        totalMessagesCount: 0,
        totalDedicatedServersCount: Math.max(1, masterDedicatedServers.length)
      },
      registeredUsers: Array.from(registeredAccounts.values()).map(acc => ({
        id: `usr-${acc.username}`,
        username: acc.username,
        email: acc.email,
        role: acc.role,
        avatar: acc.avatar,
        status: Array.from(connectedUsers.values()).some(u => u.username === acc.username) ? 'online' : 'offline',
        createdAt: 'Bugün'
      })),
      servers: [buildDedicatedServerPayload()],
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          action: 'DEDICATED_PANEL',
          details: `Dedicated sunucu yönetim paneli senkronize edildi. Lisans: ${license.licensee} (${license.maxSlots} Slot)`,
          timestamp: new Date().toLocaleTimeString('tr-TR'),
          type: 'info'
        }
      ],
      dedicatedServers: masterDedicatedServers,
      issuedLicenses: masterLicenses,
      storeSettings: masterStoreSettings
    });
  });

  // Admin Actions Forwarding to Master
  socket.on('admin_revoke_license', async ({ licenseId, reason }: any) => {
    try {
      await fetch(`${MASTER_SERVER_URL}/api/master/license/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId, reason })
      });
    } catch {}

    // Check if this dedicated server's license was revoked
    if (licenseId === 'lic-dedicated-current' || licenseId === 'lic-init-1') {
      shutdownDueToLicenseRevocation(reason || 'Lisans sistem yöneticisi tarafından feshedildi.');
    } else {
      // Re-verify own license
      try {
        const checkRes = await fetch(`${MASTER_SERVER_URL}/api/dedicated/verify-license?licenseKey=${encodeURIComponent(config.licenseKey)}`);
        const d: any = await checkRes.json();
        if (checkRes.status === 403 || d.revoked || d.status === 'revoked') {
          shutdownDueToLicenseRevocation(reason || 'Lisans iptal edildi.');
        }
      } catch {}
    }

    // Refresh licenses to connected clients
    try {
      const res = await fetch(`${MASTER_SERVER_URL}/api/master/licenses`);
      if (res.ok) {
        const j: any = await res.json();
        io.emit('admin_licenses_list', j.licenses || []);
      }
    } catch {}
    socket.emit('admin_action_success', 'Lisans başarıyla iptal edildi.');
  });

  socket.on('admin_extend_license', async ({ licenseId, addDays }: any) => {
    try {
      const res = await fetch(`${MASTER_SERVER_URL}/api/master/license/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId, addDays })
      });
      if (res.ok) {
        const licRes = await fetch(`${MASTER_SERVER_URL}/api/master/licenses`);
        if (licRes.ok) {
          const j: any = await licRes.json();
          io.emit('admin_licenses_list', j.licenses || []);
        }
        socket.emit('admin_action_success', 'Lisans süresi başarıyla uzatıldı.');
      }
    } catch {}
  });

  socket.on('admin_generate_license', async (data: any) => {
    try {
      const res = await fetch(`${MASTER_SERVER_URL}/api/master/license/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json: any = await res.json();
      if (json.license) {
        socket.emit('admin_license_generated', json.license);
        const licRes = await fetch(`${MASTER_SERVER_URL}/api/master/licenses`);
        if (licRes.ok) {
          const j: any = await licRes.json();
          io.emit('admin_licenses_list', j.licenses || []);
        }
      }
    } catch {}
  });

  socket.on('admin_update_store_settings', async (newSettings: any) => {
    try {
      const res = await fetch(`${MASTER_SERVER_URL}/api/master/store-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        io.emit('store_settings_updated', newSettings);
        socket.emit('admin_action_success', 'Mağaza ayarları kaydedildi.');
      }
    } catch {}
  });

  // Store & User License Events on Dedicated Server
  socket.on('get_my_licenses', async () => {
    try {
      const res = await fetch(`${MASTER_SERVER_URL}/api/master/user-licenses?username=${encodeURIComponent(user.username)}`);
      if (res.ok) {
        const j: any = await res.json();
        socket.emit('my_licenses_response', j.licenses || []);
        return;
      }
    } catch {}

    // Fallback: If user is admin, show the server's own license
    if (user.role === 'admin' || user.username.toLowerCase() === 'admin') {
      socket.emit('my_licenses_response', [{
        id: 'lic-dedicated-current',
        licenseKey: config.licenseKey,
        licensee: license.licensee,
        assignedUsername: user.username,
        maxSlots: license.maxSlots,
        tier: license.tier,
        status: isLicenseRevoked ? 'revoked' : 'active',
        issuedAt: license.issuedAt || new Date().toISOString(),
        expiresAt: license.expiresAt,
        source: 'admin',
        activeServerHost: config.host || `localhost:${PORT}`
      }]);
    } else {
      socket.emit('my_licenses_response', []);
    }
  });

  socket.on('get_store_settings', async () => {
    try {
      const res = await fetch(`${MASTER_SERVER_URL}/api/master/store-settings`);
      if (res.ok) {
        const j = await res.json();
        socket.emit('store_settings_response', j);
      }
    } catch {}
  });

  socket.on('disconnect', () => {
    if (user.currentVoiceChannelId) {
      socket.to(user.currentVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: user.currentVoiceChannelId });
    }
    connectedUsers.delete(socket.id);
    io.emit('user_disconnected', socket.id);
    console.log(`[Ayrıldı] ${user.username} çıktı (${connectedUsers.size}/${license.maxSlots})`);
  });
});

const START_TIME = Date.now();
const DEDICATED_SERVER_ID = config.serverId || `ded-${PORT}-${Buffer.from(config.licenseKey).subarray(0, 8).toString('hex')}`;

function shutdownDueToLicenseRevocation(reason: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  isLicenseRevoked = true;

  console.log('\n============================================================');
  console.log('🚨 [DEDICATED SES SUNUCUSU LİSANSI İPTAL EDİLDİ]');
  console.log(`Sebep: ${reason}`);
  console.log('Sistem yöneticisi bu sunucunun lisansını uzaktan feshetti.');
  console.log('Tüm kullanıcı bağlantıları derhal kesiliyor ve sunucu kapatılıyor...');
  console.log('============================================================\n');

  // Notify all connected clients with a termination event
  try {
    io.emit('dedicated_server_terminated', {
      title: 'Sunucu Lisansı İptal Edildi',
      reason: reason || 'Sistem yöneticisi bu özel sunucunun lisansını feshetti.',
      action: 'disconnect'
    });
  } catch {}

  // Disconnect all sockets immediately and close server
  setTimeout(() => {
    try {
      io.disconnectSockets(true);
      server.close();
    } catch {}
    console.log('⛔ Dedicated ses sunucusu tamamen durduruldu.');
    process.exit(1);
  }, 400);
}

// Binary Stream Upload & Authenticated Media Serving (v1.1.0 Parity)
app.post(
  '/api/upload/stream',
  express.raw({ type: '*/*', limit: '25mb' }),
  async (req, res) => {
    const token = extractDedicatedToken(req);
    const verifiedUser = token ? verifyDedicatedToken(token) : null;
    if (!verifiedUser) {
      return res.status(401).json({ ok: false, error: 'Dosya yüklemek için oturum doğrulaması gereklidir.' });
    }
    const rawNameHeader = String(req.headers['x-file-name'] || '').trim();
    let decodedName: string;
    try {
      decodedName = decodeURIComponent(rawNameHeader);
    } catch {
      decodedName = rawNameHeader;
    }
    const cleanName = path.basename(decodedName || 'dosya').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').slice(0, 120);
    const ext = path.extname(cleanName).toLowerCase();
    if (DEDICATED_BLOCKED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ ok: false, error: 'Çalıştırılabilir veya tehlikeli dosya uzantıları engellenmiştir.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ ok: false, error: 'Geçersiz ikili dosya yükleme isteği.' });
    }
    const maxBytes = 25 * 1024 * 1024;
    if (req.body.length > maxBytes) {
      return res.status(413).json({ ok: false, error: 'Dosya boyutu 25 MB sınırını aşıyor.' });
    }

    const mimeType = String(req.headers['x-file-type'] || '').trim() || 'application/octet-stream';
    const safeExt = /^[a-z0-9.]{1,12}$/i.test(ext) ? ext : '';
    const storedName = `upl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
    const destPath = path.join(UPLOADS_DIR, storedName);
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.writeFile(destPath, req.body);

    const attachment = {
      id: `att-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name: cleanName,
      size: req.body.length,
      type: mimeType,
      url: `/uploads/${storedName}`,
    };
    return res.json({
      ok: true,
      attachment,
      url: attachment.url,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
    });
  }
);

app.get('/uploads/:filename', (req, res) => {
  const token = extractDedicatedToken(req);
  const queryMt = typeof req.query?.mt === 'string' ? req.query.mt.trim() : '';
  const authorized = (token && verifyDedicatedToken(token)) || (queryMt && verifyDedicatedToken(queryMt));
  if (!authorized) {
    return res.status(401).json({ ok: false, error: 'Bu dosyayı görüntülemek için oturum açmalısınız.' });
  }
  const safeName = path.basename(String(req.params.filename || ''));
  if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    return res.status(400).json({ ok: false, error: 'Geçersiz dosya adı.' });
  }
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'Dosya bulunamadı.' });
  }
  const ext = path.extname(safeName).toLowerCase();
  const inlineMime = DEDICATED_INLINE_MIME[ext];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (inlineMime) {
    res.setHeader('Content-Type', inlineMime);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  }
  return res.sendFile(filePath);
});

// Incoming Webhook Endpoint on Dedicated Server
app.post('/api/webhooks/:webhookId/:token', (req, res) => {
  const wh = dedicatedWebhooks.find((w) => w.id === req.params.webhookId);
  const provided = String(req.params.token || '').trim();
  if (!wh || !provided) {
    return res.status(401).json({ success: false, error: 'Geçersiz webhook kimliği.' });
  }
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  const expectedDigest = crypto.createHash('sha256').update(wh.token).digest();
  if (!crypto.timingSafeEqual(providedDigest, expectedDigest)) {
    return res.status(401).json({ success: false, error: 'Geçersiz webhook belirteci.' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
  let content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content && Array.isArray(body.commits) && body.repository?.full_name) {
    const repo = String(body.repository.full_name);
    content = `📦 **[${repo}]** ${body.commits.length} yeni commit pushlandı.`;
  } else if (!content && Array.isArray(body.embeds) && body.embeds[0]) {
    const emb = body.embeds[0];
    content = [emb.title ? `**${emb.title}**` : '', emb.description || ''].filter(Boolean).join('\n');
  }
  if (!content) {
    return res.status(400).json({ success: false, error: 'Webhook içeriği boş.' });
  }

  const msg = {
    id: `msg-wh-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    serverId: 'dedicated-server-root',
    channelId: wh.channelId,
    author: {
      id: `webhook-${wh.id}`,
      username: typeof body.username === 'string' && body.username.trim() ? body.username.trim() : `${wh.name} [Webhook]`,
      avatar: wh.avatar || '🔗',
    },
    content: content.slice(0, 2000),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    reactions: {},
  };

  if (!messages[wh.channelId]) messages[wh.channelId] = [];
  messages[wh.channelId].push(msg);
  wh.lastUsedAt = new Date().toISOString();
  persistDedicatedState();
  io.emit('new_message', msg);
  res.json({ success: true, messageId: msg.id });
});

// Remote revocation webhook endpoint (authenticated with the dedicated server licenseKey)
app.post('/api/license/revoked', (req, res) => {
  const providedKey = String(req.body?.licenseKey || req.headers['x-license-key'] || '').trim();
  const expectedKey = String(config.licenseKey || '').trim();
  const providedDigest = crypto.createHash('sha256').update(providedKey).digest();
  const expectedDigest = crypto.createHash('sha256').update(expectedKey).digest();
  if (!providedKey || !expectedKey || !crypto.timingSafeEqual(providedDigest, expectedDigest)) {
    return res.status(401).json({ success: false, error: 'Yetkisiz iptal sinyali: Geçersiz lisans anahtarı.' });
  }
  const { reason } = req.body || {};
  res.json({ success: true, message: 'Revocation signal received. Shutting down...' });
  shutdownDueToLicenseRevocation(reason || 'Sistem yöneticisi tarafından lisans iptal edildi.');
});

let hasReportedHeartbeat = false;
async function sendMasterHeartbeat() {
  if (isShuttingDown || isLicenseRevoked) return;

  const payload = {
    id: DEDICATED_SERVER_ID,
    serverName: config.serverName,
    host: config.host || `127.0.0.1:${PORT}`,
    port: PORT,
    licenseKey: config.licenseKey,
    channelsCount: serverChannels.length,
    onlineCount: connectedUsers.size,
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000)
  };

  const urlsToTry = Array.from(new Set([
    'http://127.0.0.1:4000',
    MASTER_SERVER_URL,
    'http://localhost:4000'
  ]));

  for (const masterUrl of urlsToTry) {
    try {
      const res = await fetch(`${masterUrl}/api/dedicated/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 403) {
        const resData: any = await res.json().catch(() => ({}));
        shutdownDueToLicenseRevocation(resData.error || 'Lisans anahtarı iptal edilmiştir veya geçersizdir.');
        return;
      }

      if (res.ok) {
        if (!hasReportedHeartbeat) {
          hasReportedHeartbeat = true;
          console.log(`✓ [MASTER SENKRON]: Ana sunucuya (${masterUrl}) başarıyla bağlandı ve tescil edildi.\n`);
        }
        return;
      }
    } catch {
      // Continue to next master URL attempt
    }
  }
}

async function notifyMasterShutdown() {
  try {
    await fetch(`${MASTER_SERVER_URL}/api/dedicated/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: DEDICATED_SERVER_ID, licenseKey: config.licenseKey })
    });
  } catch {}
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Sunucu kapatılıyor...');
  flushDedicatedStateSync();
  await notifyMasterShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  flushDedicatedStateSync();
  await notifyMasterShutdown();
  process.exit(0);
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ [HTTP Error]:', err instanceof Error ? err.message : String(err));
  if (res.headersSent) return;
  res.status(500).json({ success: false, error: 'Sunucu içi hata oluştu.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [LİSANSLI SUNUCU AKTİF]: ${config.serverName}`);
  console.log(`🌐 Port: ${PORT} | Kapasite: ${license.maxSlots} Slot | WebRTC HD Ses Hazır!\n`);

  // Master sunucuya anlık kayıt ve 2.5 saniyede bir kalp atışı (heartbeat)
  sendMasterHeartbeat();
  setInterval(sendMasterHeartbeat, 2500);

  // Dedicated zamanlanmış mesaj göndericisi (15s)
  const schedTimer = setInterval(() => {
    const nowMs = Date.now();
    let dirty = false;
    for (const item of dedicatedScheduledMessages) {
      if (item.status !== 'pending') continue;
      const dueMs = new Date(item.scheduledFor).getTime();
      if (!Number.isFinite(dueMs) || dueMs > nowMs) continue;
      const msg = {
        id: `msg-dsched-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        serverId: 'dedicated-server-root',
        channelId: item.channelId,
        author: {
          id: `scheduled-${item.id}`,
          username: item.authorUsername,
          avatar: item.authorAvatar || '⏰',
        },
        content: item.content,
        timestamp: new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reactions: {},
      };
      if (!messages[item.channelId]) messages[item.channelId] = [];
      messages[item.channelId].push(msg);
      io.emit('new_message', msg);
      item.lastSentAt = new Date(nowMs).toISOString();
      if (item.repeatIntervalMinutes && item.repeatIntervalMinutes >= 5) {
        const step = item.repeatIntervalMinutes * 60_000;
        let nextMs = dueMs + step;
        while (nextMs <= nowMs) nextMs += step;
        item.scheduledFor = new Date(nextMs).toISOString();
      } else {
        item.status = 'sent';
      }
      dirty = true;
    }
    if (dirty) persistDedicatedState();
  }, 15_000);
  schedTimer.unref?.();
});
