import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request } from 'express';
import {
  AuthenticatedRequest,
  createAuthMiddlewares,
  extractSessionToken,
} from '../utils/adminAuth.js';
import { sendWebPush, type VapidKeys } from '../utils/webPush.js';
import type { PushSubscriptionRecord } from '../storage.js';
import type { RegisteredAccount, SystemStats } from '../types.js';
import type { SystemConfig } from '../storage.js';

interface GifCacheEntry {
  ts: number;
  gifs: Array<{ id: string; title: string; url: string; previewUrl: string; category: string }>;
}

const gifCache = new Map<string, GifCacheEntry>();
const GIF_CATEGORY_QUERY_MAP: Record<string, string> = {
  Oyun: 'gaming',
  Tepki: 'reaction',
  Müzik: 'music',
  Anime: 'anime',
};

export function clearGifCache(): void {
  gifCache.clear();
}

export function pruneGifCache(maxAgeMs = 5 * 60 * 1000, maxEntries = 100): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of gifCache.entries()) {
    if (now - v.ts > maxAgeMs) {
      gifCache.delete(k);
      removed++;
    }
  }
  while (gifCache.size > maxEntries) {
    const oldestKey = gifCache.keys().next().value;
    if (!oldestKey) break;
    gifCache.delete(oldestKey);
    removed++;
  }
  return removed;
}

export interface HealthAndPushDeps {
  systemConfig: SystemConfig;
  buildRuntimeMetrics: () => {
    uptimeSeconds: number;
    onlineUsers: number;
    serverCount: number;
    activeVoiceRooms: number;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    pendingStorageWrites: number;
    storageEngine: string;
    livekitEnabled: boolean;
    pushSubscriptionCount: number;
  };
  getSystemStats: () => SystemStats;
  getPushSubscriptions: () => PushSubscriptionRecord[];
  setPushSubscriptions: (records: PushSubscriptionRecord[]) => void;
  savePushSubscriptions: (records: PushSubscriptionRecord[]) => void;
  getVapidKeys: () => VapidKeys;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  isMasterRequest: (req: Request) => boolean;
}

export function registerHealthAndPushRoutes(app: Express, deps: HealthAndPushDeps) {
  const { requireAuth } = createAuthMiddlewares({
    verifySessionTokenWithMeta: deps.verifySessionTokenWithMeta,
    getAccount: deps.getAccount,
  });

  const isAdminSessionRequest = (req: Request): boolean => {
    const token = extractSessionToken(req);
    if (!token) return false;
    const verified = deps.verifySessionTokenWithMeta(token);
    if (!verified) return false;
    const acc = deps.getAccount(verified.username.toLowerCase());
    if (!acc || acc.role !== 'admin') return false;
    if (acc.minTokenIssuedAt && verified.iat < acc.minTokenIssuedAt) return false;
    return true;
  };

  const hasMetricsToken = (req: Request): boolean => {
    const configured = process.env.METRICS_TOKEN?.trim();
    if (!configured) return false;
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const headerToken = typeof req.headers['x-metrics-token'] === 'string' ? req.headers['x-metrics-token'].trim() : '';
    const candidate = bearer || headerToken;
    if (!candidate) return false;
    return crypto.timingSafeEqual(
      crypto.createHash('sha256').update(candidate).digest(),
      crypto.createHash('sha256').update(configured).digest()
    );
  };

  app.get('/api/health', (req, res) => {
    const m = deps.buildRuntimeMetrics();
    if (deps.isMasterRequest(req) || isAdminSessionRequest(req)) {
      return res.json({
        status: 'ok',
        ...m,
        stats: deps.getSystemStats(),
      });
    }
    return res.json({
      status: 'ok',
      uptimeSeconds: m.uptimeSeconds,
    });
  });

  app.get('/api/releases/latest', (_req, res) => {
    const candidates = [
      path.resolve(process.cwd(), 'downloads/latest.json'),
      path.resolve(process.cwd(), '../downloads/latest.json'),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return res.json({ ok: true, ...parsed });
      } catch {
        break;
      }
    }
    return res.status(404).json({ ok: false, error: 'Sürüm bildirimi bulunamadı.' });
  });

  app.get('/api/metrics', (req, res) => {
    if (!deps.isMasterRequest(req) && !isAdminSessionRequest(req) && !hasMetricsToken(req)) {
      return res.status(401).json({ success: false, error: 'Yetkisiz erişim: Yönetici veya metrics belirteci gerekli.' });
    }
    const m = deps.buildRuntimeMetrics();
    if (req.query.format === 'prometheus') {
      const lines = [
        '# HELP cakma_uptime_seconds Backend process uptime in seconds',
        '# TYPE cakma_uptime_seconds gauge',
        `cakma_uptime_seconds ${m.uptimeSeconds}`,
        '# HELP cakma_online_users Number of online users',
        '# TYPE cakma_online_users gauge',
        `cakma_online_users ${m.onlineUsers}`,
        '# HELP cakma_active_voice_rooms Active voice rooms count',
        '# TYPE cakma_active_voice_rooms gauge',
        `cakma_active_voice_rooms ${m.activeVoiceRooms}`,
        '# HELP cakma_memory_rss_mb Resident set size in MiB',
        '# TYPE cakma_memory_rss_mb gauge',
        `cakma_memory_rss_mb ${m.memoryRssMb}`,
        '# HELP cakma_memory_heap_used_mb V8 heap used in MiB',
        '# TYPE cakma_memory_heap_used_mb gauge',
        `cakma_memory_heap_used_mb ${m.memoryHeapUsedMb}`,
        '# HELP cakma_pending_storage_writes Pending async disk write count',
        '# TYPE cakma_pending_storage_writes gauge',
        `cakma_pending_storage_writes ${m.pendingStorageWrites}`,
      ];
      return res.type('text/plain').send(`${lines.join('\n')}\n`);
    }
    return res.json(m);
  });

  app.get('/api/push/status', (_req, res) => {
    const keys = deps.getVapidKeys();
    res.json({
      enabled: Boolean(keys.publicKey),
      subscriptionCount: deps.getPushSubscriptions().length,
    });
  });

  app.get('/api/push/vapid-public-key', (_req, res) => {
    const keys = deps.getVapidKeys();
    res.json({
      ok: true,
      publicKey: keys.publicKey,
    });
  });

  app.post('/api/push/subscribe', requireAuth, (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const subscription = req.body?.subscription;
    const endpoint = (subscription?.endpoint || '').toString().trim();
    const p256dh = (subscription?.keys?.p256dh || '').toString().trim();
    const auth = (subscription?.keys?.auth || '').toString().trim();
    if (!subscription || !endpoint || !p256dh || !auth) {
      return res.status(400).json({ success: false, error: 'Geçersiz Web Push abonelik nesnesi.' });
    }
    let list = deps.getPushSubscriptions().filter((s) => s.endpoint !== endpoint);
    list.push({
      username: authUser.username,
      endpoint,
      subscription: { endpoint, keys: { p256dh, auth } },
      updatedAt: new Date().toISOString(),
    });
    if (list.length > 500) {
      list = list.slice(-500);
    }
    deps.setPushSubscriptions(list);
    deps.savePushSubscriptions(list);
    return res.json({ success: true, count: list.length });
  });

  app.delete('/api/push/unsubscribe', requireAuth, (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const endpoint = (req.body?.endpoint || '').toString().trim();
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'endpoint gerekli.' });
    }
    const existing = deps.getPushSubscriptions();
    const filtered = existing.filter((s) => {
      if (s.endpoint !== endpoint) return true;
      if (authUser.role === 'admin') return false;
      return s.username.toLowerCase() !== authUser.username.toLowerCase();
    });
    deps.setPushSubscriptions(filtered);
    deps.savePushSubscriptions(filtered);
    return res.json({ success: true, removed: existing.length - filtered.length });
  });

  app.post('/api/push/test', requireAuth, async (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const unameLower = authUser.username.toLowerCase();
    const subs = deps.getPushSubscriptions().filter((s) => s.username.toLowerCase() === unameLower);
    if (subs.length === 0) {
      return res.status(404).json({ ok: false, error: 'Bu hesap için kayıtlı Web Push aboneliği bulunamadı.' });
    }
    const keys = deps.getVapidKeys();
    let sent = 0;
    const goneEndpoints = new Set<string>();
    let lastError = '';

    for (const rec of subs) {
      const result = await sendWebPush(
        rec.subscription as any,
        {
          title: 'Çakma Test Bildirimi',
          body: `Merhaba ${authUser.username}, tarayıcı dışı push bildirimleri aktif!`,
          url: '/',
        },
        keys
      );
      if (result.ok) {
        sent++;
      } else {
        lastError = result.error || `HTTP ${result.status}`;
        if (result.gone) goneEndpoints.add(rec.endpoint);
      }
    }

    if (goneEndpoints.size > 0) {
      const pruned = deps.getPushSubscriptions().filter((s) => !goneEndpoints.has(s.endpoint));
      deps.setPushSubscriptions(pruned);
      deps.savePushSubscriptions(pruned);
    }

    return res.json({
      ok: sent > 0,
      sent,
      pruned: goneEndpoints.size,
      error: sent > 0 ? undefined : lastError || 'Bildirim gönderilemedi.',
    });
  });

  app.get('/api/gifs', async (req, res) => {
    const apiKey = (deps.systemConfig.giphyApiKey || process.env.GIPHY_API_KEY || '').trim();
    if (!apiKey) {
      return res.json({ configured: false, source: 'fallback', gifs: [] });
    }

    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const rawCategory = typeof req.query.category === 'string' ? req.query.category.trim() : 'Tümü';
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 6), 36);

    const mappedCategoryQuery = GIF_CATEGORY_QUERY_MAP[rawCategory] || '';
    const effectiveQuery = rawQuery || mappedCategoryQuery;
    const cacheKey = `${effectiveQuery.toLowerCase()}|${rawCategory}|${limit}`;

    const cached = gifCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ configured: true, source: 'giphy', cached: true, gifs: cached.gifs });
    }

    try {
      const endpoint = effectiveQuery
        ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(effectiveQuery)}&limit=${limit}&rating=pg-13&lang=tr`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(apiKey)}&limit=${limit}&rating=pg-13`;

      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        return res.json({ configured: true, source: 'fallback', error: `GIPHY HTTP ${response.status}`, gifs: [] });
      }

      const payload = (await response.json()) as { data?: any[] };
      const gifs = (Array.isArray(payload?.data) ? payload.data : [])
        .map((item) => {
          const url = item?.images?.fixed_height?.url || item?.images?.original?.url || '';
          const previewUrl = item?.images?.fixed_width_small?.url || item?.images?.fixed_height_small?.url || url;
          if (!url) return null;
          return {
            id: String(item.id || Math.random()),
            title: String(item.title || 'GIF').trim() || 'GIF',
            url,
            previewUrl,
            category: rawCategory || 'Tümü',
          };
        })
        .filter((x): x is { id: string; title: string; url: string; previewUrl: string; category: string } => Boolean(x));

      pruneGifCache(5 * 60 * 1000, 99);
      gifCache.set(cacheKey, { ts: Date.now(), gifs });
      return res.json({ configured: true, source: 'giphy', gifs });
    } catch {
      return res.json({ configured: true, source: 'fallback', error: 'GIPHY bağlantı hatası', gifs: [] });
    }
  });
}
