import type { Socket } from 'socket.io';
import crypto from 'crypto';
import type { GroupDmRoom, RegisteredAccount, User } from '../types.js';
import type { SocketEventRateLimiter } from '../utils/socketGuard.js';

export interface GroupDmHandlerDeps {
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  groupDms: GroupDmRoom[];
  socketEventLimiter: SocketEventRateLimiter;
  sanitizeText: (input: string) => string;
  isSafeEmojiOrShortIcon?: (val: string) => boolean;
  saveGroupDms: (rooms: GroupDmRoom[]) => void;
  emitToUserSockets: (username: string, event: string, payload: unknown) => void;
  addAuditLog?: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
}

export function getGroupDmsForUser(groupDms: GroupDmRoom[], username: string): GroupDmRoom[] {
  const unameLower = String(username || '').trim().toLowerCase();
  if (!unameLower) return [];
  return groupDms.filter(
    (room) => Array.isArray(room.members) && room.members.some((m) => m.toLowerCase() === unameLower)
  );
}

function resolveKnownUsername(
  candidate: string,
  registeredAccounts: Map<string, RegisteredAccount>,
  activeUsers: Map<string, User>
): string | null {
  const clean = candidate.trim().toLowerCase();
  if (!clean) return null;
  const reg = registeredAccounts.get(clean);
  if (reg) return reg.username;
  for (const u of activeUsers.values()) {
    if (u.username.toLowerCase() === clean) return u.username;
  }
  return null;
}

export function registerGroupDmSocketHandlers(socket: Socket, deps: GroupDmHandlerDeps): void {
  const {
    activeUsers,
    registeredAccounts,
    groupDms,
    socketEventLimiter,
    sanitizeText,
    isSafeEmojiOrShortIcon,
    saveGroupDms,
    emitToUserSockets,
    addAuditLog,
  } = deps;

  const notifyMembers = (usernames: Iterable<string>) => {
    const seen = new Set<string>();
    for (const rawName of usernames) {
      const lower = String(rawName || '').trim().toLowerCase();
      if (!lower || seen.has(lower)) continue;
      seen.add(lower);
      emitToUserSockets(rawName, 'group_dms_updated', getGroupDmsForUser(groupDms, rawName));
    }
  };

  socket.on('group_dm_create', (rawPayload: unknown) => {
    const creator = activeUsers.get(socket.id);
    if (!creator || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'group_dm_create', 6, 60_000)) {
      return socket.emit('server_action_error', { message: 'Çok sık grup sohbeti oluşturuyorsunuz. Lütfen bekleyin.' });
    }

    const body = rawPayload as { name?: unknown; memberUsernames?: unknown; icon?: unknown };
    const rawMembers = Array.isArray(body.memberUsernames) ? body.memberUsernames : [];

    const members: string[] = [creator.username];
    const seen = new Set<string>([creator.username.toLowerCase()]);

    for (const item of rawMembers) {
      if (typeof item !== 'string') continue;
      const canonical = resolveKnownUsername(item, registeredAccounts, activeUsers);
      if (!canonical) continue;
      const lower = canonical.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      members.push(canonical);
      if (members.length >= 12) break;
    }

    if (members.length < 2) {
      return socket.emit('server_action_error', {
        message: 'Grup DM oluşturmak için en az 1 geçerli kullanıcı eklemelisiniz.',
      });
    }

    const rawName = typeof body.name === 'string' ? sanitizeText(body.name).trim().slice(0, 48) : '';
    const defaultName = members.slice(0, 3).join(', ') + (members.length > 3 ? ` +${members.length - 3}` : '');
    const roomName = rawName || defaultName;

    const rawIcon = typeof body.icon === 'string' ? body.icon.trim() : '';
    const safeIcon =
      rawIcon && (!isSafeEmojiOrShortIcon || isSafeEmojiOrShortIcon(rawIcon)) ? rawIcon : '👥';

    const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const room: GroupDmRoom = {
      id: `gdm-${suffix}`,
      name: roomName,
      icon: safeIcon,
      ownerUsername: creator.username,
      members,
      createdAt: new Date().toISOString(),
      voiceChannelId: `voice-gdm-${suffix}`,
    };

    groupDms.push(room);
    saveGroupDms(groupDms);
    addAuditLog?.('GRUP_DM_OLUSTURULDU', `${creator.username} grup sohbeti oluşturdu: ${room.name} (${members.length} üye)`);
    notifyMembers(room.members);
    socket.emit('group_dm_created', { room });
  });

  socket.on('group_dm_add_member', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'group_dm_mutate', 15, 30_000)) return;

    const { groupId, username } = rawPayload as { groupId?: unknown; username?: unknown };
    if (typeof groupId !== 'string' || typeof username !== 'string') return;
    const room = groupDms.find((g) => g.id === groupId);
    if (!room) return;

    const isMember = room.members.some((m) => m.toLowerCase() === actor.username.toLowerCase());
    if (!isMember) return;

    if (room.members.length >= 12) {
      return socket.emit('server_action_error', { message: 'Grup DM en fazla 12 üye alabilir.' });
    }

    const canonical = resolveKnownUsername(username, registeredAccounts, activeUsers);
    if (!canonical) {
      return socket.emit('server_action_error', { message: 'Eklenmek istenen kullanıcı bulunamadı.' });
    }
    if (room.members.some((m) => m.toLowerCase() === canonical.toLowerCase())) {
      return;
    }

    room.members.push(canonical);
    if (room.e2eeEnabled) {
      room.e2eeEpoch = (room.e2eeEpoch || 1) + 1;
      for (const m of room.members) {
        emitToUserSockets(m, 'group_e2ee_rotation_required', {
          groupId: room.id,
          epoch: room.e2eeEpoch,
          reason: 'member_added',
        });
      }
    }
    saveGroupDms(groupDms);
    notifyMembers(room.members);
  });

  socket.on('group_dm_remove_member', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'group_dm_mutate', 15, 30_000)) return;

    const { groupId, username } = rawPayload as { groupId?: unknown; username?: unknown };
    if (typeof groupId !== 'string' || typeof username !== 'string') return;
    const room = groupDms.find((g) => g.id === groupId);
    if (!room) return;

    const isOwner = room.ownerUsername.toLowerCase() === actor.username.toLowerCase();
    if (!isOwner && actor.role !== 'admin') {
      return socket.emit('server_action_error', { message: 'Üye çıkarmak için grup sahibi olmalısınız.' });
    }

    const targetLower = username.trim().toLowerCase();
    if (targetLower === room.ownerUsername.toLowerCase()) {
      return socket.emit('server_action_error', { message: 'Grup sahibi doğrudan çıkarılamaz; gruptan ayrılabilir.' });
    }
    if (!room.members.some((m) => m.toLowerCase() === targetLower)) return;

    const removedTarget = room.members.find((m) => m.toLowerCase() === targetLower) || username;
    room.members = room.members.filter((m) => m.toLowerCase() !== targetLower);
    if (room.e2eeEnabled) {
      room.e2eeEpoch = (room.e2eeEpoch || 1) + 1;
      room.e2eeKeyEnvelopes = (room.e2eeKeyEnvelopes || []).filter(
        (e) => e.targetUsername.toLowerCase() !== targetLower
      );
      for (const m of room.members) {
        emitToUserSockets(m, 'group_e2ee_rotation_required', {
          groupId: room.id,
          epoch: room.e2eeEpoch,
          reason: 'member_removed',
        });
      }
    }
    saveGroupDms(groupDms);
    notifyMembers([...room.members, removedTarget]);
  });

  socket.on('group_dm_leave', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    const { groupId } = rawPayload as { groupId?: unknown };
    if (typeof groupId !== 'string') return;
    const roomIdx = groupDms.findIndex((g) => g.id === groupId);
    if (roomIdx === -1) return;
    const room = groupDms[roomIdx];
    const actorLower = actor.username.toLowerCase();
    if (!room.members.some((m) => m.toLowerCase() === actorLower)) return;

    room.members = room.members.filter((m) => m.toLowerCase() !== actorLower);
    if (room.members.length === 0) {
      groupDms.splice(roomIdx, 1);
    } else {
      if (room.ownerUsername.toLowerCase() === actorLower) {
        room.ownerUsername = room.members[0];
      }
      if (room.e2eeEnabled) {
        room.e2eeEpoch = (room.e2eeEpoch || 1) + 1;
        room.e2eeKeyEnvelopes = (room.e2eeKeyEnvelopes || []).filter(
          (e) => e.targetUsername.toLowerCase() !== actorLower
        );
        for (const m of room.members) {
          emitToUserSockets(m, 'group_e2ee_rotation_required', {
            groupId: room.id,
            epoch: room.e2eeEpoch,
            reason: 'member_left',
          });
        }
      }
    }
    saveGroupDms(groupDms);
    notifyMembers([...room.members, actor.username]);
  });

  socket.on('group_dm_rename', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'group_dm_mutate', 15, 30_000)) return;

    const { groupId, name, icon } = rawPayload as { groupId?: unknown; name?: unknown; icon?: unknown };
    if (typeof groupId !== 'string') return;
    const room = groupDms.find((g) => g.id === groupId);
    if (!room) return;
    if (!room.members.some((m) => m.toLowerCase() === actor.username.toLowerCase())) return;

    if (typeof name === 'string') {
      const cleanName = sanitizeText(name).trim().slice(0, 48);
      if (cleanName) room.name = cleanName;
    }
    if (typeof icon === 'string' && icon.trim() && (!isSafeEmojiOrShortIcon || isSafeEmojiOrShortIcon(icon.trim()))) {
      room.icon = icon.trim();
    }
    saveGroupDms(groupDms);
    notifyMembers(room.members);
  });
}
