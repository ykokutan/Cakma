import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { AvatarView } from './AvatarView';
import { appPrompt } from '../utils/appDialogs';
import { User } from '../types';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Headphones,
  Hand,
  Activity,
  Compass,
  Star,
  MessageSquare,
  UserX,
} from 'lucide-react';

interface VoiceUserContextMenuProps {
  menu: { user: User; x: number; y: number } | null;
  onClose: () => void;
  onOpenSpatialAudio?: () => void;
}

export const VoiceUserContextMenu: React.FC<VoiceUserContextMenuProps> = ({
  menu,
  onClose,
  onOpenSpatialAudio,
}) => {
  const {
    currentUser,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    toggleRaiseHand,
    ping,
    openDiagnostics,
    userVolumes,
    setUserVolume,
    userLocalMutes,
    toggleUserLocalMute,
    sendWhisper,
    openDirectMessage,
    adminKickUser,
    serverMuteUser,
    activeServer,
    userAudioEq,
    setUserAudioEq,
  } = useSocket();

  useEffect(() => {
    if (!menu) return;
    const handleClose = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const target = menu.user;
  const isMe = target.id === currentUser?.id;
  const targetMuted = Boolean(userLocalMutes[target.id]);
  const targetVol = targetMuted ? 0 : (userVolumes[target.id] ?? 100);

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[9999] w-64 rounded-2xl bg-[#11131b]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-2 space-y-1.5 animate-fade-in"
    >
      {/* User Header */}
      <div className="flex items-center gap-2.5 px-2 py-1.5 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
          <AvatarView avatar={target.avatar} alt={target.username} fallback="👤" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
            <span className="truncate">{target.username}</span>
            {isMe && <span className="text-[10px] text-white/45 font-normal">(Sen)</span>}
          </div>
          <div className="text-[10px] text-white/45">
            {target.role === 'admin' ? 'Sistem Yöneticisi' : 'Katılımcı'}
          </div>
        </div>
      </div>

      {/* Remote User Volume & Mute */}
      {!isMe ? (
        <div className="p-2 rounded-xl bg-white/[0.04] border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/75 font-semibold flex items-center gap-1.5">
              {targetMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              Kullanıcı Sesi
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {targetMuted ? 'Sessiz' : `%${targetVol}`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={targetVol}
            onChange={(e) => setUserVolume(target.id, Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
          />
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => toggleUserLocalMute(target.id)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition ${
                targetMuted
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
              }`}
            >
              {targetMuted ? 'Sesi Aç' : 'Bende Sustur'}
            </button>
            <button
              type="button"
              onClick={() => setUserVolume(target.id, 100)}
              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/60 hover:text-white transition"
            >
              %100
            </button>
          </div>

          {/* Per-user Equalizer & Normalizer */}
          {(() => {
            const eq = userAudioEq[target.id] || { bass: 0, treble: 0, normalize: false };
            return (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-white/60 uppercase tracking-wider">Kişiye Özel EQ</span>
                  {(eq.bass !== 0 || eq.treble !== 0 || eq.normalize) && (
                    <button
                      type="button"
                      onClick={() => setUserAudioEq(target.id, { bass: 0, treble: 0, normalize: false })}
                      className="text-blue-300 hover:text-white"
                    >
                      Sıfırla
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-white/60 mb-0.5">
                      <span>Bas</span>
                      <span className="font-mono">{eq.bass > 0 ? `+${eq.bass}` : eq.bass} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={eq.bass}
                      onChange={(e) => setUserAudioEq(target.id, { bass: Number(e.target.value) })}
                      className="w-full accent-indigo-400 cursor-pointer h-1 bg-white/10 rounded"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-white/60 mb-0.5">
                      <span>Tiz</span>
                      <span className="font-mono">{eq.treble > 0 ? `+${eq.treble}` : eq.treble} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={eq.treble}
                      onChange={(e) => setUserAudioEq(target.id, { treble: Number(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer h-1 bg-white/10 rounded"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUserAudioEq(target.id, { normalize: !eq.normalize })}
                  className={`w-full py-1 rounded-lg text-[10px] font-bold border transition ${
                    eq.normalize
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
                  }`}
                >
                  {eq.normalize ? '✓ Ses Dengeleme (Normalize) Açık' : 'Ses Dengeleme (Normalize) Aç'}
                </button>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => { toggleMute(); onClose(); }}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-white/85 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2">
              {isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
              {isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Sustur'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { toggleDeafen(); onClose(); }}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-white/85 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2">
              <Headphones className="w-3.5 h-3.5 text-blue-400" />
              {isDeafened ? 'Kulaklığı Aç' : 'Kulaklığı Kapat'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { toggleRaiseHand(); onClose(); }}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-white/85 flex items-center gap-2 transition"
          >
            <Hand className="w-3.5 h-3.5 text-amber-400" />
            <span>Söz İste / El Kaldır</span>
          </button>
        </div>
      )}

      {/* Diagnostics & Audio Actions */}
      <div className="pt-1 border-t border-white/10 space-y-1">
        <button
          type="button"
          onClick={() => { openDiagnostics(); onClose(); }}
          className="w-full px-2.5 py-1.5 rounded-xl hover:bg-emerald-500/15 text-xs text-emerald-300 flex items-center justify-between transition"
        >
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            Bağlantı Teşhisi & Ping
          </span>
          <span className="font-mono text-[10px] font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded">
            {ping} ms
          </span>
        </button>

        {onOpenSpatialAudio && (
          <button
            type="button"
            onClick={() => { onOpenSpatialAudio(); onClose(); }}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-cyan-300 flex items-center gap-2 transition"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>3D Konumsal Ses Ayarı</span>
          </button>
        )}

        {!isMe && (
          <>
            <button
              type="button"
              onMouseDown={() => sendWhisper(target.id, true)}
              onMouseUp={() => sendWhisper(target.id, false)}
              onMouseLeave={() => sendWhisper(target.id, false)}
              onTouchStart={() => sendWhisper(target.id, true)}
              onTouchEnd={() => sendWhisper(target.id, false)}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-purple-500/20 text-xs text-purple-300 flex items-center gap-2 transition"
            >
              <Star className="w-3.5 h-3.5" />
              <span>Basılı Tut: Fısılda (Whisper)</span>
            </button>
            <button
              type="button"
              onClick={() => { openDirectMessage(target); onClose(); }}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-white/85 flex items-center gap-2 transition"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <span>Özel Mesaj Gönder</span>
            </button>
          </>
        )}

        {(currentUser?.role === 'admin' || activeServer?.ownerId === currentUser?.id) && !isMe && (
          <>
            <button
              type="button"
              onClick={() => {
                serverMuteUser(target.id, !target.isServerMuted, undefined);
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-amber-500/20 text-xs text-amber-300 flex items-center gap-2 transition"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>{target.isServerMuted ? 'Sunucu Susturmasını Kaldır' : 'Sunucudan Sustur'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                serverMuteUser(target.id, undefined, !target.isServerDeafened);
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-amber-500/20 text-xs text-amber-300 flex items-center gap-2 transition"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{target.isServerDeafened ? 'Sunucu Sağırlaştırmasını Kaldır' : 'Sunucudan Sağırlaştır'}</span>
            </button>
          </>
        )}

        {currentUser?.role === 'admin' && !isMe && (
          <button
            type="button"
            onClick={async () => {
              const reason = await appPrompt({
                title: 'Kullanıcıyı At',
                message: `${target.username} kullanıcısını sunucudan atma sebebi:`,
                defaultValue: 'Yönetici kararı',
                confirmLabel: 'At (Kick)',
              });
              if (reason !== null) adminKickUser(target.id, reason || 'Yönetici kararı');
              onClose();
            }}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-rose-500/20 text-xs text-rose-300 flex items-center gap-2 transition"
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Sunucudan At (Kick)</span>
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
