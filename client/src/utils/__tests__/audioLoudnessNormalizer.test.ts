import { describe, it, expect } from 'vitest';
import { computeNormalizerGain, computeRmsFromTimeDomain } from '../audioLoudnessNormalizer';

describe('audioLoudnessNormalizer', () => {
  it('computes accurate RMS values for time-domain buffers', () => {
    expect(computeRmsFromTimeDomain(new Float32Array(0))).toBe(0);
    const flat = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    expect(computeRmsFromTimeDomain(flat)).toBeCloseTo(0.5, 5);
  });

  it('boosts quiet speech toward target loudness without exceeding maxGain', () => {
    let gain = 1.0;
    const quietRms = 0.02; // well above -48dB (~0.00398), well below -18dB (~0.1259)
    for (let i = 0; i < 25; i++) {
      gain = computeNormalizerGain(gain, quietRms);
    }
    expect(gain).toBeGreaterThan(1.5);
    expect(gain).toBeLessThanOrEqual(2.2);

    // Very quiet (yet above gate) should clamp cleanly at maxGain
    let maxed = 1.0;
    for (let i = 0; i < 85; i++) {
      maxed = computeNormalizerGain(maxed, 0.005);
    }
    expect(maxed).toBeCloseTo(2.2, 2);
    expect(maxed).toBeLessThanOrEqual(2.2);
  });

  it('attenuates loud speech quickly without dropping below minGain', () => {
    let gain = 1.0;
    const loudRms = 0.8;
    gain = computeNormalizerGain(gain, loudRms);
    expect(gain).toBeLessThan(1.0);
    for (let i = 0; i < 20; i++) {
      gain = computeNormalizerGain(gain, loudRms);
    }
    expect(gain).toBeCloseTo(0.45, 2);
    expect(gain).toBeGreaterThanOrEqual(0.45);
  });

  it('does not pump gain upward when input is below the silence gate', () => {
    const startGain = 1.6;
    const silentGain = computeNormalizerGain(startGain, 0.0002);
    expect(silentGain).toBeLessThan(startGain);
    expect(silentGain).toBeGreaterThan(1.0);

    const zeroRmsGain = computeNormalizerGain(1.0, 0);
    expect(zeroRmsGain).toBeCloseTo(1.0, 5);
  });
});
