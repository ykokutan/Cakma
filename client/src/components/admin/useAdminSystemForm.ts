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
