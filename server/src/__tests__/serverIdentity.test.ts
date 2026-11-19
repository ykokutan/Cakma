import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MemberLevelData, Server } from '../types.js';
import {
  findServerMember,
  getPersistentUserId,
  isServerOwner,
  matchesServerMember,
  resolveServerLevelRecord,
} from '../utils/serverIdentity.js';

describe('serverIdentity', () => {
  it('prefers persistent accountId over ephemeral socket id', () => {
    assert.equal(getPersistentUserId({ id: 'sock-9', accountId: 'usr-123' }), 'usr-123');
    assert.equal(getPersistentUserId({ id: 'sock-9' }, { id: 'usr-acc' }), 'usr-acc');
    assert.equal(getPersistentUserId({ id: 'sock-9' }), 'sock-9');
  });

  it('recognizes server owner across multiple simultaneous sockets/devices', () => {
    const srv: Pick<Server, 'ownerId' | 'members'> = {
      ownerId: 'usr-owner-1',
      members: [
        {
          userId: 'usr-owner-1',
          username: 'Kurucu',
          avatar: '👑',
          roleIds: ['role-owner'],
          joinedAt: '2026-01-01',
          isOwner: true,
        },
        {
          userId: 'usr-bob',
          username: 'Bob',
          avatar: '🎮',
          roleIds: ['role-everyone'],
          joinedAt: '2026-01-02',
        },
      ],
    };

    assert.equal(
      isServerOwner({ id: 'socket-tab-1', accountId: 'usr-owner-1', username: 'Kurucu' }, srv),
      true
    );
    assert.equal(
      isServerOwner({ id: 'socket-mobile-2', accountId: 'usr-owner-1', username: 'Kurucu' }, srv),
      true
    );
    assert.equal(
      isServerOwner({ id: 'socket-bob', accountId: 'usr-bob', username: 'Bob' }, srv),
      false
    );
  });

  it('migrates legacy socket-id member records cleanly by username match', () => {
    const srv: Pick<Server, 'ownerId' | 'members'> = {
      ownerId: 'old-sock-id',
      members: [
        {
          userId: 'old-sock-id',
          username: 'Alice',
          avatar: '✨',
          roleIds: ['role-owner'],
          joinedAt: '2026-01-01',
          isOwner: true,
        },
      ],
    };

    const aliceNewSession = { id: 'new-sock-id', accountId: 'usr-alice', username: 'alice' };
    assert.equal(matchesServerMember(srv.members![0], aliceNewSession), true);
    assert.equal(findServerMember(srv, aliceNewSession)?.username, 'Alice');
    assert.equal(isServerOwner(aliceNewSession, srv), true);
  });

  it('migrates and merges legacy socket-id XP level entries into persistent accountId key', () => {
    const levels: Record<string, MemberLevelData> = {
      'old-socket-1': {
        userId: 'old-socket-1',
        username: 'Ali',
        avatar: '🎮',
        xp: 120,
        level: 2,
        messageCount: 8,
        voiceMinutes: 4,
      },
      'old-socket-2': {
        userId: 'old-socket-2',
        username: 'ali',
        avatar: '🎮',
        xp: 80,
        level: 1,
        messageCount: 5,
        voiceMinutes: 2,
      },
    };

    const { key, record } = resolveServerLevelRecord(levels, {
      id: 'sock-live',
      accountId: 'usr-ali-perm',
      username: 'Ali',
      avatar: '🚀',
    });

    assert.equal(key, 'usr-ali-perm');
    assert.equal(record.userId, 'usr-ali-perm');
    assert.equal(record.xp, 200);
    assert.equal(record.messageCount, 13);
    assert.equal(record.voiceMinutes, 6);
    assert.equal(record.level, Math.max(1, Math.floor(0.2 * Math.sqrt(200))));
    assert.equal(levels['old-socket-1'], undefined);
    assert.equal(levels['old-socket-2'], undefined);
  });
});
