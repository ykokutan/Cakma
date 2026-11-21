import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hashPasswordAsync, verifyPasswordAsync } from '../authCrypto.js';
import {
  loadDedicatedState,
  scheduleDedicatedStateSave,
  flushDedicatedStateSync,
  writeDedicatedStateSync,
} from '../storage.js';
import { verifyLicenseKey } from '../licenseValidator.js';

describe('dedicated-server authCrypto', () => {
  it('hashes with scrypt$ format and rejects invalid or plaintext passwords', async () => {
    const hashed = await hashPasswordAsync('GucLuSifre#2026');
    assert.ok(hashed.startsWith('scrypt$'));
    assert.equal(await verifyPasswordAsync('GucLuSifre#2026', hashed), true);
    assert.equal(await verifyPasswordAsync('YanlisSifre', hashed), false);
    assert.equal(await verifyPasswordAsync('plain123', 'plain123'), false);
  });
});

describe('dedicated-server atomic storage', () => {
  it('initializes admin with hashed password and persists accounts/messages across reload', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-ded-storage-'));
    try {
      const prevEnvPass = process.env.DEDICATED_ADMIN_PASSWORD;
      process.env.DEDICATED_ADMIN_PASSWORD = 'AdminBootPass!99';

      const state1 = await loadDedicatedState({
        defaultChannels: [{ id: 'ch-1', name: 'genel', type: 'text', serverId: 'root' }],
        getBadges: () => [],
        dataDir: tmpDir,
      });

      const admin = state1.accounts.get('admin');
      assert.ok(admin);
      assert.ok(admin.password.startsWith('scrypt$'));
      assert.equal(await verifyPasswordAsync('AdminBootPass!99', admin.password), true);

      const userPass = await hashPasswordAsync('PlayerPass123!');
      state1.accounts.set('zeynep', {
        username: 'zeynep',
        email: 'zeynep@dedicated.local',
        password: userPass,
        avatar: '🎧',
        role: 'user',
      });
      state1.messages['ch-1'] = [{ id: 'm1', content: 'Merhaba dedicated' }];

      scheduleDedicatedStateSave(state1.accounts, state1.channels, state1.messages, state1.friendRequests, 50, tmpDir);
      flushDedicatedStateSync();

      const state2 = await loadDedicatedState({
        defaultChannels: [],
        getBadges: () => [],
        dataDir: tmpDir,
      });
      assert.equal(state2.accounts.size, 2);
      assert.equal(state2.accounts.get('zeynep')?.email, 'zeynep@dedicated.local');
      assert.equal(state2.messages['ch-1']?.[0]?.content, 'Merhaba dedicated');

      // Ensure writeDedicatedStateSync caps overly long histories cleanly
      writeDedicatedStateSync(
        {
          accounts: Array.from(state2.accounts.values()),
          channels: state2.channels,
          messages: { 'ch-1': Array.from({ length: 550 }, (_, i) => ({ id: `m-${i}`, content: `msg ${i}` })) },
          friendRequests: [],
        },
        tmpDir
      );
      const rawSaved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'state.json'), 'utf-8'));
      assert.equal(rawSaved.messages['ch-1'].length, 500);

      if (prevEnvPass === undefined) delete process.env.DEDICATED_ADMIN_PASSWORD;
      else process.env.DEDICATED_ADMIN_PASSWORD = prevEnvPass;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('dedicated-server licenseValidator', () => {
  it('verifies valid Ed25519 LIC2- tokens and rejects tampered tokens', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const payload = Buffer.from(
      JSON.stringify({
        licensee: 'TestClan',
        maxSlots: 50,
        expiresAt: 'lifetime',
        tier: 'Pro',
        issuedAt: new Date().toISOString(),
      }),
      'utf-8'
    ).toString('base64url');
    const sig = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey).toString('base64url');
    const token = `LIC2-${payload}.${sig}`;

    const validRes = verifyLicenseKey(token, publicKey);
    assert.equal(validRes.valid, true);
    assert.equal(validRes.data?.licensee, 'TestClan');

    const tampered = `LIC2-${payload}.AAAA${sig.slice(4)}`;
    const badRes = verifyLicenseKey(tampered, publicKey);
    assert.equal(badRes.valid, false);
  });
});
