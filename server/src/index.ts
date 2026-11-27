import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import express from 'express';
import http from 'http';
import net from 'net';
import os from 'os';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { AccessToken } from 'livekit-server-sdk';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import {
  deliverEmail,
  extractBareEmail,
  maskEmail,
  type MailConfigInput,
  type MailSendResult,
} from './utils/mailDelivery.js';
import fs from 'fs';
import { initialServers, initialMessages, getDefaultRoles } from './mockData.js';
import { User, Message, Server, ServerCategory, Channel, AuditLog, SystemStats, DedicatedServerInfo, IssuedLicense, StoreSettings, UserBadge, MessageAttachment, FriendRequest, FriendUser, ServerRole, ServerMember, ServerPermission, RegisteredAccount, UserActivity, UserConnectionRecord, MemberLevelData, WatchTogetherState, MiniGameState, ServerAnalyticsData, GroupDmRoom, ServerWebhook, ChannelBridge, ServerAuditEntry, ServerModerationCase, ScheduledMessage, ServerBot, ServerAutomationRule, ContentReport } from './types.js';
import { isUserMemberOfServer, filterServersForUser, buildDiscoverableServerSummaries } from './utils/serverDiscovery.js';
import {
  buildPersistentDmChannelId,
  parseDmChannelParticipants,
  isUserParticipantInDm,
  isUserMemberOfGroupDm,
  findServerByChannelId,
  canUserAccessChannel,
} from './utils/channelAccess.js';
import { resolveChannelPermissions } from './utils/channelPermissions.js';
import {
  getPersistentUserId,
  findServerMember,
  isServerOwner,
  resolveServerLevelRecord,
} from './utils/serverIdentity.js';
import {
  RemoteAssistManager,
  RemoteAssistPermissions,
  DirectCallLogStatus,
  normalizeRemoteAssistPermissions,
  buildDirectCallLogContent,
} from './utils/remoteAssistState.js';
import {
  configureLicenseKeys,
  generateEd25519KeyPair,
  generateLicenseKey,
  verifyLicenseKey,
} from './licenseGenerator.js';
import { generateVapidKeyPair, sendWebPush, type VapidKeys } from './utils/webPush.js';
import { registerCloudSyncAndEvents } from './features/cloudSyncAndEvents.js';
import { registerHealthAndPushRoutes, pruneGifCache, clearGifCache } from './features/healthAndPushRoutes.js';
import { registerDedicatedAndMasterRoutes, notifyDedicatedLicenseRevoked } from './features/dedicatedRoutes.js';
import { registerTranslateRoute } from './features/translateRoute.js';
import { registerSummaryRoutes } from './features/summaryRoutes.js';
import {
  evaluateUserAchievements,
  isCosmeticUnlocked,
  unlockCosmeticWithWallet,
  VALID_AVATAR_FRAMES,
  VALID_NAME_GRADIENTS,
} from './utils/cosmeticsAndBadges.js';
import {
  generateBase32Secret,
  generateOtpAuthUri,
  verifyTotpCode,
  generateBackupCodes,
} from './totp.js';
import {
  getPersistentDir,
  loadAccounts, saveAccounts,
  loadServers, saveServers,
  loadMessages, saveMessages, saveChannelMessages,
  saveChannelMessageUpsert, saveChannelMessageDelete, saveChannelMessagesBulkDelete, saveChannelMessageBulkReplace,
  getChannelMessagesPageSmart,
  getChannelMessageContextSmart,
  saveUserReadCursor,
  deleteUserReadCursors,
  appendAuditLogRecord,
  loadLicenses, saveLicenses,
  loadStoreSettings, saveStoreSettings,
  loadAuditLogs, saveAuditLogs,
  loadFriendRequests, saveFriendRequests,
  loadConnectionLogs, saveConnectionLogs,
  loadServerLevels, saveServerLevels,
  loadSystemConfig, saveSystemConfig, SystemConfig,
  loadBannedIps, saveBannedIps, BannedIpRecord,
  loadPushSubscriptions, savePushSubscriptions,
  loadGroupDms, saveGroupDms,
  loadWebhooks, saveWebhooks,
  loadServerAuditLogs, saveServerAuditLogs,
  loadServerModerationCases, saveServerModerationCases,
  loadScheduledMessages, saveScheduledMessages,
  loadServerBots, saveServerBots,
  loadServerAutomations, saveServerAutomations,
  loadContentReports, saveContentReports,
  loadS3UploadsIndex, saveS3UploadsIndex, type S3UploadRecord,
  loadChannelBridges, saveChannelBridges,
  flushPendingWritesSync, getPendingWriteCount,
  getInitialMessagesSlice, getChannelMessagesPage, searchAllMessages,
  searchMessagesSmart, initStorageEngine, getStorageEngineInfo, sqliteStore, indexChannelMessage, removeIndexedMessage, closeStorageEngine,
  getStorageStats, exportAllDataBundle, importAllDataBundle,
  createScheduledBackup, listScheduledBackups, readScheduledBackup, deleteScheduledBackup
} from './storage.js';
import { normalizeLiveKitHttpUrl, shouldRoomUseSfu, buildIceServers } from './utils/sfuLogic.js';
import { validateAttachmentSafety } from './utils/security.js';
import { createAuthMiddlewares, validateExternalWebhookUrl } from './utils/adminAuth.js';
import { toPublicUser } from './utils/publicUser.js';
import { validatePasswordAgainstPolicy } from './utils/passwordPolicy.js';
import { logger, createRequestIdMiddleware, type RequestWithId } from './utils/logger.js';
import { createCorsOptionsDelegate, createSocketCorsOriginValidator } from './utils/corsConfig.js';
import { createSocketEventRateLimiter, validatePayload } from './utils/socketGuard.js';
import { shouldMoveUserToAfk } from './utils/afkVoiceHelper.js';
import { computeServerBoostSummary } from './utils/serverBoosts.js';
import { registerWatchTogetherAndGamesHandlers } from './features/watchTogetherAndGamesHandlers.js';
import {
  createAccountSecurityManager,
  registerAccountSecuritySocketHandlers,
  type AccountSecurityDeps,
} from './features/accountSecurityHandlers.js';
import { registerFriendsSocketHandlers } from './features/friendsSocketHandlers.js';
import { registerDirectCallSocketHandlers } from './features/directCallSocketHandlers.js';
import { registerChatMessageHandlers } from './features/chatMessageHandlers.js';
import { registerServerAdminSocketHandlers } from './features/serverAdminSocketHandlers.js';
import { registerChatEnhancementsRoutes } from './features/chatEnhancementsRoutes.js';
import { registerGroupDmSocketHandlers, getGroupDmsForUser } from './features/groupDmSocketHandlers.js';
import { registerWebhooksAndTemplatesRoutes } from './features/webhooksAndTemplatesRoutes.js';
import { registerPasskeyRoutes } from './features/passkeyRoutes.js';
import { registerOAuthAndConnectionsRoutes } from './features/oauthAndConnectionsRoutes.js';
import { ChannelBridgeService, registerChannelBridgeRoutes } from './features/channelBridgeService.js';
import { registerE2eePairingRoutes } from './features/e2eePairingRoutes.js';
import { registerComplianceAndReportsRoutes } from './features/complianceAndReportsRoutes.js';
import { registerAuthSocketHandlers } from './features/authSocketHandlers.js';
import { registerStoreSocketHandlers } from './features/storeSocketHandlers.js';
import {
  createServerGovernanceHelpers,
  registerServerGovernanceRoutes,
  registerServerGovernanceSocketHandlers,
  type ServerGovernanceDeps,
} from './features/serverGovernanceHandlers.js';
import {
  ScheduledMessagesService,
  registerScheduledMessagesRoutes,
} from './features/scheduledMessagesService.js';
import { registerWikiAndKanbanHandlers } from './features/wikiAndKanbanHandlers.js';
import {
  ensureStageState,
  handleUserLeaveStage,
  registerStageAndMediaSocketHandlers,
} from './features/stageAndMediaHandlers.js';
import {
  dispatchBotEvent,
  evaluateAutomationRules,
  registerBotCommandSocketHandlers,
  registerBotsAndAutomationRoutes,
} from './features/botsAndAutomationRoutes.js';
import { MaintenanceService, registerMaintenanceRoutes } from './features/maintenanceService.js';
import {
  hashPassword,
  verifyPassword,
  hashPasswordAsync,
  verifyPasswordAsync,
} from './utils/authCrypto.js';

export { hashPassword, verifyPassword, hashPasswordAsync, verifyPasswordAsync };

export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isSafeImageMedia(val: string): boolean {
  if (val.startsWith('data:image/')) {
    const match = val.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match || val.length > 3_500_000) return false;
    const fmt = match[1];
    try {
      const head = Buffer.from(match[2].slice(0, 32), 'base64');
      if (head.length < 4) return false;
      if (fmt === 'png') {
        return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      }
      if (fmt === 'jpeg' || fmt === 'jpg') {
        return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      }
      if (fmt === 'gif') {
        return head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
      }
      if (fmt === 'webp') {
        return (
          head.length >= 12 &&
          head.subarray(0, 4).toString('ascii') === 'RIFF' &&
          head.subarray(8, 12).toString('ascii') === 'WEBP'
        );
      }
    } catch {
      return false;
    }
    return false;
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
  lastAttempt?: number;
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
  entry.lastAttempt = now;
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
  entry.lastAttempt = now;
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
  'http://localhost:17420',
  'http://127.0.0.1:17420',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

const app = express();
app.use(createRequestIdMiddleware());

// 1. Native HTTP Security Headers (Equivalent to Helmet, zero external dependencies)
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://www.youtube.com https://s.ytimg.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; media-src 'self' data: blob: https: http:; connect-src 'self' https: http: wss: ws:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'"
  );
  res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=(), camera=(self), microphone=(self)');
  next();
});

// 1b. General REST API IP Rate Limiter (120 req/min per IP)
const apiRateLimits = new Map<string, { count: number; resetAt: number }>();
app.use('/api', (req, res, next) => {
  const fwd = req.headers['x-forwarded-for'];
  const ip =
    process.env.TRUST_PROXY === 'true' && typeof fwd === 'string'
      ? fwd.split(',')[0].trim()
      : (req.socket?.remoteAddress || req.ip || 'unknown');
  const now = Date.now();
  const entry = apiRateLimits.get(ip);
  if (!entry || now >= entry.resetAt) {
    apiRateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 120) {
    return res.status(429).json({ success: false, error: 'Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.' });
  }
  next();
});

// 2. Strict CORS Configuration (Clean non-throwing rejection + rate-limited log + same-host support)
app.use(cors(createCorsOptionsDelegate(ALLOWED_ORIGINS)));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const server = http.createServer(app);

// Hybrid SFU (LiveKit) WebSocket & HTTP Proxy on /livekit -> 127.0.0.1:7880
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://127.0.0.1:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const SFU_THRESHOLD = Math.max(2, Number(process.env.SFU_THRESHOLD) || 6);

let livekitHealthyCache: { ok: boolean; checkedAt: number; reason?: string } = { ok: false, checkedAt: 0 };

function getEffectiveLiveKitConfig() {
  return {
    enabled: systemConfig?.sfuEnabled !== false,
    threshold: Math.max(2, Number(systemConfig?.sfuThreshold) || SFU_THRESHOLD),
    url: normalizeLiveKitHttpUrl(systemConfig?.livekitUrl || '', LIVEKIT_URL),
    apiKey: (systemConfig?.livekitApiKey || '').trim() || LIVEKIT_API_KEY,
    apiSecret: (systemConfig?.livekitApiSecret || '').trim() || LIVEKIT_API_SECRET,
  };
}

function getEffectiveIceServers() {
  return buildIceServers({
    turnUrl: (systemConfig?.turnUrl || process.env.TURN_URL || '').trim(),
    turnUsername: (systemConfig?.turnUsername || process.env.TURN_USERNAME || '').trim(),
    turnCredential: (systemConfig?.turnCredential || process.env.TURN_CREDENTIAL || '').trim(),
  });
}

async function getLiveKitDiagnostics(): Promise<{
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  url: string;
  reason: string;
}> {
  const cfg = getEffectiveLiveKitConfig();
  if (!cfg.enabled) {
    return { enabled: false, configured: Boolean(cfg.apiKey && cfg.apiSecret), reachable: false, url: cfg.url, reason: 'Sistem ayarlarında SFU devre dışı.' };
  }
  if (!cfg.apiKey || !cfg.apiSecret) {
    return { enabled: true, configured: false, reachable: false, url: cfg.url, reason: 'LIVEKIT_API_KEY veya LIVEKIT_API_SECRET tanımlı değil.' };
  }
  const now = Date.now();
  if (now - livekitHealthyCache.checkedAt >= 15000) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 800);
      const resp = await fetch(cfg.url, { signal: controller.signal });
      clearTimeout(t);
      const ok = resp.status < 500;
      livekitHealthyCache = { ok, checkedAt: now, reason: ok ? 'Aktif ve erişilebilir' : `HTTP ${resp.status} hatası` };
    } catch (err: any) {
      livekitHealthyCache = { ok: false, checkedAt: now, reason: `LiveKit sunucusuna ulaşılamıyor (${cfg.url})` };
    }
  }
  return {
    enabled: true,
    configured: true,
    reachable: livekitHealthyCache.ok,
    url: cfg.url,
    reason: livekitHealthyCache.reason || (livekitHealthyCache.ok ? 'Aktif ve erişilebilir' : `LiveKit sunucusuna ulaşılamıyor (${cfg.url})`),
  };
}

async function isLiveKitAvailable(): Promise<boolean> {
  const diag = await getLiveKitDiagnostics();
  return diag.enabled && diag.configured && diag.reachable;
}

async function createLiveKitRoomToken(roomName: string, username: string): Promise<string | null> {
  const cfg = getEffectiveLiveKitConfig();
  if (!cfg.apiKey || !cfg.apiSecret) return null;
  try {
    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity: username,
      name: username,
      ttl: '6h',
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return await at.toJwt();
  } catch {
    return null;
  }
}

server.on('upgrade', (req, socket, head) => {
  const reqUrl = req.url || '';
  if (!reqUrl.startsWith('/livekit')) return;
  try {
    const lkUrl = new URL(getEffectiveLiveKitConfig().url);
    const targetPort = Number(lkUrl.port) || 7880;
    const targetHost = lkUrl.hostname || '127.0.0.1';
    const upstream = net.connect(targetPort, targetHost, () => {
      const strippedPath = reqUrl.replace(/^\/livekit/, '') || '/';
      let headersRaw = `${req.method || 'GET'} ${strippedPath} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) {
          headersRaw += `${k}: ${Array.isArray(v) ? v.join(', ') : v}\r\n`;
        }
      }
      headersRaw += '\r\n';
      upstream.write(headersRaw);
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => {
      try { socket.destroy(); } catch {}
    });
    socket.on('error', () => {
      try { upstream.destroy(); } catch {}
    });
  } catch {
    try { socket.destroy(); } catch {}
  }
});

const io = new SocketIOServer(server, {
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB packet limit to prevent memory DoS
  cors: {
    origin: createSocketCorsOriginValidator(ALLOWED_ORIGINS),
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
      addedAt: 'Arkadaş',
      e2eePublicKey: onlineUser?.e2eePublicKey || fAcc?.e2eePublicKey,
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
const groupDms: GroupDmRoom[] = loadGroupDms();
const webhooks: ServerWebhook[] = loadWebhooks();
const channelBridges: ChannelBridge[] = loadChannelBridges();
const serverAuditLogs: Record<string, ServerAuditEntry[]> = loadServerAuditLogs();
const serverCases: Record<string, ServerModerationCase[]> = loadServerModerationCases();
const scheduledMessages: ScheduledMessage[] = loadScheduledMessages();
const serverBots: ServerBot[] = loadServerBots();
const serverAutomations: ServerAutomationRule[] = loadServerAutomations();
const contentReports: ContentReport[] = loadContentReports();
const automationSpamTracker = new Map<string, number[]>();
const governanceHelpers = createServerGovernanceHelpers({
  serverAuditLogs,
  serverCases,
  saveServerAuditLogs,
  saveServerModerationCases,
});

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
  const targetServer = servers.find(s => s.id === serverId);
  if (!serverLevels[serverId]) serverLevels[serverId] = {};
  const userLevels = serverLevels[serverId];
  const { key: persistentKey, record: data } = resolveServerLevelRecord(userLevels, user);
  data.xp += amount;
  if (isMessage) data.messageCount += 1;
  const newLevel = Math.max(1, Math.floor(0.2 * Math.sqrt(data.xp)));
  if (newLevel > data.level) {
    data.level = newLevel;
    const payload = {
      serverId,
      userId: persistentKey,
      username: user.username,
      level: newLevel,
      xp: data.xp
    };
    if (targetServer) {
      emitToServerMembers(targetServer, 'member_level_up', payload);
    } else {
      emitToUserSockets(user.username, 'member_level_up', payload);
    }
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
        const { key: persistentKey, record } = resolveServerLevelRecord(userLevels, user);
        record.xp += 10;
        record.voiceMinutes += 1;
        const newLevel = Math.max(1, Math.floor(0.2 * Math.sqrt(record.xp)));
        if (newLevel > record.level) {
          record.level = newLevel;
          emitToServerMembers(server, 'member_level_up', {
            serverId: server.id,
            userId: persistentKey,
            username: user.username,
            level: newLevel,
            xp: record.xp
          });
        }
      }
    }
  }
  saveServerLevels(serverLevels);
}, 60000);

function emitToUserSockets(username: string, event: string, payload: unknown) {
  const targetLower = username.trim().toLowerCase();
  for (const [sId, u] of activeUsers.entries()) {
    if (u.username.toLowerCase() === targetLower) {
      io.to(sId).emit(event, payload);
    }
  }
}

function emitToServerMembers(srv: Server, event: string, payload: unknown) {
  for (const [sId, u] of activeUsers.entries()) {
    if (isUserMemberOfServer(u, srv)) {
      io.to(sId).emit(event, payload);
    }
  }
}

function emitToVoiceChannelAudience(
  channelId: string | null | undefined,
  fallbackUser: User | undefined,
  event: string,
  payload: unknown
) {
  if (channelId && channelId.startsWith('voice-gdm-')) {
    const room = groupDms.find((g) => g.voiceChannelId === channelId || g.id === channelId);
    if (room) {
      room.members.forEach((m) => emitToUserSockets(m, event, payload));
      return;
    }
  }
  const srv = channelId ? findServerByChannelId(servers, channelId) : undefined;
  if (srv) {
    emitToServerMembers(srv, event, payload);
    return;
  }
  if (fallbackUser) {
    emitToUserSockets(fallbackUser.username, event, payload);
  }
}

function emitServerUpdatedToMembers(srv: Server) {
  emitToServerMembers(srv, 'server_updated', srv);
}

function emitServersUpdatedForAll() {
  for (const [sId, u] of activeUsers.entries()) {
    io.to(sId).emit('servers_updated', filterServersForUser(servers, u));
  }
}

function emitToAdmins(event: string, payload: unknown) {
  for (const [sId, u] of activeUsers.entries()) {
    if (u.role === 'admin') {
      io.to(sId).emit(event, payload);
    }
  }
}

function emitToRelevantUsers(subjectUser: User, event: string, payload: unknown) {
  const subjectLower = subjectUser.username.toLowerCase();
  const subjectServers = filterServersForUser(servers, subjectUser);
  const subjectAcc = registeredAccounts.get(subjectLower);
  const friendSet = new Set((subjectAcc?.friends || []).map((f) => f.toLowerCase()));

  for (const [sId, u] of activeUsers.entries()) {
    const uLower = u.username.toLowerCase();
    const sharesServer = subjectServers.some((srv) => isUserMemberOfServer(u, srv));
    if (
      u.id === subjectUser.id ||
      uLower === subjectLower ||
      u.role === 'admin' ||
      friendSet.has(uLower) ||
      sharesServer
    ) {
      io.to(sId).emit(event, payload);
    }
  }
}

function emitToChannelAudience(
  channelId: string,
  serverId: string | undefined,
  event: string,
  payload: unknown,
  excludeSocketId?: string
) {
  if (!channelId) return;
  if (channelId.startsWith('gdm-')) {
    for (const [sId, u] of activeUsers.entries()) {
      if (excludeSocketId && sId === excludeSocketId) continue;
      if (isUserMemberOfGroupDm(u, channelId, groupDms)) {
        io.to(sId).emit(event, payload);
      }
    }
    return;
  }
  if (channelId.startsWith('dm-') || serverId === 'direct-messages') {
    const channelMsgs = messages[channelId];
    for (const [sId, u] of activeUsers.entries()) {
      if (excludeSocketId && sId === excludeSocketId) continue;
      if (isUserParticipantInDm(u, channelId, channelMsgs)) {
        io.to(sId).emit(event, payload);
      }
    }
    return;
  }
  const srv = findServerByChannelId(servers, channelId, serverId);
  if (!srv) return;
  for (const [sId, u] of activeUsers.entries()) {
    if (excludeSocketId && sId === excludeSocketId) continue;
    if (isUserMemberOfServer(u, srv)) {
      io.to(sId).emit(event, payload);
    }
  }
}

function getInitialMessagesForServers(userServers: Server[], username: string, userId?: string, role?: string) {
  const { initialMessages, hasMoreMessages } = getInitialMessagesSlice(messages, 60);
  const allowedChannelIds = new Set<string>();
  const effectiveRole = role ?? registeredAccounts.get(username.toLowerCase())?.role;
  const userIdentity = { id: userId, username, role: effectiveRole };
  userServers.forEach((s) =>
    s.channels.forEach((c) => {
      if (resolveChannelPermissions(userIdentity, s, c).view_channel) {
        allowedChannelIds.add(c.id);
      }
    })
  );
  const scopedMessages: Record<string, Message[]> = {};
  const scopedHasMore: Record<string, boolean> = {};
  for (const [chId, msgs] of Object.entries(initialMessages)) {
    const isAllowedServerCh = allowedChannelIds.has(chId);
    const isAllowedDmCh =
      chId.startsWith('dm-') && isUserParticipantInDm({ id: userId, username }, chId, msgs);
    const isAllowedGroupDmCh =
      chId.startsWith('gdm-') && isUserMemberOfGroupDm({ username }, chId, groupDms);
    if (isAllowedServerCh || isAllowedDmCh || isAllowedGroupDmCh) {
      scopedMessages[chId] = msgs;
      if (hasMoreMessages[chId]) scopedHasMore[chId] = true;
    }
  }
  return { initialMessages: scopedMessages, hasMoreMessages: scopedHasMore };
}

function syncUserMembershipProfiles(user: User) {
  const persistentId = getPersistentUserId(user);
  if (!persistentId) return;
  let changed = false;
  servers.forEach((srv) => {
    if (!srv.members) { srv.members = []; changed = true; }
    if (!srv.roles) { srv.roles = getDefaultRoles(); changed = true; }
    const existing = findServerMember(srv, user);
    if (existing) {
      if (existing.userId !== persistentId || existing.avatar !== user.avatar || existing.username !== user.username) {
        existing.userId = persistentId;
        existing.avatar = user.avatar;
        existing.username = user.username;
        changed = true;
      }
      if (existing.isOwner && srv.ownerId !== persistentId) {
        srv.ownerId = persistentId;
        changed = true;
      }
    } else if (user.role === 'admin' && srv.ownerId === 'usr-admin-system' && srv.members.length === 0) {
      srv.ownerId = persistentId;
      srv.members.push({
        userId: persistentId,
        username: user.username,
        avatar: user.avatar,
        roleIds: ['role-owner', 'role-admin'],
        joinedAt: new Date().toLocaleDateString('tr-TR'),
        isOwner: true,
      });
      changed = true;
    }
  });
  if (changed) {
    saveServers(servers);
  }
}

function addUserToServer(user: User, srv: Server): boolean {
  if (!srv.members) srv.members = [];
  if (!srv.roles) srv.roles = getDefaultRoles();
  if (isUserMemberOfServer(user, srv)) {
    return false;
  }
  const persistentId = getPersistentUserId(user);
  const initialRoles = ['role-everyone'];
  if (srv.autoRoleId && !initialRoles.includes(srv.autoRoleId)) {
    initialRoles.push(srv.autoRoleId);
  }
  srv.members.push({
    userId: persistentId,
    username: user.username,
    avatar: user.avatar,
    roleIds: initialRoles,
    joinedAt: new Date().toLocaleDateString('tr-TR'),
    isOwner: false,
  });

  if (srv.welcomeEnabled && srv.welcomeChannelId) {
    const targetChannel = srv.channels.find((c) => c.id === srv.welcomeChannelId);
    if (targetChannel) {
      const welcomeText = srv.welcomeMessage
        ? srv.welcomeMessage.replace(/{user}/g, user.username).replace(/{server}/g, srv.name)
        : `🎉 **${user.username}** sunucumuza katıldı! Hoş geldin! 🚀`;

      const welcomeMsg: Message = {
        id: `msg-welcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        serverId: srv.id,
        channelId: srv.welcomeChannelId,
        author: {
          id: 'system-bot',
          username: 'Karşılama Botu 🤖',
          avatar: '👋',
        },
        content: welcomeText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reactions: { '🎉': [user.username] },
      };
      if (!messages[srv.welcomeChannelId]) messages[srv.welcomeChannelId] = [];
      messages[srv.welcomeChannelId].push(welcomeMsg);
      saveChannelMessageUpsert(srv.welcomeChannelId, messages[srv.welcomeChannelId], welcomeMsg);
      emitToServerMembers(srv, 'new_message', welcomeMsg);
    }
  }

  // Trigger v1.0.0 member_join automation rules & bot webhooks
  const autoRes = evaluateAutomationRules(
    { type: 'member_join', server: srv, username: user.username, userRole: user.role },
    serverAutomations,
    automationSpamTracker
  );
  const addedMember = srv.members[srv.members.length - 1];
  if (addedMember && autoRes.assignRoleIds.length > 0) {
    for (const rId of autoRes.assignRoleIds) {
      if (!addedMember.roleIds.includes(rId)) addedMember.roleIds.push(rId);
    }
  }
  for (const notice of autoRes.notices) {
    const noticeMsg: Message = {
      id: `msg-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serverId: srv.id,
      channelId: notice.channelId,
      author: { id: 'system-automod', username: 'Otomasyon Botu ⚙️', avatar: '🤖' },
      content: notice.content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
    };
    if (!messages[notice.channelId]) messages[notice.channelId] = [];
    messages[notice.channelId].push(noticeMsg);
    saveChannelMessageUpsert(notice.channelId, messages[notice.channelId], noticeMsg);
    emitToChannelAudience(notice.channelId, srv.id, 'new_message', noticeMsg);
  }
  void dispatchBotEvent('member_join', srv.id, { userId: user.id, username: user.username }, serverBots);

  saveServers(servers);
  return true;
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
  inviteOnlyRegistration: false,
  registrationInvites: [],
  defaultWalletBalance: 100,
  maxAccountsPerIpPerDay: 3,
  requireUniqueEmail: true,
  requireEmailVerification: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailRelayUrl: '',
  mailRelaySecret: '',
  maintenanceMode: false,
  maintenanceMessage: 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.',
  maxMessageLength: 2000,
  defaultSlowmodeSeconds: 0,
  maxUploadSizeMb: 5,
  requireStrongPasswords: false,
  requireAdmin2FA: false,
  maxLoginAttempts: 5,
  loginLockoutMinutes: 15,
  globalBlockLinks: false,
  globalBannedWords: [],
  pinnedBanner: null,
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  maxBackupsToKeep: 7,
  backupS3Enabled: false,
  backupS3Endpoint: '',
  backupS3Bucket: '',
  backupS3Region: 'auto',
  backupS3AccessKey: '',
  backupS3SecretKey: '',
  backupS3Prefix: 'cakma-backups/',
  backupS3AutoPush: false,
  mediaS3Enabled: false,
  mediaS3UseBackupCredentials: true,
  mediaS3Endpoint: '',
  mediaS3Bucket: '',
  mediaS3Region: 'auto',
  mediaS3AccessKey: '',
  mediaS3SecretKey: '',
  mediaS3Prefix: 'uploads/',
  mediaS3PublicBaseUrl: '',
  mediaS3MinSizeKb: 0,
  steamAuthEnabled: true,
  steamWebApiKey: '',
  githubClientId: '',
  githubClientSecret: '',
  googleClientId: '',
  googleClientSecret: '',
  oauthPublicBaseUrl: '',
  webhookUrl: '',
  giphyApiKey: '',
  aiSummaryProvider: 'builtin',
  aiSummaryApiKey: '',
  aiSummaryModel: '',
  sfuEnabled: true,
  sfuThreshold: SFU_THRESHOLD,
  livekitUrl: '',
  livekitApiKey: '',
  livekitApiSecret: '',
  turnUrl: '',
  turnUsername: '',
  turnCredential: '',
  webhookEvents: {
    security: true,
    bans: true,
    dedicated: true,
    backups: false,
  },
};
let systemConfig: SystemConfig = loadSystemConfig(defaultSystemConfig);
let bannedIps: BannedIpRecord[] = loadBannedIps();
const s3UploadsIndex: Record<string, S3UploadRecord> = loadS3UploadsIndex();

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
  const validation = await validateExternalWebhookUrl(url);
  if (!validation.ok || !validation.normalizedUrl) return false;
  try {
    const res = await fetch(validation.normalizedUrl, {
      method: 'POST',
      redirect: 'error',
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
      if (systemConfig.backupS3Enabled && systemConfig.backupS3AutoPush) {
        void maintenanceService.pushBackupToS3(info.filename, systemConfig);
      }
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
  appendAuditLogRecord(newLog, auditLogs);

  // Notify any active admin panels listening
  io.to('admins').emit('admin_new_log', newLog);
}

// User Connection & IP Logs
const connectionLogs: UserConnectionRecord[] = loadConnectionLogs();

function extractClientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  let ip: string;
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
let pushSubscriptions = loadPushSubscriptions();

let lastCpuUsage = process.cpuUsage();
let lastCpuSampleAt = Date.now();

function buildRuntimeMetrics() {
  const mem = process.memoryUsage();
  const now = Date.now();
  const elapsedMs = Math.max(100, now - lastCpuSampleAt);
  const delta = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuSampleAt = now;
  const cpuCount = Math.max(1, os.cpus().length);
  const cpuPercent = Number(
    Math.min(100, Math.max(0, (((delta.user + delta.system) / 1000) / (elapsedMs * cpuCount)) * 100)).toFixed(1)
  );

  const activeVoiceRooms = new Set<string>();
  let voiceParticipantsCount = 0;
  activeUsers.forEach((u) => {
    if (u.currentVoiceChannelId) {
      activeVoiceRooms.add(u.currentVoiceChannelId);
      voiceParticipantsCount++;
    }
  });
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    onlineUsers: activeUsers.size,
    serverCount: servers.length,
    activeVoiceRooms: activeVoiceRooms.size,
    voiceParticipantsCount,
    cpuPercent,
    memoryRssMb: Math.round(mem.rss / 1048576),
    memoryHeapUsedMb: Math.round(mem.heapUsed / 1048576),
    pendingStorageWrites: getPendingWriteCount(),
    storageEngine: getStorageEngineInfo().engine,
    livekitEnabled: systemConfig.sfuEnabled !== false,
    pushSubscriptionCount: pushSubscriptions.length,
  };
}

// Health, Metrics, Web Push & GIF endpoints are modularized in features/healthAndPushRoutes.ts
// Dedicated Server & Master License endpoints are modularized in features/dedicatedRoutes.ts

// Master REST API Key, Session Secret, Ed25519 License Keys & VAPID Web Push Keys
interface ServerSecretsStore {
  masterApiKey?: string;
  sessionSecret?: string;
  licensePrivateKeyPem?: string;
  licensePublicKeyPem?: string;
  vapidPublicKey?: string;
  vapidPrivateKeyPem?: string;
  vapidSubject?: string;
}

function loadOrCreateServerSecrets(): {
  masterApiKey: string;
  sessionSecret: string;
  licensePrivateKeyPem: string;
  licensePublicKeyPem: string;
  vapidKeys: VapidKeys;
} {
  const secretsDir = getPersistentDir();
  const secretsFile = path.join(secretsDir, '.secrets.json');
  const legacySecretsFile = path.join(__dirname, '..', 'data', '.secrets.json');

  let stored: ServerSecretsStore = {};
  try {
    if (fs.existsSync(secretsFile)) {
      stored = JSON.parse(fs.readFileSync(secretsFile, 'utf-8')) as ServerSecretsStore;
    } else if (fs.existsSync(legacySecretsFile)) {
      stored = JSON.parse(fs.readFileSync(legacySecretsFile, 'utf-8')) as ServerSecretsStore;
    }
  } catch {}

  const envMaster = process.env.MASTER_API_KEY?.trim();
  const envSession = process.env.SESSION_SECRET?.trim();
  const envLicPriv = process.env.LICENSE_PRIVATE_KEY?.trim();
  const envLicPub = process.env.LICENSE_PUBLIC_KEY?.trim();
  const envVapidPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envVapidPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const envVapidSub = process.env.VAPID_SUBJECT?.trim();

  const masterApiKey = envMaster || stored.masterApiKey || crypto.randomBytes(32).toString('hex');
  const sessionSecret = envSession || stored.sessionSecret || crypto.randomBytes(32).toString('hex');

  let licensePrivateKeyPem = envLicPriv || stored.licensePrivateKeyPem || '';
  let licensePublicKeyPem = envLicPub || stored.licensePublicKeyPem || '';
  if (!licensePrivateKeyPem || !licensePublicKeyPem) {
    const pair = generateEd25519KeyPair();
    licensePrivateKeyPem = licensePrivateKeyPem || pair.privateKeyPem;
    licensePublicKeyPem = licensePublicKeyPem || pair.publicKeyPem;
  }

  let vapidPublicKey = envVapidPub || stored.vapidPublicKey || '';
  let vapidPrivateKeyPem = envVapidPriv || stored.vapidPrivateKeyPem || '';
  const vapidSubject = envVapidSub || stored.vapidSubject || 'mailto:admin@ses.yahyakemalokutan.com';
  if (!vapidPublicKey || !vapidPrivateKeyPem) {
    const generated = generateVapidKeyPair(vapidSubject);
    vapidPublicKey = vapidPublicKey || generated.publicKey;
    vapidPrivateKeyPem = vapidPrivateKeyPem || generated.privateKeyPem;
  }

  const nextStore: ServerSecretsStore = {
    masterApiKey,
    sessionSecret,
    licensePrivateKeyPem,
    licensePublicKeyPem,
    vapidPublicKey,
    vapidPrivateKeyPem,
    vapidSubject,
  };

  if (
    !fs.existsSync(secretsFile) ||
    !stored.masterApiKey ||
    !stored.sessionSecret ||
    !stored.licensePrivateKeyPem ||
    !stored.licensePublicKeyPem ||
    !stored.vapidPublicKey ||
    !stored.vapidPrivateKeyPem
  ) {
    try {
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(secretsFile, JSON.stringify(nextStore, null, 2), { mode: 0o600 });
    } catch {}
  }

  return {
    masterApiKey,
    sessionSecret,
    licensePrivateKeyPem,
    licensePublicKeyPem,
    vapidKeys: {
      publicKey: vapidPublicKey,
      privateKeyPem: vapidPrivateKeyPem,
      subject: vapidSubject,
    },
  };
}

const serverSecrets = loadOrCreateServerSecrets();
const MASTER_API_KEY = serverSecrets.masterApiKey;
const SESSION_SECRET = serverSecrets.sessionSecret;
const VAPID_KEYS = serverSecrets.vapidKeys;
configureLicenseKeys({
  privateKeyPem: serverSecrets.licensePrivateKeyPem,
  publicKeyPem: serverSecrets.licensePublicKeyPem,
  allowLegacyHmac: process.env.ALLOW_LEGACY_HMAC_LICENSES !== 'false',
});

async function sendWebPushToUsername(
  username: string,
  payload: { title: string; body: string; url?: string; channelId?: string; dmUsername?: string }
): Promise<void> {
  const targetLower = String(username || '').trim().toLowerCase();
  if (!targetLower) return;
  const targets = pushSubscriptions.filter((s) => s.username.toLowerCase() === targetLower);
  if (targets.length === 0) return;

  const goneEndpoints = new Set<string>();
  await Promise.allSettled(
    targets.map(async (rec) => {
      const res = await sendWebPush(rec.subscription as any, payload, VAPID_KEYS);
      if (res.gone) {
        goneEndpoints.add(rec.endpoint);
      }
    })
  );

  if (goneEndpoints.size > 0) {
    pushSubscriptions = pushSubscriptions.filter((s) => !goneEndpoints.has(s.endpoint));
    savePushSubscriptions(pushSubscriptions);
  }
}

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

export function generateMediaToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({
    p: 'media-v1',
    u: username,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(`media-v1:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export function isAccountSessionValid(username: string, iat: number): RegisteredAccount | null {
  const acc = registeredAccounts.get(String(username || '').trim().toLowerCase());
  if (!acc) return null;
  if (acc.isBanned && (!acc.bannedUntil || Date.now() < acc.bannedUntil)) {
    return null;
  }
  if (acc.minTokenIssuedAt && iat < acc.minTokenIssuedAt) {
    return null;
  }
  return acc;
}

export function verifyMediaToken(token: string): string | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`media-v1:${payload}`).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (parsed.p !== 'media-v1' || !parsed.u || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    const acc = isAccountSessionValid(String(parsed.u), Number(parsed.iat || 0));
    return acc ? acc.username : null;
  } catch {
    return null;
  }
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
  const meta = verifySessionTokenWithMeta(token);
  if (!meta) return null;
  const acc = isAccountSessionValid(meta.username, meta.iat);
  return acc ? acc.username : null;
}

// HttpOnly session cookie endpoints for Web clients (prevents XSS reading token from localStorage)
app.post('/api/auth/set-cookie', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const verified = verifySessionToken(token);
  if (!verified) {
    return res.status(401).json({ success: false, error: 'Geçersiz oturum tokeni.' });
  }
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `cakma_session=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=604800',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
  return res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    'cakma_session=',
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
  return res.json({ success: true });
});

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
]);

const ipDailyRegistrations = new Map<string, { date: string; count: number }>();
const pendingEmailOtps = new Map<string, { code: string; expiresAt: number; attempts: number; sentAt: number }>();

export async function sendSmtpEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  overrideCfg?: MailConfigInput
): Promise<MailSendResult> {
  return deliverEmail(to, subject, text, html, systemConfig, overrideCfg);
}

export function generateRegisterChallenge(): { token: string; question: string } {
  const a = Math.floor(Math.random() * 9) + 2;
  const b = Math.floor(Math.random() * 9) + 2;
  const ans = a + b;
  const payload = Buffer.from(
    JSON.stringify({
      ans,
      exp: Date.now() + 5 * 60_000,
      nonce: crypto.randomBytes(6).toString('hex'),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, question: `${a} + ${b} = ?` };
}

export function verifyRegisterChallenge(token: string, answer: string | number): boolean {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!parsed.exp || parsed.exp < Date.now()) return false;
    return Number(answer) === Number(parsed.ans);
  } catch {
    return false;
  }
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

registerHealthAndPushRoutes(app, {
  systemConfig,
  buildRuntimeMetrics,
  getSystemStats,
  getPushSubscriptions: () => pushSubscriptions,
  setPushSubscriptions: (records) => {
    pushSubscriptions = records;
  },
  savePushSubscriptions,
  getVapidKeys: () => VAPID_KEYS,
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  isMasterRequest,
});

registerDedicatedAndMasterRoutes(app, io, {
  dedicatedServersRegistry,
  issuedLicenses,
  saveLicenses,
  storeSettings,
  saveStoreSettings,
  registeredAccounts,
  saveAccounts,
  hasPaymentWebhookEvent: (eventId) => sqliteStore.hasPaymentWebhookEvent(eventId),
  recordPaymentWebhookEvent: (ev) => sqliteStore.recordPaymentWebhookEvent(ev),
  listPaymentWebhookEvents: (limit) => sqliteStore.listPaymentWebhookEvents(limit),
  verifySessionTokenWithMeta,
  isMasterRequest,
  addAuditLog,
});

const apiAuthMiddlewares = createAuthMiddlewares({
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
});
registerChatEnhancementsRoutes(app, { authMiddlewares: apiAuthMiddlewares });
registerTranslateRoute(app, { requireAuth: apiAuthMiddlewares.requireAuth });
registerSummaryRoutes(app, {
  requireAuth: apiAuthMiddlewares.requireAuth,
  getSystemConfig: () => systemConfig,
});

const maintenanceService = new MaintenanceService({
  dataDir: getPersistentDir(),
  buildRuntimeMetrics,
  messages,
  registeredAccounts,
  servers,
  exportJsonBundle: () => exportAllDataBundle(),
  getSystemConfig: () => systemConfig,
  sendBackupWebhook: (title, details) => sendAdminWebhook('backups', title, details),
  addAuditLog,
});
registerMaintenanceRoutes(app, {
  maintenance: maintenanceService,
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  isMasterRequest,
  getSystemConfig: () => systemConfig,
  sendBackupWebhook: (title, details) => sendAdminWebhook('backups', title, details),
});
registerWebhooksAndTemplatesRoutes(app, {
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  servers,
  messages,
  webhooks,
  activeUsers,
  sanitizeText,
  checkServerPermission,
  saveServers,
  saveWebhooks,
  saveChannelMessageUpsert,
  emitToChannelAudience,
  emitToUserSockets,
  addAuditLog,
  onMessageCreated: () => maintenanceService.incrementMessageCount(),
});

registerPasskeyRoutes(app, {
  registeredAccounts,
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  generateSessionToken,
  generateMediaToken,
  saveAccounts,
  addAuditLog,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginRateLimit,
  getClientIp,
});

registerOAuthAndConnectionsRoutes(app, {
  registeredAccounts,
  activeUsers,
  getSystemConfig: () => systemConfig,
  saveSystemConfig,
  saveAccounts,
  verifySessionTokenWithMeta,
  generateSessionToken,
  generateMediaToken,
  generatePending2faToken,
  syncUserMembershipProfiles,
  emitUserUpdated,
  addAuditLog,
});

const channelBridgeDeps = {
  bridges: channelBridges,
  servers,
  messages,
  activeUsers,
  verifySessionTokenWithMeta,
  getAccount: (usernameLower: string) => registeredAccounts.get(usernameLower),
  sanitizeText,
  checkServerPermission,
  saveBridges: saveChannelBridges,
  saveChannelMessageUpsert,
  emitToChannelAudience,
  addAuditLog,
  onMessageCreated: () => maintenanceService.incrementMessageCount(),
};
const channelBridgeService = new ChannelBridgeService(channelBridgeDeps);
registerChannelBridgeRoutes(app, channelBridgeService, channelBridgeDeps);
channelBridgeService.start();

registerE2eePairingRoutes(app, {
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
});

registerComplianceAndReportsRoutes(app, {
  io,
  registeredAccounts,
  activeUsers,
  activeSessions,
  servers,
  groupDms,
  messages,
  contentReports,
  saveContentReports,
  saveAccounts,
  saveChannelMessageDelete,
  emitToChannelAudience,
  emitUserUpdated,
  addAuditLog,
  sanitizeText,
  checkServerPermission: (u, s, p) => checkServerPermission(u, s, p),
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  legalVersion: '1.1.0',
});

const socketEventLimiter = createSocketEventRateLimiter();

const governanceDeps: ServerGovernanceDeps = {
  activeUsers,
  registeredAccounts,
  servers,
  serverAuditLogs,
  serverCases,
  socketEventLimiter,
  sanitizeText,
  isSafeImageMedia,
  checkServerPermission: (u, s, p) => checkServerPermission(u, s, p),
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  saveServers,
  saveServerAuditLogs,
  saveServerModerationCases,
  emitServerUpdatedToMembers,
  emitServersUpdatedForAll,
  emitToUserSockets,
};
registerServerGovernanceRoutes(app, governanceDeps, governanceHelpers);

const scheduledMessagesService = new ScheduledMessagesService({
  scheduledMessages,
  servers,
  messages,
  saveScheduledMessages,
  saveChannelMessageUpsert,
  emitToChannelAudience,
  onMessageCreated: () => maintenanceService.incrementMessageCount(),
  recordServerAudit: governanceHelpers.recordServerAudit,
});
registerScheduledMessagesRoutes(app, {
  scheduledMessages,
  servers,
  activeUsers,
  sanitizeText,
  checkServerPermission: (u, s, p) => checkServerPermission(u, s, p),
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  saveScheduledMessages,
  recordServerAudit: governanceHelpers.recordServerAudit,
});

registerBotsAndAutomationRoutes(app, {
  servers,
  messages,
  bots: serverBots,
  automations: serverAutomations,
  activeUsers,
  sanitizeText,
  checkServerPermission: (u, s, p) => checkServerPermission(u, s, p),
  verifySessionTokenWithMeta,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  saveBots: saveServerBots,
  saveAutomations: saveServerAutomations,
  saveChannelMessageUpsert,
  emitToChannelAudience,
  onMessageCreated: () => maintenanceService.incrementMessageCount(),
  recordServerAudit: governanceHelpers.recordServerAudit,
});

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
const activeDirectCallStartTimes = new Map<string, number>(); // socketId -> connected timestamp
const pendingDirectCalls = new Map<
  string,
  {
    callerSocketId: string;
    callerUserId: string;
    callerUsername: string;
    targetUserId?: string;
    targetUsername?: string;
  }
>(); // targetUsernameLower -> caller info
const pendingDirectCallTimers = new Map<string, ReturnType<typeof setTimeout>>();
const remoteAssistManager = new RemoteAssistManager();
const messageRateLimits = new Map<string, number[]>(); // userId -> timestamps
const pendingVoicePullInvites = new Map<
  string,
  {
    fromUserId: string;
    fromUsername: string;
    targetUserId: string;
    targetChannelId: string;
    channelName: string;
    expiresAt: number;
  }
>();

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
    emitServersUpdatedForAll();
  }
}

function performVoiceMove(
  targetUserId: string,
  targetChannelId: string,
  movedByUsername: string,
  isSelf: boolean
) {
  const targetUser = activeUsers.get(targetUserId);
  const targetChannel = servers.flatMap(s => s.channels).find(c => c.id === targetChannelId);
  const parentServer = servers.find(s => s.channels.some(c => c.id === targetChannelId));
  const targetSock = io.sockets.sockets.get(targetUserId);
  if (!targetUser || !targetChannel || !targetSock) return;
  if (targetUser.currentVoiceChannelId === targetChannelId) return;

  const oldChannelId = targetUser.currentVoiceChannelId;
  if (oldChannelId) {
    targetSock.leave(oldChannelId);
    io.to(oldChannelId).emit('user_left_voice', { userId: targetUserId, channelId: oldChannelId });
    handleUserLeaveStage(servers, targetUser.username, oldChannelId, emitToServerMembers, saveServers);
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
    movedBy: movedByUsername,
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

  if (targetChannel.type === 'stage' && parentServer) {
    const st = ensureStageState(targetChannel);
    targetSock.emit('stage_state_updated', {
      serverId: parentServer.id,
      channelId: targetChannel.id,
      stageState: st,
    });
  }

  const voicePayload = {
    userId: targetUserId,
    channelId: targetChannelId,
    isMuted: targetUser.isMuted,
    isDeafened: targetUser.isDeafened
  };
  emitToVoiceChannelAudience(targetChannelId, targetUser, 'voice_state_update', voicePayload);
  if (oldChannelId) {
    const oldSrv = findServerByChannelId(servers, oldChannelId);
    if (oldSrv && oldSrv.id !== parentServer?.id) {
      emitToServerMembers(oldSrv, 'voice_state_update', voicePayload);
    }
  }

  if (!isSelf) {
    addAuditLog('KULLANICI_TASINDI', `${movedByUsername}, ${targetUser.username} kullanıcısını #${targetChannel.name} odasına taşıdı.`, 'voice');
  }
  updateUserConnectionLocation(targetUserId, parentServer?.name || 'Ana Topluluk', `Ses: ${targetChannel.name}`);
}

// Comprehensive Periodic In-Memory Cache & Rate-Limit Map Cleanup
setInterval(() => {
  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  for (const [ip, entry] of apiRateLimits.entries()) {
    if (now >= entry.resetAt) apiRateLimits.delete(ip);
  }
  for (const [ip, entry] of loginRateLimits.entries()) {
    if ((entry.blockedUntil && now >= entry.blockedUntil) || (!entry.blockedUntil && entry.lastAttempt && now - entry.lastAttempt > 30 * 60_000)) {
      loginRateLimits.delete(ip);
    }
  }
  for (const [ip, entry] of registerRateLimits.entries()) {
    if ((entry.blockedUntil && now >= entry.blockedUntil) || (!entry.blockedUntil && entry.lastAttempt && now - entry.lastAttempt > 30 * 60_000)) {
      registerRateLimits.delete(ip);
    }
  }
  for (const [k, ts] of soundboardCooldowns.entries()) {
    if (now - ts > 5 * 60_000) soundboardCooldowns.delete(k);
  }
  for (const [uId, stamps] of messageRateLimits.entries()) {
    const fresh = stamps.filter((t) => now - t < 60_000);
    if (fresh.length === 0) messageRateLimits.delete(uId);
    else messageRateLimits.set(uId, fresh);
  }
  for (const [emailKey, otp] of pendingEmailOtps.entries()) {
    if (now > otp.expiresAt) pendingEmailOtps.delete(emailKey);
  }
  for (const [ip, rec] of ipDailyRegistrations.entries()) {
    if (rec.date !== todayKey) ipDailyRegistrations.delete(ip);
  }
  for (const [reqId, inv] of pendingVoicePullInvites.entries()) {
    if (now > inv.expiresAt) pendingVoicePullInvites.delete(reqId);
  }
  for (const [k, stamps] of automationSpamTracker.entries()) {
    const fresh = stamps.filter((t) => now - t <= 120_000);
    if (fresh.length === 0) automationSpamTracker.delete(k);
    else automationSpamTracker.set(k, fresh);
  }
  socketEventLimiter.prune();
  pruneGifCache();
}, 10 * 60 * 1000).unref();

function clearPendingDirectCallTimer(targetUsernameLower: string) {
  const existing = pendingDirectCallTimers.get(targetUsernameLower);
  if (existing) {
    clearTimeout(existing);
    pendingDirectCallTimers.delete(targetUsernameLower);
  }
}

function persistAndEmitDirectCallLog(
  userA: User | undefined,
  userB: User | undefined,
  status: DirectCallLogStatus,
  durationSeconds: number,
  reason?: string
) {
  if (!userA || !userB) return;
  const dmChannelId = buildPersistentDmChannelId(userA.username, userB.username);
  const content = buildDirectCallLogContent(status, durationSeconds, reason);
  const logMsg: Message = {
    id: `call-log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serverId: 'direct-messages',
    channelId: dmChannelId,
    author: {
      id: 'system-call',
      username: 'Görüşme Kaydı',
      avatar: status === 'ended' ? '📞' : status === 'dnd' ? '🌙' : '📵',
    },
    content,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    reactions: {},
    isPinned: false,
  };

  if (!messages[dmChannelId]) {
    messages[dmChannelId] = [];
  }
  messages[dmChannelId].push(logMsg);
  saveChannelMessageUpsert(dmChannelId, messages[dmChannelId], logMsg);

  const recipientSockets = new Set<string>([userA.id, userB.id]);
  const nameA = userA.username.toLowerCase();
  const nameB = userB.username.toLowerCase();
  for (const [sId, u] of activeUsers.entries()) {
    const uname = u.username.toLowerCase();
    if (uname === nameA || uname === nameB) {
      recipientSockets.add(sId);
    }
  }
  for (const sId of recipientSockets) {
    io.to(sId).emit('new_message', logMsg);
  }
}

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

function hasDangerousAttachment(attachments?: MessageAttachment[]): boolean {
  if (!attachments || attachments.length === 0) return false;
  return attachments.some(att => {
    const check = validateAttachmentSafety(att, systemConfig.maxUploadSizeMb || 5);
    if (!check.ok && (check.error || '').includes('Çalıştırılabilir')) return true;
    const lowerType = (att.type || '').toLowerCase();
    return (
      lowerType.includes('executable') ||
      lowerType.includes('x-msdownload') ||
      lowerType.includes('x-sh') ||
      lowerType.includes('x-bat')
    );
  });
}

function emitUserUpdated(user: User) {
  io.to(user.id).emit('user_updated', user);
  io.except(user.id).emit('user_updated', toPublicUser(user));
}

function emitInitData(targetSocket: Socket, currentUser: User) {
  const userServers = filterServersForUser(servers, currentUser);
  const { initialMessages, hasMoreMessages } = getInitialMessagesForServers(
    userServers,
    currentUser.username,
    currentUser.id,
    currentUser.role
  );
  const foundAcc = registeredAccounts.get(currentUser.username.toLowerCase());
  const userGroupDms = getGroupDmsForUser(groupDms, currentUser.username);
  targetSocket.emit('init_data', {
    currentUser,
    servers: userServers,
    onlineUsers: Array.from(activeUsers.values()).map((u) => (u.id === currentUser.id ? u : toPublicUser(u))),
    messages: initialMessages,
    hasMoreMessages,
    readCursors: foundAcc?.readCursors || {},
    groupDms: userGroupDms,
  });
  targetSocket.emit('group_dms_updated', userGroupDms);
}

const accountSecurityDeps: AccountSecurityDeps = {
  io,
  registeredAccounts,
  activeUsers,
  activeSessions,
  servers,
  pendingFriendRequests,
  getPushSubscriptions: () => pushSubscriptions,
  setPushSubscriptions: (next) => {
    pushSubscriptions = next;
  },
  savePushSubscriptions,
  saveAccounts,
  deleteUserReadCursors,
  saveServers,
  saveFriendRequests,
  addAuditLog,
  emitUserUpdated,
  emitServerUpdatedToMembers,
  sendSmtpEmail,
  disposableEmailDomains: DISPOSABLE_EMAIL_DOMAINS,
  getSystemConfig: () => systemConfig,
  getClientIp,
  isIpBanned: (ip) => Boolean(findActiveIpBan(ip)),
};
const accountSecurityManager = createAccountSecurityManager(accountSecurityDeps);

function checkServerPermission(user: User, server: Server, permission: ServerPermission): boolean {
  if (isServerOwner(user, server)) return true;
  if (user.role === 'admin') return true;
  const member = findServerMember(server, user);
  if (!member) return false;
  if (member.isOwner) return true;

  for (const rId of member.roleIds) {
    const role = server.roles.find((r) => r.id === rId);
    if (role && role.permissions.includes(permission)) return true;
  }
  const defaultRole = server.roles.find((r) => r.isDefault);
  if (defaultRole && defaultRole.permissions.includes(permission)) return true;
  return false;
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

  registerAccountSecuritySocketHandlers(socket, accountSecurityManager, accountSecurityDeps);
  registerChatMessageHandlers(socket, {
    io,
    activeUsers,
    registeredAccounts,
    servers,
    messages,
    groupDms,
    onMessageCreated: () => maintenanceService.incrementMessageCount(),
    serverLevels,
    socketEventLimiter,
    getSystemConfig: () => systemConfig,
    sanitizeText,
    isMessageFlooding,
    hasDangerousAttachment,
    checkServerPermission,
    addMemberXP,
    generateAIResponse,
    saveAccounts,
    saveUserReadCursor,
    saveChannelMessageUpsert,
    saveChannelMessageDelete,
    saveChannelMessagesBulkDelete,
    recordServerAudit: governanceHelpers.recordServerAudit,
    getChannelMessagesPageSmart,
    getChannelMessageContextSmart,
    searchMessagesSmart,
    emitToChannelAudience,
    emitToRelevantUsers,
    sendWebPushToUsername,
    addAuditLog,
    onBeforeMessageBroadcast: ({ sender, server: targetSrv, channelId, content }) => {
      if (!targetSrv) return;
      const evalRes = evaluateAutomationRules(
        {
          type: 'message',
          server: targetSrv,
          username: sender.username,
          userRole: sender.role,
          channelId,
          content,
        },
        serverAutomations,
        automationSpamTracker
      );
      if (evalRes.matchedRules.length === 0) return;

      if (evalRes.timeoutMinutes) {
        if (!targetSrv.timeouts) targetSrv.timeouts = {};
        targetSrv.timeouts[sender.username.toLowerCase()] = Date.now() + evalRes.timeoutMinutes * 60_000;
        saveServers(servers);
        emitServerUpdatedToMembers(targetSrv);
        const modCase = governanceHelpers.recordModerationCase({
          serverId: targetSrv.id,
          targetUsername: sender.username,
          moderatorUsername: 'Otomasyon ⚙️',
          action: 'timeout',
          reason: evalRes.blockReason || 'Otomatik zaman aşımı kuralı tetiklendi',
          durationMinutes: evalRes.timeoutMinutes,
        });
        emitToUserSockets(sender.username, 'moderation_notice', {
          serverId: targetSrv.id,
          serverName: targetSrv.name,
          caseItem: modCase,
        });
      } else if (evalRes.warnReason) {
        const modCase = governanceHelpers.recordModerationCase({
          serverId: targetSrv.id,
          targetUsername: sender.username,
          moderatorUsername: 'Otomasyon ⚙️',
          action: 'warn',
          reason: evalRes.warnReason,
        });
        emitToUserSockets(sender.username, 'moderation_notice', {
          serverId: targetSrv.id,
          serverName: targetSrv.name,
          caseItem: modCase,
        });
      }

      for (const notice of evalRes.notices) {
        const noticeMsg: Message = {
          id: `msg-auto-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          serverId: targetSrv.id,
          channelId: notice.channelId,
          author: { id: 'system-automod', username: 'Otomasyon Botu ⚙️', avatar: '🤖' },
          content: notice.content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
        };
        if (!messages[notice.channelId]) messages[notice.channelId] = [];
        messages[notice.channelId].push(noticeMsg);
        saveChannelMessageUpsert(notice.channelId, messages[notice.channelId], noticeMsg);
        emitToChannelAudience(notice.channelId, targetSrv.id, 'new_message', noticeMsg);
      }

      governanceHelpers.recordServerAudit(
        targetSrv.id,
        'Otomasyon',
        'OTOMASYON_TETIKLENDI',
        `${sender.username} için ${evalRes.matchedRules.map((r) => r.name).join(', ')} kural(lar)ı tetiklendi.`,
        sender.username
      );

      if (evalRes.blockMessage) {
        return { blocked: true, reason: evalRes.blockReason };
      }
    },
    onAfterMessageBroadcast: ({ sender, server: targetSrv, message }) => {
      if (!targetSrv) return;
      void dispatchBotEvent(
        'message_create',
        targetSrv.id,
        {
          messageId: message.id,
          channelId: message.channelId,
          authorUsername: sender.username,
          content: message.content,
        },
        serverBots
      );
      void channelBridgeService.forwardMessageToBridges(targetSrv, message);
    },
    onReactionAdded: ({ user: reactor, serverId, channelId, messageId, emoji }) => {
      if (!serverId || serverId === 'direct-messages') return;
      void dispatchBotEvent(
        'reaction_add',
        serverId,
        { channelId, messageId, emoji, username: reactor.username },
        serverBots
      );
    },
  });
  registerDirectCallSocketHandlers(socket, {
    io,
    activeUsers,
    messages,
    activeDirectCallPairs,
    activeDirectCallStartTimes,
    pendingDirectCalls,
    pendingDirectCallTimers,
    remoteAssistManager,
    clearPendingDirectCallTimer,
    persistAndEmitDirectCallLog,
    sendWebPushToUsername,
    saveChannelMessageUpsert,
    sanitizeText,
  });
  registerFriendsSocketHandlers(socket, {
    io,
    activeUsers,
    registeredAccounts,
    pendingFriendRequests,
    socketEventLimiter,
    getFriendsData,
    saveAccounts,
    saveFriendRequests,
  });
  registerServerAdminSocketHandlers(socket, {
    io,
    activeUsers,
    registeredAccounts,
    servers,
    messages,
    socketEventLimiter,
    sanitizeText,
    isSafeImageMedia,
    isSafeEmojiOrShortIcon,
    checkServerPermission,
    addUserToServer,
    saveServers,
    saveAccounts,
    saveChannelMessageBulkReplace,
    emitToServerMembers,
    emitServerUpdatedToMembers,
    emitServersUpdatedForAll,
    emitToUserSockets,
    emitToChannelAudience,
    emitUserUpdated,
    cleanupTemporaryChannels,
    getInitialMessagesForServers,
    addAuditLog,
    onModerationEvent: (serverId, entry) => {
      governanceHelpers.recordModerationCase({
        serverId,
        targetUsername: entry.targetUsername,
        moderatorUsername: entry.moderatorUsername,
        action: entry.action,
        reason: entry.reason,
        durationMinutes: entry.durationMinutes,
      });
      governanceHelpers.recordServerAudit(
        serverId,
        entry.moderatorUsername,
        `MOD_${entry.action.toUpperCase()}`,
        `${entry.targetUsername}: ${entry.reason}`,
        entry.targetUsername
      );
    },
  });
  registerGroupDmSocketHandlers(socket, {
    activeUsers,
    registeredAccounts,
    groupDms,
    socketEventLimiter,
    sanitizeText,
    isSafeEmojiOrShortIcon,
    saveGroupDms,
    emitToUserSockets,
    addAuditLog,
  });
  registerServerGovernanceSocketHandlers(socket, governanceDeps, governanceHelpers);
  registerWikiAndKanbanHandlers(socket, {
    activeUsers,
    servers,
    socketEventLimiter,
    sanitizeText,
    checkServerPermission,
    saveServers,
    emitServerUpdatedToMembers,
  });
  registerStageAndMediaSocketHandlers(socket, {
    activeUsers,
    servers,
    groupDms,
    socketEventLimiter,
    sanitizeText,
    checkServerPermission,
    saveServers,
    saveGroupDms,
    emitToServerMembers,
    emitToUserSockets,
  });
  registerBotCommandSocketHandlers(socket, {
    activeUsers,
    servers,
    messages,
    bots: serverBots,
    socketEventLimiter,
    sanitizeText,
    saveChannelMessageUpsert,
    emitToChannelAudience,
    onMessageCreated: () => maintenanceService.incrementMessageCount(),
  });

  socket.emit('system_maintenance_status', {
    active: Boolean(systemConfig.maintenanceMode),
    message: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır.'
  });
  socket.emit('pinned_banner_updated', systemConfig.pinnedBanner || null);
  socket.emit('store_settings_response', storeSettings);
  socket.emit('ice_servers', getEffectiveIceServers());

  // Real-time Ping & Network Measurement Check
  socket.on('ping_check', (_ts: number, callback: any) => {
    if (typeof callback === 'function') {
      callback(Date.now());
    } else {
      socket.emit('pong_reply', { clientTimestamp: _ts, serverTime: Date.now() });
    }
  });

  registerAuthSocketHandlers(socket, {
    registeredAccounts,
    activeUsers,
    activeSessions,
    pendingEmailOtps,
    ipDailyRegistrations,
    disposableEmailDomains: DISPOSABLE_EMAIL_DOMAINS,
    getSystemConfig: () => systemConfig,
    saveSystemConfig,
    saveAccounts,
    sanitizeText,
    getClientIp,
    findActiveIpBan,
    checkLoginRateLimit,
    recordFailedLogin,
    clearLoginRateLimit,
    checkRegisterRateLimit,
    recordRegisterAttempt,
    generateRegisterChallenge,
    verifyRegisterChallenge,
    generateSessionToken,
    generateMediaToken,
    generatePending2faToken,
    verifyPending2faToken,
    verifySessionTokenWithMeta,
    getUserBadges,
    toPublicUser,
    emitInitData,
    getFriendsData,
    syncUserMembershipProfiles,
    recordUserConnection,
    recordUserDisconnection,
    addAuditLog,
    sendAdminWebhook,
    sendSmtpEmail,
    emitToRelevantUsers,
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

  // Change Password (Self-Service)
  socket.on('change_password', async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc) return socket.emit('change_password_response', { success: false, error: 'Hesap bulunamadı.' });

    if (!(await verifyPasswordAsync(currentPassword, acc.password))) {
      return socket.emit('change_password_response', { success: false, error: 'Mevcut şifreniz hatalı.' });
    }
    const passCheck = validatePasswordAgainstPolicy(newPassword, acc.username, Boolean(systemConfig.requireStrongPasswords));
    if (!passCheck.ok) {
      return socket.emit('change_password_response', { success: false, error: passCheck.error });
    }

    acc.password = await hashPasswordAsync(newPassword);
    acc.minTokenIssuedAt = Date.now();
    saveAccounts(registeredAccounts);
    addAuditLog('SIFRE_DEGISTIRILDI', `${user.username} kendi şifresini güncelledi (eski oturumlar geçersiz kılındı).`, 'auth');
    socket.emit('change_password_response', { success: true, message: 'Şifreniz başarıyla güncelledi ve diğer oturumlar sonlandırıldı.' });
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
  socket.on('2fa_setup_verify', async ({ code }: { code: string }) => {
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
    acc.twoFactorBackupCodes = await Promise.all(backupCodes.map((c) => hashPasswordAsync(c)));
    acc.minTokenIssuedAt = Date.now();
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
  socket.on('2fa_disable', async ({ password, code }: { password: string; code: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc || !acc.twoFactorEnabled || !acc.twoFactorSecret) {
      return socket.emit('2fa_status_response', { success: false, error: '2FA zaten devre dışı.' });
    }
    if (!(await verifyPasswordAsync(password || '', acc.password))) {
      return socket.emit('2fa_status_response', { success: false, error: 'Mevcut şifreniz hatalı.' });
    }
    const cleanCode = (code || '').trim().toUpperCase();
    const isTotpValid = verifyTotpCode(acc.twoFactorSecret, cleanCode);
    let isBackupValid = false;
    if (!isTotpValid && Array.isArray(acc.twoFactorBackupCodes)) {
      for (const h of acc.twoFactorBackupCodes) {
        if (await verifyPasswordAsync(cleanCode, h)) {
          isBackupValid = true;
          break;
        }
      }
    }
    if (!isTotpValid && !isBackupValid) {
      return socket.emit('2fa_status_response', { success: false, error: '2FA doğrulama kodu geçersiz.' });
    }

    acc.twoFactorEnabled = false;
    delete acc.twoFactorSecret;
    delete acc.pendingTwoFactorSecret;
    delete acc.twoFactorBackupCodes;
    acc.minTokenIssuedAt = Date.now();
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

  // E2EE Public Key Publish (ECDH P-256 JWK string)
  socket.on('e2ee_publish_key', ({ publicKey }: { publicKey: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || typeof publicKey !== 'string' || publicKey.length > 600) return;
    user.e2eePublicKey = publicKey;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (acc) {
      acc.e2eePublicKey = publicKey;
      saveAccounts(registeredAccounts);
    }
    emitUserUpdated(user);
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
    emitUserUpdated(user);
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
    if (user.role !== 'admin' && !isServerOwner(user, srv) && !checkServerPermission(user, srv, 'manage_server')) return;
    if (url.length > 512 * 1024) return;
    if (!srv.customEmojis) srv.customEmojis = [];
    const boostSummary = computeServerBoostSummary(srv);
    const maxEmojis = user.role === 'admin' ? 150 : boostSummary.maxEmojis;
    if (srv.customEmojis.length >= maxEmojis) {
      return socket.emit('server_action_error', {
        message: `Bu sunucuda (Seviye ${boostSummary.tier}) en fazla ${maxEmojis} özel emoji eklenebilir.`,
      });
    }
    const cleanName = sanitizeText(name).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'emoji';
    srv.customEmojis.push({ id: `emj-${Date.now()}`, name: cleanName, url });
    saveServers(servers);
    emitServerUpdatedToMembers(srv);
  });

  socket.on('delete_server_emoji', ({ serverId, emojiId }: { serverId: string; emojiId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !emojiId) return;
    const srv = servers.find((s) => s.id === serverId);
    if (!srv || !srv.customEmojis) return;
    if (user.role !== 'admin' && !isServerOwner(user, srv) && !checkServerPermission(user, srv, 'manage_server')) return;
    srv.customEmojis = srv.customEmojis.filter((e) => e.id !== emojiId);
    saveServers(servers);
    emitServerUpdatedToMembers(srv);
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

    emitUserUpdated(user);
  });

  socket.on('user_sync_server_folders', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user || !rawPayload || typeof rawPayload !== 'object') return;
    if (!socketEventLimiter.allow(socket.id, 'user_sync_server_folders', 20, 30_000)) return;
    const rawFolders = (rawPayload as { folders?: unknown }).folders;
    if (!Array.isArray(rawFolders)) return;
    const sanitized = rawFolders
      .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
      .slice(0, 25)
      .map((f, idx) => ({
        id: String(f.id || `fld-${idx}`).slice(0, 48),
        name: sanitizeText(String(f.name || 'Klasör')).trim().slice(0, 32) || 'Klasör',
        color: /^#[0-9a-fA-F]{6}$/.test(String(f.color || '')) ? String(f.color) : '#3b82f6',
        serverIds: Array.isArray(f.serverIds)
          ? Array.from(new Set(f.serverIds.map((id) => String(id).slice(0, 80)).filter(Boolean))).slice(0, 50)
          : [],
        collapsed: Boolean(f.collapsed),
      }))
      .filter((f) => f.serverIds.length > 0);

    user.serverFolders = sanitized;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (acc) {
      acc.serverFolders = sanitized;
      saveAccounts(registeredAccounts);
    }
    emitToUserSockets(user.username, 'user_server_folders_synced', { folders: sanitized });
  });

  // Profile Update (Status message, bio, bannerColor, bannerImage, bannerPosition, avatarFrame, pinnedBadgeId, socialLinks, avatar, status - with XSS sanitization & size limits)
  socket.on('update_profile', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'update_profile', 12, 10_000)) return;
    const {
      statusMessage,
      bio,
      bannerColor,
      bannerImage,
      bannerPosition,
      avatarFrame,
      nameGradient,
      pinnedBadgeId,
      socialLinks,
      avatar,
      status,
    } = rawPayload as {
      statusMessage?: string;
      bio?: string;
      bannerColor?: string;
      bannerImage?: string;
      bannerPosition?: 'top' | 'center' | 'bottom';
      avatarFrame?: string;
      nameGradient?: string;
      pinnedBadgeId?: string;
      socialLinks?: { steam?: string; github?: string; website?: string };
      avatar?: string;
      status?: 'online' | 'idle' | 'dnd' | 'offline';
    };

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
    if (bannerPosition !== undefined && ['top', 'center', 'bottom'].includes(bannerPosition)) {
      user.bannerPosition = bannerPosition;
      if (acc) acc.bannerPosition = bannerPosition;
    }
    if (avatarFrame !== undefined && VALID_AVATAR_FRAMES.has(avatarFrame)) {
      const userLvl = user.level || 1;
      if (isCosmeticUnlocked(`frame:${avatarFrame}`, userLvl, acc?.unlockedCosmetics)) {
        user.avatarFrame = avatarFrame as User['avatarFrame'];
        if (acc) acc.avatarFrame = user.avatarFrame;
      }
    }
    if (nameGradient !== undefined && VALID_NAME_GRADIENTS.has(nameGradient)) {
      const userLvl = user.level || 1;
      if (isCosmeticUnlocked(`grad:${nameGradient}`, userLvl, acc?.unlockedCosmetics)) {
        user.nameGradient = nameGradient as User['nameGradient'];
        if (acc) acc.nameGradient = user.nameGradient;
      }
    }
    if (pinnedBadgeId !== undefined && typeof pinnedBadgeId === 'string') {
      const cleanPinned = sanitizeText(pinnedBadgeId).trim().slice(0, 64);
      user.pinnedBadgeId = cleanPinned;
      if (acc) acc.pinnedBadgeId = cleanPinned;
    }
    if (socialLinks !== undefined && socialLinks && typeof socialLinks === 'object') {
      const cleanLink = (val?: string) => {
        if (typeof val !== 'string') return undefined;
        const trimmed = val.trim().slice(0, 200);
        if (!trimmed) return undefined;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        return sanitizeText(trimmed).slice(0, 80);
      };
      const sanitizedLinks = {
        steam: cleanLink(socialLinks.steam),
        github: cleanLink(socialLinks.github),
        website: cleanLink(socialLinks.website),
      };
      user.socialLinks = sanitizedLinks;
      if (acc) acc.socialLinks = sanitizedLinks;
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

    emitUserUpdated(user);
    socket.emit('profile_updated', user);
    addAuditLog('PROFIL_GUNCELLE', `${user.username} profil bilgilerini güncelledi.`, 'info');
  });

  socket.on('unlock_cosmetic', ({ cosmeticId }: { cosmeticId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !cosmeticId) return;
    const acc = registeredAccounts.get(user.username.toLowerCase());
    if (!acc) return;
    const res = unlockCosmeticWithWallet(acc, String(cosmeticId), user.level || 1);
    if (!res.ok) {
      socket.emit('server_action_error', { message: res.error });
      return;
    }
    user.walletBalance = res.newBalance;
    user.unlockedCosmetics = res.unlockedCosmetics;
    saveAccounts(registeredAccounts);
    emitUserUpdated(user);
    socket.emit('profile_updated', user);
    socket.emit('admin_action_success', 'Yeni profil kozmetiği açıldı!');
  });

  // Wallet Balance Transfer between registered users
  socket.on('transfer_wallet_balance', ({ targetUsername, amount }: { targetUsername: string; amount: number }) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) return;
    const senderAcc = registeredAccounts.get(sender.username.toLowerCase());
    const cleanTarget = typeof targetUsername === 'string' ? targetUsername.trim().toLowerCase() : '';
    const receiverAcc = cleanTarget ? registeredAccounts.get(cleanTarget) : undefined;
    const transferAmount = Math.floor(Number(amount));

    if (!senderAcc || !receiverAcc) {
      socket.emit('wallet_transfer_result', { success: false, error: 'Kullanıcı hesabı bulunamadı.' });
      return;
    }
    if (senderAcc.username.toLowerCase() === receiverAcc.username.toLowerCase()) {
      socket.emit('wallet_transfer_result', { success: false, error: 'Kendinize bakiye gönderemezsiniz.' });
      return;
    }
    if (!Number.isFinite(transferAmount) || transferAmount < 1 || transferAmount > 100000) {
      socket.emit('wallet_transfer_result', { success: false, error: 'Geçerli bir tutar girin (1 - 100.000 ₺).' });
      return;
    }
    if ((senderAcc.walletBalance ?? 0) < transferAmount) {
      socket.emit('wallet_transfer_result', { success: false, error: 'Yetersiz cüzdan bakiyesi.' });
      return;
    }

    senderAcc.walletBalance = (senderAcc.walletBalance ?? 0) - transferAmount;
    receiverAcc.walletBalance = (receiverAcc.walletBalance ?? 0) + transferAmount;
    saveAccounts(registeredAccounts);

    for (const u of activeUsers.values()) {
      if (u.username.toLowerCase() === senderAcc.username.toLowerCase()) {
        u.walletBalance = senderAcc.walletBalance;
        emitUserUpdated(u);
      } else if (u.username.toLowerCase() === receiverAcc.username.toLowerCase()) {
        u.walletBalance = receiverAcc.walletBalance;
        emitUserUpdated(u);
      }
    }

    socket.emit('profile_updated', { ...sender, walletBalance: senderAcc.walletBalance });
    socket.emit('wallet_transfer_result', {
      success: true,
      message: `${receiverAcc.username} kullanıcısına ${transferAmount} ₺ gönderildi.`,
      newBalance: senderAcc.walletBalance,
    });
    addAuditLog('BAKIYE_TRANSFER', `${senderAcc.username} -> ${receiverAcc.username}: ${transferAmount} ₺`, 'info');
  });

  // 1-on-1 Remote Assistance (TeamViewer/AnyDesk-style) Relay — server-authorized & rate-limited
  socket.on('remote_assist_request', (payload?: { permissions?: Partial<RemoteAssistPermissions> }) => {
    const caller = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!caller || !pairedSocketId) return;
    const requestedPerms = normalizeRemoteAssistPermissions(payload?.permissions);
    io.to(pairedSocketId).emit('remote_assist_incoming_request', {
      fromUserId: socket.id,
      fromUsername: caller.username,
      permissions: requestedPerms,
    });
  });

  socket.on('remote_assist_response', (payload: {
    accepted: boolean;
    hostDesktopCapable?: boolean;
    permissions?: Partial<RemoteAssistPermissions>;
    monitors?: Array<{ index: number; name: string; x: number; y: number; width: number; height: number; is_primary: boolean }>;
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload) return;
    const accepted = Boolean(payload.accepted);
    if (!accepted) {
      remoteAssistManager.endSessionForSocket(socket.id);
      io.to(pairedSocketId).emit('remote_assist_response', {
        accepted: false,
        hostDesktopCapable: false,
      });
      return;
    }

    const perms = normalizeRemoteAssistPermissions(payload.permissions);
    const session = remoteAssistManager.startSession(
      pairedSocketId,
      socket.id,
      Boolean(payload.hostDesktopCapable),
      perms
    );
    const safeMonitors = Array.isArray(payload.monitors)
      ? payload.monitors.slice(0, 8).map((m, idx) => ({
          index: typeof m.index === 'number' ? m.index : idx,
          name: typeof m.name === 'string' ? m.name.slice(0, 64) : `Monitör ${idx + 1}`,
          x: Number.isFinite(m.x) ? Math.round(m.x) : 0,
          y: Number.isFinite(m.y) ? Math.round(m.y) : 0,
          width: Number.isFinite(m.width) && m.width > 0 ? Math.round(m.width) : 1920,
          height: Number.isFinite(m.height) && m.height > 0 ? Math.round(m.height) : 1080,
          is_primary: Boolean(m.is_primary),
        }))
      : [];

    io.to(pairedSocketId).emit('remote_assist_response', {
      accepted: true,
      hostDesktopCapable: session.hostDesktopCapable,
      permissions: session.permissions,
      monitors: safeMonitors,
    });
  });

  socket.on('remote_assist_pause', ({ paused }: { paused: boolean }) => {
    const actor = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    const session = remoteAssistManager.setPaused(socket.id, Boolean(paused));
    if (!session) return;
    const msg = {
      paused: session.paused,
      byUsername: actor?.username || 'Kullanıcı',
    };
    io.to(pairedSocketId).emit('remote_assist_pause_state', msg);
    socket.emit('remote_assist_pause_state', msg);
  });

  socket.on('remote_assist_update_permissions', ({ permissions }: { permissions: Partial<RemoteAssistPermissions> }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !permissions) return;
    const updated = remoteAssistManager.updatePermissions(socket.id, permissions);
    if (!updated) return;
    io.to(pairedSocketId).emit('remote_assist_permissions_updated', {
      permissions: updated.permissions,
    });
  });

  socket.on('remote_assist_select_monitor', ({ monitorIndex }: { monitorIndex: number | null }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    const session = remoteAssistManager.getSessionForSocket(socket.id);
    if (!session) return;
    io.to(pairedSocketId).emit('remote_assist_monitor_selected', {
      monitorIndex: typeof monitorIndex === 'number' && Number.isFinite(monitorIndex) ? Math.max(0, Math.min(7, Math.floor(monitorIndex))) : null,
    });
  });

  socket.on('remote_assist_stop', () => {
    const user = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    remoteAssistManager.endSessionForSocket(socket.id);
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
    delta_x?: number;
    delta_y?: number;
    key?: string;
    code?: string;
    text?: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
    monitor_x?: number;
    monitor_y?: number;
    monitor_w?: number;
    monitor_h?: number;
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload || typeof payload.kind !== 'string') return;
    if (!['move', 'mousedown', 'mouseup', 'wheel', 'keydown', 'keyup', 'text'].includes(payload.kind)) return;
    if (!remoteAssistManager.canSendInput(socket.id, pairedSocketId)) return;
    if (!remoteAssistManager.allowInput(socket.id, payload.kind, Date.now())) return;

    const cleanPayload: Record<string, unknown> = { kind: payload.kind };
    if (typeof payload.x === 'number' && Number.isFinite(payload.x)) {
      cleanPayload.x = Math.min(1, Math.max(0, payload.x));
    }
    if (typeof payload.y === 'number' && Number.isFinite(payload.y)) {
      cleanPayload.y = Math.min(1, Math.max(0, payload.y));
    }
    if (typeof payload.button === 'number' && Number.isFinite(payload.button)) {
      cleanPayload.button = Math.min(2, Math.max(0, Math.round(payload.button)));
    }
    if (typeof payload.delta_x === 'number' && Number.isFinite(payload.delta_x)) {
      cleanPayload.delta_x = Math.min(2000, Math.max(-2000, payload.delta_x));
    }
    if (typeof payload.delta_y === 'number' && Number.isFinite(payload.delta_y)) {
      cleanPayload.delta_y = Math.min(2000, Math.max(-2000, payload.delta_y));
    }
    if (typeof payload.key === 'string') cleanPayload.key = payload.key.slice(0, 64);
    if (typeof payload.code === 'string') cleanPayload.code = payload.code.slice(0, 64);
    if (typeof payload.text === 'string') cleanPayload.text = payload.text.slice(0, 512);
    if (payload.ctrl !== undefined) cleanPayload.ctrl = Boolean(payload.ctrl);
    if (payload.alt !== undefined) cleanPayload.alt = Boolean(payload.alt);
    if (payload.shift !== undefined) cleanPayload.shift = Boolean(payload.shift);
    if (payload.meta !== undefined) cleanPayload.meta = Boolean(payload.meta);
    if (typeof payload.monitor_x === 'number' && Number.isFinite(payload.monitor_x)) cleanPayload.monitor_x = Math.round(payload.monitor_x);
    if (typeof payload.monitor_y === 'number' && Number.isFinite(payload.monitor_y)) cleanPayload.monitor_y = Math.round(payload.monitor_y);
    if (typeof payload.monitor_w === 'number' && Number.isFinite(payload.monitor_w)) cleanPayload.monitor_w = Math.round(payload.monitor_w);
    if (typeof payload.monitor_h === 'number' && Number.isFinite(payload.monitor_h)) cleanPayload.monitor_h = Math.round(payload.monitor_h);

    io.to(pairedSocketId).emit('remote_assist_input', cleanPayload);
  });

  socket.on('direct_screen_share_state', ({ isSharing }: { isSharing: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    if (!isSharing) {
      const activeSess = remoteAssistManager.getSessionByHost(socket.id);
      if (activeSess) {
        remoteAssistManager.endSessionForSocket(socket.id);
        io.to(pairedSocketId).emit('remote_assist_stopped', { stoppedBy: 'Ekran paylaşımı durduruldu' });
      }
    }
    io.to(pairedSocketId).emit('direct_screen_share_state', {
      userId: socket.id,
      isSharing: Boolean(isSharing)
    });
  });

  socket.on('direct_camera_state', ({ isCameraOn }: { isCameraOn: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    io.to(pairedSocketId).emit('direct_camera_state', {
      userId: socket.id,
      isCameraOn: Boolean(isCameraOn)
    });
  });

  socket.on('direct_media_meta', ({ trackId, kind, active }: { trackId: string; kind: 'screen' | 'camera'; active: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || typeof trackId !== 'string') return;
    if (kind !== 'screen' && kind !== 'camera') return;
    io.to(pairedSocketId).emit('direct_media_meta', {
      userId: socket.id,
      trackId: trackId.slice(0, 128),
      kind,
      active: Boolean(active),
    });
  });

  socket.on('remote_assist_clipboard', ({ text }: { text: string }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    const sender = activeUsers.get(socket.id);
    if (!pairedSocketId || typeof text !== 'string' || !text.trim()) return;
    if (!remoteAssistManager.canShareClipboard(socket.id, pairedSocketId)) return;
    io.to(pairedSocketId).emit('remote_assist_clipboard', {
      fromUsername: sender?.username || 'Kullanıcı',
      text: text.slice(0, 8000),
    });
  });

  socket.on('remote_assist_clipboard_pull', () => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    const requester = activeUsers.get(socket.id);
    if (!pairedSocketId || !requester) return;
    if (!remoteAssistManager.canShareClipboard(socket.id, pairedSocketId)) return;
    io.to(pairedSocketId).emit('remote_assist_clipboard_pull_request', {
      fromUsername: requester.username,
    });
  });

  socket.on('remote_assist_laser', (payload: { x: number; y: number; active: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload) return;
    const sess = remoteAssistManager.getSessionForSocket(socket.id);
    if (sess && sess.controllerSocketId === socket.id && !sess.permissions.annotate) return;
    io.to(pairedSocketId).emit('remote_assist_laser', {
      x: Math.min(1, Math.max(0, Number(payload.x) || 0)),
      y: Math.min(1, Math.max(0, Number(payload.y) || 0)),
      active: Boolean(payload.active),
    });
  });

  socket.on('remote_assist_annotation', (payload: {
    action: 'stroke' | 'clear';
    stroke?: {
      id: string;
      tool: 'pen' | 'arrow' | 'rect';
      color: string;
      points: Array<{ x: number; y: number }>;
    };
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload) return;
    const sess = remoteAssistManager.getSessionForSocket(socket.id);
    if (sess && sess.controllerSocketId === socket.id && !sess.permissions.annotate) return;

    if (payload.action === 'clear') {
      io.to(pairedSocketId).emit('remote_assist_annotation', { action: 'clear' });
      return;
    }

    if (payload.action === 'stroke' && payload.stroke && Array.isArray(payload.stroke.points)) {
      const allowedTools = new Set(['pen', 'arrow', 'rect']);
      const tool = allowedTools.has(payload.stroke.tool) ? payload.stroke.tool : 'pen';
      const safeColor = /^#[0-9a-fA-F]{6}$/.test(String(payload.stroke.color || ''))
        ? payload.stroke.color
        : '#f43f5e';
      const safePoints = payload.stroke.points.slice(0, 120).map((p) => ({
        x: Math.min(1, Math.max(0, Number(p.x) || 0)),
        y: Math.min(1, Math.max(0, Number(p.y) || 0)),
      }));
      if (safePoints.length === 0) return;

      io.to(pairedSocketId).emit('remote_assist_annotation', {
        action: 'stroke',
        stroke: {
          id: String(payload.stroke.id || `ann-${Date.now()}`).slice(0, 64),
          tool,
          color: safeColor,
          points: safePoints,
          createdAt: Date.now(),
        },
      });
    }
  });

  // Voice Channel Join
  socket.on('join_voice', ({ channelId, password }: { channelId: string; password?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    if (channelId.startsWith('voice-gdm-') && !isUserMemberOfGroupDm(user, channelId, groupDms)) {
      return socket.emit('server_action_error', {
        message: 'Bu grup ses odasına erişim yetkiniz yok.',
      });
    }

    let targetChannelId = channelId;
    const targetChannel = servers.flatMap(s => s.channels).find(c => c.id === channelId);
    const parentServer = servers.find(s => s.channels.some(c => c.id === channelId));
    if (targetChannel && parentServer) {
      const chPerms = resolveChannelPermissions(user, parentServer, targetChannel);
      if (!chPerms.view_channel || !chPerms.connect_voice) {
        return socket.emit('server_action_error', {
          message: 'Bu ses kanalına katılma yetkiniz yok.'
        });
      }
    }
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
      const isOwner = isServerOwner(user, server);
      if (!isOwner && password !== targetChannel.password) {
        return socket.emit('voice_password_error', {
          channelId,
          channelName: targetChannel.name,
          message: 'Bu oda şifrelidir. Hatalı şifre girdiniz.'
        });
      }
    }

    // Channel user capacity limit check (for voice rooms)
    if (targetChannel && targetChannel.userLimit && targetChannel.userLimit > 0 && user.role !== 'admin') {
      const server = servers.find(s => s.id === targetChannel.serverId);
      const isOwner = isServerOwner(user, server);
      const currentOccupancy = Array.from(activeUsers.values()).filter(
        u => u.currentVoiceChannelId === targetChannel.id && u.id !== socket.id
      ).length;
      if (!isOwner && currentOccupancy >= targetChannel.userLimit) {
        return socket.emit('server_action_error', {
          message: `Bu ses odası dolu (Maksimum ${targetChannel.userLimit} kişi).`
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
          createdByUserId: user.id,
          bitrateKbps: targetChannel.bitrateKbps || server.bitrateKbps || 128,
          userLimit: targetChannel.userLimit || 0,
        };
        server.channels.push(tempChannel);
        saveServers(servers);
        emitServersUpdatedForAll();
        targetChannelId = tempChannelId;
      }
    }

    if (user.currentVoiceChannelId && user.currentVoiceChannelId !== targetChannelId) {
      const oldVoiceChannelId = user.currentVoiceChannelId;
      socket.leave(oldVoiceChannelId);
      io.to(oldVoiceChannelId).emit('user_left_voice', { userId: socket.id, channelId: oldVoiceChannelId });
      handleUserLeaveStage(servers, user.username, oldVoiceChannelId, emitToServerMembers, saveServers);
      cleanupTemporaryChannels();
      const oldSrv = findServerByChannelId(servers, oldVoiceChannelId);
      const newSrv = findServerByChannelId(servers, targetChannelId);
      if (oldSrv && oldSrv.id !== newSrv?.id) {
        emitToServerMembers(oldSrv, 'voice_state_update', {
          userId: socket.id,
          channelId: targetChannelId,
          isMuted: user.isMuted,
          isDeafened: user.isDeafened
        });
      }
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

    if (targetChannel?.type === 'stage' && parentServer) {
      const st = ensureStageState(targetChannel);
      const isStageMod =
        isServerOwner(user, parentServer) ||
        checkServerPermission(user, parentServer, 'mute_members') ||
        checkServerPermission(user, parentServer, 'manage_channels');
      if (isStageMod && !st.speakerUsernames.some((u) => u.toLowerCase() === user.username.toLowerCase())) {
        st.speakerUsernames.push(user.username);
        saveServers(servers);
        emitToServerMembers(parentServer, 'stage_state_updated', {
          serverId: parentServer.id,
          channelId: targetChannel.id,
          stageState: st,
        });
      } else {
        socket.emit('stage_state_updated', {
          serverId: parentServer.id,
          channelId: targetChannel.id,
          stageState: st,
        });
      }
    }

    // Hybrid SFU: Switch room to LiveKit SFU based on server sfuMode & system threshold
    const lkCfg = getEffectiveLiveKitConfig();
    const roomServer = servers.find(s => s.channels.some(c => c.id === targetChannelId));
    const srvSfuMode = roomServer?.sfuMode || 'auto';
    const shouldUseSfu = shouldRoomUseSfu({
      sfuEnabled: lkCfg.enabled,
      serverMode: srvSfuMode,
      participantCount: peersInRoom.length + 1,
      threshold: lkCfg.threshold,
    });

    if (shouldUseSfu) {
      getLiveKitDiagnostics().then(async (diag) => {
        if (!diag.enabled || !diag.configured || !diag.reachable) {
          if (srvSfuMode === 'sfu') {
            socket.emit('voice_sfu_unavailable', { reason: diag.reason, url: diag.url });
          }
          return;
        }
        const token = await createLiveKitRoomToken(targetChannelId, user.username);
        if (token) {
          socket.emit('voice_sfu_token', { token, roomName: targetChannelId, path: '/livekit' });
        }
        // Also upgrade existing peers in the room if they just crossed threshold in auto mode
        if (srvSfuMode === 'sfu' || peersInRoom.length + 1 === lkCfg.threshold) {
          for (const p of peersInRoom) {
            const pToken = await createLiveKitRoomToken(targetChannelId, p.username);
            if (pToken) {
              io.to(p.id).emit('voice_sfu_token', { token: pToken, roomName: targetChannelId, path: '/livekit' });
            }
          }
        }
      }).catch(() => {});
    }

    emitToVoiceChannelAudience(targetChannelId, user, 'voice_state_update', {
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
    if (!targetChannel || (targetChannel.type !== 'voice' && targetChannel.type !== 'stage')) return;
    if (parentServer && !resolveChannelPermissions(targetUser, parentServer, targetChannel).connect_voice) return;
    if (targetChannel.isTempCreatorChannel || targetChannel.name.includes('➕ Oda Kur')) return;

    const isSelf = targetUserId === socket.id;
    const isAdmin = requester.role === 'admin';
    const isOwner = isServerOwner(requester, parentServer);

    if (!isSelf && !isAdmin && !isOwner) {
      return socket.emit('server_action_error', { message: 'Kullanıcıları başka odaya taşıma yetkiniz yok.' });
    }

    if (targetUser.currentVoiceChannelId === targetChannelId) return;

    const targetSock = io.sockets.sockets.get(targetUserId);
    if (!targetSock) return;

    // If self or user is already in ANY voice channel -> move immediately without asking
    if (isSelf || Boolean(targetUser.currentVoiceChannelId)) {
      performVoiceMove(targetUserId, targetChannelId, requester.username, isSelf);
      return;
    }

    // Target user is NOT in any voice channel -> ask for permission with a notification
    const requestId = crypto.randomUUID();
    pendingVoicePullInvites.set(requestId, {
      fromUserId: requester.id,
      fromUsername: requester.username,
      targetUserId,
      targetChannelId,
      channelName: targetChannel.name,
      expiresAt: Date.now() + 2 * 60 * 1000,
    });

    targetSock.emit('voice_pull_invite', {
      requestId,
      fromUserId: requester.id,
      fromUsername: requester.username,
      fromAvatar: requester.avatar,
      targetChannelId,
      channelName: targetChannel.name,
      serverName: parentServer?.name || 'Ana Topluluk',
    });

    socket.emit('voice_pull_status', {
      status: 'sent',
      targetUsername: targetUser.username,
      message: `${targetUser.username} ses odasında olmadığı için odaya katılım izni istendi.`,
    });
  });

  // Respond to voice pull permission invite
  socket.on('respond_voice_pull_invite', ({ requestId, accepted }: { requestId: string; accepted: boolean }) => {
    const inv = pendingVoicePullInvites.get(requestId);
    if (!inv || inv.targetUserId !== socket.id) return;
    pendingVoicePullInvites.delete(requestId);
    if (Date.now() > inv.expiresAt) return;

    const targetUser = activeUsers.get(socket.id);
    const fromSock = io.sockets.sockets.get(inv.fromUserId);

    if (!accepted) {
      if (fromSock) {
        fromSock.emit('voice_pull_status', {
          status: 'rejected',
          targetUsername: targetUser?.username || 'Kullanıcı',
          message: `${targetUser?.username || 'Kullanıcı'} #${inv.channelName} odasına çekilme isteğinizi reddetti.`,
        });
      }
      addAuditLog('ODA_CEKME_REDDEDILDI', `${targetUser?.username || socket.id}, ${inv.fromUsername} tarafından #${inv.channelName} odasına çekilme isteğini reddetti.`, 'voice');
      return;
    }

    performVoiceMove(socket.id, inv.targetChannelId, inv.fromUsername, false);
    if (fromSock) {
      fromSock.emit('voice_pull_status', {
        status: 'accepted',
        targetUsername: targetUser?.username || 'Kullanıcı',
        message: `${targetUser?.username || 'Kullanıcı'} #${inv.channelName} odasına katılım isteğini kabul etti.`,
      });
    }
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

    emitToVoiceChannelAudience(oldChannelId, user, 'voice_state_update', {
      userId: socket.id,
      channelId: null,
      isMuted: user.isMuted,
      isDeafened: user.isDeafened
    });

    addAuditLog('SESTEN_AYRILDI', `${user.username} ses kanalindan ayrildi`, 'voice');
    updateUserConnectionLocation(socket.id, undefined, '#genel-sohbet');
    handleUserLeaveStage(servers, user.username, oldChannelId, emitToServerMembers, saveServers);
    cleanupTemporaryChannels();
  });

  // Priority Speaker relay (scoped to voice channel)
  socket.on('priority_speaker_toggle', ({ active }: { active: boolean }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !user.currentVoiceChannelId) return;
    io.to(user.currentVoiceChannelId).emit('priority_speaker_active', { userId: socket.id, username: user.username, active });
  });

  // Webcam state update relay (scoped to voice channel or active direct call)
  socket.on('webcam_state_update', ({ active }: { active: boolean }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('user_webcam_update', { userId: socket.id, active });
      return;
    }
    socket.emit('user_webcam_update', { userId: socket.id, active });
    const pairedId = activeDirectCallPairs.get(socket.id);
    if (pairedId) {
      io.to(pairedId).emit('user_webcam_update', { userId: socket.id, active });
    }
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

  // 1 & 2. Watch Together & Mini Games (extracted module)
  registerWatchTogetherAndGamesHandlers(socket, {
    io,
    activeUsers,
    watchTogetherRooms,
    miniGameRooms,
    addAuditLog,
    onGameWin: (winnerUsername) => {
      const acc = registeredAccounts.get(winnerUsername.toLowerCase());
      if (!acc) return;
      const updated = evaluateUserAchievements(acc.badges || getUserBadges(acc.role, acc.username), {
        gameWins: 1,
        level: acc.level || 1,
      });
      acc.badges = updated;
      saveAccounts(registeredAccounts);
      for (const activeU of activeUsers.values()) {
        if (activeU.username.toLowerCase() === winnerUsername.toLowerCase()) {
          activeU.badges = updated;
          emitUserUpdated(activeU);
        }
      }
    },
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
    if (isSpeaking && user.currentVoiceChannelId) {
      userVoiceActivity.set(socket.id, Date.now());
    }
    if (user.currentVoiceChannelId) {
      io.to(user.currentVoiceChannelId).emit('user_speaking_change', {
        userId: socket.id,
        isSpeaking
      });
    }
    const directPartnerSocketId = activeDirectCallPairs.get(socket.id);
    if (directPartnerSocketId) {
      io.to(directPartnerSocketId).emit('user_speaking_change', {
        userId: socket.id,
        isSpeaking
      });
    }
  });

  // Live Captions Relay across Voice Channel Participants
  socket.on(
    'voice_caption_emit',
    (payload: {
      channelId?: string;
      id?: string;
      source?: string;
      sourceLabel?: string;
      text?: string;
      translatedText?: string;
      sourceLang?: string;
      targetLang?: string | null;
      time?: string;
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !user.currentVoiceChannelId) return;
      const channelId = String(payload?.channelId || '').trim();
      if (!channelId || user.currentVoiceChannelId !== channelId) return;

      const text = String(payload?.text || '').trim().slice(0, 400);
      if (!text) return;

      const translatedText =
        typeof payload?.translatedText === 'string' && payload.translatedText.trim()
          ? payload.translatedText.trim().slice(0, 500)
          : undefined;
      const source = payload?.source === 'stream' ? 'stream' : 'user';
      const sourceLabel =
        source === 'stream' && typeof payload?.sourceLabel === 'string'
          ? payload.sourceLabel.trim().slice(0, 64)
          : undefined;

      socket.to(channelId).emit('voice_caption_received', {
        id: String(payload?.id || `cap-${Date.now()}`).slice(0, 64),
        channelId,
        author: user.username,
        source,
        sourceLabel,
        text,
        translatedText,
        sourceLang: String(payload?.sourceLang || 'tr').slice(0, 8),
        targetLang: payload?.targetLang ? String(payload.targetLang).slice(0, 8) : null,
        time:
          typeof payload?.time === 'string' && payload.time.trim()
            ? payload.time.trim().slice(0, 16)
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  );

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

  // Viewer -> Presenter per-peer stream quality request
  socket.on('screen_share_quality_request', ({ targetUserId, quality }: { targetUserId: string; quality: string }) => {
    if (!targetUserId || !['auto', '360', '480', '720', '1080', 'source'].includes(quality)) return;
    const senderUser = activeUsers.get(socket.id);
    const targetUser = activeUsers.get(targetUserId);
    if (!senderUser || !targetUser) return;
    io.to(targetUserId).emit('screen_share_quality_request', {
      fromUserId: socket.id,
      quality,
    });
  });

  // Ephemeral Laser Pointer / Annotation over active screen share
  socket.on('screen_share_laser', ({ channelId, presenterId, x, y, color }: { channelId: string; presenterId: string; x: number; y: number; color?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !presenterId) return;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 1 || y < 0 || y > 1) return;
    io.to(channelId).emit('screen_share_laser', {
      id: `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromUsername: user.username,
      presenterId,
      x,
      y,
      color: color || '#f43f5e',
    });
  });

  // User State Update (Mute, Deafen, Online Status - Username change is prohibited here to prevent spoofing)
  socket.on('update_user_state', ({ isMuted, isDeafened, status, avatar }: Partial<User>) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    if (isMuted !== undefined) user.isMuted = user.isServerMuted ? true : isMuted;
    if (isDeafened !== undefined) user.isDeafened = user.isServerDeafened ? true : isDeafened;
    if (status !== undefined) user.status = status;
    if (avatar !== undefined) user.avatar = avatar;

    emitUserUpdated(user);
  });

  // Server-enforced Voice Mute / Deafen (Moderator action)
  socket.on('admin_server_mute_user', ({ targetUserId, muted, deafened }: { targetUserId: string; muted?: boolean; deafened?: boolean }) => {
    const requester = activeUsers.get(socket.id);
    const target = activeUsers.get(targetUserId);
    if (!requester || !target) return;

    const channelId = target.currentVoiceChannelId;
    const server = servers.find(s => s.channels.some(c => c.id === channelId)) || servers[0];
    const canModerate = requester.role === 'admin' || (server && (isServerOwner(requester, server) || checkServerPermission(requester, server, 'mute_members')));
    if (!canModerate) {
      return socket.emit('server_action_error', { message: 'Üyeleri sunucudan susturmak için yetkiniz yok.' });
    }

    if (muted !== undefined) {
      target.isServerMuted = muted;
      if (muted) target.isMuted = true;
    }
    if (deafened !== undefined) {
      target.isServerDeafened = deafened;
      if (deafened) target.isDeafened = true;
    }

    emitUserUpdated(target);
    io.to(targetUserId).emit('server_moderation_voice', {
      isServerMuted: !!target.isServerMuted,
      isServerDeafened: !!target.isServerDeafened,
      byUsername: requester.username,
    });
    addAuditLog('SES_MODERASYON', `${requester.username}, ${target.username} için sunucu ses durumunu güncelledi (Sustur: ${!!target.isServerMuted}, Sağır: ${!!target.isServerDeafened}).`, 'voice');
  });

  // Meeting Mode: Server-mute / unmute everyone in a voice channel
  socket.on('admin_mute_all_voice', ({ channelId, muted }: { channelId: string; muted: boolean }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || !channelId) return;
    const server = servers.find(s => s.channels.some(c => c.id === channelId));
    const canModerate = requester.role === 'admin' || (server && (isServerOwner(requester, server) || checkServerPermission(requester, server, 'mute_members')));
    if (!canModerate) {
      return socket.emit('server_action_error', { message: 'Odadaki herkesi susturmak için yetkiniz yok.' });
    }

    for (const [sId, u] of activeUsers.entries()) {
      if (u.currentVoiceChannelId === channelId && sId !== socket.id && u.role !== 'admin') {
        u.isServerMuted = muted;
        if (muted) u.isMuted = true;
        emitUserUpdated(u);
        io.to(sId).emit('server_moderation_voice', {
          isServerMuted: !!u.isServerMuted,
          isServerDeafened: !!u.isServerDeafened,
          byUsername: requester.username,
        });
      }
    }
    addAuditLog('TOPLANTI_SUSTURMA', `${requester.username}, ses odasındaki tüm katılımcıları ${muted ? 'susturdu' : 'açtı'}.`, 'voice');
  });

  // ================= ADMIN DASHBOARD EVENTS =================
  socket.on('admin_request_data', async () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') {
      return socket.emit('admin_error', 'Yetkisiz erişim! Bu işlem için Sistem Yöneticisi olmalısınız.');
    }

    const livekitStatus = await getLiveKitDiagnostics();

    socket.emit('admin_data_response', {
      stats: getSystemStats(),
      livekitStatus,
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
      systemConfig: {
        ...systemConfig,
        aiSummaryApiKey: systemConfig.aiSummaryApiKey ? '********' : '',
        hasAiSummaryApiKey: Boolean(systemConfig.aiSummaryApiKey),
        backupS3SecretKey: systemConfig.backupS3SecretKey ? '********' : '',
        hasBackupS3SecretKey: Boolean(systemConfig.backupS3SecretKey),
        mediaS3SecretKey: systemConfig.mediaS3SecretKey ? '********' : '',
        hasMediaS3SecretKey: Boolean(systemConfig.mediaS3SecretKey),
        steamWebApiKey: systemConfig.steamWebApiKey ? '********' : '',
        hasSteamWebApiKey: Boolean(systemConfig.steamWebApiKey),
        githubClientSecret: systemConfig.githubClientSecret ? '********' : '',
        hasGithubClientSecret: Boolean(systemConfig.githubClientSecret),
        googleClientSecret: systemConfig.googleClientSecret ? '********' : '',
        hasGoogleClientSecret: Boolean(systemConfig.googleClientSecret),
      },
      bannedIps: bannedIps.filter((b) => !b.expiresAt || b.expiresAt > Date.now()),
      storageStats: getStorageStats(),
      storageEngine: getStorageEngineInfo().engine,
      pinnedBanner: systemConfig.pinnedBanner || null,
      activeSessions: Array.from(activeSessions.values()),
      scheduledBackups: listScheduledBackups(),
      contentReports,
      securityAudit: (() => {
        const admins = Array.from(registeredAccounts.values()).filter((a) => a.role === 'admin');
        const adminsWithout2fa = admins.filter((a) => !a.twoFactorEnabled).map((a) => a.username);
        const usingDefaultMasterKey =
          !MASTER_API_KEY || MASTER_API_KEY === 'cakma_master_sec_2026' || MASTER_API_KEY.length < 24;
        const usingDefaultSessionSecret =
          !SESSION_SECRET || SESSION_SECRET === 'cakma_default_session_secret' || SESSION_SECRET.length < 24;
        const checks: Array<{ id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }> = [
          {
            id: 'master_key',
            label: 'Master API Anahtarı',
            status: usingDefaultMasterKey ? 'fail' : 'pass',
            detail: usingDefaultMasterKey
              ? 'Varsayılan MASTER_API_KEY kullanılıyor! .env içinde değiştirin.'
              : process.env.MASTER_API_KEY
              ? 'Özel MASTER_API_KEY (.env) tanımlı.'
              : 'Kriptografik MASTER_API_KEY aktif (server-secrets.json).',
          },
          {
            id: 'session_secret',
            label: 'Oturum İmza Anahtarı (SESSION_SECRET)',
            status: usingDefaultSessionSecret ? 'warn' : 'pass',
            detail: usingDefaultSessionSecret
              ? 'Özel SESSION_SECRET ortam değişkeni tanımlı değil.'
              : process.env.SESSION_SECRET
              ? 'Özel SESSION_SECRET (.env) aktif.'
              : 'Kriptografik SESSION_SECRET aktif (server-secrets.json).',
          },
          {
            id: 'admin_2fa',
            label: 'Yönetici 2FA Koruması',
            status: adminsWithout2fa.length === 0 ? 'pass' : systemConfig.requireAdmin2FA ? 'fail' : 'warn',
            detail:
              adminsWithout2fa.length === 0
                ? 'Tüm yöneticilerde 2FA aktif.'
                : `2FA kapalı yöneticiler: ${adminsWithout2fa.join(', ')}`,
          },
          {
            id: 'strong_pass',
            label: 'Güçlü Şifre Politikası',
            status: systemConfig.requireStrongPasswords ? 'pass' : 'warn',
            detail: systemConfig.requireStrongPasswords
              ? 'Yeni kayıtlarda güçlü şifre zorunlu.'
              : 'Güçlü şifre zorunluluğu kapalı.',
          },
          {
            id: 'brute_force',
            label: 'Giriş Deneme Sınırı',
            status: (systemConfig.maxLoginAttempts || 5) <= 7 ? 'pass' : 'warn',
            detail: `Maksimum ${systemConfig.maxLoginAttempts || 5} hatalı deneme, ${systemConfig.loginLockoutMinutes || 15} dk kilit.`,
          },
          {
            id: 'cors_origins',
            label: 'CORS İzin Listesi',
            status: ALLOWED_ORIGINS.includes('*') ? 'fail' : 'pass',
            detail: `${ALLOWED_ORIGINS.length} izinli kaynak yapılandırıldı.`,
          },
        ];
        const passed = checks.filter((c) => c.status === 'pass').length;
        const warned = checks.filter((c) => c.status === 'warn').length;
        const score = Math.round(((passed + warned * 0.5) / checks.length) * 100);
        return { score, checkedAt: new Date().toISOString(), checks };
      })(),
    });
  });

  // Admin: Update Runtime System Configuration
  socket.on('admin_update_system_config', (nextCfg: Partial<SystemConfig>) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    if (typeof nextCfg.registrationEnabled === 'boolean') systemConfig.registrationEnabled = nextCfg.registrationEnabled;
    if (typeof nextCfg.inviteOnlyRegistration === 'boolean') systemConfig.inviteOnlyRegistration = nextCfg.inviteOnlyRegistration;
    if (typeof nextCfg.requireUniqueEmail === 'boolean') systemConfig.requireUniqueEmail = nextCfg.requireUniqueEmail;
    if (typeof nextCfg.defaultWalletBalance === 'number') systemConfig.defaultWalletBalance = Math.min(Math.max(Math.floor(nextCfg.defaultWalletBalance), 0), 10000);
    if (typeof nextCfg.maxAccountsPerIpPerDay === 'number') systemConfig.maxAccountsPerIpPerDay = Math.min(Math.max(Math.floor(nextCfg.maxAccountsPerIpPerDay), 1), 20);
    if (typeof nextCfg.requireEmailVerification === 'boolean') systemConfig.requireEmailVerification = nextCfg.requireEmailVerification;
    if (typeof nextCfg.smtpHost === 'string') systemConfig.smtpHost = nextCfg.smtpHost.trim().slice(0, 120);
    if (typeof nextCfg.smtpPort === 'number') systemConfig.smtpPort = Math.min(Math.max(Math.floor(nextCfg.smtpPort), 1), 65535);
    if (typeof nextCfg.smtpSecure === 'boolean') systemConfig.smtpSecure = nextCfg.smtpSecure;
    if (typeof nextCfg.smtpUser === 'string') systemConfig.smtpUser = nextCfg.smtpUser.trim().slice(0, 120);
    if (typeof nextCfg.smtpPass === 'string') systemConfig.smtpPass = nextCfg.smtpPass.trim().slice(0, 200);
    if (typeof nextCfg.smtpFrom === 'string') systemConfig.smtpFrom = nextCfg.smtpFrom.trim().slice(0, 120);
    if (typeof nextCfg.mailRelayUrl === 'string') systemConfig.mailRelayUrl = nextCfg.mailRelayUrl.trim().slice(0, 300);
    if (typeof nextCfg.mailRelaySecret === 'string') systemConfig.mailRelaySecret = nextCfg.mailRelaySecret.trim().slice(0, 160);
    if (typeof nextCfg.maintenanceMode === 'boolean') systemConfig.maintenanceMode = nextCfg.maintenanceMode;
    if (typeof nextCfg.maintenanceMessage === 'string') systemConfig.maintenanceMessage = sanitizeText(nextCfg.maintenanceMessage.trim()).slice(0, 240);
    if (typeof nextCfg.requireStrongPasswords === 'boolean') systemConfig.requireStrongPasswords = nextCfg.requireStrongPasswords;
    if (typeof nextCfg.requireAdmin2FA === 'boolean') systemConfig.requireAdmin2FA = nextCfg.requireAdmin2FA;
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
    if (typeof nextCfg.backupS3Enabled === 'boolean') systemConfig.backupS3Enabled = nextCfg.backupS3Enabled;
    if (typeof nextCfg.backupS3AutoPush === 'boolean') systemConfig.backupS3AutoPush = nextCfg.backupS3AutoPush;
    if (typeof nextCfg.backupS3Endpoint === 'string') systemConfig.backupS3Endpoint = nextCfg.backupS3Endpoint.trim().slice(0, 300);
    if (typeof nextCfg.backupS3Bucket === 'string') systemConfig.backupS3Bucket = nextCfg.backupS3Bucket.trim().slice(0, 120);
    if (typeof nextCfg.backupS3Region === 'string') systemConfig.backupS3Region = nextCfg.backupS3Region.trim().slice(0, 64) || 'auto';
    if (typeof nextCfg.backupS3Prefix === 'string') systemConfig.backupS3Prefix = nextCfg.backupS3Prefix.trim().slice(0, 120);
    if (typeof nextCfg.backupS3AccessKey === 'string') systemConfig.backupS3AccessKey = nextCfg.backupS3AccessKey.trim().slice(0, 160);
    if (typeof nextCfg.backupS3SecretKey === 'string' && nextCfg.backupS3SecretKey.trim() !== '********') {
      systemConfig.backupS3SecretKey = nextCfg.backupS3SecretKey.trim().slice(0, 240);
    }
    if (typeof nextCfg.mediaS3Enabled === 'boolean') systemConfig.mediaS3Enabled = nextCfg.mediaS3Enabled;
    if (typeof nextCfg.mediaS3UseBackupCredentials === 'boolean') systemConfig.mediaS3UseBackupCredentials = nextCfg.mediaS3UseBackupCredentials;
    if (typeof nextCfg.mediaS3Endpoint === 'string') systemConfig.mediaS3Endpoint = nextCfg.mediaS3Endpoint.trim().slice(0, 300);
    if (typeof nextCfg.mediaS3Bucket === 'string') systemConfig.mediaS3Bucket = nextCfg.mediaS3Bucket.trim().slice(0, 120);
    if (typeof nextCfg.mediaS3Region === 'string') systemConfig.mediaS3Region = nextCfg.mediaS3Region.trim().slice(0, 64) || 'auto';
    if (typeof nextCfg.mediaS3AccessKey === 'string') systemConfig.mediaS3AccessKey = nextCfg.mediaS3AccessKey.trim().slice(0, 160);
    if (typeof nextCfg.mediaS3SecretKey === 'string' && nextCfg.mediaS3SecretKey.trim() !== '********') {
      systemConfig.mediaS3SecretKey = nextCfg.mediaS3SecretKey.trim().slice(0, 240);
    }
    if (typeof nextCfg.mediaS3Prefix === 'string') systemConfig.mediaS3Prefix = nextCfg.mediaS3Prefix.trim().slice(0, 120);
    if (typeof nextCfg.mediaS3PublicBaseUrl === 'string') systemConfig.mediaS3PublicBaseUrl = nextCfg.mediaS3PublicBaseUrl.trim().slice(0, 300);
    if (typeof nextCfg.mediaS3MinSizeKb === 'number') systemConfig.mediaS3MinSizeKb = Math.min(Math.max(Math.floor(nextCfg.mediaS3MinSizeKb), 0), 25_000);
    if (typeof nextCfg.steamAuthEnabled === 'boolean') systemConfig.steamAuthEnabled = nextCfg.steamAuthEnabled;
    if (typeof nextCfg.steamWebApiKey === 'string' && nextCfg.steamWebApiKey.trim() !== '********') {
      systemConfig.steamWebApiKey = nextCfg.steamWebApiKey.trim().slice(0, 200);
    }
    if (typeof nextCfg.githubClientId === 'string') systemConfig.githubClientId = nextCfg.githubClientId.trim().slice(0, 160);
    if (typeof nextCfg.githubClientSecret === 'string' && nextCfg.githubClientSecret.trim() !== '********') {
      systemConfig.githubClientSecret = nextCfg.githubClientSecret.trim().slice(0, 240);
    }
    if (typeof nextCfg.googleClientId === 'string') systemConfig.googleClientId = nextCfg.googleClientId.trim().slice(0, 200);
    if (typeof nextCfg.googleClientSecret === 'string' && nextCfg.googleClientSecret.trim() !== '********') {
      systemConfig.googleClientSecret = nextCfg.googleClientSecret.trim().slice(0, 240);
    }
    if (typeof nextCfg.oauthPublicBaseUrl === 'string') systemConfig.oauthPublicBaseUrl = nextCfg.oauthPublicBaseUrl.trim().slice(0, 300);
    if (typeof nextCfg.webhookUrl === 'string') systemConfig.webhookUrl = nextCfg.webhookUrl.trim().slice(0, 500);
    if (typeof nextCfg.giphyApiKey === 'string') {
      systemConfig.giphyApiKey = nextCfg.giphyApiKey.trim().slice(0, 120);
      clearGifCache();
    }
    if (nextCfg.aiSummaryProvider === 'builtin' || nextCfg.aiSummaryProvider === 'gemini' || nextCfg.aiSummaryProvider === 'openai') {
      systemConfig.aiSummaryProvider = nextCfg.aiSummaryProvider;
    }
    if (typeof nextCfg.aiSummaryApiKey === 'string' && nextCfg.aiSummaryApiKey.trim() !== '********') {
      systemConfig.aiSummaryApiKey = nextCfg.aiSummaryApiKey.trim().slice(0, 200);
    }
    if (typeof nextCfg.aiSummaryModel === 'string') {
      systemConfig.aiSummaryModel = nextCfg.aiSummaryModel.trim().slice(0, 80);
    }
    if (typeof nextCfg.sfuEnabled === 'boolean') systemConfig.sfuEnabled = nextCfg.sfuEnabled;
    if (typeof nextCfg.sfuThreshold === 'number') systemConfig.sfuThreshold = Math.min(Math.max(Math.floor(nextCfg.sfuThreshold), 2), 30);
    if (typeof nextCfg.livekitUrl === 'string') systemConfig.livekitUrl = nextCfg.livekitUrl.trim().slice(0, 240);
    if (typeof nextCfg.livekitApiKey === 'string') systemConfig.livekitApiKey = nextCfg.livekitApiKey.trim().slice(0, 120);
    if (typeof nextCfg.livekitApiSecret === 'string') systemConfig.livekitApiSecret = nextCfg.livekitApiSecret.trim().slice(0, 200);
    if (typeof nextCfg.turnUrl === 'string') systemConfig.turnUrl = nextCfg.turnUrl.trim().slice(0, 240);
    if (typeof nextCfg.turnUsername === 'string') systemConfig.turnUsername = nextCfg.turnUsername.trim().slice(0, 120);
    if (typeof nextCfg.turnCredential === 'string') systemConfig.turnCredential = nextCfg.turnCredential.trim().slice(0, 200);
    livekitHealthyCache.checkedAt = 0;
    io.emit('ice_servers', getEffectiveIceServers());
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
    emitToAdmins('audit_log_added', auditLogs[0]);
  });

  // Admin: Create / Delete Registration Invite Codes
  socket.on('admin_create_reg_invite', ({ maxUses, expiresHours }: { maxUses?: number; expiresHours?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const list = systemConfig.registrationInvites || [];
    list.unshift({
      code,
      createdBy: requester.username,
      createdAt: new Date().toLocaleString('tr-TR'),
      maxUses: Math.min(Math.max(Number(maxUses) || 1, 1), 100),
      uses: 0,
      expiresAt: expiresHours && Number(expiresHours) > 0 ? Date.now() + Number(expiresHours) * 3600_000 : null,
    });
    systemConfig.registrationInvites = list.slice(0, 50);
    saveSystemConfig(systemConfig);
    addAuditLog('KAYIT_DAVETI_OLUSTURULDU', `${requester.username} kayıt davet kodu oluşturdu: ${code}`, 'auth');
    socket.emit('admin_action_success', `Kayıt davet kodu oluşturuldu: ${code}`);
    socket.emit('admin_reg_invites_updated', systemConfig.registrationInvites);
  });

  socket.on('admin_delete_reg_invite', ({ code }: { code: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    systemConfig.registrationInvites = (systemConfig.registrationInvites || []).filter((i) => i.code !== code);
    saveSystemConfig(systemConfig);
    socket.emit('admin_reg_invites_updated', systemConfig.registrationInvites);
  });

  // Admin: Test SMTP Email Delivery
  socket.on('admin_test_smtp', async ({
    toEmail,
    smtpConfig,
  }: {
    toEmail?: string;
    smtpConfig?: MailConfigInput;
  }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const target = (
      toEmail ||
      smtpConfig?.smtpUser ||
      systemConfig.smtpUser ||
      extractBareEmail(smtpConfig?.smtpFrom || systemConfig.smtpFrom) ||
      ''
    ).trim();
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) {
      const msg = 'Test için geçerli bir alıcı e-posta girin.';
      socket.emit('admin_feedback', { type: 'error', message: msg });
      socket.emit('admin_smtp_test_result', { ok: false, message: msg });
      return;
    }
    const res = await sendSmtpEmail(
      target,
      'Çakma SMTP Test Mesajı',
      'Tebrikler! SMTP ayarlarınız doğru çalışıyor ve e-posta doğrulama kodları gönderilmeye hazır.',
      undefined,
      smtpConfig
    );
    const viaLabel = res.transport === 'relay' ? 'HTTPS Relay' : 'SMTP';
    if (res.ok) {
      const msg = `Test e-postası (${viaLabel}) ${target} adresine gönderildi (Spam klasörünü de kontrol edin).`;
      socket.emit('admin_feedback', { type: 'success', message: msg });
      socket.emit('admin_smtp_test_result', { ok: true, message: msg });
    } else {
      const msg = `${viaLabel} Test Hatası: ${res.error}`;
      console.warn(`⚠️ [${viaLabel} Test] ${maskEmail(target)} gönderimi başarısız: ${res.error}`);
      socket.emit('admin_feedback', { type: 'error', message: msg });
      socket.emit('admin_smtp_test_result', { ok: false, message: msg });
    }
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
      if (systemConfig.backupS3Enabled && systemConfig.backupS3AutoPush) {
        void maintenanceService.pushBackupToS3(info.filename, systemConfig);
      }
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
    saveChannelMessageBulkReplace(channelId, messages[channelId]);
    emitToChannelAudience(channelId, undefined, 'channel_messages_purged', { channelId, remainingMessages: messages[channelId] });
    socket.emit('channel_messages_purged', { channelId, remainingMessages: messages[channelId] });
    addAuditLog('MESAJ_TEMIZLENDI', `${requester.username}, #${channelId} kanalından ${deletedCount} mesaj temizledi.`, 'warn');
    socket.emit('admin_action_success', `${deletedCount} mesaj başarıyla temizlendi.`);
  });

  // Admin: Reset user password
  socket.on('admin_reset_user_password', async ({ targetUsername, newPassword }: { targetUsername: string; newPassword: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;

    const acc = registeredAccounts.get((targetUsername || '').toLowerCase());
    if (!acc) {
      return socket.emit('admin_action_error', 'Hedef kullanıcı hesabı bulunamadı.');
    }
    if (!newPassword || newPassword.length < 6) {
      return socket.emit('admin_action_error', 'Yeni şifre en az 6 karakter olmalıdır.');
    }

    acc.password = await hashPasswordAsync(newPassword);
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
    emitServerUpdatedToMembers(srv);
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

    const targetServerObj = servers[idx];
    const recipientSocketIds = new Set<string>([socket.id]);
    for (const [sId, u] of activeUsers.entries()) {
      if (u.role === 'admin' || isUserMemberOfServer(u, targetServerObj)) {
        recipientSocketIds.add(sId);
      }
    }
    const [removed] = servers.splice(idx, 1);
    saveServers(servers);
    for (const sId of recipientSocketIds) {
      io.to(sId).emit('server_deleted', { serverId });
    }
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
          emitUserUpdated(u);
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
      emitToServerMembers(targetServer, 'channel_deleted', { serverId, channelId });
      emitServerUpdatedToMembers(targetServer);
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

      // Active Dedicated Server termination: update registry & send authenticated instant shutdown webhook
      notifyDedicatedLicenseRevoked(io, dedicatedServersRegistry, lic, reason);
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

  // Public Community Discovery: List Public Servers (without leaking invites, timeouts, or passwords)
  socket.on('get_discoverable_servers', () => {
    const requester = activeUsers.get(socket.id) || null;
    const list = buildDiscoverableServerSummaries(servers, activeUsers.values(), requester);
    socket.emit('discoverable_servers_list', list);
  });

  // Join Public Server voluntarily from Explore
  socket.on('join_public_server', ({ serverId }: { serverId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId) {
      return socket.emit('join_public_server_response', { success: false, error: 'Sunucuya katılmak için giriş yapmalısınız.' });
    }
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) {
      return socket.emit('join_public_server_response', { success: false, error: 'Sunucu bulunamadı.' });
    }
    if (srv.isPublic === false) {
      return socket.emit('join_public_server_response', { success: false, error: 'Bu sunucu herkese açık değil. Yalnızca davet kodu ile katılabilirsiniz.' });
    }

    const added = addUserToServer(user, srv);
    if (added) {
      addAuditLog('SUNUCU_KATILIM', `${user.username}, "${srv.name}" sunucusuna keşfet üzerinden katıldı.`, 'info');
    }
    emitServerUpdatedToMembers(srv);
    const srvMsgs = getInitialMessagesForServers([srv], user.username, user.id, user.role);
    socket.emit('join_public_server_response', {
      success: true,
      server: srv,
      messages: srvMsgs.initialMessages,
      hasMoreMessages: srvMsgs.hasMoreMessages,
    });
  });

  registerStoreSocketHandlers(socket, {
    io,
    activeUsers,
    registeredAccounts,
    issuedLicenses,
    storeSettings,
    sanitizeText,
    generateLicenseKey,
    saveAccounts,
    saveLicenses,
    addAuditLog,
  });

  // Disconnect
  socket.on('disconnect', () => {
    // Clean up active direct calls, pending ring timers, remote assist sessions & rate limits
    const user = activeUsers.get(socket.id);
    const paired = activeDirectCallPairs.get(socket.id);
    const startedAt = activeDirectCallStartTimes.get(socket.id) || (paired ? activeDirectCallStartTimes.get(paired) : undefined);
    const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
    const endedAssist = remoteAssistManager.endSessionForSocket(socket.id);

    if (paired) {
      const partner = activeUsers.get(paired);
      activeDirectCallPairs.delete(paired);
      activeDirectCallPairs.delete(socket.id);
      activeDirectCallStartTimes.delete(socket.id);
      activeDirectCallStartTimes.delete(paired);
      if (endedAssist) {
        io.to(paired).emit('remote_assist_stopped', { stoppedBy: user?.username || 'Bağlantı kesildi' });
      }
      io.to(paired).emit('direct_call_ended');
      if (user && partner) {
        persistAndEmitDirectCallLog(user, partner, 'ended', durationSeconds);
      }
    }

    for (const [targetKey, pending] of Array.from(pendingDirectCalls.entries())) {
      if (pending.callerSocketId === socket.id) {
        clearPendingDirectCallTimer(targetKey);
        pendingDirectCalls.delete(targetKey);
        for (const [sId, u] of activeUsers.entries()) {
          if (u.username.toLowerCase() === targetKey) {
            io.to(sId).emit('direct_call_handled');
          }
        }
      }
    }

    messageRateLimits.delete(socket.id);
    socketEventLimiter.clearSocket(socket.id);

    recordUserDisconnection(socket.id);
    if (user) {
      if (user.currentVoiceChannelId) {
        const departedChannelId = user.currentVoiceChannelId;
        socket.to(departedChannelId).emit('user_left_voice', {
          userId: socket.id,
          channelId: departedChannelId
        });
        handleUserLeaveStage(servers, user.username, departedChannelId, emitToServerMembers, saveServers);
      }
      activeUsers.delete(socket.id);
      emitToRelevantUsers(user, 'user_disconnected', socket.id);
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

    const afkChannel = srv.channels.find((c) => c.id === srv.afkChannelId && c.type === 'voice');
    if (!afkChannel) continue;

    const lastActive = userVoiceActivity.get(sid) || now;
    if (shouldMoveUserToAfk({
      currentVoiceChannelId: user.currentVoiceChannelId,
      isSpeaking: user.isSpeaking,
      lastActivityMs: lastActive,
      nowMs: now,
      afkChannelId: afkChannel.id,
      afkTimeoutMinutes: srv.afkTimeoutMinutes,
    })) {
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
      emitToVoiceChannelAudience(afkChannel.id, user, 'voice_state_update', {
        userId: sid,
        channelId: afkChannel.id,
        isMuted: user.isMuted,
        isDeafened: user.isDeafened
      });
      addAuditLog('AFK_TASIMA', `${user.username} hareketsiz kaldığı için AFK odasına (${afkChannel.name}) taşındı.`, 'voice');
    }
  }
}, 30_000).unref();

// Register modular Cloud Sync, Events, Sound Upload, and Session Management routes
registerCloudSyncAndEvents(app, io, activeUsers, {
  getMessagesMap: () => messages,
  getAccounts: () => registeredAccounts,
  getServers: () => servers,
  verifySessionToken,
  verifySessionTokenWithMeta,
  verifyMediaToken,
  getAccount: (usernameLower) => registeredAccounts.get(usernameLower),
  isUserMemberOfServer: (u, srv) => isUserMemberOfServer(u, srv),
  emitToServerMembers: (srv, event, payload) => emitToServerMembers(srv, event, payload),
  getEffectiveLiveKitConfig: () => ({
    ...getEffectiveLiveKitConfig(),
    turnUrl: (systemConfig?.turnUrl || process.env.TURN_URL || '').trim(),
    turnUsername: (systemConfig?.turnUsername || process.env.TURN_USERNAME || '').trim(),
    turnCredential: (systemConfig?.turnCredential || process.env.TURN_CREDENTIAL || '').trim(),
  }),
  addAuditLog,
  getMaxUploadSizeMb: () => systemConfig.maxUploadSizeMb || 5,
  getSystemConfig: () => systemConfig,
  getS3UploadsIndex: () => s3UploadsIndex,
  saveS3UploadsIndex: () => saveS3UploadsIndex(s3UploadsIndex),
});

// Desktop Installer & Updater Manifest Serving (kept outside client/dist so Tauri never bundles it recursively)
const downloadsDirCandidates = [
  path.resolve(__dirname, '../../downloads'),
  path.resolve(__dirname, '../downloads'),
  path.resolve(process.cwd(), 'downloads'),
  path.resolve(process.cwd(), '../downloads')
];

let activeDownloadsDir: string | null = null;
for (const cand of downloadsDirCandidates) {
  if (fs.existsSync(cand)) {
    activeDownloadsDir = cand;
    break;
  }
}

if (activeDownloadsDir) {
  app.use(
    '/downloads',
    express.static(activeDownloadsDir, {
      setHeaders: (res, filePath) => {
        if (filePath.toLowerCase().endsWith('.apk')) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', 'attachment; filename="Cakma.apk"');
        }
      },
    })
  );
  console.log(`📦 [İndirmeler] Masaüstü/Mobil paketleri yayında: ${activeDownloadsDir}`);
}

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
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/downloads') || req.path.startsWith('/uploads')) return next();
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

// Central Express Error Handler (prevents stack trace leaks & 500 spam on malformed/CORS requests)
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = (req as RequestWithId).requestId;
  logger.error('UNHANDLED_HTTP_ERROR', {
    requestId: reqId,
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : String(err),
  });
  if (res.headersSent) return;
  res.status(500).json({
    success: false,
    error: 'Sunucu içi hata oluştu.',
    ...(reqId ? { requestId: reqId } : {}),
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Backend Server] Discord/TeamSpeak Clone running on http://127.0.0.1:${PORT}`);
  void initStorageEngine(messages, { accounts: registeredAccounts, auditLogs }).then(() => {
    maintenanceService.startSchedulers();
    scheduledMessagesService.start();
  });
});

function handleGracefulShutdown(signal: string) {
  console.log(`🛑 [Shutdown] ${signal} alındı, bekleyen veriler diske yazılıyor...`);
  try {
    scheduledMessagesService.stop();
    maintenanceService.stopSchedulers();
    flushPendingWritesSync();
    closeStorageEngine();
  } catch (err) {
    console.error('Shutdown flush error:', err);
  }
  if (signal !== 'beforeExit') {
    process.exit(0);
  }
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('beforeExit', () => {
  try {
    flushPendingWritesSync();
  } catch {}
});
