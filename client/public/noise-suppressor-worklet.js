// Real-Time 3-Band Split-Band Spectral Noise Suppressor AudioWorklet (48 kHz off-main-thread)
class SpectralNoiseSuppressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.profile = 'balanced';
    this.aggressiveness = 0.85;
    this.minGainFloor = 0.12;
    this.speechBias = 1.35;
    this.hangoverFramesConfig = 48;
    this.highBandBoost = 1.08;
    this.voiceGateDb = -52;
    this.noiseFloor = 0.0025;
    this.lowNoiseFloor = 0.0018;
    this.midNoiseFloor = 0.0015;
    this.highNoiseFloor = 0.0012;
    this.currentGain = 1.0;
    this.lowGain = 1.0;
    this.midGain = 1.0;
    this.highGain = 1.0;
    this.hangoverFrames = 0;
    this.hpX1 = [];
    this.hpY1 = [];
    this.lpLowY1 = [];
    this.lpHighY1 = [];
    this.bandLow = [];
    this.bandMid = [];
    this.bandHigh = [];
    this.telemetryCounter = 0;
    this.prevFilteredSample = 0;

    this.port.onmessage = (event) => {
      const data = event?.data || {};
      if (typeof data.enabled === 'boolean') {
        this.enabled = data.enabled;
      }
      if (typeof data.profile === 'string' && data.profile) {
        this.profile = data.profile;
      }
      if (typeof data.aggressiveness === 'number' && Number.isFinite(data.aggressiveness)) {
        this.aggressiveness = Math.max(0.2, Math.min(1.0, data.aggressiveness));
      }
      if (typeof data.minGainFloor === 'number' && Number.isFinite(data.minGainFloor)) {
        this.minGainFloor = Math.max(0.02, Math.min(0.4, data.minGainFloor));
      }
      if (typeof data.speechBias === 'number' && Number.isFinite(data.speechBias)) {
        this.speechBias = Math.max(0.9, Math.min(2.2, data.speechBias));
      }
      if (typeof data.hangoverFrames === 'number' && Number.isFinite(data.hangoverFrames)) {
        this.hangoverFramesConfig = Math.max(16, Math.min(120, Math.round(data.hangoverFrames)));
      }
      if (typeof data.highBandBoost === 'number' && Number.isFinite(data.highBandBoost)) {
        this.highBandBoost = Math.max(0.8, Math.min(2.5, data.highBandBoost));
      }
      if (typeof data.voiceGateDb === 'number' && Number.isFinite(data.voiceGateDb)) {
        this.voiceGateDb = Math.max(-80, Math.min(-20, data.voiceGateDb));
      }
    };
  }

  ensureChannelBuffers(channels, frameCount) {
    while (this.hpX1.length < channels) {
      this.hpX1.push(0);
      this.hpY1.push(0);
      this.lpLowY1.push(0);
      this.lpHighY1.push(0);
    }
    for (let ch = 0; ch < channels; ch++) {
      if (!this.bandLow[ch] || this.bandLow[ch].length !== frameCount) {
        this.bandLow[ch] = new Float32Array(frameCount);
        this.bandMid[ch] = new Float32Array(frameCount);
        this.bandHigh[ch] = new Float32Array(frameCount);
      }
    }
  }

  static toGainReductionDb(gain) {
    if (!(gain > 1e-4)) return -60;
    const rounded = Math.round(Math.min(0, 20 * Math.log10(gain)) * 10) / 10;
    return rounded === 0 ? 0 : rounded;
  }

  static adaptBandFloor(currentFloor, bandRms, quietFrame, spectralHissHigh) {
    let next = currentFloor;
    if (quietFrame || bandRms < currentFloor * 1.45) {
      next = currentFloor * 0.96 + bandRms * 0.04;
    } else if (bandRms < currentFloor * 3.0 && spectralHissHigh) {
      next = currentFloor * 0.992 + bandRms * 0.008;
    }
    return Math.max(0.00018, Math.min(0.025, next));
  }

  static computeBandTarget(bandRms, bandFloor, aggressiveness, gateOpen, minGainFloor, speechBias) {
    const refFloor = Math.max(1e-6, bandFloor * speechBias);
    const snr = bandRms / refFloor;
    if (!gateOpen) {
      return Math.max(minGainFloor, Math.min(speechBias < 1.3 ? 0.52 : 0.34, snr * 0.28));
    }
    if (snr >= 2.2) return 1.0;
    const wiener = 1.0 - aggressiveness * Math.min(0.85, refFloor / Math.max(1e-6, bandRms));
    return Math.max(minGainFloor, Math.min(1.0, wiener));
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;

    const channels = Math.min(input.length, output.length);
    const frameCount = input[0].length;
    this.ensureChannelBuffers(channels, frameCount);

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
      this.emitTelemetry(rms, false, 0, { low: 0, mid: 0, high: 0 });
      return true;
    }

    // 1. Apply 80 Hz 1st-order high-pass filter and split into 3 complementary bands:
    // low (<300 Hz, alphaLow=0.9615), mid (300 Hz..3.4 kHz), high (>3.4 kHz, alphaHigh=0.6408) at 48 kHz
    const hpAlpha = 0.9896;
    const alphaLow = 0.9615;
    const oneMinusLow = 1.0 - alphaLow;
    const alphaHigh = 0.6408;
    const oneMinusHigh = 1.0 - alphaHigh;

    let sumSq = 0;
    let lowSq = 0;
    let midSq = 0;
    let highSq = 0;
    let diffSq = 0;
    let peak = 0;

    for (let ch = 0; ch < channels; ch++) {
      const inBuf = input[ch];
      const lowBuf = this.bandLow[ch];
      const midBuf = this.bandMid[ch];
      const highBuf = this.bandHigh[ch];

      let x1 = this.hpX1[ch];
      let y1 = this.hpY1[ch];
      let lpLow = this.lpLowY1[ch];
      let lpHigh = this.lpHighY1[ch];

      for (let i = 0; i < frameCount; i++) {
        const x = inBuf[i];
        const y = hpAlpha * (y1 + x - x1);
        x1 = x;
        y1 = y;

        lpLow = alphaLow * lpLow + oneMinusLow * y;
        lpHigh = alphaHigh * lpHigh + oneMinusHigh * y;

        const low = lpLow;
        const mid = lpHigh - lpLow;
        const high = y - lpHigh;

        lowBuf[i] = low;
        midBuf[i] = mid;
        highBuf[i] = high;

        if (ch === 0) {
          sumSq += y * y;
          lowSq += low * low;
          midSq += mid * mid;
          highSq += high * high;
          const absY = y < 0 ? -y : y;
          if (absY > peak) peak = absY;
          const d = y - this.prevFilteredSample;
          diffSq += d * d;
          this.prevFilteredSample = y;
        }
      }

      this.hpX1[ch] = x1;
      this.hpY1[ch] = y1;
      this.lpLowY1[ch] = lpLow;
      this.lpHighY1[ch] = lpHigh;
    }

    const invFrames = 1 / Math.max(1, frameCount);
    const rms = Math.sqrt(sumSq * invFrames);
    const lowRms = Math.sqrt(lowSq * invFrames);
    const midRms = Math.sqrt(midSq * invFrames);
    const highRms = Math.sqrt(highSq * invFrames);
    const hfRms = Math.sqrt(diffSq * invFrames);
    const spectralHissRatio = rms > 1e-6 ? Math.min(2.0, hfRms / rms) : 0;

    // 2. Adaptive full-band & per-band noise floors
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
      this.hangoverFrames = this.hangoverFramesConfig;
      const snr = Math.min(12, rms / Math.max(1e-6, this.noiseFloor));
      targetGain = snr > 3.0 ? 1.0 : Math.max(0.4, (snr - 1) / 2.0);
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames--;
      gateOpen = true;
      targetGain = spectralHissRatio > 1.15 ? 0.62 : 0.82;
    } else {
      const floorGain = Math.max(this.minGainFloor, 1.0 - this.aggressiveness * 0.9);
      const ratio = rms / Math.max(1e-6, speechTrigger);
      targetGain = isTransientClick
        ? Math.min(0.18 / Math.max(1.0, this.highBandBoost), floorGain * 1.2)
        : Math.max(floorGain, Math.min(0.42, ratio * ratio));
    }

    const quietForFloor = !gateOpen && !isTransientClick;
    this.lowNoiseFloor = SpectralNoiseSuppressorProcessor.adaptBandFloor(
      this.lowNoiseFloor,
      lowRms,
      quietForFloor,
      false
    );
    this.midNoiseFloor = SpectralNoiseSuppressorProcessor.adaptBandFloor(
      this.midNoiseFloor,
      midRms,
      quietForFloor,
      false
    );
    this.highNoiseFloor = SpectralNoiseSuppressorProcessor.adaptBandFloor(
      this.highNoiseFloor,
      highRms,
      quietForFloor,
      spectralHissRatio > 0.9
    );

    const lowFloorMin = Math.max(this.minGainFloor, 1.0 - this.aggressiveness * 0.88);
    const midFloorMin = Math.max(this.minGainFloor * 1.2, 1.0 - this.aggressiveness * 0.72);
    const highFloorMin = Math.max(this.minGainFloor * 0.85, 1.0 - this.aggressiveness * 0.9);

    const targetLowGain = SpectralNoiseSuppressorProcessor.computeBandTarget(
      lowRms,
      this.lowNoiseFloor,
      this.aggressiveness,
      gateOpen,
      lowFloorMin,
      Math.max(1.05, this.speechBias * 1.07)
    );
    const targetMidGain = SpectralNoiseSuppressorProcessor.computeBandTarget(
      midRms,
      this.midNoiseFloor,
      this.aggressiveness * 0.78,
      gateOpen,
      midFloorMin,
      Math.max(1.0, this.speechBias * 0.9)
    );
    let targetHighGain = SpectralNoiseSuppressorProcessor.computeBandTarget(
      highRms,
      this.highNoiseFloor,
      this.aggressiveness,
      gateOpen,
      highFloorMin,
      Math.max(1.1, this.speechBias * 1.12 * this.highBandBoost)
    );
    if (isTransientClick) {
      targetHighGain = Math.min(targetHighGain, 0.22 / Math.max(1.0, this.highBandBoost));
    }

    const prevGain = this.currentGain;
    const prevLowGain = this.lowGain;
    const prevMidGain = this.midGain;
    const prevHighGain = this.highGain;

    const coeff = targetGain > prevGain ? 0.36 : 0.085;
    this.currentGain = prevGain + (targetGain - prevGain) * coeff;
    this.lowGain = prevLowGain + (targetLowGain - prevLowGain) * (targetLowGain > prevLowGain ? 0.35 : 0.1);
    this.midGain = prevMidGain + (targetMidGain - prevMidGain) * (targetMidGain > prevMidGain ? 0.4 : 0.11);
    this.highGain = prevHighGain + (targetHighGain - prevHighGain) * (targetHighGain > prevHighGain ? 0.35 : 0.1);

    const spikeClamp = !gateOpen ? Math.max(0.02, speechTrigger * 0.7) : 1.0;
    const dEnv = (this.currentGain - prevGain) / frameCount;
    const dLow = (this.lowGain - prevLowGain) / frameCount;
    const dMid = (this.midGain - prevMidGain) / frameCount;
    const dHigh = (this.highGain - prevHighGain) / frameCount;

    for (let ch = 0; ch < channels; ch++) {
      const lowBuf = this.bandLow[ch];
      const midBuf = this.bandMid[ch];
      const highBuf = this.bandHigh[ch];
      const outBuf = output[ch];
      for (let i = 0; i < frameCount; i++) {
        const gEnv = prevGain + dEnv * i;
        const gLow = prevLowGain + dLow * i;
        const gMid = prevMidGain + dMid * i;
        const gHigh = prevHighGain + dHigh * i;
        let sample = (lowBuf[i] * gLow + midBuf[i] * gMid + highBuf[i] * gHigh) * gEnv;
        if (!gateOpen && Math.abs(sample) > spikeClamp) {
          sample = Math.sign(sample) * spikeClamp;
        }
        outBuf[i] = sample;
      }
    }

    const effectiveMidGain = Math.max(1e-4, this.midGain * this.currentGain);
    const gainReductionDb = SpectralNoiseSuppressorProcessor.toGainReductionDb(effectiveMidGain);
    const bandSuppression = {
      low: SpectralNoiseSuppressorProcessor.toGainReductionDb(Math.max(1e-4, this.lowGain * this.currentGain)),
      mid: gainReductionDb,
      high: SpectralNoiseSuppressorProcessor.toGainReductionDb(Math.max(1e-4, this.highGain * this.currentGain)),
    };
    this.emitTelemetry(rms, gateOpen, gainReductionDb, bandSuppression);

    return true;
  }

  emitTelemetry(rms, gateOpen, gainReductionDb, bandSuppression) {
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
      bandSuppression,
    });
  }
}

registerProcessor('spectral-noise-suppressor', SpectralNoiseSuppressorProcessor);
