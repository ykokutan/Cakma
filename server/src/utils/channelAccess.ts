import type { GroupDmRoom, Message, Server } from '../types.js';
import { isUserMemberOfServer } from './serverDiscovery.js';

/** Encode a username segment into a reversible, separator-safe token for DM IDs. */
export function encodeDmSegment(username: string): string {
  const clean = String(username || '').trim().toLowerCase();
  return encodeURIComponent(clean).replace(/-/g, '%2d').replace(/%/g, '~');
}

/** Decode a segment created by `encodeDmSegment`. */
export function decodeDmSegment(segment: string): string {
  try {
    return decodeURIComponent(String(segment || '').replace(/~/g, '%')).trim().toLowerCase();
  } catch {
    return String(segment || '').trim().toLowerCase();
  }
}

/**
 * Deterministic, cross-session persistent DM channel ID derived from usernames
 * rather than ephemeral `socket.id` values.
 */
export function buildPersistentDmChannelId(userA: string, userB: string): string {
  const segA = encodeDmSegment(userA);
  const segB = encodeDmSegment(userB);
  const [first, second] = [segA, segB].sort();
  return `dm-u-${first}--${second}`;
}

/** Extract lowercased participant tokens from `dm-u-*` or legacy `dm-*` channel IDs. */
export function parseDmChannelParticipants(channelId: string): [string, string] | null {
  if (!channelId || typeof channelId !== 'string') return null;
  if (channelId.startsWith('dm-u-')) {
    const body = channelId.slice(5);
    const parts = body.split('--');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const a = decodeDmSegment(parts[0]);
    const b = decodeDmSegment(parts[1]);
    if (!a || !b) return null;
    return [a, b];
  }
  if (channelId.startsWith('dm-') && channelId !== 'dm-general') {
    const body = channelId.slice(3);
    const parts = body.split('-');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return [parts[0].toLowerCase(), parts[1].toLowerCase()];
    }
  }
  return null;
}

/** Determine whether a user belongs to a DM channel. */
export function isUserParticipantInDm(
  user: { id?: string; username: string },
  channelId: string,
  channelMessages?: Message[]
): boolean {
  if (!channelId || !channelId.startsWith('dm-') || channelId === 'dm-general') {
    return false;
  }
  const uname = String(user.username || '').trim().toLowerCase();
  const uid = String(user.id || '').trim().toLowerCase();
  if (!uname && !uid) return false;

  const parsed = parseDmChannelParticipants(channelId);
  if (parsed) {
    const [a, b] = parsed;
    if (uname && (a === uname || b === uname)) return true;
    if (uid && (a === uid || b === uid)) return true;
    if (channelId.startsWith('dm-u-')) return false;
  }

  // Fallback for legacy socket-id `dm-<socketA>-<socketB>` IDs
  if (uid && channelId.toLowerCase().includes(uid)) return true;
  if (uname && Array.isArray(channelMessages)) {
    return channelMessages.some((m) => m.author?.username?.toLowerCase() === uname);
  }
  return false;
}

/** Locate the server owning a channel ID (ignoring the virtual `direct-messages` ID). */
export function findServerByChannelId(
  servers: Server[],
  channelId: string,
  serverId?: string
): Server | undefined {
  if (serverId && serverId !== 'direct-messages') {
    const byId = servers.find((s) => s.id === serverId);
    if (byId) return byId;
  }
  return servers.find((s) => s.channels?.some((c) => c.id === channelId));
}

/** Determine whether a user belongs to a Group DM room (text `gdm-*` or voice `voice-gdm-*`). */
export function isUserMemberOfGroupDm(
  user: { username: string },
  channelId: string,
  groupDms?: GroupDmRoom[]
): boolean {
  if (!channelId || !Array.isArray(groupDms)) return false;
  if (!channelId.startsWith('gdm-') && !channelId.startsWith('voice-gdm-')) return false;
  const uname = String(user.username || '').trim().toLowerCase();
  if (!uname) return false;
  const room = groupDms.find((g) => g.id === channelId || g.voiceChannelId === channelId);
  if (!room) return false;
  return Array.isArray(room.members) && room.members.some((m) => m.toLowerCase() === uname);
}

/** Check whether a user is authorized to read/post/search inside a given channel. */
export function canUserAccessChannel(
  user: { id?: string; accountId?: string; username: string; role?: string },
  channelId: string,
  servers: Server[],
  serverId?: string,
  channelMessages?: Message[],
  groupDms?: GroupDmRoom[]
): boolean {
  if (!channelId) return false;
  if (channelId.startsWith('gdm-') || channelId.startsWith('voice-gdm-')) {
    return isUserMemberOfGroupDm(user, channelId, groupDms);
  }
  if (channelId.startsWith('dm-') || serverId === 'direct-messages') {
    return isUserParticipantInDm(user, channelId, channelMessages);
  }
  const srv = findServerByChannelId(servers, channelId, serverId);
  if (!srv) return false;
  return user.role === 'admin' || isUserMemberOfServer(user, srv);
}
