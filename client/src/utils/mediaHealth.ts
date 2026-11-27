/**
 * Utilities for detecting expired external CDN links (e.g. signed Discord CDN attachments
 * whose `ex=` hex expiry timestamp has passed) and removed placeholder media.
 */
export function isExpiredDiscordCdnUrl(rawUrl: string, nowMs: number = Date.now()): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const u = new URL(rawUrl, 'https://localhost');
    const host = u.hostname.toLowerCase();
    const isDiscordCdn =
      host === 'cdn.discordapp.com' ||
      host === 'media.discordapp.net' ||
      host.endsWith('.discordapp.com') ||
      host.endsWith('.discordapp.net');
    if (!isDiscordCdn) return false;
    const exHex = u.searchParams.get('ex');
    if (!exHex) return false;
    const expiresSec = Number.parseInt(exHex, 16);
    if (!Number.isFinite(expiresSec) || expiresSec <= 0) return false;
    return expiresSec * 1000 <= nowMs;
  } catch {
    return false;
  }
}

export function formatTransferSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`;
}
