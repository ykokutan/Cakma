import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Search, Volume2, HelpCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface WindowTitleBarProps {
  onOpenQuickSwitcher?: () => void;
  onOpenShortcuts?: () => void;
}

export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({
  onOpenQuickSwitcher,
  onOpenShortcuts,
}) => {
  const {
    activeServer,
    activeChannel,
    ping,
    isAuthenticated,
    connectedVoiceChannelId,
    voiceTransportMode,
    setIsDiagnosticsOpen,
    servers,
    connectionState,
  } = useSocket();
  const [isMaximized, setIsMaximized] = useState(false);

  const activeVoiceChannelName = connectedVoiceChannelId
    ? servers.flatMap((s) => s.channels).find((c) => c.id === connectedVoiceChannelId)?.name
    : undefined;

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
        <img
          src="/app-icon.png"
          alt="Çakma"
          className="w-4 h-4 rounded-[5px] shadow-sm shrink-0 pointer-events-none object-cover"
          draggable={false}
        />
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
        {isAuthenticated && connectedVoiceChannelId && (
          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            title="Ses bağlantısı aktif — Ağ teşhisini aç"
            className="hidden lg:inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/25 px-2 py-0.5 rounded-full max-w-[190px] transition cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <Volume2 className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate font-semibold">{activeVoiceChannelName || 'Ses Odası'}</span>
            <span className="text-[9px] font-mono uppercase px-1 rounded bg-emerald-500/20 text-emerald-200 shrink-0">
              {voiceTransportMode === 'sfu' ? 'SFU' : 'P2P'}
            </span>
          </button>
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

      {/* Right: Ping, Shortcuts & Window Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen(true)}
            title="Ağ Teşhisi & Bağlantı İstatistikleri"
            className={`hidden sm:inline-flex items-center gap-1.5 mr-1 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.1] text-[10px] font-mono transition ${
              connectionState !== 'connected'
                ? 'text-rose-300'
                : ping < 60
                ? 'text-emerald-300'
                : ping < 130
                ? 'text-amber-300'
                : 'text-rose-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState !== 'connected'
                  ? 'bg-rose-400 animate-pulse'
                  : ping < 60
                  ? 'bg-emerald-400'
                  : ping < 130
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span>
              {connectionState === 'reconnecting'
                ? 'Yeniden bağlanıyor...'
                : connectionState === 'disconnected'
                ? 'Çevrimdışı'
                : `${ping}ms`}
            </span>
          </button>
        )}
        {isAuthenticated && onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="hidden sm:flex w-6 h-6 mr-1 rounded-lg hover:bg-white/10 text-white/55 hover:text-white items-center justify-center transition"
            title="Klavye Kısayolları (Ctrl+/)"
            aria-label="Klavye Kısayolları"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
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
