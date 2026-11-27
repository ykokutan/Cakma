import crypto from 'node:crypto';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  AuditLog,
  Channel,
  ContentReport,
  DedicatedServerInfo,
  IssuedLicense,
  Message,
  RegisteredAccount,
  Server,
  ServerPermission,
  StoreSettings,
  SystemStats,
  User,
  UserConnectionRecord,
} from '../types.js';
import type { BannedIpRecord, ScheduledBackupInfo, SystemConfig } from '../storage.js';
import { extractBareEmail, maskEmail, type MailConfigInput, type MailSendResult } from '../utils/mailDelivery.js';
import { isUserMemberOfServer } from '../utils/serverDiscovery.js';
import { isServerOwner } from '../utils/serverIdentity.js';
import { notifyDedicatedLicenseRevoked } from './dedicatedRoutes.js';

export interface SystemAdminSocketDeps {
  io: SocketIOServer;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  servers: Server[];
  messages: Record<string, Message[]>;
  auditLogs: AuditLog[];
  connectionLogs: UserConnectionRecord[];
  storeSettings: StoreSettings;
  contentReports: ContentReport[];
  issuedLicenses: Map<string, IssuedLicense>;
  dedicatedServersRegistry: Map<string, DedicatedServerInfo>;
  activeSessions: Map<string, { socketId: string; username: string; ip: string; userAgent: string; connectedAt: string }>;
  MASTER_API_KEY: string;
  SESSION_SECRET: string;
  ALLOWED_ORIGINS: string[];
  defaultSystemConfig: SystemConfig;
  getSystemConfig: () => SystemConfig;
  setSystemConfig: (cfg: SystemConfig) => void;
  saveSystemConfig: (cfg: SystemConfig) => void;
  loadSystemConfig: (def: SystemConfig) => SystemConfig;
  getBannedIps: () => BannedIpRecord[];
  setBannedIps: (ips: BannedIpRecord[]) => void;
  saveBannedIps: (ips: BannedIpRecord[]) => void;
  loadBannedIps: () => BannedIpRecord[];
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission, channel?: Channel) => boolean;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  saveServers: (servers: Server[]) => void;
  saveConnectionLogs: (logs: UserConnectionRecord[]) => void;
  saveAuditLogs: (logs: AuditLog[]) => void;
  saveLicenses: (licenses: Map<string, IssuedLicense>) => void;
  saveStoreSettings: (settings: StoreSettings) => void;
  saveChannelMessageBulkReplace: (channelId: string, list: Message[]) => void;
  hashPasswordAsync: (password: string) => Promise<string>;
  generateLicenseKey: (
    licensee: string,
    maxSlots: number,
    expireDaysOrIso: number | string,
    tier?: 'Starter' | 'Pro' | 'Enterprise'
  ) => string;
  sendSmtpEmail: (
    toEmail: string,
    subject: string,
    text: string,
    html?: string,
    overrideConfig?: MailConfigInput
  ) => Promise<MailSendResult>;
  sendAdminWebhook: (category: 'security' | 'bans' | 'dedicated' | 'backups' | 'test', title: string, description: string) => Promise<boolean>;
  getLiveKitDiagnostics: () => Promise<{
    enabled: boolean;
    url: string;
    configured: boolean;
    reachable: boolean;
    reason: string;
  }>;
  resetLiveKitHealthyCache: () => void;
  getEffectiveIceServers: () => unknown;
  getSystemStats: () => SystemStats;
  getStorageStats: () => unknown;
  getStorageEngineInfo: () => { engine: string };
  clearGifCache: () => void;
  exportAllDataBundle: () => unknown;
  importAllDataBundle: (bundle: any) => string[];
  createScheduledBackup: (maxToKeep?: number) => { filename: string; size?: number };
  listScheduledBackups: () => ScheduledBackupInfo[];
  readScheduledBackup: (filename: string) => unknown;
  deleteScheduledBackup: (filename: string) => boolean;
  pushBackupToS3: (filename: string, cfg: SystemConfig) => Promise<unknown>;
  emitToAdmins: (event: string, payload: unknown) => void;
  emitUserUpdated: (user: User) => void;
  emitServerUpdatedToMembers: (srv: Server) => void;
  emitToServerMembers: (srv: Server, event: string, payload: unknown) => void;
  emitToChannelAudience: (channelId: string, serverId: string | undefined, event: string, payload: unknown, excludeSocketId?: string) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  getClientIp: (socket: Socket) => string;
  onSystemAnnouncement?: (payload: { sender: string; message: string; timestamp: string }) => void;
}

export function registerSystemAdminSocketHandlers(
  socket: Socket,
  deps: SystemAdminSocketDeps
): void {
  const {
    io,
    activeUsers,
    registeredAccounts,
    servers,
    messages,
    auditLogs,
    connectionLogs,
    storeSettings,
    contentReports,
    issuedLicenses,
    dedicatedServersRegistry,
    activeSessions,
    MASTER_API_KEY,
    SESSION_SECRET,
    ALLOWED_ORIGINS,
    defaultSystemConfig,
    sanitizeText,
    checkServerPermission,
    saveAccounts,
    saveServers,
    saveConnectionLogs,
    saveAuditLogs,
    saveLicenses,
    saveStoreSettings,
    saveChannelMessageBulkReplace,
    hashPasswordAsync,
    generateLicenseKey,
    sendSmtpEmail,
    sendAdminWebhook,
    getLiveKitDiagnostics,
    resetLiveKitHealthyCache,
    getEffectiveIceServers,
    getSystemStats,
    getStorageStats,
    getStorageEngineInfo,
    clearGifCache,
    exportAllDataBundle,
    importAllDataBundle,
    createScheduledBackup,
    listScheduledBackups,
    readScheduledBackup,
    deleteScheduledBackup,
    pushBackupToS3,
    emitToAdmins,
    emitUserUpdated,
    emitServerUpdatedToMembers,
    emitToServerMembers,
    emitToChannelAudience,
    addAuditLog,
    getClientIp,
    onSystemAnnouncement,
  } = deps;

  // Meeting Mode: Server-mute / unmute everyone in a voice channel
  socket.on('admin_mute_all_voice', ({ channelId, muted }: { channelId: string; muted: boolean }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || !channelId) return;
    const server = servers.find((s) => s.channels.some((c) => c.id === channelId));
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

    const systemConfig = deps.getSystemConfig();
    const bannedIps = deps.getBannedIps();
    const livekitStatus = await getLiveKitDiagnostics();

    socket.emit('admin_data_response', {
      stats: getSystemStats(),
      livekitStatus,
      registeredUsers: Array.from(registeredAccounts.values()).map((acc) => ({
        id: acc.id,
        username: acc.username,
        email: acc.email,
        role: acc.role,
        avatar: acc.avatar,
        status: Array.from(activeUsers.values()).some((u) => u.username === acc.username) ? 'online' : 'offline',
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
    const systemConfig = deps.getSystemConfig();
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
    resetLiveKitHealthyCache();
    io.emit('ice_servers', getEffectiveIceServers());
    if (nextCfg.webhookEvents && typeof nextCfg.webhookEvents === 'object') {
      systemConfig.webhookEvents = {
        security: Boolean(nextCfg.webhookEvents.security),
        bans: Boolean(nextCfg.webhookEvents.bans),
        dedicated: Boolean(nextCfg.webhookEvents.dedicated),
        backups: Boolean(nextCfg.webhookEvents.backups),
      };
    }

    deps.saveSystemConfig(systemConfig);
    io.emit('system_maintenance_status', {
      active: Boolean(systemConfig.maintenanceMode),
      message: systemConfig.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır.',
    });
    addAuditLog(
      'SISTEM_AYARLARI_GUNCELLENDI',
      `${requester.username} sistem yapılandırmasını güncelledi.${systemConfig.maintenanceMode ? ' [BAKIM MODU AKTİF]' : ''}`,
      systemConfig.maintenanceMode ? 'warn' : 'info'
    );
    socket.emit('admin_feedback', { type: 'success', message: 'Sistem yapılandırması başarıyla kaydedildi.' });
    socket.emit('admin_action_success', 'Sistem yapılandırması başarıyla kaydedildi.');
    emitToAdmins('audit_log_added', auditLogs[0]);
  });

  // Admin: Create / Delete Registration Invite Codes
  socket.on('admin_create_reg_invite', ({ maxUses, expiresHours }: { maxUses?: number; expiresHours?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const systemConfig = deps.getSystemConfig();
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
    deps.saveSystemConfig(systemConfig);
    addAuditLog('KAYIT_DAVETI_OLUSTURULDU', `${requester.username} kayıt davet kodu oluşturdu: ${code}`, 'auth');
    socket.emit('admin_action_success', `Kayıt davet kodu oluşturuldu: ${code}`);
    socket.emit('admin_reg_invites_updated', systemConfig.registrationInvites);
  });

  socket.on('admin_delete_reg_invite', ({ code }: { code: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const systemConfig = deps.getSystemConfig();
    systemConfig.registrationInvites = (systemConfig.registrationInvites || []).filter((i) => i.code !== code);
    deps.saveSystemConfig(systemConfig);
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
    const systemConfig = deps.getSystemConfig();
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
    void sendAdminWebhook('bans', 'Kullanıcı Yasaklandı', `Yetkili: ${requester.username} | Hedef: ${acc.username} | Süre: ${mins > 0 ? `${mins} dk` : 'Kalıcı'} | Sebep: ${cleanReason}`);
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
    const nextIps = [record, ...deps.getBannedIps().filter((b) => b.ip !== cleanIp)];
    deps.setBannedIps(nextIps);
    deps.saveBannedIps(nextIps);

    for (const [sockId] of activeUsers.entries()) {
      const targetSock = io.sockets.sockets.get(sockId);
      if (targetSock && getClientIp(targetSock) === cleanIp) {
        targetSock.emit('kicked_by_admin', { reason: `IP adresiniz (${cleanIp}) engellendi: ${cleanReason}` });
        targetSock.disconnect(true);
      }
    }

    addAuditLog('IP_ENGELLENDI', `${requester.username}, ${cleanIp} IP adresini engelledi. Sebep: ${cleanReason}`, 'warn');
    void sendAdminWebhook('bans', 'IP Adresi Engellendi', `Yetkili: ${requester.username} | IP: ${cleanIp} | Sebep: ${cleanReason}`);
    socket.emit('admin_action_success', `${cleanIp} IP adresi engellendi.`);
  });

  // Admin: Unban IP address
  socket.on('admin_unban_ip', ({ ip }: { ip: string }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const cleanIp = (ip || '').trim();
    const nextIps = deps.getBannedIps().filter((b) => b.ip !== cleanIp);
    deps.setBannedIps(nextIps);
    deps.saveBannedIps(nextIps);
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
  socket.on('admin_restore_full_backup', (bundle: unknown) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    try {
      const restoredFiles = importAllDataBundle(bundle);
      deps.setSystemConfig(deps.loadSystemConfig(defaultSystemConfig));
      deps.setBannedIps(deps.loadBannedIps());
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
      const systemConfig = deps.getSystemConfig();
      const info = createScheduledBackup(systemConfig.maxBackupsToKeep || 7);
      addAuditLog('MANUEL_YEDEK_ALINDI', `${requester.username} sunucu yedeği oluşturdu: ${info.filename}`, 'info');
      void sendAdminWebhook('backups', 'Manuel Sunucu Yedeği Oluşturuldu', `Yetkili: ${requester.username} | Dosya: ${info.filename}`);
      if (systemConfig.backupS3Enabled && systemConfig.backupS3AutoPush) {
        void pushBackupToS3(info.filename, systemConfig);
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
      deps.setSystemConfig(deps.loadSystemConfig(defaultSystemConfig));
      deps.setBannedIps(deps.loadBannedIps());
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

    const srv = servers.find((s) => s.id === serverId);
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

    const idx = servers.findIndex((s) => s.id === serverId);
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

    const targetServer = servers.find((s) => s.id === serverId);
    if (!targetServer) return;

    const chIndex = targetServer.channels.findIndex((c) => c.id === channelId);
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

    const systemConfig = deps.getSystemConfig();
    const payload = {
      sender: requester.username,
      message: cleanMsg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (pinBanner) {
      systemConfig.pinnedBanner = {
        message: cleanMsg,
        sender: requester.username,
        updatedAt: new Date().toISOString(),
      };
      deps.saveSystemConfig(systemConfig);
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
      onSystemAnnouncement?.(payload);
      addAuditLog('SISTEM_DUYURUSU', `Genel duyuru yapıldı: "${cleanMsg}" (Yetkili: ${requester.username})`, 'warn');
    }
    socket.emit('admin_action_success', pinBanner ? 'Duyuru yayınlandı ve üst banner olarak sabitlendi.' : 'Duyuru başarıyla yayınlandı.');
  });

  // Admin: Clear Pinned Banner
  socket.on('admin_clear_pinned_banner', () => {
    const requester = activeUsers.get(socket.id);
    if (!requester || requester.role !== 'admin') return;
    const systemConfig = deps.getSystemConfig();
    systemConfig.pinnedBanner = null;
    deps.saveSystemConfig(systemConfig);
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
      source: 'admin',
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

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === lic.assignedUsername.toLowerCase()) {
          const userLicenses = Array.from(issuedLicenses.values()).filter(
            (l) => l.assignedUsername.toLowerCase() === u.username.toLowerCase()
          );
          io.to(sId).emit('my_licenses_response', userLicenses);
        }
      }

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

    for (const [sId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === lic.assignedUsername.toLowerCase()) {
        const userLics = Array.from(issuedLicenses.values()).filter((l) => l.assignedUsername.toLowerCase() === u.username.toLowerCase());
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
}
