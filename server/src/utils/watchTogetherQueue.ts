import type { WatchTogetherQueueItem, WatchTogetherState } from '../types.js';

export const MAX_WATCH_QUEUE_SIZE = 25;

export function enqueueWatchVideo(
  state: WatchTogetherState,
  item: WatchTogetherQueueItem
): WatchTogetherState {
  const existingQueue = Array.isArray(state.queue) ? state.queue : [];
  if (existingQueue.length >= MAX_WATCH_QUEUE_SIZE) {
    return state;
  }
  const cleanVideoId = String(item.videoId || '').trim();
  if (!cleanVideoId) return state;

  const lastInQueue = existingQueue[existingQueue.length - 1];
  if (
    (existingQueue.length === 0 && state.videoId === cleanVideoId) ||
    lastInQueue?.videoId === cleanVideoId
  ) {
    return state;
  }

  return {
    ...state,
    queue: [
      ...existingQueue,
      {
        id: item.id,
        videoId: cleanVideoId,
        title: String(item.title || 'YouTube Video').trim().slice(0, 120) || 'YouTube Video',
        addedBy: item.addedBy,
      },
    ],
  };
}

export function advanceWatchQueue(state: WatchTogetherState): {
  advanced: boolean;
  ended: boolean;
  state: WatchTogetherState;
} {
  const queue = Array.isArray(state.queue) ? [...state.queue] : [];
  if (queue.length === 0) {
    return {
      advanced: false,
      ended: true,
      state: { ...state, active: false, skipVotes: [], queue: [] },
    };
  }
  const [nextItem, ...rest] = queue;
  return {
    advanced: true,
    ended: false,
    state: {
      ...state,
      active: true,
      videoId: nextItem.videoId,
      title: nextItem.title,
      startedBy: nextItem.addedBy,
      currentTime: 0,
      isPlaying: true,
      queue: rest,
      skipVotes: [],
    },
  };
}

export function toggleSkipVoteAndAdvance(
  state: WatchTogetherState,
  username: string,
  roomParticipantCount: number
): {
  advanced: boolean;
  ended: boolean;
  state: WatchTogetherState;
} {
  const currentVotes = Array.isArray(state.skipVotes) ? [...state.skipVotes] : [];
  const idx = currentVotes.indexOf(username);
  if (idx >= 0) {
    currentVotes.splice(idx, 1);
  } else {
    currentVotes.push(username);
  }

  const threshold = Math.max(1, Math.ceil(Math.max(1, roomParticipantCount) / 2));
  const updated: WatchTogetherState = { ...state, skipVotes: currentVotes };

  if (currentVotes.length >= threshold) {
    return advanceWatchQueue(updated);
  }

  return {
    advanced: false,
    ended: false,
    state: updated,
  };
}
