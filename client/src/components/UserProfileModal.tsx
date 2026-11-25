import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { t } from '../utils/i18n';
import { isUserServerOwner } from '../utils/serverIdentity';
import {
  STATUS_EXPIRY_KEY,
  STATUS_EXPIRY_OPTIONS,
  StatusExpiryPreset,
  computeStatusExpiryTimestamp,
} from '../utils/statusExpiry';
import { User } from '../types';
import { AvatarView, processUploadedImage, isImageAvatar } from './AvatarView';
import { appConfirm, appToast } from '../utils/appDialogs';
import { ActivitySelectorModal } from './ActivitySelectorModal';
import { ReportContentModal } from './ReportContentModal';
import {
  X,
  Flag,
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
  Headphones,
  Radio,
  LogOut,
  StickyNote,
  Ban,
  VolumeX,
  Camera,
  Upload,
  Image as ImageIcon,
  Link2,
  Trash2,
  Copy,
  Star,
  Globe,
  Send,
  Users,
  Layers,
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

const AVATAR_FRAMES: {
  id: NonNullable<User['avatarFrame']>;
  label: string;
  ringClass: string;
  swatch: string;
}[] = [
  { id: 'none', label: 'Yok', ringClass: 'border-neutral-900', swatch: 'bg-white/10' },
  {
    id: 'gold',
    label: 'Altın',
    ringClass: 'border-amber-400 ring-2 ring-amber-400/40 shadow-[0_0_20px_rgba(251,191,36,0.35)]',
    swatch: 'bg-gradient-to-tr from-amber-500 to-yellow-300',
  },
  {
    id: 'neon',
    label: 'Neon Mor',
    ringClass: 'border-fuchsia-400 ring-2 ring-purple-500/50 shadow-[0_0_20px_rgba(192,132,252,0.45)]',
    swatch: 'bg-gradient-to-tr from-purple-600 to-fuchsia-400',
  },
  {
    id: 'emerald',
    label: 'Zümrüt',
    ringClass: 'border-emerald-400 ring-2 ring-emerald-500/45 shadow-[0_0_20px_rgba(52,211,153,0.4)]',
    swatch: 'bg-gradient-to-tr from-emerald-500 to-teal-300',
  },
  {
    id: 'crimson',
    label: 'Kızıl',
    ringClass: 'border-rose-500 ring-2 ring-rose-500/45 shadow-[0_0_20px_rgba(244,63,94,0.4)]',
    swatch: 'bg-gradient-to-tr from-rose-600 to-orange-400',
  },
  {
    id: 'rainbow',
    label: 'Prizma',
    ringClass: 'border-cyan-300 ring-2 ring-pink-500/50 shadow-[0_0_22px_rgba(56,189,248,0.45)]',
    swatch: 'bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500',
  },
];

function renderRichBio(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 hover:text-sky-300 underline underline-offset-2 break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user: propUser, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);
  const {
    currentUser,
    onlineUsers,
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
    servers,
    blockUser,
    unblockUser,
    timeoutMember,
    userNotes,
    setUserNote: setGlobalUserNote,
    updateUserActivity,
    transferWalletBalance,
    language,
  } = useSocket();

  const isMe = currentUser?.id === propUser.id || currentUser?.username.toLowerCase() === propUser.username.toLowerCase();
  const user = isMe && currentUser
    ? currentUser
    : (onlineUsers.find((u) => u.id === propUser.id || u.username.toLowerCase() === propUser.username.toLowerCase()) || propUser);
  const isBlocked = Boolean(currentUser?.blockedUsers?.includes(user.username));
  const canTimeout = Boolean(
    !isMe &&
      activeServer &&
      activeServer.id !== 'direct-messages' &&
      (isUserServerOwner(currentUser, activeServer) || currentUser?.role === 'admin')
  );
  const isFriend = friends.some((f) => f.username.toLowerCase() === user.username.toLowerCase());
  const incomingReq = incomingFriendRequests.find((r) => r.fromUsername.toLowerCase() === user.username.toLowerCase());
  const hasOutgoingRequest = outgoingFriendRequests.some((r) => r.toUsername.toLowerCase() === user.username.toLowerCase());

  // Self editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editStatusMessage, setEditStatusMessage] = useState(user.statusMessage || 'Çevrimiçi');
  const [editBio, setEditBio] = useState(user.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.');
  const [editBannerColor, setEditBannerColor] = useState(user.bannerColor || BANNER_PRESETS[0].class);
  const [editBannerImage, setEditBannerImage] = useState(user.bannerImage || '');
  const [editBannerPosition, setEditBannerPosition] = useState<'top' | 'center' | 'bottom'>(
    user.bannerPosition || 'center'
  );
  const [editAvatar, setEditAvatar] = useState(user.avatar || '🎮');
  const [editAvatarFrame, setEditAvatarFrame] = useState<NonNullable<User['avatarFrame']>>(
    user.avatarFrame || 'none'
  );
  const [editPinnedBadgeId, setEditPinnedBadgeId] = useState(user.pinnedBadgeId || '');
  const [editSocialLinks, setEditSocialLinks] = useState<{ steam?: string; github?: string; website?: string }>(
    user.socialLinks || {}
  );
  const [editStatus, setEditStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(
    user.status === 'idle' || user.status === 'dnd' || user.status === 'offline' ? user.status : 'online'
  );
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  const [bannerUrlInput, setBannerUrlInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [profileSavedFeedback, setProfileSavedFeedback] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'about' | 'servers' | 'friends'>('about');
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [statusExpiryPreset, setStatusExpiryPreset] = useState<StatusExpiryPreset>('never');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState('50');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditStatusMessage(user.statusMessage || 'Çevrimiçi');
    setEditBio(user.bio || 'Merhaba! Discord & TeamSpeak ses platformunu kullanıyorum.');
    setEditBannerColor(user.bannerColor || BANNER_PRESETS[0].class);
    setEditBannerImage(user.bannerImage || '');
    setEditBannerPosition(user.bannerPosition || 'center');
    setEditAvatar(user.avatar || '🎮');
    setEditAvatarFrame(user.avatarFrame || 'none');
    setEditPinnedBadgeId(user.pinnedBadgeId || '');
    setEditSocialLinks(user.socialLinks || {});
    if (user.status === 'online' || user.status === 'idle' || user.status === 'dnd' || user.status === 'offline') {
      setEditStatus(user.status);
    }
  }, [user]);

  // Private Note state (stored in localStorage per target user)
  const [userNote, setUserNote] = useState('');
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  useEffect(() => {
    if (!isMe && user.id) {
      const globalNote = userNotes?.[user.username.toLowerCase()];
      const savedNote = globalNote !== undefined ? globalNote : (localStorage.getItem(`dc_user_note_${user.id}`) || '');
      setUserNote(savedNote);
    }
  }, [user.id, user.username, userNotes, isMe]);

  const handleSaveNote = () => {
    if (!isMe && user.id) {
      localStorage.setItem(`dc_user_note_${user.id}`, userNote);
      setGlobalUserNote(user.username, userNote);
      setNoteSavedFeedback(true);
      setTimeout(() => setNoteSavedFeedback(false), 2000);
    }
  };

  const handleSaveProfile = () => {
    setUploadError(null);
    const finalAvatar =
      avatarUrlInput.trim().startsWith('http://') || avatarUrlInput.trim().startsWith('https://')
        ? avatarUrlInput.trim()
        : editAvatar;
    const finalBannerImage =
      bannerUrlInput.trim().startsWith('http://') || bannerUrlInput.trim().startsWith('https://')
        ? bannerUrlInput.trim()
        : editBannerImage;

    updateProfileDetails({
      statusMessage: editStatusMessage,
      bio: editBio,
      bannerColor: editBannerColor,
      bannerImage: finalBannerImage,
      bannerPosition: editBannerPosition,
      avatarFrame: editAvatarFrame,
      pinnedBadgeId: editPinnedBadgeId,
      socialLinks: editSocialLinks,
      avatar: finalAvatar,
      status: editStatus,
    });
    try {
      const expiresAt = computeStatusExpiryTimestamp(statusExpiryPreset);
      if (expiresAt) {
        localStorage.setItem(STATUS_EXPIRY_KEY, String(expiresAt));
      } else {
        localStorage.removeItem(STATUS_EXPIRY_KEY);
      }
    } catch {}
    setAvatarUrlInput('');
    setBannerUrlInput('');
    setIsEditing(false);
    setProfileSavedFeedback(true);
    setTimeout(() => setProfileSavedFeedback(false), 2500);
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    const result = await processUploadedImage(file, {
      maxWidth: 256,
      maxHeight: 256,
      maxGifBytes: 1.5 * 1024 * 1024,
    });
    if (result.ok) {
      setEditAvatar(result.dataUrl);
    } else {
      setUploadError(result.error);
    }
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    const result = await processUploadedImage(file, {
      maxWidth: 960,
      maxHeight: 380,
      maxGifBytes: 2 * 1024 * 1024,
    });
    if (result.ok) {
      setEditBannerImage(result.dataUrl);
    } else {
      setUploadError(result.error);
    }
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
  const activeBannerImage = isEditing ? editBannerImage : (user.bannerImage || '');
  const activeBannerPosition = isEditing ? editBannerPosition : (user.bannerPosition || 'center');
  const activeAvatar = isEditing ? editAvatar : (user.avatar || '🎮');
  const activeAvatarFrame = isEditing ? editAvatarFrame : (user.avatarFrame || 'none');
  const activeFrameObj = AVATAR_FRAMES.find((f) => f.id === activeAvatarFrame) || AVATAR_FRAMES[0];
  const activeStatus = isEditing ? editStatus : user.status;
  const bannerPosClass =
    activeBannerPosition === 'top'
      ? 'object-top'
      : activeBannerPosition === 'bottom'
      ? 'object-bottom'
      : 'object-center';

  const mutualServers = servers.filter((s) => s.id !== 'direct-messages');
  const mutualFriends = isMe
    ? friends
    : friends.filter((f) =>
        (user.friends || []).some((uf) => uf.toLowerCase() === f.username.toLowerCase())
      );

  const handleQuickStatusChange = (nextStatus: 'online' | 'idle' | 'dnd' | 'offline') => {
    setEditStatus(nextStatus);
    updateProfileDetails({ status: nextStatus });
    setShowStatusMenu(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${user.username} Profili`}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto no-scrollbar rounded-3xl ios-glass shadow-2xl border border-white/15 text-white animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden File Inputs */}
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleAvatarFileChange}
          className="hidden"
        />
        <input
          ref={bannerFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleBannerFileChange}
          className="hidden"
        />

        {/* Banner */}
        <div className={`h-36 w-full bg-gradient-to-r ${activeBanner} relative transition-all duration-300 overflow-hidden`}>
          {activeBannerImage && (
            <img
              src={activeBannerImage}
              alt="Profil Banner"
              className={`absolute inset-0 w-full h-full object-cover ${bannerPosClass} transition-all duration-300`}
              draggable={false}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md transition"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>

          {profileSavedFeedback && !isEditing && (
            <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-emerald-500/80 text-white text-xs font-bold flex items-center gap-1 backdrop-blur-md shadow-lg">
              <Check className="w-3.5 h-3.5" />
              <span>Profil Güncellendi</span>
            </div>
          )}

          {isMe && !isEditing && (
            <button
              onClick={() => {
                setUploadError(null);
                setIsEditing(true);
              }}
              className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-black/40 hover:bg-black/60 text-white/90 hover:text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition border border-white/15"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t(language, 'editProfile')}</span>
            </button>
          )}

          {isEditing && (
            <>
              <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => bannerFileRef.current?.click()}
                  className="px-2.5 py-1 rounded-full bg-black/55 hover:bg-black/75 text-white text-[11px] font-semibold flex items-center gap-1.5 backdrop-blur-md border border-white/15 transition"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                  <span>Banner Yükle (GIF/Resim)</span>
                </button>
                {editBannerImage && (
                  <button
                    type="button"
                    onClick={() => setEditBannerImage('')}
                    className="p-1.5 rounded-full bg-rose-500/70 hover:bg-rose-500 text-white backdrop-blur-md transition"
                    title="Banner Resmini Kaldır"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="absolute bottom-2 right-3 z-10 flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setUploadError(null);
                    setEditAvatar(user.avatar || '🎮');
                    setEditBannerColor(user.bannerColor || BANNER_PRESETS[0].class);
                    setEditBannerImage(user.bannerImage || '');
                  }}
                  className="px-2.5 py-1 rounded-full bg-black/45 hover:bg-black/65 text-white text-xs font-medium backdrop-blur-md transition border border-white/10"
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
            </>
          )}
        </div>

        {/* Avatar & Badges Header */}
        <div className="relative px-6 pb-6 pt-0 bg-neutral-900/80 backdrop-blur-xl">
          <div className="flex justify-between items-end -mt-12 mb-4">
            {/* Avatar with Halo Indicator & Frame */}
            <div className="relative group/avatar">
              <div
                onClick={() => isEditing && avatarFileRef.current?.click()}
                className={`w-24 h-24 rounded-3xl bg-neutral-800 border-4 flex items-center justify-center text-4xl shadow-xl transition-all overflow-hidden relative ${
                  activeFrameObj.ringClass
                } ${
                  user.isSpeaking ? 'ios-halo' : ''
                } ${isEditing ? 'cursor-pointer ring-2 ring-blue-400/50 hover:ring-blue-400' : ''}`}
              >
                <AvatarView
                  avatar={activeAvatar}
                  alt={user.username}
                  imgClassName="w-full h-full object-cover"
                />
                {isEditing && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/avatar:opacity-100 flex flex-col items-center justify-center gap-1 transition">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[9px] font-bold text-white uppercase">Değiştir</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => isMe && !isEditing && setShowStatusMenu((v) => !v)}
                className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-neutral-900 shadow-md transition-transform ${getStatusColor(
                  activeStatus
                )} ${isMe && !isEditing ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
                title={isMe && !isEditing ? 'Çevrimiçi durumunu hızlı değiştir' : undefined}
              />
              {isMe && !isEditing && showStatusMenu && (
                <div className="absolute left-0 top-full mt-2 z-30 w-44 rounded-2xl bg-slate-900/95 border border-white/15 shadow-2xl p-1.5 backdrop-blur-xl animate-fade-in">
                  {[
                    { id: 'online', label: 'Çevrimiçi', dot: 'bg-emerald-400' },
                    { id: 'idle', label: 'Boşta', dot: 'bg-amber-400' },
                    { id: 'dnd', label: 'Rahatsız Etmeyin', dot: 'bg-red-400' },
                    { id: 'offline', label: 'Görünmez', dot: 'bg-slate-500' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleQuickStatusChange(st.id as 'online' | 'idle' | 'dnd' | 'offline')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs transition ${
                        activeStatus === st.id
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-white/75 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                      <span>{st.label}</span>
                    </button>
                  ))}
                </div>
              )}
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
                    onClick={async () => {
                      if (await appConfirm({ title: 'Arkadaşlıktan Çıkar', message: `${user.username} adlı kullanıcıyı arkadaş listenizden çıkarmak istediğinize emin misiniz?`, danger: true, confirmLabel: 'Çıkar' })) {
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
                      appToast(res.message || res.error || 'İşlem tamamlandı.', res.error ? 'error' : 'success');
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
                <h3 className="text-xl font-bold tracking-tight text-white select-text">{user.username}</h3>
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

              <button
                type="button"
                onClick={handleCopyId}
                className="text-xs text-white/45 font-mono hover:text-white/80 cursor-pointer inline-flex items-center gap-1.5 transition mt-0.5"
                title="Kullanıcı ID'sini Kopyala"
              >
                <span>#{user.id.slice(0, 8)}</span>
                <Copy className="w-3 h-3 opacity-70" />
                {copiedId && <span className="text-[10px] text-emerald-400 font-sans font-semibold">Kopyalandı ✓</span>}
              </button>
            </div>

            {/* Mini Stats Strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-white/45 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-indigo-400" /> Sunucu
                </span>
                <span className="text-xs font-bold text-white/90">{mutualServers.length}</span>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-white/45 flex items-center gap-1">
                  <Users className="w-3 h-3 text-emerald-400" /> Arkadaş
                </span>
                <span className="text-xs font-bold text-white/90">
                  {isMe ? friends.length : (user.friends?.length ?? mutualFriends.length)}
                </span>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-white/45 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" /> Rozet
                </span>
                <span className="text-xs font-bold text-white/90">{user.badges?.length || 0}</span>
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
            {user.activity && (() => {
              const act = user.activity;
              const styleMap = {
                playing: {
                  card: 'from-purple-900/40 via-indigo-900/30 to-slate-900/40 border-purple-500/30',
                  icon: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
                  label: 'text-purple-400',
                  sub: 'text-purple-200/70',
                  title: 'Oyun Oynuyor',
                },
                listening: {
                  card: 'from-emerald-900/40 via-teal-900/30 to-slate-900/40 border-emerald-500/30',
                  icon: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
                  label: 'text-emerald-400',
                  sub: 'text-emerald-200/70',
                  title: 'Müzik Dinliyor',
                },
                streaming: {
                  card: 'from-rose-900/40 via-red-900/30 to-slate-900/40 border-rose-500/30',
                  icon: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
                  label: 'text-rose-400',
                  sub: 'text-rose-200/70',
                  title: 'Canlı Yayında',
                },
                custom: {
                  card: 'from-sky-900/40 via-blue-900/30 to-slate-900/40 border-sky-500/30',
                  icon: 'bg-sky-500/20 border-sky-500/40 text-sky-300',
                  label: 'text-sky-400',
                  sub: 'text-sky-200/70',
                  title: 'Özel Durum',
                },
              }[act.type];
              const elapsedMins = act.startedAt ? Math.max(1, Math.floor((Date.now() - act.startedAt) / 60000)) : null;
              return (
                <div className={`p-3 rounded-2xl bg-gradient-to-r ${styleMap.card} border flex items-center gap-3 shadow-lg`}>
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0 ${styleMap.icon}`}>
                    {act.emoji ? (
                      <span>{act.emoji}</span>
                    ) : act.type === 'listening' ? (
                      <Headphones className="w-5 h-5" />
                    ) : act.type === 'streaming' ? (
                      <Radio className="w-5 h-5" />
                    ) : act.type === 'custom' ? (
                      <Sparkles className="w-5 h-5" />
                    ) : (
                      <Gamepad2 className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${styleMap.label}`}>
                        {styleMap.title}
                      </div>
                      {elapsedMins !== null && (
                        <div className="text-[10px] text-white/50 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" /> {elapsedMins >= 60 ? `${Math.floor(elapsedMins / 60)} sa ${elapsedMins % 60} dk` : `${elapsedMins} dk`}
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white truncate">
                      {act.name}
                    </div>
                    {act.details && (
                      <div className={`text-xs truncate ${styleMap.sub}`}>
                        {act.details}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Custom Status Message */}
            {!isEditing ? (
              <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0">💬</span>
                  <span className="text-xs text-white/80 font-medium truncate select-text">
                    {user.statusMessage || 'Çevrimiçi'}
                  </span>
                </div>
                {isMe && (
                  <button
                    type="button"
                    onClick={() => setIsActivityModalOpen(true)}
                    className="shrink-0 px-2 py-0.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-[10px] font-semibold text-purple-300 transition flex items-center gap-1"
                    title="Özel Durum / Aktivite Ayarla"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{user.activity ? 'Aktivite' : '+ Aktivite'}</span>
                  </button>
                )}
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
                <div className="pt-1.5 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-white/45 font-semibold uppercase tracking-wider">
                    {t(language, 'statusExpiry')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {STATUS_EXPIRY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStatusExpiryPreset(opt.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition ${
                          statusExpiryPreset === opt.id
                            ? 'bg-blue-500/25 border-blue-400/50 text-blue-200'
                            : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Profile Badges */}
            {user.badges && user.badges.length > 0 && (() => {
              const pinnedId = isEditing ? editPinnedBadgeId : (user.pinnedBadgeId || '');
              const sortedBadges = [...user.badges].sort((a, b) =>
                a.id === pinnedId ? -1 : b.id === pinnedId ? 1 : 0
              );
              const selectedBadge = sortedBadges.find((b) => b.id === selectedBadgeId);
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Kazanılan Rozetler ({user.badges.length})
                    </div>
                    <span className="text-[10px] text-white/40">
                      {isEditing ? 'Öne çıkarmak için tıkla' : t(language, 'clickForDetails')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sortedBadges.map((b) => {
                      const isPinned = b.id === pinnedId;
                      const isSelected = b.id === selectedBadgeId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditPinnedBadgeId(isPinned ? '' : b.id);
                            }
                            setSelectedBadgeId((prev) => (prev === b.id ? null : b.id));
                          }}
                          className={`px-2.5 py-1 rounded-xl bg-gradient-to-r ${b.color} text-white text-xs font-bold flex items-center gap-1.5 shadow-md border transition cursor-pointer hover:scale-105 ${
                            isPinned
                              ? 'border-amber-300 ring-1 ring-amber-300/60'
                              : isSelected
                              ? 'border-white/70 ring-1 ring-white/50'
                              : 'border-white/10'
                          }`}
                        >
                          <span>{b.icon}</span>
                          <span>{b.name}</span>
                          {isPinned && <Star className="w-3 h-3 text-amber-200 fill-amber-200" />}
                        </button>
                      );
                    })}
                  </div>
                  {selectedBadge && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-[11px] text-white/80 flex items-center justify-between gap-2 animate-fade-in">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0">{selectedBadge.icon}</span>
                        <span className="font-semibold text-white shrink-0">{selectedBadge.name}:</span>
                        <span className="text-white/65">
                          {selectedBadge.description || 'Özel başarı rozeti.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedBadgeId(null)}
                        className="text-white/40 hover:text-white text-xs px-1 shrink-0"
                        title="Kapat"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Bio / Hakkında & Social / Mutual Tabs */}
            {!isEditing ? (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {[
                    { id: 'about', label: 'Hakkında' },
                    { id: 'servers', label: `${isMe ? 'Sunucular' : 'Ortak Sunucular'} (${mutualServers.length})` },
                    { id: 'friends', label: `${isMe ? 'Arkadaşlar' : 'Ortak Arkadaşlar'} (${mutualFriends.length})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProfileTab(tab.id as 'about' | 'servers' | 'friends')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition ${
                        profileTab === tab.id
                          ? 'bg-white/15 text-white shadow-sm'
                          : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {profileTab === 'about' && (
                  <div className="space-y-2">
                    <div className="text-xs text-white/75 leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/5 whitespace-pre-wrap select-text">
                      {renderRichBio(user.bio || 'Bu kullanıcı henüz hakkında yazısı eklememiş.')}
                    </div>
                    {(user.socialLinks?.steam || user.socialLinks?.github || user.socialLinks?.website) && (
                      <div className="flex flex-wrap gap-1.5">
                        {user.socialLinks.steam && (
                          <a
                            href={user.socialLinks.steam.startsWith('http') ? user.socialLinks.steam : `https://steamcommunity.com/id/${user.socialLinks.steam}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-[11px] text-sky-300 flex items-center gap-1.5 transition"
                          >
                            <Gamepad2 className="w-3 h-3" /> Steam
                          </a>
                        )}
                        {user.socialLinks.github && (
                          <a
                            href={user.socialLinks.github.startsWith('http') ? user.socialLinks.github : `https://github.com/${user.socialLinks.github}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-[11px] text-white/85 flex items-center gap-1.5 transition"
                          >
                            <Link2 className="w-3 h-3" /> GitHub
                          </a>
                        )}
                        {user.socialLinks.website && (
                          <a
                            href={user.socialLinks.website.startsWith('http') ? user.socialLinks.website : `https://${user.socialLinks.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-[11px] text-emerald-300 flex items-center gap-1.5 transition"
                          >
                            <Globe className="w-3 h-3" /> Web
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {profileTab === 'servers' && (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {mutualServers.length === 0 ? (
                      <div className="text-xs text-white/40 text-center py-3">Sunucu bulunamadı.</div>
                    ) : (
                      mutualServers.map((srv) => (
                        <div
                          key={srv.id}
                          className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2.5"
                        >
                          <span className="text-base">{srv.icon || '🌐'}</span>
                          <span className="text-xs font-medium text-white/85 truncate">{srv.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {profileTab === 'friends' && (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {mutualFriends.length === 0 ? (
                      <div className="text-xs text-white/40 text-center py-3">
                        {isMe ? 'Henüz arkadaş eklenmemiş.' : 'Ortak arkadaş bulunamadı.'}
                      </div>
                    ) : (
                      mutualFriends.map((fr) => (
                        <div
                          key={fr.id}
                          className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2.5"
                        >
                          <div className="w-6 h-6 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center text-xs shrink-0">
                            <AvatarView avatar={fr.avatar} alt={fr.username} imgClassName="w-full h-full object-cover" />
                          </div>
                          <span className="text-xs font-medium text-white/85 truncate flex-1">{fr.username}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              fr.status === 'online'
                                ? 'bg-emerald-400'
                                : fr.status === 'idle'
                                ? 'bg-amber-400'
                                : fr.status === 'dnd'
                                ? 'bg-red-400'
                                : 'bg-white/25'
                            }`}
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  <span>Hakkında</span>
                  <span className="font-mono text-[10px] text-white/40">{editBio.length} / 500</span>
                </div>
                <textarea
                  value={editBio}
                  maxLength={500}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500 resize-none"
                  placeholder="Kendinizden bahsedin (https://... linkler otomatik tıklanabilir)..."
                />
              </div>
            )}

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

            {/* Edit Mode Customizers (Status, Banner & Avatar Upload/GIF/Presets) */}
            {isEditing && (
              <div className="space-y-4 pt-3 border-t border-white/10">
                {uploadError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                    {uploadError}
                  </div>
                )}

                {/* Online Status Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
                    Çevrimiçi Durumu
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'online', label: 'Çevrimiçi', dot: 'bg-emerald-400' },
                      { id: 'idle', label: 'Boşta', dot: 'bg-amber-400' },
                      { id: 'dnd', label: 'Rahatsız Etme', dot: 'bg-red-400' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setEditStatus(st.id as 'online' | 'idle' | 'dnd')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition ${
                          editStatus === st.id
                            ? 'bg-blue-500/20 border-blue-400 text-white'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Avatar Upload / URL / Emoji */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
                      <Smile className="w-3.5 h-3.5" />
                      Profil Resmi (GIF / Resim / Emoji)
                    </label>
                    <button
                      type="button"
                      onClick={() => avatarFileRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-[10px] font-bold flex items-center gap-1 transition"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Dosya Yükle</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Link2 className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        value={avatarUrlInput}
                        onChange={(e) => setAvatarUrlInput(e.target.value)}
                        placeholder="Veya GIF / Resim URL yapıştır (https://...)"
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = avatarUrlInput.trim();
                        if (url.startsWith('http://') || url.startsWith('https://')) {
                          setEditAvatar(url);
                          setAvatarUrlInput('');
                          setUploadError(null);
                        } else {
                          setUploadError('Geçerli bir http:// veya https:// görsel linki girin.');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition"
                    >
                      Uygula
                    </button>
                  </div>

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
                    {isImageAvatar(editAvatar) && (
                      <span className="px-2 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300 font-semibold flex items-center">
                        Özel Görsel Aktif
                      </span>
                    )}
                  </div>
                </div>

                {/* Banner Upload / URL / Gradient Chooser */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5" />
                      Banner (GIF / Resim / Gradyan)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => bannerFileRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Banner Yükle</span>
                      </button>
                      {editBannerImage && (
                        <button
                          type="button"
                          onClick={() => setEditBannerImage('')}
                          className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold transition"
                        >
                          Kaldır
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Link2 className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        value={bannerUrlInput}
                        onChange={(e) => setBannerUrlInput(e.target.value)}
                        placeholder="Veya Banner GIF / Resim URL (https://...)"
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white outline-none focus:border-purple-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = bannerUrlInput.trim();
                        if (url.startsWith('http://') || url.startsWith('https://')) {
                          setEditBannerImage(url);
                          setBannerUrlInput('');
                          setUploadError(null);
                        } else {
                          setUploadError('Geçerli bir http:// veya https:// görsel linki girin.');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition"
                    >
                      Uygula
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {BANNER_PRESETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setEditBannerColor(b.class);
                          setEditBannerImage('');
                        }}
                        className={`h-7 rounded-lg bg-gradient-to-r ${b.class} border transition ${
                          !editBannerImage && editBannerColor === b.class
                            ? 'ring-2 ring-white border-transparent scale-105'
                            : 'border-white/20'
                        }`}
                        title={b.name}
                      />
                    ))}
                  </div>

                  {/* Banner Focal Position */}
                  {editBannerImage && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-white/50 font-medium">Banner Odak Noktası:</span>
                      <div className="flex items-center gap-1">
                        {[
                          { id: 'top', label: 'Yukarı' },
                          { id: 'center', label: 'Orta' },
                          { id: 'bottom', label: 'Aşağı' },
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setEditBannerPosition(pos.id as 'top' | 'center' | 'bottom')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition ${
                              editBannerPosition === pos.id
                                ? 'bg-purple-500/25 border-purple-400 text-white'
                                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Avatar Frame Picker */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">
                    Avatar Çerçevesi
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {AVATAR_FRAMES.map((fr) => (
                      <button
                        key={fr.id}
                        type="button"
                        onClick={() => setEditAvatarFrame(fr.id)}
                        className={`py-1.5 px-1 rounded-xl border text-[10px] font-semibold flex flex-col items-center gap-1 transition ${
                          editAvatarFrame === fr.id
                            ? 'bg-white/15 border-white text-white'
                            : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full border border-white/30 ${fr.swatch}`} />
                        <span>{fr.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Social Links */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">
                    Sosyal &amp; Oyun Bağlantıları (İsteğe Bağlı)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      type="text"
                      value={editSocialLinks.steam || ''}
                      onChange={(e) => setEditSocialLinks((s) => ({ ...s, steam: e.target.value }))}
                      placeholder="Steam ID / URL"
                      className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white outline-none focus:border-sky-500"
                    />
                    <input
                      type="text"
                      value={editSocialLinks.github || ''}
                      onChange={(e) => setEditSocialLinks((s) => ({ ...s, github: e.target.value }))}
                      placeholder="GitHub / URL"
                      className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white outline-none focus:border-sky-500"
                    />
                    <input
                      type="text"
                      value={editSocialLinks.website || ''}
                      onChange={(e) => setEditSocialLinks((s) => ({ ...s, website: e.target.value }))}
                      placeholder="Web Sitesi"
                      className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white outline-none focus:border-sky-500"
                    />
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

            {/* Account Info Footer + Quick Balance Transfer */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/40">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Kayıt: {user.createdAt || '2026'}</span>
                </div>
                {isMe && user.walletBalance !== undefined ? (
                  <div className="flex items-center gap-1 text-emerald-400 font-medium">
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Bakiye: {user.walletBalance} ₺</span>
                  </div>
                ) : !isMe ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTransferOpen((v) => !v);
                        setTransferFeedback(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1 transition"
                    >
                      <Send className="w-3 h-3" />
                      <span>₺ Bakiye Gönder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReportOpen(true)}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold flex items-center gap-1 transition"
                    >
                      <Flag className="w-3 h-3" />
                      <span>{t(language, 'reportUserBtn')}</span>
                    </button>
                  </div>
                ) : null}
              </div>

              {!isMe && transferOpen && (
                <div className="p-2.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-300 font-semibold">
                      {user.username} kullanıcısına bakiye gönder
                    </span>
                    <span className="text-white/50">Bakiyeniz: {currentUser?.walletBalance ?? 0} ₺</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="w-24 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-emerald-400"
                    />
                    {[25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTransferAmount(String(preset))}
                        className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white/75 font-semibold"
                      >
                        {preset} ₺
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={transferBusy}
                      onClick={async () => {
                        const amt = Math.floor(Number(transferAmount));
                        if (!amt || amt < 1) {
                          setTransferFeedback({ ok: false, text: 'Geçerli bir tutar girin.' });
                          return;
                        }
                        setTransferBusy(true);
                        const res = await transferWalletBalance(user.username, amt);
                        setTransferBusy(false);
                        setTransferFeedback({
                          ok: res.success,
                          text: res.message || res.error || (res.success ? 'Gönderildi!' : 'Hata oluştu.'),
                        });
                      }}
                      className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[11px] font-bold transition"
                    >
                      {transferBusy ? '...' : 'Gönder'}
                    </button>
                  </div>
                  {transferFeedback && (
                    <div
                      className={`text-[11px] font-medium ${
                        transferFeedback.ok ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {transferFeedback.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isMe && (
        <ActivitySelectorModal
          isOpen={isActivityModalOpen}
          onClose={() => setIsActivityModalOpen(false)}
          currentActivity={user.activity}
          onSaveActivity={(act) => updateUserActivity(act)}
        />
      )}

      {!isMe && (
        <ReportContentModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          targetUsername={user.username}
          serverId={activeServer?.id}
        />
      )}
    </div>
  );
};