import { describe, it, expect } from 'vitest';
import { buildEventIcs } from '../eventCalendar';

describe('eventCalendar', () => {
  it('builds a valid VCALENDAR/VEVENT payload with UTC timestamps and escaped characters', () => {
    const ics = buildEventIcs(
      {
        id: 'evt-42',
        title: 'Haftalık Turnuva, Final; 1. Gün',
        description: 'İlk tur\nSaat 21:00 başlar',
        scheduledAt: '2026-12-01T18:00:00.000Z',
        createdBy: 'ykokutas',
        durationMinutes: 90,
      },
      'Ana Sunucu'
    );

    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('UID:evt-42@cakma.local\r\n');
    expect(ics).toContain('DTSTART:20261201T180000Z\r\n');
    expect(ics).toContain('DTEND:20261201T193000Z\r\n');
    expect(ics).toContain('SUMMARY:Haftalık Turnuva\\, Final\\; 1. Gün\r\n');
    expect(ics).toContain('DESCRIPTION:İlk tur\\nSaat 21:00 başlar — Oluşturan: ykokutas\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });
});
