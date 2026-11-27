import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { downloadTextFile } from '../../utils/chatExportAndFilters';
import { formatDigestAsMarkdown, summarizeConversationLocally } from '../../utils/clientSummarizer';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';
import {
  type CaptionLangCode,
  type CaptionSourceType,
  type LiveCaptionEntry,
  cleanWhisperTranscript,
  computeAudioRms,
  detectSpokenLangHint,
  downsampleTo16kHz,
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
  onPostMeetingSummary?: (markdown: string) => void;
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

type WhisperWorkerResponse =
  | { type: 'progress'; progress: number; status: string; file?: string }
  | { type: 'ready' }
  | { type: 'result'; id: string; text: string }
  | { type: 'error'; id?: string; message: string };

const LANG_MAP: Record<CaptionLangCode, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
  ru: 'ru-RU',
  fr: 'fr-FR',
};

const SUPPORTED_LANG_CODES = new Set<CaptionLangCode>(['tr', 'en', 'de', 'ru', 'fr']);

const BROWSER_LANG_CHOICES: Array<{ code: CaptionLangCode; label: string }> = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'ru', label: 'RU' },
  { code: 'fr', label: 'FR' },
];

const TARGET_CHOICES: Array<{ code: 'off' | CaptionLangCode; label: string }> = [
  { code: 'off', label: 'Çeviri Yok' },
  { code: 'tr', label: '→ TR' },
  { code: 'en', label: '→ EN' },
  { code: 'de', label: '→ DE' },
  { code: 'ru', label: '→ RU' },
  { code: 'fr', label: '→ FR' },
];

const MAX_CAPTIONS = 60;
const VAD_RMS_THRESHOLD = 0.012;
const VAD_SILENCE_FLUSH_MS = 650;
const VAD_MIN_SPEECH_MS = 350;
const VAD_MAX_SPEECH_MS = 4500;

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

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return win.AudioContext || win.webkitAudioContext || null;
}

export const LiveCaptionsOverlay: React.FC<LiveCaptionsOverlayProps> = ({
  enabled,
  channelId,
  channelName,
  activeStream,
  streamLabel,
  hasActiveStream = false,
  onPostMeetingSummary,
  onClose,
}) => {
  const { socket, currentUser, language } = useSocket();
  const currentUserName =
    (typeof currentUser === 'string' ? currentUser : currentUser?.username)?.trim() ||
    'Kullanıcı';
  const defaultUiLang: CaptionLangCode = isSupportedLangCode(language) ? language : 'tr';

  const [engineMode, setEngineMode] = useState<'whisper' | 'browser'>('whisper');
  const [sourceMode, setSourceMode] = useState<'mic' | 'stream'>('mic');
  const [browserLang, setBrowserLang] = useState<CaptionLangCode>(defaultUiLang);
  const [detectedLangBadge, setDetectedLangBadge] = useState<string>('auto');
  const [translateTarget, setTranslateTarget] = useState<'off' | CaptionLangCode>(defaultUiLang);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelProgress, setModelProgress] = useState(0);
  const [vadActive, setVadActive] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [captions, setCaptions] = useState<LiveCaptionEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isListening, setIsListening] = useState(false);

  const effectiveSourceMode: 'mic' | 'stream' =
    hasActiveStream && sourceMode === 'stream' ? 'stream' : 'mic';

  const targetRef = useRef(translateTarget);
  const browserLangRef = useRef(browserLang);
  const sourceModeRef = useRef(effectiveSourceMode);
  const streamLabelRef = useRef(streamLabel);
  const channelIdRef = useRef(channelId);
  const currentUserRef = useRef(currentUserName);
  const modelStatusRef = useRef(modelStatus);
  const isProcessingRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    targetRef.current = translateTarget;
  }, [translateTarget]);

  useEffect(() => {
    browserLangRef.current = browserLang;
  }, [browserLang]);

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
    modelStatusRef.current = modelStatus;
  }, [modelStatus]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [captions.length, interimText, vadActive]);

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

  // Client-side Whisper AI Web Worker + VAD audio capture
  useEffect(() => {
    if (!enabled || engineMode !== 'whisper') {
      return;
    }

    let cancelled = false;
    let worker: Worker | null = null;
    let audioContext: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let muteGain: GainNode | null = null;
    let ownedStream: MediaStream | null = null;

    const finalizeTranscription = (entryId: string, cleanedText: string) => {
      const hint = detectSpokenLangHint(cleanedText);
      const initialLang = hint || 'auto';
      const target = targetRef.current;
      const sourceType: CaptionSourceType =
        sourceModeRef.current === 'stream' ? 'stream' : 'user';
      const cleanStreamLabel =
        sourceType === 'stream'
          ? String(streamLabelRef.current || '').trim() || undefined
          : undefined;
      const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const entry: LiveCaptionEntry = {
        id: entryId,
        time,
        author: currentUserRef.current,
        source: sourceType,
        sourceLabel: cleanStreamLabel,
        text: cleanedText,
        sourceLang: initialLang,
        targetLang: target === 'off' ? null : target,
      };
      appendCaptionEntry(entry);

      const runTranslateAndEmit = async () => {
        let resolvedLang = initialLang;
        let translatedText: string | undefined;

        if (shouldTranslateCaption(cleanedText, 'auto', target)) {
          const res = await translateCaptionClientSide(cleanedText, target as CaptionLangCode);
          if (cancelled) return;
          if (res) {
            resolvedLang = res.detectedLang || initialLang;
            translatedText = res.translatedText || undefined;
          }
        }

        if (cancelled) return;
        setDetectedLangBadge(resolvedLang);

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
            text: cleanedText,
            translatedText,
            sourceLang: resolvedLang,
            targetLang: target === 'off' ? null : target,
            time,
          });
        }
      };

      void runTranslateAndEmit();
    };

    try {
      worker = new Worker(new URL('../../workers/whisperCaptionWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Worker başlatılamadı';
      Promise.resolve().then(() => {
        if (!cancelled) {
          setModelStatus('error');
          setErrorMsg(`AI Altyazı Worker hatası: ${msg}`);
        }
      });
      return;
    }

    worker.onmessage = (event: MessageEvent<WhisperWorkerResponse>) => {
      if (cancelled) return;
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'progress') {
        setModelStatus('loading');
        setModelProgress((prev) => (msg.progress > prev ? msg.progress : prev));
        return;
      }

      if (msg.type === 'ready') {
        setModelStatus('ready');
        setModelProgress(100);
        setErrorMsg('');
        setIsListening(true);
        return;
      }

      if (msg.type === 'error') {
        isProcessingRef.current = false;
        setVadActive(false);
        if (modelStatusRef.current !== 'ready') {
          setModelStatus('error');
          setIsListening(false);
        }
        setErrorMsg(`AI Altyazı hatası: ${msg.message}`);
        return;
      }

      if (msg.type === 'result') {
        isProcessingRef.current = false;
        setVadActive(false);
        const cleaned = cleanWhisperTranscript(msg.text || '');
        if (!cleaned) return;
        finalizeTranscription(msg.id, cleaned);
      }
    };

    Promise.resolve().then(() => {
      if (!cancelled) {
        setModelStatus('loading');
        setModelProgress(0);
        setErrorMsg('');
      }
    });
    worker.postMessage({ type: 'init' });

    const setupAudio = async () => {
      const AudioCtx = getAudioContextCtor();
      if (!AudioCtx) {
        setErrorMsg('Tarayıcı Web Audio API desteklemiyor.');
        return;
      }

      let captureStream: MediaStream;
      try {
        if (effectiveSourceMode === 'stream' && activeStream?.getAudioTracks?.().length) {
          // Wrap the existing stream track without taking ownership so cleanup never stops screen share audio
          captureStream = new MediaStream([activeStream.getAudioTracks()[0]]);
        } else {
          if (!navigator.mediaDevices?.getUserMedia) {
            setErrorMsg('Mikrofon erişimi için güvenli bağlantı (HTTPS veya localhost) gerekiyor.');
            return;
          }
          ownedStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          captureStream = ownedStream;
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Mikrofon veya yayın sesine erişilemedi.');
        }
        return;
      }

      if (cancelled) {
        ownedStream?.getTracks().forEach((track) => track.stop());
        return;
      }

      if (captureStream.getAudioTracks().length === 0) {
        setErrorMsg('Seçilen kaynakta ses izi (audio track) bulunamadı.');
        return;
      }

      audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {});
      }

      const sampleRate = audioContext.sampleRate || 48000;
      sourceNode = audioContext.createMediaStreamSource(captureStream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      sourceNode.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioContext.destination);

      let chunks: Float32Array[] = [];
      let speechMs = 0;
      let silenceMs = 0;
      let speechStarted = false;
      const frameMs = (4096 / sampleRate) * 1000;

      const flushBuffer = () => {
        const totalLength = chunks.reduce((acc, item) => acc + item.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const piece of chunks) {
          merged.set(piece, offset);
          offset += piece.length;
        }
        chunks = [];
        speechMs = 0;
        silenceMs = 0;
        speechStarted = false;

        if (isProcessingRef.current || !worker) {
          setVadActive(false);
          return;
        }

        const pcm16k = downsampleTo16kHz(merged, sampleRate);
        if (pcm16k.length < 1600) {
          setVadActive(false);
          return;
        }

        isProcessingRef.current = true;
        const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        worker.postMessage({ type: 'transcribe', id, audio: pcm16k }, [pcm16k.buffer]);
      };

      processor.onaudioprocess = (audioEvent) => {
        if (cancelled || modelStatusRef.current !== 'ready') return;
        const input = audioEvent.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input);
        const rms = computeAudioRms(copy);

        if (rms >= VAD_RMS_THRESHOLD) {
          if (!speechStarted) {
            speechStarted = true;
            setVadActive(true);
          }
          chunks.push(copy);
          speechMs += frameMs;
          silenceMs = 0;
        } else if (speechStarted) {
          chunks.push(copy);
          silenceMs += frameMs;
        }

        if (
          speechStarted &&
          ((silenceMs >= VAD_SILENCE_FLUSH_MS && speechMs >= VAD_MIN_SPEECH_MS) ||
            speechMs >= VAD_MAX_SPEECH_MS)
        ) {
          flushBuffer();
        }
      };
    };

    void setupAudio();

    return () => {
      cancelled = true;
      isProcessingRef.current = false;
      if (processor) {
        processor.onaudioprocess = null;
        try {
          processor.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      if (muteGain) {
        try {
          muteGain.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      if (audioContext) {
        void audioContext.close().catch(() => {});
      }
      if (ownedStream) {
        ownedStream.getTracks().forEach((track) => track.stop());
      }
      if (worker) {
        worker.terminate();
      }
    };
  }, [enabled, engineMode, effectiveSourceMode, activeStream, socket]);

  // Browser fallback mode (Web Speech API)
  useEffect(() => {
    if (!enabled || engineMode !== 'browser') {
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      Promise.resolve().then(() => {
        setErrorMsg('Bu tarayıcı Web Speech API canlı altyazıyı desteklemiyor.');
        setIsListening(false);
      });
      return;
    }

    let cancelled = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANG_MAP[browserLang] || 'tr-TR';

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
            // Fallback to default audio input
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
        setInterimText(cleanInterim);
      }

      const finalText = finalChunk.trim();
      if (!finalText) return;

      setInterimText('');

      const selectedLang = browserLangRef.current;
      const target = targetRef.current;
      const sourceType: CaptionSourceType =
        sourceModeRef.current === 'stream' ? 'stream' : 'user';
      const cleanStreamLabel =
        sourceType === 'stream'
          ? String(streamLabelRef.current || '').trim() || undefined
          : undefined;
      const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const baseEntry: LiveCaptionEntry = {
        id: entryId,
        time,
        author: currentUserRef.current,
        source: sourceType,
        sourceLabel: cleanStreamLabel,
        text: finalText,
        sourceLang: selectedLang,
        targetLang: target === 'off' ? null : target,
      };
      appendCaptionEntry(baseEntry);

      const processFinal = async () => {
        let resolvedLang: string = selectedLang;
        let translatedText: string | undefined;

        if (shouldTranslateCaption(finalText, selectedLang, target)) {
          const translated = await translateCaptionClientSide(finalText, target as CaptionLangCode);
          if (cancelled) return;
          if (translated) {
            resolvedLang = translated.detectedLang || selectedLang;
            translatedText = translated.translatedText || undefined;
          }
        }

        if (cancelled) return;
        setDetectedLangBadge(resolvedLang);

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
        // Ignore cleanup errors
      }
    };
  }, [enabled, engineMode, effectiveSourceMode, browserLang, activeStream, socket]);

  if (!enabled) return null;

  const handleSelectEngine = (mode: 'whisper' | 'browser') => {
    setEngineMode(mode);
    setInterimText('');
    setVadActive(false);
    setErrorMsg('');
    setIsListening(false);
    if (mode === 'whisper') {
      setDetectedLangBadge('auto');
    } else {
      setDetectedLangBadge(browserLang);
    }
  };

  const handleSelectSource = (mode: 'mic' | 'stream') => {
    if (mode === 'stream' && !hasActiveStream) return;
    setSourceMode(mode);
    setInterimText('');
    setVadActive(false);
  };

  const handleExportTranscript = () => {
    if (captions.length === 0) return;
    const md = formatCaptionTranscriptMarkdown(channelName || 'ses-odasi', captions);
    const safeName = (channelName || 'ses-odasi').replace(/[^a-zA-Z0-9_-]+/g, '-');
    downloadTextFile(`canli-altyazi-${safeName}-${Date.now()}.md`, md, 'text/markdown');
  };

  const handleGenerateMeetingNotes = () => {
    if (captions.length === 0) return;
    const digest = summarizeConversationLocally(
      captions.map((c) => ({
        author: c.author || (c.source === 'stream' ? 'Yayın' : 'Konuşmacı'),
        content: c.translatedText || c.text,
        timestamp: c.time,
      })),
      { channelName: channelName || 'Ses Odası' }
    );
    const md = formatDigestAsMarkdown(digest, `${channelName || 'Ses Odası'} — Toplantı Notları`);
    if (onPostMeetingSummary) {
      onPostMeetingSummary(md);
      appToast('Sesli toplantı özeti oda sohbetine gönderildi!', 'success');
    } else {
      downloadTextFile(`toplanti-ozeti-${Date.now()}.md`, md, 'text/markdown');
    }
  };

  const indicatorActive = engineMode === 'whisper' ? modelStatus === 'ready' : isListening;

  return (
    <div className="pointer-events-auto mx-auto mb-3 w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <span
              className={`h-2 w-2 rounded-full ${
                indicatorActive ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {t(language, 'liveCaptions')}
          </span>

          <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => handleSelectEngine('whisper')}
              title="İstemci içinde çok dilli Whisper AI ile konuşulan dili otomatik algılar"
              className={`rounded-md px-2 py-0.5 transition ${
                engineMode === 'whisper'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              🤖 AI Oto
            </button>
            <button
              type="button"
              onClick={() => handleSelectEngine('browser')}
              title="Hızlı tarayıcı konuşma tanıma motorunu kullan"
              className={`rounded-md px-2 py-0.5 transition ${
                engineMode === 'browser'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              ⚡ Tarayıcı
            </button>
          </div>

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

          {engineMode === 'whisper' ? (
            <span
              className="rounded border border-indigo-400/30 bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-200"
              title="Konuşulan dil doğrudan sesten otomatik algılanır"
            >
              Oto ({detectedLangBadge.toUpperCase()})
            </span>
          ) : (
            <select
              aria-label="Konuşulan dil (Tarayıcı)"
              value={browserLang}
              onChange={(e) => setBrowserLang(e.target.value as CaptionLangCode)}
              className="rounded-lg border border-white/15 bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium text-zinc-100 outline-none focus:border-indigo-400"
              title="Tarayıcı tanıma dilini seçin"
            >
              {BROWSER_LANG_CHOICES.map((choice) => (
                <option key={choice.code} value={choice.code}>
                  {choice.label}
                </option>
              ))}
            </select>
          )}
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
            onClick={handleGenerateMeetingNotes}
            disabled={captions.length === 0}
            className="rounded-lg border border-indigo-400/35 bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-500/30 disabled:opacity-40"
            title="Konuşmalardan özet çıkar ve oda sohbetine toplantı tutanağı gönder"
          >
            📝 Özet
          </button>

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

      {engineMode === 'whisper' && modelStatus === 'loading' && (
        <div className="mb-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5">
          <div className="mb-1 flex items-center justify-between text-[11px] text-indigo-200">
            <span>
              AI Dil Modeli hazırlanıyor... %{modelProgress} — ilk seferde indirilir, sonra
              önbellekten açılır
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(5, modelProgress))}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
          {errorMsg}
        </div>
      )}

      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1 text-sm">
        {captions.length === 0 && !interimText && !vadActive && (
          <p className="py-2 text-center text-xs text-zinc-400">
            {engineMode === 'whisper'
              ? 'Konuşma veya yayın sesi bekleniyor... Çok dilli AI sesi doğrudan çözümler ve dili otomatik algılar.'
              : 'Tarayıcı konuşma tanıma aktif... Seçili dilde konuşma bekleniyor.'}
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

        {engineMode === 'whisper' && vadActive && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">
            <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
            <span>Dinleniyor / Konuşma algılandı...</span>
          </div>
        )}

        {engineMode === 'browser' && interimText && (
          <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1.5">
            <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-indigo-300">
              <span>
                {formatCaptionBadge({
                  source: effectiveSourceMode === 'stream' ? 'stream' : 'user',
                  author: currentUserName,
                  sourceLabel: effectiveSourceMode === 'stream' ? streamLabel : undefined,
                })}
              </span>
              <span className="rounded bg-indigo-500/20 px-1 uppercase">{browserLang}</span>
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
