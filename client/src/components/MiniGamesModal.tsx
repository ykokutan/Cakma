import React, { useState, useEffect, useRef } from 'react';
import { X, Gamepad2, Trophy, RotateCcw, Zap, UserCheck, Brush, Trash2, Send, HelpCircle, Type } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface MiniGamesModalProps {
  channelId: string;
  onClose: () => void;
}

interface TriviaPublicState {
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

interface WordChainRoomState {
  channelId: string;
  currentWord: string;
  requiredChar: string;
  lastAuthor: string;
  usedWords: string[];
  scores: Record<string, number>;
}

interface RoomTournamentState {
  channelId: string;
  scoreboard: Record<string, { points: number; wins: number }>;
  bracket: Array<{ id: string; round: number; playerA: string | null; playerB: string | null; winner: string | null }>;
  champion: string | null;
}

interface DrawStrokePoint {
  x: number;
  y: number;
}

interface DrawGuessStroke {
  points: DrawStrokePoint[];
  color: string;
  width: number;
}

interface DrawGuessPublicState {
  channelId: string;
  drawerSocketId: string;
  drawerName: string;
  maskedWord: string;
  revealedWord?: string;
  round: number;
  scores: Record<string, number>;
  guesses: Array<{ author: string; text: string; correct: boolean }>;
  winnerName: string | null;
}

const SAMPLE_TEXTS = [
  'Discord ve TeamSpeak hibrit ses platformunda ultra düşük gecikmeli WebRTC ses kalitesi deneyimi.',
  'Hızlı koşan atın tozu seyrek düşer derler ama klavyede parmaklar rüzgar gibi esiyor.',
  'Yazılım geliştirmek bir heykeltıraşın mermeri ince ince yontup sanat eserine dönüştürmesine benzer.',
  'Teknoloji dünyasında en önemli kural hata yapmaktan korkmamak ve sürekli öğrenmeye devam etmektir.',
];

const DRAW_COLORS = ['#ffffff', '#f43f5e', '#f59e0b', '#10b981', '#38bdf8', '#a855f7'];

function paintStrokeOnCanvas(ctx: CanvasRenderingContext2D, stroke: DrawGuessStroke) {
  if (!stroke.points || stroke.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = stroke.color || '#ffffff';
  ctx.lineWidth = stroke.width || 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
  }
  ctx.stroke();
  ctx.restore();
}

export const MiniGamesModal: React.FC<MiniGamesModalProps> = ({ channelId, onClose }) => {
  const {
    socket,
    currentUser,
    miniGameState,
    startMiniGame,
    joinMiniGame,
    sendMiniGameMove,
    resetMiniGame,
  } = useSocket();
  const [activeTab, setActiveTab] = useState<'xox' | 'typeracer' | 'drawguess' | 'trivia' | 'wordchain' | 'tournament'>('xox');

  // TypeRacer State
  const [currentPrompt, setCurrentPrompt] = useState(SAMPLE_TEXTS[0]);
  const [typedText, setTypedText] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Draw & Guess State
  const [drawState, setDrawState] = useState<DrawGuessPublicState | null>(null);
  const [secretWord, setSecretWord] = useState<string>('');
  const [guessText, setGuessText] = useState('');
  const [brushColor, setBrushColor] = useState<string>(DRAW_COLORS[0]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokePointsRef = useRef<DrawStrokePoint[]>([]);

  // Trivia, Word Chain, Tournament State
  const [triviaState, setTriviaState] = useState<TriviaPublicState | null>(null);
  const [selectedTriviaOpt, setSelectedTriviaOpt] = useState<number | null>(null);
  const [wordChainState, setWordChainState] = useState<WordChainRoomState | null>(null);
  const [wordChainInput, setWordChainInput] = useState('');
  const [wordChainError, setWordChainError] = useState<string | null>(null);
  const [tournamentState, setTournamentState] = useState<RoomTournamentState | null>(null);

  useEffect(() => {
    if (!socket) return;
    if (activeTab === 'trivia') {
      const onState = (st: TriviaPublicState) => {
        if (st?.channelId !== channelId) return;
        setTriviaState(st);
        if (!st.answeredUsers.includes(currentUser?.username || '')) {
          setSelectedTriviaOpt(null);
        }
      };
      socket.on('trivia_state', onState);
      socket.emit('trivia_get', { channelId });
      return () => {
        socket.off('trivia_state', onState);
      };
    }
    if (activeTab === 'wordchain') {
      const onWc = (st: WordChainRoomState) => {
        if (st?.channelId !== channelId) return;
        setWordChainState(st);
        setWordChainError(null);
      };
      const onErr = (p: { channelId?: string; error?: string }) => {
        if (p?.channelId !== channelId) return;
        setWordChainError(p.error || 'Geçersiz kelime.');
      };
      socket.on('wordchain_state', onWc);
      socket.on('wordchain_error', onErr);
      socket.emit('wordchain_get', { channelId });
      return () => {
        socket.off('wordchain_state', onWc);
        socket.off('wordchain_error', onErr);
      };
    }
    if (activeTab === 'tournament') {
      const onTour = (st: RoomTournamentState) => {
        if (st?.channelId === channelId) setTournamentState(st);
      };
      socket.on('tournament_state', onTour);
      socket.emit('tournament_get', { channelId });
      return () => {
        socket.off('tournament_state', onTour);
      };
    }
  }, [socket, activeTab, channelId, currentUser?.username]);

  useEffect(() => {
    if (activeTab === 'xox' && !miniGameState) {
      startMiniGame(channelId, 'xox');
    }
  }, [activeTab, channelId, miniGameState, startMiniGame]);

  useEffect(() => {
    if (!socket || activeTab !== 'drawguess') return;

    const handleState = (state: DrawGuessPublicState) => {
      if (state.channelId !== channelId) return;
      setDrawState(state);
      if (state.drawerSocketId !== socket.id) {
        setSecretWord('');
      }
    };

    const handleSecret = ({ channelId: cid, word }: { channelId: string; word: string }) => {
      if (cid !== channelId) return;
      setSecretWord(word);
    };

    const handleStroke = ({ channelId: cid, stroke }: { channelId: string; stroke: DrawGuessStroke }) => {
      if (cid !== channelId) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) paintStrokeOnCanvas(ctx, stroke);
    };

    const handleClear = ({ channelId: cid }: { channelId: string }) => {
      if (cid !== channelId) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    socket.on('drawguess_state', handleState);
    socket.on('drawguess_secret', handleSecret);
    socket.on('drawguess_stroke', handleStroke);
    socket.on('drawguess_clear', handleClear);
    socket.emit('drawguess_get', { channelId });

    return () => {
      socket.off('drawguess_state', handleState);
      socket.off('drawguess_secret', handleSecret);
      socket.off('drawguess_stroke', handleStroke);
      socket.off('drawguess_clear', handleClear);
    };
  }, [socket, activeTab, channelId]);

  const isDrawer = Boolean(drawState && socket && drawState.drawerSocketId === socket.id);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): DrawStrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) * canvas.width) / Math.max(1, rect.width)),
      y: Math.round(((e.clientY - rect.top) * canvas.height) / Math.max(1, rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer || drawState?.winnerName || !canvasRef.current) return;
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e);
    currentStrokePointsRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !isDrawer || !canvasRef.current) return;
    const prev = currentStrokePointsRef.current[currentStrokePointsRef.current.length - 1];
    const pt = getCanvasPoint(e);
    currentStrokePointsRef.current.push(pt);
    const ctx = canvasRef.current.getContext('2d');
    if (ctx && prev) {
      paintStrokeOnCanvas(ctx, { points: [prev, pt], color: brushColor, width: 4 });
    }
  };

  const finishStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const points = currentStrokePointsRef.current;
    currentStrokePointsRef.current = [];
    if (points.length > 0 && socket && isDrawer) {
      socket.emit('drawguess_stroke', {
        channelId,
        stroke: { points, color: brushColor, width: 4 },
      });
    }
  };

  const handleSubmitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = guessText.trim();
    if (!clean || !socket || !drawState) return;
    socket.emit('drawguess_guess', { channelId, text: clean });
    setGuessText('');
  };

  // TypeRacer Handlers
  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!startTime && val.length === 1) {
      setStartTime(Date.now());
    }
    setTypedText(val);

    if (val === currentPrompt) {
      setIsCompleted(true);
      const elapsedMinutes = (Date.now() - (startTime || Date.now())) / 60000;
      const wordCount = currentPrompt.split(/\s+/).length;
      const speed = Math.round(wordCount / (elapsedMinutes || 0.01));
      setWpm(speed);
    }
  };

  const handleResetTypeRacer = () => {
    const nextIdx = (SAMPLE_TEXTS.indexOf(currentPrompt) + 1) % SAMPLE_TEXTS.length;
    setCurrentPrompt(SAMPLE_TEXTS[nextIdx]);
    setTypedText('');
    setStartTime(null);
    setWpm(0);
    setIsCompleted(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // XOX Board State
  const board = miniGameState?.board || Array(9).fill(null);
  const isMyTurn =
    (miniGameState?.turn === 'X' && miniGameState?.players?.X === currentUser?.id) ||
    (miniGameState?.turn === 'O' && miniGameState?.players?.O === currentUser?.id) ||
    !miniGameState?.players?.O;

  const handleCellClick = (idx: number) => {
    if (board[idx] || miniGameState?.winner || !isMyTurn) return;
    sendMiniGameMove(channelId, idx);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className={`relative w-full ${
          activeTab === 'drawguess' ? 'max-w-2xl' : 'max-w-xl'
        } bg-[#12131a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90dvh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                Ses Odası Aktiviteleri &amp; Mini Oyunlar
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                  Canlı Çok Oyunculu
                </span>
              </h3>
              <p className="text-[11px] text-white/50">
                Arkadaşlarınızla muhabbet ederken eğlenceli oyunlar oynayın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-white/[0.01] px-5 pt-2 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('xox')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'xox'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <span>❌⭕ XOX (Tic-Tac-Toe)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('typeracer')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'typeracer'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>⌨️ TypeRacer</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drawguess')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'drawguess'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Brush className="w-3.5 h-3.5 text-emerald-400" />
            <span>🎨 Çiz &amp; Tahmin Et</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trivia')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'trivia'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>🧠 Bilgi Yarışması</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wordchain')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'wordchain'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Type className="w-3.5 h-3.5 text-amber-400" />
            <span>🔤 Kelime Zinciri</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tournament')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'tournament'
                ? 'border-yellow-400 text-yellow-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <span>🏆 Turnuva</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto">
          {activeTab === 'xox' ? (
            /* XOX Game */
            <div className="space-y-5 flex flex-col items-center">
              <div className="flex items-center justify-between w-full text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cyan-400">
                    ❌ {miniGameState?.playerNames?.X || 'Oyuncu 1'}
                  </span>
                  <span className="text-white/30">vs</span>
                  <span className="font-bold text-pink-400">
                    ⭕ {miniGameState?.playerNames?.O || 'Oyuncu 2'}
                  </span>
                </div>

                <div className="text-[11px]">
                  {miniGameState?.winner ? (
                    <span className="font-bold text-emerald-400">
                      {miniGameState.winner === 'draw'
                        ? '🤝 Berabere Bitti!'
                        : `🏆 Kazanan: ${miniGameState.winner}!`}
                    </span>
                  ) : (
                    <span className="text-white/70">
                      Sıra:{' '}
                      <strong className={miniGameState?.turn === 'X' ? 'text-cyan-400' : 'text-pink-400'}>
                        {miniGameState?.turn}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 w-64 h-64 p-2 rounded-2xl bg-white/[0.03] border border-white/10">
                {board.map((cell, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleCellClick(idx)}
                    disabled={Boolean(cell || miniGameState?.winner)}
                    className={`rounded-xl border flex items-center justify-center text-3xl font-black transition-all ${
                      cell === 'X'
                        ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-400 shadow-md shadow-cyan-500/20'
                        : cell === 'O'
                        ? 'border-pink-500/50 bg-pink-500/20 text-pink-400 shadow-md shadow-pink-500/20'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/10 text-white/20'
                    }`}
                  >
                    {cell}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => resetMiniGame(channelId)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Yeni Tur Başlat</span>
                </button>

                {!miniGameState?.players?.O && miniGameState?.players?.X !== currentUser?.id && (
                  <button
                    type="button"
                    onClick={() => joinMiniGame(channelId)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-600/30"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>2. Oyuncu Olarak Katıl (⭕)</span>
                  </button>
                )}
              </div>
            </div>
          ) : activeTab === 'typeracer' ? (
            /* TypeRacer Game */
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs leading-relaxed select-none">
                {currentPrompt.split('').map((char, index) => {
                  let colorClass = 'text-white/60';
                  if (index < typedText.length) {
                    colorClass =
                      typedText[index] === char
                        ? 'text-emerald-400 font-bold'
                        : 'text-red-400 font-bold bg-red-500/20';
                  }
                  return (
                    <span key={index} className={colorClass}>
                      {char}
                    </span>
                  );
                })}
              </div>

              <div>
                <input
                  ref={inputRef}
                  type="text"
                  value={typedText}
                  onChange={handleTypeChange}
                  disabled={isCompleted}
                  placeholder="Yukarıdaki metni buraya yazmaya başla..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-xs text-white placeholder-white/30"
                />
              </div>

              {isCompleted ? (
                <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fade-in shadow-lg">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <span>
                      Tebrikler! Metni tamamladınız. Hızınız: <strong>{wpm} WPM</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetTypeRacer}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                  >
                    Sonraki Cümle
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>İlerleme: %{Math.round((typedText.length / currentPrompt.length) * 100)}</span>
                  <button
                    type="button"
                    onClick={handleResetTypeRacer}
                    className="text-white/50 hover:text-white transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Cümleyi Değiştir</span>
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'trivia' ? (
            !triviaState ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                  <HelpCircle className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Canlı Bilgi Yarışması (5 Tur)</h4>
                  <p className="text-xs text-white/50 mt-1">
                    Oyun, teknoloji ve genel kültür sorularını oda arkadaşlarınızla canlı yarışarak çözün.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => socket?.emit('trivia_start', { channelId })}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition"
                >
                  Yarışmayı Başlat
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 font-bold">
                    Soru {triviaState.round} / {triviaState.totalRounds} · {triviaState.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => socket?.emit('trivia_next', { channelId })}
                      className="px-3 py-1 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold"
                    >
                      {triviaState.finished
                        ? 'Bitti'
                        : triviaState.revealed
                        ? triviaState.round >= triviaState.totalRounds
                          ? 'Sonucu Gör'
                          : 'Sonraki Soru'
                        : 'Cevabı Aç'}
                    </button>
                    {triviaState.finished && (
                      <button
                        type="button"
                        onClick={() => socket?.emit('trivia_start', { channelId })}
                        className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-semibold"
                      >
                        Yeni Oyun
                      </button>
                    )}
                  </div>
                </div>

                {triviaState.finished && (
                  <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold">
                    🏆 Şampiyon: {triviaState.winnerName ? `@${triviaState.winnerName}` : 'Berabere'}
                  </div>
                )}

                <div className="p-4 rounded-2xl bg-black/35 border border-white/10 text-sm font-bold text-white">
                  {triviaState.question}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {triviaState.options.map((opt, idx) => {
                    const isCorrect = triviaState.revealed && triviaState.correctIndex === idx;
                    const isPicked = selectedTriviaOpt === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={triviaState.revealed || triviaState.finished}
                        onClick={() => {
                          setSelectedTriviaOpt(idx);
                          socket?.emit('trivia_answer', { channelId, optionIndex: idx });
                        }}
                        className={`p-3 rounded-xl border text-left text-xs font-semibold transition ${
                          isCorrect
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                            : isPicked
                            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                            : 'bg-white/5 border-white/10 text-white/85 hover:bg-white/10'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}) {opt}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {Object.entries(triviaState.scores)
                    .sort((a, b) => b[1] - a[1])
                    .map(([player, score]) => (
                      <span key={player} className="px-2.5 py-1 rounded-full bg-white/10 text-white/85">
                        @{player}: {score}p
                      </span>
                    ))}
                </div>
              </div>
            )
          ) : activeTab === 'wordchain' ? (
            !wordChainState ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Type className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Türkçe Kelime Zinciri</h4>
                  <p className="text-xs text-white/50 mt-1">
                    Son harfle başlayan yeni kelimeler türetin (örn. elma → armut → taş). &quot;ğ&quot; ile bitenler &quot;g&quot; ile devam eder.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => socket?.emit('wordchain_start', { channelId })}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition"
                >
                  Zinciri Başlat
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-black/35 border border-white/10 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-white/45 uppercase">Son Kelime (@{wordChainState.lastAuthor})</div>
                    <div className="text-xl font-extrabold text-white tracking-wide">{wordChainState.currentWord}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-amber-300 uppercase">Sıradaki Baş Harf</div>
                    <div className="text-2xl font-black text-amber-400">
                      {wordChainState.requiredChar.toLocaleUpperCase('tr-TR')}
                    </div>
                  </div>
                </div>

                {wordChainError && (
                  <div className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400/35 text-xs text-rose-200">
                    {wordChainError}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!wordChainInput.trim()) return;
                    socket?.emit('wordchain_submit', { channelId, word: wordChainInput.trim() });
                    setWordChainInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={wordChainInput}
                    onChange={(e) => setWordChainInput(e.target.value)}
                    placeholder={`"${wordChainState.requiredChar.toLocaleUpperCase('tr-TR')}" harfi ile kelime yazın...`}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-xs text-white outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                  >
                    Gönder
                  </button>
                </form>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {wordChainState.usedWords.slice(-12).map((w, idx) => (
                    <span key={`${w}-${idx}`} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/75">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )
          ) : activeTab === 'tournament' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white">Oda Turnuva Tablosu &amp; Eşleşme Ağacı</h4>
                  <p className="text-[11px] text-white/50">Tüm mini oyunlardan kazanılan puanlar burada toplanır.</p>
                </div>
                <button
                  type="button"
                  onClick={() => socket?.emit('tournament_create_bracket', { channelId })}
                  className="px-3 py-1.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold shrink-0"
                >
                  Eleme Ağacı Kur
                </button>
              </div>

              {tournamentState?.champion && (
                <div className="p-3 rounded-xl bg-yellow-500/20 border border-yellow-400/40 text-yellow-200 text-xs font-bold">
                  👑 Turnuva Şampiyonu: @{tournamentState.champion}
                </div>
              )}

              <div className="rounded-2xl bg-black/30 border border-white/10 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase text-white/55">Oda Puan Sıralaması</div>
                {!tournamentState || Object.keys(tournamentState.scoreboard).length === 0 ? (
                  <div className="text-xs text-white/40">Henüz puan kaydı yok. Oyun oynayarak puan kazanın!</div>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(tournamentState.scoreboard)
                      .sort((a, b) => b[1].points - a[1].points)
                      .map(([player, st], idx) => (
                        <div key={player} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.04]">
                          <span className="font-semibold text-white">#{idx + 1} @{player}</span>
                          <span className="font-mono text-amber-300">{st.points}p · {st.wins} galibiyet</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {tournamentState && tournamentState.bracket.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase text-white/55">Eleme Maçları</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {tournamentState.bracket.map((m) => (
                      <div key={m.id} className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs space-y-1.5">
                        <div className="text-[10px] text-white/45 font-mono">Tur {m.round}</div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={!m.playerA || Boolean(m.winner)}
                            onClick={() => m.playerA && socket?.emit('tournament_report_winner', { channelId, matchId: m.id, winner: m.playerA })}
                            className={`flex-1 px-2 py-1 rounded-lg border text-left truncate ${
                              m.winner === m.playerA ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold' : 'bg-black/30 border-white/10 text-white/80 hover:bg-white/10'
                            }`}
                          >
                            {m.playerA || 'BAY'}
                          </button>
                          <span className="text-white/40 text-[10px]">vs</span>
                          <button
                            type="button"
                            disabled={!m.playerB || Boolean(m.winner)}
                            onClick={() => m.playerB && socket?.emit('tournament_report_winner', { channelId, matchId: m.id, winner: m.playerB })}
                            className={`flex-1 px-2 py-1 rounded-lg border text-left truncate ${
                              m.winner === m.playerB ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold' : 'bg-black/30 border-white/10 text-white/80 hover:bg-white/10'
                            }`}
                          >
                            {m.playerB || 'BAY'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : !drawState ? (
            /* Draw & Guess Empty Start Screen */
            <div className="py-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 mx-auto flex items-center justify-center">
                <Brush className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Çiz &amp; Tahmin Et Odası Hazır</h4>
                <p className="text-xs text-white/50 max-w-sm mx-auto">
                  İlk çizen kişi gizli kelimeyi çizer, odadaki diğer oyuncular sohbet kutusundan tahmin ederek puan kazanır.
                </p>
              </div>
              <button
                type="button"
                onClick={() => socket?.emit('drawguess_start', { channelId })}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition"
              >
                Oyunu Başlat
              </button>
            </div>
          ) : (
            /* Draw & Guess Active Game */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-200 font-bold">
                    Tur {drawState.round}
                  </span>
                  <span className="text-white/70">
                    Çizen: <strong className="text-emerald-300">@{drawState.drawerName}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isDrawer && secretWord ? (
                    <span className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold">
                      Gizli Kelime: {secretWord}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/15 text-white font-mono font-bold tracking-widest">
                      {drawState.revealedWord || drawState.maskedWord}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => socket?.emit('drawguess_next_round', { channelId })}
                    className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                  >
                    Sonraki Tur
                  </button>
                </div>
              </div>

              {drawState.winnerName && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs flex items-center justify-between">
                  <span>
                    🏆 <strong>@{drawState.winnerName}</strong> kelimeyi doğru bildi (+15 puan)!
                    Kelime: <strong>{drawState.revealedWord}</strong>
                  </span>
                </div>
              )}

              {/* Canvas + Brushes */}
              <div className="rounded-2xl border border-white/15 bg-[#090b12] p-2 space-y-2">
                {isDrawer && (
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-1.5">
                      {DRAW_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setBrushColor(col)}
                          style={{ backgroundColor: col }}
                          className={`w-5 h-5 rounded-full border transition ${
                            brushColor === col ? 'border-white scale-110 ring-2 ring-white/40' : 'border-white/20 opacity-75'
                          }`}
                          title="Fırça rengi"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => socket?.emit('drawguess_clear', { channelId })}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-rose-500/25 text-[11px] text-white/80 hover:text-rose-200 flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Temizle</span>
                    </button>
                  </div>
                )}

                <canvas
                  ref={canvasRef}
                  width={480}
                  height={250}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishStroke}
                  onPointerLeave={finishStroke}
                  className={`w-full h-56 rounded-xl bg-[#0e111b] border border-white/10 touch-none ${
                    isDrawer ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                />
              </div>

              {/* Scoreboard */}
              {Object.keys(drawState.scores).length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {Object.entries(drawState.scores)
                    .sort((a, b) => b[1] - a[1])
                    .map(([player, score]) => (
                      <span
                        key={player}
                        className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 font-semibold"
                      >
                        @{player}: {score}p
                      </span>
                    ))}
                </div>
              )}

              {/* Guesses Feed + Input */}
              <div className="space-y-2">
                {drawState.guesses.length > 0 && (
                  <div className="max-h-24 overflow-y-auto rounded-xl bg-black/35 border border-white/10 p-2 space-y-1 text-xs">
                    {drawState.guesses.map((g, i) => (
                      <div
                        key={i}
                        className={g.correct ? 'text-emerald-300 font-bold' : 'text-white/75'}
                      >
                        <strong className="text-sky-300">@{g.author}:</strong> {g.text}
                      </div>
                    ))}
                  </div>
                )}

                {!isDrawer && !drawState.winnerName && (
                  <form onSubmit={handleSubmitGuess} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={guessText}
                      onChange={(e) => setGuessText(e.target.value)}
                      placeholder="Tahmininizi yazın..."
                      className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-xs text-white placeholder:text-white/35 outline-none focus:border-emerald-400"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Tahmin Et</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
