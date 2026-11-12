import React, { useState } from 'react';
import { Gamepad2, Headphones, Radio, Sparkles, X, Check } from 'lucide-react';
import { UserActivity } from '../types';

interface ActivitySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentActivity?: UserActivity;
  onSaveActivity: (activity: UserActivity | null) => void;
}

export const PRESET_ACTIVITIES: { type: UserActivity['type']; name: string; details?: string; icon: string }[] = [
  { type: 'playing', name: 'Counter-Strike 2', details: 'Rekabetçi / Mirage', icon: '💣' },
  { type: 'playing', name: 'Rust', details: 'Aylık Wipe / Clan Base', icon: '⚔️' },
  { type: 'playing', name: 'Project Zomboid', details: 'Muldraugh Hayatta Kalma', icon: '🧟' },
  { type: 'playing', name: 'Valorant', details: 'Dereceli / Ascent', icon: '🎯' },
  { type: 'playing', name: 'Minecraft', details: 'Hardcore Sunucu', icon: '⛏️' },
  { type: 'playing', name: 'League of Legends', details: 'Sihirdar Vadisi', icon: '🧙' },
  { type: 'listening', name: 'Spotify', details: 'Phonk & Synthwave', icon: '🎧' },
  { type: 'streaming', name: 'Twitch Canlı Yayın', details: 'Toplulukla Sohbet & Oyun', icon: '🔴' },
  { type: 'custom', name: 'Visual Studio Code', details: 'React & TypeScript Geliştiriyor', icon: '💻' }
];

export const ActivitySelectorModal: React.FC<ActivitySelectorModalProps> = ({
  isOpen,
  onClose,
  currentActivity,
  onSaveActivity,
}) => {
  const [activityType, setActivityType] = useState<UserActivity['type']>(currentActivity?.type || 'playing');
  const [customName, setCustomName] = useState(currentActivity?.name || '');
  const [customDetails, setCustomDetails] = useState(currentActivity?.details || '');

  if (!isOpen) return null;

  const handleSelectPreset = (preset: typeof PRESET_ACTIVITIES[0]) => {
    setActivityType(preset.type);
    setCustomName(preset.name);
    setCustomDetails(preset.details || '');
  };

  const handleSave = () => {
    if (!customName.trim()) {
      onSaveActivity(null);
    } else {
      onSaveActivity({
        type: activityType,
        name: customName.trim(),
        details: customDetails.trim() || undefined,
      });
    }
    onClose();
  };

  const handleClear = () => {
    onSaveActivity(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Oyun Durumu (Rich Presence)</h2>
              <p className="text-[11px] text-slate-400">Profilinizde ve üye listesinde gösterilir</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Type Picker */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">Aktivite Türü</label>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActivityType('playing')}
                className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                  activityType === 'playing'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>Oynuyor</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityType('listening')}
                className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                  activityType === 'listening'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Headphones className="w-4 h-4" />
                <span>Dinliyor</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityType('streaming')}
                className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                  activityType === 'streaming'
                    ? 'bg-red-600/20 border-red-500 text-red-300 font-bold'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>Yayında</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityType('custom')}
                className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                  activityType === 'custom'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Özel</span>
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">Hızlı Oyun Seçimi</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ACTIVITIES.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-slate-300 flex items-center gap-1.5 transition-colors"
                >
                  <span>{p.icon}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Name Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Oyun veya Aktivite Adı</label>
            <input
              type="text"
              placeholder="Örn: Counter-Strike 2, Spotify, Rust..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Custom Details Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Ayrıntılar / Durum (İsteğe Bağlı)</label>
            <input
              type="text"
              placeholder="Örn: Rekabetçi Maçta, Seviye 45, Harita: Dust II"
              value={customDetails}
              onChange={(e) => setCustomDetails(e.target.value)}
              className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-white/5">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors"
          >
            Durumu Temizle
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all"
            >
              <Check className="w-3.5 h-3.5" /> Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
