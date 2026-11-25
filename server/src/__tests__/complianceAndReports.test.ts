import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import type { ContentReport, Message, RegisteredAccount, Server, User } from '../types.js';
import { registerComplianceAndReportsRoutes } from '../features/complianceAndReportsRoutes.js';

function makeSessionHelpers(secret: string) {
  const makeToken = (username: string) => {
    const payload = Buffer.from(
      JSON.stringify({ u: username, iat: Date.now(), exp: Date.now() + 60_000 })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  };
  const verifyWithMeta = (token: string) => {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { u: string; iat: number };
    return { username: parsed.u, iat: parsed.iat || 0 };
  };
  return { makeToken, verifyWithMeta };
}

describe('v1.1.0 Compliance & Reporting (5651, KVKK Export, Accept-Terms)', () => {
  it('handles content reporting lifecycle, KVKK sanitized data export, and terms re-consent', async () => {
    const app = express();
    app.use(express.json());
    const httpServer = http.createServer(app);
    const { makeToken, verifyWithMeta } = makeSessionHelpers('compliance-test-secret');

    const accounts = new Map<string, RegisteredAccount>([
      [
        'adminuser',
        {
          id: 'acc-admin',
          username: 'AdminUser',
          email: 'admin@example.com',
          password: 'scrypt$secret-hash-must-not-leak',
          avatar: '🛡️',
          role: 'admin',
          createdAt: '2026-11-01',
          walletBalance: 500,
          friends: ['Alice'],
          twoFactorEnabled: true,
          twoFactorSecret: 'BASE32SECRET',
          twoFactorBackupCodes: ['scrypt$backup1'],
          passkeys: [
            {
              id: 'pk-1',
              publicKeySpkiBase64: 'MFkwEwYHKoZIzj0CAQY...',
              counter: 2,
              label: 'Windows Hello',
              createdAt: '2026-11-10T00:00:00.000Z',
            },
          ],
          acceptedTermsVersion: '1.0.0',
          acceptedTermsAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      [
        'alice',
        {
          id: 'acc-alice',
          username: 'Alice',
          email: 'alice@example.com',
          password: 'scrypt$alice-hash-secret',
          avatar: '🎮',
          role: 'user',
          createdAt: '2026-11-02',
          walletBalance: 100,
          friends: ['AdminUser'],
          acceptedTermsVersion: '1.0.0',
          acceptedTermsAt: '2026-11-02T00:00:00.000Z',
        },
      ],
    ]);

    const servers: Server[] = [
      {
        id: 'srv-1',
        name: 'Test Server',
        icon: '🚀',
        ownerId: 'acc-admin',
        roles: [
          {
            id: 'r-member',
            name: '@everyone',
            color: '#94a3b8',
            position: 0,
            permissions: ['send_messages'],
            isDefault: true,
          },
        ],
        members: [
          { userId: 'acc-admin', username: 'AdminUser', avatar: '🛡️', roleIds: ['r-member'], joinedAt: '2026-11-01', isOwner: true },
          { userId: 'acc-alice', username: 'Alice', avatar: '🎮', roleIds: ['r-member'], joinedAt: '2026-11-02', isOwner: false },
        ],
        channels: [{ id: 'ch-1', name: 'genel', type: 'text', serverId: 'srv-1' }],
      },
    ];

    const messages: Record<string, Message[]> = {
      'ch-1': [
        {
          id: 'msg-bad-1',
          serverId: 'srv-1',
          channelId: 'ch-1',
          author: { id: 'acc-admin', username: 'AdminUser', avatar: '🛡️' },
          content: 'Kural ihlali içeren <örnek> mesaj',
          timestamp: '10:00',
        },
      ],
    };

    const reports: ContentReport[] = [];
    const activeUsers = new Map<string, User>();
    const emittedEvents: Array<{ event: string; payload: unknown }> = [];

    registerComplianceAndReportsRoutes(app, {
      registeredAccounts: accounts,
      activeUsers,
      servers,
      messages,
      contentReports: reports,
      saveContentReports: () => {},
      saveAccounts: () => {},
      emitToChannelAudience: (_ch, _srv, event, payload) => {
        emittedEvents.push({ event, payload });
      },
      sanitizeText: (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      checkServerPermission: (u, s) => u.role === 'admin' || s.ownerId === u.accountId,
      verifySessionTokenWithMeta: verifyWithMeta,
      getAccount: (u) => accounts.get(u),
      legalVersion: '1.1.0',
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const aliceToken = makeToken('Alice');
      const adminToken = makeToken('AdminUser');

      // 1. Unauthenticated POST /api/reports rejected with 401
      const unauth = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: 'AdminUser', reason: 'Spam' }),
      });
      assert.equal(unauth.status, 401);

      // 2. Self-report rejected with 400
      const selfRep = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`,
        },
        body: JSON.stringify({ targetUsername: 'Alice', reason: 'Test kendi' }),
      });
      assert.equal(selfRep.status, 400);

      // 3. Valid report captures sanitized excerpt and sets status='open'
      const validRep = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`,
        },
        body: JSON.stringify({
          targetUsername: 'AdminUser',
          category: 'illegal',
          reason: 'Hakaret ve kural dışı içerik',
          serverId: 'srv-1',
          channelId: 'ch-1',
          messageId: 'msg-bad-1',
        }),
      });
      assert.equal(validRep.status, 200);
      const validRepJson = (await validRep.json()) as { ok: boolean; report: ContentReport };
      assert.equal(validRepJson.ok, true);
      assert.equal(validRepJson.report.status, 'open');
      assert.equal(validRepJson.report.category, 'illegal');
      assert.ok(validRepJson.report.messageExcerpt?.includes('&lt;örnek&gt;'));

      // 4. Non-admin cannot view /api/admin/reports
      const forbiddenAdmin = await fetch(`${baseUrl}/api/admin/reports`, {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      assert.equal(forbiddenAdmin.status, 403);

      // 5. Admin lists reports & resolves with deleteMessage: true
      const adminList = await fetch(`${baseUrl}/api/admin/reports`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(adminList.status, 200);
      const adminListJson = (await adminList.json()) as { ok: boolean; reports: ContentReport[] };
      assert.equal(adminListJson.reports.length, 1);

      const resolveRes = await fetch(`${baseUrl}/api/reports/${validRepJson.report.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'resolved', deleteMessage: true }),
      });
      assert.equal(resolveRes.status, 200);
      const resolveJson = (await resolveRes.json()) as {
        ok: boolean;
        deletedMessage: boolean;
        report: ContentReport;
      };
      assert.equal(resolveJson.deletedMessage, true);
      assert.equal(resolveJson.report.status, 'resolved');
      assert.equal(messages['ch-1'].length, 0);
      assert.equal(emittedEvents[0]?.event, 'message_deleted');

      // 6. KVKK export excludes sensitive secrets while preserving profile & servers
      const exportRes = await fetch(`${baseUrl}/api/account/export`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(exportRes.status, 200);
      const exportRaw = await exportRes.text();
      assert.ok(!exportRaw.includes('secret-hash-must-not-leak'));
      assert.ok(!exportRaw.includes('BASE32SECRET'));
      assert.ok(!exportRaw.includes('MFkwEwYHKoZIzj0CAQY'));
      assert.ok(!exportRaw.includes('scrypt$backup1'));
      const exportJson = JSON.parse(exportRaw) as {
        ok: boolean;
        account: { username: string; passkeys: Array<{ label: string }> };
        servers: Array<{ id: string }>;
      };
      assert.equal(exportJson.account.username, 'AdminUser');
      assert.equal(exportJson.account.passkeys[0].label, 'Windows Hello');
      assert.equal(exportJson.servers[0].id, 'srv-1');

      // 7. Terms re-consent updates account version
      const consentRes = await fetch(`${baseUrl}/api/account/accept-terms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`,
        },
        body: JSON.stringify({ version: '1.1.0' }),
      });
      assert.equal(consentRes.status, 200);
      assert.equal(accounts.get('alice')?.acceptedTermsVersion, '1.1.0');
      assert.ok(accounts.get('alice')?.acceptedTermsAt);
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
