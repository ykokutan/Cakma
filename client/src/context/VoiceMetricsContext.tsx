import { useSyncExternalStore } from 'react';

let currentMicVolume = 0;
let lastNotifyTs = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/**
 * Throttled external store for 60 FPS voice metering so SocketContext consumers
 * do not re-render on every animation frame.
 */
export function setVoiceMicVolume(level: number, force = false) {
  const clamped = Math.max(0, Math.min(100, Math.round(level)));
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const isZeroEdge = (clamped === 0 && currentMicVolume !== 0) || (clamped > 0 && currentMicVolume === 0);

  if (!force && !isZeroEdge) {
    if (now - lastNotifyTs < 65) return;
    if (Math.abs(clamped - currentMicVolume) < 2) return;
  }

  if (clamped === currentMicVolume) return;
  currentMicVolume = clamped;
  lastNotifyTs = now;
  notify();
}

export function getVoiceMicVolume(): number {
  return currentMicVolume;
}

export function resetVoiceMetrics() {
  lastNotifyTs = 0;
  if (currentMicVolume !== 0) {
    currentMicVolume = 0;
    notify();
  }
}

function subscribeMicVolume(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMicVolumeLevel(): number {
  return useSyncExternalStore(subscribeMicVolume, getVoiceMicVolume, getVoiceMicVolume);
}
