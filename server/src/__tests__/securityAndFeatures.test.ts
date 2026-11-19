import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import type { RegisteredAccount, Server, User } from '../types.js';
import { toPublicUser } from '../utils/publicUser.js';
import { validatePasswordAgainstPolicy } from '../utils/passwordPolicy.js';
import { parseOpenGraphHtml } from '../features/chatEnhancementsRoutes.js';
import { createAccountSecurityManager } from '../features/accountSecurityHandlers.js';
import { hashPasswordAsync, verifyPasswordAsync } from '../utils/authCrypto.js';
import { generateBase32Secret } from '../totp.js';

describe('securityAndFeatures unit tests', () => {
  it('toPublicUser strips private fields while keeping public profile fields', () => {
    const fullUser: User = {
      id: 'sock-1',
      accountId: 'usr-1',
      username: 'Alice',
      email: 'alice@secret.test',
      role: 'user',
      avatar: '🛡️',
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      walletBalance: 999,
      blockedUsers: ['bob'],
      twoFactorEnabled: true,
      isBanned: false,
      bannedReason: 'none',
      bannedUntil: 123456,
      bio: 'Hello world',
    };

    const pub = toPublicUser(fullUser);
    assert.equal(pub.id, 'sock-1');
    assert.equal(pub.username, 'Alice');
    assert.equal(pub.bio, 'Hello world');
    assert.equal('email' in pub, false);
    assert.equal('walletBalance' in pub, false);
    assert.equal('blockedUsers' in pub, false);
    assert.equal('twoFactorEnabled' in pub, false);
    assert.equal('isBanned' in pub, false);
    assert.equal('bannedReason' in pub, false);
    assert.equal('bannedUntil' in pub, false);
  });

  it('validatePasswordAgainstPolicy enforces weak blocklist, username match, and strong policy', () => {
    assert.equal(validatePasswordAgainstPolicy('', 'ali', false).ok, false);
    assert.equal(validatePasswordAgainstPolicy('Ali', 'ali', false).ok, false);
    assert.equal(validatePasswordAgainstPolicy('123456', 'ali', false).ok, false);
    assert.equal(validatePasswordAgainstPolicy('abc12', 'ali', false).ok, false);
    assert.equal(validatePasswordAgainstPolicy('secret9', 'ali', false).ok, true);

    assert.equal(validatePasswordAgainstPolicy('secret99', 'ali', true).ok, false);
    assert.equal(validatePasswordAgainstPolicy('Secret99', 'ali', true).ok, true);
  });

  it('parseOpenGraphHtml decodes entities, resolves relative images, and rejects javascript URLs', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Test &amp; Preview &#39;Title&#39;" />
          <meta property="og:description" content="Rich description &lt;safe&gt;" />
          <meta property="og:image" content="/assets/cover.png" />
          <meta property="og:site_name" content="ExampleSite" />
        </head>
      </html>
    `;
    const parsed = parseOpenGraphHtml(html, 'https://example.com/post/1');
    assert.ok(parsed);
    assert.equal(parsed.title, "Test & Preview 'Title'");
    assert.equal(parsed.description, 'Rich description <safe>');
    assert.equal(parsed.image, 'https://example.com/assets/cover.png');
    assert.equal(parsed.siteName, 'ExampleSite');

    const unsafeHtml = `
      <html><head>
        <title>Fallback Title</title>
        <meta property="og:image" content="javascript:alert(1)" />
      </head></html>
    `;
    const fallbackParsed = parseOpenGraphHtml(unsafeHtml, 'https://www.sub.example.org/item');
    assert.ok(fallbackParsed);
    assert.equal(fallbackParsed.title, 'Fallback Title');
    assert.equal(fallbackParsed.image, undefined);
    assert.equal(fallbackParsed.siteName, 'sub.example.org');
  });

  it('accountSecurityManager handles forgot-password OTP reset, email change OTP, and account deletion', async () => {
    const sentEmails: Array<{ to: string; html?: string }> = [];
    const disconnectedSockets: string[] = [];
    const emittedUpdates: User[] = [];

    const initialPassHash = await hashPasswordAsync('OldPass123');
    const aliceAcc: RegisteredAccount = {
      id: 'usr-alice',
      username: 'Alice',
      email: 'alice@example.com',
      password: initialPassHash,
      avatar: '🛡️',
      role: 'user',
      createdAt: '2026-11-19',
      walletBalance: 100,
      friends: ['bob'],
      twoFactorEnabled: false,
    };
    const bobAcc: RegisteredAccount = {
      id: 'usr-bob',
      username: 'Bob',
      email: 'bob@example.com',
      password: initialPassHash,
      avatar: '🎮',
      role: 'user',
      createdAt: '2026-11-19',
      walletBalance: 100,
      friends: ['alice'],
    };

    const registeredAccounts = new Map<string, RegisteredAccount>([
      ['alice', aliceAcc],
      ['bob', bobAcc],
    ]);

    const aliceOnline: User = {
      id: 'sock-alice-1',
      accountId: 'usr-alice',
      username: 'Alice',
      email: 'alice@example.com',
      role: 'user',
      avatar: '🛡️',
      status: 'online',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
    };
    const activeUsers = new Map<string, User>([['sock-alice-1', aliceOnline]]);
    const activeSessions = new Map([
      ['sock-alice-1', { socketId: 'sock-alice-1', username: 'Alice', ip: '1.2.3.4', userAgent: 'Test', connectedAt: 'now' }],
    ]);

    const servers: Server[] = [
      {
        id: 'srv-1',
        name: 'Test Server',
        ownerId: 'usr-alice',
        channels: [{ id: 'ch-1', name: 'general', type: 'text', serverId: 'srv-1' }],
        roles: [],
        members: [
          { userId: 'usr-alice', username: 'Alice', avatar: '🛡️', roleIds: ['role-owner'], joinedAt: '2026-01-01', isOwner: true },
          { userId: 'usr-bob', username: 'Bob', avatar: '🎮', roleIds: ['role-everyone'], joinedAt: '2026-01-02' },
        ],
      },
    ];

    const pendingFriendRequests = new Map();
    let pushSubs = [
      { username: 'Alice', endpoint: 'https://push.test/1', subscription: {}, updatedAt: 'now' },
      { username: 'Bob', endpoint: 'https://push.test/2', subscription: {}, updatedAt: 'now' },
    ];

    const fakeSockets = new Map<string, any>([
      [
        'sock-alice-1',
        {
          emit: () => {},
          disconnect: () => {
            disconnectedSockets.push('sock-alice-1');
          },
        },
      ],
    ]);

    const manager = createAccountSecurityManager({
      io: {
        to: () => ({ emit: () => {} }) as any,
        emit: () => true,
        sockets: { sockets: fakeSockets } as any,
      } as any,
      registeredAccounts,
      activeUsers,
      activeSessions,
      servers,
      pendingFriendRequests,
      getPushSubscriptions: () => pushSubs,
      setPushSubscriptions: (next) => {
        pushSubs = next;
      },
      savePushSubscriptions: () => {},
      saveAccounts: () => {},
      saveServers: () => {},
      saveFriendRequests: () => {},
      addAuditLog: () => {},
      emitUserUpdated: (u) => {
        emittedUpdates.push({ ...u });
      },
      emitServerUpdatedToMembers: () => {},
      sendSmtpEmail: async (to, _subject, _text, html) => {
        sentEmails.push({ to, html });
        return { ok: true, transport: 'smtp' };
      },
      disposableEmailDomains: new Set(['mailinator.com']),
      getSystemConfig: () => ({ requireStrongPasswords: true }),
      getClientIp: () => '1.2.3.4',
      isIpBanned: () => false,
    });

    try {
      // 1. Non-enumerating forgot-password probe for unknown email
      const probeRes = await manager.requestPasswordResetCode('nobody@example.com', '1.2.3.4');
      assert.equal(probeRes.success, true);
      assert.equal(sentEmails.length, 0);

      // 2. Real forgot-password request & confirm reset
      const resetReq = await manager.requestPasswordResetCode('alice@example.com', '1.2.3.4');
      assert.equal(resetReq.success, true);
      assert.equal(sentEmails.length, 1);
      const resetCodeMatch = (sentEmails[0].html || '').match(/>(\d{6})</);
      assert.ok(resetCodeMatch);

      const weakConfirm = await manager.confirmPasswordReset('alice@example.com', resetCodeMatch[1], 'weak', '1.2.3.4');
      assert.equal(weakConfirm.success, false);

      const resetConfirm = await manager.confirmPasswordReset('alice@example.com', resetCodeMatch[1], 'NewPass99', '1.2.3.4');
      assert.equal(resetConfirm.success, true);
      assert.equal(await verifyPasswordAsync('NewPass99', aliceAcc.password), true);
      assert.equal(disconnectedSockets.includes('sock-alice-1'), true);

      // Re-add alice session for email change & deletion tests
      activeUsers.set('sock-alice-2', { ...aliceOnline, id: 'sock-alice-2' });

      // 3. Email change OTP flow
      const badPassEmailReq = await manager.requestEmailChangeCode('alice', 'WrongPass', 'alice2@example.com');
      assert.equal(badPassEmailReq.success, false);

      const emailReq = await manager.requestEmailChangeCode('alice', 'NewPass99', 'alice2@example.com');
      assert.equal(emailReq.success, true);
      const changeCodeMatch = (sentEmails[1].html || '').match(/>(\d{6})</);
      assert.ok(changeCodeMatch);

      const emailConfirm = manager.confirmEmailChange('alice', changeCodeMatch[1]);
      assert.equal(emailConfirm.success, true);
      assert.equal(aliceAcc.email, 'alice2@example.com');
      assert.equal(emittedUpdates.some((u) => u.email === 'alice2@example.com'), true);

      // 4. Account deletion checks + ownership transfer
      aliceAcc.twoFactorEnabled = true;
      aliceAcc.twoFactorSecret = generateBase32Secret(20);

      const badConfirmText = await manager.deleteAccount('alice', 'NewPass99', 'NO');
      assert.equal(badConfirmText.success, false);

      const bad2fa = await manager.deleteAccount('alice', 'NewPass99', 'SİL', '000000');
      assert.equal(bad2fa.success, false);

      // Generate temporary backup code hash to verify 2FA deletion cleanly
      const backupPlain = crypto.randomBytes(4).toString('hex').toUpperCase();
      aliceAcc.twoFactorBackupCodes = [await hashPasswordAsync(backupPlain)];

      const deletedRes = await manager.deleteAccount('alice', 'NewPass99', 'SİL', backupPlain);
      assert.equal(deletedRes.success, true);
      assert.equal(registeredAccounts.has('alice'), false);
      assert.deepEqual(bobAcc.friends, []);
      assert.equal(pushSubs.length, 1);
      assert.equal(servers[0].ownerId, 'usr-bob');
      assert.equal(servers[0].members.length, 1);
    } finally {
      manager.stop();
    }
  });
});
