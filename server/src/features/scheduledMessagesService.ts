import crypto from 'crypto';
import type { Express, Request } from 'express';
import type { Message, RegisteredAccount, ScheduledMessage, Server, ServerPermission, User } from '../types.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';

export interface ScheduledMessagesServiceDeps {
  scheduledMessages: ScheduledMessage[];
  servers: Server[];
  messages: Record<string, Message[]>;
  saveScheduledMessages: (items: ScheduledMessage[]) => void;
  saveChannelMessageUpsert: (channelId: string, channelMessages: Message[], msg: Message) => void;
  emitToChannelAudience: (channelId: string, serverId: string | undefined, event: string, payload: unknown) => void;
  onMessageCreated?: () => void;
  recordServerAudit?: (serverId: string, actorUsername: string, action: string, details: string, target?: string) => void;
}

export class ScheduledMessagesService {
  private timer: NodeJS.Timeout | null = null;
  private readonly deps: ScheduledMessagesServiceDeps;

  constructor(deps: ScheduledMessagesServiceDeps) {
    this.deps = deps;
  }

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tick(nowMs = Date.now()): number {
    let dispatched = 0;
    let dirty = false;

    for (const item of this.deps.scheduledMessages) {
      if (item.status !== 'pending') continue;
      const dueMs = new Date(item.scheduledFor).getTime();
      if (!Number.isFinite(dueMs) || dueMs > nowMs) continue;

      const srv = this.deps.servers.find((s) => s.id === item.serverId);
      const ch = srv?.channels.find((c) => c.id === item.channelId);
      if (!srv || !ch) {
        item.status = 'cancelled';
        dirty = true;
        continue;
      }

      const msg: Message = {
        id: `msg-sched-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        serverId: item.serverId,
        channelId: item.channelId,
        author: {
          id: `scheduled-${item.id}`,
          username: item.authorUsername,
          avatar: item.authorAvatar || '⏰',
        },
        content: item.content,
        timestamp: new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reactions: {},
        isPinned: false,
      };

      if (!this.deps.messages[item.channelId]) {
        this.deps.messages[item.channelId] = [];
      }
      this.deps.messages[item.channelId].push(msg);
      this.deps.saveChannelMessageUpsert(item.channelId, this.deps.messages[item.channelId], msg);
      this.deps.onMessageCreated?.();
      this.deps.emitToChannelAudience(item.channelId, item.serverId, 'new_message', msg);

      item.lastSentAt = new Date(nowMs).toISOString();
      if (item.repeatIntervalMinutes && item.repeatIntervalMinutes >= 5) {
        const stepMs = item.repeatIntervalMinutes * 60_000;
        let nextMs = dueMs + stepMs;
        while (nextMs <= nowMs) {
          nextMs += stepMs;
        }
        item.scheduledFor = new Date(nextMs).toISOString();
      } else {
        item.status = 'sent';
      }
      dirty = true;
      dispatched += 1;
    }

    if (dirty) {
      this.deps.saveScheduledMessages(this.deps.scheduledMessages);
    }
    return dispatched;
  }
}

export interface ScheduledMessagesRouteDeps {
  scheduledMessages: ScheduledMessage[];
  servers: Server[];
  activeUsers: Map<string, User>;
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  saveScheduledMessages: (items: ScheduledMessage[]) => void;
  recordServerAudit?: (serverId: string, actorUsername: string, action: string, details: string, target?: string) => void;
}

export function registerScheduledMessagesRoutes(app: Express, deps: ScheduledMessagesRouteDeps): void {
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: deps.getAccount,
  });

  const toUser = (req: AuthenticatedRequest): User => {
    const acc = req.authUser!.account;
    for (const u of deps.activeUsers.values()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) return u;
    }
    return {
      id: acc.id,
      accountId: acc.id,
      username: acc.username,
      role: acc.role,
      avatar: acc.avatar,
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
    };
  };

  app.get('/api/servers/:serverId/scheduled-messages', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!deps.checkServerPermission(u, srv, 'manage_channels') && !deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Zamanlanmış mesajları yönetme yetkiniz yok.' });
    }
    const items = deps.scheduledMessages
      .filter((m) => m.serverId === srv.id && m.status !== 'cancelled')
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
    res.json({ success: true, scheduledMessages: items });
  });

  app.post('/api/servers/:serverId/scheduled-messages', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!deps.checkServerPermission(u, srv, 'manage_channels') && !deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Zamanlanmış mesaj oluşturma yetkiniz yok.' });
    }

    const pendingCount = deps.scheduledMessages.filter((m) => m.serverId === srv.id && m.status === 'pending').length;
    if (pendingCount >= 50) {
      return res.status(400).json({ success: false, error: 'Sunucu başına en fazla 50 bekleyen zamanlanmış mesaj olabilir.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
    const ch = srv.channels.find((c) => c.id === channelId && c.type !== 'voice' && c.type !== 'stage');
    if (!ch) {
      return res.status(400).json({ success: false, error: 'Geçerli bir metin veya duyuru kanalı seçin.' });
    }

    const content = deps.sanitizeText(String(body.content || '')).trim().slice(0, 2000);
    if (!content) {
      return res.status(400).json({ success: false, error: 'Mesaj içeriği boş olamaz.' });
    }

    const parsedDate = new Date(String(body.scheduledFor || ''));
    if (!Number.isFinite(parsedDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Geçerli bir tarih/saat girin.' });
    }

    const rawRepeat = body.repeatIntervalMinutes !== undefined ? Number(body.repeatIntervalMinutes) : 0;
    const repeatIntervalMinutes =
      Number.isFinite(rawRepeat) && rawRepeat >= 5 ? Math.min(43_200, Math.floor(rawRepeat)) : undefined;

    const created: ScheduledMessage = {
      id: `sched-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId: srv.id,
      channelId: ch.id,
      authorUsername: acc.username,
      authorAvatar: acc.avatar,
      content,
      scheduledFor: parsedDate.toISOString(),
      ...(repeatIntervalMinutes ? { repeatIntervalMinutes } : {}),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    deps.scheduledMessages.push(created);
    deps.saveScheduledMessages(deps.scheduledMessages);
    deps.recordServerAudit?.(
      srv.id,
      acc.username,
      'ZAMANLANMIS_MESAJ_EKLENDI',
      `#${ch.name} kanalına ${created.scheduledFor} tarihli mesaj zamanlandı.`,
      `#${ch.name}`
    );

    res.json({ success: true, scheduledMessage: created });
  });

  app.delete('/api/servers/:serverId/scheduled-messages/:id', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!deps.checkServerPermission(u, srv, 'manage_channels') && !deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Zamanlanmış mesajı iptal etme yetkiniz yok.' });
    }

    const idx = deps.scheduledMessages.findIndex((m) => m.id === req.params.id && m.serverId === srv.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });

    deps.scheduledMessages[idx].status = 'cancelled';
    deps.saveScheduledMessages(deps.scheduledMessages);
    res.json({ success: true });
  });
}
