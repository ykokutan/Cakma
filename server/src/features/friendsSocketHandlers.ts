import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { FriendRequest, FriendUser, RegisteredAccount, User } from '../types.js';
import { validatePayload, type SocketEventRateLimiter } from '../utils/socketGuard.js';

export interface FriendsHandlerDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  pendingFriendRequests: Map<string, FriendRequest>;
  socketEventLimiter: SocketEventRateLimiter;
  getFriendsData: (username: string) => {
    friends: FriendUser[];
    incomingRequests: FriendRequest[];
    outgoingRequests: FriendRequest[];
  };
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  saveFriendRequests: (requests: Map<string, FriendRequest>) => void;
}

export function registerFriendsSocketHandlers(socket: Socket, deps: FriendsHandlerDeps): void {
  const {
    io,
    activeUsers,
    registeredAccounts,
    pendingFriendRequests,
    socketEventLimiter,
    getFriendsData,
    saveAccounts,
    saveFriendRequests,
  } = deps;

  socket.on('get_friends_data', () => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    socket.emit('friends_data', getFriendsData(user.username));
  });

  socket.on('send_friend_request', (rawPayload: unknown) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) return;
    if (!socketEventLimiter.allow(socket.id, 'send_friend_request', 10, 30_000)) {
      return socket.emit('friend_request_response', {
        success: false,
        error: 'Çok fazla arkadaşlık isteği gönderdiniz. Lütfen bekleyin.',
      });
    }
    const check = validatePayload<{ targetUsername: string }>(rawPayload, {
      targetUsername: { type: 'string', required: true, minLen: 1, maxLen: 64 },
    });
    if (!check.ok) {
      return socket.emit('friend_request_response', { success: false, error: 'Lütfen bir kullanıcı adı girin.' });
    }
    const targetUsername = check.data.targetUsername;
    const cleanTarget = targetUsername.toLowerCase();

    if (cleanTarget === sender.username.toLowerCase()) {
      return socket.emit('friend_request_response', {
        success: false,
        error: 'Kendinize arkadaşlık isteği gönderemezsiniz.',
      });
    }

    const targetAccount = registeredAccounts.get(cleanTarget);
    if (!targetAccount) {
      return socket.emit('friend_request_response', {
        success: false,
        error: `"${targetUsername}" adlı kullanıcı bulunamadı.`,
      });
    }

    const senderAccount = registeredAccounts.get(sender.username.toLowerCase());
    if (!senderAccount) return;

    if (senderAccount.friends?.map((f) => f.toLowerCase()).includes(targetAccount.username.toLowerCase())) {
      return socket.emit('friend_request_response', {
        success: false,
        error: `"${targetAccount.username}" ile zaten arkadaşsınız.`,
      });
    }

    for (const req of pendingFriendRequests.values()) {
      if (
        req.fromUsername.toLowerCase() === sender.username.toLowerCase() &&
        req.toUsername.toLowerCase() === targetAccount.username.toLowerCase()
      ) {
        return socket.emit('friend_request_response', {
          success: false,
          error: 'Bu kullanıcıya zaten bekleyen bir istek gönderdiniz.',
        });
      }
      if (
        req.fromUsername.toLowerCase() === targetAccount.username.toLowerCase() &&
        req.toUsername.toLowerCase() === sender.username.toLowerCase()
      ) {
        if (!senderAccount.friends) senderAccount.friends = [];
        if (!targetAccount.friends) targetAccount.friends = [];
        senderAccount.friends.push(targetAccount.username.toLowerCase());
        targetAccount.friends.push(sender.username.toLowerCase());
        pendingFriendRequests.delete(req.id);
        saveAccounts(registeredAccounts);
        saveFriendRequests(pendingFriendRequests);

        socket.emit('friend_request_response', {
          success: true,
          message: `${targetAccount.username} ile arkadaş oldunuz!`,
        });
        socket.emit('friends_data', getFriendsData(sender.username));

        for (const [sId, u] of activeUsers.entries()) {
          if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
            io.to(sId).emit('friends_data', getFriendsData(targetAccount.username));
            io.to(sId).emit('friend_request_accepted', { friendUsername: sender.username });
          }
        }
        return;
      }
    }

    const newReq: FriendRequest = {
      id: `freq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fromUserId: sender.id,
      fromUsername: sender.username,
      fromAvatar: sender.avatar,
      toUserId: targetAccount.id,
      toUsername: targetAccount.username,
      createdAt: new Date().toLocaleDateString('tr-TR'),
    };

    pendingFriendRequests.set(newReq.id, newReq);
    saveFriendRequests(pendingFriendRequests);
    socket.emit('friend_request_response', {
      success: true,
      message: `${targetAccount.username} adlı kullanıcıya arkadaşlık isteği gönderildi!`,
    });
    socket.emit('friends_data', getFriendsData(sender.username));

    for (const [sId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
        io.to(sId).emit('friend_request_received', newReq);
        io.to(sId).emit('friends_data', getFriendsData(targetAccount.username));
      }
    }
  });

  socket.on('accept_friend_request', ({ requestId }: { requestId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || typeof requestId !== 'string') return;

    const req = pendingFriendRequests.get(requestId);
    if (!req) return;

    const userAccount = registeredAccounts.get(user.username.toLowerCase());
    const senderAccount = registeredAccounts.get(req.fromUsername.toLowerCase());

    if (userAccount && senderAccount) {
      if (!userAccount.friends) userAccount.friends = [];
      if (!senderAccount.friends) senderAccount.friends = [];

      if (!userAccount.friends.map((f) => f.toLowerCase()).includes(senderAccount.username.toLowerCase())) {
        userAccount.friends.push(senderAccount.username.toLowerCase());
      }
      if (!senderAccount.friends.map((f) => f.toLowerCase()).includes(userAccount.username.toLowerCase())) {
        senderAccount.friends.push(userAccount.username.toLowerCase());
      }

      pendingFriendRequests.delete(requestId);
      saveAccounts(registeredAccounts);
      saveFriendRequests(pendingFriendRequests);

      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === senderAccount.username.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(senderAccount.username));
          io.to(sId).emit('friend_request_accepted', { friendUsername: user.username });
        }
      }
    }
  });

  socket.on('decline_friend_request', ({ requestId }: { requestId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || typeof requestId !== 'string') return;

    const req = pendingFriendRequests.get(requestId);
    if (req) {
      pendingFriendRequests.delete(requestId);
      saveFriendRequests(pendingFriendRequests);
      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === req.fromUsername.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(req.fromUsername));
        }
      }
    }
  });

  socket.on('cancel_friend_request', ({ requestId }: { requestId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || typeof requestId !== 'string') return;

    const req = pendingFriendRequests.get(requestId);
    if (req) {
      pendingFriendRequests.delete(requestId);
      saveFriendRequests(pendingFriendRequests);
      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === req.toUsername.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(req.toUsername));
        }
      }
    }
  });

  socket.on('remove_friend', ({ targetUsername }: { targetUsername: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || typeof targetUsername !== 'string') return;

    const userAccount = registeredAccounts.get(user.username.toLowerCase());
    const targetAccount = registeredAccounts.get(targetUsername.toLowerCase());

    if (userAccount && targetAccount) {
      userAccount.friends = (userAccount.friends || []).filter(
        (f) => f.toLowerCase() !== targetUsername.toLowerCase()
      );
      targetAccount.friends = (targetAccount.friends || []).filter(
        (f) => f.toLowerCase() !== user.username.toLowerCase()
      );
      saveAccounts(registeredAccounts);

      socket.emit('friends_data', getFriendsData(user.username));

      for (const [sId, u] of activeUsers.entries()) {
        if (u.username.toLowerCase() === targetAccount.username.toLowerCase()) {
          io.to(sId).emit('friends_data', getFriendsData(targetAccount.username));
        }
      }
    }
  });
}
