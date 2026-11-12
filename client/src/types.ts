export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type UserRole = 'admin' | 'user';

export interface UserActivity {
  type: 'playing' | 'listening' | 'streaming' | 'custom';
  name: string;
  details?: string;
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
}

export interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  avatar: string;
  status: UserStatus;
  currentVoiceChannelId?: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing?: boolean;
  createdAt?: string;
  walletBalance?: number;
  statusMessage?: string;
  bannerColor?: string;
  bio?: string;
  badges?: UserBadge[];
  friends?: string[];
  activity?: UserActivity;
}

export interface MessageAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface DirectCallState {
  partner: User;
  status: 'calling' | 'incoming' | 'connected' | 'ended';
  isMuted: boolean;
  isDeafened: boolean;
  durationSeconds: number;
}

export type LicenseStatus = 'active' | 'revoked' | 'expired';

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
  position: number;
  permissions: ServerPermission[];
  isDefault?: boolean;
}

export interface ServerMember {
  userId: string;
  username: string;
  avatar: string;
  roleIds: string[];
  joinedAt: string;
  isOwner?: boolean;
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
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  serverId: string;
  allowedRoleIds?: string[];
  slowmodeSeconds?: number;
}

export interface Server {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  ownerId: string;
  channels: Channel[];
  roles: ServerRole[];
  members: ServerMember[];
  afkChannelId?: string | null;
  bitrateKbps?: number;
  rules?: string[];
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
  poll?: PollData;
}
