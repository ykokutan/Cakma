import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { t } from '../utils/i18n';
import { isSameUser, isUserServerOwner } from '../utils/serverIdentity';
import { User, ServerRole } from '../types';
import { Volume2, Crown, Tv, Shield, Radio, Gamepad2, Headphones, Sparkles, MessageSquare, Phone, User as UserIcon, ArrowRightLeft, UserX, Search, X } from 'lucide-react';
import { AvatarView } from './AvatarView';

interface MemberListProps {
  onOpenProfile: (user: User) => void;
}

export const MemberList: React.FC<MemberListProps> = ({ onOpenProfile }) => {
  const {
    onlineUsers,
    currentUser,
    activeServer,
    connectedVoiceChannelId,
    openDirectMessage,
    startDirectCall,
    moveVoiceUser,
    adminKickUser,
    language,
  } = useSocket();
  const [contextMenu, setContextMenu] = useState<{ user: User; x: number; y: number } | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [contextMenu]);

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

  // Helper to find member's highest role
  const getUserRoleInfo = (user: User): { role: ServerRole | null; isOwner: boolean } => {
    if (!activeServer) return { role: null, isOwner: false };
    const isOwner = isUserServerOwner(user, activeServer);

    const member = activeServer.members?.find(
      (m) =>
        (user.accountId && m.userId === user.accountId) ||
        m.userId === user.id ||
        m.username.toLowerCase() === user.username.toLowerCase()
    );

    if (isOwner) {
      const ownerRole = activeServer.roles?.find((r) => r.id === 'role-owner');
      return {
        role: ownerRole || { id: 'role-owner', name: 'Sunucu Sahibi', color: '#f59e0b', position: 0, permissions: [] },
        isOwner: true
      };
    }

    if (!member || !member.roleIds || member.roleIds.length === 0 || !activeServer.roles) {
      return { role: null, isOwner: false };
    }

    const assignedRoles = activeServer.roles
      .filter((r) => member.roleIds.includes(r.id) && !r.isDefault)
      .sort((a, b) => a.position - b.position);

    return {
      role: assignedRoles.length > 0 ? assignedRoles[0] : null,
      isOwner: false
    };
  };

  // Group online users by highest role
  const roles = (activeServer?.roles || []).filter((r) => !r.isDefault).sort((a, b) => a.position - b.position);

  // Deduplicate online users across multiple devices/sessions (by lowercase username),
  // and filter to members of the active server when inside a real server
  const isRealServer = Boolean(activeServer && activeServer.id !== 'direct-messages');
  const uniqueOnlineMap = new Map<string, User>();
  onlineUsers.forEach((u) => {
    if (u.status === 'offline') return;
    if (isRealServer && activeServer) {
      const uLower = u.username.toLowerCase();
      const isMember =
        activeServer.ownerId === u.id ||
        activeServer.ownerId?.toLowerCase() === uLower ||
        (activeServer.members || []).some((m) => m.userId === u.id || m.username.toLowerCase() === uLower);
      if (!isMember) return;
    }
    const key = u.username.toLowerCase();
    const existing = uniqueOnlineMap.get(key);
    if (!existing) {
      uniqueOnlineMap.set(key, u);
      return;
    }
    const uScore =
      (u.isScreenSharing ? 8 : 0) +
      (u.currentVoiceChannelId ? 4 : 0) +
      (u.isSpeaking ? 2 : 0) +
      (u.id === currentUser?.id ? 1 : 0);
    const existingScore =
      (existing.isScreenSharing ? 8 : 0) +
      (existing.currentVoiceChannelId ? 4 : 0) +
      (existing.isSpeaking ? 2 : 0) +
      (existing.id === currentUser?.id ? 1 : 0);
    if (uScore > existingScore) {
      uniqueOnlineMap.set(key, {
        ...u,
        activity: u.activity || existing.activity,
        statusMessage: u.statusMessage || existing.statusMessage,
      });
    } else {
      uniqueOnlineMap.set(key, {
        ...existing,
        activity: existing.activity || u.activity,
        statusMessage: existing.statusMessage || u.statusMessage,
      });
    }
  });
  const activeOnlineUsers = Array.from(uniqueOnlineMap.values());
  const onlineIdSet = new Set(activeOnlineUsers.map((u) => u.id));
  const onlineNameSet = new Set(activeOnlineUsers.map((u) => u.username.toLowerCase()));

  const seenOfflineNames = new Set<string>();
  const offlineMembers: User[] = (activeServer?.members || [])
    .filter((m) => {
      const nameKey = m.username.toLowerCase();
      if (onlineIdSet.has(m.userId) || onlineNameSet.has(nameKey) || seenOfflineNames.has(nameKey)) {
        return false;
      }
      seenOfflineNames.add(nameKey);
      return true;
    })
    .map((m) => ({
      id: m.userId,
      username: m.username,
      avatar: m.avatar || '🎮',
      status: 'offline' as const,
      role: 'user' as const,
      joinedAt: m.joinedAt,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      isSpeaking: false,
      currentVoiceChannelId: undefined,
    }));

  // Group mapping
  const roleGroups: { roleName: string; roleColor: string; users: User[] }[] = [];
  const processedUserIds = new Set<string>();

  roles.forEach((role) => {
    const usersInRole: User[] = [];
    activeOnlineUsers.forEach((user) => {
      if (processedUserIds.has(user.id)) return;
      const { role: userRole } = getUserRoleInfo(user);
      if (userRole?.id === role.id) {
        usersInRole.push(user);
        processedUserIds.add(user.id);
      }
    });
    if (usersInRole.length > 0) {
      roleGroups.push({
        roleName: role.name,
        roleColor: role.color,
        users: usersInRole
      });
    }
  });

  // Remaining online users go to "Çevrimiçi"
  const standardUsers = activeOnlineUsers.filter((u) => !processedUserIds.has(u.id));
  if (standardUsers.length > 0) {
    roleGroups.push({
      roleName: t(language, 'onlineMembers'),
      roleColor: '#94a3b8',
      users: standardUsers
    });
  }

  // Offline server members
  if (offlineMembers.length > 0) {
    roleGroups.push({
      roleName: t(language, 'offlineMembers'),
      roleColor: '#64748b',
      users: offlineMembers
    });
  }

  const trimmedSearch = memberSearch.trim().toLowerCase();
  const filteredRoleGroups = trimmedSearch
    ? roleGroups
        .map((group) => ({
          ...group,
          users: group.users.filter(
            (u) =>
              u.username.toLowerCase().includes(trimmedSearch) ||
              (u.statusMessage && u.statusMessage.toLowerCase().includes(trimmedSearch)) ||
              (u.activity?.name && u.activity.name.toLowerCase().includes(trimmedSearch))
          ),
        }))
        .filter((group) => group.users.length > 0)
    : roleGroups;
  const totalMemberCount = activeOnlineUsers.length + offlineMembers.length;

  return (
    <aside className="w-60 ios-glass-sidebar xl:rounded-2xl xl:border xl:border-white/[0.08] xl:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] flex flex-col shrink-0 select-none overflow-y-auto p-4 border-l border-white/[0.06]">
      <div className="mb-3 pb-2.5 border-b border-white/[0.06] space-y-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/75">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{activeOnlineUsers.length} {t(language, 'onlineMembers')}</span>
          </div>
          <span className="text-[10px] font-mono text-white/45 bg-white/[0.05] border border-white/[0.07] px-1.5 py-0.5 rounded-md">
            / {totalMemberCount}
          </span>
        </div>
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Üye ara..."
            aria-label="Üye ara"
            className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.08] focus:border-white/20 text-xs text-white placeholder-white/40 outline-none transition"
          />
          {memberSearch && (
            <button
              type="button"
              onClick={() => setMemberSearch('')}
              aria-label="Aramayı temizle"
              className="absolute right-2 p-0.5 rounded-md text-white/45 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {filteredRoleGroups.length === 0 && (
        <div className="py-8 px-2 text-center text-xs text-white/45">
          &ldquo;{memberSearch.trim()}&rdquo; ile eşleşen üye yok.
        </div>
      )}

      {filteredRoleGroups.map((group) => (
        <div key={group.roleName} className="mb-4">
          <div
            style={{ color: group.roleColor }}
            className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1 flex items-center justify-between"
          >
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.roleColor }} />
              <span className="truncate">{group.roleName}</span>
            </div>
            <span className="text-white/40 text-[10px] font-normal">{group.users.length}</span>
          </div>

          <div className="space-y-1">
            {group.users.map((user) => {
              const isMe = isSameUser(user, currentUser);
              const { role: userRole, isOwner } = getUserRoleInfo(user);
              const currentVoice = activeServer?.channels.find(
                (c) => c.id === user.currentVoiceChannelId
              );

              const isOffline = user.status === 'offline';

              return (
                <div
                  key={user.id}
                  onClick={() => onOpenProfile(user)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      user,
                      x: Math.max(8, Math.min(e.clientX, window.innerWidth - 230)),
                      y: Math.max(8, Math.min(e.clientY, window.innerHeight - 240)),
                    });
                  }}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.06] cursor-pointer transition group ${
                    isOffline ? 'opacity-55 hover:opacity-100' : ''
                  }`}
                  title={`${user.username} profilini görüntüle (Sağ tık: işlemler)`}
                >
                  <div className="relative shrink-0">
                    <div
                      className={`w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm transition-all overflow-hidden ${
                        user.isSpeaking ? 'ios-halo-subtle' : ''
                      }`}
                    >
                      <AvatarView avatar={user.avatar} alt={user.username} fallback="🎮" />
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
                        style={userRole?.color ? { color: userRole.color } : undefined}
                        className={`text-xs font-bold truncate ${
                          !userRole?.color ? (isMe ? 'text-blue-400' : 'text-white') : ''
                        }`}
                      >
                        {user.username}
                      </span>
                      {isOwner && (
                        <span title="Sunucu Sahibi">
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </span>
                      )}
                      {!isOwner && user.role === 'admin' && (
                        <span title="Sistem Admini">
                          <Shield className="w-3 h-3 text-red-400 shrink-0" />
                        </span>
                      )}
                      {userRole?.permissions?.includes('priority_speaker') && (
                        <span title="Öncelikli Konuşmacı (TeamSpeak)">
                          <Radio className="w-3 h-3 text-amber-300 shrink-0" />
                        </span>
                      )}
                    </div>

                    {user.isScreenSharing ? (
                      <div className="text-[10px] text-blue-400 flex items-center gap-1 truncate font-medium">
                        <Tv className="w-3 h-3 shrink-0 animate-pulse" />
                        <span>Ekran Paylaşıyor</span>
                      </div>
                    ) : user.activity ? (
                      <div
                        className={`text-[10px] flex items-center gap-1 truncate font-medium ${
                          user.activity.type === 'listening'
                            ? 'text-emerald-300'
                            : user.activity.type === 'streaming'
                            ? 'text-rose-300'
                            : user.activity.type === 'custom'
                            ? 'text-sky-300'
                            : 'text-purple-300'
                        }`}
                      >
                        {user.activity.emoji ? (
                          <span className="shrink-0 text-[11px] leading-none">{user.activity.emoji}</span>
                        ) : user.activity.type === 'listening' ? (
                          <Headphones className="w-3 h-3 shrink-0 text-emerald-400" />
                        ) : user.activity.type === 'streaming' ? (
                          <Radio className="w-3 h-3 shrink-0 text-rose-400" />
                        ) : user.activity.type === 'custom' ? (
                          <Sparkles className="w-3 h-3 shrink-0 text-sky-400" />
                        ) : (
                          <Gamepad2 className="w-3 h-3 shrink-0 text-purple-400" />
                        )}
                        <span className="truncate">{user.activity.name}</span>
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
                        {isOffline ? 'Çevrimdışı' : 'Çevrimiçi'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {contextMenu &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-[9999] w-56 rounded-2xl bg-[#13151d]/95 border border-white/15 shadow-2xl backdrop-blur-2xl p-1.5 text-xs text-white animate-fade-in"
          >
            <div className="px-2.5 py-2 border-b border-white/10 mb-1 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 shrink-0">
                <AvatarView avatar={contextMenu.user.avatar} alt={contextMenu.user.username} fallback="👤" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="font-bold truncate">{contextMenu.user.username}</div>
                <div className="text-[10px] text-white/45 truncate">
                  {contextMenu.user.status === 'offline' ? 'Çevrimdışı' : 'Çevrimiçi'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onOpenProfile(contextMenu.user);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
            >
              <UserIcon className="w-3.5 h-3.5 text-white/70" />
              <span>Profili Görüntüle</span>
            </button>

            {!isSameUser(contextMenu.user, currentUser) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    openDirectMessage(contextMenu.user);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                  <span>Özel Mesaj Gönder</span>
                </button>

                {contextMenu.user.status !== 'offline' && (
                  <button
                    type="button"
                    onClick={() => {
                      startDirectCall(contextMenu.user);
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sesli Ara</span>
                  </button>
                )}

                {(currentUser?.role === 'admin' || isUserServerOwner(currentUser, activeServer)) &&
                  contextMenu.user.status !== 'offline' &&
                  connectedVoiceChannelId &&
                  contextMenu.user.currentVoiceChannelId !== connectedVoiceChannelId && (
                    <button
                      type="button"
                      onClick={() => {
                        moveVoiceUser(contextMenu.user.id, connectedVoiceChannelId);
                        setContextMenu(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-indigo-500/20 text-indigo-300 transition text-left"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Bulunduğum Odaya Çek</span>
                    </button>
                  )}

                {currentUser?.role === 'admin' && contextMenu.user.status !== 'offline' && (
                  <button
                    type="button"
                    onClick={() => {
                      adminKickUser(contextMenu.user.id, 'Üye listesinden yönetici tarafından atıldı.');
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-rose-500/20 text-rose-400 transition text-left mt-0.5 border-t border-white/10 pt-2"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Sunucudan At</span>
                  </button>
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </aside>
  );
};
