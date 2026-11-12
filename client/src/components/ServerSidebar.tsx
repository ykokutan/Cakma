import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Plus, Compass, MessageCircle, Download } from 'lucide-react';

interface ServerSidebarProps {
  onOpenCreateServer: () => void;
  onOpenExplore: () => void;
  onOpenDownload: () => void;
}

export const ServerSidebar: React.FC<ServerSidebarProps> = ({ onOpenCreateServer, onOpenExplore, onOpenDownload }) => {
  const { servers, activeServer, selectServer } = useSocket();
  const [hoveredServerId, setHoveredServerId] = useState<string | null>(null);

  const isDMActive = activeServer?.id === 'direct-messages';

  return (
    <nav className="w-[72px] ios-glass-sidebar flex flex-col items-center py-4 gap-3 shrink-0 select-none z-20">
      {/* iOS Direct Messages Pill */}
      <div className="relative group flex items-center justify-center w-full">
        <div
          className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
            isDMActive ? 'h-8' : 'h-0 group-hover:h-4'
          }`}
        />
        <button
          onClick={() => selectServer('direct-messages')}
          className={`w-12 h-12 rounded-2xl transition-all duration-200 flex items-center justify-center bg-white/10 hover:bg-blue-500 text-white/80 hover:text-white shadow-lg ${
            isDMActive ? '!bg-blue-500 !text-white ring-2 ring-blue-400/40 shadow-blue-500/30' : ''
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

          return (
            <div
              key={server.id}
              className="relative group flex items-center justify-center w-full"
              onMouseEnter={() => setHoveredServerId(server.id)}
              onMouseLeave={() => setHoveredServerId(null)}
            >
              {/* Active Indicator Bar */}
              <div
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isActive ? 'h-8' : isHovered ? 'h-4' : 'h-0'
                }`}
              />

              {/* iOS Squircle Server Button */}
              <button
                onClick={() => selectServer(server.id)}
                className={`w-12 h-12 rounded-2xl transition-all duration-200 flex items-center justify-center font-bold text-base overflow-hidden bg-white/10 text-white/90 hover:bg-white/20 hover:scale-105 shadow-md ${
                  isActive ? '!bg-gradient-to-tr from-blue-600 to-indigo-500 !text-white ring-2 ring-blue-400/50 shadow-blue-500/30' : ''
                }`}
              >
                {server.icon ? (
                  <span className="text-xl">{server.icon}</span>
                ) : (
                  server.name.substring(0, 2).toUpperCase()
                )}
              </button>

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

        {/* Download / Install App Button (Web) */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={onOpenDownload}
            className="w-12 h-12 rounded-2xl transition-all duration-200 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/20 hover:border-transparent hover:scale-105 shadow"
            title="Uygulamayı İndir / Kur"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
};
