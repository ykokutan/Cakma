import React from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: 'Ctrl + K', desc: 'Hızlı Geçiş & Komut Paleti (kanal, kişi, ayar ara)' },
  { keys: 'Ctrl + M', desc: 'Mikrofonu Aç / Kapat (Sustur)' },
  { keys: 'Ctrl + D', desc: 'Sağırlaştırmayı Aç / Kapat' },
  { keys: 'Ctrl + /', desc: 'Klavye Kısayolları penceresini aç' },
  { keys: '@kullanıcı', desc: 'Sohbette kullanıcı etiketleme önerisini aç' },
  { keys: '/komut', desc: 'Hızlı slash komutlarını (/anket, /zarat, /temizle) listele' },
  { keys: 'Sağ Tık', desc: 'Ses kullanıcısı, kanal veya sağ üye listesinde işlem menüsü' },
  { keys: 'Sürükle & Bırak', desc: 'Ses odasındaki kullanıcıyı başka odaya taşı veya dosya gönder' },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9998] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#12141c]/95 border border-white/15 shadow-2xl backdrop-blur-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Klavye Kısayolları & İpuçları</h3>
              <p className="text-[11px] text-white/45">Uygulamayı çok daha hızlı kullanın</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[65vh] overflow-y-auto">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between gap-4 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
            >
              <span className="text-xs text-white/80">{s.desc}</span>
              <kbd className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] font-mono font-bold text-amber-300 shrink-0">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
