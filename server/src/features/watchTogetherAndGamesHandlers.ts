import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { MiniGameState, User, WatchTogetherState } from '../types.js';
import {
  enqueueWatchVideo,
  advanceWatchQueue,
  toggleSkipVoteAndAdvance,
} from '../utils/watchTogetherQueue.js';

export interface WatchTogetherAndGamesDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  watchTogetherRooms: Map<string, WatchTogetherState>;
  miniGameRooms: Map<string, MiniGameState>;
  addAuditLog: (action: string, details: string, type?: 'auth' | 'info' | 'warn' | 'voice') => void;
}

export function registerWatchTogetherAndGamesHandlers(
  socket: Pick<Socket, 'id' | 'on' | 'to' | 'emit'>,
  deps: WatchTogetherAndGamesDeps
): void {
  const { io, activeUsers, watchTogetherRooms, miniGameRooms, addAuditLog } = deps;

  // 1. Watch Together (YouTube Sineması - Scoped to active voice room)
  socket.on('watch_together_start', ({ channelId, videoId, title }: { channelId: string; videoId: string; title: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState: WatchTogetherState = {
      channelId,
      active: true,
      videoId,
      title: title || 'YouTube Video',
      isPlaying: true,
      currentTime: 0,
      startedBy: user.username,
      queue: [],
      skipVotes: [],
    };
    watchTogetherRooms.set(channelId, roomState);
    io.to(channelId).emit('watch_together_update', roomState);
    addAuditLog('WATCH_TOGETHER', `${user.username} ${channelId} odasinda YouTube sinemasi baslatti: "${title}"`);
  });

  socket.on('watch_together_enqueue', ({ channelId, videoId, title }: { channelId: string; videoId: string; title?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState = watchTogetherRooms.get(channelId);
    if (!roomState || !roomState.active) return;
    const nextState = enqueueWatchVideo(roomState, {
      id: `wtq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      videoId,
      title: title || 'Sıradaki Video',
      addedBy: user.username,
    });
    watchTogetherRooms.set(channelId, nextState);
    io.to(channelId).emit('watch_together_update', nextState);
  });

  socket.on('watch_together_skip_vote', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState = watchTogetherRooms.get(channelId);
    if (!roomState || !roomState.active) return;
    const participantCount = Array.from(activeUsers.values()).filter(
      (u) => u.currentVoiceChannelId === channelId
    ).length;
    const outcome = toggleSkipVoteAndAdvance(roomState, user.username, participantCount);
    if (outcome.ended) {
      watchTogetherRooms.delete(channelId);
      io.to(channelId).emit('watch_together_ended');
      return;
    }
    watchTogetherRooms.set(channelId, outcome.state);
    io.to(channelId).emit('watch_together_update', outcome.state);
  });

  socket.on('watch_together_next', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState = watchTogetherRooms.get(channelId);
    if (!roomState || !roomState.active) return;
    const outcome = advanceWatchQueue(roomState);
    if (outcome.ended) {
      watchTogetherRooms.delete(channelId);
      io.to(channelId).emit('watch_together_ended');
      return;
    }
    watchTogetherRooms.set(channelId, outcome.state);
    io.to(channelId).emit('watch_together_update', outcome.state);
  });

  socket.on('watch_together_action', ({ channelId, action, currentTime }: { channelId: string; action: 'play' | 'pause' | 'seek'; currentTime: number }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    const roomState = watchTogetherRooms.get(channelId);
    if (!roomState) return;
    if (action === 'play') roomState.isPlaying = true;
    if (action === 'pause') roomState.isPlaying = false;
    roomState.currentTime = currentTime;
    socket.to(channelId).emit('watch_together_sync', { action, currentTime, isPlaying: roomState.isPlaying });
  });

  socket.on('watch_together_stop', ({ channelId }: { channelId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || user.currentVoiceChannelId !== channelId) return;
    watchTogetherRooms.delete(channelId);
    io.to(channelId).emit('watch_together_ended');
  });

  socket.on('watch_together_get', ({ channelId }: { channelId: string }) => {
    const roomState = watchTogetherRooms.get(channelId);
    if (roomState) {
      socket.emit('watch_together_update', roomState);
    }
  });

  // 2. Mini Games (XOX & TypeRacer)
  socket.on('minigame_start', ({ channelId, game }: { channelId: string; game: 'xox' | 'typeracer' }) => {
    const user = activeUsers.get(socket.id);
    const state: MiniGameState = {
      channelId,
      game,
      board: Array(9).fill(null),
      turn: 'X',
      winner: null,
      players: { X: socket.id, O: '' },
      playerNames: { X: user?.username || 'Oyuncu 1', O: 'Bekleniyor...' }
    };
    miniGameRooms.set(channelId, state);
    io.to(channelId).emit('minigame_update', state);
  });

  socket.on('minigame_join', ({ channelId }: { channelId: string }) => {
    const state = miniGameRooms.get(channelId);
    const user = activeUsers.get(socket.id);
    if (state && !state.players?.O && state.players?.X !== socket.id) {
      state.players!.O = socket.id;
      state.playerNames!.O = user?.username || 'Oyuncu 2';
      io.to(channelId).emit('minigame_update', state);
    }
  });

  socket.on('minigame_move', ({ channelId, index }: { channelId: string; index: number }) => {
    const state = miniGameRooms.get(channelId);
    if (!state || state.winner || !state.board) return;
    const currentSymbol = state.turn || 'X';
    if (state.board[index] !== null) return;

    state.board[index] = currentSymbol;

    const lines = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];
    let won = false;
    for (const [a, b, c] of lines) {
      if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
        state.winner = currentSymbol;
        won = true;
        break;
      }
    }
    if (!won && state.board.every(cell => cell !== null)) {
      state.winner = 'draw';
    } else if (!won) {
      state.turn = currentSymbol === 'X' ? 'O' : 'X';
    }

    io.to(channelId).emit('minigame_update', state);
  });

  socket.on('minigame_reset', ({ channelId }: { channelId: string }) => {
    const state = miniGameRooms.get(channelId);
    if (!state) return;
    state.board = Array(9).fill(null);
    state.turn = 'X';
    state.winner = null;
    io.to(channelId).emit('minigame_update', state);
  });

  socket.on('minigame_stop', ({ channelId }: { channelId: string }) => {
    miniGameRooms.delete(channelId);
    io.to(channelId).emit('minigame_ended');
  });
}
