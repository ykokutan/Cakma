import { useSyncExternalStore } from 'react';
import type { DirectCallQualityStats } from '../types';

const EMPTY_TYPING: string[] = [];

interface PresenceStateSnapshot {
  typingUsers: Record<string, string[]>;
  directCallQuality: DirectCallQualityStats | null;
}

let state: PresenceStateSnapshot = {
  typingUsers: {},
  directCallQuality: null,
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

export function setChannelTypingState(channelId: string, username: string, isTyping: boolean): void {
  if (!channelId || !username) return;
  const existing = state.typingUsers[channelId] || [];
  if (isTyping) {
    if (existing.includes(username)) return;
    state = {
      ...state,
      typingUsers: {
        ...state.typingUsers,
        [channelId]: [...existing, username],
      },
    };
    notify();
    return;
  }
  if (!existing.includes(username)) return;
  const nextList = existing.filter((u) => u !== username);
  const nextTyping = { ...state.typingUsers };
  if (nextList.length === 0) {
    delete nextTyping[channelId];
  } else {
    nextTyping[channelId] = nextList;
  }
  state = {
    ...state,
    typingUsers: nextTyping,
  };
  notify();
}

export function clearAllTypingUsers(): void {
  if (Object.keys(state.typingUsers).length === 0) return;
  state = {
    ...state,
    typingUsers: {},
  };
  notify();
}

export function getTypingUsersForChannel(channelId?: string | null): string[] {
  if (!channelId) return EMPTY_TYPING;
  const list = state.typingUsers[channelId];
  return list && list.length > 0 ? list : EMPTY_TYPING;
}

export function useTypingUsers(channelId?: string | null): string[] {
  return useSyncExternalStore(
    subscribe,
    () => getTypingUsersForChannel(channelId),
    () => EMPTY_TYPING
  );
}

export function setDirectCallQualitySnapshot(stats: DirectCallQualityStats | null): void {
  if (state.directCallQuality === stats) return;
  if (
    state.directCallQuality &&
    stats &&
    state.directCallQuality.rttMs === stats.rttMs &&
    state.directCallQuality.packetLossPct === stats.packetLossPct &&
    state.directCallQuality.bitrateKbps === stats.bitrateKbps &&
    state.directCallQuality.fps === stats.fps &&
    state.directCallQuality.width === stats.width &&
    state.directCallQuality.height === stats.height &&
    state.directCallQuality.pathType === stats.pathType &&
    state.directCallQuality.inputTransport === stats.inputTransport
  ) {
    return;
  }
  state = {
    ...state,
    directCallQuality: stats,
  };
  notify();
}

export function getDirectCallQualitySnapshot(): DirectCallQualityStats | null {
  return state.directCallQuality;
}

export function useDirectCallQuality(): DirectCallQualityStats | null {
  return useSyncExternalStore(subscribe, getDirectCallQualitySnapshot, getDirectCallQualitySnapshot);
}
