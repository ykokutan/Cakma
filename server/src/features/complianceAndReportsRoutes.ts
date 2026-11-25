import crypto from 'crypto';
import type { Express, Request } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import type {
  ContentReport,
  ContentReportCategory,
  ContentReportStatus,
  GroupDmRoom,
  Message,
  RegisteredAccount,
  Server,
  ServerPermission,
  User,
} from '../types.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { canUserAccessChannel, findServerByChannelId } from '../utils/channelAccess.js';

export interface ActiveSessionSnapshot {
  socketId: string;
  username: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
}

export interface ComplianceAndReportsDeps {
  io?: Pick<SocketIOServer, 'to' | 'emit'>;
  registeredAccounts: Map<string, RegisteredAccount>;
  activeUsers: Map<string, User>;
  activeSessions?: Map<string, ActiveSessionSnapshot>;
  servers: Server[];
  groupDms?: GroupDmRoom[];
  messages: Record<string, Message[]>;
  contentReports: ContentReport[];
  saveContentReports: (reports: ContentReport[]) => void;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  saveChannelMessageDelete?: (channelId: string, channelList: Message[], messageId: string) => void;
  emitToChannelAudience?: (channelId: string, serverId: string | undefined, event: string, payload: unknown) => void;
  emitUserUpdated?: (user: User) => void;
  addAuditLog?: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  legalVersion?: string;
}

const VALID_CATEGORIES = new Set<ContentReportCategory>([
  'harassment',
  'spam',
  'illegal',
  'malware',
  'other',
]);

const MODERATE_PERMS: ServerPermission[] = [
  'manage_server',
  'ban_members',
  'kick_members',
  'manage_channels',
];

function checkWindowRateLimit(
  bucket: Map<string, number[]>,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const prev = (bucket.get(key) || []).filter((ts) => now - ts < windowMs);
  if (prev.length >= maxRequests) {
    bucket.set(key, prev);
    return false;
  }
  prev.push(now);
  bucket.set(key, prev);
  return true;
}

export function registerComplianceAndReportsRoutes(
  app: Express,
  deps: ComplianceAndReportsDeps
): void {
  const { requireAuth, requireAdmin } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: deps.getAccount,
  });

  const reportRateLimits = new Map<string, number[]>();
  const exportRateLimits = new Map<string, number[]>();

  const toActorUser = (authReq: AuthenticatedRequest): User => {
    const acc = authReq.authUser!.account;
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

  const canModerateServer = (user: User, srv: Server): boolean =>
    MODERATE_PERMS.some((perm) => deps.checkServerPermission(user, srv, perm));

  // 1. Submit a content / user report (5651 & community moderation)
  app.post('/api/reports', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const actor = toActorUser(authReq);
    const reporterLower = actor.username.toLowerCase();

    if (!checkWindowRateLimit(reportRateLimits, reporterLower, 5, 60_000)) {
      return res.status(429).json({
        ok: false,
        error: 'Çok sık şikayet bildirimi gönderdiniz. Lütfen bir dakika sonra tekrar deneyin.',
      });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawTarget = typeof body.targetUsername === 'string' ? body.targetUsername.trim() : '';
    const rawCategory = typeof body.category === 'string' ? body.category.trim() : 'other';
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const serverId = typeof body.serverId === 'string' && body.serverId.trim() ? body.serverId.trim().slice(0, 80) : undefined;
    const channelId = typeof body.channelId === 'string' && body.channelId.trim() ? body.channelId.trim().slice(0, 120) : undefined;
    const messageId = typeof body.messageId === 'string' && body.messageId.trim() ? body.messageId.trim().slice(0, 120) : undefined;

    if (!rawTarget) {
      return res.status(400).json({ ok: false, error: 'Şikayet edilecek kullanıcı adı belirtilmelidir.' });
    }
    if (rawTarget.toLowerCase() === reporterLower) {
      return res.status(400).json({ ok: false, error: 'Kendi hesabınızı veya kendi mesajınızı şikayet edemezsiniz.' });
    }
    if (rawReason.length < 3) {
      return res.status(400).json({ ok: false, error: 'Lütfen en az 3 karakterlik bir şikayet gerekçesi yazın.' });
    }

    const category: ContentReportCategory = VALID_CATEGORIES.has(rawCategory as ContentReportCategory)
      ? (rawCategory as ContentReportCategory)
      : 'other';
    const cleanReason = deps.sanitizeText(rawReason).slice(0, 600);
    const cleanTarget = deps.sanitizeText(rawTarget).slice(0, 48);

    let resolvedServerId = serverId;
    let messageExcerpt: string | undefined;

    if (channelId && messageId) {
      const channelMsgs = deps.messages[channelId];
      const hasAccess = canUserAccessChannel(
        actor,
        channelId,
        deps.servers,
        resolvedServerId,
        channelMsgs,
        deps.groupDms
      );
      if (hasAccess && Array.isArray(channelMsgs)) {
        const msg = channelMsgs.find((m) => m.id === messageId);
        if (msg) {
          if (!resolvedServerId && msg.serverId && msg.serverId !== 'direct-messages') {
            resolvedServerId = msg.serverId;
          }
          const rawContent = String(msg.content || '').trim();
          if (rawContent.startsWith('E2EE:') || rawContent.startsWith('GE2EE:')) {
            messageExcerpt = '[Uçtan Uca Şifreli Mesaj]';
          } else if (rawContent) {
            messageExcerpt = deps.sanitizeText(rawContent).slice(0, 280);
          } else if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
            messageExcerpt = `[Ek: ${deps.sanitizeText(msg.attachments[0].name || 'dosya').slice(0, 60)}]`;
          }
        }
      }
    }

    if (!resolvedServerId && channelId && !channelId.startsWith('dm-') && !channelId.startsWith('gdm-')) {
      const owning = findServerByChannelId(deps.servers, channelId);
      if (owning) resolvedServerId = owning.id;
    }

    const report: ContentReport = {
      id: `rep-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      reporterUsername: actor.username,
      targetUsername: cleanTarget,
      ...(resolvedServerId && resolvedServerId !== 'direct-messages' ? { serverId: resolvedServerId } : {}),
      ...(channelId ? { channelId } : {}),
      ...(messageId ? { messageId } : {}),
      ...(messageExcerpt ? { messageExcerpt } : {}),
      category,
      reason: cleanReason,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    deps.contentReports.unshift(report);
    if (deps.contentReports.length > 1000) {
      deps.contentReports.splice(1000);
    }
    deps.saveContentReports(deps.contentReports);

    deps.addAuditLog?.(
      'ICERIK_SIKAYETI',
      `${actor.username}, ${cleanTarget} hakkında "${category}" kategorisinde bildirim oluşturdu (${report.id}).`,
      'warn'
    );
    deps.io?.to('admins').emit('content_report_created', report);

    return res.json({ ok: true, report });
  });

  // 2. Global Admin: List all content reports
  app.get('/api/admin/reports', requireAdmin, (_req: Request, res) => {
    res.json({ ok: true, reports: deps.contentReports });
  });

  // 3. Server Moderators: List reports belonging to their server
  app.get('/api/servers/:serverId/reports', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) {
      return res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
    }
    const actor = toActorUser(authReq);
    if (actor.role !== 'admin' && !canModerateServer(actor, srv)) {
      return res.status(403).json({ ok: false, error: 'Bu sunucudaki şikayetleri görüntüleme yetkiniz yok.' });
    }
    const filtered = deps.contentReports.filter((r) => r.serverId === srv.id);
    return res.json({ ok: true, reports: filtered });
  });

  // 4. Resolve or dismiss a report (and optionally delete the reported message)
  app.patch('/api/reports/:reportId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const actor = toActorUser(authReq);
    const report = deps.contentReports.find((r) => r.id === req.params.reportId);
    if (!report) {
      return res.status(404).json({ ok: false, error: 'Şikayet kaydı bulunamadı.' });
    }

    let authorized = actor.role === 'admin';
    if (!authorized && report.serverId) {
      const srv = deps.servers.find((s) => s.id === report.serverId);
      if (srv && canModerateServer(actor, srv)) {
        authorized = true;
      }
    }
    if (!authorized) {
      return res.status(403).json({ ok: false, error: 'Bu şikayet kaydını sonuçlandırma yetkiniz yok.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawStatus = typeof body.status === 'string' ? body.status.trim() : '';
    if (rawStatus !== 'resolved' && rawStatus !== 'dismissed') {
      return res.status(400).json({ ok: false, error: 'Geçersiz durum değeri ("resolved" veya "dismissed" olmalıdır).' });
    }

    const deleteMessage = body.deleteMessage === true;
    const resolutionNote =
      typeof body.resolutionNote === 'string' && body.resolutionNote.trim()
        ? deps.sanitizeText(body.resolutionNote.trim()).slice(0, 300)
        : undefined;

    let deletedMessage = false;
    if (deleteMessage && report.channelId && report.messageId) {
      const list = deps.messages[report.channelId];
      if (Array.isArray(list)) {
        const idx = list.findIndex((m) => m.id === report.messageId);
        if (idx !== -1) {
          list.splice(idx, 1);
          deps.saveChannelMessageDelete?.(report.channelId, list, report.messageId);
          deps.emitToChannelAudience?.(report.channelId, report.serverId, 'message_deleted', {
            channelId: report.channelId,
            messageId: report.messageId,
          });
          deletedMessage = true;
        }
      }
    }

    report.status = rawStatus as ContentReportStatus;
    report.resolvedBy = actor.username;
    report.resolvedAt = new Date().toISOString();
    if (resolutionNote) {
      report.resolutionNote = resolutionNote;
    } else if (deletedMessage) {
      report.resolutionNote = 'Bildirilen mesaj silindi ve kayıt kapatıldı.';
    }
    deps.saveContentReports(deps.contentReports);

    deps.addAuditLog?.(
      'SIKAYET_SONUCLANDIRILDI',
      `${actor.username}, ${report.id} numaralı şikayeti "${report.status}" olarak işaretledi${deletedMessage ? ' (mesaj silindi)' : ''}.`,
      'warn'
    );

    return res.json({ ok: true, report, deletedMessage });
  });

  // 5. KVKK Article 11 Personal Data Export (strips passwords, TOTP secrets, and private keys)
  app.get('/api/account/export', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const unameLower = acc.username.toLowerCase();

    if (!checkWindowRateLimit(exportRateLimits, unameLower, 3, 60_000)) {
      return res.status(429).json({
        ok: false,
        error: 'Kişisel veri dışa aktarma isteği dakikada en fazla 3 kez yapılabilir.',
      });
    }

    const userServers = deps.servers
      .filter((srv) => {
        if (srv.ownerId === acc.id) return true;
        return srv.members?.some(
          (m) => m.username.toLowerCase() === unameLower || m.userId === acc.id
        );
      })
      .map((srv) => {
        const member = srv.members?.find(
          (m) => m.username.toLowerCase() === unameLower || m.userId === acc.id
        );
        return {
          id: srv.id,
          name: srv.name,
          isOwner: srv.ownerId === acc.id || Boolean(member?.isOwner),
          nickname: member?.nickname || null,
          joinedAt: member?.joinedAt || null,
          roleIds: member?.roleIds || [],
        };
      });

    const userGroupDms = (deps.groupDms || [])
      .filter((room) => room.members?.some((m) => m.toLowerCase() === unameLower))
      .map((room) => ({
        id: room.id,
        name: room.name,
        members: room.members,
        createdAt: room.createdAt,
      }));

    const userActiveSessions = deps.activeSessions
      ? Array.from(deps.activeSessions.values())
          .filter((sess) => sess.username.toLowerCase() === unameLower)
          .map((sess) => ({
            ip: sess.ip,
            userAgent: sess.userAgent,
            connectedAt: sess.connectedAt,
          }))
      : [];

    const mySubmittedReports = deps.contentReports
      .filter((r) => r.reporterUsername.toLowerCase() === unameLower)
      .map((r) => ({
        id: r.id,
        targetUsername: r.targetUsername,
        category: r.category,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt || null,
      }));

    deps.addAuditLog?.(
      'KVKK_VERI_INDIRME',
      `${acc.username} kişisel veri arşivini (.json) dışa aktardı.`,
      'info'
    );

    return res.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      legalVersion: deps.legalVersion || '1.1.0',
      account: {
        id: acc.id,
        username: acc.username,
        email: acc.email,
        role: acc.role,
        avatar: acc.avatar,
        createdAt: acc.createdAt,
        acceptedTermsAt: acc.acceptedTermsAt || null,
        acceptedTermsVersion: acc.acceptedTermsVersion || null,
        statusMessage: acc.statusMessage || null,
        bio: acc.bio || null,
        socialLinks: acc.socialLinks || {},
        walletBalance: acc.walletBalance,
        friends: acc.friends || [],
        blockedUsers: acc.blockedUsers || [],
        knownLoginIps: acc.knownLoginIps || [],
        twoFactorEnabled: Boolean(acc.twoFactorEnabled),
        e2eePublicKey: acc.e2eePublicKey || null,
        readCursors: acc.readCursors || {},
        passkeys: (acc.passkeys || []).map((pk) => ({
          id: pk.id,
          label: pk.label,
          createdAt: pk.createdAt,
          lastUsedAt: pk.lastUsedAt || null,
        })),
      },
      servers: userServers,
      groupDms: userGroupDms,
      activeSessions: userActiveSessions,
      mySubmittedReports,
    });
  });

  // 6. Accept / re-consent to updated legal documents version
  app.post('/api/account/accept-terms', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawVersion = typeof body.version === 'string' ? body.version.trim() : '';
    const cleanVersion = rawVersion ? deps.sanitizeText(rawVersion).slice(0, 32) : (deps.legalVersion || '1.1.0');
    const acceptedAt = new Date().toISOString();

    acc.acceptedTermsVersion = cleanVersion;
    acc.acceptedTermsAt = acceptedAt;
    deps.saveAccounts(deps.registeredAccounts);

    for (const u of deps.activeUsers.values()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) {
        u.acceptedTermsVersion = cleanVersion;
        u.acceptedTermsAt = acceptedAt;
        deps.emitUserUpdated?.(u);
      }
    }

    deps.addAuditLog?.(
      'SOZLESME_ONAYI',
      `${acc.username} güncel yasal sözleşmeleri (v${cleanVersion}) onayladı.`,
      'info'
    );

    return res.json({
      ok: true,
      acceptedTermsVersion: cleanVersion,
      acceptedTermsAt: acceptedAt,
    });
  });
}
