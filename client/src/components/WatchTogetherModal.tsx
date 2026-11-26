import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, RotateCcw, Film, Sparkles, ExternalLink, ListPlus, SkipForward } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { t } from '../utils/i18n';

interface WatchTogetherModalProps {
  channelId: string;
  onClose: () => void;
}

const PRESET_VIDEOS = [
  { title: 'Lofi Hip Hop Radio ☕', id: 'jfKfPfyJRdk' },
  { title: 'Cyberpunk Synthwave Chill 🌆', id: '4xDzrJKXOOY' },
  { title: 'Relaxing Campfire Rain 🌧️', id: 'mPZkdNFkNps' },
  { title: 'Epic Orchestral Gaming ⚔️', id: 'dQw4w9WgXcQ' },
];

function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export const WatchTogetherModal: React.FC<WatchTogetherModalProps> = ({ channelId, onClose }) => {
  const {
    watchTogetherState,
    startWatchTogether,
    sendWatchTogetherAction,
    stopWatchTogether,
    enqueueWatchTogether,
    voteSkipWatchTogether,
    nextWatchTogether,
    currentUser,
    onlineUsers,
    language,
  } = useSocket();
  const [inputUrl, setInputUrl] = useState('');
  const [queueUrl, setQueueUrl] = useState('');
  const [queueError, setQueueError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [localPlaying, setLocalPlaying] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const sendYouTubeCmd = (func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  };

  const activeSession = watchTogetherState?.channelId === channelId && watchTogetherState?.active
    ? watchTogetherState
    : null;

  useEffect(() => {
    if (activeSession) {
      setLocalPlaying(activeSession.isPlaying);
      sendYouTubeCmd(activeSession.isPlaying ? 'playVideo' : 'pauseVideo');
    }
  }, [activeSession?.isPlaying]);

  const handleStart = (vidId: string, title?: string) => {
    setErrorMsg('');
    startWatchTogether(channelId, vidId, title || 'YouTube Senkronize Video');
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(inputUrl);
    if (!id) {
      setErrorMsg('Geçerli bir YouTube linki veya 11 haneli video kodu girin.');
      return;
    }
    handleStart(id, 'Özel YouTube Videosu');
  };

  const togglePlay = () => {
    if (!activeSession) return;
    const next = !localPlaying;
    setLocalPlaying(next);
    sendYouTubeCmd(next ? 'playVideo' : 'pauseVideo');
    sendWatchTogetherAction(channelId, next ? 'play' : 'pause', 0);
  };

  const handleRestart = () => {
    if (!activeSession) return;
    sendYouTubeCmd('seekTo', [0, true]);
    sendWatchTogetherAction(channelId, 'seek', 0);
  };

  const handleStop = () => {
    stopWatchTogether(channelId);
  };

  const handleQueueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(queueUrl);
    if (!id) {
      setQueueError('Sıraya eklemek için geçerli bir YouTube linki veya video kodu girin.');
      return;
    }
    setQueueError('');
    enqueueWatchTogether(channelId, id, 'Sıradaki Video');
    setQueueUrl('');
  };

  const roomParticipantCount = Math.max(
    1,
    onlineUsers.filter((u) => u.currentVoiceChannelId === channelId).length
  );
  const skipVoteThreshold = Math.max(1, Math.ceil(roomParticipantCount / 2));
  const skipVotes = activeSession?.skipVotes || [];
  const hasVotedSkip = Boolean(currentUser?.username && skipVotes.includes(currentUser.username));
  const queueList = activeSession?.queue || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-3xl ui-modal-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                {t(language, 'watchTogetherTitle')}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold uppercase tracking-wider">
                  Canlı Senkron
                </span>
              </h3>
              <p className="text-[11px] text-white/50">
                {activeSession ? `Başlatan: @${activeSession.startedBy}` : 'Odada arkadaşlarınla aynı anda video izle'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {activeSession ? (
            /* Active Player View */
            <div className="space-y-4">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                <iframe
                  ref={iframeRef}
                  title="YouTube Watch Together"
                  src={`https://www.youtube.com/embed/${activeSession.videoId}?autoplay=1&enablejsapi=1&controls=1&rel=0`}
                  onLoad={() => {
                    iframeRef.current?.contentWindow?.postMessage(
                      JSON.stringify({ event: 'listening', id: 2, channel: 'widget' }),
                      '*'
                    );
                  }}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              {/* Synchronized Control Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg ${
                      localPlaying
                        ? 'bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                    }`}
                  >
                    {localPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>{localPlaying ? 'Odayı Duraklat' : 'Odayı Oynat'}</span>
                  </button>

                  <button
                    onClick={handleRestart}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                    title="Başa Sar (Seek 0s)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => voteSkipWatchTogether(channelId)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                      hasVotedSkip
                        ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/85'
                    }`}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>
                      {t(language, 'skipVote')} ({skipVotes.length}/{skipVoteThreshold})
                    </span>
                  </button>

                  {queueList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => nextWatchTogether(channelId)}
                      className="px-3 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-xs font-bold border border-blue-400/30 transition"
                    >
                      Sıradakine Geç
                    </button>
                  )}

                  <a
                    href={`https://youtube.com/watch?v=${activeSession.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-white/60 hover:text-white flex items-center gap-1 transition"
                  >
                    <span>YouTube&apos;da Aç</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={handleStop}
                    className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold border border-red-500/30 transition"
                  >
                    {t(language, 'closeCinema')}
                  </button>
                </div>
              </div>

              {/* Shared Watch Queue */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white/85">
                    <ListPlus className="w-4 h-4 text-blue-400" />
                    <span>{t(language, 'watchQueueTitle')} ({queueList.length})</span>
                  </div>
                </div>
                <form onSubmit={handleQueueSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={queueUrl}
                    onChange={(e) => setQueueUrl(e.target.value)}
                    placeholder="Sıraya eklemek için YouTube linki veya video ID..."
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none text-xs text-white placeholder-white/30"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shrink-0"
                  >
                    {t(language, 'addToQueue')}
                  </button>
                </form>
                {queueError && <p className="text-[11px] text-red-400">{queueError}</p>}
                {queueList.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {queueList.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {idx + 1}. {item.title}
                          </div>
                          <div className="text-[10px] text-white/45 font-mono truncate">
                            ID: {item.videoId} • @{item.addedBy}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-white/40">
                    Sıra boş. Yukarıdan arkadaşlarınla sıraya yeni video ekleyebilirsin.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Video Selection & Preset View */
            <div className="space-y-6">
              {/* Custom URL Input */}
              <form onSubmit={handleCustomSubmit} className="space-y-2">
                <label className="text-xs font-semibold text-white/80 block">
                  YouTube Video Linki veya Video Kodu:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... veya video id"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-red-500 focus:outline-none text-xs text-white placeholder-white/30"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition flex items-center gap-1.5 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Başlat</span>
                  </button>
                </div>
                {errorMsg && <p className="text-[11px] text-red-400 font-medium">{errorMsg}</p>}
              </form>

              {/* Preset Cards */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white/70">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Hızlı Hazır Müzik & Yayınlar:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PRESET_VIDEOS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleStart(preset.id, preset.title)}
                      className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-red-500/40 text-left transition flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <div className="text-xs font-bold text-white group-hover:text-red-300 transition truncate">
                          {preset.title}
                        </div>
                        <div className="text-[10px] text-white/40 font-mono">ID: {preset.id}</div>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-red-500/20 group-hover:bg-red-500 text-red-400 group-hover:text-white flex items-center justify-center shrink-0 transition">
                        <Play className="w-3.5 h-3.5 ml-0.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
