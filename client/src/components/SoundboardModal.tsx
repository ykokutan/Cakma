import React, { useState, useRef } from 'react';
import { Volume2, Sparkles, X, Flame, Laugh, Bell, Upload, Trash2 } from 'lucide-react';
import { SOUNDBOARD_PRESETS, SoundboardItem, playSynthesizedSound } from '../utils/soundEffects';
import { useSocket } from '../context/SocketContext';
import { appToast } from '../utils/appDialogs';

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
  const { customSoundboard } = useSocket();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'meme' | 'gaming' | 'reaction' | 'alert' | 'custom'>('all');
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
  const [customSounds, setCustomSounds] = useState<Array<SoundboardItem & { audioUrl?: string }>>(() => {
    try {
      const saved = localStorage.getItem('dc_custom_sounds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const contextCustomSounds: Array<SoundboardItem & { audioUrl?: string }> = (customSoundboard || []).map((cs) => ({
    id: cs.id,
    name: cs.name,
    emoji: '🎵',
    category: 'custom' as any,
    description: 'Ayarlardan Eklenen Özel Ses',
    audioUrl: cs.dataUrl,
  }));

  const mergedCustomSounds = [
    ...customSounds,
    ...contextCustomSounds.filter((cs) => !customSounds.some((s) => s.id === cs.id)),
  ];

  const allSounds: Array<SoundboardItem & { audioUrl?: string }> = [
    ...SOUNDBOARD_PRESETS,
    ...mergedCustomSounds,
  ];

  const filtered = selectedCategory === 'all'
    ? allSounds
    : selectedCategory === 'custom'
    ? mergedCustomSounds
    : allSounds.filter(s => s.category === selectedCategory);

  const handlePlay = (sound: SoundboardItem & { audioUrl?: string }) => {
    setLastPlayedId(sound.id);
    if (sound.audioUrl) {
      const audio = new Audio(sound.audioUrl);
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } else {
      playSynthesizedSound(sound.id);
    }
    onPlaySound(sound.id);
    setTimeout(() => {
      setLastPlayedId(null);
    }, 600);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      appToast('Ses dosyası 2MB\'dan küçük olmalıdır.', 'warning');
      return;
    }

    const soundName = file.name.replace(/\.[^/.]+$/, '').slice(0, 20);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const newSound: SoundboardItem & { audioUrl?: string } = {
        id: `custom-${Date.now()}`,
        name: soundName,
        emoji: '🎵',
        category: 'custom' as any,
        description: 'Özel Yüklenen Ses',
        audioUrl: base64,
      };

      const updated = [...customSounds, newSound];
      setCustomSounds(updated);
      try {
        localStorage.setItem('dc_custom_sounds', JSON.stringify(updated));
      } catch {}
      setSelectedCategory('custom');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteCustomSound = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = customSounds.filter((s) => s.id !== id);
    setCustomSounds(updated);
    try {
      localStorage.setItem('dc_custom_sounds', JSON.stringify(updated));
    } catch {}
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
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-slate-950/40 overflow-x-auto text-xs gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/mp3,audio/wav,audio/ogg"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Tümü ({allSounds.length})
            </button>
            <button
              onClick={() => setSelectedCategory('custom')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                selectedCategory === 'custom'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              🎵 Özel Seslerim ({customSounds.length})
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
              <Flame className="w-3.5 h-3.5" /> Oyun & CS2
            </button>
            <button
              onClick={() => setSelectedCategory('alert')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                selectedCategory === 'alert'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bell className="w-3.5 h-3.5" /> Efektler
            </button>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 text-white font-semibold flex items-center gap-1.5 transition shrink-0 shadow-md shadow-pink-500/20"
            title="Kendi MP3/WAV Sesini Yükle"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Özel Ses Ekle</span>
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

                {sound.audioUrl && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCustomSound(e, sound.id)}
                    className="absolute top-2 left-2 p-1 rounded-md bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white transition opacity-0 group-hover:opacity-100"
                    title="Bu Özel Sesi Sil"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
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
