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
import { SqliteStore } from '../sqliteStore.js';
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

describe('v1.3.0 Stage 1: Persistent SQLite Payment Webhook Idempotency & Admin Endpoint', () => {
  it('persists webhook events across SqliteStore restarts, prevents replay, and serves /api/admin/payment-webhooks', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-wh-persist-'));
    const store1 = new SqliteStore(tmpDir);
    const ok1 = await store1.init();
    if (!ok1) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    const webhookSecret = 'whsec-v130-stage1';
    const { makeSessionToken, verifySessionTokenWithMeta } = makeTokenHelpers('jwt-wh-test');
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
          walletBalance: 100,
          friends: [],
        },
      ],
    ]);

    const mountApp = async (store: SqliteStore) => {
      const app = express();
      const httpServer = http.createServer(app);
      const io = new SocketIOServer(httpServer);
      registerDedicatedAndMasterRoutes(app, io, {
        dedicatedServersRegistry: new Map(),
        issuedLicenses: new Map<string, IssuedLicense>(),
        saveLicenses: () => {},
        storeSettings: {
          isOpen: true,
          currencySymbol: '₺',
          customSlotUnitPrice: 2,
          discountPercentage: 0,
          packages: {
            starter: { tier: 'Starter', name: 'Starter', slots: 32, price: 40, enabled: true, description: '' },
            pro: { tier: 'Pro', name: 'Pro', slots: 64, price: 100, enabled: true, description: '' },
            enterprise: { tier: 'Enterprise', name: 'Enterprise', slots: 256, price: 250, enabled: true, description: '' },
          },
          paymentMethods: [],
        } as StoreSettings,
        saveStoreSettings: () => {},
        registeredAccounts: accounts,
        saveAccounts: () => {},
        paymentWebhookSecret: webhookSecret,
        hasPaymentWebhookEvent: (eventId) => store.hasPaymentWebhookEvent(eventId),
        recordPaymentWebhookEvent: (ev) => store.recordPaymentWebhookEvent(ev),
        listPaymentWebhookEvents: (limit) => store.listPaymentWebhookEvents(limit),
        verifySessionTokenWithMeta,
        isMasterRequest: () => false,
        addAuditLog: () => {},
      });
      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const port = (httpServer.address() as { port: number }).port;
      return { httpServer, baseUrl: `http://127.0.0.1:${port}` };
    };

    const body = { eventId: 'evt-persist-1', type: 'wallet_topup', username: 'Alice', amount: 75 };
    const sig = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(body)).digest('hex');

    let server1: http.Server | null = null;
    let store2: SqliteStore | null = null;
    let server2: http.Server | null = null;

    try {
      const inst1 = await mountApp(store1);
      server1 = inst1.httpServer;

      const res1 = await fetch(`${inst1.baseUrl}/api/store/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payment-signature': sig },
        body: JSON.stringify(body),
      });
      assert.equal(res1.status, 200);
      assert.equal(accounts.get('alice')?.walletBalance, 175);

      // Simulate server restart with fresh memory Set & reopened SqliteStore
      await new Promise<void>((r) => server1?.close(() => r()));
      server1 = null;
      store1.close();

      store2 = new SqliteStore(tmpDir);
      assert.equal(await store2.init(), true);
      const inst2 = await mountApp(store2);
      server2 = inst2.httpServer;

      const replayRes = await fetch(`${inst2.baseUrl}/api/store/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payment-signature': sig },
        body: JSON.stringify(body),
      });
      assert.equal(replayRes.status, 200);
      const replayJson = (await replayRes.json()) as any;
      assert.equal(replayJson.duplicate, true);
      assert.equal(accounts.get('alice')?.walletBalance, 175);

      // Regular user denied on /api/admin/payment-webhooks, admin allowed
      const userTok = makeSessionToken('Alice');
      const adminTok = makeSessionToken('Admin');
      const userListRes = await fetch(`${inst2.baseUrl}/api/admin/payment-webhooks`, {
        headers: { Authorization: `Bearer ${userTok}` },
      });
      assert.equal(userListRes.status, 401);

      const adminListRes = await fetch(`${inst2.baseUrl}/api/admin/payment-webhooks`, {
        headers: { Authorization: `Bearer ${adminTok}` },
      });
      assert.equal(adminListRes.status, 200);
      const adminListJson = (await adminListRes.json()) as any;
      assert.equal(adminListJson.ok, true);
      assert.equal(adminListJson.events.length, 1);
      assert.equal(adminListJson.events[0].eventId, 'evt-persist-1');
    } finally {
      if (server1?.listening) await new Promise<void>((r) => server1!.close(() => r()));
      if (server2?.listening) await new Promise<void>((r) => server2!.close(() => r()));
      store2?.close();
      store1.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
