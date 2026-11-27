import crypto from 'crypto';
import type { Express, Request } from 'express';
import type {
  Channel,
  Message,
  RegisteredAccount,
  Server,
  ServerApplicationForm,
  ServerApplicationSubmission,
  ServerPermission,
  SupportTicket,
  TicketsAndFormsStore,
  User,
} from '../types.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { isUserMemberOfServer } from '../utils/serverDiscovery.js';
import { isServerOwner } from '../utils/serverIdentity.js';

export interface TicketsAndFormsDeps {
  store: TicketsAndFormsStore;
  servers: Server[];
  messages: Record<string, Message[]>;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  sanitizeText: (input: string) => string;
  saveStore: (store: TicketsAndFormsStore) => void;
  saveServers: (servers: Server[]) => void;
  saveChannelMessageUpsert: (channelId: string, list: Message[], msg: Message) => void;
  emitServerUpdatedToMembers: (srv: Server) => void;
  emitToUserSockets: (username: string, event: string, payload: unknown) => void;
  recordServerAudit?: (
    serverId: string,
    actorUsername: string,
    action: string,
    details: string,
    targetLabel?: string
  ) => void;
}

const ADMIN_DANGEROUS_PERMS: ReadonlySet<ServerPermission> = new Set([
  'manage_server',
  'manage_roles',
  'manage_channels',
  'kick_members',
  'ban_members',
]);

export function buildTicketTranscriptMarkdown(ticket: SupportTicket, msgs: Message[]): string {
  const lines = [
    `# Destek Talebi #${ticket.number} — ${ticket.subject}`,
    `- **Kategori:** ${ticket.category}`,
    `- **Oluşturan:** ${ticket.creatorUsername}`,
    `- **Durum:** ${ticket.status === 'closed' ? 'Kapalı' : 'Açık'}`,
    `- **Açılış:** ${ticket.createdAt}`,
    ...(ticket.closedAt ? [`- **Kapanış:** ${ticket.closedAt} (${ticket.closedBy || 'Sistem'})`] : []),
    '',
    '---',
    '',
  ];
  for (const m of msgs || []) {
    lines.push(`- **[${m.timestamp}] ${m.author?.username || 'Kullanıcı'}:** ${m.content || '(Ek/Medya)'}`);
  }
  return lines.join('\n');
}

export function registerTicketsAndFormsRoutes(app: Express, deps: TicketsAndFormsDeps): void {
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

  const isStaff = (user: User, srv: Server): boolean =>
    user.role === 'admin' ||
    isServerOwner(user, srv) ||
    deps.checkServerPermission(user, srv, 'manage_server') ||
    deps.checkServerPermission(user, srv, 'kick_members');

  app.get('/api/servers/:serverId/tickets', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!isUserMemberOfServer(u, srv)) return res.status(403).json({ ok: false, error: 'Sunucu üyesi değilsiniz.' });

    const staff = isStaff(u, srv);
    const list = (deps.store.tickets || []).filter(
      (t) =>
        t.serverId === srv.id &&
        (staff || t.creatorUsername.toLowerCase() === u.username.toLowerCase())
    );
    return res.json({ ok: true, staff, tickets: list });
  });

  app.post('/api/servers/:serverId/tickets', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!isUserMemberOfServer(u, srv)) return res.status(403).json({ ok: false, error: 'Sunucu üyesi değilsiniz.' });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const subject = deps.sanitizeText(String(body.subject || '')).trim().slice(0, 120);
    const category = deps.sanitizeText(String(body.category || 'Genel Destek')).trim().slice(0, 48) || 'Genel Destek';
    const description = deps.sanitizeText(String(body.description || '')).trim().slice(0, 600);
    if (!subject) {
      return res.status(400).json({ ok: false, error: 'Konu başlığı zorunludur.' });
    }

    const openOwnCount = (deps.store.tickets || []).filter(
      (t) =>
        t.serverId === srv.id &&
        t.status === 'open' &&
        t.creatorUsername.toLowerCase() === u.username.toLowerCase()
    ).length;
    if (openOwnCount >= 3 && !isStaff(u, srv)) {
      return res.status(429).json({ ok: false, error: 'Aynı anda en fazla 3 açık destek talebi açabilirsiniz.' });
    }

    const serverTickets = (deps.store.tickets || []).filter((t) => t.serverId === srv.id);
    const nextNum = serverTickets.reduce((max, t) => Math.max(max, t.number || 0), 0) + 1;

    const staffRoleIds = (srv.roles || [])
      .filter((r) => !r.isDefault && (r.permissions || []).some((p) => p === 'manage_server' || p === 'kick_members'))
      .map((r) => r.id);

    const chId = `ch-ticket-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const ticketChannel: Channel = {
      id: chId,
      name: `ticket-${String(nextNum).padStart(4, '0')}`,
      type: 'text',
      serverId: srv.id,
      isPrivate: true,
      allowedRoleIds: staffRoleIds,
      createdByUserId: u.username,
      topic: `${category} · Açan: ${u.username}`,
      permissionOverrides: staffRoleIds.map((rid) => ({
        targetType: 'role' as const,
        targetId: rid,
        allow: ['view_channel', 'send_messages'],
        deny: [],
      })),
    };
    srv.channels.push(ticketChannel);

    const ticket: SupportTicket = {
      id: `tkt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      number: nextNum,
      serverId: srv.id,
      channelId: chId,
      creatorUsername: u.username,
      category,
      subject,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    if (!deps.store.tickets) deps.store.tickets = [];
    deps.store.tickets.unshift(ticket);

    const openingMsg: Message = {
      id: `msg-tkt-${Date.now()}`,
      serverId: srv.id,
      channelId: chId,
      author: { id: 'system-ticket', username: 'Destek Botu 🎫', avatar: '🎫' },
      content: `🎫 **Destek Talebi #${nextNum}** (${category})\n**Konu:** ${subject}\n**Açan:** @${u.username}${description ? `\n\n${description}` : ''}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
      isPinned: true,
    };
    if (!deps.messages[chId]) deps.messages[chId] = [];
    deps.messages[chId].push(openingMsg);
    deps.saveChannelMessageUpsert(chId, deps.messages[chId], openingMsg);

    deps.saveServers(deps.servers);
    deps.saveStore(deps.store);
    deps.emitServerUpdatedToMembers(srv);
    deps.recordServerAudit?.(srv.id, u.username, 'TICKET_ACILDI', `Destek Talebi #${nextNum} açıldı: ${subject}`, `#${ticketChannel.name}`);

    return res.json({ ok: true, ticket });
  });

  app.patch('/api/servers/:serverId/tickets/:ticketId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!isStaff(u, srv)) return res.status(403).json({ ok: false, error: 'Yalnızca yetkililer atama yapabilir.' });

    const ticket = (deps.store.tickets || []).find((t) => t.id === req.params.ticketId && t.serverId === srv.id);
    if (!ticket) return res.status(404).json({ ok: false, error: 'Destek talebi bulunamadı.' });
    const assignedTo = deps.sanitizeText(String((req.body as any)?.assignedTo || u.username)).trim().slice(0, 48);
    ticket.assignedTo = assignedTo || undefined;
    deps.saveStore(deps.store);
    return res.json({ ok: true, ticket });
  });

  app.post('/api/servers/:serverId/tickets/:ticketId/close', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    const ticket = (deps.store.tickets || []).find((t) => t.id === req.params.ticketId && t.serverId === srv.id);
    if (!ticket) return res.status(404).json({ ok: false, error: 'Destek talebi bulunamadı.' });

    const allowed = isStaff(u, srv) || ticket.creatorUsername.toLowerCase() === u.username.toLowerCase();
    if (!allowed) return res.status(403).json({ ok: false, error: 'Bu talebi kapatma yetkiniz yok.' });
    if (ticket.status === 'closed') return res.json({ ok: true, ticket });

    ticket.status = 'closed';
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = u.username;
    ticket.transcriptMarkdown = buildTicketTranscriptMarkdown(ticket, deps.messages[ticket.channelId] || []);

    srv.channels = srv.channels.filter((c) => c.id !== ticket.channelId);
    deps.saveServers(deps.servers);
    deps.saveStore(deps.store);
    deps.emitServerUpdatedToMembers(srv);
    deps.recordServerAudit?.(srv.id, u.username, 'TICKET_KAPATILDI', `Destek Talebi #${ticket.number} kapatıldı ve transkript arşivlendi.`);

    return res.json({ ok: true, ticket });
  });

  app.get('/api/servers/:serverId/tickets/:ticketId/transcript', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    const ticket = (deps.store.tickets || []).find((t) => t.id === req.params.ticketId && t.serverId === srv.id);
    if (!ticket) return res.status(404).json({ ok: false, error: 'Destek talebi bulunamadı.' });

    const allowed = isStaff(u, srv) || ticket.creatorUsername.toLowerCase() === u.username.toLowerCase();
    if (!allowed) return res.status(403).json({ ok: false, error: 'Transkripti görüntüleme yetkiniz yok.' });

    const md = ticket.transcriptMarkdown || buildTicketTranscriptMarkdown(ticket, deps.messages[ticket.channelId] || []);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticket.number}.md"`);
    return res.send(md);
  });

  app.get('/api/servers/:serverId/forms', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!isUserMemberOfServer(u, srv)) return res.status(403).json({ ok: false, error: 'Sunucu üyesi değilsiniz.' });

    const forms = (deps.store.forms || []).filter((f) => f.serverId === srv.id);
    const staff = isStaff(u, srv);
    const submissions = (deps.store.submissions || []).filter(
      (s) => s.serverId === srv.id && (staff || s.applicantUsername.toLowerCase() === u.username.toLowerCase())
    );
    return res.json({ ok: true, staff, forms, submissions });
  });

  app.post('/api/servers/:serverId/forms', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ ok: false, error: 'Form oluşturmak için Sunucu Yönetimi yetkisi gerekir.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const title = deps.sanitizeText(String(body.title || '')).trim().slice(0, 80);
    const description = deps.sanitizeText(String(body.description || '')).trim().slice(0, 240);
    const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
    const questions = rawQuestions
      .map((q) => deps.sanitizeText(String(q || '')).trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 8);
    if (!title || questions.length === 0) {
      return res.status(400).json({ ok: false, error: 'Başlık ve en az 1 soru gereklidir.' });
    }

    let approveRoleId: string | null = null;
    if (typeof body.approveRoleId === 'string' && body.approveRoleId.trim()) {
      const role = (srv.roles || []).find((r) => r.id === body.approveRoleId);
      if (role && !role.isDefault && !(role.permissions || []).some((p) => ADMIN_DANGEROUS_PERMS.has(p))) {
        approveRoleId = role.id;
      }
    }

    const form: ServerApplicationForm = {
      id: `frm-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId: srv.id,
      title,
      ...(description ? { description } : {}),
      questions,
      approveRoleId,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    if (!deps.store.forms) deps.store.forms = [];
    deps.store.forms.unshift(form);
    deps.saveStore(deps.store);
    return res.json({ ok: true, form });
  });

  app.delete('/api/servers/:serverId/forms/:formId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ ok: false, error: 'Yetkiniz yok.' });
    }
    deps.store.forms = (deps.store.forms || []).filter(
      (f) => !(f.id === req.params.formId && f.serverId === srv.id)
    );
    deps.saveStore(deps.store);
    return res.json({ ok: true });
  });

  app.post('/api/servers/:serverId/forms/:formId/submit', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!isUserMemberOfServer(u, srv)) return res.status(403).json({ ok: false, error: 'Sunucu üyesi değilsiniz.' });

    const form = (deps.store.forms || []).find((f) => f.id === req.params.formId && f.serverId === srv.id);
    if (!form || !form.enabled) return res.status(404).json({ ok: false, error: 'Form bulunamadı.' });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
    const answers = form.questions.map((_q, i) =>
      deps.sanitizeText(String(rawAnswers[i] ?? '')).trim().slice(0, 500)
    );
    if (answers.every((a) => !a)) {
      return res.status(400).json({ ok: false, error: 'Lütfen form sorularını yanıtlayın.' });
    }

    const sub: ServerApplicationSubmission = {
      id: `sub-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      formId: form.id,
      serverId: srv.id,
      applicantUsername: u.username,
      answers,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    if (!deps.store.submissions) deps.store.submissions = [];
    deps.store.submissions.unshift(sub);
    deps.saveStore(deps.store);
    deps.recordServerAudit?.(srv.id, u.username, 'BASVURU_GONDERILDI', `"${form.title}" formu için başvuru gönderildi.`);
    return res.json({ ok: true, submission: sub });
  });

  app.post('/api/servers/:serverId/forms/submissions/:subId/review', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!isStaff(u, srv)) return res.status(403).json({ ok: false, error: 'Yalnızca yetkililer değerlendirebilir.' });

    const sub = (deps.store.submissions || []).find((s) => s.id === req.params.subId && s.serverId === srv.id);
    if (!sub) return res.status(404).json({ ok: false, error: 'Başvuru bulunamadı.' });

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const decision = body.decision === 'approved' ? 'approved' : 'rejected';
    sub.status = decision;
    sub.reviewedBy = u.username;
    sub.reviewedAt = new Date().toISOString();
    sub.reviewNote = deps.sanitizeText(String(body.reviewNote || '')).trim().slice(0, 240) || undefined;

    if (decision === 'approved') {
      const form = (deps.store.forms || []).find((f) => f.id === sub.formId);
      if (form?.approveRoleId) {
        const role = (srv.roles || []).find((r) => r.id === form.approveRoleId);
        const member = (srv.members || []).find(
          (m) => m.username.toLowerCase() === sub.applicantUsername.toLowerCase()
        );
        if (role && member && !role.isDefault && !(role.permissions || []).some((p) => ADMIN_DANGEROUS_PERMS.has(p))) {
          if (!member.roleIds.includes(role.id)) {
            member.roleIds.push(role.id);
            deps.saveServers(deps.servers);
            deps.emitServerUpdatedToMembers(srv);
          }
        }
      }
    }

    deps.saveStore(deps.store);
    deps.emitToUserSockets(sub.applicantUsername, 'system_toast', {
      type: decision === 'approved' ? 'success' : 'warning',
      message: `${srv.name} başvurunuz ${decision === 'approved' ? 'onaylandı' : 'reddedildi'}.`,
    });
    return res.json({ ok: true, submission: sub });
  });
}
