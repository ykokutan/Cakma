import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { X, Hash, Volume2, Lock, Tag } from 'lucide-react';

interface CreateChannelModalProps {
  initialType: 'text' | 'voice';
  onClose: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  initialType,
  onClose,
}) => {
  const { createChannel } = useSocket();
  const [channelType, setChannelType] = useState<'text' | 'voice'>(initialType);
  const [channelName, setChannelName] = useState('');
  const [topic, setTopic] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [bitrateKbps, setBitrateKbps] = useState<number>(128);
  const [userLimit, setUserLimit] = useState<number>(0);
  const [isTempCreatorChannel, setIsTempCreatorChannel] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    createChannel(channelName.trim(), channelType, {
      topic: topic.trim() || undefined,
      isLocked,
      password: isLocked ? password.trim() : undefined,
      ...(channelType === 'voice'
        ? { bitrateKbps, userLimit, isTempCreatorChannel }
        : {}),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-md ios-glass rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        <div className="p-6 flex items-center justify-between border-b border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Kanal Oluştur</h3>
            <p className="text-xs text-white/50">
              {channelType === 'text' ? 'Metin kanalı' : 'Ses odası'} ekleyin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
              Kanal Türü
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setChannelType('text')}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition ${
                  channelType === 'text'
                    ? 'border-blue-500 bg-blue-500/15 text-white shadow-sm'
                    : 'border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <Hash className="w-4 h-4 shrink-0" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-white">Metin Kanalı</div>
                  <div className="text-[11px] text-white/40">
                    Mesaj, dosya ve emoji paylaşımı
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setChannelType('voice')}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition ${
                  channelType === 'voice'
                    ? 'border-blue-500 bg-blue-500/15 text-white shadow-sm'
                    : 'border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
                  <Volume2 className="w-4 h-4 shrink-0" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-white">Ses & Ekran Odası</div>
                  <div className="text-[11px] text-white/40">
                    Canlı konuşma ve ekran yayını
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Kanal Adı
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-white/40 text-xs">
                {channelType === 'text' ? '#' : '🔊'}
              </span>
              <input
                type="text"
                required
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="yeni-kanal"
                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 pl-8 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>Kanal Konusu / Açıklama (İsteğe bağlı)</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Örn: Genel sohbet ve duyurular..."
              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {channelType === 'voice' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isLocked}
                    onChange={(e) => setIsLocked(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-black/40 border-white/20 focus:ring-amber-400"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Şifreli & Kilitli Özel Oda</span>
                  </div>
                </label>
              </div>

              {isLocked && (
                <div className="pt-1">
                  <input
                    type="password"
                    required={isLocked}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Oda giriş şifresini belirleyin..."
                    className="w-full bg-black/40 border border-amber-500/40 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-white/30"
                  />
                  <p className="text-[10px] text-amber-300/70 mt-1">
                    Bu odaya yalnızca şifreyi bilen üyeler veya yöneticiler katılabilir.
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                    Ses Kalitesi (Bitrate)
                  </label>
                  <select
                    value={bitrateKbps}
                    onChange={(e) => setBitrateKbps(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/15 text-white text-xs rounded-xl px-2.5 py-2 outline-none"
                  >
                    <option value={64}>64 kbps (Ekonomi)</option>
                    <option value={96}>96 kbps (Konuşma)</option>
                    <option value={128}>128 kbps (Standart HD)</option>
                    <option value={192}>192 kbps (Yüksek)</option>
                    <option value={256}>256 kbps (Stüdyo)</option>
                    <option value={320}>320 kbps (Ultra HD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                    Kişi Limiti (0 = Sınırsız)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={userLimit}
                    onChange={(e) => setUserLimit(Math.min(99, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full bg-black/40 border border-white/15 text-white text-xs rounded-xl px-2.5 py-2 outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isTempCreatorChannel}
                  onChange={(e) => setIsTempCreatorChannel(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 bg-black/40 border-white/20"
                />
                <span className="text-[11px] font-semibold text-emerald-300">
                  ➕ Oda Kur Kanalı (Girenlere otomatik geçici oda aç)
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-white/60 hover:text-white transition"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={!channelName.trim() || (isLocked && !password.trim())}
              className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-full transition shadow-md shadow-blue-500/25 disabled:opacity-40"
            >
              Ekle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
