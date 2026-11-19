import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLiveKitHttpUrl, shouldRoomUseSfu, buildIceServers } from '../utils/sfuLogic.js';

test('normalizeLiveKitHttpUrl converts ws/wss schemes and falls back when empty', () => {
  assert.equal(normalizeLiveKitHttpUrl('ws://127.0.0.1:7880'), 'http://127.0.0.1:7880');
  assert.equal(normalizeLiveKitHttpUrl('wss://lk.example.com:7443 '), 'https://lk.example.com:7443');
  assert.equal(normalizeLiveKitHttpUrl('   ', 'http://127.0.0.1:7880'), 'http://127.0.0.1:7880');
});

test('shouldRoomUseSfu handles enabled flag, server modes, and participant thresholds', () => {
  assert.equal(shouldRoomUseSfu({ sfuEnabled: false, serverMode: 'sfu', participantCount: 10, threshold: 2 }), false);
  assert.equal(shouldRoomUseSfu({ sfuEnabled: true, serverMode: 'p2p', participantCount: 20, threshold: 2 }), false);
  assert.equal(shouldRoomUseSfu({ sfuEnabled: true, serverMode: 'sfu', participantCount: 1, threshold: 6 }), true);
  assert.equal(shouldRoomUseSfu({ sfuEnabled: true, serverMode: 'auto', participantCount: 5, threshold: 6 }), false);
  assert.equal(shouldRoomUseSfu({ sfuEnabled: true, serverMode: 'auto', participantCount: 6, threshold: 6 }), true);
});

test('buildIceServers returns STUN defaults and appends optional TURN server', () => {
  const base = buildIceServers({});
  assert.equal(base.length, 2);
  const withTurn = buildIceServers({ turnUrl: 'turn:turn.example.com:3478', turnUsername: 'u1', turnCredential: 'p1' });
  assert.equal(withTurn.length, 3);
  assert.deepEqual(withTurn[2], { urls: 'turn:turn.example.com:3478', username: 'u1', credential: 'p1' });
});
