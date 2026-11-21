import type { Channel, ChannelOverridePerm, ChannelPermissionOverride, Server } from '../types.js';
import { isUserMemberOfServer } from './serverDiscovery.js';
import { findServerMember, isServerOwner } from './serverIdentity.js';

export const ALL_CHANNEL_OVERRIDE_PERMS: readonly ChannelOverridePerm[] = [
  'view_channel',
  'send_messages',
  'attach_files',
  'connect_voice',
  'speak_voice',
] as const;

const PERM_SET = new Set<string>(ALL_CHANNEL_OVERRIDE_PERMS);

/** Sanitize and bound incoming channel permission overrides array. */
export function sanitizePermissionOverrides(raw: unknown): ChannelPermissionOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: ChannelPermissionOverride[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const targetType = obj.targetType === 'role' || obj.targetType === 'user' ? obj.targetType : null;
    const targetId = typeof obj.targetId === 'string' ? obj.targetId.trim().slice(0, 120) : '';
    if (!targetType || !targetId) continue;

    const dedupKey = `${targetType}:${targetId.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const allow = Array.isArray(obj.allow)
      ? Array.from(new Set(obj.allow.filter((p): p is ChannelOverridePerm => typeof p === 'string' && PERM_SET.has(p))))
      : [];
    const deny = Array.isArray(obj.deny)
      ? Array.from(
          new Set(
            obj.deny.filter(
              (p): p is ChannelOverridePerm =>
                typeof p === 'string' && PERM_SET.has(p) && !(allow as string[]).includes(p)
            )
          )
        )
      : [];

    if (allow.length === 0 && deny.length === 0) continue;
    out.push({ targetType, targetId, allow, deny });
    if (out.length >= 64) break;
  }

  return out;
}

/**
 * Resolve effective per-channel permissions for a user.
 * Precedence:
 *  1. System admin, server owner, or `manage_server` / `manage_channels` role holders bypass all restrictions.
 *  2. Non-members have no access.
 *  3. Base role permissions (`@everyone` + assigned roles). If `server.roles` is empty, default member perms apply.
 *     `view_channel` defaults to `!channel.isPrivate` (plus legacy `allowedRoleIds` check when set).
 *  4. Role-level overrides (`allow`, then `deny` — deny wins over allow within the role tier).
 *  5. User-level overrides (`allow`, then `deny` — user override beats role tier).
 *  6. If `view_channel` resolves to false, all other channel perms become false.
 */
export function resolveChannelPermissions(
  user: { id?: string; accountId?: string; username: string; role?: string },
  server: Server,
  channel: Channel
): Record<ChannelOverridePerm, boolean> {
  const allGranted: Record<ChannelOverridePerm, boolean> = {
    view_channel: true,
    send_messages: true,
    attach_files: true,
    connect_voice: true,
    speak_voice: true,
  };
  const allDenied: Record<ChannelOverridePerm, boolean> = {
    view_channel: false,
    send_messages: false,
    attach_files: false,
    connect_voice: false,
    speak_voice: false,
  };

  if (user.role === 'admin' || isServerOwner(user, server)) {
    return allGranted;
  }

  if (!isUserMemberOfServer(user, server)) {
    return allDenied;
  }

  const member = findServerMember(server, user);
  const memberRoleIds = new Set<string>(Array.isArray(member?.roleIds) ? member!.roleIds : []);
  const defaultRole = (server.roles || []).find((r) => r.isDefault);
  if (defaultRole?.id) {
    memberRoleIds.add(defaultRole.id);
  }

  const roles = Array.isArray(server.roles) ? server.roles : [];
  for (const rId of memberRoleIds) {
    const roleObj = roles.find((r) => r.id === rId);
    if (roleObj && (roleObj.permissions.includes('manage_server') || roleObj.permissions.includes('manage_channels'))) {
      return allGranted;
    }
  }

  const hasRolePerm = (perm: 'send_messages' | 'attach_files' | 'connect_voice' | 'speak_voice'): boolean => {
    if (roles.length === 0) return true;
    for (const rId of memberRoleIds) {
      const roleObj = roles.find((r) => r.id === rId);
      if (roleObj && roleObj.permissions.includes(perm)) return true;
    }
    return false;
  };

  let baseView = !channel.isPrivate;
  if (baseView && Array.isArray(channel.allowedRoleIds) && channel.allowedRoleIds.length > 0) {
    baseView = channel.allowedRoleIds.some((rId) => memberRoleIds.has(rId));
  }

  const perms: Record<ChannelOverridePerm, boolean> = {
    view_channel: baseView,
    send_messages: hasRolePerm('send_messages'),
    attach_files: hasRolePerm('attach_files'),
    connect_voice: hasRolePerm('connect_voice'),
    speak_voice: hasRolePerm('speak_voice'),
  };

  const overrides = Array.isArray(channel.permissionOverrides) ? channel.permissionOverrides : [];

  // Role tier: allow first, deny wins
  const roleOverrides = overrides.filter((o) => o.targetType === 'role' && memberRoleIds.has(o.targetId));
  for (const ov of roleOverrides) {
    for (const p of ov.allow || []) {
      if (PERM_SET.has(p)) perms[p] = true;
    }
  }
  for (const ov of roleOverrides) {
    for (const p of ov.deny || []) {
      if (PERM_SET.has(p)) perms[p] = false;
    }
  }

  // User tier: beats role tier; allow first, deny wins within user overrides
  const unameLower = String(user.username || '').trim().toLowerCase();
  const userOverrides = overrides.filter((o) => {
    if (o.targetType !== 'user') return false;
    const tid = o.targetId.trim();
    if (user.accountId && tid === user.accountId) return true;
    if (user.id && tid === user.id) return true;
    if (unameLower && tid.toLowerCase() === unameLower) return true;
    return false;
  });
  for (const ov of userOverrides) {
    for (const p of ov.allow || []) {
      if (PERM_SET.has(p)) perms[p] = true;
    }
  }
  for (const ov of userOverrides) {
    for (const p of ov.deny || []) {
      if (PERM_SET.has(p)) perms[p] = false;
    }
  }

  if (!perms.view_channel) {
    return allDenied;
  }

  return perms;
}
