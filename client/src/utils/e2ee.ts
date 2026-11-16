// End-to-End Encryption (ECDH P-256 + AES-GCM) for Direct Messages
// Private key never leaves the browser/app; only the public JWK is shared via server.

const E2EE_PREFIX = '[E2EE:v1]';

interface StoredKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isE2eeCiphertext(content: string): boolean {
  return typeof content === 'string' && content.startsWith(E2EE_PREFIX);
}

export async function getOrCreateE2eeKeyPair(username: string): Promise<StoredKeyPair | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle || !username) return null;
  const storageKey = `dc_e2ee_keypair_${username.toLowerCase()}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredKeyPair;
      if (parsed?.publicKeyJwk && parsed?.privateKeyJwk) {
        return parsed;
      }
    }
    const pair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', pair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', pair.privateKey);
    const stored: StoredKeyPair = { publicKeyJwk, privateKeyJwk };
    localStorage.setItem(storageKey, JSON.stringify(stored));
    return stored;
  } catch {
    return null;
  }
}

async function deriveSharedAesKey(
  myPrivateKeyJwk: JsonWebKey,
  peerPublicKeyJson: string
): Promise<CryptoKey | null> {
  if (!window.crypto?.subtle) return null;
  try {
    const peerJwk = JSON.parse(peerPublicKeyJson) as JsonWebKey;
    const privKey = await window.crypto.subtle.importKey(
      'jwk',
      myPrivateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey']
    );
    const pubKey = await window.crypto.subtle.importKey(
      'jwk',
      peerJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    return await window.crypto.subtle.deriveKey(
      { name: 'ECDH', public: pubKey },
      privKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

export async function encryptDmMessage(
  plaintext: string,
  myUsername: string,
  peerPublicKeyJson: string
): Promise<string | null> {
  const pair = await getOrCreateE2eeKeyPair(myUsername);
  if (!pair) return null;
  const aesKey = await deriveSharedAesKey(pair.privateKeyJwk, peerPublicKeyJson);
  if (!aesKey) return null;
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoded
    );
    return `${E2EE_PREFIX}${bufToBase64(iv)}:${bufToBase64(cipherBuf)}`;
  } catch {
    return null;
  }
}

export async function decryptDmMessage(
  ciphertext: string,
  myUsername: string,
  peerPublicKeyJson: string
): Promise<string | null> {
  if (!isE2eeCiphertext(ciphertext)) return null;
  const body = ciphertext.slice(E2EE_PREFIX.length);
  const sepIdx = body.indexOf(':');
  if (sepIdx <= 0) return null;
  const ivB64 = body.slice(0, sepIdx);
  const dataB64 = body.slice(sepIdx + 1);

  const pair = await getOrCreateE2eeKeyPair(myUsername);
  if (!pair) return null;
  const aesKey = await deriveSharedAesKey(pair.privateKeyJwk, peerPublicKeyJson);
  if (!aesKey) return null;
  try {
    const iv = base64ToBuf(ivB64);
    const data = base64ToBuf(dataB64);
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      data as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}
