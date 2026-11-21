import { createContext, useContext } from 'react';
import type { DirectCallState, DirectCallToast, FriendRequest, FriendUser, RemoteAssistState, User } from '../types';

export interface SocialContextValue {
  friends: FriendUser[];
  incomingFriendRequests: FriendRequest[];
  outgoingFriendRequests: FriendRequest[];
  directCall: DirectCallState | null;
  directCallToasts: DirectCallToast[];
  unreadDMByUser: Record<string, number>;
  remoteAssist: RemoteAssistState;
  dismissDirectCallToast: (id: string) => void;
  sendFriendRequest: (targetUsername: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  cancelFriendRequest: (requestId: string) => void;
  removeFriend: (targetUsername: string) => void;
  fetchFriendsData: () => void;
  startDirectCall: (targetUser: User) => void;
  acceptDirectCall: () => void;
  declineDirectCall: (replyMessage?: string) => void;
  endDirectCall: () => void;
  blockUser: (targetUsername: string) => void;
  unblockUser: (targetUsername: string) => void;
  updateProfile: (username: string, avatar: string) => void;
}

export const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export const useSocial = (): SocialContextValue => {
  const ctx = useContext(SocialContext);
  if (!ctx) {
    throw new Error('useSocial must be used within SocketProvider');
  }
  return ctx;
};
