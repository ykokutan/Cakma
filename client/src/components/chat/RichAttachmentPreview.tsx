import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Download,
  FolderArchive,
  Table,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { parseZipDirectory, type ZipEntryInfo } from '../../utils/zipInspector';
import { parseCsvPreview, parseJsonPreview, type TabularPreviewData } from '../../utils/tabularPreviewParser';

interface RichAttachmentPreviewProps {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  isBlobUrl?: boolean;
}

const waveformCache = new Map<string, number[]>();

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const WaveformAudioCard: React.FC<{ url: string; name: string; sizeBytes?: number }> = ({
  url,
  name,
  sizeBytes,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[]>(() => waveformCache.get(url) || Array.from({ length: 36 }, (_, i) => 0.25 + ((i * 7) % 11) / 16));
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    if (waveformCache.has(url)) return;
    let cancelled = false;
    const decode = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const resp = await authFetch(url);
        if (!resp.ok) return;
        const arr = await resp.arrayBuffer();
        const ctx = new AudioCtx();
        const buf = await ctx.decodeAudioData(arr).finally(() => void ctx.close().catch(() => {}));
        const ch = buf.getChannelData(0);
        const bars = 36;
        const step = Math.max(1, Math.floor(ch.length / bars));
        const out: number[] = [];
        let maxPeak = 0.01;
        for (let b = 0; b < bars; b++) {
          let sum = 0;
          const start = b * step;
          for (let j = 0; j < step && start + j < ch.length; j += 8) {
            sum += Math.abs(ch[start + j]);
          }
          const avg = sum / Math.max(1, Math.floor(step / 8));
          if (avg > maxPeak) maxPeak = avg;
          out.push(avg);
        }
        const normalized = out.map((v) => Math.max(0.12, Math.min(1, v / maxPeak)));
        waveformCache.set(url, normalized);
        if (!cancelled) setPeaks(normalized);
      } catch {
        // Keep deterministic fallback bars
      }
    };
    void decode();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const progressRatio = durationSec > 0 ? Math.min(1, currentSec / durationSec) : 0;

  return (
    <div className="p-3 rounded-2xl bg-black/30 border border-white/10 max-w-md space-y-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={() => setDurationSec(audioRef.current?.duration || 0)}
        onTimeUpdate={() => setCurrentSec(audioRef.current?.currentTime || 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-white truncate">🎵 {name}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          {sizeBytes ? <span className="text-[10px] text-white/45">{formatBytes(sizeBytes)}</span> : null}
          <a
            href={url}
            download={name}
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
            title="İndir"
          >
            <Download className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) {
              void el.play();
              setPlaying(true);
            } else {
              el.pause();
              setPlaying(false);
            }
          }}
          className="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center shrink-0 transition"
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        <div
          className="flex-1 h-8 flex items-end gap-[2px] cursor-pointer"
          onClick={(e) => {
            const el = audioRef.current;
            if (!el || !durationSec) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            el.currentTime = ratio * durationSec;
            setCurrentSec(el.currentTime);
          }}
        >
          {peaks.map((amp, idx) => {
            const active = idx / peaks.length <= progressRatio;
            return (
              <div
                key={idx}
                style={{ height: `${Math.round(amp * 100)}%` }}
                className={`flex-1 rounded-full transition-colors ${
                  active ? 'bg-cyan-400' : 'bg-white/20'
                }`}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            const nextRate: 1 | 1.5 | 2 = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
            setRate(nextRate);
            if (audioRef.current) audioRef.current.playbackRate = nextRate;
          }}
          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono text-white/85 shrink-0"
        >
          {rate}x
        </button>
      </div>

      <div className="flex justify-between text-[10px] font-mono text-white/45">
        <span>{formatSec(currentSec)}</span>
        <span>{formatSec(durationSec)}</span>
      </div>
    </div>
  );
};

export const RichAttachmentPreview: React.FC<RichAttachmentPreviewProps> = ({
  url,
  name,
  mimeType,
  sizeBytes,
}) => {
  const lower = name.toLowerCase();
  const isPdf = mimeType === 'application/pdf' || lower.endsWith('.pdf');
  const isZip = mimeType === 'application/zip' || lower.endsWith('.zip');
  const isCsv = mimeType === 'text/csv' || lower.endsWith('.csv');
  const isJson = mimeType === 'application/json' || lower.endsWith('.json');
  const isAudio =
    mimeType.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|flac)$/i.test(lower);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zipEntries, setZipEntries] = useState<ZipEntryInfo[] | null>(null);
  const [tableData, setTableData] = useState<TabularPreviewData | null>(null);
  const [tableFilter, setTableFilter] = useState('');

  if (isAudio) {
    return <WaveformAudioCard url={url} name={name} sizeBytes={sizeBytes} />;
  }

  if (!isPdf && !isZip && !isCsv && !isJson) {
    return null;
  }

  const toggleInspect = async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || zipEntries || tableData || isPdf) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const resp = await authFetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (isZip) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 10 * 1024 * 1024) {
          throw new Error('10 MB üstü ZIP dosyaları için lütfen indirip inceleyin.');
        }
        setZipEntries(parseZipDirectory(buf));
      } else {
        const text = (await resp.text()).slice(0, 512_000);
        setTableData(isCsv ? parseCsvPreview(text, 50) : parseJsonPreview(text, 50));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Dosya ön izlenemedi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-black/25 border border-white/10 max-w-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {isZip ? (
            <FolderArchive className="w-4 h-4 text-amber-300 shrink-0" />
          ) : isCsv || isJson ? (
            <Table className="w-4 h-4 text-emerald-300 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-rose-300 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{name}</div>
            {sizeBytes ? <div className="text-[10px] text-white/45">{formatBytes(sizeBytes)}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void toggleInspect()}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white flex items-center gap-1 transition"
          >
            <span>
              {isPdf
                ? expanded
                  ? 'PDF Gizle'
                  : 'PDF Ön İzle'
                : isZip
                ? expanded
                  ? 'Gizle'
                  : 'Arşivi Gör'
                : expanded
                ? 'Gizle'
                : 'Tablo Ön İzle'}
            </span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <a
            href={url}
            download={name}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
            title="İndir"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 p-2.5 bg-black/35">
          {loading && <div className="text-xs text-white/60 py-3 text-center">İçerik okunuyor...</div>}
          {errorMsg && <div className="text-xs text-rose-300 py-2">{errorMsg}</div>}

          {isPdf && (
            <iframe
              src={url}
              title={name}
              className="w-full h-96 rounded-lg bg-white border border-white/10"
            />
          )}

          {zipEntries && (
            <div className="max-h-60 overflow-y-auto space-y-1 text-[11px]">
              <div className="text-white/55 font-semibold pb-1">
                Toplam {zipEntries.length} öğe
              </div>
              {zipEntries.map((entry, idx) => (
                <div
                  key={`${entry.name}-${idx}`}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white/[0.04]"
                >
                  <span className="truncate font-mono text-white/85">
                    {entry.isDirectory ? '📁 ' : '📄 '}
                    {entry.name}
                  </span>
                  {!entry.isDirectory && (
                    <span className="text-[10px] text-white/45 shrink-0 font-mono">
                      {formatBytes(entry.uncompressedSize)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {tableData && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3 h-3 text-white/40 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                    placeholder="Tabloda filtrele..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white outline-none"
                  />
                </div>
                <span className="text-[10px] text-white/50 shrink-0">
                  {tableData.totalRows} satır{tableData.truncated ? ' (ilk 50)' : ''}
                </span>
              </div>
              <div className="max-h-60 overflow-auto rounded-lg border border-white/10">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-white/10 text-white/80 sticky top-0">
                    <tr>
                      {tableData.columns.map((c, idx) => (
                        <th key={idx} className="px-2 py-1.5 font-semibold border-b border-white/10 whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows
                      .filter((r) =>
                        !tableFilter.trim() ||
                        r.some((cell) => cell.toLowerCase().includes(tableFilter.trim().toLowerCase()))
                      )
                      .map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-white/5 hover:bg-white/[0.04]">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-2 py-1 text-white/80 whitespace-nowrap max-w-[180px] truncate">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
