import crypto from 'node:crypto';
import express, { type Express, type Request } from 'express';
import type { RegisteredAccount, User, VerifiedConnection, VerifiedProviderId } from '../types.js';
import type { SystemConfig } from '../storage.js';
import { createAuthMiddlewares, type AuthenticatedRequest } from '../utils/adminAuth.js';
import { hashPasswordAsync } from '../utils/authCrypto.js';

export interface OAuthRoutesDeps {
  registeredAccounts: Map<string, RegisteredAccount>;
  activeUsers: Map<string, User>;
  getSystemConfig: () => SystemConfig;
  saveSystemConfig: (cfg: SystemConfig) => void;
  saveAccounts: (accounts: Map<string, RegisteredAccount>) => void;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  generateSessionToken: (username: string) => string;
  generateMediaToken: (username: string) => string;
  generatePending2faToken: (username: string) => string;
  syncUserMembershipProfiles: (user: User) => void;
  emitUserUpdated: (user: User) => void;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
}

interface OAuthAttemptRecord {
  attemptId: string;
  pollSecretHash: string;
  provider: VerifiedProviderId;
  intent: 'login' | 'link';
  linkUsername?: string;
  inviteCode?: string;
  createdAt: number;
  status: 'pending' | 'completed' | 'requires_2fa' | 'error';
  result?: {
    token?: string;
    mediaToken?: string;
    username?: string;
    pending2faToken?: string;
    connection?: VerifiedConnection;
    error?: string;
    code?: string;
  };
}

export function extractSteamIdFromClaimedId(claimedId: string): string | null {
  const m = String(claimedId || '').match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{15,22})\/?$/i);
  return m ? m[1] : null;
}

export function resolveOAuthBaseUrl(req: Request, cfg: SystemConfig): string {
  const configured = String(cfg.oauthPublicBaseUrl || process.env.OAUTH_PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured;
  }
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const xfHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = xfHost || String(req.get('host') || 'localhost:4000');
  const proto = xfProto || req.protocol || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export class OAuthAttemptStore {
  private readonly attempts = new Map<string, OAuthAttemptRecord>();
  private readonly ttlMs = 10 * 60_000;

  create(params: {
    provider: VerifiedProviderId;
    intent: 'login' | 'link';
    linkUsername?: string;
    inviteCode?: string;
  }): { attemptId: string; pollSecret: string } {
    this.prune();
    const attemptId = crypto.randomBytes(16).toString('hex');
    const pollSecret = crypto.randomBytes(24).toString('hex');
    const pollSecretHash = crypto.createHash('sha256').update(pollSecret).digest('hex');
    this.attempts.set(attemptId, {
      attemptId,
      pollSecretHash,
      provider: params.provider,
      intent: params.intent,
      linkUsername: params.linkUsername,
      inviteCode: params.inviteCode,
      createdAt: Date.now(),
      status: 'pending',
    });
    return { attemptId, pollSecret };
  }

  getPending(attemptId: string, expectedProvider?: VerifiedProviderId): OAuthAttemptRecord | null {
    this.prune();
    const rec = this.attempts.get(attemptId);
    if (!rec || rec.status !== 'pending') return null;
    if (expectedProvider && rec.provider !== expectedProvider) return null;
    return rec;
  }

  complete(
    attemptId: string,
    status: 'completed' | 'requires_2fa' | 'error',
    result: OAuthAttemptRecord['result']
  ): boolean {
    const rec = this.attempts.get(attemptId);
    if (!rec) return false;
    rec.status = status;
    rec.result = result;
    return true;
  }

  poll(
    attemptId: string,
    secret: string
  ):
    | { ok: true; status: 'pending' }
    | { ok: true; status: 'completed' | 'requires_2fa'; result: NonNullable<OAuthAttemptRecord['result']> }
    | { ok: false; status: 'error' | 'not_found'; error: string; code?: string } {
    this.prune();
    const rec = this.attempts.get(attemptId);
    if (!rec) {
      return { ok: false, status: 'not_found', error: 'OAuth oturumu bulunamadı veya süresi doldu.' };
    }
    const providedHash = crypto.createHash('sha256').update(String(secret || '')).digest('hex');
    if (
      providedHash.length !== rec.pollSecretHash.length ||
      !crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(rec.pollSecretHash))
    ) {
      return { ok: false, status: 'error', error: 'Geçersiz doğrulama anahtarı.' };
    }
    if (rec.status === 'pending') {
      return { ok: true, status: 'pending' };
    }
    this.attempts.delete(attemptId);
    if (rec.status === 'error') {
      return {
        ok: false,
        status: 'error',
        error: rec.result?.error || 'Kimlik doğrulama tamamlanamadı.',
        code: rec.result?.code,
      };
    }
    return { ok: true, status: rec.status, result: rec.result || {} };
  }

  private prune() {
    const now = Date.now();
    for (const [id, rec] of this.attempts.entries()) {
      if (now - rec.createdAt > this.ttlMs) {
        this.attempts.delete(id);
      }
    }
  }
}

async function fetchSteamProfileMetadata(
  steamId: string,
  steamWebApiKey?: string
): Promise<{
  username: string;
  displayName?: string;
  profileUrl: string;
  avatarUrl?: string;
  metadata: { gameCount?: number; currentGame?: string };
}> {
  const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
  const key = String(steamWebApiKey || process.env.STEAM_WEB_API_KEY || '').trim();
  const metadata: { gameCount?: number; currentGame?: string } = {};

  if (key) {
    try {
      const sumRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(steamId)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (sumRes.ok) {
        const sumData = (await sumRes.json()) as any;
        const player = sumData?.response?.players?.[0];
        if (player) {
          if (typeof player.gameextrainfo === 'string' && player.gameextrainfo.trim()) {
            metadata.currentGame = player.gameextrainfo.trim().slice(0, 64);
          }
          try {
            const ownedRes = await fetch(
              `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${encodeURIComponent(steamId)}&include_played_free_games=1`,
              { signal: AbortSignal.timeout(6000) }
            );
            if (ownedRes.ok) {
              const ownedData = (await ownedRes.json()) as any;
              if (typeof ownedData?.response?.game_count === 'number') {
                metadata.gameCount = ownedData.response.game_count;
              }
            }
          } catch {}
          return {
            username: String(player.personaname || `Steam-${steamId.slice(-4)}`).slice(0, 40),
            displayName: String(player.realname || player.personaname || '').slice(0, 48) || undefined,
            profileUrl: String(player.profileurl || profileUrl),
            avatarUrl: String(player.avatarfull || player.avatarmedium || '') || undefined,
            metadata,
          };
        }
      }
    } catch {}
  }

  // Open XML community fallback (works even without STEAM_WEB_API_KEY)
  try {
    const xmlRes = await fetch(`${profileUrl}/?xml=1`, { signal: AbortSignal.timeout(6000) });
    if (xmlRes.ok) {
      const xml = await xmlRes.text();
      const idMatch = xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/i);
      const avatarMatch = xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/i);
      const gameMatch = xml.match(/<inGameInfo>[\s\S]*?<gameName><!\[CDATA\[(.*?)\]\]><\/gameName>/i);
      if (gameMatch?.[1]) metadata.currentGame = gameMatch[1].trim().slice(0, 64);
      return {
        username: idMatch?.[1]?.trim().slice(0, 40) || `Steam-${steamId.slice(-4)}`,
        profileUrl,
        avatarUrl: avatarMatch?.[1]?.trim() || undefined,
        metadata,
      };
    }
  } catch {}

  return {
    username: `Steam-${steamId.slice(-4)}`,
    profileUrl,
    metadata,
  };
}

function renderOAuthCallbackHtml(params: { ok: boolean; title: string; subtitle: string; attemptId: string }): string {
  const color = params.ok ? '#34d399' : '#fb7185';
  const icon = params.ok ? '✅' : '⚠️';
  const esc = (s: string) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(params.title)} — Çakma</title>
  <style>
    body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:#090b10; color:#fff; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { max-width:400px; width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.14); border-radius:20px; padding:24px; text-align:center; }
    h1 { font-size:18px; margin:12px 0 8px; color:${color}; }
    p { font-size:13px; color:rgba(255,255,255,0.72); line-height:1.5; margin:0 0 18px; }
    button { background:#3b82f6; color:#fff; border:none; border-radius:12px; padding:10px 18px; font-weight:700; cursor:pointer; font-size:13px; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:34px">${icon}</div>
    <h1>${esc(params.title)}</h1>
    <p>${esc(params.subtitle)}</p>
    <button onclick="window.close()">Pencereyi Kapat</button>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'cakma-oauth-done', attemptId: ${JSON.stringify(params.attemptId)}, ok: ${params.ok} }, '*');
      }
    } catch (e) {}
    setTimeout(function() { try { window.close(); } catch (e) {} }, 1200);
  </script>
</body>
</html>`;
}

export function registerOAuthAndConnectionsRoutes(app: Express, deps: OAuthRoutesDeps): {
  attemptStore: OAuthAttemptStore;
} {
  const attemptStore = new OAuthAttemptStore();
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: (usernameLower) => deps.registeredAccounts.get(usernameLower),
  });

  const getGithubCreds = (cfg: SystemConfig) => ({
    clientId: String(cfg.githubClientId || process.env.GITHUB_CLIENT_ID || '').trim(),
    clientSecret: String(cfg.githubClientSecret || process.env.GITHUB_CLIENT_SECRET || '').trim(),
  });

  const getGoogleCreds = (cfg: SystemConfig) => ({
    clientId: String(cfg.googleClientId || process.env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: String(cfg.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  });

  const getProvidersSnapshot = (cfg: SystemConfig) => {
    const gh = getGithubCreds(cfg);
    const gg = getGoogleCreds(cfg);
    return {
      steam: cfg.steamAuthEnabled !== false,
      github: Boolean(gh.clientId && gh.clientSecret),
      google: Boolean(gg.clientId && gg.clientSecret),
    };
  };

  app.get('/api/oauth/providers', (_req, res) => {
    const cfg = deps.getSystemConfig();
    res.json({
      ok: true,
      providers: getProvidersSnapshot(cfg),
      registrationEnabled: cfg.registrationEnabled !== false,
      inviteOnly: Boolean(cfg.inviteOnlyRegistration),
    });
  });

  app.post('/api/oauth/start', express.json({ limit: '16kb' }), (req, res) => {
    const cfg = deps.getSystemConfig();
    const providerRaw = String(req.body?.provider || '').trim().toLowerCase();
    const intent = req.body?.intent === 'link' ? 'link' : 'login';
    const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim().slice(0, 64) : undefined;

    if (providerRaw !== 'steam' && providerRaw !== 'github' && providerRaw !== 'google') {
      return res.status(400).json({ ok: false, error: 'Desteklenmeyen kimlik sağlayıcı.' });
    }
    const provider: VerifiedProviderId = providerRaw;
    const enabled = getProvidersSnapshot(cfg);
    if (!enabled[provider]) {
      return res.status(400).json({ ok: false, error: `${provider.toUpperCase()} entegrasyonu sunucuda yapılandırılmamış.` });
    }

    let linkUsername: string | undefined;
    if (intent === 'link') {
      // Require active session for linking to existing account
      const authHeader = req.headers.authorization;
      const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const cookieHeader = Array.isArray(req.headers.cookie) ? req.headers.cookie.join(';') : String(req.headers.cookie || '');
      const cookieMatch = cookieHeader.match(/(?:^|;\s*)cakma_session=([^;]+)/);
      const token = bearer || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : '');
      const verified = token ? deps.verifySessionTokenWithMeta(token) : null;
      if (!verified) {
        return res.status(401).json({ ok: false, error: 'Hesap bağlamak için oturum açmış olmalısınız.' });
      }
      linkUsername = verified.username;
    }

    const { attemptId, pollSecret } = attemptStore.create({
      provider,
      intent,
      linkUsername,
      inviteCode,
    });
    const baseUrl = resolveOAuthBaseUrl(req, cfg);
    const callbackUrl = `${baseUrl}/api/oauth/callback/${provider}`;

    let authorizeUrl: string;
    if (provider === 'steam') {
      const returnTo = `${callbackUrl}?attempt=${encodeURIComponent(attemptId)}`;
      const qs = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnTo,
        'openid.realm': baseUrl,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      });
      authorizeUrl = `https://steamcommunity.com/openid/login?${qs.toString()}`;
    } else if (provider === 'github') {
      const gh = getGithubCreds(cfg);
      const qs = new URLSearchParams({
        client_id: gh.clientId,
        redirect_uri: callbackUrl,
        scope: 'read:user user:email',
        state: attemptId,
      });
      authorizeUrl = `https://github.com/login/oauth/authorize?${qs.toString()}`;
    } else {
      const gg = getGoogleCreds(cfg);
      const qs = new URLSearchParams({
        client_id: gg.clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'openid email profile',
        state: attemptId,
        prompt: 'select_account',
      });
      authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`;
    }

    return res.json({ ok: true, attemptId, pollSecret, authorizeUrl });
  });

  app.get('/api/oauth/callback/:provider', async (req, res) => {
    const providerRaw = String(req.params.provider || '').trim().toLowerCase();
    if (providerRaw !== 'steam' && providerRaw !== 'github' && providerRaw !== 'google') {
      return res.status(400).send('Geçersiz sağlayıcı');
    }
    const provider: VerifiedProviderId = providerRaw;
    const attemptId =
      provider === 'steam'
        ? String(req.query.attempt || '').trim()
        : String(req.query.state || '').trim();

    const attempt = attemptStore.getPending(attemptId, provider);
    if (!attempt) {
      return res.status(400).send(
        renderOAuthCallbackHtml({
          ok: false,
          title: 'Oturum Süresi Doldu',
          subtitle: 'Bu kimlik doğrulama isteğinin süresi dolmuş veya zaten kullanılmış. Lütfen pencereyi kapatıp tekrar deneyin.',
          attemptId,
        })
      );
    }

    const cfg = deps.getSystemConfig();
    const baseUrl = resolveOAuthBaseUrl(req, cfg);
    const callbackUrl = `${baseUrl}/api/oauth/callback/${provider}`;

    const failCallback = (message: string, code?: string) => {
      attemptStore.complete(attemptId, 'error', { error: message, code });
      return res.status(400).send(
        renderOAuthCallbackHtml({
          ok: false,
          title: 'Bağlantı Tamamlanamadı',
          subtitle: message,
          attemptId,
        })
      );
    };

    let externalId = '';
    let extUsername: string;
    let extDisplayName: string | undefined;
    let extProfileUrl: string | undefined;
    let extAvatarUrl: string | undefined;
    let extEmail: string | undefined;
    let extMetadata: VerifiedConnection['metadata'];

    try {
      if (provider === 'steam') {
        const claimedId = String(req.query['openid.claimed_id'] || '');
        const extractedId = extractSteamIdFromClaimedId(claimedId);
        if (!extractedId) {
          return failCallback('Steam OpenID kimliği doğrulanamadı.');
        }
        const verifyParams = new URLSearchParams();
        for (const [k, v] of Object.entries(req.query)) {
          if (k.startsWith('openid.') && typeof v === 'string') {
            verifyParams.set(k, v);
          }
        }
        verifyParams.set('openid.mode', 'check_authentication');
        const verifyResp = await fetch('https://steamcommunity.com/openid/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: verifyParams.toString(),
          signal: AbortSignal.timeout(8000),
        });
        const verifyBody = await verifyResp.text();
        if (!verifyResp.ok || !/is_valid\s*:\s*true/i.test(verifyBody)) {
          return failCallback('Steam OpenID imzası reddedildi.');
        }
        externalId = extractedId;
        const steamMeta = await fetchSteamProfileMetadata(extractedId, cfg.steamWebApiKey);
        extUsername = steamMeta.username;
        extDisplayName = steamMeta.displayName;
        extProfileUrl = steamMeta.profileUrl;
        extAvatarUrl = steamMeta.avatarUrl;
        extMetadata = steamMeta.metadata;
      } else if (provider === 'github') {
        const code = String(req.query.code || '').trim();
        if (!code) return failCallback('GitHub yetkilendirme kodu alınamadı.');
        const gh = getGithubCreds(cfg);
        const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: gh.clientId,
            client_secret: gh.clientSecret,
            code,
            redirect_uri: callbackUrl,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const tokenJson = (await tokenResp.json()) as any;
        const accessToken = String(tokenJson?.access_token || '');
        if (!accessToken) return failCallback('GitHub erişim anahtarı alınamadı.');

        const userResp = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Cakma-Voice-Platform',
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(8000),
        });
        const ghUser = (await userResp.json()) as any;
        if (!ghUser?.id) return failCallback('GitHub profil bilgileri alınamadı.');
        externalId = String(ghUser.id);
        extUsername = String(ghUser.login || `gh-${externalId}`).slice(0, 40);
        extDisplayName = typeof ghUser.name === 'string' ? ghUser.name.slice(0, 48) : undefined;
        extProfileUrl = String(ghUser.html_url || `https://github.com/${extUsername}`);
        extAvatarUrl = typeof ghUser.avatar_url === 'string' ? ghUser.avatar_url : undefined;
        extEmail = typeof ghUser.email === 'string' && ghUser.email ? ghUser.email.toLowerCase() : undefined;
        if (!extEmail) {
          try {
            const emResp = await fetch('https://api.github.com/user/emails', {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'Cakma-Voice-Platform',
                Accept: 'application/vnd.github+json',
              },
              signal: AbortSignal.timeout(6000),
            });
            if (emResp.ok) {
              const emList = (await emResp.json()) as any[];
              const primary = Array.isArray(emList)
                ? emList.find((e) => e.verified && e.primary) || emList.find((e) => e.verified)
                : null;
              if (primary?.email) extEmail = String(primary.email).toLowerCase();
            }
          } catch {}
        }
        extMetadata = {
          publicRepos: typeof ghUser.public_repos === 'number' ? ghUser.public_repos : undefined,
          email: extEmail,
        };
      } else {
        const code = String(req.query.code || '').trim();
        if (!code) return failCallback('Google yetkilendirme kodu alınamadı.');
        const gg = getGoogleCreds(cfg);
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: gg.clientId,
            client_secret: gg.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: callbackUrl,
          }).toString(),
          signal: AbortSignal.timeout(8000),
        });
        const tokenJson = (await tokenResp.json()) as any;
        const accessToken = String(tokenJson?.access_token || '');
        if (!accessToken) return failCallback('Google erişim anahtarı alınamadı.');

        const userResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(8000),
        });
        const gUser = (await userResp.json()) as any;
        if (!gUser?.sub) return failCallback('Google profil bilgileri alınamadı.');
        externalId = String(gUser.sub);
        extEmail = typeof gUser.email === 'string' && gUser.email_verified ? gUser.email.toLowerCase() : undefined;
        extDisplayName = typeof gUser.name === 'string' ? gUser.name.slice(0, 48) : undefined;
        extUsername = extDisplayName || (extEmail ? extEmail.split('@')[0] : `Google-${externalId.slice(-4)}`);
        extAvatarUrl = typeof gUser.picture === 'string' ? gUser.picture : undefined;
        extMetadata = { email: extEmail };
      }
    } catch (err: any) {
      return failCallback(err?.message || 'Harici sağlayıcı ile iletişim kurulamadı.');
    }

    const verifiedConn: VerifiedConnection = {
      provider,
      externalId,
      username: extUsername,
      ...(extDisplayName ? { displayName: extDisplayName } : {}),
      ...(extProfileUrl ? { profileUrl: extProfileUrl } : {}),
      ...(extAvatarUrl ? { avatarUrl: extAvatarUrl } : {}),
      metadata: extMetadata,
      showOnProfile: true,
      verifiedAt: new Date().toISOString(),
    };

    const ensureVerifiedBadge = (acc: RegisteredAccount) => {
      const badges = Array.isArray(acc.badges) ? [...acc.badges] : [];
      if (!badges.some((b) => b.id === 'badge-verified-account')) {
        badges.push({
          id: 'badge-verified-account',
          name: 'Doğrulanmış Profil',
          icon: '✅',
          description: 'Steam, GitHub veya Google hesabı doğrulandı.',
          color: 'from-emerald-500 to-teal-400',
        });
      }
      acc.badges = badges;
    };

    const upsertConnection = (acc: RegisteredAccount, conn: VerifiedConnection) => {
      const list = Array.isArray(acc.verifiedConnections) ? [...acc.verifiedConnections] : [];
      const idx = list.findIndex((c) => c.provider === conn.provider);
      if (idx >= 0) {
        conn.showOnProfile = list[idx].showOnProfile !== false;
        list[idx] = conn;
      } else {
        list.push(conn);
      }
      acc.verifiedConnections = list;
      ensureVerifiedBadge(acc);
    };

    const syncLiveSocketsForAccount = (acc: RegisteredAccount) => {
      for (const u of deps.activeUsers.values()) {
        if (u.username.toLowerCase() === acc.username.toLowerCase()) {
          u.verifiedConnections = acc.verifiedConnections || [];
          u.badges = acc.badges || u.badges;
          deps.syncUserMembershipProfiles(u);
          deps.emitUserUpdated(u);
        }
      }
    };

    // Case A: Account Linking to existing signed-in user
    if (attempt.intent === 'link' && attempt.linkUsername) {
      const targetAcc = deps.registeredAccounts.get(attempt.linkUsername.toLowerCase());
      if (!targetAcc) {
        return failCallback('Hesabınız bulunamadı.');
      }
      for (const other of deps.registeredAccounts.values()) {
        if (other.username.toLowerCase() === targetAcc.username.toLowerCase()) continue;
        if (other.verifiedConnections?.some((c) => c.provider === provider && c.externalId === externalId)) {
          return failCallback(`Bu ${provider.toUpperCase()} hesabı başka bir kullanıcıya bağlı.`);
        }
      }
      upsertConnection(targetAcc, verifiedConn);
      deps.saveAccounts(deps.registeredAccounts);
      syncLiveSocketsForAccount(targetAcc);
      deps.addAuditLog(
        'HESAP_DOGRULANDI',
        `${targetAcc.username} kullanıcısı ${provider.toUpperCase()} hesabını (${verifiedConn.username}) doğruladı.`,
        'auth'
      );
      attemptStore.complete(attemptId, 'completed', { connection: verifiedConn, username: targetAcc.username });
      return res.send(
        renderOAuthCallbackHtml({
          ok: true,
          title: `${provider.toUpperCase()} Hesabı Bağlandı`,
          subtitle: `${verifiedConn.username} profilinize doğrulandı. Uygulamaya dönebilirsiniz.`,
          attemptId,
        })
      );
    }

    // Case B: One-Click Login / Auto-Registration
    let matchedAcc: RegisteredAccount | undefined;
    for (const acc of deps.registeredAccounts.values()) {
      if (acc.verifiedConnections?.some((c) => c.provider === provider && c.externalId === externalId)) {
        matchedAcc = acc;
        break;
      }
    }
    if (!matchedAcc && extEmail) {
      for (const acc of deps.registeredAccounts.values()) {
        if (acc.email?.toLowerCase() === extEmail) {
          matchedAcc = acc;
          break;
        }
      }
    }

    if (matchedAcc) {
      if (matchedAcc.isBanned && (!matchedAcc.bannedUntil || Date.now() < matchedAcc.bannedUntil)) {
        return failCallback(`Hesabınız yasaklanmış: ${matchedAcc.bannedReason || 'Sistem kuralı ihlali'}`);
      }
      upsertConnection(matchedAcc, verifiedConn);
      deps.saveAccounts(deps.registeredAccounts);
      if (matchedAcc.twoFactorEnabled) {
        const pending2faToken = deps.generatePending2faToken(matchedAcc.username);
        attemptStore.complete(attemptId, 'requires_2fa', {
          pending2faToken,
          username: matchedAcc.username,
        });
        return res.send(
          renderOAuthCallbackHtml({
            ok: true,
            title: '2FA Doğrulaması Gerekli',
            subtitle: 'Uygulamadaki pencerede 2FA doğrulama kodunuzu girerek girişi tamamlayın.',
            attemptId,
          })
        );
      }
      const token = deps.generateSessionToken(matchedAcc.username);
      const mediaToken = deps.generateMediaToken(matchedAcc.username);
      deps.addAuditLog('OAUTH_GIRIS', `${matchedAcc.username}, ${provider.toUpperCase()} ile giriş yaptı.`, 'auth');
      attemptStore.complete(attemptId, 'completed', {
        token,
        mediaToken,
        username: matchedAcc.username,
      });
      return res.send(
        renderOAuthCallbackHtml({
          ok: true,
          title: 'Giriş Başarılı',
          subtitle: `Hoş geldiniz, ${matchedAcc.username}! Uygulamaya yönlendiriliyorsunuz.`,
          attemptId,
        })
      );
    }

    // Auto-create new account via OAuth/Steam
    if (cfg.registrationEnabled === false) {
      return failCallback('Yeni üye kayıtları yönetici tarafından geçici olarak kapatılmıştır.');
    }

    if (cfg.inviteOnlyRegistration) {
      const code = String(attempt.inviteCode || '').trim().toUpperCase();
      const inv = (cfg.registrationInvites || []).find((i) => i.code.toUpperCase() === code);
      if (!inv || inv.uses >= inv.maxUses || (inv.expiresAt && Date.now() > inv.expiresAt)) {
        return failCallback(
          'Davet zorunlu mod açık: Geçerli bir kayıt davet kodu girerek tekrar deneyin.',
          'INVITE_REQUIRED'
        );
      }
      inv.uses += 1;
      deps.saveSystemConfig(cfg);
    }

    const baseRaw = (extUsername || `${provider}user`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16) || provider;
    let candidate = baseRaw.length >= 3 ? baseRaw : `${baseRaw}_user`;
    let suffix = 1;
    while (deps.registeredAccounts.has(candidate.toLowerCase())) {
      candidate = `${baseRaw.slice(0, 14)}_${suffix}`;
      suffix += 1;
    }

    const syntheticEmail = extEmail || `${provider}.${externalId}@oauth.cakma.local`;
    const randomPasswordHash = await hashPasswordAsync(crypto.randomBytes(24).toString('hex'));
    const newAccount: RegisteredAccount = {
      id: `acc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      username: candidate,
      email: syntheticEmail,
      password: randomPasswordHash,
      avatar: extAvatarUrl || (provider === 'steam' ? '🎮' : provider === 'github' ? '💻' : '🌐'),
      role: 'user',
      createdAt: new Date().toISOString(),
      walletBalance: cfg.defaultWalletBalance ?? 100,
      friends: [],
      verifiedConnections: [verifiedConn],
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion: 'v1',
    };
    ensureVerifiedBadge(newAccount);
    deps.registeredAccounts.set(candidate.toLowerCase(), newAccount);
    deps.saveAccounts(deps.registeredAccounts);
    deps.addAuditLog(
      'OAUTH_KAYIT',
      `${candidate}, ${provider.toUpperCase()} (${verifiedConn.username}) üzerinden yeni hesap oluşturdu.`,
      'auth'
    );

    const token = deps.generateSessionToken(newAccount.username);
    const mediaToken = deps.generateMediaToken(newAccount.username);
    attemptStore.complete(attemptId, 'completed', {
      token,
      mediaToken,
      username: newAccount.username,
    });
    return res.send(
      renderOAuthCallbackHtml({
        ok: true,
        title: 'Hesap Oluşturuldu',
        subtitle: `${newAccount.username} hesabınız oluşturuldu. Uygulamaya dönebilirsiniz.`,
        attemptId,
      })
    );
  });

  app.get('/api/oauth/poll/:attemptId', (req, res) => {
    const attemptId = String(req.params.attemptId || '').trim();
    const secret = String(req.query.secret || '').trim();
    const polled = attemptStore.poll(attemptId, secret);
    if (!polled.ok) {
      return res.status(polled.status === 'not_found' ? 404 : 400).json({
        ok: false,
        status: polled.status,
        error: polled.error,
        ...(polled.code ? { code: polled.code } : {}),
      });
    }
    if (polled.status === 'pending') {
      return res.json({ ok: true, status: 'pending' });
    }
    return res.json({
      ok: true,
      status: polled.status,
      ...polled.result,
    });
  });

  app.patch('/api/oauth/connections/:provider', requireAuth, express.json({ limit: '16kb' }), (req, res) => {
    const acc = (req as AuthenticatedRequest).authUser!.account;
    const provider = String(req.params.provider || '').trim().toLowerCase();
    const list = Array.isArray(acc.verifiedConnections) ? [...acc.verifiedConnections] : [];
    const target = list.find((c) => c.provider === provider);
    if (!target) {
      return res.status(404).json({ ok: false, error: 'Bağlı hesap bulunamadı.' });
    }
    if (typeof req.body?.showOnProfile === 'boolean') {
      target.showOnProfile = req.body.showOnProfile;
    }
    acc.verifiedConnections = list;
    deps.saveAccounts(deps.registeredAccounts);
    for (const u of deps.activeUsers.values()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) {
        u.verifiedConnections = [...list];
        deps.syncUserMembershipProfiles(u);
        deps.emitUserUpdated(u);
      }
    }
    return res.json({ ok: true, verifiedConnections: list });
  });

  app.delete('/api/oauth/connections/:provider', requireAuth, (req, res) => {
    const acc = (req as AuthenticatedRequest).authUser!.account;
    const provider = String(req.params.provider || '').trim().toLowerCase();
    const list = Array.isArray(acc.verifiedConnections) ? acc.verifiedConnections : [];
    const filtered = list.filter((c) => c.provider !== provider);
    if (filtered.length === list.length) {
      return res.status(404).json({ ok: false, error: 'Kaldırılacak bağlantı bulunamadı.' });
    }
    acc.verifiedConnections = filtered;
    if (filtered.length === 0 && Array.isArray(acc.badges)) {
      acc.badges = acc.badges.filter((b) => b.id !== 'badge-verified-account');
    }
    deps.saveAccounts(deps.registeredAccounts);
    for (const u of deps.activeUsers.values()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) {
        u.verifiedConnections = [...filtered];
        u.badges = acc.badges;
        deps.syncUserMembershipProfiles(u);
        deps.emitUserUpdated(u);
      }
    }
    return res.json({ ok: true, verifiedConnections: filtered });
  });

  app.post('/api/oauth/steam/refresh', requireAuth, async (req, res) => {
    const acc = (req as AuthenticatedRequest).authUser!.account;
    const list = Array.isArray(acc.verifiedConnections) ? [...acc.verifiedConnections] : [];
    const steamConn = list.find((c) => c.provider === 'steam');
    if (!steamConn) {
      return res.status(404).json({ ok: false, error: 'Bağlı Steam hesabı yok.' });
    }
    const cfg = deps.getSystemConfig();
    const fresh = await fetchSteamProfileMetadata(steamConn.externalId, cfg.steamWebApiKey);
    steamConn.username = fresh.username;
    if (fresh.displayName) steamConn.displayName = fresh.displayName;
    if (fresh.avatarUrl) steamConn.avatarUrl = fresh.avatarUrl;
    steamConn.metadata = fresh.metadata;
    steamConn.verifiedAt = new Date().toISOString();
    acc.verifiedConnections = list;
    deps.saveAccounts(deps.registeredAccounts);
    for (const u of deps.activeUsers.values()) {
      if (u.username.toLowerCase() === acc.username.toLowerCase()) {
        u.verifiedConnections = [...list];
        deps.syncUserMembershipProfiles(u);
        deps.emitUserUpdated(u);
      }
    }
    return res.json({ ok: true, connection: steamConn, verifiedConnections: list });
  });

  return { attemptStore };
}
