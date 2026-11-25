import React, { useContext, useEffect, useState } from 'react';
import { Crop, X, Check } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { t } from '../../utils/i18n';

export type CropAspectRatio = 'original' | '16:9' | '1:1';

interface ImagePreSendModalProps {
  file: File | null;
  initialCaption: string;
  onCancel: () => void;
  onConfirm: (processedFile: File, caption: string) => void;
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
  const [caption, setCaption] = useState(initialCaption);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setAspect('original');
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
    if (aspect === 'original') {
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
      if (sourceRatio > targetRatio) {
        sw = Math.round(natH * targetRatio);
        sx = Math.round((natW - sw) / 2);
      } else if (sourceRatio < targetRatio) {
        sh = Math.round(natW / targetRatio);
        sy = Math.round((natH - sh) / 2);
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

      const outType =
        file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outType, 0.92)
      );
      if (!blob) {
        onConfirm(file, caption);
        return;
      }
      const processed = new File([blob], file.name, { type: outType });
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
          <div className="flex items-center gap-2 text-xs font-bold">
            <Crop className="w-4 h-4 text-cyan-400" />
            <span>{t(language, 'imagePreviewTitle')}</span>
            <span className="text-[11px] font-normal text-white/45 truncate max-w-[200px]">
              ({file.name})
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
