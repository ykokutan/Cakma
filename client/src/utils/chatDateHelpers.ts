import { t, type AppLanguage } from './i18n';

const MSG_TS_RE = /^msg(?:-(?:ai|cmd))?-(\d{10,15})\b/;
const ISO_OR_YEAR_RE = /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}(?=\D|$)/;

export function extractMessageEpochMs(msg: { id?: string; timestamp?: string }): number | null {
  if (typeof msg.id === 'string') {
    const match = MSG_TS_RE.exec(msg.id);
    if (match) {
      const ms = Number(match[1]);
      if (Number.isFinite(ms) && ms > 946684800000) return ms;
    }
  }
  if (typeof msg.timestamp === 'string' && ISO_OR_YEAR_RE.test(msg.timestamp)) {
    const parsed = Date.parse(msg.timestamp);
    if (Number.isFinite(parsed) && parsed > 946684800000) return parsed;
  }
  return null;
}

export function getLocalDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateDividerLabel(
  epochMs: number,
  language: AppLanguage,
  nowMs = Date.now()
): string {
  const targetDay = getLocalDayKey(epochMs);
  const todayDay = getLocalDayKey(nowMs);
  if (targetDay === todayDay) {
    return t(language, 'today');
  }
  const yesterday = new Date(nowMs);
  yesterday.setDate(yesterday.getDate() - 1);
  if (targetDay === getLocalDayKey(yesterday.getTime())) {
    return t(language, 'yesterday');
  }

  const localeMap: Record<AppLanguage, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    de: 'de-DE',
    ru: 'ru-RU',
    fr: 'fr-FR',
  };
  try {
    return new Intl.DateTimeFormat(localeMap[language] || 'tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(epochMs));
  } catch {
    return targetDay;
  }
}
