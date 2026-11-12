import React, { useState, useRef, useEffect } from 'react';
import { Radio, Play, Pause, Volume2, VolumeX, Disc3 } from 'lucide-react';

export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  streamUrl: string;
  icon: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  { id: 'lofi', name: 'Lofi Chill Gaming', genre: 'Chill / Beats', streamUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv', icon: '☕' },
  { id: 'synthwave', name: 'Synthwave & Cyberpunk', genre: 'Retro / Synth', streamUrl: 'https://ice2.somafm.com/defcon-128-mp3', icon: '🌆' },
  { id: 'ambient', name: 'Groove Salad Ambient', genre: 'Ambient / Focus', streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3', icon: '🌿' },
  { id: 'vaporwave', name: 'Vaporwave 90s Beats', genre: 'Vapor / Nostalgia', streamUrl: 'https://ice4.somafm.com/vaporwaves-128-mp3', icon: '📼' },
  { id: 'metal', name: 'Heavy Metal & Gaming', genre: 'Hard Rock / Metal', streamUrl: 'https://ice2.somafm.com/metal-128-mp3', icon: '⚡' },
];

interface VoiceRadioWidgetProps {
  channelName: string;
  onSyncState?: (state: { isPlaying: boolean; stationId: string; volume: number }) => void;
  initialState?: { isPlaying: boolean; stationId: string; volume: number };
}

export const VoiceRadioWidget: React.FC<VoiceRadioWidgetProps> = ({
  channelName,
  onSyncState,
  initialState,
}) => {
  const [isPlaying, setIsPlaying] = useState(initialState?.isPlaying || false);
  const [selectedStationId, setSelectedStationId] = useState(initialState?.stationId || 'lofi');
  const [volume, setVolume] = useState(initialState?.volume ?? 0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentStation = RADIO_STATIONS.find(s => s.id === selectedStationId) || RADIO_STATIONS[0];

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = 'anonymous';
    }

    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;

    if (isPlaying) {
      if (audio.src !== currentStation.streamUrl) {
        audio.src = currentStation.streamUrl;
      }
      audio.play().catch(err => {
        console.warn('[RadioBot] Autoplay blocked or stream error:', err);
        setHasError(true);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }

    return () => {
      audio.pause();
    };
  }, [isPlaying, currentStation, isMuted, volume]);

  const togglePlay = () => {
    setHasError(false);
    const nextPlay = !isPlaying;
    setIsPlaying(nextPlay);
    onSyncState?.({ isPlaying: nextPlay, stationId: selectedStationId, volume });
  };

  const handleStationChange = (stationId: string) => {
    setSelectedStationId(stationId);
    setHasError(false);
    onSyncState?.({ isPlaying: true, stationId, volume });
    setIsPlaying(true);
  };

  return (
    <div className="bg-slate-900/80 border border-indigo-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${isPlaying ? 'bg-gradient-to-tr from-indigo-500 to-purple-500 animate-pulse' : 'bg-slate-800'}`}>
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                Radyo / Müzik Botu
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                  BOT
                </span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              #{channelName} odasında canlı ortak müzik
            </p>
          </div>
        </div>

        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs shadow-lg transition-all transform active:scale-95 ${
            isPlaying
              ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/30'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" /> Durdur
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" /> Çal
            </>
          )}
        </button>
      </div>

      {/* Station Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {RADIO_STATIONS.map(station => {
          const isSelected = station.id === selectedStationId;
          return (
            <button
              key={station.id}
              onClick={() => handleStationChange(station.id)}
              className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-inner'
                  : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <span className="text-lg">{station.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{station.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{station.genre}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Volume & Status */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Disc3 className={`w-3.5 h-3.5 text-indigo-400 ${isPlaying ? 'animate-spin' : ''}`} />
          <span className="text-[11px] font-medium text-slate-300">
            {isPlaying ? `Çalıyor: ${currentStation.name}` : 'Müzik duraklatıldı'}
          </span>
          {hasError && (
            <span className="text-[10px] text-amber-400 font-semibold">(Bağlantı hatası)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setIsMuted(false);
              setVolume(parseFloat(e.target.value));
            }}
            className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>
    </div>
  );
};
