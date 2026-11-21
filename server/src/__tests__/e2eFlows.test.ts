import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import cors from 'cors';
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Message, RegisteredAccount, Server, User } from '../types.js';
import type { SystemConfig } from '../storage.js';
import { getPersistentDir } from '../storage.js';
import { SqliteStore } from '../sqliteStore.js';
import { createRequestIdMiddleware } from '../utils/logger.js';
import { createCorsOptionsDelegate, createSocketCorsOriginValidator } from '../utils/corsConfig.js';
import { createSocketEventRateLimiter } from '../utils/socketGuard.js';
import { createAuthMiddlewares } from '../utils/adminAuth.js';
import { registerCloudSyncAndEvents } from '../features/cloudSyncAndEvents.js';
import { registerChatMessageHandlers } from '../features/chatMessageHandlers.js';

describe('E2E flows (CORS, revoked tokens, SQLite FTS5 & Socket.IO message context)', () => {
  it('handles CORS non-500 rejection, token revocation on /uploads, and Socket.IO send -> search -> jump context', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-e2e-'));
    const sqliteStore = new SqliteStore(tmpDir);
    await sqliteStore.init();

    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(cors(createCorsOptionsDelegate(['https://allowed.example'], { onBlocked: () => {} })));
    app.use(express.json({ limit: '2mb' }));
    app.get('/healthz', (_req, res) => res.json({ ok: true }));

    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: createSocketCorsOriginValidator(['https://allowed.example'], { onBlocked: () => {} }),
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    const secret = 'e2e-test-session-secret';
    const makeSessionToken = (username: string, iat: number) => {
      const payload = Buffer.from(
        JSON.stringify({ u: username, iat, exp: Date.now() + 120_000 })
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
      return { username: String(parsed.u || ''), iat: Number(parsed.iat || 0) };
    };
    const verifyMediaToken = (token: string) => {
      const [payload, sig] = String(token || '').split('.');
      if (!payload || !sig) return null;
      const expected = crypto.createHmac('sha256', secret).update(`media-v1:${payload}`).digest('base64url');
      if (sig !== expected) return null;
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      return parsed.p === 'media-v1' ? String(parsed.u) : null;
    };

    const issuedRevocationCutoff = Date.now() + 10_000;
    const aliceAcc: RegisteredAccount = {
      id: 'usr-alice',
      username: 'Alice',
      email: 'alice@example.com',
      password: 'hash',
      avatar: '🛡️',
      role: 'user',
      createdAt: '2026-11-21',
      walletBalance: 100,
      friends: [],
      minTokenIssuedAt: issuedRevocationCutoff,
    };
    const accounts = new Map<string, RegisteredAccount>([['alice', aliceAcc]]);
    const servers: Server[] = [
      {
        id: 'srv-1',
        name: 'Test Sunucu',
        ownerId: 'usr-alice',
        channels: [{ id: 'ch-1', name: 'genel', type: 'text', serverId: 'srv-1' }],
        roles: [{ id: 'everyone', name: '@everyone', color: '#99aab5', position: 0, permissions: ['send_messages'], isDefault: true }],
        members: [{ userId: 'usr-alice', username: 'Alice', avatar: '🛡️', roleIds: ['everyone'], joinedAt: '2026-11-21', isOwner: true }],
      },
    ];
    const messages: Record<string, Message[]> = { 'ch-1': [] };
    const activeUsers = new Map<string, User>();
    const socketEventLimiter = createSocketEventRateLimiter();

    const defaultCfg: SystemConfig = {
      registrationEnabled: true,
      maintenanceMode: false,
      maxMessageLength: 2000,
      defaultSlowmodeSeconds: 0,
      maxUploadSizeMb: 5,
      requireStrongPasswords: false,
    };

    const isAccountSessionValid = (username: string, iat: number) => {
      const acc = accounts.get(username.toLowerCase());
      if (!acc) return false;
      if (acc.isBanned && (!acc.bannedUntil || Date.now() < acc.bannedUntil)) return false;
      if (acc.minTokenIssuedAt && iat < acc.minTokenIssuedAt) return false;
      return true;
    };

    const verifySessionToken = (tok: string): string | null => {
      const meta = verifySessionTokenWithMeta(tok);
      if (!meta || !isAccountSessionValid(meta.username, meta.iat)) return null;
      return meta.username;
    };

    const authMiddlewares = createAuthMiddlewares({
      verifySessionTokenWithMeta,
      getAccount: (u) => accounts.get(u),
    });

    registerCloudSyncAndEvents(app, io, activeUsers, {
      getMessagesMap: () => messages,
      getAccounts: () => accounts,
      getServers: () => servers,
      verifySessionTokenWithMeta,
      verifySessionToken,
      verifyMediaToken,
      getAccount: (u) => accounts.get(u),
      getMaxUploadSizeMb: () => 5,
      addAuditLog: () => {},
    });

    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err instanceof Error ? err.message : 'unexpected' });
    });

    io.on('connection', (socket) => {
      const user: User = {
        id: socket.id,
        accountId: 'usr-alice',
        username: 'Alice',
        role: 'user',
        avatar: '🛡️',
        status: 'online',
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
      };
      activeUsers.set(socket.id, user);
      socket.join('server:srv-1');
      socket.join('user:alice');

      registerChatMessageHandlers(socket, {
        io,
        activeUsers,
        registeredAccounts: accounts,
        servers,
        messages,
        serverLevels: {},
        socketEventLimiter,
        getSystemConfig: () => defaultCfg,
        sanitizeText: (s) => s.trim(),
        isMessageFlooding: () => false,
        hasDangerousAttachment: () => false,
        checkServerPermission: () => true,
        addMemberXP: () => {},
        generateAIResponse: () => 'ok',
        saveAccounts: () => {},
        saveUserReadCursor: (u, ch, msgId) => sqliteStore.upsertReadCursor(u, ch, msgId),
        saveChannelMessageUpsert: (ch, _list, msg) => sqliteStore.upsertMessage(ch, msg),
        saveChannelMessageDelete: (_ch, _list, msgId) => sqliteStore.deleteMessage(msgId),
        getChannelMessagesPageSmart: (_all, ch, beforeId, limit) => sqliteStore.getChannelMessagesPage(ch, beforeId, limit),
        getChannelMessageContextSmart: (_all, ch, msgId, radius) => sqliteStore.getMessagesAround(ch, msgId, radius),
        searchMessagesSmart: (_all, q, allowed, limit) => {
          const hits = sqliteStore.searchMessagesFts(q, (limit || 50) * 2);
          return hits
            .filter((h) => !allowed || allowed.has(h.channelId))
            .map((h) => ({
              channelId: h.channelId,
              message: sqliteStore.getMessageById(h.id)?.message as Message,
            }))
            .filter((entry) => Boolean(entry.message));
        },
        emitToChannelAudience: (_ch, srvId, evt, payload) => {
          if (srvId) io.to(`server:${srvId}`).emit(evt, payload);
        },
        emitToRelevantUsers: (_u, evt, payload) => io.to('server:srv-1').emit(evt, payload),
        sendWebPushToUsername: async () => {},
        addAuditLog: () => {},
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const uploadedPaths: string[] = [];
    let clientSocket: ClientSocket | null = null;

    try {
      // Prevent unused helper warning cleanly
      assert.ok(authMiddlewares.requireAuth);

      // 1. Disallowed origin gets non-500 response without CORS header
      const blockedCorsRes = await fetch(`${baseUrl}/healthz`, {
        headers: { Origin: 'https://evil.example' },
      });
      assert.equal(blockedCorsRes.status, 200);
      assert.equal(blockedCorsRes.headers.get('access-control-allow-origin'), null);
      assert.ok(blockedCorsRes.headers.get('x-request-id'));

      // Allowed origin receives CORS allow header + X-Request-Id
      const okCorsRes = await fetch(`${baseUrl}/healthz`, {
        headers: { Origin: 'https://allowed.example' },
      });
      assert.equal(okCorsRes.status, 200);
      assert.equal(okCorsRes.headers.get('access-control-allow-origin'), 'https://allowed.example');
      assert.ok(okCorsRes.headers.get('x-request-id'));

      // 2. Upload with valid post-cutoff token, then check revoked pre-cutoff token is blocked
      const revokedToken = makeSessionToken('Alice', issuedRevocationCutoff - 5000);
      const validToken = makeSessionToken('Alice', issuedRevocationCutoff + 1000);

      const uploadRes = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          name: 'e2e.txt',
          type: 'text/plain',
          dataUrl: `data:text/plain;base64,${Buffer.from('e2e file body').toString('base64')}`,
        }),
      });
      assert.equal(uploadRes.status, 200);
      const uploadJson = (await uploadRes.json()) as { attachment: { url: string } };
      const relUrl = uploadJson.attachment.url;
      uploadedPaths.push(path.join(getPersistentDir(), 'uploads', path.basename(relUrl)));

      const revokedGet = await fetch(`${baseUrl}${relUrl}`, {
        headers: { Authorization: `Bearer ${revokedToken}` },
      });
      assert.equal(revokedGet.status, 401);

      const validGet = await fetch(`${baseUrl}${relUrl}`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      assert.equal(validGet.status, 200);
      assert.equal(await validGet.text(), 'e2e file body');

      // 3. Socket.IO send_message -> FTS5 search -> request_message_context jump response
      clientSocket = ioClient(baseUrl, {
        extraHeaders: { origin: 'https://allowed.example' },
        transports: ['websocket'],
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
        clientSocket!.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        clientSocket!.on('connect_error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });

      const receivedMsgs: Message[] = [];
      clientSocket.on('new_message', (msg: Message) => {
        receivedMsgs.push(msg);
      });

      const sendAndAwaitCount = async (content: string, expectedCount: number) => {
        clientSocket!.emit('send_message', { serverId: 'srv-1', channelId: 'ch-1', content });
        const deadline = Date.now() + 3000;
        while (receivedMsgs.length < expectedCount && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 20));
        }
        assert.ok(receivedMsgs.length >= expectedCount, `Timed out waiting for message #${expectedCount}`);
      };

      await sendAndAwaitCount('Birinci hazirlik mesaji', 1);
      await sendAndAwaitCount('Hedef Turnuva Plani FTS5', 2);
      await sendAndAwaitCount('Ucuncu kapanis mesaji', 3);

      const ftsHits = sqliteStore.searchMessagesFts('Turnuva');
      assert.equal(ftsHits.length, 1);
      const targetMsgId = ftsHits[0].id;
      assert.equal(targetMsgId, receivedMsgs[1].id);

      const contextResp = await new Promise<{
        channelId: string;
        targetMessageId: string;
        messages: Message[];
        found: boolean;
      }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('message_context_response timeout')), 3000);
        clientSocket!.once('message_context_response', (res) => {
          clearTimeout(timer);
          resolve(res);
        });
        clientSocket!.emit('request_message_context', {
          channelId: 'ch-1',
          messageId: targetMsgId,
          radius: 5,
        });
      });

      assert.equal(contextResp.found, true);
      assert.equal(contextResp.channelId, 'ch-1');
      assert.equal(contextResp.targetMessageId, targetMsgId);
      assert.equal(contextResp.messages.length, 3);
      assert.equal(contextResp.messages[1].id, targetMsgId);
    } finally {
      if (clientSocket) {
        clientSocket.disconnect();
      }
      for (const f of uploadedPaths) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
      sqliteStore.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
