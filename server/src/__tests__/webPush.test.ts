import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  createVapidAuthHeader,
  encryptWebPushPayload,
  generateVapidKeyPair,
} from '../utils/webPush.js';

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

describe('webPush VAPID & RFC 8291 encryption', () => {
  it('signs VAPID JWT auth headers verifiable with the generated P-256 public key', () => {
    const keys = generateVapidKeyPair('mailto:test@example.com');
    assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);

    const header = createVapidAuthHeader('https://fcm.googleapis.com/fcm/send/abc', keys, 1_700_000_000);
    const match = header.match(/^vapid t=([^,]+),\s*k=(.+)$/);
    assert.ok(match);
    const [, jwt, pubB64] = match!;
    assert.equal(pubB64, keys.publicKey);

    const [hB64, cB64, sB64] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(cB64, 'base64url').toString('utf-8'));
    assert.equal(claims.aud, 'https://fcm.googleapis.com');
    assert.equal(claims.sub, 'mailto:test@example.com');
    assert.equal(claims.exp, 1_700_000_000 + 12 * 3600);

    // Construct SPKI DER from raw 65-byte P-256 uncompressed public point to verify ES256 signature
    const rawPub = Buffer.from(pubB64, 'base64url');
    const spkiPrefix = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.concat([spkiPrefix, rawPub]),
      format: 'der',
      type: 'spki',
    });

    const verified = crypto.verify(
      'sha256',
      Buffer.from(`${hB64}.${cB64}`, 'utf-8'),
      { key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sB64, 'base64url')
    );
    assert.equal(verified, true);
  });

  it('encrypts payload per RFC 8291 / aes128gcm so the subscriber private key decrypts the exact JSON', () => {
    const ua = crypto.createECDH('prime256v1');
    ua.generateKeys();
    const uaPublic = ua.getPublicKey(undefined, 'uncompressed');
    const authSecret = crypto.randomBytes(16);

    const original = {
      title: 'Gelen Arama',
      body: 'Ahmet seni arıyor 🚀',
      url: '/',
    };

    const body = encryptWebPushPayload(
      {
        keys: {
          p256dh: uaPublic.toString('base64url'),
          auth: authSecret.toString('base64url'),
        },
      },
      original
    );

    const salt = body.subarray(0, 16);
    const rs = body.readUInt32BE(16);
    const idLen = body.readUInt8(20);
    assert.equal(rs, 4096);
    assert.equal(idLen, 65);

    const asPublic = body.subarray(21, 21 + idLen);
    const cipherAndTag = body.subarray(21 + idLen);
    const ciphertext = cipherAndTag.subarray(0, cipherAndTag.length - 16);
    const tag = cipherAndTag.subarray(cipherAndTag.length - 16);

    const sharedSecret = ua.computeSecret(asPublic);
    const prkKey = hmacSha256(authSecret, sharedSecret);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf-8'), uaPublic, asPublic]);
    const ikm = hmacSha256(prkKey, Buffer.concat([keyInfo, Buffer.from([0x01])]));
    const prk = hmacSha256(salt, ikm);
    const cek = hmacSha256(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'utf-8'), Buffer.from([0x01])])).subarray(0, 16);
    const nonce = hmacSha256(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'utf-8'), Buffer.from([0x01])])).subarray(0, 12);

    const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(tag);
    const decryptedPadded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    assert.equal(decryptedPadded[decryptedPadded.length - 1], 0x02);
    const parsed = JSON.parse(decryptedPadded.subarray(0, decryptedPadded.length - 1).toString('utf-8'));
    assert.deepEqual(parsed, original);
  });
});
