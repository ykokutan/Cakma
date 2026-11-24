import { describe, it, expect } from 'vitest';
import {
  generateGroupSenderKey,
  encryptGroupAttachmentBytes,
  decryptGroupAttachmentBytes,
} from '../groupE2ee';

describe('groupE2ee encrypted attachments', () => {
  it('round-trips binary attachment payload with a Group DM AES-256-GCM Sender Key', async () => {
    const keyInfo = await generateGroupSenderKey();
    expect(keyInfo).not.toBeNull();

    const plaintext = new TextEncoder().encode('Gizli grup belgesi içeriği 🚀 123456');
    const encrypted = await encryptGroupAttachmentBytes(plaintext, keyInfo!.key);
    expect(encrypted).not.toBeNull();
    expect(encrypted!.ivBase64.length).toBeGreaterThan(8);
    expect(encrypted!.ciphertext.byteLength).toBeGreaterThan(plaintext.byteLength);

    const decryptedBuf = await decryptGroupAttachmentBytes(
      encrypted!.ciphertext,
      encrypted!.ivBase64,
      keyInfo!.key
    );
    expect(decryptedBuf).not.toBeNull();
    expect(new TextDecoder().decode(decryptedBuf!)).toBe('Gizli grup belgesi içeriği 🚀 123456');
  });

  it('rejects decryption when a wrong group sender key or tampered IV is used', async () => {
    const k1 = await generateGroupSenderKey();
    const k2 = await generateGroupSenderKey();
    expect(k1 && k2).toBeTruthy();

    const plaintext = new Uint8Array([10, 20, 30, 40, 50]);
    const encrypted = await encryptGroupAttachmentBytes(plaintext, k1!.key);
    expect(encrypted).not.toBeNull();

    const wrongKeyResult = await decryptGroupAttachmentBytes(
      encrypted!.ciphertext,
      encrypted!.ivBase64,
      k2!.key
    );
    expect(wrongKeyResult).toBeNull();

    const badIvResult = await decryptGroupAttachmentBytes(
      encrypted!.ciphertext,
      'AAAAAAAAAAAAAAAA',
      k1!.key
    );
    expect(badIvResult).toBeNull();
  });
});
