export interface CalendarEventInput {
  id: string;
  title: string;
  description?: string;
  scheduledAt: string;
  createdBy?: string;
  durationMinutes?: number;
}

function formatIcsUtcDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(raw: string): string {
  return String(raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function buildEventIcs(event: CalendarEventInput, serverName = 'Çakma'): string {
  const start = new Date(event.scheduledAt);
  const safeStart = Number.isFinite(start.getTime()) ? start : new Date();
  const durationMs = Math.max(15, event.durationMinutes ?? 60) * 60_000;
  const end = new Date(safeStart.getTime() + durationMs);
  const now = new Date();
  const safeUid = String(event.id || `evt-${safeStart.getTime()}`).replace(/[^a-zA-Z0-9_-]/g, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cakma//ServerEvents//TR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${safeUid}@cakma.local`,
    `DTSTAMP:${formatIcsUtcDate(now)}`,
    `DTSTART:${formatIcsUtcDate(safeStart)}`,
    `DTEND:${formatIcsUtcDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(serverName)}`,
  ];

  const descParts = [
    event.description?.trim() || '',
    event.createdBy ? `Oluşturan: ${event.createdBy}` : '',
  ].filter(Boolean);
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join(' — '))}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadEventIcs(event: CalendarEventInput, serverName = 'Çakma'): void {
  const content = buildEventIcs(event, serverName);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug =
    event.title
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'etkinlik';
  a.href = url;
  a.download = `${slug}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
