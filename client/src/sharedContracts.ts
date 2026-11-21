export const SHARED_CONTRACT_VERSION = '0.8.0';

export interface ContractAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface ContractReplyRef {
  id: string;
  username: string;
  content: string;
}

export interface ContractMessageSummary {
  id: string;
  channelId: string;
  serverId?: string;
  content: string;
  timestamp: string;
  createdAt?: number;
  author: {
    id: string;
    username: string;
    avatar: string;
    role?: string;
  };
  attachments?: ContractAttachment[];
  replyTo?: ContractReplyRef;
}

export interface MessageSearchHit {
  channelId: string;
  message: ContractMessageSummary;
}

export interface MessageContextResponse {
  channelId: string;
  targetMessageId: string;
  messages: ContractMessageSummary[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  found: boolean;
}

export type OfflineMessageStatus = 'queued' | 'sending' | 'failed';

export interface OfflineQueuedMessage {
  localId: string;
  serverId: string;
  channelId: string;
  content: string;
  createdAt: string;
  status: OfflineMessageStatus;
  error?: string;
  replyTo?: ContractReplyRef;
}

export interface PlatformCapabilities {
  os: string;
  arch: string;
  globalPtt: boolean;
  gameDetection: boolean;
  remoteInputSimulation: boolean;
  overlayWindow: boolean;
  taskbarBadge: boolean;
  deepLinks: boolean;
  autostart: boolean;
}

export interface ServerToClientEvents {
  auth_response: (payload: {
    success: boolean;
    error?: string;
    user?: Record<string, unknown>;
    token?: string;
    mediaToken?: string;
    requires2fa?: boolean;
    pending2faToken?: string;
    tokenExpired?: boolean;
  }) => void;
  new_message: (msg: ContractMessageSummary) => void;
  message_edited: (payload: { channelId: string; messageId: string; content: string; isEdited: boolean }) => void;
  message_deleted: (payload: { channelId: string; messageId: string }) => void;
  message_reaction_updated: (payload: { channelId: string; messageId: string; reactions: Record<string, string[]> }) => void;
  message_pin_updated: (payload: { channelId: string; messageId: string; isPinned: boolean }) => void;
  server_search_results: (payload: { query: string; results: MessageSearchHit[] }) => void;
  message_context_response: (payload: MessageContextResponse) => void;
  user_typing: (payload: { channelId: string; username: string; isTyping: boolean }) => void;
  chat_flood_error: (payload: { message: string }) => void;
  server_action_error: (payload: { message: string }) => void;
  e2ee_key_updated: (payload: { username: string; publicKey: string }) => void;
}

export interface ClientToServerEvents {
  send_message: (payload: {
    serverId: string;
    channelId: string;
    content?: string;
    attachments?: ContractAttachment[];
    poll?: Record<string, unknown>;
    replyTo?: ContractReplyRef;
  }) => void;
  edit_message: (payload: { channelId: string; messageId: string; newContent: string }) => void;
  delete_message: (payload: { channelId: string; messageId: string }) => void;
  add_reaction: (payload: { channelId: string; messageId: string; emoji: string }) => void;
  toggle_pin_message: (payload: { channelId: string; messageId: string }) => void;
  search_messages_server: (payload: { query: string; channelId?: string }) => void;
  request_message_context: (payload: { channelId: string; messageId: string; radius?: number }) => void;
  mark_channel_read: (payload: { channelId: string; lastMessageId: string }) => void;
  typing_start: (payload: { channelId: string }) => void;
  typing_stop: (payload: { channelId: string }) => void;
}
