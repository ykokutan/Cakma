import { beforeEach, describe, expect, it } from 'vitest';
import { acknowledgePeerKeyChange, evaluatePeerKeyTrust } from '../e2eeTofu';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('e2eeTofu (1-on-1 DM Key Change Detection)', () => {
  beforeEach(() => {
    const mockStorage = makeMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  it('transitions from missing -> first_seen -> trusted -> changed -> acknowledged trusted', () => {
    expect(evaluatePeerKeyTrust('byyko', '').status).toBe('missing');

    const keyV1 = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' });
    const first = evaluatePeerKeyTrust('Byyko', keyV1);
    expect(first.status).toBe('first_seen');

    const second = evaluatePeerKeyTrust('byyko', keyV1);
    expect(second.status).toBe('trusted');

    const keyV2 = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'xyz', y: 'uvw' });
    const rotated = evaluatePeerKeyTrust('byyko', keyV2);
    expect(rotated.status).toBe('changed');
    expect(rotated.previousKey).toBe(keyV1);
    expect(rotated.currentKey).toBe(keyV2);

    // Repeating check before acknowledgement keeps warning active
    expect(evaluatePeerKeyTrust('byyko', keyV2).status).toBe('changed');

    acknowledgePeerKeyChange('Byyko', keyV2);
    expect(evaluatePeerKeyTrust('byyko', keyV2).status).toBe('trusted');
  });
});
