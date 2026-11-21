import crypto from 'crypto';

const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex');

export function base64UrlEncode(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

export function base64UrlDecode(str: string): Buffer {
  return Buffer.from(String(str || '').trim(), 'base64url');
}

function readUintLen(buf: Buffer, offset: number, additionalInfo: number): { len: number; nextOffset: number } {
  if (additionalInfo < 24) {
    return { len: additionalInfo, nextOffset: offset };
  }
  if (additionalInfo === 24) {
    if (offset + 1 > buf.length) throw new Error('CBOR_TRUNCATED');
    return { len: buf.readUInt8(offset), nextOffset: offset + 1 };
  }
  if (additionalInfo === 25) {
    if (offset + 2 > buf.length) throw new Error('CBOR_TRUNCATED');
    return { len: buf.readUInt16BE(offset), nextOffset: offset + 2 };
  }
  if (additionalInfo === 26) {
    if (offset + 4 > buf.length) throw new Error('CBOR_TRUNCATED');
    return { len: buf.readUInt32BE(offset), nextOffset: offset + 4 };
  }
  if (additionalInfo === 27) {
    if (offset + 8 > buf.length) throw new Error('CBOR_TRUNCATED');
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR_INT_OVERFLOW');
    return { len: Number(big), nextOffset: offset + 8 };
  }
  throw new Error(`CBOR_UNSUPPORTED_INFO_${additionalInfo}`);
}

/** Minimal deterministic CBOR decoder supporting RFC 8949 core data types used in WebAuthn COSE/Attestation. */
export function decodeCbor(buf: Buffer, startOffset = 0, depth = 0): { value: unknown; offset: number } {
  if (depth > 16) throw new Error('CBOR_MAX_DEPTH');
  if (startOffset >= buf.length) throw new Error('CBOR_EOF');

  const initial = buf.readUInt8(startOffset);
  const major = initial >> 5;
  const info = initial & 0x1f;
  let cursor = startOffset + 1;

  if (major === 0) {
    const { len, nextOffset } = readUintLen(buf, cursor, info);
    return { value: len, offset: nextOffset };
  }
  if (major === 1) {
    const { len, nextOffset } = readUintLen(buf, cursor, info);
    return { value: -1 - len, offset: nextOffset };
  }
  if (major === 2) {
    const { len, nextOffset } = readUintLen(buf, cursor, info);
    if (nextOffset + len > buf.length) throw new Error('CBOR_BYTES_TRUNCATED');
    return { value: buf.subarray(nextOffset, nextOffset + len), offset: nextOffset + len };
  }
  if (major === 3) {
    const { len, nextOffset } = readUintLen(buf, cursor, info);
    if (nextOffset + len > buf.length) throw new Error('CBOR_TEXT_TRUNCATED');
    return { value: buf.subarray(nextOffset, nextOffset + len).toString('utf8'), offset: nextOffset + len };
  }
  if (major === 4) {
    const { len, nextOffset } = readUintLen(buf, cursor, info);
    cursor = nextOffset;
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const item = decodeCbor(buf, cursor, depth + 1);
      arr.push(item.value);
      cursor = item.offset;
    }
    return { value: arr, offset: cursor };
  }
  if (major === 5) {
    const { len, nextOffset } = readUintLen(buf, cursor, info);
    cursor = nextOffset;
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < len; i++) {
      const k = decodeCbor(buf, cursor, depth + 1);
      const v = decodeCbor(buf, k.offset, depth + 1);
      map.set(k.value, v.value);
      cursor = v.offset;
    }
    return { value: map, offset: cursor };
  }
  if (major === 6) {
    // Semantic tag: skip tag number and decode tagged content
    const { nextOffset } = readUintLen(buf, cursor, info);
    return decodeCbor(buf, nextOffset, depth + 1);
  }
  if (major === 7) {
    if (info === 20) return { value: false, offset: cursor };
    if (info === 21) return { value: true, offset: cursor };
    if (info === 22) return { value: null, offset: cursor };
    if (info === 23) return { value: undefined, offset: cursor };
    if (info === 25) return { value: 0, offset: cursor + 2 };
    if (info === 26) return { value: buf.readFloatBE(cursor), offset: cursor + 4 };
    if (info === 27) return { value: buf.readDoubleBE(cursor), offset: cursor + 8 };
  }
  throw new Error(`CBOR_UNSUPPORTED_MAJOR_${major}_${info}`);
}

function encodeCborHeader(major: number, n: number): Buffer {
  const m = (major & 0x07) << 5;
  if (n < 24) return Buffer.from([m | n]);
  if (n <= 0xff) return Buffer.from([m | 24, n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = m | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = m | 26;
  b.writeUInt32BE(n >>> 0, 1);
  return b;
}

/** Minimal CBOR encoder for COSE/WebAuthn maps, buffers, strings, ints, arrays, and booleans. */
export function encodeCbor(val: unknown): Buffer {
  if (typeof val === 'number' && Number.isInteger(val)) {
    if (val >= 0) return encodeCborHeader(0, val);
    return encodeCborHeader(1, -1 - val);
  }
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const buf = Buffer.from(val);
    return Buffer.concat([encodeCborHeader(2, buf.length), buf]);
  }
  if (typeof val === 'string') {
    const buf = Buffer.from(val, 'utf8');
    return Buffer.concat([encodeCborHeader(3, buf.length), buf]);
  }
  if (Array.isArray(val)) {
    return Buffer.concat([encodeCborHeader(4, val.length), ...val.map((item) => encodeCbor(item))]);
  }
  if (val instanceof Map) {
    const parts: Buffer[] = [encodeCborHeader(5, val.size)];
    for (const [k, v] of val.entries()) {
      parts.push(encodeCbor(k), encodeCbor(v));
    }
    return Buffer.concat(parts);
  }
  if (val && typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    const parts: Buffer[] = [encodeCborHeader(5, entries.length)];
    for (const [k, v] of entries) {
      parts.push(encodeCbor(k), encodeCbor(v));
    }
    return Buffer.concat(parts);
  }
  if (val === false) return Buffer.from([0xf4]);
  if (val === true) return Buffer.from([0xf5]);
  if (val === null) return Buffer.from([0xf6]);
  return Buffer.from([0xf7]);
}

/** Convert a COSE EC2 P-256 public key map (ES256 / alg = -7) into X.509 SPKI DER bytes. */
export function coseEc2ToSpkiDer(coseMap: Map<unknown, unknown>): Buffer {
  const kty = coseMap.get(1);
  const alg = coseMap.get(3);
  const crv = coseMap.get(-1);
  const x = coseMap.get(-2);
  const y = coseMap.get(-3);

  if (kty !== 2) throw new Error('WEBAUTHN_UNSUPPORTED_KTY');
  if (alg !== -7) throw new Error('WEBAUTHN_UNSUPPORTED_ALG');
  if (crv !== 1) throw new Error('WEBAUTHN_UNSUPPORTED_CURVE');
  if (!Buffer.isBuffer(x) || x.length !== 32 || !Buffer.isBuffer(y) || y.length !== 32) {
    throw new Error('WEBAUTHN_INVALID_COORDINATES');
  }

  return Buffer.concat([P256_SPKI_PREFIX, x, y]);
}

export interface ParsedAuthenticatorData {
  rpIdHash: Buffer;
  flags: number;
  userPresent: boolean;
  userVerified: boolean;
  attestedCredentialData: boolean;
  signCount: number;
  credentialId?: Buffer;
  credentialPublicKeyMap?: Map<unknown, unknown>;
}

export function parseAuthenticatorData(authData: Buffer): ParsedAuthenticatorData {
  if (!Buffer.isBuffer(authData) || authData.length < 37) {
    throw new Error('WEBAUTHN_AUTH_DATA_TOO_SHORT');
  }
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData.readUInt8(32);
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const attestedCredentialData = (flags & 0x40) !== 0;
  const signCount = authData.readUInt32BE(33);

  if (!attestedCredentialData) {
    return { rpIdHash, flags, userPresent, userVerified, attestedCredentialData, signCount };
  }

  if (authData.length < 55) {
    throw new Error('WEBAUTHN_ATTESTED_CRED_TRUNCATED');
  }
  // 37..53: AAGUID (16 bytes)
  const credIdLen = authData.readUInt16BE(53);
  const credStart = 55;
  const credEnd = credStart + credIdLen;
  if (credIdLen === 0 || credEnd > authData.length) {
    throw new Error('WEBAUTHN_CRED_ID_INVALID');
  }
  const credentialId = authData.subarray(credStart, credEnd);
  const { value: pubKeyVal } = decodeCbor(authData, credEnd);
  if (!(pubKeyVal instanceof Map)) {
    throw new Error('WEBAUTHN_COSE_KEY_NOT_MAP');
  }

  return {
    rpIdHash,
    flags,
    userPresent,
    userVerified,
    attestedCredentialData,
    signCount,
    credentialId,
    credentialPublicKeyMap: pubKeyVal,
  };
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function assertClientData(
  clientDataBytes: Buffer,
  expectedType: 'webauthn.create' | 'webauthn.get',
  expectedChallenge: string,
  expectedOrigins: string[],
  expectedRpId: string
): void {
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(clientDataBytes.toString('utf8'));
  } catch {
    throw new Error('WEBAUTHN_INVALID_CLIENT_DATA_JSON');
  }

  if (clientData.type !== expectedType) {
    throw new Error('WEBAUTHN_CLIENT_DATA_TYPE_MISMATCH');
  }
  if (!clientData.challenge || !timingSafeStrEqual(clientData.challenge, expectedChallenge)) {
    throw new Error('WEBAUTHN_CHALLENGE_MISMATCH');
  }
  if (!clientData.origin) {
    throw new Error('WEBAUTHN_MISSING_ORIGIN');
  }

  const originAllowed =
    expectedOrigins.includes(clientData.origin) ||
    (() => {
      try {
        return new URL(clientData.origin).hostname.toLowerCase() === expectedRpId.toLowerCase();
      } catch {
        return false;
      }
    })();

  if (!originAllowed) {
    throw new Error('WEBAUTHN_ORIGIN_MISMATCH');
  }
}

export interface VerifyRegistrationInput {
  attestationObjectB64Url: string;
  clientDataJSONB64Url: string;
  expectedChallenge: string;
  expectedRpId: string;
  expectedOrigins: string[];
}

export interface VerifiedRegistrationResult {
  credentialId: string;
  publicKeySpkiBase64: string;
  counter: number;
}

export function verifyPasskeyRegistration(input: VerifyRegistrationInput): VerifiedRegistrationResult {
  const clientDataBytes = base64UrlDecode(input.clientDataJSONB64Url);
  assertClientData(
    clientDataBytes,
    'webauthn.create',
    input.expectedChallenge,
    input.expectedOrigins,
    input.expectedRpId
  );

  const attestationBytes = base64UrlDecode(input.attestationObjectB64Url);
  const { value: attObj } = decodeCbor(attestationBytes);
  if (!(attObj instanceof Map)) {
    throw new Error('WEBAUTHN_ATTESTATION_NOT_MAP');
  }

  const authData = attObj.get('authData');
  if (!Buffer.isBuffer(authData)) {
    throw new Error('WEBAUTHN_MISSING_AUTH_DATA');
  }

  const parsed = parseAuthenticatorData(authData);
  const expectedRpIdHash = crypto.createHash('sha256').update(input.expectedRpId).digest();
  if (!crypto.timingSafeEqual(parsed.rpIdHash, expectedRpIdHash)) {
    throw new Error('WEBAUTHN_RP_ID_HASH_MISMATCH');
  }
  if (!parsed.userPresent) {
    throw new Error('WEBAUTHN_USER_NOT_PRESENT');
  }
  if (!parsed.credentialId || !parsed.credentialPublicKeyMap) {
    throw new Error('WEBAUTHN_MISSING_ATTESTED_CREDENTIAL');
  }

  const spkiDer = coseEc2ToSpkiDer(parsed.credentialPublicKeyMap);
  // Validate Node crypto can parse the resulting SPKI key immediately
  crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

  return {
    credentialId: base64UrlEncode(parsed.credentialId),
    publicKeySpkiBase64: spkiDer.toString('base64'),
    counter: parsed.signCount,
  };
}

export interface VerifyAuthenticationInput {
  authenticatorDataB64Url: string;
  clientDataJSONB64Url: string;
  signatureB64Url: string;
  expectedChallenge: string;
  expectedRpId: string;
  expectedOrigins: string[];
  publicKeySpkiBase64: string;
  previousCounter: number;
}

export interface VerifiedAuthenticationResult {
  newCounter: number;
}

export function verifyPasskeyAuthentication(input: VerifyAuthenticationInput): VerifiedAuthenticationResult {
  const clientDataBytes = base64UrlDecode(input.clientDataJSONB64Url);
  assertClientData(
    clientDataBytes,
    'webauthn.get',
    input.expectedChallenge,
    input.expectedOrigins,
    input.expectedRpId
  );

  const authDataBytes = base64UrlDecode(input.authenticatorDataB64Url);
  const parsed = parseAuthenticatorData(authDataBytes);

  const expectedRpIdHash = crypto.createHash('sha256').update(input.expectedRpId).digest();
  if (!crypto.timingSafeEqual(parsed.rpIdHash, expectedRpIdHash)) {
    throw new Error('WEBAUTHN_RP_ID_HASH_MISMATCH');
  }
  if (!parsed.userPresent) {
    throw new Error('WEBAUTHN_USER_NOT_PRESENT');
  }

  const clientDataHash = crypto.createHash('sha256').update(clientDataBytes).digest();
  const signedData = Buffer.concat([authDataBytes, clientDataHash]);
  const signatureBytes = base64UrlDecode(input.signatureB64Url);
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(input.publicKeySpkiBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });

  const validSig = crypto.verify('sha256', signedData, publicKey, signatureBytes);
  if (!validSig) {
    throw new Error('WEBAUTHN_INVALID_SIGNATURE');
  }

  const validCounter =
    (parsed.signCount === 0 && input.previousCounter === 0) || parsed.signCount > input.previousCounter;
  if (!validCounter) {
    throw new Error('WEBAUTHN_COUNTER_REPLAY');
  }

  return { newCounter: parsed.signCount };
}

export function resolveRpIdFromOrigin(
  originHeader: string | undefined,
  hostHeader: string | undefined
): { rpId: string; allowedOrigins: string[] } {
  const allowedOrigins: string[] = [];
  if (originHeader) {
    const clean = originHeader.trim();
    if (clean) {
      allowedOrigins.push(clean);
      try {
        const u = new URL(clean);
        if (u.hostname) {
          return { rpId: u.hostname.toLowerCase(), allowedOrigins };
        }
      } catch {
        // Fallback below
      }
    }
  }
  if (hostHeader) {
    const bareHost = hostHeader.trim().split(':')[0]?.toLowerCase() || 'localhost';
    allowedOrigins.push(`https://${hostHeader.trim()}`, `http://${hostHeader.trim()}`);
    return { rpId: bareHost, allowedOrigins };
  }
  return { rpId: 'localhost', allowedOrigins: ['http://localhost:5173', 'http://localhost:4000'] };
}
