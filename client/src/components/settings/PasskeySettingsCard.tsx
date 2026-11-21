import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { PasskeyInfo } from '../../types';
import { appConfirm, appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';
import {
  deletePasskey,
  isWebAuthnSupported,
  listPasskeys,
  registerPasskey,
} from '../../utils/webauthn';

export const PasskeySettingsCard: React.FC = () => {
  const { currentServerHost, language } = useSocket();
  const supported = isWebAuthnSupported();

  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPasskeys = useCallback(async () => {
    setLoading(true);
    const items = await listPasskeys(currentServerHost);
    setPasskeys(items);
    setLoading(false);
  }, [currentServerHost]);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supported || busy) return;
    setBusy(true);
    const res = await registerPasskey(
      currentServerHost,
      label.trim() || `Passkey (${new Date().toLocaleDateString()})`
    );
    setBusy(false);
    if (!res.success) {
      appToast(res.error || 'Passkey eklenemedi.', 'error');
      return;
    }
    appToast('Passkey hesabınıza bağlandı!', 'success');
    setLabel('');
    await loadPasskeys();
  };

  const handleDelete = async (pk: PasskeyInfo) => {
    const ok = await appConfirm({
      title: 'Passkey Kaldır',
      message: `"${pk.label}" anahtarını hesabınızdan kaldırmak istiyor musunuz?`,
      danger: true,
      confirmLabel: 'Kaldır',
    });
    if (!ok) return;
    const removed = await deletePasskey(currentServerHost, pk.id);
    if (removed) {
      setPasskeys((prev) => prev.filter((item) => item.id !== pk.id));
      appToast('Passkey kaldırıldı.', 'info');
    } else {
      appToast('Passkey silinemedi.', 'error');
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
          <KeyRound className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">{t(language, 'passkeysTitle')}</h4>
          <p className="text-[11px] text-white/50">
            Windows Hello, Touch ID veya FIDO2 güvenlik anahtarıyla parolasız giriş yapın.
          </p>
        </div>
      </div>

      {!supported ? (
        <div className="text-xs px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200">
          Bu tarayıcı/WebView ortamı WebAuthn Passkey API desteklemiyor.
        </div>
      ) : (
        <form onSubmit={handleRegister} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Cihaz etiketi (Örn: Laptop Touch ID)"
            className="flex-1 min-w-[180px] bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition shrink-0"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{t(language, 'addPasskey')}</span>
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-white/40 flex items-center gap-1.5 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Passkey listesi yükleniyor...</span>
        </div>
      ) : passkeys.length === 0 ? (
        <div className="text-[11px] text-white/40 py-1">
          Henüz kayıtlı Passkey anahtarı bulunmuyor.
        </div>
      ) : (
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="p-2.5 rounded-xl bg-black/25 border border-white/10 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{pk.label}</div>
                <div className="text-[10px] text-white/45 font-mono truncate">
                  Eklenme: {new Date(pk.createdAt).toLocaleDateString()}
                  {pk.lastUsedAt ? ` · Son kullanım: ${new Date(pk.lastUsedAt).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(pk)}
                className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/20 transition shrink-0"
                title="Passkey Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
