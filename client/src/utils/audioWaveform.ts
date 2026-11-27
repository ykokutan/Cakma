import { authFetch } from './authFetch';

export function isVoiceNoteFilename(name: string, messageContent?: string): boolean {
  const raw = String(name || '');
  const lowerTr = raw.toLocaleLowerCase('tr-TR');
  const lower = raw.toLowerCase();
  const matchesName =
    lowerTr.includes('sesli mesaj') ||
    lowerTr.includes('sesli-mesaj') ||
    lowerTr.includes('ses notu') ||
    lowerTr.includes('ses-notu') ||
    lower.includes('sesli mesaj') ||
    lower.includes('sesli-mesaj') ||
    lower.includes('ses notu') ||
    lower.includes('ses-notu') ||
    lower.includes('voice-note') ||
    lower.includes('voice message') ||
    lower.includes('voice-message');

  if (matchesName) return true;
  return typeof messageContent === 'string' && messageContent.includes('🎙️ Sesli Mesaj');
}

export function parseDurationHintSeconds(name: string): number {
  const match = String(name || '').match(/\((\d+(?:\.\d+)?)s\)/i);
  if (!match) return 0;
  const val = Number(match[1]);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

export function extractWaveformPeaksFromSamples(
  samples: Float32Array,
  barCount = 24
): number[] {
  const safeBars = Math.max(4, Math.min(64, Math.floor(barCount)));
  if (!samples || samples.length === 0) {
    return Array.from({ length: safeBars }, () => 25);
  }
  const blockSize = Math.max(1, Math.floor(samples.length / safeBars));
  const rawPeaks: number[] = [];
  let maxPeak = 0;

  for (let b = 0; b < safeBars; b++) {
    const start = b * blockSize;
    const end = b === safeBars - 1 ? samples.length : Math.min(samples.length, start + blockSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    rawPeaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }

  if (maxPeak <= 0.0001) {
    return Array.from({ length: safeBars }, () => 18);
  }

  return rawPeaks.map((p) => {
    const normalized = Math.round((p / maxPeak) * 100);
    return Math.max(14, Math.min(100, normalized));
  });
}

export async function decodeAudioWaveformData(
  url: string,
  barCount = 24
): Promise<{ peaks: number[]; duration: number } | null> {
  if (typeof window === 'undefined' || !url) return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    const isLocalBlobOrData = url.startsWith('blob:') || url.startsWith('data:');
    const res = isLocalBlobOrData ? await fetch(url) : await authFetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength === 0) return null;
    ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(buf);
    const channelData = audioBuffer.getChannelData(0);
    const duration =
      Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0
        ? audioBuffer.duration
        : 0;
    return {
      peaks: extractWaveformPeaksFromSamples(channelData, barCount),
      duration,
    };
  } catch {
    return null;
  } finally {
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}

export async function decodeAudioWaveformPeaks(
  url: string,
  barCount = 24
): Promise<number[] | null> {
  const decoded = await decodeAudioWaveformData(url, barCount);
  return decoded ? decoded.peaks : null;
}
