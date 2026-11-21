const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(value: unknown, maxLen = 4096): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHAR_REGEX, '').trim().slice(0, maxLen);
}

export function isNonEmptyString(value: unknown, maxLen = 4096): value is string {
  if (typeof value !== 'string') return false;
  const cleaned = value.replace(CONTROL_CHAR_REGEX, '').trim();
  return cleaned.length > 0 && cleaned.length <= maxLen;
}

export type FieldSpec =
  | {
      type: 'string';
      required?: boolean;
      minLen?: number;
      maxLen?: number;
      trim?: boolean;
      enum?: readonly string[];
    }
  | {
      type: 'number';
      required?: boolean;
      min?: number;
      max?: number;
      integer?: boolean;
    }
  | {
      type: 'boolean';
      required?: boolean;
    }
  | {
      type: 'array';
      required?: boolean;
      maxItems?: number;
    }
  | {
      type: 'object';
      required?: boolean;
    };

export type SchemaSpec<T extends Record<string, any>> = {
  [K in keyof T]: FieldSpec;
};

export function validatePayload<T extends Record<string, any>>(
  payload: unknown,
  spec: SchemaSpec<T>
): { ok: true; data: T } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Geçersiz istek yükü (nesne bekleniyordu).' };
  }

  const input = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(spec)) {
    const rule = spec[key as keyof T];
    const rawVal = input[key];

    if (rawVal === undefined || rawVal === null) {
      if (rule.required) {
        return { ok: false, error: `'${key}' alanı zorunludur.` };
      }
      continue;
    }

    switch (rule.type) {
      case 'string': {
        if (typeof rawVal !== 'string') {
          return { ok: false, error: `'${key}' alanı metin olmalıdır.` };
        }
        let val = rawVal.replace(CONTROL_CHAR_REGEX, '');
        if (rule.trim !== false) val = val.trim();
        if (rule.minLen !== undefined && val.length < rule.minLen) {
          return { ok: false, error: `'${key}' alanı en az ${rule.minLen} karakter olmalıdır.` };
        }
        if (rule.maxLen !== undefined && val.length > rule.maxLen) {
          val = val.slice(0, rule.maxLen);
        }
        if (rule.enum && !rule.enum.includes(val)) {
          return { ok: false, error: `'${key}' alanı geçersiz bir değere sahip.` };
        }
        result[key] = val;
        break;
      }
      case 'number': {
        if (typeof rawVal !== 'number' || !Number.isFinite(rawVal)) {
          return { ok: false, error: `'${key}' alanı geçerli bir sayı olmalıdır.` };
        }
        if (rule.integer && !Number.isInteger(rawVal)) {
          return { ok: false, error: `'${key}' alanı tam sayı olmalıdır.` };
        }
        if (rule.min !== undefined && rawVal < rule.min) {
          return { ok: false, error: `'${key}' alanı en az ${rule.min} olmalıdır.` };
        }
        if (rule.max !== undefined && rawVal > rule.max) {
          return { ok: false, error: `'${key}' alanı en fazla ${rule.max} olmalıdır.` };
        }
        result[key] = rawVal;
        break;
      }
      case 'boolean': {
        if (typeof rawVal !== 'boolean') {
          return { ok: false, error: `'${key}' alanı mantıksal değer olmalıdır.` };
        }
        result[key] = rawVal;
        break;
      }
      case 'array': {
        if (!Array.isArray(rawVal)) {
          return { ok: false, error: `'${key}' alanı liste olmalıdır.` };
        }
        if (rule.maxItems !== undefined && rawVal.length > rule.maxItems) {
          return { ok: false, error: `'${key}' en fazla ${rule.maxItems} öğe içerebilir.` };
        }
        result[key] = rawVal;
        break;
      }
      case 'object': {
        if (typeof rawVal !== 'object' || Array.isArray(rawVal)) {
          return { ok: false, error: `'${key}' alanı geçerli bir nesne olmalıdır.` };
        }
        result[key] = rawVal;
        break;
      }
    }
  }

  return { ok: true, data: result as T };
}

export function createSocketEventRateLimiter() {
  const buckets = new Map<string, Map<string, number[]>>();

  const allow = (
    socketId: string,
    event: string,
    maxHits: number,
    windowMs: number,
    now = Date.now()
  ): boolean => {
    if (!socketId || maxHits <= 0 || windowMs <= 0) return false;

    let perSocket = buckets.get(socketId);
    if (!perSocket) {
      perSocket = new Map<string, number[]>();
      buckets.set(socketId, perSocket);
    }

    const cutoff = now - windowMs;
    const prev = perSocket.get(event) || [];
    const fresh = prev.filter((ts) => ts > cutoff);

    if (fresh.length >= maxHits) {
      perSocket.set(event, fresh);
      return false;
    }

    fresh.push(now);
    perSocket.set(event, fresh);
    return true;
  };

  const clearSocket = (socketId: string): void => {
    buckets.delete(socketId);
  };

  const prune = (maxAgeMs = 120_000, now = Date.now()): void => {
    const cutoff = now - maxAgeMs;
    for (const [sid, perSocket] of buckets.entries()) {
      for (const [evt, stamps] of perSocket.entries()) {
        const fresh = stamps.filter((ts) => ts > cutoff);
        if (fresh.length === 0) perSocket.delete(evt);
        else perSocket.set(evt, fresh);
      }
      if (perSocket.size === 0) buckets.delete(sid);
    }
  };

  return { allow, clearSocket, prune, buckets };
}

export type SocketEventRateLimiter = ReturnType<typeof createSocketEventRateLimiter>;
