import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteStore } from '../sqliteStore.js';
import type { Message } from '../types.js';

function makeMessage(id: string, channelId: string, content: string, author = 'alice'): Message {
  return {
    id,
    serverId: channelId.startsWith('dm-') ? 'direct-messages' : 'srv-1',
    channelId,
    author: { id: `u-${author}`, username: author, avatar: '🎮' },
    content,
    timestamp: '12:00',
  };
}

describe('SqliteStore primary message engine', () => {
  it('supports upsert, in-place edit preserving order, delete, pagination, and FTS5 search', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-sqlite-test-'));
    const store = new SqliteStore(tmpDir);
    try {
      const ok = await store.init();
      assert.equal(ok, true);
      assert.equal(store.getEngineName(), 'sqlite-wal-fts5');

      const chId = 'ch-genel';
      for (let i = 1; i <= 8; i++) {
        store.upsertMessage(chId, makeMessage(`m-${i}`, chId, `Mesaj numara ${i} merhaba`));
      }
      assert.equal(store.getMessageCount(), 8);

      // Update m-4 in-place without reordering seq
      store.upsertMessage(chId, makeMessage('m-4', chId, 'Guncellenmis ozel icerik'));
      assert.equal(store.getMessageCount(), 8);

      const latestPage = store.getChannelMessagesPage(chId, undefined, 3);
      assert.equal(latestPage.hasMore, true);
      assert.deepEqual(
        latestPage.messages.map((m) => m.id),
        ['m-6', 'm-7', 'm-8']
      );

      const prevPage = store.getChannelMessagesPage(chId, 'm-6', 3);
      assert.equal(prevPage.hasMore, true);
      assert.deepEqual(
        prevPage.messages.map((m) => m.id),
        ['m-3', 'm-4', 'm-5']
      );
      assert.equal(prevPage.messages[1].content, 'Guncellenmis ozel icerik');

      // Delete a message
      store.deleteMessage('m-4');
      assert.equal(store.getMessageCount(), 7);
      assert.equal(store.getMessageById('m-4'), null);

      // FTS search finds newly upserted keywords and excludes deleted message
      store.upsertMessage(chId, makeMessage('m-9', chId, 'Turnuva planlamasi basliyor', 'yakup'));
      const hits = store.searchMessagesFts('Turnuva');
      assert.equal(hits.length, 1);
      assert.equal(hits[0].id, 'm-9');
      assert.equal(store.searchMessagesFts('Guncellenmis').length, 0);

      // Recent load respects limit per channel and returns ascending chronological order
      const recent = store.loadRecentMessagesPerChannel(3);
      assert.deepEqual(
        recent[chId].map((m) => m.id),
        ['m-7', 'm-8', 'm-9']
      );
    } finally {
      store.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
