import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPasswordAsync, verifyPasswordAsync } from '../utils/authCrypto.js';
import { collectReferencedMediaUrls, scanAndCleanOrphanUploads } from '../utils/uploadCleaner.js';
import { SqliteStore } from '../sqliteStore.js';
import type { Message } from '../types.js';

test('hashPasswordAsync and verifyPasswordAsync validate passwords without blocking', async () => {
  const hash = await hashPasswordAsync('Cakma!2026');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPasswordAsync('Cakma!2026', hash), true);
  assert.equal(await verifyPasswordAsync('wrong-pass', hash), false);
  assert.equal(await verifyPasswordAsync('legacy123', 'legacy123'), true);
});

test('scanAndCleanOrphanUploads keeps referenced & fresh files and deletes old orphans', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-gc-test-'));
  try {
    const soundsDir = path.join(tempRoot, 'sounds');
    fs.mkdirSync(soundsDir, { recursive: true });

    const referencedFile = path.join(soundsDir, 'snd-keep.mp3');
    const freshOrphanFile = path.join(soundsDir, 'snd-fresh.mp3');
    const oldOrphanFile = path.join(soundsDir, 'snd-old.mp3');

    fs.writeFileSync(referencedFile, 'keep');
    fs.writeFileSync(freshOrphanFile, 'fresh');
    fs.writeFileSync(oldOrphanFile, 'orphan-bytes');

    const oldTime = new Date(Date.now() - 48 * 3600 * 1000);
    fs.utimesSync(oldOrphanFile, oldTime, oldTime);

    const referencedUrls = collectReferencedMediaUrls({
      dataDir: tempRoot,
      messagesMap: {
        'ch-1': [
          {
            id: 'm1',
            serverId: 's1',
            channelId: 'ch-1',
            author: { id: 'u1', username: 'alice', avatar: '😀' },
            content: 'sound /api/sounds/snd-keep.mp3',
            timestamp: '10:00',
            attachments: [],
          },
        ],
      },
    });

    const dry = scanAndCleanOrphanUploads({
      dataDir: tempRoot,
      referencedUrls,
      minAgeMs: 24 * 3600 * 1000,
      dryRun: true,
    });
    assert.equal(dry.scannedFiles, 3);
    assert.equal(dry.orphanFiles, 1);
    assert.equal(dry.deletedFiles, 0);
    assert.ok(fs.existsSync(oldOrphanFile));

    const clean = scanAndCleanOrphanUploads({
      dataDir: tempRoot,
      referencedUrls,
      minAgeMs: 24 * 3600 * 1000,
      dryRun: false,
    });
    assert.equal(clean.deletedFiles, 1);
    assert.ok(clean.freedBytes > 0);
    assert.equal(fs.existsSync(oldOrphanFile), false);
    assert.equal(fs.existsSync(freshOrphanFile), true);
    assert.equal(fs.existsSync(referencedFile), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('SqliteStore initializes WAL + FTS5 on Node 22+ and indexes/searches messages', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-sqlite-test-'));
  const store = new SqliteStore(tempRoot);
  try {
    const active = await store.init();
    if (!active) {
      // Older Node (<22.5) runtime gracefully falls back to json-sharded
      assert.equal(store.getEngineName(), 'json-sharded');
      return;
    }

    assert.equal(store.getEngineName(), 'sqlite-wal-fts5');
    store.putJsonSnapshot('users.json', [{ username: 'yahya' }]);
    const loaded = store.getJsonSnapshot<Array<{ username: string }>>('users.json');
    assert.deepEqual(loaded, [{ username: 'yahya' }]);

    const msg: Message = {
      id: 'm-fts-1',
      serverId: 's1',
      channelId: 'ch-genel',
      author: { id: 'u1', username: 'yahya', avatar: '🛡️' },
      content: 'LiveKit SFU ses motoru harika çalışıyor',
      timestamp: '12:00',
    };
    store.indexMessage('ch-genel', msg);
    const hits = store.searchMessagesFts('LiveKit');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'm-fts-1');

    store.removeMessage('m-fts-1');
    const afterRemove = store.searchMessagesFts('LiveKit');
    assert.equal(afterRemove.length, 0);
  } finally {
    store.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
