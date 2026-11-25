import { describe, it, expect } from 'vitest';
import { NOISE_DSP_PROFILE_CONFIGS, normalizeNoiseDspProfile } from '../noiseDspProfiles';

describe('noiseDspProfiles', () => {
  it('normalizes known and unknown profile names safely', () => {
    expect(normalizeNoiseDspProfile('studio')).toBe('studio');
    expect(normalizeNoiseDspProfile('balanced')).toBe('balanced');
    expect(normalizeNoiseDspProfile('aggressive')).toBe('aggressive');
    expect(normalizeNoiseDspProfile('keyboard_guard')).toBe('keyboard_guard');
    expect(normalizeNoiseDspProfile('unknown')).toBe('balanced');
    expect(normalizeNoiseDspProfile(null)).toBe('balanced');
  });

  it('provides valid DSP parameters across all 4 profiles with elevated transient clamping on keyboard_guard', () => {
    const profiles = Object.values(NOISE_DSP_PROFILE_CONFIGS);
    expect(profiles).toHaveLength(4);
    for (const cfg of profiles) {
      expect(cfg.aggressiveness).toBeGreaterThanOrEqual(0.2);
      expect(cfg.aggressiveness).toBeLessThanOrEqual(1.0);
      expect(cfg.minGainFloor).toBeGreaterThan(0);
      expect(cfg.speechBias).toBeGreaterThanOrEqual(1.0);
      expect(cfg.hangoverFrames).toBeGreaterThanOrEqual(16);
    }
    expect(NOISE_DSP_PROFILE_CONFIGS.keyboard_guard.highBandBoost).toBeGreaterThan(
      NOISE_DSP_PROFILE_CONFIGS.studio.highBandBoost
    );
  });
});
