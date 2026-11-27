import { useSyncExternalStore } from 'react';

export type NetworkConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export interface NetworkMetricsSnapshot {
  ping: number;
  jitter: number;
  packetLoss: number;
  pingHistory: number[];
  connectionState: NetworkConnectionState;
}

let snapshot: NetworkMetricsSnapshot = {
  ping: 0,
  jitter: 0,
  packetLoss: 0,
  pingHistory: [],
  connectionState: 'connected',
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NetworkMetricsSnapshot {
  return snapshot;
}

export function setNetworkPing(nextPing: number): void {
  const safe = Number.isFinite(nextPing) ? Math.max(0, Math.round(nextPing)) : 0;
  if (snapshot.ping === safe) return;
  snapshot = { ...snapshot, ping: safe };
  notify();
}

export function setNetworkTelemetry(patch: {
  ping?: number;
  jitter?: number;
  packetLoss?: number;
  appendPing?: number;
}): void {
  const nextPing =
    typeof patch.ping === 'number' && Number.isFinite(patch.ping)
      ? Math.max(0, Math.round(patch.ping))
      : snapshot.ping;
  const nextJitter =
    typeof patch.jitter === 'number' && Number.isFinite(patch.jitter)
      ? Math.max(0, patch.jitter)
      : snapshot.jitter;
  const nextPacketLoss =
    typeof patch.packetLoss === 'number' && Number.isFinite(patch.packetLoss)
      ? Math.max(0, Math.min(100, patch.packetLoss))
      : snapshot.packetLoss;
  const nextHistory =
    typeof patch.appendPing === 'number' && Number.isFinite(patch.appendPing)
      ? [...snapshot.pingHistory.slice(-29), Math.max(0, Math.round(patch.appendPing))]
      : snapshot.pingHistory;

  if (
    nextPing === snapshot.ping &&
    nextJitter === snapshot.jitter &&
    nextPacketLoss === snapshot.packetLoss &&
    nextHistory === snapshot.pingHistory
  ) {
    return;
  }

  snapshot = {
    ...snapshot,
    ping: nextPing,
    jitter: nextJitter,
    packetLoss: nextPacketLoss,
    pingHistory: nextHistory,
  };
  notify();
}

export function setNetworkConnectionState(nextState: NetworkConnectionState): void {
  if (snapshot.connectionState === nextState) return;
  snapshot = { ...snapshot, connectionState: nextState };
  notify();
}

export function getNetworkMetricsSnapshot(): NetworkMetricsSnapshot {
  return snapshot;
}

export function useNetworkPing(): number {
  return useSyncExternalStore(subscribe, () => getSnapshot().ping);
}

export function useNetworkConnectionState(): NetworkConnectionState {
  return useSyncExternalStore(subscribe, () => getSnapshot().connectionState);
}

export function useNetworkTelemetry(): NetworkMetricsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}
