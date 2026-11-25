export const MIC_ECHO_DELAY_OPTIONS = [0, 500, 1500] as const;

export function clampEchoDelayMs(ms: number): number {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(2000, Math.round(numeric)));
}

export interface MicEchoLoopbackHandle {
  setDelayMs: (ms: number) => void;
  setVolume: (v: number) => void;
  stop: () => void;
}

export function createMicEchoLoopback(
  stream: MediaStream,
  delayMs: number,
  volume = 0.85
): MicEchoLoopbackHandle {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  if (!AudioCtx) {
    return {
      setDelayMs: () => {},
      setVolume: () => {},
      stop: () => {},
    };
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const delayNode = ctx.createDelay(2.0);
  const gainNode = ctx.createGain();

  delayNode.delayTime.value = clampEchoDelayMs(delayMs) / 1000;
  gainNode.gain.value = Math.max(0, Math.min(1.5, volume));

  source.connect(delayNode);
  delayNode.connect(gainNode);
  gainNode.connect(ctx.destination);
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  return {
    setDelayMs: (ms: number) => {
      try {
        delayNode.delayTime.setValueAtTime(clampEchoDelayMs(ms) / 1000, ctx.currentTime);
      } catch {}
    },
    setVolume: (v: number) => {
      try {
        gainNode.gain.setValueAtTime(Math.max(0, Math.min(1.5, v)), ctx.currentTime);
      } catch {}
    },
    stop: () => {
      try {
        source.disconnect();
        delayNode.disconnect();
        gainNode.disconnect();
      } catch {}
      ctx.close().catch(() => {});
    },
  };
}
