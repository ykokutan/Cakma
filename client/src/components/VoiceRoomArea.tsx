import React, { useRef, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
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
} from 'lucide-react';

// Video component for displaying live WebRTC screen share stream
const VideoStreamPlayer: React.FC<{
  stream: MediaStream;
  title: string;
  isFocused?: boolean;
  onToggleFocus?: () => void;
}> = ({
  stream,
  title,
  isFocused,
  onToggleFocus,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

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
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black/80 border border-white/10 shadow-2xl flex items-center justify-center group">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />
      {/* iOS Floating Stream Badge */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 text-xs font-medium text-white shadow-lg">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
        <span className="w-2 h-2 rounded-full bg-red-500 -ml-4" />
        <span>CANLI · {title}</span>
      </div>

      {/* Action Buttons: PiP + Focus Mode + Fullscreen */}
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
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
    ping,
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
    isPrioritySpeakerActive,
    prioritySpeakerUsername,
    togglePrioritySpeaker,
    activeWhisperFrom,
    sendWhisper,
    toggleRaiseHand,
    toggleOverlayWindow,
    messagesMap,
    sendMessage,
  } = useSocket();

  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);
  const [isWhisperListsOpen, setIsWhisperListsOpen] = useState(false);
  const [showRadioBot, setShowRadioBot] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [voiceChatInput, setVoiceChatInput] = useState('');
  const [audioDuckingEnabled, setAudioDuckingEnabled] = useState(true);
  const [volumePopoverUserId, setVolumePopoverUserId] = useState<string | null>(null);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [isWatchTogetherOpen, setIsWatchTogetherOpen] = useState(false);
  const [isSpatialAudioOpen, setIsSpatialAudioOpen] = useState(false);
  const [isGoLiveOpen, setIsGoLiveOpen] = useState(false);
  const [isMiniGamesOpen, setIsMiniGamesOpen] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [userContextMenu, setUserContextMenu] = useState<{ user: any; x: number; y: number } | null>(null);

  const handleOpenUserContextMenu = (e: React.MouseEvent, user: any) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 270);
    const y = Math.min(e.clientY, window.innerHeight - 340);
    setUserContextMenu({ user, x: Math.max(8, x), y: Math.max(8, y) });
  };

  if (!activeChannel || activeChannel.type !== 'voice') return null;

  const isConnected = connectedVoiceChannelId === activeChannel.id;
  const usersInRoom = onlineUsers.filter(
    (u) => u.currentVoiceChannelId === activeChannel.id
  );

  // Determine active screen share (local or remote)
  const activeRemoteStreamEntry = Array.from(remoteScreenStreams.entries())[0];
  const activePresenter = activeRemoteStreamEntry
    ? onlineUsers.find((u) => u.id === activeRemoteStreamEntry[0])
    : null;

  const hasAnyScreenShare = isScreenSharing || !!activeRemoteStreamEntry;

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
                {usersInRoom.length} Katılımcı
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-white/60 overflow-x-auto no-scrollbar py-1 max-w-[56vw] sm:max-w-[72vw] shrink-0">
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
                  : 'Kanalı Kaydet'}
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
            <span>Radyo Botu</span>
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
            <span>Ducking</span>
          </button>

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
            <span>Oda Sohbeti</span>
            {(messagesMap[activeChannel.id]?.length || 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500/30 text-[10px] font-bold">
                {messagesMap[activeChannel.id].length}
              </span>
            )}
          </button>

          {/* Whiteboard / Live Canvas */}
          <button
            onClick={() => setIsWhiteboardOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 transition text-xs font-medium shadow-sm shrink-0"
            title="Ortak Canlı Çizim & Tuval (Whiteboard)"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Ortak Çizim</span>
          </button>

          {/* Watch Together */}
          <button
            onClick={() => setIsWatchTogetherOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition text-xs font-medium shadow-sm shrink-0"
            title="Birlikte YouTube İzle (Watch Together)"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Birlikte İzle</span>
          </button>

          {/* 3D Spatial Audio */}
          <button
            onClick={() => setIsSpatialAudioOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition text-xs font-medium shadow-sm shrink-0"
            title="TeamSpeak 3D Konumsal Ses (Stereo Panning)"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>3D Ses</span>
          </button>

          {/* Mini Games */}
          <button
            onClick={() => setIsMiniGamesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-500/50 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 transition text-xs font-bold shadow-md shadow-purple-600/20 shrink-0 animate-pulse hover:animate-none"
            title="Aktiviteler & Mini Oyunlar (XOX, Hızlı Yazma)"
          >
            <Gamepad2 className="w-4 h-4 text-purple-300" />
            <span>Mini Oyunlar</span>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
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
            <span>· {activeServer?.bitrateKbps || 128} kbps Opus HD</span>
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
          />
        </div>
      )}

      {/* Main Grid or Screen Share Stage */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 overflow-y-auto flex flex-col items-center justify-center">
        {usersInRoom.length === 0 ? (
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
          /* Screen Sharing Stage (Theater Layout: Video on top, Sleek Participant Strip Below) */
          <div className={`w-full h-full min-h-0 flex flex-col gap-3 ${isScreenFocused ? 'max-w-none' : 'max-w-6xl'}`}>
            {/* Live Video Player */}
            <div className="flex-1 w-full min-h-[260px] rounded-2xl overflow-hidden border border-white/10 bg-black/50 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)]">
              {isScreenSharing && screenStream ? (
                <VideoStreamPlayer
                  stream={screenStream}
                  title={`${currentUser?.username || 'Sen'} (Ekran Yayını)`}
                  isFocused={isScreenFocused}
                  onToggleFocus={() => setIsScreenFocused((p) => !p)}
                />
              ) : activeRemoteStreamEntry ? (
                <VideoStreamPlayer
                  stream={activeRemoteStreamEntry[1]}
                  title={`${activePresenter?.username || 'Kullanıcı'} (Ekran Yayını)`}
                  isFocused={isScreenFocused}
                  onToggleFocus={() => setIsScreenFocused((p) => !p)}
                />
              ) : null}
            </div>

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
        ) : (
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

              {/* Soundboard Button */}
              <button
                onClick={() => setIsSoundboardOpen(true)}
                className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500/20 to-pink-500/20 hover:from-amber-500/30 hover:to-pink-500/30 border border-pink-500/30 text-pink-300 flex items-center justify-center transition shadow-md hover:scale-105 active:scale-95"
                title="Ses Tahtası (Soundboard Efektleri)"
              >
                <Sparkles className="w-5 h-5" />
              </button>

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

              {/* Whisper Lists Button */}
              <button
                onClick={() => setIsWhisperListsOpen(true)}
                className="w-11 h-11 rounded-full bg-teal-500/15 hover:bg-teal-500/30 border border-teal-500/30 text-teal-300 flex items-center justify-center transition shadow-md"
                title="Fısıltı Listeleri (Whisper Lists)"
              >
                <Radio className="w-5 h-5" />
              </button>

              {/* Tauri In-Game Speakers Overlay Toggle */}
              {typeof window !== 'undefined' &&
                ('__TAURI_INTERNALS__' in window ||
                  window.location.hostname === 'tauri.localhost' ||
                  window.location.protocol === 'tauri:') && (
                  <button
                    onClick={toggleOverlayWindow}
                    className="w-11 h-11 rounded-full bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 flex items-center justify-center transition shadow-md"
                    title="Oyun İçi Konuşanlar Overlay Penceresini Aç/Kapat"
                  >
                    <Layers className="w-5 h-5" />
                  </button>
                )}

              {/* Mini Games & Activities Button */}
              <button
                onClick={() => setIsMiniGamesOpen(true)}
                className={`w-11 h-11 rounded-full border flex items-center justify-center transition shadow-md hover:scale-105 active:scale-95 ${
                  isMiniGamesOpen
                    ? 'bg-purple-600 border-purple-400 text-white shadow-purple-600/30 ring-2 ring-purple-400'
                    : 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30 text-purple-300'
                }`}
                title="Aktiviteler & Mini Oyunlar (XOX, Hızlı Yazma Yarışı)"
              >
                <Gamepad2 className="w-5 h-5" />
              </button>

              {/* Watch Together YouTube Cinema Button */}
              <button
                onClick={() => setIsWatchTogetherOpen(true)}
                className={`w-11 h-11 rounded-full border flex items-center justify-center transition shadow-md hover:scale-105 active:scale-95 ${
                  isWatchTogetherOpen
                    ? 'bg-red-600 border-red-400 text-white shadow-red-600/30 ring-2 ring-red-400'
                    : 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-300'
                }`}
                title="Birlikte İzle (Canlı YouTube Sineması)"
              >
                <Film className="w-5 h-5" />
              </button>

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
                <div key={msg.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-bold text-white truncate">{msg.author.username}</span>
                    <span className="text-[9px] text-white/35 shrink-0">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-white/85 break-words">{msg.content}</p>
                </div>
              ))
            )}
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
              type="text"
              value={voiceChatInput}
              onChange={(e) => setVoiceChatInput(e.target.value)}
              placeholder="Odaya mesaj yaz..."
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
    </div>
  );
};
