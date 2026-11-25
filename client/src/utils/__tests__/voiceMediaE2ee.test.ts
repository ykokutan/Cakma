import { describe, it, expect } from 'vitest';
import {
  supportsVoiceMediaE2ee,
  deriveVoiceE2eeKey,
  computeVoiceE2eeFingerprint,
  encryptMediaFrame,
  decryptMediaFrame,
} from '../voiceMediaE2ee';

describe('voiceMediaE2ee', () => {
  it('derives AES-GCM key and computes deterministic SAS fingerprints', async () => {
    expect(supportsVoiceMediaE2ee()).toBe(true);
    const fp1 = await computeVoiceE2eeFingerprint('parola-123', 'voice-ch-1');
    const fp2 = await computeVoiceE2eeFingerprint('parola-123', 'voice-ch-1');
    const fpOther = await computeVoiceE2eeFingerprint('parola-999', 'voice-ch-1');

    expect(fp1).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpOther);
  });

  it('encrypts and decrypts media frames while keeping the 4-byte RTP header intact', async () => {
    const key = await deriveVoiceE2eeKey('oda-anahtari', 'voice-ch-42');
    const wrongKey = await deriveVoiceE2eeKey('yanlis-anahtar', 'voice-ch-42');

    const raw = new Uint8Array([0x80, 0x6f, 0x12, 0x34, 10, 20, 30, 40, 50, 60]);
    const encrypted = await encryptMediaFrame(raw.buffer, key);
    const encBytes = new Uint8Array(encrypted);

    // Clear 4-byte header preserved + magic footer appended
    expect(Array.from(encBytes.slice(0, 4))).toEqual([0x80, 0x6f, 0x12, 0x34]);
    expect(encBytes[encBytes.byteLength - 2]).toBe(0xca);
    expect(encBytes[encBytes.byteLength - 1]).toBe(0xfe);

    const decrypted = await decryptMediaFrame(encrypted, key);
    expect(decrypted).not.toBeNull();
    expect(Array.from(new Uint8Array(decrypted!))).toEqual(Array.from(raw));

    const wrongDecrypted = await decryptMediaFrame(encrypted, wrongKey);
    expect(wrongDecrypted).toBeNull();
  });
});
