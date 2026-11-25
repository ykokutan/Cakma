export type NoiseDspProfile = 'studio' | 'balanced' | 'aggressive' | 'keyboard_guard' | 'voice_isolation';

export interface NoiseDspProfileConfig {
  id: NoiseDspProfile;
  label: string;
  description: string;
  aggressiveness: number;
  minGainFloor: number;
  speechBias: number;
  hangoverFrames: number;
  highBandBoost: number;
}

export const NOISE_DSP_PROFILE_CONFIGS: Record<NoiseDspProfile, NoiseDspProfileConfig> = {
  studio: {
    id: 'studio',
    label: 'Stüdyo',
    description: 'Doğal tonlama ve en düşük ses müdahalesi; sessiz odalar ve kondenser mikrofonlar için.',
    aggressiveness: 0.45,
    minGainFloor: 0.25,
    speechBias: 1.1,
    hangoverFrames: 64,
    highBandBoost: 1.0,
  },
  balanced: {
    id: 'balanced',
    label: 'Dengeli',
    description: 'Günlük kullanım için fan ve oda uğultusunu dengeli biçimde azaltır.',
    aggressiveness: 0.78,
    minGainFloor: 0.12,
    speechBias: 1.35,
    hangoverFrames: 48,
    highBandBoost: 1.08,
  },
  aggressive: {
    id: 'aggressive',
    label: 'Agresif',
    description: 'Kalabalık ve yüksek gürültülü ortamlarda maksimum arka plan bastırma uygular.',
    aggressiveness: 0.96,
    minGainFloor: 0.05,
    speechBias: 1.65,
    hangoverFrames: 36,
    highBandBoost: 1.25,
  },
  keyboard_guard: {
    id: 'keyboard_guard',
    label: 'Klavye Koruması',
    description: 'Mekanik klavye ve fare tıklama darbelerini yüksek frekans geçici filtresiyle keser.',
    aggressiveness: 0.88,
    minGainFloor: 0.08,
    speechBias: 1.45,
    hangoverFrames: 42,
    highBandBoost: 1.65,
  },
  voice_isolation: {
    id: 'voice_isolation',
    label: 'Ses İzolasyonu (Gelişmiş DSP)',
    description: 'İnsan vokal bandına odaklanan derin spektral kapılama ve maksimum arka plan yalıtımı uygular.',
    aggressiveness: 0.98,
    minGainFloor: 0.03,
    speechBias: 1.75,
    hangoverFrames: 40,
    highBandBoost: 1.45,
  },
};

export function normalizeNoiseDspProfile(raw?: string | null): NoiseDspProfile {
  if (
    raw === 'studio' ||
    raw === 'balanced' ||
    raw === 'aggressive' ||
    raw === 'keyboard_guard' ||
    raw === 'voice_isolation'
  ) {
    return raw;
  }
  return 'balanced';
}
