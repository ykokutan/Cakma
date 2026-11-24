import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IceRecoveryController, isPolitePeer } from '../webrtcIceRecovery';

describe('webrtcIceRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes isPolitePeer deterministically without symmetry ties for distinct IDs', () => {
    expect(isPolitePeer('user-b', 'user-a')).toBe(true);
    expect(isPolitePeer('user-a', 'user-b')).toBe(false);
    expect(isPolitePeer('same', 'same')).toBe(false);
  });

  it('applies exponential backoff and stops after maxAttempts', async () => {
    const onRestart = vi.fn().mockResolvedValue(undefined);
    const controller = new IceRecoveryController({
      localId: 'alice',
      peerId: 'zoe', // localId < peerId -> impolite (0ms polite delay)
      maxAttempts: 3,
      baseDelayMs: 1000,
      politeDelayMs: 500,
      onRestart,
    });

    // Attempt 1 on disconnected -> 1000ms
    controller.handleStateChange('disconnected');
    await vi.advanceTimersByTimeAsync(999);
    expect(onRestart).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(controller.getAttempts()).toBe(1);

    // Attempt 2 on disconnected -> 2000ms
    controller.handleStateChange('disconnected');
    await vi.advanceTimersByTimeAsync(1999);
    expect(onRestart).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onRestart).toHaveBeenCalledTimes(2);
    expect(controller.getAttempts()).toBe(2);

    // Attempt 3 on failed -> 1000 * 2^(2-1) = 2000ms
    controller.handleStateChange('failed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(onRestart).toHaveBeenCalledTimes(3);
    expect(controller.getAttempts()).toBe(3);

    // Attempt 4 should be ignored
    controller.handleStateChange('failed');
    await vi.advanceTimersByTimeAsync(10000);
    expect(onRestart).toHaveBeenCalledTimes(3);
  });

  it('resets attempts when connection recovers to connected', async () => {
    const onRestart = vi.fn().mockResolvedValue(undefined);
    const controller = new IceRecoveryController({
      localId: 'zoe',
      peerId: 'alice', // polite -> +1500ms on attempt 0
      maxAttempts: 3,
      baseDelayMs: 2000,
      politeDelayMs: 1500,
      onRestart,
    });

    controller.handleStateChange('failed');
    await vi.advanceTimersByTimeAsync(1499);
    expect(onRestart).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(controller.getAttempts()).toBe(1);

    controller.handleStateChange('connected');
    expect(controller.getAttempts()).toBe(0);

    controller.handleStateChange('failed');
    await vi.advanceTimersByTimeAsync(1500);
    expect(onRestart).toHaveBeenCalledTimes(2);
    expect(controller.getAttempts()).toBe(1);
  });

  it('cancels scheduled restarts upon dispose()', async () => {
    const onRestart = vi.fn().mockResolvedValue(undefined);
    const controller = new IceRecoveryController({
      localId: 'a',
      peerId: 'b',
      maxAttempts: 3,
      baseDelayMs: 2000,
      politeDelayMs: 1500,
      onRestart,
    });

    controller.handleStateChange('disconnected');
    controller.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(onRestart).not.toHaveBeenCalled();
  });
});
