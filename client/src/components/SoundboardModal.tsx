import React, { useState } from 'react';
import { Volume2, Sparkles, X, Flame, Laugh, Bell } from 'lucide-react';
import { SOUNDBOARD_PRESETS, SoundboardItem, playSynthesizedSound } from '../utils/soundEffects';

interface SoundboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaySound: (soundId: string) => void;
  connectedVoiceChannelName?: string | null;
}

export const SoundboardModal: React.FC<SoundboardModalProps> = ({
  isOpen,
  onClose,
  onPlaySound,
  connectedVoiceChannelName,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'meme' | 'gaming' | 'reaction' | 'alert'>('all');
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = selectedCategory === 'all'
    ? SOUNDBOARD_PRESETS
    : SOUNDBOARD_PRESETS.filter(s => s.category === selectedCategory);

  const handlePlay = (sound: SoundboardItem) => {
    setLastPlayedId(sound.id);
    playSynthesizedSound(sound.id);
    onPlaySound(sound.id);
    setTimeout(() => {
      setLastPlayedId(null);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-pink-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Ses Tahtası (Soundboard)
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  Canlı Sesli Oda
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {connectedVoiceChannelName
                  ? `Şu an bağlı: #${connectedVoiceChannelName} odasında çalınacak`
                  : 'Sese bağlandığınızda odadaki herkes duyar'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 px-6 py-3 border-b border-white/5 bg-slate-950/40 overflow-x-auto text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Tümü ({SOUNDBOARD_PRESETS.length})
          </button>
          <button
            onClick={() => setSelectedCategory('meme')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'meme'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Laugh className="w-3.5 h-3.5" /> Meme & Komedi
          </button>
          <button
            onClick={() => setSelectedCategory('gaming')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'gaming'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Flame className="w-3.5 h-3.5" /> Oyun & GG
          </button>
          <button
            onClick={() => setSelectedCategory('reaction')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'reaction'
                ? 'bg-pink-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Reaksiyon
          </button>
          <button
            onClick={() => setSelectedCategory('alert')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              selectedCategory === 'alert'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bell className="w-3.5 h-3.5" /> Uyarı & Ping
          </button>
        </div>

        {/* Sound Grid */}
        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto">
          {filtered.map(sound => {
            const isPlaying = lastPlayedId === sound.id;
            return (
              <button
                key={sound.id}
                onClick={() => handlePlay(sound)}
                className={`relative group flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all transform active:scale-95 ${
                  isPlaying
                    ? 'bg-pink-500/20 border-pink-500 ring-2 ring-pink-500/50 scale-105'
                    : 'bg-white/5 border-white/10 hover:border-pink-500/50 hover:bg-white/10'
                }`}
              >
                <span className={`text-3xl mb-2 transition-transform ${isPlaying ? 'scale-125 animate-bounce' : 'group-hover:scale-110'}`}>
                  {sound.emoji}
                </span>
                <span className="text-xs font-semibold text-white group-hover:text-pink-300 transition-colors">
                  {sound.name}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                  {sound.description}
                </span>

                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Volume2 className="w-3.5 h-3.5 text-pink-400" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-slate-400">
          <span>💡 İpucu: Ses odasındayken bastığınızda odadaki herkes aynı anda duyar.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
