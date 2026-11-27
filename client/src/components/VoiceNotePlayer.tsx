import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, Download, Sparkles, Loader2, Languages } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { decodeAudioWaveformPeaks } from '../utils/audioWaveform';
import {
  detectSpokenLangHint,
  translateCaptionClientSide,
  type CaptionLangCode,
} from '../utils/liveCaptionHelpers';
import { transcribeVoiceNoteUrl } from '../utils/voiceNoteTranscriber';

const DEFAULT_WAVEFORM = [30, 60, 45, 90, 75, 40, 80, 100, 65, 85, 45, 95, 70, 50, 80, 40, 60, 35, 70, 55, 85, 60, 45, 35];

interface VoiceNotePlayerProps {
  url: string;
  durationSeconds?: number;
  authorName?: string;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ url, durationSeconds, authorName }) => {
  const { language } = useSocket();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds && Number.isFinite(durationSeconds) ? durationSeconds : 0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [waveformHeights, setWaveformHeights] = useState<number[]>(DEFAULT_WAVEFORM);
  const [transcript, setTranscript] = useState<string>('');
  const [translatedTranscript, setTranslatedTranscript] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [transcriptError, setTranscriptError] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setWaveformHeights(DEFAULT_WAVEFORM);
    void decodeAudioWaveformPeaks(url, 24).then((peaks) => {
      if (active && peaks && peaks.length > 0) {
        setWaveformHeights(peaks);
      }
    });
    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    let isProbingDuration = false;

    const updateFiniteDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        return true;
      }
      return false;
    };

    audio.onloadedmetadata = () => {
      if (!updateFiniteDuration() && audio.duration === Infinity) {
        // Chromium MediaRecorder WebM blobs often report Infinity duration until seeked to end
        isProbingDuration = true;
        audio.currentTime = 1e7;
      }
    };

    audio.ondurationchange = () => {
      if (updateFiniteDuration() && isProbingDuration) {
        isProbingDuration = false;
        audio.currentTime = 0;
        setCurrentTime(0);
      }
    };

    audio.ontimeupdate = () => {
      if (isProbingDuration) {
        if (updateFiniteDuration()) {
          isProbingDuration = false;
          audio.currentTime = 0;
          setCurrentTime(0);
        }
        return;
      }
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audio.pause();
      audio.src = '';
    };
  }, [url]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        if (Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
          setDuration(audioRef.current.duration);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) {
      togglePlay();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
    if (!isPlaying) {
      audio.playbackRate = playbackRate;
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const toggleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const total = Math.floor(secs);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 && Number.isFinite(duration)
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;

  const handleTranscribe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTranscribing) return;
    if (transcript) {
      setTranscript('');
      setTranslatedTranscript('');
      setTranscriptError('');
      return;
    }
    setIsTranscribing(true);
    setTranscriptError('');
    setModelProgress(null);
    try {
      const result = await transcribeVoiceNoteUrl(url, (pct) => {
        setModelProgress(pct < 100 ? pct : null);
      });
      if (!result) {
        setTranscriptError('Konuşma metni çıkarılamadı (sessiz kayıt olabilir).');
      } else {
        setTranscript(result);
      }
    } catch (err) {
      setTranscriptError(err instanceof Error ? err.message : 'Ses çözümlenemedi.');
    } finally {
      setIsTranscribing(false);
      setModelProgress(null);
    }
  };

  const handleTranslateTranscript = async () => {
    if (!transcript || isTranslating) return;
    if (translatedTranscript) {
      setTranslatedTranscript('');
      return;
    }
    setIsTranslating(true);
    try {
      const targetLang = (['tr', 'en', 'de', 'ru', 'fr'].includes(language) ? language : 'tr') as CaptionLangCode;
      const res = await translateCaptionClientSide(transcript, targetLang);
      if (res?.translatedText) {
        setTranslatedTranscript(res.translatedText);
      } else {
        const hint = detectSpokenLangHint(transcript);
        if (hint === targetLang) {
          setTranscriptError('Metin zaten seçili arayüz dilinde.');
        } else {
          setTranscriptError('Çeviri şu anda alınamadı.');
        }
      }
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="max-w-sm my-1 space-y-1.5">
      <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-gradient-to-r from-blue-600/20 via-indigo-600/15 to-purple-600/20 border border-blue-500/30 backdrop-blur-md shadow-lg">
        {/* Play / Pause Pill Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition shadow-md shadow-blue-500/30 shrink-0"
          title={isPlaying ? 'Durdur' : 'Sesli Mesajı Dinle'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        {/* Waveform & Progress */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-semibold text-blue-200 gap-2">
            <span className="flex items-center gap-1 truncate">
              <Mic className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">{authorName ? `${authorName} (Sesli Not)` : 'Sesli Not'}</span>
            </span>
            <span className="font-mono text-white/70 shrink-0">
              {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '--:--'}
            </span>
          </div>

          {/* Dynamic Waveform Bars (Click to seek) */}
          <div
            className="h-6 flex items-center gap-0.5 relative py-0.5 cursor-pointer"
            onClick={handleSeek}
            title="İlerletmek için tıklayın"
          >
            {waveformHeights.map((h, i) => {
              const barProgress = ((i + 0.5) / waveformHeights.length) * 100;
              const isPlayed = progressPercent > 0 && barProgress <= progressPercent;
              return (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    isPlayed
                      ? 'bg-blue-400 shadow-sm shadow-blue-400/50'
                      : 'bg-white/20'
                  } ${isPlaying && isPlayed ? 'animate-pulse' : ''}`}
                />
              );
            })}
          </div>
        </div>

        {/* Speed Rate Pill (1x / 1.5x / 2x) */}
        <button
          type="button"
          onClick={toggleRate}
          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[10px] font-bold transition shrink-0"
          title="Oynatma Hızını Değiştir"
        >
          {playbackRate}x
        </button>

        {/* AI Whisper Transcription Button */}
        <button
          type="button"
          onClick={handleTranscribe}
          disabled={isTranscribing}
          className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 border transition shrink-0 ${
            transcript
              ? 'bg-indigo-500/30 border-indigo-400/50 text-indigo-200'
              : 'bg-white/10 hover:bg-indigo-500/25 border-white/15 text-white/85 hover:text-white'
          }`}
          title={transcript ? 'Metni Gizle' : 'Whisper AI ile İstemcide Yazıya Dök'}
        >
          {isTranscribing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 text-amber-300" />
          )}
          <span className="hidden sm:inline">
            {isTranscribing
              ? modelProgress !== null
                ? `%${modelProgress}`
                : 'Çözülüyor'
              : transcript
              ? 'Gizle'
              : 'Yazıya Dök'}
          </span>
        </button>

        {/* Download Option */}
        <a
          href={url}
          download="sesli-not.webm"
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition shrink-0"
          title="Ses Kaydını İndir"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>

      {transcriptError && (
        <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/30 text-[11px] text-amber-200">
          {transcriptError}
        </div>
      )}

      {transcript && (
        <div className="p-2.5 rounded-xl bg-black/35 border border-white/10 space-y-1.5 text-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="text-white/90 leading-relaxed">{translatedTranscript || transcript}</p>
            <button
              type="button"
              onClick={handleTranslateTranscript}
              disabled={isTranslating}
              className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-sky-200 inline-flex items-center gap-1 shrink-0 transition"
              title={translatedTranscript ? 'Orijinali Göster' : 'Arayüz Diline Çevir'}
            >
              <Languages className="w-3 h-3" />
              <span>{isTranslating ? '...' : translatedTranscript ? 'Orijinal' : 'Çevir'}</span>
            </button>
          </div>
          {translatedTranscript && (
            <p className="text-[11px] italic text-white/50">Orijinal: {transcript}</p>
          )}
        </div>
      )}
    </div>
  );
};
