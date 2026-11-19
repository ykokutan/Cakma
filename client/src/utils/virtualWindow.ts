export interface VirtualWindowInput {
  totalCount: number;
  scrollTop: number;
  viewportHeight: number;
  estimatedRowHeight?: number;
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
