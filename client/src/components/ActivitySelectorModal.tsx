import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Gamepad2,
  Headphones,
  Radio,
  Sparkles,
  X,
  Check,
  Clock,
  BookmarkPlus,
  Trash2,
  Timer,
} from 'lucide-react';
import { UserActivity } from '../types';

interface ActivitySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentActivity?: UserActivity;
  onSaveActivity: (activity: UserActivity | null) => void;
}

interface CustomPreset {
  id: string;
  type: UserActivity['type'];
  name: string;
  details?: string;
  emoji: string;
}

const CUSTOM_PRESETS_STORAGE_KEY = 'dc_custom_activity_presets';

export const DEFAULT_CUSTOM_STATUSES: CustomPreset[] = [
  { id: 'focus', type: 'custom', name: 'Odak Modu', details: 'Rahatsız etmeyin, çalışıyor', emoji: '📚' },
  { id: 'coding', type: 'custom', name: 'Kod Yazıyor', details: 'Proje geliştiriyor', emoji: '💻' },
  { id: 'music', type: 'listening', name: 'Müzik Dinliyor', details: 'Çalma listesi keyfi', emoji: '🎧' },
  { id: 'coffee', type: 'custom', name: 'Kahve Molasında', details: 'Kısa bir ara', emoji: '☕' },
  { id: 'movie', type: 'custom', name: 'Film / Dizi İzliyor', details: 'Patlamış mısır hazır', emoji: '🎬' },
  { id: 'chill', type: 'custom', name: 'Sohbete Açık', details: 'Ses kanalına beklerim', emoji: '🎙️' },
  { id: 'gaming', type: 'playing', name: 'Oyun Oynuyor', details: 'Ekip aranıyor', emoji: '🎮' },
  { id: 'away', type: 'custom', name: 'Dinleniyor', details: 'Birazdan döneceğim', emoji: '🌙' },
];

const QUICK_EMOJIS = ['✨', '🎮', '🎧', '💻', '☕', '🎬', '📚', '🔥', '⚡', '🌙', '🎙️', '🚀'];

const DURATION_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Süresiz', minutes: null },
  { label: '30 dk', minutes: 30 },
  { label: '1 saat', minutes: 60 },
  { label: '4 saat', minutes: 240 },
];

const TYPE_META: Record<
  UserActivity['type'],
  { label: string; badge: string; cardClass: string; iconBg: string; ringClass: string }
> = {
  playing: {
    label: 'Oynuyor',
    badge: 'OYNUYOR',
    cardClass: 'from-purple-900/45 via-indigo-900/30 to-slate-900/60 border-purple-500/35',
    iconBg: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
    ringClass: 'text-purple-400',
  },
  listening: {
    label: 'Dinliyor',
    badge: 'DİNLİYOR',
    cardClass: 'from-emerald-900/45 via-teal-900/30 to-slate-900/60 border-emerald-500/35',
    iconBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    ringClass: 'text-emerald-400',
  },
  streaming: {
    label: 'Yayında',
    badge: 'CANLI YAYINDA',
    cardClass: 'from-rose-900/45 via-red-900/30 to-slate-900/60 border-rose-500/35',
    iconBg: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
    ringClass: 'text-rose-400',
  },
  custom: {
    label: 'Özel Durum',
    badge: 'ÖZEL DURUM',
    cardClass: 'from-sky-900/45 via-blue-900/30 to-slate-900/60 border-sky-500/35',
    iconBg: 'bg-sky-500/20 border-sky-500/40 text-sky-300',
    ringClass: 'text-sky-400',
  },
};

function loadSavedPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ActivitySelectorModal: React.FC<ActivitySelectorModalProps> = ({
  isOpen,
  onClose,
  currentActivity,
  onSaveActivity,
}) => {
  const [activityType, setActivityType] = useState<UserActivity['type']>(
    currentActivity?.type || 'custom'
  );
  const [customName, setCustomName] = useState(currentActivity?.name || '');
  const [customDetails, setCustomDetails] = useState(currentActivity?.details || '');
  const [selectedEmoji, setSelectedEmoji] = useState(currentActivity?.emoji || '✨');
  const [showElapsed, setShowElapsed] = useState<boolean>(
    currentActivity ? Boolean(currentActivity.startedAt) : true
  );
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [savedPresets, setSavedPresets] = useState<CustomPreset[]>(() => loadSavedPresets());

  useEffect(() => {
    if (!isOpen) return;
    setActivityType(currentActivity?.type || 'custom');
    setCustomName(currentActivity?.name || '');
    setCustomDetails(currentActivity?.details || '');
    setSelectedEmoji(currentActivity?.emoji || '✨');
    setShowElapsed(currentActivity ? Boolean(currentActivity.startedAt) : true);
    setDurationMinutes(null);
  }, [isOpen, currentActivity]);

  if (!isOpen) return null;

  const persistPresets = (next: CustomPreset[]) => {
    setSavedPresets(next);
    try {
      localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleSelectPreset = (preset: CustomPreset) => {
    setActivityType(preset.type);
    setCustomName(preset.name);
    setCustomDetails(preset.details || '');
    setSelectedEmoji(preset.emoji);
  };

  const handleSaveAsPreset = () => {
    const trimmedName = customName.trim();
    if (!trimmedName) return;
    const newPreset: CustomPreset = {
      id: `${Date.now()}`,
      type: activityType,
      name: trimmedName,
      details: customDetails.trim() || undefined,
      emoji: selectedEmoji || '✨',
    };
    const deduped = savedPresets.filter(
      (p) => !(p.name.toLowerCase() === trimmedName.toLowerCase() && p.type === activityType)
    );
    persistPresets([newPreset, ...deduped].slice(0, 8));
  };

  const handleDeleteSavedPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persistPresets(savedPresets.filter((p) => p.id !== id));
  };

  const handleSave = () => {
    if (!customName.trim()) {
      onSaveActivity(null);
    } else {
      const now = Date.now();
      onSaveActivity({
        type: activityType,
        name: customName.trim(),
        details: customDetails.trim() || undefined,
        emoji: selectedEmoji || undefined,
        startedAt: showElapsed ? currentActivity?.startedAt || now : undefined,
        expiresAt: durationMinutes ? now + durationMinutes * 60_000 : undefined,
      });
    }
    onClose();
  };

  const handleClear = () => {
    onSaveActivity(null);
    onClose();
  };

  const meta = TYPE_META[activityType];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Özel Durum & Aktivite
              </h2>
              <p className="text-xs text-slate-400">
                Profilinizde ve üye listesinde özel durumunuzu paylaşın
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {/* Live Preview Card */}
          <div
            className={`p-3.5 rounded-2xl bg-gradient-to-r ${meta.cardClass} border flex items-center gap-3.5 shadow-lg transition-all`}
          >
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center text-xl shrink-0 ${meta.iconBg}`}
            >
              {selectedEmoji || <Sparkles className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.ringClass}`}>
                  {meta.badge}
                </span>
                {showElapsed && (
                  <span className="text-[10px] text-white/60 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" /> 00:01
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-white truncate mt-0.5">
                {customName.trim() || 'Özel durumunuz burada görünür'}
              </div>
              {customDetails.trim() && (
                <div className="text-xs text-white/70 truncate">{customDetails.trim()}</div>
              )}
            </div>
          </div>

          {/* Type Picker */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">Durum Türü</label>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActivityType('custom')}
                className={`py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  activityType === 'custom'
                    ? 'bg-sky-600/20 border-sky-500 text-sky-300 font-bold shadow-sm'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Özel</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityType('playing')}
                className={`py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  activityType === 'playing'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold shadow-sm'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>Oynuyor</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityType('listening')}
                className={`py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  activityType === 'listening'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Headphones className="w-4 h-4" />
                <span>Dinliyor</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityType('streaming')}
                className={`py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  activityType === 'streaming'
                    ? 'bg-rose-600/20 border-rose-500 text-rose-300 font-bold shadow-sm'
                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>Yayında</span>
              </button>
            </div>
          </div>

          {/* Saved Custom Presets (User's own) */}
          {savedPresets.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Kayıtlı Özel Durumlarım
              </label>
              <div className="flex flex-wrap gap-1.5">
                {savedPresets.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPreset(p)}
                    className="group cursor-pointer pl-2.5 pr-1.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-xs text-purple-100 flex items-center gap-1.5 transition-colors"
                  >
                    <span>{p.emoji}</span>
                    <span className="font-medium">{p.name}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedPreset(p.id, e)}
                      className="p-0.5 rounded-md text-purple-300/60 hover:text-rose-400 hover:bg-white/10 transition-colors"
                      title="Şablonu Sil"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Status Quick Templates */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Hızlı Özel Durumlar
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_CUSTOM_STATUSES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <span>{p.emoji}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emoji Picker */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">Simge / Emoji</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border transition-all ${
                    selectedEmoji === emoji
                      ? 'bg-purple-500/25 border-purple-400 scale-105 shadow-sm'
                      : 'bg-white/5 border-white/5 hover:bg-white/10'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Name & Details */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Durum Başlığı</label>
                {customName.trim() && (
                  <button
                    type="button"
                    onClick={handleSaveAsPreset}
                    className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1 font-medium transition-colors"
                    title="Bu durumu hızlı şablonlarıma kaydet"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" /> Şablon Olarak Kaydet
                  </button>
                )}
              </div>
              <input
                type="text"
                maxLength={60}
                placeholder="Örn: Kahve Molası, Proje Geliştiriyor, Sohbete Açık..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-slate-950/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Ayrıntılar / Alt Metin (İsteğe Bağlı)
              </label>
              <input
                type="text"
                maxLength={80}
                placeholder="Örn: Birazdan döneceğim, Ses kanalına beklerim..."
                value={customDetails}
                onChange={(e) => setCustomDetails(e.target.value)}
                className="w-full bg-slate-950/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          {/* Timer & Auto-Clear Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowElapsed((v) => !v)}
              className={`px-3 py-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                showElapsed
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <Clock className="w-3.5 h-3.5" /> Geçen Süreyi Göster
              </span>
              <span
                className={`w-7 h-4 rounded-full relative transition-colors ${
                  showElapsed ? 'bg-purple-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                    showElapsed ? 'left-3.5' : 'left-0.5'
                  }`}
                />
              </span>
            </button>

            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300 flex items-center gap-1.5 font-medium shrink-0">
                <Timer className="w-3.5 h-3.5 text-slate-400" /> Otomatik Sil:
              </span>
              <select
                value={durationMinutes === null ? '' : String(durationMinutes)}
                onChange={(e) =>
                  setDurationMinutes(e.target.value === '' ? null : Number(e.target.value))
                }
                className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option
                    key={opt.label}
                    value={opt.minutes === null ? '' : String(opt.minutes)}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/10 bg-white/[0.03]">
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
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all"
            >
              <Check className="w-3.5 h-3.5" /> Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
