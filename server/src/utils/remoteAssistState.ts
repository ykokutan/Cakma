export interface RemoteAssistPermissions {
  control: boolean;
  clipboard: boolean;
  annotate: boolean;
}

export interface RemoteAssistSession {
  controllerSocketId: string;
  hostSocketId: string;
  hostDesktopCapable: boolean;
  permissions: RemoteAssistPermissions;
  paused: boolean;
  startedAt: number;
}

export type DirectCallLogStatus =
  | 'ended'
  | 'missed'
  | 'declined'
  | 'timeout'
  | 'busy'
  | 'dnd';

interface RateWindow {
  windowStart: number;
  moveCount: number;
  otherCount: number;
}

/** Normalize partial permission flags with safe defaults. */
export function normalizeRemoteAssistPermissions(
  input?: Partial<RemoteAssistPermissions>
): RemoteAssistPermissions {
  return {
    control: input?.control !== false,
    clipboard: input?.clipboard !== false,
    annotate: input?.annotate !== false,
  };
}

/** Format human-readable Turkish call log message persisted in DM chat. */
export function buildDirectCallLogContent(
  status: DirectCallLogStatus,
  durationSeconds: number,
  reason?: string
): string {
  const safeDuration = Math.max(0, Math.floor(Number(durationSeconds) || 0));
  const mins = Math.floor(safeDuration / 60)
    .toString()
    .padStart(2, '0');
  const secs = (safeDuration % 60).toString().padStart(2, '0');

  switch (status) {
    case 'ended':
      return `📞 1-e-1 sesli görüşme sonlandı (${mins}:${secs})`;
    case 'declined':
      return reason
        ? `📵 1-e-1 arama reddedildi — ${reason}`
        : `📵 1-e-1 arama reddedildi`;
    case 'timeout':
      return `📵 Cevapsız 1-e-1 arama (yanıtlanmadı)`;
    case 'busy':
      return `📵 Meşgul nedeniyle kaçırılan 1-e-1 arama`;
    case 'dnd':
      return `🌙 Rahatsız Etme modundayken gelen 1-e-1 arama`;
    case 'missed':
    default:
      return reason
        ? `📵 Cevapsız / reddedilen 1-e-1 arama — ${reason}`
        : `📵 Cevapsız / reddedilen 1-e-1 arama`;
  }
}

/**
 * Authoritative server-side manager for 1-on-1 Remote Assistance sessions,
 * permission enforcement, pause/resume state, and input rate limiting.
 */
export class RemoteAssistManager {
  private sessionsByHost = new Map<string, RemoteAssistSession>();
  private sessionsByController = new Map<string, RemoteAssistSession>();
  private rateWindows = new Map<string, RateWindow>();

  startSession(
    controllerSocketId: string,
    hostSocketId: string,
    hostDesktopCapable: boolean,
    permissions?: Partial<RemoteAssistPermissions>
  ): RemoteAssistSession {
    // Ensure neither participant stays bound to a stale session
    this.endSessionForSocket(controllerSocketId);
    this.endSessionForSocket(hostSocketId);

    const session: RemoteAssistSession = {
      controllerSocketId,
      hostSocketId,
      hostDesktopCapable: Boolean(hostDesktopCapable),
      permissions: normalizeRemoteAssistPermissions(permissions),
      paused: false,
      startedAt: Date.now(),
    };
    this.sessionsByHost.set(hostSocketId, session);
    this.sessionsByController.set(controllerSocketId, session);
    return session;
  }

  getSessionForSocket(socketId: string): RemoteAssistSession | undefined {
    return (
      this.sessionsByHost.get(socketId) ||
      this.sessionsByController.get(socketId)
    );
  }

  getSessionByHost(hostSocketId: string): RemoteAssistSession | undefined {
    return this.sessionsByHost.get(hostSocketId);
  }

  getSessionByController(
    controllerSocketId: string
  ): RemoteAssistSession | undefined {
    return this.sessionsByController.get(controllerSocketId);
  }

  setPaused(actorSocketId: string, paused: boolean): RemoteAssistSession | null {
    const session = this.getSessionForSocket(actorSocketId);
    if (!session) return null;
    session.paused = Boolean(paused);
    return session;
  }

  updatePermissions(
    hostSocketId: string,
    partial: Partial<RemoteAssistPermissions>
  ): RemoteAssistSession | null {
    const session = this.sessionsByHost.get(hostSocketId);
    if (!session) return null;
    session.permissions = {
      control:
        partial.control !== undefined
          ? Boolean(partial.control)
          : session.permissions.control,
      clipboard:
        partial.clipboard !== undefined
          ? Boolean(partial.clipboard)
          : session.permissions.clipboard,
      annotate:
        partial.annotate !== undefined
          ? Boolean(partial.annotate)
          : session.permissions.annotate,
    };
    return session;
  }

  canSendInput(controllerSocketId: string, hostSocketId: string): boolean {
    const session = this.sessionsByController.get(controllerSocketId);
    if (!session) return false;
    if (session.hostSocketId !== hostSocketId) return false;
    if (session.paused) return false;
    return session.permissions.control === true;
  }

  canShareClipboard(senderSocketId: string, targetSocketId: string): boolean {
    const session = this.getSessionForSocket(senderSocketId);
    if (!session) return true;
    const isSamePair =
      (session.controllerSocketId === senderSocketId &&
        session.hostSocketId === targetSocketId) ||
      (session.hostSocketId === senderSocketId &&
        session.controllerSocketId === targetSocketId);
    if (!isSamePair) return true;
    return session.permissions.clipboard === true;
  }

  allowInput(
    controllerSocketId: string,
    kind: string,
    nowMs = Date.now()
  ): boolean {
    let win = this.rateWindows.get(controllerSocketId);
    if (!win || nowMs - win.windowStart >= 1000) {
      win = { windowStart: nowMs, moveCount: 0, otherCount: 0 };
      this.rateWindows.set(controllerSocketId, win);
    }
    if (kind === 'move') {
      if (win.moveCount >= 90) return false;
      win.moveCount++;
      return true;
    }
    if (win.otherCount >= 150) return false;
    win.otherCount++;
    return true;
  }

  endSessionForSocket(socketId: string): RemoteAssistSession | null {
    const session = this.getSessionForSocket(socketId);
    if (!session) return null;
    this.sessionsByHost.delete(session.hostSocketId);
    this.sessionsByController.delete(session.controllerSocketId);
    this.rateWindows.delete(session.controllerSocketId);
    this.rateWindows.delete(session.hostSocketId);
    return session;
  }
}
