import type { MemberLevelData, Server, ServerMember } from '../types.js';

export interface IdentityUserLike {
  id?: string;
  accountId?: string;
  username?: string;
  avatar?: string;
}

/**
 * Returns the canonical persistent user identifier (`accountId`) when available,
 * falling back to `user.id` for legacy or non-account objects.
 */
export function getPersistentUserId(
  user?: Pick<IdentityUserLike, 'id' | 'accountId'>,
  account?: { id?: string }
): string {
  return String(account?.id || user?.accountId || user?.id || '').trim();
}

/**
 * Matches a server member entry across current persistent `accountId`,
 * legacy socket IDs, or case-insensitive username.
 */
export function matchesServerMember(member: ServerMember, user?: IdentityUserLike | null): boolean {
  if (!member || !user) return false;
  const unameLower = String(user.username || '').trim().toLowerCase();
  if (user.accountId && member.userId === user.accountId) return true;
  if (user.id && member.userId === user.id) return true;
  if (unameLower && member.username && member.username.trim().toLowerCase() === unameLower) {
    return true;
  }
  return false;
}

export function findServerMember(
  server: Pick<Server, 'members'> | undefined,
  user?: IdentityUserLike | null
): ServerMember | undefined {
  if (!server?.members || !user) return undefined;
  return server.members.find((m) => matchesServerMember(m, user));
}

export function isServerOwner(
  user: IdentityUserLike | undefined | null,
  server: Pick<Server, 'ownerId' | 'members'> | undefined
): boolean {
  if (!user || !server) return false;
  const unameLower = String(user.username || '').trim().toLowerCase();
  if (user.accountId && server.ownerId === user.accountId) return true;
  if (user.id && server.ownerId === user.id) return true;
  if (unameLower && server.ownerId && server.ownerId.trim().toLowerCase() === unameLower) {
    return true;
  }
  const member = findServerMember(server, user);
  return Boolean(member?.isOwner);
}

/**
 * Resolves the persistent XP level record key (`accountId || username.toLowerCase()`)
 * and migrates/merges any legacy socket-ID keyed record for the same username.
 */
export function resolveServerLevelRecord(
  userLevels: Record<string, MemberLevelData>,
  user: { id: string; accountId?: string; username: string; avatar: string }
): { key: string; record: MemberLevelData } {
  const unameLower = user.username.trim().toLowerCase();
  const persistentKey = user.accountId || unameLower;

  if (!userLevels[persistentKey]) {
    userLevels[persistentKey] = {
      userId: persistentKey,
      username: user.username,
      avatar: user.avatar,
      xp: 0,
      level: 1,
      messageCount: 0,
      voiceMinutes: 0,
    };
  }

  const target = userLevels[persistentKey];
  target.userId = persistentKey;
  target.username = user.username;
  target.avatar = user.avatar;

  // Migrate/merge any stale legacy socket-id entries matching this username
  for (const [k, rec] of Object.entries(userLevels)) {
    if (k === persistentKey || !rec) continue;
    if (rec.username && rec.username.trim().toLowerCase() === unameLower) {
      target.xp += Number(rec.xp || 0);
      target.messageCount += Number(rec.messageCount || 0);
      target.voiceMinutes += Number(rec.voiceMinutes || 0);
      target.level = Math.max(target.level, Math.floor(0.2 * Math.sqrt(target.xp)), 1);
      delete userLevels[k];
    }
  }

  return { key: persistentKey, record: target };
}
