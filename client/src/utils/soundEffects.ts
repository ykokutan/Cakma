// Web Audio API Synthesized Soundboard & Notification Engine
// 100% self-contained, high performance, zero external MP3 dependencies

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export interface SoundboardItem {
  id: string;
  name: string;
  emoji: string;
  category: 'meme' | 'gaming' | 'reaction' | 'alert';
  description: string;
}

export const SOUNDBOARD_PRESETS: SoundboardItem[] = [
  { id: 'airhorn', name: 'Airhorn MLG', emoji: '📢', category: 'meme', description: 'Klasik 3 tonlu efsane airhorn efekti' },
  { id: 'bruh', name: 'Bruh Anı', emoji: '🗿', category: 'meme', description: 'Derin bruh reaksiyon sesi' },
  { id: 'badumtss', name: 'Ba-Dum Tss!', emoji: '🥁', category: 'reaction', description: 'Espri sonrası davul & zil vuruşu' },
  { id: 'victory', name: 'GG Zafer', emoji: '🏆', category: 'gaming', description: '8-Bit nostaljik zafer melodisi' },
  { id: 'coin', name: 'Super Coin', emoji: '🪙', category: 'gaming', description: 'Kristal berraklığında altın toplama sesi' },
  { id: 'tada', name: 'Ta-Daaa!', emoji: '🎉', category: 'reaction', description: 'Kutlama ve sürpriz fanfarı' },
  { id: 'quack', name: 'Ördek Quack', emoji: '🦆', category: 'meme', description: 'Komik ördek vaklaması' },
  { id: 'pewpew', name: 'Lazer Blast', emoji: '🔫', category: 'gaming', description: 'Retro bilim kurgu lazer atışı' },
  { id: 'notification', name: 'Ping / Bildirim', emoji: '🔔', category: 'alert', description: 'Yumuşak modern bildirim sesi' }
];

export function playSynthesizedSound(soundId: string, volume: number = 0.8) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.1, Math.min(1, volume)), now);
    masterGain.connect(ctx.destination);

    switch (soundId) {
      case 'airhorn': {
        // Multi-oscillator brass blast
        const freqs = [466.16, 587.33, 698.46]; // Bb4, D5, F5
        freqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          
          // Slight glide
          osc.frequency.setValueAtTime(freq * 0.95, now);
          osc.frequency.exponentialRampToValueAtTime(freq, now + 0.05);

          // Pulse envelope
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
          gain.gain.setValueAtTime(0.22, now + 0.35);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.7);
        });
        break;
      }

      case 'bruh': {
        // Formant filtered vocal sweep
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.45);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(650, now);
        filter.frequency.exponentialRampToValueAtTime(350, now + 0.45);
        filter.Q.setValueAtTime(4.0, now);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.55);
        break;
      }

      case 'badumtss': {
        // Kick
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kickOsc.frequency.setValueAtTime(150, now);
        kickOsc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        kickGain.gain.setValueAtTime(0.5, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        kickOsc.connect(kickGain);
        kickGain.connect(masterGain);
        kickOsc.start(now);
        kickOsc.stop(now + 0.15);

        // Snare at now + 0.18
        const snareOsc = ctx.createOscillator();
        const snareGain = ctx.createGain();
        snareOsc.type = 'triangle';
        snareOsc.frequency.setValueAtTime(220, now + 0.18);
        snareGain.gain.setValueAtTime(0.4, now + 0.18);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        snareOsc.connect(snareGain);
        snareGain.connect(masterGain);
        snareOsc.start(now + 0.18);
        snareOsc.stop(now + 0.35);

        // Cymbal at now + 0.36
        const bufferSize = ctx.sampleRate * 0.4;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        const cymbalFilter = ctx.createBiquadFilter();
        cymbalFilter.type = 'highpass';
        cymbalFilter.frequency.setValueAtTime(6000, now + 0.36);
        const cymbalGain = ctx.createGain();
        cymbalGain.gain.setValueAtTime(0.4, now + 0.36);
        cymbalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
        whiteNoise.connect(cymbalFilter);
        cymbalFilter.connect(cymbalGain);
        cymbalGain.connect(masterGain);
        whiteNoise.start(now + 0.36);
        whiteNoise.stop(now + 0.8);
        break;
      }

      case 'victory': {
        // 8-bit arpeggio: C5 -> E5 -> G5 -> C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);

          gain.gain.setValueAtTime(0, now + idx * 0.1);
          gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.1 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + (idx === 3 ? 0.4 : 0.09));

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.45);
        });
        break;
      }

      case 'coin': {
        // B5 -> E6
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now); // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0.3, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      }

      case 'tada': {
        const chord = [440, 554.37, 659.25, 880]; // A major
        chord.forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.75);
        });
        break;
      }

      case 'quack': {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(210, now + 0.25);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.linearRampToValueAtTime(1500, now + 0.1);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.25);
        filter.Q.setValueAtTime(6.0, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }

      case 'pewpew': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.22);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.26);
        break;
      }

      case 'notification':
      default: {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.07); // A5

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
    }
  } catch (err) {
    console.warn('[SoundEffects] Playback failed:', err);
  }
}
