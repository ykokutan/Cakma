export type ServerSfuMode = 'auto' | 'p2p' | 'sfu';

export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Normalizes a LiveKit URL (including ws:// / wss:// schemes) to HTTP/HTTPS for healthchecks.
 */
export function normalizeLiveKitHttpUrl(rawUrl: string, fallbackUrl = 'http://127.0.0.1:7880'): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return fallbackUrl;
  return trimmed.replace(/^ws(s?):\/\//i, 'http$1://');
}

/**
 * Determines whether a voice room should connect through LiveKit SFU or stay on P2P Mesh.
 */
export function shouldRoomUseSfu(params: {
  sfuEnabled: boolean;
  serverMode?: ServerSfuMode;
  participantCount: number;
  threshold: number;
}): boolean {
  if (!params.sfuEnabled) return false;
  const mode = params.serverMode || 'auto';
  if (mode === 'p2p') return false;
  if (mode === 'sfu') return true;
  const effectiveThreshold = Math.max(2, Number(params.threshold) || 6);
  return params.participantCount >= effectiveThreshold;
}

/**
 * Builds the WebRTC ICE server list combining default STUN servers and optional custom TURN config.
 */
export function buildIceServers(cfg: {
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}): IceServerEntry[] {
  const servers: IceServerEntry[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = (cfg.turnUrl || '').trim();
  if (turnUrl) {
    const turnEntry: IceServerEntry = { urls: turnUrl };
    if (cfg.turnUsername?.trim()) turnEntry.username = cfg.turnUsername.trim();
    if (cfg.turnCredential?.trim()) turnEntry.credential = cfg.turnCredential.trim();
    servers.push(turnEntry);
  }
  return servers;
}
