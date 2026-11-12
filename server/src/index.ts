import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initialServers, initialMessages, getDefaultRoles } from './mockData.js';
import { User, Message, Server, AuditLog, SystemStats, DedicatedServerInfo, IssuedLicense, StoreSettings, UserBadge, MessageAttachment, FriendRequest, FriendUser, ServerRole, ServerMember, ServerPermission, RegisteredAccount, UserActivity } from './types.js';
import { generateLicenseKey, verifyLicenseKey } from './licenseGenerator.js';
import {
  loadAccounts, saveAccounts,
  loadServers, saveServers,
  loadMessages, saveMessages,
  loadLicenses, saveLicenses,
  loadStoreSettings, saveStoreSettings,
  loadAuditLogs, saveAuditLogs,
  loadFriendRequests, saveFriendRequests
} from './storage.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
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

function ensureUserInServers(user: User) {
  let changed = false;
  servers.forEach(srv => {
    if (!srv.members) { srv.members = []; changed = true; }
    if (!srv.roles) { srv.roles = getDefaultRoles(); changed = true; }
    const existing = srv.members.find(m => m.userId === user.id || m.username.toLowerCase() === user.username.toLowerCase());
    if (!existing) {
      const isOwner = srv.ownerId === user.id;
      srv.members.push({
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        roleIds: isOwner ? ['role-owner', 'role-admin'] : ['role-everyone'],
        joinedAt: new Date().toLocaleDateString('tr-TR'),
        isOwner
      });
      changed = true;
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
  io.emit('admin_new_log', newLog);
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
        io.emit('admin_dedicated_updated', existing);
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
  io.emit('admin_dedicated_updated', serverInfo);

  res.json({ success: true, message: 'Heartbeat kabul edildi.' });
});

app.post('/api/dedicated/shutdown', (req, res) => {
  const { id } = req.body;
  if (id && dedicatedServersRegistry.has(id)) {
    const s = dedicatedServersRegistry.get(id)!;
    s.status = 'offline';
    addAuditLog('DEDICATED_SUNUCU_KAPANDI', `Dedicated Ses Sunucusu kapandi: "${s.serverName}" (${s.host})`, 'warn');
    io.emit('admin_dedicated_updated', s);
  }
  res.json({ success: true });
});

app.get('/api/dedicated/list', (req, res) => {
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
      if (lic.status === 'revoked') {
        return res.status(403).json({
          valid: false,
          revoked: true,
          status: 'revoked',
          error: 'Bu lisans sistem yöneticisi tarafından feshedilmiştir.'
        });
      }
      return res.json({ valid: true, status: lic.status, data: licVerify.data });
    }
  }

  return res.json({ valid: true, status: 'active', data: licVerify.data });
});

// Master REST API for syncing licenses & settings across all dedicated servers & clients
app.get('/api/master/licenses', (req, res) => {
  res.json({
    success: true,
    licenses: Array.from(issuedLicenses.values())
  });
});

app.get('/api/master/user-licenses', (req, res) => {
  const username = (req.query.username as string)?.trim()?.toLowerCase();
  if (!username) {
    return res.json({ success: true, licenses: [] });
  }
  const userLics = Array.from(issuedLicenses.values()).filter(
    l => l.assignedUsername.toLowerCase() === username
  );
  res.json({ success: true, licenses: userLics });
});

app.post('/api/master/license/generate', (req, res) => {
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
  io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  res.json({ success: true, license: newLicense });
});

app.post('/api/master/license/revoke', (req, res) => {
  const { licenseId, reason } = req.body;
  const lic = issuedLicenses.get(licenseId);
  if (lic) {
    lic.status = 'revoked';
    io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));

    for (const s of dedicatedServersRegistry.values()) {
      if (s.licenseKey === lic.licenseKey || s.licensee.toLowerCase() === lic.licensee.toLowerCase()) {
        s.status = 'revoked';
        io.emit('admin_dedicated_updated', s);
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

app.post('/api/master/license/extend', (req, res) => {
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

  io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
  res.json({ success: true, license: lic });
});

app.get('/api/master/store-settings', (req, res) => {
  res.json(storeSettings);
});

app.post('/api/master/store-settings', (req, res) => {
  Object.assign(storeSettings, req.body);
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
      io.emit('admin_dedicated_updated', server);
    }
  }
  if (changed) {
    io.emit('admin_dedicated_list', Array.from(dedicatedServersRegistry.values()));
  }
}, 15000);

io.on('connection', (socket: Socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. REGISTER (Kayıt Olma)
  socket.on('auth_register', ({ username, email, password, avatar }: any) => {
    const cleanUsername = username?.trim();
    const cleanEmail = email?.trim()?.toLowerCase();

    if (!cleanUsername || !password) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı ve şifre zorunludur.' });
    }

    if (registeredAccounts.has(cleanUsername.toLowerCase())) {
      return socket.emit('auth_response', { success: false, error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Role assignment: if username is "admin" or first user, assign admin
    const isFirstUser = registeredAccounts.size === 0;
    const role = (cleanUsername.toLowerCase() === 'admin' || isFirstUser) ? 'admin' : 'user';

    const newAccount: RegisteredAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      username: cleanUsername,
      email: cleanEmail || `${cleanUsername.toLowerCase()}@local.com`,
      password,
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
    addAuditLog('YENI_KAYIT', `Yeni kullanıcı kaydoldu: ${cleanUsername} (${role})`, 'auth');

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
    ensureUserInServers(user);

    socket.emit('auth_response', { success: true, user });
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

    if (!foundAccount || foundAccount.password !== password) {
      return socket.emit('auth_response', { success: false, error: 'Kullanıcı adı veya şifre hatalı!' });
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
      bio: foundAccount.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.',
      badges: foundAccount.badges || getUserBadges(foundAccount.role, foundAccount.username, foundAccount.role === 'admin'),
      friends: foundAccount.friends || []
    };

    activeUsers.set(socket.id, user);
    ensureUserInServers(user);
    addAuditLog('GIRIS_BASARILI', `${user.username} (${user.role}) sisteme giriş yaptı.`, 'auth');

    socket.emit('auth_response', { success: true, user });
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

  // Text Messaging (Supports text, file attachments & interactive polls)
  socket.on('send_message', ({ serverId, channelId, content, attachments, poll }: { serverId: string; channelId: string; content?: string; attachments?: MessageAttachment[]; poll?: any }) => {
    const sender = activeUsers.get(socket.id);
    const textContent = (content || '').trim();
    if (!sender || (!textContent && (!attachments || attachments.length === 0) && !poll)) return;

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
      poll: poll || undefined
    };

    if (!messages[channelId]) {
      messages[channelId] = [];
    }
    messages[channelId].push(newMessage);
    saveMessages(messages);

    io.emit('new_message', newMessage);
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

  // Pin / Unpin Message
  socket.on('toggle_pin_message', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    const msg = channelMsgs.find(m => m.id === messageId);
    if (!msg) return;

    msg.isPinned = !msg.isPinned;
    saveMessages(messages);
    io.emit('message_pin_updated', { channelId, messageId, isPinned: msg.isPinned });
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

  // Soundboard in Voice Channel
  socket.on('voice_soundboard_play', ({ channelId, soundId }: { channelId: string; soundId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    io.to(channelId).emit('voice_soundboard_played', {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      soundId,
      channelId
    });
  });

  // Synchronized Radio & YouTube Music Bot in Voice Channel
  socket.on('voice_radio_state', (payload: any) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
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

  // Profile Update (Status message, bio, banner, avatar)
  socket.on('update_profile', ({ statusMessage, bio, bannerColor, avatar }: { statusMessage?: string; bio?: string; bannerColor?: string; avatar?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

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
      saveAccounts(registeredAccounts);
    }

    io.emit('user_updated', user);
    socket.emit('profile_updated', user);
    addAuditLog('PROFIL_GUNCELLE', `${user.username} profil bilgilerini güncelledi.`, 'info');
  });

  // Direct 1-on-1 Voice Calling Relay
  socket.on('direct_call_start', ({ targetUserId }: { targetUserId: string }) => {
    const caller = activeUsers.get(socket.id);
    if (!caller) return;

    let targetSocketId: string | null = null;
    for (const [sId, u] of activeUsers.entries()) {
      if (u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase()) {
        targetSocketId = sId;
        break;
      }
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('direct_call_incoming', { callerUser: caller });
    } else {
      socket.emit('direct_call_declined', { reason: 'Kullanıcı şu anda çevrimdışı.' });
    }
  });

  socket.on('direct_call_accept', ({ callerUserId }: { callerUserId: string }) => {
    const acceptor = activeUsers.get(socket.id);
    if (!acceptor) return;

    for (const [sId, u] of activeUsers.entries()) {
      if (u.id === callerUserId || u.username.toLowerCase() === callerUserId.toLowerCase()) {
        io.to(sId).emit('direct_call_accepted', { targetUser: acceptor });
        break;
      }
    }
  });

  socket.on('direct_call_decline', ({ callerUserId }: { callerUserId: string }) => {
    for (const [sId, u] of activeUsers.entries()) {
      if (u.id === callerUserId || u.username.toLowerCase() === callerUserId.toLowerCase()) {
        io.to(sId).emit('direct_call_declined', { reason: 'Arama reddedildi.' });
        break;
      }
    }
  });

  socket.on('direct_call_end', ({ targetUserId }: { targetUserId: string }) => {
    for (const [sId, u] of activeUsers.entries()) {
      if (u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase()) {
        io.to(sId).emit('direct_call_ended');
        break;
      }
    }
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
  socket.on('create_channel', ({ serverId, name, type }: { serverId: string; name: string; type: 'text' | 'voice' }) => {
    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;

    const newChannel = {
      id: `ch-${type}-${Date.now()}`,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      type,
      serverId
    };

    targetServer.channels.push(newChannel);
    saveServers(servers);
    addAuditLog('KANAL_OLUSTURULDU', `${targetServer.name} sunucusunda #${newChannel.name} (${type}) olusturuldu.`);
    io.emit('channel_created', { serverId, channel: newChannel });
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
  socket.on('update_server_settings', ({ serverId, name, icon, description, afkChannelId, bitrateKbps }: {
    serverId: string;
    name?: string;
    icon?: string;
    description?: string;
    afkChannelId?: string | null;
    bitrateKbps?: number;
  }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find(srv => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_server')) {
      return socket.emit('server_action_error', { message: 'Bu ayarları değiştirmek için Sunucu Yönetimi yetkiniz yok.' });
    }

    if (name) s.name = name.trim();
    if (icon) s.icon = icon;
    if (description !== undefined) s.description = description;
    if (afkChannelId !== undefined) s.afkChannelId = afkChannelId;
    if (bitrateKbps !== undefined) s.bitrateKbps = bitrateKbps;
    saveServers(servers);

    addAuditLog('SUNUCU_GUNCELLENDI', `${s.name} sunucu ayarlari guncellendi (Yetkili: ${user.username})`);
    io.emit('server_updated', s);
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

  // Voice Channel Join
  socket.on('join_voice', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    if (user.currentVoiceChannelId && user.currentVoiceChannelId !== channelId) {
      socket.leave(user.currentVoiceChannelId);
      io.to(user.currentVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: user.currentVoiceChannelId });
    }

    user.currentVoiceChannelId = channelId;
    socket.join(channelId);

    const peersInRoom: User[] = [];
    for (const [sId, u] of activeUsers.entries()) {
      if (u.currentVoiceChannelId === channelId && sId !== socket.id) {
        peersInRoom.push(u);
      }
    }

    socket.emit('voice_room_users', {
      channelId,
      peers: peersInRoom
    });

    socket.to(channelId).emit('user_joined_voice', {
      user,
      channelId
    });

    io.emit('voice_state_update', {
      userId: socket.id,
      channelId,
      isMuted: user.isMuted,
      isDeafened: user.isDeafened
    });

    addAuditLog('SESE_KATILDI', `${user.username} ses kanalina baglandi (${channelId})`, 'voice');
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
  });

  // WebRTC Signaling Relay
  socket.on('webrtc_signal', ({ targetUserId, signal, type }: { targetUserId: string; signal: any; type: 'offer' | 'answer' | 'candidate' }) => {
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
  socket.on('screen_share_status', ({ isSharing }: { isSharing: boolean }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    user.isScreenSharing = isSharing;
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('screen_share_change', {
        userId: socket.id,
        isSharing
      });
    }

    addAuditLog(
      isSharing ? 'EKRAN_YAYINI_BASLADI' : 'EKRAN_YAYINI_DURDU',
      `${user.username} ekran yayinini ${isSharing ? 'baslatti' : 'durdurdu'}.`,
      'voice'
    );
  });

  // User State Update (Mute, Deafen, Status)
  socket.on('update_user_state', ({ isMuted, isDeafened, status, username, avatar }: Partial<User>) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    if (isMuted !== undefined) user.isMuted = isMuted;
    if (isDeafened !== undefined) user.isDeafened = isDeafened;
    if (status !== undefined) user.status = status;
    if (username !== undefined) user.username = username;
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
        createdAt: acc.createdAt
      })),
      servers,
      auditLogs,
      dedicatedServers: Array.from(dedicatedServersRegistry.values()),
      issuedLicenses: Array.from(issuedLicenses.values()),
      storeSettings
    });
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

  // Admin: System Broadcast Announcement
  socket.on('admin_broadcast_announcement', ({ message }: { message: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    addAuditLog('SISTEM_DUYURUSU', `Genel duyuru yapildi: "${message}" (Yetkili: ${requester.username})`, 'warn');
    io.emit('system_announcement', {
      sender: requester.username,
      message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
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
    io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
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
      io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
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
          io.emit('admin_dedicated_updated', s);

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

    io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
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
      io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
      socket.emit('admin_action_success', `"${lic.licensee}" lisansı aktif duruma getirildi.`);
    }
  });

  // Admin: Store Settings & Pricing Management (Mağaza Ayarları & Fiyatlandırma)
  socket.on('admin_update_store_settings', (newSettings: StoreSettings) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    Object.assign(storeSettings, newSettings);
    saveStoreSettings(storeSettings);
    addAuditLog(
      'MAGAZA_AYARLARI_GUNCEL',
      `Mağaza ayarları güncellendi. Satış: ${storeSettings.isOpen ? 'AÇIK' : 'KAPALI (BAKIM)'} | İndirim: %${storeSettings.discountPercentage}`,
      'info'
    );

    io.emit('store_settings_updated', storeSettings);
    socket.emit('admin_action_success', 'Mağaza ayarları ve fiyatlandırma başarıyla kaydedildi.');
  });

  // ================= STORE & USER LICENSE EVENTS =================

  // Get Store Settings
  socket.on('get_store_settings', () => {
    socket.emit('store_settings_response', storeSettings);
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

    const slots = Number(maxSlots) || 16;
    const days = Number(expireDays) || 30;
    const selectedTier = (tier as 'Starter' | 'Pro' | 'Enterprise') || 'Starter';
    const cleanName = (serverName || `${user.username} Sunucusu`).trim();

    // Dynamic Price calculation based on storeSettings
    let basePrice = 99;
    if (selectedTier === 'Starter') {
      basePrice = storeSettings.packages.starter.price;
    } else if (selectedTier === 'Pro') {
      basePrice = storeSettings.packages.pro.price;
    } else if (selectedTier === 'Enterprise') {
      basePrice = storeSettings.packages.enterprise.price;
    } else {
      basePrice = slots * (storeSettings.customSlotUnitPrice || 4);
    }

    let multiplier = 1;
    if (days === 90) multiplier = 2.5;
    else if (days === 180) multiplier = 4.5;
    else if (days === 365) multiplier = 8;
    else if (days === -1) multiplier = 12; // Lifetime

    let totalPrice = Math.round(basePrice * multiplier);

    // Apply campaign discount
    if (storeSettings.discountPercentage > 0) {
      totalPrice = Math.max(1, Math.round(totalPrice * (1 - storeSettings.discountPercentage / 100)));
    }

    // Process payment
    if (selectedMethod === 'wallet') {
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
      status: 'active',
      issuedAt: new Date().toISOString(),
      expiresAt,
      price: totalPrice,
      source: 'store'
    };

    issuedLicenses.set(newLicense.id, newLicense);
    saveLicenses(issuedLicenses);

    addAuditLog(
      'MAGAZA_SATIS',
      `${user.username} mağazadan "${cleanName}" için ${slots} slot (${selectedTier}) lisans satın aldı (₺${totalPrice} - Ödeme: ${methodConfig.name})`,
      'auth'
    );

    socket.emit('store_purchase_response', { success: true, license: newLicense });

    // Emit user's updated licenses
    const userLics = Array.from(issuedLicenses.values()).filter(l => l.assignedUsername.toLowerCase() === user.username.toLowerCase());
    socket.emit('my_licenses_response', userLics);

    // Broadcast to admins
    io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
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

    const days = Number(addDays);
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

    if (selectedMethod === 'wallet') {
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
    }

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
    io.emit('admin_licenses_list', Array.from(issuedLicenses.values()));
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
      console.log(`[User Disconnected] ${user.username} (${socket.id})`);
    }
  });
});

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
