import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Plus, Compass, MessageCircle, Download } from 'lucide-react';
import { isImageAvatar } from './AvatarView';

interface ServerSidebarProps {
  onOpenCreateServer: () => void;
  onOpenExplore: () => void;
  onOpenDownload: () => void;
}

export const ServerSidebar: React.FC<ServerSidebarProps> = ({ onOpenCreateServer, onOpenExplore, onOpenDownload }) => {
  const { servers, activeServer, selectServer, unreadCounts, mentionCounts } = useSocket();
  const [hoveredServerId, setHoveredServerId] = useState<string | null>(null);

  const isDMActive = activeServer?.id === 'direct-messages';
  const isInstalledApp = typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window ||
    window.location.hostname === 'tauri.localhost' ||
    window.location.protocol === 'tauri:' ||
    window.matchMedia?.('(display-mode: standalone)').matches
  );

  return (
    <nav className="w-[74px] ios-glass-sidebar md:rounded-2xl md:border md:border-white/[0.08] md:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] flex flex-col items-center py-4 gap-3 shrink-0 select-none z-20">
      {/* Atelier Brand / Direct Messages Pill */}
      <div className="relative group flex items-center justify-center w-full">
        <div
          className={`absolute left-0 w-1 bg-gradient-to-b from-amber-400 via-orange-400 to-teal-400 rounded-r-full transition-all duration-200 ${
            isDMActive ? 'h-8 shadow-[0_0_12px_rgba(245,158,11,0.85)]' : 'h-0 group-hover:h-4'
          }`}
        />
        <button
          onClick={() => selectServer('direct-messages')}
          className={`w-12 h-12 rounded-[18px] transition-all duration-200 flex items-center justify-center bg-white/[0.07] hover:bg-gradient-to-tr hover:from-amber-500 hover:to-teal-500 text-white/80 hover:text-white shadow-lg border border-white/[0.08] ${
            isDMActive ? '!bg-gradient-to-tr !from-amber-500 !via-orange-500 !to-teal-500 !text-white ring-2 ring-amber-400/50 shadow-[0_8px_24px_rgba(245,158,11,0.32)]' : ''
          }`}
          title="Direkt Mesajlar (DMs)"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="w-8 h-[1px] bg-white/10 rounded my-0.5" />

      {/* Server List */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar flex flex-col items-center gap-3">
        {servers.map((server) => {
          const isActive = activeServer?.id === server.id;
          const isHovered = hoveredServerId === server.id;
          const serverMentions = server.channels.reduce((sum, ch) => sum + (mentionCounts[ch.id] || 0), 0);
          const serverUnreads = server.channels.reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0);

          return (
            <div
              key={server.id}
              className="relative group flex items-center justify-center w-full"
              onMouseEnter={() => setHoveredServerId(server.id)}
              onMouseLeave={() => setHoveredServerId(null)}
            >
              {/* Active / Unread Indicator Bar */}
              <div
                className={`absolute left-0 w-1 bg-gradient-to-b from-amber-400 via-orange-400 to-teal-400 rounded-r-full transition-all duration-200 ${
                  isActive
                    ? 'h-8 shadow-[0_0_12px_rgba(245,158,11,0.85)]'
                    : isHovered
                    ? 'h-4'
                    : serverUnreads > 0
                    ? 'h-2 !bg-white/80'
                    : 'h-0'
                }`}
              />

              {/* Atelier Squircle Server Button */}
              <button
                onClick={() => selectServer(server.id)}
                className={`w-12 h-12 rounded-[18px] transition-all duration-200 flex items-center justify-center font-bold text-base overflow-hidden bg-white/[0.07] border border-white/[0.08] text-white/90 hover:bg-white/15 hover:scale-105 shadow-md ${
                  isActive ? '!rounded-2xl !bg-gradient-to-tr from-amber-500/90 via-orange-500/80 to-teal-500/90 !text-white ring-2 ring-amber-400/55 shadow-[0_8px_24px_rgba(245,158,11,0.28)]' : ''
                }`}
              >
                {isImageAvatar(server.icon) ? (
                  <img
                    src={server.icon}
                    alt={server.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : server.icon ? (
                  <span className="text-xl">{server.icon}</span>
                ) : (
                  server.name.substring(0, 2).toUpperCase()
                )}
              </button>

              {serverMentions > 0 && (
                <span
                  className="pointer-events-none absolute -bottom-0.5 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#0b0d14] shadow-lg"
                  title={`${serverMentions} bahsetme`}
                >
                  {serverMentions > 99 ? '99+' : serverMentions}
                </span>
              )}

              {/* Floating Glass Tooltip */}
              {isHovered && (
                <div className="pointer-events-none fixed left-[78px] z-50 px-3 py-1.5 rounded-xl bg-[#16171d]/95 border border-white/15 text-xs font-bold text-white shadow-2xl backdrop-blur-xl whitespace-nowrap animate-fade-in">
                  {server.name}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Server Button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={onOpenCreateServer}
            className="w-12 h-12 rounded-2xl transition-all duration-200 flex items-center justify-center bg-white/5 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-white/5 hover:border-transparent hover:scale-105 shadow"
            title="Sunucu Ekle"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Explore Button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={onOpenExplore}
            className="w-12 h-12 rounded-2xl transition-all duration-200 flex items-center justify-center bg-white/5 hover:bg-emerald-500 text-white/60 hover:text-white border border-white/5 hover:border-transparent hover:scale-105 shadow"
            title="Keşfet & Dedicated Sunucular"
          >
            <Compass className="w-5 h-5" />
          </button>
        </div>

        {/* Download / Install App Button (Web Only) */}
        {!isInstalledApp && (
          <div className="relative group flex items-center justify-center w-full">
            <button
              onClick={onOpenDownload}
              className="w-12 h-12 rounded-2xl transition-all duration-200 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/20 hover:border-transparent hover:scale-105 shadow"
              title="Uygulamayı İndir / Kur"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};
