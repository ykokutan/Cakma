import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAllTypingUsers,
  getDirectCallQualitySnapshot,
  getTypingUsersForChannel,
  setChannelTypingState,
  setDirectCallQualitySnapshot,
} from '../../context/PresenceStore';
import { isSameUser, isUserServerOwner } from '../serverIdentity';

describe('PresenceStore', () => {
  beforeEach(() => {
    clearAllTypingUsers();
    setDirectCallQualitySnapshot(null);
  });

  it('adds and removes typing users per channel and preserves empty array reference stability', () => {
    const emptyA = getTypingUsersForChannel('ch-1');
    const emptyB = getTypingUsersForChannel('ch-1');
    expect(emptyA).toBe(emptyB);
    expect(emptyA).toEqual([]);

    setChannelTypingState('ch-1', 'Alice', true);
    setChannelTypingState('ch-1', 'Bob', true);
    expect(getTypingUsersForChannel('ch-1')).toEqual(['Alice', 'Bob']);

    // Duplicate typing=true does not duplicate entry
    setChannelTypingState('ch-1', 'Alice', true);
    expect(getTypingUsersForChannel('ch-1')).toEqual(['Alice', 'Bob']);

    setChannelTypingState('ch-1', 'Alice', false);
    expect(getTypingUsersForChannel('ch-1')).toEqual(['Bob']);

    setChannelTypingState('ch-1', 'Bob', false);
    expect(getTypingUsersForChannel('ch-1')).toBe(emptyA);
  });

  it('stores and clears direct call quality snapshots', () => {
    expect(getDirectCallQualitySnapshot()).toBeNull();
    setDirectCallQualitySnapshot({
      rttMs: 24,
      packetLossPct: 0.1,
      bitrateKbps: 1200,
      fps: 60,
      width: 1920,
      height: 1080,
      pathType: 'p2p',
    });
    expect(getDirectCallQualitySnapshot()?.rttMs).toBe(24);
    expect(getDirectCallQualitySnapshot()?.pathType).toBe('p2p');
  });
});

describe('client serverIdentity helpers', () => {
  it('matches server owners using persistent accountId across sockets', () => {
    const server = {
      ownerId: 'usr-perm-1',
      members: [
        {
          userId: 'usr-perm-1',
          username: 'Kurucu',
          avatar: '👑',
          roleIds: ['role-owner'],
          joinedAt: '2026-01-01',
          isOwner: true,
        },
      ],
    };

    expect(isUserServerOwner({ id: 'live-sock-2', accountId: 'usr-perm-1', username: 'Kurucu' }, server)).toBe(true);
    expect(isUserServerOwner({ id: 'live-sock-3', accountId: 'usr-other', username: 'Uye' }, server)).toBe(false);
    expect(
      isSameUser(
        { id: 'sock-1', accountId: 'usr-perm-1', username: 'Kurucu' },
        { id: 'usr-perm-1', username: 'Kurucu' }
      )
    ).toBe(true);
  });
});
