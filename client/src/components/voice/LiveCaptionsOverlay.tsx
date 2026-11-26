import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { downloadTextFile } from '../../utils/chatExportAndFilters';
import { t } from '../../utils/i18n';
import {
  type CaptionLangCode,
  type CaptionSourceType,
  type LiveCaptionEntry,
  detectSpokenLangHint,
  formatCaptionBadge,
  formatCaptionTranscriptMarkdown,
  shouldTranslateCaption,
  translateCaptionClientSide,
} from '../../utils/liveCaptionHelpers';

interface LiveCaptionsOverlayProps {
  enabled: boolean;
  channelId?: string | null;
  channelName?: string;
  activeStream?: MediaStream | null;
  streamLabel?: string;
  hasActiveStream?: boolean;
  onClose?: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: (track?: MediaStreamTrack) => void;
  stop: () => void;
}

type SpeechRecognitionCtorLike = new () => SpeechRecognitionInstanceLike;

interface ReceivedVoiceCaptionPayload {
  id?: string;
  channelId?: string;
  author?: string;
  source?: CaptionSourceType;
  sourceLabel?: string;
  text: string;
  translatedText?: string;
  sourceLang?: string;
  targetLang?: string | null;
  time?: string;
}

const LANG_MAP: Record<CaptionLangCode, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
  ru: 'ru-RU',
  fr: 'fr-FR',
};

const SUPPORTED_LANG_CODES = new Set<CaptionLangCode>(['tr', 'en', 'de', 'ru', 'fr']);

const TARGET_CHOICES: Array<{ code: 'off' | CaptionLangCode; label: string }> = [
  { code: 'off', label: 'Çeviri Yok' },
  { code: 'tr', label: '→ TR' },
  { code: 'en', label: '→ EN' },
  { code: 'de', label: '→ DE' },
  { code: 'ru', label: '→ RU' },
  { code: 'fr', label: '→ FR' },
];

const MAX_CAPTIONS = 60;

function isSupportedLangCode(lang: string | null | undefined): lang is CaptionLangCode {
  if (!lang) return false;
  return SUPPORTED_LANG_CODES.has(lang.toLowerCase() as CaptionLangCode);
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtorLike | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtorLike;
    webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export const LiveCaptionsOverlay: React.FC<LiveCaptionsOverlayProps> = ({
  enabled,
  channelId,
  channelName,
  activeStream,
  streamLabel,
  hasActiveStream = false,
  onClose,
}) => {
  const { socket, currentUser, language } = useSocket();
  const currentUserName =
    (typeof currentUser === 'string' ? currentUser : currentUser?.username)?.trim() ||
    'Kullanıcı';
  const defaultUiLang: CaptionLangCode = isSupportedLangCode(language) ? language : 'tr';

  const [sourceMode, setSourceMode] = useState<'mic' | 'stream'>('mic');
  const [autoRecLang, setAutoRecLang] = useState<CaptionLangCode>(defaultUiLang);
  const [detectedLangBadge, setDetectedLangBadge] = useState<string>(defaultUiLang);
  const [translateTarget, setTranslateTarget] = useState<'off' | CaptionLangCode>(defaultUiLang);
  const [interimText, setInterimText] = useState('');
  const [interimBadge, setInterimBadge] = useState('');
  const [captions, setCaptions] = useState<LiveCaptionEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isListening, setIsListening] = useState(false);

  const effectiveSourceMode: 'mic' | 'stream' =
    hasActiveStream && sourceMode === 'stream' ? 'stream' : 'mic';

  const targetRef = useRef(translateTarget);
  const autoRecLangRef = useRef(autoRecLang);
  const sourceModeRef = useRef(effectiveSourceMode);
  const streamLabelRef = useRef(streamLabel);
  const channelIdRef = useRef(channelId);
  const currentUserRef = useRef(currentUserName);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    targetRef.current = translateTarget;
  }, [translateTarget]);

  useEffect(() => {
    autoRecLangRef.current = autoRecLang;
  }, [autoRecLang]);

  useEffect(() => {
    sourceModeRef.current = effectiveSourceMode;
  }, [effectiveSourceMode]);

  useEffect(() => {
    streamLabelRef.current = streamLabel;
  }, [streamLabel]);

  useEffect(() => {
    channelIdRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    currentUserRef.current = currentUserName;
  }, [currentUserName]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions.length, interimText]);

  const appendCaptionEntry = (entry: LiveCaptionEntry) => {
    seenIdsRef.current.add(entry.id);
    if (seenIdsRef.current.size > 200) {
      const oldest = seenIdsRef.current.values().next().value;
      if (oldest !== undefined) seenIdsRef.current.delete(oldest);
    }
    setCaptions((prev) => [...prev.slice(-(MAX_CAPTIONS - 1)), entry]);
  };

  useEffect(() => {
    if (!enabled || !socket) return;
    let mounted = true;

    const handleRemoteCaption = async (payload: ReceivedVoiceCaptionPayload) => {
      if (!mounted || !payload || !payload.text) return;
      if (
        payload.channelId &&
        channelIdRef.current &&
        payload.channelId !== channelIdRef.current
      ) {
        return;
      }

      const incomingId =
        payload.id || `remote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (seenIdsRef.current.has(incomingId)) return;

      const time =
        payload.time ||
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      const localTarget = targetRef.current;
      const hint = detectSpokenLangHint(payload.text);
      const initialLang = (payload.sourceLang || hint || 'auto').toLowerCase();

      const hasMatchingTranslation =
        localTarget !== 'off' &&
        Boolean(payload.translatedText) &&
        payload.targetLang === localTarget;

      const entry: LiveCaptionEntry = {
        id: incomingId,
        time,
        author: payload.author || 'Kullanıcı',
        source: payload.source === 'stream' ? 'stream' : 'user',
        sourceLabel: payload.sourceLabel,
        text: payload.text,
        translatedText: hasMatchingTranslation ? payload.translatedText : undefined,
        sourceLang: initialLang,
        targetLang: localTarget === 'off' ? null : localTarget,
      };
      appendCaptionEntry(entry);

      if (!hasMatchingTranslation && shouldTranslateCaption(payload.text, 'auto', localTarget)) {
        const res = await translateCaptionClientSide(payload.text, localTarget as CaptionLangCode);
        if (!mounted || !res) return;
        const resolvedLang = res.detectedLang || (initialLang !== 'auto' ? initialLang : 'auto');
        setCaptions((prev) =>
          prev.map((item) =>
            item.id === incomingId
              ? {
                  ...item,
                  sourceLang: resolvedLang,
                  translatedText: res.translatedText || undefined,
                }
              : item
          )
        );
      }
    };

    socket.on('voice_caption_received', handleRemoteCaption);
    return () => {
      mounted = false;
      socket.off('voice_caption_received', handleRemoteCaption);
    };
  }, [enabled, socket]);

  useEffect(() => {
    if (!enabled) {
      setIsListening(false);
      setInterimText('');
      setInterimBadge('');
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setErrorMsg('Bu tarayıcı Web Speech API canlı altyazıyı desteklemiyor.');
      setIsListening(false);
      return;
    }

    let cancelled = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANG_MAP[autoRecLang] || 'tr-TR';

    const startRecognition = () => {
      if (cancelled) return;
      try {
        const audioTrack =
          effectiveSourceMode === 'stream' ? activeStream?.getAudioTracks?.()[0] : undefined;
        if (audioTrack) {
          try {
            recognition.start(audioTrack);
            return;
          } catch {
            // Fallback to default audio input when MediaStreamTrack overload is unsupported
          }
        }
        recognition.start();
      } catch {
        // Ignore repeat start race
      }
    };

    recognition.onstart = () => {
      if (cancelled) return;
      setErrorMsg('');
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (cancelled) return;
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript || '';
        if (result?.isFinal) {
          finalChunk += transcript;
        } else {
          interimChunk += transcript;
        }
      }

      const cleanInterim = interimChunk.trim();
      if (cleanInterim) {
        const hint = detectSpokenLangHint(cleanInterim);
        if (hint) {
          setDetectedLangBadge(hint);
        }
        setInterimText(cleanInterim);
        setInterimBadge(hint || autoRecLangRef.current);
      }

      const finalText = finalChunk.trim();
      if (!finalText) return;

      setInterimText('');
      setInterimBadge('');

      const hint = detectSpokenLangHint(finalText);
      const initialDetected = hint || autoRecLangRef.current;
      if (hint) {
        setDetectedLangBadge(hint);
      }

      const target = targetRef.current;
      const sourceType: CaptionSourceType =
        sourceModeRef.current === 'stream' ? 'stream' : 'user';
      const cleanStreamLabel =
        sourceType === 'stream'
          ? String(streamLabelRef.current || '').trim() || undefined
          : undefined;
      const authorName = String(currentUserRef.current || '').trim() || 'Kullanıcı';
      const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const baseEntry: LiveCaptionEntry = {
        id: entryId,
        time,
        author: authorName,
        source: sourceType,
        sourceLabel: cleanStreamLabel,
        text: finalText,
        sourceLang: initialDetected,
        targetLang: target === 'off' ? null : target,
      };
      appendCaptionEntry(baseEntry);

      const processFinal = async () => {
        let resolvedLang: string = initialDetected;
        let translatedText: string | undefined;

        if (shouldTranslateCaption(finalText, 'auto', target)) {
          const translated = await translateCaptionClientSide(finalText, target as CaptionLangCode);
          if (cancelled) return;
          if (translated) {
            resolvedLang = translated.detectedLang || initialDetected;
            translatedText = translated.translatedText || undefined;
          }
        }

        if (cancelled) return;
        setDetectedLangBadge(resolvedLang);

        if (isSupportedLangCode(resolvedLang) && resolvedLang !== autoRecLangRef.current) {
          setAutoRecLang(resolvedLang);
        }

        setCaptions((prev) =>
          prev.map((item) =>
            item.id === entryId
              ? {
                  ...item,
                  sourceLang: resolvedLang,
                  translatedText,
                }
              : item
          )
        );

        if (socket && channelIdRef.current) {
          socket.emit('voice_caption_emit', {
            id: entryId,
            channelId: channelIdRef.current,
            source: sourceType,
            sourceLabel: cleanStreamLabel,
            text: finalText,
            translatedText,
            sourceLang: resolvedLang,
            targetLang: target === 'off' ? null : target,
            time,
          });
        }
      };

      void processFinal();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (cancelled) return;
      const err = event?.error || 'unknown';
      if (err === 'no-speech' || err === 'aborted') return;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setErrorMsg('Mikrofon/ses tanıma izni verilmedi.');
        setIsListening(false);
        return;
      }
      setErrorMsg(`Ses tanıma uyarısı: ${err}`);
    };

    recognition.onend = () => {
      if (cancelled) return;
      setIsListening(false);
      restartTimer = setTimeout(() => {
        if (!cancelled) {
          startRecognition();
        }
      }, 350);
    };

    startRecognition();

    return () => {
      cancelled = true;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onstart = null;
        recognition.stop();
      } catch {
        // Ignore cleanup stop errors
      }
    };
  }, [enabled, effectiveSourceMode, autoRecLang, activeStream, socket]);

  if (!enabled) return null;

  const handleSelectSource = (mode: 'mic' | 'stream') => {
    if (mode === 'stream' && !hasActiveStream) return;
    setSourceMode(mode);
    const nextDefaultLang: CaptionLangCode = mode === 'stream' ? 'en' : defaultUiLang;
    setAutoRecLang(nextDefaultLang);
    setDetectedLangBadge(nextDefaultLang);
  };

  const handleExportTranscript = () => {
    if (captions.length === 0) return;
    const md = formatCaptionTranscriptMarkdown(channelName || 'ses-odasi', captions);
    const safeName = (channelName || 'ses-odasi').replace(/[^a-zA-Z0-9_-]+/g, '-');
    downloadTextFile(`canli-altyazi-${safeName}-${Date.now()}.md`, md, 'text/markdown');
  };

  return (
    <div className="pointer-events-auto mx-auto mb-3 w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <span
              className={`h-2 w-2 rounded-full ${
                isListening ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {t(language, 'liveCaptions')}
          </span>

          <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => handleSelectSource('mic')}
              className={`rounded-md px-2 py-0.5 transition ${
                effectiveSourceMode === 'mic'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              🎤 Mikrofon
            </button>
            <button
              type="button"
              disabled={!hasActiveStream}
              onClick={() => handleSelectSource('stream')}
              title={
                hasActiveStream
                  ? `Aktif yayın (${streamLabel || 'Ekran/Oyun'}) sesini altyazıya çevir`
                  : 'Aktif ekran/oyun yayını yok'
              }
              className={`rounded-md px-2 py-0.5 transition ${
                effectiveSourceMode === 'stream'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-zinc-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
              }`}
            >
              🎮 Yayın Sesi
            </button>
          </div>

          <span
            className="rounded border border-indigo-400/30 bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-200"
            title="Konuşulan dil tarayıcıda/istemcide otomatik algılanır"
          >
            Oto ({detectedLangBadge.toUpperCase()})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="live-captions-target-lang">
            Hedef Çeviri Dili
          </label>
          <select
            id="live-captions-target-lang"
            value={translateTarget}
            onChange={(e) => setTranslateTarget(e.target.value as 'off' | CaptionLangCode)}
            className="rounded-lg border border-white/15 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-100 outline-none focus:border-indigo-400"
            title="Çevrilecek hedef dili seçin"
          >
            {TARGET_CHOICES.map((choice) => (
              <option key={choice.code} value={choice.code}>
                {choice.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportTranscript}
            disabled={captions.length === 0}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            title="Altyazı geçmişini Markdown (.md) olarak indir"
          >
            ⬇ .md
          </button>

          <button
            type="button"
            onClick={() => setCaptions([])}
            disabled={captions.length === 0}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            title="Altyazı geçmişini temizle"
          >
            Temizle
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-rose-500/20 hover:text-rose-200"
              title="Canlı altyazıyı kapat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
          {errorMsg}
        </div>
      )}

      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1 text-sm">
        {captions.length === 0 && !interimText && (
          <p className="py-2 text-center text-xs text-zinc-400">
            Konuşma veya yayın sesi bekleniyor... Dil istemcide otomatik algılanır.
          </p>
        )}

        {captions.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5"
          >
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-semibold ${
                    entry.source === 'stream' ? 'text-emerald-300' : 'text-indigo-300'
                  }`}
                >
                  {formatCaptionBadge(entry)}
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.2 text-[10px] uppercase text-zinc-300">
                  {entry.sourceLang}
                  {entry.translatedText && entry.targetLang ? ` → ${entry.targetLang}` : ''}
                </span>
              </div>
              <span className="tabular-nums text-[10px] text-zinc-500">{entry.time}</span>
            </div>

            {entry.translatedText ? (
              <div>
                <p className="text-[13px] font-medium leading-snug text-white">
                  {entry.translatedText}
                </p>
                <p className="mt-0.5 text-[11px] italic text-zinc-400">{entry.text}</p>
              </div>
            ) : (
              <p className="text-[13px] leading-snug text-zinc-100">{entry.text}</p>
            )}
          </div>
        ))}

        {interimText && (
          <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1.5">
            <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-indigo-300">
              <span>
                {formatCaptionBadge({
                  source: effectiveSourceMode === 'stream' ? 'stream' : 'user',
                  author: currentUserName,
                  sourceLabel: effectiveSourceMode === 'stream' ? streamLabel : undefined,
                })}
              </span>
              <span className="rounded bg-indigo-500/20 px-1 uppercase">
                Oto ({(interimBadge || detectedLangBadge).toUpperCase()})
              </span>
            </div>
            <p className="text-xs italic text-zinc-200">{interimText}...</p>
          </div>
        )}

        <div ref={listEndRef} />
      </div>
    </div>
  );
};

export default LiveCaptionsOverlay;
