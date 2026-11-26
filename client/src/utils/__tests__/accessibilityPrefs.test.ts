import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACCESSIBILITY_PREFS_KEY,
  DEFAULT_ACCESSIBILITY_PREFS,
  loadAccessibilityPrefs,
  saveAccessibilityPrefs,
} from '../accessibilityPrefs';
import { clampEchoDelayMs } from '../micEchoTester';

describe('accessibilityPrefs & micEchoTester helpers', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      key: (idx: number) => Array.from(store.keys())[idx] ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: mockStorage,
    });
  });

  it('loads default preferences when empty or malformed, and round-trips saved prefs', () => {
    expect(loadAccessibilityPrefs()).toEqual(DEFAULT_ACCESSIBILITY_PREFS);

    localStorage.setItem(ACCESSIBILITY_PREFS_KEY, '{broken-json');
    expect(loadAccessibilityPrefs()).toEqual(DEFAULT_ACCESSIBILITY_PREFS);

    saveAccessibilityPrefs({
      highContrast: true,
      colorblindStatus: true,
      narrowCompactMode: true,
    });
    expect(loadAccessibilityPrefs()).toEqual({
      highContrast: true,
      colorblindStatus: true,
      narrowCompactMode: true,
    });
  });

  it('clamps mic echo delay safely between 0ms and 2000ms', () => {
    expect(clampEchoDelayMs(-200)).toBe(0);
    expect(clampEchoDelayMs(500)).toBe(500);
    expect(clampEchoDelayMs(1500.4)).toBe(1500);
    expect(clampEchoDelayMs(9999)).toBe(2000);
    expect(clampEchoDelayMs(Number.NaN)).toBe(0);
  });
});
