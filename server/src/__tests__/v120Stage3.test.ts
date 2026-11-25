import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import type { IssuedLicense, RegisteredAccount, StoreSettings } from '../types.js';
import { registerCloudSyncAndEvents } from '../features/cloudSyncAndEvents.js';
import { registerDedicatedAndMasterRoutes } from '../features/dedicatedRoutes.js';

function makeTokenHelpers(secret: string) {
  const makeSessionToken = (username: string) => {
    const payload = Buffer.from(
      JSON.stringify({ u: username, iat: Date.now(), exp: Date.now() + 60_000 })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  };
  const verifySessionTokenWithMeta = (token: string) => {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    return { username: String(parsed.u), iat: Number(parsed.iat) || 0 };
  };
  return { makeSessionToken, verifySessionTokenWithMeta };
}

describe('v1.2.0 Stage 3: Payment Webhook & Disk Storage Quota', () => {
  it('verifies HMAC signatures, enforces idempotency, and processes wallet_topup & license_purchase webhooks', async () => {
    const app = express();
    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer);
    const webhookSecret = 'whsec-stage3-test';
    const { verifySessionTokenWithMeta } = makeTokenHelpers('jwt-secret');

    const accounts = new Map<string, RegisteredAccount>([
      [
        'alice',
        {
          id: 'acc-alice',
          username: 'Alice',
          email: 'alice@example.com',
          password: 'hash',
          avatar: '🛡️',
          role: 'user',
          createdAt: '2026-11-25',
          walletBalance: 50,
          friends: [],
        },
      ],
    ]);
    const issuedLicenses = new Map<string, IssuedLicense>();
    let accountSaves = 0;
    let licenseSaves = 0;

    registerDedicatedAndMasterRoutes(app, io, {
      dedicatedServersRegistry: new Map(),
      issuedLicenses,
      saveLicenses: () => {
        licenseSaves += 1;
      },
      storeSettings: {
        isOpen: true,
        currencySymbol: '₺',
        customSlotUnitPrice: 2,
        discountPercentage: 0,
        packages: {
          starter: { tier: 'Starter', name: 'Starter', slots: 32, price: 50, enabled: true, description: '' },
          pro: { tier: 'Pro', name: 'Pro', slots: 64, price: 100, enabled: true, description: '' },
          enterprise: { tier: 'Enterprise', name: 'Enterprise', slots: 256, price: 250, enabled: true, description: '' },
        },
        paymentMethods: [],
      } as StoreSettings,
      saveStoreSettings: () => {},
      registeredAccounts: accounts,
      saveAccounts: () => {
        accountSaves += 1;
      },
      paymentWebhookSecret: webhookSecret,
      verifySessionTokenWithMeta,
      isMasterRequest: () => false,
      addAuditLog: () => {},
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const topupBody = { eventId: 'evt-topup-1', type: 'wallet_topup', username: 'Alice', amount: 125 };
      const badRes = await fetch(`${baseUrl}/api/store/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payment-signature': 'deadbeef' },
        body: JSON.stringify(topupBody),
      });
      assert.equal(badRes.status, 401);

      const sigTopup = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(topupBody))
        .digest('hex');
      const okTopup = await fetch(`${baseUrl}/api/store/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payment-signature': `sha256=${sigTopup}` },
        body: JSON.stringify(topupBody),
      });
      assert.equal(okTopup.status, 200);
      const topupJson = (await okTopup.json()) as any;
      assert.equal(topupJson.walletBalance, 175);
      assert.equal(accountSaves, 1);

      // Duplicate eventId must be idempotent and not double-credit
      const dupRes = await fetch(`${baseUrl}/api/store/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payment-signature': sigTopup },
        body: JSON.stringify(topupBody),
      });
      assert.equal(dupRes.status, 200);
      assert.equal(((await dupRes.json()) as any).duplicate, true);
      assert.equal(accounts.get('alice')?.walletBalance, 175);

      const licBody = {
        eventId: 'evt-lic-1',
        type: 'license_purchase',
        username: 'Alice',
        tier: 'Pro',
        maxSlots: 64,
        expireDays: 30,
        licensee: 'Alice Klan Sunucusu',
      };
      const sigLic = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(licBody))
        .digest('hex');
      const okLic = await fetch(`${baseUrl}/api/store/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payment-signature': sigLic },
        body: JSON.stringify(licBody),
      });
      assert.equal(okLic.status, 200);
      const licJson = (await okLic.json()) as any;
      assert.equal(licJson.ok, true);
      assert.equal(licJson.license.tier, 'Pro');
      assert.equal(issuedLicenses.size, 1);
      assert.equal(licenseSaves, 1);
    } finally {
      if (httpServer.listening) await new Promise<void>((r) => httpServer.close(() => r()));
    }
  });

  it('tracks disk usage, blocks uploads with 507 above quota, and supports admin prune', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-quota-'));
    const app = express();
    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer);
    const { makeSessionToken, verifySessionTokenWithMeta } = makeTokenHelpers('quota-secret');

    const accounts = new Map<string, RegisteredAccount>([
      [
        'admin',
        {
          id: 'acc-admin',
          username: 'Admin',
          email: 'admin@example.com',
          password: 'hash',
          avatar: '👑',
          role: 'admin',
          createdAt: '2026-11-25',
          walletBalance: 0,
          friends: [],
        },
      ],
    ]);

    registerCloudSyncAndEvents(app, io, new Map(), {
      getMessagesMap: () => ({}),
      getAccounts: () => accounts,
      getServers: () => [],
      verifySessionTokenWithMeta,
      verifySessionToken: (t) => verifySessionTokenWithMeta(t)?.username ?? null,
      getAccount: (u) => accounts.get(u),
      getMaxUploadSizeMb: () => 5,
      uploadsDir: tmpDir,
      maxUploadsDiskMb: 0.01, // ~10.2 KB quota for deterministic test
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const token = makeSessionToken('Admin');
      const smallRes = await fetch(`${baseUrl}/api/upload/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': 'small.webm',
          'X-File-Type': 'video/webm',
        },
        body: Buffer.alloc(1500, 0x41),
      });
      assert.equal(smallRes.status, 200);

      const usageRes = await fetch(`${baseUrl}/api/storage/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(usageRes.status, 200);
      const usageJson = (await usageRes.json()) as any;
      assert.equal(usageJson.fileCount, 1);
      assert.equal(usageJson.totalBytes, 1500);

      // Exceed 10 KB disk quota -> 507 Insufficient Storage
      const overflowRes = await fetch(`${baseUrl}/api/upload/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': 'too-big.webm',
          'X-File-Type': 'video/webm',
        },
        body: Buffer.alloc(12000, 0x42),
      });
      assert.equal(overflowRes.status, 507);

      // Admin prune recovers space
      const pruneRes = await fetch(`${baseUrl}/api/storage/prune`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFreeBytes: 1024 }),
      });
      assert.equal(pruneRes.status, 200);
      const pruneJson = (await pruneRes.json()) as any;
      assert.equal(pruneJson.deletedCount, 1);
      assert.equal(pruneJson.remainingBytes, 0);
    } finally {
      if (httpServer.listening) await new Promise<void>((r) => httpServer.close(() => r()));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
