import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Hand, Radio } from 'lucide-react';
import { AvatarView } from './AvatarView';

interface OverlaySpeaker {
  id: string;
  username: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHandRaised?: boolean;
}

export const SpeakersOverlay: React.FC = () => {
  const [speakers, setSpeakers] = useState<OverlaySpeaker[]>([]);
  const [inVoice, setInVoice] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ speakers: OverlaySpeaker[]; inVoice: boolean }>('overlay-speakers-update', (event) => {
          setSpeakers(event.payload.speakers || []);
          setInVoice(Boolean(event.payload.inVoice));
        })
      )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-[#0c111e]/90 text-white flex flex-col select-none overflow-hidden border border-white/15">
      <div
        data-tauri-drag-region
        className="px-3 py-1.5 bg-white/5 border-b border-white/10 flex items-center justify-between cursor-move"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400">
          <Radio className="w-3.5 h-3.5" />
          <span>Çakma Overlay</span>
        </div>
        <span className="text-[10px] text-white/40">{speakers.length} kişi</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!inVoice || speakers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-white/40 text-center px-2">
            Ses odasında aktif konuşmacı bekleniyor...
          </div>
        ) : (
          speakers.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition ${
                s.isSpeaking
                  ? 'bg-emerald-500/20 border-emerald-400/60 shadow-sm shadow-emerald-500/20'
                  : 'bg-white/5 border-white/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 flex items-center justify-center text-[10px] shrink-0">
                  <AvatarView avatar={s.avatar} alt={s.username} fallback="👤" className="w-full h-full object-cover" />
                </div>
                <span className={`text-xs truncate ${s.isSpeaking ? 'font-bold text-emerald-300' : 'text-white/80'}`}>
                  {s.username}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.isHandRaised && <Hand className="w-3 h-3 text-amber-400" />}
                {s.isMuted ? (
                  <MicOff className="w-3 h-3 text-red-400" />
                ) : (
                  <Mic className={`w-3 h-3 ${s.isSpeaking ? 'text-emerald-400' : 'text-white/40'}`} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
