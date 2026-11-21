import type { Socket } from 'socket.io';
import type {
  Channel,
  GroupDmRoom,
  GroupE2eeKeyEnvelope,
  Server,
  ServerPermission,
  StageChannelState,
  User,
} from '../types.js';
import { isUserMemberOfServer } from '../utils/serverDiscovery.js';
import type { SocketEventRateLimiter } from '../utils/socketGuard.js';

export interface StageAndMediaHandlerDeps {
  activeUsers: Map<string, User>;
  servers: Server[];
  groupDms: GroupDmRoom[];
  socketEventLimiter: SocketEventRateLimiter;
  sanitizeText: (input: string) => string;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  saveServers: (servers: Server[]) => void;
  saveGroupDms: (rooms: GroupDmRoom[]) => void;
  emitToServerMembers: (srv: Server, event: string, payload: unknown) => void;
  emitToUserSockets: (username: string, event: string, payload: unknown) => void;
}

export function ensureStageState(channel: Channel): StageChannelState {
  if (!channel.stageState) {
    channel.stageState = {
      topic: channel.topic || '',
      speakerUsernames: [],
      raisedHands: [],
    };
  }
  if (!Array.isArray(channel.stageState.speakerUsernames)) {
    channel.stageState.speakerUsernames = [];
  }
  if (!Array.isArray(channel.stageState.raisedHands)) {
    channel.stageState.raisedHands = [];
  }
  return channel.stageState;
}

export function handleUserLeaveStage(
  servers: Server[],
  username: string,
  channelId: string,
  emitToServerMembers: (srv: Server, event: string, payload: unknown) => void,
  saveServers: (servers: Server[]) => void
): boolean {
  const unameLower = String(username || '').trim().toLowerCase();
  if (!unameLower || !channelId) return false;
  for (const srv of servers) {
    const ch = srv.channels.find((c) => c.id === channelId && c.type === 'stage');
    if (!ch || !ch.stageState) continue;
    const prevSpeakers = ch.stageState.speakerUsernames.length;
    const prevHands = ch.stageState.raisedHands.length;
    ch.stageState.speakerUsernames = ch.stageState.speakerUsernames.filter((u) => u.toLowerCase() !== unameLower);
    ch.stageState.raisedHands = ch.stageState.raisedHands.filter((u) => u.toLowerCase() !== unameLower);
    if (ch.stageState.speakerUsernames.length !== prevSpeakers || ch.stageState.raisedHands.length !== prevHands) {
      saveServers(servers);
      emitToServerMembers(srv, 'stage_state_updated', {
        serverId: srv.id,
        channelId: ch.id,
        stageState: ch.stageState,
      });
      return true;
    }
  }
  return false;
}

function isStageModerator(user: User, srv: Server, checkServerPermission: StageAndMediaHandlerDeps['checkServerPermission']): boolean {
  return checkServerPermission(user, srv, 'mute_members') || checkServerPermission(user, srv, 'manage_channels');
}

export function registerStageAndMediaSocketHandlers(socket: Socket, deps: StageAndMediaHandlerDeps): void {
  const {
    activeUsers,
    servers,
    groupDms,
    socketEventLimiter,
    sanitizeText,
    checkServerPermission,
    saveServers,
    saveGroupDms,
    emitToServerMembers,
    emitToUserSockets,
  } = deps;

  const findStageChannel = (serverId: unknown, channelId: unknown): { srv: Server; ch: Channel } | null => {
    if (typeof serverId !== 'string' || typeof channelId !== 'string') return null;
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) return null;
    const ch = srv.channels.find((c) => c.id === channelId && c.type === 'stage');
    if (!ch) return null;
    return { srv, ch };
  };

  socket.on('stage_request_speak', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object') return;
    if (!socketEventLimiter.allow(socket.id, 'stage_hand', 15, 20_000)) return;
    const { serverId, channelId } = rawPayload as { serverId?: unknown; channelId?: unknown };
    const found = findStageChannel(serverId, channelId);
    if (!found) return;
    if (!isUserMemberOfServer(actor, found.srv) && actor.role !== 'admin') return;

    const state = ensureStageState(found.ch);
    const actorLower = actor.username.toLowerCase();
    const alreadySpeaker = state.speakerUsernames.some((u) => u.toLowerCase() === actorLower);
    const alreadyRaised = state.raisedHands.some((u) => u.toLowerCase() === actorLower);
    if (!alreadySpeaker && !alreadyRaised) {
      state.raisedHands.push(actor.username);
      saveServers(servers);
      emitToServerMembers(found.srv, 'stage_state_updated', {
        serverId: found.srv.id,
        channelId: found.ch.id,
        stageState: state,
      });
    }
  });

  socket.on('stage_cancel_speak', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object') return;
    const { serverId, channelId } = rawPayload as { serverId?: unknown; channelId?: unknown };
    const found = findStageChannel(serverId, channelId);
    if (!found) return;
    const state = ensureStageState(found.ch);
    const actorLower = actor.username.toLowerCase();
    const next = state.raisedHands.filter((u) => u.toLowerCase() !== actorLower);
    if (next.length !== state.raisedHands.length) {
      state.raisedHands = next;
      saveServers(servers);
      emitToServerMembers(found.srv, 'stage_state_updated', {
        serverId: found.srv.id,
        channelId: found.ch.id,
        stageState: state,
      });
    }
  });

  socket.on('stage_promote_speaker', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object') return;
    const { serverId, channelId, targetUsername } = rawPayload as {
      serverId?: unknown;
      channelId?: unknown;
      targetUsername?: unknown;
    };
    const found = findStageChannel(serverId, channelId);
    if (!found || typeof targetUsername !== 'string') return;
    if (!isStageModerator(actor, found.srv, checkServerPermission)) {
      return socket.emit('server_action_error', { message: 'Sahneye konuşmacı davet etmek için yetkiniz yok.' });
    }
    const cleanTarget = targetUsername.trim();
    if (!cleanTarget) return;
    const state = ensureStageState(found.ch);
    const lower = cleanTarget.toLowerCase();
    state.raisedHands = state.raisedHands.filter((u) => u.toLowerCase() !== lower);
    if (!state.speakerUsernames.some((u) => u.toLowerCase() === lower)) {
      state.speakerUsernames.push(cleanTarget);
    }
    saveServers(servers);
    emitToServerMembers(found.srv, 'stage_state_updated', {
      serverId: found.srv.id,
      channelId: found.ch.id,
      stageState: state,
    });
  });

  socket.on('stage_demote_speaker', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object') return;
    const { serverId, channelId, targetUsername } = rawPayload as {
      serverId?: unknown;
      channelId?: unknown;
      targetUsername?: unknown;
    };
    const found = findStageChannel(serverId, channelId);
    if (!found || typeof targetUsername !== 'string') return;
    const targetLower = targetUsername.trim().toLowerCase();
    const isSelf = targetLower === actor.username.toLowerCase();
    if (!isSelf && !isStageModerator(actor, found.srv, checkServerPermission)) {
      return socket.emit('server_action_error', { message: 'Konuşmacıyı dinleyiciye almak için yetkiniz yok.' });
    }
    const state = ensureStageState(found.ch);
    state.speakerUsernames = state.speakerUsernames.filter((u) => u.toLowerCase() !== targetLower);
    saveServers(servers);
    emitToServerMembers(found.srv, 'stage_state_updated', {
      serverId: found.srv.id,
      channelId: found.ch.id,
      stageState: state,
    });
  });

  socket.on('stage_set_topic', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object') return;
    const { serverId, channelId, topic } = rawPayload as {
      serverId?: unknown;
      channelId?: unknown;
      topic?: unknown;
    };
    const found = findStageChannel(serverId, channelId);
    if (!found) return;
    if (!isStageModerator(actor, found.srv, checkServerPermission)) {
      return socket.emit('server_action_error', { message: 'Sahne konusunu düzenlemek için yetkiniz yok.' });
    }
    const state = ensureStageState(found.ch);
    state.topic = typeof topic === 'string' ? sanitizeText(topic).trim().slice(0, 120) : '';
    saveServers(servers);
    emitToServerMembers(found.srv, 'stage_state_updated', {
      serverId: found.srv.id,
      channelId: found.ch.id,
      stageState: state,
    });
  });

  socket.on('voice_screen_annotation', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'voice_screen_annotation', 30, 2_000)) return;
    const { channelId, targetSharerId, stroke } = rawPayload as {
      channelId?: unknown;
      targetSharerId?: unknown;
      stroke?: {
        kind?: unknown;
        color?: unknown;
        width?: unknown;
        points?: unknown;
      };
    };
    if (typeof channelId !== 'string' || actor.currentVoiceChannelId !== channelId) return;
    if (!stroke || typeof stroke !== 'object') return;
    const kind = stroke.kind === 'clear' ? 'clear' : stroke.kind === 'draw' ? 'draw' : null;
    if (!kind) return;

    const color =
      typeof stroke.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(stroke.color.trim())
        ? stroke.color.trim()
        : '#f43f5e';
    const rawWidth = Number(stroke.width);
    const width = Number.isFinite(rawWidth) ? Math.min(16, Math.max(1, Math.round(rawWidth))) : 3;

    const points =
      kind === 'draw' && Array.isArray(stroke.points)
        ? stroke.points
            .slice(0, 64)
            .map((p) => {
              if (!p || typeof p !== 'object') return null;
              const pt = p as { x?: unknown; y?: unknown };
              const x = Number(pt.x);
              const y = Number(pt.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
            })
            .filter((p): p is { x: number; y: number } => p !== null)
        : [];

    if (kind === 'draw' && points.length === 0) return;

    socket.to(channelId).emit('voice_screen_annotation', {
      channelId,
      targetSharerId: typeof targetSharerId === 'string' ? targetSharerId.slice(0, 120) : '',
      authorUsername: actor.username,
      stroke: { kind, color, width, points },
    });
  });

  socket.on('group_e2ee_distribute_keys', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    if (!socketEventLimiter.allow(socket.id, 'group_e2ee_distribute', 10, 15_000)) return;
    const { groupId, epoch, envelopes } = rawPayload as {
      groupId?: unknown;
      epoch?: unknown;
      envelopes?: unknown;
    };
    if (typeof groupId !== 'string' || !Array.isArray(envelopes)) return;
    const room = groupDms.find((g) => g.id === groupId);
    if (!room) return;
    if (!room.members.some((m) => m.toLowerCase() === actor.username.toLowerCase())) return;

    const cleanEpoch = Number.isInteger(Number(epoch)) && Number(epoch) >= 1 ? Number(epoch) : (room.e2eeEpoch || 1);
    if (room.e2eeEpoch && cleanEpoch < room.e2eeEpoch) return;

    const memberSet = new Set(room.members.map((m) => m.toLowerCase()));
    const nowIso = new Date().toISOString();
    const cleanedEnvelopes: GroupE2eeKeyEnvelope[] = [];
    for (const rawEnv of envelopes.slice(0, 16)) {
      if (!rawEnv || typeof rawEnv !== 'object') continue;
      const env = rawEnv as Record<string, unknown>;
      const target = typeof env.targetUsername === 'string' ? env.targetUsername.trim() : '';
      const wrapped = typeof env.wrappedKeyBase64 === 'string' ? env.wrappedKeyBase64.trim().slice(0, 1024) : '';
      const iv = typeof env.ivBase64 === 'string' ? env.ivBase64.trim().slice(0, 256) : '';
      if (!target || !wrapped || !iv || !memberSet.has(target.toLowerCase())) continue;
      cleanedEnvelopes.push({
        targetUsername: target,
        senderUsername: actor.username,
        wrappedKeyBase64: wrapped,
        ivBase64: iv,
        epoch: cleanEpoch,
        updatedAt: nowIso,
      });
    }

    room.e2eeEnabled = true;
    room.e2eeEpoch = cleanEpoch;
    const existingOther = (room.e2eeKeyEnvelopes || []).filter(
      (e) =>
        e.epoch === cleanEpoch &&
        !cleanedEnvelopes.some((n) => n.targetUsername.toLowerCase() === e.targetUsername.toLowerCase())
    );
    room.e2eeKeyEnvelopes = [...existingOther, ...cleanedEnvelopes];
    saveGroupDms(groupDms);

    for (const env of cleanedEnvelopes) {
      emitToUserSockets(env.targetUsername, 'group_e2ee_key_bundle', {
        groupId: room.id,
        epoch: cleanEpoch,
        envelope: env,
      });
    }
    for (const member of room.members) {
      const userRooms = groupDms.filter((g) => g.members.some((m) => m.toLowerCase() === member.toLowerCase()));
      emitToUserSockets(member, 'group_dms_updated', userRooms);
    }
  });

  socket.on('group_e2ee_request_keys', (rawPayload: unknown) => {
    const actor = activeUsers.get(socket.id);
    if (!actor || !rawPayload || typeof rawPayload !== 'object') return;
    const { groupId } = rawPayload as { groupId?: unknown };
    if (typeof groupId !== 'string') return;
    const room = groupDms.find((g) => g.id === groupId);
    if (!room || !room.e2eeEnabled) return;
    const actorLower = actor.username.toLowerCase();
    if (!room.members.some((m) => m.toLowerCase() === actorLower)) return;

    const currentEpoch = room.e2eeEpoch || 1;
    const matching = (room.e2eeKeyEnvelopes || []).find(
      (e) => e.epoch === currentEpoch && e.targetUsername.toLowerCase() === actorLower
    );
    if (matching) {
      socket.emit('group_e2ee_key_bundle', {
        groupId: room.id,
        epoch: currentEpoch,
        envelope: matching,
      });
      return;
    }

    for (const member of room.members) {
      if (member.toLowerCase() !== actorLower) {
        emitToUserSockets(member, 'group_e2ee_key_needed', {
          groupId: room.id,
          requesterUsername: actor.username,
          epoch: currentEpoch,
        });
      }
    }
  });
}
