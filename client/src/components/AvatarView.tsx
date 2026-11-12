import React, { useState } from 'react';

interface AvatarViewProps {
  avatar?: string;
  alt?: string;
  fallback?: string;
  className?: string;
  imgClassName?: string;
}

export const isImageAvatar = (avatar?: string): boolean => {
  if (!avatar) return false;
  return (
    avatar.startsWith('data:image/') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('http://')
  );
};

export const AvatarView: React.FC<AvatarViewProps> = ({
  avatar,
  alt = 'Avatar',
  fallback = '👤',
  className = '',
  imgClassName = 'w-full h-full object-cover rounded-full',
}) => {
  const [imgError, setImgError] = useState(false);

  if (isImageAvatar(avatar) && !imgError) {
    return (
      <img
        src={avatar}
        alt={alt}
        onError={() => setImgError(true)}
        className={`${imgClassName} ${className}`.trim()}
        draggable={false}
      />
    );
  }

  return <span className={className}>{avatar || fallback}</span>;
};

export function processUploadedImage(
  file: File,
  options: { maxWidth: number; maxHeight: number; maxGifBytes: number }
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      resolve({ ok: false, error: 'Sadece PNG, JPG, WEBP veya GIF dosyaları yükleyebilirsiniz.' });
      return;
    }

    if (file.type === 'image/gif') {
      if (file.size > options.maxGifBytes) {
        const mb = (options.maxGifBytes / (1024 * 1024)).toFixed(1);
        resolve({ ok: false, error: `GIF dosyası en fazla ${mb} MB olabilir.` });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve({ ok: true, dataUrl: reader.result });
        } else {
          resolve({ ok: false, error: 'Dosya okunamadı.' });
        }
      };
      reader.onerror = () => resolve({ ok: false, error: 'Dosya okunurken hata oluştu.' });
      reader.readAsDataURL(file);
      return;
    }

    // Resize static images (PNG/JPG/WEBP) with canvas
    if (file.size > 10 * 1024 * 1024) {
      resolve({ ok: false, error: 'Görsel dosyası 10 MB boyutundan küçük olmalıdır.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(options.maxWidth / width, options.maxHeight / height, 1);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ ok: false, error: 'Görsel işlenemedi.' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp';
        const dataUrl = canvas.toDataURL(outputType, 0.86);
        resolve({ ok: true, dataUrl });
      };
      img.onerror = () => resolve({ ok: false, error: 'Geçersiz görsel dosyası.' });
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve({ ok: false, error: 'Dosya okunamadı.' });
    reader.readAsDataURL(file);
  });
}
