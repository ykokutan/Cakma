import React, { useRef, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { SoundboardModal } from './SoundboardModal';
import { VoiceRadioWidget } from './VoiceRadioWidget';
import { WhiteboardModal } from './WhiteboardModal';
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
} from 'lucide-react';

// Video component for displaying live WebRTC screen share stream
const VideoStreamPlayer: React.FC<{ stream: MediaStream; title: string }> = ({
  stream,
  title,
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

      {/* Fullscreen Button */}
      <button
        onClick={handleFullscreen}
        className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/90 backdrop-blur-md rounded-full text-white/80 hover:text-white transition border border-white/10 opacity-0 group-hover:opacity-100 shadow-lg"
        title="Tam Ekran Yap"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export const VoiceRoomArea: React.FC = () => {
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
  } = useSocket();

  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);
  const [showRadioBot, setShowRadioBot] = useState(false);
  const [volumePopoverUserId, setVolumePopoverUserId] = useState<string | null>(null);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);

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
    <div className="flex-1 bg-transparent flex flex-col h-full overflow-hidden relative">
      {/* iOS Translucent Header */}
      <header className="h-14 px-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#16161a]/60 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm tracking-tight flex items-center gap-2">
              {activeChannel.name}
              <span className="text-[11px] bg-white/10 text-white/80 font-normal px-2 py-0.5 rounded-full">
                FaceTime / WebRTC Odası
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-white/60">
          {/* Voice Room Audio Recorder */}
          {isConnected && (
            <button
              onClick={isVoiceRecording ? stopVoiceRecording : startVoiceRecording}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium ${
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
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-medium ${
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

          {/* Whiteboard / Live Canvas */}
          <button
            onClick={() => setIsWhiteboardOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 transition text-xs font-medium shadow-sm"
            title="Ortak Canlı Çizim & Tuval (Whiteboard)"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Ortak Çizim</span>
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

      {/* Radio Bot Widget Drawer */}
      {showRadioBot && (
        <div className="p-4 px-6 border-b border-white/10 bg-slate-950/60 animate-fade-in">
          <VoiceRadioWidget
            channelName={activeChannel.name}
            initialState={radioBotState}
            onSyncState={(state) => syncRadioState(state)}
          />
        </div>
      )}

      {/* Main Grid or Screen Share Stage */}
      <div className="flex-1 p-6 overflow-y-auto flex flex-col items-center justify-center">
        {usersInRoom.length === 0 ? (
          /* Empty Room State - iOS style */
          <div className="text-center max-w-sm space-y-5 p-8 rounded-3xl ios-glass-card shadow-2xl">
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
          /* Screen Sharing Stage (Split Screen: Video on top, iOS Avatars Below) */
          <div className="w-full h-full flex flex-col gap-4 max-w-6xl">
            {/* Live Video Player */}
            <div className="flex-1 w-full min-h-[320px] rounded-2xl overflow-hidden shadow-2xl">
              {isScreenSharing && screenStream ? (
                <VideoStreamPlayer
                  stream={screenStream}
                  title={`${currentUser?.username || 'Sen'} (Ekran Yayını)`}
                />
              ) : activeRemoteStreamEntry ? (
                <VideoStreamPlayer
                  stream={activeRemoteStreamEntry[1]}
                  title={`${activePresenter?.username || 'Kullanıcı'} (Ekran Yayını)`}
                />
              ) : null}
            </div>

            {/* Bottom Row of Voice Participants */}
            <div className="h-24 flex items-center justify-center gap-4 overflow-x-auto py-1">
              {usersInRoom.map((user) => {
                const isThisMe = user.id === currentUser?.id;
                const speaking = isThisMe ? isSpeaking : user.isSpeaking;
                const muted = isThisMe ? isMuted : user.isMuted;

                return (
                  <div
                    key={user.id}
                    className="flex flex-col items-center gap-1.5 shrink-0 px-3 py-2 rounded-2xl ios-glass-card"
                  >
                    <div className="relative">
                      <div
                        className={`w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl transition-all duration-200 ${
                          speaking ? 'ios-halo' : ''
                        }`}
                      >
                        {user.avatar || '👤'}
                      </div>
                      {muted && (
                        <div className="absolute -bottom-1 -right-1 bg-red-500/90 text-white p-0.5 rounded-full border border-black/40">
                          <MicOff className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-white/90 max-w-[130px] truncate">
                      {user.username}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Standard iOS Grid with Voice Pulsating Halo */
          <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 auto-rows-fr">
            {usersInRoom.map((user) => {
              const isThisMe = user.id === currentUser?.id;
              const speaking = isThisMe ? isSpeaking : user.isSpeaking;
              const muted = isThisMe ? isMuted : user.isMuted;
              const deafened = isThisMe ? isDeafened : user.isDeafened;

              return (
                <div
                  key={user.id}
                  className={`relative aspect-square sm:aspect-video rounded-3xl ios-glass-card flex flex-col items-center justify-center p-5 shadow-xl transition-all duration-300 ${
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
                        className={`w-20 h-20 rounded-full bg-gradient-to-b from-white/15 to-white/5 border border-white/15 flex items-center justify-center text-4xl shadow-2xl transition-all duration-300 ${
                          speaking ? 'ios-halo scale-105' : ''
                        }`}
                      >
                        {user.avatar || '🎮'}
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
      <footer className="h-20 flex items-center justify-center px-6 shrink-0 z-30">
        <div className="ios-glass px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-4 border border-white/15">
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
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
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
    </div>
  );
};
