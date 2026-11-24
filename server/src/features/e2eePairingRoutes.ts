import crypto from 'crypto';
import type { Express, Request } from 'express';
import type { RegisteredAccount } from '../types.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';

interface PairingSession {
  code: string;
  usernameLower: string;
  expiresAt: number;
  status: 'pending' | 'ready';
  encryptedPayload?: string;
  ivBase64?: string;
}

export interface E2eePairingRoutesDeps {
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
}

const PAIRING_TTL_MS = 120_000;
const MAX_PAIRING_SESSIONS = 500;
const MAX_BUNDLE_LEN = 16_384;

export function registerE2eePairingRoutes(app: Express, deps: E2eePairingRoutesDeps): void {
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: deps.getAccount,
  });

  const sessions = new Map<string, PairingSession>();

  const pruneSessions = () => {
    const now = Date.now();
    for (const [k, s] of sessions.entries()) {
      if (s.expiresAt <= now) sessions.delete(k);
    }
    while (sessions.size >= MAX_PAIRING_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (!oldest) break;
      sessions.delete(oldest);
    }
  };

  app.post('/api/e2ee/pairing/start', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const unameLower = authReq.authUser!.username.toLowerCase();
    pruneSessions();

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    sessions.set(code, {
      code,
      usernameLower: unameLower,
      expiresAt,
      status: 'pending',
    });

    res.json({ ok: true, code, expiresAt });
  });

  app.post('/api/e2ee/pairing/:code/complete', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const unameLower = authReq.authUser!.username.toLowerCase();
    const code = String(req.params.code || '').trim().toUpperCase();
    pruneSessions();

    const session = sessions.get(code);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Eşleştirme oturumu bulunamadı veya süresi doldu.' });
    }
    if (session.usernameLower !== unameLower) {
      return res.status(403).json({ ok: false, error: 'Bu eşleştirme kodu başka bir hesaba ait.' });
    }
    if (session.status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Bu eşleştirme oturumu zaten tamamlandı.' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const encryptedPayload = typeof body.encryptedPayload === 'string' ? body.encryptedPayload.trim() : '';
    const ivBase64 = typeof body.ivBase64 === 'string' ? body.ivBase64.trim() : '';

    if (
      !encryptedPayload ||
      !ivBase64 ||
      encryptedPayload.length > MAX_BUNDLE_LEN ||
      ivBase64.length > 256
    ) {
      return res.status(400).json({ ok: false, error: 'Geçersiz E2EE anahtar paketi.' });
    }

    session.encryptedPayload = encryptedPayload;
    session.ivBase64 = ivBase64;
    session.status = 'ready';

    res.json({ ok: true });
  });

  app.get('/api/e2ee/pairing/:code/status', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const unameLower = authReq.authUser!.username.toLowerCase();
    const code = String(req.params.code || '').trim().toUpperCase();
    pruneSessions();

    const session = sessions.get(code);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Eşleştirme oturumu bulunamadı veya süresi doldu.' });
    }
    if (session.usernameLower !== unameLower) {
      return res.status(403).json({ ok: false, error: 'Bu eşleştirme kodu başka bir hesaba ait.' });
    }

    if (session.status === 'ready') {
      const payload = {
        ok: true,
        status: 'ready' as const,
        encryptedPayload: session.encryptedPayload,
        ivBase64: session.ivBase64,
      };
      // Single-use zero-persistence relay
      sessions.delete(code);
      return res.json(payload);
    }

    res.json({ ok: true, status: 'pending' as const });
  });
}
