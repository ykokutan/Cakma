import { describe, it, expect } from 'vitest';
import { computeStatusExpiryTimestamp, isStatusExpired } from '../statusExpiry';

describe('statusExpiry helpers', () => {
  it('returns null for never preset', () => {
    expect(computeStatusExpiryTimestamp('never', 1000)).toBeNull();
  });

  it('computes 30m and 1h offsets accurately', () => {
    const now = 1_700_000_000_000;
    expect(computeStatusExpiryTimestamp('30m', now)).toBe(now + 30 * 60 * 1000);
    expect(computeStatusExpiryTimestamp('1h', now)).toBe(now + 60 * 60 * 1000);
    expect(computeStatusExpiryTimestamp('4h', now)).toBe(now + 4 * 60 * 60 * 1000);
  });

  it('detects expired vs active timestamps', () => {
    expect(isStatusExpired(null, 5000)).toBe(false);
    expect(isStatusExpired(6000, 5000)).toBe(false);
    expect(isStatusExpired(5000, 5000)).toBe(true);
    expect(isStatusExpired(4000, 5000)).toBe(true);
  });
});
