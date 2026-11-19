import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Send, ShieldAlert, XCircle } from 'lucide-react';
import {
  getCurrentPushSubscription,
  isWebPushSupported,
  sendTestWebPush,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '../../utils/webPushClient';
import { appToast } from '../../utils/appDialogs';

interface WebPushSettingsCardProps {
  currentServerHost: string;
}

export const WebPushSettingsCard: React.FC<WebPushSettingsCardProps> = ({ currentServerHost }) => {
  const supported = isWebPushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!supported) return;
    getCurrentPushSubscription().then((sub) => {
      if (!cancelled) setSubscribed(Boolean(sub));
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const handleToggle = async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      if (subscribed) {
        const res = await unsubscribeFromWebPush(currentServerHost);
        if (res.ok) {
          setSubscribed(false);
          appToast('Web Push bildirim aboneliği devre dışı bırakıldı.', 'info');
        } else {
          appToast(res.error || 'İşlem başarısız.', 'error');
        }
      } else {
        const res = await subscribeToWebPush(currentServerHost);
        if (res.ok) {
          setSubscribed(true);
          appToast('Web Push bildirimleri başarıyla etkinleştirildi!', 'success');
        } else {
          appToast(res.error || 'Web Push etkinleştirilemedi.', 'error');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    if (!subscribed || busy) return;
    setBusy(true);
    try {
      const res = await sendTestWebPush(currentServerHost);
      if (res.ok) {
        appToast('Test bildirimi push servisine gönderildi!', 'success');
      } else {
        appToast(res.error || 'Test bildirimi gönderilemedi.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-bold text-white">Gerçek Web Push (VAPID / Çevrimdışı Bildirimler)</div>
              {subscribed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <CheckCircle2 className="w-3 h-3" /> Aktif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/60 border border-white/10">
                  <XCircle className="w-3 h-3" /> Kapalı
                </span>
              )}
            </div>
            <p className="text-xs text-white/55 mt-0.5 leading-relaxed">
              Sekme veya uygulama kapalıyken gelen 1-e-1 aramalar, direkt mesajlar ve @bahsetmeler için şifreli (RFC 8291) anlık bildirim alın.
            </p>
          </div>
        </div>
      </div>

      {!supported ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/20 text-[11px] text-amber-200">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>Bu tarayıcı/WebView ortamında Service Worker PushManager desteklenmiyor (HTTPS veya PWA/modern tarayıcı gerekir).</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleToggle}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              subscribed
                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30'
                : 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20'
            } disabled:opacity-50`}
          >
            {busy ? 'İşleniyor...' : subscribed ? 'Web Push Aboneliğini Kapat' : 'Web Push Bildirimlerini Aç'}
          </button>

          {subscribed && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSendTest}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Test Bildirimi Gönder</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
