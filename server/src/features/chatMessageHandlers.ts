import crypto from 'crypto';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  ForumPostMeta,
  ForwardedFromMeta,
  GroupDmRoom,
  MemberLevelData,
  Message,
  MessageAttachment,
  PollData,
  RegisteredAccount,
  Server,
  ServerPermission,
  User,
} from '../types.js';
import type { SystemConfig } from '../storage.js';
import {
  canUserAccessChannel,
  findServerByChannelId,
  isUserMemberOfGroupDm,
  isUserParticipantInDm,
  parseDmChannelParticipants,
} from '../utils/channelAccess.js';
import { resolveChannelPermissions } from '../utils/channelPermissions.js';
import { isUserMemberOfServer } from '../utils/serverDiscovery.js';
import { isServerOwner, resolveServerLevelRecord } from '../utils/serverIdentity.js';
import { validatePayload, type SocketEventRateLimiter } from '../utils/socketGuard.js';
import { closeLfgData, createLfgData, toggleLfgParticipant } from '../utils/lfgHelper.js';

export interface ChatMessageHandlerDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  servers: Server[];
  messages: Record<string, Message[]>;
  groupDms?: GroupDmRoom[];
  onMessageCreated?: () => void;
  serverLevels: Record<string, Record<string, MemberLevelData>>;
  socketEventLimiter: SocketEventRateLimiter;
  getSystemConfig: () => SystemConfig;
  sanitizeText: (input: string) => string;
  isMessageFlooding: (userId: string) => boolean;
  hasDangerousAttachment: (attachments?: MessageAttachment[]) => boolean;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  addMemberXP: (serverId: string, user: User, amount: number, isMessage?: boolean) => void;
  generateAIResponse: (prompt: string, senderName: string) => string;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  saveUserReadCursor: (
    username: string,
    channelId: string,
    lastMessageId: string,
    accounts: Map<string, RegisteredAccount>
  ) => void;
  saveChannelMessageUpsert: (channelId: string, channelMessages: Message[], msg: Message) => void;
  saveChannelMessageDelete: (channelId: string, channelMessages: Message[], messageId: string) => void;
  saveChannelMessagesBulkDelete?: (
    channelId: string,
    channelMessages: Message[],
    messageIds: string[]
  ) => void;
  recordServerAudit?: (
    serverId: string,
    actorUsername: string,
    action: string,
    details: string,
    targetLabel?: string
  ) => void;
  getChannelMessagesPageSmart: (
    allMessages: Record<string, Message[]>,
    channelId: string,
    beforeId?: string,
    limit?: number
  ) => { messages: Message[]; hasMore: boolean };
  getChannelMessageContextSmart: (
    allMessages: Record<string, Message[]>,
    channelId: string,
    messageId: string,
    radius?: number
  ) => { messages: Message[]; hasMoreBefore: boolean; hasMoreAfter: boolean; found: boolean };
  searchMessagesSmart: (
    allMessages: Record<string, Message[]>,
    query: string,
    allowedChannelIds?: Set<string>,
    limit?: number
  ) => Array<{ channelId: string; message: Message }>;
  emitToChannelAudience: (
    channelId: string,
    serverId: string | undefined,
    event: string,
    payload: unknown,
    excludeSocketId?: string
  ) => void;
  emitToRelevantUsers: (subjectUser: User, event: string, payload: unknown) => void;
  sendWebPushToUsername: (
    username: string,
    payload: { title: string; body: string; url?: string; channelId?: string; dmUsername?: string }
  ) => Promise<void>;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  onBeforeMessageBroadcast?: (ctx: {
    sender: User;
    server: Server | undefined;
    channelId: string;
    content: string;
  }) => { blocked: boolean; reason?: string } | void;
  onAfterMessageBroadcast?: (ctx: {
    sender: User;
    server: Server | undefined;
    message: Message;
  }) => void;
  onReactionAdded?: (ctx: {
    user: User;
    serverId: string;
    channelId: string;
    messageId: string;
    emoji: string;
  }) => void;
}

export function registerChatMessageHandlers(socket: Socket, deps: ChatMessageHandlerDeps): void {
  const {
    io,
    activeUsers,
    registeredAccounts,
    servers,
    messages,
    groupDms,
    onMessageCreated,
    serverLevels,
    socketEventLimiter,
    getSystemConfig,
    sanitizeText,
    isMessageFlooding,
    hasDangerousAttachment,
    checkServerPermission,
    addMemberXP,
    generateAIResponse,
    saveAccounts,
    saveUserReadCursor,
    saveChannelMessageUpsert,
    saveChannelMessageDelete,
    saveChannelMessagesBulkDelete,
    recordServerAudit,
    getChannelMessagesPageSmart,
    getChannelMessageContextSmart,
    searchMessagesSmart,
    emitToChannelAudience,
    emitToRelevantUsers,
    sendWebPushToUsername,
    addAuditLog,
    onBeforeMessageBroadcast,
    onAfterMessageBroadcast,
    onReactionAdded,
  } = deps;

  socket.on('request_older_messages', ({ channelId, beforeId, limit }: { channelId: string; beforeId?: string; limit?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || !channelId) return;
    if (!canUserAccessChannel(requester, channelId, servers, undefined, messages[channelId], groupDms)) return;
    const page = getChannelMessagesPageSmart(messages, channelId, beforeId, limit || 50);
    socket.emit('older_messages_loaded', {
      channelId,
      messages: page.messages,
      hasMore: page.hasMore,
    });
  });

  socket.on('request_message_context', (rawPayload: unknown) => {
    const requester = activeUsers.get(socket.id);
    if (!requester) return;
    if (!socketEventLimiter.allow(socket.id, 'request_message_context', 20, 10_000)) return;
    const check = validatePayload<{ channelId: string; messageId: string; radius?: number }>(rawPayload, {
      channelId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      messageId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      radius: { type: 'number', required: false, min: 5, max: 60 },
    });
    if (!check.ok) return;
    const { channelId, messageId, radius } = check.data;
    if (!canUserAccessChannel(requester, channelId, servers, undefined, messages[channelId], groupDms)) {
      return socket.emit('message_context_response', {
        channelId,
        targetMessageId: messageId,
        messages: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
        found: false,
      });
    }
    const ctx = getChannelMessageContextSmart(messages, channelId, messageId, radius ?? 25);
    socket.emit('message_context_response', {
      channelId,
      targetMessageId: messageId,
      messages: ctx.messages,
      hasMoreBefore: ctx.hasMoreBefore,
      hasMoreAfter: ctx.hasMoreAfter,
      found: ctx.found,
    });
  });

  socket.on('search_messages_server', (rawPayload: unknown) => {
    const requester = activeUsers.get(socket.id);
    if (!requester) return;
    if (!socketEventLimiter.allow(socket.id, 'search_messages_server', 20, 10_000)) return;
    const check = validatePayload<{ query: string; channelId?: string }>(rawPayload, {
      query: { type: 'string', required: true, minLen: 1, maxLen: 200 },
      channelId: { type: 'string', required: false, maxLen: 120 },
    });
    if (!check.ok) return;
    const { query, channelId } = check.data;
    const allowedChannels = new Set<string>();
    if (channelId) {
      if (!canUserAccessChannel(requester, channelId, servers, undefined, messages[channelId], groupDms)) {
        return socket.emit('server_search_results', { query, results: [] });
      }
      allowedChannels.add(channelId);
    } else {
      for (const s of servers) {
        if (requester.role === 'admin' || isUserMemberOfServer(requester, s)) {
          s.channels.forEach((c) => {
            if (resolveChannelPermissions(requester, s, c).view_channel) {
              allowedChannels.add(c.id);
            }
          });
        }
      }
      for (const key of Object.keys(messages)) {
        if (key.startsWith('dm-') && isUserParticipantInDm(requester, key, messages[key])) {
          allowedChannels.add(key);
        }
        if (key.startsWith('gdm-') && isUserMemberOfGroupDm(requester, key, groupDms)) {
          allowedChannels.add(key);
        }
      }
    }
    const results = searchMessagesSmart(messages, query, allowedChannels, 50);
    socket.emit('server_search_results', { query, results });
  });

  socket.on('send_message', (rawPayload: unknown) => {
    const sender = activeUsers.get(socket.id);
    if (!sender || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (sender.role !== 'admin' && !socketEventLimiter.allow(socket.id, 'send_message', 20, 10_000)) {
      return socket.emit('chat_flood_error', {
        message: 'Çok hızlı mesaj gönderiyorsunuz. Lütfen bir saniye bekleyin.',
      });
    }
    const { serverId, channelId, content, attachments, poll, replyTo, forumPost, forwardedFrom } = rawPayload as {
      serverId: string;
      channelId: string;
      content?: string;
      attachments?: MessageAttachment[];
      poll?: any;
      replyTo?: { id: string; username: string; content: string };
      forumPost?: ForumPostMeta;
      forwardedFrom?: ForwardedFromMeta;
    };
    if (typeof channelId !== 'string' || !channelId.trim()) return;
    const rawContent = typeof content === 'string' ? content.trim() : '';
    if (!rawContent && (!Array.isArray(attachments) || attachments.length === 0) && !poll) return;

    if (!canUserAccessChannel(sender, channelId, servers, serverId, messages[channelId], groupDms)) {
      return socket.emit('server_action_error', {
        message: 'Bu kanala mesaj gönderme yetkiniz yok.',
      });
    }

    const systemConfig = getSystemConfig();
    const targetSrv = findServerByChannelId(servers, channelId, serverId);
    const targetChannel = targetSrv?.channels.find((c) => c.id === channelId);

    if (targetSrv && targetChannel) {
      const chPerms = resolveChannelPermissions(sender, targetSrv, targetChannel);
      if (!chPerms.send_messages) {
        return socket.emit('server_action_error', {
          message: 'Bu kanala mesaj gönderme yetkiniz yok.',
        });
      }
      if (Array.isArray(attachments) && attachments.length > 0 && !chPerms.attach_files) {
        return socket.emit('server_action_error', {
          message: 'Bu kanala dosya ekleme yetkiniz yok.',
        });
      }
    }

    if (
      targetChannel?.type === 'announcement' &&
      targetSrv &&
      !checkServerPermission(sender, targetSrv, 'manage_channels')
    ) {
      return socket.emit('server_action_error', {
        message: 'Bu duyuru kanalında yalnızca yetkililer paylaşım yapabilir.',
      });
    }

    const timeoutUntil = targetSrv?.timeouts?.[sender.username.toLowerCase()];
    if (timeoutUntil && timeoutUntil > Date.now()) {
      const minsLeft = Math.ceil((timeoutUntil - Date.now()) / 60000);
      return socket.emit('chat_flood_error', {
        message: `Bu sunucuda geçici olarak susturuldunuz. Kalan süre: ~${minsLeft} dakika.`,
      });
    }

    if (sender.role !== 'admin') {
      const maxLen = systemConfig.maxMessageLength || 2000;
      if (rawContent.length > maxLen) {
        return socket.emit('chat_flood_error', {
          message: `Mesajınız sistem mesaj uzunluğu sınırını (${maxLen} karakter) aşıyor.`,
        });
      }
      if (systemConfig.globalBlockLinks && /(https?:\/\/|discord\.gg\/|www\.)/i.test(rawContent)) {
        return socket.emit('chat_flood_error', {
          message: 'Sistem Güvenlik Filtresi: Harici bağlantı paylaşımı tüm sunucularda kapatılmıştır.',
        });
      }
      if (Array.isArray(systemConfig.globalBannedWords) && systemConfig.globalBannedWords.length > 0) {
        const lowerRawGlobal = rawContent.toLowerCase();
        if (systemConfig.globalBannedWords.some((w) => w && lowerRawGlobal.includes(w.toLowerCase()))) {
          return socket.emit('chat_flood_error', {
            message: 'Sistem Güvenlik Filtresi: Mesajınız global yasaklı kelime içerdiği için engellendi.',
          });
        }
      }
    }

    if (targetSrv?.autoModEnabled && sender.role !== 'admin') {
      if (targetSrv.autoModConfig?.blockLinks && /(https?:\/\/|discord\.gg\/|www\.)/i.test(rawContent)) {
        return socket.emit('chat_flood_error', {
          message: 'Otomatik Moderasyon: Bu sunucuda harici bağlantı paylaşımı engellenmiştir.',
        });
      }
      const bannedWords = targetSrv.autoModConfig?.bannedWords || ['amk', 'aq', 'orospu', 'piç', 'sik'];
      const lowerRaw = rawContent.toLowerCase();
      if (bannedWords.some((w) => w && lowerRaw.includes(w.toLowerCase()))) {
        return socket.emit('chat_flood_error', {
          message: 'Otomatik Moderasyon: Mesajınız yasaklı kelime içerdiği için engellendi.',
        });
      }
    }

    if (isMessageFlooding(sender.id)) {
      return socket.emit('chat_flood_error', {
        message: 'Çok hızlı mesaj gönderiyorsunuz! Lütfen birkaç saniye bekleyin.',
      });
    }

    if (hasDangerousAttachment(attachments)) {
      addAuditLog(
        'GUVENLIK_ENGELI',
        `${sender.username} zararlı/çalıştırılabilir dosya (.exe, .bat vb.) yüklemeye çalıştı ve engellendi.`,
        'warn'
      );
      return socket.emit('file_security_error', {
        message: 'Güvenlik gereği çalıştırılabilir veya tehlikeli dosya türleri (.exe, .bat, .cmd, .scr vb.) yüklenemez.',
      });
    }
    if (Array.isArray(attachments) && attachments.length > 0) {
      const maxBytes = (systemConfig.maxUploadSizeMb || 5) * 1024 * 1024;
      const oversized = attachments.some((att) => (att.size || 0) > maxBytes || (att.url && att.url.length > maxBytes * 1.4));
      if (oversized) {
        return socket.emit('file_security_error', {
          message: `Dosya boyutu sistem limitini (${systemConfig.maxUploadSizeMb || 5} MB) aşıyor.`,
        });
      }
    }

    const textContent = sanitizeText(rawContent).slice(0, systemConfig.maxMessageLength || 2000);

    if (onBeforeMessageBroadcast) {
      const gate = onBeforeMessageBroadcast({
        sender,
        server: targetSrv,
        channelId,
        content: textContent,
      });
      if (gate && gate.blocked) {
        return socket.emit('chat_flood_error', {
          message: gate.reason || 'Otomatik Kural: Mesajınız sunucu kuralı nedeniyle engellendi.',
        });
      }
    }

    let cleanForumPost: ForumPostMeta | undefined;
    if (forumPost && typeof forumPost === 'object' && typeof forumPost.title === 'string') {
      const fTitle = sanitizeText(forumPost.title).trim().slice(0, 120);
      if (fTitle) {
        const fTags = Array.isArray(forumPost.tags)
          ? forumPost.tags
              .map((t) => sanitizeText(String(t || '')).trim().slice(0, 24))
              .filter(Boolean)
              .slice(0, 5)
          : undefined;
        cleanForumPost = {
          title: fTitle,
          ...(fTags && fTags.length > 0 ? { tags: fTags } : {}),
        };
      }
    }

    let cleanForwarded: ForwardedFromMeta | undefined;
    if (forwardedFrom && typeof forwardedFrom === 'object' && typeof forwardedFrom.authorUsername === 'string') {
      cleanForwarded = {
        authorUsername: sanitizeText(forwardedFrom.authorUsername).trim().slice(0, 48),
        ...(typeof forwardedFrom.channelName === 'string'
          ? { channelName: sanitizeText(forwardedFrom.channelName).trim().slice(0, 48) }
          : {}),
        ...(typeof forwardedFrom.serverName === 'string'
          ? { serverName: sanitizeText(forwardedFrom.serverName).trim().slice(0, 64) }
          : {}),
        ...(typeof forwardedFrom.timestamp === 'string'
          ? { timestamp: sanitizeText(forwardedFrom.timestamp).trim().slice(0, 24) }
          : {}),
      };
    }

    let cleanPoll: PollData | undefined;
    if (poll && typeof poll === 'object' && typeof poll.question === 'string') {
      const q = sanitizeText(poll.question).trim().slice(0, 200);
      const opts = Array.isArray(poll.options)
        ? poll.options
            .filter((o: unknown) => o && typeof o === 'object' && typeof (o as { text?: unknown }).text === 'string')
            .map((o: { id?: unknown; text: string }, idx: number) => ({
              id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 64) : `opt-${idx + 1}-${Date.now()}`,
              text: sanitizeText(o.text).trim().slice(0, 120),
              votes: [] as string[],
            }))
            .filter((o: { text: string }) => Boolean(o.text))
            .slice(0, 10)
        : [];
      if (q && opts.length >= 2) {
        let closesAt: string | undefined;
        if (typeof poll.closesAt === 'string' && poll.closesAt.trim()) {
          const parsedMs = Date.parse(poll.closesAt);
          if (Number.isFinite(parsedMs) && parsedMs > Date.now()) {
            closesAt = new Date(parsedMs).toISOString();
          }
        }
        cleanPoll = {
          question: q,
          options: opts,
          closed: false,
          totalVotes: 0,
          ...(poll.allowMultiple ? { allowMultiple: true } : {}),
          ...(poll.isAnonymous ? { isAnonymous: true } : {}),
          ...(closesAt ? { closesAt } : {}),
        };
      }
    }

    const sanitizedAttachments = Array.isArray(attachments)
      ? attachments.map((att) => ({
          id: att.id,
          name: att.name,
          size: att.size,
          type: att.type,
          url: att.url,
          ...(att.e2ee && att.e2ee.v === 1 && typeof att.e2ee.iv === 'string'
            ? {
                e2ee: {
                  iv: att.e2ee.iv,
                  origName: String(att.e2ee.origName || '').slice(0, 140),
                  origType: String(att.e2ee.origType || 'application/octet-stream').slice(0, 80),
                  origSize: Number(att.e2ee.origSize) || 0,
                  v: 1 as const,
                },
              }
            : {}),
        }))
      : [];

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      serverId,
      channelId,
      author: {
        id: sender.id,
        username: sender.username,
        avatar: sender.avatar,
      },
      content: textContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: sanitizedAttachments,
      reactions: {},
      isPinned: false,
      poll: cleanPoll,
      replyTo: replyTo
        ? { id: replyTo.id, username: sanitizeText(replyTo.username), content: sanitizeText(replyTo.content).slice(0, 140) }
        : undefined,
      ...(cleanForumPost ? { forumPost: cleanForumPost } : {}),
      ...(cleanForwarded ? { forwardedFrom: cleanForwarded } : {}),
    };

    if (!messages[channelId]) {
      messages[channelId] = [];
    }
    messages[channelId].push(newMessage);
    saveChannelMessageUpsert(channelId, messages[channelId], newMessage);
    onMessageCreated?.();

    emitToChannelAudience(channelId, serverId, 'new_message', newMessage);
    onAfterMessageBroadcast?.({ sender, server: targetSrv, message: newMessage });

    const pushBodyPreview = textContent.startsWith('[E2EE:v1]') || textContent.startsWith('E2EE_V1:')
      ? '🔒 Şifreli bir mesaj gönderdi'
      : (textContent || (attachments?.length ? '📎 Dosya eki gönderdi' : 'Yeni mesaj')).slice(0, 140);

    if (channelId.startsWith('dm-') || serverId === 'direct-messages') {
      const dmPair = parseDmChannelParticipants(channelId);
      const senderLower = sender.username.toLowerCase();
      const targetNames = (dmPair || []).filter((n) => n && n !== senderLower);
      for (const targetName of targetNames) {
        const isOnlineActive = Array.from(activeUsers.values()).some(
          (u) => u.username.toLowerCase() === targetName && u.status !== 'offline' && u.status !== 'dnd'
        );
        if (!isOnlineActive) {
          void sendWebPushToUsername(targetName, {
            title: `${sender.username} (Direkt Mesaj)`,
            body: pushBodyPreview,
            url: `/?dm=${encodeURIComponent(sender.username)}`,
            channelId,
            dmUsername: sender.username,
          });
        }
      }
    } else if (textContent.includes('@')) {
      const mentionMatches = textContent.match(/@([a-zA-Z0-9_.\-çğıöşüÇĞİÖŞÜ]+)/g) || [];
      const uniqueTargets = new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()));
      uniqueTargets.delete(sender.username.toLowerCase());
      uniqueTargets.delete('ai');
      uniqueTargets.delete('bot');
      for (const targetName of uniqueTargets) {
        const acc = registeredAccounts.get(targetName);
        if (!acc) continue;
        if (!canUserAccessChannel({ id: acc.id, accountId: acc.id, username: acc.username, role: acc.role }, channelId, servers, serverId, messages[channelId], groupDms)) {
          continue;
        }
        const isOnlineActive = Array.from(activeUsers.values()).some(
          (u) => u.username.toLowerCase() === targetName && u.status !== 'offline'
        );
        if (!isOnlineActive) {
          void sendWebPushToUsername(acc.username, {
            title: `${sender.username} senden bahsetti`,
            body: pushBodyPreview,
            url: `/?channel=${encodeURIComponent(channelId)}`,
            channelId,
          });
        }
      }
    }

    const userAcc = registeredAccounts.get(sender.username.toLowerCase());
    if (userAcc) {
      userAcc.xp = (userAcc.xp || 0) + 20;
      const newLevel = Math.floor(Math.sqrt(userAcc.xp / 100)) + 1;
      const oldLevel = userAcc.level || 1;
      userAcc.level = newLevel;
      saveAccounts(registeredAccounts);

      if (newLevel > oldLevel) {
        addAuditLog('SEVIYE_ATLAMA', `${sender.username} Seviye ${newLevel}'e yükseldi! 🎉`, 'info');
        emitToRelevantUsers(sender, 'user_level_up', { username: sender.username, level: newLevel, xp: userAcc.xp });
      }
    }

    addMemberXP(serverId, sender, 15 + Math.floor(Math.random() * 10), true);

    const lowerContent = textContent.toLowerCase();
    if (lowerContent.includes('@ai') || lowerContent.includes('@bot') || lowerContent.startsWith('/ai ')) {
      setTimeout(() => {
        const cleanPrompt = textContent.replace(/@ai|@bot|\/ai/gi, '').trim() || 'merhaba';
        const aiAnswer = generateAIResponse(cleanPrompt, sender.username);
        const aiMessage: Message = {
          id: `msg-ai-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-gemini-ai', username: 'Gemini AI Asistan 🤖', avatar: '✨' },
          content: aiAnswer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false,
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(aiMessage);
        saveChannelMessageUpsert(channelId, messages[channelId], aiMessage);
        emitToChannelAudience(channelId, serverId, 'new_message', aiMessage);
      }, 600);
    }

    if (lowerContent === '/zar' || lowerContent === '/roll') {
      setTimeout(() => {
        const rollNum = Math.floor(Math.random() * 6) + 1;
        const rollMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-game', username: 'Oyun Botu 🎲', avatar: '🎲' },
          content: `🎲 **@${sender.username}** zar attı: **${rollNum}** (1-6)`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false,
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(rollMsg);
        saveChannelMessageUpsert(channelId, messages[channelId], rollMsg);
        emitToChannelAudience(channelId, serverId, 'new_message', rollMsg);
      }, 300);
    } else if (lowerContent === '/yazitura' || lowerContent === '/coinflip' || lowerContent === '/yazi-tura') {
      setTimeout(() => {
        const result = Math.random() > 0.5 ? 'YAZI 🪙' : 'TURA 🦅';
        const coinMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-game', username: 'Oyun Botu 🎲', avatar: '🪙' },
          content: `🪙 **@${sender.username}** madeni para attı: **${result}**`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false,
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(coinMsg);
        saveChannelMessageUpsert(channelId, messages[channelId], coinMsg);
        emitToChannelAudience(channelId, serverId, 'new_message', coinMsg);
      }, 300);
    } else if (lowerContent.startsWith('/8ball')) {
      setTimeout(() => {
        const answers = [
          'Kesinlikle evet! ✨',
          'Gözlerim evet diyor. 🎱',
          'Şüphesiz öyle. 👍',
          'Büyük ihtimalle. 🔮',
          'Şu an kestiremiyorum, sonra tekrar sor. ⏳',
          'Buna şimdi odaklanmasan iyi olur. 🤔',
          'Pek olası görünmüyor. ❌',
          'Cevabım hayır. 🛑',
          'Yıldızlar bugün seninle değil! 🌌',
        ];
        const ans = answers[Math.floor(Math.random() * answers.length)];
        const ballMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-game', username: 'Sihirli 8-Ball 🎱', avatar: '🎱' },
          content: `🎱 **Soru:** "${textContent.replace(/\/8ball/gi, '').trim() || 'Geleceğim nasıl?'}"\n🔮 **Cevap:** ${ans}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false,
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(ballMsg);
        saveChannelMessageUpsert(channelId, messages[channelId], ballMsg);
        emitToChannelAudience(channelId, serverId, 'new_message', ballMsg);
      }, 300);
    } else if (lowerContent === '/rank' || lowerContent === '/seviye') {
      setTimeout(() => {
        if (!serverLevels[serverId]) serverLevels[serverId] = {};
        const memberData = resolveServerLevelRecord(serverLevels[serverId], sender).record;
        const rankMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-rank', username: 'Seviye Botu 🏆', avatar: '⭐' },
          content: `🏆 **@${sender.username}** Sunucu İstatistikleri:\n⭐ **Seviye:** ${memberData.level} | ⚡ **XP:** ${memberData.xp}\n💬 **Toplam Mesaj:** ${memberData.messageCount} | 🎙️ **Ses Odası Süresi:** ${memberData.voiceMinutes} dakika`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false,
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(rankMsg);
        saveChannelMessageUpsert(channelId, messages[channelId], rankMsg);
        emitToChannelAudience(channelId, serverId, 'new_message', rankMsg);
      }, 300);
    } else if (lowerContent === '/liderlik' || lowerContent === '/top') {
      setTimeout(() => {
        const sLevels = serverLevels[serverId] || {};
        const sorted = Object.values(sLevels).sort((a, b) => b.xp - a.xp).slice(0, 5);
        let leaderText = '🏆 **Sunucu Liderlik Tablosu (En Aktif Üyeler):**\n';
        if (sorted.length === 0) {
          leaderText += 'Henüz yeterli XP kaydı bulunmuyor!';
        } else {
          sorted.forEach((m, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹';
            leaderText += `${medal} **${idx + 1}. ${m.username}** — Seviye ${m.level} (${m.xp} XP | ${m.messageCount} mesaj)\n`;
          });
        }
        const leadMsg: Message = {
          id: `msg-cmd-${Date.now()}`,
          serverId,
          channelId,
          author: { id: 'bot-rank', username: 'Liderlik Botu 👑', avatar: '🥇' },
          content: leaderText.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {},
          isPinned: false,
        };
        if (!messages[channelId]) messages[channelId] = [];
        messages[channelId].push(leadMsg);
        saveChannelMessageUpsert(channelId, messages[channelId], leadMsg);
        emitToChannelAudience(channelId, serverId, 'new_message', leadMsg);
      }, 300);
    }
  });

  socket.on('add_reaction', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (!socketEventLimiter.allow(socket.id, 'add_reaction', 30, 10_000)) return;
    const check = validatePayload<{ channelId: string; messageId: string; emoji: string }>(rawPayload, {
      channelId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      messageId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      emoji: { type: 'string', required: true, minLen: 1, maxLen: 64 },
    });
    if (!check.ok) return;
    const { channelId, messageId, emoji } = check.data;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const existingIdx = msg.reactions[emoji].indexOf(user.username);
    let added = false;
    if (existingIdx !== -1) {
      msg.reactions[emoji].splice(existingIdx, 1);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      msg.reactions[emoji].push(user.username);
      added = true;
    }

    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'message_reaction_updated', {
      channelId,
      messageId,
      reactions: msg.reactions,
    });
    if (added && msg.serverId) {
      onReactionAdded?.({
        user,
        serverId: msg.serverId,
        channelId,
        messageId,
        emoji,
      });
    }
  });

  socket.on('toggle_pin_message', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg) return;

    const targetServer = servers.find((s) => s.id === msg.serverId || s.channels.some((c) => c.id === channelId));
    if (targetServer && !checkServerPermission(user, targetServer, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Mesaj sabitlemek için Kanalları Yönet yetkiniz yok.' });
    }

    msg.isPinned = !msg.isPinned;
    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'message_pin_updated', {
      channelId,
      messageId,
      isPinned: msg.isPinned,
    });
  });

  socket.on('edit_message', ({ channelId, messageId, newContent }: { channelId: string; messageId: string; newContent: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg) return;
    if (msg.author.username.toLowerCase() !== user.username.toLowerCase()) return;

    const clean = sanitizeText((newContent || '').trim()).slice(0, 4000);
    if (!clean) return;
    msg.content = clean;
    msg.isEdited = true;
    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'message_edited', {
      channelId,
      messageId,
      content: msg.content,
      isEdited: true,
    });
  });

  socket.on('delete_message', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const idx = channelMsgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const msg = channelMsgs[idx];

    const targetServer = servers.find((s) => s.id === msg.serverId || s.channels.some((c) => c.id === channelId));
    const isAuthor = msg.author.username.toLowerCase() === user.username.toLowerCase();
    const canManage = targetServer ? checkServerPermission(user, targetServer, 'manage_channels') : false;
    if (!isAuthor && !canManage && user.role !== 'admin') {
      return socket.emit('server_action_error', { message: 'Bu mesajı silmek için yetkiniz yok.' });
    }

    channelMsgs.splice(idx, 1);
    saveChannelMessageDelete(channelId, channelMsgs, messageId);
    emitToChannelAudience(channelId, msg.serverId, 'message_deleted', { channelId, messageId });
  });

  socket.on('forward_message', (rawPayload: unknown) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) return;
    if (sender.role !== 'admin' && !socketEventLimiter.allow(socket.id, 'forward_message', 10, 30_000)) {
      return socket.emit('chat_flood_error', { message: 'Çok sık mesaj iletiyorsunuz. Lütfen bekleyin.' });
    }
    const check = validatePayload<{
      sourceChannelId: string;
      messageId: string;
      targetChannelId: string;
      targetServerId?: string;
    }>(rawPayload, {
      sourceChannelId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      messageId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      targetChannelId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      targetServerId: { type: 'string', required: false, maxLen: 120 },
    });
    if (!check.ok) return;

    const { sourceChannelId, messageId, targetChannelId, targetServerId } = check.data;
    const sourceMsgs = messages[sourceChannelId];
    if (!sourceMsgs) return;
    if (!canUserAccessChannel(sender, sourceChannelId, servers, undefined, sourceMsgs, groupDms)) {
      return socket.emit('server_action_error', { message: 'Kaynak mesaja erişim yetkiniz yok.' });
    }
    const srcMsg = sourceMsgs.find((m) => m.id === messageId);
    if (!srcMsg) return;

    if (!canUserAccessChannel(sender, targetChannelId, servers, targetServerId, messages[targetChannelId], groupDms)) {
      return socket.emit('server_action_error', { message: 'Hedef kanala mesaj gönderme yetkiniz yok.' });
    }

    const destServer = findServerByChannelId(servers, targetChannelId, targetServerId);
    const destChannel = destServer?.channels.find((c) => c.id === targetChannelId);
    if (destServer && destChannel) {
      const destPerms = resolveChannelPermissions(sender, destServer, destChannel);
      if (!destPerms.send_messages) {
        return socket.emit('server_action_error', {
          message: 'Hedef kanala mesaj gönderme yetkiniz yok.',
        });
      }
      if (Array.isArray(srcMsg.attachments) && srcMsg.attachments.length > 0 && !destPerms.attach_files) {
        return socket.emit('server_action_error', {
          message: 'Hedef kanala dosya ekleme yetkiniz yok.',
        });
      }
    }
    if (
      destChannel?.type === 'announcement' &&
      destServer &&
      !checkServerPermission(sender, destServer, 'manage_channels')
    ) {
      return socket.emit('server_action_error', {
        message: 'Duyuru kanalına yalnızca yetkililer mesaj iletebilir.',
      });
    }

    const srcServer = findServerByChannelId(servers, sourceChannelId, srcMsg.serverId);
    const srcChannel = srcServer?.channels.find((c) => c.id === sourceChannelId);
    const destSrvId =
      destServer?.id || (targetChannelId.startsWith('dm-') || targetChannelId.startsWith('gdm-') ? 'direct-messages' : targetServerId || 'direct-messages');

    const forwardedMsg: Message = {
      id: `msg-fwd-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      serverId: destSrvId,
      channelId: targetChannelId,
      author: {
        id: sender.id,
        username: sender.username,
        avatar: sender.avatar,
      },
      content: srcMsg.content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: Array.isArray(srcMsg.attachments) ? srcMsg.attachments.map((a) => ({ ...a })) : [],
      reactions: {},
      isPinned: false,
      forwardedFrom: {
        authorUsername: srcMsg.author.username,
        channelName: srcChannel?.name,
        serverName: srcServer?.name,
        timestamp: srcMsg.timestamp,
      },
    };

    if (!messages[targetChannelId]) messages[targetChannelId] = [];
    messages[targetChannelId].push(forwardedMsg);
    saveChannelMessageUpsert(targetChannelId, messages[targetChannelId], forwardedMsg);
    onMessageCreated?.();
    emitToChannelAudience(targetChannelId, destSrvId, 'new_message', forwardedMsg);
  });

  socket.on('typing_start', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, messages[channelId], groupDms)) return;
    emitToChannelAudience(channelId, undefined, 'user_typing', { channelId, username: user.username, isTyping: true }, socket.id);
  });

  socket.on('typing_stop', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, messages[channelId], groupDms)) return;
    emitToChannelAudience(channelId, undefined, 'user_typing', { channelId, username: user.username, isTyping: false }, socket.id);
  });

  socket.on('toggle_forum_solved', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (!socketEventLimiter.allow(socket.id, 'toggle_forum_solved', 20, 10_000)) return;
    const check = validatePayload<{ channelId: string; messageId: string }>(rawPayload, {
      channelId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      messageId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
    });
    if (!check.ok) return;
    const { channelId, messageId } = check.data;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg || !msg.forumPost) return;

    const targetServer = findServerByChannelId(servers, channelId, msg.serverId);
    const isAuthor = msg.author.username.toLowerCase() === user.username.toLowerCase();
    const isModerator =
      user.role === 'admin' ||
      (targetServer
        ? isServerOwner(user, targetServer) ||
          checkServerPermission(user, targetServer, 'manage_channels') ||
          checkServerPermission(user, targetServer, 'manage_server')
        : false);

    if (!isAuthor && !isModerator) {
      return socket.emit('server_action_error', {
        message: 'Bu forum konusunun çözüm durumunu yalnızca konu sahibi veya yetkililer değiştirebilir.',
      });
    }

    const nextSolved = !msg.forumPost.solved;
    msg.forumPost = {
      ...msg.forumPost,
      solved: nextSolved,
      solvedAt: nextSolved ? new Date().toISOString() : undefined,
      solvedBy: nextSolved ? user.username : undefined,
    };
    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'forum_post_updated', {
      channelId,
      messageId,
      forumPost: msg.forumPost,
    });
  });

  socket.on('vote_poll', ({ channelId, messageId, optionId }: { channelId: string; messageId: string; optionId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg || !msg.poll || msg.poll.closed) return;

    if (msg.poll.closesAt) {
      const closesMs = Date.parse(msg.poll.closesAt);
      if (Number.isFinite(closesMs) && Date.now() >= closesMs) {
        msg.poll.closed = true;
        saveChannelMessageUpsert(channelId, channelMsgs, msg);
        emitToChannelAudience(channelId, msg.serverId, 'poll_updated', { channelId, messageId, poll: msg.poll });
        return;
      }
    }

    const allowMultiple = Boolean(msg.poll.allowMultiple);
    msg.poll.options.forEach((opt) => {
      const voteIdx = opt.votes.indexOf(user.username);
      if (opt.id === optionId) {
        if (voteIdx !== -1) {
          opt.votes.splice(voteIdx, 1);
        } else {
          opt.votes.push(user.username);
        }
      } else if (!allowMultiple && voteIdx !== -1) {
        opt.votes.splice(voteIdx, 1);
      }
    });

    let total = 0;
    msg.poll.options.forEach((o) => {
      total += o.votes.length;
    });
    msg.poll.totalVotes = total;

    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'poll_updated', { channelId, messageId, poll: msg.poll });
  });

  socket.on('send_thread_message', ({ channelId, parentMessageId, content }: { channelId: string; parentMessageId: string; content: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !parentMessageId) return;
    const clean = sanitizeText(content).trim().slice(0, 2000);
    if (!clean) return;

    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const parent = channelMsgs.find((m) => m.id === parentMessageId);
    if (!parent) return;

    if (!parent.threadMessages) parent.threadMessages = [];
    const threadMsg = {
      id: `thr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
      content: clean,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    parent.threadMessages.push(threadMsg);
    saveChannelMessageUpsert(channelId, channelMsgs, parent);
    emitToChannelAudience(channelId, parent.serverId, 'thread_message_added', {
      channelId,
      parentMessageId,
      threadMessage: threadMsg,
    });
  });

  socket.on('mark_dm_read', ({ partnerUsername }: { partnerUsername: string }) => {
    const reader = activeUsers.get(socket.id);
    if (!reader || typeof partnerUsername !== 'string') return;
    const targetLower = partnerUsername.trim().toLowerCase();
    for (const [sId, u] of activeUsers.entries()) {
      if (u.username.toLowerCase() === targetLower) {
        io.to(sId).emit('dm_read_receipt', {
          readerUsername: reader.username,
          readAt: new Date().toISOString(),
        });
      }
    }
  });

  socket.on('mark_channel_read', (rawPayload: unknown) => {
    const reader = activeUsers.get(socket.id);
    if (!reader) return;
    if (!socketEventLimiter.allow(socket.id, 'mark_channel_read', 60, 10_000)) return;
    const check = validatePayload<{ channelId: string; lastMessageId: string }>(rawPayload, {
      channelId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      lastMessageId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
    });
    if (!check.ok) return;
    const cleanCh = check.data.channelId;
    const cleanMsgId = check.data.lastMessageId;
    if (!canUserAccessChannel(reader, cleanCh, servers, undefined, messages[cleanCh], groupDms)) return;

    const acc = registeredAccounts.get(reader.username.toLowerCase());
    if (!acc) return;
    const cursors = acc.readCursors || {};
    if (cursors[cleanCh] === cleanMsgId) return;
    cursors[cleanCh] = cleanMsgId;
    const keys = Object.keys(cursors);
    if (keys.length > 300) {
      delete cursors[keys[0]];
    }
    acc.readCursors = cursors;
    saveUserReadCursor(reader.username, cleanCh, cleanMsgId, registeredAccounts);
  });

  socket.on('bulk_delete_messages', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (user.role !== 'admin' && !socketEventLimiter.allow(socket.id, 'bulk_delete_messages', 10, 30_000)) {
      return socket.emit('server_action_error', { message: 'Çok sık toplu silme işlemi yapıyorsunuz.' });
    }
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    const raw = rawPayload as { channelId?: unknown; messageIds?: unknown };
    const channelId = typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
    if (!channelId || !Array.isArray(raw.messageIds)) return;

    const targetIds = Array.from(
      new Set(
        raw.messageIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && id.length <= 120)
          .map((id) => id.trim())
      )
    ).slice(0, 100);
    if (targetIds.length === 0) return;

    const channelMsgs = messages[channelId];
    if (!channelMsgs || channelMsgs.length === 0) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;

    const srv = findServerByChannelId(servers, channelId);
    const isAllowed =
      user.role === 'admin' ||
      (srv &&
        (checkServerPermission(user, srv, 'manage_channels') ||
          checkServerPermission(user, srv, 'manage_server')));
    if (!isAllowed) {
      return socket.emit('server_action_error', {
        message: 'Toplu mesaj silme için Kanalı Yönet veya Yönetici yetkiniz yok.',
      });
    }

    const idSet = new Set(targetIds);
    const deletedIds: string[] = [];
    for (let i = channelMsgs.length - 1; i >= 0; i--) {
      if (idSet.has(channelMsgs[i].id)) {
        deletedIds.push(channelMsgs[i].id);
        channelMsgs.splice(i, 1);
      }
    }
    if (deletedIds.length === 0) return;

    if (saveChannelMessagesBulkDelete) {
      saveChannelMessagesBulkDelete(channelId, channelMsgs, deletedIds);
    } else {
      for (const delId of deletedIds) {
        saveChannelMessageDelete(channelId, channelMsgs, delId);
      }
    }

    emitToChannelAudience(channelId, srv?.id, 'messages_bulk_deleted', {
      channelId,
      messageIds: deletedIds,
    });

    if (srv && recordServerAudit) {
      const ch = srv.channels.find((c) => c.id === channelId);
      recordServerAudit(
        srv.id,
        user.username,
        'TOPLU_MESAJ_SILINDI',
        `#${ch?.name || channelId} kanalından ${deletedIds.length} mesaj toplu silindi.`,
        `#${ch?.name || channelId}`
      );
    }
  });

  // LFG / Takım Arama Kartı Oluşturma
  socket.on(
    'create_lfg_post',
    ({
      serverId,
      channelId,
      game,
      title,
      rankOrNote,
      maxSlots,
      voiceChannelId,
    }: {
      serverId: string;
      channelId: string;
      game: string;
      title: string;
      rankOrNote?: string;
      maxSlots?: number;
      voiceChannelId?: string | null;
    }) => {
      const sender = activeUsers.get(socket.id);
      if (!sender || !serverId || !channelId) return;
      if (!socketEventLimiter.allow(socket.id, 'create_lfg_post', 6, 30_000)) return;
      if (!canUserAccessChannel(sender, channelId, servers, undefined, messages[channelId], groupDms)) {
        return;
      }
      const targetSrv = servers.find((s) => s.id === serverId);
      if (!targetSrv) return;
      if (!checkServerPermission(sender, targetSrv, 'send_messages')) {
        return socket.emit('message_error', { message: 'Bu kanala LFG kartı gönderme yetkiniz yok.' });
      }
      const voiceCh = voiceChannelId
        ? targetSrv.channels.find((c) => c.id === voiceChannelId && (c.type === 'voice' || c.type === 'stage'))
        : undefined;
      const lfg = createLfgData({
        game: sanitizeText(game || ''),
        title: sanitizeText(title || ''),
        rankOrNote: rankOrNote ? sanitizeText(rankOrNote) : undefined,
        maxSlots,
        voiceChannelId: voiceCh ? voiceCh.id : null,
        voiceChannelName: voiceCh?.name,
        creatorUsername: sender.username,
        creatorAvatar: sender.avatar,
      });
      if (!lfg) return;

      const msg: Message = {
        id: `msg-lfg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        serverId,
        channelId,
        author: { id: sender.id, username: sender.username, avatar: sender.avatar },
        content: `🎮 **Takım Arama (${lfg.game}):** ${lfg.title}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reactions: {},
        isPinned: false,
        lfg,
      };
      if (!messages[channelId]) messages[channelId] = [];
      messages[channelId].push(msg);
      saveChannelMessageUpsert(channelId, messages[channelId], msg);
      onMessageCreated?.();
      emitToChannelAudience(channelId, serverId, 'new_message', msg);
      onAfterMessageBroadcast?.({ sender, server: targetSrv, message: msg });
    }
  );

  socket.on('toggle_lfg_slot', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg || !msg.lfg) return;

    const result = toggleLfgParticipant(msg.lfg, user.username, user.avatar);
    if (!result.updated) {
      if (result.reason) socket.emit('message_error', { message: result.reason });
      return;
    }
    msg.lfg = result.lfg;
    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'lfg_updated', {
      channelId,
      messageId,
      lfg: msg.lfg,
    });
  });

  socket.on('close_lfg_post', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs, groupDms)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg || !msg.lfg || msg.lfg.closed) return;
    const srv = findServerByChannelId(servers, channelId);
    const canManage =
      msg.author.username.toLowerCase() === user.username.toLowerCase() ||
      user.role === 'admin' ||
      (srv ? checkServerPermission(user, srv, 'manage_server') : false);
    if (!canManage) return;

    msg.lfg = closeLfgData(msg.lfg);
    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'lfg_updated', {
      channelId,
      messageId,
      lfg: msg.lfg,
    });
  });
}
