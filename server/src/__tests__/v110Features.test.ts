import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import type { Message, RegisteredAccount, Server, ServerPermission, User } from '../types.js';
import { getPersistentDir, type SystemConfig } from '../storage.js';
import { SqliteStore } from '../sqliteStore.js';
import { createSocketEventRateLimiter } from '../utils/socketGuard.js';
import { registerCloudSyncAndEvents } from '../features/cloudSyncAndEvents.js';
import { registerE2eePairingRoutes } from '../features/e2eePairingRoutes.js';
import {
  createServerGovernanceHelpers,
  registerServerGovernanceSocketHandlers,
} from '../features/serverGovernanceHandlers.js';
import { registerChatMessageHandlers } from '../features/chatMessageHandlers.js';
import { isServerOwner } from '../utils/serverIdentity.js';

function createMockSocket(id: string) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket: any = {
    id,
    on: (ev: string, fn: (p: unknown) => void) => handlers.set(ev, fn),
    emit: (ev: string, payload: unknown) => emitted.push({ event: ev, payload }),
    to: () => ({ emit: () => {} }),
    join: () => {},
    leave: () => {},
  };
  return {
    socket,
    emitted,
    trigger: (ev: string, payload?: unknown) => {
      const fn = handlers.get(ev);
      if (!fn) throw new Error(`Missing handler for ${ev}`);
      fn(payload);
    },
  };
}

function makePermissionChecker() {
  return (user: User, server: Server, perm: ServerPermission): boolean => {
    if (isServerOwner(user, server) || user.role === 'admin') return true;
    const member = server.members.find((m) => m.username.toLowerCase() === user.username.toLowerCase());
    if (!member) return false;
    if (member.isOwner) return true;
    for (const rid of member.roleIds) {
      const role = server.roles.find((r) => r.id === rid);
      if (role?.permissions.includes(perm)) return true;
    }
    return false;
  };
}

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

describe('v1.1.0 Backend & Core Improvements', () => {
  it('supports POST /api/upload/stream raw binary uploads with video/webm inline headers and executable block', async () => {
    const app = express();
    const httpServer = http.createServer(app);
    const io = new SocketIOServer(httpServer);
    const { makeSessionToken, verifySessionTokenWithMeta } = makeTokenHelpers('v110-upload-secret');

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
          createdAt: '2026-11-24',
          walletBalance: 100,
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
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const createdFiles: string[] = [];

    try {
      const token = makeSessionToken('Alice');
      const unauth = await fetch(`${baseUrl}/api/upload/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'clip.webm' },
        body: Buffer.from('webm-data'),
      });
      assert.equal(unauth.status, 401);

      const blockedExe = await fetch(`${baseUrl}/api/upload/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': 'virus.exe',
          'X-File-Type': 'application/octet-stream',
        },
        body: Buffer.from('MZ'),
      });
      assert.equal(blockedExe.status, 400);

      const okRes = await fetch(`${baseUrl}/api/upload/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent('Video Notu (2s).webm'),
          'X-File-Type': 'video/webm',
        },
        body: Buffer.from('fake-webm-bytes-v110'),
      });
      assert.equal(okRes.status, 200);
      const json = (await okRes.json()) as any;
      assert.equal(json.ok, true);
      assert.ok(String(json.attachment.url).startsWith('/uploads/upl-vid-'));
      createdFiles.push(path.join(getPersistentDir(), 'uploads', path.basename(json.attachment.url)));

      const fetchUploaded = await fetch(`${baseUrl}${json.attachment.url}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(fetchUploaded.status, 200);
      assert.equal(fetchUploaded.headers.get('content-type'), 'video/webm');
      assert.equal(await fetchUploaded.text(), 'fake-webm-bytes-v110');
    } finally {
      for (const f of createdFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      await new Promise<void>((r) => io.close(() => r()));
      if (httpServer.listening) await new Promise<void>((r) => httpServer.close(() => r()));
    }
  });

  it('SqliteStore executes transactional putJsonSnapshotBatch and deleteMessagesBulk atomically', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-v110-sql-'));
    const store = new SqliteStore(tmpDir);
    try {
      const ok = await store.init();
      if (!ok) return;

      const batchWritten = store.putJsonSnapshotBatch([
        ['users.json', [{ username: 'alice' }]],
        ['servers.json', [{ id: 'srv-1' }]],
      ]);
      assert.equal(batchWritten, 2);
      assert.equal(store.getJsonSnapshot<Array<{ username: string }>>('users.json')?.[0]?.username, 'alice');

      store.upsertMessage('ch-1', {
        id: 'm1',
        serverId: 'srv-1',
        channelId: 'ch-1',
        author: { id: 'u1', username: 'alice', avatar: '' },
        content: 'ilk silinecek mesaj',
        timestamp: '10:00',
        reactions: {},
      });
      store.upsertMessage('ch-1', {
        id: 'm2',
        serverId: 'srv-1',
        channelId: 'ch-1',
        author: { id: 'u1', username: 'alice', avatar: '' },
        content: 'ikinci silinecek mesaj',
        timestamp: '10:01',
        reactions: {},
      });
      store.upsertMessage('ch-1', {
        id: 'm3',
        serverId: 'srv-1',
        channelId: 'ch-1',
        author: { id: 'u1', username: 'alice', avatar: '' },
        content: 'kalacak mesaj',
        timestamp: '10:02',
        reactions: {},
      });

      const deleted = store.deleteMessagesBulk(['m1', 'm2', 'non-existent']);
      assert.equal(deleted, 2);
      assert.equal(store.getMessageCount(), 1);
      assert.equal(store.searchMessagesFts('silinecek', 10).length, 0);
      assert.equal(store.searchMessagesFts('kalacak', 10).length, 1);
    } finally {
      store.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles update_server_nickname for self and privileged moderators cleanly', () => {
    const aliceSock = createMockSocket('sock-alice');
    const bobSock = createMockSocket('sock-bob');
    const ownerSock = createMockSocket('sock-owner');

    const activeUsers = new Map<string, User>([
      ['sock-owner', { id: 'u-owner', username: 'owner', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
      ['sock-alice', { id: 'u-alice', username: 'alice', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
      ['sock-bob', { id: 'u-bob', username: 'bob', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
    ]);

    const srv: Server = {
      id: 'srv-nick',
      name: 'Nick Server',
      ownerId: 'u-owner',
      roles: [
        { id: 'role-everyone', name: '@everyone', color: '#999', position: 99, isDefault: true, permissions: ['send_messages'] },
      ],
      members: [
        { userId: 'u-owner', username: 'owner', avatar: '', roleIds: [], joinedAt: '2026-01-01', isOwner: true },
        { userId: 'u-alice', username: 'alice', avatar: '', roleIds: ['role-everyone'], joinedAt: '2026-01-01' },
        { userId: 'u-bob', username: 'bob', avatar: '', roleIds: ['role-everyone'], joinedAt: '2026-01-01' },
      ],
      channels: [{ id: 'ch-1', serverId: 'srv-nick', name: 'genel', type: 'text' }],
    };

    const serverAuditLogs = {};
    const serverCases = {};
    const helpers = createServerGovernanceHelpers({
      serverAuditLogs,
      serverCases,
      saveServerAuditLogs: () => {},
      saveServerModerationCases: () => {},
    });

    const deps: any = {
      activeUsers,
      registeredAccounts: new Map(),
      servers: [srv],
      serverAuditLogs,
      serverCases,
      socketEventLimiter: createSocketEventRateLimiter(),
      sanitizeText: (s: string) => s,
      isSafeImageMedia: () => true,
      checkServerPermission: makePermissionChecker(),
      verifySessionTokenWithMeta: () => null,
      getAccount: () => undefined,
      saveServers: () => {},
      saveServerAuditLogs: () => {},
      saveServerModerationCases: () => {},
      emitServerUpdatedToMembers: () => {},
      emitServersUpdatedForAll: () => {},
      emitToUserSockets: () => {},
    };

    registerServerGovernanceSocketHandlers(aliceSock.socket, deps, helpers);
    registerServerGovernanceSocketHandlers(bobSock.socket, deps, helpers);
    registerServerGovernanceSocketHandlers(ownerSock.socket, deps, helpers);

    // Self nickname update works
    aliceSock.trigger('update_server_nickname', { serverId: 'srv-nick', nickname: 'Kaptan Alice' });
    assert.equal(srv.members[1].nickname, 'Kaptan Alice');

    // Non-moderator cannot overwrite another member's nickname
    bobSock.trigger('update_server_nickname', { serverId: 'srv-nick', targetUsername: 'alice', nickname: 'Hack' });
    assert.equal(srv.members[1].nickname, 'Kaptan Alice');
    assert.ok(bobSock.emitted.some((e) => e.event === 'server_action_error'));

    // Owner can clear/update Alice's nickname
    ownerSock.trigger('update_server_nickname', { serverId: 'srv-nick', targetUsername: 'alice', nickname: '' });
    assert.equal(srv.members[1].nickname, undefined);
  });

  it('enforces permissions on bulk_delete_messages and removes messages atomically', () => {
    const ownerSock = createMockSocket('sock-owner');
    const memberSock = createMockSocket('sock-member');
    const activeUsers = new Map<string, User>([
      ['sock-owner', { id: 'u-owner', username: 'owner', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
      ['sock-member', { id: 'u-bob', username: 'bob', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
    ]);

    const srv: Server = {
      id: 'srv-bulk',
      name: 'Bulk Server',
      ownerId: 'u-owner',
      roles: [
        { id: 'role-everyone', name: '@everyone', color: '#999', position: 99, isDefault: true, permissions: ['send_messages'] },
      ],
      members: [
        { userId: 'u-owner', username: 'owner', avatar: '', roleIds: [], joinedAt: '2026-01-01', isOwner: true },
        { userId: 'u-bob', username: 'bob', avatar: '', roleIds: ['role-everyone'], joinedAt: '2026-01-01' },
      ],
      channels: [{ id: 'ch-bulk', serverId: 'srv-bulk', name: 'genel', type: 'text' }],
    };

    const messages: Record<string, Message[]> = {
      'ch-bulk': [
        { id: 'msg-1', serverId: 'srv-bulk', channelId: 'ch-bulk', author: { id: 'u-bob', username: 'bob', avatar: '' }, content: 'one', timestamp: '10:00', reactions: {} },
        { id: 'msg-2', serverId: 'srv-bulk', channelId: 'ch-bulk', author: { id: 'u-bob', username: 'bob', avatar: '' }, content: 'two', timestamp: '10:01', reactions: {} },
        { id: 'msg-3', serverId: 'srv-bulk', channelId: 'ch-bulk', author: { id: 'u-bob', username: 'bob', avatar: '' }, content: 'three', timestamp: '10:02', reactions: {} },
      ],
    };

    const bulkCalls: string[][] = [];
    const broadcasts: Array<{ event: string; payload: any }> = [];
    const deps: any = {
      io: { to: () => ({ emit: () => {} }) },
      activeUsers,
      registeredAccounts: new Map(),
      servers: [srv],
      messages,
      serverLevels: {},
      socketEventLimiter: createSocketEventRateLimiter(),
      getSystemConfig: () => ({ maxMessageLength: 2000, defaultSlowmodeSeconds: 0, maxUploadSizeMb: 5 }) as SystemConfig,
      sanitizeText: (s: string) => s,
      isMessageFlooding: () => false,
      hasDangerousAttachment: () => false,
      checkServerPermission: makePermissionChecker(),
      addMemberXP: () => {},
      generateAIResponse: () => '',
      saveAccounts: () => {},
      saveUserReadCursor: () => {},
      saveChannelMessageUpsert: () => {},
      saveChannelMessageDelete: () => {},
      saveChannelMessagesBulkDelete: (_ch: string, _list: Message[], ids: string[]) => bulkCalls.push(ids),
      getChannelMessagesPageSmart: () => ({ messages: [], hasMore: false }),
      getChannelMessageContextSmart: () => ({ messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false }),
      searchMessagesSmart: () => [],
      emitToChannelAudience: (_ch: string, _srv: string | undefined, event: string, payload: unknown) => broadcasts.push({ event, payload }),
      emitToRelevantUsers: () => {},
      sendWebPushToUsername: async () => {},
      addAuditLog: () => {},
    };

    registerChatMessageHandlers(ownerSock.socket, deps);
    registerChatMessageHandlers(memberSock.socket, deps);

    memberSock.trigger('bulk_delete_messages', { channelId: 'ch-bulk', messageIds: ['msg-1', 'msg-2'] });
    assert.equal(messages['ch-bulk'].length, 3);
    assert.ok(memberSock.emitted.some((e) => e.event === 'server_action_error'));

    ownerSock.trigger('bulk_delete_messages', { channelId: 'ch-bulk', messageIds: ['msg-1', 'msg-3'] });
    assert.equal(messages['ch-bulk'].length, 1);
    assert.equal(messages['ch-bulk'][0].id, 'msg-2');
    assert.equal(bulkCalls.length, 1);
    assert.equal(broadcasts.some((b) => b.event === 'messages_bulk_deleted' && b.payload.messageIds.length === 2), true);
  });

  it('completes single-use same-user E2EE QR pairing flow and blocks cross-user access', async () => {
    const app = express();
    app.use(express.json());
    const httpServer = http.createServer(app);
    const { makeSessionToken, verifySessionTokenWithMeta } = makeTokenHelpers('v110-pair-secret');

    const accounts = new Map<string, RegisteredAccount>([
      ['alice', { id: '1', username: 'Alice', email: 'a@e.com', password: 'h', avatar: '', role: 'user', createdAt: '2026', walletBalance: 0, friends: [] }],
      ['bob', { id: '2', username: 'Bob', email: 'b@e.com', password: 'h', avatar: '', role: 'user', createdAt: '2026', walletBalance: 0, friends: [] }],
    ]);

    registerE2eePairingRoutes(app, {
      verifySessionTokenWithMeta,
      getAccount: (u) => accounts.get(u),
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const aliceTok = makeSessionToken('Alice');
      const bobTok = makeSessionToken('Bob');

      const startRes = await fetch(`${baseUrl}/api/e2ee/pairing/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${aliceTok}` },
      });
      assert.equal(startRes.status, 200);
      const startJson = (await startRes.json()) as any;
      assert.equal(startJson.ok, true);
      const code = String(startJson.code);

      // Pending status check
      const pendingRes = await fetch(`${baseUrl}/api/e2ee/pairing/${code}/status`, {
        headers: { Authorization: `Bearer ${aliceTok}` },
      });
      assert.equal((await pendingRes.json() as any).status, 'pending');

      // Cross-user complete attempt fails 403
      const bobComplete = await fetch(`${baseUrl}/api/e2ee/pairing/${code}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bobTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedPayload: 'abc', ivBase64: 'iv123' }),
      });
      assert.equal(bobComplete.status, 403);

      // Same-user complete succeeds
      const completeRes = await fetch(`${baseUrl}/api/e2ee/pairing/${code}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${aliceTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedPayload: 'ciphertext-bundle', ivBase64: 'iv-abc' }),
      });
      assert.equal(completeRes.status, 200);

      // First status read delivers payload and burns session
      const readyRes = await fetch(`${baseUrl}/api/e2ee/pairing/${code}/status`, {
        headers: { Authorization: `Bearer ${aliceTok}` },
      });
      const readyJson = (await readyRes.json()) as any;
      assert.equal(readyJson.status, 'ready');
      assert.equal(readyJson.encryptedPayload, 'ciphertext-bundle');
      assert.equal(readyJson.ivBase64, 'iv-abc');

      // Second read returns 404 (single-use)
      const secondRes = await fetch(`${baseUrl}/api/e2ee/pairing/${code}/status`, {
        headers: { Authorization: `Bearer ${aliceTok}` },
      });
      assert.equal(secondRes.status, 404);
    } finally {
      if (httpServer.listening) await new Promise<void>((r) => httpServer.close(() => r()));
    }
  });
});
