import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server, ServerMember, User } from '../types.js';
import {
  buildDiscoverableServerSummaries,
  filterServersForUser,
  isUserMemberOfServer,
} from '../utils/serverDiscovery.js';

function createMember(userId: string, username: string): ServerMember {
  return {
    userId,
    username,
    avatar: '',
    roleIds: [],
    joinedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createServer(overrides: Partial<Server> = {}): Server {
  const serverId = overrides.id ?? 'srv-1';
  return {
    id: serverId,
    name: 'Test Sunucusu',
    icon: 'TS',
    ownerId: 'usr-owner',
    roles: [],
    members: [],
    channels: [
      { id: 'ch-text-1', serverId, name: 'genel', type: 'text' },
      { id: 'ch-voice-1', serverId, name: 'sohbet', type: 'voice' },
    ],
    invites: [],
    isPublic: true,
    category: 'community',
    tags: ['test'],
    ...overrides,
  };
}

function createUser(overrides: Partial<User> = {}): User {
  const base: User = {
    id: 'usr-1',
    username: 'alice',
    avatar: '',
    status: 'online',
    role: 'user',
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isScreenSharing: false,
  };
  return { ...base, ...overrides };
}

describe('serverDiscovery', () => {
  describe('isUserMemberOfServer', () => {
    it('matches ownerId even when owner is not listed in members', () => {
      const srv = createServer({ ownerId: 'usr-owner', members: [] });
      assert.equal(isUserMemberOfServer({ id: 'usr-owner', username: 'owner' }, srv), true);
    });

    it('matches member by userId or case-insensitive username', () => {
      const srv = createServer({
        ownerId: 'usr-other',
        members: [createMember('usr-alice', 'Alice')],
      });

      assert.equal(isUserMemberOfServer({ id: 'usr-alice', username: 'different' }, srv), true);
      assert.equal(isUserMemberOfServer({ id: 'usr-new-socket', username: 'alice' }, srv), true);
      assert.equal(isUserMemberOfServer({ id: 'usr-new-socket', username: 'ALICE' }, srv), true);
      assert.equal(isUserMemberOfServer({ id: 'usr-bob', username: 'bob' }, srv), false);
    });
  });

  describe('filterServersForUser', () => {
    it('returns zero servers for a newly registered user even when public servers exist', () => {
      const publicServer1 = createServer({
        id: 'srv-public-1',
        ownerId: 'usr-admin-system',
        members: [createMember('usr-admin-system', 'admin')],
        isPublic: true,
      });
      const publicServer2 = createServer({
        id: 'srv-public-2',
        ownerId: 'usr-creator',
        members: [createMember('usr-alice', 'alice')],
        isPublic: true,
      });

      const brandNewUser = { id: 'usr-fresh', username: 'yenikullanici' };
      assert.deepEqual(filterServersForUser([publicServer1, publicServer2], brandNewUser), []);
    });

    it('returns only servers the user owns or joined (case-insensitive)', () => {
      const owned = createServer({ id: 'srv-owned', ownerId: 'usr-bob', members: [] });
      const joined = createServer({
        id: 'srv-joined',
        ownerId: 'usr-other',
        members: [createMember('usr-old', 'Bob')],
      });
      const unrelated = createServer({
        id: 'srv-unrelated',
        ownerId: 'usr-other',
        members: [createMember('usr-alice', 'alice')],
      });

      const filtered = filterServersForUser([owned, joined, unrelated], {
        id: 'usr-bob',
        username: 'bob',
      });

      assert.deepEqual(
        filtered.map((s) => s.id),
        ['srv-owned', 'srv-joined']
      );
    });
  });

  describe('buildDiscoverableServerSummaries', () => {
    it('excludes non-public servers and never leaks private channel passwords or invites', () => {
      const serverId = 'srv-pub';
      const publicServer = createServer({
        id: serverId,
        name: 'Açık Topluluk',
        isPublic: true,
        invites: [],
        channels: [
          { id: 't1', serverId, name: 'duyurular', type: 'text' },
          { id: 't2', serverId, name: 'genel', type: 'text' },
          { id: 't3', serverId, name: 'muhabbet', type: 'text' },
          { id: 'v1', serverId, name: 'Oda 1', type: 'voice', password: 'secret-room-password' },
          { id: 'v2', serverId, name: 'Oda 2', type: 'voice' },
          { id: 'v3', serverId, name: 'Oda Oluştur', type: 'voice', isTempCreatorChannel: true },
        ],
      });
      const privateServer = createServer({
        id: 'srv-priv',
        name: 'Gizli Sunucu',
        isPublic: false,
      });

      const summaries = buildDiscoverableServerSummaries([publicServer, privateServer], []);
      assert.equal(summaries.length, 1);

      const summary = summaries[0];
      assert.equal(summary.id, 'srv-pub');
      assert.equal(summary.textChannelCount, 3);
      assert.equal(summary.voiceChannelCount, 3);
      assert.deepEqual(
        summary.channelPreview.map((c) => c.id),
        ['t1', 't2', 'v1', 'v2']
      );
      assert.equal('invites' in summary, false);
      for (const ch of summary.channelPreview) {
        assert.equal('password' in ch, false);
      }
    });

    it('counts deduplicated online and voice-active members per server and computes join/owner flags', () => {
      const serverId = 'srv-active';
      const srv = createServer({
        id: serverId,
        ownerId: 'usr-owner',
        members: [
          createMember('usr-owner', 'owner'),
          createMember('usr-alice', 'alice'),
          createMember('usr-bob', 'bob'),
          createMember('usr-charlie', 'charlie'),
        ],
        channels: [
          { id: 'ch-t1', serverId, name: 'genel', type: 'text' },
          { id: 'ch-v1', serverId, name: 'Ses 1', type: 'voice' },
          { id: 'ch-v2', serverId, name: 'Ses 2', type: 'voice' },
        ],
      });

      const activeUsers: User[] = [
        // Two concurrent tabs for alice; one in srv voice channel
        createUser({ id: 'usr-alice-1', username: 'Alice', status: 'online', currentVoiceChannelId: 'ch-v1' }),
        createUser({ id: 'usr-alice-2', username: 'alice', status: 'idle', currentVoiceChannelId: 'ch-v1' }),
        // Bob is online and in ANOTHER server's voice channel
        createUser({ id: 'usr-bob', username: 'bob', status: 'dnd', currentVoiceChannelId: 'other-srv-voice' }),
        // Charlie is offline even if stale voice id exists
        createUser({ id: 'usr-charlie', username: 'charlie', status: 'offline', currentVoiceChannelId: 'ch-v2' }),
        // Eve is online in ch-v2 (somehow) but NOT a member of srv
        createUser({ id: 'usr-eve', username: 'eve', status: 'online', currentVoiceChannelId: 'ch-v2' }),
      ];

      const guestView = buildDiscoverableServerSummaries([srv], activeUsers, {
        id: 'usr-guest',
        username: 'guest',
      });
      assert.equal(guestView[0].memberCount, 4);
      assert.equal(guestView[0].onlineCount, 2); // alice (deduplicated) + bob
      assert.equal(guestView[0].voiceActiveCount, 1); // only alice in srv's voice channel
      assert.equal(guestView[0].isJoined, false);
      assert.equal(guestView[0].isOwner, false);

      const ownerView = buildDiscoverableServerSummaries([srv], activeUsers, {
        id: 'usr-owner',
        username: 'owner',
      });
      assert.equal(ownerView[0].isJoined, true);
      assert.equal(ownerView[0].isOwner, true);
    });
  });
});
