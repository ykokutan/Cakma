import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, Download, Copy, Check } from 'lucide-react';

export interface LightboxImageItem {
  url: string;
  name?: string;
  author?: string;
}

interface ChatLightboxProps {
  images: LightboxImageItem[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
}

export const ChatLightbox: React.FC<ChatLightboxProps> = ({
  images,
  currentIndex,
  onChangeIndex,
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);

  const safeIndex = images.length > 0 ? ((currentIndex % images.length) + images.length) % images.length : 0;
  const active = images[safeIndex];

  useEffect(() => {
    setZoom(1);
    setCopied(false);
  }, [safeIndex, active?.url]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        e.preventDefault();
        onChangeIndex((safeIndex - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        e.preventDefault();
        onChangeIndex((safeIndex + 1) % images.length);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [images.length, safeIndex, onChangeIndex, onClose]);

  if (!active) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(active.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fade-in select-none"
    >
      {/* Top Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl flex items-center justify-between gap-3 mb-3 px-4 py-2 rounded-2xl bg-black/60 border border-white/15 backdrop-blur-xl text-white"
      >
        <div className="min-w-0 flex items-center gap-2 text-xs">
          <span className="font-semibold truncate max-w-[240px]">
            {active.name || 'Görsel Önizleme'}
          </span>
          {active.author && (
            <span className="text-white/50 truncate">· @{active.author}</span>
          )}
          {images.length > 1 && (
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-white/75">
              {safeIndex + 1} / {images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition"
            title="Uzaklaştır (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-white/75 w-11 text-center">
            %{Math.round(zoom * 100)}
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition"
            title="Yakınlaştır (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition"
            title="Sıfırla (%100)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-white/15 mx-1" />
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition"
            title="Bağlantıyı Kopyala"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <a
            href={active.url}
            download={active.name || 'gorsel.png'}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition"
            title="İndir"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/80 text-white transition ml-1"
            title="Kapat (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="relative flex-1 w-full max-w-6xl min-h-0 flex items-center justify-center overflow-auto">
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex((safeIndex - 1 + images.length) % images.length);
            }}
            className="fixed left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/65 hover:bg-black/90 border border-white/15 text-white flex items-center justify-center shadow-xl transition"
            title="Önceki Görsel (←)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <img
          src={active.url}
          alt={active.name || 'Önizleme'}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.15 : -0.15;
            setZoom((z) => Math.min(3, Math.max(0.5, Number((z + delta).toFixed(2)))));
          }}
          style={{ transform: `scale(${zoom})` }}
          className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl transition-transform duration-150 cursor-default"
        />

        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex((safeIndex + 1) % images.length);
            }}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/65 hover:bg-black/90 border border-white/15 text-white flex items-center justify-center shadow-xl transition"
            title="Sonraki Görsel (→)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
