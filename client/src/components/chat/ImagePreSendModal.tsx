import React, { useContext, useEffect, useState } from 'react';
import { Crop, X, Check, Sparkles } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { t } from '../../utils/i18n';

export type CropAspectRatio = 'original' | '16:9' | '1:1';

interface ImagePreSendModalProps {
  file: File | null;
  initialCaption: string;
  onCancel: () => void;
  onConfirm: (processedFile: File, caption: string) => void;
}

function formatKb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const ImagePreSendModal: React.FC<ImagePreSendModalProps> = ({
  file,
  initialCaption,
  onCancel,
  onConfirm,
}) => {
  const language = useContext(AuthContext)?.language || 'tr';
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<CropAspectRatio>('original');
  const [webpOptimize, setWebpOptimize] = useState<boolean>(true);
  const [webpQuality, setWebpQuality] = useState<number>(0.84);
  const [caption, setCaption] = useState(initialCaption);
  const [isProcessing, setIsProcessing] = useState(false);

  const canOptimizeWebp =
    Boolean(file) &&
    file!.type.startsWith('image/') &&
    file!.type !== 'image/gif' &&
    file!.type !== 'image/svg+xml';

  useEffect(() => {
    setAspect('original');
    setWebpOptimize(true);
    setWebpQuality(0.84);
    setCaption(initialCaption);
    setIsProcessing(false);
    if (!file) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, initialCaption]);

  if (!file || !objectUrl) return null;

  const handleConfirm = async () => {
    if (aspect === 'original' && (!webpOptimize || !canOptimizeWebp)) {
      onConfirm(file, caption);
      return;
    }
    setIsProcessing(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Görsel okunamadı.'));
        el.src = objectUrl;
      });
      const natW = img.naturalWidth || 1;
      const natH = img.naturalHeight || 1;
      const targetRatio = aspect === '16:9' ? 16 / 9 : 1;
      const sourceRatio = natW / natH;

      let sx = 0;
      let sy = 0;
      let sw = natW;
      let sh = natH;
      if (aspect !== 'original') {
        if (sourceRatio > targetRatio) {
          sw = Math.round(natH * targetRatio);
          sx = Math.round((natW - sw) / 2);
        } else if (sourceRatio < targetRatio) {
          sh = Math.round(natW / targetRatio);
          sy = Math.round((natH - sh) / 2);
        }
      }

      const maxDim = 1920;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * scale));
      const outH = Math.max(1, Math.round(sh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onConfirm(file, caption);
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      const outType = webpOptimize && canOptimizeWebp
        ? 'image/webp'
        : file.type === 'image/png' || file.type === 'image/webp'
          ? file.type
          : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outType, webpOptimize ? webpQuality : 0.92)
      );
      if (!blob || (aspect === 'original' && blob.size >= file.size)) {
        onConfirm(file, caption);
        return;
      }
      const nextName =
        outType === 'image/webp' ? `${file.name.replace(/\.[^.]+$/, '')}.webp` : file.name;
      const processed = new File([blob], nextName, { type: outType });
      onConfirm(processed, caption);
    } catch {
      onConfirm(file, caption);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0e1320] text-white shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs font-bold min-w-0">
            <Crop className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{t(language, 'imagePreviewTitle')}</span>
            <span className="text-[11px] font-normal text-white/45 truncate max-w-[180px]">
              ({file.name} · {formatKb(file.size)})
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
            aria-label={t(language, 'close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-center bg-black/60 rounded-xl border border-white/10 p-2 min-h-[220px] max-h-72 overflow-hidden">
            {aspect === 'original' ? (
              <img
                src={objectUrl}
                alt={file.name}
                className="max-h-64 max-w-full object-contain rounded-lg"
              />
            ) : (
              <div
                className={`overflow-hidden rounded-lg border border-cyan-400/35 bg-black ${
                  aspect === '16:9' ? 'w-full max-w-[380px] aspect-video' : 'w-60 h-60 aspect-square'
                }`}
              >
                <img
                  src={objectUrl}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-white/60">{t(language, 'cropAspectLabel')}</span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'original', label: t(language, 'cropOriginal') },
                  { id: '16:9', label: '16:9' },
                  { id: '1:1', label: t(language, 'cropSquare') },
                ] as { id: CropAspectRatio; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAspect(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                    aspect === opt.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {canOptimizeWebp && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer text-white/85 font-semibold">
                <input
                  type="checkbox"
                  checked={webpOptimize}
                  onChange={(e) => setWebpOptimize(e.target.checked)}
                  className="rounded accent-cyan-400"
                />
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>WebP Akıllı Sıkıştırma</span>
              </label>
              {webpOptimize && (
                <div className="flex items-center gap-1">
                  {[
                    { q: 0.78, label: 'Hızlı (%78)' },
                    { q: 0.84, label: 'Dengeli (%84)' },
                    { q: 0.92, label: 'Yüksek (%92)' },
                  ].map((preset) => (
                    <button
                      key={preset.q}
                      type="button"
                      onClick={() => setWebpQuality(preset.q)}
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition ${
                        webpQuality === preset.q
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-white/60 mb-1">
              {t(language, 'optionalCaption')}
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
              placeholder={t(language, 'captionPlaceholder')}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/35 outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 bg-black/30">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 transition"
          >
            {t(language, 'cancel')}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => void handleConfirm()}
            className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isProcessing ? t(language, 'preparing') : t(language, 'upload')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
