import type {
  AuditLog,
  ContentReport,
  DedicatedServerInfo,
  IssuedLicense,
  Server,
  StoreSettings,
  SystemStats,
  UserConnectionRecord,
} from '../../types';

export interface AdminRegisteredUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatar: string;
  status: string;
  createdAt: string;
  walletBalance?: number;
  isBanned?: boolean;
  bannedReason?: string;
  bannedUntil?: number | null;
  twoFactorEnabled?: boolean;
}

export interface AdminActiveSession {
  socketId: string;
  username: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
}

export interface AdminSystemConfig {
  registrationEnabled: boolean;
  inviteOnlyRegistration?: boolean;
  registrationInvites?: {
    code: string;
    createdBy: string;
    createdAt: string;
    maxUses: number;
    uses: number;
    expiresAt?: number | null;
  }[];
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
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  maxMessageLength: number;
  defaultSlowmodeSeconds: number;
  maxUploadSizeMb: number;
  requireStrongPasswords: boolean;
  requireAdmin2FA?: boolean;
  maxLoginAttempts?: number;
  loginLockoutMinutes?: number;
  globalBlockLinks?: boolean;
  globalBannedWords?: string[];
  pinnedBanner?: { message: string; sender: string; updatedAt: string } | null;
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
  hasBackupS3SecretKey?: boolean;
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
  hasMediaS3SecretKey?: boolean;
  webhookUrl?: string;
  giphyApiKey?: string;
  aiSummaryProvider?: 'builtin' | 'gemini' | 'openai';
  aiSummaryApiKey?: string;
  aiSummaryModel?: string;
  hasAiSummaryApiKey?: boolean;
  webhookEvents?: {
    security?: boolean;
    bans?: boolean;
    dedicated?: boolean;
    backups?: boolean;
  };
  sfuEnabled?: boolean;
  sfuThreshold?: number;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}

export interface AdminDashboardData {
  stats: SystemStats;
  registeredUsers: AdminRegisteredUser[];
  servers: Server[];
  auditLogs: AuditLog[];
  dedicatedServers?: DedicatedServerInfo[];
  issuedLicenses?: IssuedLicense[];
  storeSettings?: StoreSettings;
  connectionLogs?: UserConnectionRecord[];
  systemConfig?: AdminSystemConfig;
  livekitStatus?: {
    enabled: boolean;
    configured: boolean;
    reachable: boolean;
    url: string;
    reason: string;
  };
  bannedIps?: {
    ip: string;
    reason: string;
    bannedBy: string;
    bannedAt: string;
    expiresAt?: number | null;
  }[];
  storageStats?: {
    dataDir: string;
    totalBytes: number;
    files: { name: string; bytes: number }[];
  };
  storageEngine?: string;
  pinnedBanner?: { message: string; sender: string; updatedAt: string } | null;
  activeSessions?: AdminActiveSession[];
  scheduledBackups?: {
    filename: string;
    bytes: number;
    createdAt: string;
  }[];
  contentReports?: ContentReport[];
  securityAudit?: {
    score: number;
    checkedAt: string;
    checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
  };
}

export type AdminDialogState =
  | {
      type: 'confirm';
      title: string;
      description: string;
      confirmLabel?: string;
      tone?: 'danger' | 'amber' | 'primary';
      onConfirm: () => void;
    }
  | {
      type: 'ban_user';
      targets: string[];
      onSubmit: (reason: string, durationMinutes: number) => void;
    }
  | {
      type: 'reset_password';
      username: string;
      onSubmit: (newPassword: string) => void;
    }
  | {
      type: 'edit_wallet';
      targets: string[];
      currentBalance?: number;
      onSubmit: (amount: number, mode: 'set' | 'add') => void;
    }
  | {
      type: 'kick_user';
      username: string;
      onSubmit: (reason: string) => void;
    }
  | {
      type: 'ban_ip';
      ip: string;
      defaultReason?: string;
      onSubmit: (reason: string, durationMinutes: number) => void;
    }
  | {
      type: 'purge_messages';
      channelName: string;
      onSubmit: (mode: 'last_n' | 'all', count?: number) => void;
    };

export type RequestAdminDialogFn = (dialog: AdminDialogState) => void;
