import dns from 'node:dns';
import net from 'node:net';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RegisteredAccount } from '../types.js';

export interface AuthenticatedRequest extends Request {
  authUser?: {
    username: string;
    role: 'admin' | 'user';
    account: RegisteredAccount;
  };
}

export interface AuthMiddlewareDeps {
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
}

export function parseCookieFromHeader(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      const raw = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function extractSessionToken(req: Pick<Request, 'headers'>): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const candidate = match[1].trim();
      if (candidate && candidate !== '__cookie__') {
        return candidate;
      }
    }
  }
  const cookieHeader = Array.isArray(req.headers.cookie) ? req.headers.cookie.join('; ') : req.headers.cookie;
  const cookieToken = parseCookieFromHeader(cookieHeader, 'cakma_session');
  if (cookieToken && cookieToken !== '__cookie__') {
    return cookieToken;
  }
  return null;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function expandIpv6Hextets(raw: string): number[] | null {
  const noZone = raw.split('%')[0].toLowerCase();
  if (noZone.includes('.')) {
    const lastColon = noZone.lastIndexOf(':');
    if (lastColon === -1) return null;
    const ipv4Part = noZone.slice(lastColon + 1);
    const octets = ipv4Part.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const h1 = ((octets[0] << 8) | octets[1]).toString(16);
    const h2 = ((octets[2] << 8) | octets[3]).toString(16);
    return expandIpv6Hextets(`${noZone.slice(0, lastColon + 1)}${h1}:${h2}`);
  }
  const halves = noZone.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;
  const full = [...left, ...Array<string>(missing).fill('0'), ...right];
  if (full.length !== 8) return null;
  const parsed = full.map((h) => parseInt(h, 16));
  if (parsed.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return parsed;
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const cleaned = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0];
  const ipType = net.isIP(cleaned);
  if (ipType === 4) {
    return isPrivateIpv4(cleaned);
  }
  if (ipType === 6) {
    const hextets = expandIpv6Hextets(cleaned);
    if (!hextets) return true;
    const allZero = hextets.every((h) => h === 0);
    if (allZero) return true;
    const isLoopback = hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1;
    if (isLoopback) return true;
    const isV4Mapped = hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
    if (isV4Mapped) {
      const a = (hextets[6] >> 8) & 0xff;
      const b = hextets[6] & 0xff;
      const c = (hextets[7] >> 8) & 0xff;
      const d = hextets[7] & 0xff;
      return isPrivateIpv4(`${a}.${b}.${c}.${d}`);
    }
    const first = hextets[0];
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 Unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 Link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 Site-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
    return false;
  }
  return true;
}

export async function validateExternalWebhookUrl(
  rawUrl: string,
  opts?: { skipDns?: boolean }
): Promise<{ ok: boolean; error?: string; normalizedUrl?: string }> {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Webhook URL boş olamaz.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Geçersiz URL formatı.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Yalnızca http:// veya https:// protokollerine izin verilir.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Webhook URL içinde kullanıcı kimlik bilgileri kullanılamaz.' };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname) {
    return { ok: false, error: 'Geçersiz alan adı.' };
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    return { ok: false, error: 'Güvenlik (SSRF): Yerel veya dahili ağ adreslerine webhook gönderilemez.' };
  }
  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, error: 'Güvenlik (SSRF): Özel veya yerel IP adreslerine webhook gönderilemez.' };
    }
    return { ok: true, normalizedUrl: parsed.toString() };
  }
  if (!opts?.skipDns) {
    try {
      const resolved = await dns.promises.lookup(hostname, { all: true });
      if (!resolved || resolved.length === 0) {
        return { ok: false, error: 'Webhook alan adı çözümlenemedi.' };
      }
      if (resolved.some((entry) => isPrivateOrReservedIp(entry.address))) {
        return { ok: false, error: 'Güvenlik (SSRF): Alan adı özel veya yerel bir IP adresine çözümlendi.' };
      }
    } catch {
      return { ok: false, error: 'Webhook alan adı DNS çözümlemesi başarısız oldu.' };
    }
  }
  return { ok: true, normalizedUrl: parsed.toString() };
}

export function createAuthMiddlewares(deps: AuthMiddlewareDeps): {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  requireSelfOrAdmin: (paramName?: string) => RequestHandler;
} {
  const resolveRequestAuth = (req: Request): AuthenticatedRequest['authUser'] | null => {
    const token = extractSessionToken(req);
    if (!token) return null;
    const meta = deps.verifySessionTokenWithMeta(token);
    if (!meta || !meta.username) return null;
    const account = deps.getAccount(meta.username.toLowerCase());
    if (!account) return null;
    if (account.minTokenIssuedAt && meta.iat < account.minTokenIssuedAt) {
      return null;
    }
    if (account.isBanned && (!account.bannedUntil || Date.now() < account.bannedUntil)) {
      return null;
    }
    return {
      username: account.username,
      role: account.role,
      account,
    };
  };

  const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const authUser = resolveRequestAuth(req);
    if (!authUser) {
      res.status(401).json({ ok: false, error: 'Oturum doğrulaması gerekli.' });
      return;
    }
    (req as AuthenticatedRequest).authUser = authUser;
    next();
  };

  const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const authUser = resolveRequestAuth(req);
    if (!authUser) {
      res.status(401).json({ ok: false, error: 'Oturum doğrulaması gerekli.' });
      return;
    }
    if (authUser.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'Bu işlem için Sistem Yöneticisi yetkisi gereklidir.' });
      return;
    }
    (req as AuthenticatedRequest).authUser = authUser;
    next();
  };

  const requireSelfOrAdmin = (paramName = 'username'): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authUser = resolveRequestAuth(req);
      if (!authUser) {
        res.status(401).json({ ok: false, error: 'Oturum doğrulaması gerekli.' });
        return;
      }
      const targetUsername = String(req.params[paramName] || '').trim().toLowerCase();
      if (authUser.role !== 'admin' && targetUsername !== authUser.username.toLowerCase()) {
        res.status(403).json({ ok: false, error: 'Yalnızca kendi hesabınıza ait verilere erişebilirsiniz.' });
        return;
      }
      (req as AuthenticatedRequest).authUser = authUser;
      next();
    };
  };

  return { requireAuth, requireAdmin, requireSelfOrAdmin };
}
