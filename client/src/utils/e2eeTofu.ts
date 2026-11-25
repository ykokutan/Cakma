const TOFU_STORAGE_KEY = 'cakma_e2ee_tofu_keys_v1';

interface StoredTofuEntry {
  key: string;
  firstSeenAt: string;
  updatedAt: string;
}

export type PeerKeyTrustStatus = 'missing' | 'first_seen' | 'trusted' | 'changed';

export interface PeerKeyTrustResult {
  status: PeerKeyTrustStatus;
  previousKey?: string;
  currentKey?: string;
}

function readTofuMap(): Record<string, StoredTofuEntry> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(TOFU_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, StoredTofuEntry>;
    }
  } catch {}
  return {};
}

function writeTofuMap(map: Record<string, StoredTofuEntry>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TOFU_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Trust-On-First-Use (TOFU) verification for 1-on-1 DM E2EE public keys.
 * First observation is persisted silently; subsequent key rotations raise a `'changed'` warning
 * until explicitly acknowledged by the user.
 */
export function evaluatePeerKeyTrust(
  peerUsername: string,
  peerPublicKeyJson?: string | null
): PeerKeyTrustResult {
  const uname = String(peerUsername || '').trim().toLowerCase();
  const cleanKey = typeof peerPublicKeyJson === 'string' ? peerPublicKeyJson.trim() : '';
  if (!uname || !cleanKey) {
    return { status: 'missing' };
  }

  const map = readTofuMap();
  const existing = map[uname];
  if (!existing?.key) {
    const now = new Date().toISOString();
    map[uname] = { key: cleanKey, firstSeenAt: now, updatedAt: now };
    writeTofuMap(map);
    return { status: 'first_seen', currentKey: cleanKey };
  }

  if (existing.key === cleanKey) {
    return { status: 'trusted', currentKey: cleanKey };
  }

  return {
    status: 'changed',
    previousKey: existing.key,
    currentKey: cleanKey,
  };
}

/**
 * Marks a rotated peer public key as trusted after the user inspects/accepts the change warning.
 */
export function acknowledgePeerKeyChange(peerUsername: string, newPeerPublicKeyJson: string): void {
  const uname = String(peerUsername || '').trim().toLowerCase();
  const cleanKey = typeof newPeerPublicKeyJson === 'string' ? newPeerPublicKeyJson.trim() : '';
  if (!uname || !cleanKey) return;

  const map = readTofuMap();
  const existing = map[uname];
  const now = new Date().toISOString();
  map[uname] = {
    key: cleanKey,
    firstSeenAt: existing?.firstSeenAt || now,
    updatedAt: now,
  };
  writeTofuMap(map);
}
