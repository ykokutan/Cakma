import { beforeEach, describe, it, expect } from 'vitest';
import type { Message } from '../../types';
import { clearMemoryE2eeCache, getOrCreateE2eeKeyPair } from '../e2ee';
import {
  cacheGroupSenderKey,
  clearGroupSenderKeys,
  decryptGroupDmMessage,
  encryptGroupDmMessage,
  generateGroupSenderKey,
  getCachedGroupSenderKey,
  isGroupE2eeCiphertext,
  parseGroupE2eeHeader,
  unwrapGroupKeyEnvelope,
  wrapGroupKeyForMembers,
} from '../groupE2ee';
import {
  formatTranscriptJson,
  formatTranscriptMarkdown,
  matchesSmartSearch,
  parseSmartSearchQuery,
} from '../chatExportAndFilters';
import { arrayBufferToBase64Url, base64UrlToUint8Array } from '../webauthn';
import { t, type AppLanguage } from '../i18n';

describe('v1.0.0 groupE2ee', () => {
  beforeEach(async () => {
    await clearMemoryE2eeCache();
    clearGroupSenderKeys();
  });

  it('wraps/unwraps group sender keys, encrypts/decrypts messages, and isolates rotated epochs', async () => {
    const alice = await getOrCreateE2eeKeyPair('alice_g');
    const bob = await getOrCreateE2eeKeyPair('bob_g');
    expect(alice).not.toBeNull();
    expect(bob).not.toBeNull();

    const alicePub = JSON.stringify(alice!.publicKeyJwk);
    const bobPub = JSON.stringify(bob!.publicKeyJwk);

    const epoch1 = await generateGroupSenderKey();
    expect(epoch1).not.toBeNull();

    const envelopes = await wrapGroupKeyForMembers(epoch1!.rawBytes, 'alice_g', [
      { username: 'alice_g', publicKeyJson: alicePub },
      { username: 'bob_g', publicKeyJson: bobPub },
    ]);
    expect(envelopes).toHaveLength(2);

    const bobEnvelope = envelopes.find((e) => e.targetUsername === 'bob_g')!;
    const unwrappedForBob = await unwrapGroupKeyEnvelope(
      {
        ...bobEnvelope,
        senderUsername: 'alice_g',
        epoch: 1,
        updatedAt: '2026-11-21T00:00:00Z',
      },
      'bob_g',
      alicePub
    );
    expect(unwrappedForBob).not.toBeNull();
    cacheGroupSenderKey('gdm-1', 1, unwrappedForBob!);
    expect(getCachedGroupSenderKey('gdm-1', 1)).not.toBeNull();

    const cipher1 = await encryptGroupDmMessage('Grup gizli mesajı', 1, epoch1!.key);
    expect(cipher1).not.toBeNull();
    expect(isGroupE2eeCiphertext(cipher1!)).toBe(true);
    expect(parseGroupE2eeHeader(cipher1!)?.epoch).toBe(1);

    const plain1 = await decryptGroupDmMessage(cipher1!, unwrappedForBob!);
    expect(plain1).toBe('Grup gizli mesajı');

    // Epoch 2 key rotation must fail to decrypt under epoch 1 key
    const epoch2 = await generateGroupSenderKey();
    const cipher2 = await encryptGroupDmMessage('Yeni epoch mesajı', 2, epoch2!.key);
    expect(parseGroupE2eeHeader(cipher2!)?.epoch).toBe(2);
    const wrongPlain = await decryptGroupDmMessage(cipher2!, unwrappedForBob!);
    expect(wrongPlain).toBeNull();
  });
});

describe('v1.0.0 chatExportAndFilters', () => {
  const sampleMsgs: Message[] = [
    {
      id: 'm1',
      serverId: 'srv-1',
      channelId: 'ch-1',
      author: { id: 'u1', username: 'Alice', avatar: '👩' },
      content: 'Bakın https://example.com harika görünüyor',
      timestamp: '10:15',
      isPinned: true,
    },
    {
      id: 'm2',
      serverId: 'srv-1',
      channelId: 'ch-1',
      author: { id: 'u2', username: 'Bob', avatar: '🧑' },
      content: 'Ekran görüntüsü',
      timestamp: '10:16',
      attachments: [{ id: 'a1', name: 'shot.png', size: 1200, type: 'image/png', url: '/uploads/shot.png' }],
    },
  ];

  it('parses smart filter tokens and filters messages accurately', () => {
    const p1 = parseSmartSearchQuery('has:link is:pinned from:@alice example');
    expect(p1.hasLink).toBe(true);
    expect(p1.isPinned).toBe(true);
    expect(p1.fromUser).toBe('alice');
    expect(p1.text).toBe('example');
    expect(matchesSmartSearch(sampleMsgs[0], p1)).toBe(true);
    expect(matchesSmartSearch(sampleMsgs[1], p1)).toBe(false);

    const p2 = parseSmartSearchQuery('has:image');
    expect(matchesSmartSearch(sampleMsgs[0], p2)).toBe(false);
    expect(matchesSmartSearch(sampleMsgs[1], p2)).toBe(true);
  });

  it('formats Markdown and JSON chat transcripts with decrypted overrides', () => {
    const md = formatTranscriptMarkdown({
      channelName: 'genel',
      serverName: 'Test Klan',
      messages: sampleMsgs,
      decryptedMap: { m2: 'Çözülmüş açıklama' },
    });
    expect(md).toContain('# #genel — Test Klan');
    expect(md).toContain('Alice** 📌');
    expect(md).toContain('Çözülmüş açıklama');
    expect(md).toContain('shot.png');

    const jsonStr = formatTranscriptJson({ channelName: 'genel', messages: sampleMsgs });
    const parsed = JSON.parse(jsonStr);
    expect(parsed.messageCount).toBe(2);
    expect(parsed.messages[1].attachments[0].name).toBe('shot.png');
  });
});

describe('v1.0.0 WebAuthn base64url & 4-language i18n keys', () => {
  it('round-trips base64url byte buffers cleanly', () => {
    const orig = new Uint8Array([0, 15, 255, 62, 63, 128, 200, 9]);
    const b64u = arrayBufferToBase64Url(orig);
    expect(b64u).not.toMatch(/[+/=]/);
    const decoded = base64UrlToUint8Array(b64u);
    expect(Array.from(decoded)).toEqual(Array.from(orig));
  });

  it('provides non-fallback v1.0.0 translations across all 4 languages (tr, en, de, ru)', () => {
    const keys = [
      'channelTypeStage',
      'stageSpeakers',
      'stageAudience',
      'stageRaisedHands',
      'stageRequestSpeak',
      'stageCancelSpeak',
      'stagePromote',
      'stageDemote',
      'stageTopic',
      'channelPermissions',
      'privateChannel',
      'permissionOverrides',
      'serverAuditLog',
      'moderationCases',
      'warnMember',
      'serverOnboarding',
      'selfRoles',
      'acceptRules',
      'scheduledMessages',
      'scheduleMessage',
      'repeatEvery',
      'botsAndCommands',
      'automationRules',
      'createBot',
      'createRule',
      'passkeysTitle',
      'addPasskey',
      'loginWithPasskey',
      'videoNote',
      'recordVideoNote',
      'liveCaptions',
      'exportTranscript',
      'annotateScreen',
      'clearAnnotations',
      'groupE2eeTitle',
      'groupE2eeRotate',
      'autoGameDnd',
      'pttReleaseDelay',
      'serverSounds',
      'serverStickers',
    ];
    const langs: AppLanguage[] = ['tr', 'en', 'de', 'ru', 'fr'];
    for (const key of keys) {
      const trVal = t('tr', key);
      expect(trVal).not.toBe(key);
      for (const lang of langs) {
        const val = t(lang, key);
        expect(val.trim().length).toBeGreaterThan(0);
        expect(val).not.toBe(key);
        if (lang !== 'tr') {
          expect(val).not.toBe(trVal);
        }
      }
    }
  });
});
