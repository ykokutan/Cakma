import { describe, it, expect } from 'vitest';
import { extractWaveformPeaksFromSamples } from '../audioWaveform';

describe('audioWaveform', () => {
  it('returns flat low peaks for empty or silent Float32Array', () => {
    const empty = extractWaveformPeaksFromSamples(new Float32Array(0), 24);
    expect(empty).toHaveLength(24);
    expect(empty.every((v) => v === 25)).toBe(true);

    const silent = extractWaveformPeaksFromSamples(new Float32Array(128), 16);
    expect(silent).toHaveLength(16);
    expect(silent.every((v) => v === 18)).toBe(true);
  });

  it('normalizes peaks proportionally and clamps between 14 and 100', () => {
    const samples = new Float32Array(40);
    // 4 blocks of 10 samples: [0.25, 0.5, 1.0, 0.01]
    for (let i = 0; i < 10; i++) samples[i] = 0.25;
    for (let i = 10; i < 20; i++) samples[i] = -0.5;
    for (let i = 20; i < 30; i++) samples[i] = 1.0;
    for (let i = 30; i < 40; i++) samples[i] = 0.01;

    const peaks = extractWaveformPeaksFromSamples(samples, 4);
    expect(peaks).toEqual([25, 50, 100, 14]);
  });

  it('clamps requested bar counts to [4, 64]', () => {
    expect(extractWaveformPeaksFromSamples(new Float32Array([0.5, -0.5]), 1)).toHaveLength(4);
    expect(extractWaveformPeaksFromSamples(new Float32Array([0.5, -0.5]), 200)).toHaveLength(64);
  });
});
