import type { Express, RequestHandler } from 'express';
import { summarizeConversation, type SummaryEntryInput } from '../utils/smartSummarizer.js';
import type { SystemConfig } from '../storage.js';

interface SummaryRoutesDeps {
  requireAuth: RequestHandler;
  getSystemConfig: () => SystemConfig;
}

export function registerSummaryRoutes(app: Express, deps: SummaryRoutesDeps): void {
  const rateLimits = new Map<string, { count: number; resetAt: number }>();

  app.post('/api/chat/summarize', deps.requireAuth, async (req, res) => {
    const authReq = req as typeof req & { authUsername?: string };
    const actorKey = String(authReq.authUsername || req.ip || 'anon').toLowerCase();
    const now = Date.now();
    const rl = rateLimits.get(actorKey);
    if (!rl || now >= rl.resetAt) {
      rateLimits.set(actorKey, { count: 1, resetAt: now + 60_000 });
    } else if (rl.count >= 15) {
      return res.status(429).json({ ok: false, error: 'Özetleme istek sınırı aşıldı.' });
    } else {
      rl.count += 1;
    }

    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const channelName = typeof req.body?.channelName === 'string' ? req.body.channelName.slice(0, 64) : undefined;
    const entries: SummaryEntryInput[] = rawEntries
      .slice(-120)
      .filter((e: unknown): e is SummaryEntryInput => Boolean(e && typeof e === 'object'))
      .map((e: any) => ({
        author: String(e.author || 'Kullanıcı').slice(0, 48),
        content: String(e.content || '').slice(0, 600),
        timestamp: typeof e.timestamp === 'string' ? e.timestamp : undefined,
      }));

    const fallback = summarizeConversation(entries, { channelName });
    const cfg = deps.getSystemConfig();
    const provider = cfg.aiSummaryProvider || 'builtin';
    const apiKey = (cfg.aiSummaryApiKey || '').trim();

    if ((provider === 'gemini' || provider === 'openai') && apiKey && entries.length >= 3) {
      const transcript = entries.map((e) => `${e.author}: ${e.content}`).join('\n').slice(0, 8000);
      const prompt = `Aşağıdaki Türkçe/İngilizce sohbet akışını özetle. Sadece kısa bir "headline" (1 cümle) ve en fazla 4 maddelik Türkçe "highlights" (yazar adı + özet cümle) içeren JSON döndür: {"headline": "...", "highlights": [{"author": "...", "text": "..."}]}\n\nSohbet:\n${transcript}`;

      try {
        let aiText = '';
        if (provider === 'gemini') {
          const model = encodeURIComponent((cfg.aiSummaryModel || 'gemini-2.0-flash').trim());
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(6000),
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
              }),
            }
          );
          if (resp.ok) {
            const json: any = await resp.json();
            aiText = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '');
          }
        } else {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            signal: AbortSignal.timeout(6000),
            body: JSON.stringify({
              model: (cfg.aiSummaryModel || 'gpt-4o-mini').trim(),
              temperature: 0.2,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (resp.ok) {
            const json: any = await resp.json();
            aiText = String(json?.choices?.[0]?.message?.content || '');
          }
        }

        if (aiText) {
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const highlights = Array.isArray(parsed.highlights)
              ? parsed.highlights
                  .slice(0, 5)
                  .map((h: any) => ({
                    author: String(h?.author || 'AI').slice(0, 48),
                    text: String(h?.text || '').slice(0, 260),
                  }))
                  .filter((h: any) => Boolean(h.text))
              : fallback.highlights;
            return res.json({
              ok: true,
              digest: {
                ...fallback,
                mode: provider,
                headline: typeof parsed.headline === 'string' && parsed.headline.trim()
                  ? parsed.headline.trim().slice(0, 220)
                  : fallback.headline,
                highlights: highlights.length > 0 ? highlights : fallback.highlights,
              },
            });
          }
        }
      } catch {
        // Fallback seamlessly to built-in summarizer
      }
    }

    return res.json({ ok: true, digest: fallback });
  });
}
