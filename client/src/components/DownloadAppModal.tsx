import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Monitor,
  Smartphone,
  CheckCircle,
  Sparkles,
  Globe,
  Terminal,
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
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

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

  const triggerDownload = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedFile(filename);
    setTimeout(() => setDownloadedFile(null), 4000);
  };

  const handleDownloadWindowsLauncher = () => {
    const appUrl = window.location.origin;
    const batContent = [
      '@echo off',
      'title Discord & TeamSpeak Hybrid App',
      `set APP_URL=${appUrl}`,
      'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
      '  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app=%APP_URL%',
      '  exit /b',
      ')',
      'if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (',
      '  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app=%APP_URL%',
      '  exit /b',
      ')',
      'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
      '  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app=%APP_URL%',
      '  exit /b',
      ')',
      'start "" "%APP_URL%"',
      '',
    ].join('\r\n');
    triggerDownload('Cakma-Uygulama.bat', batContent);
  };

  const handleDownloadUnixLauncher = () => {
    const appUrl = window.location.origin;
    const shContent = [
      '#!/usr/bin/env bash',
      `APP_URL="${appUrl}"`,
      'if command -v google-chrome >/dev/null 2>&1; then',
      '  google-chrome --app="$APP_URL" &',
      'elif command -v chromium >/dev/null 2>&1; then',
      '  chromium --app="$APP_URL" &',
      'elif command -v open >/dev/null 2>&1; then',
      '  open -na "Google Chrome" --args --app="$APP_URL" || open "$APP_URL"',
      'else',
      '  xdg-open "$APP_URL"',
      'fi',
      '',
    ].join('\n');
    triggerDownload('cakma-app.sh', shContent);
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
        <header className="h-16 px-6 border-b border-white/[0.08] flex items-center justify-between bg-gradient-to-r from-blue-500/15 via-indigo-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Uygulamayı İndir & Kur</h2>
              <p className="text-[11px] text-white/50">
                Web tarayıcısı olmadan bağımsız masaüstü / mobil uygulama deneyimi
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
          {downloadedFile && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>
                <b>{downloadedFile}</b> indirildi! Çift tıklayarak uygulamayı bağımsız pencerede başlatabilirsiniz.
              </span>
            </div>
          )}

          {/* 1. Native PWA Install */}
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
                    Chrome, Edge veya mobil tarayıcınız üzerinden bilgisayarınıza / telefonunuza doğrudan masaüstü uygulaması olarak kurun.
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
                    <div className="font-bold text-white">Masaüstü (Chrome / Edge)</div>
                    <div>Adres çubuğunun sağındaki <b>"Yükle"</b> ikonuna veya Menü &rarr; <b>Uygulamayı Yükle</b> seçeneğine tıklayın.</div>
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

          {/* 2. Direct Desktop Launchers */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-white/70 uppercase tracking-wider px-1">
              Masaüstü Hızlı Başlatıcı İndir
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl ios-glass-card border border-white/10 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Windows Başlatıcı</div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      Adres çubuğu olmadan tam uygulama penceresinde başlatır (<code>.bat</code>).
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadWindowsLauncher}
                  className="w-full py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black border border-cyan-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Cakma-Uygulama.bat İndir</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl ios-glass-card border border-white/10 flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Linux / macOS Başlatıcı</div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      Chrome/Chromium uygulama penceresi olarak başlatır (<code>.sh</code>).
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadUnixLauncher}
                  className="w-full py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>cakma-app.sh İndir</span>
                </button>
              </div>
            </div>
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
