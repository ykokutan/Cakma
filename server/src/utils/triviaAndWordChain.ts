export interface TriviaQuestion {
  id: string;
  category: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export interface TriviaPublicState {
  channelId: string;
  round: number;
  totalRounds: number;
  category: string;
  question: string;
  options: [string, string, string, string];
  revealed: boolean;
  correctIndex?: number;
  answeredUsers: string[];
  scores: Record<string, number>;
  finished: boolean;
  winnerName: string | null;
}

export interface TriviaRoomInternal {
  channelId: string;
  round: number;
  totalRounds: number;
  questions: TriviaQuestion[];
  answers: Record<string, number>;
  revealed: boolean;
  scores: Record<string, number>;
  finished: boolean;
  winnerName: string | null;
}

export const TRIVIA_BANK: TriviaQuestion[] = [
  { id: 't1', category: 'Oyun', question: 'Counter-Strike serisinde "de_dust2" haritası hangi oyunla ünlenmiştir?', options: ['Half-Life / CS 1.6', 'Quake III', 'Team Fortress', 'Doom'], correctIndex: 0 },
  { id: 't2', category: 'Teknoloji', question: 'WebRTC ses iletişiminde yaygın kullanılan düşük gecikmeli ses kodeği hangisidir?', options: ['MP3', 'Opus', 'FLAC', 'WMA'], correctIndex: 1 },
  { id: 't3', category: 'Bilim', question: 'Güneş sistemindeki en büyük gezegen hangisidir?', options: ['Satürn', 'Neptün', 'Jüpiter', 'Uranüs'], correctIndex: 2 },
  { id: 't4', category: 'Genel', question: 'Türkiye’nin başkenti neresidir?', options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], correctIndex: 2 },
  { id: 't5', category: 'Teknoloji', question: 'HTTP 404 durum kodu ne anlama gelir?', options: ['Yetkisiz Erişim', 'Sayfa Bulunamadı', 'Sunucu Hatası', 'Zaman Aşımı'], correctIndex: 1 },
  { id: 't6', category: 'Oyun', question: 'League of Legends oyununda Sihirdar Vadisi’nde bir takımda kaç oyuncu bulunur?', options: ['4', '5', '6', '7'], correctIndex: 1 },
  { id: 't7', category: 'Teknoloji', question: 'TypeScript dilini hangi teknoloji şirketi geliştirmiştir?', options: ['Google', 'Meta', 'Microsoft', 'Apple'], correctIndex: 2 },
  { id: 't8', category: 'Bilim', question: 'Suyun deniz seviyesindeki kaynama sıcaklığı kaç °C’dir?', options: ['90°C', '100°C', '110°C', '120°C'], correctIndex: 1 },
  { id: 't9', category: 'Oyun', question: 'Minecraft dünyasında patlayan yeşil yaratığın adı nedir?', options: ['Enderman', 'Creeper', 'Ghast', 'Blaze'], correctIndex: 1 },
  { id: 't10', category: 'Teknoloji', question: 'Git’te uzak depodan değişiklikleri çekip mevcut dala birleştiren komut hangisidir?', options: ['git pull', 'git push', 'git stash', 'git init'], correctIndex: 0 },
  { id: 't11', category: 'Bilim', question: 'Işık hızına en yakın hız yaklaşık kaç km/s’dir?', options: ['150.000 km/s', '300.000 km/s', '500.000 km/s', '1.000.000 km/s'], correctIndex: 1 },
  { id: 't12', category: 'Oyun', question: 'VALORANT’ta Spike’ı çözmek (defuse) standart olarak kaç saniye sürer?', options: ['4 saniye', '5 saniye', '7 saniye', '10 saniye'], correctIndex: 2 },
  { id: 't13', category: 'Genel', question: 'Satranç tahtasında toplam kaç kare vardır?', options: ['48', '56', '64', '72'], correctIndex: 2 },
  { id: 't14', category: 'Teknoloji', question: 'SQLite veritabanında eşzamanlı okuma/yazma performansı için önerilen günlük modu hangisidir?', options: ['WAL', 'CSV', 'RAW', 'FTP'], correctIndex: 0 },
  { id: 't15', category: 'Bilim', question: 'İnsan DNA’sı hangi şekle sahip çift sarmal yapıdadır?', options: ['Üçgen prizma', 'Çift sarmal (Heliks)', 'Düz çizgi', 'Küp'], correctIndex: 1 },
  { id: 't16', category: 'Oyun', question: 'Elden Ring’i geliştiren stüdyo hangisidir?', options: ['FromSoftware', 'CD Projekt Red', 'Valve', 'Bethesda'], correctIndex: 0 },
];

export function createTriviaRoom(channelId: string, totalRounds = 5): TriviaRoomInternal {
  const pool = [...TRIVIA_BANK].sort(() => Math.random() - 0.5).slice(0, Math.min(totalRounds, TRIVIA_BANK.length));
  return {
    channelId,
    round: 1,
    totalRounds: pool.length,
    questions: pool,
    answers: {},
    revealed: false,
    scores: {},
    finished: false,
    winnerName: null,
  };
}

export function toPublicTriviaState(room: TriviaRoomInternal): TriviaPublicState {
  const currentQ = room.questions[room.round - 1] || room.questions[0];
  return {
    channelId: room.channelId,
    round: room.round,
    totalRounds: room.totalRounds,
    category: currentQ.category,
    question: currentQ.question,
    options: currentQ.options,
    revealed: room.revealed,
    ...(room.revealed ? { correctIndex: currentQ.correctIndex } : {}),
    answeredUsers: Object.keys(room.answers),
    scores: room.scores,
    finished: room.finished,
    winnerName: room.winnerName,
  };
}

export function submitTriviaAnswer(
  room: TriviaRoomInternal,
  username: string,
  optionIndex: number
): { accepted: boolean; correct: boolean } {
  if (room.finished || room.revealed) return { accepted: false, correct: false };
  if (optionIndex < 0 || optionIndex > 3) return { accepted: false, correct: false };
  if (username in room.answers) return { accepted: false, correct: false };

  const currentQ = room.questions[room.round - 1];
  room.answers[username] = optionIndex;
  const correct = currentQ && optionIndex === currentQ.correctIndex;
  if (correct) {
    room.scores[username] = (room.scores[username] || 0) + 10;
  } else if (!(username in room.scores)) {
    room.scores[username] = 0;
  }
  return { accepted: true, correct };
}

export function advanceTriviaQuestion(room: TriviaRoomInternal): TriviaRoomInternal {
  if (!room.revealed) {
    room.revealed = true;
    return room;
  }
  if (room.round >= room.totalRounds) {
    room.finished = true;
    const sorted = Object.entries(room.scores).sort((a, b) => b[1] - a[1]);
    room.winnerName = sorted.length > 0 && sorted[0][1] > 0 ? sorted[0][0] : null;
    return room;
  }
  room.round += 1;
  room.answers = {};
  room.revealed = false;
  return room;
}

// Turkish Word Chain
export interface WordChainRoomState {
  channelId: string;
  currentWord: string;
  requiredChar: string;
  lastAuthor: string;
  usedWords: string[];
  scores: Record<string, number>;
  lastError?: string;
}

const STARTER_WORDS = ['elma', 'kalem', 'masal', 'deniz', 'kitap', 'bulut', 'kale', 'oyun'];

export function normalizeTurkishWord(raw: string): string {
  return String(raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-zçğıöşü]/g, '');
}

export function getRequiredNextStartChar(word: string): string {
  const norm = normalizeTurkishWord(word);
  if (!norm) return 'a';
  const last = norm[norm.length - 1];
  // Avoid deadlocking on trailing soft-g ('ğ') since no standard Turkish word starts with 'ğ'
  if (last === 'ğ') return 'g';
  return last;
}

export function createWordChainRoom(channelId: string, hostUsername: string): WordChainRoomState {
  const firstWord = STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)];
  return {
    channelId,
    currentWord: firstWord,
    requiredChar: getRequiredNextStartChar(firstWord),
    lastAuthor: hostUsername,
    usedWords: [firstWord],
    scores: { [hostUsername]: 0 },
  };
}

export function submitWordChainTurn(
  room: WordChainRoomState,
  username: string,
  rawWord: string
): { ok: true; state: WordChainRoomState } | { ok: false; error: string } {
  const word = normalizeTurkishWord(rawWord);
  if (word.length < 2) {
    return { ok: false, error: 'Kelime en az 2 harfli olmalıdır.' };
  }
  if (room.lastAuthor.toLowerCase() === username.toLowerCase() && Object.keys(room.scores).length > 1) {
    return { ok: false, error: 'Art arda iki kelime söyleyemezsiniz.' };
  }
  if (!word.startsWith(room.requiredChar)) {
    return { ok: false, error: `"${room.requiredChar.toLocaleUpperCase('tr-TR')}" harfi ile başlamalı!` };
  }
  if (room.usedWords.includes(word)) {
    return { ok: false, error: `"${word}" daha önce kullanıldı!` };
  }

  room.currentWord = word;
  room.requiredChar = getRequiredNextStartChar(word);
  room.lastAuthor = username;
  room.usedWords = [...room.usedWords.slice(-99), word];
  room.scores[username] = (room.scores[username] || 0) + word.length;
  room.lastError = undefined;
  return { ok: true, state: room };
}

// Room Tournament (Leaderboard + Elimination Bracket)
export interface TournamentBracketMatch {
  id: string;
  round: number;
  playerA: string | null;
  playerB: string | null;
  winner: string | null;
}

export interface RoomTournamentState {
  channelId: string;
  scoreboard: Record<string, { points: number; wins: number }>;
  bracket: TournamentBracketMatch[];
  champion: string | null;
}

export function getOrCreateTournament(
  store: Map<string, RoomTournamentState>,
  channelId: string
): RoomTournamentState {
  let st = store.get(channelId);
  if (!st) {
    st = { channelId, scoreboard: {}, bracket: [], champion: null };
    store.set(channelId, st);
  }
  return st;
}

export function recordTournamentPoints(
  st: RoomTournamentState,
  username: string,
  points: number,
  isWin: boolean
): void {
  if (!username) return;
  const cur = st.scoreboard[username] || { points: 0, wins: 0 };
  cur.points += Math.max(0, points);
  if (isWin) cur.wins += 1;
  st.scoreboard[username] = cur;
}

export function buildTournamentBracket(st: RoomTournamentState, participants: string[]): RoomTournamentState {
  const unique = Array.from(new Set(participants.map((p) => p.trim()).filter(Boolean))).slice(0, 8);
  const shuffled = [...unique].sort(() => Math.random() - 0.5);
  const matches: TournamentBracketMatch[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i] || null;
    const b = shuffled[i + 1] || null;
    matches.push({
      id: `m-r1-${i / 2 + 1}`,
      round: 1,
      playerA: a,
      playerB: b,
      winner: a && !b ? a : null,
    });
  }
  st.bracket = matches;
  st.champion = matches.length === 1 && matches[0].winner ? matches[0].winner : null;
  return st;
}

export function advanceBracketMatch(
  st: RoomTournamentState,
  matchId: string,
  winner: string
): RoomTournamentState {
  const target = st.bracket.find((m) => m.id === matchId);
  if (!target) return st;
  if (winner !== target.playerA && winner !== target.playerB) return st;
  target.winner = winner;
  recordTournamentPoints(st, winner, 25, true);

  const curRound = target.round;
  const roundMatches = st.bracket.filter((m) => m.round === curRound);
  if (roundMatches.every((m) => Boolean(m.winner))) {
    if (roundMatches.length === 1) {
      st.champion = roundMatches[0].winner;
    } else {
      const nextRound = curRound + 1;
      if (!st.bracket.some((m) => m.round === nextRound)) {
        for (let i = 0; i < roundMatches.length; i += 2) {
          const a = roundMatches[i]?.winner || null;
          const b = roundMatches[i + 1]?.winner || null;
          st.bracket.push({
            id: `m-r${nextRound}-${i / 2 + 1}`,
            round: nextRound,
            playerA: a,
            playerB: b,
            winner: a && !b ? a : null,
          });
        }
      }
    }
  }
  return st;
}
