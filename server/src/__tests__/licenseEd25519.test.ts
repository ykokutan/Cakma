import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureLicenseKeys,
  generateEd25519KeyPair,
  generateLicenseKey,
  getLicensePublicKeyPem,
  verifyLicenseKey,
} from '../licenseGenerator.js';

describe('Ed25519 license signing and verification', () => {
  afterEach(() => {
    configureLicenseKeys({ privateKeyPem: '', publicKeyPem: '', allowLegacyHmac: true });
  });

  it('generates and verifies LIC2- tokens with Ed25519 asymmetric keys', () => {
    const keys = generateEd25519KeyPair();
    configureLicenseKeys({
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
      allowLegacyHmac: false,
    });

    assert.equal(getLicensePublicKeyPem(), keys.publicKeyPem.trim());

    const lic = generateLicenseKey('E-Spor Kulubu', 128, 30, 'Enterprise');
    assert.ok(lic.startsWith('LIC2-'));

    const res = verifyLicenseKey(lic);
    assert.equal(res.valid, true);
    assert.equal(res.algorithm, 'ed25519');
    assert.equal(res.data?.licensee, 'E-Spor Kulubu');
    assert.equal(res.data?.maxSlots, 128);
    assert.equal(res.data?.tier, 'Enterprise');
  });

  it('rejects tampered payloads and signatures signed by wrong private key', () => {
    const keysA = generateEd25519KeyPair();
    const keysB = generateEd25519KeyPair();

    const lic = generateLicenseKey('Orijinal', 32, 30, 'Pro', keysA.privateKeyPem);
    const [, sig] = lic.slice(5).split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        licensee: 'Hacker',
        maxSlots: 9999,
        expiresAt: 'lifetime',
        tier: 'Enterprise',
        issuedAt: new Date().toISOString(),
      }),
      'utf-8'
    ).toString('base64url');

    const tampered = `LIC2-${tamperedPayload}.${sig}`;
    assert.equal(verifyLicenseKey(tampered, keysA.publicKeyPem).valid, false);
    assert.equal(verifyLicenseKey(lic, keysB.publicKeyPem).valid, false);
  });

  it('rejects expired LIC2- licenses and enforces allowLegacyHmac toggle', () => {
    const keys = generateEd25519KeyPair();
    configureLicenseKeys({ privateKeyPem: keys.privateKeyPem, publicKeyPem: keys.publicKeyPem });

    const expiredIso = new Date(Date.now() - 60_000).toISOString();
    const expiredLic = generateLicenseKey('Expired', 16, expiredIso, 'Starter');
    const expiredRes = verifyLicenseKey(expiredLic);
    assert.equal(expiredRes.valid, false);
    assert.ok((expiredRes.error || '').includes('süresi dolmuş'));

    // Legacy HMAC key generation when privateKeyPem cleared
    configureLicenseKeys({ privateKeyPem: '', publicKeyPem: '', allowLegacyHmac: true });
    const legacyLic = generateLicenseKey('Legacy', 32, 10, 'Pro');
    assert.ok(legacyLic.startsWith('LIC-'));
    assert.equal(verifyLicenseKey(legacyLic).valid, true);

    configureLicenseKeys({ allowLegacyHmac: false });
    assert.equal(verifyLicenseKey(legacyLic).valid, false);
  });
});
