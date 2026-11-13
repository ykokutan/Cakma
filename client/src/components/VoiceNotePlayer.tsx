import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, Download } from 'lucide-react';

interface VoiceNotePlayerProps {
  url: string;
  durationSeconds?: number;
  authorName?: string;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ url, durationSeconds, authorName }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds && Number.isFinite(durationSeconds) ? durationSeconds : 0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

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

  // 18 Waveform bars with static heights
  const waveformHeights = [30, 60, 45, 90, 75, 40, 80, 100, 65, 85, 45, 95, 70, 50, 80, 40, 60, 35];
  const progressPercent = duration > 0 && Number.isFinite(duration)
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-gradient-to-r from-blue-600/20 via-indigo-600/15 to-purple-600/20 border border-blue-500/30 max-w-sm backdrop-blur-md shadow-lg my-1">
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
  );
};
