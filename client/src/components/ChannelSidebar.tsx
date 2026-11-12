import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { User } from '../types';
import {
  Hash,
  Volume2,
  Plus,
  Mic,
  MicOff,
  Headphones,
  Settings,
  ChevronDown,
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
} from 'lucide-react';
import { ActivitySelectorModal } from './ActivitySelectorModal';

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
  } = useSocket();

  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  if (!activeServer) {
    return (
      <div className="w-64 ios-glass-sidebar flex flex-col items-center justify-center p-4 text-white/40 text-xs">
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
    <aside className="w-64 ios-glass-sidebar flex flex-col shrink-0 select-none">
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
              onOpenCreateChannel('text');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kanal Oluştur</span>
            </div>
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
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">
                          {user.avatar || '👤'}
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
            <span>Metin Kanalları</span>
            <button
              onClick={() => onOpenCreateChannel('text')}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
              title="Kanal Ekle"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {textChannels.map((channel) => {
              const isActive = activeChannel?.id === channel.id;
              return (
                <button
                  key={channel.id}
                  onClick={() => selectChannel(channel.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                      : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Hash className="w-4 h-4 opacity-70 shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice Channels */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <span>Ses Odaları</span>
            <button
              onClick={() => onOpenCreateChannel('voice')}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
              title="Ses Odası Ekle"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {voiceChannels.map((channel) => {
              const isConnectedHere = connectedVoiceChannelId === channel.id;
              const isViewingHere = activeChannel?.id === channel.id;
              const usersInChannel = onlineUsers.filter(
                (u) => u.currentVoiceChannelId === channel.id
              );

              return (
                <div key={channel.id} className="space-y-1">
                  <button
                    onClick={() => {
                      selectChannel(channel.id);
                      joinVoiceChannel(channel.id);
                    }}
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
                                className={`w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[11px] transition ${
                                  speaking ? 'ios-halo-subtle' : ''
                                }`}
                              >
                                {user.avatar || '👤'}
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
        </div>
      </div>
      )}

      {/* Connected Voice Capsule */}
      {connectedVoiceChannel && (
        <div className="mx-3 mb-2 px-3 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
            <div className="truncate">
              <div className="text-emerald-400 font-semibold text-xs truncate">
                Ses Bağlantısı Açık
              </div>
              <div className="text-white/50 text-[10px] truncate">
                {connectedVoiceChannel.name}
              </div>
            </div>
          </div>
          <button
            onClick={leaveVoiceChannel}
            className="w-7 h-7 rounded-full bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition"
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

      {/* iOS Profile Bar (Control Center Glass Pill) */}
      <footer className="h-16 px-3 border-t border-white/[0.06] flex items-center justify-between bg-black/20">
        <div
          onClick={isAuthenticated && currentUser ? () => onOpenProfile(currentUser) : onOpenAuth}
          className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-white/[0.08] cursor-pointer transition max-w-[120px]"
          title={isAuthenticated ? 'Profilimi Görüntüle ve Düzenle' : 'Giriş Yap'}
        >
          <div className="relative">
            <div
              className={`w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-base transition-all ${
                isSpeaking ? 'ios-halo-subtle' : ''
              }`}
            >
              {currentUser?.avatar || '🎮'}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black" />
          </div>
          <div className="leading-tight truncate">
            <div className="text-xs font-semibold text-white truncate flex items-center gap-1">
              <span>{currentUser?.username || 'Giriş Yap'}</span>
            </div>
            <div className="text-[10px] text-white/40 truncate">
              {currentUser?.role === 'admin' ? '🛡️ Yönetici' : `#${currentUser?.id?.slice(0, 4) || '0001'}`}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleMute}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              isMuted
                ? 'bg-red-500/20 text-red-400'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleDeafen}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              isDeafened
                ? 'bg-red-500/20 text-red-400'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
          >
            <Headphones className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsActivityModalOpen(true)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              currentUser?.activity
                ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 animate-pulse'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title="Oyun / Aktivite Durumunu Ayarla"
          >
            <Gamepad2 className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition"
            title="Ayarlar"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isAuthenticated ? (
            <button
              onClick={logout}
              className="w-8 h-8 rounded-full flex items-center justify-center text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition ml-0.5"
              title="Çıkış Yap"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="w-8 h-8 rounded-full flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition ml-0.5"
              title="Giriş Yap / Kaydol"
            >
              <LogIn className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </footer>

      {/* Activity / Rich Presence Modal */}
      <ActivitySelectorModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        currentActivity={currentUser?.activity}
        onSaveActivity={(act) => updateUserActivity(act)}
      />
    </aside>
  );
};
