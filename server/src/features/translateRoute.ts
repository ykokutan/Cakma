import type { Express, RequestHandler } from 'express';

export const ALLOWED_TRANSLATE_LANGS = new Set(['tr', 'en', 'de', 'ru', 'fr', 'auto']);

export function normalizeTranslateLang(raw?: string | null): string {
  const cleaned = String(raw || '').trim().toLowerCase().slice(0, 8);
  if (ALLOWED_TRANSLATE_LANGS.has(cleaned)) return cleaned;
  return 'en';
}

export function parseGtxTranslateResponse(data: unknown): string | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const parts: string[] = [];
  for (const seg of data[0]) {
    if (Array.isArray(seg) && typeof seg[0] === 'string') {
      parts.push(seg[0]);
    }
  }
  const joined = parts.join('').trim();
  return joined ? joined : null;
}

interface TranslateRouteDeps {
  requireAuth: RequestHandler;
}

export function registerTranslateRoute(app: Express, deps: TranslateRouteDeps): void {
  const cache = new Map<string, string>();
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const MAX_CACHE_ENTRIES = 500;

  app.post('/api/translate', deps.requireAuth, async (req, res) => {
    const authReq = req as typeof req & { authUsername?: string };
    const actorKey = String(authReq.authUsername || req.ip || 'anon').toLowerCase();
    const now = Date.now();
    const rl = rateLimits.get(actorKey);
    if (!rl || now >= rl.resetAt) {
      rateLimits.set(actorKey, { count: 1, resetAt: now + 60_000 });
    } else if (rl.count >= 60) {
      return res.status(429).json({ ok: false, error: 'Çeviri istek sınırı aşıldı.' });
    } else {
      rl.count += 1;
    }

    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!rawText || rawText.length > 500) {
      return res.status(400).json({ ok: false, error: 'Geçersiz metin uzunluğu.' });
    }

    const sourceLang = normalizeTranslateLang(req.body?.sourceLang || 'auto');
    const targetLang = normalizeTranslateLang(req.body?.targetLang || 'tr');
    if (targetLang === 'auto') {
      return res.status(400).json({ ok: false, error: 'Hedef dil auto olamaz.' });
    }
    if (sourceLang === targetLang) {
      return res.json({ ok: true, translatedText: rawText, sourceLang, targetLang, cached: true });
    }

    const cacheKey = `${sourceLang}:${targetLang}:${rawText}`;
    const cachedVal = cache.get(cacheKey);
    if (cachedVal) {
      cache.delete(cacheKey);
      cache.set(cacheKey, cachedVal);
      return res.json({ ok: true, translatedText: cachedVal, sourceLang, targetLang, cached: true });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
        sourceLang
      )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(rawText)}`;
      const upstream = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'CakmaDesktop/1.3.1' },
        signal: controller.signal,
      });
      if (!upstream.ok) {
        return res.status(502).json({ ok: false, error: `Upstream HTTP ${upstream.status}` });
      }
      const data = await upstream.json();
      const translatedText = parseGtxTranslateResponse(data);
      if (!translatedText) {
        return res.status(502).json({ ok: false, error: 'Çeviri yanıtı ayrıştırılamadı.' });
      }

      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(cacheKey, translatedText);

      return res.json({ ok: true, translatedText, sourceLang, targetLang, cached: false });
    } catch {
      return res.status(504).json({ ok: false, error: 'Çeviri servisine ulaşılamadı.' });
    } finally {
      clearTimeout(timeout);
    }
  });
}
