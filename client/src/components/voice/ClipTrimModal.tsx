import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Scissors, Download, Send, Volume2, VolumeX } from 'lucide-react';
import { sliceMediaBlobByTime, validateTrimRange } from '../../utils/clipTrimmer';
import { downloadClipBlob } from '../../utils/streamClipRecorder';
import { appToast } from '../../utils/appDialogs';

interface ClipTrimModalProps {
  blob: Blob;
  onClose: () => void;
  onShareToRoom: (finalBlob: Blob, caption: string) => Promise<void>;
}

export const ClipTrimModal: React.FC<ClipTrimModalProps> = ({
  blob,
  onClose,
  onShareToRoom,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  const [durationSec, setDurationSec] = useState<number>(30);
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(30);
  const [muteAudio, setMuteAudio] = useState<boolean>(false);
  const [caption, setCaption] = useState<string>('🎬 Anlık Tekrar Klibi');
  const [busyAction, setBusyAction] = useState<'download' | 'share' | null>(null);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleLoadedMetadata = () => {
    const dur = videoRef.current?.duration;
    if (dur && Number.isFinite(dur) && dur > 0.5) {
      const rounded = Math.round(dur * 10) / 10;
      setDurationSec(rounded);
      setStartSec(0);
      setEndSec(rounded);
    }
  };

  const validation = validateTrimRange(startSec, endSec, durationSec);

  const buildProcessedBlob = async () => {
    return sliceMediaBlobByTime(blob, startSec, endSec, durationSec, muteAudio);
  };

  const handleDownload = async () => {
    if (!validation.valid || busyAction) return;
    setBusyAction('download');
    try {
      const finalBlob = await buildProcessedBlob();
      downloadClipBlob(finalBlob, 'cakma-stream-clip-trimmed');
      appToast('Klip indirildi!', 'success');
      onClose();
    } catch (err) {
      appToast(err instanceof Error ? err.message : 'Klip işlenemedi.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleShare = async () => {
    if (!validation.valid || busyAction) return;
    setBusyAction('share');
    try {
      const finalBlob = await buildProcessedBlob();
      await onShareToRoom(finalBlob, caption.trim() || '🎬 Anlık Tekrar Klibi');
      onClose();
    } catch (err) {
      appToast(err instanceof Error ? err.message : 'Klip paylaşılamadı.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl ios-glass rounded-3xl border border-white/15 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Anlık Klip Düzenleyici</h3>
              <p className="text-[11px] text-white/50">
                Başlangıç/bitiş kırpın, sesi seçin ve odaya gönderin veya indirin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              muted={muteAudio}
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-black/30 border border-white/10">
            <div>
              <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                <span>Başlangıç</span>
                <span className="font-mono text-amber-300">{startSec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0.5, durationSec - 0.5)}
                step={0.5}
                value={startSec}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStartSec(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-full accent-amber-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                <span>Bitiş</span>
                <span className="font-mono text-cyan-300">{endSec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={durationSec}
                step={0.5}
                value={endSec}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setEndSec(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          {!validation.valid && (
            <div className="text-xs text-rose-300 bg-rose-500/15 border border-rose-400/30 rounded-xl px-3 py-2">
              {validation.reason}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={140}
              placeholder="Klip açıklaması yazın..."
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setMuteAudio((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 ${
                muteAudio
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                  : 'bg-white/10 border-white/15 text-white/80 hover:bg-white/15'
              }`}
            >
              {muteAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{muteAudio ? 'Sesi Kapalı' : 'Ses Açık'}</span>
            </button>
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-white/10 bg-black/25 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white/75 transition"
          >
            İptal
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!validation.valid || busyAction !== null}
              onClick={() => void handleDownload()}
              className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-bold text-amber-200 flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{busyAction === 'download' ? 'İşleniyor...' : 'İndir'}</span>
            </button>
            <button
              type="button"
              disabled={!validation.valid || busyAction !== null}
              onClick={() => void handleShare()}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-black flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{busyAction === 'share' ? 'Gönderiliyor...' : 'Odaya Gönder'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
