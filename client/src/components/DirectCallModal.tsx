import React from 'react';
import { useSocket } from '../context/SocketContext';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  Volume2,
} from 'lucide-react';

export const DirectCallModal: React.FC = () => {
  const {
    directCall,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
  } = useSocket();

  if (!directCall) return null;

  const { partner, status, durationSeconds } = directCall;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed top-4 right-6 z-50 animate-fade-in pointer-events-auto select-none">
      <div className="ios-glass border border-white/20 bg-neutral-900/90 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl flex items-center gap-4 min-w-[320px]">
        {/* Partner Avatar with animation */}
        <div className="relative shrink-0">
          <div
            className={`w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl transition-all ${
              status === 'incoming' || status === 'calling'
                ? 'animate-bounce'
                : partner.isSpeaking
                ? 'ios-halo'
                : ''
            }`}
          >
            {partner.avatar || '👤'}
          </div>
          {status === 'connected' && (
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black" />
          )}
        </div>

        {/* Call Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-bold text-sm text-white truncate">{partner.username}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono">
              1-e-1 Sesli
            </span>
          </div>

          <div className="text-xs text-white/60 flex items-center gap-1.5">
            {status === 'incoming' && (
              <span className="text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                <Phone className="w-3 h-3" />
                Gelen Sesli Arama...
              </span>
            )}
            {status === 'calling' && (
              <span className="text-blue-400 font-medium animate-pulse flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                Çalıyor...
              </span>
            )}
            {status === 'connected' && (
              <span className="font-mono text-emerald-400 text-xs font-semibold">
                🟢 {formatDuration(durationSeconds)}
              </span>
            )}
          </div>
        </div>

        {/* Control Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {status === 'incoming' && (
            <>
              <button
                onClick={declineDirectCall}
                className="w-10 h-10 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
                title="Reddet"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
              <button
                onClick={acceptDirectCall}
                className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition shadow-lg shadow-emerald-500/30 animate-pulse"
                title="Kabul Et"
              >
                <Phone className="w-4 h-4" />
              </button>
            </>
          )}

          {status === 'calling' && (
            <button
              onClick={endDirectCall}
              className="w-10 h-10 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
              title="Aramayı İptal Et"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          )}

          {status === 'connected' && (
            <>
              <button
                onClick={toggleMute}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                  isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={isMuted ? 'Mikrofonu Aç' : 'Sustur'}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                onClick={toggleDeafen}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                  isDeafened ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Kulaklığı Kapat'}
              >
                <Headphones className="w-4 h-4" />
              </button>

              <button
                onClick={endDirectCall}
                className="w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition shadow-lg shadow-red-500/30"
                title="Aramayı Sonlandır"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};