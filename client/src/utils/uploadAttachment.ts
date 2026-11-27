import type { MessageAttachment } from '../types';
import { authFetch, getStoredAuthToken, resolveBackendBaseUrl } from './authFetch';
import { compressImageToWebP } from './imageCompress';
import { encryptBinaryForPeer } from './e2ee';
import { encryptGroupAttachmentBytes } from './groupE2ee';

export interface UploadProgressOptions {
  maxMb?: number;
  onProgress?: (percent: number, bytesPerSec?: number) => void;
  signal?: AbortSignal;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x4000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Dosya okunamadı.'));
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(blob);
  });
}

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

    if (resp.status === 400 || resp.status === 413 || resp.status === 429) {
      const errJson = (await resp.json().catch(() => null)) as { error?: string } | null;
      throw new Error(errJson?.error || `"${params.name}" sunucu tarafından reddedildi.`);
    }
  } catch (err: any) {
    if (
      err?.message &&
      (err.message.includes('çok büyük') ||
        err.message.includes('reddedildi') ||
        err.message.includes('Çalıştırılabilir') ||
        err.message.includes('limit') ||
        err.message.includes('kota'))
    ) {
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

/**
 * Upload raw binary Blob via `/api/upload/stream` with live progress events and AbortSignal support.
 * Avoids ~33% Base64 JSON inflation and falls back to `uploadDataUrlAttachment` only on HTTP 404.
 */
export async function uploadBinaryWithProgress(
  host: string,
  params: { name: string; type: string; blob: Blob },
  opts: UploadProgressOptions = {}
): Promise<MessageAttachment> {
  const maxMb = opts.maxMb ?? 5;
  if (params.blob.size > maxMb * 1024 * 1024) {
    throw new Error(`"${params.name}" çok büyük! Maksimum sınır ${maxMb} MB.`);
  }
  if (opts.signal?.aborted) {
    throw new DOMException('Yükleme iptal edildi.', 'AbortError');
  }

  if (typeof XMLHttpRequest === 'undefined') {
    const dataUrl = await blobToDataUrl(params.blob);
    opts.onProgress?.(100);
    return uploadDataUrlAttachment(host, { name: params.name, type: params.type, dataUrl }, maxMb);
  }

  const base = resolveBackendBaseUrl(host);
  const url = `${base}/api/upload/stream`;
  const token = getStoredAuthToken();

  try {
    const uploaded = await new Promise<MessageAttachment>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const onAbort = () => xhr.abort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        opts.signal?.removeEventListener('abort', onAbort);
      };

      xhr.open('POST', url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(params.name));
      xhr.setRequestHeader('X-File-Type', params.type || 'application/octet-stream');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      const uploadStartMs = Date.now();
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const elapsedSec = (Date.now() - uploadStartMs) / 1000;
          const speed = elapsedSec > 0.15 ? ev.loaded / elapsedSec : undefined;
          opts.onProgress?.(Math.min(99, Math.round((ev.loaded / ev.total) * 100)), speed);
        }
      };

      xhr.onload = () => {
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText || '{}') as {
              ok?: boolean;
              attachment?: MessageAttachment;
            };
            if (parsed.ok && parsed.attachment) {
              opts.onProgress?.(100);
              resolve(parsed.attachment);
              return;
            }
          } catch {}
        }
        if (xhr.status === 404) {
          reject(new Error('STREAM_ENDPOINT_404'));
          return;
        }
        let serverErr = `"${params.name}" yüklenemedi.`;
        try {
          const parsedErr = JSON.parse(xhr.responseText || '{}') as { error?: string };
          if (parsedErr.error) serverErr = parsedErr.error;
        } catch {}
        reject(new Error(serverErr));
      };

      xhr.onerror = () => {
        cleanup();
        reject(new Error('NETWORK_UPLOAD_ERROR'));
      };

      xhr.onabort = () => {
        cleanup();
        reject(new DOMException('Yükleme iptal edildi.', 'AbortError'));
      };

      xhr.send(params.blob);
    });
    return uploaded;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    if (err?.message === 'STREAM_ENDPOINT_404' || err?.message === 'NETWORK_UPLOAD_ERROR') {
      const dataUrl = await blobToDataUrl(params.blob);
      const res = await uploadDataUrlAttachment(
        host,
        { name: params.name, type: params.type, dataUrl },
        maxMb
      );
      opts.onProgress?.(100);
      return res;
    }
    throw err;
  }
}

/** Compress (for raster images) and upload a browser `File` via streaming binary endpoint. */
export async function uploadAttachmentFile(
  host: string,
  file: File,
  maxMbOrOpts: number | UploadProgressOptions = 5
): Promise<MessageAttachment> {
  const opts: UploadProgressOptions =
    typeof maxMbOrOpts === 'number' ? { maxMb: maxMbOrOpts } : maxMbOrOpts;
  const maxMb = opts.maxMb ?? 5;

  const isRasterImage =
    file.type.startsWith('image/') && !file.type.includes('gif') && !file.type.includes('svg');
  if (isRasterImage) {
    const optimized = await compressImageToWebP(file);
    if (optimized.size > maxMb * 1024 * 1024) {
      throw new Error(`"${file.name}" çok büyük! Lütfen ${maxMb}MB'dan küçük dosyalar yükleyin.`);
    }
    const bytes = dataUrlToBytes(optimized.dataUrl);
    return uploadBinaryWithProgress(
      host,
      {
        name: optimized.name,
        type: optimized.type,
        blob: new Blob([bytes as BlobPart], { type: optimized.type }),
      },
      opts
    );
  }

  return uploadBinaryWithProgress(
    host,
    {
      name: file.name,
      type: file.type || 'application/octet-stream',
      blob: file,
    },
    opts
  );
}

/** Encrypt a file client-side (AES-256-GCM with shared ECDH key) before streaming to server storage. */
export async function uploadEncryptedAttachmentFile(
  host: string,
  file: File,
  myUsername: string,
  peerPublicKeyJson: string,
  maxMbOrOpts: number | UploadProgressOptions = 5
): Promise<MessageAttachment> {
  const opts: UploadProgressOptions =
    typeof maxMbOrOpts === 'number' ? { maxMb: maxMbOrOpts } : maxMbOrOpts;
  const maxMb = opts.maxMb ?? 5;

  let finalName = file.name;
  let finalType = file.type || 'application/octet-stream';
  let rawBytes: Uint8Array;

  if (finalType.startsWith('image/')) {
    const optimized = await compressImageToWebP(file);
    finalName = optimized.name;
    finalType = optimized.type;
    rawBytes = dataUrlToBytes(optimized.dataUrl);
  } else {
    rawBytes = new Uint8Array(await file.arrayBuffer());
  }

  if (rawBytes.byteLength > maxMb * 1024 * 1024) {
    throw new Error(`"${file.name}" çok büyük! Lütfen ${maxMb}MB'dan küçük dosyalar yükleyin.`);
  }

  const encrypted = await encryptBinaryForPeer(rawBytes, myUsername, peerPublicKeyJson);
  if (!encrypted) {
    throw new Error('Dosya Uçtan Uca Şifreleme (E2EE) ile şifrelenemedi.');
  }

  const encBlob = new Blob([encrypted.ciphertext as BlobPart], {
    type: 'application/octet-stream',
  });
  let uploaded: MessageAttachment;
  try {
    uploaded = await uploadBinaryWithProgress(
      host,
      {
        name: `enc-${Date.now()}.bin`,
        type: 'application/octet-stream',
        blob: encBlob,
      },
      opts
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    const dataUrl = `data:application/octet-stream;base64,${bytesToBase64(encrypted.ciphertext)}`;
    uploaded = await uploadDataUrlAttachment(
      host,
      {
        name: `enc-${Date.now()}.bin`,
        type: 'application/octet-stream',
        dataUrl,
      },
      maxMb
    );
  }

  return {
    ...uploaded,
    name: finalName,
    size: rawBytes.byteLength,
    type: 'application/octet-stream',
    e2ee: {
      iv: encrypted.ivBase64,
      origName: finalName,
      origType: finalType,
      origSize: rawBytes.byteLength,
      v: 1,
    },
  };
}

/** Encrypt a file client-side with a Group DM Sender Key (AES-256-GCM) and stream binary bytes. */
export async function uploadGroupEncryptedAttachmentFile(
  host: string,
  file: File,
  _groupId: string,
  epoch: number,
  groupKey: CryptoKey,
  maxMbOrOpts: number | UploadProgressOptions = 5
): Promise<MessageAttachment> {
  const opts: UploadProgressOptions =
    typeof maxMbOrOpts === 'number' ? { maxMb: maxMbOrOpts } : maxMbOrOpts;
  const maxMb = opts.maxMb ?? 5;

  let finalName = file.name;
  let finalType = file.type || 'application/octet-stream';
  let rawBytes: Uint8Array;

  if (finalType.startsWith('image/') && !finalType.includes('gif') && !finalType.includes('svg')) {
    const optimized = await compressImageToWebP(file);
    finalName = optimized.name;
    finalType = optimized.type;
    rawBytes = dataUrlToBytes(optimized.dataUrl);
  } else {
    rawBytes = new Uint8Array(await file.arrayBuffer());
  }

  if (rawBytes.byteLength > maxMb * 1024 * 1024) {
    throw new Error(`"${file.name}" çok büyük! Lütfen ${maxMb}MB'dan küçük dosyalar yükleyin.`);
  }

  const encrypted = await encryptGroupAttachmentBytes(rawBytes, groupKey);
  if (!encrypted) {
    throw new Error('Dosya Grup E2EE anahtarı ile şifrelenemedi.');
  }

  const encBlob = new Blob([encrypted.ciphertext as BlobPart], {
    type: 'application/octet-stream',
  });
  let uploaded: MessageAttachment;
  try {
    uploaded = await uploadBinaryWithProgress(
      host,
      {
        name: 'encrypted-group-attachment.bin',
        type: 'application/octet-stream',
        blob: encBlob,
      },
      opts
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    const dataUrl = `data:application/octet-stream;base64,${bytesToBase64(encrypted.ciphertext)}`;
    uploaded = await uploadDataUrlAttachment(
      host,
      {
        name: 'encrypted-group-attachment.bin',
        type: 'application/octet-stream',
        dataUrl,
      },
      maxMb
    );
  }

  return {
    ...uploaded,
    name: finalName,
    size: rawBytes.byteLength,
    type: 'application/octet-stream',
    groupE2ee: {
      epoch,
      ivBase64: encrypted.ivBase64,
      origName: finalName,
      origType: finalType,
      origSize: rawBytes.byteLength,
    },
  };
}
