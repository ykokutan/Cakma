import { useCallback, useEffect, useRef, useState } from 'react';
import { computeNormalizerGain, computeRmsFromTimeDomain } from '../utils/audioLoudnessNormalizer';

export interface UserAudioEq {
  bass: number;
  treble: number;
  normalize: boolean;
}

export interface RemoteAudioEqChain {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  analyser: AnalyserNode;
  normalizerGain: GainNode;
  gain: GainNode;
  normalizerEnabled: boolean;
  currentNormGain: number;
}

export interface UseRemoteAudioEqNormalizerOptions {
  audioElementsRef: React.MutableRefObject<Map<string, HTMLAudioElement>>;
  outputVolume: number;
  isDeafened: boolean;
  userVolumes: Record<string, number>;
  userLocalMutes: Record<string, boolean>;
}

export function useRemoteAudioEqNormalizer({
  audioElementsRef,
  outputVolume,
  isDeafened,
  userVolumes,
  userLocalMutes,
}: UseRemoteAudioEqNormalizerOptions) {
  const [userAudioEq, setUserAudioEqState] = useState<Record<string, UserAudioEq>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('cakma_user_audio_eq') : null;
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const userAudioEqRef = useRef<Record<string, UserAudioEq>>(userAudioEq);
  userAudioEqRef.current = userAudioEq;

  const [globalLoudnessNormalize, setGlobalLoudnessNormalizeState] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('cakma_global_loudness_normalize') === 'true';
    } catch {
      return false;
    }
  });
  const globalLoudnessNormalizeRef = useRef<boolean>(globalLoudnessNormalize);
  globalLoudnessNormalizeRef.current = globalLoudnessNormalize;

  const remoteAudioEqChainsRef = useRef<Map<string, RemoteAudioEqChain>>(new Map());

  const disposeRemoteAudioEqChain = useCallback((peerId: string) => {
    const chain = remoteAudioEqChainsRef.current.get(peerId);
    if (!chain) return;
    try {
      chain.source.disconnect();
      chain.ctx.close().catch(() => {});
    } catch {}
    remoteAudioEqChainsRef.current.delete(peerId);
  }, []);

  const disposeAllRemoteAudioEqChains = useCallback(() => {
    remoteAudioEqChainsRef.current.forEach((chain) => {
      try {
        chain.source.disconnect();
        chain.ctx.close().catch(() => {});
      } catch {}
    });
    remoteAudioEqChainsRef.current.clear();
  }, []);

  const applyRemoteAudioEq = useCallback(
    (peerId: string, eq: UserAudioEq) => {
      const audio = audioElementsRef.current.get(peerId);
      if (!audio || !audio.srcObject) return;
      const stream = audio.srcObject as MediaStream;
      const effectiveNormalize = Boolean(eq.normalize || globalLoudnessNormalizeRef.current);
      const isDefault = eq.bass === 0 && eq.treble === 0 && !effectiveNormalize;
      const userVol = userVolumes[peerId] ?? 100;
      const isLocallyMuted = userLocalMutes[peerId] ?? false;
      const targetGain =
        isDeafened || isLocallyMuted
          ? 0
          : Math.min(2, Math.max(0, (outputVolume / 100) * (userVol / 100)));

      if (isDefault) {
        disposeRemoteAudioEqChain(peerId);
        audio.muted = isDeafened || isLocallyMuted;
        return;
      }

      try {
        let chain = remoteAudioEqChainsRef.current.get(peerId);
        if (!chain) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx({ sampleRate: 48000 });
          const source = ctx.createMediaStreamSource(stream);
          const lowShelf = ctx.createBiquadFilter();
          lowShelf.type = 'lowshelf';
          lowShelf.frequency.value = 200;
          const highShelf = ctx.createBiquadFilter();
          highShelf.type = 'highshelf';
          highShelf.frequency.value = 3500;
          const compressor = ctx.createDynamicsCompressor();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          const normalizerGain = ctx.createGain();
          normalizerGain.gain.value = 1.0;
          const gain = ctx.createGain();
          source.connect(lowShelf);
          lowShelf.connect(highShelf);
          highShelf.connect(compressor);
          compressor.connect(analyser);
          analyser.connect(normalizerGain);
          normalizerGain.connect(gain);
          gain.connect(ctx.destination);
          chain = {
            ctx,
            source,
            lowShelf,
            highShelf,
            compressor,
            analyser,
            normalizerGain,
            gain,
            normalizerEnabled: effectiveNormalize,
            currentNormGain: 1.0,
          };
          remoteAudioEqChainsRef.current.set(peerId, chain);
        }
        chain.lowShelf.gain.value = eq.bass;
        chain.highShelf.gain.value = eq.treble;
        chain.compressor.ratio.value = effectiveNormalize ? 4 : 1;
        chain.compressor.threshold.value = effectiveNormalize ? -20 : 0;
        chain.compressor.knee.value = effectiveNormalize ? 12 : 30;
        chain.normalizerEnabled = effectiveNormalize;
        if (!effectiveNormalize) {
          chain.currentNormGain = 1.0;
          chain.normalizerGain.gain.setTargetAtTime(1.0, chain.ctx.currentTime, 0.05);
        }
        chain.gain.gain.value = targetGain;
        audio.muted = true;
      } catch {}
    },
    [audioElementsRef, disposeRemoteAudioEqChain, isDeafened, outputVolume, userVolumes, userLocalMutes]
  );

  const setGlobalLoudnessNormalize = useCallback(
    (enabled: boolean) => {
      const nextVal = Boolean(enabled);
      globalLoudnessNormalizeRef.current = nextVal;
      setGlobalLoudnessNormalizeState(nextVal);
      try {
        localStorage.setItem('cakma_global_loudness_normalize', String(nextVal));
      } catch {}
      audioElementsRef.current.forEach((_audio, peerId) => {
        const eq = userAudioEqRef.current[peerId] || { bass: 0, treble: 0, normalize: false };
        applyRemoteAudioEq(peerId, eq);
      });
    },
    [applyRemoteAudioEq, audioElementsRef]
  );

  useEffect(() => {
    let timeDomainBuf: Float32Array<ArrayBuffer> | null = null;
    const timer = window.setInterval(() => {
      if (remoteAudioEqChainsRef.current.size === 0) return;
      remoteAudioEqChainsRef.current.forEach((chain) => {
        if (!chain.normalizerEnabled) return;
        try {
          if (!timeDomainBuf || timeDomainBuf.length !== chain.analyser.fftSize) {
            timeDomainBuf = new Float32Array(new ArrayBuffer(chain.analyser.fftSize * 4));
          }
          chain.analyser.getFloatTimeDomainData(timeDomainBuf);
          const rms = computeRmsFromTimeDomain(timeDomainBuf);
          const nextGain = computeNormalizerGain(chain.currentNormGain, rms);
          chain.currentNormGain = nextGain;
          chain.normalizerGain.gain.setTargetAtTime(nextGain, chain.ctx.currentTime, 0.08);
        } catch {}
      });
    }, 150);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const setUserAudioEq = useCallback(
    (userId: string, patch: Partial<UserAudioEq>) => {
      setUserAudioEqState((prev) => {
        const current = prev[userId] || { bass: 0, treble: 0, normalize: false };
        const updated: UserAudioEq = {
          bass: patch.bass !== undefined ? Math.max(-12, Math.min(12, patch.bass)) : current.bass,
          treble: patch.treble !== undefined ? Math.max(-12, Math.min(12, patch.treble)) : current.treble,
          normalize: patch.normalize !== undefined ? patch.normalize : current.normalize,
        };
        const next = { ...prev, [userId]: updated };
        try {
          localStorage.setItem('cakma_user_audio_eq', JSON.stringify(next));
        } catch {}
        applyRemoteAudioEq(userId, updated);
        return next;
      });
    },
    [applyRemoteAudioEq]
  );

  return {
    userAudioEq,
    userAudioEqRef,
    setUserAudioEqState,
    setUserAudioEq,
    globalLoudnessNormalize,
    globalLoudnessNormalizeRef,
    setGlobalLoudnessNormalize,
    applyRemoteAudioEq,
    disposeRemoteAudioEqChain,
    disposeAllRemoteAudioEqChains,
  };
}
