import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { User, Channel } from '../types';
import {
  Hash,
  Volume2,
  Plus,
  Mic,
  MicOff,
  Headphones,
  Settings,
  ChevronDown,
  ChevronRight,
  PhoneOff,
  Radio,
  VolumeX,
  Tv,
  Shield,
  LogIn,
  LogOut,
  ShoppingBag,
  MessageCircle,
  Phone,
  Users,
  Sliders,
  Gamepad2,
  Activity,
  Lock,
  BarChart2,
  UserPlus,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { ActivitySelectorModal } from './ActivitySelectorModal';
import { ChannelPasswordModal } from './ChannelPasswordModal';
import { ServerAnalyticsModal } from './ServerAnalyticsModal';
import { AvatarView } from './AvatarView';

interface ChannelSidebarProps {
  onOpenCreateChannel: (type: 'text' | 'voice') => void;
  onOpenSettings: () => void;
  onOpenServerSettings: () => void;
  onOpenAuth: () => void;
  onOpenAdminDashboard: () => void;
  onOpenStore: () => void;
  onOpenProfile: (user: User) => void;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({
  onOpenCreateChannel,
  onOpenSettings,
  onOpenServerSettings,
  onOpenAuth,
  onOpenAdminDashboard,
  onOpenStore,
  onOpenProfile,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const {
    activeServer,
    activeChannel,
    selectChannel,
    connectedVoiceChannelId,
    joinVoiceChannel,
    leaveVoiceChannel,
    currentUser,
    onlineUsers,
    isMuted,
    isDeafened,
    isSpeaking,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    isAuthenticated,
    logout,
    activeDMUser,
    openDirectMessage,
    closeDirectMessage,
    startDirectCall,
    incomingFriendRequests,
    updateUserActivity,
    openDiagnostics,
    ping,
    unlockedChannelIds,
    unlockChannel,
    voicePasswordError,
    clearVoicePasswordError,
    unreadCounts,
    createServerInvite,
  } = useSocket();

  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isTextCollapsed, setIsTextCollapsed] = useState(false);
  const [isVoiceCollapsed, setIsVoiceCollapsed] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [passwordModalChannel, setPasswordModalChannel] = useState<{ id: string; name: string } | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  const handleVoiceChannelClick = (channel: Channel) => {
    selectChannel(channel.id);
    const requiresPassword = Boolean(channel.password || channel.isLocked);
    const isOwner = activeServer?.ownerId === currentUser?.id;
    const isAdmin = currentUser?.role === 'admin';
    const isAlreadyUnlocked = unlockedChannelIds.includes(channel.id);

    if (requiresPassword && !isAdmin && !isOwner && !isAlreadyUnlocked) {
      setPasswordModalChannel({ id: channel.id, name: channel.name });
    } else {
      joinVoiceChannel(channel.id);
    }
  };

  const handlePasswordSubmit = (password: string) => {
    if (!passwordModalChannel) return;
    joinVoiceChannel(passwordModalChannel.id, password);
    unlockChannel(passwordModalChannel.id);
    setPasswordModalChannel(null);
  };

  if (!activeServer) {
    return (
      <div className="w-72 ios-glass-sidebar flex flex-col items-center justify-center p-4 text-white/40 text-xs">
        Bir sunucu seçin
      </div>
    );
  }

  const textChannels = activeServer.channels.filter((c) => c.type === 'text');
  const voiceChannels = activeServer.channels.filter((c) => c.type === 'voice');

  const connectedVoiceChannel = activeServer.channels.find(
    (c) => c.id === connectedVoiceChannelId
  );

  return (
    <aside className="w-72 ios-glass-sidebar flex flex-col shrink-0 select-none">
      {/* iOS Server Header Card */}
      <header
        onClick={() => activeServer.id !== 'direct-messages' && setIsDropdownOpen(!isDropdownOpen)}
        className="h-14 px-4 border-b border-white/[0.06] flex items-center justify-between font-semibold text-white/90 shadow-sm hover:bg-white/[0.04] cursor-pointer transition select-none"
      >
        <div className="flex items-center gap-2 truncate">
          {activeServer.id === 'direct-messages' ? (
            <MessageCircle className="w-4 h-4 text-blue-400 shrink-0" />
          ) : (
            <span className="text-base shrink-0">{activeServer.icon || '💬'}</span>
          )}
          <span className="truncate tracking-tight font-bold text-sm">{activeServer.name}</span>
        </div>
        {activeServer.id !== 'direct-messages' && (
          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
            <ChevronDown className={`w-3.5 h-3.5 text-white/60 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </div>
        )}
      </header>

      {/* Server Header Dropdown Menu */}
      {isDropdownOpen && activeServer.id !== 'direct-messages' && (
        <div className="mx-3 mt-2 p-1.5 rounded-2xl bg-[#18191f]/95 backdrop-blur-xl border border-white/10 shadow-2xl space-y-1 animate-fade-in z-30">
          <button
            type="button"
            onClick={() => {
              setIsDropdownOpen(false);
              onOpenServerSettings();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span>Sunucu Ayarları</span>
            </div>
            <span className="text-[10px] text-white/40">Roller & Detay</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsDropdownOpen(false);
              setIsAnalyticsOpen(true);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sunucu Analitiği</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">Canlı</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsDropdownOpen(false);
              onOpenCreateChannel('text');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kanal Oluştur</span>
            </div>
          </button>

          <button
            type="button"
            onClick={async () => {
              setIsDropdownOpen(false);
              setIsInviteModalOpen(true);
              setGeneratedInviteCode(null);
              setInviteCopied(false);
              setIsCreatingInvite(true);
              const inv = await createServerInvite(activeServer.id);
              setIsCreatingInvite(false);
              if (inv) setGeneratedInviteCode(inv.code);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
              <span>Davet Linki Oluştur</span>
            </div>
            <span className="text-[10px] text-indigo-300">Paylaş</span>
          </button>
        </div>
      )}

      {/* Channels List or DMs List */}
      {activeServer.id === 'direct-messages' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* Friends Dashboard Tab Button */}
          <button
            onClick={() => closeDirectMessage()}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
              !activeDMUser
                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4" />
              <span>Arkadaşlar</span>
            </div>
            {incomingFriendRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {incomingFriendRequests.length}
              </span>
            )}
          </button>

          <div className="flex items-center justify-between px-2 pt-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <span>Direkt Mesajlar</span>
          </div>

          <div className="space-y-1">
            {onlineUsers
              .filter((u) => u.id !== currentUser?.id)
              .map((user) => {
                const isSelected = activeDMUser?.id === user.id;
                return (
                  <div
                    key={user.id}
                    onClick={() => openDirectMessage(user)}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 text-white border border-blue-500/40'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm overflow-hidden">
                          <AvatarView avatar={user.avatar} alt={user.username} fallback="👤" className="w-full h-full object-cover" />
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black ${
                            user.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                      </div>
                      <div className="truncate">
                        <div className="truncate font-semibold text-white">{user.username}</div>
                        <div className="truncate text-[10px] text-white/40">
                          {user.statusMessage || (user.role === 'admin' ? '🛡️ Yönetici' : 'Çevrimiçi')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startDirectCall(user);
                        }}
                        className="w-7 h-7 rounded-lg hover:bg-white/20 text-emerald-400 flex items-center justify-center transition"
                        title="Sesli Ara"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

            {onlineUsers.filter((u) => u.id !== currentUser?.id).length === 0 && (
              <div className="text-center py-8 text-white/30 text-xs">
                Şu anda çevrim içi başka kullanıcı yok.
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Text Channels */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setIsTextCollapsed((p) => !p)}
              className="flex items-center gap-1 hover:text-white/80 transition"
            >
              {isTextCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              <span>Metin Kanalları</span>
            </button>
            <button
              onClick={() => onOpenCreateChannel('text')}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
              title="Kanal Ekle"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!isTextCollapsed && (
            <div className="space-y-0.5">
              {textChannels.map((channel) => {
                const isActive = activeChannel?.id === channel.id;
                const unread = !isActive ? (unreadCounts[channel.id] || 0) : 0;
                return (
                  <button
                    key={channel.id}
                    onClick={() => selectChannel(channel.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                        : unread > 0
                        ? 'text-white font-bold hover:bg-white/[0.06]'
                        : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Hash className="w-4 h-4 opacity-70 shrink-0" />
                      <span className="truncate">{channel.name}</span>
                    </div>
                    {unread > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Voice Channels */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setIsVoiceCollapsed((p) => !p)}
              className="flex items-center gap-1 hover:text-white/80 transition"
            >
              {isVoiceCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              <span>Ses Odaları</span>
            </button>
            <button
              onClick={() => onOpenCreateChannel('voice')}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
              title="Ses Odası Ekle"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {!isVoiceCollapsed && (
            <div className="space-y-1">
            {voiceChannels.map((channel) => {
              const isConnectedHere = connectedVoiceChannelId === channel.id;
              const isViewingHere = activeChannel?.id === channel.id;
              const usersInChannel = onlineUsers.filter(
                (u) => u.currentVoiceChannelId === channel.id
              );

              const isLocked = Boolean(channel.password || channel.isLocked);

              return (
                <div key={channel.id} className="space-y-1">
                  <button
                    onClick={() => handleVoiceChannelClick(channel)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isConnectedHere
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : isViewingHere
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Volume2
                        className={`w-4 h-4 shrink-0 ${
                          isConnectedHere ? 'text-emerald-400' : 'opacity-70'
                        }`}
                      />
                      <span className="truncate">{channel.name}</span>
                      {isLocked && (
                        <span title="Korumalı Ses Odası">
                          <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {usersInChannel.some((u) => u.isScreenSharing) && (
                        <Tv className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                      )}
                      {usersInChannel.length > 0 && (
                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full text-white/80">
                          {usersInChannel.length}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Connected Users Tree with Halo Effect */}
                  {usersInChannel.length > 0 && (
                    <div className="pl-6 pr-1 space-y-1">
                      {usersInChannel.map((user) => {
                        const isThisMe = user.id === currentUser?.id;
                        const speaking = isThisMe ? isSpeaking : user.isSpeaking;

                        return (
                          <div
                            key={user.id}
                            className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-xs transition ${
                              speaking
                                ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                                : 'text-white/70 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <div
                                className={`w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[11px] transition overflow-hidden shrink-0 ${
                                  speaking ? 'ios-halo-subtle' : ''
                                }`}
                              >
                                <AvatarView avatar={user.avatar} alt={user.username} fallback="👤" className="w-full h-full object-cover" />
                              </div>
                              <span className="truncate">{user.username}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              {(isThisMe ? isScreenSharing : user.isScreenSharing) && (
                                <span className="text-[9px] bg-blue-500 text-white px-1 rounded font-bold">
                                  YAYIN
                                </span>
                              )}
                              {user.isMuted && (
                                <MicOff className="w-3 h-3 text-red-400" />
                              )}
                              {user.isDeafened && (
                                <VolumeX className="w-3 h-3 text-red-400" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
      )}

      {/* Connected Voice Capsule */}
      {connectedVoiceChannel && (
        <div
          onClick={openDiagnostics}
          className="mx-3 mb-2 px-3 py-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 backdrop-blur-md flex items-center justify-between cursor-pointer transition group"
          title="Bağlantı ve Ağ Teşhisi Detaylarını Aç"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
            <div className="truncate">
              <div className="text-emerald-400 font-semibold text-xs truncate flex items-center gap-1.5">
                <span>Ses Bağlantısı Açık</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-mono font-bold">
                  {ping}ms
                </span>
              </div>
              <div className="text-white/50 text-[10px] truncate group-hover:text-white/70 transition">
                {connectedVoiceChannel.name} · Teşhis & Ping
              </div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              leaveVoiceChannel();
            }}
            className="w-7 h-7 rounded-full bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition shrink-0"
            title="Ayrıl"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LICENSE & DEDICATED SERVER STORE BUTTON */}
      <button
        onClick={onOpenStore}
        className="mx-3 mb-2 px-3 py-2 rounded-2xl bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 border border-blue-500/30 hover:border-blue-500/60 text-blue-200 font-bold text-xs flex items-center justify-between transition group shadow-lg shadow-blue-500/10 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-blue-400 group-hover:scale-110 transition" />
          <span>Lisans Mağazası</span>
        </div>
        <span className="text-[10px] bg-blue-500/30 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-full font-mono font-bold shadow-sm">
          ₺{currentUser?.walletBalance ?? 1000}
        </span>
      </button>

      {/* EXCLUSIVE ADMIN CONSOLE BUTTON (Shown only if role is admin) */}
      {currentUser?.role === 'admin' && (
        <button
          onClick={onOpenAdminDashboard}
          className="mx-3 mb-2 px-3 py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 hover:border-amber-500/60 text-amber-300 font-bold text-xs flex items-center justify-between transition group shadow-lg shadow-amber-500/10 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
            <span>Sistem Yönetimi</span>
          </div>
          <span className="text-[9px] bg-amber-500 text-black px-1.5 py-0.5 rounded-full font-extrabold shadow">
            ADMIN
          </span>
        </button>
      )}

      {/* iOS Profile Bar (2-Tier Spacious Glass Panel) */}
      <footer className="p-2.5 border-t border-white/[0.08] bg-black/40 flex flex-col gap-2 shrink-0">
        {/* Tier 1: User Profile & Dedicated Logout Button */}
        <div className="flex items-center justify-between gap-2">
          <div
            onClick={isAuthenticated && currentUser ? () => onOpenProfile(currentUser) : onOpenAuth}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-white/[0.08] cursor-pointer transition min-w-0 flex-1 group"
            title={isAuthenticated ? 'Profilimi Görüntüle ve Düzenle' : 'Giriş Yap'}
          >
            <div className="relative shrink-0">
              <div
                className={`w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-base transition-all overflow-hidden ${
                  isSpeaking ? 'ios-halo-subtle' : ''
                }`}
              >
                <AvatarView avatar={currentUser?.avatar} alt={currentUser?.username} fallback="🎮" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black shadow" />
            </div>

            <div className="leading-tight min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span className="truncate group-hover:text-blue-400 transition">
                  {currentUser?.username || 'Giriş Yap'}
                </span>
                {currentUser?.role === 'admin' ? (
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 rounded border border-amber-500/30 shrink-0">
                    ADMIN
                  </span>
                ) : (
                  <span className="text-[9px] bg-blue-500/20 text-blue-300 font-medium px-1.5 py-0.2 rounded border border-blue-500/30 shrink-0">
                    Üye
                  </span>
                )}
              </div>
              <div className="text-[10px] text-white/50 truncate font-medium">
                {currentUser?.statusMessage || `#${currentUser?.id?.slice(0, 4) || '0001'}`}
              </div>
            </div>
          </div>

          {/* Quick Logout / Login Button */}
          {isAuthenticated ? (
            <button
              onClick={logout}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 transition shadow-sm shrink-0"
              title="Çıkış Yap"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-500/30 transition shrink-0"
              title="Giriş Yap / Kaydol"
            >
              <LogIn className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tier 2: Controls Toolbar */}
        <div className="flex items-center justify-between gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06]">
          <button
            onClick={toggleMute}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition ${
              isMuted
                ? 'bg-red-500/25 text-red-400 border border-red-500/30'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={toggleDeafen}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition ${
              isDeafened
                ? 'bg-red-500/25 text-red-400 border border-red-500/30'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsActivityModalOpen(true)}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition ${
              currentUser?.activity
                ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 animate-pulse'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title="Oyun / Aktivite Durumunu Ayarla"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={openDiagnostics}
            className="flex-1 h-7 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition border border-emerald-500/20 gap-1"
            title={`Bağlantı & Ping Teşhisi (${ping}ms)`}
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span className="text-[10px] font-mono font-bold">{ping}ms</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex-1 h-7 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition"
            title="Ayarlar"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </footer>

      {/* Activity / Rich Presence Modal */}
      <ActivitySelectorModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        currentActivity={currentUser?.activity}
        onSaveActivity={(act) => updateUserActivity(act)}
      />

      {/* Password Modal for Protected Voice Channels */}
      {passwordModalChannel && (
        <ChannelPasswordModal
          channelId={passwordModalChannel.id}
          channelName={passwordModalChannel.name}
          errorMessage={voicePasswordError}
          onClose={() => {
            setPasswordModalChannel(null);
            clearVoicePasswordError();
          }}
          onSubmit={handlePasswordSubmit}
        />
      )}

      {/* Server Analytics Modal */}
      {isAnalyticsOpen && activeServer && (
        <ServerAnalyticsModal
          serverId={activeServer.id}
          serverName={activeServer.name}
          onClose={() => setIsAnalyticsOpen(false)}
        />
      )}

      {/* Invite Link Modal (Portal) */}
      {isInviteModalOpen &&
        activeServer &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="w-full max-w-md rounded-3xl bg-slate-900/95 border border-white/15 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Sunucuya Davet Et</h3>
                    <p className="text-[11px] text-white/50">{activeServer.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isCreatingInvite ? (
                <div className="py-6 text-center text-xs text-white/60">
                  Davet bağlantısı oluşturuluyor...
                </div>
              ) : generatedInviteCode ? (
                <div className="space-y-3">
                  <p className="text-xs text-white/70">
                    Arkadaşlarını bu sunucuya davet etmek için aşağıdaki bağlantıyı veya davet kodunu paylaşabilirsin:
                  </p>
                  <div className="flex items-center gap-2 p-2 rounded-2xl bg-black/40 border border-white/10">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/?invite=${generatedInviteCode}`}
                      className="flex-1 bg-transparent text-xs text-indigo-300 font-mono outline-none px-2"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/?invite=${generatedInviteCode}`);
                        setInviteCopied(true);
                        setTimeout(() => setInviteCopied(false), 2000);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                        inviteCopied
                          ? 'bg-emerald-500 text-white'
                          : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                      }`}
                    >
                      {inviteCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{inviteCopied ? 'Kopyalandı' : 'Kopyala'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/40 px-1">
                    <span>Davet Kodu: <strong className="text-white/80 font-mono">{generatedInviteCode}</strong></span>
                    <span>Süresiz • Sınırsız kullanım</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-red-400">
                  Davet linki oluşturulamadı (yetkiniz olmayabilir).
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};
