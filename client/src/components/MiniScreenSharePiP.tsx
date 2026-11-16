import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Tv, X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export const MiniScreenSharePiP: React.FC = () => {
  const {
    remoteScreenStreams,
    onlineUsers,
    activeChannel,
    connectedVoiceChannelId,
    selectChannel,
  } = useSocket();

  const [dismissedStreamKey, setDismissedStreamKey] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const entries = Array.from(remoteScreenStreams.entries());
  const firstEntry = entries[0];
  const activeStreamKey = firstEntry ? `${firstEntry[0]}-${firstEntry[1].id}` : null;

  useEffect(() => {
    if (videoRef.current && firstEntry) {
      videoRef.current.srcObject = firstEntry[1];
    }
  }, [firstEntry]);

  // Only show PiP when user is in a voice channel with a remote screen share,
  // but currently viewing a different (text/DM) channel.
  if (
    !firstEntry ||
    !connectedVoiceChannelId ||
    activeChannel?.id === connectedVoiceChannelId ||
    activeStreamKey === dismissedStreamKey
  ) {
    return null;
  }

  const presenter = onlineUsers.find((u) => u.id === firstEntry[0]);

  return (
    <div className="fixed bottom-4 right-4 z-[95] w-72 rounded-2xl overflow-hidden bg-[#14151c]/95 border border-white/15 shadow-2xl backdrop-blur-xl animate-fade-in">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Tv className="w-3.5 h-3.5 text-red-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-white truncate">
            {presenter?.username || 'Yayın'} Ekranı
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMinimized((prev) => !prev)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
            title={minimized ? 'Genişlet' : 'Küçült'}
          >
            {minimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={() => selectChannel(connectedVoiceChannelId)}
            className="px-2 py-0.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 text-[10px] font-semibold transition"
            title="Ses Odasına Dön"
          >
            Odaya Dön
          </button>
          <button
            type="button"
            onClick={() => setDismissedStreamKey(activeStreamKey)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
            title="Kapat"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {!minimized && (
        <div className="aspect-video bg-black relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        </div>
      )}
    </div>
  );
};
