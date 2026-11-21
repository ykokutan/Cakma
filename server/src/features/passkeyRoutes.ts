import crypto from 'crypto';
import type { Express, Request } from 'express';
import type { Socket } from 'socket.io';
import type { PasskeyCredential, RegisteredAccount } from '../types.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';
import {
  resolveRpIdFromOrigin,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from '../utils/webauthn.js';

interface StoredPasskeyChallenge {
  challenge: string;
  username?: string;
  rpId: string;
  allowedOrigins: string[];
  expiresAt: number;
}

export interface PasskeyRoutesDeps {
  registeredAccounts: Map<string, RegisteredAccount>;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  generateSessionToken: (username: string) => string;
  generateMediaToken: (username: string) => string;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  checkLoginRateLimit: (ip: string) => { allowed: boolean; retryAfterSeconds?: number };
  recordFailedLogin: (ip: string) => void;
  clearLoginRateLimit: (ip: string) => void;
  getClientIp?: (socket: Socket) => string;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 2000;

export function registerPasskeyRoutes(app: Express, deps: PasskeyRoutesDeps): void {
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: deps.getAccount,
  });

  const challengeStore = new Map<string, StoredPasskeyChallenge>();

  const pruneChallenges = () => {
    const now = Date.now();
    for (const [k, v] of challengeStore.entries()) {
      if (v.expiresAt <= now) challengeStore.delete(k);
    }
    while (challengeStore.size >= MAX_CHALLENGES) {
      const oldest = challengeStore.keys().next().value;
      if (!oldest) break;
      challengeStore.delete(oldest);
    }
  };

  const getReqIp = (req: Request): string => {
    const fwd = req.headers['x-forwarded-for'];
    if (process.env.TRUST_PROXY === 'true' && typeof fwd === 'string') {
      return fwd.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
  };

  app.get('/api/auth/passkeys', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const passkeys = (acc.passkeys || []).map((p) => ({
      id: p.id,
      label: p.label,
      transports: p.transports || [],
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    }));
    res.json({ success: true, passkeys });
  });

  app.delete('/api/auth/passkeys/:credId', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const credId = String(req.params.credId || '').trim();
    const list = acc.passkeys || [];
    const idx = list.findIndex((p) => p.id === credId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Passkey bulunamadı.' });
    }
    const [removed] = list.splice(idx, 1);
    acc.passkeys = list;
    deps.saveAccounts(deps.registeredAccounts);
    deps.addAuditLog('PASSKEY_SILINDI', `${acc.username} "${removed.label}" anahtarını sildi.`, 'auth');
    res.json({ success: true });
  });

  app.post('/api/auth/passkey/register-options', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    if ((acc.passkeys || []).length >= 10) {
      return res.status(400).json({ success: false, error: 'En fazla 10 passkey kaydedebilirsiniz.' });
    }

    pruneChallenges();
    const { rpId, allowedOrigins } = resolveRpIdFromOrigin(
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      typeof req.headers.host === 'string' ? req.headers.host : undefined
    );
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();
    challengeStore.set(challengeId, {
      challenge,
      username: acc.username,
      rpId,
      allowedOrigins,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    const userIdB64Url = Buffer.from(acc.id || acc.username, 'utf8').toString('base64url');
    res.json({
      success: true,
      challengeId,
      options: {
        rp: { name: 'Çakma Ses & Sohbet', id: rpId },
        user: {
          id: userIdB64Url,
          name: acc.username,
          displayName: acc.username,
        },
        challenge,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        timeout: 60_000,
        attestation: 'none',
        excludeCredentials: (acc.passkeys || []).map((p) => ({
          type: 'public-key',
          id: p.id,
          transports: p.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      },
    });
  });

  app.post('/api/auth/passkey/register-verify', requireAuth, (req: Request, res) => {
    const authReq = req as AuthenticatedRequest;
    const acc = authReq.authUser!.account;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
    const stored = challengeStore.get(challengeId);
    challengeStore.delete(challengeId);

    if (!stored || stored.expiresAt < Date.now() || stored.username?.toLowerCase() !== acc.username.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Passkey kaydı için süre doldu veya doğrulama geçersiz.' });
    }

    const attObj = String(body.response?.attestationObject || body.attestationObject || '').trim();
    const clientData = String(body.response?.clientDataJSON || body.clientDataJSON || '').trim();
    if (!attObj || !clientData) {
      return res.status(400).json({ success: false, error: 'Eksik WebAuthn kayıt verisi.' });
    }

    try {
      const verified = verifyPasskeyRegistration({
        attestationObjectB64Url: attObj,
        clientDataJSONB64Url: clientData,
        expectedChallenge: stored.challenge,
        expectedRpId: stored.rpId,
        expectedOrigins: stored.allowedOrigins,
      });

      // Prevent credential ID reuse across different accounts
      for (const other of deps.registeredAccounts.values()) {
        if ((other.passkeys || []).some((p) => p.id === verified.credentialId)) {
          return res.status(409).json({ success: false, error: 'Bu passkey zaten başka bir hesaba kayıtlı.' });
        }
      }

      const rawLabel = typeof body.label === 'string' ? body.label.trim().slice(0, 48) : '';
      const transports = Array.isArray(body.transports)
        ? body.transports.filter((t: unknown): t is string => typeof t === 'string').slice(0, 6)
        : undefined;

      const cred: PasskeyCredential = {
        id: verified.credentialId,
        publicKeySpkiBase64: verified.publicKeySpkiBase64,
        counter: verified.counter,
        label: rawLabel || `Cihaz Anahtarı (${(acc.passkeys || []).length + 1})`,
        transports,
        createdAt: new Date().toISOString(),
      };

      if (!acc.passkeys) acc.passkeys = [];
      acc.passkeys.push(cred);
      deps.saveAccounts(deps.registeredAccounts);
      deps.addAuditLog('PASSKEY_EKLENDI', `${acc.username} yeni bir passkey ekledi: ${cred.label}`, 'auth');

      res.json({
        success: true,
        passkey: {
          id: cred.id,
          label: cred.label,
          transports: cred.transports || [],
          createdAt: cred.createdAt,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey doğrulanamadı.';
      res.status(400).json({ success: false, error: `Passkey doğrulama hatası (${msg}).` });
    }
  });

  app.post('/api/auth/passkey/login-options', (req: Request, res) => {
    const ip = getReqIp(req);
    const rate = deps.checkLoginRateLimit(ip);
    if (!rate.allowed) {
      return res.status(429).json({
        success: false,
        error: `Çok fazla başarısız deneme. ${rate.retryAfterSeconds || 60} saniye sonra tekrar deneyin.`,
      });
    }

    pruneChallenges();
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const usernameQuery = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    let targetAccount: RegisteredAccount | undefined;
    if (usernameQuery) {
      targetAccount = deps.registeredAccounts.get(usernameQuery);
      if (!targetAccount) {
        for (const acc of deps.registeredAccounts.values()) {
          if (acc.email.toLowerCase() === usernameQuery) {
            targetAccount = acc;
            break;
          }
        }
      }
    }

    const { rpId, allowedOrigins } = resolveRpIdFromOrigin(
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      typeof req.headers.host === 'string' ? req.headers.host : undefined
    );
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();
    challengeStore.set(challengeId, {
      challenge,
      username: targetAccount?.username,
      rpId,
      allowedOrigins,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    const allowCredentials =
      targetAccount && Array.isArray(targetAccount.passkeys)
        ? targetAccount.passkeys.map((p) => ({
            type: 'public-key',
            id: p.id,
            transports: p.transports,
          }))
        : [];

    res.json({
      success: true,
      challengeId,
      options: {
        challenge,
        rpId,
        timeout: 60_000,
        userVerification: 'preferred',
        ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
      },
    });
  });

  app.post('/api/auth/passkey/login-verify', (req: Request, res) => {
    const ip = getReqIp(req);
    const rate = deps.checkLoginRateLimit(ip);
    if (!rate.allowed) {
      return res.status(429).json({
        success: false,
        error: `Çok fazla başarısız deneme. ${rate.retryAfterSeconds || 60} saniye sonra tekrar deneyin.`,
      });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
    const stored = challengeStore.get(challengeId);
    challengeStore.delete(challengeId);

    if (!stored || stored.expiresAt < Date.now()) {
      deps.recordFailedLogin(ip);
      return res.status(400).json({ success: false, error: 'Passkey giriş süresi doldu. Lütfen tekrar deneyin.' });
    }

    const credentialId = String(body.id || body.rawId || '').trim();
    const authData = String(body.response?.authenticatorData || body.authenticatorData || '').trim();
    const clientData = String(body.response?.clientDataJSON || body.clientDataJSON || '').trim();
    const signature = String(body.response?.signature || body.signature || '').trim();
    if (!credentialId || !authData || !clientData || !signature) {
      deps.recordFailedLogin(ip);
      return res.status(400).json({ success: false, error: 'Eksik passkey doğrulama yanıtı.' });
    }

    let matchedAcc: RegisteredAccount | undefined;
    let matchedCred: PasskeyCredential | undefined;
    for (const acc of deps.registeredAccounts.values()) {
      if (stored.username && acc.username.toLowerCase() !== stored.username.toLowerCase()) continue;
      const found = (acc.passkeys || []).find((p) => p.id === credentialId);
      if (found) {
        matchedAcc = acc;
        matchedCred = found;
        break;
      }
    }

    if (!matchedAcc || !matchedCred) {
      deps.recordFailedLogin(ip);
      return res.status(401).json({ success: false, error: 'Eşleşen passkey kaydı bulunamadı.' });
    }

    if (matchedAcc.isBanned) {
      if (matchedAcc.bannedUntil && matchedAcc.bannedUntil <= Date.now()) {
        matchedAcc.isBanned = false;
        matchedAcc.bannedReason = undefined;
        matchedAcc.bannedUntil = null;
      } else {
        return res.status(403).json({
          success: false,
          error: `Hesabınız yasaklanmıştır.${matchedAcc.bannedReason ? ` Sebep: ${matchedAcc.bannedReason}` : ''}`,
        });
      }
    }

    if (matchedAcc.lockedUntil && matchedAcc.lockedUntil > Date.now()) {
      const minsLeft = Math.max(1, Math.ceil((matchedAcc.lockedUntil - Date.now()) / 60_000));
      return res.status(423).json({
        success: false,
        error: `Hesabınız geçici olarak kilitlenmiştir (~${minsLeft} dk).`,
      });
    }

    try {
      const result = verifyPasskeyAuthentication({
        authenticatorDataB64Url: authData,
        clientDataJSONB64Url: clientData,
        signatureB64Url: signature,
        expectedChallenge: stored.challenge,
        expectedRpId: stored.rpId,
        expectedOrigins: stored.allowedOrigins,
        publicKeySpkiBase64: matchedCred.publicKeySpkiBase64,
        previousCounter: matchedCred.counter || 0,
      });

      matchedCred.counter = result.newCounter;
      matchedCred.lastUsedAt = new Date().toISOString();
      deps.clearLoginRateLimit(ip);
      deps.saveAccounts(deps.registeredAccounts);
      deps.addAuditLog(
        'PASSKEY_GIRISI',
        `${matchedAcc.username} Passkey (${matchedCred.label}) ile şifresiz giriş yaptı.`,
        'auth'
      );

      res.json({
        success: true,
        username: matchedAcc.username,
        token: deps.generateSessionToken(matchedAcc.username),
        mediaToken: deps.generateMediaToken(matchedAcc.username),
      });
    } catch (err) {
      deps.recordFailedLogin(ip);
      const msg = err instanceof Error ? err.message : 'Geçersiz passkey imzası';
      res.status(401).json({ success: false, error: `Passkey doğrulaması başarısız (${msg}).` });
    }
  });
}
