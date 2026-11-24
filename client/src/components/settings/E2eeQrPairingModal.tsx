import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, RefreshCw, Copy, Check, KeyRound, X, Send, Smartphone } from 'lucide-react';
import { authFetch, resolveBackendBaseUrl } from '../../utils/authFetch';
import { exportEncryptedE2eeBackup, importEncryptedE2eeBackup } from '../../utils/e2ee';

interface E2eeQrPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  currentServerHost: string;
  onKeyImported: (publicKeyJwk: JsonWebKey) => void;
}

function generateClientPin(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = new Uint8Array(length);
  globalThis.crypto.getRandomValues(rand);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[rand[i] % alphabet.length];
  }
  return out;
}

export const E2eeQrPairingModal: React.FC<E2eeQrPairingModalProps> = ({
  isOpen,
  onClose,
  username,
  currentServerHost,
  onKeyImported,
}) => {
  const [tab, setTab] = useState<'receive' | 'send'>('receive');

  // Receive (New Device) state
  const [pairCode, setPairCode] = useState<string>('');
  const [pairPin, setPairPin] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedQr, setCopiedQr] = useState(false);
  const [receiveStatus, setReceiveStatus] = useState<'idle' | 'waiting' | 'imported' | 'error'>('idle');
  const [receiveMsg, setReceiveMsg] = useState<string>('');

  // Send (Existing Device) state
  const [qrPasteInput, setQrPasteInput] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [manualPin, setManualPin] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const startPairingSession = async () => {
    setReceiveStatus('waiting');
    setReceiveMsg('Eşleştirme oturumu başlatılıyor...');
    setQrDataUrl('');
    try {
      const base = resolveBackendBaseUrl(currentServerHost);
      const res = await authFetch(`${base}/api/e2ee/pairing/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        expiresAt?: number;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.code || !json.expiresAt) {
        setReceiveStatus('error');
        setReceiveMsg(json.error || 'Eşleştirme kodu oluşturulamadı.');
        return;
      }

      const pin = generateClientPin(8);
      setPairCode(json.code);
      setPairPin(pin);
      setExpiresAt(json.expiresAt);
      setSecondsLeft(Math.max(0, Math.ceil((json.expiresAt - Date.now()) / 1000)));

      const qrPayload = JSON.stringify({
        t: 'cakma-e2ee-pair',
        code: json.code,
        pin,
      });
      const dataUrl = await QRCode.toDataURL(qrPayload, {
        width: 200,
        margin: 1,
        color: { dark: '#0f172a', light: '#f8fafc' },
      });
      setQrDataUrl(dataUrl);
      setReceiveMsg('Diğer cihazdan QR kodu taratın veya kodu + PIN’i girin.');
    } catch {
      setReceiveStatus('error');
      setReceiveMsg('Sunucuya bağlanılamadı.');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setPairCode('');
      setPairPin('');
      setExpiresAt(0);
      setQrDataUrl('');
      setReceiveStatus('idle');
      setReceiveMsg('');
      setSendMsg(null);
      return;
    }
    if (tab === 'receive' && receiveStatus === 'idle') {
      void startPairingSession();
    }
  }, [isOpen, tab]);

  // Countdown + 2s polling when waiting for encrypted payload on New Device tab
  useEffect(() => {
    if (!isOpen || tab !== 'receive' || receiveStatus !== 'waiting' || !pairCode || !pairPin) {
      return;
    }

    const countdownTimer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setReceiveStatus('error');
        setReceiveMsg('Eşleştirme kodunun süresi doldu. Yeni kod üretebilirsiniz.');
      }
    }, 1000);

    let cancelled = false;
    const pollTimer = window.setInterval(async () => {
      if (cancelled || Date.now() > expiresAt) return;
      try {
        const base = resolveBackendBaseUrl(currentServerHost);
        const resp = await authFetch(
          `${base}/api/e2ee/pairing/${encodeURIComponent(pairCode)}/status`
        );
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: 'pending' | 'ready';
          encryptedPayload?: string;
          ivBase64?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!resp.ok) {
          if (resp.status === 404) {
            setReceiveStatus('error');
            setReceiveMsg('Eşleştirme oturumu bulunamadı veya süresi doldu.');
          }
          return;
        }
        if (data.status === 'ready' && data.encryptedPayload) {
          cancelled = true;
          const imported = await importEncryptedE2eeBackup(
            username,
            data.encryptedPayload,
            pairPin
          );
          if (!imported.ok) {
            setReceiveStatus('error');
            setReceiveMsg(imported.error || 'Şifreli anahtar içe aktarılamadı.');
            return;
          }
          setReceiveStatus('imported');
          setReceiveMsg('E2EE anahtarınız bu cihaza başarıyla aktarıldı!');
          onKeyImported(imported.publicKeyJwk);
        }
      } catch {
        // Ignore transient poll failure
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(countdownTimer);
      window.clearInterval(pollTimer);
    };
  }, [isOpen, tab, receiveStatus, pairCode, pairPin, expiresAt, currentServerHost, username, onKeyImported]);

  if (!isOpen) return null;

  const handlePasteQrText = (raw: string) => {
    setQrPasteInput(raw);
    try {
      const parsed = JSON.parse(raw.trim()) as { t?: string; code?: string; pin?: string };
      if (parsed?.t === 'cakma-e2ee-pair' && parsed.code && parsed.pin) {
        setManualCode(String(parsed.code).trim().toUpperCase());
        setManualPin(String(parsed.pin).trim().toUpperCase());
      }
    } catch {
      // Allow regular manual editing
    }
  };

  const handleSendKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = manualCode.trim().toUpperCase();
    const cleanPin = manualPin.trim().toUpperCase();
    if (!cleanCode || cleanPin.length < 6) {
      setSendMsg({ type: 'error', text: 'Geçerli bir eşleştirme kodu ve 8 karakterli PIN girin.' });
      return;
    }

    setSendBusy(true);
    setSendMsg(null);
    try {
      const exported = await exportEncryptedE2eeBackup(username, cleanPin);
      if (!exported.ok) {
        setSendMsg({ type: 'error', text: exported.error });
        return;
      }

      const envelope = JSON.parse(exported.backupJson) as { iv?: string };
      const ivBase64 = envelope.iv || '';
      const base = resolveBackendBaseUrl(currentServerHost);
      const res = await authFetch(
        `${base}/api/e2ee/pairing/${encodeURIComponent(cleanCode)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedPayload: exported.backupJson,
            ivBase64,
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSendMsg({ type: 'error', text: data.error || 'Anahtar gönderilemedi.' });
        return;
      }

      setSendMsg({
        type: 'success',
        text: 'Şifreli E2EE anahtarı yeni cihaza tek kullanımlık aktarıldı!',
      });
      setQrPasteInput('');
      setManualCode('');
      setManualPin('');
    } catch {
      setSendMsg({ type: 'error', text: 'Aktarım sırasında ağ hatası oluştu.' });
    } finally {
      setSendBusy(false);
    }
  };

  const qrRawJson =
    pairCode && pairPin
      ? JSON.stringify({ t: 'cakma-e2ee-pair', code: pairCode, pin: pairPin })
      : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-emerald-500/25 bg-[#0e1320] text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
            <QrCode className="w-4 h-4" />
            <span>QR / Kod ile Cihaz Eşleştirme (E2EE)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-white/10 bg-black/25 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setTab('receive')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'receive'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Yeni Cihaz (QR Göster)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('send')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'send'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Mevcut Cihaz (Gönder)</span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {tab === 'receive' ? (
            <div className="space-y-3 text-center">
              {qrDataUrl && receiveStatus !== 'imported' && (
                <div className="inline-flex p-3 rounded-2xl bg-slate-50 shadow-lg mx-auto">
                  <img src={qrDataUrl} alt="E2EE Eşleştirme QR Kodu" className="w-44 h-44" />
                </div>
              )}

              {pairCode && pairPin && (
                <div className="grid grid-cols-2 gap-2 text-left">
                  <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-white/45 uppercase">Oturum Kodu</div>
                    <div className="text-sm font-mono font-bold text-white tracking-wider">
                      {pairCode}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-white/45 uppercase">
                      Gizli PIN (Yalnızca Cihazda)
                    </div>
                    <div className="text-sm font-mono font-bold text-emerald-300 tracking-wider">
                      {pairPin}
                    </div>
                  </div>
                </div>
              )}

              <div
                className={`text-xs px-3 py-2 rounded-xl border ${
                  receiveStatus === 'imported'
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                    : receiveStatus === 'error'
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                    : 'bg-white/[0.04] border-white/10 text-white/75'
                }`}
              >
                {receiveMsg}
                {receiveStatus === 'waiting' && secondsLeft > 0 && (
                  <span className="ml-1.5 font-mono text-amber-300">({secondsLeft}s)</span>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                {qrRawJson && receiveStatus === 'waiting' && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(qrRawJson);
                      setCopiedQr(true);
                      setTimeout(() => setCopiedQr(false), 1800);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                  >
                    {copiedQr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedQr ? 'Kopyalandı' : 'QR Verisini Kopyala'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void startPairingSession()}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Yeni Kod Üret</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendKey} className="space-y-3">
              <p className="text-[11px] text-white/60 leading-relaxed">
                Anahtarınız PBKDF2 + AES-GCM ile şifrelenip sunucuda kalıcı tutulmadan tek seferlik yeni cihaza aktarılır. PIN sunucuya gönderilmez.
              </p>

              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  QR Verisi Yapıştır (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={qrPasteInput}
                  onChange={(e) => handlePasteQrText(e.target.value)}
                  placeholder='{"t":"cakma-e2ee-pair","code":"...","pin":"..."}'
                  className="w-full px-3 py-2 rounded-xl bg-black/35 border border-white/10 text-xs font-mono text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                    Oturum Kodu
                  </label>
                  <input
                    type="text"
                    required
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="Örn: A1B2C3"
                    className="w-full px-3 py-2 rounded-xl bg-black/35 border border-white/10 text-xs font-mono text-white outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                    Cihaz PIN Kodu
                  </label>
                  <input
                    type="text"
                    required
                    value={manualPin}
                    onChange={(e) => setManualPin(e.target.value.toUpperCase())}
                    placeholder="8 karakter PIN"
                    className="w-full px-3 py-2 rounded-xl bg-black/35 border border-white/10 text-xs font-mono text-white outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {sendMsg && (
                <div
                  className={`text-xs px-3 py-2 rounded-xl border ${
                    sendMsg.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                  }`}
                >
                  {sendMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={sendBusy || !manualCode.trim() || manualPin.trim().length < 6}
                className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendBusy ? 'Şifrelenip Gönderiliyor...' : 'Anahtarı Yeni Cihaza Gönder'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
