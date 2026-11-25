import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldMoveUserToAfk } from '../utils/afkVoiceHelper.js';
import { findDueEventReminders, type ServerEventItem } from '../features/cloudSyncAndEvents.js';

describe('v1.3.0 Stage 2: AFK Voice Helper & Event Reminders', () => {
  it('shouldMoveUserToAfk returns false while speaking, in AFK channel, or invalid timeout, and true once idle exceeds timeout', () => {
    const now = 1_700_000_000_000;
    const fiveMinAgo = now - 5 * 60_000;
    const sixMinAgo = now - 6 * 60_000;

    // Not in voice channel
    assert.equal(
      shouldMoveUserToAfk({
        currentVoiceChannelId: null,
        isSpeaking: false,
        lastActivityMs: sixMinAgo,
        nowMs: now,
        afkChannelId: 'afk-1',
        afkTimeoutMinutes: 5,
      }),
      false
    );

    // Currently speaking -> do not move even if lastActivityMs looks old
    assert.equal(
      shouldMoveUserToAfk({
        currentVoiceChannelId: 'voice-1',
        isSpeaking: true,
        lastActivityMs: sixMinAgo,
        nowMs: now,
        afkChannelId: 'afk-1',
        afkTimeoutMinutes: 5,
      }),
      false
    );

    // Already inside AFK channel
    assert.equal(
      shouldMoveUserToAfk({
        currentVoiceChannelId: 'afk-1',
        isSpeaking: false,
        lastActivityMs: sixMinAgo,
        nowMs: now,
        afkChannelId: 'afk-1',
        afkTimeoutMinutes: 5,
      }),
      false
    );

    // Timeout <= 0 disables AFK move
    assert.equal(
      shouldMoveUserToAfk({
        currentVoiceChannelId: 'voice-1',
        isSpeaking: false,
        lastActivityMs: sixMinAgo,
        nowMs: now,
        afkChannelId: 'afk-1',
        afkTimeoutMinutes: 0,
      }),
      false
    );

    // Idle reaches exact 5m threshold -> move to AFK
    assert.equal(
      shouldMoveUserToAfk({
        currentVoiceChannelId: 'voice-1',
        isSpeaking: false,
        lastActivityMs: fiveMinAgo,
        nowMs: now,
        afkChannelId: 'afk-1',
        afkTimeoutMinutes: 5,
      }),
      true
    );

    // Under threshold -> keep in current channel
    assert.equal(
      shouldMoveUserToAfk({
        currentVoiceChannelId: 'voice-1',
        isSpeaking: false,
        lastActivityMs: now - 4 * 60_000,
        nowMs: now,
        afkChannelId: 'afk-1',
        afkTimeoutMinutes: 5,
      }),
      false
    );
  });

  it('findDueEventReminders matches only unreminded upcoming events within 15 minutes', () => {
    const now = Date.parse('2026-11-25T12:00:00.000Z');
    const mkEvent = (id: string, offsetMinutes: number, remindedAt?: string): ServerEventItem => ({
      id,
      serverId: 'srv-1',
      title: `Event ${id}`,
      description: 'Desc',
      scheduledAt: new Date(now + offsetMinutes * 60_000).toISOString(),
      createdBy: 'Alice',
      attendees: ['Alice'],
      createdAt: new Date(now - 3600_000).toISOString(),
      remindedAt,
    });

    const eventsByServer: Record<string, ServerEventItem[]> = {
      'srv-1': [
        mkEvent('due-soon', 10),
        mkEvent('already-reminded', 8, '2026-11-25T11:55:00.000Z'),
        mkEvent('too-far', 25),
        mkEvent('past-event', -5),
      ],
    };

    const due = findDueEventReminders(eventsByServer, now, 15 * 60_000);
    assert.deepEqual(
      due.map((e) => e.id),
      ['due-soon']
    );
  });
});
