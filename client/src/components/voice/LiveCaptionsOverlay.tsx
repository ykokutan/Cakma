import React, { useEffect, useState } from 'react';
import { Captions, Download, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { downloadTextFile } from '../../utils/chatExportAndFilters';
import { t, type AppLanguage } from '../../utils/i18n';

interface LiveCaptionsOverlayProps {
  enabled: boolean;
  channelName: string;
  onClose: () => void;
}

interface CaptionLine {
  id: string;
  time: string;
  author: string;
  text: string;
}

const LANG_MAP: Record<AppLanguage, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
  ru: 'ru-RU',
  fr: 'fr-FR',
};

export const LiveCaptionsOverlay: React.FC<LiveCaptionsOverlayProps> = ({
  enabled,
  channelName,
  onClose,
}) => {
  const { currentUser, language } = useSocket();
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [unsupported, setUnsupported] = useState(false);

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
    let stopped = false;
    const rec = new SpeechRecCtor();
    rec.lang = LANG_MAP[language] || 'tr-TR';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = String(res?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (res.isFinal) {
          const entry: CaptionLine = {
            id: `cap-${Date.now()}-${i}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            author: currentUser?.username || 'Ben',
            text: transcript,
          };
          setLines((prev) => [...prev.slice(-99), entry]);
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
          rec.start();
        } catch {}
      }
    };

    try {
      rec.start();
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
  }, [enabled, language, currentUser?.username]);

  if (!enabled) return null;

  const recentLines = lines.slice(-3);

  const handleDownloadTranscript = () => {
    const mdLines = [
      `# Canlı Ses Altyazı Transkripti — #${channelName}`,
      `Tarih: ${new Date().toISOString()}`,
      '',
      ...lines.map((l) => `- **[${l.time}] ${l.author}**: ${l.text}`),
    ];
    downloadTextFile(
      `${channelName.replace(/[^a-zA-Z0-9_-]/g, '_')}-altyazi.md`,
      mdLines.join('\n'),
      'text/markdown;charset=utf-8'
    );
  };

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-xl px-4 py-3 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 shadow-2xl text-white space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-bold text-sky-300">
          <Captions className="w-3.5 h-3.5" />
          <span>{t(language, 'liveCaptions')} ({LANG_MAP[language] || 'tr-TR'})</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={handleDownloadTranscript}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold flex items-center gap-1 disabled:opacity-40 transition"
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

      {unsupported ? (
        <div className="text-xs text-amber-200/90">
          Bu tarayıcı/WebView ortamı Canlı Altyazı (Web Speech API) desteklemiyor.
        </div>
      ) : recentLines.length === 0 && !interimText ? (
        <div className="text-xs text-white/45 italic">Konuşma algılandığında altyazılar burada görünür...</div>
      ) : (
        <div className="space-y-1 text-xs">
          {recentLines.map((l) => (
            <div key={l.id} className="text-white/90">
              <span className="text-[10px] font-mono text-white/40 mr-1.5">[{l.time}]</span>
              <span className="font-semibold text-sky-300 mr-1">{l.author}:</span>
              <span>{l.text}</span>
            </div>
          ))}
          {interimText && (
            <div className="text-white/60 italic">{interimText}...</div>
          )}
        </div>
      )}
    </div>
  );
};
