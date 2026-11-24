export interface VirtualWindowInput {
  totalCount: number;
  scrollTop: number;
  viewportHeight: number;
  estimatedRowHeight?: number;
  overscan?: number;
}

export interface VariableVirtualWindowInput {
  itemHeights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}

export interface VirtualWindowResult {
  virtualized: boolean;
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
}

const VIRTUALIZE_THRESHOLD = 80;

export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindowResult {
  const totalCount = Math.max(0, Math.floor(input.totalCount || 0));
  if (totalCount <= VIRTUALIZE_THRESHOLD || input.viewportHeight <= 0) {
    return {
      virtualized: false,
      startIndex: 0,
      endIndex: totalCount,
      paddingTop: 0,
      paddingBottom: 0,
    };
  }

  const rowHeight = Math.max(24, Number(input.estimatedRowHeight) || 76);
  const overscan = Math.max(2, Math.floor(Number(input.overscan) || 10));
  const scrollTop = Math.max(0, Number(input.scrollTop) || 0);
  const viewportHeight = Math.max(100, Number(input.viewportHeight) || 600);

  const visibleStart = Math.floor(scrollTop / rowHeight);
  const visibleEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight);

  const startIndex = Math.max(0, visibleStart - overscan);
  const endIndex = Math.min(totalCount, visibleEnd + overscan);

  return {
    virtualized: true,
    startIndex,
    endIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, (totalCount - endIndex) * rowHeight),
  };
}

/**
 * Computes a virtualized render window over variable-height items using cumulative prefix offsets
 * and binary search so tall attachments/embeds do not cause scroll jumps.
 */
export function computeVariableVirtualWindow(input: VariableVirtualWindowInput): VirtualWindowResult {
  const count = Array.isArray(input.itemHeights) ? input.itemHeights.length : 0;
  if (count <= VIRTUALIZE_THRESHOLD || input.viewportHeight <= 0) {
    return {
      virtualized: false,
      startIndex: 0,
      endIndex: count,
      paddingTop: 0,
      paddingBottom: 0,
    };
  }

  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let i = 0; i < count; i++) {
    const h = Math.max(24, Number(input.itemHeights[i]) || 72);
    offsets[i + 1] = offsets[i] + h;
  }

  const totalHeight = offsets[count];
  const overscan = Math.max(2, Math.floor(Number(input.overscan) || 10));
  const scrollTop = Math.max(0, Math.min(totalHeight, Number(input.scrollTop) || 0));
  const viewportHeight = Math.max(100, Number(input.viewportHeight) || 600);
  const viewportBottom = scrollTop + viewportHeight;

  // Binary search first item where offsets[i + 1] > scrollTop
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= scrollTop) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const visibleStart = lo;

  // Binary search first item where offsets[i] >= viewportBottom
  let loEnd = visibleStart;
  let hiEnd = count;
  while (loEnd < hiEnd) {
    const mid = (loEnd + hiEnd) >> 1;
    if (offsets[mid] < viewportBottom) {
      loEnd = mid + 1;
    } else {
      hiEnd = mid;
    }
  }
  const visibleEnd = Math.min(count, Math.max(visibleStart + 1, loEnd));

  const startIndex = Math.max(0, visibleStart - overscan);
  const endIndex = Math.min(count, visibleEnd + overscan);

  return {
    virtualized: true,
    startIndex,
    endIndex,
    paddingTop: offsets[startIndex],
    paddingBottom: Math.max(0, totalHeight - offsets[endIndex]),
  };
}
