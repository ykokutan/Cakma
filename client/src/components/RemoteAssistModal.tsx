import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import {
  MousePointerClick,
  Monitor,
  Maximize2,
  Minimize2,
  X,
  ShieldCheck,
  ShieldAlert,
  Hand,
} from 'lucide-react';

interface RemoteAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RemoteAssistModal: React.FC<RemoteAssistModalProps> = ({ isOpen, onClose }) => {
  const {
    directCall,
    remoteScreenStreams,
    remoteAssist,
    requestRemoteAssist,
    stopRemoteAssist,
    sendRemoteInput,
  } = useSocket();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMoveSentRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const partner = directCall?.partner;
  const stream = partner ? remoteScreenStreams.get(partner.id) : undefined;
  const isControlling = remoteAssist.status === 'controlling';
  const isRequesting = remoteAssist.status === 'requesting';

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isOpen]);

  if (!isOpen || !directCall || !partner) return null;

  const getNormalizedCoords = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    // Account for object-contain letterboxing inside the <video> element
    const vw = video.videoWidth || rect.width;
    const vh = video.videoHeight || rect.height;
    const videoAspect = vw / vh;
    const rectAspect = rect.width / rect.height;

    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (rectAspect > videoAspect) {
      renderW = rect.height * videoAspect;
      offsetX = (rect.width - renderW) / 2;
    } else {
      renderH = rect.width / videoAspect;
      offsetY = (rect.height - renderH) / 2;
    }

    const relX = (e.clientX - rect.left - offsetX) / renderW;
    const relY = (e.clientY - rect.top - offsetY) / renderH;
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
    return { x: relX, y: relY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!isControlling) return;
    const now = performance.now();
    if (now - lastMoveSentRef.current < 28) return; // ~35fps smooth throttle
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    lastMoveSentRef.current = now;
    sendRemoteInput({ kind: 'move', x: coords.x, y: coords.y });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!isControlling) return;
    e.preventDefault();
    containerRef.current?.focus();
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    sendRemoteInput({ kind: 'mousedown', x: coords.x, y: coords.y, button: e.button });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!isControlling) return;
    e.preventDefault();
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    sendRemoteInput({ kind: 'mouseup', x: coords.x, y: coords.y, button: e.button });
  };

  const handleWheel = (e: React.WheelEvent<HTMLVideoElement>) => {
    if (!isControlling) return;
    sendRemoteInput({ kind: 'wheel', delta_y: e.deltaY });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isControlling) return;
    e.preventDefault();
    sendRemoteInput({ kind: 'keydown', key: e.key, code: e.code });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isControlling) return;
    e.preventDefault();
    sendRemoteInput({ kind: 'keyup', key: e.key, code: e.code });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        className="w-full max-w-6xl h-[85vh] rounded-3xl bg-[#0b0d14] border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden outline-none"
      >
        {/* TeamViewer-style Header Toolbar */}
        <div className="px-4 py-3 border-b border-white/10 bg-[#121520] flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white truncate">
                  {partner.username} — Uzaktan Yardım
                </span>
                {isControlling ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {remoteAssist.hostDesktopCapable ? 'Tam Kontrol Aktif' : 'Web İzleme'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/65 text-[10px] font-semibold">
                    İzleme Modu
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/45 truncate">
                {isControlling
                  ? remoteAssist.hostDesktopCapable
                    ? 'Fare ve klavye girdileriniz doğrudan karşı bilgisayara iletiliyor.'
                    : 'Karşı taraf web tarayıcıda olduğu için tam OS kontrolü için masaüstü uygulaması gerekir.'
                  : 'Kontrol etmek için "Uzaktan Kontrol İste" butonuna basın.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isControlling ? (
              <button
                type="button"
                onClick={stopRemoteAssist}
                className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-rose-500/25"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Kontrolü Bırak</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isRequesting || !stream}
                onClick={requestRemoteAssist}
                className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-sky-500/25"
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                <span>{isRequesting ? 'Onay Bekleniyor...' : 'Uzaktan Kontrol İste'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition"
              title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-white/80 hover:text-rose-300 transition"
              title="Pencereyi Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Remote Screen Canvas */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              onContextMenu={(e) => {
                if (isControlling) e.preventDefault();
              }}
              className={`w-full h-full object-contain ${isControlling ? 'cursor-crosshair' : 'cursor-default'}`}
            />
          ) : (
            <div className="text-center space-y-2 text-white/50 p-6">
              <ShieldAlert className="w-10 h-10 mx-auto text-amber-400/70" />
              <div className="text-sm font-semibold text-white/80">
                {partner.username} henüz ekranını paylaşmıyor
              </div>
              <div className="text-xs text-white/45">
                Arkadaşınız görüşme kartındaki &ldquo;Ekran Paylaş&rdquo; butonuna bastığında ekranı burada canlı görünecektir.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
