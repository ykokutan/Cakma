import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { MiniGameState, User, WatchTogetherState } from '../types.js';
import {
  enqueueWatchVideo,
  advanceWatchQueue,
  toggleSkipVoteAndAdvance,
} from '../utils/watchTogetherQueue.js';
import {
  isCorrectDrawGuess,
  maskDrawWord,
  pickRandomDrawWord,
  type DrawGuessPublicState,
  type DrawGuessStroke,
} from '../utils/drawGuessGame.js';
import {
  advanceBracketMatch,
  advanceTriviaQuestion,
  buildTournamentBracket,
  createTriviaRoom,
  createWordChainRoom,
  getOrCreateTournament,
  recordTournamentPoints,
  submitTriviaAnswer,
  submitWordChainTurn,
  toPublicTriviaState,
  type RoomTournamentState,
  type TriviaRoomInternal,
  type WordChainRoomState,
} from '../utils/triviaAndWordChain.js';

export interface DrawGuessRoomInternal extends DrawGuessPublicState {
  secretWord: string;
}

const sharedDrawGuessRooms = new Map<string, DrawGuessRoomInternal>();
const sharedTriviaRooms = new Map<string, TriviaRoomInternal>();
const sharedWordChainRooms = new Map<string, WordChainRoomState>();
const sharedTournaments = new Map<string, RoomTournamentState>();

function toPublicDrawGuessState(room: DrawGuessRoomInternal): DrawGuessPublicState {
  return {
    channelId: room.channelId,
    drawerSocketId: room.drawerSocketId,
    drawerName: room.drawerName,
    maskedWord: room.maskedWord,
    revealedWord: room.revealedWord,
    round: room.round,
    scores: room.scores,
    guesses: room.guesses,
    winnerName: room.winnerName,
  };
}

export interface WatchTogetherAndGamesDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  watchTogetherRooms: Map<string, WatchTogetherState>;
  miniGameRooms: Map<string, MiniGameState>;
  drawGuessRooms?: Map<string, DrawGuessRoomInternal>;
  addAuditLog: (action: string, details: string, type?: 'auth' | 'info' | 'warn' | 'voice') => void;
  onGameWin?: (username: string) => void;
}

export function registerWatchTogetherAndGamesHandlers(
  socket: Pick<Socket, 'id' | 'on' | 'to' | 'emit'>,
  deps: WatchTogetherAndGamesDeps
): void {
  const { io, activeUsers, watchTogetherRooms, miniGameRooms, addAuditLog } = deps;
  const drawGuessRooms = deps.drawGuessRooms || sharedDrawGuessRooms;

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

  // 3. Draw & Guess (Çiz & Tahmin Et)
  socket.on('drawguess_start', ({ channelId }: { channelId: string }) => {
    const cleanChannelId = String(channelId || '').trim();
    if (!cleanChannelId) return;
    const user = activeUsers.get(socket.id);
    const secretWord = pickRandomDrawWord();
    const room: DrawGuessRoomInternal = {
      channelId: cleanChannelId,
      drawerSocketId: socket.id,
      drawerName: user?.username || 'Oyuncu',
      secretWord,
      maskedWord: maskDrawWord(secretWord, false),
      round: 1,
      scores: {},
      guesses: [],
      winnerName: null,
    };
    drawGuessRooms.set(cleanChannelId, room);
    io.to(cleanChannelId).emit('drawguess_clear', { channelId: cleanChannelId });
    io.to(cleanChannelId).emit('drawguess_state', toPublicDrawGuessState(room));
    socket.emit('drawguess_secret', { channelId: cleanChannelId, word: secretWord });
    addAuditLog('DRAW_GUESS', `${room.drawerName} ${cleanChannelId} odasinda Ciz & Tahmin Et baslatti.`);
  });

  socket.on('drawguess_get', ({ channelId }: { channelId: string }) => {
    const room = drawGuessRooms.get(String(channelId || '').trim());
    if (!room) return;
    socket.emit('drawguess_state', toPublicDrawGuessState(room));
    if (room.drawerSocketId === socket.id) {
      socket.emit('drawguess_secret', { channelId: room.channelId, word: room.secretWord });
    }
  });

  socket.on('drawguess_stroke', ({ channelId, stroke }: { channelId: string; stroke: DrawGuessStroke }) => {
    const cleanChannelId = String(channelId || '').trim();
    const room = drawGuessRooms.get(cleanChannelId);
    if (!room || room.drawerSocketId !== socket.id || room.winnerName) return;
    socket.to(cleanChannelId).emit('drawguess_stroke', { channelId: cleanChannelId, stroke });
  });

  socket.on('drawguess_clear', ({ channelId }: { channelId: string }) => {
    const cleanChannelId = String(channelId || '').trim();
    const room = drawGuessRooms.get(cleanChannelId);
    if (!room || room.drawerSocketId !== socket.id) return;
    io.to(cleanChannelId).emit('drawguess_clear', { channelId: cleanChannelId });
  });

  socket.on('drawguess_guess', ({ channelId, text }: { channelId: string; text: string }) => {
    const cleanChannelId = String(channelId || '').trim();
    const room = drawGuessRooms.get(cleanChannelId);
    const cleanText = String(text || '').trim();
    if (!room || !cleanText || room.winnerName) return;

    const user = activeUsers.get(socket.id);
    const authorName = user?.username || 'Oyuncu';
    const isCorrect = socket.id !== room.drawerSocketId && isCorrectDrawGuess(cleanText, room.secretWord);

    if (isCorrect) {
      room.scores[authorName] = (room.scores[authorName] || 0) + 15;
      room.scores[room.drawerName] = (room.scores[room.drawerName] || 0) + 10;
      room.winnerName = authorName;
      room.revealedWord = room.secretWord;
      room.guesses = [...room.guesses.slice(-19), { author: authorName, text: '🎯 Doğru bildi!', correct: true }];
      const tour = getOrCreateTournament(sharedTournaments, cleanChannelId);
      recordTournamentPoints(tour, authorName, 15, true);
      recordTournamentPoints(tour, room.drawerName, 10, false);
      io.to(cleanChannelId).emit('tournament_state', tour);
      deps.onGameWin?.(authorName);
    } else {
      room.guesses = [
        ...room.guesses.slice(-19),
        { author: authorName, text: cleanText.slice(0, 80), correct: false },
      ];
    }

    io.to(cleanChannelId).emit('drawguess_state', toPublicDrawGuessState(room));
  });

  socket.on('drawguess_next_round', ({ channelId }: { channelId: string }) => {
    const cleanChannelId = String(channelId || '').trim();
    const room = drawGuessRooms.get(cleanChannelId);
    if (!room) return;

    const participants = Array.from(activeUsers.entries())
      .filter(([, u]) => u.currentVoiceChannelId === cleanChannelId)
      .map(([sid, u]) => ({ sid, username: u.username }));

    let nextDrawerSid = socket.id;
    let nextDrawerName = activeUsers.get(socket.id)?.username || room.drawerName;

    if (participants.length > 0) {
      const currentIdx = participants.findIndex((p) => p.sid === room.drawerSocketId);
      const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % participants.length;
      nextDrawerSid = participants[nextIdx].sid;
      nextDrawerName = participants[nextIdx].username;
    }

    const nextRound = room.round + 1;
    const nextWord = pickRandomDrawWord(room.secretWord);
    room.drawerSocketId = nextDrawerSid;
    room.drawerName = nextDrawerName;
    room.secretWord = nextWord;
    room.round = nextRound;
    room.maskedWord = maskDrawWord(nextWord, nextRound % 2 === 0);
    room.revealedWord = undefined;
    room.winnerName = null;
    room.guesses = [];

    io.to(cleanChannelId).emit('drawguess_clear', { channelId: cleanChannelId });
    io.to(cleanChannelId).emit('drawguess_state', toPublicDrawGuessState(room));
    io.to(nextDrawerSid).emit('drawguess_secret', { channelId: cleanChannelId, word: nextWord });
  });

  // 4. Live Trivia
  socket.on('trivia_start', ({ channelId }: { channelId: string }) => {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) return;
    const room = createTriviaRoom(cleanId, 5);
    sharedTriviaRooms.set(cleanId, room);
    io.to(cleanId).emit('trivia_state', toPublicTriviaState(room));
  });

  socket.on('trivia_get', ({ channelId }: { channelId: string }) => {
    const room = sharedTriviaRooms.get(String(channelId || '').trim());
    if (room) socket.emit('trivia_state', toPublicTriviaState(room));
  });

  socket.on('trivia_answer', ({ channelId, optionIndex }: { channelId: string; optionIndex: number }) => {
    const cleanId = String(channelId || '').trim();
    const room = sharedTriviaRooms.get(cleanId);
    const user = activeUsers.get(socket.id);
    if (!room || !user) return;
    const res = submitTriviaAnswer(room, user.username, Number(optionIndex));
    if (!res.accepted) return;
    if (res.correct) {
      const tour = getOrCreateTournament(sharedTournaments, cleanId);
      recordTournamentPoints(tour, user.username, 10, false);
      io.to(cleanId).emit('tournament_state', tour);
    }
    io.to(cleanId).emit('trivia_state', toPublicTriviaState(room));
  });

  socket.on('trivia_next', ({ channelId }: { channelId: string }) => {
    const cleanId = String(channelId || '').trim();
    const room = sharedTriviaRooms.get(cleanId);
    if (!room) return;
    advanceTriviaQuestion(room);
    if (room.finished && room.winnerName) {
      const tour = getOrCreateTournament(sharedTournaments, cleanId);
      recordTournamentPoints(tour, room.winnerName, 20, true);
      io.to(cleanId).emit('tournament_state', tour);
      deps.onGameWin?.(room.winnerName);
    }
    io.to(cleanId).emit('trivia_state', toPublicTriviaState(room));
  });

  // 5. Turkish Word Chain (Kelime Zinciri)
  socket.on('wordchain_start', ({ channelId }: { channelId: string }) => {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) return;
    const user = activeUsers.get(socket.id);
    const room = createWordChainRoom(cleanId, user?.username || 'Oyuncu');
    sharedWordChainRooms.set(cleanId, room);
    io.to(cleanId).emit('wordchain_state', room);
  });

  socket.on('wordchain_get', ({ channelId }: { channelId: string }) => {
    const room = sharedWordChainRooms.get(String(channelId || '').trim());
    if (room) socket.emit('wordchain_state', room);
  });

  socket.on('wordchain_submit', ({ channelId, word }: { channelId: string; word: string }) => {
    const cleanId = String(channelId || '').trim();
    const room = sharedWordChainRooms.get(cleanId);
    const user = activeUsers.get(socket.id);
    if (!room || !user) return;
    const outcome = submitWordChainTurn(room, user.username, word);
    if (!outcome.ok) {
      socket.emit('wordchain_error', { channelId: cleanId, error: outcome.error });
      return;
    }
    const tour = getOrCreateTournament(sharedTournaments, cleanId);
    recordTournamentPoints(tour, user.username, Math.min(12, word.trim().length), false);
    io.to(cleanId).emit('tournament_state', tour);
    io.to(cleanId).emit('wordchain_state', outcome.state);
  });

  // 6. Room Tournament Scoreboard & Elimination Bracket
  socket.on('tournament_get', ({ channelId }: { channelId: string }) => {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) return;
    socket.emit('tournament_state', getOrCreateTournament(sharedTournaments, cleanId));
  });

  socket.on('tournament_create_bracket', ({ channelId, participants }: { channelId: string; participants?: string[] }) => {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) return;
    const tour = getOrCreateTournament(sharedTournaments, cleanId);
    const activeRoomUsers = Array.from(activeUsers.values())
      .filter((u) => u.currentVoiceChannelId === cleanId)
      .map((u) => u.username);
    const list = Array.isArray(participants) && participants.length >= 2 ? participants : activeRoomUsers;
    buildTournamentBracket(tour, list);
    io.to(cleanId).emit('tournament_state', tour);
  });

  socket.on('tournament_report_winner', ({ channelId, matchId, winner }: { channelId: string; matchId: string; winner: string }) => {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) return;
    const tour = getOrCreateTournament(sharedTournaments, cleanId);
    advanceBracketMatch(tour, String(matchId || ''), String(winner || ''));
    if (tour.champion) {
      deps.onGameWin?.(tour.champion);
    }
    io.to(cleanId).emit('tournament_state', tour);
  });
}
