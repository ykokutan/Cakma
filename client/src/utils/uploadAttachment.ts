import type { MessageAttachment } from '../types';
import { authFetch } from './authFetch';
import { compressImageToWebP } from './imageCompress';

/**
 * Upload a base64 `data:` attachment to `/api/upload` so messages store compact
 * `/uploads/...` references instead of multi-megabyte inline strings.
 * Falls back gracefully to inline `dataUrl` only when connecting to legacy dedicated servers (404 / unreachable).
 */
export async function uploadDataUrlAttachment(
  host: string,
  params: { name: string; type: string; dataUrl: string },
  maxMb = 5
): Promise<MessageAttachment> {
  const approxBytes = Math.round((params.dataUrl.length * 3) / 4);
  if (approxBytes > maxMb * 1024 * 1024) {
    throw new Error(`"${params.name}" çok büyük! Maksimum sınır ${maxMb} MB.`);
  }

  try {
    const resp = await authFetch(host, '/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (resp.ok) {
      const json = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        attachment?: MessageAttachment;
      } | null;
      if (json?.ok && json.attachment) {
        return json.attachment;
      }
    }

    if (resp.status === 400 || resp.status === 413) {
      const errJson = (await resp.json().catch(() => null)) as { error?: string } | null;
      throw new Error(errJson?.error || `"${params.name}" sunucu tarafından reddedildi.`);
    }
  } catch (err: any) {
    if (err?.message && (err.message.includes('çok büyük') || err.message.includes('reddedildi') || err.message.includes('Çalıştırılabilir'))) {
      throw err;
    }
    // Legacy dedicated server without /api/upload -> fall through to inline fallback
  }

  return {
    id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: params.name,
    size: approxBytes,
    type: params.type,
    url: params.dataUrl,
  };
}

/** Compress (for raster images) and upload a browser `File` via `/api/upload`. */
export async function uploadAttachmentFile(
  host: string,
  file: File,
  maxMb = 5
): Promise<MessageAttachment> {
  const optimized = await compressImageToWebP(file);
  if (optimized.size > maxMb * 1024 * 1024) {
    throw new Error(`"${file.name}" çok büyük! Lütfen ${maxMb}MB'dan küçük dosyalar yükleyin.`);
  }
  return uploadDataUrlAttachment(
    host,
    {
      name: optimized.name,
      type: optimized.type,
      dataUrl: optimized.dataUrl,
    },
    maxMb
  );
}
