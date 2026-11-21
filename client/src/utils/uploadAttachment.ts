import type { MessageAttachment } from '../types';
import { authFetch } from './authFetch';
import { compressImageToWebP } from './imageCompress';
import { encryptBinaryForPeer } from './e2ee';

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

/** Encrypt a file client-side (AES-256-GCM with shared ECDH key) before uploading to server storage. */
export async function uploadEncryptedAttachmentFile(
  host: string,
  file: File,
  myUsername: string,
  peerPublicKeyJson: string,
  maxMb = 5
): Promise<MessageAttachment> {
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

  const dataUrl = `data:application/octet-stream;base64,${bytesToBase64(encrypted.ciphertext)}`;
  const uploaded = await uploadDataUrlAttachment(
    host,
    {
      name: `enc-${Date.now()}.bin`,
      type: 'application/octet-stream',
      dataUrl,
    },
    maxMb
  );

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
