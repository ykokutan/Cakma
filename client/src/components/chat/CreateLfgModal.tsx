import React, { useState } from 'react';
import { Gamepad2, X } from 'lucide-react';
import type { Channel } from '../../types';

interface CreateLfgModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceChannels: Channel[];
  defaultGame?: string | null;
  onSubmit: (payload: {
    game: string;
    title: string;
    rankOrNote?: string;
    maxSlots: number;
    voiceChannelId?: string | null;
  }) => void;
}

export const CreateLfgModal: React.FC<CreateLfgModalProps> = ({
  isOpen,
  onClose,
  voiceChannels,
  defaultGame,
  onSubmit,
}) => {
  const [game, setGame] = useState(defaultGame || '');
  const [title, setTitle] = useState('');
  const [rankOrNote, setRankOrNote] = useState('');
  const [maxSlots, setMaxSlots] = useState(5);
  const [voiceChannelId, setVoiceChannelId] = useState<string>(voiceChannels[0]?.id || '');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!game.trim() || !title.trim()) return;
    onSubmit({
      game: game.trim(),
      title: title.trim(),
      rankOrNote: rankOrNote.trim() || undefined,
      maxSlots,
      voiceChannelId: voiceChannelId || null,
    });
    setTitle('');
    setRankOrNote('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0f1320] text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Gamepad2 className="w-4 h-4 text-indigo-400" />
            <span>Takım Arama (LFG) Kartı Oluştur</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-white/60 mb-1">Oyun</label>
            <input
              type="text"
              required
              maxLength={64}
              value={game}
              onChange={(e) => setGame(e.target.value)}
              placeholder="Örn: Counter-Strike 2 / Valorant"
              className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/60 mb-1">İlan Başlığı</label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Dereceli 5-Stack +2 Kişi Aranıyor"
              className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-white/60 mb-1">Toplam Kişi</label>
              <input
                type="number"
                min={2}
                max={16}
                value={maxSlots}
                onChange={(e) => setMaxSlots(Math.max(2, Math.min(16, Number(e.target.value) || 5)))}
                className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/60 mb-1">Ses Odası</label>
              <select
                value={voiceChannelId}
                onChange={(e) => setVoiceChannelId(e.target.value)}
                className="w-full bg-[#151a2a] border border-white/15 rounded-xl px-2.5 py-2 text-white outline-none"
              >
                <option value="">Bağlı oda yok</option>
                {voiceChannels.map((vc) => (
                  <option key={vc.id} value={vc.id}>🔊 {vc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/60 mb-1">Rank / Not (İsteğe Bağlı)</label>
            <input
              type="text"
              maxLength={64}
              value={rankOrNote}
              onChange={(e) => setRankOrNote(e.target.value)}
              placeholder="Örn: Yücelik+, Mikrofon zorunlu"
              className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 font-semibold"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold"
            >
              Paylaş
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
