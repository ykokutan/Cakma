import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Search } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface WindowTitleBarProps {
  onOpenQuickSwitcher?: () => void;
}

export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({ onOpenQuickSwitcher }) => {
  const { activeServer, activeChannel, ping, isAuthenticated } = useSocket();
  const [isMaximized, setIsMaximized] = useState(false);

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      window.location.hostname === 'tauri.localhost' ||
      window.location.protocol === 'tauri:');

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        setIsMaximized(await win.isMaximized());
        unlisten = await win.onResized(async () => {
          try {
            setIsMaximized(await win.isMaximized());
          } catch {}
        });
      } catch {}
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  if (!isTauri) return null;

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleToggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch {}
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {}
  };

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
      className="h-8 w-full shrink-0 flex items-center justify-between px-3 bg-[#0c0e16]/85 backdrop-blur-2xl border-b border-white/[0.08] select-none z-50"
    >
      {/* Left: Brand & Active Location */}
      <div data-tauri-drag-region className="flex items-center gap-2 min-w-0">
        <div className="w-4 h-4 rounded-md bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-sm shadow-blue-500/30 shrink-0 pointer-events-none">
          <span className="text-[9px] font-black text-white leading-none">Ç</span>
        </div>
        <span data-tauri-drag-region className="text-[11px] font-bold text-white/90 tracking-tight pointer-events-none">
          Çakma
        </span>
        {isAuthenticated && activeServer && (
          <div
            data-tauri-drag-region
            className="hidden sm:flex items-center gap-1.5 text-[10px] text-white/50 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full truncate max-w-[260px] pointer-events-none"
          >
            <span className="truncate font-medium text-white/70">{activeServer.name}</span>
            {activeChannel && (
              <>
                <span className="text-white/25">/</span>
                <span className="truncate text-blue-300/80">#{activeChannel.name}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Center: Quick Switcher Pill */}
      {isAuthenticated && onOpenQuickSwitcher && (
        <button
          type="button"
          onClick={onOpenQuickSwitcher}
          className="hidden md:flex items-center gap-2 px-3 py-0.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] text-white/55 hover:text-white transition"
          title="Hızlı Geçiş (Ctrl+K)"
        >
          <Search className="w-2.5 h-2.5" />
          <span>Hızlı Geçiş</span>
          <kbd className="px-1 py-0.2 rounded bg-black/40 text-[9px] text-white/40 font-mono">Ctrl+K</kbd>
        </button>
      )}

      {/* Right: Ping & Window Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {isAuthenticated && (
          <span className="hidden sm:inline-flex items-center gap-1 mr-2 text-[10px] font-mono text-emerald-300/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {ping}ms
          </span>
        )}
        <button
          type="button"
          onClick={handleMinimize}
          className="w-7 h-6 rounded-lg hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition"
          title="Küçült"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="w-7 h-6 rounded-lg hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition"
          title={isMaximized ? 'Önceki Boyut' : 'Ekranı Kapla'}
        >
          {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-7 h-6 rounded-lg hover:bg-rose-500/80 text-white/60 hover:text-white flex items-center justify-center transition"
          title="Kapat (Sistem Tepsisine Küçült)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
