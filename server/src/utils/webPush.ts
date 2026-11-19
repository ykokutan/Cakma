import crypto from 'crypto';

export interface VapidKeys {
  publicKey: string; // Uncompressed P-256 point (65 bytes) encoded as base64url
  privateKeyPem: string; // PKCS#8 PEM EC P-256 private key
  subject: string; // mailto:... or https://...
}

export interface BrowserPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function pad32(buf: Buffer): Buffer {
  if (buf.length === 32) return buf;
  if (buf.length > 32) return buf.subarray(buf.length - 32);
  return Buffer.concat([Buffer.alloc(32 - buf.length), buf]);
}

function toBase64UrlBuffer(input: string): Buffer {
  const norm = String(input || '').trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return Buffer.from(norm, 'base64url');
}

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function generateVapidKeyPair(subject = 'mailto:admin@ses.yahyakemalokutan.com'): VapidKeys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string; y?: string };
  if (!jwk.x || !jwk.y) {
    throw new Error('Failed to export P-256 JWK coordinates');
  }
  const rawPub = Buffer.concat([
    Buffer.from([0x04]),
    pad32(Buffer.from(jwk.x, 'base64url')),
    pad32(Buffer.from(jwk.y, 'base64url')),
  ]);
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    publicKey: rawPub.toString('base64url'),
    privateKeyPem,
    subject,
  };
}

export function createVapidAuthHeader(
  endpoint: string,
  keys: VapidKeys,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): string {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const headerB64 = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf-8').toString('base64url');
  const claimsB64 = Buffer.from(
    JSON.stringify({
      aud: audience,
      exp: nowEpochSeconds + 12 * 3600,
      sub: keys.subject,
    }),
    'utf-8'
  ).toString('base64url');

  const signingInput = `${headerB64}.${claimsB64}`;
  const sig = crypto
    .sign('sha256', Buffer.from(signingInput, 'utf-8'), {
      key: keys.privateKeyPem,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');

  return `vapid t=${signingInput}.${sig}, k=${keys.publicKey}`;
}

/**
 * Encrypts a Web Push payload according to RFC 8291 + RFC 8188 (`aes128gcm`).
 */
export function encryptWebPushPayload(
  subscription: Pick<BrowserPushSubscription, 'keys'>,
  payload: string | Record<string, unknown>
): Buffer {
  const uaPublic = toBase64UrlBuffer(subscription.keys?.p256dh);
  const authSecret = toBase64UrlBuffer(subscription.keys?.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('Invalid p256dh subscriber public key');
  }
  if (authSecret.length !== 16) {
    throw new Error('Invalid auth subscriber secret');
  }

  const plaintext =
    typeof payload === 'string'
      ? Buffer.from(payload, 'utf-8')
      : Buffer.from(JSON.stringify(payload), 'utf-8');

  const ephemeral = crypto.createECDH('prime256v1');
  ephemeral.generateKeys();
  const asPublic = ephemeral.getPublicKey(undefined, 'uncompressed');
  const sharedSecret = ephemeral.computeSecret(uaPublic);

  // RFC 8291 key schedule
  const prkKey = hmacSha256(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf-8'), uaPublic, asPublic]);
  const ikm = hmacSha256(prkKey, Buffer.concat([keyInfo, Buffer.from([0x01])]));

  const salt = crypto.randomBytes(16);
  const prk = hmacSha256(salt, ikm);

  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'utf-8');
  const cek = hmacSha256(prk, Buffer.concat([cekInfo, Buffer.from([0x01])])).subarray(0, 16);

  const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'utf-8');
  const nonce = hmacSha256(prk, Buffer.concat([nonceInfo, Buffer.from([0x01])])).subarray(0, 12);

  // RFC 8188 final record padding delimiter = 0x02
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const header = Buffer.alloc(21 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, ciphertext, authTag]);
}

export async function sendWebPush(
  subscription: BrowserPushSubscription,
  payload: string | Record<string, unknown>,
  keys: VapidKeys
): Promise<{ ok: boolean; status: number; gone: boolean; error?: string }> {
  try {
    const endpoint = String(subscription?.endpoint || '').trim();
    if (!endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return { ok: false, status: 400, gone: false, error: 'Incomplete push subscription' };
    }
    const parsedUrl = new URL(endpoint);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return { ok: false, status: 400, gone: false, error: 'Unsupported push endpoint protocol' };
    }

    const authorization = createVapidAuthHeader(endpoint, keys);
    const body = encryptWebPushPayload(subscription, payload);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '60',
        Urgency: 'high',
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(5000),
    });

    const gone = resp.status === 404 || resp.status === 410;
    return {
      ok: resp.ok,
      status: resp.status,
      gone,
      error: resp.ok ? undefined : `Push service HTTP ${resp.status}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      gone: false,
      error: err?.message || 'Push network error',
    };
  }
}
