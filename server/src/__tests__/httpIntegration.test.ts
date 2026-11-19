import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import type { RegisteredAccount, Server } from '../types.js';
import { getPersistentDir } from '../storage.js';
import { createAuthMiddlewares } from '../utils/adminAuth.js';
import { registerCloudSyncAndEvents } from '../features/cloudSyncAndEvents.js';
import { registerChatEnhancementsRoutes } from '../features/chatEnhancementsRoutes.js';

describe('HTTP integration tests (/api/upload, /uploads, /api/link-preview)', () => {
  it('enforces auth on /uploads/:filename, /api/upload, and /api/link-preview SSRF blocking', async () => {
    const app = express();
    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer);
    const secret = 'test-http-integration-secret';

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
      return { username: parsed.u, iat: parsed.iat || 0 };
    };

    const makeMediaToken = (username: string) => {
      const payload = Buffer.from(
        JSON.stringify({ p: 'media-v1', u: username, iat: Date.now(), exp: Date.now() + 60_000 })
      ).toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(`media-v1:${payload}`).digest('base64url');
      return `${payload}.${sig}`;
    };

    const verifyMediaToken = (token: string) => {
      const [payload, sig] = String(token || '').split('.');
      if (!payload || !sig) return null;
      const expected = crypto.createHmac('sha256', secret).update(`media-v1:${payload}`).digest('base64url');
      if (sig !== expected) return null;
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      return parsed.p === 'media-v1' ? String(parsed.u) : null;
    };

    const accounts = new Map<string, RegisteredAccount>([
      [
        'alice',
        {
          id: 'usr-alice',
          username: 'Alice',
          email: 'alice@example.com',
          password: 'hash',
          avatar: '🛡️',
          role: 'user',
          createdAt: '2026-11-19',
          walletBalance: 100,
          friends: [],
        },
      ],
    ]);
    const servers: Server[] = [];
    const activeUsers = new Map<string, { username: string }>();

    const authMiddlewares = createAuthMiddlewares({
      verifySessionTokenWithMeta,
      getAccount: (u) => accounts.get(u),
    });

    registerCloudSyncAndEvents(app, io, activeUsers, {
      getMessagesMap: () => ({}),
      getAccounts: () => accounts,
      getServers: () => servers,
      verifySessionTokenWithMeta,
      verifySessionToken: (tok) => verifySessionTokenWithMeta(tok)?.username ?? null,
      verifyMediaToken,
      getAccount: (u) => accounts.get(u),
      getMaxUploadSizeMb: () => 5,
    });
    registerChatEnhancementsRoutes(app, { authMiddlewares });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    const uploadedPaths: string[] = [];

    try {
      const sessionToken = makeSessionToken('Alice');
      const mediaToken = makeMediaToken('Alice');

      // 1. Upload requires auth
      const unauthUpload = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'notes.txt',
          type: 'text/plain',
          dataUrl: `data:text/plain;base64,${Buffer.from('hello integration').toString('base64')}`,
        }),
      });
      assert.equal(unauthUpload.status, 401);

      // 2. Authenticated upload succeeds
      const authUpload = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: 'notes.txt',
          type: 'text/plain',
          dataUrl: `data:text/plain;base64,${Buffer.from('hello integration').toString('base64')}`,
        }),
      });
      assert.equal(authUpload.status, 200);
      const uploadedJson = (await authUpload.json()) as any;
      assert.equal(uploadedJson.ok, true);
      const uploadRelUrl = String(uploadedJson.attachment.url);
      assert.ok(uploadRelUrl.startsWith('/uploads/'));
      uploadedPaths.push(path.join(getPersistentDir(), 'uploads', path.basename(uploadRelUrl)));

      // 3. Unauthenticated GET /uploads/:filename fails with 401
      const unauthGet = await fetch(`${baseUrl}${uploadRelUrl}`);
      assert.equal(unauthGet.status, 401);

      // 4. GET with Bearer works & enforces private cache + nosniff + no-referrer + attachment
      const bearerGet = await fetch(`${baseUrl}${uploadRelUrl}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(bearerGet.status, 200);
      assert.equal(bearerGet.headers.get('cache-control'), 'private, max-age=3600');
      assert.equal(bearerGet.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(bearerGet.headers.get('referrer-policy'), 'no-referrer');
      assert.match(bearerGet.headers.get('content-disposition') || '', /^attachment;/);
      assert.equal(await bearerGet.text(), 'hello integration');

      // 5. GET with HttpOnly session cookie works
      const cookieGet = await fetch(`${baseUrl}${uploadRelUrl}`, {
        headers: { Cookie: `cakma_session=${encodeURIComponent(sessionToken)}` },
      });
      assert.equal(cookieGet.status, 200);

      // 6. GET with scoped ?mt=<mediaToken> works, bad mt fails
      const mtGet = await fetch(`${baseUrl}${uploadRelUrl}?mt=${encodeURIComponent(mediaToken)}`);
      assert.equal(mtGet.status, 200);
      const badMtGet = await fetch(`${baseUrl}${uploadRelUrl}?mt=invalid.sig`);
      assert.equal(badMtGet.status, 401);

      // 7. Media token must NOT authenticate regular API endpoints
      const mtApiRes = await fetch(`${baseUrl}/api/link-preview?url=${encodeURIComponent('https://example.com')}`, {
        headers: { Authorization: `Bearer ${mediaToken}` },
      });
      assert.equal(mtApiRes.status, 401);

      // 8. Link preview requires auth & blocks private/metadata SSRF IPs
      const unauthPreview = await fetch(`${baseUrl}/api/link-preview?url=${encodeURIComponent('https://example.com')}`);
      assert.equal(unauthPreview.status, 401);

      const ssrfLoopback = await fetch(`${baseUrl}/api/link-preview?url=${encodeURIComponent('http://127.0.0.1:4000/')}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(ssrfLoopback.status, 400);

      const ssrfMetadata = await fetch(
        `${baseUrl}/api/link-preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`,
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      assert.equal(ssrfMetadata.status, 400);
    } finally {
      for (const f of uploadedPaths) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }
  });
});
