import React from 'react';
import { useSocket } from '../context/SocketContext';
import { User } from '../types';
import { Volume2, Crown, Tv, Shield } from 'lucide-react';

interface MemberListProps {
  onOpenProfile: (user: User) => void;
}

export const MemberList: React.FC<MemberListProps> = ({ onOpenProfile }) => {
  const { onlineUsers, currentUser, activeServer } = useSocket();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-400';
      case 'idle':
        return 'bg-amber-400';
      case 'dnd':
        return 'bg-red-400';
      default:
        return 'bg-white/30';
    }
  };

  return (
    <aside className="w-60 ios-glass-sidebar flex flex-col shrink-0 select-none overflow-y-auto p-4 border-l border-white/[0.06]">
      <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3 px-1">
        Kişiler — {onlineUsers.length}
      </div>

      <div className="space-y-1">
        {onlineUsers.map((user) => {
          const isMe = user.id === currentUser?.id;
          const currentVoice = activeServer?.channels.find(
            (c) => c.id === user.currentVoiceChannelId
          );

          return (
            <div
              key={user.id}
              onClick={() => onOpenProfile(user)}
              className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.06] cursor-pointer transition group"
              title={`${user.username} profilini görüntüle`}
            >
              <div className="relative shrink-0">
                <div
                  className={`w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm transition-all ${
                    user.isSpeaking ? 'ios-halo-subtle' : ''
                  }`}
                >
                  {user.avatar || '🎮'}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black ${getStatusColor(
                    user.status
                  )}`}
                />
              </div>

              <div className="truncate flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-semibold truncate ${
                      isMe ? 'text-blue-400' : 'text-white/90'
                    }`}
                  >
                    {user.username}
                  </span>
                  {user.role === 'admin' && (
                    <span title="Admin">
                      <Shield className="w-3 h-3 text-amber-400 shrink-0" />
                    </span>
                  )}
                  {isMe && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                </div>

                {user.isScreenSharing ? (
                  <div className="text-[10px] text-blue-400 flex items-center gap-1 truncate font-medium">
                    <Tv className="w-3 h-3 shrink-0 animate-pulse" />
                    <span>Ekran Paylaşıyor</span>
                  </div>
                ) : currentVoice ? (
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1 truncate">
                    <Volume2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{currentVoice.name}</span>
                  </div>
                ) : user.statusMessage ? (
                  <div className="text-[10px] text-white/50 truncate font-medium">
                    {user.statusMessage}
                  </div>
                ) : (
                  <div className="text-[10px] text-white/40 truncate">
                    Çevrimiçi
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
