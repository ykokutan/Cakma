import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAwsSigV4PresignedGetUrl,
  resolveEffectiveMediaS3Config,
} from '../utils/s3BackupUploader.js';
import {
  extractSteamIdFromClaimedId,
  OAuthAttemptStore,
} from '../features/oauthAndConnectionsRoutes.js';
import { toPublicUser } from '../utils/publicUser.js';
import {
  ChannelBridgeService,
  isEligibleBridgeChannel,
  toPublicBridgeView,
} from '../features/channelBridgeService.js';
import type {
  Channel,
  ChannelBridge,
  Message,
  Server,
  User,
} from '../types.js';
import type { SystemConfig } from '../storage.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'ali',
    role: 'user',
    avatar: '🎮',
    status: 'online',
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isScreenSharing: false,
    ...overrides,
  };
}

function makeServer(channels: Channel[]): Server {
  return {
    id: 'srv1',
    name: 'Test Sunucu',
    ownerId: 'u1',
    channels,
    roles: [
      { id: 'role-everyone', name: '@everyone', color: '#99aab5', permissions: [], position: 0 },
    ],
    members: [
      {
        userId: 'u1',
        username: 'ali',
        avatar: '🎮',
        roleIds: ['role-everyone'],
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

function makeSysConfig(overrides: Partial<SystemConfig>): SystemConfig {
  return {
    registrationEnabled: true,
    maintenanceMode: false,
    maxMessageLength: 2000,
    defaultSlowmodeSeconds: 0,
    ...overrides,
  } as unknown as SystemConfig;
}

test('resolveEffectiveMediaS3Config handles disabled, shared backup, and standalone configs', () => {
  const disabled = resolveEffectiveMediaS3Config(makeSysConfig({ mediaS3Enabled: false }));
  assert.equal(disabled.enabled, false);

  const shared = resolveEffectiveMediaS3Config(
    makeSysConfig({
      mediaS3Enabled: true,
      mediaS3UseBackupCredentials: true,
      mediaS3Prefix: '/uploads-media/',
      mediaS3MinSizeKb: 128,
      mediaS3PublicBaseUrl: 'https://cdn.example.com/',
      backupS3Endpoint: 'https://r2.example.cloudflarestorage.com',
      backupS3Bucket: 'cakma-backups',
      backupS3Region: 'auto',
      backupS3AccessKey: 'AKIA_BACKUP',
      backupS3SecretKey: 'SECRET_BACKUP',
    })
  );
  assert.equal(shared.enabled, true);
  assert.equal(shared.endpoint, 'https://r2.example.cloudflarestorage.com');
  assert.equal(shared.bucket, 'cakma-backups');
  assert.equal(shared.region, 'auto');
  assert.equal(shared.accessKeyId, 'AKIA_BACKUP');
  assert.equal(shared.secretAccessKey, 'SECRET_BACKUP');
  assert.equal(shared.prefix, 'uploads-media/');
  assert.equal(shared.minSizeBytes, 128 * 1024);
  assert.equal(shared.publicBaseUrl, 'https://cdn.example.com');

  const standalone = resolveEffectiveMediaS3Config(
    makeSysConfig({
      mediaS3Enabled: true,
      mediaS3UseBackupCredentials: false,
      mediaS3Endpoint: 'https://s3.eu-central-1.amazonaws.com',
      mediaS3Bucket: 'cakma-media',
      mediaS3Region: 'eu-central-1',
      mediaS3AccessKey: 'AKIA_MEDIA',
      mediaS3SecretKey: 'SECRET_MEDIA',
      mediaS3MinSizeKb: 0,
    })
  );
  assert.equal(standalone.enabled, true);
  assert.equal(standalone.bucket, 'cakma-media');
  assert.equal(standalone.region, 'eu-central-1');
  assert.equal(standalone.accessKeyId, 'AKIA_MEDIA');
  assert.equal(standalone.minSizeBytes, 0);
});

test('buildAwsSigV4PresignedGetUrl creates deterministic SigV4 presigned URLs', () => {
  const fixedDate = new Date('2026-11-27T12:00:00.000Z');
  const urlStr = buildAwsSigV4PresignedGetUrl({
    endpoint: 'https://12345.r2.cloudflarestorage.com',
    bucket: 'media-bucket',
    region: 'auto',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
    objectKey: 'media/sample clip.webm',
    expiresSeconds: 3600,
    now: fixedDate,
  });

  const parsed = new URL(urlStr);
  assert.equal(parsed.origin, 'https://12345.r2.cloudflarestorage.com');
  assert.equal(parsed.pathname, '/media-bucket/media/sample%20clip.webm');
  assert.equal(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(parsed.searchParams.get('X-Amz-Credential'), 'AKIA_TEST/20261127/auto/s3/aws4_request');
  assert.equal(parsed.searchParams.get('X-Amz-Date'), '20261127T120000Z');
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '3600');
  assert.equal(parsed.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(parsed.searchParams.get('X-Amz-Signature') || '', /^[0-9a-f]{64}$/);

  const second = buildAwsSigV4PresignedGetUrl({
    endpoint: 'https://12345.r2.cloudflarestorage.com',
    bucket: 'media-bucket',
    region: 'auto',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
    objectKey: 'media/sample clip.webm',
    expiresSeconds: 3600,
    now: fixedDate,
  });
  assert.equal(second, urlStr);
});

test('extractSteamIdFromClaimedId validates official Steam OpenID claimed_id format', () => {
  assert.equal(
    extractSteamIdFromClaimedId('https://steamcommunity.com/openid/id/76561198012345678'),
    '76561198012345678'
  );
  assert.equal(
    extractSteamIdFromClaimedId('http://steamcommunity.com/openid/id/76561198012345678'),
    '76561198012345678'
  );
  assert.equal(extractSteamIdFromClaimedId('https://evil.example/openid/id/76561198012345678'), null);
  assert.equal(extractSteamIdFromClaimedId('https://steamcommunity.com/openid/id/12345'), null);
  assert.equal(extractSteamIdFromClaimedId(''), null);
});

test('OAuthAttemptStore enforces pollSecret and transitions completion state safely', () => {
  const store = new OAuthAttemptStore();
  const { attemptId, pollSecret } = store.create({
    provider: 'github',
    intent: 'login',
  });

  const pendingPoll = store.poll(attemptId, pollSecret);
  assert.ok(pendingPoll);
  assert.equal(pendingPoll.status, 'pending');

  const badSecretPoll = store.poll(attemptId, 'wrong-secret');
  assert.ok(badSecretPoll);
  assert.equal(badSecretPoll.ok, false);
  assert.equal(badSecretPoll.status, 'error');

  store.complete(attemptId, 'completed', {
    token: 'tok-123',
    mediaToken: 'mtok-123',
    username: 'ali',
  });

  const completedPoll = store.poll(attemptId, pollSecret);
  assert.ok(completedPoll);
  assert.equal(completedPoll.status, 'completed');
  assert.equal(completedPoll.result?.token, 'tok-123');
  assert.equal(completedPoll.result?.username, 'ali');
});

test('toPublicUser hides verifiedConnections with showOnProfile === false', () => {
  const pub = toPublicUser(
    makeUser({
      verifiedConnections: [
        {
          provider: 'steam',
          externalId: '76561198012345678',
          username: 'AliSteam',
          showOnProfile: true,
          verifiedAt: '2026-11-27T00:00:00.000Z',
        },
        {
          provider: 'google',
          externalId: 'g-1',
          username: 'ali@example.com',
          showOnProfile: false,
          verifiedAt: '2026-11-27T00:00:00.000Z',
        },
      ],
    })
  );

  assert.equal(pub.verifiedConnections?.length, 1);
  assert.equal(pub.verifiedConnections?.[0]?.provider, 'steam');
});

test('isEligibleBridgeChannel restricts bridges to text/announcement channels only', () => {
  assert.equal(
    isEligibleBridgeChannel({ id: 'c1', name: 'genel', type: 'text', serverId: 'srv1' }),
    true
  );
  assert.equal(
    isEligibleBridgeChannel({ id: 'c2', name: 'duyuru', type: 'announcement', serverId: 'srv1' }),
    true
  );
  assert.equal(
    isEligibleBridgeChannel({ id: 'c4', name: 'ses', type: 'voice', serverId: 'srv1' }),
    false
  );
  assert.equal(
    isEligibleBridgeChannel({ id: 'c5', name: 'wiki', type: 'wiki', serverId: 'srv1' }),
    false
  );
});

test('toPublicBridgeView redacts secrets and exposes safe flags', () => {
  const bridge: ChannelBridge = {
    id: 'br1',
    serverId: 'srv1',
    channelId: 'c1',
    platform: 'telegram',
    name: 'Telegram Duyuru',
    enabled: true,
    direction: 'both',
    inboundSecret: 'super-secret-token',
    telegramBotToken: '123456:ABC-DEF',
    telegramChatId: '-1001234567',
    telegramMode: 'polling',
    createdBy: 'u1',
    createdAt: '2026-11-27T00:00:00.000Z',
  };

  const view = toPublicBridgeView(bridge);
  assert.equal('inboundSecret' in view, false);
  assert.equal('telegramBotToken' in view, false);
  assert.equal(view.hasTelegramBotToken, true);
  assert.equal(view.telegramChatId, '-1001234567');
});

test('ChannelBridgeService prevents bridge loops and persists inbound messages safely', () => {
  const ch: Channel = { id: 'c1', name: 'genel', type: 'text', serverId: 'srv1' };
  const srv = makeServer([ch]);
  const servers: Server[] = [srv];
  const messages: Record<string, Message[]> = {};
  const bridges: ChannelBridge[] = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  let createdCount = 0;
  let upsertedCount = 0;

  const service = new ChannelBridgeService({
    bridges,
    servers,
    messages,
    activeUsers: new Map(),
    verifySessionTokenWithMeta: () => null,
    getAccount: () => undefined,
    sanitizeText: (input: string) => input.replace(/<[^>]+>/g, '').trim(),
    checkServerPermission: () => true,
    saveBridges: () => {},
    saveChannelMessageUpsert: () => {
      upsertedCount += 1;
    },
    emitToChannelAudience: (_s, _c, event, payload) => {
      emitted.push({ event, payload });
    },
    addAuditLog: () => {},
    onMessageCreated: () => {
      createdCount += 1;
    },
  });

  const bridge: ChannelBridge = {
    id: 'br1',
    serverId: 'srv1',
    channelId: 'c1',
    platform: 'discord',
    name: 'Discord Köprü',
    enabled: true,
    direction: 'both',
    inboundSecret: 'sec1',
    discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc',
    createdBy: 'u1',
    createdAt: '2026-11-27T00:00:00.000Z',
  };

  const createdMsg = service.deliverInboundMessage(
    bridge,
    '<b>Veli</b>',
    'Merhaba topluluk!',
    'DC'
  );
  assert.ok(createdMsg);
  assert.equal(createdMsg.author.id, 'bridge-discord-br1');
  assert.equal(createdMsg.author.username, 'Veli [DC]');
  assert.equal(createdMsg.content, 'Merhaba topluluk!');
  assert.equal(messages['c1']?.length, 1);
  assert.equal(createdCount, 1);
  assert.equal(upsertedCount, 1);
  assert.equal(emitted.some((e) => e.event === 'new_message'), true);

  // Inbound bridge message must NOT be forwarded back outbound (loop prevention)
  assert.equal(service.shouldForwardOutboundMessage(createdMsg), false);

  // Normal user text message IS eligible for outbound forwarding
  assert.equal(
    service.shouldForwardOutboundMessage({
      id: 'm2',
      serverId: 'srv1',
      channelId: 'c1',
      author: { id: 'u1', username: 'ali', avatar: '🎮' },
      content: 'Selam!',
      timestamp: '2026-11-27T00:01:00.000Z',
    }),
    true
  );
});
