import type cors from 'cors';
import { logger } from './logger.js';

const DEFAULT_WARN_COOLDOWN_MS = 60_000;
const MAX_TRACKED_WARN_ORIGINS = 500;

export function buildAllowedOrigins(
  defaultOrigins: string[],
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const merged = new Set<string>();
  for (const orig of defaultOrigins) {
    const trimmed = String(orig || '').trim();
    if (trimmed) merged.add(trimmed);
  }
  const extraRaw = [env.CORS_ALLOWED_ORIGINS, env.ALLOWED_ORIGINS]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(',');

  for (const part of extraRaw.split(',')) {
    const cleaned = part.trim();
    if (cleaned) merged.add(cleaned);
  }
  return Array.from(merged);
}

export function isOriginAllowed(
  origin: string | undefined,
  requestHost: string | undefined,
  allowedOrigins: ReadonlySet<string>,
  allowAll = false
): boolean {
  if (!origin) return true;
  if (allowAll) return true;
  if (allowedOrigins.has(origin)) return true;

  if (requestHost) {
    try {
      const parsed = new URL(origin);
      if (parsed.host && parsed.host.toLowerCase() === requestHost.trim().toLowerCase()) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

function createBlockedOriginWarner(
  warnFn?: (origin: string, host?: string) => void,
  cooldownMs = DEFAULT_WARN_COOLDOWN_MS
) {
  const lastWarnAt = new Map<string, number>();

  return (origin: string, host?: string) => {
    const now = Date.now();
    const prev = lastWarnAt.get(origin) || 0;
    if (now - prev < cooldownMs) return;

    if (lastWarnAt.size >= MAX_TRACKED_WARN_ORIGINS) {
      const oldestKey = lastWarnAt.keys().next().value;
      if (oldestKey) lastWarnAt.delete(oldestKey);
    }
    lastWarnAt.set(origin, now);

    if (warnFn) {
      warnFn(origin, host);
    } else {
      logger.warn('CORS_BLOCKED', { origin, host: host || null });
    }
  };
}

export interface CorsConfigOptions {
  env?: NodeJS.ProcessEnv;
  allowAll?: boolean;
  warnCooldownMs?: number;
  onBlocked?: (origin: string, host?: string) => void;
}

export function createCorsOptionsDelegate(
  defaultOrigins: string[],
  options: CorsConfigOptions = {}
): cors.CorsOptionsDelegate {
  const env = options.env || process.env;
  const allowAll = options.allowAll ?? String(env.ALLOW_ALL_ORIGINS || '').trim().toLowerCase() === 'true';
  const allowedList = buildAllowedOrigins(defaultOrigins, env);
  const allowedSet = new Set(allowedList);
  const warnBlocked = createBlockedOriginWarner(options.onBlocked, options.warnCooldownMs);

  return (req, callback) => {
    const rawOrigin = req.headers.origin;
    const origin = typeof rawOrigin === 'string' ? rawOrigin : undefined;
    const rawHost = req.headers.host;
    const requestHost = typeof rawHost === 'string' ? rawHost : undefined;

    if (isOriginAllowed(origin, requestHost, allowedSet, allowAll)) {
      callback(null, { origin: true, credentials: true });
      return;
    }

    if (origin) {
      warnBlocked(origin, requestHost);
    }
    callback(null, { origin: false, credentials: true });
  };
}

export function createSocketCorsOriginValidator(
  defaultOrigins: string[],
  options: CorsConfigOptions = {}
): (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void {
  const env = options.env || process.env;
  const allowAll = options.allowAll ?? String(env.ALLOW_ALL_ORIGINS || '').trim().toLowerCase() === 'true';
  const allowedList = buildAllowedOrigins(defaultOrigins, env);
  const allowedSet = new Set(allowedList);
  const warnBlocked = createBlockedOriginWarner(options.onBlocked, options.warnCooldownMs);

  return (origin, callback) => {
    if (isOriginAllowed(origin, undefined, allowedSet, allowAll)) {
      callback(null, true);
      return;
    }
    if (origin) {
      warnBlocked(origin);
    }
    callback(null, false);
  };
}
