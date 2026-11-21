import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RotateCcw, Send, Square, Video, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { MessageAttachment } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { uploadDataUrlAttachment } from '../../utils/uploadAttachment';

interface VideoNoteRecorderModalProps {
  currentServerHost: string;
  onSendVideoNote: (att: MessageAttachment) => void;
  onClose: () => void;
}

const MAX_SECONDS = 60;

export const VideoNoteRecorderModal: React.FC<VideoNoteRecorderModalProps> = ({
  currentServerHost,
  onSendVideoNote,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const stopCameraTracks = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
  };

  const initCamera = async () => {
    setCameraError(null);
    stopCameraTracks();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('Kamera veya mikrofona erişilemedi. Lütfen tarayıcı izinlerini kontrol edin.');
    }
  };

  useEffect(() => {
    void initCamera();
    return () => {
      stopCameraTracks();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || isRecording) return;
    chunksRef.current = [];
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    const mr = new MediaRecorder(stream);
    recorderRef.current = mr;
    mr.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    };

    setElapsedSec(0);
    setIsRecording(true);
    mr.start(250);
    timerRef.current = window.setInterval(() => {
      setElapsedSec((prev) => {
        if (prev + 1 >= MAX_SECONDS) {
          stopRecording();
          return MAX_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setElapsedSec(0);
    void initCamera();
  };

  const handleSend = () => {
    if (!recordedBlob || uploading) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) throw new Error('Video okunamadı.');
        const uploaded = await uploadDataUrlAttachment(currentServerHost, {
          name: `Video Notu (${Math.max(1, elapsedSec)}s).webm`,
          type: 'video/webm',
          dataUrl,
        });
        stopCameraTracks();
        onSendVideoNote({
          ...uploaded,
          type: 'video/webm',
          size: recordedBlob.size,
        });
        onClose();
      } catch (err) {
        appToast(
          err instanceof Error ? err.message : 'Video notu yüklenemedi.',
          'error'
        );
        setUploading(false);
      }
    };
    reader.readAsDataURL(recordedBlob);
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1050] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Kısa Video Notu Kaydet"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#12131a]/95 border border-white/15 rounded-3xl shadow-2xl p-5 space-y-4 text-white animate-scale-up"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold">Video Notu (Maks. 60 sn)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center space-y-3">
          <div
            className={`relative w-56 h-56 rounded-full overflow-hidden bg-black border-4 shadow-2xl ${
              isRecording ? 'border-rose-500 ring-4 ring-rose-500/30' : 'border-white/20'
            }`}
          >
            {cameraError ? (
              <div className="w-full h-full flex items-center justify-center p-4 text-center text-xs text-rose-300">
                {cameraError}
              </div>
            ) : previewUrl ? (
              <video
                src={previewUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                ref={liveVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
          </div>

          <div className="text-xs font-mono font-bold text-white/80">
            {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:
            {String(elapsedSec % 60).padStart(2, '0')} / 01:00
          </div>
        </div>

        <div className="flex items-center justify-center gap-2.5 pt-1">
          {!recordedBlob ? (
            isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-500/30"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Kaydı Durdur</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={Boolean(cameraError)}
                onClick={startRecording}
                className="px-5 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-500/30 disabled:opacity-40"
              >
                <Video className="w-4 h-4" />
                <span>Kaydı Başlat</span>
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                onClick={handleRetake}
                disabled={uploading}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Yeniden Çek</span>
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={uploading}
                className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{uploading ? 'Gönderiliyor...' : 'Gönder'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
