const MAGIC_0 = 0xca;
const MAGIC_1 = 0xfe;
const CLEAR_HEADER_BYTES = 4;
const IV_BYTES = 12;

export function supportsVoiceMediaE2ee(): boolean {
  return typeof globalThis.crypto !== 'undefined' && Boolean(globalThis.crypto.subtle);
}

export function supportsInsertableStreams(): boolean {
  if (typeof window === 'undefined') return false;
  const senderProto = (window as unknown as { RTCRtpSender?: { prototype?: object } }).RTCRtpSender?.prototype;
  const hasCreateEncoded = Boolean(senderProto && 'createEncodedStreams' in senderProto);
  const hasScriptTransform = typeof (window as unknown as { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform !== 'undefined';
  return hasCreateEncoded || hasScriptTransform;
}

export async function deriveVoiceE2eeKey(passphrase: string, channelId: string): Promise<CryptoKey> {
  const cleanPass = String(passphrase || '').trim();
  if (!cleanPass) {
    throw new Error('Voice E2EE passphrase cannot be empty');
  }
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(cleanPass),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const salt = enc.encode(`cakma-voice-e2ee-v1:${channelId || 'default'}`);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function computeVoiceE2eeFingerprint(passphrase: string, channelId: string): Promise<string> {
  const cleanPass = String(passphrase || '').trim();
  if (!cleanPass || !supportsVoiceMediaE2ee()) return '0000-0000';
  const enc = new TextEncoder();
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    enc.encode(`cakma-sas-v1:${channelId}:${cleanPass}`)
  );
  const bytes = new Uint8Array(digest);
  const hex = Array.from(bytes.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export async function encryptMediaFrame(
  frameData: ArrayBuffer,
  key: CryptoKey,
  ivSeed?: Uint8Array
): Promise<ArrayBuffer> {
  const src = new Uint8Array(frameData);
  const clearLen = Math.min(CLEAR_HEADER_BYTES, src.byteLength);
  const header = src.slice(0, clearLen);
  const body = src.slice(clearLen);

  const iv = new Uint8Array(IV_BYTES);
  if (ivSeed && ivSeed.byteLength === IV_BYTES) {
    iv.set(ivSeed);
  } else {
    globalThis.crypto.getRandomValues(iv);
  }

  const cipherBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    body
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(clearLen + cipher.byteLength + IV_BYTES + 2);
  out.set(header, 0);
  out.set(cipher, clearLen);
  out.set(iv, clearLen + cipher.byteLength);
  out[out.byteLength - 2] = MAGIC_0;
  out[out.byteLength - 1] = MAGIC_1;
  return out.buffer;
}

export async function decryptMediaFrame(
  encryptedData: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer | null> {
  const src = new Uint8Array(encryptedData);
  if (src.byteLength < CLEAR_HEADER_BYTES + IV_BYTES + 2) {
    return null;
  }
  if (src[src.byteLength - 2] !== MAGIC_0 || src[src.byteLength - 1] !== MAGIC_1) {
    return null;
  }

  const clearLen = Math.min(CLEAR_HEADER_BYTES, src.byteLength - IV_BYTES - 2);
  const header = src.slice(0, clearLen);
  const ivStart = src.byteLength - IV_BYTES - 2;
  const iv = src.slice(ivStart, src.byteLength - 2);
  const cipher = src.slice(clearLen, ivStart);

  try {
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipher
    );
    const plain = new Uint8Array(plainBuf);
    const out = new Uint8Array(clearLen + plain.byteLength);
    out.set(header, 0);
    out.set(plain, clearLen);
    return out.buffer;
  } catch {
    return null;
  }
}

interface EncodedFrameLike {
  data: ArrayBuffer;
}

interface EncodedStreamsCapable {
  createEncodedStreams?: () => {
    readable: ReadableStream<EncodedFrameLike>;
    writable: WritableStream<EncodedFrameLike>;
  };
}

export function attachSenderE2eeTransform(sender: RTCRtpSender, key: CryptoKey): boolean {
  const capable = sender as unknown as EncodedStreamsCapable;
  if (typeof capable.createEncodedStreams !== 'function') return false;
  try {
    const { readable, writable } = capable.createEncodedStreams();
    const transform = new TransformStream<EncodedFrameLike, EncodedFrameLike>({
      async transform(frame, controller) {
        try {
          frame.data = await encryptMediaFrame(frame.data, key);
        } catch {
          // Drop corrupted frame rather than leaking plaintext on transform error
          return;
        }
        controller.enqueue(frame);
      },
    });
    void readable.pipeThrough(transform).pipeTo(writable).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function attachReceiverE2eeTransform(receiver: RTCRtpReceiver, key: CryptoKey): boolean {
  const capable = receiver as unknown as EncodedStreamsCapable;
  if (typeof capable.createEncodedStreams !== 'function') return false;
  try {
    const { readable, writable } = capable.createEncodedStreams();
    const transform = new TransformStream<EncodedFrameLike, EncodedFrameLike>({
      async transform(frame, controller) {
        const plain = await decryptMediaFrame(frame.data, key);
        if (!plain) return;
        frame.data = plain;
        controller.enqueue(frame);
      },
    });
    void readable.pipeThrough(transform).pipeTo(writable).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
