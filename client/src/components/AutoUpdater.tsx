import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Smartphone, X } from 'lucide-react';
import { checkAndroidApkUpdate, isCapacitorAndroid } from '../utils/androidUpdater';

type UpdateState =
  | { status: 'idle' }
  | { status: 'downloading'; version: string; progress: number }
  | { status: 'restarting'; version: string }
  | { status: 'android_available'; version: string; apkUrl: string; sha256?: string };

const ANDROID_DISMISS_KEY = 'cakma_android_update_dismissed_v';

export const AutoUpdater: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');

    const isAndroid = isCapacitorAndroid();
    if (!isTauri && !isAndroid) return;

    let cancelled = false;

    const checkForUpdates = async () => {
      if (isAndroid) {
        try {
          const savedHost = localStorage.getItem('dc_server_host') || '';
          const info = await checkAndroidApkUpdate(savedHost);
          if (cancelled || !info.available) return;
          const dismissed = sessionStorage.getItem(ANDROID_DISMISS_KEY);
          if (dismissed === info.latestVersion) return;
          setState({
            status: 'android_available',
            version: info.latestVersion,
            apkUrl: info.apkUrl,
            sha256: info.sha256,
          });
        } catch {
          // ignore Android OTA check failure
        }
        return;
      }

      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const { relaunch } = await import('@tauri-apps/plugin-process');

        const update = await check();
        if (!update || cancelled) return;

        let totalBytes = 0;
        let downloadedBytes = 0;

        setState({ status: 'downloading', version: update.version, progress: 0 });

        await update.downloadAndInstall((event) => {
          if (cancelled) return;
          if (event.event === 'Started') {
            totalBytes = event.data.contentLength || 0;
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
            const progress =
              totalBytes > 0
                ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                : 0;
            setState({ status: 'downloading', version: update.version, progress });
          } else if (event.event === 'Finished') {
            setState({ status: 'restarting', version: update.version });
          }
        });

        if (!cancelled) {
          setState({ status: 'restarting', version: update.version });
          setTimeout(() => {
            relaunch().catch((err) => console.error('Relaunch failed:', err));
          }, 1200);
        }
      } catch (err) {
        console.warn('Auto-update check skipped:', err);
        if (!cancelled) setState({ status: 'idle' });
      }
    };

    const initialTimer = setTimeout(checkForUpdates, 2500);
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  if (state.status === 'idle') return null;

  if (state.status === 'android_available') {
    return (
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[9999] sm:w-80 rounded-2xl border border-emerald-500/40 bg-[#121622]/95 p-4 shadow-2xl backdrop-blur-md text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white">
              Yeni Android Sürümü: v{state.version}
            </div>
            <div className="text-xs text-zinc-300 mt-0.5">
              Güncel APK paketi indirilebilir.
            </div>
            {state.sha256 && (
              <div className="text-[10px] font-mono text-emerald-300/80 mt-1 truncate">
                SHA-256: {state.sha256.slice(0, 16)}…
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(ANDROID_DISMISS_KEY, state.version);
              } catch {}
              setState({ status: 'idle' });
            }}
            className="text-zinc-400 hover:text-white p-1"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <a
            href={state.apkUrl}
            target="_system"
            rel="noopener noreferrer"
            className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>APK İndir &amp; Güncelle</span>
          </a>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(ANDROID_DISMISS_KEY, state.version);
              } catch {}
              setState({ status: 'idle' });
            }}
            className="py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-zinc-200 transition"
          >
            Sonra
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-80 rounded-xl border border-indigo-500/40 bg-[#1e1f22]/95 p-4 shadow-2xl backdrop-blur-md text-white">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
          {state.status === 'downloading' ? (
            <Download className="h-5 w-5 animate-bounce" />
          ) : (
            <RefreshCw className="h-5 w-5 animate-spin" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">
            {state.status === 'downloading'
              ? `Çakma v${state.version} indiriliyor...`
              : `Güncelleme hazır (v${state.version})`}
          </div>
          <div className="text-xs text-zinc-400">
            {state.status === 'downloading'
              ? `Otomatik güncelleme: %${state.progress}`
              : 'Uygulama yeniden başlatılıyor...'}
          </div>
        </div>
      </div>

      {state.status === 'downloading' && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
          <div
            className="h-full bg-indigo-500 transition-all duration-200"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
