export type AuditDateRange = 'all' | 'today' | '24h' | '7d';

export function generateStrongPassword(length = 14): string {
  const targetLen = Math.max(8, length);
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*_-+=?';
  const all = `${upper}${lower}${digits}${symbols}`;

  const randomValues = new Uint32Array(targetLen + 4);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < randomValues.length; i++) {
      randomValues[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  const pick = (pool: string, seed: number) => pool[seed % pool.length];
  const chars = [
    pick(upper, randomValues[0]),
    pick(lower, randomValues[1]),
    pick(digits, randomValues[2]),
    pick(symbols, randomValues[3]),
  ];

  for (let i = 4; i < targetLen; i++) {
    chars.push(pick(all, randomValues[i]));
  }

  // Fisher-Yates shuffle using remaining randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomValues[i % randomValues.length] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

export function resolveVoiceChannelLabel(
  channelId: string | undefined,
  servers: Array<{ name: string; channels?: Array<{ id: string; name: string }> }>
): { serverName: string; channelName: string; label: string } {
  if (!channelId) {
    return { serverName: '', channelName: '', label: 'Bilinmeyen Kanal' };
  }
  for (const srv of servers) {
    const ch = (srv.channels || []).find((c) => c.id === channelId);
    if (ch) {
      return {
        serverName: srv.name,
        channelName: ch.name,
        label: `${srv.name} / #${ch.name}`,
      };
    }
  }
  return { serverName: '', channelName: channelId, label: channelId };
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRowsToCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseLogEpochMs(log: { id?: string; timestamp?: string }): number | null {
  const ts = String(log.timestamp || '').trim();
  if (ts) {
    // Support ISO or RFC timestamps directly
    if (/\d{4}-\d{2}-\d{2}/.test(ts) || /[TtZz]/.test(ts)) {
      const parsed = Date.parse(ts);
      if (!Number.isNaN(parsed)) return parsed;
    }
    // Support Turkish DD.MM.YYYY HH:mm(:ss)
    const trMatch = ts.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (trMatch) {
      const day = Number(trMatch[1]);
      const month = Number(trMatch[2]) - 1;
      const year = Number(trMatch[3]);
      const hr = Number(trMatch[4] || 0);
      const min = Number(trMatch[5] || 0);
      const sec = Number(trMatch[6] || 0);
      return new Date(year, month, day, hr, min, sec).getTime();
    }
  }
  // Fallback to server-generated id (`log-<epochMs>-...`) when timestamp is time-only (HH:MM:SS)
  if (typeof log.id === 'string') {
    const idMatch = log.id.match(/^log-(\d{10,15})\b/);
    if (idMatch) {
      const n = Number(idMatch[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function filterAuditLogsByDateRange<T extends { id?: string; timestamp?: string }>(
  logs: T[],
  range: AuditDateRange,
  nowMs: number = Date.now()
): T[] {
  if (range === 'all') return logs;
  let cutoffMs = 0;
  if (range === 'today') {
    const startOfDay = new Date(nowMs);
    startOfDay.setHours(0, 0, 0, 0);
    cutoffMs = startOfDay.getTime();
  } else if (range === '24h') {
    cutoffMs = nowMs - 24 * 60 * 60 * 1000;
  } else if (range === '7d') {
    cutoffMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  }

  return logs.filter((log) => {
    const epoch = parseLogEpochMs(log);
    if (epoch === null) {
      const ts = String(log.timestamp || '').trim();
      // Keep time-only boot entries (HH:MM:SS) visible across recent windows, reject invalid/unknown strings
      return /^\d{1,2}:\d{2}(:\d{2})?/.test(ts);
    }
    return epoch >= cutoffMs;
  });
}
