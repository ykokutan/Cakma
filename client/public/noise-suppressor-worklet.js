// Real-Time Spectral / Adaptive Noise Suppressor AudioWorklet (48 kHz off-main-thread)
class SpectralNoiseSuppressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.aggressiveness = 0.85;
    this.voiceGateDb = -52;
    this.noiseFloor = 0.0025;
    this.currentGain = 1.0;
    this.hangoverFrames = 0;
    this.hpX1 = [];
    this.hpY1 = [];
    this.telemetryCounter = 0;
    this.prevFilteredSample = 0;

    this.port.onmessage = (event) => {
      const data = event?.data || {};
      if (typeof data.enabled === 'boolean') {
        this.enabled = data.enabled;
      }
      if (typeof data.aggressiveness === 'number' && Number.isFinite(data.aggressiveness)) {
        this.aggressiveness = Math.max(0.2, Math.min(1.0, data.aggressiveness));
      }
      if (typeof data.voiceGateDb === 'number' && Number.isFinite(data.voiceGateDb)) {
        this.voiceGateDb = Math.max(-80, Math.min(-20, data.voiceGateDb));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;

    const channels = Math.min(input.length, output.length);
    const frameCount = input[0].length;

    while (this.hpX1.length < channels) {
      this.hpX1.push(0);
      this.hpY1.push(0);
    }

    if (!this.enabled) {
      let sumSq = 0;
      for (let ch = 0; ch < channels; ch++) {
        output[ch].set(input[ch]);
      }
      const primary = input[0];
      for (let i = 0; i < frameCount; i++) {
        sumSq += primary[i] * primary[i];
      }
      const rms = Math.sqrt(sumSq / Math.max(1, frameCount));
      this.emitTelemetry(rms, false, 0);
      return true;
    }

    // 1. Apply 80 Hz 1st-order high-pass filter across channels (removes HVAC rumble & mic bump)
    // At 48 kHz: alpha = 1 / (1 + 2*pi*80/48000) ≈ 0.9896
    const hpAlpha = 0.9896;
    let sumSq = 0;
    let diffSq = 0;
    let peak = 0;

    for (let ch = 0; ch < channels; ch++) {
      const inBuf = input[ch];
      const outBuf = output[ch];
      let x1 = this.hpX1[ch];
      let y1 = this.hpY1[ch];

      for (let i = 0; i < frameCount; i++) {
        const x = inBuf[i];
        const y = hpAlpha * (y1 + x - x1);
        x1 = x;
        y1 = y;
        outBuf[i] = y;

        if (ch === 0) {
          sumSq += y * y;
          const absY = y < 0 ? -y : y;
          if (absY > peak) peak = absY;
          const d = y - this.prevFilteredSample;
          diffSq += d * d;
          this.prevFilteredSample = y;
        }
      }

      this.hpX1[ch] = x1;
      this.hpY1[ch] = y1;
    }

    const rms = Math.sqrt(sumSq / Math.max(1, frameCount));
    const hfRms = Math.sqrt(diffSq / Math.max(1, frameCount));
    // Voiced speech concentrates energy below ~2 kHz so normalized 1st-diff ratio stays lower than hiss
    const spectralHissRatio = rms > 1e-6 ? Math.min(2.0, hfRms / rms) : 0;

    // 2. Adaptive noise floor estimator (stationary hiss adapts slowly downward/upward during quiet frames)
    if (rms < this.noiseFloor * 1.45) {
      this.noiseFloor = this.noiseFloor * 0.96 + rms * 0.04;
    } else if (rms < this.noiseFloor * 3.0 && spectralHissRatio > 0.9) {
      this.noiseFloor = this.noiseFloor * 0.992 + rms * 0.008;
    }
    this.noiseFloor = Math.max(0.00035, Math.min(0.025, this.noiseFloor));

    const gateMinRms = Math.pow(10, this.voiceGateDb / 20);
    const adaptiveTrigger = this.noiseFloor * (2.6 - this.aggressiveness * 0.65);
    const speechTrigger = Math.max(gateMinRms, adaptiveTrigger);

    // Crest factor detects short impulsive keyboard clicks vs sustained speech
    const crestFactor = rms > 1e-6 ? peak / rms : 1.0;
    const isTransientClick = rms < speechTrigger * 1.5 && crestFactor > 4.2 && spectralHissRatio > 0.85;

    let targetGain = 1.0;
    let gateOpen = false;

    if (!isTransientClick && rms >= speechTrigger) {
      gateOpen = true;
      this.hangoverFrames = 48; // ~128 ms smooth voice tail
      const snr = Math.min(12, rms / Math.max(1e-6, this.noiseFloor));
      targetGain = snr > 3.0 ? 1.0 : Math.max(0.4, (snr - 1) / 2.0);
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames--;
      gateOpen = true;
      // Gently attenuate high-frequency hiss in trailing quiet intervals
      targetGain = spectralHissRatio > 1.15 ? 0.58 : 0.78;
    } else {
      const floorGain = 1.0 - this.aggressiveness * 0.9;
      const ratio = rms / Math.max(1e-6, speechTrigger);
      targetGain = isTransientClick
        ? Math.min(0.18, floorGain * 1.2)
        : Math.max(floorGain, Math.min(0.42, ratio * ratio));
    }

    // Smooth per-sample envelope gain + soft transient spike clamping when gate is closed
    const coeff = targetGain > this.currentGain ? 0.36 : 0.085;
    const prevGain = this.currentGain;
    this.currentGain = prevGain + (targetGain - prevGain) * coeff;

    const spikeClamp = !gateOpen ? Math.max(0.02, speechTrigger * 0.7) : 1.0;

    for (let ch = 0; ch < channels; ch++) {
      const buf = output[ch];
      for (let i = 0; i < frameCount; i++) {
        const interp = prevGain + ((this.currentGain - prevGain) * i) / frameCount;
        let sample = buf[i] * interp;
        if (!gateOpen && Math.abs(sample) > spikeClamp) {
          sample = Math.sign(sample) * spikeClamp;
        }
        buf[i] = sample;
      }
    }

    const gainReductionDb =
      this.currentGain > 1e-4 ? Math.round(Math.min(0, 20 * Math.log10(this.currentGain)) * 10) / 10 : -60;
    this.emitTelemetry(rms, gateOpen, gainReductionDb);

    return true;
  }

  emitTelemetry(rms, gateOpen, gainReductionDb) {
    this.telemetryCounter++;
    if (this.telemetryCounter < 18) return; // ~20.8 Hz at 48 kHz (128 samples/quantum)
    this.telemetryCounter = 0;
    const db = Math.round(Math.max(-90, 20 * Math.log10(Math.max(rms, 1e-5))) * 10) / 10;
    const noiseFloorDb =
      Math.round(Math.max(-90, 20 * Math.log10(Math.max(this.noiseFloor, 1e-5))) * 10) / 10;
    this.port.postMessage({
      type: 'level',
      db,
      noiseFloorDb,
      gateOpen,
      gainReductionDb,
    });
  }
}

registerProcessor('spectral-noise-suppressor', SpectralNoiseSuppressorProcessor);
