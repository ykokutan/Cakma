import crypto from 'node:crypto';
import express, { type Express, type Request } from 'express';
import type { BridgeDirection, BridgePlatform, Channel, ChannelBridge, Message, RegisteredAccount, Server, ServerPermission, User } from '../types.js';
import { createAuthMiddlewares, validateExternalWebhookUrl, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { isServerOwner } from '../utils/serverIdentity.js';

export interface ChannelBridgeDeps {
  bridges: ChannelBridge[];
  servers: Server[];
  messages: Record<string, Message[]>;
  activeUsers: Map<string, User>;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission, channel?: Channel) => boolean;
  saveBridges: (list: ChannelBridge[]) => void;
  saveChannelMessageUpsert: (channelId: string, channelMsgs: Message[], msg: Message) => void;
  emitToChannelAudience: (channelId: string, serverId: string, event: string, payload: unknown) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  onMessageCreated?: () => void;
}

export interface PublicChannelBridgeView {
  id: string;
  serverId: string;
  channelId: string;
  platform: BridgePlatform;
  name: string;
  enabled: boolean;
  direction: BridgeDirection;
  inboundPath: string;
  telegramChatId?: string;
  telegramMode?: 'polling' | 'webhook';
  hasTelegramBotToken: boolean;
  discordChannelId?: string;
  hasDiscordWebhook: boolean;
  hasDiscordBotToken: boolean;
  createdBy: string;
  createdAt: string;
  lastSyncAt?: string;
  lastError?: string;
}

export function toPublicBridgeView(b: ChannelBridge): PublicChannelBridgeView {
  return {
    id: b.id,
    serverId: b.serverId,
    channelId: b.channelId,
    platform: b.platform,
    name: b.name,
    enabled: b.enabled,
    direction: b.direction,
    inboundPath: `/api/bridges/${b.platform}/${encodeURIComponent(b.id)}/${encodeURIComponent(b.inboundSecret)}`,
    telegramChatId: b.telegramChatId || '',
    telegramMode: b.telegramMode || 'polling',
    hasTelegramBotToken: Boolean(b.telegramBotToken),
    discordChannelId: b.discordChannelId || '',
    hasDiscordWebhook: Boolean(b.discordWebhookUrl),
    hasDiscordBotToken: Boolean(b.discordBotToken),
    createdBy: b.createdBy,
    createdAt: b.createdAt,
    lastSyncAt: b.lastSyncAt,
    lastError: b.lastError,
  };
}

export function isEligibleBridgeChannel(channel?: Channel): boolean {
  if (!channel) return false;
  if (channel.id.startsWith('dm-') || channel.id.startsWith('gdm-')) return false;
  return channel.type === 'text' || channel.type === 'announcement';
}

export class ChannelBridgeService {
  private tgTimer: ReturnType<typeof setInterval> | null = null;
  private dcTimer: ReturnType<typeof setInterval> | null = null;
  private tgPollBusy = false;
  private dcPollBusy = false;
  // Prevents echo loops when a bridged inbound message triggers any local hook
  private readonly recentInboundHashes = new Map<string, number>();

  constructor(private readonly deps: ChannelBridgeDeps) {}

  start(): void {
    if (this.tgTimer || this.dcTimer) return;
    this.tgTimer = setInterval(() => {
      void this.pollTelegramUpdates();
    }, 6000);
    this.tgTimer.unref?.();

    this.dcTimer = setInterval(() => {
      void this.pollDiscordMessages();
    }, 8000);
    this.dcTimer.unref?.();
  }

  stop(): void {
    if (this.tgTimer) {
      clearInterval(this.tgTimer);
      this.tgTimer = null;
    }
    if (this.dcTimer) {
      clearInterval(this.dcTimer);
      this.dcTimer = null;
    }
  }

  private rememberInboundContent(channelId: string, content: string): void {
    const now = Date.now();
    for (const [k, ts] of this.recentInboundHashes.entries()) {
      if (now - ts > 15_000) this.recentInboundHashes.delete(k);
    }
    const hash = crypto.createHash('sha1').update(`${channelId}:${content.trim()}`).digest('hex');
    this.recentInboundHashes.set(hash, now);
  }

  shouldForwardOutboundMessage(msg: Message): boolean {
    if (!msg || !msg.channelId) return false;
    if (msg.attachments?.some((a) => Boolean(a.e2ee || a.groupE2ee))) return false;
    const authorId = String(msg.author?.id || '');
    if (
      authorId.startsWith('bridge-') ||
      authorId.startsWith('webhook-') ||
      authorId.startsWith('system-')
    ) {
      return false;
    }
    const content = String(msg.content || '').trim();
    if (!content && (!Array.isArray(msg.attachments) || msg.attachments.length === 0)) {
      return false;
    }
    if (content.startsWith('[[CAKMA_')) return false;
    if (msg.channelId.startsWith('dm-') || msg.channelId.startsWith('gdm-')) return false;

    const hash = crypto.createHash('sha1').update(`${msg.channelId}:${content}`).digest('hex');
    const seenAt = this.recentInboundHashes.get(hash);
    if (seenAt && Date.now() - seenAt < 15_000) {
      return false;
    }
    return true;
  }

  deliverInboundMessage(bridge: ChannelBridge, senderName: string, rawText: string, sourceLabel: string): Message | null {
    const srv = this.deps.servers.find((s) => s.id === bridge.serverId);
    const ch = srv?.channels.find((c) => c.id === bridge.channelId);
    if (!srv || !isEligibleBridgeChannel(ch)) return null;

    const cleanSender = this.deps.sanitizeText(String(senderName || sourceLabel)).trim().slice(0, 32) || sourceLabel;
    const cleanText = this.deps.sanitizeText(String(rawText || '')).trim().slice(0, 2000);
    if (!cleanText) return null;

    const tag = bridge.platform === 'telegram' ? 'TG' : 'DC';
    const avatar = bridge.platform === 'telegram' ? '✈️' : '🎮';
    const msg: Message = {
      id: `msg-bridge-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      serverId: srv.id,
      channelId: ch!.id,
      author: {
        id: `bridge-${bridge.platform}-${bridge.id}`,
        username: `${cleanSender} [${tag}]`,
        avatar,
      },
      content: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
    };

    this.rememberInboundContent(ch!.id, cleanText);
    if (!this.deps.messages[ch!.id]) this.deps.messages[ch!.id] = [];
    this.deps.messages[ch!.id].push(msg);
    if (this.deps.messages[ch!.id].length > 500) {
      this.deps.messages[ch!.id] = this.deps.messages[ch!.id].slice(-500);
    }
    this.deps.saveChannelMessageUpsert(ch!.id, this.deps.messages[ch!.id], msg);
    this.deps.emitToChannelAudience(ch!.id, srv.id, 'new_message', msg);
    this.deps.onMessageCreated?.();
    bridge.lastSyncAt = new Date().toISOString();
    bridge.lastError = '';
    this.deps.saveBridges(this.deps.bridges);
    return msg;
  }

  async sendOutboundToBridge(
    bridge: ChannelBridge,
    channelName: string,
    authorName: string,
    text: string,
    attachmentNames: string[] = []
  ): Promise<{ ok: boolean; error?: string }> {
    const suffix = attachmentNames.length > 0 ? `\n📎 ${attachmentNames.join(', ')}` : '';
    const formatted = `[#${channelName}] ${authorName}: ${text}${suffix}`.slice(0, 1950);

    try {
      if (bridge.platform === 'telegram') {
        const token = String(bridge.telegramBotToken || '').trim();
        const chatId = String(bridge.telegramChatId || '').trim();
        if (!token || !chatId) {
          return { ok: false, error: 'Telegram Bot Token veya Chat ID eksik.' };
        }
        const resp = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            chat_id: chatId,
            text: formatted,
            disable_web_page_preview: false,
          }),
        });
        const data = (await resp.json().catch(() => null)) as any;
        if (!resp.ok || !data?.ok) {
          const errMsg = data?.description || `Telegram HTTP ${resp.status}`;
          bridge.lastError = errMsg;
          this.deps.saveBridges(this.deps.bridges);
          return { ok: false, error: errMsg };
        }
        bridge.lastSyncAt = new Date().toISOString();
        bridge.lastError = '';
        this.deps.saveBridges(this.deps.bridges);
        return { ok: true };
      }

      // Discord Outbound (Webhook preferred, or Bot REST API)
      if (bridge.discordWebhookUrl) {
        const check = await validateExternalWebhookUrl(bridge.discordWebhookUrl);
        if (!check.ok || !check.normalizedUrl) {
          bridge.lastError = check.error || 'Discord Webhook URL geçersiz.';
          this.deps.saveBridges(this.deps.bridges);
          return { ok: false, error: bridge.lastError };
        }
        const resp = await fetch(check.normalizedUrl, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            username: `${authorName} (#${channelName})`.slice(0, 80),
            content: `${text}${suffix}`.slice(0, 1950) || '(Ek)',
            allowed_mentions: { parse: [] },
          }),
        });
        if (!resp.ok) {
          const errMsg = `Discord Webhook HTTP ${resp.status}`;
          bridge.lastError = errMsg;
          this.deps.saveBridges(this.deps.bridges);
          return { ok: false, error: errMsg };
        }
        bridge.lastSyncAt = new Date().toISOString();
        bridge.lastError = '';
        this.deps.saveBridges(this.deps.bridges);
        return { ok: true };
      }

      if (bridge.discordBotToken && bridge.discordChannelId) {
        const resp = await fetch(
          `https://discord.com/api/v10/channels/${encodeURIComponent(bridge.discordChannelId)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${bridge.discordBotToken.trim()}`,
            },
            signal: AbortSignal.timeout(8000),
            body: JSON.stringify({
              content: formatted,
              allowed_mentions: { parse: [] },
            }),
          }
        );
        if (!resp.ok) {
          const errMsg = `Discord Bot API HTTP ${resp.status}`;
          bridge.lastError = errMsg;
          this.deps.saveBridges(this.deps.bridges);
          return { ok: false, error: errMsg };
        }
        bridge.lastSyncAt = new Date().toISOString();
        bridge.lastError = '';
        this.deps.saveBridges(this.deps.bridges);
        return { ok: true };
      }

      return { ok: false, error: 'Discord Webhook URL veya Bot Token + Kanal ID eksik.' };
    } catch (err: any) {
      bridge.lastError = err?.message || 'Köprü gönderim hatası';
      this.deps.saveBridges(this.deps.bridges);
      return { ok: false, error: bridge.lastError };
    }
  }

  async forwardMessageToBridges(server: Server, message: Message): Promise<void> {
    if (!this.shouldForwardOutboundMessage(message)) return;
    const ch = server.channels.find((c) => c.id === message.channelId);
    if (!isEligibleBridgeChannel(ch)) return;

    const matching = this.deps.bridges.filter(
      (b) =>
        b.enabled &&
        b.serverId === server.id &&
        b.channelId === message.channelId &&
        (b.direction === 'both' || b.direction === 'outbound')
    );
    if (matching.length === 0) return;

    const attNames = Array.isArray(message.attachments)
      ? message.attachments.map((a) => a.name).filter(Boolean)
      : [];

    await Promise.all(
      matching.map((b) =>
        this.sendOutboundToBridge(b, ch!.name, message.author.username, message.content || '', attNames)
      )
    );
  }

  private async pollTelegramUpdates(): Promise<void> {
    if (this.tgPollBusy) return;
    const activeTg = this.deps.bridges.filter(
      (b) =>
        b.enabled &&
        b.platform === 'telegram' &&
        (b.direction === 'both' || b.direction === 'inbound') &&
        b.telegramMode !== 'webhook' &&
        b.telegramBotToken &&
        b.telegramChatId
    );
    if (activeTg.length === 0) return;

    this.tgPollBusy = true;
    try {
      for (const b of activeTg) {
        try {
          const offset = typeof b.lastTelegramUpdateId === 'number' ? b.lastTelegramUpdateId + 1 : undefined;
          const url =
            `https://api.telegram.org/bot${encodeURIComponent(b.telegramBotToken!)}/getUpdates?limit=20&timeout=0` +
            (offset !== undefined ? `&offset=${offset}` : '');
          const resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
          const data = (await resp.json().catch(() => null)) as any;
          if (!resp.ok || !data?.ok || !Array.isArray(data.result)) continue;

          let maxId = b.lastTelegramUpdateId || 0;
          let changed = false;
          for (const upd of data.result) {
            if (typeof upd.update_id === 'number' && upd.update_id > maxId) {
              maxId = upd.update_id;
              changed = true;
            }
            const m = upd.message || upd.channel_post;
            if (!m) continue;
            if (m.from?.is_bot) continue;
            const chatIdStr = String(m.chat?.id ?? '');
            if (chatIdStr !== String(b.telegramChatId).trim()) continue;
            const text = String(m.text || m.caption || '').trim();
            if (!text) continue;
            const senderName =
              m.from?.username ||
              [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') ||
              m.chat?.title ||
              'Telegram';
            this.deliverInboundMessage(b, senderName, text, 'Telegram');
          }
          if (changed) {
            b.lastTelegramUpdateId = maxId;
            this.deps.saveBridges(this.deps.bridges);
          }
        } catch (err: any) {
          b.lastError = err?.message || 'Telegram polling hatası';
        }
      }
    } finally {
      this.tgPollBusy = false;
    }
  }

  private async pollDiscordMessages(): Promise<void> {
    if (this.dcPollBusy) return;
    const activeDc = this.deps.bridges.filter(
      (b) =>
        b.enabled &&
        b.platform === 'discord' &&
        (b.direction === 'both' || b.direction === 'inbound') &&
        b.discordBotToken &&
        b.discordChannelId
    );
    if (activeDc.length === 0) return;

    this.dcPollBusy = true;
    try {
      for (const b of activeDc) {
        try {
          const isInitialSeed = !b.lastDiscordMessageId;
          const qs = isInitialSeed
            ? '?limit=1'
            : `?after=${encodeURIComponent(b.lastDiscordMessageId!)}&limit=20`;
          const resp = await fetch(
            `https://discord.com/api/v10/channels/${encodeURIComponent(b.discordChannelId!)}/messages${qs}`,
            {
              headers: { Authorization: `Bot ${b.discordBotToken!.trim()}` },
              signal: AbortSignal.timeout(7000),
            }
          );
          if (!resp.ok) continue;
          const list = (await resp.json().catch(() => null)) as any[];
          if (!Array.isArray(list) || list.length === 0) continue;

          // Discord returns newest-first; process oldest-first
          const ordered = [...list].reverse();
          b.lastDiscordMessageId = String(ordered[ordered.length - 1].id);
          if (isInitialSeed) {
            this.deps.saveBridges(this.deps.bridges);
            continue;
          }

          for (const m of ordered) {
            if (m.author?.bot || m.webhook_id) continue;
            const contentParts: string[] = [];
            if (typeof m.content === 'string' && m.content.trim()) contentParts.push(m.content.trim());
            if (Array.isArray(m.attachments)) {
              for (const att of m.attachments) {
                if (att?.url) contentParts.push(String(att.url));
              }
            }
            const combined = contentParts.join('\n').trim();
            if (!combined) continue;
            const sender = m.author?.global_name || m.author?.username || 'Discord';
            this.deliverInboundMessage(b, sender, combined, 'Discord');
          }
        } catch (err: any) {
          b.lastError = err?.message || 'Discord polling hatası';
        }
      }
    } finally {
      this.dcPollBusy = false;
    }
  }
}

export function registerChannelBridgeRoutes(
  app: Express,
  service: ChannelBridgeService,
  deps: ChannelBridgeDeps
): void {
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: (usernameLower) => deps.getAccount(usernameLower),
  });

  const toUserForPerm = (req: AuthenticatedRequest): User => {
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

  const canManageServer = (req: AuthenticatedRequest, srv: Server): boolean => {
    const u = toUserForPerm(req);
    return (
      u.role === 'admin' ||
      isServerOwner(u, srv) ||
      deps.checkServerPermission(u, srv, 'manage_server') ||
      deps.checkServerPermission(u, srv, 'manage_channels')
    );
  };

  app.get('/api/servers/:serverId/bridges', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServer(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Köprüleri görüntülemek için yetkiniz yok.' });
    }
    const list = deps.bridges.filter((b) => b.serverId === srv.id).map(toPublicBridgeView);
    return res.json({ ok: true, bridges: list });
  });

  app.post('/api/servers/:serverId/bridges', requireAuth, express.json({ limit: '32kb' }), async (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServer(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Köprü oluşturmak için yetkiniz yok.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const platform: BridgePlatform = body.platform === 'telegram' ? 'telegram' : 'discord';
    const direction: BridgeDirection =
      body.direction === 'inbound' || body.direction === 'outbound' ? body.direction : 'both';
    const channelId = String(body.channelId || '').trim();
    const targetCh = srv.channels.find((c) => c.id === channelId);
    if (!isEligibleBridgeChannel(targetCh)) {
      return res.status(400).json({ ok: false, error: 'Köprü yalnızca metin veya duyuru kanallarına bağlanabilir.' });
    }

    const name = deps.sanitizeText(String(body.name || `${platform.toUpperCase()} Köprüsü`)).trim().slice(0, 48);
    if (platform === 'discord' && body.discordWebhookUrl) {
      const check = await validateExternalWebhookUrl(String(body.discordWebhookUrl).trim());
      if (!check.ok) {
        return res.status(400).json({ ok: false, error: check.error || 'Discord Webhook URL güvenli değil.' });
      }
    }

    const bridge: ChannelBridge = {
      id: `br-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      serverId: srv.id,
      channelId,
      platform,
      name: name || `${platform.toUpperCase()} Köprüsü`,
      enabled: body.enabled !== false,
      direction,
      inboundSecret: crypto.randomBytes(18).toString('hex'),
      telegramBotToken: typeof body.telegramBotToken === 'string' ? body.telegramBotToken.trim().slice(0, 140) : undefined,
      telegramChatId: typeof body.telegramChatId === 'string' ? body.telegramChatId.trim().slice(0, 64) : undefined,
      telegramMode: body.telegramMode === 'webhook' ? 'webhook' : 'polling',
      discordWebhookUrl: typeof body.discordWebhookUrl === 'string' ? body.discordWebhookUrl.trim().slice(0, 320) : undefined,
      discordBotToken: typeof body.discordBotToken === 'string' ? body.discordBotToken.trim().slice(0, 140) : undefined,
      discordChannelId: typeof body.discordChannelId === 'string' ? body.discordChannelId.trim().slice(0, 40) : undefined,
      createdBy: authReq.authUser!.username,
      createdAt: new Date().toISOString(),
    };

    deps.bridges.push(bridge);
    deps.saveBridges(deps.bridges);
    deps.addAuditLog(
      'KANAL_KOPRUSU_OLUSTURULDU',
      `${authReq.authUser!.username}, ${srv.name}/#${targetCh!.name} için ${platform.toUpperCase()} köprüsü kurdu.`,
      'info'
    );
    return res.json({ ok: true, bridge: toPublicBridgeView(bridge) });
  });

  app.patch('/api/servers/:serverId/bridges/:bridgeId', requireAuth, express.json({ limit: '32kb' }), (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServer(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }
    const bridge = deps.bridges.find((b) => b.id === req.params.bridgeId && b.serverId === srv.id);
    if (!bridge) return res.status(404).json({ ok: false, error: 'Köprü bulunamadı.' });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    if (typeof body.enabled === 'boolean') bridge.enabled = body.enabled;
    if (body.direction === 'both' || body.direction === 'inbound' || body.direction === 'outbound') {
      bridge.direction = body.direction;
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      bridge.name = deps.sanitizeText(body.name.trim()).slice(0, 48);
    }
    deps.saveBridges(deps.bridges);
    return res.json({ ok: true, bridge: toPublicBridgeView(bridge) });
  });

  app.delete('/api/servers/:serverId/bridges/:bridgeId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServer(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }
    const idx = deps.bridges.findIndex((b) => b.id === req.params.bridgeId && b.serverId === srv.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Köprü bulunamadı.' });
    const [removed] = deps.bridges.splice(idx, 1);
    deps.saveBridges(deps.bridges);
    deps.addAuditLog(
      'KANAL_KOPRUSU_SILINDI',
      `${authReq.authUser!.username}, "${removed.name}" köprüsünü sildi.`,
      'info'
    );
    return res.json({ ok: true });
  });

  app.post('/api/servers/:serverId/bridges/:bridgeId/test', requireAuth, async (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServer(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }
    const bridge = deps.bridges.find((b) => b.id === req.params.bridgeId && b.serverId === srv.id);
    if (!bridge) return res.status(404).json({ ok: false, error: 'Köprü bulunamadı.' });

    const ch = srv.channels.find((c) => c.id === bridge.channelId);
    const result = await service.sendOutboundToBridge(
      bridge,
      ch?.name || bridge.channelId,
      authReq.authUser!.username,
      '✅ Çakma köprü bağlantısı test edildi!'
    );
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'Köprü testi başarısız.' });
    }
    return res.json({ ok: true, bridge: toPublicBridgeView(bridge) });
  });

  // Inbound Webhook endpoints (Telegram setWebhook & Discord external relay)
  app.post('/api/bridges/telegram/:bridgeId/:secret', express.json({ limit: '64kb' }), (req, res) => {
    const bridge = deps.bridges.find(
      (b) =>
        b.id === req.params.bridgeId &&
        b.platform === 'telegram' &&
        b.enabled &&
        (b.direction === 'both' || b.direction === 'inbound')
    );
    if (!bridge || bridge.inboundSecret !== req.params.secret) {
      return res.status(403).json({ ok: false, error: 'Geçersiz köprü anahtarı.' });
    }
    const upd = (req.body || {}) as any;
    const m = upd.message || upd.channel_post || upd;
    if (m && !m.from?.is_bot) {
      const text = String(m.text || m.caption || m.content || '').trim();
      const sender =
        m.from?.username ||
        [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') ||
        m.username ||
        'Telegram';
      if (text) {
        service.deliverInboundMessage(bridge, sender, text, 'Telegram');
      }
    }
    return res.json({ ok: true });
  });

  app.post('/api/bridges/discord/:bridgeId/:secret', express.json({ limit: '64kb' }), (req, res) => {
    const bridge = deps.bridges.find(
      (b) =>
        b.id === req.params.bridgeId &&
        b.platform === 'discord' &&
        b.enabled &&
        (b.direction === 'both' || b.direction === 'inbound')
    );
    if (!bridge || bridge.inboundSecret !== req.params.secret) {
      return res.status(403).json({ ok: false, error: 'Geçersiz köprü anahtarı.' });
    }
    const body = (req.body || {}) as any;
    if (body.author?.bot || body.isBot) {
      return res.json({ ok: true, skipped: true });
    }
    const text = String(body.content || body.text || '').trim();
    const sender = String(body.author?.global_name || body.author?.username || body.username || 'Discord');
    if (text) {
      service.deliverInboundMessage(bridge, sender, text, 'Discord');
    }
    return res.json({ ok: true });
  });
}
