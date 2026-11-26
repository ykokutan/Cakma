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
    /\b(the|and|is|are|you|we|have|with|from|this|that|cover|reloading|attack|defend|hello|hey|yes|no|what|how|good|nice)\b/i.test(
      trimmed
    )
  ) {
    return 'en';
  }
  if (/\b(merhaba|selam|tamam|evet|hayir|nasil|tesekkur|geliyorum)\b/i.test(trimmed)) {
    return 'tr';
  }
  if (/\b(hallo|danke|bitte|nicht|ich|und|wir|sie)\b/i.test(trimmed)) {
    return 'de';
  }
  if (/\b(bonjour|merci|oui|salut|avec|pour|nous|vous)\b/i.test(trimmed)) {
    return 'fr';
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

const WHISPER_SILENCE_HALLUCINATIONS = new Set([
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'you',
  'bye',
  'altyazı m.k',
  'subtitles by',
  'mbc',
]);

export function downsampleTo16kHz(samples: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate <= 0 || samples.length === 0) {
    return new Float32Array(0);
  }
  if (inputSampleRate === 16000) {
    return samples;
  }
  const ratio = inputSampleRate / 16000;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : samples[Math.min(start, samples.length - 1)];
  }
  return result;
}

export function computeAudioRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  return Math.sqrt(sumSq / samples.length);
}

export function cleanWhisperTranscript(raw: string): string {
  const withoutTags = String(raw || '')
    .replace(/\[[^\]]*\]|\([^)]*\)|♪[^♪]*♪?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutTags) return '';

  const alnumCount = withoutTags.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (alnumCount < 2) return '';

  const normalizedForCheck = withoutTags
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
    .toLowerCase();
  if (!normalizedForCheck || WHISPER_SILENCE_HALLUCINATIONS.has(normalizedForCheck)) {
    return '';
  }
  return withoutTags;
}
