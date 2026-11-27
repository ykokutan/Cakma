import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Crown,
  ExternalLink,
  Gamepad2,
  Headphones,
  MessageSquare,
  Phone,
  Radio,
  Send,
  Shield,
  Sparkles,
  Tv,
  Volume2,
  X,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import type { ServerRole, User } from '../types';
import { AvatarView } from './AvatarView';
import { StatusIndicator } from './StatusIndicator';

interface UserPopoverCardProps {
  user: User;
  x: number;
  y: number;
  role: ServerRole | null;
  isOwner: boolean;
  isMe: boolean;
  nickname?: string;
  voiceChannelName?: string;
  onClose: () => void;
  onOpenFullProfile: (user: User) => void;
}

export const UserPopoverCard: React.FC<UserPopoverCardProps> = ({
  user,
  x,
  y,
  role,
  isOwner,
  isMe,
  nickname,
  voiceChannelName,
  onClose,
  onOpenFullProfile,
}) => {
  const {
    openDirectMessage,
    startDirectCall,
    userVolumes,
    setUserVolume,
    socket,
  } = useSocket();
  const [quickDmText, setQuickDmText] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onOutsideClick = () => {
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onOutsideClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onOutsideClick);
    };
  }, [onClose]);

  const cardWidth = 310;
  const cardHeight = 360;
  const safeLeft =
    typeof window !== 'undefined'
      ? Math.max(12, Math.min(x - cardWidth - 10, window.innerWidth - cardWidth - 12))
      : x;
  const safeTop =
    typeof window !== 'undefined'
      ? Math.max(12, Math.min(y - 20, window.innerHeight - cardHeight - 12))
      : y;

  const displayName = nickname || user.username;
  const localVol = userVolumes[user.id] ?? 100;
  const isOffline = user.status === 'offline';

  const handleSendQuickDm = (e: React.FormEvent) => {
    e.preventDefault();
    const content = quickDmText.trim();
    openDirectMessage(user);
    if (content && socket) {
      socket.emit('send_direct_message', {
        targetUsername: user.username,
        content,
      });
    }
    setQuickDmText('');
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={`${displayName} Hızlı Profil`}
      onClick={(e) => e.stopPropagation()}
      style={{ left: safeLeft, top: safeTop, width: cardWidth }}
      className="fixed z-[9998] rounded-2xl bg-[#121520]/98 border border-white/15 shadow-2xl backdrop-blur-2xl overflow-hidden text-white animate-fade-in"
    >
      {/* Banner Strip */}
      <div className="relative h-20 overflow-hidden">
        {user.bannerImage ? (
          <img
            src={user.bannerImage}
            alt={user.username}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-r ${
              user.bannerColor || 'from-indigo-600 via-purple-600 to-pink-600'
            }`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#121520] via-transparent to-black/25" />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/45 hover:bg-black/70 text-white/80 hover:text-white flex items-center justify-center transition"
          title="Kapat (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Avatar Row */}
      <div className="px-4 -mt-7 relative z-10 flex items-end justify-between gap-2">
        <div className="relative w-14 h-14 rounded-2xl bg-[#181b28] border-4 border-[#121520] overflow-hidden flex items-center justify-center shadow-lg">
          <AvatarView avatar={user.avatar} alt={user.username} fallback="🎮" />
          <StatusIndicator
            status={user.status}
            size="sm"
            className="absolute bottom-0 right-0 ring-2 ring-[#121520]"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            onOpenFullProfile(user);
            onClose();
          }}
          className="mb-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-semibold text-white inline-flex items-center gap-1 transition"
        >
          <span>Tam Profili Gör</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Identity & Details */}
      <div className="p-4 pt-2.5 space-y-3">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-bold text-white truncate">{displayName}</h4>
            {isOwner && (
              <span title="Sunucu Sahibi">
                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </span>
            )}
            {!isOwner && user.role === 'admin' && (
              <span title="Sistem Admini">
                <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              </span>
            )}
            {isMe && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold">
                SEN
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/45 flex items-center gap-2 mt-0.5">
            <span>@{user.username}</span>
            {role && (
              <span
                style={{
                  color: role.color,
                  borderColor: `${role.color}55`,
                  backgroundColor: `${role.color}18`,
                }}
                className="px-1.5 py-0.2 rounded-full border text-[10px] font-semibold inline-flex items-center gap-1"
              >
                {role.icon && <span>{role.icon}</span>}
                <span>{role.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Status / Activity / Voice Room */}
        {(user.statusMessage || user.activity || user.isScreenSharing || voiceChannelName) && (
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-1.5 text-[11px]">
            {user.statusMessage && (
              <div className="text-white/80 truncate">{user.statusMessage}</div>
            )}
            {user.isScreenSharing && (
              <div className="text-blue-300 flex items-center gap-1.5 font-medium">
                <Tv className="w-3.5 h-3.5 animate-pulse shrink-0" />
                <span>Canlı ekran paylaşımı yapıyor</span>
              </div>
            )}
            {user.activity && (
              <div className="text-purple-300 flex items-center gap-1.5 font-medium truncate">
                {user.activity.type === 'listening' ? (
                  <Headphones className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : user.activity.type === 'streaming' ? (
                  <Radio className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                ) : user.activity.type === 'custom' ? (
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <Gamepad2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                )}
                <span className="truncate">{user.activity.name}</span>
              </div>
            )}
            {voiceChannelName && (
              <div className="text-emerald-300 flex items-center gap-1.5 font-medium truncate">
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Ses Odası: {voiceChannelName}</span>
              </div>
            )}
          </div>
        )}

        {/* Per-user volume slider when user is in a voice channel */}
        {!isMe && voiceChannelName && (
          <div className="p-2.5 rounded-xl bg-black/30 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/65 font-medium">Kullanıcı Sesi</span>
              <span className="font-mono text-emerald-300 font-bold">{localVol}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={localVol}
              onChange={(e) => setUserVolume(user.id, Number(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer h-1.5"
            />
          </div>
        )}

        {/* Quick Actions & Inline DM */}
        {!isMe && (
          <div className="space-y-2">
            <form onSubmit={handleSendQuickDm} className="flex items-center gap-1.5">
              <input
                type="text"
                value={quickDmText}
                onChange={(e) => setQuickDmText(e.target.value)}
                placeholder={`@${user.username} kişisine mesaj...`}
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder:text-white/35 outline-none focus:border-blue-400"
              />
              <button
                type="submit"
                className="p-1.5 rounded-xl bg-blue-500/25 hover:bg-blue-500/40 border border-blue-400/35 text-blue-200 transition shrink-0"
                title={quickDmText.trim() ? 'DM Gönder' : 'DM Penceresini Aç'}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  openDirectMessage(user);
                  onClose();
                }}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/15 border border-white/10 text-[11px] font-semibold text-white/85 flex items-center justify-center gap-1.5 transition"
              >
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                <span>Özel Sohbet</span>
              </button>
              {!isOffline && (
                <button
                  type="button"
                  onClick={() => {
                    startDirectCall(user);
                    onClose();
                  }}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-semibold text-emerald-200 flex items-center justify-center gap-1.5 transition"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Sesli Ara</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
