export type CaptionSourceType = 'user' | 'stream';
export type CaptionLangCode = 'tr' | 'en' | 'de' | 'ru' | 'fr';

export interface LiveCaptionEntry {
  id: string;
  time: string;
  author: string;
  source: CaptionSourceType;
  sourceLabel?: string;
  text: string;
  translatedText?: string;
  sourceLang: string;
  targetLang?: string | null;
}

export function formatCaptionBadge(
  entry: Pick<LiveCaptionEntry, 'source' | 'author' | 'sourceLabel'>
): string {
  if (entry.source === 'stream') {
    const cleanLabel = String(entry.sourceLabel || '').trim();
    return cleanLabel ? `🎮 Uygulama · ${cleanLabel}` : '🎮 Yayın / Uygulama';
  }
  const cleanAuthor = String(entry.author || '').trim() || 'Kullanıcı';
  return `👤 ${cleanAuthor}`;
}

export function shouldTranslateCaption(
  text: string,
  sourceLang: string,
  targetLang: string | null | undefined
): boolean {
  if (!targetLang || targetLang === 'off') return false;
  if (String(sourceLang || '').toLowerCase() === String(targetLang).toLowerCase()) return false;
  return String(text || '').trim().length >= 2;
}

export function formatCaptionTranscriptMarkdown(
  channelName: string,
  entries: LiveCaptionEntry[]
): string {
  const lines = [
    `# Canlı Ses Altyazı Transkripti — #${channelName}`,
    `Tarih: ${new Date().toISOString()}`,
    '',
  ];
  for (const entry of entries) {
    const badge = formatCaptionBadge(entry);
    if (entry.translatedText) {
      lines.push(
        `- **[${entry.time}] ${badge}**: ${entry.translatedText} _(Orijinal: ${entry.text})_`
      );
    } else {
      lines.push(`- **[${entry.time}] ${badge}**: ${entry.text}`);
    }
  }
  return lines.join('\n');
}
