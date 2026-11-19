import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

export interface LinkPreviewMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const DIRECT_MEDIA_OR_INTERNAL_REGEX =
  /(\/uploads\/|\/api\/sounds\/|\.(?:png|jpe?g|gif|webp|svg|bmp|ico|mp3|wav|ogg|flac|m4a|webm|mp4|mov)(?:[?#]|$))/i;

export function extractFirstPreviewUrl(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return null;
  const cleaned = match[0].replace(/[.,!?;:]+$/, '');
  if (!cleaned || DIRECT_MEDIA_OR_INTERNAL_REGEX.test(cleaned)) {
    return null;
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

const clientPreviewCache = new Map<string, LinkPreviewMetadata | null>();
const inFlightPreviews = new Map<string, Promise<LinkPreviewMetadata | null>>();

async function fetchPreviewCached(url: string, host: string): Promise<LinkPreviewMetadata | null> {
  if (clientPreviewCache.has(url)) {
    return clientPreviewCache.get(url) ?? null;
  }
  const existingFlight = inFlightPreviews.get(url);
  if (existingFlight) {
    return existingFlight;
  }

  const reqPromise = (async () => {
    try {
      const res = await authFetch(host, `/api/link-preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        clientPreviewCache.set(url, null);
        return null;
      }
      const data = await res.json();
      const preview = data?.ok && data?.preview ? (data.preview as LinkPreviewMetadata) : null;
      if (clientPreviewCache.size >= 150) {
        const firstKey = clientPreviewCache.keys().next().value;
        if (firstKey) clientPreviewCache.delete(firstKey);
      }
      clientPreviewCache.set(url, preview);
      return preview;
    } catch {
      clientPreviewCache.set(url, null);
      return null;
    } finally {
      inFlightPreviews.delete(url);
    }
  })();

  inFlightPreviews.set(url, reqPromise);
  return reqPromise;
}

interface LinkPreviewCardProps {
  text: string;
  host: string;
  enabled?: boolean;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ text, host, enabled = true }) => {
  const targetUrl = enabled ? extractFirstPreviewUrl(text) : null;
  const [preview, setPreview] = useState<LinkPreviewMetadata | null>(() =>
    targetUrl && clientPreviewCache.has(targetUrl) ? clientPreviewCache.get(targetUrl) ?? null : null
  );
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!targetUrl) {
      setPreview(null);
      return;
    }
    setImgFailed(false);
    if (clientPreviewCache.has(targetUrl)) {
      setPreview(clientPreviewCache.get(targetUrl) ?? null);
      return;
    }
    let cancelled = false;
    void fetchPreviewCached(targetUrl, host).then((res) => {
      if (!cancelled) {
        setPreview(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetUrl, host]);

  if (!preview || (!preview.title && !preview.description && !preview.image)) {
    return null;
  }

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 max-w-md rounded-xl border border-white/10 border-l-2 border-l-rose-400 bg-white/[0.04] hover:bg-white/[0.08] p-2.5 flex items-start justify-between gap-3 transition group select-text"
    >
      <div className="min-w-0 flex-1 space-y-1">
        {preview.siteName && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/50 uppercase tracking-wider">
            <span className="truncate">{preview.siteName}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70 group-hover:opacity-100" />
          </div>
        )}
        {preview.title && (
          <div className="text-xs font-bold text-white line-clamp-2 group-hover:underline">
            {preview.title}
          </div>
        )}
        {preview.description && (
          <div className="text-[11px] text-white/60 line-clamp-2 leading-snug">
            {preview.description}
          </div>
        )}
      </div>
      {preview.image && !imgFailed && (
        <img
          src={preview.image}
          alt={preview.title || 'Link Önizleme'}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-16 h-16 rounded-lg object-cover shrink-0 border border-white/10 bg-black/20"
        />
      )}
    </a>
  );
};
