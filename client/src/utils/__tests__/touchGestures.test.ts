import { describe, it, expect } from 'vitest';
import {
  evaluateHorizontalSwipe,
  shouldOpenDrawerFromEdge,
  shouldCloseDrawerSwipe,
} from '../touchGestures';

describe('touchGestures', () => {
  it('detects right and left horizontal swipes cleanly', () => {
    const right = evaluateHorizontalSwipe(12, 200, 110, 212);
    expect(right.triggered).toBe(true);
    expect(right.direction).toBe('right');

    const left = evaluateHorizontalSwipe(220, 200, 120, 210);
    expect(left.triggered).toBe(true);
    expect(left.direction).toBe('left');
  });

  it('rejects vertical scrolling and short micro-taps', () => {
    const verticalScroll = evaluateHorizontalSwipe(50, 100, 120, 240);
    expect(verticalScroll.triggered).toBe(false);
    expect(verticalScroll.direction).toBe('none');

    const shortTap = evaluateHorizontalSwipe(10, 10, 30, 12);
    expect(shortTap.triggered).toBe(false);
  });

  it('gates edge-drawer opening by startX threshold and allows left swipe to close', () => {
    const fromEdge = evaluateHorizontalSwipe(18, 300, 110, 305);
    expect(shouldOpenDrawerFromEdge(18, fromEdge, 36)).toBe(true);
    expect(shouldOpenDrawerFromEdge(120, fromEdge, 36)).toBe(false);

    const closing = evaluateHorizontalSwipe(190, 300, 90, 302);
    expect(shouldCloseDrawerSwipe(closing)).toBe(true);
  });
});
