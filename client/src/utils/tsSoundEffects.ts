// TeamSpeak-style synthesized audio cues & Web Audio chime generator

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

export type SoundPackType = 'modern' | 'classic-ts' | 'minimal' | 'silent';

export function getActiveSoundPack(): SoundPackType {
  try {
    const saved = localStorage.getItem('dsp_soundPack');
    if (saved === 'modern' || saved === 'classic-ts' || saved === 'minimal' || saved === 'silent') {
      return saved;
    }
  } catch {}
  return 'modern';
}

// 1. Synthesize TeamSpeak & System Audio Chimes
export function playTeamSpeakChime(
  type: 'join' | 'leave' | 'mute' | 'unmute' | 'whisper' | 'levelup' | 'ptt_on' | 'ptt_off',
  overridePack?: SoundPackType
) {
  try {
    const pack = overridePack || getActiveSoundPack();
    if (pack === 'silent') return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const pitchFactor = pack === 'classic-ts' ? 1.15 : pack === 'minimal' ? 0.85 : 1.0;
    const volFactor = pack === 'minimal' ? 0.65 : 1.0;

    if (type === 'ptt_on') {
      osc.type = pack === 'classic-ts' ? 'square' : 'sine';
      osc.frequency.setValueAtTime(1180 * pitchFactor, now);
      gain.gain.setValueAtTime(0.08 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (type === 'ptt_off') {
      osc.type = pack === 'classic-ts' ? 'square' : 'sine';
      osc.frequency.setValueAtTime(820 * pitchFactor, now);
      gain.gain.setValueAtTime(0.06 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'join') {
      // Pleasant rising two-tone chime
      osc.type = pack === 'classic-ts' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(440 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(880 * pitchFactor, now + 0.15);
      gain.gain.setValueAtTime(0.15 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'leave') {
      // Falling two-tone chime
      osc.type = pack === 'classic-ts' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(660 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(330 * pitchFactor, now + 0.2);
      gain.gain.setValueAtTime(0.15 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'mute') {
      // Short low double click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(350 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(200 * pitchFactor, now + 0.1);
      gain.gain.setValueAtTime(0.2 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'unmute') {
      // Short rising bright click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(600 * pitchFactor, now + 0.1);
      gain.gain.setValueAtTime(0.2 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'whisper') {
      // Subtle two-tone radio blip
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800 * pitchFactor, now);
      osc.frequency.setValueAtTime(1000 * pitchFactor, now + 0.08);
      gain.gain.setValueAtTime(0.18 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'levelup') {
      // Arpeggio victory chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
      gain.gain.setValueAtTime(0.2 * volFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  } catch (err) {
    console.warn('Audio chime play failed:', err);
  }
}

// 1b. 1-on-1 Call Ringtone & Ringback Tone (supports ringtonePack: modern | classic | minimal | silent)
export type RingtonePack = 'modern' | 'classic' | 'minimal' | 'silent';

export function playCallRingtone(mode: 'incoming' | 'outgoing', explicitPack?: RingtonePack) {
  try {
    const pack: RingtonePack =
      explicitPack || ((localStorage.getItem('dc_ringtone_pack') as RingtonePack) || 'modern');
    if (pack === 'silent') return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (mode === 'outgoing') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(pack === 'minimal' ? 520 : 440, now);
      osc2.frequency.setValueAtTime(pack === 'minimal' ? 520 : 480, now);
      gain.gain.setValueAtTime(pack === 'minimal' ? 0.05 : 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (pack === 'minimal' ? 0.45 : 0.85));
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.85);
      osc2.stop(now + 0.85);
    } else if (pack === 'classic') {
      // Classic telephone double-ring trill
      [0, 0.25].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now + offset);
        gain.gain.setValueAtTime(0.14, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.18);
      });
    } else if (pack === 'minimal') {
      // Soft single chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Modern melodic chime (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.14;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // ignore autoplay restriction
  }
}

// 2. Web Speech API for TeamSpeak-style voice announcements
export function speakAnnouncement(text: string) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.05;
    utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

// 3. Desktop Web Push Notifications
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }
  return false;
}

export function sendDesktopNotification(title: string, body: string, _icon = '💬') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'discord-ts-notification',
    });
  } catch {}
}
