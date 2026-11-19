import type { Server } from '../types';

export function isSameUser(
  a?: { id?: string; accountId?: string; username?: string } | null,
  b?: { id?: string; accountId?: string; username?: string } | null
): boolean {
  if (!a || !b) return false;
  if (a.accountId && b.accountId && a.accountId === b.accountId) return true;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.username && b.username && a.username.trim().toLowerCase() === b.username.trim().toLowerCase()) {
    return true;
  }
  return false;
}

export function isUserServerOwner(
  user?: { id?: string; accountId?: string; username?: string } | null,
  server?: Pick<Server, 'ownerId' | 'members'> | null
): boolean {
  if (!user || !server) return false;
  const unameLower = String(user.username || '').trim().toLowerCase();
  if (user.accountId && server.ownerId === user.accountId) return true;
  if (user.id && server.ownerId === user.id) return true;
  if (unameLower && server.ownerId && server.ownerId.trim().toLowerCase() === unameLower) return true;
  return Boolean(
    server.members?.some(
      (m) =>
        m.isOwner &&
        ((user.accountId && m.userId === user.accountId) ||
          (user.id && m.userId === user.id) ||
          (unameLower !== '' && m.username.trim().toLowerCase() === unameLower))
    )
  );
}
