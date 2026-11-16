export type StatusExpiryPreset = 'never' | '30m' | '1h' | '4h' | 'today';

export const STATUS_EXPIRY_KEY = 'dc_custom_status_expires_at';

export const STATUS_EXPIRY_OPTIONS: Array<{ id: StatusExpiryPreset; label: string }> = [
  { id: 'never', label: 'Süresiz' },
  { id: '30m', label: '30 Dakika' },
  { id: '1h', label: '1 Saat' },
  { id: '4h', label: '4 Saat' },
  { id: 'today', label: 'Bugün Sonu' },
];

export function computeStatusExpiryTimestamp(preset: StatusExpiryPreset, now = Date.now()): number | null {
  if (preset === 'never') return null;
  if (preset === '30m') return now + 30 * 60 * 1000;
  if (preset === '1h') return now + 60 * 60 * 1000;
  if (preset === '4h') return now + 4 * 60 * 60 * 1000;
  if (preset === 'today') {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime();
  }
  return null;
}

export function isStatusExpired(expiresAt: number | null | undefined, now = Date.now()): boolean {
  if (!expiresAt || !Number.isFinite(expiresAt)) return false;
  return now >= expiresAt;
}
