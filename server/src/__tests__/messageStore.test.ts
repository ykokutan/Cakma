import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ShardedMessageStore, getInitialMessagesSlice, getChannelMessagesPage, searchAllMessages } from '../messageStore.js';
import type { Message } from '../types.js';

function makeMsg(id: string, channelId: string, content: string, username = 'alice'): Message {
  return {
    id,
    serverId: 'srv-1',
    channelId,
    author: { id: 'u1', username, avatar: '🙂' },
    content,
    timestamp: new Date().toISOString(),
    reactions: {},
    isPinned: false,
  };
}

test('ShardedMessageStore migrates legacy messages.json and persists channel shards', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-msgstore-'));
  try {
    const legacy = {
      'ch-general': [makeMsg('m1', 'ch-general', 'hello world')],
      'dm-alice-bob': [makeMsg('m2', 'dm-alice-bob', 'secret hi', 'bob')],
    };
    fs.writeFileSync(path.join(tmpDir, 'messages.json'), JSON.stringify(legacy), 'utf-8');

    const store = new ShardedMessageStore(tmpDir);
    const loaded = store.loadAll({});
    assert.equal(loaded['ch-general'].length, 1);
    assert.equal(loaded['dm-alice-bob'].length, 1);

    // Save additional message via debounced scheduler + sync flush
    const updated = [...loaded['ch-general'], makeMsg('m3', 'ch-general', 'second line')];
    store.scheduleSaveChannel('ch-general', updated, 100);
    store.flushSync();

    const store2 = new ShardedMessageStore(tmpDir);
    const reloaded = store2.loadAll({});
    assert.equal(reloaded['ch-general'].length, 2);
    assert.equal(reloaded['ch-general'][1].content, 'second line');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getInitialMessagesSlice, getChannelMessagesPage, and searchAllMessages work accurately', () => {
  const many = Array.from({ length: 85 }, (_, i) => makeMsg(`m-${i + 1}`, 'ch-1', `message #${i + 1}`));
  const all = { 'ch-1': many, 'ch-2': [makeMsg('x-1', 'ch-2', 'needle match here', 'bob')] };

  const { initialMessages, hasMoreMessages } = getInitialMessagesSlice(all, 60);
  assert.equal(initialMessages['ch-1'].length, 60);
  assert.equal(initialMessages['ch-1'][0].id, 'm-26');
  assert.equal(hasMoreMessages['ch-1'], true);
  assert.equal(hasMoreMessages['ch-2'], false);

  const page1 = getChannelMessagesPage(many, 'm-26', 15);
  assert.equal(page1.messages.length, 15);
  assert.equal(page1.messages[0].id, 'm-11');
  assert.equal(page1.messages[14].id, 'm-25');
  assert.equal(page1.hasMore, true);

  const hits = searchAllMessages(all, 'needle');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].channelId, 'ch-2');
});
