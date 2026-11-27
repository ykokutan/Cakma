import type { User } from '../types.js';

/**
 * Strips private account/moderation fields before broadcasting a user object to other clients.
 */
export function toPublicUser(user: User): User {
  const {
    email: _email,
    walletBalance: _walletBalance,
    blockedUsers: _blockedUsers,
    twoFactorEnabled: _twoFactorEnabled,
    isBanned: _isBanned,
    bannedReason: _bannedReason,
    bannedUntil: _bannedUntil,
    acceptedTermsAt: _acceptedTermsAt,
    acceptedTermsVersion: _acceptedTermsVersion,
    verifiedConnections,
    ...publicProfile
  } = user;
  return {
    ...publicProfile,
    ...(Array.isArray(verifiedConnections)
      ? { verifiedConnections: verifiedConnections.filter((c) => c.showOnProfile !== false) }
      : {}),
  };
}
