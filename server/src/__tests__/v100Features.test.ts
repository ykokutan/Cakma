import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import type { Channel, Message, ScheduledMessage, Server, ServerAutomationRule, ServerBot } from '../types.js';
import { resolveChannelPermissions, sanitizePermissionOverrides } from '../utils/channelPermissions.js';
import {
  base64UrlEncode,
  encodeCbor,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from '../utils/webauthn.js';
import { ScheduledMessagesService } from '../features/scheduledMessagesService.js';
import { evaluateAutomationRules, hashBotToken, verifyBotAuthHeader } from '../features/botsAndAutomationRoutes.js';
import { ensureStageState, handleUserLeaveStage } from '../features/stageAndMediaHandlers.js';

function makeServer(overrides: Partial<Server> = {}): Server {
  const id = overrides.id ?? 'srv-1';
  return {
    id,
    name: 'Test Sunucu',
    icon: '🚀',
    ownerId: 'usr-owner',
    roles: [
      {
        id: 'role-mod',
        name: 'Mod',
        color: '#3b82f6',
        position: 2,
        permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice', 'mute_members'],
      },
      {
        id: 'role-vip',
        name: 'VIP',
        color: '#a855f7',
        position: 3,
        permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice'],
      },
      {
        id: 'role-admin',
        name: 'Yönetici',
        color: '#ef4444',
        position: 1,
        permissions: ['manage_server', 'manage_channels', 'send_messages'],
      },
      {
        id: 'role-everyone',
        name: '@everyone',
        color: '#94a3b8',
        position: 99,
        isDefault: true,
        permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice'],
      },
    ],
    members: [
      { userId: 'usr-owner', username: 'owner', avatar: '', roleIds: [], joinedAt: '2026-01-01', isOwner: true },
      { userId: 'usr-alice', username: 'alice', avatar: '', roleIds: ['role-vip'], joinedAt: '2026-01-01' },
      { userId: 'usr-bob', username: 'bob', avatar: '', roleIds: [], joinedAt: '2026-01-01' },
    ],
    channels: [{ id: 'ch-1', serverId: id, name: 'genel', type: 'text' }],
    ...overrides,
  };
}

describe('v1.0.0 channelPermissions', () => {
  it('enforces private channel defaults, owner bypass, role deny precedence, and user override priority', () => {
    const srv = makeServer();
    const privateCh: Channel = {
      id: 'ch-vip',
      serverId: 'srv-1',
      name: 'vip-lounge',
      type: 'text',
      isPrivate: true,
      permissionOverrides: [
        { targetType: 'role', targetId: 'role-vip', allow: ['view_channel', 'send_messages'], deny: [] },
        { targetType: 'role', targetId: 'role-everyone', allow: [], deny: ['attach_files'] },
        { targetType: 'user', targetId: 'usr-alice', allow: ['attach_files'], deny: [] },
      ],
    };

    // Owner and non-member checks
    assert.equal(resolveChannelPermissions({ id: 'usr-owner', username: 'owner', role: 'user' }, srv, privateCh).view_channel, true);
    assert.equal(resolveChannelPermissions({ id: 'usr-stranger', username: 'stranger', role: 'user' }, srv, privateCh).view_channel, false);

    // Regular @everyone member bob cannot view private channel
    const bobPerms = resolveChannelPermissions({ id: 'usr-bob', username: 'bob', role: 'user' }, srv, privateCh);
    assert.equal(bobPerms.view_channel, false);
    assert.equal(bobPerms.send_messages, false);

    // VIP member alice gets view_channel from role-vip allow, and attach_files from user override beating @everyone deny
    const alicePerms = resolveChannelPermissions({ id: 'usr-alice', username: 'alice', role: 'user' }, srv, privateCh);
    assert.equal(alicePerms.view_channel, true);
    assert.equal(alicePerms.send_messages, true);
    assert.equal(alicePerms.attach_files, true);

    // Role tier: deny wins over allow when two roles conflict and no user override exists
    const conflictCh: Channel = {
      id: 'ch-conflict',
      serverId: 'srv-1',
      name: 'salt-okuma',
      type: 'text',
      permissionOverrides: [
        { targetType: 'role', targetId: 'role-vip', allow: ['send_messages'], deny: [] },
        { targetType: 'role', targetId: 'role-everyone', allow: [], deny: ['send_messages'] },
      ],
    };
    const aliceConflict = resolveChannelPermissions({ id: 'usr-alice', username: 'alice', role: 'user' }, srv, conflictCh);
    assert.equal(aliceConflict.view_channel, true);
    assert.equal(aliceConflict.send_messages, false);
  });

  it('preserves open defaults when server roles array is empty and sanitizes overrides', () => {
    const emptyRoleSrv = makeServer({ roles: [] });
    const openCh: Channel = { id: 'ch-open', serverId: 'srv-1', name: 'open', type: 'text' };
    assert.equal(resolveChannelPermissions({ id: 'usr-bob', username: 'bob', role: 'user' }, emptyRoleSrv, openCh).send_messages, true);

    const sanitized = sanitizePermissionOverrides([
      { targetType: 'role', targetId: 'role-vip', allow: ['view_channel', 'bogus_perm'], deny: ['attach_files', 'view_channel'] },
      { targetType: 'invalid', targetId: 'x', allow: ['view_channel'], deny: [] },
    ]);
    assert.equal(sanitized.length, 1);
    assert.deepEqual(sanitized[0].allow, ['view_channel']);
    assert.deepEqual(sanitized[0].deny, ['attach_files']);
  });
});

describe('v1.0.0 WebAuthn zero-dependency CBOR/ES256 verifier', () => {
  it('verifies P-256 registration, signs assertions, increments signCount, and blocks replay/bad challenges', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const xBuf = Buffer.from(jwk.x!, 'base64url');
    const yBuf = Buffer.from(jwk.y!, 'base64url');

    const rpId = 'localhost';
    const origin = 'http://localhost:5173';
    const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
    const credId = Buffer.from('cred-p256-001', 'utf8');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(credId.length, 0);

    const coseKey = new Map<unknown, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, xBuf],
      [-3, yBuf],
    ]);
    const regAuthData = Buffer.concat([
      rpIdHash,
      Buffer.from([0x45]), // UP | UV | AT
      Buffer.alloc(4), // signCount = 0
      Buffer.alloc(16), // aaguid
      lenBuf,
      credId,
      encodeCbor(coseKey),
    ]);
    const attObj = new Map<unknown, unknown>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', regAuthData],
    ]);

    const regChallenge = base64UrlEncode(crypto.randomBytes(32));
    const regClientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: regChallenge, origin }),
      'utf8'
    );

    const registered = verifyPasskeyRegistration({
      attestationObjectB64Url: base64UrlEncode(encodeCbor(attObj)),
      clientDataJSONB64Url: base64UrlEncode(regClientData),
      expectedChallenge: regChallenge,
      expectedRpId: rpId,
      expectedOrigins: [origin],
    });
    assert.equal(registered.credentialId, base64UrlEncode(credId));
    assert.ok(registered.publicKeySpkiBase64.length > 20);

    // Authentication with signCount = 1
    const loginChallenge = base64UrlEncode(crypto.randomBytes(32));
    const loginClientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: loginChallenge, origin }),
      'utf8'
    );
    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32BE(1, 0);
    const loginAuthData = Buffer.concat([rpIdHash, Buffer.from([0x05]), countBuf]);
    const signedBytes = Buffer.concat([
      loginAuthData,
      crypto.createHash('sha256').update(loginClientData).digest(),
    ]);
    const sig = crypto.sign('sha256', signedBytes, privateKey);

    const authRes = verifyPasskeyAuthentication({
      authenticatorDataB64Url: base64UrlEncode(loginAuthData),
      clientDataJSONB64Url: base64UrlEncode(loginClientData),
      signatureB64Url: base64UrlEncode(sig),
      expectedChallenge: loginChallenge,
      expectedRpId: rpId,
      expectedOrigins: [origin],
      publicKeySpkiBase64: registered.publicKeySpkiBase64,
      previousCounter: 0,
    });
    assert.equal(authRes.newCounter, 1);

    // Replay with lower/equal counter must fail
    assert.throws(
      () =>
        verifyPasskeyAuthentication({
          authenticatorDataB64Url: base64UrlEncode(loginAuthData),
          clientDataJSONB64Url: base64UrlEncode(loginClientData),
          signatureB64Url: base64UrlEncode(sig),
          expectedChallenge: loginChallenge,
          expectedRpId: rpId,
          expectedOrigins: [origin],
          publicKeySpkiBase64: registered.publicKeySpkiBase64,
          previousCounter: 1,
        }),
      /WEBAUTHN_COUNTER_REPLAY/
    );

    // Mismatched challenge must fail
    assert.throws(
      () =>
        verifyPasskeyAuthentication({
          authenticatorDataB64Url: base64UrlEncode(loginAuthData),
          clientDataJSONB64Url: base64UrlEncode(loginClientData),
          signatureB64Url: base64UrlEncode(sig),
          expectedChallenge: 'wrong-challenge',
          expectedRpId: rpId,
          expectedOrigins: [origin],
          publicKeySpkiBase64: registered.publicKeySpkiBase64,
          previousCounter: 0,
        }),
      /WEBAUTHN_CHALLENGE_MISMATCH/
    );
  });
});

describe('v1.0.0 ScheduledMessagesService, Automation, Bots & Stage', () => {
  it('dispatches due one-shot and recurring scheduled messages accurately', () => {
    const srv = makeServer();
    const now = Date.UTC(2026, 10, 21, 12, 0, 0);
    const messagesMap: Record<string, Message[]> = {};
    const emitted: Array<{ ch: string; content: string }> = [];

    const items: ScheduledMessage[] = [
      {
        id: 'sch-1',
        serverId: 'srv-1',
        channelId: 'ch-1',
        authorUsername: 'owner',
        authorAvatar: '👑',
        content: 'Tek seferlik duyuru',
        scheduledFor: new Date(now - 5_000).toISOString(),
        status: 'pending',
        createdAt: new Date(now - 60_000).toISOString(),
      },
      {
        id: 'sch-2',
        serverId: 'srv-1',
        channelId: 'ch-1',
        authorUsername: 'owner',
        authorAvatar: '👑',
        content: 'Saatlik hatırlatma',
        scheduledFor: new Date(now - 1_000).toISOString(),
        repeatIntervalMinutes: 60,
        status: 'pending',
        createdAt: new Date(now - 60_000).toISOString(),
      },
      {
        id: 'sch-3',
        serverId: 'srv-1',
        channelId: 'ch-1',
        authorUsername: 'owner',
        authorAvatar: '👑',
        content: 'Gelecek mesaj',
        scheduledFor: new Date(now + 120_000).toISOString(),
        status: 'pending',
        createdAt: new Date(now - 10_000).toISOString(),
      },
    ];

    const service = new ScheduledMessagesService({
      scheduledMessages: items,
      servers: [srv],
      messages: messagesMap,
      saveScheduledMessages: () => {},
      saveChannelMessageUpsert: () => {},
      emitToChannelAudience: (ch, _sid, _ev, payload) => {
        emitted.push({ ch, content: (payload as Message).content });
      },
    });

    const count = service.tick(now);
    assert.equal(count, 2);
    assert.equal(items[0].status, 'sent');
    assert.equal(items[1].status, 'pending');
    assert.ok(new Date(items[1].scheduledFor).getTime() > now);
    assert.equal(items[2].status, 'pending');
    assert.equal(messagesMap['ch-1']?.length, 2);
    assert.equal(emitted.length, 2);
  });

  it('evaluates automation triggers (keywords, links, spam burst, member_join) and respects immunity', () => {
    const srv = makeServer();
    const tracker = new Map<string, number[]>();
    const rules: ServerAutomationRule[] = [
      {
        id: 'r-kw',
        serverId: 'srv-1',
        name: 'Yasak Kelime',
        enabled: true,
        triggerType: 'message_contains',
        keywords: ['hile', 'scam'],
        actionType: 'delete_message',
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
      {
        id: 'r-link',
        serverId: 'srv-1',
        name: 'Link Engeli',
        enabled: true,
        triggerType: 'link_posted',
        actionType: 'warn_member',
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
      {
        id: 'r-spam',
        serverId: 'srv-1',
        name: 'Spam Koruması',
        enabled: true,
        triggerType: 'spam_burst',
        spamCount: 3,
        spamWindowSeconds: 10,
        actionType: 'timeout_user',
        timeoutMinutes: 5,
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
      {
        id: 'r-join-vip',
        serverId: 'srv-1',
        name: 'Otomatik VIP',
        enabled: true,
        triggerType: 'member_join',
        actionType: 'assign_role',
        roleId: 'role-vip',
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
      {
        id: 'r-join-admin',
        serverId: 'srv-1',
        name: 'Yetkili Rol Güvenliği',
        enabled: true,
        triggerType: 'member_join',
        actionType: 'assign_role',
        roleId: 'role-admin', // must be ignored because privileged!
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
    ];

    const kwRes = evaluateAutomationRules(
      { type: 'message', server: srv, username: 'bob', userRole: 'user', channelId: 'ch-1', content: 'bedava hile linki https://evil.test' },
      rules,
      tracker
    );
    assert.equal(kwRes.blockMessage, true);
    assert.ok(kwRes.warnReason);

    // Owner/admin immunity
    const ownerRes = evaluateAutomationRules(
      { type: 'message', server: srv, username: 'owner', userRole: 'user', channelId: 'ch-1', content: 'hile https://ok.test' },
      rules,
      tracker
    );
    assert.equal(ownerRes.blockMessage, false);

    // Spam burst on 3rd quick message from bob (first was already recorded above)
    evaluateAutomationRules({ type: 'message', server: srv, username: 'bob', userRole: 'user', channelId: 'ch-1', content: 'ping 2' }, rules, tracker);
    const spamRes = evaluateAutomationRules(
      { type: 'message', server: srv, username: 'bob', userRole: 'user', channelId: 'ch-1', content: 'ping 3' },
      rules,
      tracker
    );
    assert.equal(spamRes.blockMessage, true);
    assert.equal(spamRes.timeoutMinutes, 5);

    // Member join only assigns non-privileged role-vip
    const joinRes = evaluateAutomationRules(
      { type: 'member_join', server: srv, username: 'newcomer', userRole: 'user' },
      rules,
      tracker
    );
    assert.deepEqual(joinRes.assignRoleIds, ['role-vip']);
  });

  it('authenticates valid Bot tokens and cleans up Stage state on leave', () => {
    const rawSecret = 'super-secret-bot-key-2026';
    const bots: ServerBot[] = [
      {
        id: 'bot-1',
        serverId: 'srv-1',
        name: 'HelperBot',
        avatar: '🤖',
        tokenHash: hashBotToken(rawSecret),
        tokenPrefix: 'bot-1.super...',
        events: ['message_create'],
        slashCommands: [],
        enabled: true,
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
      {
        id: 'bot-off',
        serverId: 'srv-1',
        name: 'OffBot',
        avatar: '🤖',
        tokenHash: hashBotToken('disabled-secret'),
        tokenPrefix: 'bot-off.disab...',
        events: [],
        slashCommands: [],
        enabled: false,
        createdBy: 'owner',
        createdAt: '2026-01-01',
      },
    ];

    assert.equal(verifyBotAuthHeader(`Bot bot-1.${rawSecret}`, bots)?.id, 'bot-1');
    assert.equal(verifyBotAuthHeader('Bot bot-1.wrong-secret', bots), null);
    assert.equal(verifyBotAuthHeader('Bot bot-off.disabled-secret', bots), null);

    const stageCh: Channel = { id: 'ch-stage', serverId: 'srv-1', name: 'sahne', type: 'stage' };
    const st = ensureStageState(stageCh);
    st.speakerUsernames.push('alice');
    st.raisedHands.push('bob', 'alice');
    const srv = makeServer({ channels: [stageCh] });

    let saved = false;
    let emittedStateCount = 0;
    const changed = handleUserLeaveStage(
      [srv],
      'Alice',
      'ch-stage',
      () => {
        emittedStateCount += 1;
      },
      () => {
        saved = true;
      }
    );

    assert.equal(changed, true);
    assert.equal(saved, true);
    assert.equal(emittedStateCount, 1);
    assert.deepEqual(st.speakerUsernames, []);
    assert.deepEqual(st.raisedHands, ['bob']);
  });
});
