import { describe, it, expect, beforeEach } from 'vitest';
import {
  setVoiceMicVolume,
  getVoiceMicVolume,
  resetVoiceMetrics,
} from '../../context/VoiceMetricsContext';

describe('VoiceMetricsContext external store', () => {
  beforeEach(() => {
    resetVoiceMetrics();
  });

  it('starts at zero and updates when forced or transitioning from zero', () => {
    expect(getVoiceMicVolume()).toBe(0);
    setVoiceMicVolume(45);
    expect(getVoiceMicVolume()).toBe(45);
  });

  it('clamps out-of-range values and resets cleanly to zero', () => {
    setVoiceMicVolume(150, true);
    expect(getVoiceMicVolume()).toBe(100);
    setVoiceMicVolume(-25, true);
    expect(getVoiceMicVolume()).toBe(0);
    setVoiceMicVolume(60, true);
    resetVoiceMetrics();
    expect(getVoiceMicVolume()).toBe(0);
  });
});
