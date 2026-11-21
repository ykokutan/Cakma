import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { Message, User } from '../types.js';
import { buildPersistentDmChannelId } from '../utils/channelAccess.js';
import type { DirectCallLogStatus, RemoteAssistManager } from '../utils/remoteAssistState.js';

export interface PendingDirectCallRecord {
  callerSocketId: string;
  callerUserId: string;
  callerUsername: string;
  targetUserId?: string;
  targetUsername?: string;
}

export interface DirectCallHandlerDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  messages: Record<string, Message[]>;
  activeDirectCallPairs: Map<string, string>;
  activeDirectCallStartTimes: Map<string, number>;
  pendingDirectCalls: Map<string, PendingDirectCallRecord>;
  pendingDirectCallTimers: Map<string, NodeJS.Timeout>;
  remoteAssistManager: RemoteAssistManager;
  clearPendingDirectCallTimer: (targetUsernameLower: string) => void;
  persistAndEmitDirectCallLog: (
    userA: User | undefined,
    userB: User | undefined,
    status: DirectCallLogStatus,
    durationSeconds: number,
    customNote?: string
  ) => void;
  sendWebPushToUsername: (
    username: string,
    payload: { title: string; body: string; url?: string; channelId?: string; dmUsername?: string }
  ) => Promise<void>;
  saveChannelMessageUpsert: (channelId: string, channelMessages: Message[], msg: Message) => void;
  sanitizeText: (input: string) => string;
}

export function registerDirectCallSocketHandlers(socket: Socket, deps: DirectCallHandlerDeps): void {
  const {
    io,
    activeUsers,
    messages,
    activeDirectCallPairs,
    activeDirectCallStartTimes,
    pendingDirectCalls,
    pendingDirectCallTimers,
    remoteAssistManager,
    clearPendingDirectCallTimer,
    persistAndEmitDirectCallLog,
    sendWebPushToUsername,
    saveChannelMessageUpsert,
    sanitizeText,
  } = deps;

  socket.on('direct_call_start', ({ targetUserId, targetUsername }: { targetUserId?: string; targetUsername?: string }) => {
    const caller = activeUsers.get(socket.id);
    if (!caller) return;

    if (activeDirectCallPairs.has(socket.id)) {
      return socket.emit('direct_call_declined', { reason: 'Zaten aktif bir görüşmedesiniz.' });
    }

    let resolvedUsername = (targetUsername || '').trim().toLowerCase();
    if (!resolvedUsername && targetUserId) {
      const bySocket = activeUsers.get(targetUserId);
      if (bySocket) {
        resolvedUsername = bySocket.username.toLowerCase();
      } else {
        for (const u of activeUsers.values()) {
          if (u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase()) {
            resolvedUsername = u.username.toLowerCase();
            break;
          }
        }
        if (!resolvedUsername) {
          resolvedUsername = targetUserId.toLowerCase();
        }
      }
    }

    const targetSocketIds: string[] = [];
    let isBlocked = false;
    for (const [sId, u] of activeUsers.entries()) {
      if (sId === socket.id) continue;
      const matchesId = Boolean(targetUserId && u.id === targetUserId);
      const matchesName = Boolean(resolvedUsername && u.username.toLowerCase() === resolvedUsername);
      if (matchesId || matchesName) {
        if (u.blockedUsers?.includes(caller.username.toLowerCase())) {
          isBlocked = true;
        }
        targetSocketIds.push(sId);
      }
    }

    if (isBlocked) {
      return socket.emit('direct_call_declined', { reason: 'Bu kullanıcıya şu anda ulaşılamıyor.' });
    }

    if (targetSocketIds.length === 0) {
      if (resolvedUsername) {
        void sendWebPushToUsername(resolvedUsername, {
          title: 'Gelen Arama',
          body: `${caller.username} seni aramaya çalıştı 📞`,
          url: `/?dm=${encodeURIComponent(caller.username)}`,
          dmUsername: caller.username,
        });
      }
      return socket.emit('direct_call_declined', { reason: 'Kullanıcı şu anda çevrimdışı.' });
    }

    const targetKey = resolvedUsername || (targetUserId || '').toLowerCase();
    const targetUsers = targetSocketIds
      .map((id) => activeUsers.get(id))
      .filter((u): u is User => Boolean(u));
    const primaryTarget = targetUsers[0];

    const isTargetBusy =
      targetSocketIds.some((id) => activeDirectCallPairs.has(id)) ||
      (targetKey ? pendingDirectCalls.has(targetKey) : false);
    if (isTargetBusy) {
      persistAndEmitDirectCallLog(caller, primaryTarget, 'busy', 0);
      return socket.emit('direct_call_declined', {
        reason: 'Kullanıcı şu anda başka bir görüşmede (meşgul).',
      });
    }

    if (targetUsers.length > 0 && targetUsers.every((u) => u.status === 'dnd')) {
      persistAndEmitDirectCallLog(caller, primaryTarget, 'dnd', 0);
      return socket.emit('direct_call_declined', {
        reason: 'Kullanıcı Rahatsız Etme (DND) modunda.',
      });
    }

    if (targetKey) {
      clearPendingDirectCallTimer(targetKey);
      pendingDirectCalls.set(targetKey, {
        callerSocketId: socket.id,
        callerUserId: caller.id,
        callerUsername: caller.username.toLowerCase(),
        targetUserId: primaryTarget?.id,
        targetUsername: primaryTarget?.username,
      });

      const timer = setTimeout(() => {
        pendingDirectCallTimers.delete(targetKey);
        const stillPending = pendingDirectCalls.get(targetKey);
        if (!stillPending || stillPending.callerSocketId !== socket.id) return;
        pendingDirectCalls.delete(targetKey);

        const callerNow = activeUsers.get(stillPending.callerSocketId);
        const targetNow = stillPending.targetUserId ? activeUsers.get(stillPending.targetUserId) : undefined;
        io.to(stillPending.callerSocketId).emit('direct_call_declined', {
          reason: 'Arama yanıtlanmadı (zaman aşımı).',
        });
        for (const [sId, u] of activeUsers.entries()) {
          if (u.username.toLowerCase() === targetKey) {
            io.to(sId).emit('direct_call_handled');
          }
        }
        persistAndEmitDirectCallLog(callerNow, targetNow, 'timeout', 0);
      }, 40_000);
      pendingDirectCallTimers.set(targetKey, timer);
    }

    for (const sId of targetSocketIds) {
      io.to(sId).emit('direct_call_incoming', { callerUser: caller });
    }
    if (primaryTarget?.username || resolvedUsername) {
      const dmSender = caller.username;
      void sendWebPushToUsername(primaryTarget?.username || resolvedUsername, {
        title: 'Gelen Arama',
        body: `${dmSender} seni 1-e-1 arıyor...`,
        url: `/?dm=${encodeURIComponent(dmSender)}`,
        dmUsername: dmSender,
      });
    }
  });

  socket.on('direct_call_accept', ({ callerUserId, callerUsername }: { callerUserId?: string; callerUsername?: string }) => {
    const acceptor = activeUsers.get(socket.id);
    if (!acceptor) return;

    const acceptorKey = acceptor.username.toLowerCase();
    clearPendingDirectCallTimer(acceptorKey);
    const pending = pendingDirectCalls.get(acceptorKey);
    pendingDirectCalls.delete(acceptorKey);

    const targetName = (callerUsername || '').trim().toLowerCase();
    let callerSocketId: string | null = null;
    if (pending && activeUsers.has(pending.callerSocketId)) {
      callerSocketId = pending.callerSocketId;
    } else {
      for (const [sId, u] of activeUsers.entries()) {
        if (
          (callerUserId && u.id === callerUserId) ||
          (targetName && u.username.toLowerCase() === targetName) ||
          (callerUserId && u.username.toLowerCase() === callerUserId.toLowerCase())
        ) {
          callerSocketId = sId;
          break;
        }
      }
    }

    if (callerSocketId) {
      const now = Date.now();
      activeDirectCallPairs.set(socket.id, callerSocketId);
      activeDirectCallPairs.set(callerSocketId, socket.id);
      activeDirectCallStartTimes.set(socket.id, now);
      activeDirectCallStartTimes.set(callerSocketId, now);
      io.to(callerSocketId).emit('direct_call_accepted', { targetUser: acceptor });
    }

    for (const [sId, u] of activeUsers.entries()) {
      if (sId !== socket.id && u.username.toLowerCase() === acceptorKey) {
        io.to(sId).emit('direct_call_handled');
      }
    }
  });

  socket.on(
    'direct_call_decline',
    ({ callerUserId, callerUsername, replyMessage }: { callerUserId?: string; callerUsername?: string; replyMessage?: string }) => {
      const decliner = activeUsers.get(socket.id);
      const declinerKey = decliner?.username.toLowerCase() || '';
      if (declinerKey) {
        clearPendingDirectCallTimer(declinerKey);
      }
      const pending = declinerKey ? pendingDirectCalls.get(declinerKey) : undefined;
      if (declinerKey) {
        pendingDirectCalls.delete(declinerKey);
      }

      const paired = activeDirectCallPairs.get(socket.id);
      if (paired) {
        activeDirectCallPairs.delete(paired);
        activeDirectCallPairs.delete(socket.id);
      }

      const cleanReply =
        typeof replyMessage === 'string' && replyMessage.trim()
          ? sanitizeText(replyMessage.trim()).slice(0, 240)
          : '';
      const declinedReason = cleanReply ? `Arama reddedildi: "${cleanReply}"` : 'Arama reddedildi.';

      if (pending && activeUsers.has(pending.callerSocketId)) {
        const callerUser = activeUsers.get(pending.callerSocketId);
        activeDirectCallPairs.delete(pending.callerSocketId);
        activeDirectCallStartTimes.delete(pending.callerSocketId);
        activeDirectCallStartTimes.delete(socket.id);
        io.to(pending.callerSocketId).emit('direct_call_declined', { reason: declinedReason });

        if (decliner && callerUser) {
          if (cleanReply) {
            const dmChannelId = buildPersistentDmChannelId(callerUser.username, decliner.username);
            const quickDm: Message = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              serverId: 'direct-messages',
              channelId: dmChannelId,
              author: { id: decliner.id, username: decliner.username, avatar: decliner.avatar },
              content: cleanReply,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              reactions: {},
              isPinned: false,
            };
            if (!messages[dmChannelId]) messages[dmChannelId] = [];
            messages[dmChannelId].push(quickDm);
            saveChannelMessageUpsert(dmChannelId, messages[dmChannelId], quickDm);
            io.to(pending.callerSocketId).emit('new_message', quickDm);
            socket.emit('new_message', quickDm);
          }
          persistAndEmitDirectCallLog(callerUser, decliner, 'declined', 0, cleanReply || undefined);
        }
      } else {
        const targetName = (callerUsername || '').trim().toLowerCase();
        for (const [sId, u] of activeUsers.entries()) {
          if (
            (callerUserId && u.id === callerUserId) ||
            (targetName && u.username.toLowerCase() === targetName) ||
            (callerUserId && u.username.toLowerCase() === callerUserId.toLowerCase())
          ) {
            activeDirectCallPairs.delete(sId);
            io.to(sId).emit('direct_call_declined', { reason: declinedReason });
            if (decliner) {
              persistAndEmitDirectCallLog(u, decliner, 'declined', 0, cleanReply || undefined);
            }
          }
        }
      }

      if (declinerKey) {
        for (const [sId, u] of activeUsers.entries()) {
          if (sId !== socket.id && u.username.toLowerCase() === declinerKey) {
            io.to(sId).emit('direct_call_handled');
          }
        }
      }
    }
  );

  socket.on('direct_call_end', ({ targetUserId, targetUsername }: { targetUserId?: string; targetUsername?: string }) => {
    const ender = activeUsers.get(socket.id);
    const paired = activeDirectCallPairs.get(socket.id);
    const startedAt =
      activeDirectCallStartTimes.get(socket.id) || (paired ? activeDirectCallStartTimes.get(paired) : undefined);
    const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
    activeDirectCallStartTimes.delete(socket.id);

    const endedAssist = remoteAssistManager.endSessionForSocket(socket.id);

    if (paired) {
      const partner = activeUsers.get(paired);
      activeDirectCallPairs.delete(paired);
      activeDirectCallPairs.delete(socket.id);
      activeDirectCallStartTimes.delete(paired);
      if (endedAssist) {
        io.to(paired).emit('remote_assist_stopped', { stoppedBy: ender?.username || 'Karşı taraf' });
      }
      io.to(paired).emit('direct_call_ended');
      if (ender && partner) {
        persistAndEmitDirectCallLog(ender, partner, 'ended', durationSeconds);
      }
    } else if (targetUsername) {
      const targetKey = targetUsername.trim().toLowerCase();
      const pending = pendingDirectCalls.get(targetKey);
      if (pending && pending.callerSocketId === socket.id) {
        clearPendingDirectCallTimer(targetKey);
        pendingDirectCalls.delete(targetKey);
        const targetUser = pending.targetUserId ? activeUsers.get(pending.targetUserId) : undefined;
        persistAndEmitDirectCallLog(ender, targetUser, 'missed', 0);
      }
    }

    const targetName = (targetUsername || '').trim().toLowerCase();
    for (const [sId, u] of activeUsers.entries()) {
      if (
        sId !== paired &&
        ((targetUserId && u.id === targetUserId) ||
          (targetName && u.username.toLowerCase() === targetName) ||
          (targetUserId && u.username.toLowerCase() === targetUserId.toLowerCase()))
      ) {
        activeDirectCallPairs.delete(sId);
        activeDirectCallStartTimes.delete(sId);
        io.to(sId).emit('direct_call_ended');
      }
    }
  });
}
