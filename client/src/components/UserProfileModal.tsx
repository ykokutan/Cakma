import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { User } from '../types';
import {
  X,
  MessageCircle,
  Phone,
  Shield,
  Sparkles,
  Edit3,
  Check,
  Calendar,
  Wallet,
  Smile,
  Palette,
  UserPlus,
  UserCheck,
  Clock,
  Gamepad2,
  LogOut,
  StickyNote,
  Ban,
  VolumeX,
} from 'lucide-react';

interface UserProfileModalProps {
  user: User;
  onClose: () => void;
}

const BANNER_PRESETS = [
  { id: 'indigo', name: 'Gece Mavisi', class: 'from-indigo-600 via-purple-600 to-pink-600' },
  { id: 'emerald', name: 'Zümrüt Yeşili', class: 'from-emerald-600 via-teal-600 to-cyan-600' },
  { id: 'sunset', name: 'Gün Batımı', class: 'from-amber-500 via-orange-600 to-red-600' },
  { id: 'ocean', name: 'Okyanus Dalgası', class: 'from-blue-600 via-cyan-500 to-teal-400' },
  { id: 'cyber', name: 'Siberpunk Neon', class: 'from-fuchsia-600 via-purple-600 to-pink-500' },
  { id: 'gold', name: 'Altın VIP', class: 'from-yellow-500 via-amber-600 to-yellow-700' },
  { id: 'midnight', name: 'Siyah Titanyum', class: 'from-neutral-800 via-neutral-900 to-black' },
];

const STATUS_PRESETS = [
  { icon: '🎮', text: 'CS2 & Valorant Oynuyor' },
  { icon: '🎧', text: 'Lo-Fi Müzik Dinliyor' },
  { icon: '💻', text: 'Kod Yazıyor (React & Node)' },
  { icon: '☕', text: 'Kahve Molasında' },
  { icon: '🚀', text: 'Dedicated Sunucu Kuruyor' },
  { icon: '💤', text: 'Rahatsız Etmeyin' },
];

const AVATAR_PRESETS = ['🛡️', '👑', '🚀', '💎', '⚡', '🎮', '🎧', '🤖', '🦊', '🐱', '🔥', '🌟'];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose }) => {
  const {
    currentUser,
    openDirectMessage,
    startDirectCall,
    updateProfileDetails,
    friends,
    incomingFriendRequests,
    outgoingFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    logout,
    activeServer,
    blockUser,
    unblockUser,
    timeoutMember,
  } = useSocket();

  const isMe = currentUser?.id === user.id || currentUser?.username.toLowerCase() === user.username.toLowerCase();
  const isBlocked = Boolean(currentUser?.blockedUsers?.includes(user.username));
  const canTimeout = Boolean(
    !isMe &&
      activeServer &&
      activeServer.id !== 'direct-messages' &&
      (activeServer.ownerId === currentUser?.id || currentUser?.role === 'admin')
  );
  const isFriend = friends.some((f) => f.username.toLowerCase() === user.username.toLowerCase());
  const incomingReq = incomingFriendRequests.find((r) => r.fromUsername.toLowerCase() === user.username.toLowerCase());
  const hasOutgoingRequest = outgoingFriendRequests.some((r) => r.toUsername.toLowerCase() === user.username.toLowerCase());

  // Self editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editStatusMessage, setEditStatusMessage] = useState(user.statusMessage || 'Çevrimiçi');
  const [editBio, setEditBio] = useState(user.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.');
  const [editBannerColor, setEditBannerColor] = useState(user.bannerColor || BANNER_PRESETS[0].class);
  const [editAvatar, setEditAvatar] = useState(user.avatar || '🎮');
  const [copiedId, setCopiedId] = useState(false);

  // Private Note state (stored in localStorage per target user)
  const [userNote, setUserNote] = useState('');
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  useEffect(() => {
    if (!isMe && user.id) {
      const savedNote = localStorage.getItem(`dc_user_note_${user.id}`) || '';
      setUserNote(savedNote);
    }
  }, [user.id, isMe]);

  const handleSaveNote = () => {
    if (!isMe && user.id) {
      localStorage.setItem(`dc_user_note_${user.id}`, userNote);
      setNoteSavedFeedback(true);
      setTimeout(() => setNoteSavedFeedback(false), 2000);
    }
  };

  const handleSaveProfile = () => {
    updateProfileDetails({
      statusMessage: editStatusMessage,
      bio: editBio,
      bannerColor: editBannerColor,
      avatar: editAvatar,
    });
    setIsEditing(false);
  };

  const handleOpenDM = () => {
    openDirectMessage(user);
    onClose();
  };

  const handleStartCall = () => {
    startDirectCall(user);
    onClose();
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

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

  const activeBanner = isEditing ? editBannerColor : (user.bannerColor || BANNER_PRESETS[0].class);
  const activeAvatar = isEditing ? editAvatar : (user.avatar || '🎮');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden ios-glass shadow-2xl border border-white/15 text-white animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className={`h-32 w-full bg-gradient-to-r ${activeBanner} relative transition-all duration-300`}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md transition"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>

          {isMe && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/30 hover:bg-black/50 text-white/90 hover:text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition border border-white/10"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Profili Düzenle</span>
            </button>
          )}

          {isEditing && (
            <div className="absolute bottom-2 right-3 flex items-center gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-medium backdrop-blur-md transition"
              >
                İptal
              </button>
              <button
                onClick={handleSaveProfile}
                className="px-3 py-1 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Kaydet</span>
              </button>
            </div>
          )}
        </div>

        {/* Avatar & Badges Header */}
        <div className="relative px-6 pb-6 pt-0 bg-neutral-900/80 backdrop-blur-xl">
          <div className="flex justify-between items-end -mt-12 mb-4">
            {/* Avatar with Halo Indicator */}
            <div className="relative">
              <div
                className={`w-24 h-24 rounded-3xl bg-neutral-800 border-4 border-neutral-900 flex items-center justify-center text-4xl shadow-xl transition-all ${
                  user.isSpeaking ? 'ios-halo' : ''
                }`}
              >
                {activeAvatar}
              </div>
              <div
                className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-neutral-900 shadow-md ${getStatusColor(
                  user.status
                )}`}
              />
            </div>

            {/* Action Buttons: If me show Logout, if other user show DM / Call / Friend */}
            {isMe ? (
              <div className="flex items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                  title="Hesaptan Çıkış Yap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Çıkış Yap</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pb-1">
                {/* Friend Status Button */}
                {isFriend ? (
                  <button
                    onClick={() => {
                      if (confirm(`${user.username} adlı kullanıcıyı arkadaş listenizden çıkarmak istediğinize emin misiniz?`)) {
                        removeFriend(user.username);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-red-500/20 border border-white/15 hover:border-red-500/30 text-white/80 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition shadow"
                    title="Arkadaşlıktan Çıkar"
                  >
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span>Arkadaş</span>
                  </button>
                ) : incomingReq ? (
                  <button
                    onClick={() => acceptFriendRequest(incomingReq.id)}
                    className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow shadow-emerald-500/30"
                    title="Arkadaşlık İsteğini Kabul Et"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Kabul Et</span>
                  </button>
                ) : hasOutgoingRequest ? (
                  <button
                    disabled
                    className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed"
                  >
                    <Clock className="w-4 h-4" />
                    <span>İstek Bekliyor</span>
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      const res = await sendFriendRequest(user.username);
                      alert(res.message || res.error);
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                    title="Arkadaş Ekle"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Arkadaş Ekle</span>
                  </button>
                )}

                <button
                  onClick={handleOpenDM}
                  className="px-3 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500 border border-blue-400/30 hover:border-blue-400 text-blue-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                  title="Özel Mesaj Başlat"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Mesaj</span>
                </button>

                <button
                  onClick={handleStartCall}
                  className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                  title="Sesli Arama Başlat"
                >
                  <Phone className="w-4 h-4" />
                  <span>Ara</span>
                </button>
              </div>
            )}
          </div>

          {/* User Details */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold tracking-tight text-white">{user.username}</h3>
                {user.role === 'admin' ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Admin
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-bold uppercase tracking-wider">
                    Üye
                  </span>
                )}
              </div>

              <div
                onClick={handleCopyId}
                className="text-xs text-white/40 font-mono hover:text-white/70 cursor-pointer inline-flex items-center gap-1 transition"
                title="Kullanıcı ID'sini Kopyala"
              >
                <span>#{user.id.slice(0, 8)}</span>
                {copiedId && <span className="text-[10px] text-emerald-400 font-sans">Kopyalandı!</span>}
              </div>
            </div>

            {/* Level & XP Progression Bar */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-500/20 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Seviye {user.level || 1}
                </span>
                <span className="text-[11px] font-mono text-white/60">
                  {user.xp || 0} XP
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, ((user.xp || 0) % 100)))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/40 font-mono">
                <span>İlerleme: %{((user.xp || 0) % 100)}</span>
                <span>Sonraki seviyeye: {100 - ((user.xp || 0) % 100)} XP</span>
              </div>
            </div>

            {/* Rich Presence / Activity Card */}
            {user.activity && (
              <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-slate-900/40 border border-purple-500/30 flex items-center gap-3 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-xl shrink-0 text-purple-300">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                    {user.activity.type === 'playing' ? 'Oyun Oynuyor' : user.activity.type === 'listening' ? 'Müzik Dinliyor' : user.activity.type === 'streaming' ? 'Canlı Yayında' : 'Özel Aktivite'}
                  </div>
                  <div className="text-sm font-bold text-white truncate">
                    {user.activity.name}
                  </div>
                  {user.activity.details && (
                    <div className="text-xs text-purple-200/70 truncate">
                      {user.activity.details}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Custom Status Message */}
            {!isEditing ? (
              <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/5 flex items-center gap-2">
                <span className="text-sm">💬</span>
                <span className="text-xs text-white/80 font-medium">
                  {user.statusMessage || 'Çevrimiçi'}
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
                  <Smile className="w-3.5 h-3.5" />
                  Özel Durum Mesajı
                </label>
                <input
                  type="text"
                  value={editStatusMessage}
                  onChange={(e) => setEditStatusMessage(e.target.value)}
                  placeholder="🎮 CS2 Oynuyor, 🎧 Lo-Fi Dinliyor..."
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {STATUS_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditStatusMessage(`${p.icon} ${p.text}`)}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white/70 hover:text-white border border-white/5 transition"
                    >
                      {p.icon} {p.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Profile Badges */}
            {user.badges && user.badges.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Kazanılan Rozetler ({user.badges.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.badges.map((b) => (
                    <div
                      key={b.id}
                      className={`px-2.5 py-1 rounded-xl bg-gradient-to-r ${b.color} text-white text-xs font-bold flex items-center gap-1.5 shadow-md border border-white/10`}
                      title={b.description}
                    >
                      <span>{b.icon}</span>
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bio / Hakkında */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Hakkında
              </div>
              {!isEditing ? (
                <p className="text-xs text-white/70 leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/5">
                  {user.bio || 'Bu kullanıcı henüz hakkında yazısı eklememiş.'}
                </p>
              ) : (
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500 resize-none"
                  placeholder="Kendinizden bahsedin..."
                />
              )}
            </div>

            {/* Private User Note (Only visible to current user) */}
            {!isMe && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1">
                    <StickyNote className="w-3 h-3 text-amber-400" />
                    <span>Özel Kullanıcı Notu</span>
                  </div>
                  <span className="text-[10px] text-white/30">Yalnızca siz görürsünüz</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    onBlur={handleSaveNote}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNote();
                    }}
                    placeholder="Bu kullanıcıya özel not ekle (örn: CS2 Kaptanı)..."
                    className="w-full px-3 py-2 pr-16 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] focus:bg-black/50 border border-white/10 focus:border-amber-500/50 text-xs text-white placeholder:text-white/30 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="absolute right-1.5 top-1.5 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-amber-500/20 text-white/70 hover:text-amber-300 text-[10px] font-medium transition"
                  >
                    {noteSavedFeedback ? '✓ Kaydedildi' : 'Kaydet'}
                  </button>
                </div>
              </div>
            )}

            {/* Edit Mode Customizers (Banner & Avatar) */}
            {isEditing && (
              <div className="space-y-3 pt-2 border-t border-white/10">
                {/* Banner Gradient Chooser */}
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    Banner Teması
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {BANNER_PRESETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setEditBannerColor(b.class)}
                        className={`h-7 rounded-lg bg-gradient-to-r ${b.class} border transition ${
                          editBannerColor === b.class ? 'ring-2 ring-white border-transparent scale-105' : 'border-white/20'
                        }`}
                        title={b.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Avatar Icon Chooser */}
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                    <Smile className="w-3.5 h-3.5" />
                    Profil Avatarı
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {AVATAR_PRESETS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditAvatar(emoji)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg bg-white/5 hover:bg-white/15 transition ${
                          editAvatar === emoji ? 'ring-2 ring-blue-400 bg-white/20 scale-105' : ''
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Block & Moderator Timeout Controls */}
            {!isMe && (
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => (isBlocked ? unblockUser(user.username) : blockUser(user.username))}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                      isBlocked
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                        : 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-500/30'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>{isBlocked ? 'Engeli Kaldır' : 'Kullanıcıyı Engelle'}</span>
                  </button>
                </div>

                {canTimeout && activeServer && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>Moderatör: Zaman Aşımı (Sustur)</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: '5 dk', mins: 5 },
                        { label: '15 dk', mins: 15 },
                        { label: '1 saat', mins: 60 },
                        { label: 'Kaldır', mins: 0 },
                      ].map((opt) => (
                        <button
                          key={opt.mins}
                          type="button"
                          onClick={() => timeoutMember(activeServer.id, user.username, opt.mins)}
                          className={`py-1 px-2 rounded-lg text-[10px] font-bold border transition ${
                            opt.mins === 0
                              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                              : 'bg-black/30 hover:bg-amber-500/25 text-amber-200 border-white/10'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Account Info Footer */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/40">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Kayıt: {user.createdAt || '2026'}</span>
              </div>
              {isMe && user.walletBalance !== undefined && (
                <div className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Bakiye: {user.walletBalance} ₺</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};