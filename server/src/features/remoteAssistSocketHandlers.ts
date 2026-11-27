import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { User } from '../types.js';
import {
  RemoteAssistManager,
  normalizeRemoteAssistPermissions,
  type RemoteAssistPermissions,
} from '../utils/remoteAssistState.js';

export interface RemoteAssistSocketDeps {
  io: SocketIOServer;
  activeUsers: Map<string, User>;
  activeDirectCallPairs: Map<string, string>;
  remoteAssistManager: RemoteAssistManager;
}

export function registerRemoteAssistSocketHandlers(
  socket: Socket,
  deps: RemoteAssistSocketDeps
): void {
  const { io, activeUsers, activeDirectCallPairs, remoteAssistManager } = deps;

  socket.on('remote_assist_request', (payload?: { permissions?: Partial<RemoteAssistPermissions> }) => {
    const caller = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!caller || !pairedSocketId) return;
    const requestedPerms = normalizeRemoteAssistPermissions(payload?.permissions);
    io.to(pairedSocketId).emit('remote_assist_incoming_request', {
      fromUserId: socket.id,
      fromUsername: caller.username,
      permissions: requestedPerms,
    });
  });

  socket.on('remote_assist_response', (payload: {
    accepted: boolean;
    hostDesktopCapable?: boolean;
    permissions?: Partial<RemoteAssistPermissions>;
    monitors?: Array<{ index: number; name: string; x: number; y: number; width: number; height: number; is_primary: boolean }>;
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload) return;
    const accepted = Boolean(payload.accepted);
    if (!accepted) {
      remoteAssistManager.endSessionForSocket(socket.id);
      io.to(pairedSocketId).emit('remote_assist_response', {
        accepted: false,
        hostDesktopCapable: false,
      });
      return;
    }

    const perms = normalizeRemoteAssistPermissions(payload.permissions);
    const session = remoteAssistManager.startSession(
      pairedSocketId,
      socket.id,
      Boolean(payload.hostDesktopCapable),
      perms
    );
    const safeMonitors = Array.isArray(payload.monitors)
      ? payload.monitors.slice(0, 8).map((m, idx) => ({
          index: typeof m.index === 'number' ? m.index : idx,
          name: typeof m.name === 'string' ? m.name.slice(0, 64) : `Monitör ${idx + 1}`,
          x: Number.isFinite(m.x) ? Math.round(m.x) : 0,
          y: Number.isFinite(m.y) ? Math.round(m.y) : 0,
          width: Number.isFinite(m.width) && m.width > 0 ? Math.round(m.width) : 1920,
          height: Number.isFinite(m.height) && m.height > 0 ? Math.round(m.height) : 1080,
          is_primary: Boolean(m.is_primary),
        }))
      : [];

    io.to(pairedSocketId).emit('remote_assist_response', {
      accepted: true,
      hostDesktopCapable: session.hostDesktopCapable,
      permissions: session.permissions,
      monitors: safeMonitors,
    });
  });

  socket.on('remote_assist_pause', ({ paused }: { paused: boolean }) => {
    const actor = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    const session = remoteAssistManager.setPaused(socket.id, Boolean(paused));
    if (!session) return;
    const msg = {
      paused: session.paused,
      byUsername: actor?.username || 'Kullanıcı',
    };
    io.to(pairedSocketId).emit('remote_assist_pause_state', msg);
    socket.emit('remote_assist_pause_state', msg);
  });

  socket.on('remote_assist_update_permissions', ({ permissions }: { permissions: Partial<RemoteAssistPermissions> }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !permissions) return;
    const updated = remoteAssistManager.updatePermissions(socket.id, permissions);
    if (!updated) return;
    io.to(pairedSocketId).emit('remote_assist_permissions_updated', {
      permissions: updated.permissions,
    });
  });

  socket.on('remote_assist_select_monitor', ({ monitorIndex }: { monitorIndex: number | null }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    const session = remoteAssistManager.getSessionForSocket(socket.id);
    if (!session) return;
    io.to(pairedSocketId).emit('remote_assist_monitor_selected', {
      monitorIndex: typeof monitorIndex === 'number' && Number.isFinite(monitorIndex) ? Math.max(0, Math.min(7, Math.floor(monitorIndex))) : null,
    });
  });

  socket.on('remote_assist_stop', () => {
    const user = activeUsers.get(socket.id);
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    remoteAssistManager.endSessionForSocket(socket.id);
    if (!pairedSocketId) return;
    io.to(pairedSocketId).emit('remote_assist_stopped', {
      stoppedBy: user?.username || 'Karşı taraf',
    });
  });

  socket.on('remote_assist_input', (payload: {
    kind: string;
    x?: number;
    y?: number;
    button?: number;
    delta_x?: number;
    delta_y?: number;
    key?: string;
    code?: string;
    text?: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
    monitor_x?: number;
    monitor_y?: number;
    monitor_w?: number;
    monitor_h?: number;
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload || typeof payload.kind !== 'string') return;
    if (!['move', 'mousedown', 'mouseup', 'wheel', 'keydown', 'keyup', 'text'].includes(payload.kind)) return;
    if (!remoteAssistManager.canSendInput(socket.id, pairedSocketId)) return;
    if (!remoteAssistManager.allowInput(socket.id, payload.kind, Date.now())) return;

    const cleanPayload: Record<string, unknown> = { kind: payload.kind };
    if (typeof payload.x === 'number' && Number.isFinite(payload.x)) {
      cleanPayload.x = Math.min(1, Math.max(0, payload.x));
    }
    if (typeof payload.y === 'number' && Number.isFinite(payload.y)) {
      cleanPayload.y = Math.min(1, Math.max(0, payload.y));
    }
    if (typeof payload.button === 'number' && Number.isFinite(payload.button)) {
      cleanPayload.button = Math.min(2, Math.max(0, Math.round(payload.button)));
    }
    if (typeof payload.delta_x === 'number' && Number.isFinite(payload.delta_x)) {
      cleanPayload.delta_x = Math.min(2000, Math.max(-2000, payload.delta_x));
    }
    if (typeof payload.delta_y === 'number' && Number.isFinite(payload.delta_y)) {
      cleanPayload.delta_y = Math.min(2000, Math.max(-2000, payload.delta_y));
    }
    if (typeof payload.key === 'string') cleanPayload.key = payload.key.slice(0, 64);
    if (typeof payload.code === 'string') cleanPayload.code = payload.code.slice(0, 64);
    if (typeof payload.text === 'string') cleanPayload.text = payload.text.slice(0, 512);
    if (payload.ctrl !== undefined) cleanPayload.ctrl = Boolean(payload.ctrl);
    if (payload.alt !== undefined) cleanPayload.alt = Boolean(payload.alt);
    if (payload.shift !== undefined) cleanPayload.shift = Boolean(payload.shift);
    if (payload.meta !== undefined) cleanPayload.meta = Boolean(payload.meta);
    if (typeof payload.monitor_x === 'number' && Number.isFinite(payload.monitor_x)) cleanPayload.monitor_x = Math.round(payload.monitor_x);
    if (typeof payload.monitor_y === 'number' && Number.isFinite(payload.monitor_y)) cleanPayload.monitor_y = Math.round(payload.monitor_y);
    if (typeof payload.monitor_w === 'number' && Number.isFinite(payload.monitor_w)) cleanPayload.monitor_w = Math.round(payload.monitor_w);
    if (typeof payload.monitor_h === 'number' && Number.isFinite(payload.monitor_h)) cleanPayload.monitor_h = Math.round(payload.monitor_h);

    io.to(pairedSocketId).emit('remote_assist_input', cleanPayload);
  });

  socket.on('direct_screen_share_state', ({ isSharing }: { isSharing: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    if (!isSharing) {
      const activeSess = remoteAssistManager.getSessionByHost(socket.id);
      if (activeSess) {
        remoteAssistManager.endSessionForSocket(socket.id);
        io.to(pairedSocketId).emit('remote_assist_stopped', { stoppedBy: 'Ekran paylaşımı durduruldu' });
      }
    }
    io.to(pairedSocketId).emit('direct_screen_share_state', {
      userId: socket.id,
      isSharing: Boolean(isSharing),
    });
  });

  socket.on('direct_camera_state', ({ isCameraOn }: { isCameraOn: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId) return;
    io.to(pairedSocketId).emit('direct_camera_state', {
      userId: socket.id,
      isCameraOn: Boolean(isCameraOn),
    });
  });

  socket.on('direct_media_meta', ({ trackId, kind, active }: { trackId: string; kind: 'screen' | 'camera'; active: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || typeof trackId !== 'string') return;
    if (kind !== 'screen' && kind !== 'camera') return;
    io.to(pairedSocketId).emit('direct_media_meta', {
      userId: socket.id,
      trackId: trackId.slice(0, 128),
      kind,
      active: Boolean(active),
    });
  });

  socket.on('remote_assist_clipboard', ({ text }: { text: string }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    const sender = activeUsers.get(socket.id);
    if (!pairedSocketId || typeof text !== 'string' || !text.trim()) return;
    if (!remoteAssistManager.canShareClipboard(socket.id, pairedSocketId)) return;
    io.to(pairedSocketId).emit('remote_assist_clipboard', {
      fromUsername: sender?.username || 'Kullanıcı',
      text: text.slice(0, 8000),
    });
  });

  socket.on('remote_assist_clipboard_pull', () => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    const requester = activeUsers.get(socket.id);
    if (!pairedSocketId || !requester) return;
    if (!remoteAssistManager.canShareClipboard(socket.id, pairedSocketId)) return;
    io.to(pairedSocketId).emit('remote_assist_clipboard_pull_request', {
      fromUsername: requester.username,
    });
  });

  socket.on('remote_assist_laser', (payload: { x: number; y: number; active: boolean }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload) return;
    const sess = remoteAssistManager.getSessionForSocket(socket.id);
    if (sess && sess.controllerSocketId === socket.id && !sess.permissions.annotate) return;
    io.to(pairedSocketId).emit('remote_assist_laser', {
      x: Math.min(1, Math.max(0, Number(payload.x) || 0)),
      y: Math.min(1, Math.max(0, Number(payload.y) || 0)),
      active: Boolean(payload.active),
    });
  });

  socket.on('remote_assist_annotation', (payload: {
    action: 'stroke' | 'clear';
    stroke?: {
      id: string;
      tool: 'pen' | 'arrow' | 'rect';
      color: string;
      points: Array<{ x: number; y: number }>;
    };
  }) => {
    const pairedSocketId = activeDirectCallPairs.get(socket.id);
    if (!pairedSocketId || !payload) return;
    const sess = remoteAssistManager.getSessionForSocket(socket.id);
    if (sess && sess.controllerSocketId === socket.id && !sess.permissions.annotate) return;

    if (payload.action === 'clear') {
      io.to(pairedSocketId).emit('remote_assist_annotation', { action: 'clear' });
      return;
    }

    if (payload.action === 'stroke' && payload.stroke && Array.isArray(payload.stroke.points)) {
      const allowedTools = new Set(['pen', 'arrow', 'rect']);
      const tool = allowedTools.has(payload.stroke.tool) ? payload.stroke.tool : 'pen';
      const safeColor = /^#[0-9a-fA-F]{6}$/.test(String(payload.stroke.color || ''))
        ? payload.stroke.color
        : '#f43f5e';
      const safePoints = payload.stroke.points.slice(0, 120).map((p) => ({
        x: Math.min(1, Math.max(0, Number(p.x) || 0)),
        y: Math.min(1, Math.max(0, Number(p.y) || 0)),
      }));
      if (safePoints.length === 0) return;

      io.to(pairedSocketId).emit('remote_assist_annotation', {
        action: 'stroke',
        stroke: {
          id: String(payload.stroke.id || `ann-${Date.now()}`).slice(0, 64),
          tool,
          color: safeColor,
          points: safePoints,
          createdAt: Date.now(),
        },
      });
    }
  });
}
