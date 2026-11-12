import React, { useState, useEffect, useRef } from 'react';
import { X, Gamepad2, Trophy, RotateCcw, Zap, UserCheck } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface MiniGamesModalProps {
  channelId: string;
  onClose: () => void;
}

const SAMPLE_TEXTS = [
  'Discord ve TeamSpeak hibrit ses platformunda ultra düşük gecikmeli WebRTC ses kalitesi deneyimi.',
  'Hızlı koşan atın tozu seyrek düşer derler ama klavyede parmaklar rüzgar gibi esiyor.',
  'Yazılım geliştirmek bir heykeltıraşın mermeri ince ince yontup sanat eserine dönüştürmesine benzer.',
  'Teknoloji dünyasında en önemli kural hata yapmaktan korkmamak ve sürekli öğrenmeye devam etmektir.',
];

export const MiniGamesModal: React.FC<MiniGamesModalProps> = ({ channelId, onClose }) => {
  const { currentUser, miniGameState, startMiniGame, joinMiniGame, sendMiniGameMove, resetMiniGame } = useSocket();
  const [activeTab, setActiveTab] = useState<'xox' | 'typeracer'>('xox');

  // TypeRacer State
  const [currentPrompt, setCurrentPrompt] = useState(SAMPLE_TEXTS[0]);
  const [typedText, setTypedText] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === 'xox' && !miniGameState) {
      startMiniGame(channelId, 'xox');
    }
  }, [activeTab]);

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
    !miniGameState?.players?.O; // Free play mode if solo

  const handleCellClick = (idx: number) => {
    if (board[idx] || miniGameState?.winner || !isMyTurn) return;
    sendMiniGameMove(channelId, idx);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-xl bg-[#12131a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                Ses Odası Aktiviteleri & Mini Oyunlar
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                  Canlı Çok Oyunculu
                </span>
              </h3>
              <p className="text-[11px] text-white/50">Arkadaşlarınızla muhabbet ederken eğlenceli oyunlar oynayın</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-white/[0.01] px-5 pt-2">
          <button
            onClick={() => setActiveTab('xox')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'xox'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <span>❌⭕ XOX (Tic-Tac-Toe)</span>
          </button>
          <button
            onClick={() => setActiveTab('typeracer')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'typeracer'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>⌨️ Hızlı Yazma Yarışı (TypeRacer)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === 'xox' ? (
            /* XOX Game */
            <div className="space-y-5 flex flex-col items-center">
              {/* Status Header */}
              <div className="flex items-center justify-between w-full text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cyan-400">❌ {miniGameState?.playerNames?.X || 'Oyuncu 1'}</span>
                  <span className="text-white/30">vs</span>
                  <span className="font-bold text-pink-400">⭕ {miniGameState?.playerNames?.O || 'Oyuncu 2'}</span>
                </div>

                <div className="text-[11px]">
                  {miniGameState?.winner ? (
                    <span className="font-bold text-emerald-400">
                      {miniGameState.winner === 'draw' ? '🤝 Berabere Bitti!' : `🏆 Kazanan: ${miniGameState.winner}!`}
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

              {/* 3x3 Board */}
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

              {/* Control Buttons */}
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
          ) : (
            /* TypeRacer Game */
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs leading-relaxed select-none">
                {currentPrompt.split('').map((char, index) => {
                  let colorClass = 'text-white/60';
                  if (index < typedText.length) {
                    colorClass = typedText[index] === char ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold bg-red-500/20';
                  }
                  return (
                    <span key={index} className={colorClass}>
                      {char}
                    </span>
                  );
                })}
              </div>

              {/* Input Field */}
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

              {/* Completion Banner */}
              {isCompleted ? (
                <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fade-in shadow-lg">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <span>
                      Tebrikler! Metni tamamladınız. Hızınız: <strong>{wpm} WPM</strong>
                    </span>
                  </div>
                  <button
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
                    onClick={handleResetTypeRacer}
                    className="text-white/50 hover:text-white transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Cümleyi Değiştir</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
