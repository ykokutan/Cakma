import crypto from 'crypto';
import type { Express, Request } from 'express';
import type { Socket } from 'socket.io';
import type {
  AutomationActionType,
  AutomationTriggerType,
  BotEventType,
  BotSlashCommand,
  Message,
  RegisteredAccount,
  Server,
  ServerAutomationRule,
  ServerBot,
  ServerPermission,
  User,
} from '../types.js';
import { createAuthMiddlewares, validateExternalWebhookUrl, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { canUserAccessChannel, findServerByChannelId } from '../utils/channelAccess.js';
import { resolveChannelPermissions } from '../utils/channelPermissions.js';
import { isServerOwner } from '../utils/serverIdentity.js';
import type { SocketEventRateLimiter } from '../utils/socketGuard.js';

const PRIVILEGED_ROLE_PERMS: ReadonlySet<ServerPermission> = new Set([
  'manage_server',
  'manage_roles',
  'manage_channels',
  'kick_members',
  'ban_members',
]);

export function hashBotToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function verifyBotAuthHeader(authHeader: string | undefined, bots: ServerBot[]): ServerBot | null {
  if (typeof authHeader !== 'string') return null;
  const match = authHeader.trim().match(/^Bot\s+([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/);
  if (!match) return null;
  const [, botId, rawToken] = match;
  const bot = bots.find((b) => b.id === botId && b.enabled);
  if (!bot || !bot.tokenHash) return null;

  const candidateBuf = Buffer.from(hashBotToken(rawToken), 'hex');
  const expectedBuf = Buffer.from(bot.tokenHash, 'hex');
  if (candidateBuf.length === 0 || candidateBuf.length !== expectedBuf.length) return null;
  return crypto.timingSafeEqual(candidateBuf, expectedBuf) ? bot : null;
}

export interface AutomationEvaluationInput {
  type: 'message' | 'member_join';
  server: Server;
  username: string;
  userRole?: string;
  channelId?: string;
  content?: string;
  nowMs?: number;
}

export interface AutomationEvaluationResult {
  matchedRules: ServerAutomationRule[];
  blockMessage: boolean;
  blockReason?: string;
  timeoutMinutes?: number;
  warnReason?: string;
  assignRoleIds: string[];
  notices: Array<{ channelId: string; content: string }>;
}

const LINK_REGEX = /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/|www\.)/i;

export function evaluateAutomationRules(
  input: AutomationEvaluationInput,
  rules: ServerAutomationRule[],
  spamTracker: Map<string, number[]>
): AutomationEvaluationResult {
  const result: AutomationEvaluationResult = {
    matchedRules: [],
    blockMessage: false,
    assignRoleIds: [],
    notices: [],
  };

  const nowMs = input.nowMs ?? Date.now();
  const unameLower = input.username.trim().toLowerCase();
  const isImmune =
    input.userRole === 'admin' || isServerOwner({ username: input.username }, input.server);

  const serverRules = rules.filter((r) => r.enabled && r.serverId === input.server.id);
  if (serverRules.length === 0) return result;

  let trackedStamps: number[] | null = null;
  if (input.type === 'message' && !isImmune) {
    const key = `${input.server.id}:${unameLower}`;
    const prev = spamTracker.get(key) || [];
    trackedStamps = [...prev.filter((ts) => nowMs - ts <= 120_000), nowMs];
    spamTracker.set(key, trackedStamps);
  }

  const contentLower = String(input.content || '').toLowerCase();

  for (const rule of serverRules) {
    let matched = false;
    if (input.type === 'member_join') {
      matched = rule.triggerType === 'member_join';
    } else if (input.type === 'message') {
      if (isImmune) continue;
      if (rule.triggerType === 'message_contains') {
        const keywords = (rule.keywords || []).map((k) => k.trim().toLowerCase()).filter(Boolean);
        matched = keywords.some((kw) => contentLower.includes(kw));
      } else if (rule.triggerType === 'link_posted') {
        matched = LINK_REGEX.test(input.content || '');
      } else if (rule.triggerType === 'spam_burst' && trackedStamps) {
        const limit = Math.max(2, Math.min(20, rule.spamCount || 5));
        const windowMs = Math.max(2, Math.min(120, rule.spamWindowSeconds || 8)) * 1000;
        const recentCount = trackedStamps.filter((ts) => nowMs - ts <= windowMs).length;
        matched = recentCount >= limit;
      }
    }

    if (!matched) continue;
    result.matchedRules.push(rule);

    if (rule.actionType === 'delete_message' && input.type === 'message') {
      result.blockMessage = true;
      result.blockReason = `Otomasyon Kuralı (${rule.name}): Mesajınız otomatik olarak engellendi.`;
    } else if (rule.actionType === 'timeout_user' && input.type === 'message') {
      result.blockMessage = true;
      result.timeoutMinutes = Math.max(1, Math.min(1440, rule.timeoutMinutes || 5));
      result.blockReason = `Otomasyon Kuralı (${rule.name}): ${result.timeoutMinutes} dakika zaman aşımı uygulandı.`;
    } else if (rule.actionType === 'warn_member') {
      result.warnReason = `Otomasyon Kuralı (${rule.name}) tetiklendi.`;
    } else if (rule.actionType === 'assign_role' && rule.roleId) {
      const role = (input.server.roles || []).find((r) => r.id === rule.roleId);
      if (role && !role.isDefault && !role.permissions.some((p) => PRIVILEGED_ROLE_PERMS.has(p))) {
        result.assignRoleIds.push(role.id);
      }
    } else if (rule.actionType === 'send_channel_notice') {
      const chId = rule.noticeChannelId || input.channelId;
      if (chId) {
        const template = rule.noticeTemplate?.trim() || '⚙️ **Otomasyon ({rule}):** @{user} için işlem uygulandı.';
        const rendered = template
          .replace(/\{user\}/g, input.username)
          .replace(/\{server\}/g, input.server.name)
          .replace(/\{rule\}/g, rule.name);
        result.notices.push({ channelId: chId, content: rendered });
      }
    }
  }

  return result;
}

export async function dispatchBotEvent(
  eventName: BotEventType,
  serverId: string,
  payload: Record<string, unknown>,
  bots: ServerBot[]
): Promise<void> {
  const targets = bots.filter(
    (b) => b.enabled && b.serverId === serverId && b.webhookUrl && b.events.includes(eventName)
  );
  if (targets.length === 0) return;

  for (const bot of targets) {
    try {
      const urlCheck = await validateExternalWebhookUrl(bot.webhookUrl!);
      if (!urlCheck.ok || !urlCheck.normalizedUrl) continue;
      void fetch(urlCheck.normalizedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cakma-Event': eventName,
          'X-Cakma-Bot-Id': bot.id,
        },
        body: JSON.stringify({ event: eventName, serverId, botId: bot.id, timestamp: new Date().toISOString(), data: payload }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    } catch {
      // Never block message flow on outbound webhook errors
    }
  }
}

export interface BotsAndAutomationDeps {
  servers: Server[];
  messages: Record<string, Message[]>;
  bots: ServerBot[];
  automations: ServerAutomationRule[];
  activeUsers: Map<string, User>;
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  saveBots: (bots: ServerBot[]) => void;
  saveAutomations: (rules: ServerAutomationRule[]) => void;
  saveChannelMessageUpsert: (channelId: string, channelMessages: Message[], msg: Message) => void;
  emitToChannelAudience: (channelId: string, serverId: string | undefined, event: string, payload: unknown) => void;
  onMessageCreated?: () => void;
  recordServerAudit?: (serverId: string, actorUsername: string, action: string, details: string, target?: string) => void;
}

function redactBot(bot: ServerBot) {
  return {
    id: bot.id,
    serverId: bot.serverId,
    name: bot.name,
    avatar: bot.avatar,
    tokenPrefix: bot.tokenPrefix,
    webhookUrl: bot.webhookUrl,
    events: bot.events,
    slashCommands: bot.slashCommands,
    enabled: bot.enabled,
    createdBy: bot.createdBy,
    createdAt: bot.createdAt,
    lastUsedAt: bot.lastUsedAt,
  };
}

function sanitizeSlashCommands(raw: unknown, sanitizeText: (s: string) => string): BotSlashCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: BotSlashCommand[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = String(obj.name || '')
      .trim()
      .toLowerCase()
      .replace(/^\//, '')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 24);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const description = sanitizeText(String(obj.description || '')).trim().slice(0, 100) || `/${name} komutu`;
    const responseTemplate =
      typeof obj.responseTemplate === 'string'
        ? sanitizeText(obj.responseTemplate).trim().slice(0, 500)
        : undefined;
    out.push({ name, description, ...(responseTemplate ? { responseTemplate } : {}) });
    if (out.length >= 15) break;
  }
  return out;
}

export function registerBotsAndAutomationRoutes(app: Express, deps: BotsAndAutomationDeps): void {
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

  // --- Management: Bots ---
  app.get('/api/servers/:serverId/bots', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Botları yönetme yetkiniz yok.' });
    }
    res.json({ success: true, bots: deps.bots.filter((b) => b.serverId === srv.id).map(redactBot) });
  });

  app.post('/api/servers/:serverId/bots', requireAuth, async (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Bot oluşturma yetkiniz yok.' });
    }
    if (deps.bots.filter((b) => b.serverId === srv.id).length >= 10) {
      return res.status(400).json({ success: false, error: 'Sunucu başına en fazla 10 bot oluşturulabilir.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const name = deps.sanitizeText(String(body.name || '')).trim().slice(0, 36);
    if (!name) return res.status(400).json({ success: false, error: 'Geçerli bir bot adı girin.' });

    let webhookUrl: string | undefined;
    if (typeof body.webhookUrl === 'string' && body.webhookUrl.trim()) {
      const check = await validateExternalWebhookUrl(body.webhookUrl.trim());
      if (!check.ok || !check.normalizedUrl) {
        return res.status(400).json({ success: false, error: check.error || 'Geçersiz bot webhook URL.' });
      }
      webhookUrl = check.normalizedUrl;
    }

    const validEvents: BotEventType[] = Array.isArray(body.events)
      ? body.events.filter((e: unknown): e is BotEventType => e === 'message_create' || e === 'member_join' || e === 'reaction_add')
      : ['message_create'];

    const botId = `bot-${crypto.randomBytes(5).toString('hex')}`;
    const rawSecret = crypto.randomBytes(24).toString('base64url');
    const bot: ServerBot = {
      id: botId,
      serverId: srv.id,
      name,
      avatar: typeof body.avatar === 'string' && body.avatar.trim() ? body.avatar.trim().slice(0, 8) : '🤖',
      tokenHash: hashBotToken(rawSecret),
      tokenPrefix: `${botId}.${rawSecret.slice(0, 6)}...`,
      ...(webhookUrl ? { webhookUrl } : {}),
      events: validEvents,
      slashCommands: sanitizeSlashCommands(body.slashCommands, deps.sanitizeText),
      enabled: body.enabled !== false,
      createdBy: acc.username,
      createdAt: new Date().toISOString(),
    };

    deps.bots.push(bot);
    deps.saveBots(deps.bots);
    deps.recordServerAudit?.(srv.id, acc.username, 'BOT_OLUSTURULDU', `"${bot.name}" botu oluşturuldu.`, bot.name);
    res.json({ success: true, bot: redactBot(bot), botToken: `${bot.id}.${rawSecret}` });
  });

  app.patch('/api/servers/:serverId/bots/:botId', requireAuth, async (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Botu düzenleme yetkiniz yok.' });
    }
    const bot = deps.bots.find((b) => b.id === req.params.botId && b.serverId === srv.id);
    if (!bot) return res.status(404).json({ success: false, error: 'Bot bulunamadı.' });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    if (typeof body.name === 'string' && body.name.trim()) {
      bot.name = deps.sanitizeText(body.name).trim().slice(0, 36);
    }
    if (typeof body.enabled === 'boolean') bot.enabled = body.enabled;
    if (typeof body.webhookUrl === 'string') {
      if (!body.webhookUrl.trim()) {
        bot.webhookUrl = undefined;
      } else {
        const check = await validateExternalWebhookUrl(body.webhookUrl.trim());
        if (!check.ok || !check.normalizedUrl) {
          return res.status(400).json({ success: false, error: check.error || 'Geçersiz bot webhook URL.' });
        }
        bot.webhookUrl = check.normalizedUrl;
      }
    }
    if (Array.isArray(body.events)) {
      bot.events = body.events.filter(
        (e: unknown): e is BotEventType => e === 'message_create' || e === 'member_join' || e === 'reaction_add'
      );
    }
    if (Array.isArray(body.slashCommands)) {
      bot.slashCommands = sanitizeSlashCommands(body.slashCommands, deps.sanitizeText);
    }
    deps.saveBots(deps.bots);
    res.json({ success: true, bot: redactBot(bot) });
  });

  app.delete('/api/servers/:serverId/bots/:botId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Bot silme yetkiniz yok.' });
    }
    const idx = deps.bots.findIndex((b) => b.id === req.params.botId && b.serverId === srv.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Bot bulunamadı.' });
    const [removed] = deps.bots.splice(idx, 1);
    deps.saveBots(deps.bots);
    deps.recordServerAudit?.(srv.id, authReq.authUser!.username, 'BOT_SILINDI', `"${removed.name}" botu silindi.`, removed.name);
    res.json({ success: true });
  });

  // --- Management: Automation Rules ---
  app.get('/api/servers/:serverId/automations', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Otomasyon kurallarını görüntüleme yetkiniz yok.' });
    }
    res.json({ success: true, rules: deps.automations.filter((r) => r.serverId === srv.id) });
  });

  app.post('/api/servers/:serverId/automations', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Otomasyon kuralı oluşturma yetkiniz yok.' });
    }
    if (deps.automations.filter((r) => r.serverId === srv.id).length >= 30) {
      return res.status(400).json({ success: false, error: 'Sunucu başına en fazla 30 otomasyon kuralı oluşturulabilir.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const name = deps.sanitizeText(String(body.name || '')).trim().slice(0, 60);
    const triggerType = String(body.triggerType || '') as AutomationTriggerType;
    const actionType = String(body.actionType || '') as AutomationActionType;
    if (!name) return res.status(400).json({ success: false, error: 'Kural adı zorunludur.' });
    if (!['message_contains', 'spam_burst', 'member_join', 'link_posted'].includes(triggerType)) {
      return res.status(400).json({ success: false, error: 'Geçersiz tetikleyici tipi.' });
    }
    if (!['delete_message', 'timeout_user', 'assign_role', 'send_channel_notice', 'warn_member'].includes(actionType)) {
      return res.status(400).json({ success: false, error: 'Geçersiz aksiyon tipi.' });
    }

    let roleId: string | undefined;
    if (actionType === 'assign_role') {
      const candidate = typeof body.roleId === 'string' ? body.roleId.trim() : '';
      const role = (srv.roles || []).find((r) => r.id === candidate);
      if (!role || role.isDefault || role.permissions.some((p) => PRIVILEGED_ROLE_PERMS.has(p))) {
        return res.status(400).json({ success: false, error: 'Yönetici veya geçersiz bir rol otomatik atanamaz.' });
      }
      roleId = role.id;
    }

    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k: unknown) => deps.sanitizeText(String(k || '')).trim()).filter(Boolean).slice(0, 30)
      : undefined;

    const rule: ServerAutomationRule = {
      id: `auto-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId: srv.id,
      name,
      enabled: body.enabled !== false,
      triggerType,
      ...(keywords && keywords.length > 0 ? { keywords } : {}),
      ...(body.spamCount !== undefined ? { spamCount: Math.max(2, Math.min(20, Number(body.spamCount) || 5)) } : {}),
      ...(body.spamWindowSeconds !== undefined
        ? { spamWindowSeconds: Math.max(2, Math.min(120, Number(body.spamWindowSeconds) || 8)) }
        : {}),
      actionType,
      ...(body.timeoutMinutes !== undefined
        ? { timeoutMinutes: Math.max(1, Math.min(1440, Number(body.timeoutMinutes) || 5)) }
        : {}),
      ...(roleId ? { roleId } : {}),
      ...(typeof body.noticeChannelId === 'string' && body.noticeChannelId.trim()
        ? { noticeChannelId: body.noticeChannelId.trim() }
        : {}),
      ...(typeof body.noticeTemplate === 'string' && body.noticeTemplate.trim()
        ? { noticeTemplate: deps.sanitizeText(body.noticeTemplate).trim().slice(0, 400) }
        : {}),
      createdBy: acc.username,
      createdAt: new Date().toISOString(),
    };

    deps.automations.push(rule);
    deps.saveAutomations(deps.automations);
    deps.recordServerAudit?.(srv.id, acc.username, 'OTOMASYON_EKLENDI', `"${rule.name}" kuralı oluşturuldu.`, rule.name);
    res.json({ success: true, rule });
  });

  app.patch('/api/servers/:serverId/automations/:ruleId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Otomasyon kuralını düzenleme yetkiniz yok.' });
    }
    const rule = deps.automations.find((r) => r.id === req.params.ruleId && r.serverId === srv.id);
    if (!rule) return res.status(404).json({ success: false, error: 'Kural bulunamadı.' });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    if (typeof body.enabled === 'boolean') rule.enabled = body.enabled;
    if (typeof body.name === 'string' && body.name.trim()) rule.name = deps.sanitizeText(body.name).trim().slice(0, 60);
    if (Array.isArray(body.keywords)) {
      rule.keywords = body.keywords.map((k: unknown) => deps.sanitizeText(String(k || '')).trim()).filter(Boolean).slice(0, 30);
    }
    deps.saveAutomations(deps.automations);
    res.json({ success: true, rule });
  });

  app.delete('/api/servers/:serverId/automations/:ruleId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    if (!deps.checkServerPermission(toUser(authReq), srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Otomasyon kuralını silme yetkiniz yok.' });
    }
    const idx = deps.automations.findIndex((r) => r.id === req.params.ruleId && r.serverId === srv.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Kural bulunamadı.' });
    deps.automations.splice(idx, 1);
    deps.saveAutomations(deps.automations);
    res.json({ success: true });
  });

  // --- Public Bot REST API v1 ---
  app.get('/api/bot/v1/servers/:serverId/channels', (req: Request, res) => {
    const bot = verifyBotAuthHeader(req.headers.authorization, deps.bots);
    if (!bot) return res.status(401).json({ success: false, error: 'Geçersiz bot kimlik doğrulaması.' });
    if (bot.serverId !== req.params.serverId) {
      return res.status(403).json({ success: false, error: 'Bu bot yalnızca kendi sunucusuna erişebilir.' });
    }
    const srv = deps.servers.find((s) => s.id === bot.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    bot.lastUsedAt = new Date().toISOString();
    res.json({
      success: true,
      channels: srv.channels.map((c) => ({ id: c.id, name: c.name, type: c.type, topic: c.topic })),
    });
  });

  app.post('/api/bot/v1/channels/:channelId/messages', (req: Request, res) => {
    const bot = verifyBotAuthHeader(req.headers.authorization, deps.bots);
    if (!bot) return res.status(401).json({ success: false, error: 'Geçersiz bot kimlik doğrulaması.' });

    const srv = deps.servers.find((s) => s.id === bot.serverId);
    const ch = srv?.channels.find((c) => c.id === req.params.channelId);
    if (!srv || !ch) {
      return res.status(404).json({ success: false, error: 'Kanal bu botun sunucusunda bulunamadı.' });
    }
    const content = deps.sanitizeText(String(req.body?.content || '')).trim().slice(0, 2000);
    if (!content) {
      return res.status(400).json({ success: false, error: 'Mesaj içeriği boş olamaz.' });
    }

    const msg: Message = {
      id: `msg-bot-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId: srv.id,
      channelId: ch.id,
      author: {
        id: bot.id,
        username: `${bot.name} [BOT]`,
        avatar: bot.avatar || '🤖',
      },
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
      isPinned: false,
    };

    if (!deps.messages[ch.id]) deps.messages[ch.id] = [];
    deps.messages[ch.id].push(msg);
    deps.saveChannelMessageUpsert(ch.id, deps.messages[ch.id], msg);
    bot.lastUsedAt = new Date().toISOString();
    deps.saveBots(deps.bots);
    deps.onMessageCreated?.();
    deps.emitToChannelAudience(ch.id, srv.id, 'new_message', msg);

    res.json({ success: true, message: msg });
  });
}

export function registerBotCommandSocketHandlers(
  socket: Socket,
  deps: {
    activeUsers: Map<string, User>;
    servers: Server[];
    messages: Record<string, Message[]>;
    bots: ServerBot[];
    socketEventLimiter: SocketEventRateLimiter;
    sanitizeText: (input: string) => string;
    saveChannelMessageUpsert: (channelId: string, channelMessages: Message[], msg: Message) => void;
    emitToChannelAudience: (channelId: string, serverId: string | undefined, event: string, payload: unknown) => void;
    onMessageCreated?: () => void;
  }
): void {
  socket.on('execute_custom_command', async (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'execute_custom_command', 15, 20_000)) return;

    const { serverId, channelId, commandName, args } = rawPayload as {
      serverId?: unknown;
      channelId?: unknown;
      commandName?: unknown;
      args?: unknown;
    };
    if (typeof channelId !== 'string' || typeof commandName !== 'string') return;
    if (!canUserAccessChannel(actor, channelId, deps.servers, typeof serverId === 'string' ? serverId : undefined, deps.messages[channelId])) {
      return;
    }

    const srv = findServerByChannelId(deps.servers, channelId, typeof serverId === 'string' ? serverId : undefined);
    const ch = srv?.channels.find((c) => c.id === channelId);
    if (!srv || !ch) return;
    if (!resolveChannelPermissions(actor, srv, ch).send_messages) return;

    const cleanCmd = commandName.trim().toLowerCase().replace(/^\//, '');
    const cleanArgs = typeof args === 'string' ? deps.sanitizeText(args).trim().slice(0, 400) : '';

    let matchedBot: ServerBot | undefined;
    let matchedCmd: BotSlashCommand | undefined;
    for (const bot of deps.bots) {
      if (!bot.enabled || bot.serverId !== srv.id) continue;
      const found = (bot.slashCommands || []).find((c) => c.name.toLowerCase() === cleanCmd);
      if (found) {
        matchedBot = bot;
        matchedCmd = found;
        break;
      }
    }
    if (!matchedBot || !matchedCmd) return;

    let responseText = '';
    if (matchedCmd.responseTemplate) {
      responseText = matchedCmd.responseTemplate
        .replace(/\{user\}/g, actor.username)
        .replace(/\{args\}/g, cleanArgs || '-')
        .replace(/\{channel\}/g, `#${ch.name}`)
        .replace(/\{server\}/g, srv.name);
    } else if (matchedBot.webhookUrl) {
      try {
        const urlCheck = await validateExternalWebhookUrl(matchedBot.webhookUrl);
        if (urlCheck.ok && urlCheck.normalizedUrl) {
          const resp = await fetch(urlCheck.normalizedUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Cakma-Event': 'command_invoke',
              'X-Cakma-Bot-Id': matchedBot.id,
            },
            body: JSON.stringify({
              event: 'command_invoke',
              serverId: srv.id,
              channelId: ch.id,
              command: matchedCmd.name,
              args: cleanArgs,
              user: { id: actor.id, username: actor.username },
            }),
            signal: AbortSignal.timeout(4000),
          });
          if (resp.ok) {
            const json: any = await resp.json().catch(() => null);
            if (json && typeof json.content === 'string') {
              responseText = deps.sanitizeText(json.content).trim().slice(0, 2000);
            }
          }
        }
      } catch {
        responseText = `⚠️ Bot (/${matchedCmd.name}) şu anda yanıt vermiyor.`;
      }
    }

    if (!responseText) {
      responseText = `⚡ **/${matchedCmd.name}** komutu @${actor.username} tarafından çalıştırıldı.`;
    }

    const msg: Message = {
      id: `msg-botcmd-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId: srv.id,
      channelId: ch.id,
      author: {
        id: matchedBot.id,
        username: `${matchedBot.name} [BOT]`,
        avatar: matchedBot.avatar || '🤖',
      },
      content: responseText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
      isPinned: false,
    };

    if (!deps.messages[ch.id]) deps.messages[ch.id] = [];
    deps.messages[ch.id].push(msg);
    deps.saveChannelMessageUpsert(ch.id, deps.messages[ch.id], msg);
    deps.onMessageCreated?.();
    deps.emitToChannelAudience(ch.id, srv.id, 'new_message', msg);
  });
}
