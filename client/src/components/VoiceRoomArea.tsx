import React, { useRef, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNetworkPing } from '../context/NetworkMetricsContext';
import { isUserServerOwner } from '../utils/serverIdentity';
import { t } from '../utils/i18n';
import { ViewerStreamQuality, ScreenShareStats, ScreenShareLaserPoint } from '../types';
import { SoundboardModal } from './SoundboardModal';
import { VoiceRadioWidget } from './VoiceRadioWidget';
import { WhiteboardModal } from './WhiteboardModal';
import { WatchTogetherModal } from './WatchTogetherModal';
import { SpatialAudioModal } from './SpatialAudioModal';
import { MiniGamesModal } from './MiniGamesModal';
import { GoLiveModal } from './GoLiveModal';
import { WhisperListsModal } from './WhisperListsModal';
import { VoiceUserContextMenu } from './VoiceUserContextMenu';
import { AvatarView } from './AvatarView';
import { StageChannelView } from './voice/StageChannelView';
import { ScreenAnnotationOverlay } from './voice/ScreenAnnotationOverlay';
import { LiveCaptionsOverlay } from './voice/LiveCaptionsOverlay';
import { InlineMarkdown } from './chat/MessageTextRenderer';
import { uploadAttachmentFile } from '../utils/uploadAttachment';
import { resolveMediaUrl } from '../utils/authFetch';
import { appToast } from '../utils/appDialogs';
import {
  createStreamClipRecorder,
  downloadClipBlob,
  type StreamClipRecorderHandle,
} from '../utils/streamClipRecorder';
import {
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Radio,
  Monitor,
  VolumeX,
  Activity,
  Maximize2,
  Tv,
  Sparkles,
  Music2,
  Volume2,
  Disc,
  Video,
  VideoOff,
  Palette,
  Star,
  Film,
  Compass,
  Gamepad2,
  Minimize2,
  Hand,
  Layers,
  Menu,
  MessageSquare,
  Send,
  X,
  LayoutGrid,
  Focus,
  Droplet,
  PenTool,
  Trash2,
  Captions,
  Paperclip,
  Lock,
  ShieldCheck,
  Copy,
  Check,
  Scissors,
  Download,
  Crown,
} from 'lucide-react';

// Video component for displaying live WebRTC screen share stream
const VideoStreamPlayer: React.FC<{
  stream: MediaStream;
  title: string;
  channelId?: string;
  presenterId?: string;
  isLocalStream?: boolean;
  viewerNames?: string[];
  isFocused?: boolean;
  onToggleFocus?: () => void;
  canSelectQuality?: boolean;
  selectedQuality?: ViewerStreamQuality;
  onSelectQuality?: (quality: ViewerStreamQuality) => void;
  getStreamStats?: (presenterUserId?: string) => Promise<ScreenShareStats | null>;
  laserPoints?: ScreenShareLaserPoint[];
  onSendLaser?: (x: number, y: number) => void;
  annotateLabel?: string;
  clearAnnotateLabel?: string;
}> = ({
  stream,
  title,
  channelId,
  presenterId,
  isLocalStream = false,
  viewerNames = [],
  isFocused,
  onToggleFocus,
  canSelectQuality,
  selectedQuality = 'auto',
  onSelectQuality,
  getStreamStats,
  laserPoints = [],
  onSendLaser,
  annotateLabel = 'Ekran Üzerine Çiz',
  clearAnnotateLabel = 'Çizimleri Temizle',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastLaserSentRef = useRef(0);
  const [hdrBoost, setHdrBoost] = useState(false);
  const [isStreamMuted, setIsStreamMuted] = useState<boolean>(isLocalStream);
  const [streamVolume, setStreamVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('cakma_default_stream_volume');
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed / 100));
      }
    } catch {}
    return 0.8;
  });
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<ScreenShareStats | null>(null);
  const [laserMode, setLaserMode] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [annotateColor, setAnnotateColor] = useState('#f43f5e');
  const [clearAnnotSignal, setClearAnnotSignal] = useState(0);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = isLocalStream || isStreamMuted || streamVolume === 0;
    videoRef.current.volume = streamVolume;
  }, [isLocalStream, isStreamMuted, streamVolume]);

  useEffect(() => {
    if (!showStats || !getStreamStats) return;
    let active = true;
    const poll = async () => {
      const next = await getStreamStats(isLocalStream ? undefined : presenterId);
      if (active && next) setStats(next);
    };
    poll();
    const timer = window.setInterval(poll, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [showStats, getStreamStats, isLocalStream, presenterId]);

  const emitLaserFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!laserMode || !onSendLaser || !containerRef.current) return;
    const now = Date.now();
    if (now - lastLaserSentRef.current < 65) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    lastLaserSentRef.current = now;
    onSendLaser(x, y);
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handlePip = async () => {
    try {
      if (videoRef.current && 'requestPictureInPicture' in videoRef.current) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await (videoRef.current as any).requestPictureInPicture();
        }
      }
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      onClick={emitLaserFromEvent}
      onMouseMove={(e) => {
        if (e.buttons === 1) emitLaserFromEvent(e);
      }}
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-black/80 border border-white/10 shadow-2xl flex items-center justify-center group ${
        laserMode ? 'cursor-crosshair' : ''
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocalStream || isStreamMuted || streamVolume === 0}
        className="w-full h-full object-contain transition-[filter] duration-200"
        style={hdrBoost ? { filter: 'contrast(1.12) saturate(1.18) brightness(1.04)' } : undefined}
      />

      {/* Ephemeral Screen Annotation Layer */}
      {channelId && presenterId && (
        <ScreenAnnotationOverlay
          channelId={channelId}
          targetSharerId={presenterId}
          active={annotateMode}
          color={annotateColor}
          clearSignal={clearAnnotSignal}
        />
      )}

      {/* Ephemeral Laser Pointer Overlay */}
      {laserPoints.map((pt) => (
        <div
          key={pt.id}
          style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1"
        >
          <span
            className="w-3.5 h-3.5 rounded-full shadow-[0_0_12px_rgba(244,63,94,0.95)] ring-2 ring-white/80 animate-ping"
            style={{ backgroundColor: pt.color }}
          />
          <span className="px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-white border border-white/15 whitespace-nowrap">
            {pt.fromUsername}
          </span>
        </div>
      ))}

      {/* iOS Floating Stream Badge + Viewer Count */}
      <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 text-xs font-medium text-white shadow-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="w-2 h-2 rounded-full bg-red-500 -ml-4" />
          <span>CANLI · {title}</span>
          {hdrBoost && (
            <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-amber-500 to-rose-500 text-[9px] font-black text-white">
              HDR+
            </span>
          )}
        </div>
        <div
          className="bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 text-[11px] font-semibold text-white/85 shadow-lg"
          title={viewerNames.length > 0 ? `İzleyenler: ${viewerNames.join(', ')}` : 'Odada başka izleyici yok'}
        >
          👁️ {viewerNames.length} İzleyici
        </div>
      </div>

      {/* Action Buttons: Quality + Laser + Stats + HDR+ + PiP + Focus Mode + Fullscreen */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 flex-wrap justify-end opacity-0 group-hover:opacity-100 transition z-10">
        {canSelectQuality && onSelectQuality && (
          <select
            value={selectedQuality}
            onChange={(e) => onSelectQuality(e.target.value as ViewerStreamQuality)}
            className="px-2.5 py-1.5 bg-black/75 hover:bg-black/90 backdrop-blur-md rounded-full text-xs font-semibold text-white border border-white/15 shadow-lg outline-none cursor-pointer"
            title="İzleme Kalitesini Seç"
          >
            <option value="auto">Kalite: Oto</option>
            <option value="source">Kaynak</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
            <option value="360">360p</option>
          </select>
        )}
        {onSendLaser && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLaserMode((prev) => {
                const next = !prev;
                if (next) setAnnotateMode(false);
                return next;
              });
            }}
            className={`px-3 py-1.5 backdrop-blur-md rounded-full text-xs font-semibold transition border shadow-lg ${
              laserMode
                ? 'bg-rose-500/85 border-rose-300/60 text-white'
                : 'bg-black/60 hover:bg-black/90 border-white/10 text-white/80 hover:text-white'
            }`}
            title="Yayın Üzerinde Lazer İşaretçi (Tıkla veya Sürükle)"
          >
            Lazer
          </button>
        )}
        {channelId && presenterId && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 p-0.5 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setAnnotateMode((prev) => {
                  const next = !prev;
                  if (next) setLaserMode(false);
                  return next;
                });
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition ${
                annotateMode
                  ? 'bg-amber-500 text-black'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title={annotateLabel}
            >
              <PenTool className="w-3 h-3" />
              <span>{annotateLabel}</span>
            </button>
            {annotateMode && (
              <>
                {['#f43f5e', '#fbbf24', '#34d399', '#38bdf8'].map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setAnnotateColor(hex)}
                    className={`w-4 h-4 rounded-full border transition ${
                      annotateColor === hex ? 'border-white scale-110' : 'border-black/40 opacity-75'
                    }`}
                    style={{ backgroundColor: hex }}
                    title="Çizim Rengi"
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setClearAnnotSignal((c) => c + 1)}
                  className="p-1 rounded-full hover:bg-rose-500/30 text-rose-300 transition"
                  title={clearAnnotateLabel}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}
        {getStreamStats && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowStats((prev) => !prev);
            }}
            className={`px-3 py-1.5 backdrop-blur-md rounded-full text-xs font-semibold transition border shadow-lg ${
              showStats
                ? 'bg-emerald-500/80 border-emerald-300/60 text-white'
                : 'bg-black/60 hover:bg-black/90 border-white/10 text-white/80 hover:text-white'
            }`}
            title="Canlı Yayın İstatistikleri (Codec, FPS, Bitrate)"
          >
            İstatistik
          </button>
        )}
        <button
          type="button"
          onClick={() => setHdrBoost((prev) => !prev)}
          className={`px-3 py-1.5 backdrop-blur-md rounded-full text-xs font-semibold transition border shadow-lg ${
            hdrBoost
              ? 'bg-amber-500/80 border-amber-300/60 text-white'
              : 'bg-black/60 hover:bg-black/90 border-white/10 text-white/80 hover:text-white'
          }`}
          title="HDR+ Canlı Renk ve Kontrast İyileştirme"
        >
          HDR+
        </button>
        <button
          type="button"
          onClick={handlePip}
          className="px-3 py-1.5 bg-black/60 hover:bg-black/90 backdrop-blur-md rounded-full text-xs font-semibold text-white/80 hover:text-white transition border border-white/10 shadow-lg"
          title="Resim İçinde Resim (PiP)"
        >
          PiP
        </button>
        {onToggleFocus && (
          <button
            onClick={onToggleFocus}
            className={`px-3 py-1.5 backdrop-blur-md rounded-full text-xs font-semibold transition border shadow-lg flex items-center gap-1.5 ${
              isFocused
                ? 'bg-blue-500/80 hover:bg-blue-500 text-white border-blue-400/50'
                : 'bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border-white/10'
            }`}
            title={isFocused ? 'Odak Modundan Çık' : 'Ekranı Odakla'}
          >
            {isFocused ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFocused ? 'Odaktan Çık' : 'Odakla'}</span>
          </button>
        )}
        <button
          onClick={handleFullscreen}
          className="p-2 bg-black/60 hover:bg-black/90 backdrop-blur-md rounded-full text-white/80 hover:text-white transition border border-white/10 shadow-lg"
          title="Tam Ekran Yap"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Stats for Nerds Card */}
      {showStats && (
        <div className="absolute bottom-4 left-4 z-10 bg-black/75 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 text-[11px] font-mono text-white/90 space-y-0.5 shadow-xl">
          <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Yayın İstatistikleri</div>
          {stats ? (
            <>
              <div>Codec: <span className="text-white font-semibold">{stats.codec}</span></div>
              <div>Çözünürlük: <span className="text-white font-semibold">{stats.width}×{stats.height} @ {stats.fps} fps</span></div>
              <div>Bit Hızı: <span className="text-white font-semibold">{stats.bitrateKbps} kbps ({(stats.bitrateKbps / 1000).toFixed(1)} Mbps)</span></div>
              <div>Paket Kaybı: <span className="text-white font-semibold">{stats.packetsLost}</span></div>
            </>
          ) : (
            <div className="text-white/60">Ölçülüyor...</div>
          )}
        </div>
      )}

      {/* Viewer Stream Audio Control */}
      {!isLocalStream && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-4 right-4 z-10 bg-black/70 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition shadow-lg"
        >
          <button
            type="button"
            onClick={() => setIsStreamMuted((prev) => !prev)}
            className="text-white/85 hover:text-white transition"
            title={isStreamMuted ? 'Yayın Sesini Aç' : 'Yayın Sesini Kapat'}
          >
            {isStreamMuted || streamVolume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isStreamMuted ? 0 : streamVolume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setStreamVolume(v);
              if (v > 0 && isStreamMuted) setIsStreamMuted(false);
            }}
            className="w-20 accent-emerald-400 cursor-pointer"
            title={`Yayın Sesi: %${Math.round((isStreamMuted ? 0 : streamVolume) * 100)}`}
          />
        </div>
      )}
    </div>
  );
};

interface VoiceRoomAreaProps {
  onOpenMobileNav?: () => void;
}

export const VoiceRoomArea: React.FC<VoiceRoomAreaProps> = ({ onOpenMobileNav }) => {
  const {
    activeChannel,
    activeServer,
    connectedVoiceChannelId,
    joinVoiceChannel,
    leaveVoiceChannel,
    currentUser,
    onlineUsers,
    isMuted,
    isDeafened,
    isSpeaking,
    toggleMute,
    toggleDeafen,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    screenStream,
    remoteScreenStreams,
    inputMode,
    pttKey,
    isPttActive,
    playSoundboard,
    activeSoundboardEffect,
    radioBotState,
    syncRadioState,
    openDiagnostics,
    userVolumes,
    setUserVolume,
    userLocalMutes,
    toggleUserLocalMute,
    isVoiceRecording,
    voiceRecordingSeconds,
    startVoiceRecording,
    stopVoiceRecording,
    isWebcamActive,
    toggleWebcam,
    webcamStream,
    webcamBlurEnabled,
    toggleWebcamBlur,
    isPrioritySpeakerActive,
    prioritySpeakerUsername,
    togglePrioritySpeaker,
    activeWhisperFrom,
    sendWhisper,
    toggleRaiseHand,
    toggleOverlayWindow,
    messagesMap,
    sendMessage,
    addReaction,
    currentServerHost,
    voiceE2eeEnabled,
    voiceE2eeFingerprint,
    setVoiceE2eeConfig,
    language,
    requestScreenShareQuality,
    updateLiveScreenShareSettings,
    getScreenShareStats,
    laserPoints,
    sendScreenShareLaser,
    muteAllVoiceChannel,
    voiceTransportMode,
    hasServerPermission,
  } = useSocket();
  const ping = useNetworkPing();
  const [isSpotlightMode, setIsSpotlightMode] = useState(false);
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);

  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsSoundboardOpen((prev) => !prev);
    window.addEventListener('cakma-open-soundboard', handler);
    return () => window.removeEventListener('cakma-open-soundboard', handler);
  }, []);
  const [isWhisperListsOpen, setIsWhisperListsOpen] = useState(false);
  const [showRadioBot, setShowRadioBot] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [voiceChatInput, setVoiceChatInput] = useState('');
  const [lastReadVoiceChatCount, setLastReadVoiceChatCount] = useState(0);
  const [voiceChatUploading, setVoiceChatUploading] = useState(false);
  const voiceChatFileRef = useRef<HTMLInputElement>(null);
  const voiceChatEndRef = useRef<HTMLDivElement>(null);
  const [showE2eePopover, setShowE2eePopover] = useState(false);
  const [e2eePassInput, setE2eePassInput] = useState('');
  const [e2eeCopied, setE2eeCopied] = useState(false);
  const [audioDuckingEnabled, setAudioDuckingEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('cakma_ducking_enabled');
      return raw !== null ? raw === 'true' : true;
    } catch {
      return true;
    }
  });
  const duckingLevelPercent = (() => {
    try {
      const raw = Number(localStorage.getItem('cakma_ducking_level'));
      return Number.isFinite(raw) && raw >= 10 && raw <= 70 ? raw : 30;
    } catch {
      return 30;
    }
  })();
  const [volumePopoverUserId, setVolumePopoverUserId] = useState<string | null>(null);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [isWatchTogetherOpen, setIsWatchTogetherOpen] = useState(false);
  const [isSpatialAudioOpen, setIsSpatialAudioOpen] = useState(false);
  const [isGoLiveOpen, setIsGoLiveOpen] = useState(false);
  const [isMiniGamesOpen, setIsMiniGamesOpen] = useState(false);
  const [isActivitiesMenuOpen, setIsActivitiesMenuOpen] = useState(false);
  const activitiesMenuRef = useRef<HTMLDivElement | null>(null);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [isMultiStreamGrid, setIsMultiStreamGrid] = useState(false);
  const [liveCaptionsEnabled, setLiveCaptionsEnabled] = useState(false);
  const [selectedScreenPresenterId, setSelectedScreenPresenterId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setLiveCaptionsEnabled((prev) => !prev);
    window.addEventListener('cakma-toggle-live-captions', handler);
    return () => window.removeEventListener('cakma-toggle-live-captions', handler);
  }, []);

  useEffect(() => {
    if (!isActivitiesMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (activitiesMenuRef.current && !activitiesMenuRef.current.contains(e.target as Node)) {
        setIsActivitiesMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActivitiesMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isActivitiesMenuOpen]);

  const activeVoiceId = activeChannel?.id || '';
  const currentVoiceMsgsCount = messagesMap[activeVoiceId]?.length || 0;
  const prevVoiceChRef = useRef<string>('');
  useEffect(() => {
    if (prevVoiceChRef.current !== activeVoiceId) {
      prevVoiceChRef.current = activeVoiceId;
      setLastReadVoiceChatCount(currentVoiceMsgsCount);
    } else if (showVoiceChat) {
      setLastReadVoiceChatCount(currentVoiceMsgsCount);
    }
    if (showVoiceChat) {
      voiceChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeVoiceId, currentVoiceMsgsCount, showVoiceChat]);
  const unreadVoiceChatCount = showVoiceChat
    ? 0
    : Math.max(0, currentVoiceMsgsCount - lastReadVoiceChatCount);
  const [viewerQualityByPresenter, setViewerQualityByPresenter] = useState<Record<string, ViewerStreamQuality>>({});
  const [liveFps, setLiveFps] = useState<5 | 30 | 60>(30);
  const [liveBitrateKbps, setLiveBitrateKbps] = useState<number>(10000);
  const [userContextMenu, setUserContextMenu] = useState<{ user: any; x: number; y: number } | null>(null);
  const [clipBufferEnabled, setClipBufferEnabled] = useState(false);
  const [clipBufferedSeconds, setClipBufferedSeconds] = useState(0);
  const [isSharingClip, setIsSharingClip] = useState(false);
  const clipRecorderRef = useRef<StreamClipRecorderHandle | null>(null);
  const activeClipStream =
    isScreenSharing && screenStream
      ? screenStream
      : (selectedScreenPresenterId ? remoteScreenStreams.get(selectedScreenPresenterId) : undefined) ||
        Array.from(remoteScreenStreams.values())[0] ||
        null;

  useEffect(() => {
    if (!clipBufferEnabled || !activeClipStream) {
      clipRecorderRef.current?.stop();
      clipRecorderRef.current = null;
      setClipBufferedSeconds(0);
      return;
    }
    const handle = createStreamClipRecorder(activeClipStream, 30, (secs) => {
      setClipBufferedSeconds(secs);
    });
    const started = handle.start();
    if (!started) {
      setClipBufferEnabled(false);
      appToast('Tarayıcı/cihaz bu akış için klip tamponu kaydını desteklemiyor.', 'warning');
      return;
    }
    clipRecorderRef.current = handle;
    return () => {
      handle.stop();
      if (clipRecorderRef.current === handle) {
        clipRecorderRef.current = null;
      }
    };
  }, [clipBufferEnabled, activeClipStream]);

  useEffect(() => {
    if (!clipBufferEnabled || clipBufferedSeconds <= 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const blob = clipRecorderRef.current?.captureBlob();
        if (!blob) return;
        downloadClipBlob(blob, 'cakma-stream-clip');
        appToast('Anlık Tekrar (Alt+C) klibi indirildi!', 'success');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clipBufferEnabled, clipBufferedSeconds]);

  const handleShareClipToRoom = async () => {
    if (isSharingClip) return;
    const blob = clipRecorderRef.current?.captureBlob();
    if (!blob) {
      appToast('Henüz paylaşılacak klip tamponu oluşmadı.', 'info');
      return;
    }
    setIsSharingClip(true);
    try {
      const file = new File([blob], `klip-${Date.now()}.webm`, {
        type: blob.type || 'video/webm',
      });
      const attachment = await uploadAttachmentFile(currentServerHost, file);
      sendMessage('🎬 Son 30 sn Anlık Tekrar Klibi', [attachment]);
      appToast('30 saniyelik klip oda sohbetine gönderildi!', 'success');
    } catch {
      appToast('Klip yüklenemedi.', 'error');
    } finally {
      setIsSharingClip(false);
    }
  };

  const handleOpenUserContextMenu = (e: React.MouseEvent, user: any) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 270);
    const y = Math.min(e.clientY, window.innerHeight - 340);
    setUserContextMenu({ user, x: Math.max(8, x), y: Math.max(8, y) });
  };

  if (!activeChannel || (activeChannel.type !== 'voice' && activeChannel.type !== 'stage')) return null;

  const isConnected = connectedVoiceChannelId === activeChannel.id;
  const usersInRoom = onlineUsers.filter(
    (u) => u.currentVoiceChannelId === activeChannel.id
  );

  // Determine active screen share (local or remote) with multi-stream switching
  const remoteEntries = Array.from(remoteScreenStreams.entries());
  const totalActiveStreams = (isScreenSharing && screenStream ? 1 : 0) + remoteEntries.length;
  const activeRemoteStreamEntry =
    (selectedScreenPresenterId && remoteEntries.find(([uid]) => uid === selectedScreenPresenterId)) ||
    remoteEntries[0];
  const activePresenter = activeRemoteStreamEntry
    ? onlineUsers.find((u) => u.id === activeRemoteStreamEntry[0])
    : null;

  const hasAnyScreenShare = (isScreenSharing && !!screenStream) || !!activeRemoteStreamEntry;

  return (
    <div className="flex-1 min-w-0 bg-transparent flex flex-col h-full overflow-hidden relative">
      {/* iOS Translucent Header */}
      <header className="h-14 px-3 sm:px-6 border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0 bg-[#16161a]/60 backdrop-blur-2xl">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              className="md:hidden w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0"
              title="Menüyü Aç"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-white text-sm tracking-tight flex items-center gap-2 truncate">
              <span className="truncate">{activeChannel.name}</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-semibold px-2 py-0.5 rounded-full shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {activeChannel.userLimit && activeChannel.userLimit > 0
                  ? `${usersInRoom.length} / ${activeChannel.userLimit} Katılımcı`
                  : `${usersInRoom.length} Katılımcı`}
              </span>
              {(activeChannel.bitrateKbps || activeServer?.bitrateKbps) && (
                <span className="hidden md:inline-flex items-center text-[10px] bg-white/5 text-white/60 border border-white/10 font-mono px-2 py-0.5 rounded-full shrink-0">
                  {activeChannel.bitrateKbps || activeServer?.bitrateKbps} kbps
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-white/60 overflow-x-auto no-scrollbar py-1 max-w-[56vw] sm:max-w-[72vw] shrink-0">
          {/* Spotlight / Grid View Switcher */}
          {!hasAnyScreenShare && usersInRoom.length > 1 && (
            <button
              type="button"
              onClick={() => setIsSpotlightMode((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
                isSpotlightMode
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
              }`}
              title={isSpotlightMode ? 'Izgara Görünümüne Geç' : 'Konuşanı Öne Çıkar (Spotlight)'}
            >
              {isSpotlightMode ? <LayoutGrid className="w-3.5 h-3.5" /> : <Focus className="w-3.5 h-3.5" />}
              <span>{isSpotlightMode ? 'Izgara' : 'Spotlight'}</span>
            </button>
          )}
          {/* Moderator Meeting Mode: Mute / Unmute All */}
          {(currentUser?.role === 'admin' || isUserServerOwner(currentUser, activeServer)) && usersInRoom.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const anyUnmuted = usersInRoom.some((u) => u.id !== currentUser?.id && u.role !== 'admin' && !u.isServerMuted);
                muteAllVoiceChannel(activeChannel.id, anyUnmuted);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition text-xs font-medium shrink-0"
              title="Toplantı Modu: Odadaki katılımcıları sunucudan topluca sustur / aç"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>Herkesi Sustur</span>
            </button>
          )}
          {/* Priority Speaker (TeamSpeak Ducking) */}
          {isConnected &&
            (isUserServerOwner(currentUser, activeServer) ||
              currentUser?.role === 'admin' ||
              hasServerPermission('priority_speaker')) && (
              <button
                type="button"
                onClick={togglePrioritySpeaker}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
                  isPrioritySpeakerActive
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-200 shadow-lg shadow-amber-500/20'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
                }`}
                title="Öncelikli Konuşmacı: Konuştuğunuzda odadaki diğer herkesin sesini otomatik kısar"
              >
                <Crown className={`w-3.5 h-3.5 ${isPrioritySpeakerActive ? 'text-amber-300' : ''}`} />
                <span>Öncelikli</span>
              </button>
            )}
          {prioritySpeakerUsername && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-semibold shrink-0 animate-pulse">
              <Crown className="w-3 h-3 text-amber-300" />
              <span>{prioritySpeakerUsername} Öncelikli Konuşmacı Aktif</span>
            </span>
          )}
          {/* Voice Room Audio Recorder */}
          {isConnected && (
            <button
              onClick={isVoiceRecording ? stopVoiceRecording : startVoiceRecording}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
                isVoiceRecording
                  ? 'bg-red-500/20 border-red-500 text-red-300 shadow-lg shadow-red-500/20'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
              }`}
              title={isVoiceRecording ? 'Kaydı Durdur ve İndir' : 'Kanal Sesini Kaydet (Toplantı/Oda Kaydedici)'}
            >
              <Disc className={`w-3.5 h-3.5 ${isVoiceRecording ? 'text-red-400 animate-spin' : ''}`} />
              <span>
                {isVoiceRecording
                  ? `${Math.floor(voiceRecordingSeconds / 60)
                      .toString()
                      .padStart(2, '0')}:${(voiceRecordingSeconds % 60)
                      .toString()
                      .padStart(2, '0')} Kaydediliyor`
                  : t(language, 'channelRecord')}
              </span>
            </button>
          )}

          <button
            onClick={() => setShowRadioBot(!showRadioBot)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
              showRadioBot || radioBotState.isPlaying
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
            }`}
            title="Kanal İçi Radyo & Müzik Botu"
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>{t(language, 'radioBot')}</span>
            {radioBotState.isPlaying && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setAudioDuckingEnabled((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
              audioDuckingEnabled
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/60'
            }`}
            title="Audio Ducking: Biri konuşurken Radyo/Müzik sesini otomatik %30'a düşür"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{t(language, 'ducking')}</span>
          </button>

          <button
            onClick={() => setLiveCaptionsEnabled((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
              liveCaptionsEnabled
                ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
            }`}
            title={t(language, 'liveCaptions')}
          >
            <Captions className="w-3.5 h-3.5" />
            <span>{t(language, 'liveCaptions')}</span>
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowE2eePopover((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
                voiceE2eeEnabled
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-sm'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
              }`}
              title="Ses & Medya Uçtan Uca Şifreleme (E2EE)"
            >
              {voiceE2eeEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{voiceE2eeEnabled ? 'Medya E2EE Açık' : 'Medya E2EE'}</span>
            </button>
            {showE2eePopover && (
              <div className="absolute right-0 top-9 z-50 w-72 p-3.5 rounded-2xl bg-[#141722]/98 backdrop-blur-2xl border border-white/15 shadow-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Ses / Medya E2EE
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowE2eePopover(false)}
                    className="text-white/40 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-white/60 leading-snug">
                  Odadaki katılımcılarla ortak bir parola belirleyerek WebRTC medya karelerini uçtan uca şifreleyin.
                </p>
                <input
                  type="password"
                  value={e2eePassInput}
                  onChange={(e) => setE2eePassInput(e.target.value)}
                  placeholder="Ortak oda parolası..."
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-emerald-400"
                />
                {voiceE2eeEnabled && voiceE2eeFingerprint && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-400/25">
                    <span className="text-[10px] text-emerald-200/80">SAS Doğrulama:</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(voiceE2eeFingerprint).catch(() => {});
                        setE2eeCopied(true);
                        setTimeout(() => setE2eeCopied(false), 1500);
                      }}
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-300 hover:text-emerald-200"
                    >
                      <span>{voiceE2eeFingerprint}</span>
                      {e2eeCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!e2eePassInput.trim()}
                    onClick={() => {
                      void setVoiceE2eeConfig(true, e2eePassInput.trim());
                    }}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-bold text-white transition"
                  >
                    {voiceE2eeEnabled ? 'Anahtarı Güncelle' : 'E2EE Aktifleştir'}
                  </button>
                  {voiceE2eeEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        void setVoiceE2eeConfig(false, '');
                        setE2eePassInput('');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-xs font-semibold text-rose-200 transition"
                    >
                      Kapat
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowVoiceChat((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium shrink-0 ${
              showVoiceChat
                ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
            }`}
            title="Ses Odası İçi Yazılı Sohbet"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t(language, 'roomChat')}</span>
            {unreadVoiceChatCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500/35 text-[10px] font-bold text-white">
                {unreadVoiceChatCount}
              </span>
            )}
          </button>

          {hasAnyScreenShare && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[11px] font-medium">
              <Tv className="w-3.5 h-3.5 animate-pulse" />
              Ekran Yayını Aktif
            </span>
          )}
          <button
            onClick={openDiagnostics}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 text-white/80 hover:text-emerald-300 transition cursor-pointer"
            title="Bağlantı ve Ağ Teşhisi (Detaylı Bilgi)"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-mono">{ping} ms</span>
            <span>· {activeChannel.bitrateKbps || activeServer?.bitrateKbps || 128} kbps Opus HD</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                voiceTransportMode === 'sfu'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/10 text-white/60'
              }`}
              title={voiceTransportMode === 'sfu' ? 'LiveKit SFU Modu Aktif' : 'P2P Mesh Modu'}
            >
              {voiceTransportMode}
            </span>
          </button>
        </div>
      </header>

      {/* Floating Soundboard Effect Banner */}
      {activeSoundboardEffect && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-pink-600 to-purple-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold animate-bounce border border-white/20">
          <Sparkles className="w-4 h-4" />
          <span>{activeSoundboardEffect.username} ses tahtasından efekt çaldı!</span>
        </div>
      )}

      {/* Floating Priority Speaker Banner */}
      {prioritySpeakerUsername && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-amber-500 text-black px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-black animate-pulse border border-yellow-300">
          <Star className="w-4 h-4 fill-black" />
          <span>{prioritySpeakerUsername} konuşuyor (Öncelikli Konuşmacı)</span>
        </div>
      )}

      {/* Floating Whisper Banner */}
      {activeWhisperFrom && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-purple-600 text-white px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-black animate-pulse border border-purple-300">
          <span>🤫 @{activeWhisperFrom} şu an sana fısıldıyor!</span>
        </div>
      )}

      {/* Radio Bot Widget Drawer */}
      {showRadioBot && (
        <div className="p-4 px-6 border-b border-white/10 bg-slate-950/60 animate-fade-in max-h-[65vh] overflow-y-auto shrink-0">
          <VoiceRadioWidget
            channelName={activeChannel.name}
            initialState={radioBotState}
            onSyncState={(state) => syncRadioState(state)}
            ducked={audioDuckingEnabled && usersInRoom.some((u) => u.isSpeaking)}
            duckFactor={duckingLevelPercent / 100}
          />
        </div>
      )}

      {/* Main Grid or Screen Share Stage */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 overflow-y-auto flex flex-col items-center justify-center">
        {activeChannel.type === 'stage' && activeServer && !hasAnyScreenShare ? (
          <StageChannelView
            server={activeServer}
            channel={activeChannel}
            usersInRoom={usersInRoom}
            currentUser={currentUser}
            isConnected={isConnected}
            onJoin={() => joinVoiceChannel(activeChannel.id)}
            onContextMenuUser={handleOpenUserContextMenu}
          />
        ) : usersInRoom.length === 0 ? (
          /* Empty Room State - iOS style */
          <div className="text-center max-w-sm space-y-5 p-8 rounded-3xl ios-glass-card border border-white/10 shadow-2xl">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mx-auto text-4xl shadow-inner">
              🎙️
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">Oda Müsait</h3>
              <p className="text-xs text-white/60 mt-1 leading-relaxed">
                Ses odasında şu an kimse yok. Arkadaşlarınızla konuşmak veya ekranınızı yayınlamak için odaya katılın.
              </p>
            </div>
            {!isConnected && (
              <button
                onClick={() => joinVoiceChannel(activeChannel.id)}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-white font-medium text-sm rounded-full shadow-lg shadow-emerald-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 mx-auto"
              >
                <Radio className="w-4 h-4" />
                Odaya Bağlan
              </button>
            )}
          </div>
        ) : hasAnyScreenShare ? (
          /* Screen Sharing Stage (Theater or Multi-Stream Grid + Live Annotation) */
          <div className={`w-full h-full min-h-0 flex flex-col gap-3 ${isScreenFocused ? 'max-w-none' : 'max-w-6xl'}`}>
            {totalActiveStreams > 1 && (
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-white/50 shrink-0">Aktif Yayınlar ({totalActiveStreams}):</span>
                  {!isMultiStreamGrid &&
                    remoteEntries.map(([uid]) => {
                      const presenter = onlineUsers.find((u) => u.id === uid);
                      const isActive = activeRemoteStreamEntry?.[0] === uid && !(isScreenSharing && screenStream);
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => setSelectedScreenPresenterId(uid)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition shrink-0 flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-red-500/20 border-red-400/50 text-red-200'
                              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                          }`}
                        >
                          <Tv className="w-3 h-3 text-red-400" />
                          <span>{presenter?.username || 'Yayıncı'}</span>
                        </button>
                      );
                    })}
                </div>
                <button
                  type="button"
                  onClick={() => setIsMultiStreamGrid((p) => !p)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition shrink-0 flex items-center gap-1.5 ${
                    isMultiStreamGrid
                      ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-200'
                      : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>{isMultiStreamGrid ? 'Tek Yayın Odak' : 'Çoklu Yayın Izgarası'}</span>
                </button>
              </div>
            )}
            {/* Instant 30s Rolling Clip Recorder */}
            {typeof MediaRecorder !== 'undefined' && activeClipStream && (
              <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-[11px] shrink-0">
                <div className="flex items-center gap-2 text-white/75 font-semibold">
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t(language, 'streamClipBuffer')}:</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-black/30 border border-white/10 text-amber-300">
                    {clipBufferEnabled ? `${clipBufferedSeconds}s / 30s` : 'Kapalı'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setClipBufferEnabled((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg font-semibold border transition flex items-center gap-1.5 ${
                      clipBufferEnabled
                        ? 'bg-rose-500/20 border-rose-400/40 text-rose-200 hover:bg-rose-500/30'
                        : 'bg-white/10 border-white/15 text-white/85 hover:bg-white/20'
                    }`}
                  >
                    <Scissors className="w-3 h-3" />
                    <span>{clipBufferEnabled ? 'Tamponu Durdur' : t(language, 'streamClipBuffer')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!clipBufferEnabled || clipBufferedSeconds <= 0}
                    onClick={() => {
                      const blob = clipRecorderRef.current?.captureBlob();
                      if (!blob) {
                        appToast('Henüz kaydedilecek klip tamponu oluşmadı.', 'info');
                        return;
                      }
                      downloadClipBlob(blob, 'cakma-stream-clip');
                      appToast('30 saniyelik klip indirildi!', 'success');
                    }}
                    title="Son 30 saniyeyi indir (Kısayol: Alt+C)"
                    className="px-2.5 py-1 rounded-lg font-semibold border border-amber-400/40 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                  >
                    <Download className="w-3 h-3" />
                    <span>{t(language, 'streamClipSave')} (Alt+C)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!clipBufferEnabled || clipBufferedSeconds <= 0 || isSharingClip}
                    onClick={() => void handleShareClipToRoom()}
                    className="px-2.5 py-1 rounded-lg font-semibold border border-cyan-400/40 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                    title="Yakalanan klibi doğrudan ses odası sohbetine yükle ve paylaş"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isSharingClip ? 'Gönderiliyor...' : 'Odaya Gönder'}</span>
                  </button>
                </div>
              </div>
            )}
            {/* Presenter Live Stream Adjustments (FPS / Bitrate without restarting) */}
            {isScreenSharing && screenStream && (
              <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-[11px] shrink-0">
                <span className="text-white/60 font-semibold">Canlı Yayın Ayarları (Kesintisiz):</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-black/30 rounded-lg p-0.5 border border-white/10">
                    {([5, 30, 60] as const).map((fps) => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => {
                          setLiveFps(fps);
                          updateLiveScreenShareSettings({ fps });
                        }}
                        className={`px-2 py-0.5 rounded-md font-semibold transition ${
                          liveFps === fps ? 'bg-blue-500 text-white' : 'text-white/65 hover:text-white'
                        }`}
                      >
                        {fps} FPS
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 bg-black/30 rounded-lg p-0.5 border border-white/10">
                    {[
                      { kbps: 4000, label: '4 Mbps' },
                      { kbps: 8000, label: '8 Mbps' },
                      { kbps: 15000, label: '15 Mbps' },
                      { kbps: 25000, label: '25 Mbps' },
                    ].map((b) => (
                      <button
                        key={b.kbps}
                        type="button"
                        onClick={() => {
                          setLiveBitrateKbps(b.kbps);
                          updateLiveScreenShareSettings({ bitrateKbps: b.kbps });
                        }}
                        className={`px-2 py-0.5 rounded-md font-semibold transition ${
                          liveBitrateKbps === b.kbps ? 'bg-emerald-500 text-white' : 'text-white/65 hover:text-white'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Live Video Player (Single Focus or Multi-Stream Grid) */}
            {isMultiStreamGrid && totalActiveStreams > 1 ? (
              <div className="flex-1 w-full min-h-[260px] grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-y-auto">
                {isScreenSharing && screenStream && (
                  <div className="min-h-[220px] rounded-2xl overflow-hidden border border-white/10 bg-black/50">
                    <VideoStreamPlayer
                      stream={screenStream}
                      title={`${currentUser?.username || 'Sen'} (Ekran Yayını)`}
                      channelId={activeChannel.id}
                      presenterId={currentUser?.id}
                      isLocalStream
                      viewerNames={usersInRoom.filter((u) => u.id !== currentUser?.id).map((u) => u.username)}
                      getStreamStats={getScreenShareStats}
                      laserPoints={laserPoints.filter((pt) => pt.presenterId === currentUser?.id)}
                      onSendLaser={currentUser?.id ? (x, y) => sendScreenShareLaser(currentUser.id, x, y) : undefined}
                      annotateLabel={t(language, 'annotateScreen')}
                      clearAnnotateLabel={t(language, 'clearAnnotations')}
                    />
                  </div>
                )}
                {remoteEntries.map(([uid, stream]) => {
                  const presenter = onlineUsers.find((u) => u.id === uid);
                  return (
                    <div key={uid} className="min-h-[220px] rounded-2xl overflow-hidden border border-white/10 bg-black/50">
                      <VideoStreamPlayer
                        stream={stream}
                        title={`${presenter?.username || 'Kullanıcı'} (Ekran Yayını)`}
                        channelId={activeChannel.id}
                        presenterId={uid}
                        viewerNames={usersInRoom.filter((u) => u.id !== uid).map((u) => u.username)}
                        canSelectQuality
                        selectedQuality={
                          viewerQualityByPresenter[uid] ||
                          ((typeof window !== 'undefined' && (localStorage.getItem('cakma_default_viewer_quality') as ViewerStreamQuality)) || 'auto')
                        }
                        onSelectQuality={(q) => {
                          setViewerQualityByPresenter((prev) => ({ ...prev, [uid]: q }));
                          requestScreenShareQuality(uid, q);
                        }}
                        getStreamStats={getScreenShareStats}
                        laserPoints={laserPoints.filter((pt) => pt.presenterId === uid)}
                        onSendLaser={(x, y) => sendScreenShareLaser(uid, x, y)}
                        annotateLabel={t(language, 'annotateScreen')}
                        clearAnnotateLabel={t(language, 'clearAnnotations')}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="flex-1 w-full min-h-[260px] rounded-2xl overflow-hidden border border-white/10 bg-black/50 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)]">
              {isScreenSharing && screenStream ? (
                <VideoStreamPlayer
                  stream={screenStream}
                  title={`${currentUser?.username || 'Sen'} (Ekran Yayını)`}
                  channelId={activeChannel.id}
                  presenterId={currentUser?.id}
                  isLocalStream
                  viewerNames={usersInRoom.filter((u) => u.id !== currentUser?.id).map((u) => u.username)}
                  isFocused={isScreenFocused}
                  onToggleFocus={() => setIsScreenFocused((p) => !p)}
                  getStreamStats={getScreenShareStats}
                  laserPoints={laserPoints.filter((pt) => pt.presenterId === currentUser?.id)}
                  onSendLaser={currentUser?.id ? (x, y) => sendScreenShareLaser(currentUser.id, x, y) : undefined}
                  annotateLabel={t(language, 'annotateScreen')}
                  clearAnnotateLabel={t(language, 'clearAnnotations')}
                />
              ) : activeRemoteStreamEntry ? (
                <VideoStreamPlayer
                  stream={activeRemoteStreamEntry[1]}
                  title={`${activePresenter?.username || 'Kullanıcı'} (Ekran Yayını)`}
                  channelId={activeChannel.id}
                  presenterId={activeRemoteStreamEntry[0]}
                  viewerNames={usersInRoom.filter((u) => u.id !== activeRemoteStreamEntry[0]).map((u) => u.username)}
                  isFocused={isScreenFocused}
                  onToggleFocus={() => setIsScreenFocused((p) => !p)}
                  canSelectQuality
                  selectedQuality={
                    viewerQualityByPresenter[activeRemoteStreamEntry[0]] ||
                    ((typeof window !== 'undefined' && (localStorage.getItem('cakma_default_viewer_quality') as ViewerStreamQuality)) || 'auto')
                  }
                  onSelectQuality={(q) => {
                    const pid = activeRemoteStreamEntry[0];
                    setViewerQualityByPresenter((prev) => ({ ...prev, [pid]: q }));
                    requestScreenShareQuality(pid, q);
                  }}
                  getStreamStats={getScreenShareStats}
                  laserPoints={laserPoints.filter((pt) => pt.presenterId === activeRemoteStreamEntry[0])}
                  onSendLaser={(x, y) => sendScreenShareLaser(activeRemoteStreamEntry[0], x, y)}
                  annotateLabel={t(language, 'annotateScreen')}
                  clearAnnotateLabel={t(language, 'clearAnnotations')}
                />
              ) : null}
            </div>
            )}

            {/* Bottom Row of Voice Participants */}
            {!isScreenFocused && (
            <div className="shrink-0 flex items-center justify-center gap-2.5 overflow-x-auto py-1 px-2 no-scrollbar">
              {usersInRoom.map((user) => {
                const isThisMe = user.id === currentUser?.id;
                const speaking = isThisMe ? isSpeaking : user.isSpeaking;
                const muted = isThisMe ? isMuted : user.isMuted;
                const deafened = isThisMe ? isDeafened : user.isDeafened;
                const isPresenter = (isThisMe && isScreenSharing) || (!isThisMe && activePresenter?.id === user.id);

                return (
                  <div
                    key={user.id}
                    onContextMenu={(e) => handleOpenUserContextMenu(e, user)}
                    className={`flex items-center gap-2.5 shrink-0 px-3 py-2 rounded-2xl border backdrop-blur-xl transition-all duration-200 cursor-context-menu ${
                      speaking
                        ? 'bg-emerald-500/15 border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                        : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden transition-all duration-200 ${
                          speaking ? 'ring-2 ring-emerald-400' : 'ring-1 ring-white/15'
                        }`}
                      >
                        <AvatarView avatar={user.avatar} alt={user.username} fallback="👤" className="w-full h-full object-cover" />
                      </div>
                      {muted && (
                        <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-0.5 rounded-full border border-black/60 shadow">
                          <MicOff className="w-2.5 h-2.5" />
                        </div>
                      )}
                      {!muted && deafened && (
                        <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-0.5 rounded-full border border-black/60 shadow">
                          <VolumeX className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 pr-1">
                      <div className="text-xs font-semibold text-white/95 max-w-[130px] truncate flex items-center gap-1.5">
                        <span className="truncate">{user.username}</span>
                        {isThisMe && <span className="text-[10px] text-white/45 font-normal">(Sen)</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isPresenter ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                            Yayında
                          </span>
                        ) : speaking ? (
                          <span className="text-[10px] text-emerald-400 font-medium">Konuşuyor</span>
                        ) : muted ? (
                          <span className="text-[10px] text-rose-400/80">Mikrofon Kapalı</span>
                        ) : (
                          <span className="text-[10px] text-white/40">Dinliyor</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        ) : isSpotlightMode && usersInRoom.length > 0 ? (() => {
          const focalUser =
            (spotlightUserId ? usersInRoom.find((u) => u.id === spotlightUserId) : undefined) ||
            usersInRoom.find((u) => (u.id === currentUser?.id ? isSpeaking : u.isSpeaking)) ||
            usersInRoom.find((u) => u.id === currentUser?.id && isWebcamActive) ||
            usersInRoom[0];
          const others = usersInRoom.filter((u) => u.id !== focalUser.id);
          const isFocalMe = focalUser.id === currentUser?.id;
          const focalSpeaking = isFocalMe ? isSpeaking : focalUser.isSpeaking;
          const focalMuted = isFocalMe ? isMuted : focalUser.isMuted;
          return (
            <div className="w-full max-w-5xl h-full min-h-0 flex flex-col gap-3 items-center justify-center">
              <div
                onContextMenu={(e) => handleOpenUserContextMenu(e, focalUser)}
                className={`relative w-full max-w-2xl flex-1 min-h-[220px] max-h-[420px] rounded-3xl ios-glass-card flex flex-col items-center justify-center p-6 shadow-2xl transition-all duration-300 ${
                  focalSpeaking ? 'border-emerald-500/60 bg-emerald-500/[0.08] shadow-emerald-500/20' : ''
                }`}
              >
                <div className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/35 text-[10px] font-bold text-amber-200 flex items-center gap-1">
                  <Focus className="w-3 h-3" />
                  <span>Spotlight</span>
                </div>
                {isFocalMe && isWebcamActive && webcamStream ? (
                  <div className="w-64 h-48 rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-2xl bg-black mb-3">
                    <video
                      ref={(el) => { if (el && el.srcObject !== webcamStream) el.srcObject = webcamStream; }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  </div>
                ) : (
                  <div className={`w-28 h-28 rounded-full bg-gradient-to-b from-white/15 to-white/5 border border-white/15 flex items-center justify-center text-5xl shadow-2xl mb-4 overflow-hidden ${focalSpeaking ? 'ios-halo scale-105' : ''}`}>
                    <AvatarView avatar={focalUser.avatar} alt={focalUser.username} fallback="🎮" />
                  </div>
                )}
                <div className="text-base font-bold text-white flex items-center gap-2">
                  <span>{focalUser.username}</span>
                  {isFocalMe && <span className="text-white/40 text-xs">(Sen)</span>}
                  {focalMuted && <MicOff className="w-4 h-4 text-red-400" />}
                </div>
                <div className="text-xs text-white/50 mt-0.5">
                  {focalSpeaking ? 'Konuşuyor' : focalMuted ? 'Sessize Alındı' : 'Dinliyor'}
                </div>
              </div>
              {others.length > 0 && (
                <div className="shrink-0 w-full flex items-center justify-center gap-2.5 overflow-x-auto no-scrollbar py-1">
                  {others.map((u) => {
                    const isMe = u.id === currentUser?.id;
                    const spk = isMe ? isSpeaking : u.isSpeaking;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSpotlightUserId(u.id)}
                        className={`px-3 py-2 rounded-2xl ios-glass-card border flex items-center gap-2 text-xs transition shrink-0 ${
                          spk ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 hover:bg-white/10'
                        }`}
                        title="Spotlight odağına al"
                      >
                        <div className={`w-7 h-7 rounded-full overflow-hidden bg-white/10 ${spk ? 'ring-2 ring-emerald-400' : ''}`}>
                          <AvatarView avatar={u.avatar} alt={u.username} fallback="🎮" />
                        </div>
                        <span className="font-semibold text-white truncate max-w-[110px]">{u.username}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })() : (
          /* Standard iOS Grid with Voice Pulsating Halo (Centered for any participant count) */
          <div className="w-full max-w-6xl flex flex-wrap items-center justify-center gap-5">
            {usersInRoom.map((user) => {
              const isThisMe = user.id === currentUser?.id;
              const speaking = isThisMe ? isSpeaking : user.isSpeaking;
              const muted = isThisMe ? isMuted : user.isMuted;
              const deafened = isThisMe ? isDeafened : user.isDeafened;

              return (
                <div
                  key={user.id}
                  onContextMenu={(e) => handleOpenUserContextMenu(e, user)}
                  className={`relative w-full max-w-[260px] sm:w-64 aspect-video rounded-3xl ios-glass-card flex flex-col items-center justify-center p-5 shadow-xl transition-all duration-300 cursor-context-menu ${
                    speaking
                      ? 'border-emerald-500/60 bg-emerald-500/[0.08] shadow-emerald-500/20 shadow-2xl'
                      : ''
                  }`}
                >
                  {/* Remote user volume popup trigger */}
                  {!isThisMe && isConnected && (
                    <div className="absolute top-3 right-3 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setVolumePopoverUserId(volumePopoverUserId === user.id ? null : user.id);
                        }}
                        className={`p-1.5 rounded-full transition-all text-xs border ${
                          userLocalMutes[user.id]
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : (userVolumes[user.id] ?? 100) !== 100
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-white/5 hover:bg-white/15 text-white/60 hover:text-white border-white/10'
                        }`}
                        title="Kullanıcı Ses Düzeyi (%0 - %200)"
                      >
                        {userLocalMutes[user.id] ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {volumePopoverUserId === user.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-8 z-50 w-52 p-3 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/15 shadow-2xl space-y-2 text-left"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-white">
                            <span>Kullanıcı Sesi</span>
                            <span className="text-emerald-400 font-mono">
                              {userLocalMutes[user.id] ? 'Sessiz' : `%${userVolumes[user.id] ?? 100}`}
                            </span>
                          </div>

                          <input
                            type="range"
                            min="0"
                            max="200"
                            step="5"
                            value={userLocalMutes[user.id] ? 0 : (userVolumes[user.id] ?? 100)}
                            onChange={(e) => setUserVolume(user.id, Number(e.target.value))}
                            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                          />

                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <button
                              onClick={() => toggleUserLocalMute(user.id)}
                              className={`px-2 py-0.5 rounded-md border font-medium transition ${
                                userLocalMutes[user.id]
                                  ? 'bg-red-500 text-white border-red-500'
                                  : 'bg-white/10 hover:bg-white/20 text-white/80 border-white/10'
                              }`}
                            >
                              {userLocalMutes[user.id] ? 'Sesi Aç' : 'Bende Sustur'}
                            </button>
                            <button
                              onClick={() => setUserVolume(user.id, 100)}
                              className="text-white/40 hover:text-white/80 transition"
                            >
                              Sıfırla (%100)
                            </button>
                          </div>

                          {/* TeamSpeak Whisper Button */}
                          <div className="pt-2 border-t border-white/10">
                            <button
                              type="button"
                              onMouseDown={() => sendWhisper(user.id, true)}
                              onMouseUp={() => sendWhisper(user.id, false)}
                              onTouchStart={() => sendWhisper(user.id, true)}
                              onTouchEnd={() => sendWhisper(user.id, false)}
                              className="w-full py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-[11px] font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                              title="Basılı tutarak sadece bu kullanıcıya fısıldayın"
                            >
                              <span>🤫 Fısılda (Basılı Tut)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Avatar with Halo Effect */}
                  <div className="relative mb-3">
                    {isThisMe && isWebcamActive && webcamStream ? (
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-emerald-500 shadow-2xl bg-black">
                        <video
                          ref={(el) => {
                            if (el && el.srcObject !== webcamStream) el.srcObject = webcamStream;
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover scale-x-[-1]"
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-20 h-20 rounded-full bg-gradient-to-b from-white/15 to-white/5 border border-white/15 flex items-center justify-center text-4xl shadow-2xl transition-all duration-300 overflow-hidden ${
                          speaking ? 'ios-halo scale-105' : ''
                        }`}
                      >
                        <AvatarView avatar={user.avatar} alt={user.username} fallback="🎮" />
                      </div>
                    )}

                    {/* Mute badge */}
                    {muted && (
                      <div className="absolute -bottom-1 -right-1 bg-red-500 p-1.5 rounded-full text-white shadow-lg border border-black/40">
                        <MicOff className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {deafened && (
                      <div className="absolute -bottom-1 -left-1 bg-red-500 p-1.5 rounded-full text-white shadow-lg border border-black/40">
                        <VolumeX className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {user.isHandRaised && (
                      <div
                        className="absolute -top-2 -right-2 bg-amber-500 text-black p-1.5 rounded-full shadow-lg border border-black/30 animate-bounce"
                        title="Söz İstiyor"
                      >
                        <Hand className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Username & Live Siri / Voice Status */}
                  <div className="text-center space-y-1">
                    <div className="font-semibold text-white text-sm tracking-tight truncate max-w-[220px]">
                      {user.username} {isThisMe && <span className="text-white/40 text-xs">(Sen)</span>}
                    </div>

                    <div>
                      {speaking ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Konuşuyor
                        </span>
                      ) : muted ? (
                        <span className="text-[11px] text-red-400/90 font-medium">Sessize Alındı</span>
                      ) : (
                        <span className="text-[11px] text-white/40">Dinliyor</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Push-to-Talk notification banner */}
      {inputMode === 'ptt' && isConnected && (
        <div className="bg-[#121214]/80 backdrop-blur-md py-2 px-4 text-center text-xs flex items-center justify-center gap-2 border-t border-white/5">
          <span className="text-white/70">
            Bas-Konuş: Konuşmak için <kbd className="px-2 py-0.5 bg-white/10 rounded font-mono text-white text-[11px] border border-white/10">[{pttKey}]</kbd> tuşuna basın.
          </span>
          {isPttActive && (
            <span className="text-emerald-400 font-bold animate-pulse ml-2">● MİKROFON AÇIK</span>
          )}
        </div>
      )}

      {/* iOS Floating Control Dock (FaceTime Style Capsule Bar) */}
      <footer className="min-h-[4.5rem] py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-center px-2 sm:px-6 shrink-0 z-30">
        <div className="ios-glass px-3 sm:px-6 py-2 rounded-3xl sm:rounded-full shadow-2xl flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 sm:gap-3 border border-white/15 max-w-[calc(100vw-16px)]">
          {!isConnected ? (
            <button
              onClick={() => joinVoiceChannel(activeChannel.id)}
              className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-white font-medium text-sm rounded-full shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2"
            >
              <Radio className="w-4 h-4" />
              Ses Odasına Katıl
            </button>
          ) : (
            <>
              {/* Mute Button */}
              <button
                onClick={toggleMute}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                  isMuted
                    ? 'bg-red-500 text-white shadow-red-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Deafen Button */}
              <button
                onClick={toggleDeafen}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                  isDeafened
                    ? 'bg-red-500 text-white shadow-red-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
              >
                <Headphones className="w-5 h-5" />
              </button>

              {/* Screen Share Button */}
              <button
                onClick={isScreenSharing ? stopScreenShare : () => setIsGoLiveOpen(true)}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                  isScreenSharing
                    ? 'bg-blue-500 text-white shadow-blue-500/30 ring-2 ring-blue-400 animate-pulse'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isScreenSharing ? 'Ekran Paylaşımını Durdur' : 'Ekranını Canlı Yayınla'}
              >
                <Monitor className="w-5 h-5" />
              </button>

              {/* Webcam Video Button */}
              <button
                onClick={toggleWebcam}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                  isWebcamActive
                    ? 'bg-emerald-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-400 animate-pulse'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isWebcamActive ? 'Kamerayı Kapat' : 'Kamerayı Aç (Görüntülü Sohbet)'}
              >
                {isWebcamActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              {/* Camera Screen Share & Video already above; keep core controls clean + Activities popover */}
              {/* Raise Hand Button */}
              <button
                onClick={toggleRaiseHand}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                  currentUser?.isHandRaised
                    ? 'bg-amber-500 text-black shadow-amber-500/30 ring-2 ring-amber-300'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title="El Kaldır / Söz İste"
              >
                <Hand className="w-5 h-5" />
              </button>

              {/* Priority Speaker Toggle (Admin) */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={togglePrioritySpeaker}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                    isPrioritySpeakerActive
                      ? 'bg-amber-500 text-black shadow-amber-500/30 ring-2 ring-amber-300 font-bold'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title="Öncelikli Konuşmacı (Diğer Sesleri Otomatik Kıs)"
                >
                  <Star className={`w-5 h-5 ${isPrioritySpeakerActive ? 'fill-black' : ''}`} />
                </button>
              )}

              {/* Consolidated Activities & Tools Popover */}
              <div ref={activitiesMenuRef} className="relative">
                {isActivitiesMenuOpen && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 w-[300px] sm:w-[332px] p-2.5 rounded-2xl ios-glass border border-white/15 shadow-2xl grid grid-cols-2 gap-1.5 animate-fade-in">
                    <button
                      type="button"
                      onClick={() => {
                        setIsWatchTogetherOpen(true);
                        setIsActivitiesMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-200 text-xs font-semibold transition text-left"
                    >
                      <Film className="w-4 h-4 shrink-0" />
                      <span className="truncate">Birlikte İzle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMiniGamesOpen(true);
                        setIsActivitiesMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/25 text-purple-200 text-xs font-semibold transition text-left"
                    >
                      <Gamepad2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">Mini Oyunlar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsWhiteboardOpen(true);
                        setIsActivitiesMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/25 text-pink-200 text-xs font-semibold transition text-left"
                    >
                      <Palette className="w-4 h-4 shrink-0" />
                      <span className="truncate">Ortak Beyaz Tahta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSpatialAudioOpen(true);
                        setIsActivitiesMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/25 text-cyan-200 text-xs font-semibold transition text-left"
                    >
                      <Compass className="w-4 h-4 shrink-0" />
                      <span className="truncate">3D Uzamsal Ses</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSoundboardOpen(true);
                        setIsActivitiesMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-200 text-xs font-semibold transition text-left"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span className="truncate">Ses Tahtası</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsWhisperListsOpen(true);
                        setIsActivitiesMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/25 text-teal-200 text-xs font-semibold transition text-left"
                    >
                      <Radio className="w-4 h-4 shrink-0" />
                      <span className="truncate">Fısıltı Listeleri</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        toggleWebcamBlur();
                        setIsActivitiesMenuOpen(false);
                      }}
                      className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition text-left ${
                        webcamBlurEnabled
                          ? 'bg-sky-500/25 border-sky-400/40 text-sky-100'
                          : 'bg-white/[0.06] hover:bg-white/10 border-white/10 text-white/80'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Droplet className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Kamera Blur</span>
                      </span>
                      <span className="text-[11px] font-mono opacity-80 shrink-0">
                        {webcamBlurEnabled ? 'Açık' : 'Kapalı'}
                      </span>
                    </button>

                    {typeof window !== 'undefined' &&
                      ('__TAURI_INTERNALS__' in window ||
                        window.location.hostname === 'tauri.localhost' ||
                        window.location.protocol === 'tauri:') && (
                        <button
                          type="button"
                          onClick={() => {
                            toggleOverlayWindow();
                            setIsActivitiesMenuOpen(false);
                          }}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/25 text-indigo-200 text-xs font-semibold transition text-left"
                        >
                          <Layers className="w-4 h-4 shrink-0" />
                          <span className="truncate">Oyun İçi Overlay</span>
                        </button>
                      )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsActivitiesMenuOpen((prev) => !prev)}
                  className={`h-11 px-3.5 rounded-full border flex items-center gap-2 text-xs font-semibold transition-all duration-200 shadow-md ${
                    isActivitiesMenuOpen
                      ? 'bg-indigo-600 border-indigo-400 text-white ring-2 ring-indigo-400/60'
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                  }`}
                  title={t(language, 'activitiesMenu')}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">{t(language, 'activitiesMenu')}</span>
                </button>
              </div>

              <div className="w-[1px] h-6 bg-white/20 mx-1" />

              {/* Hang Up Button */}
              <button
                onClick={leaveVoiceChannel}
                className="px-5 h-11 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-red-500/30 flex items-center gap-2"
                title="Ayrıl"
              >
                <PhoneOff className="w-4 h-4" />
                <span className="hidden sm:inline">Ayrıl</span>
              </button>
            </>
          )}
        </div>
      </footer>

      {/* Soundboard Modal */}
      <SoundboardModal
        isOpen={isSoundboardOpen}
        onClose={() => setIsSoundboardOpen(false)}
        onPlaySound={(soundId) => playSoundboard(soundId)}
        connectedVoiceChannelName={activeChannel.name}
      />

      {/* Whiteboard Live Canvas Modal */}
      <WhiteboardModal
        isOpen={isWhiteboardOpen}
        onClose={() => setIsWhiteboardOpen(false)}
        channelName={activeChannel.name}
      />

      {/* Watch Together YouTube Cinema Modal */}
      {isWatchTogetherOpen && (
        <WatchTogetherModal
          channelId={activeChannel.id}
          onClose={() => setIsWatchTogetherOpen(false)}
        />
      )}

      {/* 3D Spatial Audio Modal */}
      {isSpatialAudioOpen && (
        <SpatialAudioModal
          participants={usersInRoom}
          onClose={() => setIsSpatialAudioOpen(false)}
        />
      )}

      {/* Mini Games Modal */}
      {isMiniGamesOpen && (
        <MiniGamesModal
          channelId={activeChannel.id}
          onClose={() => setIsMiniGamesOpen(false)}
        />
      )}

      {/* TeamSpeak-style Go Live Screen Share Settings Modal */}
      <GoLiveModal
        isOpen={isGoLiveOpen}
        onClose={() => setIsGoLiveOpen(false)}
        onGoLive={startScreenShare}
      />

      {/* Whisper Lists Modal */}
      {isWhisperListsOpen && (
        <WhisperListsModal onClose={() => setIsWhisperListsOpen(false)} />
      )}

      {/* Voice User Right-Click Context Menu (Portal to body for exact cursor positioning) */}
      <VoiceUserContextMenu
        menu={userContextMenu}
        onClose={() => setUserContextMenu(null)}
        onOpenSpatialAudio={() => setIsSpatialAudioOpen(true)}
      />

      {/* Voice Channel Side Chat Drawer */}
      {showVoiceChat && (
        <aside className="fixed top-14 right-0 bottom-0 w-80 max-w-[90vw] z-40 bg-[#14151c]/95 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl animate-fade-in">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-xs font-bold text-white truncate">#{activeChannel.name} Sohbeti</span>
            </div>
            <button
              type="button"
              onClick={() => setShowVoiceChat(false)}
              className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {(messagesMap[activeChannel.id] || []).length === 0 ? (
              <div className="text-center text-[11px] text-white/40 py-8">
                Bu ses odasında henüz yazılı mesaj yok.
              </div>
            ) : (
              (messagesMap[activeChannel.id] || []).map((msg) => (
                <div key={msg.id} className="group bg-white/[0.04] border border-white/[0.06] rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-white truncate">{msg.author.username}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => addReaction(msg.id, '👍')}
                        className="opacity-0 group-hover:opacity-100 px-1 py-0.2 rounded bg-white/10 hover:bg-white/20 text-[10px] transition"
                        title="Beğen"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => addReaction(msg.id, '🔥')}
                        className="opacity-0 group-hover:opacity-100 px-1 py-0.2 rounded bg-white/10 hover:bg-white/20 text-[10px] transition"
                        title="Ateş"
                      >
                        🔥
                      </button>
                      <span className="text-[9px] text-white/35 ml-0.5">{msg.timestamp}</span>
                    </div>
                  </div>
                  {msg.content && (
                    <div className="text-xs text-white/85 break-words">
                      <InlineMarkdown text={msg.content} />
                    </div>
                  )}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                      {msg.attachments.map((att) => {
                        const resolved = resolveMediaUrl(att.url, currentServerHost);
                        if (att.type?.startsWith('image/')) {
                          return (
                            <a key={att.id} href={resolved} target="_blank" rel="noreferrer" className="block">
                              <img
                                src={resolved}
                                alt={att.name}
                                className="max-h-36 rounded-lg border border-white/10 object-cover"
                              />
                            </a>
                          );
                        }
                        return (
                          <a
                            key={att.id}
                            href={resolved}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-cyan-300"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span className="truncate max-w-[180px]">{att.name}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {Object.entries(msg.reactions).map(([emoji, users]) => {
                        const hasMine = Boolean(currentUser && users.includes(currentUser.username));
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => addReaction(msg.id, emoji)}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition ${
                              hasMine
                                ? 'bg-blue-500/20 border-blue-400/50 text-blue-200 font-semibold'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span>{users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={voiceChatEndRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!voiceChatInput.trim()) return;
              sendMessage(voiceChatInput.trim());
              setVoiceChatInput('');
            }}
            className="p-3 border-t border-white/10 flex items-center gap-2"
          >
            <input
              ref={voiceChatFileRef}
              type="file"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setVoiceChatUploading(true);
                try {
                  const uploaded = await uploadAttachmentFile(currentServerHost, file, 10);
                  sendMessage('', [uploaded]);
                } catch (err: any) {
                  appToast(err?.message || 'Dosya yüklenemedi.', 'error');
                } finally {
                  setVoiceChatUploading(false);
                }
              }}
            />
            <button
              type="button"
              disabled={voiceChatUploading}
              onClick={() => voiceChatFileRef.current?.click()}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white disabled:opacity-40 transition"
              title="Dosya veya Görsel Gönder"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            <input
              type="text"
              value={voiceChatInput}
              onChange={(e) => setVoiceChatInput(e.target.value)}
              placeholder={t(language, 'typeMessage')}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/35 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!voiceChatInput.trim()}
              className="p-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </aside>
      )}
      <LiveCaptionsOverlay
        enabled={liveCaptionsEnabled}
        channelId={activeChannel.id}
        channelName={activeChannel.name}
        activeStream={activeClipStream}
        hasActiveStream={hasAnyScreenShare}
        streamLabel={
          isScreenSharing
            ? currentUser?.activity?.name || currentUser?.username || 'Yayın'
            : activePresenter?.activity?.name || activePresenter?.username || 'Yayın'
        }
        onClose={() => setLiveCaptionsEnabled(false)}
      />
    </div>
  );
};
