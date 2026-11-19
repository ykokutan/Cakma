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

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPasswordScrypt(password: string, stored: string): boolean {
  if (!stored || !password) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, originalHash] = parts;
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(derived, 'hex'));
    } catch {
      return false;
    }
  }
  return password === stored;
}

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
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];
try {
  const mOrigin = new URL(MASTER_SERVER_URL).origin;
  if (!defaultAllowedOrigins.includes(mOrigin)) defaultAllowedOrigins.push(mOrigin);
} catch {}

const envOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const configOrigins = Array.isArray(config.allowedOrigins) ? config.allowedOrigins.map((s: any) => String(s).trim()).filter(Boolean) : [];
const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envOrigins, ...configOrigins]));
const allowAllOrigins = Boolean(config.allowAllOrigins === true || process.env.ALLOW_ALL_ORIGINS === 'true');

const corsOriginValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

app.use(cors({ origin: corsOriginValidator, credentials: true }));
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

const registeredAccounts = new Map<string, Account>([
  [
    'admin',
    {
      username: 'admin',
      email: 'admin@dedicated.local',
      password: hashPasswordScrypt('admin123'),
      avatar: '🛡️',
      role: 'admin',
      statusMessage: '👑 Dedicated Sunucu Aktif',
      bannerColor: 'from-indigo-600 via-purple-600 to-pink-600',
      bio: 'Bu bağımsız lisanslı Dedicated ses sunucusunun sahibi ve yöneticisi.',
      badges: getDedicatedBadges('admin', 'admin'),
      friends: ['ahmet']
    }
  ],
  [
    'ahmet',
    {
      username: 'ahmet',
      email: 'ahmet@dedicated.local',
      password: hashPasswordScrypt('123456'),
      avatar: '🎮',
      role: 'user',
      statusMessage: '🎧 Müzik Dinliyor (Lo-Fi)',
      bannerColor: 'from-blue-600 via-cyan-600 to-teal-500',
      bio: 'Dedicated sunucuda oyun ve sohbet ediyor.',
      badges: getDedicatedBadges('user', 'ahmet'),
      friends: ['admin']
    }
  ]
]);

const pendingDedicatedFriendRequests = new Map<string, any>();

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
const serverChannels = (config.defaultChannels || [
  { name: 'genel-sohbet', type: 'text' },
  { name: 'Lobi Ses', type: 'voice' },
]).map((c: any, idx: number) => ({
  id: `ch-${c.type}-${idx + 1}`,
  name: c.name,
  type: c.type,
  serverId: 'dedicated-server-root'
}));

const messages: Record<string, any[]> = {};

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
    servers: [
      {
        id: 'dedicated-server-root',
        name: config.serverName,
        icon: '🛡️',
        channels: serverChannels
      }
    ],
    onlineUsers: Array.from(connectedUsers.values()),
    messages
  });
  socket.emit('friends_data', getDedicatedFriendsData(user.username));

  socket.broadcast.emit('user_connected', user);

  // 1. AUTH LOGIN
  socket.on('auth_login', ({ usernameOrEmail, password }: any) => {
    if (isLicenseRevoked || isShuttingDown) {
      return socket.emit('auth_response', { success: false, error: 'LİSANS İPTAL: Bu sunucunun lisansı feshedilmiştir. Giriş yapılamaz!' });
    }

    const query = usernameOrEmail?.trim()?.toLowerCase();
    if (!query || !password) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    let foundAccount: Account | undefined;
    for (const acc of registeredAccounts.values()) {
      if (acc.username.toLowerCase() === query || acc.email.toLowerCase() === query) {
        foundAccount = acc;
        break;
      }
    }

    if (!foundAccount || !verifyPasswordScrypt(password, foundAccount.password)) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
    }
    if (!foundAccount.password.startsWith('scrypt$')) {
      foundAccount.password = hashPasswordScrypt(password);
    }

    user.username = foundAccount.username;
    user.email = foundAccount.email;
    user.role = foundAccount.role;
    user.avatar = foundAccount.avatar;

    connectedUsers.set(socket.id, user);
    console.log(`[Giriş Başarılı] ${user.username} (${user.role}) yetkilendirildi.`);

    socket.emit('auth_response', { success: true, user });
    socket.emit('init_data', {
      currentUser: user,
      servers: [
        {
          id: 'dedicated-server-root',
          name: config.serverName,
          icon: '🛡️',
          channels: serverChannels
        }
      ],
      onlineUsers: Array.from(connectedUsers.values()),
      messages
    });

    io.emit('user_updated', user);
  });

  // 2. AUTH REGISTER
  socket.on('auth_register', ({ username, email, password, avatar }: any) => {
    const cleanUsername = username?.trim();
    if (!cleanUsername || !password) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    if (registeredAccounts.has(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    const role = cleanUsername.toLowerCase() === 'admin' ? 'admin' : 'user';
    const newAcc: Account = {
      username: cleanUsername,
      email: email?.trim() || `${cleanUsername.toLowerCase()}@dedicated.local`,
      password: hashPasswordScrypt(password),
      avatar: avatar || '🎮',
      role
    };

    registeredAccounts.set(cleanUsername.toLowerCase(), newAcc);
    user.username = newAcc.username;
    user.email = newAcc.email;
    user.role = newAcc.role;
    user.avatar = newAcc.avatar;

    connectedUsers.set(socket.id, user);
    console.log(`[Yeni Kayıt] ${user.username} (${user.role}) kaydoldu.`);

    socket.emit('auth_response', { success: true, user });
    socket.emit('init_data', {
      currentUser: user,
      servers: [
        {
          id: 'dedicated-server-root',
          name: config.serverName,
          icon: '🛡️',
          channels: serverChannels
        }
      ],
      onlineUsers: Array.from(connectedUsers.values()),
      messages
    });

    io.emit('user_updated', user);
  });

  // Messaging (Supports text & file attachments)
  socket.on('send_message', ({ channelId, content, attachments }: any) => {
    const textContent = (content || '').trim();
    if (!textContent && (!attachments || attachments.length === 0)) return;
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
      attachments: attachments || []
    };

    if (!messages[channelId]) messages[channelId] = [];
    messages[channelId].push(msg);

    io.emit('new_message', msg);
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
    if (!targetChannel || targetChannel.type !== 'voice') return;

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
      servers: [
        {
          id: 'dedicated-server-root',
          name: config.serverName,
          icon: '🛡️',
          channels: serverChannels
        }
      ],
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
  await notifyMasterShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await notifyMasterShutdown();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [LİSANSLI SUNUCU AKTİF]: ${config.serverName}`);
  console.log(`🌐 Port: ${PORT} | Kapasite: ${license.maxSlots} Slot | WebRTC HD Ses Hazır!\n`);

  // Master sunucuya anlık kayıt ve 2.5 saniyede bir kalp atışı (heartbeat)
  sendMasterHeartbeat();
  setInterval(sendMasterHeartbeat, 2500);
});
