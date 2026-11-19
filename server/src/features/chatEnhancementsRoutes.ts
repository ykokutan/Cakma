import type { Express } from 'express';
import {
  AuthenticatedRequest,
  createAuthMiddlewares,
  validateExternalWebhookUrl,
} from '../utils/adminAuth.js';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function cleanMetaText(raw: string | undefined, maxLen: number): string | undefined {
  if (!raw) return undefined;
  const decoded = decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
  if (!decoded) return undefined;
  return decoded.slice(0, maxLen);
}

function parseMetaAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(tag)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[key] = val;
  }
  return attrs;
}

function resolveHttpUrl(candidate: string | undefined, baseUrl: string): string | undefined {
  if (!candidate) return undefined;
  try {
    const resolved = new URL(decodeHtmlEntities(candidate).trim(), baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return undefined;
    }
    return resolved.href.slice(0, 600);
  } catch {
    return undefined;
  }
}

/**
 * Extracts sanitized OpenGraph / HTML metadata from an HTML document snippet.
 */
export function parseOpenGraphHtml(html: string, baseUrl: string): LinkPreviewData | null {
  if (!html || typeof html !== 'string') return null;

  const metaValues = new Map<string, string>();
  const metaTagRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaTagRegex.exec(html)) !== null) {
    const attrs = parseMetaAttributes(match[0]);
    const key = (attrs.property || attrs.name || '').trim().toLowerCase();
    const content = attrs.content;
    if (key && typeof content === 'string' && content.trim() && !metaValues.has(key)) {
      metaValues.set(key, content);
    }
  }

  const titleTagMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanMetaText(
    metaValues.get('og:title') || metaValues.get('twitter:title') || titleTagMatch?.[1],
    160
  );
  const description = cleanMetaText(
    metaValues.get('og:description') || metaValues.get('twitter:description') || metaValues.get('description'),
    260
  );
  const image = resolveHttpUrl(
    metaValues.get('og:image') || metaValues.get('twitter:image'),
    baseUrl
  );

  let defaultHost = '';
  try {
    defaultHost = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch {}
  const siteName = cleanMetaText(metaValues.get('og:site_name') || defaultHost, 80);
  const canonicalUrl = resolveHttpUrl(metaValues.get('og:url'), baseUrl) || baseUrl;

  if (!title && !description && !image) {
    return null;
  }

  return {
    url: canonicalUrl,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(siteName ? { siteName } : {}),
  };
}

export interface ChatEnhancementsDeps {
  authMiddlewares: ReturnType<typeof createAuthMiddlewares>;
  fetchImpl?: typeof fetch;
}

const MAX_PREVIEW_BYTES = 131_072; // 128 KiB
const PREVIEW_CACHE_MAX = 200;
const PREVIEW_CACHE_TTL_MS = 15 * 60_000;

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    return (await res.text()).slice(0, maxBytes);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - received;
      if (remaining <= 0) break;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        received += remaining;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export function registerChatEnhancementsRoutes(app: Express, deps: ChatEnhancementsDeps) {
  const { requireAuth } = deps.authMiddlewares;
  const fetchFn = deps.fetchImpl ?? fetch;
  const rateLimits = new Map<string, { windowStart: number; count: number }>();
  const previewCache = new Map<string, { preview: LinkPreviewData | null; expiresAt: number }>();

  const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimits.entries()) {
      if (now - v.windowStart > 60_000) rateLimits.delete(k);
    }
    for (const [k, v] of previewCache.entries()) {
      if (now > v.expiresAt) previewCache.delete(k);
    }
  }, 5 * 60_000);
  pruneTimer.unref?.();

  app.get('/api/link-preview', requireAuth, async (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const rawUrl = String(req.query?.url || '').trim();
    if (!rawUrl || rawUrl.length > 600) {
      return res.status(400).json({ ok: false, error: 'Geçersiz URL.' });
    }

    const userKey = authUser.username.toLowerCase();
    const now = Date.now();
    const rl = rateLimits.get(userKey) || { windowStart: now, count: 0 };
    if (now - rl.windowStart > 60_000) {
      rl.windowStart = now;
      rl.count = 0;
    }
    if (rl.count + 1 > 30) {
      return res.status(429).json({ ok: false, error: 'Çok fazla bağlantı önizleme isteği gönderildi.' });
    }
    rl.count += 1;
    rateLimits.set(userKey, rl);

    const validation = await validateExternalWebhookUrl(rawUrl);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.error || 'Güvenli olmayan veya geçersiz URL.' });
    }
    const targetUrl = validation.normalizedUrl || rawUrl;

    const cached = previewCache.get(targetUrl);
    if (cached && now <= cached.expiresAt) {
      return res.json({ ok: true, preview: cached.preview });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const upstream = await fetchFn(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'CakmaLinkPreviewBot/1.0 (+https://ses.yahyakemalokutan.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      const finalUrl = upstream.url || targetUrl;
      if (finalUrl !== targetUrl) {
        const redirectCheck = await validateExternalWebhookUrl(finalUrl);
        if (!redirectCheck.ok) {
          await upstream.body?.cancel().catch(() => {});
          return res.status(400).json({ ok: false, error: 'Yönlendirilen hedef adres güvenlik kurallarına uymuyor.' });
        }
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!upstream.ok || (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml'))) {
        await upstream.body?.cancel().catch(() => {});
        return res.json({ ok: true, preview: null });
      }

      const html = await readBoundedText(upstream, MAX_PREVIEW_BYTES);
      const preview = parseOpenGraphHtml(html, finalUrl);

      if (previewCache.size >= PREVIEW_CACHE_MAX) {
        const oldestKey = previewCache.keys().next().value;
        if (oldestKey) previewCache.delete(oldestKey);
      }
      previewCache.set(targetUrl, { preview, expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS });

      return res.json({ ok: true, preview });
    } catch {
      return res.json({ ok: true, preview: null });
    } finally {
      clearTimeout(timeout);
    }
  });
}
