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

export async function decodeAudioWaveformPeaks(
  url: string,
  barCount = 24
): Promise<number[] | null> {
  if (typeof window === 'undefined' || !url) return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength === 0) return null;
    ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(buf);
    const channelData = audioBuffer.getChannelData(0);
    return extractWaveformPeaksFromSamples(channelData, barCount);
  } catch {
    return null;
  } finally {
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}
