import React from 'react';
import { X, Headphones, Compass, RotateCcw } from 'lucide-react';
import { AvatarView } from './AvatarView';
import { useSocket } from '../context/SocketContext';
import { User } from '../types';

interface SpatialAudioModalProps {
  participants: User[];
  onClose: () => void;
}

export const SpatialAudioModal: React.FC<SpatialAudioModalProps> = ({ participants, onClose }) => {
  const { currentUser, userPans, setUserPan, setUserVolume } = useSocket();

  // Filter out self
  const remoteParticipants = participants.filter((p) => p.id !== currentUser?.id);

  const handlePanChange = (userId: string, panValue: number) => {
    // panValue between -1.0 (Full Left) and 1.0 (Full Right)
    setUserPan(userId, panValue);
  };

  const handleReset = () => {
    remoteParticipants.forEach((p) => {
      setUserPan(p.id, 0);
      setUserVolume(p.id, 100);
    });
  };

  const handleStereoSpread = () => {
    const total = remoteParticipants.length;
    if (total === 0) return;
    remoteParticipants.forEach((p, idx) => {
      // spread evenly between -0.8 and +0.8
      const pan = total === 1 ? 0 : -0.8 + (idx / (total - 1)) * 1.6;
      setUserPan(p.id, Number(pan.toFixed(2)));
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-xl bg-[#12131a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                3D Konumsal Ses (Spatial Stereo Audio)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                  TeamSpeak 3D
                </span>
              </h3>
              <p className="text-[11px] text-white/50">
                Odadaki kişilerin sesini kulaklığınızın soluna veya sağına konumlandırın
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Virtual Radar Display */}
          <div className="relative w-full h-44 rounded-2xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/10 flex items-center justify-center overflow-hidden">
            {/* Radar circles */}
            <div className="absolute w-36 h-36 rounded-full border border-cyan-500/20" />
            <div className="absolute w-24 h-24 rounded-full border border-cyan-500/20" />
            <div className="absolute w-full h-[1px] bg-white/10" />
            <div className="absolute h-full w-[1px] bg-white/10" />

            {/* Left / Right Indicators */}
            <span className="absolute left-3 top-3 text-[10px] font-bold text-cyan-400/80">◀ SOL (L)</span>
            <span className="absolute right-3 top-3 text-[10px] font-bold text-cyan-400/80">SAĞ (R) ▶</span>

            {/* Listener at Center */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-lg shadow-cyan-500/30 text-lg">
                <Headphones className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-cyan-300 mt-1">Sen (Dinleyici)</span>
            </div>

            {/* Participant Dots on Radar */}
            {remoteParticipants.map((p) => {
              const currentPan = userPans[p.id] ?? 0;
              // Map -1 to 1 to -120px to +120px
              const xOffset = currentPan * 120;
              return (
                <div
                  key={p.id}
                  style={{ transform: `translate(${xOffset}px, -20px)` }}
                  className="absolute z-20 flex flex-col items-center transition-transform duration-150"
                >
                  <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-cyan-400 text-white flex items-center justify-center text-xs shadow-md overflow-hidden">
                    <AvatarView avatar={p.avatar} alt={p.username} fallback="👤" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[9px] font-semibold text-white/80 bg-black/60 px-1 rounded truncate max-w-[60px]">
                    {p.username}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleStereoSpread}
              className="flex-1 py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <span>Otomatik Dağıt (Stereo Spread)</span>
            </button>
            <button
              onClick={handleReset}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sıfırla</span>
            </button>
          </div>

          {/* Per-User Pan Sliders */}
          <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
            {remoteParticipants.length === 0 ? (
              <p className="text-center text-xs text-white/40 py-4">
                Odadaki diğer kullanıcıların sesini konumlandırmak için odada en az bir kişi daha olmalıdır.
              </p>
            ) : (
              remoteParticipants.map((p) => {
                const currentPan = userPans[p.id] ?? 0;
                const panLabel =
                  currentPan < -0.1
                    ? `%${Math.round(Math.abs(currentPan) * 100)} Sol`
                    : currentPan > 0.1
                    ? `%${Math.round(currentPan * 100)} Sağ`
                    : 'Merkez';

                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center gap-3"
                  >
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-sm shrink-0 overflow-hidden">
                      <AvatarView avatar={p.avatar} alt={p.username} fallback="👤" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-white truncate">{p.username}</span>
                        <span className="text-[10px] font-mono text-cyan-300 font-bold">{panLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40">L</span>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.05"
                          value={currentPan}
                          onChange={(e) => handlePanChange(p.id, parseFloat(e.target.value))}
                          className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] text-white/40">R</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
