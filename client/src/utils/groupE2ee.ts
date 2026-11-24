// Group DM End-to-End Encryption (Sender Keys v1 + Epoch Rotation)
// Symmetric AES-256-GCM group sender keys kept strictly in memory and wrapped per-member
// via existing pairwise ECDH P-256 keys (`encryptBinaryForPeer` / `decryptBinaryFromPeer`).

import type { GroupE2eeKeyEnvelope } from '../types';
import { decryptBinaryFromPeer, encryptBinaryForPeer } from './e2ee';

const GE2EE_REGEX = /^\[GE2EE:v1:(\d+)\]([^:]+):(.+)$/;

const groupKeyMemoryCache = new Map<string, CryptoKey>();

function getSubtle(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function isGroupE2eeCiphertext(content: string): boolean {
  return typeof content === 'string' && content.startsWith('[GE2EE:v1:');
}

export function parseGroupE2eeHeader(
  content: string
): { epoch: number; ivB64: string; cipherB64: string } | null {
  if (typeof content !== 'string') return null;
  const m = content.match(GE2EE_REGEX);
  if (!m) return null;
  const epoch = Number(m[1]);
  if (!Number.isInteger(epoch) || epoch < 1) return null;
  return { epoch, ivB64: m[2], cipherB64: m[3] };
}

export function cacheGroupSenderKey(groupId: string, epoch: number, key: CryptoKey): void {
  groupKeyMemoryCache.set(`${groupId}:${epoch}`, key);
}

export function getCachedGroupSenderKey(groupId: string, epoch: number): CryptoKey | null {
  return groupKeyMemoryCache.get(`${groupId}:${epoch}`) ?? null;
}

export function clearGroupSenderKeys(): void {
  groupKeyMemoryCache.clear();
}

export async function generateGroupSenderKey(): Promise<{ key: CryptoKey; rawBytes: Uint8Array } | null> {
  const subtle = getSubtle();
  if (!subtle) return null;
  try {
    const rawBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const key = await subtle.importKey(
      'raw',
      rawBytes as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return { key, rawBytes };
  } catch {
    return null;
  }
}

export async function wrapGroupKeyForMembers(
  rawKeyBytes: Uint8Array,
  myUsername: string,
  recipients: Array<{ username: string; publicKeyJson: string }>
): Promise<Array<{ targetUsername: string; wrappedKeyBase64: string; ivBase64: string }>> {
  const envelopes: Array<{ targetUsername: string; wrappedKeyBase64: string; ivBase64: string }> = [];
  const seen = new Set<string>();

  for (const r of recipients) {
    const uname = String(r.username || '').trim();
    const lower = uname.toLowerCase();
    if (!uname || !r.publicKeyJson || seen.has(lower)) continue;
    seen.add(lower);

    const wrapped = await encryptBinaryForPeer(rawKeyBytes, myUsername, r.publicKeyJson);
    if (!wrapped) continue;
    envelopes.push({
      targetUsername: uname,
      wrappedKeyBase64: bytesToBase64(wrapped.ciphertext),
      ivBase64: wrapped.ivBase64,
    });
  }

  return envelopes;
}

export async function unwrapGroupKeyEnvelope(
  envelope: GroupE2eeKeyEnvelope,
  myUsername: string,
  senderPublicKeyJson: string
): Promise<CryptoKey | null> {
  const subtle = getSubtle();
  if (!subtle || !envelope?.wrappedKeyBase64 || !envelope?.ivBase64 || !senderPublicKeyJson) return null;
  try {
    const wrappedBytes = base64ToBytes(envelope.wrappedKeyBase64);
    const plainBuf = await decryptBinaryFromPeer(wrappedBytes, envelope.ivBase64, myUsername, senderPublicKeyJson);
    if (!plainBuf || plainBuf.byteLength !== 32) return null;
    return await subtle.importKey(
      'raw',
      plainBuf,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

export async function encryptGroupDmMessage(
  plaintext: string,
  epoch: number,
  key: CryptoKey
): Promise<string | null> {
  const subtle = getSubtle();
  if (!subtle) return null;
  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return `[GE2EE:v1:${epoch}]${bytesToBase64(iv)}:${bytesToBase64(cipherBuf)}`;
  } catch {
    return null;
  }
}

export async function decryptGroupDmMessage(ciphertext: string, key: CryptoKey): Promise<string | null> {
  const subtle = getSubtle();
  const parsed = parseGroupE2eeHeader(ciphertext);
  if (!subtle || !parsed) return null;
  try {
    const iv = base64ToBytes(parsed.ivB64);
    const data = base64ToBytes(parsed.cipherB64);
    const plainBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

/** Encrypt binary attachment bytes with the active Group DM AES-256-GCM Sender Key. */
export async function encryptGroupAttachmentBytes(
  plainBytes: Uint8Array | ArrayBuffer,
  groupKey: CryptoKey
): Promise<{ ciphertext: Uint8Array; ivBase64: string } | null> {
  const subtle = getSubtle();
  if (!subtle) return null;
  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const input = plainBytes instanceof Uint8Array ? plainBytes : new Uint8Array(plainBytes);
    const cipherBuf = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      groupKey,
      input as BufferSource
    );
    return {
      ciphertext: new Uint8Array(cipherBuf),
      ivBase64: bytesToBase64(iv),
    };
  } catch {
    return null;
  }
}

/** Decrypt binary attachment bytes using a Group DM AES-256-GCM Sender Key. */
export async function decryptGroupAttachmentBytes(
  cipherBytes: Uint8Array | ArrayBuffer,
  ivBase64: string,
  groupKey: CryptoKey
): Promise<ArrayBuffer | null> {
  const subtle = getSubtle();
  if (!subtle || !ivBase64) return null;
  try {
    const iv = base64ToBytes(ivBase64);
    const input = cipherBytes instanceof Uint8Array ? cipherBytes : new Uint8Array(cipherBytes);
    return await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      groupKey,
      input as BufferSource
    );
  } catch {
    return null;
  }
}
