export interface NormalizerOptions {
  targetDb?: number;
  noiseGateDb?: number;
  minGain?: number;
  maxGain?: number;
  attackCoeff?: number;
  releaseCoeff?: number;
}

/**
 * Computes root-mean-square energy of a time-domain float audio buffer.
 */
export function computeRmsFromTimeDomain(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (Number.isFinite(s)) {
      sumSq += s * s;
    }
  }
  return Math.sqrt(sumSq / samples.length);
}

/**
 * Smoothly adjusts speaker gain toward a target RMS loudness while holding/decaying
 * gently during silence so background noise is not amplified.
 */
export function computeNormalizerGain(
  currentGain: number,
  rmsLinear: number,
  opts?: NormalizerOptions
): number {
  const targetDb = opts?.targetDb ?? -18;
  const noiseGateDb = opts?.noiseGateDb ?? -48;
  const minGain = opts?.minGain ?? 0.45;
  const maxGain = opts?.maxGain ?? 2.2;
  const attackCoeff = opts?.attackCoeff ?? 0.35;
  const releaseCoeff = opts?.releaseCoeff ?? 0.08;

  const safeCurrent =
    Number.isFinite(currentGain) && currentGain > 0
      ? Math.max(minGain, Math.min(maxGain, currentGain))
      : 1.0;

  const gateLinear = Math.pow(10, noiseGateDb / 20);
  if (!Number.isFinite(rmsLinear) || rmsLinear <= gateLinear) {
    // Gently relax toward unity instead of boosting silence or noise floor
    const relaxed = safeCurrent + (1.0 - safeCurrent) * 0.02;
    return Math.max(minGain, Math.min(maxGain, relaxed));
  }

  const targetLinear = Math.pow(10, targetDb / 20);
  const desired = Math.max(minGain, Math.min(maxGain, targetLinear / rmsLinear));
  const coeff = desired < safeCurrent ? attackCoeff : releaseCoeff;
  const next = safeCurrent + (desired - safeCurrent) * coeff;
  return Math.max(minGain, Math.min(maxGain, next));
}
