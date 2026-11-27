import { useCallback, useEffect, useState } from 'react';
import type { AdminDashboardData } from './adminTypes';

export interface SystemConfigUpdatePayload {
  registrationEnabled?: boolean;
  inviteOnlyRegistration?: boolean;
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
  mailRelayUrl?: string;
  mailRelaySecret?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  maxMessageLength?: number;
  defaultSlowmodeSeconds?: number;
  maxUploadSizeMb?: number;
  requireStrongPasswords?: boolean;
  requireAdmin2FA?: boolean;
  maxLoginAttempts?: number;
  loginLockoutMinutes?: number;
  globalBlockLinks?: boolean;
  globalBannedWords?: string[];
  autoBackupEnabled?: boolean;
  autoBackupIntervalHours?: number;
  maxBackupsToKeep?: number;
  backupS3Enabled?: boolean;
  backupS3Endpoint?: string;
  backupS3Bucket?: string;
  backupS3Region?: string;
  backupS3AccessKey?: string;
  backupS3SecretKey?: string;
  backupS3Prefix?: string;
  backupS3AutoPush?: boolean;
  mediaS3Enabled?: boolean;
  mediaS3UseBackupCredentials?: boolean;
  mediaS3Endpoint?: string;
  mediaS3Bucket?: string;
  mediaS3Region?: string;
  mediaS3AccessKey?: string;
  mediaS3SecretKey?: string;
  mediaS3Prefix?: string;
  mediaS3PublicBaseUrl?: string;
  mediaS3MinSizeKb?: number;
  steamAuthEnabled?: boolean;
  steamWebApiKey?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  oauthPublicBaseUrl?: string;
  webhookUrl?: string;
  giphyApiKey?: string;
  aiSummaryProvider?: 'builtin' | 'gemini' | 'openai';
  aiSummaryApiKey?: string;
  aiSummaryModel?: string;
  sfuEnabled?: boolean;
  sfuThreshold?: number;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
  webhookEvents?: {
    security?: boolean;
    bans?: boolean;
    dedicated?: boolean;
    backups?: boolean;
  };
}

export function useAdminSystemForm(systemConfig?: AdminDashboardData['systemConfig']) {
  const [sysRegEnabled, setSysRegEnabled] = useState<boolean>(true);
  const [sysInviteOnly, setSysInviteOnly] = useState<boolean>(false);
  const [sysRequireUniqueEmail, setSysRequireUniqueEmail] = useState<boolean>(true);
  const [sysDefaultWallet, setSysDefaultWallet] = useState<number>(100);
  const [sysMaxAccountsPerIp, setSysMaxAccountsPerIp] = useState<number>(3);
  const [sysMaintenance, setSysMaintenance] = useState<boolean>(false);
  const [sysMaintMsg, setSysMaintMsg] = useState<string>(
    'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.'
  );
  const [sysStrongPass, setSysStrongPass] = useState<boolean>(false);
  const [sysRequireAdmin2FA, setSysRequireAdmin2FA] = useState<boolean>(false);
  const [sysMaxMsgLen, setSysMaxMsgLen] = useState<number>(2000);
  const [sysSlowmode, setSysSlowmode] = useState<number>(0);
  const [sysMaxUploadMb, setSysMaxUploadMb] = useState<number>(5);
  const [sysMaxLoginAttempts, setSysMaxLoginAttempts] = useState<number>(5);
  const [sysLockoutMins, setSysLockoutMins] = useState<number>(15);
  const [sysGlobalBlockLinks, setSysGlobalBlockLinks] = useState<boolean>(false);
  const [sysGlobalBannedWordsText, setSysGlobalBannedWordsText] = useState<string>('');
  const [sysAutoBackupEnabled, setSysAutoBackupEnabled] = useState<boolean>(false);
  const [sysAutoBackupHours, setSysAutoBackupHours] = useState<number>(24);
  const [sysMaxBackups, setSysMaxBackups] = useState<number>(7);
  const [sysBackupS3Enabled, setSysBackupS3Enabled] = useState<boolean>(false);
  const [sysBackupS3Endpoint, setSysBackupS3Endpoint] = useState<string>('');
  const [sysBackupS3Bucket, setSysBackupS3Bucket] = useState<string>('');
  const [sysBackupS3Region, setSysBackupS3Region] = useState<string>('auto');
  const [sysBackupS3AccessKey, setSysBackupS3AccessKey] = useState<string>('');
  const [sysBackupS3SecretKey, setSysBackupS3SecretKey] = useState<string>('');
  const [sysBackupS3Prefix, setSysBackupS3Prefix] = useState<string>('cakma-backups/');
  const [sysBackupS3AutoPush, setSysBackupS3AutoPush] = useState<boolean>(false);
  const [sysMediaS3Enabled, setSysMediaS3Enabled] = useState<boolean>(false);
  const [sysMediaS3UseBackupCredentials, setSysMediaS3UseBackupCredentials] = useState<boolean>(true);
  const [sysMediaS3Endpoint, setSysMediaS3Endpoint] = useState<string>('');
  const [sysMediaS3Bucket, setSysMediaS3Bucket] = useState<string>('');
  const [sysMediaS3Region, setSysMediaS3Region] = useState<string>('auto');
  const [sysMediaS3AccessKey, setSysMediaS3AccessKey] = useState<string>('');
  const [sysMediaS3SecretKey, setSysMediaS3SecretKey] = useState<string>('');
  const [sysMediaS3Prefix, setSysMediaS3Prefix] = useState<string>('uploads/');
  const [sysMediaS3PublicBaseUrl, setSysMediaS3PublicBaseUrl] = useState<string>('');
  const [sysMediaS3MinSizeKb, setSysMediaS3MinSizeKb] = useState<number>(0);
  const [sysSteamAuthEnabled, setSysSteamAuthEnabled] = useState<boolean>(true);
  const [sysSteamWebApiKey, setSysSteamWebApiKey] = useState<string>('');
  const [sysGithubClientId, setSysGithubClientId] = useState<string>('');
  const [sysGithubClientSecret, setSysGithubClientSecret] = useState<string>('');
  const [sysGoogleClientId, setSysGoogleClientId] = useState<string>('');
  const [sysGoogleClientSecret, setSysGoogleClientSecret] = useState<string>('');
  const [sysOauthPublicBaseUrl, setSysOauthPublicBaseUrl] = useState<string>('');
  const [sysWebhookUrl, setSysWebhookUrl] = useState<string>('');
  const [sysGiphyApiKey, setSysGiphyApiKey] = useState<string>('');
  const [sysAiProvider, setSysAiProvider] = useState<'builtin' | 'gemini' | 'openai'>('builtin');
  const [sysAiApiKey, setSysAiApiKey] = useState<string>('');
  const [sysAiModel, setSysAiModel] = useState<string>('');
  const [sysSfuEnabled, setSysSfuEnabled] = useState<boolean>(true);
  const [sysSfuThreshold, setSysSfuThreshold] = useState<number>(6);
  const [sysLivekitUrl, setSysLivekitUrl] = useState<string>('');
  const [sysLivekitApiKey, setSysLivekitApiKey] = useState<string>('');
  const [sysLivekitApiSecret, setSysLivekitApiSecret] = useState<string>('');
  const [sysTurnUrl, setSysTurnUrl] = useState<string>('');
  const [sysTurnUsername, setSysTurnUsername] = useState<string>('');
  const [sysTurnCredential, setSysTurnCredential] = useState<string>('');
  const [sysRequireEmailVerif, setSysRequireEmailVerif] = useState<boolean>(false);
  const [sysSmtpHost, setSysSmtpHost] = useState<string>('');
  const [sysSmtpPort, setSysSmtpPort] = useState<number>(587);
  const [sysSmtpSecure, setSysSmtpSecure] = useState<boolean>(false);
  const [sysSmtpUser, setSysSmtpUser] = useState<string>('');
  const [sysSmtpPass, setSysSmtpPass] = useState<string>('');
  const [sysSmtpFrom, setSysSmtpFrom] = useState<string>('');
  const [sysMailRelayUrl, setSysMailRelayUrl] = useState<string>('');
  const [sysMailRelaySecret, setSysMailRelaySecret] = useState<string>('');
  const [sysWebhookEvents, setSysWebhookEvents] = useState<{
    security: boolean;
    bans: boolean;
    dedicated: boolean;
    backups: boolean;
  }>({
    security: true,
    bans: true,
    dedicated: true,
    backups: false,
  });
  const [isSystemDirty, setIsSystemDirty] = useState<boolean>(false);

  const syncFromServer = useCallback((cfg: NonNullable<AdminDashboardData['systemConfig']>) => {
    setSysRegEnabled(cfg.registrationEnabled);
    setSysInviteOnly(Boolean(cfg.inviteOnlyRegistration));
    setSysRequireUniqueEmail(cfg.requireUniqueEmail !== false);
    setSysDefaultWallet(cfg.defaultWalletBalance ?? 100);
    setSysMaxAccountsPerIp(cfg.maxAccountsPerIpPerDay ?? 3);
    setSysMaintenance(cfg.maintenanceMode);
    setSysMaintMsg(
      cfg.maintenanceMessage || 'Sistem şu anda planlı bakım modundadır. Lütfen daha sonra tekrar deneyin.'
    );
    setSysStrongPass(cfg.requireStrongPasswords);
    setSysRequireAdmin2FA(Boolean(cfg.requireAdmin2FA));
    setSysMaxMsgLen(cfg.maxMessageLength);
    setSysSlowmode(cfg.defaultSlowmodeSeconds);
    setSysMaxUploadMb(cfg.maxUploadSizeMb);
    setSysMaxLoginAttempts(cfg.maxLoginAttempts ?? 5);
    setSysLockoutMins(cfg.loginLockoutMinutes ?? 15);
    setSysGlobalBlockLinks(Boolean(cfg.globalBlockLinks));
    setSysGlobalBannedWordsText((cfg.globalBannedWords || []).join(', '));
    setSysAutoBackupEnabled(Boolean(cfg.autoBackupEnabled));
    setSysAutoBackupHours(cfg.autoBackupIntervalHours ?? 24);
    setSysMaxBackups(cfg.maxBackupsToKeep ?? 7);
    setSysBackupS3Enabled(Boolean(cfg.backupS3Enabled));
    setSysBackupS3Endpoint(cfg.backupS3Endpoint || '');
    setSysBackupS3Bucket(cfg.backupS3Bucket || '');
    setSysBackupS3Region(cfg.backupS3Region || 'auto');
    setSysBackupS3AccessKey(cfg.backupS3AccessKey || '');
    setSysBackupS3SecretKey(cfg.backupS3SecretKey || '');
    setSysBackupS3Prefix(cfg.backupS3Prefix || 'cakma-backups/');
    setSysBackupS3AutoPush(Boolean(cfg.backupS3AutoPush));
    setSysMediaS3Enabled(Boolean(cfg.mediaS3Enabled));
    setSysMediaS3UseBackupCredentials(cfg.mediaS3UseBackupCredentials !== false);
    setSysMediaS3Endpoint(cfg.mediaS3Endpoint || '');
    setSysMediaS3Bucket(cfg.mediaS3Bucket || '');
    setSysMediaS3Region(cfg.mediaS3Region || 'auto');
    setSysMediaS3AccessKey(cfg.mediaS3AccessKey || '');
    setSysMediaS3SecretKey(cfg.mediaS3SecretKey || '');
    setSysMediaS3Prefix(cfg.mediaS3Prefix || 'uploads/');
    setSysMediaS3PublicBaseUrl(cfg.mediaS3PublicBaseUrl || '');
    setSysMediaS3MinSizeKb(cfg.mediaS3MinSizeKb ?? 0);
    setSysSteamAuthEnabled(cfg.steamAuthEnabled !== false);
    setSysSteamWebApiKey(cfg.steamWebApiKey || '');
    setSysGithubClientId(cfg.githubClientId || '');
    setSysGithubClientSecret(cfg.githubClientSecret || '');
    setSysGoogleClientId(cfg.googleClientId || '');
    setSysGoogleClientSecret(cfg.googleClientSecret || '');
    setSysOauthPublicBaseUrl(cfg.oauthPublicBaseUrl || '');
    setSysWebhookUrl(cfg.webhookUrl || '');
    setSysGiphyApiKey(cfg.giphyApiKey || '');
    setSysAiProvider(cfg.aiSummaryProvider || 'builtin');
    setSysAiApiKey(cfg.aiSummaryApiKey || '');
    setSysAiModel(cfg.aiSummaryModel || '');
    setSysSfuEnabled(cfg.sfuEnabled !== false);
    setSysSfuThreshold(cfg.sfuThreshold || 6);
    setSysLivekitUrl(cfg.livekitUrl || '');
    setSysLivekitApiKey(cfg.livekitApiKey || '');
    setSysLivekitApiSecret(cfg.livekitApiSecret || '');
    setSysTurnUrl(cfg.turnUrl || '');
    setSysTurnUsername(cfg.turnUsername || '');
    setSysTurnCredential(cfg.turnCredential || '');
    setSysRequireEmailVerif(Boolean(cfg.requireEmailVerification));
    setSysSmtpHost(cfg.smtpHost || '');
    setSysSmtpPort(cfg.smtpPort ?? 587);
    setSysSmtpSecure(Boolean(cfg.smtpSecure));
    setSysSmtpUser(cfg.smtpUser || '');
    setSysSmtpPass(cfg.smtpPass || '');
    setSysSmtpFrom(cfg.smtpFrom || '');
    setSysMailRelayUrl(cfg.mailRelayUrl || '');
    setSysMailRelaySecret(cfg.mailRelaySecret || '');
    setSysWebhookEvents({
      security: cfg.webhookEvents?.security ?? true,
      bans: cfg.webhookEvents?.bans ?? true,
      dedicated: cfg.webhookEvents?.dedicated ?? true,
      backups: cfg.webhookEvents?.backups ?? false,
    });
  }, []);

  useEffect(() => {
    if (systemConfig && !isSystemDirty) {
      syncFromServer(systemConfig);
    }
  }, [systemConfig, isSystemDirty, syncFromServer]);

  const discardChanges = useCallback(() => {
    if (systemConfig) {
      syncFromServer(systemConfig);
    }
    setIsSystemDirty(false);
  }, [systemConfig, syncFromServer]);

  const buildPayload = useCallback((): SystemConfigUpdatePayload => {
    const bannedWords = sysGlobalBannedWordsText
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);
    return {
      registrationEnabled: sysRegEnabled,
      inviteOnlyRegistration: sysInviteOnly,
      requireUniqueEmail: sysRequireUniqueEmail,
      defaultWalletBalance: sysDefaultWallet,
      maxAccountsPerIpPerDay: sysMaxAccountsPerIp,
      maintenanceMode: sysMaintenance,
      maintenanceMessage: sysMaintMsg,
      requireStrongPasswords: sysStrongPass,
      requireAdmin2FA: sysRequireAdmin2FA,
      maxMessageLength: sysMaxMsgLen,
      defaultSlowmodeSeconds: sysSlowmode,
      maxUploadSizeMb: sysMaxUploadMb,
      maxLoginAttempts: sysMaxLoginAttempts,
      loginLockoutMinutes: sysLockoutMins,
      globalBlockLinks: sysGlobalBlockLinks,
      globalBannedWords: bannedWords,
      autoBackupEnabled: sysAutoBackupEnabled,
      autoBackupIntervalHours: sysAutoBackupHours,
      maxBackupsToKeep: sysMaxBackups,
      backupS3Enabled: sysBackupS3Enabled,
      backupS3Endpoint: sysBackupS3Endpoint,
      backupS3Bucket: sysBackupS3Bucket,
      backupS3Region: sysBackupS3Region,
      backupS3AccessKey: sysBackupS3AccessKey,
      backupS3SecretKey: sysBackupS3SecretKey,
      backupS3Prefix: sysBackupS3Prefix,
      backupS3AutoPush: sysBackupS3AutoPush,
      mediaS3Enabled: sysMediaS3Enabled,
      mediaS3UseBackupCredentials: sysMediaS3UseBackupCredentials,
      mediaS3Endpoint: sysMediaS3Endpoint,
      mediaS3Bucket: sysMediaS3Bucket,
      mediaS3Region: sysMediaS3Region,
      mediaS3AccessKey: sysMediaS3AccessKey,
      mediaS3SecretKey: sysMediaS3SecretKey,
      mediaS3Prefix: sysMediaS3Prefix,
      mediaS3PublicBaseUrl: sysMediaS3PublicBaseUrl,
      mediaS3MinSizeKb: sysMediaS3MinSizeKb,
      steamAuthEnabled: sysSteamAuthEnabled,
      steamWebApiKey: sysSteamWebApiKey,
      githubClientId: sysGithubClientId,
      githubClientSecret: sysGithubClientSecret,
      googleClientId: sysGoogleClientId,
      googleClientSecret: sysGoogleClientSecret,
      oauthPublicBaseUrl: sysOauthPublicBaseUrl,
      webhookUrl: sysWebhookUrl,
      giphyApiKey: sysGiphyApiKey,
      aiSummaryProvider: sysAiProvider,
      aiSummaryApiKey: sysAiApiKey,
      aiSummaryModel: sysAiModel,
      sfuEnabled: sysSfuEnabled,
      sfuThreshold: sysSfuThreshold,
      livekitUrl: sysLivekitUrl,
      livekitApiKey: sysLivekitApiKey,
      livekitApiSecret: sysLivekitApiSecret,
      turnUrl: sysTurnUrl,
      turnUsername: sysTurnUsername,
      turnCredential: sysTurnCredential,
      requireEmailVerification: sysRequireEmailVerif,
      smtpHost: sysSmtpHost,
      smtpPort: sysSmtpPort,
      smtpSecure: sysSmtpSecure,
      smtpUser: sysSmtpUser,
      smtpPass: sysSmtpPass,
      smtpFrom: sysSmtpFrom,
      mailRelayUrl: sysMailRelayUrl,
      mailRelaySecret: sysMailRelaySecret,
      webhookEvents: sysWebhookEvents,
    };
  }, [
    sysRegEnabled,
    sysInviteOnly,
    sysRequireUniqueEmail,
    sysDefaultWallet,
    sysMaxAccountsPerIp,
    sysMaintenance,
    sysMaintMsg,
    sysStrongPass,
    sysRequireAdmin2FA,
    sysMaxMsgLen,
    sysSlowmode,
    sysMaxUploadMb,
    sysMaxLoginAttempts,
    sysLockoutMins,
    sysGlobalBlockLinks,
    sysGlobalBannedWordsText,
    sysAutoBackupEnabled,
    sysAutoBackupHours,
    sysMaxBackups,
    sysBackupS3Enabled,
    sysBackupS3Endpoint,
    sysBackupS3Bucket,
    sysBackupS3Region,
    sysBackupS3AccessKey,
    sysBackupS3SecretKey,
    sysBackupS3Prefix,
    sysBackupS3AutoPush,
    sysMediaS3Enabled,
    sysMediaS3UseBackupCredentials,
    sysMediaS3Endpoint,
    sysMediaS3Bucket,
    sysMediaS3Region,
    sysMediaS3AccessKey,
    sysMediaS3SecretKey,
    sysMediaS3Prefix,
    sysMediaS3PublicBaseUrl,
    sysMediaS3MinSizeKb,
    sysSteamAuthEnabled,
    sysSteamWebApiKey,
    sysGithubClientId,
    sysGithubClientSecret,
    sysGoogleClientId,
    sysGoogleClientSecret,
    sysOauthPublicBaseUrl,
    sysWebhookUrl,
    sysGiphyApiKey,
    sysAiProvider,
    sysAiApiKey,
    sysAiModel,
    sysSfuEnabled,
    sysSfuThreshold,
    sysLivekitUrl,
    sysLivekitApiKey,
    sysLivekitApiSecret,
    sysTurnUrl,
    sysTurnUsername,
    sysTurnCredential,
    sysRequireEmailVerif,
    sysSmtpHost,
    sysSmtpPort,
    sysSmtpSecure,
    sysSmtpUser,
    sysSmtpPass,
    sysSmtpFrom,
    sysMailRelayUrl,
    sysMailRelaySecret,
    sysWebhookEvents,
  ]);

  return {
    isSystemDirty,
    setIsSystemDirty,
    discardChanges,
    buildPayload,
    fields: {
      sysRegEnabled,
      setSysRegEnabled,
      sysInviteOnly,
      setSysInviteOnly,
      sysRequireUniqueEmail,
      setSysRequireUniqueEmail,
      sysDefaultWallet,
      setSysDefaultWallet,
      sysMaxAccountsPerIp,
      setSysMaxAccountsPerIp,
      sysMaintenance,
      setSysMaintenance,
      sysMaintMsg,
      setSysMaintMsg,
      sysStrongPass,
      setSysStrongPass,
      sysRequireAdmin2FA,
      setSysRequireAdmin2FA,
      sysMaxMsgLen,
      setSysMaxMsgLen,
      sysSlowmode,
      setSysSlowmode,
      sysMaxUploadMb,
      setSysMaxUploadMb,
      sysMaxLoginAttempts,
      setSysMaxLoginAttempts,
      sysLockoutMins,
      setSysLockoutMins,
      sysGlobalBlockLinks,
      setSysGlobalBlockLinks,
      sysGlobalBannedWordsText,
      setSysGlobalBannedWordsText,
      sysAutoBackupEnabled,
      setSysAutoBackupEnabled,
      sysAutoBackupHours,
      setSysAutoBackupHours,
      sysMaxBackups,
      setSysMaxBackups,
      sysBackupS3Enabled,
      setSysBackupS3Enabled,
      sysBackupS3Endpoint,
      setSysBackupS3Endpoint,
      sysBackupS3Bucket,
      setSysBackupS3Bucket,
      sysBackupS3Region,
      setSysBackupS3Region,
      sysBackupS3AccessKey,
      setSysBackupS3AccessKey,
      sysBackupS3SecretKey,
      setSysBackupS3SecretKey,
      sysBackupS3Prefix,
      setSysBackupS3Prefix,
      sysBackupS3AutoPush,
      setSysBackupS3AutoPush,
      sysMediaS3Enabled,
      setSysMediaS3Enabled,
      sysMediaS3UseBackupCredentials,
      setSysMediaS3UseBackupCredentials,
      sysMediaS3Endpoint,
      setSysMediaS3Endpoint,
      sysMediaS3Bucket,
      setSysMediaS3Bucket,
      sysMediaS3Region,
      setSysMediaS3Region,
      sysMediaS3AccessKey,
      setSysMediaS3AccessKey,
      sysMediaS3SecretKey,
      setSysMediaS3SecretKey,
      sysMediaS3Prefix,
      setSysMediaS3Prefix,
      sysMediaS3PublicBaseUrl,
      setSysMediaS3PublicBaseUrl,
      sysMediaS3MinSizeKb,
      setSysMediaS3MinSizeKb,
      sysSteamAuthEnabled,
      setSysSteamAuthEnabled,
      sysSteamWebApiKey,
      setSysSteamWebApiKey,
      sysGithubClientId,
      setSysGithubClientId,
      sysGithubClientSecret,
      setSysGithubClientSecret,
      sysGoogleClientId,
      setSysGoogleClientId,
      sysGoogleClientSecret,
      setSysGoogleClientSecret,
      sysOauthPublicBaseUrl,
      setSysOauthPublicBaseUrl,
      sysWebhookUrl,
      setSysWebhookUrl,
      sysGiphyApiKey,
      setSysGiphyApiKey,
      sysAiProvider,
      setSysAiProvider,
      sysAiApiKey,
      setSysAiApiKey,
      sysAiModel,
      setSysAiModel,
      sysSfuEnabled,
      setSysSfuEnabled,
      sysSfuThreshold,
      setSysSfuThreshold,
      sysLivekitUrl,
      setSysLivekitUrl,
      sysLivekitApiKey,
      setSysLivekitApiKey,
      sysLivekitApiSecret,
      setSysLivekitApiSecret,
      sysTurnUrl,
      setSysTurnUrl,
      sysTurnUsername,
      setSysTurnUsername,
      sysTurnCredential,
      setSysTurnCredential,
      sysRequireEmailVerif,
      setSysRequireEmailVerif,
      sysSmtpHost,
      setSysSmtpHost,
      sysSmtpPort,
      setSysSmtpPort,
      sysSmtpSecure,
      setSysSmtpSecure,
      sysSmtpUser,
      setSysSmtpUser,
      sysSmtpPass,
      setSysSmtpPass,
      sysSmtpFrom,
      setSysSmtpFrom,
      sysMailRelayUrl,
      setSysMailRelayUrl,
      sysMailRelaySecret,
      setSysMailRelaySecret,
      sysWebhookEvents,
      setSysWebhookEvents,
    },
  };
}

export type AdminSystemFormController = ReturnType<typeof useAdminSystemForm>;
