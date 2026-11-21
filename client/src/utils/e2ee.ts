// End-to-End Encryption v2 (ECDH P-256 + AES-256-GCM) for Direct Messages
// Private keys are stored as WebCrypto CryptoKey handles inside IndexedDB (`cakma_e2ee_v2`),
// never persisted as plaintext JWK in localStorage. Supports symmetric SHA-256 Safety Numbers
// and PBKDF2 + AES-GCM encrypted key backups for multi-device recovery.

const E2EE_PREFIX = '[E2EE:v1]';
const IDB_NAME = 'cakma_e2ee_v2';
const IDB_STORE = 'keypairs';
const LEGACY_LOCALSTORAGE_PREFIX = 'dc_e2ee_keypair_';
const BACKUP_FORMAT = 'cakma-e2ee-backup-v2';
const PBKDF2_ITERATIONS = 200_000;

interface LegacyStoredKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

export interface StoredE2eeKeyRecord {
  username: string;
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
  createdAt: string;
}

export interface SafetyNumberInfo {
  formatted: string;
  blocks: string[];
  shortTag: string;
}

const memoryKeyStore = new Map<string, StoredE2eeKeyRecord>();

function getWebCrypto(): SubtleCrypto | null {
  const c = globalThis.crypto;
  return c?.subtle ?? null;
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

function normalizeEcPublicKeyInput(input: JsonWebKey | string): JsonWebKey | null {
  try {
    const parsed = (typeof input === 'string' ? JSON.parse(input) : input) as JsonWebKey | null;
    if (!parsed || typeof parsed.x !== 'string' || typeof parsed.y !== 'string') return null;
    return {
      kty: parsed.kty || 'EC',
      crv: parsed.crv || 'P-256',
      x: parsed.x,
      y: parsed.y,
      ext: true,
    };
  } catch {
    return null;
  }
}

function openKeyDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'username' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetRecord(usernameLower: string): Promise<StoredE2eeKeyRecord | null> {
  const memHit = memoryKeyStore.get(usernameLower);
  if (memHit) return memHit;

  const db = await openKeyDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(usernameLower);
      req.onsuccess = () => {
        const val = req.result as StoredE2eeKeyRecord | undefined;
        try {
          db.close();
        } catch {}
        if (val?.publicKeyJwk && val?.privateKey) {
          memoryKeyStore.set(usernameLower, val);
          resolve(val);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        try {
          db.close();
        } catch {}
        resolve(null);
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve(null);
    }
  });
}

async function idbPutRecord(record: StoredE2eeKeyRecord): Promise<void> {
  memoryKeyStore.set(record.username, record);
  const db = await openKeyDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(record);
      req.onsuccess = () => {
        try {
          db.close();
        } catch {}
        resolve();
      };
      req.onerror = () => {
        try {
          db.close();
        } catch {}
        resolve();
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve();
    }
  });
}

export async function clearMemoryE2eeCache(): Promise<void> {
  memoryKeyStore.clear();
}

export function isE2eeCiphertext(content: string): boolean {
  return typeof content === 'string' && content.startsWith(E2EE_PREFIX);
}

export async function getOrCreateE2eeKeyPair(username: string): Promise<StoredE2eeKeyRecord | null> {
  const subtle = getWebCrypto();
  if (!subtle || !username) return null;
  const usernameLower = username.trim().toLowerCase();
  if (!usernameLower) return null;

  try {
    const existing = await idbGetRecord(usernameLower);
    if (existing) {
      return existing;
    }

    // One-time seamless migration from legacy v1 localStorage plaintext keypair
    if (typeof localStorage !== 'undefined') {
      const legacyKey = `${LEGACY_LOCALSTORAGE_PREFIX}${usernameLower}`;
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as LegacyStoredKeyPair;
          if (parsed?.publicKeyJwk && parsed?.privateKeyJwk) {
            const importedPriv = await subtle.importKey(
              'jwk',
              parsed.privateKeyJwk,
              { name: 'ECDH', namedCurve: 'P-256' },
              true,
              ['deriveKey']
            );
            const migrated: StoredE2eeKeyRecord = {
              username: usernameLower,
              publicKeyJwk: parsed.publicKeyJwk,
              privateKey: importedPriv,
              createdAt: new Date().toISOString(),
            };
            await idbPutRecord(migrated);
            try {
              localStorage.removeItem(legacyKey);
            } catch {}
            return migrated;
          }
        } catch {
          // Malformed legacy entry; fall through to fresh generation
        }
      }
    }

    const pair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    const publicKeyJwk = await subtle.exportKey('jwk', pair.publicKey);
    const fresh: StoredE2eeKeyRecord = {
      username: usernameLower,
      publicKeyJwk,
      privateKey: pair.privateKey,
      createdAt: new Date().toISOString(),
    };
    await idbPutRecord(fresh);
    return fresh;
  } catch {
    return null;
  }
}

async function deriveSharedAesKey(
  myPrivateKey: CryptoKey,
  peerPublicKeyJson: string
): Promise<CryptoKey | null> {
  const subtle = getWebCrypto();
  if (!subtle) return null;
  try {
    const peerJwk = normalizeEcPublicKeyInput(peerPublicKeyJson);
    if (!peerJwk) return null;
    const pubKey = await subtle.importKey(
      'jwk',
      peerJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    return await subtle.deriveKey(
      { name: 'ECDH', public: pubKey },
      myPrivateKey,
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
  const subtle = getWebCrypto();
  if (!subtle) return null;
  const pair = await getOrCreateE2eeKeyPair(myUsername);
  if (!pair) return null;
  const aesKey = await deriveSharedAesKey(pair.privateKey, peerPublicKeyJson);
  if (!aesKey) return null;
  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await subtle.encrypt(
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
  const subtle = getWebCrypto();
  if (!subtle || !isE2eeCiphertext(ciphertext)) return null;
  const body = ciphertext.slice(E2EE_PREFIX.length);
  const sepIdx = body.indexOf(':');
  if (sepIdx <= 0) return null;
  const ivB64 = body.slice(0, sepIdx);
  const dataB64 = body.slice(sepIdx + 1);

  const pair = await getOrCreateE2eeKeyPair(myUsername);
  if (!pair) return null;
  const aesKey = await deriveSharedAesKey(pair.privateKey, peerPublicKeyJson);
  if (!aesKey) return null;
  try {
    const iv = base64ToBuf(ivB64);
    const data = base64ToBuf(dataB64);
    const plainBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      data as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

/**
 * Computes a symmetric, deterministic 60-digit Safety Number (12 groups of 5 digits)
 * from two ECDH P-256 public keys so both DM participants verify identical fingerprints.
 */
export async function computeSafetyNumber(
  myPublicKey: JsonWebKey | string,
  peerPublicKey: JsonWebKey | string
): Promise<SafetyNumberInfo | null> {
  const subtle = getWebCrypto();
  if (!subtle) return null;
  const jwkA = normalizeEcPublicKeyInput(myPublicKey);
  const jwkB = normalizeEcPublicKeyInput(peerPublicKey);
  if (!jwkA || !jwkB) return null;

  const canonical = [
    `${jwkA.crv}:${jwkA.x}:${jwkA.y}`,
    `${jwkB.crv}:${jwkB.x}:${jwkB.y}`,
  ].sort();

  const encoder = new TextEncoder();
  const baseBytes = encoder.encode(`cakma-e2ee-safety-v2|${canonical[0]}|${canonical[1]}`);
  const digest1 = new Uint8Array(await subtle.digest('SHA-256', baseBytes));
  const digest2 = new Uint8Array(await subtle.digest('SHA-256', digest1));
  const combined = new Uint8Array(64);
  combined.set(digest1, 0);
  combined.set(digest2, 32);

  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const off = i * 4;
    const val =
      ((combined[off] << 24) |
        (combined[off + 1] << 16) |
        (combined[off + 2] << 8) |
        combined[off + 3]) >>>
      0;
    blocks.push(String(val % 100000).padStart(5, '0'));
  }

  const shortTag = Array.from(digest1.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  return {
    formatted: blocks.join(' '),
    blocks,
    shortTag,
  };
}

async function deriveBackupAesKey(
  passphrase: string,
  salt: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const subtle = getWebCrypto();
  if (!subtle) throw new Error('WebCrypto API kullanılamıyor.');
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

export async function exportEncryptedE2eeBackup(
  username: string,
  passphrase: string
): Promise<{ ok: true; backupJson: string } | { ok: false; error: string }> {
  const subtle = getWebCrypto();
  if (!subtle) return { ok: false, error: 'Tarayıcı WebCrypto desteği yok.' };
  const cleanPass = passphrase.trim();
  if (cleanPass.length < 6) {
    return { ok: false, error: 'Yedek parolası en az 6 karakter olmalıdır.' };
  }
  const record = await getOrCreateE2eeKeyPair(username);
  if (!record) return { ok: false, error: 'E2EE anahtar çifti bulunamadı.' };

  try {
    const privateKeyJwk = await subtle.exportKey('jwk', record.privateKey);
    const payloadJson = JSON.stringify({
      username: record.username,
      publicKeyJwk: record.publicKeyJwk,
      privateKeyJwk,
      exportedAt: new Date().toISOString(),
    });

    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await deriveBackupAesKey(cleanPass, salt, ['encrypt']);
    const cipherBuf = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrapKey,
      new TextEncoder().encode(payloadJson)
    );

    return {
      ok: true,
      backupJson: JSON.stringify(
        {
          format: BACKUP_FORMAT,
          kdf: 'PBKDF2-SHA256',
          iterations: PBKDF2_ITERATIONS,
          salt: bufToBase64(salt),
          iv: bufToBase64(iv),
          ciphertext: bufToBase64(cipherBuf),
        },
        null,
        2
      ),
    };
  } catch {
    return { ok: false, error: 'Anahtar bu cihazda dışa aktarıma kilitli veya yedeklenemedi.' };
  }
}

export async function importEncryptedE2eeBackup(
  username: string,
  backupJson: string,
  passphrase: string,
  options?: { lockNonExtractable?: boolean }
): Promise<{ ok: true; publicKeyJwk: JsonWebKey } | { ok: false; error: string }> {
  const subtle = getWebCrypto();
  if (!subtle) return { ok: false, error: 'Tarayıcı WebCrypto desteği yok.' };
  const usernameLower = username.trim().toLowerCase();
  if (!usernameLower) return { ok: false, error: 'Geçerli bir kullanıcı adı gerekli.' };
  if (!passphrase.trim()) return { ok: false, error: 'Lütfen yedek parolanızı girin.' };

  try {
    const envelope = JSON.parse(backupJson) as {
      format?: string;
      salt?: string;
      iv?: string;
      ciphertext?: string;
    };
    if (envelope?.format !== BACKUP_FORMAT || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
      return { ok: false, error: 'Geçersiz veya tanınmayan E2EE yedek dosyası.' };
    }

    const salt = base64ToBuf(envelope.salt);
    const iv = base64ToBuf(envelope.iv);
    const cipher = base64ToBuf(envelope.ciphertext);
    const wrapKey = await deriveBackupAesKey(passphrase.trim(), salt, ['decrypt']);

    const plainBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      wrapKey,
      cipher as BufferSource
    );
    const inner = JSON.parse(new TextDecoder().decode(plainBuf)) as LegacyStoredKeyPair & { username?: string };
    if (!inner?.publicKeyJwk || !inner?.privateKeyJwk) {
      return { ok: false, error: 'Yedek içeriği bozuk.' };
    }

    const extractable = !options?.lockNonExtractable;
    const importedPriv = await subtle.importKey(
      'jwk',
      inner.privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      extractable,
      ['deriveKey']
    );

    const record: StoredE2eeKeyRecord = {
      username: usernameLower,
      publicKeyJwk: inner.publicKeyJwk,
      privateKey: importedPriv,
      createdAt: new Date().toISOString(),
    };
    await idbPutRecord(record);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${LEGACY_LOCALSTORAGE_PREFIX}${usernameLower}`);
      }
    } catch {}
    return { ok: true, publicKeyJwk: inner.publicKeyJwk };
  } catch {
    return { ok: false, error: 'Yedek parolası hatalı veya dosya bozuk.' };
  }
}
