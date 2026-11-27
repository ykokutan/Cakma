import type { AntiRaidConfig, Server } from '../types.js';

export const DEFAULT_ANTI_RAID_CONFIG: AntiRaidConfig = {
  enabled: false,
  maxJoinsInWindow: 6,
  windowSeconds: 30,
  lockdownDurationMinutes: 15,
  pauseInvites: true,
  autoSlowmodeSeconds: 10,
};

export function normalizeAntiRaidConfig(raw?: Partial<AntiRaidConfig> | null): AntiRaidConfig {
  const maxJoins = Number(raw?.maxJoinsInWindow);
  const windowSec = Number(raw?.windowSeconds);
  const lockMin = Number(raw?.lockdownDurationMinutes);
  const slowSec = Number(raw?.autoSlowmodeSeconds);
  return {
    enabled: Boolean(raw?.enabled),
    maxJoinsInWindow: Number.isFinite(maxJoins) ? Math.max(2, Math.min(100, Math.round(maxJoins))) : 6,
    windowSeconds: Number.isFinite(windowSec) ? Math.max(5, Math.min(600, Math.round(windowSec))) : 30,
    lockdownDurationMinutes: Number.isFinite(lockMin) ? Math.max(1, Math.min(1440, Math.round(lockMin))) : 15,
    pauseInvites: raw?.pauseInvites !== false,
    autoSlowmodeSeconds: Number.isFinite(slowSec) ? Math.max(0, Math.min(300, Math.round(slowSec))) : 10,
  };
}

export class AntiRaidTracker {
  private readonly joinsByServer = new Map<string, number[]>();

  isServerLockedDown(server: Pick<Server, 'raidLockdownUntil'>, nowMs: number = Date.now()): boolean {
    return typeof server.raidLockdownUntil === 'number' && server.raidLockdownUntil > nowMs;
  }

  setManualLockdown(
    server: Server,
    active: boolean,
    durationMinutes?: number,
    nowMs: number = Date.now()
  ): number | null {
    if (!active) {
      server.raidLockdownUntil = null;
      this.joinsByServer.delete(server.id);
      return null;
    }
    const mins = Math.max(
      1,
      Math.min(1440, Math.round(Number(durationMinutes) || server.antiRaidConfig?.lockdownDurationMinutes || 15))
    );
    const until = nowMs + mins * 60_000;
    server.raidLockdownUntil = until;
    return until;
  }

  recordJoinAndCheck(
    server: Server,
    nowMs: number = Date.now()
  ): { triggered: boolean; lockedUntil: number | null; slowmodeApplied: number } {
    const cfg = normalizeAntiRaidConfig(server.antiRaidConfig);
    if (!cfg.enabled) {
      return { triggered: false, lockedUntil: server.raidLockdownUntil ?? null, slowmodeApplied: 0 };
    }

    const windowMs = cfg.windowSeconds * 1000;
    const prev = this.joinsByServer.get(server.id) || [];
    const recent = prev.filter((ts) => nowMs - ts <= windowMs);
    recent.push(nowMs);
    this.joinsByServer.set(server.id, recent);

    if (recent.length < cfg.maxJoinsInWindow) {
      return { triggered: false, lockedUntil: server.raidLockdownUntil ?? null, slowmodeApplied: 0 };
    }

    const until = nowMs + cfg.lockdownDurationMinutes * 60_000;
    server.raidLockdownUntil = until;
    let slowmodeApplied = 0;
    if (cfg.autoSlowmodeSeconds > 0 && Array.isArray(server.channels)) {
      for (const ch of server.channels) {
        if ((ch.type === 'text' || ch.type === 'announcement') && !ch.slowmodeSeconds) {
          ch.slowmodeSeconds = cfg.autoSlowmodeSeconds;
          slowmodeApplied += 1;
        }
      }
    }
    this.joinsByServer.set(server.id, []);
    return { triggered: true, lockedUntil: until, slowmodeApplied };
  }
}
