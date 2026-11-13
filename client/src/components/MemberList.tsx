import React from 'react';
import { useSocket } from '../context/SocketContext';
import { User, ServerRole } from '../types';
import { Volume2, Crown, Tv, Shield, Radio, Gamepad2 } from 'lucide-react';
import { AvatarView } from './AvatarView';

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

  // Helper to find member's highest role
  const getUserRoleInfo = (user: User): { role: ServerRole | null; isOwner: boolean } => {
    if (!activeServer) return { role: null, isOwner: false };
    const isOwner = activeServer.ownerId === user.id;

    const member = activeServer.members?.find(
      (m) => m.userId === user.id || m.username.toLowerCase() === user.username.toLowerCase()
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

  // Deduplicate online users across multiple devices/sessions (by lowercase username)
  const uniqueOnlineMap = new Map<string, User>();
  onlineUsers.forEach((u) => {
    if (u.status === 'offline') return;
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
      roleName: 'Çevrimiçi',
      roleColor: '#94a3b8',
      users: standardUsers
    });
  }

  // Offline server members
  if (offlineMembers.length > 0) {
    roleGroups.push({
      roleName: 'Çevrimdışı',
      roleColor: '#64748b',
      users: offlineMembers
    });
  }

  return (
    <aside className="w-60 ios-glass-sidebar flex flex-col shrink-0 select-none overflow-y-auto p-4 border-l border-white/[0.06]">
      {roleGroups.map((group) => (
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
              const isMe = user.id === currentUser?.id;
              const { role: userRole, isOwner } = getUserRoleInfo(user);
              const currentVoice = activeServer?.channels.find(
                (c) => c.id === user.currentVoiceChannelId
              );

              const isOffline = user.status === 'offline';

              return (
                <div
                  key={user.id}
                  onClick={() => onOpenProfile(user)}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.06] cursor-pointer transition group ${
                    isOffline ? 'opacity-55 hover:opacity-100' : ''
                  }`}
                  title={`${user.username} profilini görüntüle`}
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
                        style={{ color: userRole?.color || (isMe ? '#60a5fa' : '#f5f5f7') }}
                        className="text-xs font-bold truncate"
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
                      <div className="text-[10px] text-purple-300 flex items-center gap-1 truncate font-medium">
                        <Gamepad2 className="w-3 h-3 shrink-0 text-purple-400" />
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
    </aside>
  );
};
