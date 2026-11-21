import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Lock, ShieldCheck, X } from 'lucide-react';
import { computeSafetyNumber, getOrCreateE2eeKeyPair, type SafetyNumberInfo } from '../../utils/e2ee';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface E2eeSafetyModalProps {
  myUsername: string;
  peerUsername: string;
  peerPublicKeyJson: string;
  onClose: () => void;
}

export const E2eeSafetyModal: React.FC<E2eeSafetyModalProps> = ({
  myUsername,
  peerUsername,
  peerPublicKeyJson,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [safetyInfo, setSafetyInfo] = useState<SafetyNumberInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusTrap(modalRef, true, onClose);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const pair = await getOrCreateE2eeKeyPair(myUsername);
      if (!pair) {
        if (!cancelled) setLoading(false);
        return;
      }
      const info = await computeSafetyNumber(pair.publicKeyJwk, peerPublicKeyJson);
      if (!cancelled) {
        setSafetyInfo(info);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myUsername, peerPublicKeyJson]);

  const handleCopy = async () => {
    if (!safetyInfo) return;
    try {
      await navigator.clipboard.writeText(safetyInfo.formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="e2ee-safety-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl ios-glass border border-white/15 bg-slate-950/90 p-5 space-y-4 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="e2ee-safety-title" className="text-sm font-bold text-white">
                E2EE Güvenlik Numarası
              </h3>
              <p className="text-[11px] text-white/55">
                @{peerUsername} ile uçtan uca şifreleme doğrulaması
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/75 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/35 border border-white/10 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
              <Lock className="w-3.5 h-3.5" /> ECDH P-256 + AES-256-GCM
            </span>
            {safetyInfo && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/80">
                ID: {safetyInfo.shortTag}
              </span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-6 text-xs text-white/55">Güvenlik numarası hesaplanıyor...</div>
          ) : safetyInfo ? (
            <div className="grid grid-cols-4 gap-2 text-center font-mono text-sm font-bold text-white tracking-wider">
              {safetyInfo.blocks.map((block, idx) => (
                <div
                  key={`${idx}-${block}`}
                  className="py-2 rounded-xl bg-white/[0.04] border border-white/10 select-all"
                >
                  {block}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-rose-300">
              Karşı tarafın açık anahtarı okunamadı.
            </div>
          )}
        </div>

        <p className="text-[11px] text-white/60 leading-relaxed">
          Bu 60 haneli güvenlik numarası @{peerUsername} cihazındaki numara ile birebir aynı olmalıdır. Farklı görünüyorsa anahtar değişikliği yapılmış olabilir.
        </p>

        <div className="flex items-center justify-end gap-2">
          {safetyInfo && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Kopyalandı' : 'Numarayı Kopyala'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
