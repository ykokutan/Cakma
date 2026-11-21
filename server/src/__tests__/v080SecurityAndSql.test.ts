import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type cors from 'cors';
import {
  buildAllowedOrigins,
  createCorsOptionsDelegate,
  createSocketCorsOriginValidator,
} from '../utils/corsConfig.js';
import { createLogger, redactSensitive } from '../utils/logger.js';
import { createSocketEventRateLimiter, validatePayload } from '../utils/socketGuard.js';
import { SqliteStore } from '../sqliteStore.js';
import { SHARED_CONTRACT_VERSION } from '../sharedContracts.js';
import type { Message } from '../types.js';

function makeMsg(id: string, channelId: string, content: string): Message {
  return {
    id,
    serverId: 'srv-1',
    channelId,
    author: { id: 'u-1', username: 'Alice', avatar: '🛡️' },
    content,
    timestamp: '12:00',
  };
}

describe('v0.8.0 security, logger, guard, SQLite & contract suite', () => {
  it('corsConfig rejects disallowed origins without throwing Error and supports env + same-host', async () => {
    const allowedList = buildAllowedOrigins(['https://app.example'], {
      CORS_ALLOWED_ORIGINS: 'https://extra.example, https://panel.example',
    });
    assert.deepEqual(allowedList, ['https://app.example', 'https://extra.example', 'https://panel.example']);

    const warnOrigins: string[] = [];
    const delegate = createCorsOptionsDelegate(['https://app.example'], {
      env: { CORS_ALLOWED_ORIGINS: 'https://cdn.example' },
      warnCooldownMs: 60_000,
      onBlocked: (orig) => warnOrigins.push(orig),
    });

    const invokeDelegate = (headers: Record<string, string>) =>
      new Promise<{ err: Error | null; opts: cors.CorsOptions | undefined }>((resolve) => {
        delegate({ headers } as cors.CorsRequest, (err, opts) => resolve({ err, opts }));
      });

    const blocked = await invokeDelegate({ origin: 'https://evil.example', host: 'app.example' });
    assert.equal(blocked.err, null);
    assert.equal(blocked.opts?.origin, false);

    // Rate-limited warning should only fire once within cooldown for same origin
    await invokeDelegate({ origin: 'https://evil.example', host: 'app.example' });
    assert.equal(warnOrigins.length, 1);

    const envAllowed = await invokeDelegate({ origin: 'https://cdn.example', host: 'api.example' });
    assert.equal(envAllowed.err, null);
    assert.equal(envAllowed.opts?.origin, true);

    const sameHost = await invokeDelegate({ origin: 'https://chat.local:3001', host: 'chat.local:3001' });
    assert.equal(sameHost.err, null);
    assert.equal(sameHost.opts?.origin, true);

    const socketValidator = createSocketCorsOriginValidator(['https://app.example'], {
      onBlocked: () => {},
    });
    await new Promise<void>((resolve) => {
      socketValidator('https://evil.example', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, false);
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      socketValidator('https://app.example', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
        resolve();
      });
    });
  });

  it('logger redacts sensitive fields deeply and emits structured JSON', () => {
    const redacted = redactSensitive({
      username: 'Alice',
      password: 'super-secret-password',
      nested: {
        token: 'tok-123',
        cookie: 'cakma_session=xyz',
        authorization: 'Bearer abc',
        secret: 's1',
        smtpPass: 'mailpw',
        privateKey: 'pem',
        safeField: 'visible',
      },
    }) as Record<string, any>;

    assert.equal(redacted.username, 'Alice');
    assert.equal(redacted.password, '[REDACTED]');
    assert.equal(redacted.nested.token, '[REDACTED]');
    assert.equal(redacted.nested.cookie, '[REDACTED]');
    assert.equal(redacted.nested.authorization, '[REDACTED]');
    assert.equal(redacted.nested.secret, '[REDACTED]');
    assert.equal(redacted.nested.smtpPass, '[REDACTED]');
    assert.equal(redacted.nested.privateKey, '[REDACTED]');
    assert.equal(redacted.nested.safeField, 'visible');

    const lines: string[] = [];
    const log = createLogger({
      format: 'json',
      level: 'info',
      sink: (_lvl, line) => lines.push(line),
    });
    log.warn('AUTH_EVENT', { username: 'Bob', password: 'pw', secret: 'sec' });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, 'warn');
    assert.equal(parsed.msg, 'AUTH_EVENT');
    assert.equal(parsed.username, 'Bob');
    assert.equal(parsed.password, '[REDACTED]');
    assert.equal(parsed.secret, '[REDACTED]');
  });

  it('socketGuard validates payloads and rate-limits socket events with clearSocket & prune', () => {
    const valid = validatePayload<{ channelId: string; radius?: number }>(
      { channelId: '  ch-1\u0000 ', radius: 15 },
      {
        channelId: { type: 'string', required: true, minLen: 1, maxLen: 64 },
        radius: { type: 'number', required: false, min: 5, max: 50 },
      }
    );
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.data.channelId, 'ch-1');
      assert.equal(valid.data.radius, 15);
    }

    const missing = validatePayload({ radius: 10 }, { channelId: { type: 'string', required: true } });
    assert.equal(missing.ok, false);

    const outOfRange = validatePayload(
      { channelId: 'ch-1', radius: 999 },
      {
        channelId: { type: 'string', required: true },
        radius: { type: 'number', max: 50 },
      }
    );
    assert.equal(outOfRange.ok, false);

    const limiter = createSocketEventRateLimiter();
    assert.equal(limiter.allow('sock-1', 'search', 2, 1000, 1000), true);
    assert.equal(limiter.allow('sock-1', 'search', 2, 1000, 1200), true);
    assert.equal(limiter.allow('sock-1', 'search', 2, 1000, 1300), false);
    assert.equal(limiter.allow('sock-1', 'search', 2, 1000, 2500), true);

    limiter.clearSocket('sock-1');
    assert.equal(limiter.allow('sock-1', 'search', 1, 1000, 2600), true);

    limiter.prune(500, 5000);
    assert.equal(limiter.buckets.size, 0);
  });

  it('SqliteStore persists read_cursors, audit_logs, and centered getMessagesAround context', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-v080-sql-'));
    const store = new SqliteStore(tmpDir);
    try {
      const ok = await store.init();
      assert.equal(ok, true);

      store.upsertReadCursor('Alice', 'ch-general', 'm-5');
      store.upsertReadCursor('Alice', 'ch-random', 'm-2');
      assert.deepEqual(store.getReadCursorsForUser('alice'), {
        'ch-general': 'm-5',
        'ch-random': 'm-2',
      });
      const all = store.getAllReadCursors();
      assert.equal(all.get('alice')?.['ch-general'], 'm-5');
      store.deleteReadCursorsForUser('alice');
      assert.deepEqual(store.getReadCursorsForUser('alice'), {});

      store.insertAuditLog({
        id: 'log-1',
        action: 'TEST_ACTION',
        details: 'Details 1',
        type: 'info',
        timestamp: '12:00',
      });
      store.importAuditLogs([
        { id: 'log-3', action: 'NEWER', details: 'Details 3', type: 'warn', timestamp: '12:02' },
        { id: 'log-2', action: 'OLDER', details: 'Details 2', type: 'auth', timestamp: '12:01' },
      ]);
      const logs = store.listAuditLogs(10);
      assert.equal(logs.length, 3);
      assert.equal(logs[0].id, 'log-3');

      for (let i = 1; i <= 11; i++) {
        store.upsertMessage('ch-ctx', makeMsg(`m-${i}`, 'ch-ctx', `Message ${i}`));
      }
      const ctx = store.getMessagesAround('ch-ctx', 'm-6', 2);
      assert.equal(ctx.found, true);
      assert.equal(ctx.hasMoreBefore, true);
      assert.equal(ctx.hasMoreAfter, true);
      assert.deepEqual(
        ctx.messages.map((m) => m.id),
        ['m-4', 'm-5', 'm-6', 'm-7', 'm-8']
      );
    } finally {
      store.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('matches v0.8.0 shared contract version', () => {
    assert.equal(SHARED_CONTRACT_VERSION, '0.8.0');
  });
});
