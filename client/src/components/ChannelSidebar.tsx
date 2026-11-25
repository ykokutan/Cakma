import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { t } from '../utils/i18n';
import { appConfirm, appPrompt } from '../utils/appDialogs';
import { isUserServerOwner } from '../utils/serverIdentity';
import { QUICK_STATUS_PRESETS, STATUS_EXPIRY_KEY, computeStatusExpiryTimestamp } from '../utils/statusExpiry';
import { User, Channel } from '../types';
import { VoiceUserContextMenu } from './VoiceUserContextMenu';
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
  ChevronUp,
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
  Lock,
  BarChart2,
  UserPlus,
  Copy,
  Check,
  X,
  Calendar,
  Trash2,
  Pencil,
  Bell,
  BellOff,
  Megaphone,
  MessagesSquare,
  FolderPlus,
  GripVertical,
} from 'lucide-react';
import { useChannelDrafts } from '../utils/channelDrafts';
import type { NotificationLevel } from '../utils/notificationPrefs';
import { ActivitySelectorModal } from './ActivitySelectorModal';
import { ChannelPasswordModal } from './ChannelPasswordModal';
import { ServerAnalyticsModal } from './ServerAnalyticsModal';
import { AvatarView, isImageAvatar } from './AvatarView';

import { Radio as StageRadioIcon, Shield as ChannelShieldIcon, Sparkles as OnboardingSparklesIcon } from 'lucide-react';

const ServerEventsModal = lazy(() =>
  import('./ServerEventsModal').then((m) => ({ default: m.ServerEventsModal }))
);
const CreateGroupDmModal = lazy(() =>
  import('./chat/CreateGroupDmModal').then((m) => ({ default: m.CreateGroupDmModal }))
);
const ChannelPermissionsModal = lazy(() =>
  import('./server/ChannelPermissionsModal').then((m) => ({ default: m.ChannelPermissionsModal }))
);
const OnboardingModal = lazy(() =>
  import('./server/OnboardingModal').then((m) => ({ default: m.OnboardingModal }))
);

interface ChannelSidebarProps {
  onOpenCreateChannel: (type: 'text' | 'voice' | 'announcement' | 'forum' | 'stage', categoryId?: string | null) => void;
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
  const [confirmLeaveServer, setConfirmLeaveServer] = useState(false);
  const [voiceUserMenu, setVoiceUserMenu] = useState<{ user: User; x: number; y: number } | null>(null);
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);
  const [channelMenu, setChannelMenu] = useState<{ channel: Channel; x: number; y: number } | null>(null);
  const [editingChannel, setEditingChannel] = useState<{ channel: Channel; bitrateKbps: number; userLimit: number } | null>(null);
  const [isCreateGroupDmOpen, setIsCreateGroupDmOpen] = useState(false);
  const [draggingChannelId, setDraggingChannelId] = useState<string | null>(null);
  const [dragOverChannelTargetId, setDragOverChannelTargetId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null | undefined>(undefined);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('dc_collapsed_categories');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!channelMenu) return;
    const handleClose = () => setChannelMenu(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChannelMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [channelMenu]);
  const {
    activeServer,
    activeChannel,
    selectChannel,
    connectedVoiceChannelId,
    joinVoiceChannel,
    moveVoiceUser,
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
    groupDms,
    activeGroupDm,
    openGroupDm,
    joinGroupDmVoice,
    openDirectMessage,
    closeDirectMessage,
    startDirectCall,
    incomingFriendRequests,
    friends,
    unreadDMByUser,
    updateUserActivity,
    openDiagnostics,
    ping,
    unlockedChannelIds,
    unlockChannel,
    voicePasswordError,
    clearVoicePasswordError,
    unreadCounts,
    mentionCounts,
    createServerInvite,
    storeSettings,
    reorderChannel,
    reorderChannelsBatch,
    createCategory,
    renameCategory,
    deleteCategory,
    adminDeleteChannel,
    updateProfileDetails,
    updateChannelSettings,
    notificationPrefs,
    setTargetNotificationPref,
    leaveServer,
    updateServerNickname,
    messagesMap,
    jumpToMessage,
    language,
  } = useSocket();
  const drafts = useChannelDrafts();

  const canManageChannels = Boolean(
    activeServer &&
    currentUser &&
    (
      isUserServerOwner(currentUser, activeServer) ||
      currentUser.role === 'admin' ||
      activeServer.members?.some((m) => {
        if (m.username.toLowerCase() !== currentUser.username.toLowerCase()) return false;
        return m.roleIds.some((rid) => {
          const role = activeServer.roles?.find((r) => r.id === rid);
          return role?.permissions.includes('manage_server') || role?.permissions.includes('manage_channels');
        });
      })
    )
  );

  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [permChannel, setPermChannel] = useState<Channel | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState(currentUser?.statusMessage || '');
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCustomStatusInput(currentUser?.statusMessage || '');
  }, [currentUser?.statusMessage]);

  useEffect(() => {
    const handler = () => setIsOnboardingOpen(true);
    window.addEventListener('cakma-open-onboarding', handler);
    return () => window.removeEventListener('cakma-open-onboarding', handler);
  }, []);

  useEffect(() => {
    if (!isStatusMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isStatusMenuOpen]);

  const getStatusMeta = (status?: string) => {
    switch (status) {
      case 'idle':
        return { label: 'Boşta', dot: 'bg-amber-400', text: 'text-amber-300' };
      case 'dnd':
        return { label: 'Rahatsız Etmeyin', dot: 'bg-red-500', text: 'text-red-400' };
      case 'offline':
        return { label: 'Görünmez', dot: 'bg-slate-400', text: 'text-slate-300' };
      default:
        return { label: 'Çevrimiçi', dot: 'bg-emerald-400', text: 'text-emerald-300' };
    }
  };
  const currentStatusMeta = getStatusMeta(currentUser?.status);
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
    const isOwner = isUserServerOwner(currentUser, activeServer);
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

  const toggleCategoryCollapsed = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = { ...prev, [categoryId]: !prev[categoryId] };
      try {
        localStorage.setItem('dc_collapsed_categories', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const renderChannelTypeIcon = (channel: Channel, isConnectedHere = false, isMutedPref = false) => {
    if (channel.type === 'voice') {
      return (
        <Volume2
          className={`w-4 h-4 shrink-0 ${isConnectedHere ? 'text-emerald-400' : 'opacity-70'}`}
        />
      );
    }
    if (channel.type === 'announcement') {
      return (
        <Megaphone
          className={`w-4 h-4 shrink-0 text-amber-400 ${isMutedPref ? 'opacity-40' : ''}`}
        />
      );
    }
    if (channel.type === 'forum') {
      return (
        <MessagesSquare
          className={`w-4 h-4 shrink-0 text-cyan-400 ${isMutedPref ? 'opacity-40' : ''}`}
        />
      );
    }
    return <Hash className={`w-4 h-4 shrink-0 ${isMutedPref ? 'opacity-40' : 'opacity-70'}`} />;
  };

  const handleChannelReorderDrop = (
    targetChannelId: string | null,
    targetCategoryId: string | null
  ) => {
    const draggedId = draggingChannelId;
    setDraggingChannelId(null);
    setDragOverChannelTargetId(null);
    setDragOverCategoryId(undefined);
    if (!draggedId || !activeServer || draggedId === targetChannelId) return;

    const sorted = [...activeServer.channels].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    );
    const dragged = sorted.find((c) => c.id === draggedId);
    if (!dragged) return;

    const remaining = sorted.filter((c) => c.id !== draggedId);
    const updatedDragged: Channel = { ...dragged, categoryId: targetCategoryId };

    let insertAt = remaining.length;
    if (targetChannelId) {
      const targetIdx = remaining.findIndex((c) => c.id === targetChannelId);
      if (targetIdx !== -1) {
        insertAt = targetIdx;
        updatedDragged.categoryId = remaining[targetIdx].categoryId ?? null;
      }
    } else if (targetCategoryId) {
      let lastInCat = -1;
      remaining.forEach((c, idx) => {
        if ((c.categoryId ?? null) === targetCategoryId) lastInCat = idx;
      });
      if (lastInCat !== -1) {
        insertAt = lastInCat + 1;
      }
    }

    const reordered = [
      ...remaining.slice(0, insertAt),
      updatedDragged,
      ...remaining.slice(insertAt),
    ];

    const updates = reordered.map((ch, idx) => ({
      channelId: ch.id,
      categoryId: ch.categoryId ?? null,
      position: idx,
    }));
    reorderChannelsBatch(activeServer.id, updates);
  };

  if (!activeServer) {
    return (
      <div className="w-72 ios-glass-sidebar flex flex-col items-center justify-center p-4 text-white/40 text-xs">
        Bir sunucu seçin
      </div>
    );
  }

  const sortedCategories = [...(activeServer.categories || [])].sort(
    (a, b) => a.position - b.position
  );
  const categoryIdSet = new Set(sortedCategories.map((c) => c.id));
  const sortedChannels = [...activeServer.channels].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  const textChannels = sortedChannels.filter((c) => c.type !== 'voice' && c.type !== 'stage');
  const voiceChannels = sortedChannels.filter((c) => c.type === 'voice' || c.type === 'stage');

  const connectedVoiceChannel = activeServer.channels.find(
    (c) => c.id === connectedVoiceChannelId
  );
  const connectedGroupVoice =
    !connectedVoiceChannel && connectedVoiceChannelId
      ? groupDms.find((g) => (g.voiceChannelId || `voice-${g.id}`) === connectedVoiceChannelId)
      : undefined;

  const renderNonVoiceRow = (channel: Channel, siblings: Channel[], idx: number) => {
    const isActive = activeChannel?.id === channel.id;
    const unread = !isActive ? (unreadCounts[channel.id] || 0) : 0;
    const mentions = !isActive ? (mentionCounts[channel.id] || 0) : 0;
    const isMutedPref = notificationPrefs[channel.id] === 'muted';
    const isDropTarget = dragOverChannelTargetId === channel.id && draggingChannelId !== channel.id;

    return (
      <React.Fragment key={channel.id}>
      <div
        draggable={canManageChannels && !channel.isTempCreatorChannel}
        onDragStart={(e) => {
          if (!canManageChannels || channel.isTempCreatorChannel) return;
          e.dataTransfer.setData('application/x-cakma-channel', channel.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggingChannelId(channel.id);
        }}
        onDragOver={(e) => {
          if (!draggingChannelId || draggingChannelId === channel.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverChannelTargetId !== channel.id) setDragOverChannelTargetId(channel.id);
        }}
        onDragLeave={() => {
          if (dragOverChannelTargetId === channel.id) setDragOverChannelTargetId(null);
        }}
        onDrop={(e) => {
          if (!draggingChannelId || draggingChannelId === channel.id) return;
          e.preventDefault();
          handleChannelReorderDrop(channel.id, channel.categoryId ?? null);
        }}
        onDragEnd={() => {
          setDraggingChannelId(null);
          setDragOverChannelTargetId(null);
          setDragOverCategoryId(undefined);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setChannelMenu({
            channel,
            x: Math.max(8, Math.min(e.clientX, window.innerWidth - 220)),
            y: Math.max(8, Math.min(e.clientY, window.innerHeight - 200)),
          });
        }}
        className={`group w-full flex items-center justify-between gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
          isDropTarget
            ? 'border-t-2 border-indigo-400 bg-indigo-500/15 text-white'
            : isActive
            ? 'bg-gradient-to-r from-amber-500/20 via-teal-500/12 to-transparent text-white border border-amber-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_16px_rgba(245,158,11,0.14)]'
            : unread > 0
            ? 'text-white font-bold hover:bg-white/[0.06]'
            : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <button
          type="button"
          onClick={() => selectChannel(channel.id)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
        >
          {canManageChannels && (
            <GripVertical className="w-3 h-3 text-white/25 opacity-0 group-hover:opacity-100 shrink-0 -ml-1 cursor-grab" />
          )}
          {renderChannelTypeIcon(channel, false, isMutedPref)}
          <span className={`truncate ${isMutedPref ? 'opacity-55' : ''}`}>
            {channel.name}
          </span>
          {channel.isPrivate && (
            <span title={t(language, 'privateChannel')}>
              <Lock className="w-3 h-3 text-amber-300 shrink-0" />
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {isMutedPref && (
            <span title="Kanal bildirimleri sessize alındı" className="text-white/40 shrink-0">
              <BellOff className="w-3 h-3" />
            </span>
          )}
          {Boolean(drafts[channel.id]) && (
            <span title="Kaydedilmiş mesaj taslağı" className="text-amber-300/85 shrink-0">
              <Pencil className="w-3 h-3" />
            </span>
          )}
          {canManageChannels && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPermChannel(channel);
              }}
              className="hidden group-hover:flex w-5 h-5 rounded-md hover:bg-indigo-500/20 text-white/45 hover:text-indigo-300 items-center justify-center transition"
              title={t(language, 'channelPermissions')}
            >
              <ChannelShieldIcon className="w-3 h-3" />
            </button>
          )}
          {canManageChannels && siblings.length > 1 && (
            <div className="hidden group-hover:flex items-center gap-0.5 mr-0.5">
              {idx > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reorderChannel(activeServer.id, channel.id, 'up');
                  }}
                  className="p-0.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition"
                  title="Yukarı Taşı"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
              )}
              {idx < siblings.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reorderChannel(activeServer.id, channel.id, 'down');
                  }}
                  className="p-0.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition"
                  title="Aşağı Taşı"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {mentions > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0 shadow">
              @{mentions > 99 ? '99+' : mentions}
            </span>
          ) : unread > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/80 text-white text-[10px] font-bold shrink-0">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </div>
      </div>
      {(() => {
        const chMsgs = messagesMap[channel.id] || [];
        const activeThreads = chMsgs
          .filter((m) => Array.isArray(m.threadMessages) && m.threadMessages.length > 0)
          .slice(-3)
          .reverse();
        if (activeThreads.length === 0) return null;
        return (
          <div className="ml-5 pl-2.5 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
            {activeThreads.map((tMsg) => {
              const snippet =
                (tMsg.content || '').replace(/\s+/g, ' ').trim().slice(0, 26) || 'Alt Konu';
              return (
                <button
                  key={`thread-${tMsg.id}`}
                  type="button"
                  onClick={() => {
                    selectChannel(channel.id);
                    void jumpToMessage(channel.id, tMsg.id);
                  }}
                  className="w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-[11px] text-white/55 hover:text-cyan-200 hover:bg-white/[0.05] transition text-left"
                  title={tMsg.content || 'Alt Konu'}
                >
                  <span className="truncate">↳ {snippet}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/15 text-cyan-300 text-[9px] font-bold shrink-0">
                    {tMsg.threadMessages?.length || 0}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}
      </React.Fragment>
    );
  };

  const renderVoiceRow = (channel: Channel, siblings: Channel[], idx: number) => {
    const isConnectedHere = connectedVoiceChannelId === channel.id;
    const isViewingHere = activeChannel?.id === channel.id;
    const usersInChannel = onlineUsers.filter(
      (u) => u.currentVoiceChannelId === channel.id
    );

    const isLocked = Boolean(channel.password || channel.isLocked);
    const isTempCreator = Boolean(channel.isTempCreatorChannel || channel.name.includes('➕ Oda Kur'));
    const isUserDropTarget = dragOverChannelId === channel.id && !isTempCreator;
    const isChannelDropTarget =
      !isUserDropTarget && dragOverChannelTargetId === channel.id && draggingChannelId !== channel.id;
    const canMoveOthers = currentUser?.role === 'admin' || isUserServerOwner(currentUser, activeServer);

    return (
      <div
        key={channel.id}
        draggable={canManageChannels && !isTempCreator}
        onDragStart={(e) => {
          if (draggingUserId || !canManageChannels || isTempCreator) return;
          e.dataTransfer.setData('application/x-cakma-channel', channel.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggingChannelId(channel.id);
        }}
        onDragOver={(e) => {
          if (draggingUserId && !isTempCreator) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragOverChannelId !== channel.id) setDragOverChannelId(channel.id);
            return;
          }
          if (draggingChannelId && draggingChannelId !== channel.id) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragOverChannelTargetId !== channel.id) setDragOverChannelTargetId(channel.id);
          }
        }}
        onDragLeave={(e) => {
          if (dragOverChannelId === channel.id && !e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverChannelId(null);
          }
          if (dragOverChannelTargetId === channel.id) {
            setDragOverChannelTargetId(null);
          }
        }}
        onDrop={(e) => {
          const uid = e.dataTransfer.getData('text/plain') || draggingUserId;
          if (uid) {
            e.preventDefault();
            setDraggingUserId(null);
            setDragOverChannelId(null);
            if (!isTempCreator) {
              moveVoiceUser(uid, channel.id);
            }
            return;
          }
          if (draggingChannelId && draggingChannelId !== channel.id) {
            e.preventDefault();
            handleChannelReorderDrop(channel.id, channel.categoryId ?? null);
          }
        }}
        onDragEnd={() => {
          setDraggingChannelId(null);
          setDragOverChannelTargetId(null);
          setDragOverCategoryId(undefined);
        }}
        className="space-y-1"
      >
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setChannelMenu({
              channel,
              x: Math.max(8, Math.min(e.clientX, window.innerWidth - 220)),
              y: Math.max(8, Math.min(e.clientY, window.innerHeight - 200)),
            });
          }}
          className={`group w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
            isUserDropTarget
              ? 'bg-indigo-500/20 text-white border border-indigo-400/60 ring-2 ring-indigo-400/30 shadow-[0_0_16px_rgba(99,102,241,0.28)]'
              : isChannelDropTarget
              ? 'border-t-2 border-indigo-400 bg-indigo-500/15 text-white'
              : isConnectedHere
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : isViewingHere
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <button
            type="button"
            onClick={() => handleVoiceChannelClick(channel)}
            className="flex-1 flex items-center gap-2 truncate text-left"
          >
            {canManageChannels && !isTempCreator && (
              <GripVertical className="w-3 h-3 text-white/25 opacity-0 group-hover:opacity-100 shrink-0 -ml-1 cursor-grab" />
            )}
            {channel.type === 'stage' ? (
              <StageRadioIcon
                className={`w-4 h-4 shrink-0 ${
                  isConnectedHere ? 'text-purple-300' : 'text-purple-400/80'
                }`}
              />
            ) : (
              <Volume2
                className={`w-4 h-4 shrink-0 ${
                  isConnectedHere ? 'text-emerald-400' : 'opacity-70'
                }`}
              />
            )}
            <span className="truncate">{channel.name}</span>
            {channel.isPrivate && (
              <span title={t(language, 'privateChannel')}>
                <Lock className="w-3 h-3 text-amber-300 shrink-0" />
              </span>
            )}
            {isLocked && (
              <span title="Korumalı Ses Odası">
                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
              </span>
            )}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {canManageChannels && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPermChannel(channel);
              }}
              className="hidden group-hover:flex w-5 h-5 rounded-md hover:bg-indigo-500/20 text-white/45 hover:text-indigo-300 items-center justify-center transition"
              title={t(language, 'channelPermissions')}
            >
              <ChannelShieldIcon className="w-3 h-3" />
            </button>
          )}
          {canManageChannels && siblings.length > 1 && (
              <div className="hidden group-hover:flex items-center gap-0.5">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderChannel(activeServer.id, channel.id, 'up');
                    }}
                    className="p-0.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition"
                    title="Yukarı Taşı"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                )}
                {idx < siblings.length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderChannel(activeServer.id, channel.id, 'down');
                    }}
                    className="p-0.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition"
                    title="Aşağı Taşı"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            {usersInChannel.some((u) => u.isScreenSharing) && (
              <Tv className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            )}
            {(usersInChannel.length > 0 || (channel.userLimit && channel.userLimit > 0)) && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  channel.userLimit && channel.userLimit > 0 && usersInChannel.length >= channel.userLimit
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold'
                    : 'bg-white/10 text-white/80'
                }`}
                title={channel.userLimit && channel.userLimit > 0 ? `Oda Limiti: ${usersInChannel.length}/${channel.userLimit}` : undefined}
              >
                {channel.userLimit && channel.userLimit > 0
                  ? `${usersInChannel.length}/${channel.userLimit}`
                  : usersInChannel.length}
              </span>
            )}
          </div>
        </div>

        {/* Connected Users Tree with Halo Effect */}
        {usersInChannel.length > 0 && (
          <div className="pl-6 pr-1 space-y-1">
            {usersInChannel.map((user) => {
              const isThisMe = user.id === currentUser?.id;
              const speaking = isThisMe ? isSpeaking : user.isSpeaking;
              const canDragUser = isThisMe || canMoveOthers;

              return (
                <div
                  key={user.id}
                  draggable={canDragUser}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    if (!canDragUser) return;
                    e.dataTransfer.setData('text/plain', user.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingUserId(user.id);
                  }}
                  onDragEnd={(e) => {
                    e.stopPropagation();
                    setDraggingUserId(null);
                    setDragOverChannelId(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setVoiceUserMenu({
                      user,
                      x: Math.max(8, Math.min(e.clientX, window.innerWidth - 270)),
                      y: Math.max(8, Math.min(e.clientY, window.innerHeight - 340)),
                    });
                  }}
                  className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-xs transition ${
                    canDragUser ? 'cursor-grab active:cursor-grabbing' : 'cursor-context-menu'
                  } ${
                    draggingUserId === user.id ? 'opacity-45 scale-95' : ''
                  } ${
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
                      <span title={user.isServerMuted ? 'Sunucudan Susturuldu' : 'Mikrofon Kapalı'}>
                        <MicOff className={`w-3 h-3 ${user.isServerMuted ? 'text-rose-500 animate-pulse' : 'text-red-400'}`} />
                      </span>
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
  };

  return (
    <aside className="w-72 ios-glass-sidebar md:rounded-2xl md:border md:border-white/[0.08] md:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] flex flex-col shrink-0 select-none overflow-hidden">
      {/* iOS Server Header Card */}
      <header
        onClick={() => {
          if (activeServer.id !== 'direct-messages') {
            setIsDropdownOpen(!isDropdownOpen);
            setConfirmLeaveServer(false);
          }
        }}
        className={`relative border-b border-white/[0.06] flex items-end justify-between font-semibold text-white/90 shadow-sm hover:brightness-110 cursor-pointer transition select-none overflow-hidden ${
          activeServer.id !== 'direct-messages' && activeServer.bannerImage ? 'h-24 p-3.5' : 'h-14 px-4 items-center'
        }`}
      >
        {activeServer.id !== 'direct-messages' && activeServer.bannerImage && (
          <>
            <img
              src={activeServer.bannerImage}
              alt={activeServer.name}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15" />
          </>
        )}
        <div className="relative z-10 flex items-center gap-2 truncate">
          {activeServer.id === 'direct-messages' ? (
            <MessageCircle className="w-4 h-4 text-blue-400 shrink-0" />
          ) : isImageAvatar(activeServer.icon) ? (
            <img
              src={activeServer.icon}
              alt={activeServer.name}
              className="w-6 h-6 rounded-lg object-cover shrink-0 border border-white/20 shadow"
              draggable={false}
            />
          ) : (
            <span className="text-base shrink-0">{activeServer.icon || '💬'}</span>
          )}
          <span className="truncate tracking-tight font-bold text-sm drop-shadow">{activeServer.name}</span>
        </div>
        {activeServer.id !== 'direct-messages' && (
          <div className="relative z-10 w-6 h-6 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center shrink-0">
            <ChevronDown className={`w-3.5 h-3.5 text-white/80 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
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

          {canManageChannels && (
            <button
              type="button"
              onClick={async () => {
                setIsDropdownOpen(false);
                const catName = await appPrompt({
                  title: t(language, 'createCategory'),
                  message: 'Yeni kategori adını girin:',
                  placeholder: 'Örn: Sohbet & Topluluk',
                  confirmLabel: 'Oluştur',
                });
                if (catName && catName.trim()) {
                  createCategory(activeServer.id, catName.trim());
                }
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <div className="flex items-center gap-2">
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>{t(language, 'createCategory')}</span>
              </div>
            </button>
          )}

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

          {currentUser && activeServer.id !== 'direct-messages' && (
            <button
              type="button"
              onClick={async () => {
                setIsDropdownOpen(false);
                const meMember = activeServer.members?.find(
                  (m) =>
                    m.username.toLowerCase() === currentUser.username.toLowerCase() ||
                    m.userId === currentUser.id
                );
                const next = await appPrompt({
                  title: 'Sunucu Takma Adım',
                  message: `${activeServer.name} sunucusunda görünecek takma adınızı yazın (temizlemek için boş bırakın):`,
                  defaultValue: meMember?.nickname || '',
                  placeholder: currentUser.username,
                  confirmLabel: 'Kaydet',
                });
                if (next !== null) {
                  updateServerNickname(activeServer.id, next.trim());
                }
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <div className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sunucu Takma Adım</span>
              </div>
              <span className="text-[10px] text-cyan-300 truncate max-w-[90px]">
                {activeServer.members?.find(
                  (m) =>
                    m.username.toLowerCase() === currentUser.username.toLowerCase() ||
                    m.userId === currentUser.id
                )?.nickname || currentUser.username}
              </span>
            </button>
          )}

          {currentUser && !isUserServerOwner(currentUser, activeServer) && (
              <div className="pt-1 mt-1 border-t border-white/10">
                {confirmLeaveServer ? (
                  <div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
                    <span className="text-[11px] text-rose-300 font-semibold">Emin misin?</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmLeaveServer(false)}
                        className="px-2 py-1 rounded-lg bg-white/10 text-[10px] text-white/75"
                      >
                        İptal
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsDropdownOpen(false);
                          setConfirmLeaveServer(false);
                          await leaveServer(activeServer.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-[10px] font-bold text-white"
                      >
                        Ayrıl
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmLeaveServer(true)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 transition"
                  >
                    <div className="flex items-center gap-2">
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sunucudan Ayrıl</span>
                    </div>
                  </button>
                )}
              </div>
            )}
        </div>
      )}

      {/* Channels List or DMs List */}
      {activeServer.id === 'direct-messages' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* Friends Dashboard Tab Button */}
          <button
            onClick={() => closeDirectMessage()}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
              !activeDMUser && !activeGroupDm
                ? 'bg-gradient-to-r from-indigo-500/30 via-blue-500/20 to-transparent text-white border border-indigo-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_16px_rgba(59,130,246,0.18)]'
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

          {/* Group DMs Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 pt-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              <span>{t(language, 'groupDms')}</span>
              <button
                type="button"
                onClick={() => setIsCreateGroupDmOpen(true)}
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
                title={t(language, 'newGroupDm')}
                aria-label={t(language, 'newGroupDm')}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {groupDms.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsCreateGroupDmOpen(true)}
                className="w-full px-3 py-2 rounded-xl border border-dashed border-white/10 hover:border-indigo-400/35 text-[11px] text-white/45 hover:text-indigo-200 transition text-left flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t(language, 'newGroupDm')}</span>
              </button>
            ) : (
              groupDms.map((group) => {
                const isSelected = activeGroupDm?.id === group.id;
                const gUnread = !isSelected ? (unreadCounts[group.id] || 0) : 0;
                const voiceRoomId = group.voiceChannelId || `voice-${group.id}`;
                const voiceCount = onlineUsers.filter(
                  (u) => u.currentVoiceChannelId === voiceRoomId
                ).length;
                return (
                  <div
                    key={group.id}
                    onClick={() => openGroupDm(group.id)}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/20 text-white border border-indigo-400/40'
                        : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400/25 flex items-center justify-center text-sm shrink-0">
                        {group.icon || '👥'}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{group.name}</div>
                        <div className="truncate text-[10px] text-white/45">
                          {group.members.length} {t(language, 'membersCount')}
                          {voiceCount > 0 ? ` · 🔊 ${voiceCount}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {gUnread > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                          {gUnread > 9 ? '9+' : gUnread}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          joinGroupDmVoice(group);
                        }}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-white/20 text-emerald-400 flex items-center justify-center transition"
                        title={t(language, 'groupVoiceCall')}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between px-2 pt-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <span>{t(language, 'directMessages')}</span>
          </div>

          <div className="space-y-1">
            {onlineUsers
              .filter((u) => {
                if (u.id === currentUser?.id) return false;
                if (currentUser?.username && u.username.toLowerCase() === currentUser.username.toLowerCase()) return false;
                return true;
              })
              .filter(
                (u, idx, arr) =>
                  arr.findIndex((other) => other.username.toLowerCase() === u.username.toLowerCase()) === idx
              )
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

                    <div className="flex items-center gap-1.5 shrink-0">
                      {Boolean(drafts[`dm:${user.username.toLowerCase()}`]) && (
                        <span title="Kaydedilmiş taslak" className="text-amber-300/85">
                          <Pencil className="w-3 h-3" />
                        </span>
                      )}
                      {(() => {
                        const dmUnread = unreadDMByUser[user.username.toLowerCase()] || 0;
                        return dmUnread > 0 ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {dmUnread > 9 ? '9+' : dmUnread}
                          </span>
                        ) : null;
                      })()}
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
                  </div>
                );
              })}

            {friends
              .filter((f) => {
                const fname = f.username.toLowerCase();
                if (currentUser?.username && fname === currentUser.username.toLowerCase()) return false;
                return !onlineUsers.some((u) => u.username.toLowerCase() === fname);
              })
              .map((friend) => {
                const offlineUser = {
                  id: friend.username,
                  username: friend.username,
                  avatar: friend.avatar || '👤',
                  status: 'offline' as const,
                  isMuted: false,
                  isDeafened: false,
                  isSpeaking: false,
                  role: 'user' as const,
                  e2eePublicKey: friend.e2eePublicKey,
                };
                const isSelected = activeDMUser?.username.toLowerCase() === friend.username.toLowerCase();
                const dmUnread = unreadDMByUser[friend.username.toLowerCase()] || 0;
                return (
                  <div
                    key={`offline-${friend.username}`}
                    onClick={() => openDirectMessage(offlineUser)}
                    className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 text-white border border-blue-500/40'
                        : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm overflow-hidden opacity-75">
                          <AvatarView avatar={friend.avatar} alt={friend.username} fallback="👤" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black bg-white/25" />
                      </div>
                      <div className="truncate">
                        <div className="truncate font-semibold text-white/80">{friend.username}</div>
                        <div className="truncate text-[10px] text-white/35">Çevrimdışı (Arkadaş)</div>
                      </div>
                    </div>
                    {dmUnread > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0">
                        {dmUnread > 9 ? '9+' : dmUnread}
                      </span>
                    )}
                  </div>
                );
              })}

            {onlineUsers.filter((u) => u.id !== currentUser?.id).length === 0 && friends.length === 0 && (
              <div className="text-center py-8 text-white/30 text-xs">
                Şu anda çevrim içi başka kullanıcı yok.
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Server Events Button */}
        {activeServer && (
          <button
            type="button"
            onClick={() => setIsEventsOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.06] text-xs font-semibold text-white/80 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Etkinlikler
            </span>
            {(activeServer.events?.length || 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                {activeServer.events?.length}
              </span>
            )}
          </button>
        )}

        {/* Server Onboarding & Self-Roles Button */}
        {activeServer &&
          (activeServer.onboarding?.enabled ||
            (activeServer.onboarding?.selfAssignableRoleIds?.length || 0) > 0) && (
            <button
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/25 text-xs font-semibold text-indigo-200 hover:text-white transition"
            >
              <span className="flex items-center gap-2">
                <OnboardingSparklesIcon className="w-3.5 h-3.5 text-indigo-300" />
                <span>{t(language, 'serverOnboarding')} &amp; {t(language, 'selfRoles')}</span>
              </span>
            </button>
          )}

        {sortedCategories.length > 0 ? (
          <>
            {/* Uncategorized channels (always shown above categories if any exist) */}
            {(() => {
              const uncatText = textChannels.filter(
                (c) => !c.categoryId || !categoryIdSet.has(c.categoryId)
              );
              const uncatVoice = voiceChannels.filter(
                (c) => !c.categoryId || !categoryIdSet.has(c.categoryId)
              );
              if (uncatText.length === 0 && uncatVoice.length === 0) return null;
              return (
                <div
                  onDragOver={(e) => {
                    if (!draggingChannelId) return;
                    e.preventDefault();
                    setDragOverCategoryId(null);
                  }}
                  onDrop={(e) => {
                    if (!draggingChannelId) return;
                    e.preventDefault();
                    handleChannelReorderDrop(null, null);
                  }}
                  className={`space-y-1.5 rounded-xl transition ${
                    dragOverCategoryId === null ? 'ring-1 ring-indigo-400/50 bg-indigo-500/5 p-1' : ''
                  }`}
                >
                  <div className="flex items-center justify-between px-2 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    <span>{t(language, 'uncategorized')}</span>
                    <button
                      type="button"
                      onClick={() => onOpenCreateChannel('text', null)}
                      className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
                      title="Kanal Ekle"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {uncatText.map((ch, idx) => renderNonVoiceRow(ch, uncatText, idx))}
                    {uncatVoice.map((ch, idx) => renderVoiceRow(ch, uncatVoice, idx))}
                  </div>
                </div>
              );
            })()}

            {/* Custom Channel Categories */}
            {sortedCategories.map((cat) => {
              const catChannels = sortedChannels.filter((c) => c.categoryId === cat.id);
              const isCatCollapsed = Boolean(collapsedCategories[cat.id]);
              return (
                <div key={cat.id} className="space-y-1">
                  <div
                    onDragOver={(e) => {
                      if (!draggingChannelId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverCategoryId !== cat.id) setDragOverCategoryId(cat.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverCategoryId === cat.id) setDragOverCategoryId(undefined);
                    }}
                    onDrop={(e) => {
                      if (!draggingChannelId) return;
                      e.preventDefault();
                      handleChannelReorderDrop(null, cat.id);
                    }}
                    className={`group flex items-center justify-between px-2 py-0.5 rounded-lg text-[11px] font-semibold text-white/45 uppercase tracking-wider transition ${
                      dragOverCategoryId === cat.id ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/50' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapsed(cat.id)}
                      className="flex items-center gap-1 hover:text-white/85 transition min-w-0 flex-1 text-left"
                    >
                      {isCatCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{cat.name}</span>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {canManageChannels && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              const nextName = await appPrompt({
                                title: 'Kategoriyi Yeniden Adlandır',
                                message: 'Yeni kategori adını girin:',
                                defaultValue: cat.name,
                                confirmLabel: 'Kaydet',
                              });
                              if (nextName && nextName.trim() && nextName.trim() !== cat.name) {
                                renameCategory(activeServer.id, cat.id, nextName.trim());
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                            title="Kategoriyi Yeniden Adlandır"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                await appConfirm({
                                  title: 'Kategoriyi Sil',
                                  message: `"${cat.name}" kategorisini silmek istediğinize emin misiniz? Kanallar kategorisiz kalacaktır.`,
                                  danger: true,
                                  confirmLabel: 'Sil',
                                })
                              ) {
                                deleteCategory(activeServer.id, cat.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-500/20 text-white/50 hover:text-rose-300 transition"
                            title="Kategoriyi Sil"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenCreateChannel('text', cat.id)}
                        className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
                        title="Bu Kategoriye Kanal Ekle"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {!isCatCollapsed && (
                    <div className="space-y-0.5">
                      {catChannels.map((channel, idx) =>
                        channel.type === 'voice' || channel.type === 'stage'
                          ? renderVoiceRow(channel, catChannels, idx)
                          : renderNonVoiceRow(channel, catChannels, idx)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {/* Text / Announcement / Forum Channels */}
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
                  <span>{t(language, 'textChannels')}</span>
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
                  {textChannels.map((channel, idx) => renderNonVoiceRow(channel, textChannels, idx))}
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
                  <span>{t(language, 'voiceChannels')}</span>
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
                  {voiceChannels.map((channel, idx) => renderVoiceRow(channel, voiceChannels, idx))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      )}

      {/* Connected Voice Capsule (Compact) */}
      {(connectedVoiceChannel || connectedGroupVoice) && (
        <div
          onClick={openDiagnostics}
          className="mx-3 mb-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-between gap-2 cursor-pointer transition group"
          title="Bağlantı ve Ağ Teşhisi Detaylarını Aç"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-emerald-300 truncate">
              {connectedVoiceChannel?.name || connectedGroupVoice?.name}
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-md font-mono font-bold shrink-0">
              {ping}ms
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              leaveVoiceChannel();
            }}
            className="w-6 h-6 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white flex items-center justify-center transition shrink-0"
            title="Ses Odasından Ayrıl"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LICENSE & DEDICATED SERVER STORE BUTTON (Hidden when store is closed) */}
      {(storeSettings?.isOpen ?? true) && (
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
      )}

      {/* EXCLUSIVE ADMIN CONSOLE BUTTON (Shown only if role is admin) */}
      {currentUser?.role === 'admin' && (
        <button
          onClick={onOpenAdminDashboard}
          className="mx-3 mb-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/30 text-amber-300/90 font-semibold text-xs flex items-center justify-between transition group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition" />
            <span>Sistem Yönetimi</span>
          </div>
          <span className="text-[10px] text-amber-400/70 group-hover:translate-x-0.5 transition">→</span>
        </button>
      )}

      {/* iOS Profile Bar (2-Tier Spacious Glass Panel) */}
      <footer ref={statusMenuRef} className="relative p-2.5 border-t border-white/[0.08] bg-black/40 flex flex-col gap-2 shrink-0">
        {/* Quick Status Popover */}
        {isStatusMenuOpen && isAuthenticated && (
          <div className="absolute bottom-full left-2 right-2 mb-2 z-50 rounded-2xl bg-[#161822]/95 border border-white/15 p-3 shadow-2xl backdrop-blur-2xl space-y-2.5 animate-slide-up">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                Durumunu Değiştir
              </span>
              <span className={`text-[10px] font-semibold ${currentStatusMeta.text}`}>
                {currentStatusMeta.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'online' as const, label: 'Çevrimiçi', dot: 'bg-emerald-400', desc: 'Aktif' },
                { id: 'idle' as const, label: 'Boşta', dot: 'bg-amber-400', desc: 'Uzakta' },
                { id: 'dnd' as const, label: 'Rahatsız Etme', dot: 'bg-red-500', desc: 'Sessiz' },
                { id: 'offline' as const, label: 'Görünmez', dot: 'bg-slate-400', desc: 'Gizli' },
              ].map((opt) => {
                const isSelected = (currentUser?.status || 'online') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      updateProfileDetails({ status: opt.id });
                      setIsStatusMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition border ${
                      isSelected
                        ? 'bg-white/15 border-white/25 text-white'
                        : 'bg-white/[0.04] border-white/[0.06] text-white/75 hover:bg-white/10'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dot}`} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold truncate">{opt.label}</div>
                      <div className="text-[9px] text-white/40 truncate">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_STATUS_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const expiresAt = computeStatusExpiryTimestamp(preset.durationPreset);
                    try {
                      if (expiresAt) localStorage.setItem(STATUS_EXPIRY_KEY, String(expiresAt));
                      else localStorage.removeItem(STATUS_EXPIRY_KEY);
                    } catch {}
                    setCustomStatusInput(preset.statusMessage);
                    updateProfileDetails({
                      status: preset.status,
                      statusMessage: preset.statusMessage,
                    });
                    setIsStatusMenuOpen(false);
                  }}
                  className="px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/[0.06] text-left text-[10px] font-semibold text-white/80 hover:text-white truncate transition"
                  title={preset.label}
                >
                  {preset.statusMessage}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateProfileDetails({ statusMessage: customStatusInput.trim() });
                setIsStatusMenuOpen(false);
              }}
              className="pt-2 border-t border-white/10 space-y-1.5"
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  maxLength={50}
                  value={customStatusInput}
                  onChange={(e) => setCustomStatusInput(e.target.value)}
                  placeholder="Durum mesajı yaz..."
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition shrink-0"
                >
                  Kaydet
                </button>
              </div>
              {currentUser?.statusMessage && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStatusInput('');
                    updateProfileDetails({ statusMessage: '' });
                    setIsStatusMenuOpen(false);
                  }}
                  className="w-full text-[10px] text-white/40 hover:text-white/80 text-right transition"
                >
                  Durum mesajını temizle
                </button>
              )}
            </form>
          </div>
        )}

        {/* Tier 1: User Profile & Quick Status + Logout */}
        <div className="flex items-center justify-between gap-1.5">
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isAuthenticated) setIsStatusMenuOpen((p) => !p);
                }}
                title={`Durum: ${currentStatusMeta.label} (Değiştirmek için tıkla)`}
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${currentStatusMeta.dot} border-2 border-black shadow hover:scale-125 transition-transform`}
              />
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
                {currentUser?.statusMessage || currentStatusMeta.label}
              </div>
            </div>
          </div>

          {/* Quick Logout / Login Button */}
          {isAuthenticated ? (
            <button
              onClick={logout}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.05] hover:bg-rose-500/20 text-white/50 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition shrink-0"
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

        {/* Tier 2: Controls Toolbar (Clean 4-icon dock) */}
        <div className="flex items-center justify-between gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06]">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition ${
              isMuted
                ? 'bg-red-500/25 text-red-400 border border-red-500/30'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
            aria-label={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Sustur'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={toggleDeafen}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition ${
              isDeafened
                ? 'bg-red-500/25 text-red-400 border border-red-500/30'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
            aria-label={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsActivityModalOpen(true)}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center transition ${
              currentUser?.activity
                ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 animate-pulse'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title="Oyun / Aktivite Durumunu Ayarla"
            aria-label="Oyun veya Aktivite Durumunu Ayarla"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex-1 h-7 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition"
            title="Ayarlar"
            aria-label="Ayarlar"
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
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
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

      {isEventsOpen && (
        <Suspense fallback={null}>
          <ServerEventsModal onClose={() => setIsEventsOpen(false)} />
        </Suspense>
      )}

      {isCreateGroupDmOpen && (
        <Suspense fallback={null}>
          <CreateGroupDmModal onClose={() => setIsCreateGroupDmOpen(false)} />
        </Suspense>
      )}

      {permChannel && activeServer && (
        <Suspense fallback={null}>
          <ChannelPermissionsModal
            server={activeServer}
            channel={permChannel}
            onClose={() => setPermChannel(null)}
          />
        </Suspense>
      )}

      {isOnboardingOpen && activeServer && (
        <Suspense fallback={null}>
          <OnboardingModal
            server={activeServer}
            onClose={() => setIsOnboardingOpen(false)}
          />
        </Suspense>
      )}

      <VoiceUserContextMenu
        menu={voiceUserMenu}
        onClose={() => setVoiceUserMenu(null)}
      />

      {channelMenu &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ left: channelMenu.x, top: channelMenu.y }}
            className="fixed z-[9999] w-52 rounded-2xl bg-[#13151d]/95 border border-white/15 shadow-2xl backdrop-blur-2xl p-1.5 text-xs text-white animate-fade-in"
          >
            <div className="px-2.5 py-1.5 border-b border-white/10 mb-1 flex items-center gap-2 text-[11px] font-bold text-white/80 truncate">
              {renderChannelTypeIcon(channelMenu.channel)}
              <span className="truncate">{channelMenu.channel.name}</span>
            </div>

            {channelMenu.channel.type === 'voice' || channelMenu.channel.type === 'stage' ? (
              connectedVoiceChannelId === channelMenu.channel.id ? (
                <button
                  type="button"
                  onClick={() => {
                    leaveVoiceChannel();
                    setChannelMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 transition text-left"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Odadan Ayrıl</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleVoiceChannelClick(channelMenu.channel);
                    setChannelMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-emerald-500/20 text-emerald-300 transition text-left"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Odaya Katıl</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  selectChannel(channelMenu.channel.id);
                  setChannelMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
              >
                <Hash className="w-3.5 h-3.5 text-white/70" />
                <span>Kanalı Aç / Okundu Say</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(channelMenu.channel.name);
                setChannelMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
            >
              <Copy className="w-3.5 h-3.5 text-white/60" />
              <span>Kanal Adını Kopyala</span>
            </button>

            <div className="my-1 border-t border-white/10 pt-1">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Bildirim Tercihi
              </div>
              {(
                [
                  { id: 'all', label: 'Tüm Mesajlar', icon: Bell },
                  { id: 'mentions', label: 'Sadece @Bahsetmeler', icon: Bell },
                  { id: 'muted', label: 'Kanalı Sessize Al', icon: BellOff },
                ] as Array<{ id: NotificationLevel; label: string; icon: any }>
              ).map((opt) => {
                const current = notificationPrefs[channelMenu.channel.id] || 'all';
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTargetNotificationPref(channelMenu.channel.id, opt.id);
                      setChannelMenu(null);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl transition text-left ${
                      current === opt.id ? 'ui-accent-soft border font-semibold' : 'hover:bg-white/10 text-white/75'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-white/60" />
                      <span>{opt.label}</span>
                    </span>
                    {current === opt.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>

            {canManageChannels && activeServer && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPermChannel(channelMenu.channel);
                    setChannelMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-indigo-500/15 text-indigo-300 transition text-left"
                >
                  <ChannelShieldIcon className="w-3.5 h-3.5" />
                  <span>{t(language, 'channelPermissions')}</span>
                </button>
                {(channelMenu.channel.type === 'voice' || channelMenu.channel.type === 'stage') && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingChannel({
                        channel: channelMenu.channel,
                        bitrateKbps: channelMenu.channel.bitrateKbps || activeServer.bitrateKbps || 128,
                        userLimit: channelMenu.channel.userLimit || 0,
                      });
                      setChannelMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-blue-500/15 text-blue-300 transition text-left"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Oda Ayarlarını Düzenle</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    reorderChannel(activeServer.id, channelMenu.channel.id, 'up');
                    setChannelMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                >
                  <ChevronUp className="w-3.5 h-3.5 text-white/60" />
                  <span>Yukarı Taşı</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    reorderChannel(activeServer.id, channelMenu.channel.id, 'down');
                    setChannelMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-white/60" />
                  <span>Aşağı Taşı</span>
                </button>

                {currentUser?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const target = channelMenu.channel;
                      setChannelMenu(null);
                      if (await appConfirm({ title: 'Kanalı Sil', message: `"${target.name}" kanalını silmek istediğinize emin misiniz?`, danger: true, confirmLabel: 'Sil' })) {
                        adminDeleteChannel(activeServer.id, target.id);
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-rose-500/20 text-rose-400 transition text-left mt-0.5 border-t border-white/10 pt-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kanalı Sil</span>
                  </button>
                )}
              </>
            )}
          </div>,
          document.body
        )}

      {editingChannel && activeServer &&
        createPortal(
          <div
            onClick={() => setEditingChannel(null)}
            className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm ios-glass rounded-2xl border border-white/15 p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white truncate">#{editingChannel.channel.name} — Oda Ayarları</h4>
                <button
                  type="button"
                  onClick={() => setEditingChannel(null)}
                  className="text-white/50 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                    Ses Kalitesi (Bitrate)
                  </label>
                  <select
                    value={editingChannel.bitrateKbps}
                    onChange={(e) => setEditingChannel((prev) => prev ? { ...prev, bitrateKbps: Number(e.target.value) } : null)}
                    className="w-full bg-black/40 border border-white/15 text-white text-xs rounded-xl px-3 py-2 outline-none"
                  >
                    <option value={64}>64 kbps (Ekonomi)</option>
                    <option value={96}>96 kbps (Konuşma)</option>
                    <option value={128}>128 kbps (Standart HD)</option>
                    <option value={192}>192 kbps (Yüksek)</option>
                    <option value={256}>256 kbps (Stüdyo)</option>
                    <option value={320}>320 kbps (Ultra HD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                    Kişi Limiti (0 = Sınırsız)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={editingChannel.userLimit}
                    onChange={(e) =>
                      setEditingChannel((prev) =>
                        prev ? { ...prev, userLimit: Math.min(99, Math.max(0, Number(e.target.value) || 0)) } : null
                      )
                    }
                    className="w-full bg-black/40 border border-white/15 text-white text-xs rounded-xl px-3 py-2 outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingChannel(null)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/80"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateChannelSettings(activeServer.id, editingChannel.channel.id, {
                      bitrateKbps: editingChannel.bitrateKbps,
                      userLimit: editingChannel.userLimit,
                    });
                    setEditingChannel(null);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-xs font-semibold text-white"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};
