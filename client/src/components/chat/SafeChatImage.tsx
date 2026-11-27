import React, { useEffect, useState } from 'react';
import { ImageOff, ExternalLink } from 'lucide-react';
import { isExpiredDiscordCdnUrl } from '../../utils/mediaHealth';

interface SafeChatImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  loading?: 'lazy' | 'eager';
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  compact?: boolean;
}

export const SafeChatImage: React.FC<SafeChatImageProps> = ({
  src,
  alt,
  className = '',
  onClick,
  loading = 'lazy',
  referrerPolicy,
  compact = false,
}) => {
  const preExpired = isExpiredDiscordCdnUrl(src);
  const [failed, setFailed] = useState(preExpired);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setFailed(isExpiredDiscordCdnUrl(src));
    setHidden(false);
  }, [src]);

  if (hidden) return null;

  if (failed) {
    if (compact) {
      return (
        <div
          className="w-16 h-16 rounded-lg border border-white/10 bg-black/40 flex flex-col items-center justify-center text-white/40 shrink-0"
          title="Medya kaynağına ulaşılamıyor"
        >
          <ImageOff className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="my-1 px-3 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] text-xs text-amber-200 flex items-center justify-between gap-3 max-w-md">
        <div className="flex items-center gap-2 min-w-0">
          <ImageOff className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="truncate">
            {preExpired
              ? 'Medya bağlantısının süresi dolmuş.'
              : 'Medya kaynağına şu an ulaşılamıyor.'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/^https?:\/\//i.test(src) && (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80"
              title="Kaynağı Yeni Sekmede Aç"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] text-white/75"
          >
            Gizle
          </button>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      referrerPolicy={referrerPolicy}
      onClick={onClick}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
