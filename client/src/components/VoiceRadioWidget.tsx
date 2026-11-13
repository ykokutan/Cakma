import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Radio, Play, Pause, Volume2, VolumeX, Disc3, Youtube, Tv, ExternalLink } from 'lucide-react';
import { RadioBotState } from '../context/SocketContext';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId?: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
  getIframe?: () => HTMLIFrameElement;
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => resolve();
      document.head.appendChild(tag);
    }
    // Fallback timeout in case script is blocked
    setTimeout(resolve, 3500);
  });
  return ytApiPromise;
}

export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  streamUrl: string;
  icon: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  { id: 'lofi', name: 'Lofi Chill & Downtempo', genre: 'Chill / Beats', streamUrl: 'https://ice1.somafm.com/beatblender-128-mp3', icon: '☕' },
  { id: 'synthwave', name: 'Synthwave & Cyberpunk', genre: 'Retro / Synth', streamUrl: 'https://ice2.somafm.com/defcon-128-mp3', icon: '🌆' },
  { id: 'ambient', name: 'Groove Salad Ambient', genre: 'Ambient / Focus', streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3', icon: '🌿' },
  { id: 'vaporwave', name: 'Vaporwave 90s Beats', genre: 'Vapor / Nostalgia', streamUrl: 'https://ice4.somafm.com/vaporwaves-128-mp3', icon: '📼' },
  { id: 'metal', name: 'Heavy Metal & Gaming', genre: 'Hard Rock / Metal', streamUrl: 'https://ice2.somafm.com/metal-128-mp3', icon: '⚡' },
];

export interface YouTubePreset {
  id: string;
  name: string;
  genre: string;
  icon: string;
}

export const YOUTUBE_PRESETS: YouTubePreset[] = [
  { id: 'jfKfPfyJRdk', name: 'Lofi Girl - Relax & Study Radio', genre: 'Lofi Beats', icon: '🎧' },
  { id: '4xDzrJKXOOY', name: 'Synthwave Radio - Chill Synth / Retro', genre: 'Synthwave', icon: '🚀' },
  { id: '1fueZCTYkpA', name: 'Epic Gaming & Battle Mix', genre: 'Orchestral / Gaming', icon: '⚔️' },
  { id: 'yJg-Y5byMMw', name: 'Rock & Metal Gaming Playlist', genre: 'Hard Rock', icon: '🎸' },
  { id: '5yx6BWlEVcY', name: 'Chillhop Radio - Jazzy Lofi Beats', genre: 'Chillhop', icon: '☕' },
  { id: '21X5lGlDOfg', name: 'Drift Phonk Gaming Beats', genre: 'Aggressive Phonk', icon: '🔥' },
];

export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const clean = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const match = clean.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

interface VoiceRadioWidgetProps {
  channelName: string;
  onSyncState?: (state: Partial<RadioBotState>) => void;
  initialState?: RadioBotState;
}

export const VoiceRadioWidget: React.FC<VoiceRadioWidgetProps> = ({
  channelName,
  onSyncState,
  initialState,
}) => {
  const [activeTab, setActiveTab] = useState<'youtube' | 'radio'>(initialState?.mode || 'youtube');
  const [isPlaying, setIsPlaying] = useState(initialState?.isPlaying ?? false);
  const [selectedStationId, setSelectedStationId] = useState(initialState?.stationId || 'lofi');
  const [youtubeId, setYoutubeId] = useState(initialState?.youtubeId || 'jfKfPfyJRdk');
  const [youtubeTitle, setYoutubeTitle] = useState(initialState?.youtubeTitle || 'Lofi Girl - Relax & Study Radio');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [volume, setVolume] = useState(initialState?.volume ?? 0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [ytApiFailed, setYtApiFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytFallbackIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytReadyRef = useRef(false);
  const latestStateRef = useRef({ volume, isMuted, isPlaying, youtubeId });
  latestStateRef.current = { volume, isMuted, isPlaying, youtubeId };

  const currentStation = RADIO_STATIONS.find(s => s.id === selectedStationId) || RADIO_STATIONS[0];

  const sendFallbackCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = ytFallbackIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }, []);

  const applyYouTubeAudioState = useCallback(() => {
    const { volume: vol, isMuted: muted, isPlaying: playing } = latestStateRef.current;
    const volPercent = Math.round((muted ? 0 : vol) * 100);

    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(volPercent);
        if (muted || vol === 0) {
          ytPlayerRef.current.mute();
        } else {
          ytPlayerRef.current.unMute();
        }
        if (playing) {
          ytPlayerRef.current.playVideo();
        } else {
          ytPlayerRef.current.pauseVideo();
        }
        return;
      } catch {
        // fallback below
      }
    }

    const win = ytFallbackIframeRef.current?.contentWindow;
    if (win) {
      win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      sendFallbackCommand('setVolume', [volPercent]);
      sendFallbackCommand(muted || vol === 0 ? 'mute' : 'unMute');
      sendFallbackCommand(playing ? 'playVideo' : 'pauseVideo');
    }
  }, [sendFallbackCommand]);

  // Sync with incoming state from socket (keep local volume untouched)
  useEffect(() => {
    if (initialState) {
      if (initialState.isPlaying !== undefined) setIsPlaying(initialState.isPlaying);
      if (initialState.mode) setActiveTab(initialState.mode);
      if (initialState.stationId) setSelectedStationId(initialState.stationId);
      if (initialState.youtubeId) setYoutubeId(initialState.youtubeId);
      if (initialState.youtubeTitle) setYoutubeTitle(initialState.youtubeTitle);
    }
  }, [initialState]);

  // Initialize / update official YouTube IFrame Player API
  useEffect(() => {
    if (activeTab !== 'youtube' || !youtubeId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          // ignore
        }
      }
      return;
    }

    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (cancelled) return;
      if (!window.YT?.Player || !ytContainerRef.current) {
        setYtApiFailed(true);
        return;
      }

      setYtApiFailed(false);

      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          if (latestStateRef.current.isPlaying) {
            ytPlayerRef.current.loadVideoById(youtubeId);
          } else {
            ytPlayerRef.current.cueVideoById(youtubeId);
          }
          applyYouTubeAudioState();
          return;
        } catch {
          // recreate player below
        }
      }

      // Create fresh player
      ytReadyRef.current = false;
      ytContainerRef.current.innerHTML = '';
      const mountNode = document.createElement('div');
      ytContainerRef.current.appendChild(mountNode);

      try {
        ytPlayerRef.current = new window.YT.Player(mountNode, {
          width: '100%',
          height: '100%',
          videoId: youtubeId,
          playerVars: {
            autoplay: latestStateRef.current.isPlaying ? 1 : 0,
            controls: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              ytReadyRef.current = true;
              applyYouTubeAudioState();
            },
            onError: () => {
              setHasError(true);
            },
          },
        });
      } catch {
        setYtApiFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, youtubeId, applyYouTubeAudioState]);

  // Cleanup YT player on unmount
  useEffect(() => {
    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
      }
    };
  }, []);

  // Apply volume & mute changes smoothly to both Radio & YouTube without restarting stream
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    if (activeTab === 'youtube' && youtubeId) {
      const volPercent = Math.round((isMuted ? 0 : volume) * 100);
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.setVolume(volPercent);
          if (isMuted || volume === 0) {
            ytPlayerRef.current.mute();
          } else {
            ytPlayerRef.current.unMute();
          }
        } catch {
          // ignore
        }
      } else {
        sendFallbackCommand('setVolume', [volPercent]);
        sendFallbackCommand(isMuted || volume === 0 ? 'mute' : 'unMute');
      }
    }
  }, [volume, isMuted, activeTab, youtubeId, sendFallbackCommand]);

  // Apply play/pause changes to YouTube player
  useEffect(() => {
    if (activeTab === 'youtube' && youtubeId) {
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          if (isPlaying) {
            ytPlayerRef.current.playVideo();
          } else {
            ytPlayerRef.current.pauseVideo();
          }
        } catch {
          // ignore
        }
      } else {
        sendFallbackCommand(isPlaying ? 'playVideo' : 'pauseVideo');
      }
    }
  }, [isPlaying, activeTab, youtubeId, sendFallbackCommand]);

  // Normal radio audio element controller
  useEffect(() => {
    if (activeTab === 'radio') {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = 'none';
      }

      const audio = audioRef.current;
      audio.volume = isMuted ? 0 : volume;

      if (isPlaying) {
        if (audio.src !== currentStation.streamUrl) {
          audio.src = currentStation.streamUrl;
          audio.load();
        }
        audio.play().catch((err) => {
          if (err?.name === 'AbortError') return;
          console.warn('[RadioBot] Autoplay blocked or stream error:', err);
          setHasError(true);
          setIsPlaying(false);
        });
      } else {
        audio.pause();
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }

    return () => {
      audioRef.current?.pause();
    };
  }, [isPlaying, currentStation, activeTab]);

  const handleTabSwitch = (tab: 'youtube' | 'radio') => {
    setActiveTab(tab);
    setHasError(false);
    onSyncState?.({
      mode: tab,
      isPlaying,
      stationId: selectedStationId,
      youtubeId,
      youtubeTitle,
    });
  };

  const togglePlay = () => {
    setHasError(false);
    const nextPlay = !isPlaying;
    setIsPlaying(nextPlay);
    onSyncState?.({
      isPlaying: nextPlay,
      mode: activeTab,
      stationId: selectedStationId,
      youtubeId,
      youtubeTitle,
    });
  };

  const handleStationChange = (stationId: string) => {
    setSelectedStationId(stationId);
    setHasError(false);
    setActiveTab('radio');
    setIsPlaying(true);
    onSyncState?.({
      isPlaying: true,
      mode: 'radio',
      stationId,
    });
  };

  const handlePlayYouTubePreset = (preset: YouTubePreset) => {
    setYoutubeId(preset.id);
    setYoutubeTitle(preset.name);
    setHasError(false);
    setActiveTab('youtube');
    setIsPlaying(true);
    onSyncState?.({
      isPlaying: true,
      mode: 'youtube',
      youtubeId: preset.id,
      youtubeTitle: preset.name,
    });
  };

  const handlePlayCustomYouTube = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(youtubeInput);
    if (!id) {
      alert('Lütfen geçerli bir YouTube video linki (örn: https://youtu.be/... veya 11 karakterli ID) girin.');
      return;
    }

    const title = `YouTube Parçası (${id})`;
    setYoutubeId(id);
    setYoutubeTitle(title);
    setYoutubeInput('');
    setHasError(false);
    setActiveTab('youtube');
    setIsPlaying(true);
    onSyncState?.({
      isPlaying: true,
      mode: 'youtube',
      youtubeId: id,
      youtubeTitle: title,
    });
  };

  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0 ${isPlaying ? 'bg-gradient-to-tr from-red-500 to-indigo-600 animate-pulse' : 'bg-slate-800'}`}>
            {activeTab === 'youtube' ? <Youtube className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                Müzik & YouTube Botu
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${activeTab === 'youtube' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'}`}>
                  {activeTab === 'youtube' ? 'YOUTUBE' : 'RADYO'}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              #{channelName} ses odasında ortak eşzamanlı müzik
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Mode Tabs */}
          <div className="flex bg-slate-950/60 p-0.5 rounded-xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => handleTabSwitch('youtube')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'youtube'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>YouTube</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('radio')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'radio'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Radyo</span>
            </button>
          </div>

          {/* Master Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs shadow-lg transition-all transform active:scale-95 ${
              isPlaying
                ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
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
      </div>

      {/* TAB 1: YOUTUBE MUSIC */}
      {activeTab === 'youtube' && (
        <div className="space-y-3">
          {/* URL Input Form */}
          <form onSubmit={handlePlayCustomYouTube} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="YouTube video linki veya ID girin (örn: https://youtu.be/...)"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-red-500 transition-colors"
              />
              <Youtube className="w-4 h-4 text-red-400 absolute left-2.5 top-2" />
            </div>
            <button
              type="submit"
              disabled={!youtubeInput.trim()}
              className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/20 transition-all shrink-0"
            >
              <Play className="w-3 h-3 fill-current" /> Çal
            </button>
          </form>

          {/* YouTube Presets */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
              <span>Popüler Oyun & Müzik Listeleri</span>
              <span className="text-[10px] text-slate-500">Tıkla ve Dinle</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {YOUTUBE_PRESETS.map((p) => {
                const isSelected = youtubeId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePlayYouTubePreset(p)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-red-600/20 border-red-500 text-white shadow-inner'
                        : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-lg shrink-0">{p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{p.genre}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* YouTube Player Container */}
          {youtubeId && (
            <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Disc3 className={`w-4 h-4 text-red-400 shrink-0 ${isPlaying ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-semibold text-white truncate max-w-sm">
                    {youtubeTitle}
                  </span>
                  {hasError && (
                    <span className="text-[10px] text-amber-400 font-semibold shrink-0">(Video gömme engelli olabilir)</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowVideoPlayer(!showVideoPlayer)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border transition-colors shrink-0 ${
                    showVideoPlayer
                      ? 'bg-red-600/30 border-red-500 text-red-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-3 h-3" />
                  <span>{showVideoPlayer ? 'Videoyu Gizle' : 'Klibi Göster'}</span>
                </button>
              </div>

              {/* Embedded Player: keep non-zero dimensions offscreen when hidden so WebView2 never throttles it */}
              <div
                className={
                  showVideoPlayer
                    ? 'overflow-hidden rounded-xl border border-white/10 bg-black h-48 sm:h-64 w-full'
                    : 'fixed -left-[9999px] top-0 w-64 h-36 opacity-0 pointer-events-none'
                }
              >
                {ytApiFailed ? (
                  <iframe
                    ref={ytFallbackIframeRef}
                    key={youtubeId}
                    title="YouTube Music Player"
                    src={`https://www.youtube.com/embed/${youtubeId}?autoplay=${isPlaying ? 1 : 0}&enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
                    onLoad={() => {
                      applyYouTubeAudioState();
                      setTimeout(applyYouTubeAudioState, 400);
                      setTimeout(applyYouTubeAudioState, 1000);
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div ref={ytContainerRef} className="w-full h-full" />
                )}
              </div>

              {!showVideoPlayer && (
                <div className="p-2.5 rounded-xl bg-slate-950/40 border border-white/5 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>{isPlaying ? 'YouTube arkada çalıyor (Ses Modu)' : 'YouTube duraklatıldı'}</span>
                  </span>
                  <a
                    href={`https://www.youtube.com/watch?v=${youtubeId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px]"
                  >
                    <span>YouTube'da Aç</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RADIO STATIONS */}
      {activeTab === 'radio' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {RADIO_STATIONS.map((station) => {
              const isSelected = station.id === selectedStationId;
              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => handleStationChange(station.id)}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-inner'
                      : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="text-lg shrink-0">{station.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{station.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{station.genre}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 pt-1 border-t border-white/5">
            <Disc3 className={`w-3.5 h-3.5 text-indigo-400 ${isPlaying ? 'animate-spin' : ''}`} />
            <span className="text-[11px] font-medium text-slate-300">
              {isPlaying ? `Canlı Radyo: ${currentStation.name}` : 'Müzik duraklatıldı'}
            </span>
            {hasError && <span className="text-[10px] text-amber-400 font-semibold">(Bağlantı hatası)</span>}
          </div>
        </div>
      )}

      {/* Volume Bar */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10 text-xs text-slate-400">
        <span className="text-[11px]">Odadaki herkes için senkronize müzik</span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            className="text-slate-400 hover:text-white transition-colors"
            title={isMuted ? 'Sesi Aç' : 'Sustur'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
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
            className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="text-[10px] font-mono text-slate-300 w-8 text-right">
            {isMuted ? 0 : Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
