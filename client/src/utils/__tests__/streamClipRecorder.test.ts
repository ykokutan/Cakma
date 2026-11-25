import { describe, it, expect } from 'vitest';
import { trimRollingClipChunks } from '../streamClipRecorder';

describe('streamClipRecorder helpers', () => {
  it('preserves init header chunk and caps total rolling chunks to maxSeconds', () => {
    const chunks = Array.from({ length: 40 }, (_, i) => `c${i + 1}`);
    const trimmed = trimRollingClipChunks('hdr', chunks, 30);
    expect(trimmed.length).toBe(30);
    expect(trimmed[0]).toBe('hdr');
    expect(trimmed[1]).toBe('c12');
    expect(trimmed[29]).toBe('c40');
  });

  it('handles empty or small buffers and missing initChunk gracefully', () => {
    expect(trimRollingClipChunks<string>(null, [], 30)).toEqual([]);
    expect(trimRollingClipChunks('hdr', ['a', 'b'], 30)).toEqual(['hdr', 'a', 'b']);
    expect(trimRollingClipChunks<string>(null, ['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd']);
  });
});
