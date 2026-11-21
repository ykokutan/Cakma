import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, Server, ServerCategory, DiscoverableServerSummary, ServerInvite, Channel, Message, ThreadMessage, AuditLog, SystemStats, DedicatedServerInfo, IssuedLicense, StoreSettings, MessageAttachment, DirectCallState, FriendRequest, FriendUser, ServerRole, ServerMember, ServerPermission, UserActivity, PollData, UserConnectionRecord, WatchTogetherState, MiniGameState, MemberLevelData, ServerAnalyticsData, ScreenShareSettings, ViewerStreamQuality, ScreenShareStats, ScreenShareLaserPoint, RemoteAssistPermissions, RemoteMonitorInfo, RemoteAssistAnnotationStroke, DirectScreenShareOptions, DirectCallQualityStats, DirectCallToast, RemoteAssistState } from '../types';
import { playSynthesizedSound } from '../utils/soundEffects';
import { playTeamSpeakChime, sendDesktopNotification, requestDesktopNotificationPermission, SoundPackType } from '../utils/tsSoundEffects';
import { getOrCreateE2eeKeyPair } from '../utils/e2ee';
import { STATUS_EXPIRY_KEY, isStatusExpired } from '../utils/statusExpiry';
import { setVoiceMicVolume, resetVoiceMetrics } from './VoiceMetricsContext';
import { setNetworkPing, setNetworkConnectionState } from './NetworkMetricsContext';
import { setChannelTypingState, clearAllTypingUsers, setDirectCallQualitySnapshot } from './PresenceStore';
import { isUserServerOwner } from '../utils/serverIdentity';
import { CustomThemeConfig, DEFAULT_CUSTOM_THEME, applyCustomThemeVariables } from '../utils/themeBuilder';
import { NotificationLevel, getTargetNotificationPref, shouldNotifyForMessage, shouldShowUnreadForChannel } from '../utils/notificationPrefs';
import { parseDeepLinkUrl } from '../utils/deepLink';
import { createBlurredWebcamStream, BlurredWebcamController } from '../utils/cameraBlur';
import { authFetch } from '../utils/authFetch';
import { getDirectScreenShareConstraints, pruneExpiredAnnotations } from '../utils/remoteAssistHelpers';
import { buildPersistentDmChannelId, parseDmChannelParticipants } from '../utils/dmChannel';
import { uploadAttachmentFile, uploadDataUrlAttachment } from '../utils/uploadAttachment';
import { appToast } from '../utils/appDialogs';
import type { MessageContextResponse, MessageSearchHit, OfflineQueuedMessage } from '../sharedContracts';
import { useOfflineMessageQueue } from './hooks/useOfflineMessageQueue';
import { AuthContext } from './AuthContext';
import { ChatContext } from './ChatContext';
import type { ChatLayoutMode } from './ChatContext';
export type { ChatLayoutMode };
import { VoiceContext } from './VoiceContext';
import { SocialContext } from './SocialContext';

export interface UserAudioEq {
  bass: number;
  treble: number;
  normalize: boolean;
}

export interface RadioBotState {
  isPlaying: boolean;
  mode?: 'radio' | 'youtube';
  stationId?: string;
  youtubeId?: string;
  youtubeTitle?: string;
  volume: number;
}

export type UiThemeId =
  | 'vision-dark'
  | 'midnight-blue'
  | 'cyber-emerald'
  | 'amber-gold'
  | 'crimson-rose'
  | 'royal-violet'
  | 'nordic-frost'
  | 'oled-black'
  | 'pearl-white'
  | 'sky-daylight'
  | 'warm-sand'
  | 'mint-breeze'
  | 'custom';

export const LIGHT_THEMES: ReadonlySet<string> = new Set([
  'pearl-white',
  'sky-daylight',
  'warm-sand',
  'mint-breeze',
]);

interface SocketContextType {
  socket: Socket | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  servers: Server[];
  activeServer: Server | null;
  activeChannel: Channel | null;
  messages: Message[];
  onlineUsers: User[];
  connectedVoiceChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  remoteScreenStreams: Map<string, MediaStream>;
  remoteCameraStreams: Map<string, MediaStream>;
  localDirectCameraStream: MediaStream | null;
  inputMode: 'vad' | 'ptt';
  pttKey: string;
  isPttActive: boolean;

  // Friends System
  friends: FriendUser[];
  incomingFriendRequests: FriendRequest[];
  outgoingFriendRequests: FriendRequest[];
  sendFriendRequest: (targetUsername: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  cancelFriendRequest: (requestId: string) => void;
  removeFriend: (targetUsername: string) => void;
  fetchFriendsData: () => void;

  // Direct Messaging & 1-on-1 Voice Calling
  activeDMUser: User | null;
  openDirectMessage: (user: User) => void;
  closeDirectMessage: () => void;
  directCall: DirectCallState | null;
  directCallToasts: DirectCallToast[];
  dismissDirectCallToast: (id: string) => void;
  startDirectCall: (targetUser: User) => void;
  acceptDirectCall: () => void;
  declineDirectCall: (replyMessage?: string) => void;
  endDirectCall: () => void;
  isDirectScreenSharing: boolean;
  partnerDirectScreenSharing: boolean;
  isDirectCameraOn: boolean;
  partnerDirectCameraOn: boolean;
  toggleDirectCamera: () => Promise<void>;
  unreadDMByUser: Record<string, number>;
  remoteAssist: RemoteAssistState;
  remoteAssistSafeMode: boolean;
  setRemoteAssistSafeMode: (enabled: boolean) => void;
  startDirectScreenShare: (options?: Partial<DirectScreenShareOptions>) => Promise<void>;
  stopDirectScreenShare: () => void;
  requestRemoteAssist: (permissions?: RemoteAssistPermissions) => void;
  respondRemoteAssist: (accepted: boolean, permissions?: RemoteAssistPermissions) => void;
  stopRemoteAssist: () => void;
  pauseRemoteAssist: (paused: boolean) => void;
  updateRemoteAssistPermissions: (permissions: Partial<RemoteAssistPermissions>) => void;
  selectRemoteMonitor: (monitorIndex: number | null) => void;
  sendRemoteInput: (payload: {
    kind: 'move' | 'mousedown' | 'mouseup' | 'wheel' | 'keydown' | 'keyup' | 'text';
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
  }) => void;
  sendRemoteClipboard: (text: string) => void;
  pullRemoteClipboard: () => void;
  lastClipboardNotice: string | null;
  remoteLaser: { x: number; y: number; active: boolean } | null;
  sendRemoteLaser: (x: number, y: number, active: boolean) => void;
  remoteAnnotations: RemoteAssistAnnotationStroke[];
  sendRemoteAnnotation: (stroke: RemoteAssistAnnotationStroke) => void;
  clearRemoteAnnotations: () => void;
  sendFileToDirectPartner: (file: File) => Promise<void>;
  sendScreenshotToDirectPartner: (dataUrl: string) => void;
  updateProfileDetails: (details: {
    statusMessage?: string;
    bio?: string;
    bannerColor?: string;
    bannerImage?: string;
    bannerPosition?: 'top' | 'center' | 'bottom';
    avatarFrame?: 'none' | 'gold' | 'neon' | 'emerald' | 'crimson' | 'rainbow';
    pinnedBadgeId?: string;
    socialLinks?: { steam?: string; github?: string; website?: string };
    avatar?: string;
    status?: 'online' | 'idle' | 'dnd' | 'offline';
  }) => void;
  transferWalletBalance: (
    targetUsername: string,
    amount: number
  ) => Promise<{ success: boolean; message?: string; error?: string; newBalance?: number }>;

  // System Announcement
  systemAnnouncement: { sender: string; message: string; timestamp: string } | null;
  pinnedBanner: { message: string; sender: string; updatedAt: string } | null;
  maintenanceStatus: { active: boolean; message: string };
  dismissAnnouncement: () => void;

  // Detailed Audio Settings
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  inputSensitivity: number;
  inputVolume: number;
  outputVolume: number;
  isMicTesting: boolean;
  micVolumeLevel: number;

  selectServer: (serverId: string) => void;
  selectChannel: (channelId: string) => void;
  sendMessage: (content: string, attachments?: MessageAttachment[], replyTo?: { id: string; username: string; content: string }) => void;
  toggleRaiseHand: () => void;
  addServerEmoji: (serverId: string, name: string, url: string) => void;
  deleteServerEmoji: (serverId: string, emojiId: string) => void;
  toggleOverlayWindow: () => Promise<void>;
  overlayEnabled: boolean;
  setOverlayEnabled: (enabled: boolean) => Promise<void>;
  detectedGame: string | null;
  refreshDetectedGame: () => Promise<string | null>;
  joinVoiceChannel: (channelId: string, password?: string) => void;
  moveVoiceUser: (targetUserId: string, targetChannelId: string) => void;
  voicePullInvite: {
    requestId: string;
    fromUserId: string;
    fromUsername: string;
    fromAvatar?: string;
    targetChannelId: string;
    channelName: string;
    serverName: string;
  } | null;
  voicePullNotice: { status: 'sent' | 'accepted' | 'rejected'; message: string } | null;
  respondVoicePullInvite: (requestId: string, accepted: boolean) => void;
  dismissVoicePullNotice: () => void;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  startScreenShare: (settings?: ScreenShareSettings, preCapturedStream?: MediaStream | null) => Promise<void>;
  stopScreenShare: () => void;
  requestScreenShareQuality: (presenterUserId: string, quality: ViewerStreamQuality) => void;
  updateLiveScreenShareSettings: (patch: { fps?: 5 | 30 | 60; bitrateKbps?: number }) => Promise<void>;
  getScreenShareStats: (presenterUserId?: string) => Promise<ScreenShareStats | null>;
  laserPoints: ScreenShareLaserPoint[];
  sendScreenShareLaser: (presenterId: string, x: number, y: number) => void;
  setInputMode: (mode: 'vad' | 'ptt') => void;
  setPttKey: (key: string) => void;
  createServer: (name: string, icon?: string, template?: 'empty' | 'gaming' | 'friends' | 'work', options?: { isPublic?: boolean; category?: ServerCategory }) => void;
  shouldAutoOpenExplore: boolean;
  consumeAutoOpenExplore: () => void;
  fetchDiscoverableServers: () => Promise<DiscoverableServerSummary[]>;
  joinPublicServer: (serverId: string) => Promise<{ success: boolean; server?: Server; error?: string }>;
  leaveServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  createChannel: (name: string, type: 'text' | 'voice', options?: { isLocked?: boolean; password?: string; topic?: string; bitrateKbps?: number; userLimit?: number; isTempCreatorChannel?: boolean }) => void;
  updateChannelSettings: (serverId: string, channelId: string, patch: { bitrateKbps?: number; userLimit?: number; topic?: string }) => void;
  serverMuteUser: (targetUserId: string, muted?: boolean, deafened?: boolean) => void;
  muteAllVoiceChannel: (channelId: string, muted: boolean) => void;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  voiceTransportMode: 'p2p' | 'sfu';
  newIpAlert: { ip: string; timestamp: string } | null;
  dismissNewIpAlert: () => void;
  dmReadReceipts: Record<string, number>;
  markDmRead: (partnerUsername: string) => void;
  updateProfile: (username: string, avatar: string) => void;

  // Server Roles & Detailed Settings
  updateServerSettings: (data: {
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
    sfuMode?: 'auto' | 'p2p' | 'sfu';
    systemChannelId?: string | null;
    verificationLevel?: 'none' | 'low' | 'medium' | 'high';
    defaultNotification?: 'all' | 'mentions';
    autoModEnabled?: boolean;
    vanityCode?: string;
    welcomeChannelId?: string | null;
    welcomeMessage?: string;
    welcomeEnabled?: boolean;
    autoRoleId?: string | null;
    isPublic?: boolean;
    category?: ServerCategory;
    tags?: string[];
  }) => void;
  restoreServerBackup: (serverId: string, backupData: any) => void;
  createServerRole: (data: { serverId: string; name: string; color: string; permissions: ServerPermission[]; }) => void;
  updateServerRole: (data: { serverId: string; roleId: string; name: string; color: string; permissions: ServerPermission[]; position?: number; }) => void;
  deleteServerRole: (serverId: string, roleId: string) => void;
  toggleMemberRole: (serverId: string, targetUserId: string, roleId: string) => void;
  kickServerMember: (serverId: string, targetUserId: string) => void;
  deleteServer: (serverId: string) => void;
  hasServerPermission: (permission: ServerPermission) => boolean;
  getServerMemberHighestRole: (member: ServerMember, server: Server) => ServerRole | null;

  // Auth Handlers
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; requires2fa?: boolean; pending2faToken?: string; error?: string }>;
  verify2faLogin: (pending2faToken: string, code: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    avatar: string;
    inviteCode?: string;
    emailCode?: string;
    challengeToken?: string;
    challengeAnswer?: string;
    honeypot?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  requestRegisterChallenge: () => Promise<{
    token: string;
    question: string;
    inviteOnly: boolean;
    requireStrongPasswords: boolean;
    requireEmailVerification: boolean;
  } | null>;
  sendRegisterEmailCode: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  logout: () => void;

  // Audio Device Handlers
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setNoiseSuppression: (val: boolean) => void;
  setEchoCancellation: (val: boolean) => void;
  setAutoGainControl: (val: boolean) => void;
  studioAudioDsp: boolean;
  setStudioAudioDsp: (val: boolean) => void;
  lowLatencyAudio: boolean;
  setLowLatencyAudio: (val: boolean) => void;
  userAudioEq: Record<string, UserAudioEq>;
  setUserAudioEq: (userId: string, patch: Partial<UserAudioEq>) => void;
  setInputSensitivity: (val: number) => void;
  setInputVolume: (val: number) => void;
  setOutputVolume: (val: number) => void;
  toggleMicTest: () => void;
  refreshAudioDevices: () => Promise<void>;

  // Admin Dashboard Features
  adminData: {
    stats: SystemStats;
    registeredUsers: any[];
    servers: Server[];
    auditLogs: AuditLog[];
    dedicatedServers?: DedicatedServerInfo[];
    issuedLicenses?: IssuedLicense[];
    storeSettings?: StoreSettings;
    connectionLogs?: UserConnectionRecord[];
    systemConfig?: {
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
      webhookUrl?: string;
      giphyApiKey?: string;
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
    };
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
    activeSessions?: {
      socketId: string;
      username: string;
      ip: string;
      userAgent: string;
      connectedAt: string;
    }[];
    scheduledBackups?: {
      filename: string;
      bytes: number;
      createdAt: string;
    }[];
    securityAudit?: {
      score: number;
      checkedAt: string;
      checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
    };
  } | null;
  fetchAdminData: () => void;
  adminUpdateSystemConfig: (cfg: {
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
  }) => void;
  adminChangeRole: (targetUsername: string, newRole: 'admin' | 'user') => void;
  adminKickUser: (targetSocketId: string, reason?: string) => void;
  adminDeleteChannel: (serverId: string, channelId: string) => void;
  adminBroadcastAnnouncement: (message: string, options?: { target?: 'all' | 'admins' | 'server'; serverId?: string; pinBanner?: boolean }) => void;
  adminClearPinnedBanner: () => void;
  adminCreateRegInvite: (maxUses?: number, expiresHours?: number) => void;
  adminDeleteRegInvite: (code: string) => void;
  adminTestSmtp: (
    toEmail?: string,
    smtpConfig?: {
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      smtpFrom?: string;
      mailRelayUrl?: string;
      mailRelaySecret?: string;
    }
  ) => Promise<{ ok: boolean; message: string }>;
  generateDedicatedLicense: (data: { licensee: string; maxSlots: number; expireDays: number; tier: 'Starter' | 'Pro' | 'Enterprise'; assignedUsername?: string }) => void;
  adminRevokeLicense: (licenseId: string, reason?: string) => void;
  adminActivateLicense: (licenseId: string) => void;
  adminExtendLicense: (licenseId: string, addDays: number) => void;
  adminUpdateStoreSettings: (settings: StoreSettings) => void;
  adminClearConnectionLogs: () => void;
  adminUpdateWallet: (targetUsername: string, amount: number, mode?: 'set' | 'add') => void;
  adminBanUser: (targetUsername: string, reason?: string, durationMinutes?: number) => void;
  adminUnbanUser: (targetUsername: string) => void;
  adminResetUser2fa: (targetUsername: string) => void;
  adminBanIp: (ip: string, reason?: string, durationMinutes?: number) => void;
  adminUnbanIp: (ip: string) => void;
  adminExportFullBackup: () => void;
  adminRestoreFullBackup: (bundle: any) => void;
  adminTriggerBackupNow: () => void;
  adminRestoreScheduledBackup: (filename: string) => void;
  adminDeleteScheduledBackup: (filename: string) => void;
  adminTestWebhook: () => void;
  adminPurgeMessages: (channelId: string, mode: 'last_n' | 'all', count?: number) => void;
  adminResetUserPassword: (targetUsername: string, newPassword: string) => void;
  adminCreateChannel: (serverId: string, name: string, type: 'text' | 'voice') => void;
  adminDeleteServer: (serverId: string) => void;
  adminClearAuditLogs: () => void;
  adminFeedback: { type: 'success' | 'error'; message: string } | null;
  generatedLicense: IssuedLicense | null;
  clearGeneratedLicense: () => void;
  connectToDedicatedServer: (hostWithPort: string) => void;
  resetToMainServer: () => void;
  currentServerHost: string;
  isDedicatedServer: boolean;

  // Store & User Licenses
  storeSettings: StoreSettings | null;
  myLicenses: IssuedLicense[];
  fetchMyLicenses: () => void;
  storePurchaseLicense: (data: {
    serverName: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }) => Promise<{ success: boolean; license?: IssuedLicense; error?: string }>;
  storeExtendLicense: (data: {
    licenseId: string;
    addDays: number;
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }) => Promise<{ success: boolean; license?: IssuedLicense; error?: string }>;

  // Soundboard, Radio, YouTube & Activities
  playSoundboard: (soundId: string) => void;
  activeSoundboardEffect: { soundId: string; username: string } | null;
  radioBotState: RadioBotState;
  syncRadioState: (state: Partial<RadioBotState>) => void;
  updateUserActivity: (activity: UserActivity | null) => void;

  // Reactions, Pinned & Polls
  addReaction: (messageId: string, emoji: string) => void;
  togglePinMessage: (messageId: string) => void;
  createPoll: (question: string, options: string[]) => void;
  votePoll: (messageId: string, optionId: string) => void;

  // Message Edit/Delete, Typing & Unread Badges
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  sendTyping: (isTyping: boolean) => void;
  unreadCounts: Record<string, number>;
  mentionCounts: Record<string, number>;

  // Account Security, Block, Timeout, Invites & UI Themes
  requestPasswordResetCode: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  requestEmailChangeCode: (currentPassword: string, newEmail: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  confirmEmailChange: (code: string) => Promise<{ success: boolean; email?: string; message?: string; error?: string }>;
  revokeSingleSession: (targetSocketId: string) => Promise<{ success: boolean; error?: string }>;
  deleteMyAccount: (currentPassword: string, confirmText: string, totpCode?: string) => Promise<{ success: boolean; error?: string }>;
  readCursors: Record<string, string>;
  markChannelRead: (channelId: string, lastMessageId: string) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  blockUser: (targetUsername: string) => void;
  unblockUser: (targetUsername: string) => void;
  timeoutMember: (serverId: string, targetUsername: string, durationMinutes: number) => void;
  createServerInvite: (serverId: string, maxUses?: number, expireMinutes?: number) => Promise<ServerInvite | null>;
  previewServerInvite: (code: string) => Promise<{
    success: boolean;
    server?: {
      id: string;
      name: string;
      icon: string;
      bannerGradient?: string;
      bannerImage?: string;
      description?: string;
      memberCount: number;
    };
    error?: string;
  }>;
  joinServerByInvite: (code: string) => Promise<{ success: boolean; serverId?: string; serverName?: string; error?: string }>;
  reorderChannel: (serverId: string, channelId: string, direction: 'up' | 'down') => void;
  uiTheme: UiThemeId;
  setUiTheme: (theme: UiThemeId) => void;
  customTheme: CustomThemeConfig;
  setCustomTheme: (patch: Partial<CustomThemeConfig>) => void;
  aiNoiseSuppression: boolean;
  setAiNoiseSuppression: (val: boolean) => void;
  hasMoreMessages: Record<string, boolean>;
  isLoadingOlderMessages: boolean;
  requestOlderMessages: (channelId: string) => void;
  offlineQueue: OfflineQueuedMessage[];
  pendingJumpTarget: { channelId: string; messageId: string } | null;
  clearPendingJumpTarget: () => void;
  searchServerMessages: (query: string, channelId?: string) => Promise<MessageSearchHit[]>;
  requestMessageContext: (channelId: string, messageId: string, radius?: number) => Promise<MessageContextResponse>;
  jumpToMessage: (channelId: string, messageId: string) => Promise<boolean>;
  retryQueuedMessage: (localId: string) => void;
  cancelQueuedMessage: (localId: string) => void;
  chatFontSize: 'sm' | 'base' | 'lg';
  setChatFontSize: (size: 'sm' | 'base' | 'lg') => void;
  glassIntensity: 'low' | 'normal' | 'high';
  setGlassIntensity: (v: 'low' | 'normal' | 'high') => void;
  messageDensity: 'cozy' | 'compact';
  setMessageDensity: (v: 'cozy' | 'compact') => void;
  chatLayout: ChatLayoutMode;
  setChatLayout: (v: ChatLayoutMode) => void;
  cornerStyle: 'rounded' | 'sharp';
  setCornerStyle: (v: 'rounded' | 'sharp') => void;
  bgPattern: 'grid' | 'dots' | 'clean';
  setBgPattern: (v: 'grid' | 'dots' | 'clean') => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  overlayCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  setOverlayCorner: (v: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void;
  overlayOpacity: number;
  setOverlayOpacity: (v: number) => void;
  ringtonePack: 'modern' | 'classic' | 'minimal' | 'silent';
  setRingtonePack: (v: 'modern' | 'classic' | 'minimal' | 'silent') => void;
  showLinkPreviews: boolean;
  setShowLinkPreviews: (v: boolean) => void;
  customSoundboard: Array<{ id: string; name: string; dataUrl: string }>;
  addCustomSound: (name: string, dataUrl: string) => void;
  removeCustomSound: (id: string) => void;
  userNotes: Record<string, string>;
  setUserNote: (username: string, note: string) => void;
  bookmarkedMessages: Message[];
  toggleBookmarkMessage: (msg: Message) => void;
  reminders: Array<{ id: string; text: string; triggerAt: number }>;
  addReminder: (text: string, delayMs: number) => void;
  removeReminder: (id: string) => void;
  messagesMap: Record<string, Message[]>;
  socketId: string | null;
  language: 'tr' | 'en' | 'de' | 'ru';
  setLanguage: (lang: 'tr' | 'en' | 'de' | 'ru') => void;

  // Diagnostics & Network Telemetry
  ping: number;
  jitter: number;
  packetLoss: number;
  pingHistory: number[];
  measurePing: () => Promise<number>;
  isDiagnosticsOpen: boolean;
  setIsDiagnosticsOpen: (val: boolean) => void;
  openDiagnostics: () => void;

  // Per-User Audio Controls
  userVolumes: Record<string, number>;
  setUserVolume: (userId: string, volume: number) => void;
  userLocalMutes: Record<string, boolean>;
  toggleUserLocalMute: (userId: string) => void;

  // Voice Room Recorder
  isVoiceRecording: boolean;
  voiceRecordingSeconds: number;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;

  // Webcam, Blur & Priority Speaker
  isWebcamActive: boolean;
  toggleWebcam: () => Promise<void>;
  webcamStream: MediaStream | null;
  webcamBlurEnabled: boolean;
  toggleWebcamBlur: () => void;
  remoteWebcamUserIds: string[];
  isPrioritySpeakerActive: boolean;
  prioritySpeakerUsername: string | null;
  togglePrioritySpeaker: () => void;

  // Channel / Server Notification Preferences
  notificationPrefs: Record<string, NotificationLevel>;
  setTargetNotificationPref: (targetId: string, level: NotificationLevel) => void;

  // 3D Spatial Audio & Panning
  userPans: Record<string, number>;
  setUserPan: (userId: string, pan: number) => void;

  // Watch Together
  watchTogetherState: WatchTogetherState | null;
  startWatchTogether: (channelId: string, videoId: string, title: string) => void;
  sendWatchTogetherAction: (channelId: string, action: 'play' | 'pause' | 'seek', currentTime: number) => void;
  stopWatchTogether: (channelId: string) => void;

  // Mini Games
  miniGameState: MiniGameState | null;
  startMiniGame: (channelId: string, game: 'xox' | 'typeracer') => void;
  joinMiniGame: (channelId: string) => void;
  sendMiniGameMove: (channelId: string, index: number) => void;
  resetMiniGame: (channelId: string) => void;
  stopMiniGame: (channelId: string) => void;

  // TeamSpeak Sound Events & Push Notifications
  tsSoundEffectsEnabled: boolean;
  setTsSoundEffectsEnabled: (val: boolean) => void;
  soundPack: SoundPackType;
  setSoundPack: (pack: SoundPackType) => void;
  pttBeepEnabled: boolean;
  setPttBeepEnabled: (val: boolean) => void;
  desktopNotificationsEnabled: boolean;
  setDesktopNotificationsEnabled: (val: boolean) => void;

  // Threads, Slash Clear & Server Events
  sendThreadMessage: (channelId: string, parentMessageId: string, content: string) => void;
  clearChannelMessages: (serverId: string, channelId: string, count: number) => void;
  createServerEvent: (serverId: string, data: { title: string; description?: string; startTime: string; voiceChannelId?: string | null }) => void;
  rsvpServerEvent: (serverId: string, eventId: string) => void;
  deleteServerEvent: (serverId: string, eventId: string) => void;

  // TeamSpeak Whisper
  activeWhisperFrom: string | null;
  sendWhisper: (targetUserId: string, active: boolean) => void;

  // Server Leaderboard
  leaderboardData: Record<string, MemberLevelData[]>;
  fetchLeaderboard: (serverId: string) => void;

  // Server Analytics & Statistics
  serverAnalyticsData: ServerAnalyticsData | null;
  fetchServerAnalytics: (serverId: string) => void;

  // Channel Sticky Notices & Topics
  updateChannelNotice: (serverId: string, channelId: string, notice?: string | null, topic?: string) => void;

  // Voice Channel Security & Password Protection
  voicePasswordError: string | null;
  clearVoicePasswordError: () => void;
  unlockedChannelIds: string[];
  unlockChannel: (channelId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const viteEnv: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env || {};

function readLiteralFromStorage<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const val = localStorage.getItem(key);
  return val && (allowed as readonly string[]).includes(val) ? (val as T) : fallback;
}
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(viteEnv.VITE_TURN_URL
    ? [
        {
          urls: viteEnv.VITE_TURN_URL,
          ...(viteEnv.VITE_TURN_USERNAME ? { username: viteEnv.VITE_TURN_USERNAME } : {}),
          ...(viteEnv.VITE_TURN_CREDENTIAL ? { credential: viteEnv.VITE_TURN_CREDENTIAL } : {}),
        },
      ]
    : []),
];

// Helper to modify WebRTC SDP and inject Opus maxaveragebitrate
const setOpusBitrateInSdp = (sdp: string, bitrateKbps: number): string => {
  const targetBitrate = Math.max(32000, bitrateKbps * 1000);
  const match = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!match) return sdp;
  const pt = match[1];

  const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+(.*)`, 'i');
  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_full, params) => {
      let clean = params.replace(/;\s*maxaveragebitrate=\d+/gi, '');
      clean = clean.replace(/;\s*stereo=\d+/gi, '');
      clean = clean.replace(/;\s*sprop-stereo=\d+/gi, '');
      clean = clean.replace(/;\s*cbr=\d+/gi, '');
      clean = clean.replace(/;\s*minptime=\d+/gi, '');
      clean = clean.replace(/;\s*maxplaybackrate=\d+/gi, '');
      clean = clean.replace(/;\s*sprop-maxcapturerate=\d+/gi, '');
      return `a=fmtp:${pt} ${clean};minptime=10;useinbandfec=1;maxplaybackrate=48000;sprop-maxcapturerate=48000;maxaveragebitrate=${targetBitrate};stereo=1;sprop-stereo=1;cbr=1`;
    });
  } else {
    return sdp.replace(
      new RegExp(`(a=rtpmap:${pt}\\s+opus\\/48000[^\r\n]*)`, 'i'),
      `$1\r\na=fmtp:${pt} minptime=10;useinbandfec=1;maxplaybackrate=48000;sprop-maxcapturerate=48000;maxaveragebitrate=${targetBitrate};stereo=1;sprop-stereo=1;cbr=1`
    );
  }
};

// Helper to apply audio bitrate to WebRTC sender encodings in real-time
const applyAudioBitrate = async (pc: RTCPeerConnection, bitrateKbps: number) => {
  try {
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track && sender.track.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = Math.max(32000, bitrateKbps * 1000);
        try {
          (params.encodings[0] as any).networkPriority = 'high';
        } catch {}
        await sender.setParameters(params);
        console.log(`[WebRTC] Set audio maxBitrate to ${bitrateKbps} kbps on track ${sender.track.id}`);
      }
    }
  } catch (err) {
    console.warn('[WebRTC] setParameters bitrate warning:', err);
  }
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    if (!socket || !isAuthenticated || !currentUser) return;
    const checkExpiry = () => {
      try {
        const raw = localStorage.getItem(STATUS_EXPIRY_KEY);
        if (!raw) return;
        const expiresAt = Number(raw);
        if (isStatusExpired(expiresAt)) {
          localStorage.removeItem(STATUS_EXPIRY_KEY);
          socket.emit('update_profile_details', { statusMessage: 'Çevrimiçi' });
        }
      } catch {}
    };
    checkExpiry();
    const timer = window.setInterval(checkExpiry, 30000);
    return () => window.clearInterval(timer);
  }, [socket, isAuthenticated, currentUser]);

  // Auto-Idle after 10 minutes of keyboard/mouse inactivity, and restore 'online' on activity
  const lastUserActivityRef = useRef<number>(Date.now());
  const autoIdleTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    if (!socket || !isAuthenticated || !currentUser) return;

    const markActive = () => {
      lastUserActivityRef.current = Date.now();
      if (autoIdleTriggeredRef.current) {
        autoIdleTriggeredRef.current = false;
        socket.emit('update_user_state', { status: 'online' });
      }
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const idleTimer = window.setInterval(() => {
      if (
        currentUserRef.current?.status === 'online' &&
        !autoIdleTriggeredRef.current &&
        Date.now() - lastUserActivityRef.current >= 10 * 60 * 1000
      ) {
        autoIdleTriggeredRef.current = true;
        socket.emit('update_user_state', { status: 'idle' });
      }
    }, 30000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      window.clearInterval(idleTimer);
    };
  }, [socket, isAuthenticated, currentUser]);
  const [servers, setServers] = useState<Server[]>([]);
  const [shouldAutoOpenExplore, setShouldAutoOpenExplore] = useState<boolean>(false);
  const consumeAutoOpenExplore = useCallback(() => setShouldAutoOpenExplore(false), []);
  const serversRef = useRef<Server[]>([]);
  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const activeChannelIdRef = useRef<string>('');
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
  const [readCursors, setReadCursors] = useState<Record<string, string>>({});
  const readCursorsRef = useRef<Record<string, string>>({});
  readCursorsRef.current = readCursors;
  const [hasMoreMessages, setHasMoreMessages] = useState<Record<string, boolean>>({});
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState<boolean>(false);
  const [pendingJumpTarget, setPendingJumpTarget] = useState<{ channelId: string; messageId: string } | null>(null);
  const clearPendingJumpTarget = useCallback(() => setPendingJumpTarget(null), []);
  const socketRef = useRef<Socket | null>(null);
  socketRef.current = socket;
  const emitQueuedMessagePayload = useCallback(
    (payload: { serverId: string; channelId: string; content: string; replyTo?: { id: string; username: string; content: string } }) => {
      const s = socketRef.current;
      if (!s || !s.connected) return false;
      s.emit('send_message', payload);
      return true;
    },
    []
  );
  const [connectionState, setConnectionStateState] = useState<'connected' | 'reconnecting' | 'disconnected'>('reconnecting');
  const setConnectionState = useCallback((next: 'connected' | 'reconnecting' | 'disconnected') => {
    setConnectionStateState(next);
    setNetworkConnectionState(next);
  }, []);
  const {
    offlineQueue,
    enqueueMessage: enqueueOfflineMessage,
    retryQueuedMessage,
    cancelQueuedMessage,
  } = useOfflineMessageQueue({
    isConnectedAndAuthed: Boolean(socket?.connected && isAuthenticated && connectionState === 'connected'),
    emitMessage: emitQueuedMessagePayload,
  });
  const lastVoiceChannelIdRef = useRef<string | null>(null);
  const [notificationPrefs, setNotificationPrefsState] = useState<Record<string, NotificationLevel>>(() => {
    try {
      const raw = localStorage.getItem('dc_notification_prefs');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const notificationPrefsRef = useRef<Record<string, NotificationLevel>>(notificationPrefs);
  notificationPrefsRef.current = notificationPrefs;
  const setTargetNotificationPref = useCallback((targetId: string, level: NotificationLevel) => {
    if (!targetId) return;
    setNotificationPrefsState((prev) => {
      const next = { ...prev };
      if (level === 'all') {
        delete next[targetId];
      } else {
        next[targetId] = level;
      }
      try { localStorage.setItem('dc_notification_prefs', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [voiceTransportMode, setVoiceTransportMode] = useState<'p2p' | 'sfu'>('p2p');
  const livekitRoomRef = useRef<any>(null);
  const livekitScreenTracksRef = useRef<any[]>([]);
  const [newIpAlert, setNewIpAlert] = useState<{ ip: string; timestamp: string } | null>(null);
  const dismissNewIpAlert = useCallback(() => setNewIpAlert(null), []);
  const [dmReadReceipts, setDmReadReceipts] = useState<Record<string, number>>({});
  const [laserPoints, setLaserPoints] = useState<ScreenShareLaserPoint[]>([]);
  const screenShareStatsPrevRef = useRef<{ bytes: number; ts: number } | null>(null);
  const pendingMessageQueueRef = useRef<Array<{
    serverId: string;
    channelId: string;
    content: string;
    attachments?: MessageAttachment[];
    replyTo?: { id: string; username: string; content: string };
  }>>([]);
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [uiTheme, setUiThemeState] = useState<UiThemeId>(() => {
    return (localStorage.getItem('dc_ui_theme') as UiThemeId) || 'vision-dark';
  });
  const [customTheme, setCustomThemeState] = useState<CustomThemeConfig>(() => {
    try {
      const raw = localStorage.getItem('dc_custom_theme');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.mode === 'dark' || parsed.mode === 'light') && parsed.bgColor && parsed.accentColor) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_CUSTOM_THEME;
  });
  const [chatFontSize, setChatFontSizeState] = useState<'sm' | 'base' | 'lg'>(() =>
    readLiteralFromStorage('dc_chat_font_size', ['sm', 'base', 'lg'] as const, 'base')
  );
  const [glassIntensity, setGlassIntensityState] = useState<'low' | 'normal' | 'high'>(() =>
    readLiteralFromStorage('dc_glass_intensity', ['low', 'normal', 'high'] as const, 'normal')
  );
  const [messageDensity, setMessageDensityState] = useState<'cozy' | 'compact'>(() =>
    readLiteralFromStorage('dc_message_density', ['cozy', 'compact'] as const, 'cozy')
  );
  const [chatLayout, setChatLayoutState] = useState<ChatLayoutMode>(() =>
    readLiteralFromStorage('dc_chat_layout', ['auto', 'classic', 'bubble'] as const, 'auto')
  );
  const [cornerStyle, setCornerStyleState] = useState<'rounded' | 'sharp'>(() =>
    readLiteralFromStorage('dc_corner_style', ['rounded', 'sharp'] as const, 'rounded')
  );
  const [bgPattern, setBgPatternState] = useState<'grid' | 'dots' | 'clean'>(() =>
    readLiteralFromStorage('dc_bg_pattern', ['grid', 'dots', 'clean'] as const, 'grid')
  );
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    return localStorage.getItem('dc_reduce_motion') === 'true';
  });
  const [language, setLanguageState] = useState<'tr' | 'en' | 'de' | 'ru'>(() =>
    readLiteralFromStorage('dc_app_language', ['tr', 'en', 'de', 'ru'] as const, 'tr')
  );
  const setLanguage = (lang: 'tr' | 'en' | 'de' | 'ru') => {
    setLanguageState(lang);
    try { localStorage.setItem('dc_app_language', lang); } catch {}
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    const mode = uiTheme === 'custom' ? customTheme.mode : (LIGHT_THEMES.has(uiTheme) ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme-mode', mode);
    applyCustomThemeVariables(document.documentElement, customTheme);
    try { localStorage.setItem('dc_ui_theme', uiTheme); } catch {}
  }, [uiTheme, customTheme]);

  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
    if (typeof document !== 'undefined') {
      document.title = total > 0 ? `(${total}) Çakma` : 'Çakma';
    }
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (isTauri) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('set_taskbar_badge', { count: total }))
        .catch(() => {});
    }
  }, [unreadCounts]);

  const setCustomTheme = (patch: Partial<CustomThemeConfig>) => {
    setCustomThemeState((prev) => {
      const next: CustomThemeConfig = { ...prev, ...patch };
      try { localStorage.setItem('dc_custom_theme', JSON.stringify(next)); } catch {}
      applyCustomThemeVariables(document.documentElement, next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-glass', glassIntensity);
    try { localStorage.setItem('dc_glass_intensity', glassIntensity); } catch {}
  }, [glassIntensity]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', messageDensity);
    try { localStorage.setItem('dc_message_density', messageDensity); } catch {}
  }, [messageDensity]);

  useEffect(() => {
    document.documentElement.setAttribute('data-chat-layout', chatLayout);
    try { localStorage.setItem('dc_chat_layout', chatLayout); } catch {}
  }, [chatLayout]);

  useEffect(() => {
    document.documentElement.setAttribute('data-corners', cornerStyle);
    try { localStorage.setItem('dc_corner_style', cornerStyle); } catch {}
  }, [cornerStyle]);

  useEffect(() => {
    document.documentElement.setAttribute('data-pattern', bgPattern);
    try { localStorage.setItem('dc_bg_pattern', bgPattern); } catch {}
  }, [bgPattern]);

  useEffect(() => {
    document.documentElement.setAttribute('data-reduce-motion', reduceMotion ? 'true' : 'false');
    try { localStorage.setItem('dc_reduce_motion', reduceMotion ? 'true' : 'false'); } catch {}
  }, [reduceMotion]);

  const setUiTheme = (theme: UiThemeId) => {
    setUiThemeState(theme);
  };

  const setGlassIntensity = (v: 'low' | 'normal' | 'high') => setGlassIntensityState(v);
  const setMessageDensity = (v: 'cozy' | 'compact') => setMessageDensityState(v);
  const setChatLayout = useCallback((v: ChatLayoutMode) => setChatLayoutState(v), []);
  const setCornerStyle = (v: 'rounded' | 'sharp') => setCornerStyleState(v);
  const setBgPattern = (v: 'grid' | 'dots' | 'clean') => setBgPatternState(v);
  const setReduceMotion = (v: boolean) => setReduceMotionState(v);

  const [overlayCorner, setOverlayCornerState] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>(() =>
    readLiteralFromStorage('dc_overlay_corner', ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const, 'top-left')
  );
  const [overlayOpacity, setOverlayOpacityState] = useState<number>(() => {
    const saved = Number(localStorage.getItem('dc_overlay_opacity'));
    return Number.isFinite(saved) && saved >= 15 && saved <= 100 ? saved : 75;
  });
  const [ringtonePack, setRingtonePackState] = useState<'modern' | 'classic' | 'minimal' | 'silent'>(() =>
    readLiteralFromStorage('dc_ringtone_pack', ['modern', 'classic', 'minimal', 'silent'] as const, 'modern')
  );
  const [showLinkPreviews, setShowLinkPreviewsState] = useState<boolean>(() => {
    const v = localStorage.getItem('dc_show_link_previews');
    return v === null ? true : v === 'true';
  });
  const [customSoundboard, setCustomSoundboard] = useState<Array<{ id: string; name: string; dataUrl: string }>>(() => {
    try {
      const raw = localStorage.getItem('dc_custom_soundboard');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [userNotes, setUserNotes] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('dc_user_notes');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Message[]>(() => {
    try {
      const raw = localStorage.getItem('dc_bookmarked_messages');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [reminders, setReminders] = useState<Array<{ id: string; text: string; triggerAt: number }>>([]);

  const setOverlayCorner = (v: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    setOverlayCornerState(v);
    try { localStorage.setItem('dc_overlay_corner', v); } catch {}
    const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || window.location.hostname === 'tauri.localhost' || window.location.protocol === 'tauri:');
    if (isTauri) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('position_overlay_window', { corner: v }))
        .catch(() => {});
    }
  };

  const setOverlayOpacity = (v: number) => {
    const clamped = Math.min(100, Math.max(15, Math.round(v)));
    setOverlayOpacityState(clamped);
    try { localStorage.setItem('dc_overlay_opacity', String(clamped)); } catch {}
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (isTauri) {
      import('@tauri-apps/api/event')
        .then(({ emit }) => emit('overlay-opacity-changed', clamped))
        .catch(() => {});
    }
  };

  const setRingtonePack = (v: 'modern' | 'classic' | 'minimal' | 'silent') => {
    setRingtonePackState(v);
    try { localStorage.setItem('dc_ringtone_pack', v); } catch {}
  };

  const setShowLinkPreviews = (v: boolean) => {
    setShowLinkPreviewsState(v);
    try { localStorage.setItem('dc_show_link_previews', v ? 'true' : 'false'); } catch {}
  };

  const addCustomSound = (name: string, dataUrl: string) => {
    setCustomSoundboard(prev => {
      const next = [...prev, { id: `cs-${Date.now()}`, name: name.slice(0, 30), dataUrl }];
      try { localStorage.setItem('dc_custom_soundboard', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const removeCustomSound = (id: string) => {
    setCustomSoundboard(prev => {
      const next = prev.filter(s => s.id !== id);
      try { localStorage.setItem('dc_custom_soundboard', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const setUserNote = (username: string, note: string) => {
    const key = username.toLowerCase();
    setUserNotes(prev => {
      const next = { ...prev };
      if (!note.trim()) {
        delete next[key];
      } else {
        next[key] = note.slice(0, 400);
      }
      try { localStorage.setItem('dc_user_notes', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const toggleBookmarkMessage = (msg: Message) => {
    setBookmarkedMessages(prev => {
      const exists = prev.some(m => m.id === msg.id);
      const next = exists ? prev.filter(m => m.id !== msg.id) : [msg, ...prev].slice(0, 50);
      try { localStorage.setItem('dc_bookmarked_messages', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const removeReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const addReminder = (text: string, delayMs: number) => {
    const id = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const triggerAt = Date.now() + delayMs;
    setReminders(prev => [...prev, { id, text, triggerAt }]);
    window.setTimeout(() => {
      setReminders(prev => prev.filter(r => r.id !== id));
      if (currentUserRef.current?.status !== 'dnd') {
        sendDesktopNotification('Hatırlatıcı ⏰', text);
        if (tsSoundEffectsRef.current) {
          playTeamSpeakChime('levelup');
        }
      }
    }, delayMs);
  };

  const setChatFontSize = (size: 'sm' | 'base' | 'lg') => {
    setChatFontSizeState(size);
    try { localStorage.setItem('dc_chat_font_size', size); } catch {}
  };
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const messagesMapRef = useRef<Record<string, Message[]>>(messagesMap);
  useEffect(() => {
    messagesMapRef.current = messagesMap;
  }, [messagesMap]);
  const cloudSyncLoadedUserRef = useRef<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const onlineUsersRef = useRef<User[]>([]);
  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);
  const [connectedVoiceChannelId, setConnectedVoiceChannelId] = useState<string | null>(null);
  const connectedVoiceChannelIdRef = useRef<string | null>(null);
  useEffect(() => {
    connectedVoiceChannelIdRef.current = connectedVoiceChannelId;
  }, [connectedVoiceChannelId]);
  const [voicePullInvite, setVoicePullInvite] = useState<{
    requestId: string;
    fromUserId: string;
    fromUsername: string;
    fromAvatar?: string;
    targetChannelId: string;
    channelName: string;
    serverName: string;
  } | null>(null);
  const [voicePullNotice, setVoicePullNotice] = useState<{
    status: 'sent' | 'accepted' | 'rejected';
    message: string;
  } | null>(null);
  const [systemAnnouncement, setSystemAnnouncement] = useState<{ sender: string; message: string; timestamp: string } | null>(null);
  const [pinnedBanner, setPinnedBanner] = useState<{ message: string; sender: string; updatedAt: string } | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const [currentServerHost, setCurrentServerHost] = useState<string>('localhost:4000');
  const currentServerHostRef = useRef<string>(currentServerHost);
  useEffect(() => {
    currentServerHostRef.current = currentServerHost;
  }, [currentServerHost]);

  // Admin Dashboard State
  const [adminData, setAdminData] = useState<{
    stats: SystemStats;
    registeredUsers: any[];
    servers: Server[];
    auditLogs: AuditLog[];
    dedicatedServers?: DedicatedServerInfo[];
    issuedLicenses?: IssuedLicense[];
    storeSettings?: StoreSettings;
    connectionLogs?: UserConnectionRecord[];
  } | null>(null);
  const [generatedLicense, setGeneratedLicense] = useState<IssuedLicense | null>(null);
  const [myLicenses, setMyLicenses] = useState<IssuedLicense[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Soundboard, Radio & Activities State
  const [activeSoundboardEffect, setActiveSoundboardEffect] = useState<{ soundId: string; username: string } | null>(null);
  const [radioBotState, setRadioBotState] = useState<RadioBotState>({
    isPlaying: false,
    mode: 'radio',
    stationId: 'lofi',
    volume: 0.5
  });

  // Audio & Video Screen Controls
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDeafened, setIsDeafened] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteCameraStreams, setRemoteCameraStreams] = useState<Map<string, MediaStream>>(new Map());
  const [localDirectCameraStream, setLocalDirectCameraStream] = useState<MediaStream | null>(null);
  const [inputMode, setInputModeState] = useState<'vad' | 'ptt'>(() => {
    return (typeof window !== 'undefined' && (localStorage.getItem('dsp_inputMode') as 'vad' | 'ptt')) || 'vad';
  });
  const [pttKey, setPttKeyState] = useState<string>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('dsp_pttKey')) || 'Control';
  });
  const [isPttActive, setIsPttActive] = useState<boolean>(false);

  // Advanced Audio Hardware & Processing States
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceIdState] = useState<string>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('dsp_inputDeviceId')) || '';
  });
  const [selectedOutputDeviceId, setSelectedOutputDeviceIdState] = useState<string>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('dsp_outputDeviceId')) || '';
  });
  const [noiseSuppression, setNoiseSuppressionState] = useState<boolean>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_noiseSuppression') : null;
    return val !== null ? val === 'true' : true;
  });
  const [echoCancellation, setEchoCancellationState] = useState<boolean>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_echoCancellation') : null;
    return val !== null ? val === 'true' : true;
  });
  const [autoGainControl, setAutoGainControlState] = useState<boolean>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_autoGainControl') : null;
    return val !== null ? val === 'true' : true;
  });
  const [studioAudioDsp, setStudioAudioDspState] = useState<boolean>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_studioAudioDsp') : null;
    return val !== null ? val === 'true' : true;
  });
  const [aiNoiseSuppression, setAiNoiseSuppressionState] = useState<boolean>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_aiNoiseSuppression') : null;
    return val !== null ? val === 'true' : true;
  });
  const noiseWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const noiseWorkletLoadedCtxRef = useRef<WeakSet<AudioContext>>(new WeakSet());
  const [lowLatencyAudio, setLowLatencyAudioState] = useState<boolean>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_lowLatencyAudio') : null;
    return val !== null ? val === 'true' : true;
  });
  const [userAudioEq, setUserAudioEqState] = useState<Record<string, UserAudioEq>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('cakma_user_audio_eq') : null;
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const userAudioEqRef = useRef<Record<string, UserAudioEq>>(userAudioEq);
  userAudioEqRef.current = userAudioEq;
  const remoteAudioEqChainsRef = useRef<Map<string, {
    ctx: AudioContext;
    source: MediaStreamAudioSourceNode;
    lowShelf: BiquadFilterNode;
    highShelf: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    gain: GainNode;
  }>>(new Map());
  const processedStreamRef = useRef<MediaStream | null>(null);
  const [inputSensitivity, setInputSensitivityState] = useState<number>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_inputSensitivity') : null;
    return val !== null ? Number(val) : 25;
  });
  const [inputVolume, setInputVolumeState] = useState<number>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_inputVolume') : null;
    return val !== null ? Number(val) : 100;
  });
  const [outputVolume, setOutputVolumeState] = useState<number>(() => {
    const val = typeof window !== 'undefined' ? localStorage.getItem('dsp_outputVolume') : null;
    return val !== null ? Number(val) : 100;
  });
  const [isMicTesting, setIsMicTesting] = useState<boolean>(false);
  const [micVolumeLevel] = useState<number>(0);

  const setInputMode = (mode: 'vad' | 'ptt') => {
    setInputModeState(mode);
    try { localStorage.setItem('dsp_inputMode', mode); } catch {}
  };

  const setPttKey = (key: string) => {
    setPttKeyState(key);
    try { localStorage.setItem('dsp_pttKey', key); } catch {}
  };

  const setInputSensitivity = (val: number) => {
    setInputSensitivityState(val);
    try { localStorage.setItem('dsp_inputSensitivity', String(val)); } catch {}
  };

  // 5 Major Features States
  const [serverAnalyticsData, setServerAnalyticsData] = useState<ServerAnalyticsData | null>(null);
  const [voicePasswordError, setVoicePasswordError] = useState<string | null>(null);
  const [unlockedChannelIds, setUnlockedChannelIds] = useState<string[]>([]);

  // WebRTC Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const tauriInvokeRef = useRef<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const micTestAudioRef = useRef<HTMLAudioElement | null>(null);

  // Direct Messaging & 1-on-1 Voice Calling State
  const [activeDMUser, setActiveDMUser] = useState<User | null>(null);
  const [directCall, setDirectCall] = useState<DirectCallState | null>(null);
  const directCallRef = useRef<DirectCallState | null>(null);
  const directCallTimerRef = useRef<any>(null);
  const [directCallToasts, setDirectCallToasts] = useState<DirectCallToast[]>([]);
  const [isDirectScreenSharing, setIsDirectScreenSharing] = useState(false);
  const [partnerDirectScreenSharing, setPartnerDirectScreenSharing] = useState(false);
  const partnerDirectScreenSharingRef = useRef(false);
  useEffect(() => {
    partnerDirectScreenSharingRef.current = partnerDirectScreenSharing;
  }, [partnerDirectScreenSharing]);
  const [isDirectCameraOn, setIsDirectCameraOn] = useState(false);
  const [partnerDirectCameraOn, setPartnerDirectCameraOn] = useState(false);
  const partnerDirectCameraOnRef = useRef(false);
  useEffect(() => {
    partnerDirectCameraOnRef.current = partnerDirectCameraOn;
  }, [partnerDirectCameraOn]);
  const [unreadDMByUser, setUnreadDMByUser] = useState<Record<string, number>>({});
  const [lastClipboardNotice, setLastClipboardNotice] = useState<string | null>(null);
  const [remoteLaser, setRemoteLaser] = useState<{ x: number; y: number; active: boolean } | null>(null);
  const [remoteAnnotations, setRemoteAnnotations] = useState<RemoteAssistAnnotationStroke[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const directScreenStreamRef = useRef<MediaStream | null>(null);
  const directCameraStreamRef = useRef<MediaStream | null>(null);
  const directMediaTrackKindsRef = useRef<Map<string, 'screen' | 'camera'>>(new Map());
  const receivedRemoteVideoTracksRef = useRef<
    Map<string, { peerId: string; track: MediaStreamTrack; stream: MediaStream }>
  >(new Map());
  const screenAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteDataChannelsRef = useRef<
    Map<string, { control?: RTCDataChannel; move?: RTCDataChannel }>
  >(new Map());
  const directStatsPrevRef = useRef<{ timestamp: number; bytes: number } | null>(null);

  const DEFAULT_REMOTE_ASSIST_STATE: RemoteAssistState = {
    status: 'idle',
    hostDesktopCapable: false,
    remoteCursor: null,
    permissions: { control: true, clipboard: true, annotate: true },
    paused: false,
    hostMonitors: [],
    selectedMonitorIndex: null,
    inputTransport: 'socket',
  };
  const [remoteAssist, setRemoteAssist] = useState<RemoteAssistState>(DEFAULT_REMOTE_ASSIST_STATE);
  const remoteAssistRef = useRef(remoteAssist);
  useEffect(() => {
    remoteAssistRef.current = remoteAssist;
  }, [remoteAssist]);

  const [remoteAssistSafeMode, setRemoteAssistSafeModeState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cakma_remote_assist_safe_mode');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const remoteAssistSafeModeRef = useRef(remoteAssistSafeMode);
  useEffect(() => {
    remoteAssistSafeModeRef.current = remoteAssistSafeMode;
  }, [remoteAssistSafeMode]);

  const dismissDirectCallToast = useCallback((id: string) => {
    setDirectCallToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushDirectCallToast = useCallback(
    (message: string, variant: DirectCallToast['variant'] = 'info') => {
      const id = `dct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setDirectCallToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      window.setTimeout(() => {
        setDirectCallToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const isTauriDesktopEnv = () =>
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      window.location.hostname === 'tauri.localhost' ||
      window.location.protocol === 'tauri:');

  const getTauriInvoke = async () => {
    if (!tauriInvokeRef.current) {
      const mod = await import('@tauri-apps/api/core');
      tauriInvokeRef.current = mod.invoke as (
        cmd: string,
        args?: Record<string, unknown>
      ) => Promise<unknown>;
    }
    return tauriInvokeRef.current;
  };

  const setRemoteAssistSafeMode = useCallback((enabled: boolean) => {
    setRemoteAssistSafeModeState(enabled);
    remoteAssistSafeModeRef.current = enabled;
    try {
      localStorage.setItem('cakma_remote_assist_safe_mode', String(enabled));
    } catch {}
    if (isTauriDesktopEnv()) {
      void getTauriInvoke()
        .then((invoke) => invoke('set_remote_assist_safe_mode', { enabled }))
        .catch(() => {});
    }
  }, []);

  const syncTauriRemoteAssistHost = async (opts: {
    active: boolean;
    controllerName?: string;
    paused?: boolean;
    monitor?: RemoteMonitorInfo | null;
  }) => {
    if (!isTauriDesktopEnv()) return;
    try {
      const invoke = await getTauriInvoke();
      await invoke('set_remote_assist_safe_mode', { enabled: remoteAssistSafeModeRef.current });
      await invoke('set_remote_assist_killswitch', { active: opts.active && !opts.paused });
      await invoke('set_remote_assist_host_hud', {
        active: opts.active,
        controllerName: opts.controllerName,
        paused: Boolean(opts.paused),
        monitorX: opts.monitor?.x,
        monitorY: opts.monitor?.y,
        monitorW: opts.monitor?.width,
        monitorH: opts.monitor?.height,
      });
    } catch {
      // Ignore Tauri HUD failures on unsupported targets
    }
  };

  const forwardOverlayEventToTauri = async (payload: Record<string, unknown>) => {
    if (!isTauriDesktopEnv()) return;
    try {
      const invoke = await getTauriInvoke();
      await invoke('push_remote_assist_overlay_event', { payload });
    } catch {}
  };

  const dispatchIncomingRemoteInput = async (payload: {
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
    if (
      remoteAssistRef.current.status !== 'being_controlled' ||
      remoteAssistRef.current.paused ||
      !remoteAssistRef.current.permissions.control
    ) {
      return;
    }
    if (!isTauriDesktopEnv()) return;
    try {
      const invoke = await getTauriInvoke();
      await invoke('simulate_remote_input', { payload });
    } catch {
      // Ignore input simulation errors on unsupported platforms
    }
  };

  const cleanupDirectCallMedia = (partnerId?: string) => {
    setIsDirectScreenSharing(false);
    setPartnerDirectScreenSharing(false);
    setIsDirectCameraOn(false);
    setPartnerDirectCameraOn(false);
    setLocalDirectCameraStream(null);
    setDirectCallQualitySnapshot(null);
    setRemoteLaser(null);
    setRemoteAnnotations([]);
    setRemoteAssist(DEFAULT_REMOTE_ASSIST_STATE);

    if (directScreenStreamRef.current) {
      directScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      directScreenStreamRef.current = null;
    }
    if (directCameraStreamRef.current) {
      directCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      directCameraStreamRef.current = null;
    }

    if (partnerId) {
      setRemoteScreenStreams((prev) => {
        if (!prev.has(partnerId)) return prev;
        const next = new Map(prev);
        next.delete(partnerId);
        return next;
      });
      setRemoteCameraStreams((prev) => {
        if (!prev.has(partnerId)) return prev;
        const next = new Map(prev);
        next.delete(partnerId);
        return next;
      });
      const channels = remoteDataChannelsRef.current.get(partnerId);
      if (channels) {
        try { channels.control?.close(); } catch {}
        try { channels.move?.close(); } catch {}
        remoteDataChannelsRef.current.delete(partnerId);
      }
      const scrAudio = screenAudioElementsRef.current.get(partnerId);
      if (scrAudio) {
        scrAudio.srcObject = null;
        scrAudio.remove();
        screenAudioElementsRef.current.delete(partnerId);
      }
    } else {
      setRemoteScreenStreams(new Map());
      setRemoteCameraStreams(new Map());
      remoteDataChannelsRef.current.forEach((chs) => {
        try { chs.control?.close(); } catch {}
        try { chs.move?.close(); } catch {}
      });
      remoteDataChannelsRef.current.clear();
      screenAudioElementsRef.current.forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
      });
      screenAudioElementsRef.current.clear();
    }

    directMediaTrackKindsRef.current.clear();
    receivedRemoteVideoTracksRef.current.clear();
    directStatsPrevRef.current = null;
    void syncTauriRemoteAssistHost({ active: false });
  };

  const attachIncomingDataChannelHandlers = (peerId: string, dc: RTCDataChannel) => {
    const existing = remoteDataChannelsRef.current.get(peerId) || {};
    if (dc.label === 'ra-move') {
      existing.move = dc;
    } else if (dc.label === 'ra-control') {
      existing.control = dc;
    } else {
      return;
    }
    remoteDataChannelsRef.current.set(peerId, existing);

    const updateTransport = () => {
      if (directCallRef.current?.partner.id !== peerId) return;
      const chs = remoteDataChannelsRef.current.get(peerId);
      const isOpen =
        chs?.control?.readyState === 'open' || chs?.move?.readyState === 'open';
      setRemoteAssist((prev) => ({
        ...prev,
        inputTransport: isOpen ? 'datachannel' : 'socket',
      }));
    };

    dc.onopen = updateTransport;
    dc.onclose = updateTransport;
    dc.onerror = updateTransport;
    dc.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'input' && msg.payload) {
          void dispatchIncomingRemoteInput(msg.payload);
        } else if (msg?.type === 'laser' && msg.payload) {
          if (
            remoteAssistRef.current.status === 'being_controlled' &&
            !remoteAssistRef.current.permissions.annotate
          ) {
            return;
          }
          const lp = {
            x: Math.min(1, Math.max(0, Number(msg.payload.x) || 0)),
            y: Math.min(1, Math.max(0, Number(msg.payload.y) || 0)),
            active: Boolean(msg.payload.active),
          };
          setRemoteLaser(lp.active ? lp : null);
          void forwardOverlayEventToTauri({ type: 'laser', ...lp });
        } else if (msg?.type === 'annotation' && msg.payload) {
          if (
            remoteAssistRef.current.status === 'being_controlled' &&
            !remoteAssistRef.current.permissions.annotate
          ) {
            return;
          }
          if (msg.payload.action === 'clear') {
            setRemoteAnnotations([]);
            void forwardOverlayEventToTauri({ type: 'clear' });
          } else if (msg.payload.action === 'stroke' && msg.payload.stroke) {
            const stamped = { ...msg.payload.stroke, createdAt: Date.now() };
            setRemoteAnnotations((prev) => [...prev.slice(-49), stamped]);
            void forwardOverlayEventToTauri({ type: 'stroke', stroke: stamped });
          }
        }
      } catch {}
    };
    updateTransport();
  };

  const setupDirectDataChannelsOnPeer = (peerId: string, pc: RTCPeerConnection) => {
    try {
      const controlDc = pc.createDataChannel('ra-control', { ordered: true });
      const moveDc = pc.createDataChannel('ra-move', {
        ordered: false,
        maxRetransmits: 0,
      });
      attachIncomingDataChannelHandlers(peerId, controlDc);
      attachIncomingDataChannelHandlers(peerId, moveDc);
    } catch {}
  };

  const renegotiateDirectPeerConnection = async (
    peerId: string,
    pc: RTCPeerConnection,
    activeSocket: Socket | null
  ) => {
    if (!activeSocket || pc.signalingState === 'closed') return;
    try {
      if (pc.signalingState !== 'stable') {
        await new Promise((res) => window.setTimeout(res, 120));
        if ((pc.signalingState as RTCSignalingState) !== 'stable') return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      activeSocket.emit('webrtc_signal', {
        targetUserId: peerId,
        signal: offer,
        type: 'offer',
      });
    } catch {}
  };

  // Prune expired live annotations every 800ms
  useEffect(() => {
    if (remoteAnnotations.length === 0) return;
    const timer = window.setInterval(() => {
      setRemoteAnnotations((prev) => pruneExpiredAnnotations(prev, Date.now(), 4500));
    }, 800);
    return () => window.clearInterval(timer);
  }, [remoteAnnotations.length]);

  // 1-on-1 RTCPeerConnection live telemetry poller (RTT, FPS, Resolution, Bitrate, Loss, Path)
  useEffect(() => {
    if (directCall?.status !== 'connected') {
      setDirectCallQualitySnapshot(null);
      directStatsPrevRef.current = null;
      return;
    }
    const partnerId = directCall.partner.id;
    const poll = async () => {
      const pc = peerConnectionsRef.current.get(partnerId);
      if (!pc || pc.connectionState === 'closed') return;
      try {
        const report = await pc.getStats();
        let rttMs = 0;
        let fps = 0;
        let width = 0;
        let height = 0;
        let totalBytes = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let pathType: DirectCallQualityStats['pathType'] = 'unknown';

        const localCandidates = new Map<string, string>();
        const remoteCandidates = new Map<string, string>();
        let selectedPairId: string | null = null;

        report.forEach((stat: any) => {
          if (stat.type === 'local-candidate') {
            localCandidates.set(stat.id, stat.candidateType || '');
          } else if (stat.type === 'remote-candidate') {
            remoteCandidates.set(stat.id, stat.candidateType || '');
          } else if (stat.type === 'transport' && stat.selectedCandidatePairId) {
            selectedPairId = stat.selectedCandidatePairId;
          }
        });

        report.forEach((stat: any) => {
          if (
            stat.type === 'candidate-pair' &&
            (stat.id === selectedPairId || (stat.nominated && stat.state === 'succeeded'))
          ) {
            if (typeof stat.currentRoundTripTime === 'number') {
              rttMs = Math.round(stat.currentRoundTripTime * 1000);
            }
            const lType = localCandidates.get(stat.localCandidateId) || '';
            const rType = remoteCandidates.get(stat.remoteCandidateId) || '';
            pathType = lType === 'relay' || rType === 'relay' ? 'relay' : 'p2p';
          } else if (stat.type === 'inbound-rtp') {
            if (typeof stat.bytesReceived === 'number') {
              totalBytes += stat.bytesReceived;
            }
            if (typeof stat.packetsLost === 'number') {
              packetsLost += Math.max(0, stat.packetsLost);
            }
            if (typeof stat.packetsReceived === 'number') {
              packetsReceived += Math.max(0, stat.packetsReceived);
            }
            if (stat.kind === 'video') {
              if (typeof stat.framesPerSecond === 'number' && stat.framesPerSecond > fps) {
                fps = Math.round(stat.framesPerSecond);
              }
              if (typeof stat.frameWidth === 'number' && stat.frameWidth > width) {
                width = stat.frameWidth;
              }
              if (typeof stat.frameHeight === 'number' && stat.frameHeight > height) {
                height = stat.frameHeight;
              }
            }
          }
        });

        const now = Date.now();
        let bitrateKbps = 0;
        const prev = directStatsPrevRef.current;
        if (prev && now > prev.timestamp && totalBytes >= prev.bytes) {
          const dtSec = (now - prev.timestamp) / 1000;
          bitrateKbps = Math.round(((totalBytes - prev.bytes) * 8) / 1000 / dtSec);
        }
        directStatsPrevRef.current = { timestamp: now, bytes: totalBytes };

        const totalPkts = packetsLost + packetsReceived;
        const packetLossPct =
          totalPkts > 0 ? Math.round((packetsLost / totalPkts) * 1000) / 10 : 0;

        const chs = remoteDataChannelsRef.current.get(partnerId);
        const dcOpen =
          chs?.control?.readyState === 'open' || chs?.move?.readyState === 'open';

        setDirectCallQualitySnapshot({
          rttMs,
          fps,
          width,
          height,
          bitrateKbps,
          packetLossPct,
          pathType,
          inputTransport: dcOpen ? 'datachannel' : 'socket',
        });
      } catch {}
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => window.clearInterval(timer);
  }, [directCall?.status, directCall?.partner.id]);

  // Friends System State
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequest[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequest[]>([]);

  // Diagnostics & Network Telemetry State
  const [ping, setPing] = useState<number>(0);
  const [jitter, setJitter] = useState<number>(0);
  const [packetLoss, setPacketLoss] = useState<number>(0);
  const [pingHistory, setPingHistory] = useState<number[]>([]);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const packetResultsRef = useRef<boolean[]>([]);

  const openDiagnostics = useCallback(() => {
    setIsDiagnosticsOpen(true);
  }, []);

  const recordPacketResult = useCallback((ok: boolean) => {
    const next = [...packetResultsRef.current.slice(-29), ok];
    packetResultsRef.current = next;
    const lost = next.filter((v) => !v).length;
    setPacketLoss(Number(((lost / next.length) * 100).toFixed(1)));
  }, []);

  const measurePing = useCallback((): Promise<number> => {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) {
        recordPacketResult(false);
        resolve(0);
        return;
      }
      let settled = false;
      const start = performance.now();
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        recordPacketResult(false);
        resolve(0);
      }, 1500);

      socket.emit('ping_check', Date.now(), () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        const roundTrip = Math.max(1, Math.round(performance.now() - start));
        recordPacketResult(true);
        setNetworkPing(roundTrip);
        setPing((prev) => {
          if (prev > 0) {
            const diff = Math.abs(roundTrip - prev);
            setJitter((j) => Number((j * 0.65 + diff * 0.35).toFixed(1)));
          }
          return roundTrip;
        });
        setPingHistory((prev) => [...prev.slice(-29), roundTrip]);
        resolve(roundTrip);
      });
    });
  }, [socket, recordPacketResult]);

  useEffect(() => {
    if (!socket) return;
    if (socket.connected) measurePing();
    const onConn = () => measurePing();
    socket.on('connect', onConn);
    const intervalMs = isDiagnosticsOpen ? 1000 : 4000;
    const interval = setInterval(() => {
      if (socket.connected) measurePing();
    }, intervalMs);
    return () => {
      socket.off('connect', onConn);
      clearInterval(interval);
    };
  }, [socket, isAuthenticated, isDiagnosticsOpen, measurePing]);

  // Per-User Volumes & Local Mutes
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('dc_user_volumes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [userLocalMutes, setUserLocalMutes] = useState<Record<string, boolean>>({});
  const userVolumesRef = useRef<Record<string, number>>(userVolumes);
  userVolumesRef.current = userVolumes;
  const userLocalMutesRef = useRef<Record<string, boolean>>(userLocalMutes);
  userLocalMutesRef.current = userLocalMutes;
  const isDeafenedRef = useRef<boolean>(isDeafened);
  isDeafenedRef.current = isDeafened;
  const outputVolumeRef = useRef<number>(outputVolume);
  outputVolumeRef.current = outputVolume;
  const selectedOutputDeviceIdRef = useRef<string>(selectedOutputDeviceId);
  selectedOutputDeviceIdRef.current = selectedOutputDeviceId;

  const setUserVolume = useCallback((userId: string, volume: number) => {
    setUserVolumes((prev) => {
      const next = { ...prev, [userId]: volume };
      try {
        localStorage.setItem('dc_user_volumes', JSON.stringify(next));
      } catch {}
      return next;
    });

    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      const isLocallyMuted = userLocalMutes[userId] ?? false;
      audio.muted = isDeafened || isLocallyMuted;
      audio.volume = Math.min(1, Math.max(0, (outputVolume / 100) * (volume / 100)));
    }
  }, [isDeafened, outputVolume, userLocalMutes]);

  const toggleUserLocalMute = useCallback((userId: string) => {
    setUserLocalMutes((prev) => {
      const nextMuted = !prev[userId];
      const next = { ...prev, [userId]: nextMuted };
      const audio = audioElementsRef.current.get(userId);
      if (audio) {
        audio.muted = isDeafened || nextMuted;
      }
      return next;
    });
  }, [isDeafened]);

  // Voice Room Recorder State
  const [isVoiceRecording, setIsVoiceRecording] = useState<boolean>(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState<number>(0);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecordingChunksRef = useRef<Blob[]>([]);
  const voiceRecordingTimerRef = useRef<any>(null);

  const startVoiceRecording = useCallback(async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();

      if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
        try {
          const localSource = ctx.createMediaStreamSource(localStreamRef.current);
          localSource.connect(dest);
        } catch {}
      }

      audioElementsRef.current.forEach((audioEl) => {
        if (audioEl.srcObject && (audioEl.srcObject as MediaStream).getAudioTracks().length > 0) {
          try {
            const remoteSource = ctx.createMediaStreamSource(audioEl.srcObject as MediaStream);
            remoteSource.connect(dest);
          } catch {}
        }
      });

      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(dest.stream, { mimeType });
      voiceRecordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          voiceRecordingChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(voiceRecordingChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const channelName = activeServerRef.current?.name || 'ses-odasi';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `Oda-Kaydi-${channelName}-${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      };

      recorder.start(1000);
      voiceMediaRecorderRef.current = recorder;
      setIsVoiceRecording(true);
      setVoiceRecordingSeconds(0);

      voiceRecordingTimerRef.current = setInterval(() => {
        setVoiceRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      appToast('Ses kaydı başlatılamadı: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, []);

  const stopVoiceRecording = useCallback(() => {
    if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state !== 'inactive') {
      voiceMediaRecorderRef.current.stop();
    }
    if (voiceRecordingTimerRef.current) {
      clearInterval(voiceRecordingTimerRef.current);
      voiceRecordingTimerRef.current = null;
    }
    setIsVoiceRecording(false);
  }, []);

  // Webcam & Background Blur State
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const rawWebcamStreamRef = useRef<MediaStream | null>(null);
  const webcamBlurCtrlRef = useRef<BlurredWebcamController | null>(null);
  const [webcamBlurEnabled, setWebcamBlurEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('cakma_webcam_blur') === 'true'; } catch { return false; }
  });
  const webcamBlurEnabledRef = useRef<boolean>(webcamBlurEnabled);
  webcamBlurEnabledRef.current = webcamBlurEnabled;
  const [remoteWebcamUserIds, setRemoteWebcamUserIds] = useState<string[]>([]);

  const replaceOutboundWebcamTrack = useCallback((nextTrack: MediaStreamTrack | null, nextStream: MediaStream) => {
    const screenVideoTrack = screenStreamRef.current?.getVideoTracks?.()[0];
    for (const pc of peerConnectionsRef.current.values()) {
      const senders = pc.getSenders();
      const camSender = senders.find((s) => s.track && s.track.kind === 'video' && s.track !== screenVideoTrack);
      if (camSender && nextTrack) {
        camSender.replaceTrack(nextTrack).catch(() => {});
      } else if (!camSender && nextTrack) {
        pc.addTrack(nextTrack, nextStream);
      }
    }
  }, []);

  const toggleWebcam = useCallback(async () => {
    if (isWebcamActive) {
      if (webcamBlurCtrlRef.current) {
        webcamBlurCtrlRef.current.stop();
        webcamBlurCtrlRef.current = null;
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
      if (rawWebcamStreamRef.current) {
        rawWebcamStreamRef.current.getTracks().forEach((t) => t.stop());
        rawWebcamStreamRef.current = null;
      }
      setWebcamStream(null);
      setIsWebcamActive(false);
      socket?.emit('webcam_state_update', { active: false });

      const screenVideoTrack = screenStreamRef.current?.getVideoTracks?.()[0];
      for (const pc of peerConnectionsRef.current.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video' && s.track !== screenVideoTrack);
        if (videoSender) {
          pc.removeTrack(videoSender);
        }
      }
    } else {
      try {
        const rawStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 24 }
        });
        rawWebcamStreamRef.current = rawStream;
        let outStream = rawStream;
        if (webcamBlurEnabledRef.current) {
          const ctrl = createBlurredWebcamStream(rawStream, true);
          webcamBlurCtrlRef.current = ctrl;
          outStream = ctrl.stream;
        }
        webcamStreamRef.current = outStream;
        setWebcamStream(outStream);
        setIsWebcamActive(true);
        socket?.emit('webcam_state_update', { active: true });

        const videoTrack = outStream.getVideoTracks()[0];
        if (videoTrack) {
          replaceOutboundWebcamTrack(videoTrack, outStream);
        }
      } catch {
        appToast('Kamera açılamadı. Lütfen kamera erişim izinlerinizi kontrol edin.', 'error');
      }
    }
  }, [isWebcamActive, socket, replaceOutboundWebcamTrack]);

  const toggleWebcamBlur = useCallback(() => {
    setWebcamBlurEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('cakma_webcam_blur', next ? 'true' : 'false'); } catch {}
      const rawStream = rawWebcamStreamRef.current;
      if (rawStream) {
        if (next) {
          let ctrl = webcamBlurCtrlRef.current;
          if (!ctrl) {
            ctrl = createBlurredWebcamStream(rawStream, true);
            webcamBlurCtrlRef.current = ctrl;
          } else {
            ctrl.setBlurred(true);
          }
          webcamStreamRef.current = ctrl.stream;
          setWebcamStream(ctrl.stream);
          replaceOutboundWebcamTrack(ctrl.stream.getVideoTracks()[0] || null, ctrl.stream);
        } else {
          if (webcamBlurCtrlRef.current) {
            webcamBlurCtrlRef.current.stop();
            webcamBlurCtrlRef.current = null;
          }
          webcamStreamRef.current = rawStream;
          setWebcamStream(rawStream);
          replaceOutboundWebcamTrack(rawStream.getVideoTracks()[0] || null, rawStream);
        }
      }
      return next;
    });
  }, [replaceOutboundWebcamTrack]);

  // Priority Speaker State
  const [isPrioritySpeakerActive, setIsPrioritySpeakerActive] = useState<boolean>(false);
  const [prioritySpeakerUsername, setPrioritySpeakerUsername] = useState<string | null>(null);

  const togglePrioritySpeaker = useCallback(() => {
    setIsPrioritySpeakerActive((prev) => {
      const next = !prev;
      socket?.emit('priority_speaker_toggle', { active: next });
      return next;
    });
  }, [socket]);

  useEffect(() => {
    directCallRef.current = directCall;
  }, [directCall]);

  useEffect(() => {
    if (directCall?.status === 'connected') {
      directCallTimerRef.current = setInterval(() => {
        setDirectCall(prev => prev ? { ...prev, durationSeconds: prev.durationSeconds + 1 } : null);
      }, 1000);
    } else {
      if (directCallTimerRef.current) {
        clearInterval(directCallTimerRef.current);
        directCallTimerRef.current = null;
      }
    }
    return () => {
      if (directCallTimerRef.current) {
        clearInterval(directCallTimerRef.current);
      }
    };
  }, [directCall?.status]);

  // 1. Spatial Audio (User Panning)
  const [userPans, setUserPans] = useState<Record<string, number>>({});
  const setUserPan = useCallback((userId: string, pan: number) => {
    setUserPans((prev) => ({ ...prev, [userId]: pan }));
  }, []);

  // 2. Watch Together State
  const [watchTogetherState, setWatchTogetherState] = useState<WatchTogetherState | null>(null);
  const startWatchTogether = useCallback((channelId: string, videoId: string, title: string) => {
    socket?.emit('watch_together_start', { channelId, videoId, title });
  }, [socket]);
  const sendWatchTogetherAction = useCallback((channelId: string, action: 'play' | 'pause' | 'seek', currentTime: number) => {
    socket?.emit('watch_together_action', { channelId, action, currentTime });
  }, [socket]);
  const stopWatchTogether = useCallback((channelId: string) => {
    socket?.emit('watch_together_stop', { channelId });
  }, [socket]);

  // 3. Mini Games State
  const [miniGameState, setMiniGameState] = useState<MiniGameState | null>(null);
  const startMiniGame = useCallback((channelId: string, game: 'xox' | 'typeracer') => {
    socket?.emit('minigame_start', { channelId, game });
  }, [socket]);
  const joinMiniGame = useCallback((channelId: string) => {
    socket?.emit('minigame_join', { channelId });
  }, [socket]);
  const sendMiniGameMove = useCallback((channelId: string, index: number) => {
    socket?.emit('minigame_move', { channelId, index });
  }, [socket]);
  const resetMiniGame = useCallback((channelId: string) => {
    socket?.emit('minigame_reset', { channelId });
  }, [socket]);
  const stopMiniGame = useCallback((channelId: string) => {
    socket?.emit('minigame_stop', { channelId });
  }, [socket]);

  // 4. TeamSpeak Sound Events & Push Notifications Settings (Persisted in localStorage)
  const [tsSoundEffectsEnabled, setTsSoundEffectsEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('dc_ts_sound_effects');
    return saved !== null ? saved === 'true' : true;
  });
  const setTsSoundEffectsEnabled = useCallback((val: boolean) => {
    setTsSoundEffectsEnabledState(val);
    localStorage.setItem('dc_ts_sound_effects', String(val));
  }, []);

  const [soundPack, setSoundPackState] = useState<SoundPackType>(() => {
    const saved = localStorage.getItem('dsp_soundPack');
    if (saved === 'modern' || saved === 'classic-ts' || saved === 'minimal' || saved === 'silent') return saved;
    return 'modern';
  });
  const setSoundPack = useCallback((pack: SoundPackType) => {
    setSoundPackState(pack);
    localStorage.setItem('dsp_soundPack', pack);
  }, []);

  const [pttBeepEnabled, setPttBeepEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('dsp_pttBeep');
    return saved !== null ? saved === 'true' : true;
  });
  const setPttBeepEnabled = useCallback((val: boolean) => {
    setPttBeepEnabledState(val);
    localStorage.setItem('dsp_pttBeep', String(val));
  }, []);
  const pttBeepRef = useRef<boolean>(pttBeepEnabled);
  useEffect(() => {
    pttBeepRef.current = pttBeepEnabled;
  }, [pttBeepEnabled]);

  const [desktopNotificationsEnabled, setDesktopNotificationsEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('dc_desktop_notifications');
    return saved !== null ? saved === 'true' : true;
  });
  const setDesktopNotificationsEnabled = useCallback(async (val: boolean) => {
    if (val) {
      const granted = await requestDesktopNotificationPermission();
      if (!granted) {
        appToast('Tarayıcı bildirim izni verilmedi. Lütfen tarayıcı ayarlarından bildirimlere izin verin.', 'warning');
        return;
      }
    }
    setDesktopNotificationsEnabledState(val);
    localStorage.setItem('dc_desktop_notifications', String(val));
  }, []);

  const tsSoundEffectsRef = useRef<boolean>(tsSoundEffectsEnabled);
  useEffect(() => {
    tsSoundEffectsRef.current = tsSoundEffectsEnabled;
  }, [tsSoundEffectsEnabled]);

  const desktopNotificationsRef = useRef<boolean>(desktopNotificationsEnabled);
  useEffect(() => {
    desktopNotificationsRef.current = desktopNotificationsEnabled;
  }, [desktopNotificationsEnabled]);

  // 5. TeamSpeak Whisper State
  const [activeWhisperFrom, setActiveWhisperFrom] = useState<string | null>(null);
  const sendWhisper = useCallback((targetUserId: string, active: boolean) => {
    socket?.emit('whisper_send', { targetUserId, active });
  }, [socket]);

  // 6. Server Leaderboard
  const [leaderboardData, setLeaderboardData] = useState<Record<string, MemberLevelData[]>>({});
  const fetchLeaderboard = useCallback((serverId: string) => {
    socket?.emit('get_server_leaderboard', { serverId });
  }, [socket]);

  // Derived state (supports virtual Direct Messages server)
  const isDMMode = activeServerId === 'direct-messages';
  const dmChannelId = (activeDMUser && currentUser)
    ? buildPersistentDmChannelId(currentUser.username, activeDMUser.username)
    : 'dm-general';

  const virtualDMServer: Server | null = isDMMode ? {
    id: 'direct-messages',
    name: 'Direkt Mesajlar',
    icon: '💬',
    ownerId: 'system',
    roles: [],
    members: [],
    channels: [
      {
        id: dmChannelId,
        name: activeDMUser ? activeDMUser.username : 'Sohbet',
        type: 'text',
        serverId: 'direct-messages'
      }
    ]
  } : null;

  const activeServer = isDMMode ? virtualDMServer : (servers.find(s => s.id === activeServerId) || servers[0] || null);
  const activeServerRef = useRef<Server | null>(null);
  useEffect(() => {
    activeServerRef.current = activeServer;
  }, [activeServer]);
  const activeChannel = isDMMode
    ? virtualDMServer?.channels[0] || null
    : (activeServer?.channels.find(c => c.id === activeChannelId) || 
       activeServer?.channels.find(c => c.type === 'text') || null);
  const activeChannelRef = useRef<Channel | null>(null);
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);
  const messages = activeChannel ? messagesMap[activeChannel.id] || [] : [];

  // Enumerate Audio Devices
  const refreshAudioDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      console.warn('Ses aygıtları: navigator.mediaDevices bu ortamda (güvensiz HTTP bağlamı veya desteklenmeyen tarayıcı) mevcut değil.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');

      setAudioInputDevices(inputs);
      setAudioOutputDevices(outputs);

      if (!selectedInputDeviceId && inputs.length > 0) {
        setSelectedInputDeviceIdState(inputs[0].deviceId);
      }
      if (!selectedOutputDeviceId && outputs.length > 0) {
        setSelectedOutputDeviceIdState(outputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Ses aygıtları listelenemedi:', err);
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId]);

  useEffect(() => {
    refreshAudioDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        navigator.mediaDevices.ondevicechange = () => {
          refreshAudioDevices();
        };
      } catch {}
    }
  }, [refreshAudioDevices]);

  // Helper to get or request audio stream with current settings
  const getLocalAudioStream = async (forceNew: boolean = false): Promise<MediaStream | null> => {
    if (localStreamRef.current && !forceNew) {
      return processedStreamRef.current || localStreamRef.current;
    }

    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach(t => t.stop());
      processedStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      appToast('Mikrofon erişimi için güvenli bağlantı (HTTPS veya localhost) gereklidir. Tarayıcınız HTTP üzerinden mikrofon iznine izin vermiyor.', 'error');
      return null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 2 },
          latency: { ideal: 0.01 },
        } as MediaTrackConstraints,
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      let outboundStream: MediaStream = stream;

      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
        }

        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const gainNode = ctx.createGain();
        gainNode.gain.value = inputVolume / 100;
        gainNodeRef.current = gainNode;

        const source = ctx.createMediaStreamSource(stream);
        if (studioAudioDsp) {
          const highPass = ctx.createBiquadFilter();
          highPass.type = 'highpass';
          highPass.frequency.value = 80;
          highPass.Q.value = 0.707;

          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -24;
          compressor.knee.value = 18;
          compressor.ratio.value = 4;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.15;

          const dest = ctx.createMediaStreamDestination();
          source.connect(highPass);
          let lastStage: AudioNode = highPass;
          if (aiNoiseSuppression && ctx.audioWorklet) {
            try {
              if (!noiseWorkletLoadedCtxRef.current.has(ctx)) {
                await ctx.audioWorklet.addModule('/noise-suppressor-worklet.js');
                noiseWorkletLoadedCtxRef.current.add(ctx);
              }
              const workletNode = new AudioWorkletNode(ctx, 'spectral-noise-suppressor');
              workletNode.port.postMessage({ enabled: true });
              noiseWorkletNodeRef.current = workletNode;
              lastStage.connect(workletNode);
              lastStage = workletNode;
            } catch (workletErr) {
              console.warn('Spectral Noise Suppressor Worklet yüklenemedi, standart DSP ile devam ediliyor:', workletErr);
            }
          }
          lastStage.connect(compressor);
          compressor.connect(gainNode);
          gainNode.connect(analyser);
          gainNode.connect(dest);
          if (dest.stream.getAudioTracks().length > 0) {
            outboundStream = dest.stream;
            processedStreamRef.current = dest.stream;
          }
        } else {
          source.connect(gainNode);
          gainNode.connect(analyser);
        }

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalizedLevel = Math.min(100, Math.round((average / 128) * 100));
          setVoiceMicVolume(normalizedLevel);

          const speakingThreshold = inputSensitivity * 0.7;
          const speakingNow = average > speakingThreshold && !isMuted;

          setIsSpeaking(prev => {
            if (prev !== speakingNow) {
              socket?.emit('user_speaking', { isSpeaking: speakingNow });
            }
            return speakingNow;
          });

          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (err) {
        console.warn('Audio analysis setup warning:', err);
      }

      const newAudioTrack = outboundStream.getAudioTracks()[0];
      for (const pc of peerConnectionsRef.current.values()) {
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender && newAudioTrack) {
          audioSender.replaceTrack(newAudioTrack);
        }
      }

      return outboundStream;
    } catch (err) {
      console.error('Mikrofon erişim izni alınamadı:', err);
      return null;
    }
  };

  const setSelectedInputDeviceId = async (deviceId: string) => {
    setSelectedInputDeviceIdState(deviceId);
    try { localStorage.setItem('dsp_inputDeviceId', deviceId); } catch {}
    if (localStreamRef.current || connectedVoiceChannelId) {
      await getLocalAudioStream(true);
    }
  };

  const setSelectedOutputDeviceId = async (deviceId: string) => {
    setSelectedOutputDeviceIdState(deviceId);
    try { localStorage.setItem('dsp_outputDeviceId', deviceId); } catch {}
    audioElementsRef.current.forEach(async (audio) => {
      if ('setSinkId' in audio) {
        try {
          await (audio as any).setSinkId(deviceId);
        } catch (e) {
          console.warn('SinkId değiştirilemedi:', e);
        }
      }
    });
  };

  const setNoiseSuppression = async (val: boolean) => {
    setNoiseSuppressionState(val);
    try { localStorage.setItem('dsp_noiseSuppression', String(val)); } catch {}
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setEchoCancellation = async (val: boolean) => {
    setEchoCancellationState(val);
    try { localStorage.setItem('dsp_echoCancellation', String(val)); } catch {}
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setAutoGainControl = async (val: boolean) => {
    setAutoGainControlState(val);
    try { localStorage.setItem('dsp_autoGainControl', String(val)); } catch {}
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setStudioAudioDsp = async (val: boolean) => {
    setStudioAudioDspState(val);
    try { localStorage.setItem('dsp_studioAudioDsp', String(val)); } catch {}
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setAiNoiseSuppression = async (val: boolean) => {
    setAiNoiseSuppressionState(val);
    try { localStorage.setItem('dsp_aiNoiseSuppression', String(val)); } catch {}
    if (noiseWorkletNodeRef.current) {
      try {
        noiseWorkletNodeRef.current.port.postMessage({ enabled: val });
        return;
      } catch {}
    }
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setLowLatencyAudio = (val: boolean) => {
    setLowLatencyAudioState(val);
    try { localStorage.setItem('dsp_lowLatencyAudio', String(val)); } catch {}
    for (const pc of peerConnectionsRef.current.values()) {
      for (const receiver of pc.getReceivers()) {
        if (receiver.track?.kind === 'audio' && 'playoutDelayHint' in receiver) {
          try {
            (receiver as any).playoutDelayHint = val ? 0.02 : 0.08;
          } catch {}
        }
      }
    }
  };

  const applyRemoteAudioEq = useCallback((peerId: string, eq: UserAudioEq) => {
    const audio = audioElementsRef.current.get(peerId);
    if (!audio || !audio.srcObject) return;
    const stream = audio.srcObject as MediaStream;
    const isDefault = eq.bass === 0 && eq.treble === 0 && !eq.normalize;
    const userVol = userVolumes[peerId] ?? 100;
    const isLocallyMuted = userLocalMutes[peerId] ?? false;
    const targetGain = isDeafened || isLocallyMuted ? 0 : Math.min(2, Math.max(0, (outputVolume / 100) * (userVol / 100)));

    if (isDefault) {
      const existing = remoteAudioEqChainsRef.current.get(peerId);
      if (existing) {
        try {
          existing.source.disconnect();
          existing.ctx.close().catch(() => {});
        } catch {}
        remoteAudioEqChainsRef.current.delete(peerId);
      }
      audio.muted = isDeafened || isLocallyMuted;
      return;
    }

    try {
      let chain = remoteAudioEqChainsRef.current.get(peerId);
      if (!chain) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx({ sampleRate: 48000 });
        const source = ctx.createMediaStreamSource(stream);
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 200;
        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3500;
        const compressor = ctx.createDynamicsCompressor();
        const gain = ctx.createGain();
        source.connect(lowShelf);
        lowShelf.connect(highShelf);
        highShelf.connect(compressor);
        compressor.connect(gain);
        gain.connect(ctx.destination);
        chain = { ctx, source, lowShelf, highShelf, compressor, gain };
        remoteAudioEqChainsRef.current.set(peerId, chain);
      }
      chain.lowShelf.gain.value = eq.bass;
      chain.highShelf.gain.value = eq.treble;
      chain.compressor.ratio.value = eq.normalize ? 6 : 1;
      chain.compressor.threshold.value = eq.normalize ? -24 : 0;
      chain.gain.gain.value = targetGain;
      audio.muted = true;
    } catch {}
  }, [isDeafened, outputVolume, userVolumes, userLocalMutes]);

  const setUserAudioEq = useCallback((userId: string, patch: Partial<UserAudioEq>) => {
    setUserAudioEqState((prev) => {
      const current = prev[userId] || { bass: 0, treble: 0, normalize: false };
      const updated: UserAudioEq = {
        bass: patch.bass !== undefined ? Math.max(-12, Math.min(12, patch.bass)) : current.bass,
        treble: patch.treble !== undefined ? Math.max(-12, Math.min(12, patch.treble)) : current.treble,
        normalize: patch.normalize !== undefined ? patch.normalize : current.normalize,
      };
      const next = { ...prev, [userId]: updated };
      try { localStorage.setItem('cakma_user_audio_eq', JSON.stringify(next)); } catch {}
      applyRemoteAudioEq(userId, updated);
      return next;
    });
  }, [applyRemoteAudioEq]);

  const setInputVolume = (val: number) => {
    setInputVolumeState(val);
    try { localStorage.setItem('dsp_inputVolume', String(val)); } catch {}
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = val / 100;
    }
  };

  const setOutputVolume = (val: number) => {
    setOutputVolumeState(val);
    try { localStorage.setItem('dsp_outputVolume', String(val)); } catch {}
    audioElementsRef.current.forEach(audio => {
      audio.volume = Math.min(1, Math.max(0, val / 100));
    });
  };

  const toggleMicTest = async () => {
    if (isMicTesting) {
      if (micTestAudioRef.current) {
        micTestAudioRef.current.pause();
        micTestAudioRef.current.srcObject = null;
        micTestAudioRef.current.remove();
        micTestAudioRef.current = null;
      }
      setIsMicTesting(false);
    } else {
      const stream = await getLocalAudioStream();
      if (!stream) return;

      const audio = new Audio();
      if ('setSinkId' in audio && selectedOutputDeviceId) {
        try {
          await (audio as any).setSinkId(selectedOutputDeviceId);
        } catch (e) {}
      }
      audio.srcObject = stream;
      audio.volume = Math.min(1, outputVolume / 100);
      audio.play().catch(e => console.warn(e));
      micTestAudioRef.current = audio;
      setIsMicTesting(true);
    }
  };

  const cleanupWebRTC = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    if (livekitRoomRef.current) {
      for (const pub of livekitScreenTracksRef.current) {
        try {
          if (pub?.track) livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
        } catch {}
      }
      livekitScreenTracksRef.current = [];
      try {
        livekitRoomRef.current.disconnect();
      } catch {}
      livekitRoomRef.current = null;
    }
    noiseWorkletNodeRef.current = null;
    resetVoiceMetrics();
    setVoiceTransportMode('p2p');

    audioElementsRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();
    screenAudioElementsRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    screenAudioElementsRef.current.clear();
    remoteDataChannelsRef.current.forEach(chs => {
      try { chs.control?.close(); } catch {}
      try { chs.move?.close(); } catch {}
    });
    remoteDataChannelsRef.current.clear();
    remoteAudioEqChainsRef.current.forEach((chain) => {
      try {
        chain.source.disconnect();
        chain.ctx.close().catch(() => {});
      } catch {}
    });
    remoteAudioEqChainsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    setRemoteScreenStreams(new Map());
    setRemoteCameraStreams(new Map());
    setLocalDirectCameraStream(null);

    if (micTestAudioRef.current) {
      micTestAudioRef.current.pause();
      micTestAudioRef.current.srcObject = null;
      micTestAudioRef.current.remove();
      micTestAudioRef.current = null;
      setIsMicTesting(false);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Initialize socket & Auto-Login
  useEffect(() => {
    const isTauriApp = typeof window !== 'undefined' && (
      '__TAURI_INTERNALS__' in window ||
      window.location.hostname === 'tauri.localhost' ||
      window.location.protocol === 'tauri:'
    );
    const isDevVite = typeof window !== 'undefined' && window.location.port === '5173';
    const defaultHost = isTauriApp
      ? 'ses.yahyakemalokutan.com'
      : (!isDevVite && typeof window !== 'undefined' && window.location.host)
        ? window.location.host
        : 'localhost:4000';

    const savedHost = localStorage.getItem('dc_dedicated_server_host') || defaultHost;
    setCurrentServerHost(savedHost);
    const backendUrl = savedHost.startsWith('http://') || savedHost.startsWith('https://')
      ? savedHost
      : isTauriApp
        ? `${(savedHost.startsWith('localhost') || savedHost.startsWith('127.0.0.1')) ? 'http:' : 'https:'}//${savedHost}`
        : `${window.location.protocol}//${savedHost}`;

    let handshakeUsername = '';
    let handshakeAvatar = '🎮';
    const savedAuth = localStorage.getItem('dc_clone_auth');
    if (savedAuth) {
      try {
        const creds = JSON.parse(savedAuth);
        handshakeUsername = creds.username || '';
        handshakeAvatar = creds.avatar || '🎮';
      } catch {}
    }

    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        clientSignature: 'OFFICIAL_APP_CLIENT_TOKEN_V1_VERIFIED',
        username: handshakeUsername,
        avatar: handshakeAvatar
      }
    });
    setSocket(newSocket);

    newSocket.on('connect_error', (err: Error) => {
      setConnectionState('reconnecting');
      console.warn('Socket bağlantı hatası:', err?.message);
      const errMsg = err?.message || '';
      if (errMsg.includes('LİSANS_İPTAL') || errMsg.includes('LISANS_IPTAL') || errMsg.includes('YETKISIZ') || errMsg.includes('YETKİSİZ')) {
        appToast(`⛔ Bağlantı Reddedildi: ${errMsg}. Özel sunucunun lisansı iptal edildiği için ana sunucuya yönlendiriliyorsunuz.`, 'error');
        resetToMainServer();
      }
    });

    newSocket.on('disconnect', () => {
      setConnectionState('reconnecting');
    });

    newSocket.io.on('reconnect_attempt', () => {
      setConnectionState('reconnecting');
    });

    newSocket.io.on('reconnect_failed', () => {
      setConnectionState('disconnected');
    });

    newSocket.on('connect', () => {
      setConnectionState('connected');
      console.log('Connected to backend:', newSocket.id);
      newSocket.emit('get_store_settings');
      newSocket.emit('get_my_licenses');
      const currentSavedAuth = localStorage.getItem('dc_clone_auth');
      if (currentSavedAuth) {
        try {
          const creds = JSON.parse(currentSavedAuth);
          if (creds.token || creds.cookieSession) {
            newSocket.emit('auth_token_login', { token: creds.token || '__cookie__' });
          } else if (creds.username && creds.password) {
            newSocket.emit('auth_login', { usernameOrEmail: creds.username, password: creds.password });
          } else {
            setIsAuthenticated(false);
          }
        } catch {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    });

    newSocket.on('auth_response', (res: { success: boolean; user?: User; token?: string; mediaToken?: string; tokenExpired?: boolean; isNewUser?: boolean; error?: string }) => {
      if (res.success && res.user) {
        if (res.isNewUser) {
          setShouldAutoOpenExplore(true);
        }
        if (res.token || res.mediaToken) {
          const isSameOriginWeb = !isTauriApp && typeof window !== 'undefined' && backendUrl.startsWith(window.location.origin);
          if (isSameOriginWeb && res.token) {
            fetch(`${backendUrl}/api/auth/set-cookie`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: res.token }),
            }).catch(() => {});
            localStorage.setItem('dc_clone_auth', JSON.stringify({
              cookieSession: true,
              mediaToken: res.mediaToken,
              username: res.user.username,
              avatar: res.user.avatar
            }));
          } else {
            localStorage.setItem('dc_clone_auth', JSON.stringify({
              token: res.token,
              mediaToken: res.mediaToken,
              username: res.user.username,
              avatar: res.user.avatar
            }));
          }
        }
        setCurrentUser(res.user);
        setIsAuthenticated(true);
        if (lastVoiceChannelIdRef.current) {
          newSocket.emit('join_voice', { channelId: lastVoiceChannelIdRef.current });
          setConnectedVoiceChannelId(lastVoiceChannelIdRef.current);
        }
        if (pendingMessageQueueRef.current.length > 0) {
          const queued = [...pendingMessageQueueRef.current];
          pendingMessageQueueRef.current = [];
          queued.forEach((payload) => {
            newSocket.emit('send_message', payload);
          });
        }
      } else if (res.tokenExpired) {
        localStorage.removeItem('dc_clone_auth');
        setIsAuthenticated(false);
        setCurrentUser(null);
      } else if (res.error && (res.error.includes('LİSANS') || res.error.includes('LISANS'))) {
        appToast(`⛔ Giriş Engellendi: ${res.error}. Ana sunucuya yönlendiriliyorsunuz.`, 'error');
        resetToMainServer();
      }
    });

    newSocket.on('voice_sfu_token', async ({ token, path }: { token: string; roomName: string; path?: string }) => {
      if (!token) return;
      const resolveSfuPeerId = (identity: string): string => {
        const lower = (identity || '').toLowerCase();
        const found = onlineUsersRef.current.find((u) => u.username.toLowerCase() === lower);
        return found?.id || `sfu-${identity}`;
      };
      try {
        const { Room, RoomEvent, Track } = await import('livekit-client');
        if (livekitRoomRef.current) {
          for (const pub of livekitScreenTracksRef.current) {
            try { if (pub?.track) livekitRoomRef.current.localParticipant.unpublishTrack(pub.track); } catch {}
          }
          livekitScreenTracksRef.current = [];
          try { livekitRoomRef.current.disconnect(); } catch {}
          livekitRoomRef.current = null;
        }
        const lkWsUrl = `${backendUrl.replace(/^http/i, 'ws')}${path || '/livekit'}`;
        const room = new Room({ adaptiveStream: true, dynacast: true });

        room.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
          const peerIdentity = participant?.identity || participant?.sid || 'sfu-peer';
          const peerId = resolveSfuPeerId(peerIdentity);
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach() as HTMLAudioElement;
            const userVol = userVolumesRef.current[peerId] ?? 100;
            const localMute = userLocalMutesRef.current[peerId] ?? false;
            el.muted = isDeafenedRef.current || localMute;
            el.volume = Math.min(1, Math.max(0, (outputVolumeRef.current / 100) * (userVol / 100)));
            const outDev = selectedOutputDeviceIdRef.current;
            if (outDev && 'setSinkId' in el) {
              try { void (el as any).setSinkId(outDev); } catch {}
            }
            audioElementsRef.current.set(peerId, el);
            const savedEq = userAudioEqRef.current[peerId];
            if (savedEq && (savedEq.bass !== 0 || savedEq.treble !== 0 || savedEq.normalize)) {
              setTimeout(() => applyRemoteAudioEq(peerId, savedEq), 50);
            }
          } else if (track.kind === Track.Kind.Video && track.mediaStreamTrack) {
            const ms = new MediaStream([track.mediaStreamTrack]);
            setRemoteScreenStreams((prev) => {
              const next = new Map(prev);
              next.set(peerId, ms);
              return next;
            });
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: any, _pub: any, participant: any) => {
          const peerIdentity = participant?.identity || participant?.sid || 'sfu-peer';
          const peerId = resolveSfuPeerId(peerIdentity);
          if (track.kind === Track.Kind.Audio) {
            track.detach();
            audioElementsRef.current.get(peerId)?.remove();
            audioElementsRef.current.delete(peerId);
            const eqChain = remoteAudioEqChainsRef.current.get(peerId);
            if (eqChain) {
              try { eqChain.source.disconnect(); eqChain.ctx.close().catch(() => {}); } catch {}
              remoteAudioEqChainsRef.current.delete(peerId);
            }
          } else if (track.kind === Track.Kind.Video) {
            setRemoteScreenStreams((prev) => {
              const next = new Map(prev);
              next.delete(peerId);
              return next;
            });
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
          const activeSet = new Set(
            (speakers || [])
              .map((s) => (s?.identity || '').toLowerCase())
              .filter(Boolean)
          );
          setOnlineUsers((prev) =>
            prev.map((u) => {
              if (!u.currentVoiceChannelId) return u;
              const nextSpeaking = activeSet.has(u.username.toLowerCase());
              return u.isSpeaking === nextSpeaking ? u : { ...u, isSpeaking: nextSpeaking };
            })
          );
        });

        await room.connect(lkWsUrl, token);
        livekitRoomRef.current = room;
        setVoiceTransportMode('sfu');

        const localStream = await getLocalAudioStream();
        const audioTrack = localStream?.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !isMuted;
          await room.localParticipant.publishTrack(audioTrack, {
            source: Track.Source.Microphone,
          });
        }

        // If user already started Screen Share before SFU upgrade, publish those tracks too
        if (screenStreamRef.current) {
          for (const st of screenStreamRef.current.getTracks()) {
            try {
              const pub = await room.localParticipant.publishTrack(st, {
                source: st.kind === 'video' ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio,
                simulcast: st.kind === 'video',
              });
              livekitScreenTracksRef.current.push(pub);
            } catch {}
          }
        }

        // Close P2P mesh connections since SFU is now active
        peerConnectionsRef.current.forEach((pc) => pc.close());
        peerConnectionsRef.current.clear();
      } catch (err) {
        console.warn('[SFU] LiveKit bağlantısı kurulamadı, P2P Mesh ile devam ediliyor:', err);
        setVoiceTransportMode('p2p');
      }
    });

    newSocket.on('voice_sfu_unavailable', ({ reason, url }: { reason?: string; url?: string }) => {
      console.warn(`[SFU] LiveKit SFU kullanılamıyor (${url || 'varsayılan'}): ${reason || 'Bilinmeyen neden'}. P2P Mesh ile devam ediliyor.`);
      setVoiceTransportMode('p2p');
    });

    newSocket.on('security_new_ip_alert', (payload: { ip: string; timestamp: string }) => {
      setNewIpAlert(payload);
    });

    newSocket.on('force_logout', (payload: { reason?: string }) => {
      try { localStorage.removeItem('dc_clone_auth'); } catch {}
      setIsAuthenticated(false);
      setCurrentUser(null);
      if (payload?.reason) {
        appToast(payload.reason, 'error');
      }
    });

    newSocket.on('init_data', (data: {
      currentUser: User;
      servers: Server[];
      onlineUsers: User[];
      messages: Record<string, Message[]>;
      hasMoreMessages?: Record<string, boolean>;
      readCursors?: Record<string, string>;
    }) => {
      setCurrentUser(data.currentUser);
      setIsAuthenticated(data.currentUser.role === 'admin' || !!data.currentUser.email || !!savedAuth);
      setServers(data.servers);
      setOnlineUsers(data.onlineUsers);
      setMessagesMap(data.messages);
      if (data.hasMoreMessages) {
        setHasMoreMessages(data.hasMoreMessages);
      }
      const nextCursors = data.readCursors || {};
      setReadCursors(nextCursors);
      readCursorsRef.current = nextCursors;

      const initialUnread: Record<string, number> = {};
      const myNameLower = (data.currentUser.username || '').toLowerCase();
      for (const [chId, list] of Object.entries(data.messages || {})) {
        if (!Array.isArray(list) || list.length === 0) continue;
        const cursorId = nextCursors[chId];
        if (!cursorId) continue;
        const idx = list.findIndex((m) => m.id === cursorId);
        if (idx !== -1 && idx < list.length - 1) {
          const unreadAfter = list.slice(idx + 1).filter(
            (m) => (m.author?.username || '').toLowerCase() !== myNameLower
          ).length;
          if (unreadAfter > 0) initialUnread[chId] = unreadAfter;
        }
      }
      setUnreadCounts(initialUnread);

      if (data.servers.length > 0) {
        setActiveServerId(data.servers[0].id);
        const firstTextCh = data.servers[0].channels.find(c => c.type === 'text');
        if (firstTextCh) setActiveChannelId(firstTextCh.id);
      } else {
        setActiveServerId('direct-messages');
        setActiveChannelId('');
      }
    });

    newSocket.on('older_messages_loaded', ({ channelId, messages: olderMsgs, hasMore }: { channelId: string; messages: Message[]; hasMore: boolean }) => {
      setIsLoadingOlderMessages(false);
      if (!channelId) return;
      setHasMoreMessages((prev) => ({ ...prev, [channelId]: Boolean(hasMore) }));
      if (!Array.isArray(olderMsgs) || olderMsgs.length === 0) return;
      setMessagesMap((prev) => {
        const existing = prev[channelId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const uniqueOlder = olderMsgs.filter((m) => !existingIds.has(m.id));
        return {
          ...prev,
          [channelId]: [...uniqueOlder, ...existing],
        };
      });
    });

    newSocket.on('new_message', (msg: Message) => {
      setMessagesMap(prev => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] || []), msg]
      }));

      const isMention = Boolean(
        currentUserRef.current &&
        msg.content &&
        msg.content.toLowerCase().includes('@' + currentUserRef.current.username.toLowerCase())
      );
      const isDM = msg.channelId.startsWith('dm-');
      const notifLevel = getTargetNotificationPref(notificationPrefsRef.current, msg.channelId, msg.serverId);

      if (
        msg.channelId !== activeChannelIdRef.current &&
        msg.author?.username !== currentUserRef.current?.username &&
        shouldShowUnreadForChannel({ level: notifLevel, isMention })
      ) {
        setUnreadCounts(prev => ({
          ...prev,
          [msg.channelId]: (prev[msg.channelId] || 0) + 1
        }));
        if (isDM && msg.author?.username) {
          const uname = msg.author.username.toLowerCase();
          setUnreadDMByUser(prev => ({
            ...prev,
            [uname]: (prev[uname] || 0) + 1,
          }));
        }
        if (isMention) {
          setMentionCounts(prev => ({
            ...prev,
            [msg.channelId]: (prev[msg.channelId] || 0) + 1
          }));
        }
      }

      // Desktop Push Notification (suppressed in Do Not Disturb mode or muted channel/server, clickable jump to channel)
      if (
        desktopNotificationsRef.current &&
        currentUserRef.current &&
        currentUserRef.current.status !== 'dnd' &&
        msg.author?.id !== currentUserRef.current.id &&
        shouldNotifyForMessage({ level: notifLevel, isMention, isDM })
      ) {
        if (isMention || isDM) {
          sendDesktopNotification(
            isDM ? `Direkt Mesaj (@${msg.author.username})` : `@${msg.author.username} senden bahsetti`,
            msg.content || 'Yeni bir ek veya mesaj paylaşıldı',
            '💬',
            () => {
              if (isDM) {
                const senderUser = onlineUsersRef.current.find((u) => u.id === msg.author?.id || u.username.toLowerCase() === msg.author?.username?.toLowerCase());
                if (senderUser) setActiveDMUser(senderUser);
                setActiveServerId('direct-messages');
              } else {
                const srv = serversRef.current.find((s) => s.id === msg.serverId || s.channels.some((c) => c.id === msg.channelId));
                if (srv) {
                  setActiveDMUser(null);
                  setActiveServerId(srv.id);
                }
              }
              setActiveChannelId(msg.channelId);
              setUnreadCounts((prev) => {
                if (!prev[msg.channelId]) return prev;
                const next = { ...prev };
                delete next[msg.channelId];
                return next;
              });
            }
          );
        }
      }
    });

    newSocket.on('dm_read_receipt', ({ readerUsername, readAt }: { readerUsername: string; readAt: number }) => {
      if (!readerUsername) return;
      setDmReadReceipts(prev => ({
        ...prev,
        [readerUsername]: Math.max(prev[readerUsername] || 0, readAt)
      }));
    });

    newSocket.on('message_edited', ({ channelId, messageId, content, isEdited }: { channelId: string; messageId: string; content: string; isEdited: boolean }) => {
      setMessagesMap(prev => {
        const channelList = prev[channelId];
        if (!channelList) return prev;
        return {
          ...prev,
          [channelId]: channelList.map(m => m.id === messageId ? { ...m, content, isEdited } : m)
        };
      });
    });

    newSocket.on('message_deleted', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
      setMessagesMap(prev => {
        const channelList = prev[channelId];
        if (!channelList) return prev;
        return {
          ...prev,
          [channelId]: channelList.filter(m => m.id !== messageId)
        };
      });
    });

    newSocket.on('thread_message_added', ({ channelId, parentMessageId, threadMessage }: { channelId: string; parentMessageId: string; threadMessage: ThreadMessage }) => {
      setMessagesMap(prev => {
        const channelList = prev[channelId];
        if (!channelList) return prev;
        return {
          ...prev,
          [channelId]: channelList.map(m =>
            m.id === parentMessageId
              ? { ...m, threadMessages: [...(m.threadMessages || []), threadMessage] }
              : m
          )
        };
      });
    });

    newSocket.on('channel_messages_cleared', ({ channelId, messages: updatedMsgs }: { channelId: string; messages: Message[] }) => {
      setMessagesMap(prev => ({
        ...prev,
        [channelId]: updatedMsgs
      }));
    });

    newSocket.on('user_typing', ({ channelId, username, isTyping }: { channelId: string; username: string; isTyping: boolean }) => {
      setChannelTypingState(channelId, username, isTyping);
    });

    newSocket.on('message_reaction_updated', ({ channelId, messageId, reactions }: { channelId: string; messageId: string; reactions: Record<string, string[]> }) => {
      setMessagesMap(prev => {
        const channelList = prev[channelId];
        if (!channelList) return prev;
        return {
          ...prev,
          [channelId]: channelList.map(m => m.id === messageId ? { ...m, reactions } : m)
        };
      });
    });

    newSocket.on('message_pin_updated', ({ channelId, messageId, isPinned }: { channelId: string; messageId: string; isPinned: boolean }) => {
      setMessagesMap(prev => {
        const channelList = prev[channelId];
        if (!channelList) return prev;
        return {
          ...prev,
          [channelId]: channelList.map(m => m.id === messageId ? { ...m, isPinned } : m)
        };
      });
    });

    newSocket.on('poll_updated', ({ channelId, messageId, poll }: { channelId: string; messageId: string; poll: PollData }) => {
      setMessagesMap(prev => {
        const channelList = prev[channelId];
        if (!channelList) return prev;
        return {
          ...prev,
          [channelId]: channelList.map(m => m.id === messageId ? { ...m, poll } : m)
        };
      });
    });

    newSocket.on('voice_soundboard_played', ({ soundId, username }: { soundId: string; username: string }) => {
      playSynthesizedSound(soundId);
      setActiveSoundboardEffect({ soundId, username });
      setTimeout(() => {
        setActiveSoundboardEffect(null);
      }, 2500);
    });

    newSocket.on('voice_radio_synced', (state: any) => {
      setRadioBotState(prev => ({ ...prev, ...state }));
    });

    newSocket.on('channel_created', ({ serverId, channel }: { serverId: string; channel: Channel }) => {
      setServers(prev => prev.map(s => {
        if (s.id === serverId) {
          return { ...s, channels: [...s.channels, channel] };
        }
        return s;
      }));
    });

    newSocket.on('channel_updated', ({ serverId, channel }: { serverId: string; channel: Channel }) => {
      setServers(prev => prev.map(s => {
        if (s.id === serverId) {
          return {
            ...s,
            channels: s.channels.map(c => c.id === channel.id ? channel : c)
          };
        }
        return s;
      }));
    });

    newSocket.on('channel_deleted', ({ serverId, channelId }: { serverId: string; channelId: string }) => {
      setServers(prev => prev.map(s => {
        if (s.id === serverId) {
          return { ...s, channels: s.channels.filter(c => c.id !== channelId) };
        }
        return s;
      }));
    });

    newSocket.on('server_created', (newServer: Server) => {
      setServers(prev => (prev.some(s => s.id === newServer.id) ? prev : [...prev, newServer]));
      setActiveDMUser(null);
      setActiveServerId(newServer.id);
      const firstText = newServer.channels.find(c => c.type === 'text');
      if (firstText) setActiveChannelId(firstText.id);
    });

    newSocket.on('server_updated', (updatedServer: Server) => {
      setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
      if (updatedServer.bitrateKbps) {
        peerConnectionsRef.current.forEach((pc) => {
          applyAudioBitrate(pc, updatedServer.bitrateKbps!);
        });
      }
    });

    const handleServerRemoval = (removedId: string) => {
      if (!removedId) return;
      setServers(prev => {
        const remaining = prev.filter(s => s.id !== removedId);
        serversRef.current = remaining;
        setActiveServerId(curr => {
          if (curr !== removedId) return curr;
          if (remaining.length > 0) {
            const nextSrv = remaining[0];
            const firstText = nextSrv.channels.find(c => c.type === 'text');
            setActiveChannelId(firstText?.id || '');
            return nextSrv.id;
          }
          setActiveChannelId('');
          return 'direct-messages';
        });
        return remaining;
      });
    };

    newSocket.on('server_deleted', (payload: { serverId: string } | string) => {
      const removedId = typeof payload === 'string' ? payload : payload?.serverId;
      handleServerRemoval(removedId);
    });

    newSocket.on('server_removed', (payload: { serverId: string } | string) => {
      const removedId = typeof payload === 'string' ? payload : payload?.serverId;
      handleServerRemoval(removedId);
    });

    newSocket.on('servers_updated', (updatedServers: Server[]) => {
      setServers(updatedServers);
    });

    newSocket.on('priority_speaker_active', ({ userId, username, active }: { userId: string; username: string; active: boolean }) => {
      setPrioritySpeakerUsername(active ? username : null);
      audioElementsRef.current.forEach((audio, pId) => {
        if (active) {
          if (pId !== userId) {
            audio.volume = Math.max(0.05, ((userVolumes[pId] ?? 100) / 100) * 0.25);
          } else {
            audio.volume = Math.min(2, (userVolumes[pId] ?? 100) / 100);
          }
        } else {
          audio.volume = Math.min(2, (userVolumes[pId] ?? 100) / 100);
        }
      });
    });

    newSocket.on('user_webcam_update', ({ userId, active }: { userId: string; active: boolean }) => {
      setRemoteWebcamUserIds(prev => active ? [...new Set([...prev, userId])] : prev.filter(id => id !== userId));
    });

    newSocket.on('server_action_error', ({ message }: { message: string }) => {
      appToast(message, 'error');
    });

    newSocket.on('chat_flood_error', ({ message }: { message: string }) => {
      appToast(`⚠️ ${message}`, 'warning');
    });

    newSocket.on('file_security_error', ({ message }: { message: string }) => {
      appToast(`🛡️ ${message}`, 'error');
    });

    newSocket.on('user_connected', (newUser: User) => {
      setOnlineUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    });

    newSocket.on('user_updated', (updatedUser: User) => {
      setOnlineUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (updatedUser.id === newSocket.id) {
        setCurrentUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
      }
    });

    newSocket.on('voice_state_update', ({ userId, channelId, isMuted, isDeafened }: any) => {
      setOnlineUsers(prev => prev.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            currentVoiceChannelId: channelId || undefined,
            isMuted: isMuted ?? u.isMuted,
            isDeafened: isDeafened ?? u.isDeafened
          };
        }
        return u;
      }));
    });

    newSocket.on('user_speaking_change', ({ userId, isSpeaking }: { userId: string; isSpeaking: boolean }) => {
      setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, isSpeaking } : u));
      setDirectCall(prev =>
        prev && prev.partner.id === userId
          ? { ...prev, partner: { ...prev.partner, isSpeaking } }
          : prev
      );
    });

    newSocket.on('afk_moved', ({ channelId, channelName }: { channelId: string; channelName: string }) => {
      setConnectedVoiceChannelId(channelId);
      setIsMuted(true);
      if (currentUserRef.current?.status !== 'dnd') {
        sendDesktopNotification('AFK Taşıma', `Hareketsiz kaldığınız için "${channelName}" odasına taşındınız.`);
      }
    });

    newSocket.on('screen_share_quality_request', async ({ fromUserId, quality }: { fromUserId: string; quality: ViewerStreamQuality }) => {
      const pc = peerConnectionsRef.current.get(fromUserId);
      const localScreenTrack = screenStreamRef.current?.getVideoTracks()[0];
      if (!pc || !localScreenTrack) return;

      const sender = pc.getSenders().find((s) => s.track === localScreenTrack);
      if (!sender) return;

      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        const sourceHeight = localScreenTrack.getSettings?.().height || 1080;
        const targetHeightMap: Record<string, number> = {
          '360': 360,
          '480': 480,
          '720': 720,
          '1080': 1080,
        };
        const bitrateMap: Record<string, number> = {
          '360': 1_200_000,
          '480': 2_200_000,
          '720': 4_500_000,
          '1080': 8_000_000,
          'source': 15_000_000,
          'auto': 10_000_000,
        };

        if (quality === 'auto' || quality === 'source') {
          params.encodings[0].scaleResolutionDownBy = 1;
          delete params.encodings[0].maxFramerate;
        } else {
          const targetH = targetHeightMap[quality] || 1080;
          params.encodings[0].scaleResolutionDownBy = Math.max(1, sourceHeight / targetH);
          if (quality === '360') {
            params.encodings[0].maxFramerate = 24;
          } else if (quality === '480') {
            params.encodings[0].maxFramerate = 30;
          } else {
            delete params.encodings[0].maxFramerate;
          }
        }
        params.encodings[0].maxBitrate = bitrateMap[quality] ?? 10_000_000;
        await sender.setParameters(params);
      } catch {
        // Ignore if browser rejects dynamic encoding parameters
      }
    });

    newSocket.on('server_moderation_voice', ({ isServerMuted, isServerDeafened }: { isServerMuted: boolean; isServerDeafened: boolean }) => {
      if (isServerMuted) {
        setIsMuted(true);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      }
      if (isServerDeafened) {
        setIsDeafened(true);
        audioElementsRef.current.forEach(audio => { audio.muted = true; });
      }
    });

    newSocket.on('screen_share_laser', (point: ScreenShareLaserPoint) => {
      if (!point?.id) return;
      setLaserPoints((prev) => [...prev.slice(-30), point]);
      window.setTimeout(() => {
        setLaserPoints((prev) => prev.filter((p) => p.id !== point.id));
      }, 2200);
    });

    newSocket.on('screen_share_change', ({ userId, isSharing }: { userId: string; isSharing: boolean }) => {
      setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, isScreenSharing: isSharing } : u));
      if (!isSharing) {
        setRemoteScreenStreams(prev => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    newSocket.on('user_disconnected', (disconnectedId: string) => {
      setOnlineUsers(prev => prev.filter(u => u.id !== disconnectedId));
      setRemoteScreenStreams(prev => {
        if (!prev.has(disconnectedId)) return prev;
        const next = new Map(prev);
        next.delete(disconnectedId);
        return next;
      });
      setRemoteCameraStreams(prev => {
        if (!prev.has(disconnectedId)) return prev;
        const next = new Map(prev);
        next.delete(disconnectedId);
        return next;
      });
      if (screenAudioElementsRef.current.has(disconnectedId)) {
        screenAudioElementsRef.current.get(disconnectedId)?.remove();
        screenAudioElementsRef.current.delete(disconnectedId);
      }
      if (peerConnectionsRef.current.has(disconnectedId)) {
        peerConnectionsRef.current.get(disconnectedId)?.close();
        peerConnectionsRef.current.delete(disconnectedId);
      }
      if (audioElementsRef.current.has(disconnectedId)) {
        audioElementsRef.current.get(disconnectedId)?.remove();
        audioElementsRef.current.delete(disconnectedId);
      }
    });

    // Admin Events
    newSocket.on('admin_data_response', (data) => {
      setAdminData(data);
      if (data.storeSettings) {
        setStoreSettings(data.storeSettings);
      }
    });

    newSocket.on('store_settings_response', (settings: StoreSettings) => {
      setStoreSettings(settings);
    });

    newSocket.on('store_settings_updated', (settings: StoreSettings) => {
      setStoreSettings(settings);
      setAdminData(prev => prev ? { ...prev, storeSettings: settings } : null);
    });

    newSocket.on('dedicated_server_terminated', (data: { title: string; reason: string }) => {
      appToast(`⚠️ ${data.title || 'Sunucu Lisansı İptal Edildi'} — ${data.reason}`, 'error');
      resetToMainServer();
    });

    newSocket.on('admin_dedicated_updated', (updatedServer: DedicatedServerInfo) => {
      setAdminData(prev => {
        if (!prev) return null;
        const currentList = prev.dedicatedServers || [];
        const exists = currentList.some(s => s.id === updatedServer.id);
        const nextList = exists
          ? currentList.map(s => s.id === updatedServer.id ? updatedServer : s)
          : [...currentList, updatedServer];
        return { ...prev, dedicatedServers: nextList };
      });
    });

    newSocket.on('admin_dedicated_list', (servers: DedicatedServerInfo[]) => {
      setAdminData(prev => prev ? { ...prev, dedicatedServers: servers } : null);
    });

    newSocket.on('admin_license_generated', (data: IssuedLicense) => {
      setGeneratedLicense(data);
    });

    newSocket.on('admin_licenses_list', (licenses: IssuedLicense[]) => {
      setAdminData(prev => prev ? { ...prev, issuedLicenses: licenses } : null);
    });

    newSocket.on('my_licenses_response', (licenses: IssuedLicense[]) => {
      setMyLicenses(licenses);
    });

    newSocket.on('admin_new_log', (log: AuditLog) => {
      setAdminData(prev => prev ? { ...prev, auditLogs: [log, ...prev.auditLogs] } : null);
    });

    newSocket.on('admin_action_success', (msg: string) => {
      setAdminFeedback({ type: 'success', message: msg });
      newSocket.emit('admin_request_data');
      setTimeout(() => setAdminFeedback(null), 4000);
    });

    newSocket.on('admin_action_error', (msg: string) => {
      setAdminFeedback({ type: 'error', message: msg });
      setTimeout(() => setAdminFeedback(null), 5000);
    });

    newSocket.on('system_announcement', (announcement) => {
      setSystemAnnouncement(announcement);
    });

    newSocket.on('pinned_banner_updated', (banner) => {
      setPinnedBanner(banner || null);
    });

    newSocket.on('channel_messages_purged', ({ channelId, remainingMessages }: { channelId: string; remainingMessages: Message[] }) => {
      setMessagesMap((prev: Record<string, Message[]>) => ({
        ...prev,
        [channelId]: remainingMessages || [],
      }));
    });

    newSocket.on('system_maintenance_status', (status: { active: boolean; message: string }) => {
      setMaintenanceStatus(status || { active: false, message: '' });
    });

    newSocket.on('admin_full_backup_response', (bundle: any) => {
      try {
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cakma-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    });

    newSocket.on('kicked_by_admin', ({ reason }) => {
      appToast(`Sunucudan atıldınız! Sebep: ${reason}`, 'error');
      localStorage.removeItem('dc_clone_auth');
      setIsAuthenticated(false);
      window.location.reload();
    });

    newSocket.on('moved_to_voice_channel', ({ channelId }: { channelId: string; channelName?: string; movedBy?: string; isSelf?: boolean }) => {
      cleanupWebRTC();
      setVoicePasswordError(null);
      setConnectedVoiceChannelId(channelId);
      if (tsSoundEffectsRef.current) {
        playTeamSpeakChime('join');
      }
    });

    newSocket.on('voice_pull_invite', (invite: {
      requestId: string;
      fromUserId: string;
      fromUsername: string;
      fromAvatar?: string;
      targetChannelId: string;
      channelName: string;
      serverName: string;
    }) => {
      setVoicePullInvite(invite);
      if (currentUserRef.current?.status !== 'dnd') {
        playSynthesizedSound('notification');
        sendDesktopNotification(
          'Ses Odasına Davet',
          `${invite.fromUsername} sizi #${invite.channelName} ses odasına çekmek istiyor.`
        );
      }
    });

    newSocket.on('voice_pull_status', (statusPayload: { status: 'sent' | 'accepted' | 'rejected'; message: string }) => {
      setVoicePullNotice(statusPayload);
      if (statusPayload.status === 'rejected' && currentUserRef.current?.status !== 'dnd') {
        playSynthesizedSound('notification');
      }
      window.setTimeout(() => {
        setVoicePullNotice((prev) => (prev?.message === statusPayload.message ? null : prev));
      }, 5000);
    });

    // WebRTC Signaling Events
    newSocket.on('voice_room_users', async ({ peers }: { peers: User[] }) => {
      const localStream = await getLocalAudioStream();
      if (!localStream) return;

      for (const peer of peers) {
        const pc = createPeerConnection(peer.id, localStream, newSocket);
        peerConnectionsRef.current.set(peer.id, pc);

        // If peer is already sharing screen (and we aren't sending our own video track),
        // add a recvonly video transceiver so the initial offer includes m=video.
        if (peer.isScreenSharing && !screenStreamRef.current) {
          try {
            pc.addTransceiver('video', { direction: 'recvonly' });
          } catch {}
        }

        const offer = await pc.createOffer();
        const targetKbps = activeChannelRef.current?.bitrateKbps || activeServerRef.current?.bitrateKbps || 128;
        const modifiedOffer = new RTCSessionDescription({
          type: offer.type,
          sdp: setOpusBitrateInSdp(offer.sdp || '', targetKbps)
        });
        await pc.setLocalDescription(modifiedOffer);
        applyAudioBitrate(pc, targetKbps);
        newSocket.emit('webrtc_signal', {
          targetUserId: peer.id,
          signal: modifiedOffer,
          type: 'offer'
        });
      }
    });

    newSocket.on('user_joined_voice', async ({ user }: { user: User }) => {
      if (tsSoundEffectsRef.current) {
        playTeamSpeakChime('join');
      }
      const localStream = await getLocalAudioStream();
      if (!localStream) return;
      const pc = createPeerConnection(user.id, localStream, newSocket);
      peerConnectionsRef.current.set(user.id, pc);
    });

    newSocket.on('user_left_voice', ({ userId }: { userId: string }) => {
      if (tsSoundEffectsRef.current) {
        playTeamSpeakChime('leave');
      }
      if (peerConnectionsRef.current.has(userId)) {
        peerConnectionsRef.current.get(userId)?.close();
        peerConnectionsRef.current.delete(userId);
      }
      if (audioElementsRef.current.has(userId)) {
        audioElementsRef.current.get(userId)?.remove();
        audioElementsRef.current.delete(userId);
      }
      setRemoteScreenStreams(prev => {
        if (!prev.has(userId)) return prev;
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    newSocket.on('webrtc_signal', async ({ senderUserId, signal, type }: any) => {
      let pc = peerConnectionsRef.current.get(senderUserId);

      if (type === 'offer') {
        const localStream = await getLocalAudioStream();
        if (!localStream) return;

        if (!pc) {
          pc = createPeerConnection(senderUserId, localStream, newSocket);
          peerConnectionsRef.current.set(senderUserId, pc);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const queued = pendingIceCandidatesRef.current.get(senderUserId) || [];
        pendingIceCandidatesRef.current.delete(senderUserId);
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Queued ICE candidate error:', e);
          }
        }
        const answer = await pc.createAnswer();
        const targetKbps = activeChannelRef.current?.bitrateKbps || activeServerRef.current?.bitrateKbps || 128;
        const modifiedAnswer = new RTCSessionDescription({
          type: answer.type,
          sdp: setOpusBitrateInSdp(answer.sdp || '', targetKbps)
        });
        await pc.setLocalDescription(modifiedAnswer);
        applyAudioBitrate(pc, targetKbps);

        newSocket.emit('webrtc_signal', {
          targetUserId: senderUserId,
          signal: modifiedAnswer,
          type: 'answer'
        });

        // If we are already sharing our screen and the incoming offer did not negotiate
        // our video track (e.g. peer joined after we started sharing), send a renegotiation offer.
        if (screenStreamRef.current) {
          const hasNegotiatedVideo = pc.getTransceivers().some(
            (t) =>
              t.sender.track?.kind === 'video' &&
              (t.currentDirection === 'sendonly' || t.currentDirection === 'sendrecv')
          );
          if (!hasNegotiatedVideo) {
            try {
              const reOffer = await pc.createOffer();
              await pc.setLocalDescription(reOffer);
              newSocket.emit('webrtc_signal', {
                targetUserId: senderUserId,
                signal: reOffer,
                type: 'offer',
              });
            } catch {}
          }
        }
      } else if (type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const queued = pendingIceCandidatesRef.current.get(senderUserId) || [];
          pendingIceCandidatesRef.current.delete(senderUserId);
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('Queued ICE candidate error:', e);
            }
          }
        }
      } else if (type === 'candidate') {
        if (signal) {
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal));
            } catch (e) {
              console.warn('ICE candidate addition error:', e);
            }
          } else {
            const existing = pendingIceCandidatesRef.current.get(senderUserId) || [];
            existing.push(signal);
            pendingIceCandidatesRef.current.set(senderUserId, existing);
          }
        }
      }
    });

    newSocket.on('ice_servers', (servers: RTCIceServer[]) => {
      if (Array.isArray(servers) && servers.length > 0) {
        iceServersRef.current = servers;
      }
    });

    // Direct 1-on-1 Voice Calling Listeners (single deduplicated registration)
    newSocket.on('direct_call_incoming', ({ callerUser }: { callerUser: User }) => {
      setDirectCall({
        partner: callerUser,
        status: 'incoming',
        isMuted: false,
        isDeafened: false,
        durationSeconds: 0
      });
      if (currentUserRef.current?.status !== 'dnd') {
        sendDesktopNotification('Gelen 1-e-1 Arama', `${callerUser.username} seni arıyor...`);
      }
      if (isTauriDesktopEnv()) {
        getTauriInvoke()
          .then((invoke) => invoke('request_window_attention'))
          .catch(() => {});
      }
    });

    newSocket.on('direct_call_accepted', async ({ targetUser }: { targetUser: User }) => {
      setDirectCall(prev => prev ? { ...prev, status: 'connected', partner: targetUser } : {
        partner: targetUser,
        status: 'connected',
        isMuted: false,
        isDeafened: false,
        durationSeconds: 0
      });

      const localStream = await getLocalAudioStream();
      if (localStream) {
        const pc = createPeerConnection(targetUser.id, localStream, newSocket);
        peerConnectionsRef.current.set(targetUser.id, pc);
        setupDirectDataChannelsOnPeer(targetUser.id, pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        newSocket.emit('webrtc_signal', {
          targetUserId: targetUser.id,
          signal: offer,
          type: 'offer'
        });
      }
    });

    newSocket.on('direct_call_declined', ({ reason }: { reason?: string }) => {
      pushDirectCallToast(reason || 'Arama reddedildi.', 'warning');
      const partnerId = directCallRef.current?.partner.id;
      setDirectCall(null);
      cleanupDirectCallMedia(partnerId);
    });

    newSocket.on('direct_call_handled', () => {
      const partnerId = directCallRef.current?.partner.id;
      setDirectCall(null);
      cleanupDirectCallMedia(partnerId);
    });

    newSocket.on('direct_call_ended', () => {
      if (directCallRef.current) {
        const partnerId = directCallRef.current.partner.id;
        if (peerConnectionsRef.current.has(partnerId)) {
          peerConnectionsRef.current.get(partnerId)?.close();
          peerConnectionsRef.current.delete(partnerId);
        }
        if (audioElementsRef.current.has(partnerId)) {
          audioElementsRef.current.get(partnerId)?.remove();
          audioElementsRef.current.delete(partnerId);
        }
        setDirectCall(null);
        cleanupDirectCallMedia(partnerId);
      } else {
        setDirectCall(null);
        cleanupDirectCallMedia();
      }
    });

    newSocket.on('direct_screen_share_state', ({ userId, isSharing }: { userId: string; isSharing: boolean }) => {
      setPartnerDirectScreenSharing(Boolean(isSharing));
      if (!isSharing) {
        setRemoteScreenStreams(prev => {
          if (!prev.has(userId)) return prev;
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        setRemoteAssist(prev =>
          prev.status === 'controlling' || prev.status === 'requesting'
            ? DEFAULT_REMOTE_ASSIST_STATE
            : prev
        );
      }
    });

    newSocket.on('direct_camera_state', ({ userId, isCameraOn }: { userId: string; isCameraOn: boolean }) => {
      setPartnerDirectCameraOn(Boolean(isCameraOn));
      if (!isCameraOn) {
        setRemoteCameraStreams(prev => {
          if (!prev.has(userId)) return prev;
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    newSocket.on('direct_media_meta', ({ userId, trackId, kind, active }: { userId: string; trackId: string; kind: 'screen' | 'camera'; active: boolean }) => {
      if (active) {
        directMediaTrackKindsRef.current.set(trackId, kind);
        const rec = receivedRemoteVideoTracksRef.current.get(trackId);
        if (rec) {
          if (kind === 'camera') {
            setRemoteCameraStreams(prev => {
              const next = new Map(prev);
              next.set(rec.peerId, new MediaStream([rec.track]));
              return next;
            });
            setRemoteScreenStreams(prev => {
              if (!prev.has(rec.peerId)) return prev;
              const current = prev.get(rec.peerId);
              if (current?.getVideoTracks().some(t => t.id === trackId)) {
                const next = new Map(prev);
                next.delete(rec.peerId);
                return next;
              }
              return prev;
            });
          } else {
            setRemoteScreenStreams(prev => {
              const next = new Map(prev);
              next.set(rec.peerId, rec.stream);
              return next;
            });
            setRemoteCameraStreams(prev => {
              if (!prev.has(rec.peerId)) return prev;
              const current = prev.get(rec.peerId);
              if (current?.getVideoTracks().some(t => t.id === trackId)) {
                const next = new Map(prev);
                next.delete(rec.peerId);
                return next;
              }
              return prev;
            });
          }
        }
      } else {
        directMediaTrackKindsRef.current.delete(trackId);
        receivedRemoteVideoTracksRef.current.delete(trackId);
        if (kind === 'camera') {
          setRemoteCameraStreams(prev => {
            if (!prev.has(userId)) return prev;
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
        } else {
          setRemoteScreenStreams(prev => {
            if (!prev.has(userId)) return prev;
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
        }
      }
    });

    newSocket.on('remote_assist_clipboard', async ({ fromUsername, text }: { fromUsername: string; text: string }) => {
      try {
        await navigator.clipboard.writeText(text);
        setLastClipboardNotice(`${fromUsername} panosu kopyalandı`);
        pushDirectCallToast(`${fromUsername} panosu yerel panonuza kopyalandı.`, 'success');
        setTimeout(() => setLastClipboardNotice(null), 3500);
      } catch {
        pushDirectCallToast(`${fromUsername} pano metni gönderdi ancak tarayıcı pano erişimi kapalı.`, 'warning');
      }
    });

    newSocket.on('remote_assist_clipboard_pull_request', async ({ fromUsername }: { fromUsername: string }) => {
      if (
        remoteAssistRef.current.status === 'being_controlled' &&
        !remoteAssistRef.current.permissions.clipboard
      ) {
        return;
      }
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          newSocket.emit('remote_assist_clipboard', { text });
          setLastClipboardNotice(`Pano ${fromUsername} ile paylaşıldı`);
          setTimeout(() => setLastClipboardNotice(null), 3000);
        }
      } catch {}
    });

    newSocket.on('remote_assist_laser', (payload: { x: number; y: number; active: boolean }) => {
      if (
        remoteAssistRef.current.status === 'being_controlled' &&
        !remoteAssistRef.current.permissions.annotate
      ) {
        return;
      }
      setRemoteLaser(payload.active ? payload : null);
      void forwardOverlayEventToTauri({ type: 'laser', ...payload });
    });

    newSocket.on('remote_assist_annotation', (payload: { action: 'stroke' | 'clear'; stroke?: RemoteAssistAnnotationStroke }) => {
      if (
        remoteAssistRef.current.status === 'being_controlled' &&
        !remoteAssistRef.current.permissions.annotate
      ) {
        return;
      }
      if (payload.action === 'clear') {
        setRemoteAnnotations([]);
        void forwardOverlayEventToTauri({ type: 'clear' });
      } else if (payload.action === 'stroke' && payload.stroke) {
        const stamped: RemoteAssistAnnotationStroke = { ...payload.stroke, createdAt: Date.now() };
        setRemoteAnnotations(prev => [...prev.slice(-49), stamped]);
        void forwardOverlayEventToTauri({ type: 'stroke', stroke: stamped });
      }
    });

    newSocket.on('remote_assist_incoming_request', ({ fromUsername, permissions }: { fromUsername: string; permissions?: RemoteAssistPermissions }) => {
      setRemoteAssist(prev => ({
        ...prev,
        status: 'incoming_request',
        requesterName: fromUsername,
        requestedPermissions: permissions || { control: true, clipboard: true, annotate: true },
      }));
    });

    newSocket.on('remote_assist_response', ({ accepted, hostDesktopCapable, permissions, monitors }: {
      accepted: boolean;
      hostDesktopCapable: boolean;
      permissions?: RemoteAssistPermissions;
      monitors?: RemoteMonitorInfo[];
    }) => {
      if (accepted) {
        const safeMonitors = Array.isArray(monitors) ? monitors : [];
        const primary = safeMonitors.find(m => m.is_primary) || safeMonitors[0];
        setRemoteAssist(prev => ({
          ...prev,
          status: 'controlling',
          hostDesktopCapable: Boolean(hostDesktopCapable),
          remoteCursor: null,
          permissions: permissions || { control: true, clipboard: true, annotate: true },
          paused: false,
          hostMonitors: safeMonitors,
          selectedMonitorIndex: primary ? primary.index : null,
        }));
      } else {
        setRemoteAssist(DEFAULT_REMOTE_ASSIST_STATE);
        pushDirectCallToast('Karşı taraf uzaktan kontrol isteğini reddetti.', 'warning');
      }
    });

    newSocket.on('remote_assist_pause_state', ({ paused, byUsername }: { paused: boolean; byUsername: string }) => {
      setRemoteAssist(prev => ({ ...prev, paused: Boolean(paused) }));
      pushDirectCallToast(
        paused
          ? `Uzaktan kontrol ${byUsername} tarafından duraklatıldı.`
          : `Uzaktan kontrol ${byUsername} tarafından devam ettirildi.`,
        'info'
      );
      if (remoteAssistRef.current.status === 'being_controlled') {
        const cur = remoteAssistRef.current;
        const mon =
          cur.hostMonitors.find(m => m.index === cur.selectedMonitorIndex) ||
          cur.hostMonitors.find(m => m.is_primary) ||
          cur.hostMonitors[0] ||
          null;
        void syncTauriRemoteAssistHost({
          active: true,
          controllerName: cur.requesterName || directCallRef.current?.partner.username,
          paused: Boolean(paused),
          monitor: mon,
        });
      }
    });

    newSocket.on('remote_assist_permissions_updated', ({ permissions }: { permissions: RemoteAssistPermissions }) => {
      setRemoteAssist(prev => ({ ...prev, permissions }));
      pushDirectCallToast('Host uzaktan kontrol izinlerini güncelledi.', 'info');
    });

    newSocket.on('remote_assist_monitor_selected', ({ monitorIndex }: { monitorIndex: number | null }) => {
      setRemoteAssist(prev => {
        const nextMon =
          prev.hostMonitors.find(m => m.index === monitorIndex) ||
          prev.hostMonitors.find(m => m.is_primary) ||
          prev.hostMonitors[0] ||
          null;
        if (prev.status === 'being_controlled') {
          void syncTauriRemoteAssistHost({
            active: true,
            controllerName: prev.requesterName || directCallRef.current?.partner.username,
            paused: prev.paused,
            monitor: nextMon,
          });
        }
        return { ...prev, selectedMonitorIndex: monitorIndex };
      });
    });

    newSocket.on('remote_assist_stopped', ({ stoppedBy }: { stoppedBy?: string } = {}) => {
      setRemoteAssist(DEFAULT_REMOTE_ASSIST_STATE);
      void syncTauriRemoteAssistHost({ active: false });
      if (stoppedBy) {
        pushDirectCallToast(`Uzaktan yardım sonlandırıldı (${stoppedBy}).`, 'info');
      }
    });

    newSocket.on('remote_assist_input', (payload: {
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
      void dispatchIncomingRemoteInput(payload);
    });

    newSocket.on('profile_updated', (updatedUser: User) => {
      setCurrentUser(updatedUser);
    });

    // Friends System Listeners
    newSocket.on('friends_data', (data: { friends: FriendUser[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[] }) => {
      setFriends(data.friends || []);
      setIncomingFriendRequests(data.incomingRequests || []);
      setOutgoingFriendRequests(data.outgoingRequests || []);
    });

    newSocket.on('friend_request_received', (req: FriendRequest) => {
      setIncomingFriendRequests(prev => [req, ...prev.filter(r => r.id !== req.id)]);
    });

    newSocket.on('friend_request_accepted', () => {
      newSocket.emit('get_friends_data');
    });

    // 1. Watch Together
    newSocket.on('watch_together_update', (state: WatchTogetherState) => {
      setWatchTogetherState(state);
    });
    newSocket.on('watch_together_sync', ({ isPlaying, currentTime }: any) => {
      setWatchTogetherState(prev => prev ? { ...prev, isPlaying, currentTime } : null);
    });
    newSocket.on('watch_together_ended', () => {
      setWatchTogetherState(null);
    });

    // 2. Mini Games
    newSocket.on('minigame_update', (state: MiniGameState) => {
      setMiniGameState(state);
    });
    newSocket.on('minigame_ended', () => {
      setMiniGameState(null);
    });

    // 3. TeamSpeak Whisper
    newSocket.on('whisper_receive', ({ senderUsername, active }: { senderUsername: string; active: boolean }) => {
      if (active) {
        setActiveWhisperFrom(senderUsername);
        if (tsSoundEffectsRef.current) {
          playTeamSpeakChime('whisper');
        }
      } else {
        setActiveWhisperFrom(null);
      }
    });

    // 4. Server Leaderboard
    newSocket.on('server_leaderboard_data', ({ serverId, list }: { serverId: string; list: MemberLevelData[] }) => {
      setLeaderboardData(prev => ({ ...prev, [serverId]: list }));
    });

    // 5. Member Level Up
    newSocket.on('member_level_up', ({ username, level }: { username: string; level: number }) => {
      if (currentUserRef.current?.username === username) {
        if (currentUserRef.current?.status !== 'dnd') {
          if (tsSoundEffectsRef.current) {
            playTeamSpeakChime('levelup');
          }
          sendDesktopNotification('Tebrikler! 🎉', `Seviye ${level}'e yükseldiniz!`);
        }
      }
    });

    // 6. Server Analytics Data
    newSocket.on('server_analytics_data', ({ data }: { serverId: string; data: ServerAnalyticsData }) => {
      setServerAnalyticsData(data);
    });

    // 7. Voice Password Error
    newSocket.on('voice_password_error', ({ message }: { channelId: string; channelName: string; message: string }) => {
      lastVoiceChannelIdRef.current = null;
      setVoicePasswordError(message);
      setConnectedVoiceChannelId(null);
      cleanupWebRTC();
    });

    const handleNetworkOnline = () => {
      if (!newSocket.connected) {
        newSocket.connect();
      }
    };
    window.addEventListener('online', handleNetworkOnline);

    return () => {
      window.removeEventListener('online', handleNetworkOnline);
      cleanupWebRTC();
      newSocket.disconnect();
    };
  }, [cleanupWebRTC]);

  const createPeerConnection = (peerId: string, localStream: MediaStream, activeSocket: Socket): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, screenStreamRef.current!));
    }

    let iceDisconnectTimer: number | null = null;
    pc.oniceconnectionstatechange = () => {
      if (iceDisconnectTimer !== null) {
        window.clearTimeout(iceDisconnectTimer);
        iceDisconnectTimer = null;
      }
      const state = pc.iceConnectionState;
      const attemptIceRestart = async () => {
        if (pc.signalingState === 'closed') return;
        try {
          if (typeof pc.restartIce === 'function') pc.restartIce();
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          activeSocket.emit('webrtc_signal', {
            targetUserId: peerId,
            signal: offer,
            type: 'offer',
          });
        } catch {}
      };
      if (state === 'failed') {
        void attemptIceRestart();
      } else if (state === 'disconnected') {
        iceDisconnectTimer = window.setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            void attemptIceRestart();
          }
        }, 2000);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        activeSocket.emit('webrtc_signal', {
          targetUserId: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    pc.ondatachannel = (event) => {
      attachIncomingDataChannelHandlers(peerId, event.channel);
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      if (event.track.kind === 'video') {
        receivedRemoteVideoTracksRef.current.set(event.track.id, {
          peerId,
          track: event.track,
          stream: remoteStream,
        });
        const trackKindHint = directMediaTrackKindsRef.current.get(event.track.id);
        const isDirectPeer = directCallRef.current?.partner.id === peerId;
        const treatAsCamera =
          trackKindHint === 'camera' ||
          (trackKindHint !== 'screen' &&
            isDirectPeer &&
            partnerDirectCameraOnRef.current &&
            !partnerDirectScreenSharingRef.current);

        if (treatAsCamera) {
          setRemoteCameraStreams(prev => {
            const next = new Map(prev);
            next.set(peerId, new MediaStream([event.track]));
            return next;
          });
          event.track.onended = () => {
            receivedRemoteVideoTracksRef.current.delete(event.track.id);
            setRemoteCameraStreams(prev => {
              if (!prev.has(peerId)) return prev;
              const next = new Map(prev);
              next.delete(peerId);
              return next;
            });
          };
        } else {
          setRemoteScreenStreams(prev => {
            const next = new Map(prev);
            next.set(peerId, remoteStream);
            return next;
          });
          event.track.onended = () => {
            receivedRemoteVideoTracksRef.current.delete(event.track.id);
            setRemoteScreenStreams(prev => {
              if (!prev.has(peerId)) return prev;
              const next = new Map(prev);
              next.delete(peerId);
              return next;
            });
          };
        }
      } else {
        const existingPrimary = audioElementsRef.current.get(peerId);
        const existingStreamId = existingPrimary?.dataset.streamId;
        const isSecondaryDirectAudio =
          Boolean(existingPrimary && existingStreamId && existingStreamId !== remoteStream.id) ||
          (Boolean(existingPrimary) && remoteStream.getVideoTracks().length > 0);

        if (isSecondaryDirectAudio) {
          let scrAudio = screenAudioElementsRef.current.get(peerId);
          if (!scrAudio) {
            scrAudio = new Audio();
            scrAudio.autoplay = true;
            screenAudioElementsRef.current.set(peerId, scrAudio);
          }
          scrAudio.srcObject = remoteStream;
          scrAudio.muted = isDeafened;
          scrAudio.volume = Math.min(1, Math.max(0, outputVolume / 100));
          if ('setSinkId' in scrAudio && selectedOutputDeviceId) {
            (scrAudio as any).setSinkId(selectedOutputDeviceId).catch(() => {});
          }
          scrAudio.play().catch(() => {});
          return;
        }

        if (event.receiver && 'playoutDelayHint' in event.receiver) {
          try {
            (event.receiver as any).playoutDelayHint = lowLatencyAudio ? 0.02 : 0.08;
          } catch {}
        }
        let audio = existingPrimary;
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(peerId, audio);
        }
        audio.dataset.streamId = remoteStream.id;
        audio.srcObject = remoteStream;
        const userVol = userVolumes[peerId] ?? 100;
        const isLocallyMuted = userLocalMutes[peerId] ?? false;
        audio.muted = isDeafened || isLocallyMuted;
        audio.volume = Math.min(1, Math.max(0, (outputVolume / 100) * (userVol / 100)));
        if ('setSinkId' in audio && selectedOutputDeviceId) {
          (audio as any).setSinkId(selectedOutputDeviceId).catch(() => {});
        }
        audio.play().catch((err) => {
          console.warn('Remote audio playback blocked:', err);
        });
        const eq = userAudioEqRef.current[peerId];
        if (eq && (eq.bass !== 0 || eq.treble !== 0 || eq.normalize)) {
          applyRemoteAudioEq(peerId, eq);
        }
      }
    };

    return pc;
  };

  const isPttActiveRef = useRef(isPttActive);
  isPttActiveRef.current = isPttActive;

  // Push-to-Talk Keybind listener (Window + Tauri Windows Global Hook)
  useEffect(() => {
    const inAnyVoice = Boolean(connectedVoiceChannelId || directCall?.status === 'connected');
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');

    const applyPttState = (pressed: boolean) => {
      if (pressed === isPttActiveRef.current) return;
      isPttActiveRef.current = pressed;
      setIsPttActive(pressed);
      if (pttBeepRef.current && tsSoundEffectsRef.current) {
        playTeamSpeakChime(pressed ? 'ptt_on' : 'ptt_off');
      }
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = pressed ? !isMuted : false;
        });
      }
      socket?.emit('user_speaking', { isSpeaking: pressed });
      setIsSpeaking(pressed);
    };

    if (isTauri) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) =>
          invoke('set_global_ptt', {
            enabled: inputMode === 'ptt' && inAnyVoice,
            key: pttKey,
          })
        )
        .catch(() => {});
    }

    if (inputMode !== 'ptt' || !inAnyVoice) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === pttKey) applyPttState(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === pttKey) applyPttState(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let unlistenGlobalPtt: (() => void) | null = null;
    if (isTauri) {
      import('@tauri-apps/api/event')
        .then(({ listen }) =>
          listen<boolean>('global-ptt-state', (ev) => {
            applyPttState(Boolean(ev.payload));
          })
        )
        .then((fn) => {
          unlistenGlobalPtt = fn;
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (unlistenGlobalPtt) unlistenGlobalPtt();
      if (isTauri) {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke('set_global_ptt', { enabled: false, key: pttKey }))
          .catch(() => {});
      }
    };
  }, [inputMode, pttKey, connectedVoiceChannelId, directCall?.status, isMuted, socket]);

  // Auth Methods
  const login = (usernameOrEmail: string, password: string): Promise<{ success: boolean; requires2fa?: boolean; pending2faToken?: string; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'Sunucu yanıt vermedi (Zaman aşımı). Lütfen sunucunun açık olduğundan emin olun.' });
        }
      }, 5000);

      socket.emit('auth_login', { usernameOrEmail, password });
      socket.once('auth_response', (res: { success: boolean; user?: User; token?: string; mediaToken?: string; requires2fa?: boolean; pending2faToken?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({
            token: res.token,
            mediaToken: res.mediaToken,
            username: res.user.username,
            avatar: res.user.avatar,
          }));
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          resolve({ success: true });
        } else if (res.requires2fa && res.pending2faToken) {
          resolve({ success: false, requires2fa: true, pending2faToken: res.pending2faToken });
        } else {
          resolve({ success: false, error: res.error || 'Giriş başarısız oldu.' });
        }
      });
    });
  };

  const verify2faLogin = (pending2faToken: string, code: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'Sunucu yanıt vermedi (Zaman aşımı).' });
        }
      }, 5000);

      socket.emit('auth_2fa_verify', { pending2faToken, code });
      socket.once('auth_response', (res: { success: boolean; user?: User; token?: string; mediaToken?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({
            token: res.token,
            mediaToken: res.mediaToken,
            username: res.user.username,
            avatar: res.user.avatar,
          }));
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          resolve({ success: true });
        } else {
          resolve({ success: false, error: res.error || '2FA doğrulama başarısız oldu.' });
        }
      });
    });
  };

  const requestRegisterChallenge = useCallback((): Promise<{
    token: string;
    question: string;
    inviteOnly: boolean;
    requireStrongPasswords: boolean;
    requireEmailVerification: boolean;
  } | null> => {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) return resolve(null);
      let done = false;
      const onChallenge = (payload: {
        token: string;
        question: string;
        inviteOnly: boolean;
        requireStrongPasswords: boolean;
        requireEmailVerification: boolean;
      }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(payload);
      };
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          socket.off('register_challenge', onChallenge);
          resolve(null);
        }
      }, 5000);
      socket.once('register_challenge', onChallenge);
      socket.emit('get_register_challenge');
    });
  }, [socket]);

  const sendRegisterEmailCode = useCallback((email: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) {
        return resolve({ success: false, error: 'Sunucu bağlantısı henüz kurulmadı, lütfen birkaç saniye sonra tekrar deneyin.' });
      }
      let done = false;
      const onResult = (res: { success: boolean; message?: string; error?: string }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res);
      };
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          socket.off('register_email_code_result', onResult);
          resolve({ success: false, error: 'Doğrulama maili isteği zaman aşımına uğradı (20 sn). Lütfen tekrar deneyin.' });
        }
      }, 20000);
      socket.once('register_email_code_result', onResult);
      socket.emit('send_register_email_code', { email });
    });
  }, [socket]);

  const register = (data: {
    username: string;
    email: string;
    password: string;
    avatar: string;
    inviteCode?: string;
    emailCode?: string;
    challengeToken?: string;
    challengeAnswer?: string;
    honeypot?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'Sunucu yanıt vermedi (Zaman aşımı). Lütfen sunucunun açık olduğundan emin olun.' });
        }
      }, 5000);

      socket.emit('auth_register', data);
      socket.once('auth_response', (res: { success: boolean; user?: User; token?: string; mediaToken?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({
            token: res.token,
            mediaToken: res.mediaToken,
            username: res.user.username,
            avatar: res.user.avatar,
          }));
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          resolve({ success: true });
        } else {
          resolve({ success: false, error: res.error || 'Kayıt başarısız oldu.' });
        }
      });
    });
  };

  const logout = () => {
    localStorage.removeItem('dc_clone_auth');
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    socket?.emit('auth_logout');
    clearAllTypingUsers();
    setDirectCallQualitySnapshot(null);
    setIsAuthenticated(false);
    setCurrentUser(null);
    cleanupWebRTC();
  };

  // Admin Methods
  const fetchAdminData = async () => {
    socket?.emit('admin_request_data');

    // Also fetch dedicated server registry & master licenses directly from master server
    try {
      const saved = localStorage.getItem('dc_clone_auth');
      const token = saved ? JSON.parse(saved).token : '';
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const apiBase = currentServerHost.startsWith('http://') || currentServerHost.startsWith('https://')
        ? currentServerHost
        : `${(currentServerHost.startsWith('localhost') || currentServerHost.startsWith('127.0.0.1')) ? 'http:' : 'https:'}//${currentServerHost}`;
      const [resDed, resLic, resStore] = await Promise.all([
        fetch(`${apiBase}/api/dedicated/list`, { headers: authHeaders }).catch(() => null),
        fetch(`${apiBase}/api/master/licenses`, { headers: authHeaders }).catch(() => null),
        fetch(`${apiBase}/api/master/store-settings`).catch(() => null)
      ]);

      if (resStore && resStore.ok) {
        const storeJson = await resStore.json();
        setStoreSettings(storeJson);
      }

      let extraLicenses: IssuedLicense[] = [];
      if (resLic && resLic.ok) {
        const licJson = await resLic.json();
        if (licJson.licenses) {
          extraLicenses = licJson.licenses;
        }
      }

      if (resDed && resDed.ok) {
        const json: any = await resDed.json();
        if (json.servers) {
          setAdminData(prev => {
            if (!prev) {
              return {
                stats: {
                  uptime: 0,
                  memoryMB: 0,
                  totalRegisteredUsers: 0,
                  activeSocketsCount: 0,
                  activeVoiceRoomsCount: 0,
                  totalMessagesCount: 0,
                  totalDedicatedServersCount: json.total
                },
                registeredUsers: [],
                servers: [],
                auditLogs: [],
                dedicatedServers: json.servers,
                issuedLicenses: extraLicenses
              };
            }
            return {
              ...prev,
              dedicatedServers: json.servers,
              issuedLicenses: (prev.issuedLicenses && prev.issuedLicenses.length > 0) ? prev.issuedLicenses : extraLicenses,
              stats: {
                ...prev.stats,
                totalDedicatedServersCount: json.total
              }
            };
          });
        }
      }
    } catch {}
  };

  const adminChangeRole = (targetUsername: string, newRole: 'admin' | 'user') => {
    socket?.emit('admin_change_role', { targetUsername, newRole });
  };

  const adminKickUser = (targetSocketId: string, reason?: string) => {
    socket?.emit('admin_kick_user', { targetSocketId, reason });
  };

  const adminDeleteChannel = (serverId: string, channelId: string) => {
    socket?.emit('admin_delete_channel', { serverId, channelId });
  };

  const adminBroadcastAnnouncement = (
    message: string,
    options?: { target?: 'all' | 'admins' | 'server'; serverId?: string; pinBanner?: boolean }
  ) => {
    socket?.emit('admin_broadcast_announcement', { message, ...options });
  };

  const adminClearPinnedBanner = () => {
    socket?.emit('admin_clear_pinned_banner');
  };

  const adminCreateRegInvite = (maxUses = 1, expiresHours = 24) => {
    socket?.emit('admin_create_reg_invite', { maxUses, expiresHours });
  };

  const adminDeleteRegInvite = (code: string) => {
    socket?.emit('admin_delete_reg_invite', { code });
  };

  const adminTestSmtp = (
    toEmail?: string,
    smtpConfig?: {
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      smtpFrom?: string;
      mailRelayUrl?: string;
      mailRelaySecret?: string;
    }
  ): Promise<{ ok: boolean; message: string }> => {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) {
        return resolve({ ok: false, message: 'Sunucuya bağlı değil.' });
      }
      let done = false;
      const onResult = (res: { ok: boolean; message: string }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res);
      };
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          socket.off('admin_smtp_test_result', onResult);
          resolve({ ok: false, message: 'SMTP/Relay sunucusu yanıt vermedi (20 sn zaman aşımı). Port/SSL/Relay ayarını kontrol edin.' });
        }
      }, 20000);
      socket.once('admin_smtp_test_result', onResult);
      socket.emit('admin_test_smtp', { toEmail, smtpConfig });
    });
  };

  const generateDedicatedLicense = (data: {
    licensee: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    assignedUsername?: string;
  }) => {
    socket?.emit('admin_generate_license', data);
  };

  const adminRevokeLicense = (licenseId: string, reason?: string) => {
    socket?.emit('admin_revoke_license', { licenseId, reason });
  };

  const adminActivateLicense = (licenseId: string) => {
    socket?.emit('admin_activate_license', { licenseId });
  };

  const adminExtendLicense = (licenseId: string, addDays: number) => {
    socket?.emit('admin_extend_license', { licenseId, addDays });
  };

  const adminUpdateStoreSettings = (settings: StoreSettings) => {
    socket?.emit('admin_update_store_settings', settings);
  };

  const adminUpdateSystemConfig = (cfg: {
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
  }) => {
    socket?.emit('admin_update_system_config', cfg);
    setTimeout(() => fetchAdminData(), 200);
  };

  const adminClearConnectionLogs = () => {
    socket?.emit('admin_clear_connection_logs');
  };

  const adminUpdateWallet = (targetUsername: string, amount: number, mode: 'set' | 'add' = 'set') => {
    socket?.emit('admin_update_wallet', { targetUsername, amount, mode });
  };

  const adminBanUser = (targetUsername: string, reason?: string, durationMinutes?: number) => {
    socket?.emit('admin_ban_user', { targetUsername, reason, durationMinutes });
  };

  const adminUnbanUser = (targetUsername: string) => {
    socket?.emit('admin_unban_user', { targetUsername });
  };

  const adminResetUser2fa = (targetUsername: string) => {
    socket?.emit('admin_reset_user_2fa', { targetUsername });
  };

  const adminBanIp = (ip: string, reason?: string, durationMinutes?: number) => {
    socket?.emit('admin_ban_ip', { ip, reason, durationMinutes });
  };

  const adminUnbanIp = (ip: string) => {
    socket?.emit('admin_unban_ip', { ip });
  };

  const adminExportFullBackup = () => {
    socket?.emit('admin_export_full_backup');
  };

  const adminRestoreFullBackup = (bundle: any) => {
    socket?.emit('admin_restore_full_backup', bundle);
  };

  const adminTriggerBackupNow = () => {
    socket?.emit('admin_trigger_backup_now');
  };

  const adminRestoreScheduledBackup = (filename: string) => {
    socket?.emit('admin_restore_scheduled_backup', { filename });
  };

  const adminDeleteScheduledBackup = (filename: string) => {
    socket?.emit('admin_delete_scheduled_backup', { filename });
  };

  const adminTestWebhook = () => {
    socket?.emit('admin_test_webhook');
  };

  const adminPurgeMessages = (channelId: string, mode: 'last_n' | 'all', count?: number) => {
    socket?.emit('admin_purge_messages', { channelId, mode, count });
  };

  const adminResetUserPassword = (targetUsername: string, newPassword: string) => {
    socket?.emit('admin_reset_user_password', { targetUsername, newPassword });
  };

  const adminCreateChannel = (serverId: string, name: string, type: 'text' | 'voice') => {
    socket?.emit('admin_create_channel', { serverId, name, type });
  };

  const adminDeleteServer = (serverId: string) => {
    socket?.emit('admin_delete_server', { serverId });
  };

  const adminClearAuditLogs = () => {
    socket?.emit('admin_clear_audit_logs');
  };

  const fetchMyLicenses = async () => {
    socket?.emit('get_my_licenses');

    if (currentUser?.username) {
      try {
        const saved = localStorage.getItem('dc_clone_auth');
        const token = saved ? JSON.parse(saved).token : '';
        if (!token) return;
        const apiBase = currentServerHost.startsWith('http://') || currentServerHost.startsWith('https://')
          ? currentServerHost
          : `${(currentServerHost.startsWith('localhost') || currentServerHost.startsWith('127.0.0.1')) ? 'http:' : 'https:'}//${currentServerHost}`;
        const res = await fetch(`${apiBase}/api/master/user-licenses?username=${encodeURIComponent(currentUser.username)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.licenses && json.licenses.length > 0) {
            setMyLicenses(json.licenses);
          }
        }
      } catch {}
    }
  };

  const storePurchaseLicense = (data: {
    serverName: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }): Promise<{ success: boolean; license?: IssuedLicense; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 6000);

      socket.emit('store_purchase_license', data);
      socket.once('store_purchase_response', (res: { success: boolean; license?: IssuedLicense; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  };

  const storeExtendLicense = (data: {
    licenseId: string;
    addDays: number;
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }): Promise<{ success: boolean; license?: IssuedLicense; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 6000);

      socket.emit('store_extend_license', data);
      socket.once('store_extend_response', (res: { success: boolean; license?: IssuedLicense; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  };

  const clearGeneratedLicense = () => {
    setGeneratedLicense(null);
  };

  const connectToDedicatedServer = (hostWithPort: string) => {
    const cleanHost = hostWithPort.replace(/^https?:\/\//, '').trim();
    if (!cleanHost) return;
    localStorage.setItem('dc_dedicated_server_host', cleanHost);
    setCurrentServerHost(cleanHost);
    cleanupWebRTC();
    window.location.reload();
  };

  const resetToMainServer = () => {
    localStorage.removeItem('dc_dedicated_server_host');
    const isTauriApp = typeof window !== 'undefined' && (
      '__TAURI_INTERNALS__' in window ||
      window.location.hostname === 'tauri.localhost' ||
      window.location.protocol === 'tauri:'
    );
    const isDevVite = typeof window !== 'undefined' && window.location.port === '5173';
    const defaultHost = isTauriApp
      ? 'ses.yahyakemalokutan.com'
      : (!isDevVite && typeof window !== 'undefined' && window.location.host)
        ? window.location.host
        : 'localhost:4000';
    setCurrentServerHost(defaultHost);
    cleanupWebRTC();
    window.location.reload();
  };

  const dismissAnnouncement = () => {
    setSystemAnnouncement(null);
  };

  // Direct Messaging Handlers
  const openDirectMessage = useCallback((user: User) => {
    setActiveDMUser(user);
    setActiveServerId('direct-messages');
    setUnreadDMByUser(prev => {
      const key = user.username.toLowerCase();
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (currentUser) {
      const dmId = buildPersistentDmChannelId(currentUser.username, user.username);
      setActiveChannelId(dmId);
      setUnreadCounts(prev => {
        if (!prev[dmId]) return prev;
        const next = { ...prev };
        delete next[dmId];
        return next;
      });
    }
  }, [currentUser]);

  const closeDirectMessage = useCallback(() => {
    setActiveDMUser(null);
    if (servers[0]) {
      setActiveServerId(servers[0].id);
      const firstTextChannel = servers[0].channels.find(c => c.type === 'text');
      if (firstTextChannel) {
        setActiveChannelId(firstTextChannel.id);
      }
    }
  }, [servers]);

  const startDirectCall = useCallback(async (targetUser: User) => {
    if (!socket || !currentUser) return;
    if (connectedVoiceChannelIdRef.current) {
      leaveVoiceChannelRef.current();
    }
    setDirectCall({
      partner: targetUser,
      status: 'calling',
      isMuted: false,
      isDeafened: false,
      durationSeconds: 0
    });
    socket.emit('direct_call_start', { targetUserId: targetUser.id, targetUsername: targetUser.username });
  }, [socket, currentUser]);

  const acceptDirectCall = useCallback(async () => {
    if (!socket || !directCall || !currentUser) return;
    if (connectedVoiceChannelIdRef.current) {
      leaveVoiceChannelRef.current();
    }
    const partner = directCall.partner;
    socket.emit('direct_call_accept', { callerUserId: partner.id, callerUsername: partner.username });

    setDirectCall(prev => prev ? { ...prev, status: 'connected' } : null);

    // Pre-acquire local mic stream; caller will send the WebRTC offer upon receiving direct_call_accepted
    await getLocalAudioStream();
  }, [socket, directCall, currentUser]);

  const declineDirectCall = useCallback((replyMessage?: string) => {
    if (!socket || !directCall) return;
    const partnerId = directCall.partner.id;
    socket.emit('direct_call_decline', {
      callerUserId: partnerId,
      callerUsername: directCall.partner.username,
      replyMessage: typeof replyMessage === 'string' && replyMessage.trim() ? replyMessage.trim() : undefined,
    });
    setDirectCall(null);
    cleanupDirectCallMedia(partnerId);
  }, [socket, directCall]);

  const endDirectCall = useCallback(() => {
    if (!socket || !directCall) return;
    const partnerId = directCall.partner.id;
    socket.emit('direct_call_end', { targetUserId: partnerId, targetUsername: directCall.partner.username });
    if (peerConnectionsRef.current.has(partnerId)) {
      peerConnectionsRef.current.get(partnerId)?.close();
      peerConnectionsRef.current.delete(partnerId);
    }
    if (audioElementsRef.current.has(partnerId)) {
      audioElementsRef.current.get(partnerId)?.remove();
      audioElementsRef.current.delete(partnerId);
    }
    setDirectCall(null);
    cleanupDirectCallMedia(partnerId);
  }, [socket, directCall]);

  const stopDirectScreenShare = useCallback(() => {
    const partnerId = directCallRef.current?.partner.id;
    const pc = partnerId ? peerConnectionsRef.current.get(partnerId) : undefined;
    let removedAny = false;
    if (directScreenStreamRef.current) {
      directScreenStreamRef.current.getTracks().forEach(track => {
        if (track.kind === 'video') {
          socket?.emit('direct_media_meta', { trackId: track.id, kind: 'screen', active: false });
        }
        if (pc) {
          const sender = pc.getSenders().find(s => s.track === track);
          if (sender) {
            try {
              pc.removeTrack(sender);
              removedAny = true;
            } catch {}
          }
        }
        track.stop();
      });
      directScreenStreamRef.current = null;
    }
    if (removedAny && partnerId && pc) {
      void renegotiateDirectPeerConnection(partnerId, pc, socket);
    }
    setIsDirectScreenSharing(false);
    socket?.emit('direct_screen_share_state', { isSharing: false });
    if (remoteAssistRef.current.status === 'being_controlled') {
      setRemoteAssist(DEFAULT_REMOTE_ASSIST_STATE);
      void syncTauriRemoteAssistHost({ active: false });
      socket?.emit('remote_assist_stop');
    }
  }, [socket]);

  const startDirectScreenShare = useCallback(async (options?: Partial<DirectScreenShareOptions>) => {
    if (!socket || !directCallRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      pushDirectCallToast('Ekran paylaşımı için güvenli bağlantı (HTTPS veya masaüstü uygulaması) gereklidir.', 'error');
      return;
    }
    try {
      const cfg = getDirectScreenShareConstraints(options);
      const stream = await navigator.mediaDevices.getDisplayMedia(cfg.displayMediaOptions);
      directScreenStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const partnerId = directCallRef.current.partner.id;
      const pc = peerConnectionsRef.current.get(partnerId);

      if (videoTrack) {
        try {
          if ('contentHint' in videoTrack) {
            videoTrack.contentHint = cfg.contentHint;
          }
        } catch {}
        socket.emit('direct_media_meta', { trackId: videoTrack.id, kind: 'screen', active: true });
      }

      if (pc && videoTrack) {
        const sender = pc.addTrack(videoTrack, stream);
        try {
          const params = sender.getParameters();
          params.encodings = params.encodings && params.encodings.length > 0 ? params.encodings : [{}];
          params.encodings[0].maxBitrate = cfg.maxBitrateBps;
          await sender.setParameters(params);
        } catch {}
        if (audioTrack) {
          pc.addTrack(audioTrack, stream);
        }
        await renegotiateDirectPeerConnection(partnerId, pc, socket);
      }
      if (videoTrack) {
        videoTrack.onended = () => {
          stopDirectScreenShare();
        };
      }
      setIsDirectScreenSharing(true);
      socket.emit('direct_screen_share_state', { isSharing: true });
    } catch {
      // User cancelled screen picker
    }
  }, [socket, stopDirectScreenShare, pushDirectCallToast]);

  const requestRemoteAssist = useCallback((permissions?: RemoteAssistPermissions) => {
    if (!socket || !directCallRef.current) return;
    const requested = permissions || { control: true, clipboard: true, annotate: true };
    setRemoteAssist(prev => ({
      ...prev,
      status: 'requesting',
      requestedPermissions: requested,
    }));
    socket.emit('remote_assist_request', { permissions: requested });
  }, [socket]);

  const respondRemoteAssist = useCallback(async (accepted: boolean, permissions?: RemoteAssistPermissions) => {
    if (!socket) return;
    const isTauri = isTauriDesktopEnv();
    if (!accepted) {
      socket.emit('remote_assist_response', { accepted: false, hostDesktopCapable: isTauri });
      setRemoteAssist(DEFAULT_REMOTE_ASSIST_STATE);
      void syncTauriRemoteAssistHost({ active: false });
      return;
    }

    let monitors: RemoteMonitorInfo[] = [];
    if (isTauri) {
      try {
        const invoke = await getTauriInvoke();
        const res = await invoke('get_display_monitors');
        if (Array.isArray(res)) {
          monitors = res as RemoteMonitorInfo[];
        }
      } catch {}
    }

    const perms =
      permissions ||
      remoteAssistRef.current.requestedPermissions || { control: true, clipboard: true, annotate: true };
    const primaryMon = monitors.find(m => m.is_primary) || monitors[0] || null;
    const controllerName = remoteAssistRef.current.requesterName || directCallRef.current?.partner.username || 'Kullanıcı';

    socket.emit('remote_assist_response', {
      accepted: true,
      hostDesktopCapable: isTauri,
      permissions: perms,
      monitors,
    });

    setRemoteAssist({
      status: 'being_controlled',
      hostDesktopCapable: isTauri,
      requesterName: controllerName,
      remoteCursor: null,
      permissions: perms,
      paused: false,
      hostMonitors: monitors,
      selectedMonitorIndex: primaryMon ? primaryMon.index : null,
      inputTransport: remoteAssistRef.current.inputTransport,
    });

    await syncTauriRemoteAssistHost({
      active: true,
      controllerName,
      paused: false,
      monitor: primaryMon,
    });
  }, [socket]);

  const stopRemoteAssist = useCallback(() => {
    setRemoteAssist(DEFAULT_REMOTE_ASSIST_STATE);
    void syncTauriRemoteAssistHost({ active: false });
    socket?.emit('remote_assist_stop');
  }, [socket]);

  const pauseRemoteAssist = useCallback((paused: boolean) => {
    setRemoteAssist(prev => {
      const next = { ...prev, paused };
      if (prev.status === 'being_controlled') {
        const mon =
          prev.hostMonitors.find(m => m.index === prev.selectedMonitorIndex) ||
          prev.hostMonitors.find(m => m.is_primary) ||
          prev.hostMonitors[0] ||
          null;
        void syncTauriRemoteAssistHost({
          active: true,
          controllerName: prev.requesterName || directCallRef.current?.partner.username,
          paused,
          monitor: mon,
        });
      }
      return next;
    });
    socket?.emit('remote_assist_pause', { paused });
  }, [socket]);

  const updateRemoteAssistPermissions = useCallback((permissions: Partial<RemoteAssistPermissions>) => {
    setRemoteAssist(prev => ({
      ...prev,
      permissions: { ...prev.permissions, ...permissions },
    }));
    socket?.emit('remote_assist_update_permissions', { permissions });
  }, [socket]);

  const selectRemoteMonitor = useCallback((monitorIndex: number | null) => {
    setRemoteAssist(prev => ({ ...prev, selectedMonitorIndex: monitorIndex }));
    socket?.emit('remote_assist_select_monitor', { monitorIndex });
  }, [socket]);

  const sendRemoteInput = useCallback((payload: {
    kind: 'move' | 'mousedown' | 'mouseup' | 'wheel' | 'keydown' | 'keyup' | 'text';
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
    const partnerId = directCallRef.current?.partner.id;
    const chs = partnerId ? remoteDataChannelsRef.current.get(partnerId) : undefined;
    const dc = payload.kind === 'move' ? chs?.move || chs?.control : chs?.control;
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify({ type: 'input', payload }));
        return;
      } catch {}
    }
    socket?.emit('remote_assist_input', payload);
  }, [socket]);

  const sendRemoteClipboard = useCallback((text: string) => {
    if (!socket || !text.trim()) return;
    socket.emit('remote_assist_clipboard', { text });
  }, [socket]);

  const pullRemoteClipboard = useCallback(() => {
    if (!socket) return;
    socket.emit('remote_assist_clipboard_pull');
  }, [socket]);

  const sendRemoteLaser = useCallback((x: number, y: number, active: boolean) => {
    const partnerId = directCallRef.current?.partner.id;
    const chs = partnerId ? remoteDataChannelsRef.current.get(partnerId) : undefined;
    const dc = chs?.move || chs?.control;
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify({ type: 'laser', payload: { x, y, active } }));
        return;
      } catch {}
    }
    socket?.emit('remote_assist_laser', { x, y, active });
  }, [socket]);

  const sendRemoteAnnotation = useCallback((stroke: RemoteAssistAnnotationStroke) => {
    const stamped = { ...stroke, createdAt: Date.now() };
    setRemoteAnnotations(prev => [...prev.slice(-49), stamped]);
    const partnerId = directCallRef.current?.partner.id;
    const chs = partnerId ? remoteDataChannelsRef.current.get(partnerId) : undefined;
    if (chs?.control && chs.control.readyState === 'open') {
      try {
        chs.control.send(JSON.stringify({ type: 'annotation', payload: { action: 'stroke', stroke: stamped } }));
        return;
      } catch {}
    }
    socket?.emit('remote_assist_annotation', { action: 'stroke', stroke: stamped });
  }, [socket]);

  const clearRemoteAnnotations = useCallback(() => {
    setRemoteAnnotations([]);
    const partnerId = directCallRef.current?.partner.id;
    const chs = partnerId ? remoteDataChannelsRef.current.get(partnerId) : undefined;
    if (chs?.control && chs.control.readyState === 'open') {
      try {
        chs.control.send(JSON.stringify({ type: 'annotation', payload: { action: 'clear' } }));
        return;
      } catch {}
    }
    socket?.emit('remote_assist_annotation', { action: 'clear' });
  }, [socket]);

  const sendFileToDirectPartner = useCallback(async (file: File) => {
    const me = currentUserRef.current;
    const partner = directCallRef.current?.partner;
    if (!socket || !me || !partner) return;
    try {
      const attachment = await uploadAttachmentFile(currentServerHostRef.current, file);
      const dmChannelId = buildPersistentDmChannelId(me.username, partner.username);
      socket.emit('send_message', {
        serverId: 'direct-messages',
        channelId: dmChannelId,
        content: `📎 Uzaktan yardım dosya transferi: ${attachment.name}`,
        attachments: [attachment],
      });
      pushDirectCallToast(`"${attachment.name}" DM üzerinden gönderildi.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      pushDirectCallToast(msg || `"${file.name}" okunamadı.`, 'error');
    }
  }, [socket, pushDirectCallToast]);

  const sendScreenshotToDirectPartner = useCallback(async (dataUrl: string) => {
    const me = currentUserRef.current;
    const partner = directCallRef.current?.partner;
    if (!socket || !me || !partner || !dataUrl) return;
    try {
      const name = `uzaktan-yardim-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.png`;
      const attachment = await uploadDataUrlAttachment(currentServerHostRef.current, {
        name,
        type: 'image/png',
        dataUrl,
      });
      const dmChannelId = buildPersistentDmChannelId(me.username, partner.username);
      socket.emit('send_message', {
        serverId: 'direct-messages',
        channelId: dmChannelId,
        content: '📸 Uzaktan yardım anlık ekran görüntüsü',
        attachments: [attachment],
      });
      pushDirectCallToast('Ekran görüntüsü DM sohbetine gönderildi.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      pushDirectCallToast(msg || 'Ekran görüntüsü gönderilemedi.', 'error');
    }
  }, [socket, pushDirectCallToast]);

  const toggleDirectCamera = useCallback(async () => {
    if (!socket || !directCallRef.current) return;
    const partnerId = directCallRef.current.partner.id;
    const pc = peerConnectionsRef.current.get(partnerId);

    if (isDirectCameraOn) {
      let removedAny = false;
      if (directCameraStreamRef.current) {
        const tracks = directCameraStreamRef.current.getTracks();
        tracks.forEach(t => {
          if (t.kind === 'video') {
            socket.emit('direct_media_meta', { trackId: t.id, kind: 'camera', active: false });
          }
          if (pc) {
            const sender = pc.getSenders().find(s => s.track === t);
            if (sender) {
              try {
                pc.removeTrack(sender);
                removedAny = true;
              } catch {}
            }
          }
          t.stop();
        });
        directCameraStreamRef.current = null;
      }
      if (removedAny && pc) {
        void renegotiateDirectPeerConnection(partnerId, pc, socket);
      }
      setLocalDirectCameraStream(null);
      setIsDirectCameraOn(false);
      socket.emit('direct_camera_state', { isCameraOn: false });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      directCameraStreamRef.current = stream;
      setLocalDirectCameraStream(stream);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        socket.emit('direct_media_meta', { trackId: videoTrack.id, kind: 'camera', active: true });
      }
      if (pc && videoTrack) {
        pc.addTrack(videoTrack, stream);
        await renegotiateDirectPeerConnection(partnerId, pc, socket);
      }
      if (videoTrack) {
        videoTrack.onended = () => {
          setLocalDirectCameraStream(null);
          setIsDirectCameraOn(false);
          socket.emit('direct_media_meta', { trackId: videoTrack.id, kind: 'camera', active: false });
          socket.emit('direct_camera_state', { isCameraOn: false });
        };
      }
      setIsDirectCameraOn(true);
      socket.emit('direct_camera_state', { isCameraOn: true });
    } catch {
      pushDirectCallToast('Kamera erişimi reddedildi veya kamera bulunamadı.', 'error');
    }
  }, [socket, isDirectCameraOn, pushDirectCallToast]);

  const updateProfileDetails = useCallback((details: {
    statusMessage?: string;
    bio?: string;
    bannerColor?: string;
    bannerImage?: string;
    bannerPosition?: 'top' | 'center' | 'bottom';
    avatarFrame?: 'none' | 'gold' | 'neon' | 'emerald' | 'crimson' | 'rainbow';
    pinnedBadgeId?: string;
    socialLinks?: { steam?: string; github?: string; website?: string };
    avatar?: string;
    status?: 'online' | 'idle' | 'dnd' | 'offline';
  }) => {
    if (!socket) return;
    socket.emit('update_profile', details);
  }, [socket]);

  const transferWalletBalance = useCallback((targetUsername: string, amount: number): Promise<{ success: boolean; message?: string; error?: string; newBalance?: number }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });
      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 5000);
      socket.emit('transfer_wallet_balance', { targetUsername, amount });
      socket.once('wallet_transfer_result', (res: { success: boolean; message?: string; error?: string; newBalance?: number }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  }, [socket]);

  // Friends System Handlers
  const fetchFriendsData = useCallback(() => {
    socket?.emit('get_friends_data');
  }, [socket]);

  const sendFriendRequest = useCallback((targetUsername: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });
      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 5000);

      socket.emit('send_friend_request', { targetUsername });
      socket.once('friend_request_response', (res: { success: boolean; message?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  }, [socket]);

  const acceptFriendRequest = useCallback((requestId: string) => {
    socket?.emit('accept_friend_request', { requestId });
  }, [socket]);

  const declineFriendRequest = useCallback((requestId: string) => {
    socket?.emit('decline_friend_request', { requestId });
  }, [socket]);

  const cancelFriendRequest = useCallback((requestId: string) => {
    socket?.emit('cancel_friend_request', { requestId });
  }, [socket]);

  const removeFriend = useCallback((targetUsername: string) => {
    socket?.emit('remove_friend', { targetUsername });
  }, [socket]);

  // Action Handlers
  const selectServer = (serverId: string) => {
    if (serverId !== 'direct-messages') {
      setActiveDMUser(null);
    }
    setActiveServerId(serverId);
    const server = servers.find(s => s.id === serverId) || serversRef.current.find(s => s.id === serverId);
    if (server) {
      const firstTextCh = server.channels.find(c => c.type === 'text');
      if (firstTextCh) setActiveChannelId(firstTextCh.id);
    }
  };

  const selectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    setUnreadCounts(prev => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
    setMentionCounts(prev => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  };

  const sendMessage = (content: string, attachments?: MessageAttachment[], replyTo?: { id: string; username: string; content: string }) => {
    if (!activeServer || !activeChannel) return;
    const payload = {
      serverId: activeServer.id,
      channelId: activeChannel.id,
      content,
      attachments,
      replyTo
    };
    if (!socket || !socket.connected || !isAuthenticated) {
      if (attachments && attachments.length > 0) {
        pendingMessageQueueRef.current.push(payload);
      } else if (content.trim()) {
        enqueueOfflineMessage(activeServer.id, activeChannel.id, content, replyTo);
      }
      return;
    }
    socket.emit('send_message', payload);
  };

  const markDmRead = useCallback((partnerUsername: string) => {
    if (!socket || !socket.connected || !partnerUsername) return;
    socket.emit('mark_dm_read', { partnerUsername });
  }, [socket]);

  const requestOlderMessages = useCallback((channelId: string) => {
    if (!socket || !socket.connected || !channelId) return;
    const list = messagesMapRef.current[channelId] || [];
    const beforeId = list.length > 0 ? list[0].id : undefined;
    setIsLoadingOlderMessages(true);
    socket.emit('request_older_messages', { channelId, beforeId, limit: 50 });
  }, [socket]);

  const searchServerMessages = useCallback((query: string, channelId?: string) => {
    return new Promise<MessageSearchHit[]>((resolve) => {
      const cleanQuery = query.trim();
      if (!socket || !socket.connected || !cleanQuery) {
        resolve([]);
        return;
      }
      let settled = false;
      const done = (results: MessageSearchHit[]) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('server_search_results', handler);
        resolve(results);
      };
      const handler = (res: { query?: string; results?: MessageSearchHit[] }) => {
        if (res?.query && res.query !== cleanQuery) return;
        done(Array.isArray(res?.results) ? res.results : []);
      };
      const timer = window.setTimeout(() => done([]), 6000);
      socket.on('server_search_results', handler);
      socket.emit('search_messages_server', { query: cleanQuery, ...(channelId ? { channelId } : {}) });
    });
  }, [socket]);

  const requestMessageContext = useCallback((channelId: string, messageId: string, radius = 25) => {
    return new Promise<MessageContextResponse>((resolve) => {
      const emptyRes: MessageContextResponse = {
        channelId,
        targetMessageId: messageId,
        messages: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
        found: false,
      };
      if (!socket || !socket.connected || !channelId || !messageId) {
        resolve(emptyRes);
        return;
      }
      let settled = false;
      const done = (res: MessageContextResponse) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('message_context_response', handler);
        if (res.found && Array.isArray(res.messages) && res.messages.length > 0) {
          setMessagesMap((prev) => {
            const existing = prev[channelId] || [];
            const byId = new Map<string, Message>();
            for (const m of existing) byId.set(m.id, m);
            for (const m of res.messages as unknown as Message[]) byId.set(m.id, m);
            const merged = Array.from(byId.values()).sort((a, b) => {
              const orderTs = (m: Message) => {
                const match = /^msg-(\d+)/.exec(m.id);
                if (match) return Number(match[1]);
                const parsed = Date.parse(m.timestamp);
                return Number.isFinite(parsed) ? parsed : 0;
              };
              return orderTs(a) - orderTs(b);
            });
            return { ...prev, [channelId]: merged };
          });
          setHasMoreMessages((prev) => ({ ...prev, [channelId]: Boolean(res.hasMoreBefore) }));
        }
        resolve(res);
      };
      const handler = (res: MessageContextResponse) => {
        if (res?.channelId === channelId && res?.targetMessageId === messageId) {
          done(res);
        }
      };
      const timer = window.setTimeout(() => done(emptyRes), 6000);
      socket.on('message_context_response', handler);
      socket.emit('request_message_context', { channelId, messageId, radius });
    });
  }, [socket]);

  const jumpToMessage = useCallback(async (channelId: string, messageId: string): Promise<boolean> => {
    if (!channelId || !messageId) return false;
    const me = currentUserRef.current;

    if (channelId.startsWith('dm-')) {
      const pair = parseDmChannelParticipants(channelId);
      const partnerName = pair?.find((p) => p !== me?.username.toLowerCase()) || pair?.[0];
      if (partnerName) {
        const onlinePartner = onlineUsersRef.current.find((u) => u.username.toLowerCase() === partnerName);
        if (onlinePartner) {
          openDirectMessage(onlinePartner);
        } else {
          setActiveDMUser({
            id: partnerName,
            username: partnerName,
            role: 'user',
            avatar: '👤',
            status: 'offline',
            isMuted: false,
            isDeafened: false,
            isSpeaking: false,
          });
          setActiveServerId('direct-messages');
          setActiveChannelId(channelId);
        }
      } else {
        setActiveServerId('direct-messages');
        setActiveChannelId(channelId);
      }
    } else {
      const srv = serversRef.current.find((s) => s.channels.some((c) => c.id === channelId));
      if (srv) {
        setActiveDMUser(null);
        setActiveServerId(srv.id);
        setActiveChannelId(channelId);
      }
    }

    const loadedAlready = (messagesMapRef.current[channelId] || []).some((m) => m.id === messageId);
    if (!loadedAlready) {
      await requestMessageContext(channelId, messageId, 25);
    }
    setPendingJumpTarget({ channelId, messageId });
    return true;
  }, [openDirectMessage, requestMessageContext]);

  const toggleRaiseHand = useCallback(() => {
    if (!socket) return;
    socket.emit('toggle_raise_hand');
  }, [socket]);

  const addServerEmoji = useCallback((serverId: string, name: string, url: string) => {
    if (!socket) return;
    socket.emit('add_server_emoji', { serverId, name, url });
  }, [socket]);

  const deleteServerEmoji = useCallback((serverId: string, emojiId: string) => {
    if (!socket) return;
    socket.emit('delete_server_emoji', { serverId, emojiId });
  }, [socket]);

  const [overlayEnabled, setOverlayEnabledState] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('dc_overlay_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [detectedGame, setDetectedGame] = useState<string | null>(null);

  const setOverlayEnabled = useCallback(async (enabled: boolean) => {
    setOverlayEnabledState(enabled);
    try {
      localStorage.setItem('dc_overlay_enabled', String(enabled));
    } catch {}
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<boolean>('set_overlay_window', { enabled });
      if (enabled) {
        const corner = localStorage.getItem('dc_overlay_corner') || 'top-left';
        await invoke('position_overlay_window', { corner }).catch(() => {});
      }
    } catch (err) {
      console.warn('Overlay set failed:', err);
    }
  }, []);

  const toggleOverlayWindow = useCallback(async () => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const opened = await invoke<boolean>('toggle_overlay_window');
      setOverlayEnabledState(opened);
      try {
        localStorage.setItem('dc_overlay_enabled', String(opened));
      } catch {}
    } catch (err) {
      console.warn('Overlay toggle failed:', err);
    }
  }, []);

  const refreshDetectedGame = useCallback(async (): Promise<string | null> => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const game = await invoke<string | null>('detect_running_game');
      setDetectedGame(game || null);
      if (socket && isAuthenticated) {
        socket.emit('user_update_activity', { activity: game ? { type: 'playing', name: game } : null });
      }
      return game || null;
    } catch {
      return null;
    }
  }, [socket, isAuthenticated]);

  const playSoundboard = useCallback((soundId: string) => {
    if (!socket || !connectedVoiceChannelId) {
      playSynthesizedSound(soundId);
      return;
    }
    playSynthesizedSound(soundId);
    socket.emit('voice_soundboard_play', { channelId: connectedVoiceChannelId, soundId });
  }, [socket, connectedVoiceChannelId]);

  const syncRadioState = useCallback((state: Partial<RadioBotState>) => {
    setRadioBotState(prev => ({ ...prev, ...state }));
    if (!socket || !connectedVoiceChannelId) return;
    socket.emit('voice_radio_state', { channelId: connectedVoiceChannelId, ...state });
  }, [socket, connectedVoiceChannelId]);

  const updateUserActivity = useCallback((activity: UserActivity | null) => {
    if (!socket) return;
    socket.emit('user_update_activity', { activity });
    if (currentUser) {
      setCurrentUser(prev => prev ? { ...prev, activity: activity || undefined } : null);
    }
  }, [socket, currentUser]);

  // Auto-publish E2EE ECDH public key after authentication
  useEffect(() => {
    if (!socket || !isAuthenticated || !currentUser?.username) return;
    let cancelled = false;
    getOrCreateE2eeKeyPair(currentUser.username).then((pair) => {
      if (cancelled || !pair) return;
      const pubJson = JSON.stringify(pair.publicKeyJwk);
      if (currentUser.e2eePublicKey !== pubJson) {
        socket.emit('e2ee_publish_key', { publicKey: pubJson });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [socket, isAuthenticated, currentUser?.username, currentUser?.e2eePublicKey]);

  // Auto-clear timed custom activity when expiresAt is reached
  useEffect(() => {
    const expiresAt = currentUser?.activity?.expiresAt;
    if (!expiresAt) return;
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      updateUserActivity(null);
      return;
    }
    const timer = window.setTimeout(() => {
      updateUserActivity(null);
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [currentUser?.activity?.expiresAt, updateUserActivity]);

  const addReaction = useCallback((messageId: string, emoji: string) => {
    if (!socket || !activeChannel) return;
    socket.emit('add_reaction', { channelId: activeChannel.id, messageId, emoji });
  }, [socket, activeChannel]);

  const togglePinMessage = useCallback((messageId: string) => {
    if (!socket || !activeChannel) return;
    socket.emit('toggle_pin_message', { channelId: activeChannel.id, messageId });
  }, [socket, activeChannel]);

  const createPoll = useCallback((question: string, options: string[]) => {
    if (!socket || !activeServer || !activeChannel) return;
    const poll: PollData = {
      question,
      options: options.map((opt, i) => ({
        id: `opt-${i + 1}-${Date.now()}`,
        text: opt,
        votes: []
      })),
      closed: false,
      totalVotes: 0
    };
    socket.emit('send_message', {
      serverId: activeServer.id,
      channelId: activeChannel.id,
      content: `📊 **Anket:** ${question}`,
      attachments: [],
      poll
    });
  }, [socket, activeServer, activeChannel]);

  const votePoll = useCallback((messageId: string, optionId: string) => {
    if (!socket || !activeChannel) return;
    socket.emit('vote_poll', { channelId: activeChannel.id, messageId, optionId });
  }, [socket, activeChannel]);

  const joinVoiceChannel = async (channelId: string, password?: string) => {
    if (!socket) return;
    if (connectedVoiceChannelId === channelId) return;

    lastVoiceChannelIdRef.current = channelId;
    setVoicePasswordError(null);
    cleanupWebRTC();
    setConnectedVoiceChannelId(channelId);
    socket.emit('join_voice', { channelId, password });
  };

  const moveVoiceUser = (targetUserId: string, targetChannelId: string) => {
    if (!socket) return;
    if (targetUserId === currentUser?.id) {
      joinVoiceChannel(targetChannelId);
      return;
    }
    socket.emit('move_voice_user', { targetUserId, targetChannelId });
  };

  const respondVoicePullInvite = (requestId: string, accepted: boolean) => {
    if (!socket) return;
    socket.emit('respond_voice_pull_invite', { requestId, accepted });
    setVoicePullInvite(null);
  };

  const dismissVoicePullNotice = () => {
    setVoicePullNotice(null);
  };

  const leaveVoiceChannel = () => {
    lastVoiceChannelIdRef.current = null;
    if (!socket || !connectedVoiceChannelId) return;
    cleanupWebRTC();
    socket.emit('leave_voice');
    setConnectedVoiceChannelId(null);
  };

  const toggleMute = () => {
    if (currentUserRef.current?.isServerMuted && isMuted) {
      appToast('Moderatör tarafından sunucudan susturuldunuz.', 'warning');
      return;
    }
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (tsSoundEffectsRef.current) {
      playTeamSpeakChime(nextMuted ? 'mute' : 'unmute');
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    socket?.emit('update_user_state', { isMuted: nextMuted });
  };

  const toggleDeafen = () => {
    if (currentUserRef.current?.isServerDeafened && isDeafened) {
      appToast('Moderatör tarafından sunucudan sağırlaştırıldınız.', 'warning');
      return;
    }
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    if (tsSoundEffectsRef.current) {
      playTeamSpeakChime(nextDeafened ? 'mute' : 'unmute');
    }

    audioElementsRef.current.forEach(audio => {
      audio.muted = nextDeafened;
    });

    if (nextDeafened && !isMuted) {
      toggleMute();
    }

    socket?.emit('update_user_state', { isDeafened: nextDeafened });
  };

  const screenShareAudioCtxRef = useRef<AudioContext | null>(null);

  const startScreenShare = async (settings?: ScreenShareSettings, preCapturedStream?: MediaStream | null) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      appToast('Ekran paylaşımı için güvenli bağlantı (HTTPS veya localhost) gereklidir.', 'error');
      return;
    }
    try {
      const resMap: Record<string, { width: number; height: number }> = {
        '360': { width: 640, height: 360 },
        '480': { width: 854, height: 480 },
        '720': { width: 1280, height: 720 },
        '1080': { width: 1920, height: 1080 },
        '1440': { width: 2560, height: 1440 },
      };

      const fps = settings?.fps ?? 30;
      const videoConstraint: MediaTrackConstraints & { cursor?: string } = {
        cursor: 'always',
        frameRate: { ideal: fps, max: fps },
      };
      if (settings?.resolution && settings.resolution !== 'source' && resMap[settings.resolution]) {
        const dims = resMap[settings.resolution];
        videoConstraint.width = { ideal: dims.width, max: dims.width };
        videoConstraint.height = { ideal: dims.height, max: dims.height };
      }

      const rawStream =
        preCapturedStream ||
        (await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraint,
          audio: settings?.audioEnabled
            ? ({
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              } as MediaTrackConstraints)
            : false,
          ...(settings?.audioEnabled
            ? {
                systemAudio: settings.appAudioOnly ? 'exclude' : 'include',
                windowAudio: settings.appAudioOnly ? 'window' : 'system',
                selfBrowserSurface: 'exclude',
              }
            : {}),
        } as any));

      const videoTrack = rawStream.getVideoTracks()[0];
      if (videoTrack) {
        if (preCapturedStream) {
          await videoTrack.applyConstraints(videoConstraint).catch(() => {});
        }
        if (settings?.hdrEnabled) {
          try {
            videoTrack.contentHint = 'detail';
          } catch {}
        }
      }

      // Build final broadcast stream (applying Master Volume gain if audio track exists)
      const broadcastStream = new MediaStream();
      if (videoTrack) broadcastStream.addTrack(videoTrack);

      const rawAudioTracks = rawStream.getAudioTracks();
      if (settings?.audioEnabled && rawAudioTracks.length > 0) {
        try {
          const audioCtx = new AudioContext();
          screenShareAudioCtxRef.current = audioCtx;
          const src = audioCtx.createMediaStreamSource(new MediaStream([rawAudioTracks[0]]));
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = Math.max(0, Math.min(1, (settings.masterVolume ?? 100) / 100));
          const dest = audioCtx.createMediaStreamDestination();
          src.connect(gainNode);
          gainNode.connect(dest);
          const processedTrack = dest.stream.getAudioTracks()[0];
          if (processedTrack) broadcastStream.addTrack(processedTrack);
        } catch {
          broadcastStream.addTrack(rawAudioTracks[0]);
        }
      } else {
        rawAudioTracks.forEach((t) => t.stop());
      }

      screenStreamRef.current = broadcastStream;
      setScreenStream(broadcastStream);
      setIsScreenSharing(true);
      socket?.emit('screen_share_status', { isSharing: true, settings });

      const videoBitrateBps = (settings?.bitrateKbps ?? 10000) * 1000;
      const audioBitrateBps = (settings?.audioBitrateKbps ?? 320) * 1000;

      // Publish screen share tracks to LiveKit SFU if room is currently connected via SFU
      if (livekitRoomRef.current) {
        try {
          const { Track } = await import('livekit-client');
          for (const pub of livekitScreenTracksRef.current) {
            try { if (pub?.track) livekitRoomRef.current.localParticipant.unpublishTrack(pub.track); } catch {}
          }
          livekitScreenTracksRef.current = [];
          for (const track of broadcastStream.getTracks()) {
            const pub = await livekitRoomRef.current.localParticipant.publishTrack(track, {
              source: track.kind === 'video' ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio,
              simulcast: track.kind === 'video',
              videoEncoding: track.kind === 'video' ? { maxBitrate: videoBitrateBps, maxFramerate: fps } : undefined,
            });
            livekitScreenTracksRef.current.push(pub);
          }
        } catch (err) {
          console.warn('[SFU] Ekran paylaşımı LiveKit üzerinden yayınlanamadı:', err);
        }
      }

      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        for (const track of broadcastStream.getTracks()) {
          const sender = pc.addTrack(track, broadcastStream);
          if (track.kind === 'video' && settings?.hdrEnabled) {
            try {
              const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
              const caps = RTCRtpSender.getCapabilities?.('video');
              if (transceiver?.setCodecPreferences && caps?.codecs?.length) {
                const hdrPriority = caps.codecs.filter((c) => {
                  const mime = c.mimeType.toLowerCase();
                  return mime === 'video/av1' || mime === 'video/vp9';
                });
                const fallbackCodecs = caps.codecs.filter((c) => {
                  const mime = c.mimeType.toLowerCase();
                  return mime !== 'video/av1' && mime !== 'video/vp9';
                });
                if (hdrPriority.length > 0) {
                  transceiver.setCodecPreferences([...hdrPriority, ...fallbackCodecs]);
                }
              }
            } catch {
              // Ignore if browser does not support setCodecPreferences
            }
          }
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = track.kind === 'video' ? videoBitrateBps : audioBitrateBps;
            if (track.kind === 'video' && settings?.hdrEnabled) {
              params.degradationPreference = 'maintain-resolution';
            }
            await sender.setParameters(params);
          } catch {
            // Browser may not support all encoding params on every sender
          }
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc_signal', {
          targetUserId: peerId,
          signal: offer,
          type: 'offer'
        });
      }

      if (videoTrack) {
        videoTrack.onended = () => {
          rawStream.getTracks().forEach((t) => t.stop());
          stopScreenShare();
        };
      }
    } catch (err) {
      console.warn('Ekran paylaşımı iptal edildi veya izin verilmedi:', err);
    }
  };

  const stopScreenShare = () => {
    if (livekitRoomRef.current && livekitScreenTracksRef.current.length > 0) {
      for (const pub of livekitScreenTracksRef.current) {
        try { if (pub?.track) livekitRoomRef.current.localParticipant.unpublishTrack(pub.track); } catch {}
      }
      livekitScreenTracksRef.current = [];
    }
    if (screenShareAudioCtxRef.current) {
      screenShareAudioCtxRef.current.close().catch(() => {});
      screenShareAudioCtxRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    socket?.emit('screen_share_status', { isSharing: false });
  };

  const requestScreenShareQuality = useCallback((presenterUserId: string, quality: ViewerStreamQuality) => {
    if (!socket || !presenterUserId) return;
    socket.emit('screen_share_quality_request', { targetUserId: presenterUserId, quality });
  }, [socket]);

  const sendScreenShareLaser = useCallback((presenterId: string, x: number, y: number) => {
    if (!socket || !connectedVoiceChannelId || !presenterId) return;
    socket.emit('screen_share_laser', {
      channelId: connectedVoiceChannelId,
      presenterId,
      x,
      y,
      color: '#f43f5e',
    });
  }, [socket, connectedVoiceChannelId]);

  const updateLiveScreenShareSettings = useCallback(async (patch: { fps?: 5 | 30 | 60; bitrateKbps?: number }) => {
    const localVideo = screenStreamRef.current?.getVideoTracks()[0];
    if (localVideo && patch.fps) {
      await localVideo.applyConstraints({
        frameRate: { ideal: patch.fps, max: patch.fps },
      }).catch(() => {});
    }
    if (patch.bitrateKbps) {
      const targetBps = patch.bitrateKbps * 1000;
      for (const pc of peerConnectionsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track === localVideo);
        if (!sender) continue;
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = targetBps;
          await sender.setParameters(params);
        } catch {}
      }
    }
  }, []);

  const getScreenShareStats = useCallback(async (presenterUserId?: string): Promise<ScreenShareStats | null> => {
    const candidates = presenterUserId
      ? ([peerConnectionsRef.current.get(presenterUserId)].filter(Boolean) as RTCPeerConnection[])
      : Array.from(peerConnectionsRef.current.values());

    const targetType = presenterUserId ? 'inbound-rtp' : 'outbound-rtp';
    for (const targetPc of candidates) {
      try {
        const report = await targetPc.getStats();
        const codecMap = new Map<string, string>();
        let bestVideo: any = null;

        report.forEach((stat: any) => {
          if (stat.type === 'codec' && stat.mimeType?.startsWith('video/')) {
            codecMap.set(stat.id, stat.mimeType.replace('video/', '').toUpperCase());
          }
        });

        report.forEach((stat: any) => {
          if (stat.type === targetType && (stat.kind === 'video' || stat.mediaType === 'video')) {
            if (!bestVideo || (stat.frameWidth || 0) >= (bestVideo.frameWidth || 0)) {
              bestVideo = stat;
            }
          }
        });

        if (bestVideo) {
          const bytes = Number(presenterUserId ? bestVideo.bytesReceived : bestVideo.bytesSent) || 0;
          const now = Date.now();
          let bitrateKbps = 0;
          if (screenShareStatsPrevRef.current && now > screenShareStatsPrevRef.current.ts) {
            const dtSec = (now - screenShareStatsPrevRef.current.ts) / 1000;
            const deltaBytes = Math.max(0, bytes - screenShareStatsPrevRef.current.bytes);
            bitrateKbps = Math.round((deltaBytes * 8) / dtSec / 1000);
          }
          screenShareStatsPrevRef.current = { bytes, ts: now };

          return {
            codec: (bestVideo.codecId && codecMap.get(bestVideo.codecId)) || 'VP8/VP9',
            width: Number(bestVideo.frameWidth) || 0,
            height: Number(bestVideo.frameHeight) || 0,
            fps: Math.round(Number(bestVideo.framesPerSecond) || 0),
            bitrateKbps,
            packetsLost: Number(bestVideo.packetsLost) || 0,
          };
        }
      } catch {
        // continue to next peer or local fallback
      }
    }

    // Fallback when there are 0 viewers in the room yet (local capture settings)
    if (!presenterUserId) {
      const localTrack = screenStreamRef.current?.getVideoTracks()[0];
      const s = localTrack?.getSettings?.();
      if (s && (s.width || s.height || s.frameRate)) {
        return {
          codec: 'Yerel Önizleme (İzleyici yok)',
          width: Number(s.width) || 0,
          height: Number(s.height) || 0,
          fps: Math.round(Number(s.frameRate) || 0),
          bitrateKbps: 0,
          packetsLost: 0,
        };
      }
    }

    return null;
  }, []);

  const createServer = (
    name: string,
    icon?: string,
    template?: 'empty' | 'gaming' | 'friends' | 'work',
    options?: { isPublic?: boolean; category?: ServerCategory }
  ) => {
    if (!socket || !name.trim()) return;
    socket.emit('create_server', {
      name: name.trim(),
      icon,
      template,
      isPublic: options?.isPublic,
      category: options?.category,
    });
  };

  const fetchDiscoverableServers = useCallback(() => {
    return new Promise<DiscoverableServerSummary[]>((resolve) => {
      if (!socket) {
        resolve([]);
        return;
      }
      const handler = (list: DiscoverableServerSummary[]) => {
        socket.off('discoverable_servers_list', handler);
        resolve(Array.isArray(list) ? list : []);
      };
      socket.on('discoverable_servers_list', handler);
      socket.emit('get_discoverable_servers');
      setTimeout(() => {
        socket.off('discoverable_servers_list', handler);
        resolve([]);
      }, 4000);
    });
  }, [socket]);

  const joinPublicServer = useCallback((serverId: string) => {
    return new Promise<{ success: boolean; server?: Server; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      const handler = (res: {
        success: boolean;
        server?: Server;
        messages?: Record<string, Message[]>;
        hasMoreMessages?: Record<string, boolean>;
        error?: string;
      }) => {
        socket.off('join_public_server_response', handler);
        if (res.success && res.server) {
          const joinedSrv = res.server;
          setServers((prev) => {
            const exists = prev.some((s) => s.id === joinedSrv.id);
            const next = exists ? prev.map((s) => (s.id === joinedSrv.id ? joinedSrv : s)) : [...prev, joinedSrv];
            serversRef.current = next;
            return next;
          });
          if (res.messages) {
            setMessagesMap((prev) => ({ ...prev, ...res.messages }));
          }
          if (res.hasMoreMessages) {
            setHasMoreMessages((prev) => ({ ...prev, ...res.hasMoreMessages }));
          }
        }
        resolve({ success: res.success, server: res.server, error: res.error });
      };
      socket.on('join_public_server_response', handler);
      socket.emit('join_public_server', { serverId });
      setTimeout(() => {
        socket.off('join_public_server_response', handler);
        resolve({ success: false, error: 'İstek zaman aşımına uğradı.' });
      }, 6000);
    });
  }, [socket]);

  const leaveServer = useCallback((serverId: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      const handler = (res: { success: boolean; serverId?: string; error?: string }) => {
        socket.off('leave_server_response', handler);
        resolve({ success: Boolean(res?.success), error: res?.error });
      };
      socket.on('leave_server_response', handler);
      socket.emit('leave_server', { serverId });
      setTimeout(() => {
        socket.off('leave_server_response', handler);
        resolve({ success: false, error: 'İstek zaman aşımına uğradı.' });
      }, 6000);
    });
  }, [socket]);

  const createChannel = (
    name: string,
    type: 'text' | 'voice',
    options?: { isLocked?: boolean; password?: string; topic?: string; bitrateKbps?: number; userLimit?: number; isTempCreatorChannel?: boolean }
  ) => {
    if (!socket || !activeServer || !name.trim()) return;
    socket.emit('create_channel', {
      serverId: activeServer.id,
      name: name.trim(),
      type,
      isLocked: options?.isLocked,
      password: options?.password,
      topic: options?.topic,
      bitrateKbps: options?.bitrateKbps,
      userLimit: options?.userLimit,
      isTempCreatorChannel: options?.isTempCreatorChannel,
    });
  };

  const serverMuteUser = useCallback((targetUserId: string, muted?: boolean, deafened?: boolean) => {
    if (!socket || !targetUserId) return;
    socket.emit('admin_server_mute_user', { targetUserId, muted, deafened });
  }, [socket]);

  const muteAllVoiceChannel = useCallback((channelId: string, muted: boolean) => {
    if (!socket || !channelId) return;
    socket.emit('admin_mute_all_voice', { channelId, muted });
  }, [socket]);

  const updateChannelSettings = useCallback((serverId: string, channelId: string, patch: { bitrateKbps?: number; userLimit?: number; topic?: string }) => {
    if (!socket || !serverId || !channelId) return;
    socket.emit('update_channel_settings', { serverId, channelId, ...patch });
  }, [socket]);

  const clearVoicePasswordError = useCallback(() => {
    setVoicePasswordError(null);
  }, []);

  const unlockChannel = useCallback((channelId: string) => {
    setUnlockedChannelIds(prev => prev.includes(channelId) ? prev : [...prev, channelId]);
  }, []);

  const fetchServerAnalytics = useCallback((serverId: string) => {
    if (!socket) return;
    socket.emit('get_server_analytics', { serverId });
  }, [socket]);

  const updateChannelNotice = useCallback((serverId: string, channelId: string, notice?: string | null, topic?: string) => {
    if (!socket) return;
    socket.emit('update_channel_notice', { serverId, channelId, notice, topic });
  }, [socket]);

  const updateProfile = (username: string, avatar: string) => {
    if (!socket) return;
    socket.emit('update_user_state', { username, avatar });
  };

  const updateServerSettings = useCallback((data: {
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
    sfuMode?: 'auto' | 'p2p' | 'sfu';
    systemChannelId?: string | null;
    verificationLevel?: 'none' | 'low' | 'medium' | 'high';
    defaultNotification?: 'all' | 'mentions';
    autoModEnabled?: boolean;
    vanityCode?: string;
    welcomeChannelId?: string | null;
    welcomeMessage?: string;
    welcomeEnabled?: boolean;
    autoRoleId?: string | null;
    isPublic?: boolean;
    category?: ServerCategory;
    tags?: string[];
  }) => {
    socket?.emit('update_server_settings', data);
    if (data.bitrateKbps) {
      peerConnectionsRef.current.forEach((pc) => {
        applyAudioBitrate(pc, data.bitrateKbps!);
      });
    }
  }, [socket]);

  const restoreServerBackup = useCallback((serverId: string, backupData: any) => {
    socket?.emit('restore_server_backup', { serverId, backupData });
  }, [socket]);

  const createServerRole = useCallback((data: { serverId: string; name: string; color: string; permissions: ServerPermission[]; }) => {
    socket?.emit('create_server_role', data);
  }, [socket]);

  const updateServerRole = useCallback((data: { serverId: string; roleId: string; name: string; color: string; permissions: ServerPermission[]; position?: number; }) => {
    socket?.emit('update_server_role', data);
  }, [socket]);

  const deleteServerRole = useCallback((serverId: string, roleId: string) => {
    socket?.emit('delete_server_role', { serverId, roleId });
  }, [socket]);

  const toggleMemberRole = useCallback((serverId: string, targetUserId: string, roleId: string) => {
    socket?.emit('toggle_member_role', { serverId, targetUserId, roleId });
  }, [socket]);

  const kickServerMember = useCallback((serverId: string, targetUserId: string) => {
    socket?.emit('kick_server_member', { serverId, targetUserId });
  }, [socket]);

  const deleteServer = useCallback((serverId: string) => {
    socket?.emit('delete_server', { serverId });
  }, [socket]);

  const hasServerPermission = useCallback((permission: ServerPermission): boolean => {
    if (!currentUser || !activeServer) return false;
    if (isUserServerOwner(currentUser, activeServer) || currentUser.role === 'admin') return true;
    const unameLower = currentUser.username.toLowerCase();
    const member = activeServer.members?.find(
      (m) =>
        (currentUser.accountId && m.userId === currentUser.accountId) ||
        m.userId === currentUser.id ||
        m.username.toLowerCase() === unameLower
    );
    if (!member) return false;
    if (member.isOwner) return true;

    for (const rId of member.roleIds) {
      const role = activeServer.roles?.find(r => r.id === rId);
      if (role && role.permissions.includes(permission)) return true;
    }
    const defaultRole = activeServer.roles?.find(r => r.isDefault);
    if (defaultRole && defaultRole.permissions.includes(permission)) return true;
    return false;
  }, [currentUser, activeServer]);

  const getServerMemberHighestRole = useCallback((member: ServerMember, server: Server): ServerRole | null => {
    if (!server.roles || !member.roleIds || member.roleIds.length === 0) return null;
    const userRoles = server.roles
      .filter(r => member.roleIds.includes(r.id) && !r.isDefault)
      .sort((a, b) => a.position - b.position);
    return userRoles.length > 0 ? userRoles[0] : null;
  }, []);

  const editMessage = useCallback((messageId: string, newContent: string) => {
    if (!socket || !activeChannelId) return;
    socket.emit('edit_message', { channelId: activeChannelId, messageId, newContent });
  }, [socket, activeChannelId]);

  const deleteMessage = useCallback((messageId: string) => {
    if (!socket || !activeChannelId) return;
    socket.emit('delete_message', { channelId: activeChannelId, messageId });
  }, [socket, activeChannelId]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!socket || !activeChannelId) return;
    socket.emit(isTyping ? 'typing_start' : 'typing_stop', { channelId: activeChannelId });
  }, [socket, activeChannelId]);

  const changePassword = useCallback((currentPassword: string, newPassword: string) => {
    return new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      const handler = (res: { success: boolean; message?: string; error?: string }) => {
        socket.off('change_password_response', handler);
        resolve(res);
      };
      socket.on('change_password_response', handler);
      socket.emit('change_password', { currentPassword, newPassword });
      setTimeout(() => {
        socket.off('change_password_response', handler);
        resolve({ success: false, error: 'İstek zaman aşımına uğradı.' });
      }, 10000);
    });
  }, [socket]);

  const requestPasswordResetCode = useCallback((email: string) => {
    return new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      let settled = false;
      const cleanup = (res: { success: boolean; message?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('password_reset_code_result', handler);
        resolve(res);
      };
      const handler = (res: { success: boolean; message?: string; error?: string }) => cleanup(res);
      const timer = window.setTimeout(
        () => cleanup({ success: false, error: 'Şifre sıfırlama kodu isteği zaman aşımına uğradı.' }),
        20000
      );
      socket.on('password_reset_code_result', handler);
      socket.emit('request_password_reset_code', { email });
    });
  }, [socket]);

  const confirmPasswordReset = useCallback((email: string, code: string, newPassword: string) => {
    return new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      let settled = false;
      const cleanup = (res: { success: boolean; message?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('password_reset_result', handler);
        resolve(res);
      };
      const handler = (res: { success: boolean; message?: string; error?: string }) => cleanup(res);
      const timer = window.setTimeout(
        () => cleanup({ success: false, error: 'Şifre sıfırlama isteği zaman aşımına uğradı.' }),
        10000
      );
      socket.on('password_reset_result', handler);
      socket.emit('confirm_password_reset', { email, code, newPassword });
    });
  }, [socket]);

  const requestEmailChangeCode = useCallback((currentPassword: string, newEmail: string) => {
    return new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      let settled = false;
      const cleanup = (res: { success: boolean; message?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('email_change_code_result', handler);
        resolve(res);
      };
      const handler = (res: { success: boolean; message?: string; error?: string }) => cleanup(res);
      const timer = window.setTimeout(
        () => cleanup({ success: false, error: 'Doğrulama kodu isteği zaman aşımına uğradı.' }),
        20000
      );
      socket.on('email_change_code_result', handler);
      socket.emit('request_email_change_code', { currentPassword, newEmail });
    });
  }, [socket]);

  const confirmEmailChange = useCallback((code: string) => {
    return new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      let settled = false;
      const cleanup = (res: { success: boolean; message?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('email_change_confirm_result', handler);
        resolve(res);
      };
      const handler = (res: { success: boolean; message?: string; error?: string }) => cleanup(res);
      const timer = window.setTimeout(
        () => cleanup({ success: false, error: 'E-posta onay isteği zaman aşımına uğradı.' }),
        10000
      );
      socket.on('email_change_confirm_result', handler);
      socket.emit('confirm_email_change', { code });
    });
  }, [socket]);

  const revokeSingleSession = useCallback((targetSocketId: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      let settled = false;
      const cleanup = (res: { success: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('revoke_single_session_result', handler);
        resolve(res);
      };
      const handler = (res: { success: boolean; error?: string }) => cleanup(res);
      const timer = window.setTimeout(
        () => cleanup({ success: false, error: 'Oturum sonlandırma isteği zaman aşımına uğradı.' }),
        8000
      );
      socket.on('revoke_single_session_result', handler);
      socket.emit('revoke_single_session', { targetSocketId });
    });
  }, [socket]);

  const deleteMyAccount = useCallback((currentPassword: string, confirmText: string, totpCode?: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      let settled = false;
      const cleanup = (res: { success: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.off('delete_account_result', handler);
        if (res.success) {
          localStorage.removeItem('dc_clone_auth');
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
          clearAllTypingUsers();
          setDirectCallQualitySnapshot(null);
          setIsAuthenticated(false);
          setCurrentUser(null);
          cleanupWebRTC();
        }
        resolve(res);
      };
      const handler = (res: { success: boolean; error?: string }) => cleanup(res);
      const timer = window.setTimeout(
        () => cleanup({ success: false, error: 'Hesap silme isteği zaman aşımına uğradı.' }),
        10000
      );
      socket.on('delete_account_result', handler);
      socket.emit('delete_my_account', { currentPassword, confirmText, totpCode });
    });
  }, [socket, cleanupWebRTC]);

  const markChannelRead = useCallback((channelId: string, lastMessageId: string) => {
    if (!channelId || !lastMessageId) return;
    if (readCursorsRef.current[channelId] === lastMessageId) return;
    const next = { ...readCursorsRef.current, [channelId]: lastMessageId };
    readCursorsRef.current = next;
    setReadCursors(next);
    setUnreadCounts(prev => {
      if (!prev[channelId]) return prev;
      const copy = { ...prev };
      delete copy[channelId];
      return copy;
    });
    if (socket?.connected && currentUserRef.current) {
      socket.emit('mark_channel_read', { channelId, lastMessageId });
    }
  }, [socket]);

  const navigateToTarget = useCallback((target: { channelId?: string; dmUsername?: string }) => {
    const me = currentUserRef.current;
    if (!me) return;
    if (target.dmUsername) {
      const dmName = target.dmUsername.trim();
      const dmUser = onlineUsersRef.current.find(
        u => u.username.toLowerCase() === dmName.toLowerCase()
      );
      if (dmUser) {
        openDirectMessage(dmUser);
        return;
      }
      const dmChannelId = target.channelId || buildPersistentDmChannelId(me.username, dmName);
      setActiveDMUser({
        id: dmName.toLowerCase(),
        username: dmName,
        role: 'user',
        avatar: '👤',
        status: 'offline',
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
      });
      setActiveServerId('direct-messages');
      setActiveChannelId(dmChannelId);
      setUnreadCounts(prev => {
        if (!prev[dmChannelId]) return prev;
        const copy = { ...prev };
        delete copy[dmChannelId];
        return copy;
      });
      setUnreadDMByUser(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.toLowerCase() === dmName.toLowerCase()) delete next[k];
        }
        return next;
      });
      return;
    }

    if (target.channelId) {
      const srv = serversRef.current.find(s => s.channels.some(c => c.id === target.channelId));
      if (srv) {
        setActiveDMUser(null);
        setActiveServerId(srv.id);
        setActiveChannelId(target.channelId);
        setUnreadCounts(prev => {
          if (!prev[target.channelId!]) return prev;
          const copy = { ...prev };
          delete copy[target.channelId!];
          return copy;
        });
      } else if (target.channelId.startsWith('dm_')) {
        setActiveServerId('direct-messages');
        setActiveChannelId(target.channelId);
      }
    }
  }, [openDirectMessage]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'CAKMA_NOTIFICATION_NAVIGATE') return;
      navigateToTarget({ channelId: data.channelId, dmUsername: data.dmUsername });
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, [navigateToTarget]);

  const consumedUrlDeepLinkRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || consumedUrlDeepLinkRef.current) return;
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const dmParam = url.searchParams.get('dm') || undefined;
    const channelParam = url.searchParams.get('channel') || undefined;
    if (!dmParam && !channelParam) {
      consumedUrlDeepLinkRef.current = true;
      return;
    }
    if (servers.length === 0 && onlineUsers.length === 0) {
      const fallbackTimer = window.setTimeout(() => {
        if (consumedUrlDeepLinkRef.current) return;
        consumedUrlDeepLinkRef.current = true;
        navigateToTarget({ dmUsername: dmParam, channelId: channelParam });
        url.searchParams.delete('dm');
        url.searchParams.delete('channel');
        window.history.replaceState(null, '', url.toString());
      }, 450);
      return () => window.clearTimeout(fallbackTimer);
    }
    consumedUrlDeepLinkRef.current = true;
    navigateToTarget({ dmUsername: dmParam, channelId: channelParam });
    url.searchParams.delete('dm');
    url.searchParams.delete('channel');
    window.history.replaceState(null, '', url.toString());
  }, [isAuthenticated, servers.length, onlineUsers.length, navigateToTarget]);

  const blockUser = useCallback((targetUsername: string) => {
    if (!socket) return;
    socket.emit('block_user', { targetUsername });
  }, [socket]);

  const unblockUser = useCallback((targetUsername: string) => {
    if (!socket) return;
    socket.emit('unblock_user', { targetUsername });
  }, [socket]);

  const timeoutMember = useCallback((serverId: string, targetUsername: string, durationMinutes: number) => {
    if (!socket) return;
    socket.emit('timeout_server_member', { serverId, targetUsername, durationMinutes });
  }, [socket]);

  const createServerInvite = useCallback((serverId: string, maxUses?: number, expireMinutes?: number) => {
    return new Promise<ServerInvite | null>((resolve) => {
      if (!socket) {
        resolve(null);
        return;
      }
      const handler = (invite: ServerInvite) => {
        if (invite.serverId === serverId) {
          socket.off('server_invite_created', handler);
          resolve(invite);
        }
      };
      socket.on('server_invite_created', handler);
      socket.emit('create_server_invite', { serverId, maxUses, expireMinutes });
      setTimeout(() => {
        socket.off('server_invite_created', handler);
        resolve(null);
      }, 8000);
    });
  }, [socket]);

  const previewServerInvite = useCallback((code: string) => {
    return new Promise<{
      success: boolean;
      server?: {
        id: string;
        name: string;
        icon: string;
        bannerGradient?: string;
        bannerImage?: string;
        description?: string;
        memberCount: number;
      };
      error?: string;
    }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      const handler = (res: any) => {
        socket.off('preview_invite_response', handler);
        resolve(res);
      };
      socket.on('preview_invite_response', handler);
      socket.emit('preview_server_invite', { code });
      setTimeout(() => {
        socket.off('preview_invite_response', handler);
        resolve({ success: false, error: 'Önizleme zaman aşımına uğradı.' });
      }, 6000);
    });
  }, [socket]);

  const reorderChannel = useCallback((serverId: string, channelId: string, direction: 'up' | 'down') => {
    if (!socket) return;
    socket.emit('reorder_channels', { serverId, channelId, direction });
  }, [socket]);

  const sendThreadMessage = useCallback((channelId: string, parentMessageId: string, content: string) => {
    if (!socket) return;
    socket.emit('send_thread_message', { channelId, parentMessageId, content });
  }, [socket]);

  const clearChannelMessages = useCallback((serverId: string, channelId: string, count: number) => {
    if (!socket) return;
    socket.emit('clear_channel_messages', { serverId, channelId, count });
  }, [socket]);

  const createServerEvent = useCallback((serverId: string, data: { title: string; description?: string; startTime: string; voiceChannelId?: string | null }) => {
    if (!socket) return;
    socket.emit('create_server_event', { serverId, ...data });
  }, [socket]);

  const rsvpServerEvent = useCallback((serverId: string, eventId: string) => {
    if (!socket) return;
    socket.emit('rsvp_server_event', { serverId, eventId });
  }, [socket]);

  const deleteServerEvent = useCallback((serverId: string, eventId: string) => {
    if (!socket) return;
    socket.emit('delete_server_event', { serverId, eventId });
  }, [socket]);

  const joinServerByInvite = useCallback((code: string) => {
    return new Promise<{ success: boolean; serverId?: string; serverName?: string; error?: string }>((resolve) => {
      if (!socket) {
        resolve({ success: false, error: 'Sunucuya bağlı değilsiniz.' });
        return;
      }
      const handler = (res: {
        success: boolean;
        serverId?: string;
        serverName?: string;
        server?: Server;
        messages?: Record<string, Message[]>;
        hasMoreMessages?: Record<string, boolean>;
        error?: string;
      }) => {
        socket.off('join_invite_response', handler);
        if (res.success && res.serverId) {
          if (res.server) {
            const joinedSrv = res.server;
            setServers((prev) => {
              const exists = prev.some((s) => s.id === joinedSrv.id);
              const next = exists ? prev.map((s) => (s.id === joinedSrv.id ? joinedSrv : s)) : [...prev, joinedSrv];
              serversRef.current = next;
              return next;
            });
          }
          if (res.messages) {
            setMessagesMap((prev) => ({ ...prev, ...res.messages }));
          }
          if (res.hasMoreMessages) {
            setHasMoreMessages((prev) => ({ ...prev, ...res.hasMoreMessages }));
          }
          setActiveDMUser(null);
          setActiveServerId(res.serverId);
          const targetSrv = res.server || serversRef.current.find((s) => s.id === res.serverId);
          const firstText = targetSrv?.channels.find((c) => c.type === 'text');
          if (firstText) setActiveChannelId(firstText.id);
        }
        resolve(res);
      };
      socket.on('join_invite_response', handler);
      socket.emit('join_server_by_invite', { code });
      setTimeout(() => {
        socket.off('join_invite_response', handler);
        resolve({ success: false, error: 'İstek zaman aşımına uğradı.' });
      }, 8000);
    });
  }, [socket]);

  useEffect(() => {
    if (!socket || !currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) {
      joinServerByInvite(inviteCode).then(() => {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      });
    }
  }, [socket, currentUser, joinServerByInvite]);

  // Voice Activity Ping for AFK Auto-Move
  const lastActivityPingRef = useRef<number>(0);
  useEffect(() => {
    if (!socket || !connectedVoiceChannelId || !isSpeaking) return;
    const now = Date.now();
    if (now - lastActivityPingRef.current > 15000) {
      lastActivityPingRef.current = now;
      socket.emit('voice_activity');
    }
  }, [socket, connectedVoiceChannelId, isSpeaking]);

  // Tauri Desktop Integrations: Tray Controls, Global Shortcuts, Game Detection, Deep Links, Overlay Sync
  const toggleMuteRef = useRef(toggleMute);
  const toggleDeafenRef = useRef(toggleDeafen);
  const leaveVoiceChannelRef = useRef(leaveVoiceChannel);
  const updateProfileDetailsRef = useRef(updateProfileDetails);
  const joinServerByInviteRef = useRef(joinServerByInvite);
  const stopRemoteAssistRef = useRef(stopRemoteAssist);
  const pauseRemoteAssistRef = useRef(pauseRemoteAssist);
  const pushDirectCallToastRef = useRef(pushDirectCallToast);
  useEffect(() => {
    toggleMuteRef.current = toggleMute;
    toggleDeafenRef.current = toggleDeafen;
    leaveVoiceChannelRef.current = leaveVoiceChannel;
    updateProfileDetailsRef.current = updateProfileDetails;
    joinServerByInviteRef.current = joinServerByInvite;
    stopRemoteAssistRef.current = stopRemoteAssist;
    pauseRemoteAssistRef.current = pauseRemoteAssist;
    pushDirectCallToastRef.current = pushDirectCallToast;
  });

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;

    let cancelled = false;
    const unlistenTrayFns: Array<() => void> = [];
    let gameTimer: ReturnType<typeof setInterval> | null = null;
    let lastDetectedGame: string | null = null;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fns = await Promise.all([
          listen('tray-toggle-mute', () => toggleMuteRef.current()),
          listen('tray-toggle-deafen', () => toggleDeafenRef.current()),
          listen('tray-leave-voice', () => leaveVoiceChannelRef.current()),
          listen<string>('tray-set-status', (ev) => {
            const st = ev.payload;
            if (st === 'online' || st === 'idle' || st === 'dnd') {
              updateProfileDetailsRef.current({ status: st });
            }
          }),
          listen<string>('deep-link-url', (ev) => {
            const parsed = parseDeepLinkUrl(ev.payload);
            if (parsed?.type === 'invite' && isAuthenticated) {
              joinServerByInviteRef.current(parsed.code);
            }
          }),
          listen('remote-assist-emergency-stop', () => {
            stopRemoteAssistRef.current();
            pushDirectCallToastRef.current('Acil Durdurma (Ctrl+Alt+Esc / Pause): Uzaktan kontrol kesildi.', 'warning');
          }),
          listen<{ action?: string; paused?: boolean }>('remote-assist-hud-action', (ev) => {
            const p = ev.payload || {};
            if (p.action === 'stop') {
              stopRemoteAssistRef.current();
            } else if (p.action === 'toggle_pause') {
              pauseRemoteAssistRef.current(Boolean(p.paused));
            }
          }),
        ]);
        if (cancelled) {
          fns.forEach((fn) => fn());
        } else {
          unlistenTrayFns.push(...fns);
        }
      } catch {
        // ignore
      }

      if (cancelled) return;

      try {
        const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
        await unregisterAll().catch(() => {});
        await register('CommandOrControl+Shift+M', (e) => {
          if (e.state === 'Pressed') toggleMuteRef.current();
        }).catch(() => {});
        await register('CommandOrControl+Shift+D', (e) => {
          if (e.state === 'Pressed') toggleDeafenRef.current();
        }).catch(() => {});
        await register('CommandOrControl+Shift+O', async (e) => {
          if (e.state === 'Pressed') {
            try {
              const nextLocked = localStorage.getItem('dc_overlay_locked') !== '1';
              localStorage.setItem('dc_overlay_locked', nextLocked ? '1' : '0');
              const { invoke } = await import('@tauri-apps/api/core');
              const { emit } = await import('@tauri-apps/api/event');
              await invoke('set_overlay_ignore_cursor', { ignore: nextLocked });
              await emit('overlay-lock-changed', nextLocked);
            } catch {}
          }
        }).catch(() => {});
      } catch {
        // ignore
      }

      if (cancelled) return;

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (localStorage.getItem('dc_overlay_enabled') === 'true' && isAuthenticated) {
          invoke('set_overlay_window', { enabled: true }).catch(() => {});
        }
        if (isAuthenticated) {
          invoke<string | null>('take_pending_deep_link')
            .then((pendingUrl) => {
              const parsed = parseDeepLinkUrl(pendingUrl);
              if (parsed?.type === 'invite') {
                joinServerByInviteRef.current(parsed.code);
              }
            })
            .catch(() => {});
        }
        const pollGame = async () => {
          if (!socket || !isAuthenticated) return;
          try {
            const game = await invoke<string | null>('detect_running_game');
            setDetectedGame(game || null);
            if (game !== lastDetectedGame) {
              lastDetectedGame = game;
              socket.emit('user_update_activity', { activity: game ? { type: 'playing', name: game } : null });
            }
          } catch {
            // ignore
          }
        };
        pollGame();
        gameTimer = setInterval(pollGame, 10000);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      unlistenTrayFns.forEach((fn) => fn());
      if (gameTimer) clearInterval(gameTimer);
      import('@tauri-apps/plugin-global-shortcut')
        .then(({ unregisterAll }) => unregisterAll())
        .catch(() => {});
    };
  }, [socket, isAuthenticated]);

  // Emit speaker updates to Tauri Overlay window & handle overlay actions
  const emitOverlayStateRef = useRef<() => void>(() => {});
  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    if (typeof window !== 'undefined' && window.location.search.includes('overlay=1')) return;

    const currentVoiceCh = servers
      .flatMap((s) => s.channels)
      .find((c) => c.id === connectedVoiceChannelId);

    const speakers = onlineUsers
      .filter((u) => connectedVoiceChannelId && u.currentVoiceChannelId === connectedVoiceChannelId)
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        isSpeaking: u.id === currentUser?.id ? isSpeaking : u.isSpeaking,
        isMuted: u.id === currentUser?.id ? isMuted : u.isMuted,
        isDeafened: u.id === currentUser?.id ? isDeafened : u.isDeafened,
        isHandRaised: u.isHandRaised,
      }));

    const pushOverlay = () => {
      import('@tauri-apps/api/event')
        .then(({ emit }) =>
          emit('overlay-speakers-update', {
            speakers,
            inVoice: Boolean(connectedVoiceChannelId),
            channelName: currentVoiceCh?.name || '',
            ping,
            isMuted,
            isDeafened,
          })
        )
        .catch(() => {});
    };

    emitOverlayStateRef.current = pushOverlay;
    pushOverlay();
  }, [onlineUsers, connectedVoiceChannelId, isSpeaking, isMuted, isDeafened, ping, currentUser, servers]);

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    if (typeof window !== 'undefined' && window.location.search.includes('overlay=1')) return;

    let unlisteners: Array<() => void> = [];
    import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const u1 = await listen('overlay-ready', () => emitOverlayStateRef.current());
        const u2 = await listen('overlay-close-requested', () => setOverlayEnabled(false));
        const u3 = await listen('overlay-toggle-mute', () => toggleMuteRef.current());
        const u4 = await listen('overlay-toggle-deafen', () => toggleDeafenRef.current());
        unlisteners = [u1, u2, u3, u4];
      })
      .catch(() => {});

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [setOverlayEnabled]);

  useEffect(() => {
    const uname = currentUser?.username?.trim();
    if (!uname || !isAuthenticated) return;
    if (cloudSyncLoadedUserRef.current === uname) return;
    cloudSyncLoadedUserRef.current = uname;
    authFetch(currentServerHost, `/api/user-prefs/${encodeURIComponent(uname)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const prefs = res?.prefs;
        if (!prefs) return;
        if (prefs.uiTheme) setUiTheme(prefs.uiTheme);
        if (prefs.customTheme && typeof prefs.customTheme === 'object') setCustomTheme(prefs.customTheme);
        if (prefs.language) setLanguage(prefs.language);
        if (prefs.ringtonePack) setRingtonePack(prefs.ringtonePack);
        if (typeof prefs.showLinkPreviews === 'boolean') setShowLinkPreviews(prefs.showLinkPreviews);
        if (prefs.userNotes && typeof prefs.userNotes === 'object') {
          setUserNotes(prefs.userNotes);
          try { localStorage.setItem('dc_user_notes', JSON.stringify(prefs.userNotes)); } catch {}
        }
        if (Array.isArray(prefs.bookmarkedMessages)) {
          setBookmarkedMessages(prefs.bookmarkedMessages);
          try { localStorage.setItem('dc_bookmarked_messages', JSON.stringify(prefs.bookmarkedMessages)); } catch {}
        }
        if (prefs.userVolumes && typeof prefs.userVolumes === 'object') {
          setUserVolumes(prefs.userVolumes);
          try { localStorage.setItem('dc_user_volumes', JSON.stringify(prefs.userVolumes)); } catch {}
        }
        if (prefs.userAudioEq && typeof prefs.userAudioEq === 'object') {
          setUserAudioEqState(prefs.userAudioEq);
          try { localStorage.setItem('cakma_user_audio_eq', JSON.stringify(prefs.userAudioEq)); } catch {}
        }
        if (prefs.notificationPrefs && typeof prefs.notificationPrefs === 'object') {
          setNotificationPrefsState(prefs.notificationPrefs);
          try { localStorage.setItem('dc_notification_prefs', JSON.stringify(prefs.notificationPrefs)); } catch {}
        }
      })
      .catch(() => {});
  }, [currentUser?.username, isAuthenticated, currentServerHost]);

  useEffect(() => {
    const uname = currentUser?.username?.trim();
    if (!uname || !isAuthenticated || cloudSyncLoadedUserRef.current !== uname) return;
    const timer = window.setTimeout(() => {
      authFetch(currentServerHost, `/api/user-prefs/${encodeURIComponent(uname)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uiTheme,
          customTheme,
          language,
          ringtonePack,
          showLinkPreviews,
          userNotes,
          bookmarkedMessages,
          userVolumes,
          userAudioEq,
          notificationPrefs,
        }),
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    currentUser?.username,
    isAuthenticated,
    currentServerHost,
    uiTheme,
    customTheme,
    language,
    ringtonePack,
    showLinkPreviews,
    userNotes,
    bookmarkedMessages,
    userVolumes,
    userAudioEq,
    notificationPrefs,
  ]);

  const contextValue = useMemo(
    () => ({
      socket,
      currentUser,
      isAuthenticated,
      servers,
      activeServer,
      activeChannel,
      messages,
      onlineUsers,
      connectedVoiceChannelId,
      isMuted,
      isDeafened,
      isSpeaking,
      isScreenSharing,
      screenStream,
      remoteScreenStreams,
      remoteCameraStreams,
      localDirectCameraStream,
      inputMode,
      pttKey,
      isPttActive,

      // Friends System
      friends,
      incomingFriendRequests,
      outgoingFriendRequests,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      cancelFriendRequest,
      removeFriend,
      fetchFriendsData,

      // Direct Messaging & 1-on-1 Voice Calling
      activeDMUser,
      openDirectMessage,
      closeDirectMessage,
      directCall,
      directCallToasts,
      dismissDirectCallToast,
      startDirectCall,
      acceptDirectCall,
      declineDirectCall,
      endDirectCall,
      isDirectScreenSharing,
      partnerDirectScreenSharing,
      isDirectCameraOn,
      partnerDirectCameraOn,
      toggleDirectCamera,
      unreadDMByUser,
      remoteAssist,
      remoteAssistSafeMode,
      setRemoteAssistSafeMode,
      startDirectScreenShare,
      stopDirectScreenShare,
      requestRemoteAssist,
      respondRemoteAssist,
      stopRemoteAssist,
      pauseRemoteAssist,
      updateRemoteAssistPermissions,
      selectRemoteMonitor,
      sendRemoteInput,
      sendRemoteClipboard,
      pullRemoteClipboard,
      lastClipboardNotice,
      remoteLaser,
      sendRemoteLaser,
      remoteAnnotations,
      sendRemoteAnnotation,
      clearRemoteAnnotations,
      sendFileToDirectPartner,
      sendScreenshotToDirectPartner,
      updateProfileDetails,
      transferWalletBalance,

      // System Announcement
      systemAnnouncement,
      pinnedBanner,
      maintenanceStatus,
      dismissAnnouncement,

      // Detailed Audio Settings
      audioInputDevices,
      audioOutputDevices,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
      inputSensitivity,
      inputVolume,
      outputVolume,
      isMicTesting,
      micVolumeLevel,

      selectServer,
      selectChannel,
      sendMessage,
      toggleRaiseHand,
      addServerEmoji,
      deleteServerEmoji,
      toggleOverlayWindow,
      overlayEnabled,
      setOverlayEnabled,
      detectedGame,
      refreshDetectedGame,
      joinVoiceChannel,
      moveVoiceUser,
      voicePullInvite,
      voicePullNotice,
      respondVoicePullInvite,
      dismissVoicePullNotice,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      startScreenShare,
      stopScreenShare,
      requestScreenShareQuality,
      updateLiveScreenShareSettings,
      getScreenShareStats,
      laserPoints,
      sendScreenShareLaser,
      setInputMode,
      setPttKey,
      createServer,
      createChannel,
      updateProfile,

      // Server Roles & Detailed Settings
      updateServerSettings,
      restoreServerBackup,
      createServerRole,
      updateServerRole,
      deleteServerRole,
      toggleMemberRole,
      kickServerMember,
      deleteServer,
      hasServerPermission,
      getServerMemberHighestRole,

      // Auth
      login,
      verify2faLogin,
      register,
      requestRegisterChallenge,
      sendRegisterEmailCode,
      logout,

      // Audio Device Handlers
      setSelectedInputDeviceId,
      setSelectedOutputDeviceId,
      setNoiseSuppression,
      setEchoCancellation,
      setAutoGainControl,
      studioAudioDsp,
      setStudioAudioDsp,
      aiNoiseSuppression,
      setAiNoiseSuppression,
      lowLatencyAudio,
      setLowLatencyAudio,
      userAudioEq,
      setUserAudioEq,
      serverMuteUser,
      muteAllVoiceChannel,
      updateChannelSettings,
      setInputSensitivity,
      setInputVolume,
      setOutputVolume,
      toggleMicTest,
      refreshAudioDevices,

      // Admin Dashboard
      adminData,
      fetchAdminData,
      adminChangeRole,
      adminKickUser,
      adminDeleteChannel,
      adminBroadcastAnnouncement,
      adminClearPinnedBanner,
      adminCreateRegInvite,
      adminDeleteRegInvite,
      adminTestSmtp,
      generateDedicatedLicense,
      adminRevokeLicense,
      adminActivateLicense,
      adminExtendLicense,
      adminUpdateStoreSettings,
      adminUpdateSystemConfig,
      adminClearConnectionLogs,
      adminUpdateWallet,
      adminBanUser,
      adminUnbanUser,
      adminResetUser2fa,
      adminBanIp,
      adminUnbanIp,
      adminExportFullBackup,
      adminRestoreFullBackup,
      adminTriggerBackupNow,
      adminRestoreScheduledBackup,
      adminDeleteScheduledBackup,
      adminTestWebhook,
      adminPurgeMessages,
      adminResetUserPassword,
      adminCreateChannel,
      adminDeleteServer,
      adminClearAuditLogs,
      adminFeedback,
      generatedLicense,
      clearGeneratedLicense,
      connectToDedicatedServer,
      resetToMainServer,
      currentServerHost,
      isDedicatedServer: Boolean(localStorage.getItem('dc_dedicated_server_host')),

      // Store & User Licenses
      storeSettings,
      myLicenses,
      fetchMyLicenses,
      storePurchaseLicense,
      storeExtendLicense,

      // Soundboard, Radio & Activities
      playSoundboard,
      activeSoundboardEffect,
      radioBotState,
      syncRadioState,
      updateUserActivity,

      // Reactions, Pinned & Polls
      addReaction,
      togglePinMessage,
      createPoll,
      votePoll,

      // Diagnostics & Network Telemetry
      ping,
      messagesMap,
      socketId: socket?.id || null,
      language,
      setLanguage,
      jitter,
      packetLoss,
      pingHistory,
      measurePing,
      isDiagnosticsOpen,
      setIsDiagnosticsOpen,
      openDiagnostics,

      // Per-User Audio Controls
      userVolumes,
      setUserVolume,
      userLocalMutes,
      toggleUserLocalMute,

      // Voice Room Recorder
      isVoiceRecording,
      voiceRecordingSeconds,
      startVoiceRecording,
      stopVoiceRecording,

      // Webcam, Blur & Priority Speaker
      isWebcamActive,
      toggleWebcam,
      webcamStream,
      webcamBlurEnabled,
      toggleWebcamBlur,
      remoteWebcamUserIds,
      isPrioritySpeakerActive,
      prioritySpeakerUsername,
      togglePrioritySpeaker,
      notificationPrefs,
      setTargetNotificationPref,

      // 3D Spatial Audio & Panning
      userPans,
      setUserPan,

      // Watch Together
      watchTogetherState,
      startWatchTogether,
      sendWatchTogetherAction,
      stopWatchTogether,

      // Mini Games
      miniGameState,
      startMiniGame,
      joinMiniGame,
      sendMiniGameMove,
      resetMiniGame,
      stopMiniGame,

      // TeamSpeak Sound Events & Push Notifications
      tsSoundEffectsEnabled,
      setTsSoundEffectsEnabled,
      soundPack,
      setSoundPack,
      pttBeepEnabled,
      setPttBeepEnabled,
      desktopNotificationsEnabled,
      setDesktopNotificationsEnabled,
      sendThreadMessage,
      clearChannelMessages,
      createServerEvent,
      rsvpServerEvent,
      deleteServerEvent,

      // TeamSpeak Whisper
      activeWhisperFrom,
      sendWhisper,

      // Server Leaderboard
      leaderboardData,
      fetchLeaderboard,

      // Server Analytics & Statistics
      serverAnalyticsData,
      fetchServerAnalytics,

      // Channel Sticky Notices & Topics
      updateChannelNotice,

      // Voice Channel Security & Password Protection
      voicePasswordError,
      clearVoicePasswordError,
      unlockedChannelIds,
      unlockChannel,

      // Message Edit/Delete & Unread Badges
      editMessage,
      deleteMessage,
      sendTyping,
      unreadCounts,
      mentionCounts,
      readCursors,
      markChannelRead,

      // Account Security, Block, Timeout, Invites & UI Themes
      changePassword,
      requestPasswordResetCode,
      confirmPasswordReset,
      requestEmailChangeCode,
      confirmEmailChange,
      revokeSingleSession,
      deleteMyAccount,
      blockUser,
      unblockUser,
      timeoutMember,
      createServerInvite,
      previewServerInvite,
      joinServerByInvite,
      reorderChannel,
      uiTheme,
      setUiTheme,
      customTheme,
      setCustomTheme,
      hasMoreMessages,
      isLoadingOlderMessages,
      requestOlderMessages,
      offlineQueue,
      pendingJumpTarget,
      clearPendingJumpTarget,
      searchServerMessages,
      requestMessageContext,
      jumpToMessage,
      retryQueuedMessage,
      cancelQueuedMessage,
      chatFontSize,
      setChatFontSize,
      glassIntensity,
      setGlassIntensity,
      messageDensity,
      setMessageDensity,
      chatLayout,
      setChatLayout,
      cornerStyle,
      setCornerStyle,
      bgPattern,
      setBgPattern,
      reduceMotion,
      setReduceMotion,
      overlayCorner,
      setOverlayCorner,
      overlayOpacity,
      setOverlayOpacity,
      ringtonePack,
      setRingtonePack,
      showLinkPreviews,
      setShowLinkPreviews,
      customSoundboard,
      addCustomSound,
      removeCustomSound,
      userNotes,
      setUserNote,
      bookmarkedMessages,
      toggleBookmarkMessage,
      reminders,
      addReminder,
      removeReminder,
      connectionState,
      voiceTransportMode,
      newIpAlert,
      dismissNewIpAlert,
      dmReadReceipts,
      markDmRead,
      shouldAutoOpenExplore,
      consumeAutoOpenExplore,
      fetchDiscoverableServers,
      joinPublicServer,
      leaveServer,
    }),
    [
      socket,
      currentUser,
      isAuthenticated,
      servers,
      activeServer,
      activeChannel,
      messages,
      onlineUsers,
      connectedVoiceChannelId,
      isMuted,
      isDeafened,
      isSpeaking,
      isScreenSharing,
      screenStream,
      remoteScreenStreams,
      remoteCameraStreams,
      localDirectCameraStream,
      inputMode,
      pttKey,
      isPttActive,
      friends,
      incomingFriendRequests,
      outgoingFriendRequests,
      activeDMUser,
      directCall,
      directCallToasts,
      isDirectScreenSharing,
      partnerDirectScreenSharing,
      isDirectCameraOn,
      partnerDirectCameraOn,
      unreadDMByUser,
      remoteAssist,
      remoteAssistSafeMode,
      setRemoteAssistSafeMode,
      lastClipboardNotice,
      remoteLaser,
      remoteAnnotations,
      systemAnnouncement,
      pinnedBanner,
      maintenanceStatus,
      audioInputDevices,
      audioOutputDevices,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
      inputSensitivity,
      inputVolume,
      outputVolume,
      isMicTesting,
      micVolumeLevel,
      overlayEnabled,
      detectedGame,
      voicePullInvite,
      voicePullNotice,
      laserPoints,
      hasServerPermission,
      studioAudioDsp,
      aiNoiseSuppression,
      lowLatencyAudio,
      userAudioEq,
      adminData,
      adminFeedback,
      generatedLicense,
      currentServerHost,
      storeSettings,
      myLicenses,
      activeSoundboardEffect,
      radioBotState,
      ping,
      messagesMap,
      language,
      jitter,
      packetLoss,
      pingHistory,
      isDiagnosticsOpen,
      userVolumes,
      userLocalMutes,
      isVoiceRecording,
      voiceRecordingSeconds,
      isWebcamActive,
      webcamStream,
      webcamBlurEnabled,
      remoteWebcamUserIds,
      isPrioritySpeakerActive,
      prioritySpeakerUsername,
      notificationPrefs,
      userPans,
      watchTogetherState,
      miniGameState,
      tsSoundEffectsEnabled,
      soundPack,
      pttBeepEnabled,
      desktopNotificationsEnabled,
      activeWhisperFrom,
      leaderboardData,
      serverAnalyticsData,
      voicePasswordError,
      unlockedChannelIds,
      unreadCounts,
      mentionCounts,
      uiTheme,
      customTheme,
      hasMoreMessages,
      isLoadingOlderMessages,
      chatFontSize,
      glassIntensity,
      messageDensity,
      chatLayout,
      setChatLayout,
      cornerStyle,
      bgPattern,
      reduceMotion,
      overlayCorner,
      overlayOpacity,
      ringtonePack,
      showLinkPreviews,
      customSoundboard,
      userNotes,
      bookmarkedMessages,
      reminders,
      connectionState,
      voiceTransportMode,
      newIpAlert,
      dmReadReceipts,
      shouldAutoOpenExplore,
      readCursors,
      requestPasswordResetCode,
      confirmPasswordReset,
      requestEmailChangeCode,
      confirmEmailChange,
      revokeSingleSession,
      deleteMyAccount,
      markChannelRead,
      offlineQueue,
      pendingJumpTarget,
      clearPendingJumpTarget,
      searchServerMessages,
      requestMessageContext,
      jumpToMessage,
      retryQueuedMessage,
      cancelQueuedMessage,
    ]
  );

  const authValue = useMemo(
    () => ({
      currentUser,
      isAuthenticated,
      connectionState,
      currentServerHost,
      isDedicatedServer: Boolean(localStorage.getItem('dc_dedicated_server_host')),
      language,
      setLanguage,
      uiTheme,
      setUiTheme,
      maintenanceStatus,
      login,
      verify2faLogin,
      register,
      requestRegisterChallenge,
      sendRegisterEmailCode,
      logout,
      changePassword,
      requestPasswordResetCode,
      confirmPasswordReset,
      requestEmailChangeCode,
      confirmEmailChange,
      revokeSingleSession,
      deleteMyAccount,
      connectToDedicatedServer,
      resetToMainServer,
    }),
    [
      currentUser,
      isAuthenticated,
      connectionState,
      currentServerHost,
      language,
      setLanguage,
      uiTheme,
      setUiTheme,
      maintenanceStatus,
      login,
      verify2faLogin,
      register,
      requestRegisterChallenge,
      sendRegisterEmailCode,
      logout,
      changePassword,
      requestPasswordResetCode,
      confirmPasswordReset,
      requestEmailChangeCode,
      confirmEmailChange,
      revokeSingleSession,
      deleteMyAccount,
      connectToDedicatedServer,
      resetToMainServer,
    ]
  );

  const chatValue = useMemo(
    () => ({
      servers,
      activeServer,
      activeChannel,
      messages,
      messagesMap,
      onlineUsers,
      activeDMUser,
      unreadCounts,
      mentionCounts,
      readCursors,
      hasMoreMessages,
      isLoadingOlderMessages,
      dmReadReceipts,
      offlineQueue,
      pendingJumpTarget,
      clearPendingJumpTarget,
      selectServer,
      selectChannel,
      openDirectMessage,
      closeDirectMessage,
      sendMessage,
      editMessage,
      deleteMessage,
      sendTyping,
      markChannelRead,
      markDmRead,
      requestOlderMessages,
      searchServerMessages,
      requestMessageContext,
      jumpToMessage,
      retryQueuedMessage,
      cancelQueuedMessage,
      addReaction,
      togglePinMessage,
      sendThreadMessage,
      chatLayout,
      setChatLayout,
    }),
    [
      servers,
      activeServer,
      activeChannel,
      messages,
      messagesMap,
      onlineUsers,
      activeDMUser,
      unreadCounts,
      mentionCounts,
      readCursors,
      hasMoreMessages,
      isLoadingOlderMessages,
      dmReadReceipts,
      offlineQueue,
      pendingJumpTarget,
      clearPendingJumpTarget,
      openDirectMessage,
      closeDirectMessage,
      editMessage,
      deleteMessage,
      sendTyping,
      markChannelRead,
      markDmRead,
      requestOlderMessages,
      searchServerMessages,
      requestMessageContext,
      jumpToMessage,
      retryQueuedMessage,
      cancelQueuedMessage,
      addReaction,
      togglePinMessage,
      sendThreadMessage,
      chatLayout,
      setChatLayout,
    ]
  );

  const voiceValue = useMemo(
    () => ({
      connectedVoiceChannelId,
      isMuted,
      isDeafened,
      isSpeaking,
      isScreenSharing,
      screenStream,
      remoteScreenStreams,
      remoteCameraStreams,
      inputMode,
      pttKey,
      isPttActive,
      voiceTransportMode,
      isWebcamActive,
      webcamStream,
      isPrioritySpeakerActive,
      prioritySpeakerUsername,
      ping,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      startScreenShare,
      stopScreenShare,
      setInputMode,
      setPttKey,
      toggleRaiseHand,
      toggleWebcam,
      togglePrioritySpeaker,
    }),
    [
      connectedVoiceChannelId,
      isMuted,
      isDeafened,
      isSpeaking,
      isScreenSharing,
      screenStream,
      remoteScreenStreams,
      remoteCameraStreams,
      inputMode,
      pttKey,
      isPttActive,
      voiceTransportMode,
      isWebcamActive,
      webcamStream,
      isPrioritySpeakerActive,
      prioritySpeakerUsername,
      ping,
      toggleRaiseHand,
      toggleWebcam,
      togglePrioritySpeaker,
    ]
  );

  const socialValue = useMemo(
    () => ({
      friends,
      incomingFriendRequests,
      outgoingFriendRequests,
      directCall,
      directCallToasts,
      unreadDMByUser,
      remoteAssist,
      dismissDirectCallToast,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      cancelFriendRequest,
      removeFriend,
      fetchFriendsData,
      startDirectCall,
      acceptDirectCall,
      declineDirectCall,
      endDirectCall,
      blockUser,
      unblockUser,
      updateProfile,
    }),
    [
      friends,
      incomingFriendRequests,
      outgoingFriendRequests,
      directCall,
      directCallToasts,
      unreadDMByUser,
      remoteAssist,
      dismissDirectCallToast,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      cancelFriendRequest,
      removeFriend,
      fetchFriendsData,
      startDirectCall,
      acceptDirectCall,
      declineDirectCall,
      endDirectCall,
      blockUser,
      unblockUser,
    ]
  );

  return (
    <SocketContext.Provider value={contextValue}>
      <AuthContext.Provider value={authValue}>
        <ChatContext.Provider value={chatValue}>
          <VoiceContext.Provider value={voiceValue}>
            <SocialContext.Provider value={socialValue}>
              {children}
            </SocialContext.Provider>
          </VoiceContext.Provider>
        </ChatContext.Provider>
      </AuthContext.Provider>
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
