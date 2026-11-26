import React, { useEffect, useState } from 'react';
import { Captions, Download, Gamepad2, Languages, Mic, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { authFetch } from '../../utils/authFetch';
import { downloadTextFile } from '../../utils/chatExportAndFilters';
import { t, type AppLanguage } from '../../utils/i18n';
import {
  formatCaptionBadge,
  formatCaptionTranscriptMarkdown,
  shouldTranslateCaption,
  type CaptionLangCode,
  type CaptionSourceType,
  type LiveCaptionEntry,
} from '../../utils/liveCaptionHelpers';

interface LiveCaptionsOverlayProps {
  enabled: boolean;
  channelId: string;
  channelName: string;
  activeStream?: MediaStream | null;
  streamLabel?: string;
  hasActiveStream?: boolean;
  onClose: () => void;
}

const LANG_MAP: Record<AppLanguage, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
  ru: 'ru-RU',
  fr: 'fr-FR',
};

const LANG_CHOICES: Array<{ code: CaptionLangCode; label: string }> = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'ru', label: 'RU' },
  { code: 'fr', label: 'FR' },
];

export const LiveCaptionsOverlay: React.FC<LiveCaptionsOverlayProps> = ({
  enabled,
  channelId,
  channelName,
  activeStream,
  streamLabel,
  hasActiveStream = false,
  onClose,
}) => {
  const { socket, currentServerHost, currentUser, language } = useSocket();
  const [lines, setLines] = useState<LiveCaptionEntry[]>([]);
  const [interimText, setInterimText] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [sourceMode, setSourceMode] = useState<CaptionSourceType>('user');
  const [listenLang, setListenLang] = useState<CaptionLangCode>(language);
  const [translateTarget, setTranslateTarget] = useState<CaptionLangCode | 'off'>('off');
  const [sourceHint, setSourceHint] = useState<string | null>(null);

  // Switch back to user mic if active stream ends while in stream mode
  useEffect(() => {
    if (!hasActiveStream && sourceMode === 'stream') {
      setSourceMode('user');
      setSourceHint(null);
    }
  }, [hasActiveStream, sourceMode]);

  // Listen for live captions spoken/translated by other users in the same voice channel
  useEffect(() => {
    if (!enabled || !socket) return;

    const handleRemoteCaption = (payload: Partial<LiveCaptionEntry> & { channelId?: string }) => {
      if (payload?.channelId && payload.channelId !== channelId) return;
      const text = String(payload?.text || '').trim();
      if (!text) return;
      const incomingId = String(payload?.id || `rem-${Date.now()}`);
      const incoming: LiveCaptionEntry = {
        id: incomingId,
        time:
          payload?.time ||
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: String(payload?.author || 'Katılımcı'),
        source: payload?.source === 'stream' ? 'stream' : 'user',
        sourceLabel: payload?.sourceLabel,
        text,
        translatedText: payload?.translatedText,
        sourceLang: String(payload?.sourceLang || 'en'),
        targetLang: payload?.targetLang ?? null,
      };

      setLines((prev) => {
        if (prev.some((x) => x.id === incomingId)) return prev;
        return [...prev.slice(-99), incoming];
      });

      // Local translation fallback if viewer requested a target language and speaker didn't send it
      const viewerTarget = translateTarget === 'off' ? null : translateTarget;
      const needsViewerTranslate =
        viewerTarget &&
        (!incoming.translatedText || incoming.targetLang !== viewerTarget) &&
        shouldTranslateCaption(incoming.text, incoming.sourceLang, viewerTarget);

      if (needsViewerTranslate) {
        void (async () => {
          try {
            const res = await authFetch(currentServerHost, '/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: incoming.text,
                sourceLang: incoming.sourceLang,
                targetLang: viewerTarget,
              }),
            });
            const data = await res.json();
            if (data?.ok && typeof data.translatedText === 'string' && data.translatedText.trim()) {
              setLines((prev) =>
                prev.map((item) =>
                  item.id === incomingId
                    ? { ...item, translatedText: data.translatedText, targetLang: viewerTarget }
                    : item
                )
              );
            }
          } catch {}
        })();
      }
    };

    socket.on('voice_caption_received', handleRemoteCaption);
    return () => {
      socket.off('voice_caption_received', handleRemoteCaption);
    };
  }, [enabled, socket, channelId, translateTarget, currentServerHost]);

  // Speech recognition loop for local mic or stream/game audio track
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;
    if (!SpeechRecCtor) {
      setUnsupported(true);
      return;
    }

    setUnsupported(false);
    setSourceHint(null);
    let stopped = false;
    const rec = new SpeechRecCtor();
    rec.lang = LANG_MAP[listenLang] || 'tr-TR';
    rec.continuous = true;
    rec.interimResults = true;

    const streamAudioTrack =
      sourceMode === 'stream' ? activeStream?.getAudioTracks()?.[0] || null : null;

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = String(res?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (res.isFinal) {
          const entryId = `cap-${Date.now()}-${i}`;
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const targetCode = translateTarget === 'off' ? null : translateTarget;
          const entry: LiveCaptionEntry = {
            id: entryId,
            time: timeStr,
            author: currentUser?.username || 'Ben',
            source: sourceMode,
            sourceLabel: sourceMode === 'stream' ? streamLabel : undefined,
            text: transcript,
            sourceLang: listenLang,
            targetLang: targetCode,
          };
          setLines((prev) => [...prev.slice(-99), entry]);

          void (async () => {
            let finalTranslated: string | undefined;
            if (shouldTranslateCaption(transcript, listenLang, targetCode) && targetCode) {
              try {
                const resTx = await authFetch(currentServerHost, '/api/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    text: transcript,
                    sourceLang: listenLang,
                    targetLang: targetCode,
                  }),
                });
                const data = await resTx.json();
                if (
                  data?.ok &&
                  typeof data.translatedText === 'string' &&
                  data.translatedText.trim()
                ) {
                  finalTranslated = data.translatedText.trim();
                  setLines((prev) =>
                    prev.map((item) =>
                      item.id === entryId ? { ...item, translatedText: finalTranslated } : item
                    )
                  );
                }
              } catch {}
            }
            socket?.emit('voice_caption_emit', {
              channelId,
              id: entryId,
              source: entry.source,
              sourceLabel: entry.sourceLabel,
              text: entry.text,
              translatedText: finalTranslated,
              sourceLang: entry.sourceLang,
              targetLang: entry.targetLang,
              time: entry.time,
            });
          })();
        } else {
          interim = transcript;
        }
      }
      setInterimText(interim);
    };

    rec.onerror = () => {
      // ignore transient network/no-speech errors
    };
    rec.onend = () => {
      if (!stopped) {
        try {
          if (streamAudioTrack) rec.start(streamAudioTrack);
          else rec.start();
        } catch {
          try {
            rec.start();
          } catch {}
        }
      }
    };

    try {
      if (sourceMode === 'stream') {
        if (streamAudioTrack) {
          try {
            rec.start(streamAudioTrack);
          } catch {
            setSourceHint(
              'Tarayıcı doğrudan yayın ses izini desteklemiyor; hoparlör/mikrofon girişi üzerinden dinleniyor.'
            );
            rec.start();
          }
        } else {
          setSourceHint('Bu yayında ses izi paylaşılmamış; mikrofon/ortam sesi dinleniyor.');
          rec.start();
        }
      } else {
        rec.start();
      }
    } catch {
      setUnsupported(true);
    }

    return () => {
      stopped = true;
      try {
        rec.stop();
      } catch {}
      setInterimText('');
    };
  }, [
    enabled,
    listenLang,
    translateTarget,
    sourceMode,
    activeStream,
    streamLabel,
    channelId,
    socket,
    currentServerHost,
    currentUser?.username,
  ]);

  if (!enabled) return null;

  const recentLines = lines.slice(-4);

  const handleDownloadTranscript = () => {
    const mdContent = formatCaptionTranscriptMarkdown(channelName, lines);
    downloadTextFile(
      `${channelName.replace(/[^a-zA-Z0-9_-]/g, '_')}-altyazi.md`,
      mdContent,
      'text/markdown;charset=utf-8'
    );
  };

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[94vw] max-w-2xl px-4 py-3 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 shadow-2xl text-white space-y-2.5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 font-bold text-sky-300 mr-1">
            <Captions className="w-3.5 h-3.5" />
            <span>{t(language, 'liveCaptions')}</span>
          </span>

          {/* Audio Source Toggle */}
          <div className="inline-flex items-center rounded-lg bg-white/[0.06] border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setSourceMode('user')}
              className={`px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition ${
                sourceMode === 'user' ? 'bg-sky-500 text-white' : 'text-white/65 hover:text-white'
              }`}
              title="Kendi mikrofon konuşmalarını yazıya dök"
            >
              <Mic className="w-3 h-3" />
              <span>Mikrofon</span>
            </button>
            <button
              type="button"
              disabled={!hasActiveStream}
              onClick={() => {
                setSourceMode('stream');
                setListenLang('en');
                if (language !== 'en') {
                  setTranslateTarget(language);
                }
              }}
              className={`px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition disabled:opacity-35 disabled:cursor-not-allowed ${
                sourceMode === 'stream'
                  ? 'bg-emerald-500 text-white'
                  : 'text-white/65 hover:text-white'
              }`}
              title={
                hasActiveStream
                  ? 'Yayındaki oyun/uygulama sesini tanı ve çevir'
                  : 'Bu mod için odada aktif ekran yayını olmalıdır'
              }
            >
              <Gamepad2 className="w-3 h-3" />
              <span>Yayın Sesi</span>
            </button>
          </div>

          {/* Listen Language & Auto-Translate Selectors */}
          <select
            value={listenLang}
            onChange={(e) => setListenLang(e.target.value as CaptionLangCode)}
            aria-label="Dinlenen dil"
            className="bg-white/10 border border-white/15 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-white outline-none focus:border-sky-400 cursor-pointer"
          >
            {LANG_CHOICES.map((lc) => (
              <option key={lc.code} value={lc.code} className="bg-[#12131a] text-white">
                Dinle: {lc.label}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1 bg-white/10 border border-white/15 rounded-lg px-1.5 py-0.5">
            <Languages className="w-3 h-3 text-emerald-300 shrink-0" />
            <select
              value={translateTarget}
              onChange={(e) => setTranslateTarget(e.target.value as CaptionLangCode | 'off')}
              aria-label="Çeviri hedef dili"
              className="bg-transparent text-[11px] font-semibold text-white outline-none cursor-pointer"
            >
              <option value="off" className="bg-[#12131a] text-white">
                Çeviri Yok
              </option>
              {LANG_CHOICES.map((lc) => (
                <option key={lc.code} value={lc.code} className="bg-[#12131a] text-white">
                  → {lc.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={handleDownloadTranscript}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40 transition"
          >
            <Download className="w-3 h-3" />
            <span>Transkript İndir (.md)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
            title="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {sourceHint && (
        <div className="text-[11px] text-amber-200/85 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2.5 py-1">
          {sourceHint}
        </div>
      )}

      {unsupported ? (
        <div className="text-xs text-amber-200/90">
          Bu tarayıcı/WebView ortamı Canlı Altyazı (Web Speech API) desteklemiyor.
        </div>
      ) : recentLines.length === 0 && !interimText ? (
        <div className="text-xs text-white/45 italic">
          {sourceMode === 'stream'
            ? 'Yayın/oyun sesi algılandığında çevirili altyazılar burada görünür...'
            : 'Odada konuşma algılandığında konuşmacı adıyla birlikte burada görünür...'}
        </div>
      ) : (
        <div className="space-y-1.5 text-xs max-h-40 overflow-y-auto pr-1">
          {recentLines.map((l) => {
            const badge = formatCaptionBadge(l);
            return (
              <div
                key={l.id}
                className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-[11px] font-mono text-white/40 shrink-0">[{l.time}]</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                      l.source === 'stream'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-400/25'
                    }`}
                  >
                    {badge}
                  </span>
                  <span className="text-white font-medium leading-snug">
                    {l.translatedText || l.text}
                  </span>
                </div>
                {l.translatedText && (
                  <div className="text-[11px] text-white/50 italic mt-0.5 pl-1">
                    {l.sourceLang.toUpperCase()}: {l.text}
                  </div>
                )}
              </div>
            );
          })}
          {interimText && (
            <div className="text-white/60 italic px-1">
              {sourceMode === 'stream'
                ? `🎮 ${streamLabel || 'Yayın'}: ${interimText}...`
                : `👤 ${currentUser?.username || 'Ben'}: ${interimText}...`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
