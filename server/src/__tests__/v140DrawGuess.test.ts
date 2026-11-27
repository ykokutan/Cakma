import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCorrectDrawGuess,
  maskDrawWord,
  normalizeTurkishGuess,
} from '../utils/drawGuessGame.js';
import {
  registerWatchTogetherAndGamesHandlers,
  type DrawGuessRoomInternal,
} from '../features/watchTogetherAndGamesHandlers.js';
import type { MiniGameState, User, WatchTogetherState } from '../types.js';

function createMockSocket(id: string) {
  const handlers = new Map<string, (...args: any[]) => void>();
  const emitted: Array<{ target?: string; event: string; payload: any }> = [];

  const socket = {
    id,
    on(event: string, fn: (...args: any[]) => void) {
      handlers.set(event, fn);
      return socket;
    },
    emit(event: string, payload?: any) {
      emitted.push({ event, payload });
      return true;
    },
    to(target: string) {
      return {
        emit(event: string, payload?: any) {
          emitted.push({ target, event, payload });
          return true;
        },
      };
    },
    trigger(event: string, payload?: any) {
      const fn = handlers.get(event);
      assert.ok(fn, `Expected handler for ${event}`);
      fn(payload);
    },
  };

  return { socket, emitted };
}

test('drawGuessGame helpers normalize Turkish chars and mask words', () => {
  assert.equal(normalizeTurkishGuess('Çadır Şehir ÖĞRENCİ'), 'cadir sehir ogrenci');
  assert.equal(isCorrectDrawGuess('simsek', 'şimşek'), true);
  assert.equal(isCorrectDrawGuess('araba', 'roket'), false);
  assert.equal(maskDrawWord('gemi', false), '_ _ _ _');
  assert.equal(maskDrawWord('gemi', true), 'g _ _ _');
});

test('registerWatchTogetherAndGamesHandlers completes Draw & Guess start -> guess -> score -> next round flow', () => {
  const ioEmitted: Array<{ room: string; event: string; payload: any }> = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload?: any) {
          ioEmitted.push({ room, event, payload });
          return true;
        },
      };
    },
  };

  const activeUsers = new Map<string, User>([
    [
      'sock-1',
      {
        id: 'sock-1',
        username: 'Alice',
        avatar: '🎨',
        status: 'online',
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        role: 'user',
        currentVoiceChannelId: 'voice-dg',
      },
    ],
    [
      'sock-2',
      {
        id: 'sock-2',
        username: 'Bob',
        avatar: '🎮',
        status: 'online',
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        role: 'user',
        currentVoiceChannelId: 'voice-dg',
      },
    ],
  ]);

  const watchTogetherRooms = new Map<string, WatchTogetherState>();
  const miniGameRooms = new Map<string, MiniGameState>();
  const drawGuessRooms = new Map<string, DrawGuessRoomInternal>();

  const sock1 = createMockSocket('sock-1');
  const sock2 = createMockSocket('sock-2');
  const deps = {
    io: io as any,
    activeUsers,
    watchTogetherRooms,
    miniGameRooms,
    drawGuessRooms,
    addAuditLog: () => {},
  };

  registerWatchTogetherAndGamesHandlers(sock1.socket as any, deps);
  registerWatchTogetherAndGamesHandlers(sock2.socket as any, deps);

  sock1.socket.trigger('drawguess_start', { channelId: 'voice-dg' });

  const secretEvt = sock1.emitted.find((e) => e.event === 'drawguess_secret');
  assert.ok(secretEvt && secretEvt.payload?.word);
  const secretWord = String(secretEvt.payload.word);
  assert.equal(drawGuessRooms.get('voice-dg')?.drawerSocketId, 'sock-1');

  // Wrong guess from Bob
  sock2.socket.trigger('drawguess_guess', { channelId: 'voice-dg', text: 'yanlis_kelime_xyz' });
  assert.equal(drawGuessRooms.get('voice-dg')?.winnerName, null);
  assert.equal(drawGuessRooms.get('voice-dg')?.guesses.length, 1);

  // Correct guess (normalized without Turkish diacritics)
  sock2.socket.trigger('drawguess_guess', {
    channelId: 'voice-dg',
    text: normalizeTurkishGuess(secretWord),
  });

  const wonRoom = drawGuessRooms.get('voice-dg')!;
  assert.equal(wonRoom.winnerName, 'Bob');
  assert.equal(wonRoom.revealedWord, secretWord);
  assert.equal(wonRoom.scores.Bob, 15);
  assert.equal(wonRoom.scores.Alice, 10);

  // Next round rotates drawer to Bob
  sock1.socket.trigger('drawguess_next_round', { channelId: 'voice-dg' });
  const nextRoom = drawGuessRooms.get('voice-dg')!;
  assert.equal(nextRoom.round, 2);
  assert.equal(nextRoom.drawerSocketId, 'sock-2');
  assert.equal(nextRoom.winnerName, null);
  assert.ok(ioEmitted.some((e) => e.room === 'sock-2' && e.event === 'drawguess_secret'));
});
