import { createContext, useContext } from 'react';
import type { Channel, Message, MessageAttachment, Server, User } from '../types';
import type { MessageContextResponse, MessageSearchHit, OfflineQueuedMessage } from '../sharedContracts';

export type ChatLayoutMode = 'auto' | 'classic' | 'bubble';

export interface ChatContextValue {
  servers: Server[];
  activeServer: Server | null;
  activeChannel: Channel | null;
  messages: Message[];
  messagesMap: Record<string, Message[]>;
  onlineUsers: User[];
  activeDMUser: User | null;
  unreadCounts: Record<string, number>;
  mentionCounts: Record<string, number>;
  readCursors: Record<string, string>;
  hasMoreMessages: Record<string, boolean>;
  isLoadingOlderMessages: boolean;
  dmReadReceipts: Record<string, number>;
  offlineQueue: OfflineQueuedMessage[];
  pendingJumpTarget: { channelId: string; messageId: string } | null;
  clearPendingJumpTarget: () => void;
  selectServer: (serverId: string) => void;
  selectChannel: (channelId: string) => void;
  openDirectMessage: (user: User) => void;
  closeDirectMessage: () => void;
  sendMessage: (
    content: string,
    attachments?: MessageAttachment[],
    replyTo?: { id: string; username: string; content: string }
  ) => void;
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  sendTyping: (isTyping: boolean) => void;
  markChannelRead: (channelId: string, lastMessageId: string) => void;
  markDmRead: (partnerUsername: string) => void;
  requestOlderMessages: (channelId: string) => void;
  searchServerMessages: (query: string, channelId?: string) => Promise<MessageSearchHit[]>;
  requestMessageContext: (channelId: string, messageId: string, radius?: number) => Promise<MessageContextResponse>;
  jumpToMessage: (channelId: string, messageId: string) => Promise<boolean>;
  retryQueuedMessage: (localId: string) => void;
  cancelQueuedMessage: (localId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  togglePinMessage: (messageId: string) => void;
  sendThreadMessage: (channelId: string, parentMessageId: string, content: string) => void;
  chatLayout: ChatLayoutMode;
  setChatLayout: (mode: ChatLayoutMode) => void;
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export const useChat = (): ChatContextValue => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within SocketProvider');
  }
  return ctx;
};
