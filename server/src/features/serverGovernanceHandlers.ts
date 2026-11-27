import crypto from 'crypto';
import type { Express, Request } from 'express';
import type { Socket } from 'socket.io';
import type {
  ModerationCaseAction,
  RegisteredAccount,
  Server,
  ServerAuditEntry,
  ServerModerationCase,
  ServerPermission,
  ServerSoundClip,
  ServerSticker,
  User,
} from '../types.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { sanitizePermissionOverrides } from '../utils/channelPermissions.js';
import { findServerMember, isServerOwner } from '../utils/serverIdentity.js';
import { validatePayload, type SocketEventRateLimiter } from '../utils/socketGuard.js';
import { computeServerBoostSummary } from '../utils/serverBoosts.js';

const PRIVILEGED_ROLE_PERMS: ReadonlySet<ServerPermission> = new Set([
  'manage_server',
  'manage_roles',
  'manage_channels',
  'kick_members',
  'ban_members',
]);

export interface ServerGovernanceDeps {
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  servers: Server[];
  serverAuditLogs: Record<string, ServerAuditEntry[]>;
  serverCases: Record<string, ServerModerationCase[]>;
  socketEventLimiter: SocketEventRateLimiter;
  sanitizeText: (input: string) => string;
  isSafeImageMedia: (val: string) => boolean;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  saveServers: (servers: Server[]) => void;
  saveServerAuditLogs: (data: Record<string, ServerAuditEntry[]>) => void;
  saveServerModerationCases: (data: Record<string, ServerModerationCase[]>) => void;
  emitServerUpdatedToMembers: (srv: Server) => void;
  emitServersUpdatedForAll: () => void;
  emitToUserSockets: (username: string, event: string, payload: unknown) => void;
}

export function createServerGovernanceHelpers(deps: {
  serverAuditLogs: Record<string, ServerAuditEntry[]>;
  serverCases: Record<string, ServerModerationCase[]>;
  saveServerAuditLogs: (data: Record<string, ServerAuditEntry[]>) => void;
  saveServerModerationCases: (data: Record<string, ServerModerationCase[]>) => void;
}) {
  const recordServerAudit = (
    serverId: string,
    actorUsername: string,
    action: string,
    details: string,
    targetLabel?: string
  ): ServerAuditEntry => {
    const entry: ServerAuditEntry = {
      id: `sa-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId,
      actorUsername,
      action,
      ...(targetLabel ? { targetLabel } : {}),
      details,
      timestamp: new Date().toISOString(),
    };
    if (!deps.serverAuditLogs[serverId]) deps.serverAuditLogs[serverId] = [];
    deps.serverAuditLogs[serverId].unshift(entry);
    if (deps.serverAuditLogs[serverId].length > 300) {
      deps.serverAuditLogs[serverId] = deps.serverAuditLogs[serverId].slice(0, 300);
    }
    deps.saveServerAuditLogs(deps.serverAuditLogs);
    return entry;
  };

  const recordModerationCase = (input: {
    serverId: string;
    targetUsername: string;
    moderatorUsername: string;
    action: ModerationCaseAction;
    reason: string;
    durationMinutes?: number;
  }): ServerModerationCase => {
    const modCase: ServerModerationCase = {
      id: `case-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      serverId: input.serverId,
      targetUsername: input.targetUsername,
      moderatorUsername: input.moderatorUsername,
      action: input.action,
      reason: input.reason,
      ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
      createdAt: new Date().toISOString(),
    };
    if (!deps.serverCases[input.serverId]) deps.serverCases[input.serverId] = [];
    deps.serverCases[input.serverId].unshift(modCase);
    if (deps.serverCases[input.serverId].length > 300) {
      deps.serverCases[input.serverId] = deps.serverCases[input.serverId].slice(0, 300);
    }
    deps.saveServerModerationCases(deps.serverCases);
    return modCase;
  };

  return { recordServerAudit, recordModerationCase };
}

function isSelfAssignableCandidate(server: Server, roleId: string): boolean {
  if (!roleId || roleId === 'role-owner') return false;
  const role = (server.roles || []).find((r) => r.id === roleId);
  if (!role || role.isDefault) return false;
  return !(role.permissions || []).some((p) => PRIVILEGED_ROLE_PERMS.has(p));
}

export function registerServerGovernanceRoutes(
  app: Express,
  deps: ServerGovernanceDeps,
  helpers: ReturnType<typeof createServerGovernanceHelpers>
): void {
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

  app.get('/api/servers/:serverId/audit-logs', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    if (!deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Denetim günlüğünü görüntüleme yetkiniz yok.' });
    }
    res.json({ success: true, logs: deps.serverAuditLogs[srv.id] || [] });
  });

  app.get('/api/servers/:serverId/cases', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);
    const allowed =
      deps.checkServerPermission(u, srv, 'kick_members') ||
      deps.checkServerPermission(u, srv, 'ban_members') ||
      deps.checkServerPermission(u, srv, 'manage_server');
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Moderasyon sicilini görüntüleme yetkiniz yok.' });
    }
    res.json({ success: true, cases: deps.serverCases[srv.id] || [] });
  });

  app.post('/api/servers/:serverId/cases', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const srv = deps.servers.find((s) => s.id === req.params.serverId);
    if (!srv) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
    const u = toUser(authReq);

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const action = String(body.action || '').trim() as ModerationCaseAction;
    if (!['warn', 'timeout', 'kick', 'ban', 'untimeout'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Geçersiz moderasyon işlemi.' });
    }

    const requiredPerm: ServerPermission = action === 'ban' ? 'ban_members' : 'kick_members';
    if (!deps.checkServerPermission(u, srv, requiredPerm) && !deps.checkServerPermission(u, srv, 'manage_server')) {
      return res.status(403).json({ success: false, error: 'Bu moderasyon işlemi için yetkiniz yok.' });
    }

    const targetRaw = deps.sanitizeText(String(body.targetUsername || '')).trim().slice(0, 48);
    if (!targetRaw) {
      return res.status(400).json({ success: false, error: 'Hedef kullanıcı adı zorunludur.' });
    }
    const targetAcc = deps.registeredAccounts.get(targetRaw.toLowerCase());
    const canonicalTarget = targetAcc?.username || targetRaw;
    if (
      targetAcc?.role === 'admin' ||
      isServerOwner({ id: targetAcc?.id, accountId: targetAcc?.id, username: canonicalTarget }, srv)
    ) {
      return res.status(403).json({ success: false, error: 'Yöneticilere veya sunucu sahibine işlem uygulanamaz.' });
    }

    const reason = deps.sanitizeText(String(body.reason || '')).trim().slice(0, 300) || 'Sebep belirtilmedi';
    const rawMins = Number(body.durationMinutes);
    const durationMinutes =
      action === 'timeout' ? Math.max(1, Math.min(10080, Math.floor(Number.isFinite(rawMins) ? rawMins : 10))) : undefined;

    if (action === 'timeout' && durationMinutes) {
      if (!srv.timeouts) srv.timeouts = {};
      srv.timeouts[canonicalTarget.toLowerCase()] = Date.now() + durationMinutes * 60_000;
      deps.saveServers(deps.servers);
      deps.emitServerUpdatedToMembers(srv);
    } else if (action === 'untimeout') {
      if (srv.timeouts) {
        delete srv.timeouts[canonicalTarget.toLowerCase()];
        deps.saveServers(deps.servers);
        deps.emitServerUpdatedToMembers(srv);
      }
    } else if (action === 'kick' || action === 'ban') {
      srv.members = (srv.members || []).filter((m) => m.username.toLowerCase() !== canonicalTarget.toLowerCase());
      deps.saveServers(deps.servers);
      deps.emitServerUpdatedToMembers(srv);
      deps.emitToUserSockets(canonicalTarget, 'server_removed', { serverId: srv.id });
    }

    const created = helpers.recordModerationCase({
      serverId: srv.id,
      targetUsername: canonicalTarget,
      moderatorUsername: u.username,
      action,
      reason,
      durationMinutes,
    });
    helpers.recordServerAudit(
      srv.id,
      u.username,
      `MOD_${action.toUpperCase()}`,
      `${canonicalTarget} hakkında "${action}" işlemi kaydedildi: ${reason}`,
      canonicalTarget
    );
    deps.emitToUserSockets(canonicalTarget, 'moderation_notice', {
      serverId: srv.id,
      serverName: srv.name,
      caseItem: created,
    });

    res.json({ success: true, caseItem: created });
  });
}

export function registerServerGovernanceSocketHandlers(
  socket: Socket,
  deps: ServerGovernanceDeps,
  helpers: ReturnType<typeof createServerGovernanceHelpers>
): void {
  socket.on('update_channel_permissions', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'update_channel_permissions', 20, 30_000)) return;

    const payload = rawPayload as {
      serverId?: unknown;
      channelId?: unknown;
      isPrivate?: unknown;
      permissionOverrides?: unknown;
    };
    if (typeof payload.serverId !== 'string' || typeof payload.channelId !== 'string') return;
    const srv = deps.servers.find((s) => s.id === payload.serverId);
    if (!srv) return;
    if (!deps.checkServerPermission(actor, srv, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Kanal izinlerini düzenlemek için yetkiniz yok.' });
    }
    const ch = srv.channels.find((c) => c.id === payload.channelId);
    if (!ch) return;

    if (typeof payload.isPrivate === 'boolean') {
      ch.isPrivate = payload.isPrivate;
    }
    if (payload.permissionOverrides !== undefined) {
      ch.permissionOverrides = sanitizePermissionOverrides(payload.permissionOverrides);
    }
    deps.saveServers(deps.servers);
    helpers.recordServerAudit(
      srv.id,
      actor.username,
      'KANAL_IZIN_GUNCELLENDI',
      `#${ch.name} kanalının gizlilik/izin geçersiz kılmaları güncellendi (${ch.isPrivate ? 'Gizli' : 'Açık'}).`,
      `#${ch.name}`
    );
    deps.emitServersUpdatedForAll();
  });

  socket.on('update_server_onboarding', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'update_server_onboarding', 15, 30_000)) return;

    const payload = rawPayload as {
      serverId?: unknown;
      onboarding?: {
        enabled?: unknown;
        welcomePrompt?: unknown;
        requireRulesAccept?: unknown;
        selfAssignableRoleIds?: unknown;
      };
    };
    if (typeof payload.serverId !== 'string' || !payload.onboarding || typeof payload.onboarding !== 'object') return;
    const srv = deps.servers.find((s) => s.id === payload.serverId);
    if (!srv) return;
    if (!deps.checkServerPermission(actor, srv, 'manage_server')) {
      return socket.emit('server_action_error', { message: 'Karşılama & onboarding ayarları için yetkiniz yok.' });
    }

    const rawRoles = Array.isArray(payload.onboarding.selfAssignableRoleIds)
      ? payload.onboarding.selfAssignableRoleIds
      : [];
    const safeRoleIds = Array.from(
      new Set(
        rawRoles
          .filter((id): id is string => typeof id === 'string')
          .filter((id) => isSelfAssignableCandidate(srv, id))
      )
    ).slice(0, 20);

    srv.onboarding = {
      enabled: Boolean(payload.onboarding.enabled),
      welcomePrompt:
        typeof payload.onboarding.welcomePrompt === 'string'
          ? deps.sanitizeText(payload.onboarding.welcomePrompt).trim().slice(0, 300)
          : '',
      requireRulesAccept: Boolean(payload.onboarding.requireRulesAccept),
      selfAssignableRoleIds: safeRoleIds,
    };
    deps.saveServers(deps.servers);
    helpers.recordServerAudit(
      srv.id,
      actor.username,
      'ONBOARDING_GUNCELLENDI',
      `Sunucu onboarding ${srv.onboarding.enabled ? 'etkinleştirildi' : 'kapatıldı'} (${safeRoleIds.length} seçilebilir rol).`
    );
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('accept_server_onboarding', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    const payload = rawPayload as { serverId?: unknown; selectedRoleIds?: unknown };
    if (typeof payload.serverId !== 'string') return;
    const srv = deps.servers.find((s) => s.id === payload.serverId);
    if (!srv) return;
    const member = findServerMember(srv, actor);
    if (!member) return;

    const allowedSet = new Set(
      (srv.onboarding?.selfAssignableRoleIds || []).filter((id) => isSelfAssignableCandidate(srv, id))
    );
    const chosen = Array.isArray(payload.selectedRoleIds)
      ? payload.selectedRoleIds.filter((id): id is string => typeof id === 'string' && allowedSet.has(id))
      : [];

    const preserved = (member.roleIds || []).filter((rId) => !allowedSet.has(rId));
    member.roleIds = Array.from(new Set([...preserved, ...chosen]));
    member.rulesAcceptedAt = new Date().toISOString();
    deps.saveServers(deps.servers);
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('toggle_self_role', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'toggle_self_role', 20, 15_000)) return;
    const check = validatePayload<{ serverId: string; roleId: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      roleId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
    });
    if (!check.ok) return;
    const srv = deps.servers.find((s) => s.id === check.data.serverId);
    if (!srv) return;
    const member = findServerMember(srv, actor);
    if (!member) return;

    const allowed = (srv.onboarding?.selfAssignableRoleIds || []).includes(check.data.roleId);
    if (!allowed || !isSelfAssignableCandidate(srv, check.data.roleId)) {
      return socket.emit('server_action_error', { message: 'Bu rol kendi kendine seçilebilir rol listesinde değil.' });
    }

    if (member.roleIds.includes(check.data.roleId)) {
      member.roleIds = member.roleIds.filter((id) => id !== check.data.roleId);
    } else {
      member.roleIds.push(check.data.roleId);
    }
    deps.saveServers(deps.servers);
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('add_server_sound', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'add_server_sound', 10, 30_000)) return;
    const check = validatePayload<{ serverId: string; name: string; emoji?: string; dataUrl: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      name: { type: 'string', required: true, minLen: 1, maxLen: 32 },
      emoji: { type: 'string', required: false, maxLen: 8 },
      dataUrl: { type: 'string', required: true, minLen: 20, maxLen: 800_000 },
    });
    if (!check.ok) return socket.emit('server_action_error', { message: check.error });
    const srv = deps.servers.find((s) => s.id === check.data.serverId);
    if (!srv || !deps.checkServerPermission(actor, srv, 'manage_server')) {
      return socket.emit('server_action_error', { message: 'Sunucu ses kütüphanesi için yetkiniz yok.' });
    }
    if (!check.data.dataUrl.startsWith('data:audio/')) {
      return socket.emit('server_action_error', { message: 'Yalnızca geçerli ses (data:audio/*) verisi yüklenebilir.' });
    }
    if (!srv.serverSounds) srv.serverSounds = [];
    if (srv.serverSounds.length >= 24) {
      return socket.emit('server_action_error', { message: 'Sunucu başına en fazla 24 paylaşımlı ses eklenebilir.' });
    }
    const clip: ServerSoundClip = {
      id: `snd-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name: deps.sanitizeText(check.data.name).trim().slice(0, 32),
      emoji: (check.data.emoji || '🔊').trim().slice(0, 8) || '🔊',
      dataUrl: check.data.dataUrl,
      uploadedBy: actor.username,
      createdAt: new Date().toISOString(),
    };
    srv.serverSounds.push(clip);
    deps.saveServers(deps.servers);
    helpers.recordServerAudit(srv.id, actor.username, 'SES_KLIP_EKLENDI', `"${clip.name}" ses tahtasına eklendi.`, clip.name);
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('delete_server_sound', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor) return;
    const check = validatePayload<{ serverId: string; soundId: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      soundId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
    });
    if (!check.ok) return;
    const srv = deps.servers.find((s) => s.id === check.data.serverId);
    if (!srv || !deps.checkServerPermission(actor, srv, 'manage_server')) return;
    srv.serverSounds = (srv.serverSounds || []).filter((s) => s.id !== check.data.soundId);
    deps.saveServers(deps.servers);
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('add_server_sticker', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'add_server_sticker', 12, 30_000)) return;
    const check = validatePayload<{ serverId: string; name: string; imageUrl: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      name: { type: 'string', required: true, minLen: 1, maxLen: 32 },
      imageUrl: { type: 'string', required: true, minLen: 8, maxLen: 600_000 },
    });
    if (!check.ok) return socket.emit('server_action_error', { message: check.error });
    const srv = deps.servers.find((s) => s.id === check.data.serverId);
    if (!srv || !deps.checkServerPermission(actor, srv, 'manage_server')) {
      return socket.emit('server_action_error', { message: 'Çıkartma paketi için Sunucuyu Yönet yetkiniz yok.' });
    }
    if (!deps.isSafeImageMedia(check.data.imageUrl)) {
      return socket.emit('server_action_error', { message: 'Geçersiz çıkartma görseli.' });
    }
    if (!srv.stickers) srv.stickers = [];
    const boostSummary = computeServerBoostSummary(srv);
    const maxStickers = actor.role === 'admin' ? 100 : boostSummary.maxStickers;
    if (srv.stickers.length >= maxStickers) {
      return socket.emit('server_action_error', {
        message: `Bu sunucuda (Seviye ${boostSummary.tier}) en fazla ${maxStickers} çıkartma eklenebilir.`,
      });
    }
    const sticker: ServerSticker = {
      id: `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name: deps.sanitizeText(check.data.name).trim().slice(0, 32),
      imageUrl: check.data.imageUrl,
      uploadedBy: actor.username,
      createdAt: new Date().toISOString(),
    };
    srv.stickers.push(sticker);
    deps.saveServers(deps.servers);
    helpers.recordServerAudit(srv.id, actor.username, 'STICKER_EKLENDI', `"${sticker.name}" çıkartması eklendi.`, sticker.name);
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('delete_server_sticker', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor) return;
    const check = validatePayload<{ serverId: string; stickerId: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      stickerId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
    });
    if (!check.ok) return;
    const srv = deps.servers.find((s) => s.id === check.data.serverId);
    if (!srv || !deps.checkServerPermission(actor, srv, 'manage_server')) return;
    srv.stickers = (srv.stickers || []).filter((st) => st.id !== check.data.stickerId);
    deps.saveServers(deps.servers);
    deps.emitServerUpdatedToMembers(srv);
  });

  socket.on('update_server_nickname', (rawPayload: unknown) => {
    const actor = deps.activeUsers.get(socket.id);
    if (!actor) return;
    if (!deps.socketEventLimiter.allow(socket.id, 'update_server_nickname', 20, 30_000)) return;

    const check = validatePayload<{
      serverId: string;
      targetUsername?: string;
      nickname: string;
    }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      targetUsername: { type: 'string', required: false, minLen: 1, maxLen: 48 },
      nickname: { type: 'string', required: true, minLen: 0, maxLen: 32 },
    });
    if (!check.ok) {
      return socket.emit('server_action_error', { message: check.error || 'Geçersiz takma ad.' });
    }

    const srv = deps.servers.find((s) => s.id === check.data.serverId);
    if (!srv) return;

    const requestedTarget = check.data.targetUsername?.trim() || actor.username;
    const isSelf = requestedTarget.toLowerCase() === actor.username.toLowerCase();

    if (!isSelf) {
      const canEditOthers =
        actor.role === 'admin' ||
        isServerOwner(actor, srv) ||
        deps.checkServerPermission(actor, srv, 'manage_server') ||
        deps.checkServerPermission(actor, srv, 'manage_roles') ||
        deps.checkServerPermission(actor, srv, 'kick_members');
      if (!canEditOthers) {
        return socket.emit('server_action_error', {
          message: 'Başka üyelerin sunucu takma adını düzenlemek için yetkiniz yok.',
        });
      }
    }

    const member = (srv.members || []).find(
      (m) => m.username.toLowerCase() === requestedTarget.toLowerCase()
    );
    if (!member) {
      return socket.emit('server_action_error', { message: 'Sunucu üyesi bulunamadı.' });
    }

    const cleanNick = deps.sanitizeText(check.data.nickname).trim().slice(0, 32);
    if (cleanNick) {
      member.nickname = cleanNick;
    } else {
      delete member.nickname;
    }

    deps.saveServers(deps.servers);
    helpers.recordServerAudit(
      srv.id,
      actor.username,
      'TAKMA_AD_GUNCELLENDI',
      cleanNick
        ? `@${member.username} takma adı "${cleanNick}" olarak ayarlandı.`
        : `@${member.username} takma adı temizlendi.`,
      member.username
    );
    deps.emitServerUpdatedToMembers(srv);
  });
}
