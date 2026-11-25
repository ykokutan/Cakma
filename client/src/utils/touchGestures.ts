export interface SwipeEvaluation {
  direction: 'left' | 'right' | 'none';
  dx: number;
  dy: number;
  triggered: boolean;
}

export function evaluateHorizontalSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  minDistance = 56,
  maxVerticalRatio = 0.65
): SwipeEvaluation {
  const dx = endX - startX;
  const dy = endY - startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { direction: 'none', dx: 0, dy: 0, triggered: false };
  }

  if (absDx < minDistance || absDy > absDx * maxVerticalRatio) {
    return { direction: 'none', dx, dy, triggered: false };
  }

  return {
    direction: dx > 0 ? 'right' : 'left',
    dx,
    dy,
    triggered: true,
  };
}

export function shouldOpenDrawerFromEdge(
  startX: number,
  swipe: SwipeEvaluation,
  edgePx = 36
): boolean {
  return startX <= edgePx && swipe.triggered && swipe.direction === 'right';
}

export function shouldCloseDrawerSwipe(swipe: SwipeEvaluation): boolean {
  return swipe.triggered && swipe.direction === 'left';
}
