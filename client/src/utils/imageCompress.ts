export interface CompressedImageResult {
  dataUrl: string;
  name: string;
  type: string;
  size: number;
  compressed: boolean;
}

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('FileReader sonucu string değil'));
    };
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Optimizes static raster images (PNG/JPEG/BMP) to resized WebP on the client before upload.
 * Leaves animated GIFs, SVGs, and already-small images untouched.
 */
export async function compressImageToWebP(
  file: File,
  opts?: { maxDimension?: number; quality?: number; minBytesToCompress?: number }
): Promise<CompressedImageResult> {
  const originalDataUrl = await readAsDataUrl(file);
  const type = (file.type || '').toLowerCase();
  const minBytes = opts?.minBytesToCompress ?? 120 * 1024;
  const maxDim = opts?.maxDimension ?? 1920;
  const quality = opts?.quality ?? 0.84;

  const isCompressible =
    type.startsWith('image/') &&
    type !== 'image/gif' &&
    type !== 'image/svg+xml' &&
    file.size >= minBytes;

  if (!isCompressible || typeof document === 'undefined') {
    return {
      dataUrl: originalDataUrl,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      compressed: false,
    };
  }

  try {
    const img = await loadImageElement(originalDataUrl);
    let { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) {
      return { dataUrl: originalDataUrl, name: file.name, type: file.type, size: file.size, compressed: false };
    }

    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { dataUrl: originalDataUrl, name: file.name, type: file.type, size: file.size, compressed: false };
    }
    ctx.drawImage(img, 0, 0, width, height);

    const webpDataUrl = canvas.toDataURL('image/webp', quality);
    if (!webpDataUrl.startsWith('data:image/webp')) {
      return { dataUrl: originalDataUrl, name: file.name, type: file.type, size: file.size, compressed: false };
    }

    const estimatedBytes = Math.round(((webpDataUrl.length - webpDataUrl.indexOf(',') - 1) * 3) / 4);
    if (estimatedBytes >= file.size) {
      return { dataUrl: originalDataUrl, name: file.name, type: file.type, size: file.size, compressed: false };
    }

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return {
      dataUrl: webpDataUrl,
      name: `${baseName}.webp`,
      type: 'image/webp',
      size: estimatedBytes,
      compressed: true,
    };
  } catch {
    return {
      dataUrl: originalDataUrl,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      compressed: false,
    };
  }
}
