import { useSyncExternalStore } from 'react';

const DRAFTS_STORAGE_KEY = 'cakma_channel_drafts_v1';

type DraftsMap = Record<string, string>;

let draftsSnapshot: DraftsMap = loadInitialDrafts();
const listeners = new Set<() => void>();

function loadInitialDrafts(): DraftsMap {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const clean: DraftsMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim().length > 0) {
          clean[k] = v;
        }
      }
      return clean;
    }
  } catch {}
  return {};
}

function persistDrafts(map: DraftsMap) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (Object.keys(map).length === 0) {
      window.localStorage.removeItem(DRAFTS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

function emitChange() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDraft(targetKey: string | null | undefined): string {
  if (!targetKey) return '';
  return draftsSnapshot[targetKey] || '';
}

export function setDraft(targetKey: string | null | undefined, text: string): void {
  if (!targetKey) return;
  const trimmedEmpty = !text || text.trim().length === 0;
  if (trimmedEmpty) {
    clearDraft(targetKey);
    return;
  }
  const capped = text.slice(0, 4000);
  if (draftsSnapshot[targetKey] === capped) return;
  draftsSnapshot = { ...draftsSnapshot, [targetKey]: capped };
  persistDrafts(draftsSnapshot);
  emitChange();
}

export function clearDraft(targetKey: string | null | undefined): void {
  if (!targetKey || !(targetKey in draftsSnapshot)) return;
  const next = { ...draftsSnapshot };
  delete next[targetKey];
  draftsSnapshot = next;
  persistDrafts(draftsSnapshot);
  emitChange();
}

export function resetAllDrafts(): void {
  draftsSnapshot = {};
  persistDrafts(draftsSnapshot);
  emitChange();
}

export function useChannelDrafts(): DraftsMap {
  return useSyncExternalStore(subscribe, () => draftsSnapshot);
}
