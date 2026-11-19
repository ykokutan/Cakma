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
