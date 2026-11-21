import { describe, it, expect } from 'vitest';
import {
  extractMessageEpochMs,
  formatDateDividerLabel,
  getLocalDayKey,
} from '../chatDateHelpers';

describe('chatDateHelpers', () => {
  it('extracts epoch ms from msg- prefixed IDs and ISO timestamps', () => {
    const epoch = new Date(2026, 10, 21, 14, 30, 0).getTime();
    expect(extractMessageEpochMs({ id: `msg-${epoch}-ab12`, timestamp: '14:30' })).toBe(epoch);
    expect(extractMessageEpochMs({ id: `msg-ai-${epoch}`, timestamp: '14:30' })).toBe(epoch);
    expect(extractMessageEpochMs({ id: 'legacy-1', timestamp: '2026-11-21T12:00:00Z' })).toBe(
      Date.parse('2026-11-21T12:00:00Z')
    );
    expect(extractMessageEpochMs({ id: 'm-1', timestamp: '14:30' })).toBeNull();
  });

  it('formats local day keys and Today/Yesterday/historical date labels', () => {
    const now = new Date(2026, 10, 21, 16, 0, 0).getTime();
    const sameDay = new Date(2026, 10, 21, 9, 15, 0).getTime();
    const yesterday = new Date(2026, 10, 20, 22, 0, 0).getTime();
    const older = new Date(2026, 10, 10, 11, 0, 0).getTime();

    expect(getLocalDayKey(sameDay)).toBe('2026-11-21');
    expect(formatDateDividerLabel(sameDay, 'tr', now)).toBe('Bugün');
    expect(formatDateDividerLabel(yesterday, 'tr', now)).toBe('Dün');
    expect(formatDateDividerLabel(sameDay, 'en', now)).toBe('Today');
    expect(formatDateDividerLabel(yesterday, 'en', now)).toBe('Yesterday');

    const olderLabel = formatDateDividerLabel(older, 'en', now);
    expect(olderLabel).toContain('2026');
    expect(olderLabel).toContain('10');
  });
});
