import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { Plus, Compass, MessageCircle, Download, Bell, BellOff } from 'lucide-react';
import { isImageAvatar } from './AvatarView';
import type { Server } from '../types';
import type { NotificationLevel } from '../utils/notificationPrefs';

interface ServerSidebarProps {
  onOpenCreateServer: () => void;
  onOpenExplore: () => void;
  onOpenDownload: () => void;
}

interface TooltipState {
  label: string;
  sublabel?: string;
  x: number;
  y: number;
}

export const ServerSidebar: React.FC<ServerSidebarProps> = ({
  onOpenCreateServer,
  onOpenExplore,
  onOpenDownload,
}) => {
  const {
    servers,
    activeServer,
    selectServer,
    unreadCounts,
    mentionCounts,
    unreadDMByUser,
    notificationPrefs,
    setTargetNotificationPref,
  } = useSocket();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [serverMenu, setServerMenu] = useState<{ server: Server; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!serverMenu) return;
    const handleClose = () => setServerMenu(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setServerMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [serverMenu]);

  const isDMActive = activeServer?.id === 'direct-messages';
  const totalDmUnreads = Object.values(unreadDMByUser || {}).reduce(
    (sum, count) => sum + (Number(count) || 0),
    0
  );
  const isInstalledApp =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      window.location.hostname === 'tauri.localhost' ||
      window.location.protocol === 'tauri:' ||
      window.matchMedia?.('(display-mode: standalone)').matches);

  const showTooltip = (e: React.MouseEvent<HTMLElement>, label: string, sublabel?: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      label,
      sublabel,
      x: rect.right + 12,
      y: rect.top + rect.height / 2,
    });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <nav className="w-[74px] ios-glass-sidebar md:rounded-2xl md:border md:border-white/[0.08] md:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] flex flex-col items-center py-3.5 shrink-0 select-none z-20">
      {/* Direct Messages / Home */}
      <div className="relative group flex items-center justify-center w-full mb-2">
        <div
          className={`absolute left-0 w-[3.5px] rounded-r-full transition-all duration-200 ${
            isDMActive
              ? 'h-7 bg-gradient-to-b from-amber-400 via-orange-400 to-teal-400 shadow-[0_0_12px_rgba(245,158,11,0.85)] opacity-100'
              : totalDmUnreads > 0
              ? 'h-2 bg-white/85 group-hover:h-4 opacity-100'
              : 'h-0 bg-gradient-to-b from-amber-400 via-orange-400 to-teal-400 group-hover:h-4 opacity-0 group-hover:opacity-100'
          }`}
        />
        <button
          onClick={() => selectServer('direct-messages')}
          onMouseEnter={(e) =>
            showTooltip(
              e,
              'Direkt Mesajlar',
              totalDmUnreads > 0 ? `${totalDmUnreads} okunmamış özel mesaj` : 'Özel sohbetler ve aramalar'
            )
          }
          onMouseLeave={hideTooltip}
          className={`w-11 h-11 transition-all duration-200 flex items-center justify-center border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${
            isDMActive
              ? 'rounded-[15px] bg-gradient-to-tr from-amber-500 via-orange-500 to-teal-500 text-white border-amber-300/40 shadow-[0_8px_22px_-4px_rgba(245,158,11,0.45)]'
              : 'rounded-[22px] hover:rounded-[15px] bg-white/[0.06] hover:bg-gradient-to-tr hover:from-amber-500/80 hover:to-teal-500/80 text-white/75 hover:text-white border-white/[0.08] hover:border-white/20'
          }`}
          aria-label="Direkt Mesajlar"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
        {totalDmUnreads > 0 && (
          <span
            className="pointer-events-none absolute -bottom-0.5 right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#0b0d14] shadow-lg"
          >
            {totalDmUnreads > 99 ? '99+' : totalDmUnreads}
          </span>
        )}
      </div>

      <div className="w-7 h-[1px] bg-white/[0.08] rounded-full mb-2.5 shrink-0" />

      {/* Scrollable Server List + Server Actions */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar flex flex-col items-center gap-2.5 py-0.5">
        {servers.map((server) => {
          const isActive = activeServer?.id === server.id;
          const serverMentions = server.channels.reduce((sum, ch) => sum + (mentionCounts[ch.id] || 0), 0);
          const serverUnreads = server.channels.reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0);

          return (
            <div
              key={server.id}
              className="relative group flex items-center justify-center w-full shrink-0"
            >
              {/* Left Active / Hover / Unread Indicator */}
              <div
                className={`absolute left-0 w-[3.5px] rounded-r-full transition-all duration-200 ${
                  isActive
                    ? 'h-7 bg-gradient-to-b from-amber-400 via-orange-400 to-teal-400 shadow-[0_0_12px_rgba(245,158,11,0.85)] opacity-100'
                    : serverUnreads > 0
                    ? 'h-2 bg-white/85 group-hover:h-4 opacity-100'
                    : 'h-0 bg-white/75 group-hover:h-4 opacity-0 group-hover:opacity-100'
                }`}
              />

              {/* Server Tile */}
              <button
                onClick={() => selectServer(server.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setServerMenu({
                    server,
                    x: Math.max(8, Math.min(e.clientX, window.innerWidth - 220)),
                    y: Math.max(8, Math.min(e.clientY, window.innerHeight - 190)),
                  });
                }}
                onMouseEnter={(e) =>
                  showTooltip(
                    e,
                    server.name,
                    notificationPrefs[server.id] === 'muted'
                      ? 'Bildirimler sessize alındı'
                      : serverMentions > 0
                      ? `${serverMentions} yeni bahsetme`
                      : serverUnreads > 0
                      ? `${serverUnreads} okunmamış mesaj`
                      : undefined
                  )
                }
                onMouseLeave={hideTooltip}
                className={`w-11 h-11 transition-all duration-200 flex items-center justify-center font-bold text-sm overflow-hidden border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${
                  isActive
                    ? 'rounded-[15px] bg-gradient-to-tr from-amber-500/90 via-orange-500/80 to-teal-500/90 text-white border-amber-300/45 shadow-[0_8px_22px_-4px_rgba(245,158,11,0.4)]'
                    : 'rounded-[22px] hover:rounded-[15px] bg-white/[0.06] hover:bg-white/[0.13] text-white/90 border-white/[0.08] hover:border-white/20'
                }`}
                aria-label={server.name}
              >
                {isImageAvatar(server.icon) ? (
                  <img
                    src={server.icon}
                    alt={server.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : server.icon ? (
                  <span className="text-lg leading-none">{server.icon}</span>
                ) : (
                  <span className="tracking-tight">{server.name.substring(0, 2).toUpperCase()}</span>
                )}
              </button>

              {notificationPrefs[server.id] === 'muted' && (
                <span
                  title="Sunucu bildirimleri sessize alındı"
                  className="pointer-events-none absolute -top-0.5 right-2.5 w-4 h-4 rounded-full bg-slate-800/95 text-white/65 border border-white/15 flex items-center justify-center shadow"
                >
                  <BellOff className="w-2.5 h-2.5" />
                </span>
              )}

              {serverMentions > 0 && (
                <span
                  className="pointer-events-none absolute -bottom-0.5 right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#0b0d14] shadow-lg"
                >
                  {serverMentions > 99 ? '99+' : serverMentions}
                </span>
              )}
            </div>
          );
        })}

        <div className="w-7 h-[1px] bg-white/[0.08] rounded-full my-0.5 shrink-0" />

        {/* Create Server */}
        <div className="relative flex items-center justify-center w-full shrink-0">
          <button
            onClick={onOpenCreateServer}
            onMouseEnter={(e) => showTooltip(e, 'Sunucu Oluştur', 'Yeni bir topluluk başlat')}
            onMouseLeave={hideTooltip}
            className="w-11 h-11 rounded-[22px] hover:rounded-[15px] transition-all duration-200 flex items-center justify-center bg-white/[0.04] hover:bg-emerald-500/20 text-emerald-400/90 hover:text-emerald-300 border border-white/[0.07] hover:border-emerald-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            aria-label="Sunucu Oluştur"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Explore & Dedicated Servers */}
        <div className="relative flex items-center justify-center w-full shrink-0">
          <button
            onClick={onOpenExplore}
            onMouseEnter={(e) =>
              showTooltip(
                e,
                'Sunucuları Keşfet',
                servers.length === 0 ? 'Katılmak için topluluklara göz at!' : 'Topluluklar & Dedicated odalar'
              )
            }
            onMouseLeave={hideTooltip}
            className={`w-11 h-11 rounded-[22px] hover:rounded-[15px] transition-all duration-200 flex items-center justify-center border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
              servers.length === 0
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'bg-white/[0.04] hover:bg-indigo-500/20 text-white/65 hover:text-indigo-300 border-white/[0.07] hover:border-indigo-400/35'
            }`}
            aria-label="Keşfet & Dedicated Sunucular"
          >
            <Compass className="w-5 h-5" />
          </button>
          {servers.length === 0 && (
            <span className="pointer-events-none absolute -top-0.5 right-2.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0b0d14] animate-pulse" />
          )}
        </div>
      </div>

      {/* Bottom-Pinned Utility Section */}
      {!isInstalledApp && (
        <div className="w-full pt-2.5 mt-2 border-t border-white/[0.07] flex flex-col items-center shrink-0">
          <button
            onClick={onOpenDownload}
            onMouseEnter={(e) => showTooltip(e, 'Masaüstü Uygulaması', 'Windows & macOS uygulamasını indir')}
            onMouseLeave={hideTooltip}
            className="w-11 h-11 rounded-[22px] hover:rounded-[15px] transition-all duration-200 flex items-center justify-center bg-sky-500/10 hover:bg-sky-500/25 text-sky-400 hover:text-sky-200 border border-sky-400/20 hover:border-sky-400/45 shadow-[0_4px_14px_-4px_rgba(56,189,248,0.25)]"
            aria-label="Masaüstü Uygulamasını İndir"
          >
            <Download className="w-[18px] h-[18px]" />
          </button>
        </div>
      )}

      {/* Server Right-Click Notification Context Menu */}
      {serverMenu &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ left: serverMenu.x, top: serverMenu.y }}
            className="fixed z-[9999] w-52 rounded-2xl bg-[#13151d]/95 border border-white/15 shadow-2xl backdrop-blur-2xl p-1.5 text-xs text-white animate-fade-in"
          >
            <div className="px-2.5 py-1.5 border-b border-white/10 mb-1 flex items-center justify-between gap-2">
              <span className="font-bold truncate">{serverMenu.server.name}</span>
              <span className="text-[10px] text-white/45 shrink-0">Bildirimler</span>
            </div>
            {(
              [
                { id: 'all', label: 'Tüm Mesajlar', icon: Bell },
                { id: 'mentions', label: 'Sadece @Bahsetmeler', icon: Bell },
                { id: 'muted', label: 'Sunucuyu Sessize Al', icon: BellOff },
              ] as Array<{ id: NotificationLevel; label: string; icon: any }>
            ).map((opt) => {
              const current = notificationPrefs[serverMenu.server.id] || 'all';
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setTargetNotificationPref(serverMenu.server.id, opt.id);
                    setServerMenu(null);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl transition text-left ${
                    current === opt.id
                      ? 'bg-red-500/20 text-white font-semibold border border-red-400/30'
                      : 'hover:bg-white/10 text-white/80'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-white/70" />
                    <span>{opt.label}</span>
                  </span>
                  {current === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}

      {/* Portal Tooltip (never clipped by overflow or backdrop-filter) */}
      {tooltip &&
        createPortal(
          <div
            style={{ left: tooltip.x, top: tooltip.y }}
            className="pointer-events-none fixed -translate-y-1/2 z-[9999] px-3 py-1.5 rounded-xl bg-[#13151d]/95 border border-white/15 shadow-2xl backdrop-blur-xl whitespace-nowrap"
          >
            <div className="text-xs font-bold text-white leading-tight">{tooltip.label}</div>
            {tooltip.sublabel && (
              <div className="text-[10px] text-white/50 mt-0.5 leading-tight">{tooltip.sublabel}</div>
            )}
          </div>,
          document.body
        )}
    </nav>
  );
};
