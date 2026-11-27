import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  BOOST_COST_COINS,
  BOOST_DURATION_DAYS,
  computeServerBoostSummary,
} from '../utils/serverBoosts.js';
import {
  AntiRaidTracker,
  normalizeAntiRaidConfig,
} from '../utils/antiRaidShield.js';
import {
  closeLfgData,
  createLfgData,
  toggleLfgParticipant,
} from '../utils/lfgHelper.js';
import {
  buildAwsSigV4Headers,
  deleteObjectFromS3,
} from '../utils/s3BackupUploader.js';
import {
  RedisRealtimeBus,
  RespFrameParser,
  encodeRespCommand,
} from '../utils/redisRealtimeBus.js';
import {
  SqliteStore,
  buildMessageFtsDocument,
} from '../sqliteStore.js';
import {
  parseServerSearchQuery,
  searchAllMessages,
} from '../messageStore.js';
import type { Message, Server } from '../types.js';

function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: 'srv-1',
    name: 'Test Sunucu',
    icon: '🔥',
    ownerId: 'owner',
    roles: [],
    channels: [
      { id: 'ch-genel', name: 'genel', type: 'text', serverId: 'srv-1' },
    ],
    members: [],
    ...overrides,
  };
}

test('computeServerBoostSummary calculates Tiers 0-3 and ignores expired boosts', () => {
  const now = Date.UTC(2026, 10, 27, 12, 0, 0);
  const future = new Date(now + 10 * 86_400_000).toISOString();
  const past = new Date(now - 60_000).toISOString();

  assert.equal(BOOST_COST_COINS, 100);
  assert.equal(BOOST_DURATION_DAYS, 30);

  const mkBoosts = (active: number, expired = 0) => [
    ...Array.from({ length: active }, (_, i) => ({
      id: `b-a-${i}`,
      username: `u${i}`,
      coinsSpent: 100,
      boostedAt: new Date(now - 1000).toISOString(),
      expiresAt: future,
    })),
    ...Array.from({ length: expired }, (_, i) => ({
      id: `b-e-${i}`,
      username: `old${i}`,
      coinsSpent: 100,
      boostedAt: new Date(now - 90_000).toISOString(),
      expiresAt: past,
    })),
  ];

  const t0 = computeServerBoostSummary(makeServer({ boosts: mkBoosts(1, 5) }), now);
  assert.equal(t0.activeBoostCount, 1);
  assert.equal(t0.tier, 0);
  assert.equal(t0.vanityUnlocked, false);
  assert.equal(t0.maxBitrateKbps, 128);

  const t1 = computeServerBoostSummary(makeServer({ boosts: mkBoosts(2) }), now);
  assert.equal(t1.tier, 1);
  assert.equal(t1.maxBitrateKbps, 256);
  assert.equal(t1.vanityUnlocked, false);

  const t2 = computeServerBoostSummary(makeServer({ boosts: mkBoosts(5) }), now);
  assert.equal(t2.tier, 2);
  assert.equal(t2.maxBitrateKbps, 320);
  assert.equal(t2.vanityUnlocked, true);

  const t3 = computeServerBoostSummary(makeServer({ boosts: mkBoosts(10) }), now);
  assert.equal(t3.tier, 3);
  assert.equal(t3.maxBitrateKbps, 384);
  assert.equal(t3.maxEmojis, 120);
  assert.equal(t3.nextTierAt, null);
});

test('AntiRaidTracker detects join spikes, activates lockdown + slowmode, and expires cleanly', () => {
  const tracker = new AntiRaidTracker();
  const srv = makeServer({
    antiRaidConfig: normalizeAntiRaidConfig({
      enabled: true,
      maxJoinsInWindow: 3,
      windowSeconds: 30,
      lockdownDurationMinutes: 10,
      pauseInvites: true,
      autoSlowmodeSeconds: 15,
    }),
  });

  const t0 = 1_700_000_000_000;
  assert.equal(tracker.recordJoinAndCheck(srv, t0).triggered, false);
  assert.equal(tracker.recordJoinAndCheck(srv, t0 + 1000).triggered, false);
  const third = tracker.recordJoinAndCheck(srv, t0 + 2000);
  assert.equal(third.triggered, true);
  assert.equal(third.slowmodeApplied, 1);
  assert.equal(srv.channels[0].slowmodeSeconds, 15);
  assert.equal(tracker.isServerLockedDown(srv, t0 + 5000), true);
  assert.equal(tracker.isServerLockedDown(srv, t0 + 2000 + 10 * 60_000 + 1), false);
});

test('lfgHelper creates lobbies, enforces slot capacity & owner guard, and closes cleanly', () => {
  const lfg = createLfgData({
    game: 'Valorant',
    title: 'Dereceli 5-Stack',
    rankOrNote: 'Elmas+',
    maxSlots: 2,
    voiceChannelId: 'ch-v1',
    voiceChannelName: 'Oyun Odası',
    creatorUsername: 'ali',
    creatorAvatar: '🎯',
  });
  assert.ok(lfg);
  assert.equal(lfg.participants.length, 1);

  // Creator cannot leave as sole participant
  const selfLeave = toggleLfgParticipant(lfg, 'ali', '🎯');
  assert.equal(selfLeave.updated, false);

  const join2 = toggleLfgParticipant(lfg, 'veli', '🎮');
  assert.equal(join2.updated, true);
  assert.equal(join2.lfg.participants.length, 2);

  // Full capacity rejects 3rd user
  const full = toggleLfgParticipant(join2.lfg, 'ayse', '🔥');
  assert.equal(full.updated, false);

  const closed = closeLfgData(join2.lfg);
  assert.equal(closed.closed, true);
  assert.equal(toggleLfgParticipant(closed, 'veli', '🎮').updated, false);
});

test('deleteObjectFromS3 enforces SSRF block on loopback/private IPs and SigV4 signs DELETE', async () => {
  const blockedLocal = await deleteObjectFromS3({
    endpoint: 'http://127.0.0.1:9000',
    bucket: 'media',
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    objectKey: 'uploads/test.webp',
    skipDns: true,
  });
  assert.equal(blockedLocal.ok, false);

  const blockedMeta = await deleteObjectFromS3({
    endpoint: 'http://169.254.169.254',
    bucket: 'media',
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    objectKey: 'uploads/test.webp',
    skipDns: true,
  });
  assert.equal(blockedMeta.ok, false);

  const hdrs = buildAwsSigV4Headers({
    method: 'DELETE',
    url: new URL('https://r2.example.com/cakma-media/uploads/sample.webp'),
    region: 'auto',
    service: 's3',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secretkey123',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    now: new Date('2026-11-27T12:00:00.000Z'),
  });
  assert.match(hdrs.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20261127\/auto\/s3\/aws4_request/);
});

test('RedisRealtimeBus parses fragmented RESP2 frames and relays pub/sub events without self-echo', async () => {
  const parser = new RespFrameParser();
  const cmdBuf = encodeRespCommand(['PUBLISH', 'cakma:cluster:v1', '{"ok":true}']);
  assert.ok(cmdBuf.toString('utf8').startsWith('*3\r\n$7\r\nPUBLISH\r\n'));

  const part1 = Buffer.from('*3\r\n$7\r\nmes');
  const part2 = Buffer.from('sage\r\n$4\r\ntest\r\n$5\r\nhello\r\n');
  assert.equal(parser.push(part1).length, 0);
  const parsed = parser.push(part2);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], ['message', 'test', 'hello']);

  // Ephemeral in-memory RESP2 mock broker
  const subscribers = new Map<string, Set<net.Socket>>();
  const sockets = new Set<net.Socket>();
  const broker = net.createServer((sock) => {
    sockets.add(sock);
    const sockParser = new RespFrameParser();
    sock.on('data', (chunk) => {
      for (const frame of sockParser.push(chunk)) {
        if (!Array.isArray(frame) || frame.length === 0) continue;
        const cmd = String(frame[0] || '').toUpperCase();
        if (cmd === 'SUBSCRIBE' && typeof frame[1] === 'string') {
          const ch = frame[1];
          if (!subscribers.has(ch)) subscribers.set(ch, new Set());
          subscribers.get(ch)!.add(sock);
          sock.write(encodeRespCommand(['subscribe', ch, '1']));
        } else if (cmd === 'PUBLISH' && typeof frame[1] === 'string' && typeof frame[2] === 'string') {
          const ch = frame[1];
          const payload = frame[2];
          let delivered = 0;
          for (const target of subscribers.get(ch) || []) {
            target.write(encodeRespCommand(['message', ch, payload]));
            delivered++;
          }
          sock.write(Buffer.from(`:${delivered}\r\n`, 'utf8'));
        }
      }
    });
    sock.on('close', () => {
      sockets.delete(sock);
      for (const set of subscribers.values()) set.delete(sock);
    });
  });

  await new Promise<void>((resolve) => broker.listen(0, '127.0.0.1', resolve));
  const addr = broker.address() as net.AddressInfo;
  const redisUrl = `redis://127.0.0.1:${addr.port}/0`;

  const receivedA: string[] = [];
  const receivedB: Array<{ event: string; payload: any }> = [];

  const busA = new RedisRealtimeBus({
    redisUrl,
    nodeId: 'node-a',
    onEvent: (env) => receivedA.push(env.event),
  });
  const busB = new RedisRealtimeBus({
    redisUrl,
    nodeId: 'node-b',
    onEvent: (env) => receivedB.push({ event: env.event, payload: env.payload }),
  });

  try {
    await Promise.all([busA.start(), busB.start()]);
    await new Promise((r) => setTimeout(r, 40));
    const sent = await busA.publish('cluster:system_announcement', { message: 'Bakim bitti' });
    assert.equal(sent, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(receivedA.length, 0); // No self-echo
    assert.equal(receivedB.length, 1);
    assert.equal(receivedB[0].event, 'cluster:system_announcement');
    assert.equal(receivedB[0].payload.message, 'Bakim bitti');
  } finally {
    await Promise.all([busA.stop(), busB.stop()]);
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => broker.close(() => resolve()));
  }
});

test('Advanced Search v2 indexes & filters attachment extensions, LFG titles, and fenced code languages', async () => {
  const msgCode: Message = {
    id: 'm-code',
    serverId: 'srv-1',
    channelId: 'ch-dev',
    author: { id: 'u1', username: 'dev_ali', avatar: '💻' },
    content: 'Ornek:\n```ts\nconst x: number = 42;\n```',
    timestamp: '2026-11-27T10:00:00.000Z',
  };
  const msgPdf: Message = {
    id: 'm-pdf',
    serverId: 'srv-1',
    channelId: 'ch-dev',
    author: { id: 'u2', username: 'ayse', avatar: '📄' },
    content: 'Toplanti notu ekte',
    timestamp: '2026-11-27T10:05:00.000Z',
    attachments: [
      { id: 'a1', name: 'yol-haritasi.pdf', size: 20480, type: 'application/pdf', url: '/uploads/a1.pdf' },
    ],
  };
  const msgLfg: Message = {
    id: 'm-lfg',
    serverId: 'srv-1',
    channelId: 'ch-dev',
    author: { id: 'u3', username: 'veli', avatar: '🎮' },
    content: 'Takim araniyor',
    timestamp: '2026-11-27T10:10:00.000Z',
    lfg: {
      id: 'lfg-1',
      game: 'Counter-Strike 2',
      title: 'Faceit Lvl 8+ Kadro',
      maxSlots: 5,
      participants: [{ username: 'veli', avatar: '🎮', joinedAt: '2026-11-27T10:10:00.000Z' }],
      createdAt: '2026-11-27T10:10:00.000Z',
    },
  };

  const docCode = buildMessageFtsDocument(msgCode);
  assert.ok(docCode.includes('has_code'));
  assert.ok(docCode.includes('lang_ts'));

  const docPdf = buildMessageFtsDocument(msgPdf);
  assert.ok(docPdf.includes('ext_pdf'));
  assert.ok(docPdf.includes('yol-haritasi.pdf'));

  const parsed = parseServerSearchQuery('has:code lang:typescript from:@dev_ali');
  assert.equal(parsed.hasCode, true);
  assert.deepEqual(parsed.codeLanguages, ['typescript']);
  assert.equal(parsed.fromUser, 'dev_ali');

  const map = { 'ch-dev': [msgCode, msgPdf, msgLfg] };
  assert.equal(searchAllMessages(map, 'has:code lang:typescript').length, 1);
  assert.equal(searchAllMessages(map, 'ext:pdf').length, 1);
  assert.equal(searchAllMessages(map, 'Faceit').length, 1);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-v160-fts-'));
  const store = new SqliteStore(tmpDir);
  try {
    const active = await store.init();
    if (active) {
      store.replaceChannelMessages('ch-dev', [msgCode, msgPdf, msgLfg]);
      assert.equal(store.searchMessagesFts('has:code lang:ts').length, 1);
      assert.equal(store.searchMessagesFts('ext:pdf').length, 1);
      assert.equal(store.searchMessagesFts('Faceit').length, 1);
    }
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
