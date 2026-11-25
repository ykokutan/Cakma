import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { WatchTogetherState } from '../types.js';
import {
  MAX_WATCH_QUEUE_SIZE,
  enqueueWatchVideo,
  advanceWatchQueue,
  toggleSkipVoteAndAdvance,
} from '../utils/watchTogetherQueue.js';

function makeBaseState(overrides: Partial<WatchTogetherState> = {}): WatchTogetherState {
  return {
    channelId: 'ch-watch-1',
    active: true,
    videoId: 'vidCurrent01',
    title: 'Current Video',
    isPlaying: true,
    currentTime: 14,
    startedBy: 'Alice',
    queue: [],
    skipVotes: [],
    ...overrides,
  };
}

describe('v1.3.0 Stage 3: Watch-Together Queue & Skip-Vote', () => {
  it('enqueues videos, avoids adjacent duplicate IDs, and caps at MAX_WATCH_QUEUE_SIZE', () => {
    let state = makeBaseState();

    // Same video as currently playing when queue is empty -> ignored
    state = enqueueWatchVideo(state, { id: 'q0', videoId: 'vidCurrent01', title: 'Dup', addedBy: 'Bob' });
    assert.equal(state.queue?.length, 0);

    // Enqueue distinct video
    state = enqueueWatchVideo(state, { id: 'q1', videoId: 'vidNext0002', title: 'Next Video', addedBy: 'Bob' });
    assert.equal(state.queue?.length, 1);

    // Adjacent duplicate in queue -> ignored
    state = enqueueWatchVideo(state, { id: 'q2', videoId: 'vidNext0002', title: 'Next Dup', addedBy: 'Carol' });
    assert.equal(state.queue?.length, 1);

    // Fill up to cap + 1 extra
    for (let i = 2; i <= MAX_WATCH_QUEUE_SIZE + 2; i++) {
      state = enqueueWatchVideo(state, {
        id: `q-${i}`,
        videoId: `vid_${String(i).padStart(7, '0')}`,
        title: `Video ${i}`,
        addedBy: 'Tester',
      });
    }
    assert.equal(state.queue?.length, MAX_WATCH_QUEUE_SIZE);
  });

  it('toggles skip votes and advances queue cleanly on majority threshold, or ends when empty', () => {
    const state = makeBaseState({
      queue: [
        { id: 'q1', videoId: 'vidQueue001', title: 'Queued Track 1', addedBy: 'Bob' },
        { id: 'q2', videoId: 'vidQueue002', title: 'Queued Track 2', addedBy: 'Carol' },
      ],
    });

    // 4 participants -> majority threshold = ceil(4 / 2) = 2
    const vote1 = toggleSkipVoteAndAdvance(state, 'Alice', 4);
    assert.equal(vote1.advanced, false);
    assert.equal(vote1.ended, false);
    assert.deepEqual(vote1.state.skipVotes, ['Alice']);

    // Alice toggles off her vote
    const unvote = toggleSkipVoteAndAdvance(vote1.state, 'Alice', 4);
    assert.equal(unvote.advanced, false);
    assert.deepEqual(unvote.state.skipVotes, []);

    // Alice + Bob vote skip -> hits 2/2 -> advances to vidQueue001
    const r1 = toggleSkipVoteAndAdvance(unvote.state, 'Alice', 4);
    const r2 = toggleSkipVoteAndAdvance(r1.state, 'Bob', 4);
    assert.equal(r2.advanced, true);
    assert.equal(r2.ended, false);
    assert.equal(r2.state.videoId, 'vidQueue001');
    assert.equal(r2.state.startedBy, 'Bob');
    assert.equal(r2.state.currentTime, 0);
    assert.deepEqual(r2.state.skipVotes, []);
    assert.equal(r2.state.queue?.length, 1);

    // Advance directly to empty state via advanceWatchQueue twice
    const adv2 = advanceWatchQueue(r2.state);
    assert.equal(adv2.advanced, true);
    assert.equal(adv2.state.videoId, 'vidQueue002');
    assert.equal(adv2.state.queue?.length, 0);

    // Skip vote by solo participant on empty queue -> ends Watch Together cleanly
    const endedOutcome = toggleSkipVoteAndAdvance(adv2.state, 'Carol', 1);
    assert.equal(endedOutcome.advanced, false);
    assert.equal(endedOutcome.ended, true);
    assert.equal(endedOutcome.state.active, false);
  });
});
