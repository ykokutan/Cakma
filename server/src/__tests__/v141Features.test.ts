import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canEditStructuredChannel } from '../features/wikiAndKanbanHandlers.js';
import { summarizeConversation } from '../utils/smartSummarizer.js';
import {
  createTriviaRoom,
  submitTriviaAnswer,
  advanceTriviaQuestion,
  normalizeTurkishWord,
  getRequiredNextStartChar,
  createWordChainRoom,
  submitWordChainTurn,
  getOrCreateTournament,
  recordTournamentPoints,
  buildTournamentBracket,
} from '../utils/triviaAndWordChain.js';
import {
  isCosmeticUnlocked,
  evaluateUserAchievements,
  unlockCosmeticWithWallet,
} from '../utils/cosmeticsAndBadges.js';
import { MaintenanceService } from '../features/maintenanceService.js';
import { buildAwsSigV4Headers, uploadFileToS3 } from '../utils/s3BackupUploader.js';
import type { Channel, RegisteredAccount, Server, User } from '../types.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'ali',
    avatar: '🎮',
    status: 'online',
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isScreenSharing: false,
    role: 'user',
    ...overrides,
  };
}

function makeServer(): Server {
  return {
    id: 'srv-1',
    name: 'Test Server',
    icon: '🚀',
    ownerId: 'owner-1',
    roles: [],
    channels: [],
    members: [
      { userId: 'owner-1', username: 'owner', avatar: '👑', joinedAt: '2026-01-01', roleIds: ['role-owner'] },
      { userId: 'u1', username: 'ali', avatar: '🎮', joinedAt: '2026-01-01', roleIds: ['role-member'] },
    ],
  };
}

function makeAccount(overrides: Partial<RegisteredAccount> = {}): RegisteredAccount {
  return {
    id: 'u1',
    username: 'ali',
    email: 'ali@example.com',
    password: 'hash',
    avatar: '🎮',
    role: 'user',
    createdAt: '2026-01-01',
    walletBalance: 500,
    friends: [],
    unlockedCosmetics: [],
    ...overrides,
  };
}

test('Wiki/Kanban collabMode enforces members vs admins_only channel editing', () => {
  const srv = makeServer();
  const memberUser = makeUser({ id: 'u1', username: 'ali' });
  const adminUser = makeUser({ id: 'owner-1', username: 'owner', role: 'admin' });
  const checkPerm = (u: User, _s: Server, perm: string) => {
    if (u.id === 'owner-1' || u.role === 'admin') return true;
    return perm === 'send_messages';
  };

  const membersChannel: Channel = { id: 'ch-wiki', serverId: 'srv-1', name: 'wiki', type: 'wiki', collabMode: 'members' };
  const adminOnlyChannel: Channel = { id: 'ch-kanban', serverId: 'srv-1', name: 'kanban', type: 'kanban', collabMode: 'admins_only' };

  assert.equal(canEditStructuredChannel(memberUser, srv, membersChannel, checkPerm), true);
  assert.equal(canEditStructuredChannel(memberUser, srv, adminOnlyChannel, checkPerm), false);
  assert.equal(canEditStructuredChannel(adminUser, srv, adminOnlyChannel, checkPerm), true);
});

test('summarizeConversation extracts participants, decisions, links, and mentions', () => {
  const digest = summarizeConversation(
    [
      { author: 'Ali', content: 'Yarın saat 20:00 sürüm yayın plan karar alındı @ayse https://ses.yahyakemalokutan.com/docs' },
      { author: 'Ayşe', content: 'Harika, sunucu yük testi hazır mı?' },
    ],
    { channelName: 'genel' }
  );
  assert.equal(digest.mode, 'builtin');
  assert.equal(digest.participants.length, 2);
  assert.ok(digest.sharedLinks.includes('https://ses.yahyakemalokutan.com/docs'));
  assert.ok(digest.mentions.some((m) => m.target === 'ayse'));
  assert.ok(digest.decisionsAndQuestions.some((d) => d.kind === 'decision'));
  assert.ok(digest.decisionsAndQuestions.some((d) => d.kind === 'question'));
});

test('Trivia, Turkish Word Chain (soft-g -> g) and Room Tournament work accurately', () => {
  const trivia = createTriviaRoom('ch-1', 3);
  const firstQ = trivia.questions[0];
  const scoreRes = submitTriviaAnswer(trivia, 'Ali', firstQ.correctIndex);
  assert.equal(scoreRes.accepted, true);
  assert.equal(scoreRes.correct, true);
  assert.ok(trivia.scores['Ali'] >= 10);
  advanceTriviaQuestion(trivia); // reveal round 1
  advanceTriviaQuestion(trivia); // move to round 2
  assert.equal(trivia.round, 2);

  assert.equal(normalizeTurkishWord('DAĞ'), 'dağ');
  assert.equal(getRequiredNextStartChar('dağ'), 'g');

  const wc = createWordChainRoom('ch-1', 'Host');
  wc.currentWord = 'dağ';
  wc.requiredChar = 'g';
  wc.usedWords = ['dağ'];
  const okTurn = submitWordChainTurn(wc, 'Ali', 'güneş');
  assert.equal(okTurn.ok, true);
  const dupTurn = submitWordChainTurn(wc, 'Veli', 'şaka');
  assert.equal(dupTurn.ok, true);
  const badDuplicate = submitWordChainTurn(wc, 'Ali', 'şaka');
  assert.equal(badDuplicate.ok, false);

  const tournMap = new Map();
  const st = getOrCreateTournament(tournMap, 'ch-1');
  recordTournamentPoints(st, 'Ali', 25, true);
  recordTournamentPoints(st, 'Veli', 10, false);
  const bracket = buildTournamentBracket(st, ['Ali', 'Veli']);
  assert.equal(bracket.bracket.length, 1);
});

test('Cosmetics unlock, wallet purchase, and automatic achievement badges behave correctly', () => {
  assert.equal(isCosmeticUnlocked('frame:none', 1, []), true);
  assert.equal(isCosmeticUnlocked('frame:aurora', 2, []), false);
  assert.equal(isCosmeticUnlocked('frame:aurora', 4, []), true);

  const acc = makeAccount({ walletBalance: 500 });
  const purchase = unlockCosmeticWithWallet(acc, 'grad:sunset', 1);
  assert.equal(purchase.ok, true);
  if (purchase.ok) {
    assert.ok(purchase.unlockedCosmetics.includes('grad:sunset'));
    assert.ok(purchase.newBalance < 500);
  }

  const badges = evaluateUserAchievements([], { messageCount: 1, voiceMinutes: 65, gameWins: 1, level: 5 });
  assert.ok(badges.length >= 2);
});

test('MaintenanceService creates downloadable JSON fallback backup when SQLite is inactive and prevents path traversal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-maint-v141-'));
  try {
    const svc = new MaintenanceService({
      dataDir: tmpDir,
      buildRuntimeMetrics: () => ({
        uptimeSeconds: 100,
        onlineUsers: 3,
        serverCount: 1,
        activeVoiceRooms: 1,
        voiceParticipantsCount: 2,
        cpuPercent: 12.5,
        memoryRssMb: 140,
        memoryHeapUsedMb: 70,
        pendingStorageWrites: 0,
        storageEngine: 'json-sharded',
        livekitEnabled: true,
        pushSubscriptionCount: 0,
      }),
      messages: {},
      registeredAccounts: new Map(),
      servers: [],
      sqlite: {
        isActive: () => false,
        backupToFile: () => ({ ok: false, error: 'inactive' }),
        getAllReferencedAttachmentUrls: () => [],
      },
      exportJsonBundle: () => ({ exportedAt: new Date().toISOString(), files: { 'servers.json': [] } }),
    });

    const sample = svc.recordSample(4);
    assert.equal(sample.cpuPercent, 12.5);
    assert.equal(sample.voiceParticipantsCount, 2);

    const created = svc.createSqliteBackup('test', 5);
    assert.equal(created.ok, true);
    assert.ok(created.backup?.filename.endsWith('.json'));
    const info = svc.getBackupFile(created.backup!.filename);
    assert.ok(info && info.bytes > 0);
    assert.equal(svc.getBackupFile('../secret.json'), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AWS SigV4 signer produces valid Authorization header and rejects SSRF S3 endpoints', async () => {
  const headers = buildAwsSigV4Headers({
    method: 'PUT',
    url: new URL('https://example.r2.cloudflarestorage.com/mybucket/cakma-backups/test.json'),
    region: 'auto',
    service: 's3',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret-key-example',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    now: new Date('2026-11-27T10:00:00Z'),
  });
  assert.ok(headers.Authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261127/auto/s3/aws4_request'));
  assert.equal(headers['x-amz-date'], '20261127T100000Z');

  const ssrfLocal = await uploadFileToS3({
    endpoint: 'http://127.0.0.1:9000',
    bucket: 'b',
    accessKeyId: 'k',
    secretAccessKey: 's',
    objectKey: 'test.json',
    filePath: 'missing.json',
    skipDns: true,
  });
  assert.equal(ssrfLocal.ok, false);
  assert.match(ssrfLocal.error || '', /SSRF/i);

  const ssrfMeta = await uploadFileToS3({
    endpoint: 'http://169.254.169.254/latest',
    bucket: 'b',
    accessKeyId: 'k',
    secretAccessKey: 's',
    objectKey: 'test.json',
    filePath: 'missing.json',
    skipDns: true,
  });
  assert.equal(ssrfMeta.ok, false);
  assert.match(ssrfMeta.error || '', /SSRF/i);
});
