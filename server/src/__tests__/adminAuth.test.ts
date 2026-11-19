import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSessionToken,
  isPrivateOrReservedIp,
  validateExternalWebhookUrl,
  createAuthMiddlewares,
} from '../utils/adminAuth.js';
import type { RegisteredAccount } from '../types.js';

function makeAccount(overrides: Partial<RegisteredAccount> = {}): RegisteredAccount {
  return {
    id: 'u-1',
    username: 'ali',
    email: 'ali@example.com',
    password: 'hash',
    avatar: '🎮',
    role: 'user',
    createdAt: '2026-01-01',
    walletBalance: 100,
    friends: [],
    ...overrides,
  };
}

function createMockRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
  };
  return { res, getStatus: () => statusCode, getBody: () => body };
}

test('extractSessionToken prioritizes Bearer token over cookie and ignores __cookie__', () => {
  assert.equal(
    extractSessionToken({ headers: { authorization: 'Bearer abc.123', cookie: 'cakma_session=cookie.tok' } } as any),
    'abc.123'
  );
  assert.equal(
    extractSessionToken({ headers: { authorization: 'Bearer __cookie__', cookie: 'cakma_session=cookie.tok' } } as any),
    'cookie.tok'
  );
  assert.equal(
    extractSessionToken({ headers: { cookie: 'other=1; cakma_session=enc%2Etok' } } as any),
    'enc.tok'
  );
  assert.equal(extractSessionToken({ headers: {} } as any), null);
});

test('createAuthMiddlewares enforces requireAuth, requireAdmin, and requireSelfOrAdmin', () => {
  const accounts = new Map<string, RegisteredAccount>([
    ['admin', makeAccount({ id: 'u-adm', username: 'Admin', role: 'admin' })],
    ['ali', makeAccount({ id: 'u-ali', username: 'Ali', role: 'user', minTokenIssuedAt: 2000 })],
    ['banned', makeAccount({ id: 'u-ban', username: 'Banned', isBanned: true, bannedUntil: null })],
  ]);

  const tokens: Record<string, { username: string; iat: number }> = {
    tok_admin: { username: 'Admin', iat: 5000 },
    tok_ali_fresh: { username: 'Ali', iat: 3000 },
    tok_ali_revoked: { username: 'Ali', iat: 1000 },
    tok_banned: { username: 'Banned', iat: 5000 },
  };

  const { requireAuth, requireAdmin, requireSelfOrAdmin } = createAuthMiddlewares({
    verifySessionTokenWithMeta: (t) => tokens[t] || null,
    getAccount: (u) => accounts.get(u),
  });

  // 1. Missing token -> 401
  {
    const m = createMockRes();
    let called = false;
    requireAuth({ headers: {} } as any, m.res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(m.getStatus(), 401);
  }

  // 2. Revoked token (iat < minTokenIssuedAt) -> 401
  {
    const m = createMockRes();
    let called = false;
    requireAuth({ headers: { authorization: 'Bearer tok_ali_revoked' } } as any, m.res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(m.getStatus(), 401);
  }

  // 3. Banned user -> 401
  {
    const m = createMockRes();
    let called = false;
    requireAuth({ headers: { cookie: 'cakma_session=tok_banned' } } as any, m.res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(m.getStatus(), 401);
  }

  // 4. requireAdmin rejects regular user (403) and allows admin
  {
    const mUser = createMockRes();
    let userCalled = false;
    requireAdmin({ headers: { authorization: 'Bearer tok_ali_fresh' } } as any, mUser.res, () => {
      userCalled = true;
    });
    assert.equal(userCalled, false);
    assert.equal(mUser.getStatus(), 403);

    const mAdm = createMockRes();
    let admCalled = false;
    const reqAdm: any = { headers: { cookie: 'cakma_session=tok_admin' } };
    requireAdmin(reqAdm, mAdm.res, () => {
      admCalled = true;
    });
    assert.equal(admCalled, true);
    assert.equal(reqAdm.authUser?.username, 'Admin');
  }

  // 5. requireSelfOrAdmin restricts user to self, allows admin on anyone
  {
    const mw = requireSelfOrAdmin('username');
    const mSelf = createMockRes();
    let selfOk = false;
    mw({ headers: { authorization: 'Bearer tok_ali_fresh' }, params: { username: 'ali' } } as any, mSelf.res, () => {
      selfOk = true;
    });
    assert.equal(selfOk, true);

    const mOther = createMockRes();
    let otherOk = false;
    mw({ headers: { authorization: 'Bearer tok_ali_fresh' }, params: { username: 'veli' } } as any, mOther.res, () => {
      otherOk = true;
    });
    assert.equal(otherOk, false);
    assert.equal(mOther.getStatus(), 403);

    const mAdmOther = createMockRes();
    let admOtherOk = false;
    mw({ headers: { authorization: 'Bearer tok_admin' }, params: { username: 'veli' } } as any, mAdmOther.res, () => {
      admOtherOk = true;
    });
    assert.equal(admOtherOk, true);
  }
});

test('isPrivateOrReservedIp detects private IPv4 and IPv6 ranges', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.10', '169.254.169.254', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateOrReservedIp(ip), true, `Expected ${ip} to be private/reserved`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPrivateOrReservedIp(ip), false, `Expected ${ip} to be public`);
  }
});

test('validateExternalWebhookUrl blocks SSRF targets and allows public HTTPS URLs', async () => {
  const blockedTargets = [
    'http://127.0.0.1:7880/hook',
    'http://localhost:4000/api/health',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://192.168.0.1/admin',
    'file:///etc/passwd',
    'https://user:pass@discord.com/api/webhooks/123',
  ];
  for (const url of blockedTargets) {
    const res = await validateExternalWebhookUrl(url, { skipDns: true });
    assert.equal(res.ok, false, `Expected ${url} to be blocked`);
  }

  const allowed = await validateExternalWebhookUrl('https://discord.com/api/webhooks/123/abc', { skipDns: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.normalizedUrl, 'https://discord.com/api/webhooks/123/abc');
});
