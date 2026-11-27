import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Monitor,
  Smartphone,
  CheckCircle,
  Sparkles,
  Globe,
  Apple,
  ExternalLink,
} from 'lucide-react';

interface DownloadAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadAppModal: React.FC<DownloadAppModalProps> = ({ isOpen, onClose }) => {
  const [canInstallPwa, setCanInstallPwa] = useState<boolean>(Boolean(window.__deferredInstallPrompt));
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);
  const [hasMacDmg, setHasMacDmg] = useState<boolean>(false);
  const [hasAndroidApk, setHasAndroidApk] = useState<boolean>(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const onAvailable = () => setCanInstallPwa(Boolean(window.__deferredInstallPrompt));
    const onInstalled = () => {
      setInstallSuccess(true);
      setCanInstallPwa(false);
      window.__deferredInstallPrompt = undefined;
    };

    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/downloads/Cakma.dmg', { method: 'HEAD' })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        setHasMacDmg(res.ok && !ct.includes('text/html'));
      })
      .catch(() => setHasMacDmg(false));
    fetch('/downloads/Cakma.apk', { method: 'HEAD' })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        setHasAndroidApk(res.ok && !ct.includes('text/html'));
      })
      .catch(() => setHasAndroidApk(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstallPwa = async () => {
    const promptEvent = window.__deferredInstallPrompt;
    if (!promptEvent) return;
    promptEvent.prompt();
    const choiceResult = await promptEvent.userChoice;
    if (choiceResult?.outcome === 'accepted') {
      setInstallSuccess(true);
    }
    window.__deferredInstallPrompt = undefined;
    setCanInstallPwa(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-2xl flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl ios-glass rounded-3xl shadow-2xl border border-white/15 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between bg-gradient-to-r from-red-600/15 via-rose-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/app-icon.png"
              alt="Çakma"
              className="w-10 h-10 rounded-2xl shadow-lg shadow-red-600/25 ring-1 ring-white/15 object-cover shrink-0"
              draggable={false}
            />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Uygulamayı İndir & Kur</h2>
              <p className="text-[11px] text-white/50">
                Windows (.exe), macOS (.dmg / PWA) ve mobil kurulum merkezi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-6 space-y-5 overflow-y-auto">
          {downloadNotice && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{downloadNotice}</span>
            </div>
          )}

          {/* 1. Native Desktop & Mobile Installers (.exe / .apk / .dmg) */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-white/70 uppercase tracking-wider px-1">
              Masaüstü &amp; Mobil Kurulum Dosyaları
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Windows .exe */}
              <div className="p-4 rounded-2xl ios-glass-card border border-cyan-500/25 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Windows</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                        .EXE
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      Tauri x64 Kurulum Paketi (Windows 10 / 11)
                    </div>
                  </div>
                </div>
                <a
                  href="/downloads/Cakma-Setup.exe"
                  download="Cakma-Setup.exe"
                  onClick={() => {
                    setDownloadNotice('Cakma-Setup.exe indiriliyor...');
                    setTimeout(() => setDownloadNotice(null), 4000);
                  }}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-cyan-500/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Windows İçin İndir (.exe)</span>
                </a>
              </div>

              {/* macOS .dmg */}
              <div className="p-4 rounded-2xl ios-glass-card border border-white/10 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                    <Apple className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>macOS</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">
                        .DMG
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      {hasMacDmg
                        ? 'Apple Silicon & Intel macOS Uygulama Paketi'
                        : 'macOS derlemesi (.dmg) henüz sunucuya yüklenmedi. PWA ile kurabilirsiniz.'}
                    </div>
                  </div>
                </div>
                {hasMacDmg ? (
                  <a
                    href="/downloads/Cakma.dmg"
                    download="Cakma.dmg"
                    onClick={() => {
                      setDownloadNotice('Cakma.dmg indiriliyor...');
                      setTimeout(() => setDownloadNotice(null), 4000);
                    }}
                    className="w-full py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-purple-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>macOS İçin İndir (.dmg)</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 rounded-xl bg-white/5 text-white/40 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                    title="macOS .dmg paketi macOS bir cihazda derlenip /downloads/Cakma.dmg yoluna eklendiğinde aktif olur."
                  >
                    <Apple className="w-3.5 h-3.5" />
                    <span>.dmg Henüz Mevcut Değil</span>
                  </button>
                )}
              </div>

              {/* Android .apk */}
              <div className="p-4 rounded-2xl ios-glass-card border border-emerald-500/25 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Android</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                        .APK
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      {hasAndroidApk
                        ? 'Arka plan ses servisi + Bluetooth destekli APK'
                        : 'Android .apk paketi derlendikten sonra buradan indirilebilir.'}
                    </div>
                  </div>
                </div>
                {hasAndroidApk ? (
                  <a
                    href="/downloads/Cakma.apk"
                    download="Cakma.apk"
                    onClick={() => {
                      setDownloadNotice('Cakma.apk indiriliyor...');
                      setTimeout(() => setDownloadNotice(null), 4000);
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Android İndir (.apk)</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 rounded-xl bg-white/5 text-white/40 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>.apk Hazırlanıyor</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Native PWA Install (Windows, macOS & Mobile) */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-600/15 via-indigo-600/10 to-purple-600/15 border border-blue-500/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Tek Tıkla Uygulama Kurulumu (PWA)</span>
                    {(isStandalone || installSuccess) && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                        Kurulu
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">
                    macOS, Windows, iOS veya Android cihazınıza tarayıcı üzerinden doğrudan bağımsız uygulama olarak kurun.
                  </p>
                </div>
              </div>

              {isStandalone || installSuccess ? (
                <div className="px-4 py-2 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shrink-0">
                  <CheckCircle className="w-4 h-4" />
                  <span>Uygulama Aktif</span>
                </div>
              ) : canInstallPwa ? (
                <button
                  type="button"
                  onClick={handleInstallPwa}
                  className="px-5 py-2.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-lg shadow-blue-500/30 transition flex items-center gap-2 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Hemen Kur</span>
                </button>
              ) : (
                <span className="px-3 py-1.5 rounded-xl bg-white/10 text-white/60 text-[11px] font-semibold shrink-0">
                  Tarayıcı Menüsünden Kur
                </span>
              )}
            </div>

            {!isStandalone && !canInstallPwa && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10 text-[11px] text-white/65">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-start gap-2">
                  <Monitor className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white">macOS / Windows (Chrome, Edge, Safari)</div>
                    <div>Adres çubuğundaki <b>"Yükle"</b> ikonuna veya Safari'de <b>Dosya &rarr; Dock'a Ekle</b>'ye tıklayın.</div>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-start gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white">Mobil (iOS / Android)</div>
                    <div>Safari'de <b>Paylaş &rarr; Ana Ekrana Ekle</b>, Android Chrome'da <b>Uygulamayı Yükle</b>'ye dokunun.</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-[11px] text-white/50">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-white/40" />
              <span>Aktif Sunucu Adresi: <strong className="text-white/80 font-mono">{window.location.origin}</strong></span>
            </div>
            <a
              href={window.location.origin}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold"
            >
              <span>Yeni Sekme</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
