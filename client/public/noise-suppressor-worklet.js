// Real-Time Spectral / Adaptive Noise Suppressor AudioWorklet (48 kHz off-main-thread)
class SpectralNoiseSuppressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.aggressiveness = 0.85;
    this.noiseFloor = 0.0025;
    this.currentGain = 1.0;
    this.hangoverFrames = 0;

    this.port.onmessage = (event) => {
      const data = event?.data || {};
      if (typeof data.enabled === 'boolean') {
        this.enabled = data.enabled;
      }
      if (typeof data.aggressiveness === 'number') {
        this.aggressiveness = Math.max(0.2, Math.min(1.0, data.aggressiveness));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;

    const channels = Math.min(input.length, output.length);
    const frameCount = input[0].length;

    if (!this.enabled) {
      for (let ch = 0; ch < channels; ch++) {
        output[ch].set(input[ch]);
      }
      return true;
    }

    // Measure frame RMS across primary channel(s)
    let sumSq = 0;
    for (let i = 0; i < frameCount; i++) {
      const s = input[0][i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, frameCount));

    // Adaptive noise floor estimator: tracks upward slowly only during quiet windows, decays smoothly
    if (rms < this.noiseFloor * 1.45) {
      this.noiseFloor = this.noiseFloor * 0.96 + rms * 0.04;
    } else if (rms < this.noiseFloor * 3.0) {
      this.noiseFloor = this.noiseFloor * 0.996 + rms * 0.004;
    }
    this.noiseFloor = Math.max(0.0004, Math.min(0.025, this.noiseFloor));

    const speechTrigger = this.noiseFloor * (2.6 - this.aggressiveness * 0.6);
    let targetGain = 1.0;

    if (rms >= speechTrigger) {
      // Clear speech: open immediately and keep short hangover (~120ms = ~45 render quanta at 128/48k)
      this.hangoverFrames = 45;
      const snr = Math.min(12, rms / Math.max(1e-6, this.noiseFloor));
      // Soft Wiener-inspired gain smoothing on low-SNR transitions
      targetGain = snr > 3.2 ? 1.0 : Math.max(0.35, (snr - 1) / 2.2);
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames--;
      targetGain = 0.72;
    } else {
      // Background noise attenuation
      const floorGain = 1.0 - this.aggressiveness * 0.88;
      const ratio = rms / Math.max(1e-6, speechTrigger);
      targetGain = Math.max(floorGain, Math.min(0.45, ratio * ratio));
    }

    // Smooth per-sample gain envelope (fast attack, smooth release) to prevent clicks
    const coeff = targetGain > this.currentGain ? 0.35 : 0.08;
    const prevGain = this.currentGain;
    this.currentGain = prevGain + (targetGain - prevGain) * coeff;

    for (let ch = 0; ch < channels; ch++) {
      const inBuf = input[ch];
      const outBuf = output[ch];
      for (let i = 0; i < frameCount; i++) {
        const interp = prevGain + ((this.currentGain - prevGain) * i) / frameCount;
        outBuf[i] = inBuf[i] * interp;
      }
    }

    return true;
  }
}

registerProcessor('spectral-noise-suppressor', SpectralNoiseSuppressorProcessor);
