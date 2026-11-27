import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Hand,
  Radio,
  Headphones,
  X,
  VolumeX,
  Volume2,
  Lock,
  Unlock,
  PhoneOff,
  Minimize2,
  Maximize2,
  MessageSquare,
  Send,
  Hash,
} from 'lucide-react';
import { AvatarView } from './AvatarView';

interface OverlaySpeaker {
  id: string;
  username: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened?: boolean;
  isHandRaised?: boolean;
  volume?: number;
}

interface OverlayVoiceChannel {
  id: string;
  name: string;
  userCount: number;
}

interface OverlayRecentMessage {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

interface OverlayPayload {
  speakers: OverlaySpeaker[];
  voiceChannels?: OverlayVoiceChannel[];
  recentMessages?: OverlayRecentMessage[];
  activeChatName?: string;
  inVoice: boolean;
  channelId?: string;
  channelName?: string;
  ping?: number;
  isMuted?: boolean;
  isDeafened?: boolean;
}

export const SpeakersOverlay: React.FC = () => {
  const [speakers, setSpeakers] = useState<OverlaySpeaker[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<OverlayVoiceChannel[]>([]);
  const [recentMessages, setRecentMessages] = useState<OverlayRecentMessage[]>([]);
  const [activeChatName, setActiveChatName] = useState<string>('');
  const [currentChannelId, setCurrentChannelId] = useState<string>('');
  const [inVoice, setInVoice] = useState(false);
  const [channelName, setChannelName] = useState<string>('');
  const [ping, setPing] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeTab, setActiveTab] = useState<'speakers' | 'channels' | 'chat'>('speakers');
  const [expandedSpeakerId, setExpandedSpeakerId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [msgToast, setMsgToast] = useState<{ author: string; content: string } | null>(null);
  const lastSeenMsgIdRef = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const [isClickThrough, setIsClickThrough] = useState<boolean>(() => {
    try { return localStorage.getItem('dc_overlay_locked') === '1'; } catch { return false; }
  });
  const [isCompactHud, setIsCompactHud] = useState(false);
  const [interactiveBanner, setInteractiveBanner] = useState(false);
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
    let toastTimer: number | null = null;
    let unlisten: (() => void) | null = null;
    let unlistenLock: (() => void) | null = null;
    let unlistenOpacity: (() => void) | null = null;
    let unlistenInteractive: (() => void) | null = null;

    import('@tauri-apps/api/core')
      .then(({ invoke }) => {
        const corner = localStorage.getItem('dc_overlay_corner') || 'top-left';
        invoke('position_overlay_window', { corner }).catch(() => {});
        if (isClickThrough) {
          invoke('set_overlay_ignore_cursor', { ignore: true }).catch(() => {});
        }
      })
      .catch(() => {});

    import('@tauri-apps/api/event')
      .then(async ({ listen, emit }) => {
        unlisten = await listen<OverlayPayload>('overlay-speakers-update', (event) => {
          const p = event.payload;
          setSpeakers(p.speakers || []);
          setVoiceChannels(p.voiceChannels || []);
          const incomingMsgs = p.recentMessages || [];
          setRecentMessages(incomingMsgs);
          setActiveChatName(p.activeChatName || '');
          setCurrentChannelId(p.channelId || '');
          setInVoice(Boolean(p.inVoice));
          setChannelName(p.channelName || '');
          setPing(p.ping || 0);
          setIsMuted(Boolean(p.isMuted));
          setIsDeafened(Boolean(p.isDeafened));

          const newest = incomingMsgs[incomingMsgs.length - 1];
          if (newest && newest.id !== lastSeenMsgIdRef.current) {
            const hadPrev = lastSeenMsgIdRef.current !== null;
            lastSeenMsgIdRef.current = newest.id;
            if (hadPrev && activeTabRef.current !== 'chat' && newest.content?.trim()) {
              setMsgToast({ author: newest.author, content: newest.content });
              if (toastTimer) window.clearTimeout(toastTimer);
              toastTimer = window.setTimeout(() => setMsgToast(null), 5000);
            }
          }
        });
        unlistenLock = await listen<boolean>('overlay-lock-changed', (event) => {
          setIsClickThrough(Boolean(event.payload));
        });
        unlistenInteractive = await listen<boolean>('overlay-interactive-changed', (event) => {
          setInteractiveBanner(Boolean(event.payload));
        });
        unlistenOpacity = await listen<number>('overlay-opacity-changed', (event) => {
          const val = Number(event.payload);
          if (Number.isFinite(val)) {
            setOverlayOpacity(Math.min(100, Math.max(30, val)));
          }
        });
        await emit('overlay-ready');
      })
      .catch(() => {});

    return () => {
      if (toastTimer) window.clearTimeout(toastTimer);
      if (unlisten) unlisten();
      if (unlistenLock) unlistenLock();
      if (unlistenOpacity) unlistenOpacity();
      if (unlistenInteractive) unlistenInteractive();
    };
  }, []);

  const toggleCompactHud = () => {
    const next = !isCompactHud;
    setIsCompactHud(next);
    if (next) setActiveTab('speakers');
    import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke('resize_overlay_window', {
          width: next ? 250 : 310,
          height: next ? 130 : 320,
        })
      )
      .catch(() => {});
  };

  const toggleClickThrough = () => {
    const next = !isClickThrough;
    setIsClickThrough(next);
    try { localStorage.setItem('dc_overlay_locked', next ? '1' : '0'); } catch {}
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_overlay_ignore_cursor', { ignore: next }))
      .catch(() => {});
  };

  const emitAction = (eventName: string, payload?: unknown) => {
    import('@tauri-apps/api/event')
      .then(({ emit }) => emit(eventName, payload))
      .catch(() => {});
  };

  const handleSendQuickChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    emitAction('overlay-send-chat', { text });
    setChatInput('');
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
          {interactiveBanner && !isClickThrough && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/35">
              Alt+O
            </span>
          )}
          <span className="text-[10px] text-white/45 font-mono">{speakers.length}</span>
          <button
            type="button"
            onClick={toggleCompactHud}
            className="p-0.5 rounded hover:bg-white/15 text-white/50 hover:text-white transition"
            title={isCompactHud ? 'Genişletilmiş HUD' : 'Kompakt HUD'}
          >
            {isCompactHud ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={toggleClickThrough}
            className={`p-0.5 rounded transition ${
              isClickThrough
                ? 'bg-amber-500/25 text-amber-300'
                : 'hover:bg-white/15 text-white/50 hover:text-white'
            }`}
            title={isClickThrough ? 'Kilidi Aç (Alt+O / Ctrl+Shift+O)' : 'Tıklama Geçirgenliğini Aç / Kilitle (Alt+O)'}
          >
            {isClickThrough ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
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

      {/* Live New Message Toast Banner */}
      {msgToast && (
        <button
          type="button"
          onClick={() => {
            setMsgToast(null);
            if (!isCompactHud && !isClickThrough) setActiveTab('chat');
          }}
          className="px-2.5 py-1.5 bg-indigo-500/25 border-b border-indigo-400/30 text-left flex items-center gap-1.5 text-[11px] hover:bg-indigo-500/35 transition shrink-0"
        >
          <MessageSquare className="w-3 h-3 text-indigo-300 shrink-0" />
          <span className="font-bold text-indigo-200 shrink-0">{msgToast.author}:</span>
          <span className="text-white/90 truncate">{msgToast.content}</span>
        </button>
      )}

      {/* Interactive Sub-Tabs */}
      {!isCompactHud && !isClickThrough && (
        <div className="px-2 py-1 bg-white/[0.02] border-b border-white/10 flex items-center gap-1 shrink-0 text-[10px]">
          <button
            type="button"
            onClick={() => setActiveTab('speakers')}
            className={`flex-1 py-1 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
              activeTab === 'speakers' ? 'bg-emerald-500/20 text-emerald-200' : 'text-white/55 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Ses ({speakers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('channels')}
            className={`flex-1 py-1 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
              activeTab === 'channels' ? 'bg-cyan-500/20 text-cyan-200' : 'text-white/55 hover:text-white hover:bg-white/5'
            }`}
          >
            <Hash className="w-3 h-3" />
            <span>Odalar ({voiceChannels.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-1 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
              activeTab === 'chat' ? 'bg-indigo-500/20 text-indigo-200' : 'text-white/55 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Sohbet</span>
          </button>
        </div>
      )}

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {activeTab === 'channels' && !isCompactHud && !isClickThrough ? (
          voiceChannels.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[11px] text-white/45 text-center px-3">
              Sunucuda görüntülenecek ses kanalı yok.
            </div>
          ) : (
            voiceChannels.map((ch) => {
              const isCurr = ch.id === currentChannelId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => emitAction('overlay-switch-voice-channel', { channelId: ch.id })}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-left transition ${
                    isCurr
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-white/[0.04] border-white/[0.06] text-white/80 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs font-medium truncate flex items-center gap-1.5">
                    <Volume2 className="w-3 h-3 shrink-0 text-white/50" />
                    <span className="truncate">{ch.name}</span>
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/35 text-white/70">
                    {ch.userCount}
                  </span>
                </button>
              );
            })
          )
        ) : activeTab === 'chat' && !isCompactHud && !isClickThrough ? (
          <div className="h-full flex flex-col gap-1.5">
            {activeChatName && (
              <div className="text-[10px] text-white/45 px-1 truncate">#{activeChatName}</div>
            )}
            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
              {recentMessages.length === 0 ? (
                <div className="text-[11px] text-white/40 text-center py-4">Henüz mesaj yok.</div>
              ) : (
                recentMessages.slice(-8).map((m) => (
                  <div key={m.id} className="px-2 py-1 rounded-lg bg-white/[0.04] text-[11px] leading-snug">
                    <span className="font-semibold text-indigo-300">{m.author}: </span>
                    <span className="text-white/85 break-words">{m.content || '(Ek/Medya)'}</span>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleSendQuickChat} className="flex items-center gap-1 pt-1 shrink-0">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Hızlı yanıt gönder..."
                className="flex-1 bg-black/45 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition"
                title="Gönder"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        ) : !inVoice || speakers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[11px] text-white/45 text-center px-3 gap-1.5">
            <Radio className="w-5 h-5 text-white/25" />
            <span>Ses odasına katıldığınızda konuşanlar burada görünür.</span>
          </div>
        ) : (
          (isCompactHud ? speakers.filter((s) => s.isSpeaking).slice(0, 3) : speakers).map((s) => {
            const isExpanded = !isClickThrough && !isCompactHud && expandedSpeakerId === s.id;
            return (
              <div
                key={s.id}
                className={`rounded-xl border transition-all ${
                  s.isSpeaking
                    ? 'bg-emerald-500/20 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-white/[0.04] border-white/[0.06]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedSpeakerId((prev) => (prev === s.id ? null : s.id))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-left"
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
                </button>
                {isExpanded && (
                  <div className="px-2.5 pb-2 pt-0.5 flex items-center gap-2 text-[10px] text-white/70">
                    <span>Ses: %{s.volume ?? 100}</span>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={s.volume ?? 100}
                      onChange={(e) =>
                        emitAction('overlay-set-user-volume', {
                          userId: s.id,
                          volume: Number(e.target.value),
                        })
                      }
                      className="flex-1 h-1 accent-emerald-400 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            );
          })
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
          {inVoice && (
            <button
              type="button"
              onClick={() => emitAction('overlay-leave-voice')}
              className="p-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 transition"
              title="Ses Kanalından Ayrıl"
            >
              <PhoneOff className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
