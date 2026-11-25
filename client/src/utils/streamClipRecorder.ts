export function trimRollingClipChunks<T>(initChunk: T | null, chunks: T[], maxSeconds: number): T[] {
  const safeMax = Math.max(1, Math.floor(maxSeconds || 30));
  if (initChunk !== null && initChunk !== undefined) {
    const tailLimit = Math.max(0, safeMax - 1);
    const tail = tailLimit === 0 ? [] : chunks.slice(-tailLimit);
    return [initChunk, ...tail];
  }
  return chunks.slice(-safeMax);
}

export function pickSupportedClipMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

export interface StreamClipRecorderHandle {
  start: () => boolean;
  captureBlob: () => Blob | null;
  getBufferedSeconds: () => number;
  stop: () => void;
}

export function createStreamClipRecorder(
  stream: MediaStream,
  maxSeconds = 30,
  onBufferTick?: (seconds: number) => void
): StreamClipRecorderHandle {
  const safeMax = Math.max(5, Math.floor(maxSeconds || 30));
  let initChunk: Blob | null = null;
  let rollingChunks: Blob[] = [];
  let recorder: MediaRecorder | null = null;
  const chosenMime = pickSupportedClipMimeType();

  const start = (): boolean => {
    if (typeof MediaRecorder === 'undefined') return false;
    if (recorder && recorder.state === 'recording') return true;
    initChunk = null;
    rollingChunks = [];
    try {
      recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: 3_000_000 })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (ev: BlobEvent) => {
        if (!ev.data || ev.data.size === 0) return;
        if (!initChunk) {
          initChunk = ev.data;
        } else {
          const next = [...rollingChunks, ev.data];
          const tailLimit = Math.max(0, safeMax - 1);
          rollingChunks = tailLimit === 0 ? [] : next.slice(-tailLimit);
        }
        onBufferTick?.(getBufferedSeconds());
      };
      recorder.start(1000);
      return true;
    } catch {
      recorder = null;
      return false;
    }
  };

  const getBufferedSeconds = (): number => {
    return (initChunk ? 1 : 0) + rollingChunks.length;
  };

  const captureBlob = (): Blob | null => {
    const parts = trimRollingClipChunks(initChunk, rollingChunks, safeMax);
    if (parts.length === 0) return null;
    return new Blob(parts, { type: chosenMime || 'video/webm' });
  };

  const stop = (): void => {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {}
    }
    recorder = null;
    initChunk = null;
    rollingChunks = [];
    onBufferTick?.(0);
  };

  return { start, captureBlob, getBufferedSeconds, stop };
}

export function downloadClipBlob(blob: Blob, prefix = 'cakma-clip'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${stamp}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
