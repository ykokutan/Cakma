import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, Server, ServerInvite, Channel, Message, ThreadMessage, AuditLog, SystemStats, DedicatedServerInfo, IssuedLicense, StoreSettings, MessageAttachment, DirectCallState, FriendRequest, FriendUser, ServerRole, ServerMember, ServerPermission, UserActivity, PollData, UserConnectionRecord, WatchTogetherState, MiniGameState, MemberLevelData, ServerAnalyticsData, ScreenShareSettings } from '../types';
import { playSynthesizedSound } from '../utils/soundEffects';
import { playTeamSpeakChime, sendDesktopNotification, requestDesktopNotificationPermission, SoundPackType } from '../utils/tsSoundEffects';

export interface RadioBotState {
  isPlaying: boolean;
  mode?: 'radio' | 'youtube';
  stationId?: string;
  youtubeId?: string;
  youtubeTitle?: string;
  volume: number;
}

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
  startDirectCall: (targetUser: User) => void;
  acceptDirectCall: () => void;
  declineDirectCall: () => void;
  endDirectCall: () => void;
  updateProfileDetails: (details: { statusMessage?: string; bio?: string; bannerColor?: string; bannerImage?: string; avatar?: string; status?: 'online' | 'idle' | 'dnd' | 'offline' }) => void;

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
  joinVoiceChannel: (channelId: string, password?: string) => void;
  moveVoiceUser: (targetUserId: string, targetChannelId: string) => void;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  startScreenShare: (settings?: ScreenShareSettings, preCapturedStream?: MediaStream | null) => Promise<void>;
  stopScreenShare: () => void;
  setInputMode: (mode: 'vad' | 'ptt') => void;
  setPttKey: (key: string) => void;
  createServer: (name: string, icon?: string) => void;
  createChannel: (name: string, type: 'text' | 'voice', options?: { isLocked?: boolean; password?: string; topic?: string }) => void;
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
    systemChannelId?: string | null;
    verificationLevel?: 'none' | 'low' | 'medium' | 'high';
    defaultNotification?: 'all' | 'mentions';
    autoModEnabled?: boolean;
    vanityCode?: string;
    welcomeChannelId?: string | null;
    welcomeMessage?: string;
    welcomeEnabled?: boolean;
    autoRoleId?: string | null;
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
  register: (data: { username: string; email: string; password: string; avatar: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Audio Device Handlers
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setNoiseSuppression: (val: boolean) => void;
  setEchoCancellation: (val: boolean) => void;
  setAutoGainControl: (val: boolean) => void;
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
      maintenanceMode: boolean;
      maintenanceMessage?: string;
      maxMessageLength: number;
      defaultSlowmodeSeconds: number;
      maxUploadSizeMb: number;
      requireStrongPasswords: boolean;
      maxLoginAttempts?: number;
      loginLockoutMinutes?: number;
      globalBlockLinks?: boolean;
      globalBannedWords?: string[];
      pinnedBanner?: { message: string; sender: string; updatedAt: string } | null;
      autoBackupEnabled?: boolean;
      autoBackupIntervalHours?: number;
      maxBackupsToKeep?: number;
      webhookUrl?: string;
      webhookEvents?: {
        security?: boolean;
        bans?: boolean;
        dedicated?: boolean;
        backups?: boolean;
      };
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
  } | null;
  fetchAdminData: () => void;
  adminUpdateSystemConfig: (cfg: {
    registrationEnabled?: boolean;
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    maxMessageLength?: number;
    defaultSlowmodeSeconds?: number;
    maxUploadSizeMb?: number;
    requireStrongPasswords?: boolean;
    maxLoginAttempts?: number;
    loginLockoutMinutes?: number;
    globalBlockLinks?: boolean;
    globalBannedWords?: string[];
    autoBackupEnabled?: boolean;
    autoBackupIntervalHours?: number;
    maxBackupsToKeep?: number;
    webhookUrl?: string;
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
  typingUsers: Record<string, string[]>;
  sendTyping: (isTyping: boolean) => void;
  unreadCounts: Record<string, number>;
  mentionCounts: Record<string, number>;

  // Account Security, Block, Timeout, Invites & UI Themes
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
  uiTheme: 'vision-dark' | 'midnight-blue' | 'cyber-emerald' | 'amber-gold';
  setUiTheme: (theme: 'vision-dark' | 'midnight-blue' | 'cyber-emerald' | 'amber-gold') => void;
  chatFontSize: 'sm' | 'base' | 'lg';
  setChatFontSize: (size: 'sm' | 'base' | 'lg') => void;

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

  // Webcam & Priority Speaker
  isWebcamActive: boolean;
  toggleWebcam: () => Promise<void>;
  webcamStream: MediaStream | null;
  remoteWebcamUserIds: string[];
  isPrioritySpeakerActive: boolean;
  prioritySpeakerUsername: string | null;
  togglePrioritySpeaker: () => void;

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

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

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
      return `a=fmtp:${pt} ${clean};maxaveragebitrate=${targetBitrate};stereo=1;sprop-stereo=1;cbr=1;useinbandfec=1`;
    });
  } else {
    return sdp.replace(
      new RegExp(`(a=rtpmap:${pt}\\s+opus\\/48000[^\r\n]*)`, 'i'),
      `$1\r\na=fmtp:${pt} minptime=10;useinbandfec=1;maxaveragebitrate=${targetBitrate};stereo=1;sprop-stereo=1;cbr=1`
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
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const activeChannelIdRef = useRef<string>('');
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [uiTheme, setUiThemeState] = useState<'vision-dark' | 'midnight-blue' | 'cyber-emerald' | 'amber-gold'>(() => {
    return (localStorage.getItem('dc_ui_theme') as any) || 'vision-dark';
  });
  const [chatFontSize, setChatFontSizeState] = useState<'sm' | 'base' | 'lg'>(() => {
    return (localStorage.getItem('dc_chat_font_size') as any) || 'base';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    try { localStorage.setItem('dc_ui_theme', uiTheme); } catch {}
  }, [uiTheme]);

  const setUiTheme = (theme: 'vision-dark' | 'midnight-blue' | 'cyber-emerald' | 'amber-gold') => {
    setUiThemeState(theme);
  };

  const setChatFontSize = (size: 'sm' | 'base' | 'lg') => {
    setChatFontSizeState(size);
    try { localStorage.setItem('dc_chat_font_size', size); } catch {}
  };
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [connectedVoiceChannelId, setConnectedVoiceChannelId] = useState<string | null>(null);
  const [systemAnnouncement, setSystemAnnouncement] = useState<{ sender: string; message: string; timestamp: string } | null>(null);
  const [pinnedBanner, setPinnedBanner] = useState<{ message: string; sender: string; updatedAt: string } | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const [currentServerHost, setCurrentServerHost] = useState<string>('localhost:4000');

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
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);

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
    if (!socket || !socket.connected) return;
    measurePing();
    const intervalMs = isDiagnosticsOpen ? 1000 : 4000;
    const interval = setInterval(() => {
      measurePing();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [socket, isDiagnosticsOpen, measurePing]);

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
    } catch (err: any) {
      alert('Ses kaydı başlatılamadı: ' + (err?.message || err));
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

  // Webcam State
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [remoteWebcamUserIds, setRemoteWebcamUserIds] = useState<string[]>([]);

  const toggleWebcam = useCallback(async () => {
    if (isWebcamActive) {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
      setWebcamStream(null);
      setIsWebcamActive(false);
      socket?.emit('webcam_state_update', { active: false });

      for (const pc of peerConnectionsRef.current.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          pc.removeTrack(videoSender);
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 24 }
        });
        webcamStreamRef.current = stream;
        setWebcamStream(stream);
        setIsWebcamActive(true);
        socket?.emit('webcam_state_update', { active: true });

        const videoTrack = stream.getVideoTracks()[0];
        for (const pc of peerConnectionsRef.current.values()) {
          pc.addTrack(videoTrack, stream);
        }
      } catch (err) {
        alert('Kamera açılamadı. Lütfen kamera erişim izinlerinizi kontrol edin.');
      }
    }
  }, [isWebcamActive, socket]);

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
        alert('Tarayıcı bildirim izni verilmedi. Lütfen tarayıcı ayarlarından bildirimlere izin verin.');
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
    ? `dm-${[currentUser.id, activeDMUser.id].sort().join('-')}`
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
    if (localStreamRef.current && !forceNew) return localStreamRef.current;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('Mikrofon erişimi için güvenli bağlantı (HTTPS veya localhost) gereklidir. Tarayıcınız HTTP üzerinden mikrofon iznine izin vermiyor.');
      return null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioCtx();
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
        source.connect(gainNode);
        gainNode.connect(analyser);

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
          setMicVolumeLevel(normalizedLevel);

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

      const newAudioTrack = stream.getAudioTracks()[0];
      for (const pc of peerConnectionsRef.current.values()) {
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(newAudioTrack);
        }
      }

      return stream;
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

    audioElementsRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

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

    newSocket.on('connect_error', (err: any) => {
      console.warn('Socket bağlantı hatası:', err?.message);
      const errMsg = err?.message || '';
      if (errMsg.includes('LİSANS_İPTAL') || errMsg.includes('LISANS_IPTAL') || errMsg.includes('YETKISIZ') || errMsg.includes('YETKİSİZ')) {
        alert(`⛔ Bağlantı Reddedildi:\n\n${errMsg}\n\nÖzel sunucunun lisansı iptal edildiği için ana sunucuya (localhost:4000) yönlendiriliyorsunuz.`);
        resetToMainServer();
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to backend:', newSocket.id);
      newSocket.emit('get_store_settings');
      newSocket.emit('get_my_licenses');
      const currentSavedAuth = localStorage.getItem('dc_clone_auth');
      if (currentSavedAuth) {
        try {
          const creds = JSON.parse(currentSavedAuth);
          if (creds.token) {
            newSocket.emit('auth_token_login', { token: creds.token });
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

    newSocket.on('auth_response', (res: { success: boolean; user?: User; token?: string; tokenExpired?: boolean; error?: string }) => {
      if (res.success && res.user) {
        if (res.token) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({
            token: res.token,
            username: res.user.username,
            avatar: res.user.avatar
          }));
        }
        setCurrentUser(res.user);
        setIsAuthenticated(true);
      } else if (res.tokenExpired) {
        localStorage.removeItem('dc_clone_auth');
        setIsAuthenticated(false);
        setCurrentUser(null);
      } else if (res.error && (res.error.includes('LİSANS') || res.error.includes('LISANS'))) {
        alert(`⛔ Giriş Engellendi:\n\n${res.error}\n\nAna sunucuya yönlendiriliyorsunuz.`);
        resetToMainServer();
      }
    });

    newSocket.on('init_data', (data: {
      currentUser: User;
      servers: Server[];
      onlineUsers: User[];
      messages: Record<string, Message[]>;
    }) => {
      setCurrentUser(data.currentUser);
      setIsAuthenticated(data.currentUser.role === 'admin' || !!data.currentUser.email || !!savedAuth);
      setServers(data.servers);
      setOnlineUsers(data.onlineUsers);
      setMessagesMap(data.messages);

      if (data.servers.length > 0) {
        setActiveServerId(data.servers[0].id);
        const firstTextCh = data.servers[0].channels.find(c => c.type === 'text');
        if (firstTextCh) setActiveChannelId(firstTextCh.id);
      }
    });

    newSocket.on('new_message', (msg: Message) => {
      setMessagesMap(prev => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] || []), msg]
      }));

      if (msg.channelId !== activeChannelIdRef.current && msg.author?.username !== currentUserRef.current?.username) {
        setUnreadCounts(prev => ({
          ...prev,
          [msg.channelId]: (prev[msg.channelId] || 0) + 1
        }));
        const isMention = Boolean(
          currentUserRef.current &&
          msg.content &&
          msg.content.toLowerCase().includes('@' + currentUserRef.current.username.toLowerCase())
        );
        if (isMention) {
          setMentionCounts(prev => ({
            ...prev,
            [msg.channelId]: (prev[msg.channelId] || 0) + 1
          }));
        }
      }

      // Desktop Push Notification
      if (desktopNotificationsRef.current && currentUserRef.current && msg.author?.id !== currentUserRef.current.id) {
        const isMention = msg.content && msg.content.includes('@' + currentUserRef.current.username);
        const isDM = msg.channelId.startsWith('dm-');
        if (isMention || isDM) {
          sendDesktopNotification(
            isDM ? `Direkt Mesaj (@${msg.author.username})` : `@${msg.author.username} senden bahsetti`,
            msg.content || 'Yeni bir ek veya mesaj paylaşıldı'
          );
        }
      }
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
      setTypingUsers(prev => {
        const list = prev[channelId] || [];
        if (isTyping) {
          if (list.includes(username)) return prev;
          return { ...prev, [channelId]: [...list, username] };
        } else {
          return { ...prev, [channelId]: list.filter(u => u !== username) };
        }
      });
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
      setServers(prev => [...prev, newServer]);
    });

    newSocket.on('server_updated', (updatedServer: Server) => {
      setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
      if (updatedServer.bitrateKbps) {
        peerConnectionsRef.current.forEach((pc) => {
          applyAudioBitrate(pc, updatedServer.bitrateKbps!);
        });
      }
    });

    newSocket.on('server_deleted', ({ serverId }: { serverId: string }) => {
      setServers(prev => prev.filter(s => s.id !== serverId));
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
      alert(message);
    });

    newSocket.on('chat_flood_error', ({ message }: { message: string }) => {
      alert(`⚠️ ${message}`);
    });

    newSocket.on('file_security_error', ({ message }: { message: string }) => {
      alert(`🛡️ ${message}`);
    });

    newSocket.on('user_connected', (newUser: User) => {
      setOnlineUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    });

    newSocket.on('user_updated', (updatedUser: User) => {
      setOnlineUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (updatedUser.id === newSocket.id) {
        setCurrentUser(updatedUser);
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
    });

    newSocket.on('afk_moved', ({ channelId, channelName }: { channelId: string; channelName: string }) => {
      setConnectedVoiceChannelId(channelId);
      setIsMuted(true);
      sendDesktopNotification('AFK Taşıma', `Hareketsiz kaldığınız için "${channelName}" odasına taşındınız.`);
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
      alert(`⚠️ ${data.title || 'Sunucu Lisansı İptal Edildi'}\n\n${data.reason}\n\nÖzel sunucu kapatıldığı için ana sunucuya yönlendiriliyorsunuz.`);
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
      alert(`Sunucudan atıldınız!\nSebep: ${reason}`);
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

    // WebRTC Signaling Events
    newSocket.on('voice_room_users', async ({ peers }: { peers: User[] }) => {
      const localStream = await getLocalAudioStream();
      if (!localStream) return;

      for (const peer of peers) {
        const pc = createPeerConnection(peer.id, localStream, newSocket);
        peerConnectionsRef.current.set(peer.id, pc);

        const offer = await pc.createOffer();
        const targetKbps = activeServerRef.current?.bitrateKbps || 128;
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
        const answer = await pc.createAnswer();
        const targetKbps = activeServerRef.current?.bitrateKbps || 128;
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
      } else if (type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (type === 'candidate') {
        if (pc && signal) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } catch (e) {
            console.warn('ICE candidate addition error:', e);
          }
        }
      }
    });

    // Direct 1-on-1 Voice Calling Listeners
    newSocket.on('direct_call_incoming', ({ callerUser }: { callerUser: User }) => {
      setDirectCall({
        partner: callerUser,
        status: 'incoming',
        isMuted: false,
        isDeafened: false,
        durationSeconds: 0
      });
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
      alert(reason || 'Arama reddedildi.');
      setDirectCall(null);
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
      }
      setDirectCall(null);
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
        if (tsSoundEffectsRef.current) {
          playTeamSpeakChime('levelup');
        }
        sendDesktopNotification('Tebrikler! 🎉', `Seviye ${level}'e yükseldiniz!`);
      }
    });

    // 6. Server Analytics Data
    newSocket.on('server_analytics_data', ({ data }: { serverId: string; data: ServerAnalyticsData }) => {
      setServerAnalyticsData(data);
    });

    // 7. Voice Password Error
    newSocket.on('voice_password_error', ({ message }: { channelId: string; channelName: string; message: string }) => {
      setVoicePasswordError(message);
      setConnectedVoiceChannelId(null);
      cleanupWebRTC();
    });

    return () => {
      cleanupWebRTC();
      newSocket.disconnect();
    };
  }, [cleanupWebRTC]);

  const createPeerConnection = (peerId: string, localStream: MediaStream, activeSocket: Socket): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, screenStreamRef.current!));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        activeSocket.emit('webrtc_signal', {
          targetUserId: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        const stream = event.streams[0];
        setRemoteScreenStreams(prev => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      } else {
        let audio = audioElementsRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(peerId, audio);
        }
        audio.srcObject = event.streams[0];
        const userVol = userVolumes[peerId] ?? 100;
        const isLocallyMuted = userLocalMutes[peerId] ?? false;
        audio.muted = isDeafened || isLocallyMuted;
        audio.volume = Math.min(1, Math.max(0, (outputVolume / 100) * (userVol / 100)));
        if ('setSinkId' in audio && selectedOutputDeviceId) {
          (audio as any).setSinkId(selectedOutputDeviceId).catch(() => {});
        }
      }
    };

    return pc;
  };

  // Push-to-Talk Keybind listener
  useEffect(() => {
    if (inputMode !== 'ptt' || !connectedVoiceChannelId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === pttKey && !isPttActive) {
        setIsPttActive(true);
        if (pttBeepRef.current && tsSoundEffectsRef.current) {
          playTeamSpeakChime('ptt_on');
        }
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !isMuted));
        }
        socket?.emit('user_speaking', { isSpeaking: true });
        setIsSpeaking(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === pttKey && isPttActive) {
        setIsPttActive(false);
        if (pttBeepRef.current && tsSoundEffectsRef.current) {
          playTeamSpeakChime('ptt_off');
        }
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = false));
        }
        socket?.emit('user_speaking', { isSpeaking: false });
        setIsSpeaking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inputMode, pttKey, isPttActive, connectedVoiceChannelId, isMuted, socket]);

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
      socket.once('auth_response', (res: { success: boolean; user?: User; token?: string; requires2fa?: boolean; pending2faToken?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({ token: res.token, username: res.user.username, avatar: res.user.avatar }));
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
      socket.once('auth_response', (res: { success: boolean; user?: User; token?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({ token: res.token, username: res.user.username, avatar: res.user.avatar }));
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          resolve({ success: true });
        } else {
          resolve({ success: false, error: res.error || '2FA doğrulama başarısız oldu.' });
        }
      });
    });
  };

  const register = (data: { username: string; email: string; password: string; avatar: string }): Promise<{ success: boolean; error?: string }> => {
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
      socket.once('auth_response', (res: { success: boolean; user?: User; token?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({ token: res.token, username: res.user.username, avatar: res.user.avatar }));
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
    socket?.emit('auth_logout');
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
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    maxMessageLength?: number;
    defaultSlowmodeSeconds?: number;
    maxUploadSizeMb?: number;
    requireStrongPasswords?: boolean;
    maxLoginAttempts?: number;
    loginLockoutMinutes?: number;
    globalBlockLinks?: boolean;
    globalBannedWords?: string[];
    autoBackupEnabled?: boolean;
    autoBackupIntervalHours?: number;
    maxBackupsToKeep?: number;
    webhookUrl?: string;
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
    if (currentUser) {
      const dmId = `dm-${[currentUser.id, user.id].sort().join('-')}`;
      setActiveChannelId(dmId);
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
    setDirectCall({
      partner: targetUser,
      status: 'calling',
      isMuted: false,
      isDeafened: false,
      durationSeconds: 0
    });
    socket.emit('direct_call_start', { targetUserId: targetUser.id });
  }, [socket, currentUser]);

  const acceptDirectCall = useCallback(async () => {
    if (!socket || !directCall || !currentUser) return;
    const partner = directCall.partner;
    socket.emit('direct_call_accept', { callerUserId: partner.id });

    setDirectCall(prev => prev ? { ...prev, status: 'connected' } : null);

    const localStream = await getLocalAudioStream();
    if (localStream) {
      const pc = createPeerConnection(partner.id, localStream, socket);
      peerConnectionsRef.current.set(partner.id, pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_signal', {
        targetUserId: partner.id,
        signal: offer,
        type: 'offer'
      });
    }
  }, [socket, directCall, currentUser]);

  const declineDirectCall = useCallback(() => {
    if (!socket || !directCall) return;
    socket.emit('direct_call_decline', { callerUserId: directCall.partner.id });
    setDirectCall(null);
  }, [socket, directCall]);

  const endDirectCall = useCallback(() => {
    if (!socket || !directCall) return;
    socket.emit('direct_call_end', { targetUserId: directCall.partner.id });
    if (peerConnectionsRef.current.has(directCall.partner.id)) {
      peerConnectionsRef.current.get(directCall.partner.id)?.close();
      peerConnectionsRef.current.delete(directCall.partner.id);
    }
    if (audioElementsRef.current.has(directCall.partner.id)) {
      audioElementsRef.current.get(directCall.partner.id)?.remove();
      audioElementsRef.current.delete(directCall.partner.id);
    }
    setDirectCall(null);
  }, [socket, directCall]);

  const updateProfileDetails = useCallback(({ statusMessage, bio, bannerColor, bannerImage, avatar, status }: { statusMessage?: string; bio?: string; bannerColor?: string; bannerImage?: string; avatar?: string; status?: 'online' | 'idle' | 'dnd' | 'offline' }) => {
    if (!socket) return;
    socket.emit('update_profile', { statusMessage, bio, bannerColor, bannerImage, avatar, status });
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
    const server = servers.find(s => s.id === serverId);
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
    if (!socket || !activeServer || !activeChannel) return;
    socket.emit('send_message', {
      serverId: activeServer.id,
      channelId: activeChannel.id,
      content,
      attachments,
      replyTo
    });
  };

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

  const toggleOverlayWindow = useCallback(async () => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toggle_overlay_window');
    } catch (err) {
      console.warn('Overlay toggle failed:', err);
    }
  }, []);

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

  const leaveVoiceChannel = () => {
    if (!socket || !connectedVoiceChannelId) return;
    cleanupWebRTC();
    socket.emit('leave_voice');
    setConnectedVoiceChannelId(null);
  };

  const toggleMute = () => {
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
      alert('Ekran paylaşımı için güvenli bağlantı (HTTPS veya localhost) gereklidir.');
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
          audio: settings?.audioEnabled ?? false,
        }));

      const videoTrack = rawStream.getVideoTracks()[0];
      if (videoTrack && preCapturedStream) {
        await videoTrack.applyConstraints(videoConstraint).catch(() => {});
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

      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        for (const track of broadcastStream.getTracks()) {
          const sender = pc.addTrack(track, broadcastStream);
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = track.kind === 'video' ? videoBitrateBps : audioBitrateBps;
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

  const createServer = (name: string, icon?: string) => {
    if (!socket || !name.trim()) return;
    socket.emit('create_server', { name: name.trim(), icon });
  };

  const createChannel = (
    name: string,
    type: 'text' | 'voice',
    options?: { isLocked?: boolean; password?: string; topic?: string }
  ) => {
    if (!socket || !activeServer || !name.trim()) return;
    socket.emit('create_channel', {
      serverId: activeServer.id,
      name: name.trim(),
      type,
      isLocked: options?.isLocked,
      password: options?.password,
      topic: options?.topic
    });
  };

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
    if (activeServer.ownerId === currentUser.id || currentUser.role === 'admin') return true;
    const member = activeServer.members?.find(m => m.userId === currentUser.id || m.username === currentUser.username);
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
      const handler = (res: { success: boolean; serverId?: string; serverName?: string; error?: string }) => {
        socket.off('join_invite_response', handler);
        if (res.success && res.serverId) {
          setActiveServerId(res.serverId);
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

  // Tauri Desktop Integrations: Tray Mute, Global Shortcuts, Game Detection, Overlay Sync
  const toggleMuteRef = useRef(toggleMute);
  const toggleDeafenRef = useRef(toggleDeafen);
  useEffect(() => {
    toggleMuteRef.current = toggleMute;
    toggleDeafenRef.current = toggleDeafen;
  });

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;

    let unlistenTray: (() => void) | null = null;
    let gameTimer: ReturnType<typeof setInterval> | null = null;
    let lastDetectedGame: string | null = null;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenTray = await listen('tray-toggle-mute', () => {
          toggleMuteRef.current();
        });
      } catch {
        // ignore
      }

      try {
        const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
        await unregisterAll().catch(() => {});
        await register('CommandOrControl+Shift+M', (e) => {
          if (e.state === 'Pressed') toggleMuteRef.current();
        }).catch(() => {});
        await register('CommandOrControl+Shift+D', (e) => {
          if (e.state === 'Pressed') toggleDeafenRef.current();
        }).catch(() => {});
      } catch {
        // ignore
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const pollGame = async () => {
          if (!socket || !isAuthenticated) return;
          try {
            const game = await invoke<string | null>('detect_running_game');
            if (game !== lastDetectedGame) {
              lastDetectedGame = game;
              socket.emit('update_activity', game ? { type: 'playing', name: game } : null);
            }
          } catch {
            // ignore
          }
        };
        pollGame();
        gameTimer = setInterval(pollGame, 25000);
      } catch {
        // ignore
      }
    })();

    return () => {
      if (unlistenTray) unlistenTray();
      if (gameTimer) clearInterval(gameTimer);
      import('@tauri-apps/plugin-global-shortcut')
        .then(({ unregisterAll }) => unregisterAll())
        .catch(() => {});
    };
  }, [socket, isAuthenticated]);

  // Emit speaker updates to Tauri Overlay window
  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    if (typeof window !== 'undefined' && window.location.search.includes('overlay=1')) return;

    const speakers = onlineUsers
      .filter((u) => connectedVoiceChannelId && u.currentVoiceChannelId === connectedVoiceChannelId)
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        isSpeaking: u.id === currentUser?.id ? isSpeaking : u.isSpeaking,
        isMuted: u.id === currentUser?.id ? isMuted : u.isMuted,
        isHandRaised: u.isHandRaised,
      }));

    import('@tauri-apps/api/event')
      .then(({ emit }) => emit('overlay-speakers-update', { speakers, inVoice: Boolean(connectedVoiceChannelId) }))
      .catch(() => {});
  }, [onlineUsers, connectedVoiceChannelId, isSpeaking, isMuted, currentUser]);

  return (
    <SocketContext.Provider
      value={{
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
        startDirectCall,
        acceptDirectCall,
        declineDirectCall,
        endDirectCall,
        updateProfileDetails,

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
        joinVoiceChannel,
        moveVoiceUser,
        leaveVoiceChannel,
        toggleMute,
        toggleDeafen,
        startScreenShare,
        stopScreenShare,
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
        logout,

        // Audio Device Handlers
        setSelectedInputDeviceId,
        setSelectedOutputDeviceId,
        setNoiseSuppression,
        setEchoCancellation,
        setAutoGainControl,
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

        // Webcam & Priority Speaker
        isWebcamActive,
        toggleWebcam,
        webcamStream,
        remoteWebcamUserIds,
        isPrioritySpeakerActive,
        prioritySpeakerUsername,
        togglePrioritySpeaker,

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

        // Message Edit/Delete, Typing & Unread Badges
        editMessage,
        deleteMessage,
        typingUsers,
        sendTyping,
        unreadCounts,
        mentionCounts,

        // Account Security, Block, Timeout, Invites & UI Themes
        changePassword,
        blockUser,
        unblockUser,
        timeoutMember,
        createServerInvite,
        previewServerInvite,
        joinServerByInvite,
        reorderChannel,
        uiTheme,
        setUiTheme,
        chatFontSize,
        setChatFontSize,
      }}
    >
      {children}
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
