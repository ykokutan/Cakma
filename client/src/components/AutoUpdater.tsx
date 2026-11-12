import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

type UpdateState =
  | { status: 'idle' }
  | { status: 'downloading'; version: string; progress: number }
  | { status: 'restarting'; version: string };

export const AutoUpdater: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');

    if (!isTauri) return;

    let cancelled = false;

    const checkForUpdates = async () => {
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
