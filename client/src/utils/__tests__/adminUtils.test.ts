import { afterEach, describe, it, expect, vi } from 'vitest';
import { getAuthHeaders, resolveBackendBaseUrl } from '../authFetch';
import {
  exportRowsToCsv,
  filterAuditLogsByDateRange,
  generateStrongPassword,
  resolveVoiceChannelLabel,
} from '../adminHelpers';

describe('authFetch helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves bare hosts and preserves explicit URL schemes', () => {
    expect(resolveBackendBaseUrl('localhost:4000')).toBe('http://localhost:4000');
    expect(resolveBackendBaseUrl('127.0.0.1:4000/')).toBe('http://127.0.0.1:4000');
    expect(resolveBackendBaseUrl('https://ses.yahyakemalokutan.com/')).toBe('https://ses.yahyakemalokutan.com');
    expect(resolveBackendBaseUrl('ses.yahyakemalokutan.com')).toBe('https://ses.yahyakemalokutan.com');
  });

  it('attaches Bearer token from localStorage and skips __cookie__', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });

    store.set('dc_clone_auth', JSON.stringify({ token: 'tok-xyz', username: 'ali' }));
    const headers = getAuthHeaders({ 'X-Custom': '1' });
    expect(headers.get('Authorization')).toBe('Bearer tok-xyz');
    expect(headers.get('X-Custom')).toBe('1');

    store.set('dc_clone_auth', JSON.stringify({ token: '__cookie__', username: 'ali' }));
    const cookieHeaders = getAuthHeaders();
    expect(cookieHeaders.has('Authorization')).toBe(false);
  });
});

describe('adminHelpers', () => {
  it('generateStrongPassword returns >= 8 chars with mixed character classes', () => {
    const pw = generateStrongPassword(14);
    expect(pw.length).toBe(14);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(pw)).toBe(true);
  });

  it('resolveVoiceChannelLabel maps channel IDs to Server / #Channel labels', () => {
    const servers = [
      {
        name: 'Ana Sunucu',
        channels: [
          { id: 'vc-1', name: 'Oyun Odası' },
          { id: 'txt-1', name: 'sohbet' },
        ],
      },
    ];
    expect(resolveVoiceChannelLabel('vc-1', servers)).toEqual({
      serverName: 'Ana Sunucu',
      channelName: 'Oyun Odası',
      label: 'Ana Sunucu / #Oyun Odası',
    });
    expect(resolveVoiceChannelLabel('missing-ch', servers).label).toBe('missing-ch');
  });

  it('exportRowsToCsv includes UTF-8 BOM and RFC-4180 quotes', () => {
    const csv = exportRowsToCsv(['ad', 'not'], [['Ali "Veli"', 'Satır, test']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFad,not\r\n"Ali ""Veli""","Satır, test"');
  });

  it('filterAuditLogsByDateRange filters ISO and log-<epoch> entries accurately', () => {
    const now = new Date('2026-11-19T12:00:00Z').getTime();
    const logs = [
      { id: `log-${now - 1000}-a`, timestamp: '2026-11-19T11:59:59Z', action: 'RECENT' },
      { id: `log-${now - 3 * 24 * 3600 * 1000}-b`, timestamp: '2026-11-16T10:00:00Z', action: 'THREE_DAYS' },
      { id: `log-${now - 12 * 24 * 3600 * 1000}-c`, timestamp: '2026-11-07T10:00:00Z', action: 'OLD' },
    ];
    expect(filterAuditLogsByDateRange(logs, 'all', now).length).toBe(3);
    expect(filterAuditLogsByDateRange(logs, '24h', now).map((l) => l.action)).toEqual(['RECENT']);
    expect(filterAuditLogsByDateRange(logs, '7d', now).map((l) => l.action)).toEqual(['RECENT', 'THREE_DAYS']);
  });
});
