import crypto from 'crypto';
import type { Express, Request } from 'express';
import type {
  Channel,
  ChannelCategory,
  Message,
  RegisteredAccount,
  Server,
  ServerCategory,
  ServerPermission,
  ServerRole,
  ServerWebhook,
  User,
} from '../types.js';
import { getDefaultRoles } from '../mockData.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { getPersistentUserId, isServerOwner } from '../utils/serverIdentity.js';

export interface ServerTemplateDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ServerCategory;
  categories: Array<{ key: string; name: string; position: number }>;
  channels: Array<{
    name: string;
    type: 'text' | 'voice' | 'announcement' | 'forum';
    categoryKey?: string;
    topic?: string;
    isTempCreatorChannel?: boolean;
  }>;
  rules: string[];
}

export const SERVER_TEMPLATES: ServerTemplateDefinition[] = [
  {
    id: 'gaming',
    name: 'Oyun & Espor Klanı',
    description: 'Duyurular, takım arama forumu, genel sohbet ve rekabetçi ses odaları.',
    icon: '🎮',
    category: 'gaming',
    categories: [
      { key: 'info', name: 'Bilgi & Duyuru', position: 0 },
      { key: 'text', name: 'Metin & Forum', position: 1 },
      { key: 'voice', name: 'Ses & Oda Kur', position: 2 },
    ],
    channels: [
      { name: 'duyurular', type: 'announcement', categoryKey: 'info', topic: 'Turnuva ve klan duyuruları' },
      { name: 'genel', type: 'text', categoryKey: 'text', topic: 'Günlük oyun sohbeti' },
      { name: 'takim-arama', type: 'forum', categoryKey: 'text', topic: 'Kadro ve duo ilanları' },
      { name: 'Lobi', type: 'voice', categoryKey: 'voice' },
      { name: 'Rekabetçi 1', type: 'voice', categoryKey: 'voice' },
      { name: '➕ Oda Kur (+)', type: 'voice', categoryKey: 'voice', isTempCreatorChannel: true },
    ],
    rules: ['Saygılı ve toksik olmayan iletişim esastır.', 'Hile veya kural dışı yazılım paylaşımı yasaktır.'],
  },
  {
    id: 'community',
    name: 'Yazılım & Topluluk Hub',
    description: 'Sürüm duyuruları, soru-cevap forumu, kod paylaşımı ve ortak çalışma odaları.',
    icon: '⚡',
    category: 'tech',
    categories: [
      { key: 'hub', name: 'Merkez', position: 0 },
      { key: 'dev', name: 'Geliştirme & Yardım', position: 1 },
      { key: 'lounge', name: 'Sesli Sohbet', position: 2 },
    ],
    channels: [
      { name: 'guncellemeler', type: 'announcement', categoryKey: 'hub', topic: 'Resmi sürüm notları ve webhook akışı' },
      { name: 'genel-sohbet', type: 'text', categoryKey: 'hub' },
      { name: 'yardim-forumu', type: 'forum', categoryKey: 'dev', topic: 'Sorularını konu başlığıyla paylaş' },
      { name: 'proje-vitrin', type: 'text', categoryKey: 'dev' },
      { name: 'Ortak Çalışma', type: 'voice', categoryKey: 'lounge' },
      { name: 'Kahve Molası', type: 'voice', categoryKey: 'lounge' },
    ],
    rules: ['Sorularınızı #yardim-forumu altında yeni başlık açarak paylaşın.', 'Spam ve izinsiz reklam yapmayın.'],
  },
  {
    id: 'friends',
    name: 'Arkadaş Grubu',
    description: 'Sade sohbet, müzik paylaşımı ve rahat ses odaları.',
    icon: '☕',
    category: 'community',
    categories: [
      { key: 'chat', name: 'Sohbet', position: 0 },
      { key: 'voice', name: 'Odalar', position: 1 },
    ],
    channels: [
      { name: 'sohbet', type: 'text', categoryKey: 'chat' },
      { name: 'muzik-linkler', type: 'text', categoryKey: 'chat' },
      { name: 'Kahve Odası', type: 'voice', categoryKey: 'voice' },
      { name: 'Oyun & Film', type: 'voice', categoryKey: 'voice' },
    ],
    rules: [],
  },
  {
    id: 'work',
    name: 'Ekip & Proje Ofisi',
    description: 'Yönetici duyuruları, karar forumu, proje notları ve toplantı odaları.',
    icon: '🚀',
    category: 'tech',
    categories: [
      { key: 'org', name: 'Koordinasyon', position: 0 },
      { key: 'meet', name: 'Toplantı Odaları', position: 1 },
    ],
    channels: [
      { name: 'duyurular', type: 'announcement', categoryKey: 'org', topic: 'Sprint ve ekip kararları' },
      { name: 'karar-forumu', type: 'forum', categoryKey: 'org', topic: 'Teknik RFC ve tasarım konuları' },
      { name: 'proje-notlari', type: 'text', categoryKey: 'org' },
      { name: 'Toplantı Odası', type: 'voice', categoryKey: 'meet' },
      { name: 'Odaklanma', type: 'voice', categoryKey: 'meet' },
    ],
    rules: ['Önemli kararları #karar-forumu altında kayıt altına alın.'],
  },
  {
    id: 'study',
    name: 'Ders & Çalışma Kulübü',
    description: 'Kaynak forumu, pomodorolar ve sessiz çalışma odaları.',
    icon: '📚',
    category: 'education',
    categories: [
      { key: 'desk', name: 'Kaynaklar', position: 0 },
      { key: 'rooms', name: 'Çalışma Odaları', position: 1 },
    ],
    channels: [
      { name: 'program-duyuru', type: 'announcement', categoryKey: 'desk' },
      { name: 'kaynak-forumu', type: 'forum', categoryKey: 'desk', topic: 'Ders notu ve soru paylaşımları' },
      { name: 'mola-sohbet', type: 'text', categoryKey: 'desk' },
      { name: 'Sessiz Çalışma', type: 'voice', categoryKey: 'rooms' },
      { name: 'Soru Çözüm', type: 'voice', categoryKey: 'rooms' },
    ],
    rules: [],
  },
];

export function formatIncomingWebhookPayload(
  rawBody: unknown,
  headers: Record<string, string | string[] | undefined>
): { content: string; username?: string; avatar?: string } | null {
  if (!rawBody || typeof rawBody !== 'object') return null;
  const body = rawBody as Record<string, any>;
  const eventHeaderRaw = headers['x-forgejo-event'] || headers['x-gitea-event'] || headers['x-github-event'];
  const eventHeader = (Array.isArray(eventHeaderRaw) ? eventHeaderRaw[0] : eventHeaderRaw || '').toLowerCase();

  // Forgejo / Gitea / GitHub Push event
  if (
    eventHeader === 'push' ||
    (Array.isArray(body.commits) && body.repository?.full_name)
  ) {
    const repo = String(body.repository?.full_name || body.repository?.name || 'repo');
    const branch = String(body.ref || '').replace(/^refs\/heads\//, '') || 'main';
    const pusher = String(body.pusher?.username || body.pusher?.login || body.sender?.login || 'git');
    const commits = Array.isArray(body.commits) ? body.commits : [];
    const lines = commits.slice(0, 5).map((c: any) => {
      const sha = String(c?.id || '').slice(0, 7);
      const msg = String(c?.message || '').split('\n')[0].trim().slice(0, 120);
      return `• \`${sha || 'commit'}\` ${msg}`;
    });
    const extra = commits.length > 5 ? `\n_...ve ${commits.length - 5} commit daha_` : '';
    const headerLine = `📦 **[${repo}:${branch}]** \`${pusher}\` tarafından **${commits.length}** yeni commit pushlandı:`;
    return {
      content: `${headerLine}\n${lines.join('\n')}${extra}`.trim(),
      username: typeof body.sender?.login === 'string' ? body.sender.login : 'Git Webhook',
      avatar: '🛠️',
    };
  }

  // Pull Request event
  if (eventHeader === 'pull_request' && body.pull_request) {
    const repo = String(body.repository?.full_name || 'repo');
    const action = String(body.action || 'updated');
    const pr = body.pull_request;
    const title = String(pr.title || 'Pull Request').slice(0, 140);
    const num = pr.number ? `#${pr.number}` : '';
    const url = typeof pr.html_url === 'string' ? ` (${pr.html_url})` : '';
    return {
      content: `🔀 **[${repo}]** PR ${num} *${action}*: **${title}**${url}`,
      username: 'Git Webhook',
      avatar: '🔀',
    };
  }

  // Issue event
  if (eventHeader === 'issues' && body.issue) {
    const repo = String(body.repository?.full_name || 'repo');
    const action = String(body.action || 'updated');
    const issue = body.issue;
    const title = String(issue.title || 'Issue').slice(0, 140);
    const num = issue.number ? `#${issue.number}` : '';
    const url = typeof issue.html_url === 'string' ? ` (${issue.html_url})` : '';
    return {
      content: `📌 **[${repo}]** Issue ${num} *${action}*: **${title}**${url}`,
      username: 'Git Webhook',
      avatar: '📌',
    };
  }

  // Generic / Discord-compatible payload
  const parts: string[] = [];
  if (typeof body.content === 'string' && body.content.trim()) {
    parts.push(body.content.trim());
  }
  if (Array.isArray(body.embeds)) {
    for (const emb of body.embeds.slice(0, 3)) {
      if (!emb || typeof emb !== 'object') continue;
      const embLines: string[] = [];
      if (typeof emb.title === 'string' && emb.title.trim()) embLines.push(`**${emb.title.trim()}**`);
      if (typeof emb.description === 'string' && emb.description.trim()) embLines.push(emb.description.trim());
      if (Array.isArray(emb.fields)) {
        for (const f of emb.fields.slice(0, 6)) {
          if (f?.name && f?.value) embLines.push(`• **${String(f.name)}:** ${String(f.value)}`);
        }
      }
      if (embLines.length > 0) parts.push(embLines.join('\n'));
    }
  }
  if (parts.length === 0) return null;

  return {
    content: parts.join('\n\n'),
    username: typeof body.username === 'string' && body.username.trim() ? body.username.trim() : undefined,
    avatar:
      typeof body.avatar === 'string' && body.avatar.trim()
        ? body.avatar.trim()
        : typeof body.avatar_url === 'string' && body.avatar_url.trim()
        ? body.avatar_url.trim()
        : undefined,
  };
}

export interface WebhooksAndTemplatesDeps {
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  servers: Server[];
  messages: Record<string, Message[]>;
  webhooks: ServerWebhook[];
  activeUsers: Map<string, User>;
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  saveServers: (servers: Server[]) => void;
  saveWebhooks: (webhooks: ServerWebhook[]) => void;
  saveChannelMessageUpsert: (channelId: string, channelMessages: Message[], msg: Message) => void;
  emitToChannelAudience: (channelId: string, serverId: string | undefined, event: string, payload: unknown) => void;
  emitToUserSockets: (username: string, event: string, payload: unknown) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  onMessageCreated?: () => void;
}

export function registerWebhooksAndTemplatesRoutes(app: Express, deps: WebhooksAndTemplatesDeps): void {
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: deps.getAccount,
  });

  const webhookRateMap = new Map<string, { windowStart: number; count: number }>();

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

  const canManageServerWebhooks = (req: AuthenticatedRequest, srv: Server): boolean => {
    const u = toUserForPerm(req);
    return (
      u.role === 'admin' ||
      isServerOwner(u, srv) ||
      deps.checkServerPermission(u, srv, 'manage_server') ||
      deps.checkServerPermission(u, srv, 'manage_channels')
    );
  };

  // Public template catalog
  app.get('/api/server-templates', (_req, res) => {
    res.json({ ok: true, templates: SERVER_TEMPLATES });
  });

  // Create new server from JSON template / exported backup
  app.post('/api/servers/import-template', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const raw = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;

    const rawName = deps.sanitizeText(String(raw.name || '')).trim().slice(0, 64);
    if (!rawName) {
      return res.status(400).json({ ok: false, error: 'Geçerli bir sunucu adı gerekli.' });
    }

    const newServerId = `server-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const validCategories: ChannelCategory[] = [];
    const catIdMap = new Map<string, string>();
    if (Array.isArray(raw.categories)) {
      raw.categories.slice(0, 20).forEach((cat: any, idx: number) => {
        if (!cat || typeof cat !== 'object') return;
        const cName = deps.sanitizeText(String(cat.name || '')).trim().slice(0, 48);
        if (!cName) return;
        const origKey = String(cat.id || cat.key || `cat-${idx}`);
        const newCatId = `cat-${Date.now()}-${idx}`;
        catIdMap.set(origKey, newCatId);
        validCategories.push({
          id: newCatId,
          name: cName,
          position: typeof cat.position === 'number' ? cat.position : idx,
          collapsedByDefault: Boolean(cat.collapsedByDefault),
        });
      });
    }

    const channels: Channel[] = [];
    if (Array.isArray(raw.channels) && raw.channels.length > 0) {
      raw.channels.slice(0, 50).forEach((ch: any, idx: number) => {
        if (!ch || typeof ch !== 'object') return;
        const chName = deps.sanitizeText(String(ch.name || '')).trim().slice(0, 40);
        if (!chName) return;
        const chType: Channel['type'] =
          ch.type === 'voice' || ch.type === 'announcement' || ch.type === 'forum' ? ch.type : 'text';
        const mappedCat =
          (ch.categoryId && catIdMap.get(String(ch.categoryId))) ||
          (ch.categoryKey && catIdMap.get(String(ch.categoryKey))) ||
          null;
        channels.push({
          id: `ch-${chType}-${Date.now()}-${idx}`,
          name: chType === 'voice' ? chName : chName.toLowerCase().replace(/\s+/g, '-'),
          type: chType,
          serverId: newServerId,
          categoryId: mappedCat,
          position: typeof ch.position === 'number' ? ch.position : idx,
          topic: typeof ch.topic === 'string' ? deps.sanitizeText(ch.topic).trim().slice(0, 120) : undefined,
          bitrateKbps: chType === 'voice' ? Math.min(320, Math.max(32, Number(ch.bitrateKbps) || 128)) : undefined,
          userLimit: chType === 'voice' ? Math.min(99, Math.max(0, Number(ch.userLimit) || 0)) : undefined,
          isTempCreatorChannel: chType === 'voice' ? Boolean(ch.isTempCreatorChannel) : undefined,
        });
      });
    }

    if (channels.length === 0) {
      channels.push({ id: `ch-text-${Date.now()}`, name: 'genel', type: 'text', serverId: newServerId, position: 0 });
    }

    const roles: ServerRole[] =
      Array.isArray(raw.roles) && raw.roles.length > 0
        ? raw.roles.slice(0, 20).map((r: any, idx: number) => ({
            id: idx === 0 && r.isDefault ? 'role-everyone' : `role-${Date.now()}-${idx}`,
            name: deps.sanitizeText(String(r.name || 'Rol')).trim().slice(0, 36) || 'Rol',
            color: typeof r.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : '#3b82f6',
            position: typeof r.position === 'number' ? r.position : idx + 1,
            permissions: Array.isArray(r.permissions) ? r.permissions : ['send_messages', 'connect_voice', 'speak_voice'],
            isDefault: Boolean(r.isDefault),
          }))
        : getDefaultRoles();

    const ownerUser = toUserForPerm(authReq);
    const persistentOwnerId = getPersistentUserId(ownerUser);
    const rules = Array.isArray(raw.rules)
      ? raw.rules.slice(0, 15).map((r: unknown) => deps.sanitizeText(String(r || '')).trim().slice(0, 200)).filter(Boolean)
      : undefined;

    const validServerCategories: ServerCategory[] = ['gaming', 'community', 'tech', 'music', 'education', 'other'];
    const srvCat: ServerCategory = validServerCategories.includes(raw.category) ? raw.category : 'community';

    const newServer: Server = {
      id: newServerId,
      name: rawName,
      icon: typeof raw.icon === 'string' && raw.icon.trim() && raw.icon.trim().length <= 16 ? raw.icon.trim() : '⚡',
      description: typeof raw.description === 'string' ? deps.sanitizeText(raw.description).trim().slice(0, 400) : '',
      isPublic: typeof raw.isPublic === 'boolean' ? raw.isPublic : false,
      category: srvCat,
      tags: Array.isArray(raw.tags)
        ? raw.tags.slice(0, 6).map((t: unknown) => deps.sanitizeText(String(t || '')).trim().slice(0, 24)).filter(Boolean)
        : [],
      ownerId: persistentOwnerId,
      categories: validCategories,
      channels,
      roles,
      members: [
        {
          userId: persistentOwnerId,
          username: acc.username,
          avatar: acc.avatar,
          roleIds: ['role-owner', 'role-admin'],
          joinedAt: new Date().toLocaleDateString('tr-TR'),
          isOwner: true,
        },
      ],
      rules,
      bitrateKbps: Math.min(384, Math.max(64, Number(raw.bitrateKbps) || 128)),
      autoModEnabled: typeof raw.autoModEnabled === 'boolean' ? raw.autoModEnabled : true,
    };

    deps.servers.push(newServer);
    deps.saveServers(deps.servers);
    deps.addAuditLog('SABLONDAN_SUNUCU', `${acc.username} şablondan sunucu oluşturdu: ${newServer.name}`);
    deps.emitToUserSockets(acc.username, 'server_created', newServer);
    return res.json({ ok: true, server: newServer });
  });

  // List server webhooks
  app.get('/api/servers/:serverId/webhooks', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServerWebhooks(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Webhookları görüntülemek için sunucu/kanal yönetme yetkisi gerekli.' });
    }
    const list = deps.webhooks.filter((w) => w.serverId === srv.id);
    return res.json({ ok: true, webhooks: list });
  });

  // Create server webhook
  app.post('/api/servers/:serverId/webhooks', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServerWebhooks(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Webhook oluşturmak için sunucu/kanal yönetme yetkisi gerekli.' });
    }
    const existingForServer = deps.webhooks.filter((w) => w.serverId === srv.id);
    if (existingForServer.length >= 15) {
      return res.status(400).json({ ok: false, error: 'Sunucu başına en fazla 15 webhook oluşturulabilir.' });
    }

    const { channelId, name, avatar } = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      channelId?: unknown;
      name?: unknown;
      avatar?: unknown;
    };
    const ch = typeof channelId === 'string' ? srv.channels.find((c) => c.id === channelId && c.type !== 'voice') : undefined;
    if (!ch) {
      return res.status(400).json({ ok: false, error: 'Geçerli bir metin veya duyuru kanalı seçin.' });
    }
    const cleanName = deps.sanitizeText(String(name || '')).trim().slice(0, 48);
    if (!cleanName) {
      return res.status(400).json({ ok: false, error: 'Webhook adı gerekli.' });
    }
    const cleanAvatar =
      typeof avatar === 'string' && avatar.trim() && avatar.trim().length <= 16 ? avatar.trim() : '🪝';

    const webhook: ServerWebhook = {
      id: `wh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      serverId: srv.id,
      channelId: ch.id,
      name: cleanName,
      avatar: cleanAvatar,
      token: crypto.randomBytes(24).toString('hex'),
      createdBy: authReq.authUser!.username,
      createdAt: new Date().toISOString(),
    };
    deps.webhooks.push(webhook);
    deps.saveWebhooks(deps.webhooks);
    deps.addAuditLog('WEBHOOK_OLUSTURULDU', `${srv.name} / #${ch.name} için "${cleanName}" webhook'u oluşturuldu.`);
    return res.json({ ok: true, webhook });
  });

  // Delete server webhook
  app.delete('/api/servers/:serverId/webhooks/:webhookId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    if (!canManageServerWebhooks(authReq, srv)) {
      return res.status(403).json({ ok: false, error: 'Webhook silmek için yetkiniz yok.' });
    }
    const idx = deps.webhooks.findIndex((w) => w.id === req.params.webhookId && w.serverId === srv.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Webhook bulunamadı.' });

    const [removed] = deps.webhooks.splice(idx, 1);
    deps.saveWebhooks(deps.webhooks);
    deps.addAuditLog('WEBHOOK_SILINDI', `${srv.name} webhook silindi: ${removed.name}`);
    return res.json({ ok: true });
  });

  // Incoming webhook execution endpoint (supports Discord-compatible JSON + Forgejo/GitHub push events)
  app.post('/api/webhooks/:webhookId/:token', (req, res) => {
    const wh = deps.webhooks.find((w) => w.id === req.params.webhookId);
    const providedToken = String(req.params.token || '');
    if (!wh || !providedToken) {
      return res.status(401).json({ ok: false, error: 'Geçersiz webhook kimliği veya belirteci.' });
    }

    const expectedDigest = crypto.createHash('sha256').update(wh.token).digest();
    const providedDigest = crypto.createHash('sha256').update(providedToken).digest();
    if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
      return res.status(401).json({ ok: false, error: 'Geçersiz webhook belirteci.' });
    }

    // Per-webhook rate limit (30 req / 60s)
    const now = Date.now();
    const rl = webhookRateMap.get(wh.id) || { windowStart: now, count: 0 };
    if (now - rl.windowStart > 60_000) {
      rl.windowStart = now;
      rl.count = 0;
    }
    if (rl.count >= 30) {
      return res.status(429).json({ ok: false, error: 'Webhook hız sınırına ulaştı (30/dk).' });
    }
    rl.count += 1;
    webhookRateMap.set(wh.id, rl);

    const srv = deps.servers.find((s) => s.id === wh.serverId);
    const ch = srv?.channels.find((c) => c.id === wh.channelId);
    if (!srv || !ch) {
      return res.status(404).json({ ok: false, error: 'Hedef sunucu veya kanal artık mevcut değil.' });
    }

    const formatted = formatIncomingWebhookPayload(req.body, req.headers);
    if (!formatted) {
      return res.status(400).json({ ok: false, error: 'Geçerli webhook içeriği bulunamadı (content, embeds veya push payload gerekli).' });
    }

    const cleanContent = deps.sanitizeText(formatted.content).slice(0, 4000);
    if (!cleanContent) {
      return res.status(400).json({ ok: false, error: 'Boş mesaj içeriği.' });
    }

    const msg: Message = {
      id: `msg-wh-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      serverId: srv.id,
      channelId: ch.id,
      author: {
        id: `webhook-${wh.id}`,
        username: deps.sanitizeText(formatted.username || wh.name).slice(0, 48) || wh.name,
        avatar: formatted.avatar || wh.avatar || '🪝',
      },
      content: cleanContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
      isPinned: false,
    };

    if (!deps.messages[ch.id]) deps.messages[ch.id] = [];
    deps.messages[ch.id].push(msg);
    deps.saveChannelMessageUpsert(ch.id, deps.messages[ch.id], msg);
    deps.emitToChannelAudience(ch.id, srv.id, 'new_message', msg);
    deps.onMessageCreated?.();

    wh.lastUsedAt = new Date().toISOString();
    deps.saveWebhooks(deps.webhooks);

    return res.json({ ok: true, messageId: msg.id });
  });
}
