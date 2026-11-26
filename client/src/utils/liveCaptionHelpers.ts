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
  const normSource = String(sourceLang || '').trim().toLowerCase();
  const normTarget = String(targetLang).trim().toLowerCase();
  if (normSource && normSource !== 'auto' && normSource === normTarget) return false;
  return String(text || '').trim().length >= 2;
}

export interface ClientGtxTranslationResult {
  translatedText: string;
  detectedLang: string | null;
}

const CLIENT_GTX_CACHE = new Map<string, ClientGtxTranslationResult>();
const MAX_CLIENT_GTX_CACHE = 300;

export function parseClientGtxTranslate(data: unknown): ClientGtxTranslationResult | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const parts: string[] = [];
  for (const segment of data[0]) {
    if (Array.isArray(segment) && typeof segment[0] === 'string') {
      parts.push(segment[0]);
    }
  }
  const translatedText = parts.join('').trim();
  if (!translatedText) return null;
  const rawDetected = typeof data[2] === 'string' ? data[2].trim().toLowerCase() : '';
  const detectedLang = rawDetected ? rawDetected.split('-')[0] : null;
  return { translatedText, detectedLang };
}

export function detectSpokenLangHint(text: string): CaptionLangCode | null {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 2) return null;
  if (/[\u0400-\u04FF]/.test(trimmed)) return 'ru';
  if (/[ğşşıİĞŞ]/.test(trimmed)) return 'tr';
  if (/[äßÄ]/.test(trimmed)) return 'de';
  if (/[éèêëàâôùûîïœæÉÈÊËÀÂÔÙÛÎÏŒÆ]/.test(trimmed)) return 'fr';
  if (/[öüçÖÜÇ]/.test(trimmed)) return 'tr';
  if (
    /\b(the|and|is|are|you|we|have|with|from|this|that|cover|reloading|attack|defend)\b/i.test(
      trimmed
    )
  ) {
    return 'en';
  }
  return null;
}

function setClientGtxCache(key: string, value: ClientGtxTranslationResult): void {
  if (CLIENT_GTX_CACHE.has(key)) {
    CLIENT_GTX_CACHE.delete(key);
  } else if (CLIENT_GTX_CACHE.size >= MAX_CLIENT_GTX_CACHE) {
    const oldestKey = CLIENT_GTX_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      CLIENT_GTX_CACHE.delete(oldestKey);
    }
  }
  CLIENT_GTX_CACHE.set(key, value);
}

export async function translateCaptionClientSide(
  text: string,
  targetLang: CaptionLangCode
): Promise<ClientGtxTranslationResult | null> {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 2) return null;

  const cacheKey = `${targetLang}::${trimmed}`;
  const cached = CLIENT_GTX_CACHE.get(cacheKey);
  if (cached) {
    setClientGtxCache(cacheKey, cached);
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = parseClientGtxTranslate(data);
    if (!parsed) return null;

    const sameLanguage =
      (parsed.detectedLang && parsed.detectedLang === targetLang) ||
      parsed.translatedText.toLowerCase() === trimmed.toLowerCase();
    const result: ClientGtxTranslationResult = sameLanguage
      ? { translatedText: '', detectedLang: parsed.detectedLang }
      : parsed;
    setClientGtxCache(cacheKey, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
