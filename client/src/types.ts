export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type UserRole = 'admin' | 'user';

export interface UserActivity {
  type: 'playing' | 'listening' | 'streaming' | 'custom';
  name: string;
  details?: string;
  emoji?: string;
  startedAt?: number;
  expiresAt?: number;
}

export interface UserBadge {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  toUserId: string;
  toUsername: string;
  createdAt: string;
}

export interface FriendUser {
  id: string;
  username: string;
  avatar: string;
  status: UserStatus;
  statusMessage?: string;
  role: UserRole;
  currentVoiceChannelId?: string;
  addedAt?: string;
  e2eePublicKey?: string;
}

export type AvatarFrameId =
  | 'none'
  | 'gold'
  | 'neon'
  | 'emerald'
  | 'crimson'
  | 'rainbow'
  | 'aurora'
  | 'cyberpunk'
  | 'phoenix'
  | 'diamond';

export type NameGradientId = 'none' | 'gold' | 'ocean' | 'sunset' | 'matrix' | 'royal';

export interface ServerFolderEntry {
  id: string;
  name: string;
  color: string;
  serverIds: string[];
  collapsed: boolean;
}

export type VerifiedProviderId = 'steam' | 'github' | 'google';

export interface VerifiedConnection {
  provider: VerifiedProviderId;
  externalId: string;
  username: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  metadata?: {
    gameCount?: number;
    currentGame?: string;
    publicRepos?: number;
    email?: string;
  };
  showOnProfile: boolean;
  verifiedAt: string;
}

export interface User {
  id: string;
  accountId?: string;
  username: string;
  email?: string;
  role: UserRole;
  avatar: string;
  status: UserStatus;
  currentVoiceChannelId?: string;
  isMuted: boolean;
  isDeafened: boolean;
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  isSpeaking: boolean;
  isHandRaised?: boolean;
  isScreenSharing?: boolean;
  createdAt?: string;
  walletBalance?: number;
  statusMessage?: string;
  bannerColor?: string;
  bannerImage?: string;
  bannerPosition?: 'top' | 'center' | 'bottom';
  avatarFrame?: AvatarFrameId;
  nameGradient?: NameGradientId;
  unlockedCosmetics?: string[];
  pinnedBadgeId?: string;
  socialLinks?: { steam?: string; github?: string; website?: string };
  verifiedConnections?: VerifiedConnection[];
  bio?: string;
  badges?: UserBadge[];
  friends?: string[];
  blockedUsers?: string[];
  activity?: UserActivity;
  level?: number;
  xp?: number;
  twoFactorEnabled?: boolean;
  e2eePublicKey?: string;
  acceptedTermsAt?: string;
  acceptedTermsVersion?: string;
  serverFolders?: ServerFolderEntry[];
}

export interface EncryptedAttachmentMeta {
  iv: string;
  origName: string;
  origType: string;
  origSize: number;
  v: 1;
}

export interface MessageAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  e2ee?: EncryptedAttachmentMeta;
  groupE2ee?: {
    epoch: number;
    ivBase64: string;
    origName: string;
    origType: string;
    origSize: number;
  };
}

export interface DirectCallState {
  partner: User;
  status: 'calling' | 'incoming' | 'connected' | 'ended';
  isMuted: boolean;
  isDeafened: boolean;
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  durationSeconds: number;
}

export type LicenseStatus = 'active' | 'revoked' | 'expired' | 'pending_payment';

export interface IssuedLicense {
  id: string;
  licenseKey: string;
  licensee: string;
  assignedUsername: string;
  assignedUserId?: string;
  maxSlots: number;
  tier: 'Starter' | 'Pro' | 'Enterprise';
  status: LicenseStatus;
  issuedAt: string;
  expiresAt: string;
  price?: number;
  source: 'admin' | 'store';
  activeServerHost?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  type: 'info' | 'warn' | 'voice' | 'auth';
}

export interface UserConnectionRecord {
  id: string;
  socketId: string;
  username: string;
  role: 'admin' | 'user';
  ip: string;
  userAgent: string;
  connectedServer: string;
  connectedChannel: string;
  connectedAt: string;
  disconnectedAt?: string;
  durationText?: string;
  status: 'online' | 'disconnected';
  lastActiveAt?: string;
}

export interface DedicatedServerInfo {
  id: string;
  serverName: string;
  host: string;
  port: number;
  licenseKey: string;
  licensee: string;
  tier: string;
  maxSlots: number;
  onlineCount: number;
  channelsCount: number;
  uptimeSeconds: number;
  lastHeartbeat: string;
  status: 'online' | 'offline' | 'revoked';
}

export interface StorePackageConfig {
  tier: 'Starter' | 'Pro' | 'Enterprise';
  name: string;
  slots: number;
  price: number;
  enabled: boolean;
  description: string;
}

export interface StorePaymentMethod {
  id: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  name: string;
  enabled: boolean;
  icon: string;
  description: string;
}

export interface StoreSettings {
  isOpen: boolean;
  closedReason?: string;
  currencySymbol: string;
  customSlotUnitPrice: number;
  discountPercentage: number;
  campaignBanner?: string;
  durationMultipliers?: {
    days90: number;
    days180: number;
    days365: number;
    lifetime: number;
  };
  allowCustomSlots?: boolean;
  minCustomSlots?: number;
  maxCustomSlots?: number;
  allowLifetimePurchase?: boolean;
  renewalDiscountPercentage?: number;
  packages: {
    starter: StorePackageConfig;
    pro: StorePackageConfig;
    enterprise: StorePackageConfig;
  };
  paymentMethods: StorePaymentMethod[];
}

export interface SystemStats {
  uptime: number;
  memoryMB: number;
  totalRegisteredUsers: number;
  activeSocketsCount: number;
  activeVoiceRoomsCount: number;
  totalMessagesCount: number;
  totalDedicatedServersCount?: number;
}

export type ServerPermission =
  | 'manage_server'
  | 'manage_roles'
  | 'manage_channels'
  | 'kick_members'
  | 'ban_members'
  | 'send_messages'
  | 'attach_files'
  | 'connect_voice'
  | 'speak_voice'
  | 'mute_members'
  | 'priority_speaker';

export interface ServerRole {
  id: string;
  name: string;
  color: string;
  icon?: string;
  position: number;
  permissions: ServerPermission[];
  isDefault?: boolean;
}

export interface ServerMember {
  userId: string;
  username: string;
  avatar: string;
  nickname?: string;
  roleIds: string[];
  joinedAt: string;
  isOwner?: boolean;
  rulesAcceptedAt?: string;
}

export type ChannelOverridePerm =
  | 'view_channel'
  | 'send_messages'
  | 'attach_files'
  | 'connect_voice'
  | 'speak_voice';

export interface ChannelPermissionOverride {
  targetType: 'role' | 'user';
  targetId: string;
  allow: ChannelOverridePerm[];
  deny: ChannelOverridePerm[];
}

export interface StageChannelState {
  topic?: string;
  speakerUsernames: string[];
  raisedHands: string[];
}

export interface ServerAuditEntry {
  id: string;
  serverId: string;
  actorUsername: string;
  action: string;
  targetLabel?: string;
  details: string;
  timestamp: string;
}

export type ModerationCaseAction = 'warn' | 'timeout' | 'kick' | 'ban' | 'untimeout';

export interface ServerModerationCase {
  id: string;
  serverId: string;
  targetUsername: string;
  moderatorUsername: string;
  action: ModerationCaseAction;
  reason: string;
  durationMinutes?: number;
  createdAt: string;
}

export interface ServerOnboardingConfig {
  enabled: boolean;
  welcomePrompt?: string;
  requireRulesAccept?: boolean;
  selfAssignableRoleIds: string[];
}

export interface ScheduledMessage {
  id: string;
  serverId: string;
  channelId: string;
  authorUsername: string;
  authorAvatar: string;
  content: string;
  scheduledFor: string;
  repeatIntervalMinutes?: number;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: string;
  lastSentAt?: string;
}

export interface ServerSoundClip {
  id: string;
  name: string;
  emoji: string;
  dataUrl: string;
  uploadedBy: string;
  createdAt: string;
}

export interface ServerSticker {
  id: string;
  name: string;
  imageUrl: string;
  tags?: string[];
  uploadedBy: string;
  createdAt: string;
}

export type BotEventType = 'message_create' | 'member_join' | 'reaction_add';

export interface BotSlashCommand {
  name: string;
  description: string;
  responseTemplate?: string;
}

export interface ServerBotPublic {
  id: string;
  serverId: string;
  name: string;
  avatar: string;
  tokenPrefix: string;
  webhookUrl?: string;
  events: BotEventType[];
  slashCommands: BotSlashCommand[];
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}

export type AutomationTriggerType = 'message_contains' | 'spam_burst' | 'member_join' | 'link_posted';
export type AutomationActionType = 'delete_message' | 'timeout_user' | 'assign_role' | 'send_channel_notice' | 'warn_member';

export interface ServerAutomationRule {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  keywords?: string[];
  spamCount?: number;
  spamWindowSeconds?: number;
  actionType: AutomationActionType;
  timeoutMinutes?: number;
  roleId?: string;
  noticeChannelId?: string;
  noticeTemplate?: string;
  createdBy: string;
  createdAt: string;
}

export interface PasskeyInfo {
  id: string;
  label: string;
  transports?: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface GroupE2eeKeyEnvelope {
  targetUsername: string;
  senderUsername: string;
  wrappedKeyBase64: string;
  ivBase64: string;
  epoch: number;
  updatedAt: string;
}

export interface VoiceScreenAnnotationStroke {
  kind: 'draw' | 'clear';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface IncomingVoiceScreenAnnotation {
  channelId: string;
  targetSharerId: string;
  authorUsername: string;
  stroke: VoiceScreenAnnotationStroke;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // usernames who voted
}

export interface PollData {
  question: string;
  options: PollOption[];
  closed?: boolean;
  totalVotes?: number;
  allowMultiple?: boolean;
  isAnonymous?: boolean;
  closesAt?: string;
}

export interface ChannelCategory {
  id: string;
  name: string;
  position: number;
  collapsedByDefault?: boolean;
}

export interface ServerWebhook {
  id: string;
  serverId: string;
  channelId: string;
  name: string;
  avatar?: string;
  token: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface GroupDmRoom {
  id: string;
  name: string;
  icon?: string;
  ownerUsername: string;
  members: string[];
  createdAt: string;
  voiceChannelId?: string;
  e2eeEnabled?: boolean;
  e2eeEpoch?: number;
  e2eeKeyEnvelopes?: GroupE2eeKeyEnvelope[];
}

export interface ForwardedFromMeta {
  authorUsername: string;
  channelName?: string;
  serverName?: string;
  timestamp?: string;
}

export interface ForumPostMeta {
  title: string;
  tags?: string[];
  pinned?: boolean;
  locked?: boolean;
  solved?: boolean;
  solvedAt?: string;
  solvedBy?: string;
}

export interface MetricsHistoryPoint {
  ts: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  cpuPercent?: number;
  onlineUsers: number;
  activeVoiceRooms: number;
  voiceParticipantsCount?: number;
  messagesPerMin: number;
  eventLoopLagMs: number;
  pendingStorageWrites: number;
}

export interface ChannelStickyNotice {
  text: string;
  author: string;
  updatedAt: string;
}

export interface WikiRevision {
  id: string;
  content: string;
  editedBy: string;
  editedAt: string;
  summary?: string;
}

export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  updatedBy: string;
  updatedAt: string;
  revisions: WikiRevision[];
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  columnId: 'todo' | 'in_progress' | 'done';
  assigneeUsername?: string;
  labels?: string[];
  dueDate?: string;
  position: number;
  createdBy: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'wiki' | 'kanban';
  collabMode?: 'members' | 'admins_only';
  wikiPages?: WikiPage[];
  kanbanCards?: KanbanCard[];
  serverId: string;
  categoryId?: string | null;
  position?: number;
  topic?: string;
  bitrateKbps?: number;
  userLimit?: number;
  allowedRoleIds?: string[];
  isPrivate?: boolean;
  permissionOverrides?: ChannelPermissionOverride[];
  stageState?: StageChannelState;
  slowmodeSeconds?: number;
  isTemporary?: boolean;
  isTempCreatorChannel?: boolean;
  createdByUserId?: string;
  isLocked?: boolean;
  password?: string;
  stickyNotice?: ChannelStickyNotice | null;
}

export interface ServerInvite {
  code: string;
  serverId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: number | null;
  maxUses?: number;
  uses: number;
  sourceLabel?: string;
  recentJoiners?: Array<{ username: string; joinedAt: string }>;
}

export type ServerCategory = 'gaming' | 'community' | 'tech' | 'music' | 'education' | 'other';

export interface DiscoverableServerSummary {
  id: string;
  name: string;
  icon: string;
  bannerGradient?: string;
  bannerImage?: string;
  description: string;
  category: ServerCategory;
  tags: string[];
  memberCount: number;
  onlineCount: number;
  voiceActiveCount: number;
  textChannelCount: number;
  voiceChannelCount: number;
  channelPreview: Array<{ id: string; name: string; type: 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'wiki' | 'kanban' }>;
  bitrateKbps: number;
  sfuMode: 'auto' | 'p2p' | 'sfu';
  isJoined: boolean;
  isOwner: boolean;
}

export interface Server {
  id: string;
  name: string;
  icon?: string;
  bannerGradient?: string;
  bannerImage?: string;
  description?: string;
  isPublic?: boolean;
  category?: ServerCategory;
  tags?: string[];
  ownerId: string;
  categories?: ChannelCategory[];
  channels: Channel[];
  roles: ServerRole[];
  members: ServerMember[];
  invites?: ServerInvite[];
  timeouts?: Record<string, number>;
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
  rules?: string[];
  welcomeChannelId?: string | null;
  welcomeMessage?: string;
  welcomeEnabled?: boolean;
  autoRoleId?: string | null;
  customEmojis?: { id: string; name: string; url: string }[];
  autoModConfig?: { blockLinks?: boolean; antiSpam?: boolean; bannedWords?: string[] };
  events?: ServerEvent[];
  onboarding?: ServerOnboardingConfig;
  serverSounds?: ServerSoundClip[];
  stickers?: ServerSticker[];
}

export interface ServerEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  voiceChannelId?: string | null;
  createdBy: string;
  rsvps: string[];
}

export interface MemberLevelData {
  userId: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
  messageCount: number;
  voiceMinutes: number;
}

export interface WatchTogetherQueueItem {
  id: string;
  videoId: string;
  title: string;
  addedBy: string;
}

export interface WatchTogetherState {
  channelId: string;
  active: boolean;
  videoId: string;
  title: string;
  isPlaying: boolean;
  currentTime: number;
  startedBy: string;
  queue?: WatchTogetherQueueItem[];
  skipVotes?: string[];
}

export interface MiniGameState {
  channelId: string;
  game: 'xox' | 'typeracer';
  board?: (string | null)[];
  turn?: 'X' | 'O';
  winner?: string | null;
  players?: { X: string; O: string };
  playerNames?: { X: string; O: string };
}

export interface Message {
  id: string;
  serverId: string;
  channelId: string;
  author: {
    id: string;
    username: string;
    avatar: string;
  };
  content: string;
  timestamp: string;
  attachments?: MessageAttachment[];
  reactions?: Record<string, string[]>; // emoji -> array of usernames
  isPinned?: boolean;
  isEdited?: boolean;
  poll?: PollData;
  replyTo?: { id: string; username: string; content: string };
  forwardedFrom?: ForwardedFromMeta;
  forumPost?: ForumPostMeta;
  threadMessages?: ThreadMessage[];
}

export interface ThreadMessage {
  id: string;
  author: {
    id: string;
    username: string;
    avatar: string;
  };
  content: string;
  timestamp: string;
}

export interface ServerAnalyticsData {
  totalMembers: number;
  onlineMembers: number;
  totalMessages: number;
  totalVoiceMinutes: number;
  channelMessageCounts: { channelName: string; count: number }[];
  popularVoiceChannels: { channelName: string; userCount: number }[];
  tierDistribution: { tier: string; count: number }[];
}

export type ScreenSharePreset = '360' | '480' | '720' | '1080' | '1440' | 'source' | 'presentation';
export type ScreenSharePrivacy = 'public' | 'contacts' | 'private';
export type ScreenShareConnectionMode = 'p2p' | 'server';
export type ViewerStreamQuality = 'auto' | '360' | '480' | '720' | '1080' | 'source';

export interface ScreenShareStats {
  codec: string;
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
  packetsLost: number;
}

export interface ScreenShareLaserPoint {
  id: string;
  fromUsername: string;
  presenterId: string;
  x: number;
  y: number;
  color: string;
}

export interface ScreenShareSettings {
  preset: ScreenSharePreset;
  audioEnabled: boolean;
  masterVolume: number;
  privacy: ScreenSharePrivacy;
  resolution: '360' | '480' | '720' | '1080' | '1440' | 'source';
  fps: 5 | 30 | 60;
  bitrateKbps: number;
  audioBitrateKbps: 64 | 96 | 128 | 192 | 256 | 320;
  viewerLimit: number;
  connectionMode: ScreenShareConnectionMode;
  hdrEnabled?: boolean;
  appAudioOnly?: boolean;
}

export interface RemoteAssistPermissions {
  control: boolean;
  clipboard: boolean;
  annotate: boolean;
}

export interface RemoteMonitorInfo {
  index: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}

export interface RemoteAssistAnnotationStroke {
  id: string;
  tool: 'pen' | 'arrow' | 'rect';
  color: string;
  points: Array<{ x: number; y: number }>;
  createdAt: number;
}

export interface DirectScreenShareOptions {
  preset: 'sharp-text' | 'balanced' | 'smooth-60' | 'source';
  shareAudio: boolean;
}

export interface DirectCallQualityStats {
  rttMs: number;
  fps: number;
  width: number;
  height: number;
  bitrateKbps: number;
  packetLossPct: number;
  pathType: 'p2p' | 'relay' | 'unknown';
  inputTransport?: 'datachannel' | 'socket';
}

export interface DirectCallToast {
  id: string;
  message: string;
  variant: 'info' | 'warning' | 'error' | 'success';
}

export interface RemoteAssistState {
  status: 'idle' | 'requesting' | 'incoming_request' | 'controlling' | 'being_controlled';
  hostDesktopCapable: boolean;
  requesterName?: string;
  remoteCursor?: { x: number; y: number } | null;
  permissions: RemoteAssistPermissions;
  requestedPermissions?: RemoteAssistPermissions;
  paused: boolean;
  hostMonitors: RemoteMonitorInfo[];
  selectedMonitorIndex: number | null;
  inputTransport: 'datachannel' | 'socket';
}

export type ContentReportCategory = 'harassment' | 'spam' | 'illegal' | 'malware' | 'other';
export type ContentReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ContentReport {
  id: string;
  reporterUsername: string;
  targetUsername: string;
  serverId?: string;
  channelId?: string;
  messageId?: string;
  messageExcerpt?: string;
  category: ContentReportCategory;
  reason: string;
  status: ContentReportStatus;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}
