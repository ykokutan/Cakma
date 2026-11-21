import { beforeEach, describe, it, expect } from 'vitest';
import {
  clearMemoryE2eeCache,
  computeSafetyNumber,
  decryptBinaryFromPeer,
  decryptDmMessage,
  encryptBinaryForPeer,
  encryptDmMessage,
  exportEncryptedE2eeBackup,
  getOrCreateE2eeKeyPair,
  importEncryptedE2eeBackup,
  isE2eeCiphertext,
} from '../e2ee';

describe('e2ee v2', () => {
  beforeEach(async () => {
    await clearMemoryE2eeCache();
  });

  it('encrypts and decrypts DM messages symmetrically between two users', async () => {
    const alice = await getOrCreateE2eeKeyPair('alice_test');
    const bob = await getOrCreateE2eeKeyPair('bob_test');
    expect(alice).not.toBeNull();
    expect(bob).not.toBeNull();

    const bobPub = JSON.stringify(bob!.publicKeyJwk);
    const alicePub = JSON.stringify(alice!.publicKeyJwk);

    const cipher = await encryptDmMessage('Gizli Merhaba 🔒', 'alice_test', bobPub);
    expect(cipher).not.toBeNull();
    expect(isE2eeCiphertext(cipher!)).toBe(true);
    expect(cipher).not.toContain('Gizli Merhaba');

    const plain = await decryptDmMessage(cipher!, 'bob_test', alicePub);
    expect(plain).toBe('Gizli Merhaba 🔒');
  });

  it('computes identical symmetric 60-digit Safety Numbers regardless of participant order', async () => {
    const alice = await getOrCreateE2eeKeyPair('alice_safety');
    const bob = await getOrCreateE2eeKeyPair('bob_safety');
    const sn1 = await computeSafetyNumber(alice!.publicKeyJwk, JSON.stringify(bob!.publicKeyJwk));
    const sn2 = await computeSafetyNumber(bob!.publicKeyJwk, JSON.stringify(alice!.publicKeyJwk));

    expect(sn1).not.toBeNull();
    expect(sn1!.blocks).toHaveLength(12);
    expect(sn1!.blocks.every((b) => /^\d{5}$/.test(b))).toBe(true);
    expect(sn1!.formatted).toBe(sn2!.formatted);
    expect(sn1!.shortTag).toBe(sn2!.shortTag);
  });

  it('exports PBKDF2+AES-GCM encrypted key backup, rejects wrong passphrase, and restores non-extractable runtime key', async () => {
    const alice = await getOrCreateE2eeKeyPair('alice_backup');
    const bob = await getOrCreateE2eeKeyPair('bob_backup');
    const bobPub = JSON.stringify(bob!.publicKeyJwk);
    const alicePub = JSON.stringify(alice!.publicKeyJwk);

    const cipher = await encryptDmMessage('Yeni Cihaz Testi', 'bob_backup', alicePub);
    const backup = await exportEncryptedE2eeBackup('alice_backup', 'Kurtarma!2026');
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;

    await clearMemoryE2eeCache();
    const wrongRes = await importEncryptedE2eeBackup('alice_backup', backup.backupJson, 'YanlisParola!');
    expect(wrongRes.ok).toBe(false);

    const okRes = await importEncryptedE2eeBackup('alice_backup', backup.backupJson, 'Kurtarma!2026', {
      lockNonExtractable: true,
    });
    expect(okRes.ok).toBe(true);

    const plainAfterRestore = await decryptDmMessage(cipher!, 'alice_backup', bobPub);
    expect(plainAfterRestore).toBe('Yeni Cihaz Testi');
  });

  it('encrypts and decrypts binary attachments symmetrically and blocks unauthorized peers', async () => {
    const alice = await getOrCreateE2eeKeyPair('alice_bin');
    const bob = await getOrCreateE2eeKeyPair('bob_bin');
    const eve = await getOrCreateE2eeKeyPair('eve_bin');
    expect(alice).not.toBeNull();
    expect(bob).not.toBeNull();
    expect(eve).not.toBeNull();

    const alicePub = JSON.stringify(alice!.publicKeyJwk);
    const bobPub = JSON.stringify(bob!.publicKeyJwk);
    const payload = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 255]);

    const enc = await encryptBinaryForPeer(payload, 'alice_bin', bobPub);
    expect(enc).not.toBeNull();
    expect(enc!.ciphertext.byteLength).toBeGreaterThan(payload.byteLength);

    const dec = await decryptBinaryFromPeer(enc!.ciphertext, enc!.ivBase64, 'bob_bin', alicePub);
    expect(dec).not.toBeNull();
    expect(Array.from(new Uint8Array(dec!))).toEqual(Array.from(payload));

    const blocked = await decryptBinaryFromPeer(enc!.ciphertext, enc!.ivBase64, 'eve_bin', alicePub);
    expect(blocked).toBeNull();
  });
});
