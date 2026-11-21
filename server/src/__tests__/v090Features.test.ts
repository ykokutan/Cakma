import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type {
  GroupDmRoom,
  Message,
  RegisteredAccount,
  Server,
  ServerPermission,
  ServerWebhook,
  User,
} from '../types.js';
import type { SystemConfig } from '../storage.js';
import { SqliteStore } from '../sqliteStore.js';
import { canUserAccessChannel, isUserMemberOfGroupDm } from '../utils/channelAccess.js';
import { createSocketEventRateLimiter } from '../utils/socketGuard.js';
import {
  formatIncomingWebhookPayload,
  registerWebhooksAndTemplatesRoutes,
} from '../features/webhooksAndTemplatesRoutes.js';
import { MaintenanceService, registerMaintenanceRoutes } from '../features/maintenanceService.js';
import { registerGroupDmSocketHandlers } from '../features/groupDmSocketHandlers.js';
import { registerServerAdminSocketHandlers } from '../features/serverAdminSocketHandlers.js';
import { registerChatMessageHandlers } from '../features/chatMessageHandlers.js';
import { isServerOwner } from '../utils/serverIdentity.js';

function createMockSocket(id: string) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket: any = {
    id,
    on: (ev: string, fn: (p: unknown) => void) => {
      handlers.set(ev, fn);
    },
    emit: (ev: string, payload: unknown) => {
      emitted.push({ event: ev, payload });
    },
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
    const defRole = server.roles.find((r) => r.isDefault);
    return Boolean(defRole?.permissions.includes(perm));
  };
}

describe('v0.9.0 features suite (Group DMs, Webhooks, Templates, Categories, Forum, Announcement, SQLite Backup & Orphan Media)', () => {
  it('enforces Group DM text & voice access isolation in canUserAccessChannel', () => {
    const groupDms: GroupDmRoom[] = [
      {
        id: 'gdm-100',
        name: 'Takım Sohbeti',
        ownerUsername: 'Alice',
        members: ['Alice', 'Bob'],
        createdAt: '2026-11-21T10:00:00Z',
        voiceChannelId: 'voice-gdm-100',
      },
    ];
    assert.equal(isUserMemberOfGroupDm({ username: 'bob' }, 'gdm-100', groupDms), true);
    assert.equal(canUserAccessChannel({ username: 'Alice', role: 'user' }, 'gdm-100', [], undefined, undefined, groupDms), true);
    assert.equal(canUserAccessChannel({ username: 'Alice', role: 'user' }, 'voice-gdm-100', [], undefined, undefined, groupDms), true);
    assert.equal(canUserAccessChannel({ username: 'Eve', role: 'admin' }, 'gdm-100', [], undefined, undefined, groupDms), false);
    assert.equal(canUserAccessChannel({ username: 'Eve', role: 'user' }, 'voice-gdm-100', [], undefined, undefined, groupDms), false);
  });

  it('formats Forgejo/GitHub push, pull_request and Discord embed webhook payloads cleanly', () => {
    const pushRes = formatIncomingWebhookPayload(
      {
        ref: 'refs/heads/main',
        repository: { full_name: 'ykokutan/Cakma' },
        pusher: { username: 'ykokutan' },
        commits: [
          { id: '1234567890abcdef', message: 'feat: add categories\n\nbody details' },
          { id: 'fedcba0987654321', message: 'fix: header z-index' },
        ],
      },
      { 'x-forgejo-event': 'push' }
    );
    assert.ok(pushRes);
    assert.ok(pushRes.content.includes('ykokutan/Cakma:main'));
    assert.ok(pushRes.content.includes('1234567'));
    assert.ok(pushRes.content.includes('feat: add categories'));

    const prRes = formatIncomingWebhookPayload(
      {
        action: 'opened',
        repository: { full_name: 'ykokutan/Cakma' },
        pull_request: { number: 42, title: 'v0.9.0 upgrade', html_url: 'http://example.local/pr/42' },
      },
      { 'x-github-event': 'pull_request' }
    );
    assert.ok(prRes?.content.includes('#42'));
    assert.ok(prRes?.content.includes('v0.9.0 upgrade'));

    const discordRes = formatIncomingWebhookPayload(
      {
        username: 'CI Bot',
        content: 'Build finished',
        embeds: [{ title: 'Release v0.9.0', description: 'All green', fields: [{ name: 'Platform', value: 'Windows x64' }] }],
      },
      {}
    );
    assert.equal(discordRes?.username, 'CI Bot');
    assert.ok(discordRes?.content.includes('Build finished'));
    assert.ok(discordRes?.content.includes('Release v0.9.0'));
    assert.ok(discordRes?.content.includes('Windows x64'));
  });

  it('serves templates, imports JSON templates, and authenticates incoming webhook REST executions', async () => {
    const app = express();
    app.use(express.json({ limit: '1mb' }));

    const secret = 'wh-test-secret';
    const makeToken = (username: string) => {
      const payload = Buffer.from(JSON.stringify({ u: username, iat: Date.now(), exp: Date.now() + 60_000 })).toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
      return `${payload}.${sig}`;
    };
    const verifyToken = (token: string) => {
      const [payload, sig] = String(token || '').split('.');
      if (!payload || !sig) return null;
      const expSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
      if (sig !== expSig) return null;
      const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      return { username: String(p.u), iat: Number(p.iat) };
    };

    const ownerAcc: RegisteredAccount = {
      id: 'usr-owner',
      username: 'OwnerUser',
      email: 'owner@example.com',
      password: 'x',
      avatar: '👑',
      role: 'user',
      createdAt: '2026-11-21',
      walletBalance: 0,
      friends: [],
    };
    const accounts = new Map<string, RegisteredAccount>([['owneruser', ownerAcc]]);
    const servers: Server[] = [
      {
        id: 'srv-wh',
        name: 'Webhook Sunucusu',
        ownerId: 'usr-owner',
        channels: [{ id: 'ch-wh-1', name: 'git-akis', type: 'announcement', serverId: 'srv-wh' }],
        roles: [{ id: 'everyone', name: '@everyone', color: '#99aab5', position: 0, permissions: ['send_messages'], isDefault: true }],
        members: [{ userId: 'usr-owner', username: 'OwnerUser', avatar: '👑', roleIds: [], joinedAt: '2026-11-21', isOwner: true }],
      },
    ];
    const messages: Record<string, Message[]> = { 'ch-wh-1': [] };
    const webhooks: ServerWebhook[] = [];
    const activeUsers = new Map<string, User>();
    const broadcasts: Array<{ channelId: string; event: string; payload: any }> = [];

    registerWebhooksAndTemplatesRoutes(app, {
      verifySessionTokenWithMeta: verifyToken,
      getAccount: (u) => accounts.get(u),
      servers,
      messages,
      webhooks,
      activeUsers,
      sanitizeText: (s) => s,
      checkServerPermission: makePermissionChecker(),
      saveServers: () => {},
      saveWebhooks: () => {},
      saveChannelMessageUpsert: () => {},
      emitToChannelAudience: (channelId, _srvId, event, payload) => {
        broadcasts.push({ channelId, event, payload });
      },
      emitToUserSockets: () => {},
      addAuditLog: () => {},
    });

    const httpServer = http.createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));

    try {
      const addr = httpServer.address() as { port: number };
      const base = `http://127.0.0.1:${addr.port}`;
      const authHeader = { Authorization: `Bearer ${makeToken('OwnerUser')}`, 'Content-Type': 'application/json' };

      const tplRes = await fetch(`${base}/api/server-templates`);
      assert.equal(tplRes.status, 200);
      const tplJson = (await tplRes.json()) as { ok: boolean; templates: Array<{ id: string }> };
      assert.equal(tplJson.ok, true);
      assert.ok(tplJson.templates.some((t) => t.id === 'gaming'));
      assert.ok(tplJson.templates.some((t) => t.id === 'study'));

      const importRes = await fetch(`${base}/api/servers/import-template`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          name: 'Imported Guild',
          icon: '🛠️',
          categories: [{ key: 'c1', name: 'Bilgi', position: 0 }],
          channels: [
            { name: 'duyuru', type: 'announcement', categoryKey: 'c1' },
            { name: 'soru-cevap', type: 'forum', categoryKey: 'c1' },
          ],
        }),
      });
      assert.equal(importRes.status, 200);
      const impJson = (await importRes.json()) as { ok: boolean; server: Server };
      assert.equal(impJson.ok, true);
      assert.equal(impJson.server.categories?.length, 1);
      assert.equal(impJson.server.channels[0].type, 'announcement');
      assert.equal(impJson.server.channels[1].type, 'forum');

      const createWhRes = await fetch(`${base}/api/servers/srv-wh/webhooks`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ channelId: 'ch-wh-1', name: 'Forgejo Hook' }),
      });
      assert.equal(createWhRes.status, 200);
      const whJson = (await createWhRes.json()) as { ok: boolean; webhook: ServerWebhook };
      assert.equal(whJson.ok, true);
      assert.ok(whJson.webhook.token.length >= 32);

      // Wrong token returns 401
      const badExec = await fetch(`${base}/api/webhooks/${whJson.webhook.id}/wrong-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Unauthorized attempt' }),
      });
      assert.equal(badExec.status, 401);

      // Valid token posts push summary into channel
      const okExec = await fetch(`${base}/api/webhooks/${whJson.webhook.id}/${whJson.webhook.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forgejo-event': 'push' },
        body: JSON.stringify({
          ref: 'refs/heads/main',
          repository: { full_name: 'ykokutan/Cakma' },
          pusher: { username: 'ykokutan' },
          commits: [{ id: 'abc12345', message: 'Release v0.9.0' }],
        }),
      });
      assert.equal(okExec.status, 200);
      assert.equal(messages['ch-wh-1'].length, 1);
      assert.ok(messages['ch-wh-1'][0].content.includes('Release v0.9.0'));
      assert.equal(broadcasts.length, 1);

      // Delete webhook
      const delRes = await fetch(`${base}/api/servers/srv-wh/webhooks/${whJson.webhook.id}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      assert.equal(delRes.status, 200);
      assert.equal(webhooks.length, 0);
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('creates hot SQLite backups via VACUUM INTO, detects/cleans orphan media, and records metrics history', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-maint-'));
    const uploadsDir = path.join(tmpDir, 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, 'upl-keep.png'), 'keep-data');
    fs.writeFileSync(path.join(uploadsDir, 'upl-orphan.png'), 'orphan-payload-123');

    const db = new SqliteStore(tmpDir);
    const initialized = await db.init();
    assert.equal(initialized, true);

    try {
      db.upsertMessage('ch-old', {
        id: 'msg-hist-1',
        serverId: 'srv-1',
        channelId: 'ch-old',
        author: { id: 'u1', username: 'Alice', avatar: '🌟' },
        content: 'Older attachment inside SQLite only',
        timestamp: '12:00',
        attachments: [
          {
            id: 'att-1',
            name: 'upl-keep.png',
            size: 9,
            type: 'image/png',
            url: '/uploads/upl-keep.png',
          },
        ],
      });

      const maintenance = new MaintenanceService({
        dataDir: tmpDir,
        buildRuntimeMetrics: () => ({
          uptimeSeconds: 100,
          onlineUsers: 5,
          serverCount: 2,
          activeVoiceRooms: 1,
          memoryRssMb: 120,
          memoryHeapUsedMb: 55,
          pendingStorageWrites: 0,
          storageEngine: 'sqlite-wal-fts5',
          livekitEnabled: true,
          pushSubscriptionCount: 1,
        }),
        messages: {},
        registeredAccounts: new Map(),
        servers: [],
        sqlite: db,
      });

      // Rolling metrics history
      maintenance.incrementMessageCount();
      maintenance.incrementMessageCount();
      const sample = maintenance.recordSample(2.4);
      assert.equal(sample.onlineUsers, 5);
      assert.equal(sample.memoryHeapUsedMb, 55);
      assert.ok(sample.messagesPerMin > 0);
      assert.equal(maintenance.getHistory(10).length, 1);

      // SQLite hot backup via VACUUM INTO
      const backupRes = maintenance.createSqliteBackup('unit');
      assert.equal(backupRes.ok, true);
      assert.ok(backupRes.backup && backupRes.backup.bytes > 0);
      const list = maintenance.listSqliteBackups();
      assert.equal(list.length, 1);
      assert.equal(maintenance.deleteSqliteBackup(list[0].filename), true);
      assert.equal(maintenance.listSqliteBackups().length, 0);

      // Orphan scan preserves SQLite-referenced upl-keep.png and detects upl-orphan.png
      const dryScan = maintenance.scanOrphanMedia({ dryRun: true, minAgeMs: 0 });
      assert.equal(dryScan.scannedFiles, 2);
      assert.equal(dryScan.orphanFiles, 1);
      assert.deepEqual(dryScan.orphanNames, ['upl-orphan.png']);
      assert.equal(fs.existsSync(path.join(uploadsDir, 'upl-keep.png')), true);

      const cleanScan = maintenance.scanOrphanMedia({ dryRun: false, minAgeMs: 0 });
      assert.equal(cleanScan.deletedFiles, 1);
      assert.equal(fs.existsSync(path.join(uploadsDir, 'upl-orphan.png')), false);
      assert.equal(fs.existsSync(path.join(uploadsDir, 'upl-keep.png')), true);

      // Admin route authorization check
      const app = express();
      registerMaintenanceRoutes(app, {
        maintenance,
        verifySessionTokenWithMeta: () => null,
        getAccount: () => undefined,
        isMasterRequest: (req) => req.headers['x-admin-key'] === 'master-secret',
      });
      const srv = http.createServer(app);
      await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
      try {
        const port = (srv.address() as { port: number }).port;
        const denied = await fetch(`http://127.0.0.1:${port}/api/admin/metrics-history`);
        assert.equal(denied.status, 401);
        const allowed = await fetch(`http://127.0.0.1:${port}/api/admin/metrics-history`, {
          headers: { 'x-admin-key': 'master-secret' },
        });
        assert.equal(allowed.status, 200);
        const hist = (await allowed.json()) as { ok: boolean; points: unknown[] };
        assert.equal(hist.ok, true);
        assert.equal(hist.points.length, 1);
      } finally {
        await new Promise<void>((r) => srv.close(() => r()));
      }
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles categories, announcement restrictions, forum posts, message forwarding, and Group DM lifecycle via socket handlers', () => {
    const ownerUser: User = {
      id: 'sock-owner',
      accountId: 'acc-owner',
      username: 'Owner',
      role: 'user',
      avatar: '👑',
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
    };
    const memberUser: User = {
      id: 'sock-member',
      accountId: 'acc-member',
      username: 'Member',
      role: 'user',
      avatar: '🎮',
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
    };

    const activeUsers = new Map<string, User>([
      [ownerUser.id, ownerUser],
      [memberUser.id, memberUser],
    ]);
    const registeredAccounts = new Map<string, RegisteredAccount>([
      [
        'owner',
        {
          id: 'acc-owner',
          username: 'Owner',
          email: 'o@example.com',
          password: 'h',
          avatar: '👑',
          role: 'user',
          createdAt: '2026-11-21',
          walletBalance: 0,
          friends: [],
        },
      ],
      [
        'member',
        {
          id: 'acc-member',
          username: 'Member',
          email: 'm@example.com',
          password: 'h',
          avatar: '🎮',
          role: 'user',
          createdAt: '2026-11-21',
          walletBalance: 0,
          friends: [],
        },
      ],
    ]);

    const server: Server = {
      id: 'srv-1',
      name: 'Test Hub',
      ownerId: 'acc-owner',
      categories: [],
      channels: [
        { id: 'ch-ann', name: 'duyurular', type: 'announcement', serverId: 'srv-1', position: 0 },
        { id: 'ch-forum', name: 'yardim', type: 'forum', serverId: 'srv-1', position: 1 },
        { id: 'ch-gen', name: 'genel', type: 'text', serverId: 'srv-1', position: 2 },
      ],
      roles: [
        {
          id: 'everyone',
          name: '@everyone',
          color: '#94a3b8',
          position: 99,
          permissions: ['send_messages', 'attach_files'],
          isDefault: true,
        },
      ],
      members: [
        { userId: 'acc-owner', username: 'Owner', avatar: '👑', roleIds: [], joinedAt: '2026-11-21', isOwner: true },
        { userId: 'acc-member', username: 'Member', avatar: '🎮', roleIds: ['everyone'], joinedAt: '2026-11-21' },
      ],
    };
    const servers: Server[] = [server];
    const messages: Record<string, Message[]> = { 'ch-ann': [], 'ch-forum': [], 'ch-gen': [] };
    const groupDms: GroupDmRoom[] = [];
    const checkPerm = makePermissionChecker();
    const rateLimiter = createSocketEventRateLimiter();
    const systemConfig: SystemConfig = {
      maintenanceMode: false,
      registrationEnabled: true,
      defaultSlowmodeSeconds: 0,
      maxMessageLength: 2000,
      maxUploadSizeMb: 5,
      requireStrongPasswords: false,
    };

    const ownerSock = createMockSocket(ownerUser.id);
    const memberSock = createMockSocket(memberUser.id);
    const emittedAudience: Array<{ channelId: string; event: string; payload: any }> = [];

    const mockIo = { to: () => ({ emit: () => true }) } as any;

    const registerFor = (mockSock: ReturnType<typeof createMockSocket>) => {
      registerServerAdminSocketHandlers(mockSock.socket, {
        io: mockIo,
        activeUsers,
        registeredAccounts,
        servers,
        messages,
        socketEventLimiter: rateLimiter,
        sanitizeText: (s) => s,
        isSafeImageMedia: () => true,
        isSafeEmojiOrShortIcon: () => true,
        checkServerPermission: checkPerm,
        addUserToServer: () => false,
        saveServers: () => {},
        saveChannelMessageBulkReplace: () => {},
        emitToServerMembers: () => {},
        emitServerUpdatedToMembers: () => {},
        emitServersUpdatedForAll: () => {},
        emitToUserSockets: () => {},
        emitToChannelAudience: () => {},
        emitUserUpdated: () => {},
        cleanupTemporaryChannels: () => {},
        getInitialMessagesForServers: () => ({ initialMessages: {}, hasMoreMessages: {} }),
        addAuditLog: () => {},
      });

      registerChatMessageHandlers(mockSock.socket, {
        io: mockIo,
        activeUsers,
        registeredAccounts,
        servers,
        messages,
        groupDms,
        serverLevels: {},
        socketEventLimiter: rateLimiter,
        getSystemConfig: () => systemConfig,
        sanitizeText: (s) => s,
        isMessageFlooding: () => false,
        hasDangerousAttachment: () => false,
        checkServerPermission: checkPerm,
        addMemberXP: () => {},
        generateAIResponse: () => 'ok',
        saveAccounts: () => {},
        saveUserReadCursor: () => {},
        saveChannelMessageUpsert: () => {},
        saveChannelMessageDelete: () => {},
        getChannelMessagesPageSmart: () => ({ messages: [], hasMore: false }),
        getChannelMessageContextSmart: () => ({ messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false }),
        searchMessagesSmart: () => [],
        emitToChannelAudience: (channelId, _s, event, payload) => {
          emittedAudience.push({ channelId, event, payload });
        },
        emitToRelevantUsers: () => {},
        sendWebPushToUsername: async () => {},
        addAuditLog: () => {},
      });

      registerGroupDmSocketHandlers(mockSock.socket, {
        activeUsers,
        registeredAccounts,
        groupDms,
        socketEventLimiter: rateLimiter,
        sanitizeText: (s) => s,
        saveGroupDms: () => {},
        emitToUserSockets: () => {},
      });
    };

    registerFor(ownerSock);
    registerFor(memberSock);

    // 1. Category creation + reorder_channels moving ch-gen into category
    ownerSock.trigger('create_category', { serverId: 'srv-1', name: 'Duyuru Alanı' });
    assert.equal(server.categories?.length, 1);
    const catId = server.categories![0].id;
    ownerSock.trigger('reorder_channels', {
      serverId: 'srv-1',
      updates: [{ channelId: 'ch-gen', categoryId: catId, position: 0 }],
    });
    assert.equal(server.channels.find((c) => c.id === 'ch-gen')?.categoryId, catId);

    // 2. Announcement channel rejects regular member, allows owner
    memberSock.trigger('send_message', { serverId: 'srv-1', channelId: 'ch-ann', content: 'Member test' });
    assert.equal(messages['ch-ann'].length, 0);
    assert.ok(memberSock.emitted.some((e) => e.event === 'server_action_error'));

    ownerSock.trigger('send_message', { serverId: 'srv-1', channelId: 'ch-ann', content: 'Resmi Duyuru v0.9.0' });
    assert.equal(messages['ch-ann'].length, 1);

    // 3. Forum post preserves forumPost metadata
    memberSock.trigger('send_message', {
      serverId: 'srv-1',
      channelId: 'ch-forum',
      content: 'İlk konu açıklaması',
      forumPost: { title: 'Kurulum Sorusu', tags: ['yardım', 'tauri'] },
    });
    assert.equal(messages['ch-forum'].length, 1);
    assert.equal(messages['ch-forum'][0].forumPost?.title, 'Kurulum Sorusu');
    assert.deepEqual(messages['ch-forum'][0].forumPost?.tags, ['yardım', 'tauri']);

    // 4. Message forwarding to allowed text channel succeeds & blocks forwarding into announcement by non-mod
    const forumMsgId = messages['ch-forum'][0].id;
    memberSock.trigger('forward_message', {
      sourceChannelId: 'ch-forum',
      messageId: forumMsgId,
      targetChannelId: 'ch-ann',
      targetServerId: 'srv-1',
    });
    assert.equal(messages['ch-ann'].length, 1);

    memberSock.trigger('forward_message', {
      sourceChannelId: 'ch-forum',
      messageId: forumMsgId,
      targetChannelId: 'ch-gen',
      targetServerId: 'srv-1',
    });
    assert.equal(messages['ch-gen'].length, 1);
    assert.equal(messages['ch-gen'][0].forwardedFrom?.authorUsername, 'Member');
    assert.equal(messages['ch-gen'][0].forwardedFrom?.channelName, 'yardim');

    // 5. Group DM create -> rename -> send message -> leave
    ownerSock.trigger('group_dm_create', { name: 'Ekip DM', memberUsernames: ['Member'] });
    assert.equal(groupDms.length, 1);
    const gdmId = groupDms[0].id;
    ownerSock.trigger('group_dm_rename', { groupId: gdmId, name: 'Ana Ekip' });
    assert.equal(groupDms[0].name, 'Ana Ekip');
    memberSock.trigger('send_message', { serverId: 'direct-messages', channelId: gdmId, content: 'Selam grup!' });
    assert.equal(messages[gdmId].length, 1);
    memberSock.trigger('group_dm_leave', { groupId: gdmId });
    assert.deepEqual(groupDms[0].members, ['Owner']);
    ownerSock.trigger('group_dm_leave', { groupId: gdmId });
    assert.equal(groupDms.length, 0);
  });
});
