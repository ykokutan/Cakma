import crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const EXACT_SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'mediatoken',
  'secret',
  'authorization',
  'smtppass',
  'privatekey',
  'privatekeyjwk',
  'totpcode',
  'backupcode',
  'apikey',
  'licensekey',
  'cookie',
  'x-relay-secret',
]);

const SENSITIVE_SUBSTRINGS = ['password', 'secret', 'privatekey', 'totp', 'authorization'];

function isSensitiveKey(key: string): boolean {
  const lower = key.trim().toLowerCase();
  if (EXACT_SENSITIVE_KEYS.has(lower)) return true;
  return SENSITIVE_SUBSTRINGS.some((sub) => lower.includes(sub));
}

export function redactSensitive(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') {
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(typeof (value as NodeJS.ErrnoException).code === 'string'
        ? { code: (value as NodeJS.ErrnoException).code }
        : {}),
    };
  }
  if (depth >= 6) return '[MaxDepth]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSensitive(v, depth + 1, seen);
    }
  }
  return out;
}

export interface LoggerOptions {
  format?: 'json' | 'pretty';
  level?: LogLevel;
  sink?: (level: LogLevel, line: string) => void;
}

function resolveLogFormat(explicit?: 'json' | 'pretty'): 'json' | 'pretty' {
  if (explicit) return explicit;
  return String(process.env.LOG_FORMAT || '').trim().toLowerCase() === 'json' ? 'json' : 'pretty';
}

function resolveLogLevel(explicit?: LogLevel): LogLevel {
  if (explicit) return explicit;
  const raw = String(process.env.LOG_LEVEL || 'info').trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

export function createLogger(options: LoggerOptions = {}) {
  const defaultSink = (lvl: LogLevel, line: string) => {
    if (lvl === 'error') console.error(line);
    else if (lvl === 'warn') console.warn(line);
    else console.log(line);
  };

  const write = (lvl: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const minLevel = resolveLogLevel(options.level);
    if (LEVEL_PRIORITY[lvl] < LEVEL_PRIORITY[minLevel]) return;

    const timestamp = new Date().toISOString();
    const safeMeta = meta ? (redactSensitive(meta) as Record<string, unknown>) : undefined;
    const format = resolveLogFormat(options.format);
    const sink = options.sink || defaultSink;

    if (format === 'json') {
      sink(
        lvl,
        JSON.stringify({
          ts: timestamp,
          level: lvl,
          msg: message,
          ...(safeMeta || {}),
        })
      );
      return;
    }

    const prefix = lvl === 'error' ? '❌' : lvl === 'warn' ? '⚠️' : lvl === 'debug' ? '🔍' : 'ℹ️';
    const metaSuffix =
      safeMeta && Object.keys(safeMeta).length > 0 ? ` ${JSON.stringify(safeMeta)}` : '';
    sink(lvl, `${prefix} [${lvl.toUpperCase()}] ${message}${metaSuffix}`);
  };

  return {
    debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
  };
}

export const logger = createLogger();

export interface RequestWithId extends Request {
  requestId?: string;
}

export function createRequestIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const rawIncoming = req.headers['x-request-id'];
    const candidate = typeof rawIncoming === 'string' ? rawIncoming.trim() : '';
    const requestId =
      candidate && /^[a-zA-Z0-9._-]{4,64}$/.test(candidate)
        ? candidate
        : crypto.randomUUID();
    (req as RequestWithId).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  };
}
