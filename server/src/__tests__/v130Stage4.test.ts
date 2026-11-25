import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MiniGameState, ServerInvite, User, WatchTogetherState } from '../types.js';
import { normalizeInviteSourceLabel, summarizeInviteSources } from '../utils/inviteAnalytics.js';
import { registerWatchTogetherAndGamesHandlers } from '../features/watchTogetherAndGamesHandlers.js';

describe('v1.3.0 Stage 4: Invite Analytics & Extracted WatchTogether/Games Handlers', () => {
  it('summarizeInviteSources aggregates uses cleanly by normalized sourceLabel', () => {
    assert.equal(normalizeInviteSourceLabel('   '), 'Genel');
    const invites: ServerInvite[] = [
      { code: 'AAA111', serverId: 's1', createdBy: 'Admin', createdAt: '2026-11-25', uses: 5, sourceLabel: 'YouTube' },
      { code: 'BBB222', serverId: 's1', createdBy: 'Admin', createdAt: '2026-11-25', uses: 3, sourceLabel: 'YouTube' },
      { code: 'CCC333', serverId: 's1', createdBy: 'Mod', createdAt: '2026-11-25', uses: 12 },
    ];
    const summary = summarizeInviteSources(invites);
    assert.equal(summary.totalUses, 20);
    assert.deepEqual(summary.sources, [
      { sourceLabel: 'Genel', inviteCount: 1, totalUses: 12 },
      { sourceLabel: 'YouTube', inviteCount: 2, totalUses: 8 },
    ]);
  });

  it('registerWatchTogetherAndGamesHandlers handles watch_together_start/enqueue and minigame XOX win flow', () => {
    const handlers = new Map<string, (payload: any) => void>();
    const emitted: Array<{ target: string; event: string; payload: any }> = [];

    const fakeSocket = {
      id: 'sock-1',
      on: (ev: string, fn: (payload: any) => void) => {
        handlers.set(ev, fn);
      },
      emit: (ev: string, payload?: any) => {
        emitted.push({ target: 'self', event: ev, payload });
        return true;
      },
      to: (room: string) => ({
        emit: (ev: string, payload?: any) => {
          emitted.push({ target: `to:${room}`, event: ev, payload });
          return true;
        },
      }),
    };

    const fakeIo = {
      to: (room: string) => ({
        emit: (ev: string, payload?: any) => {
          emitted.push({ target: `io:${room}`, event: ev, payload });
          return true;
        },
      }),
    };

    const activeUsers = new Map<string, User>([
      [
        'sock-1',
        {
          id: 'sock-1',
          username: 'Alice',
          avatar: '🎮',
          role: 'user',
          status: 'online',
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
          currentVoiceChannelId: 'v-1',
        },
      ],
    ]);
    const watchTogetherRooms = new Map<string, WatchTogetherState>();
    const miniGameRooms = new Map<string, MiniGameState>();

    registerWatchTogetherAndGamesHandlers(fakeSocket as any, {
      io: fakeIo as any,
      activeUsers,
      watchTogetherRooms,
      miniGameRooms,
      addAuditLog: () => {},
    });

    handlers.get('watch_together_start')?.({ channelId: 'v-1', videoId: 'abc123def45', title: 'Track 1' });
    handlers.get('watch_together_enqueue')?.({ channelId: 'v-1', videoId: 'xyz987uvw12', title: 'Track 2' });
    const wtState = watchTogetherRooms.get('v-1');
    assert.equal(wtState?.videoId, 'abc123def45');
    assert.equal(wtState?.queue?.length, 1);
    assert.equal(wtState?.queue?.[0].videoId, 'xyz987uvw12');

    // Start XOX and play top row X wins
    handlers.get('minigame_start')?.({ channelId: 'v-1', game: 'xox' });
    handlers.get('minigame_move')?.({ channelId: 'v-1', index: 0 }); // X
    handlers.get('minigame_move')?.({ channelId: 'v-1', index: 3 }); // O
    handlers.get('minigame_move')?.({ channelId: 'v-1', index: 1 }); // X
    handlers.get('minigame_move')?.({ channelId: 'v-1', index: 4 }); // O
    handlers.get('minigame_move')?.({ channelId: 'v-1', index: 2 }); // X wins!

    const mgState = miniGameRooms.get('v-1');
    assert.equal(mgState?.winner, 'X');
    assert.ok(emitted.some((e) => e.event === 'watch_together_update'));
  });
});
