import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Message, Server } from '../types.js';
import {
  buildPersistentDmChannelId,
  canUserAccessChannel,
  decodeDmSegment,
  encodeDmSegment,
  findServerByChannelId,
  isUserParticipantInDm,
  parseDmChannelParticipants,
} from '../utils/channelAccess.js';

function makeServer(overrides: Partial<Server> = {}): Server {
  const id = overrides.id ?? 'srv-1';
  return {
    id,
    name: 'Sunucu',
    icon: 'S',
    ownerId: 'usr-owner',
    roles: [],
    members: [
      { userId: 'usr-owner', username: 'owner', avatar: '', roleIds: [], joinedAt: '2026-01-01' },
      { userId: 'usr-alice', username: 'alice', avatar: '', roleIds: [], joinedAt: '2026-01-01' },
    ],
    channels: [{ id: 'ch-1', serverId: id, name: 'genel', type: 'text' }],
    invites: [],
    ...overrides,
  };
}

function makeMsg(id: string, channelId: string, username: string): Message {
  return {
    id,
    serverId: channelId.startsWith('dm-') ? 'direct-messages' : 'srv-1',
    channelId,
    author: { id: 'u-' + username, username, avatar: '' },
    content: 'hi',
    timestamp: '12:00',
  };
}

describe('channelAccess', () => {
  describe('buildPersistentDmChannelId & segment encoding', () => {
    it('builds deterministic cross-session IDs sorted regardless of argument order', () => {
      const a = buildPersistentDmChannelId('Alice', 'Bob');
      const b = buildPersistentDmChannelId('bob', 'alice');
      assert.equal(a, b);
      assert.equal(a, 'dm-u-alice--bob');
    });

    it('losslessly encodes hyphens and Turkish Unicode characters without breaking `--` split', () => {
      const id = buildPersistentDmChannelId('Çağrı-Dev', 'Mehmet_01');
      assert.ok(id.startsWith('dm-u-'));
      const parsed = parseDmChannelParticipants(id);
      assert.deepEqual(parsed?.sort(), ['mehmet_01', 'çağrı-dev'].sort());
      assert.equal(decodeDmSegment(encodeDmSegment('yakup-han')), 'yakup-han');
    });
  });

  describe('isUserParticipantInDm', () => {
    it('allows participants in `dm-u-*` and denies third parties & dm-general', () => {
      const dmId = buildPersistentDmChannelId('Alice', 'Bob');
      assert.equal(isUserParticipantInDm({ username: 'alice' }, dmId), true);
      assert.equal(isUserParticipantInDm({ username: 'BOB' }, dmId), true);
      assert.equal(isUserParticipantInDm({ username: 'eve' }, dmId), false);
      assert.equal(isUserParticipantInDm({ username: 'alice' }, 'dm-general'), false);
    });

    it('supports legacy dm-alice-bob and author message fallback', () => {
      assert.equal(isUserParticipantInDm({ username: 'alice' }, 'dm-alice-bob'), true);
      assert.equal(isUserParticipantInDm({ username: 'charlie' }, 'dm-alice-bob'), false);

      const legacyId = 'dm-sock1-sock2';
      const msgs = [makeMsg('m1', legacyId, 'alice'), makeMsg('m2', legacyId, 'bob')];
      assert.equal(isUserParticipantInDm({ id: 'sock1', username: 'new_alice_sock' }, legacyId, msgs), true);
      assert.equal(isUserParticipantInDm({ username: 'alice' }, legacyId, msgs), true);
      assert.equal(isUserParticipantInDm({ username: 'eve' }, legacyId, msgs), false);
    });
  });

  describe('canUserAccessChannel & findServerByChannelId', () => {
    const srv = makeServer();
    const otherSrv = makeServer({
      id: 'srv-2',
      ownerId: 'usr-other',
      members: [{ userId: 'usr-other', username: 'other', avatar: '', roleIds: [], joinedAt: '2026-01-01' }],
      channels: [{ id: 'ch-secret', serverId: 'srv-2', name: 'gizli', type: 'text' }],
    });

    it('isolates DM channels strictly to participants even against admins', () => {
      const dmId = buildPersistentDmChannelId('alice', 'bob');
      assert.equal(
        canUserAccessChannel({ id: '1', username: 'alice', role: 'user' }, dmId, [srv]),
        true
      );
      assert.equal(
        canUserAccessChannel({ id: '9', username: 'admin', role: 'admin' }, dmId, [srv]),
        false
      );
    });

    it('scopes server channels to members (and admins) and finds owning server', () => {
      assert.equal(findServerByChannelId([srv, otherSrv], 'ch-secret')?.id, 'srv-2');
      assert.equal(
        canUserAccessChannel({ id: 'u1', username: 'alice', role: 'user' }, 'ch-1', [srv, otherSrv]),
        true
      );
      assert.equal(
        canUserAccessChannel({ id: 'u1', username: 'alice', role: 'user' }, 'ch-secret', [srv, otherSrv]),
        false
      );
      assert.equal(
        canUserAccessChannel({ id: 'u0', username: 'admin', role: 'admin' }, 'ch-secret', [srv, otherSrv]),
        true
      );
    });
  });
});
