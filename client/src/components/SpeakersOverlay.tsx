import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Hand, Radio, Headphones, X, VolumeX } from 'lucide-react';
import { AvatarView } from './AvatarView';

interface OverlaySpeaker {
  id: string;
  username: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened?: boolean;
  isHandRaised?: boolean;
}

interface OverlayPayload {
  speakers: OverlaySpeaker[];
  inVoice: boolean;
  channelName?: string;
  ping?: number;
  isMuted?: boolean;
  isDeafened?: boolean;
}

export const SpeakersOverlay: React.FC = () => {
  const [speakers, setSpeakers] = useState<OverlaySpeaker[]>([]);
  const [inVoice, setInVoice] = useState(false);
  const [channelName, setChannelName] = useState<string>('');
  const [ping, setPing] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
    const saved = Number(localStorage.getItem('dc_overlay_opacity') || '92');
    return Number.isFinite(saved) ? Math.min(100, Math.max(30, saved)) : 92;
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'dc_overlay_opacity') {
        const next = Number(e.newValue || '92');
        if (Number.isFinite(next)) {
          setOverlayOpacity(Math.min(100, Math.max(30, next)));
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import('@tauri-apps/api/event')
      .then(async ({ listen, emit }) => {
        unlisten = await listen<OverlayPayload>('overlay-speakers-update', (event) => {
          setSpeakers(event.payload.speakers || []);
          setInVoice(Boolean(event.payload.inVoice));
          setChannelName(event.payload.channelName || '');
          setPing(event.payload.ping || 0);
          setIsMuted(Boolean(event.payload.isMuted));
          setIsDeafened(Boolean(event.payload.isDeafened));
        });
        await emit('overlay-ready');
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const emitAction = (eventName: string) => {
    import('@tauri-apps/api/event')
      .then(({ emit }) => emit(eventName))
      .catch(() => {});
  };

  return (
    <div
      style={{ opacity: overlayOpacity / 100 }}
      className="h-screen w-screen bg-[#0b0d14] text-white flex flex-col select-none overflow-hidden border border-white/15 transition-opacity duration-200"
    >
      {/* Draggable Header */}
      <div
        data-tauri-drag-region
        className="px-3 py-2 bg-white/[0.05] border-b border-white/10 flex items-center justify-between gap-2 cursor-move shrink-0"
      >
        <div data-tauri-drag-region className="flex items-center gap-1.5 min-w-0">
          <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span data-tauri-drag-region className="text-[11px] font-bold text-white truncate">
            {inVoice && channelName ? channelName : 'Çakma Overlay'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {inVoice && ping > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              {ping}ms
            </span>
          )}
          <span className="text-[10px] text-white/45 font-mono">{speakers.length}</span>
          <button
            type="button"
            onClick={() => emitAction('overlay-close-requested')}
            className="p-0.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition"
            title="Overlay'i Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Speakers List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!inVoice || speakers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[11px] text-white/45 text-center px-3 gap-1.5">
            <Radio className="w-5 h-5 text-white/25" />
            <span>Ses odasına katıldığınızda konuşanlar burada görünür.</span>
          </div>
        ) : (
          speakers.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all ${
                s.isSpeaking
                  ? 'bg-emerald-500/20 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  : 'bg-white/[0.04] border-white/[0.06]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-5 h-5 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-[10px] shrink-0 ${
                    s.isSpeaking ? 'ring-2 ring-emerald-400' : ''
                  }`}
                >
                  <AvatarView avatar={s.avatar} alt={s.username} fallback="👤" className="w-full h-full object-cover" />
                </div>
                <span className={`text-xs truncate ${s.isSpeaking ? 'font-bold text-emerald-300' : 'text-white/85'}`}>
                  {s.username}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.isHandRaised && <Hand className="w-3 h-3 text-amber-400" />}
                {s.isDeafened ? (
                  <VolumeX className="w-3 h-3 text-rose-400" />
                ) : s.isMuted ? (
                  <MicOff className="w-3 h-3 text-rose-400" />
                ) : (
                  <Mic className={`w-3 h-3 ${s.isSpeaking ? 'text-emerald-400' : 'text-white/40'}`} />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Audio Controls Footer */}
      <div className="px-2.5 py-1.5 border-t border-white/10 bg-white/[0.03] flex items-center justify-between gap-2 shrink-0">
        <span className="text-[10px] text-white/40">Hızlı Kontrol</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => emitAction('overlay-toggle-mute')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition ${
              isMuted ? 'bg-rose-500/25 text-rose-300' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
            title="Mikrofonu Aç/Kapat"
          >
            {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            <span>{isMuted ? 'Susturuldu' : 'Mikrofon'}</span>
          </button>
          <button
            type="button"
            onClick={() => emitAction('overlay-toggle-deafen')}
            className={`p-1 rounded-lg transition ${
              isDeafened ? 'bg-rose-500/25 text-rose-300' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
            title="Sağırlaştır / Aç"
          >
            <Headphones className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
