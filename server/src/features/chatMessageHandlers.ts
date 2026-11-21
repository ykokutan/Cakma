import type { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  MemberLevelData,
  Message,
  MessageAttachment,
  RegisteredAccount,
  Server,
  ServerPermission,
  User,
} from '../types.js';
import type { SystemConfig } from '../storage.js';
import { canUserAccessChannel, isUserParticipantInDm, parseDmChannelParticipants } from '../utils/channelAccess.js';
import { isUserMemberOfServer } from '../utils/serverDiscovery.js';
import { resolveServerLevelRecord } from '../utils/serverIdentity.js';
import { validatePayload, type SocketEventRateLimiter } from '../utils/socketGuard.js';

export interface ChatMessageHandlerDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  servers: Server[];
  messages: Record<string, Message[]>;
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
}

export function registerChatMessageHandlers(socket: Socket, deps: ChatMessageHandlerDeps): void {
  const {
    io,
    activeUsers,
    registeredAccounts,
    servers,
    messages,
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
    getChannelMessagesPageSmart,
    getChannelMessageContextSmart,
    searchMessagesSmart,
    emitToChannelAudience,
    emitToRelevantUsers,
    sendWebPushToUsername,
    addAuditLog,
  } = deps;

  socket.on('request_older_messages', ({ channelId, beforeId, limit }: { channelId: string; beforeId?: string; limit?: number }) => {
    const requester = activeUsers.get(socket.id);
    if (!requester || !channelId) return;
    if (!canUserAccessChannel(requester, channelId, servers, undefined, messages[channelId])) return;
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
    if (!canUserAccessChannel(requester, channelId, servers, undefined, messages[channelId])) {
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
      if (!canUserAccessChannel(requester, channelId, servers, undefined, messages[channelId])) {
        return socket.emit('server_search_results', { query, results: [] });
      }
      allowedChannels.add(channelId);
    } else {
      for (const s of servers) {
        if (requester.role === 'admin' || isUserMemberOfServer(requester, s)) {
          s.channels.forEach((c) => allowedChannels.add(c.id));
        }
      }
      for (const key of Object.keys(messages)) {
        if (key.startsWith('dm-') && isUserParticipantInDm(requester, key, messages[key])) {
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
    const { serverId, channelId, content, attachments, poll, replyTo } = rawPayload as {
      serverId: string;
      channelId: string;
      content?: string;
      attachments?: MessageAttachment[];
      poll?: any;
      replyTo?: { id: string; username: string; content: string };
    };
    if (typeof channelId !== 'string' || !channelId.trim()) return;
    const rawContent = typeof content === 'string' ? content.trim() : '';
    if (!rawContent && (!Array.isArray(attachments) || attachments.length === 0) && !poll) return;

    if (!canUserAccessChannel(sender, channelId, servers, serverId, messages[channelId])) {
      return socket.emit('server_action_error', {
        message: 'Bu kanala mesaj gönderme yetkiniz yok.',
      });
    }

    const systemConfig = getSystemConfig();
    const targetSrv = servers.find((s) => s.id === serverId);
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
      attachments: attachments || [],
      reactions: {},
      isPinned: false,
      poll: poll || undefined,
      replyTo: replyTo
        ? { id: replyTo.id, username: sanitizeText(replyTo.username), content: sanitizeText(replyTo.content).slice(0, 140) }
        : undefined,
    };

    if (!messages[channelId]) {
      messages[channelId] = [];
    }
    messages[channelId].push(newMessage);
    saveChannelMessageUpsert(channelId, messages[channelId], newMessage);

    emitToChannelAudience(channelId, serverId, 'new_message', newMessage);

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
        if (!canUserAccessChannel({ id: acc.id, accountId: acc.id, username: acc.username, role: acc.role }, channelId, servers, serverId)) {
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
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const existingIdx = msg.reactions[emoji].indexOf(user.username);
    if (existingIdx !== -1) {
      msg.reactions[emoji].splice(existingIdx, 1);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      msg.reactions[emoji].push(user.username);
    }

    saveChannelMessageUpsert(channelId, channelMsgs, msg);
    emitToChannelAudience(channelId, msg.serverId, 'message_reaction_updated', {
      channelId,
      messageId,
      reactions: msg.reactions,
    });
  });

  socket.on('toggle_pin_message', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs)) return;
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
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs)) return;
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
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs)) return;
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

  socket.on('typing_start', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, messages[channelId])) return;
    emitToChannelAudience(channelId, undefined, 'user_typing', { channelId, username: user.username, isTyping: true }, socket.id);
  });

  socket.on('typing_stop', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, messages[channelId])) return;
    emitToChannelAudience(channelId, undefined, 'user_typing', { channelId, username: user.username, isTyping: false }, socket.id);
  });

  socket.on('vote_poll', ({ channelId, messageId, optionId }: { channelId: string; messageId: string; optionId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !channelId || !messageId) return;
    const channelMsgs = messages[channelId];
    if (!channelMsgs) return;
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs)) return;
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg || !msg.poll || msg.poll.closed) return;

    msg.poll.options.forEach((opt) => {
      const voteIdx = opt.votes.indexOf(user.username);
      if (opt.id === optionId) {
        if (voteIdx !== -1) {
          opt.votes.splice(voteIdx, 1);
        } else {
          opt.votes.push(user.username);
        }
      } else if (voteIdx !== -1) {
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
    if (!canUserAccessChannel(user, channelId, servers, undefined, channelMsgs)) return;
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
    if (!canUserAccessChannel(reader, cleanCh, servers, undefined, messages[cleanCh])) return;

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
}
