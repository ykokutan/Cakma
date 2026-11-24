import { describe, it, expect } from 'vitest';
import { computeVariableVirtualWindow, computeVirtualWindow } from '../virtualWindow';

describe('virtualWindow', () => {
  it('disables virtualization below threshold (<= 80)', () => {
    const heights = new Array(80).fill(60);
    const res = computeVariableVirtualWindow({
      itemHeights: heights,
      scrollTop: 500,
      viewportHeight: 400,
    });
    expect(res).toEqual({
      virtualized: false,
      startIndex: 0,
      endIndex: 80,
      paddingTop: 0,
      paddingBottom: 0,
    });
  });

  it('keeps fixed-height computeVirtualWindow compatible above threshold', () => {
    const res = computeVirtualWindow({
      totalCount: 120,
      scrollTop: 1520,
      viewportHeight: 600,
      estimatedRowHeight: 76,
      overscan: 5,
    });
    expect(res.virtualized).toBe(true);
    expect(res.startIndex).toBe(15);
    expect(res.endIndex).toBe(33);
    expect(res.paddingTop).toBe(15 * 76);
    expect(res.paddingBottom).toBe((120 - 33) * 76);
  });

  it('computes exact offsets across mixed 40px and 320px variable rows', () => {
    // 100 rows alternating/mixed: first 20 are 40px (800px), rows 20..29 are 320px (3200px), rest 50px
    const heights: number[] = [];
    for (let i = 0; i < 100; i++) {
      if (i < 20) heights.push(40);
      else if (i < 30) heights.push(320);
      else heights.push(50);
    }

    // Total height = 20*40 + 10*320 + 70*50 = 800 + 3200 + 3500 = 7500px
    // scrollTop at 1120px falls inside row 21 (800 + 320 = 1120)
    const res = computeVariableVirtualWindow({
      itemHeights: heights,
      scrollTop: 1120,
      viewportHeight: 640, // covers up to 1760 -> rows 21..22 (1120..1760)
      overscan: 2,
    });

    expect(res.virtualized).toBe(true);
    expect(res.startIndex).toBe(19);
    expect(res.endIndex).toBe(25);
    // paddingTop = sum(heights[0..18]) = 19 * 40 = 760
    expect(res.paddingTop).toBe(760);
    // rendered sum = heights[19..24] = 40 + 5*320 = 1640 -> paddingBottom = 7500 - 760 - 1640 = 5100
    expect(res.paddingBottom).toBe(5100);
  });
});
