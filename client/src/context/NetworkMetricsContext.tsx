import { useSyncExternalStore } from 'react';

export type NetworkConnectionState = 'connected' | 'reconnecting' | 'disconnected';

interface NetworkMetricsSnapshot {
  ping: number;
  connectionState: NetworkConnectionState;
}

let snapshot: NetworkMetricsSnapshot = {
  ping: 0,
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
