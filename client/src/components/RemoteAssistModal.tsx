import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { useDirectCallQuality } from '../context/PresenceStore';
import type {
  RemoteAssistAnnotationStroke,
  RemoteAssistPermissions,
} from '../types';
import {
  clampPanOffset,
  classifyConnectionQuality,
  clientPointToNormalizedVideo,
  computeVideoContentRect,
} from '../utils/remoteAssistHelpers';
import {
  MousePointerClick,
  Monitor,
  Maximize2,
  Minimize2,
  X,
  ShieldCheck,
  ShieldAlert,
  Hand,
  Keyboard,
  Send,
  Zap,
  Clipboard,
  Crosshair,
  Pause,
  Play,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pencil,
  ArrowUpRight,
  Square,
  Eraser,
  Camera,
  Paperclip,
  Move,
  Download,
  ChevronDown,
  Wifi,
} from 'lucide-react';

interface RemoteAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ANNOTATION_COLORS = ['#f43f5e', '#38bdf8', '#facc15', '#34d399'] as const;

export const RemoteAssistModal: React.FC<RemoteAssistModalProps> = ({ isOpen, onClose }) => {
  const {
    directCall,
    remoteScreenStreams,
    remoteAssist,
    remoteAssistSafeMode,
    setRemoteAssistSafeMode,
    requestRemoteAssist,
    stopRemoteAssist,
    pauseRemoteAssist,
    selectRemoteMonitor,
    sendRemoteInput,
    sendRemoteClipboard,
    pullRemoteClipboard,
    remoteLaser,
    sendRemoteLaser,
    remoteAnnotations,
    sendRemoteAnnotation,
    clearRemoteAnnotations,
    sendFileToDirectPartner,
    sendScreenshotToDirectPartner,
  } = useSocket();
  const directCallQuality = useDirectCallQuality();

  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMoveSentRef = useRef<number>(0);
  const pressedKeysRef = useRef<Map<string, { key: string; code: string }>>(new Map());
  const pressedButtonsRef = useRef<Set<number>>(new Set());

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [showUacTip, setShowUacTip] = useState(true);
  const [showReqPerms, setShowReqPerms] = useState(false);
  const [reqPerms, setReqPerms] = useState<RemoteAssistPermissions>({
    control: true,
    clipboard: true,
    annotate: true,
  });

  // View zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const panDragRef = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [videoDims, setVideoDims] = useState({ w: 1920, h: 1080 });

  // Laser & Live Annotations
  type OverlayTool = 'none' | 'laser' | 'pen' | 'arrow' | 'rect';
  const [overlayTool, setOverlayTool] = useState<OverlayTool>('none');
  const [annotationColor, setAnnotationColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [localLaserPos, setLocalLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [draftStroke, setDraftStroke] = useState<RemoteAssistAnnotationStroke | null>(null);

  // Clipboard, snapshot & file DnD
  const [clipboardToast, setClipboardToast] = useState<string | null>(null);
  const [pendingSnapshotUrl, setPendingSnapshotUrl] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [stickyMods, setStickyMods] = useState<{
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  }>({ ctrl: false, alt: false, shift: false, meta: false });

  const partner = directCall?.partner;
  const stream = partner ? remoteScreenStreams.get(partner.id) : undefined;
  const isControlling = remoteAssist.status === 'controlling';
  const canSendPointerControl =
    isControlling && !remoteAssist.paused && remoteAssist.permissions.control;
  const isRequesting = remoteAssist.status === 'requesting';
  const activeMonitor =
    remoteAssist.hostMonitors.find((m) => m.index === remoteAssist.selectedMonitorIndex) ||
    remoteAssist.hostMonitors.find((m) => m.is_primary) ||
    remoteAssist.hostMonitors[0] ||
    null;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isOpen]);

  // Track viewport size for pixel-accurate annotation/laser SVG alignment
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !isOpen) return;
    const updateSize = () => {
      const r = el.getBoundingClientRect();
      setViewportSize({ w: r.width, h: r.height });
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(updateSize);
      obs.observe(el);
      return () => obs.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [isOpen, showShortcuts, showUacTip, showKeyboard]);

  const releaseAllRemoteInputs = () => {
    for (const [, info] of pressedKeysRef.current.entries()) {
      sendRemoteInput({ kind: 'keyup', key: info.key, code: info.code });
    }
    pressedKeysRef.current.clear();
    for (const btn of pressedButtonsRef.current.values()) {
      sendRemoteInput({ kind: 'mouseup', button: btn });
    }
    pressedButtonsRef.current.clear();
  };

  // Global keyboard & input-release listeners while controlling
  useEffect(() => {
    if (!isOpen || !canSendPointerControl) {
      releaseAllRemoteInputs();
      return;
    }

    const onWinKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      e.preventDefault();
      pressedKeysRef.current.set(e.code, { key: e.key, code: e.code });
      sendRemoteInput({
        kind: 'keydown',
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
    };

    const onWinKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      e.preventDefault();
      pressedKeysRef.current.delete(e.code);
      sendRemoteInput({
        kind: 'keyup',
        key: e.key,
        code: e.code,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
    };

    const onWinMouseUp = (e: MouseEvent) => {
      panDragRef.current = null;
      if (pressedButtonsRef.current.has(e.button)) {
        pressedButtonsRef.current.delete(e.button);
        sendRemoteInput({ kind: 'mouseup', button: e.button });
      }
    };

    const onWinBlur = () => {
      releaseAllRemoteInputs();
    };

    window.addEventListener('keydown', onWinKeyDown);
    window.addEventListener('keyup', onWinKeyUp);
    window.addEventListener('mouseup', onWinMouseUp);
    window.addEventListener('blur', onWinBlur);

    return () => {
      window.removeEventListener('keydown', onWinKeyDown);
      window.removeEventListener('keyup', onWinKeyUp);
      window.removeEventListener('mouseup', onWinMouseUp);
      window.removeEventListener('blur', onWinBlur);
      releaseAllRemoteInputs();
    };
  }, [isOpen, canSendPointerControl]);

  if (!isOpen || !directCall || !partner) return null;

  const contentRect = computeVideoContentRect(
    viewportSize.w,
    viewportSize.h,
    videoDims.w,
    videoDims.h
  );

  const monitorPayload = activeMonitor
    ? {
        monitor_x: activeMonitor.x,
        monitor_y: activeMonitor.y,
        monitor_w: activeMonitor.width,
        monitor_h: activeMonitor.height,
      }
    : {};

  const getNormalizedCoords = (e: React.MouseEvent<HTMLElement>) => {
    const vp = viewportRef.current;
    if (!vp) return null;
    const rect = vp.getBoundingClientRect();
    return clientPointToNormalizedVideo(
      e.clientX,
      e.clientY,
      rect,
      videoDims.w,
      videoDims.h,
      zoom,
      pan.x,
      pan.y
    );
  };

  const applyZoom = (nextZoom: number) => {
    const clamped = Math.min(2.5, Math.max(1, Math.round(nextZoom * 100) / 100));
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
      setPanMode(false);
    } else {
      const clampedPan = clampPanOffset(pan.x, pan.y, clamped, viewportSize.w, viewportSize.h);
      setPan({ x: clampedPan.panX, y: clampedPan.panY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panDragRef.current?.active) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      const clampedPan = clampPanOffset(
        panDragRef.current.baseX + dx,
        panDragRef.current.baseY + dy,
        zoom,
        viewportSize.w,
        viewportSize.h
      );
      setPan({ x: clampedPan.panX, y: clampedPan.panY });
      return;
    }

    if (draftStroke) {
      const coords = getNormalizedCoords(e);
      if (!coords) return;
      setDraftStroke((prev) => {
        if (!prev) return null;
        if (prev.tool === 'pen') {
          const last = prev.points[prev.points.length - 1];
          if (
            last &&
            Math.hypot(coords.x - last.x, coords.y - last.y) < 0.005
          ) {
            return prev;
          }
          return { ...prev, points: [...prev.points.slice(-118), coords] };
        }
        return { ...prev, points: [prev.points[0], coords] };
      });
      return;
    }

    const isLaser = overlayTool === 'laser';
    if (!canSendPointerControl && !isLaser) return;
    const now = performance.now();
    if (now - lastMoveSentRef.current < 24) return;
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    lastMoveSentRef.current = now;

    if (canSendPointerControl) {
      sendRemoteInput({
        kind: 'move',
        x: coords.x,
        y: coords.y,
        ...monitorPayload,
      });
    }
    if (isLaser) {
      setLocalLaserPos(coords);
      sendRemoteLaser(coords.x, coords.y, true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.button === 1 || (panMode && e.button === 0)) && zoom > 1) {
      e.preventDefault();
      panDragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        baseX: pan.x,
        baseY: pan.y,
      };
      return;
    }

    if (overlayTool === 'pen' || overlayTool === 'arrow' || overlayTool === 'rect') {
      if (e.button !== 0 || !stream) return;
      e.preventDefault();
      const coords = getNormalizedCoords(e);
      if (!coords) return;
      setDraftStroke({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: overlayTool,
        color: annotationColor,
        points: [coords],
        createdAt: Date.now(),
      });
      return;
    }

    if (!canSendPointerControl) return;
    e.preventDefault();
    containerRef.current?.focus();
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    pressedButtonsRef.current.add(e.button);
    sendRemoteInput({
      kind: 'mousedown',
      x: coords.x,
      y: coords.y,
      button: e.button,
      ...monitorPayload,
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panDragRef.current?.active) {
      panDragRef.current = null;
      return;
    }

    if (draftStroke) {
      if (draftStroke.points.length >= 2) {
        sendRemoteAnnotation({ ...draftStroke, createdAt: Date.now() });
      }
      setDraftStroke(null);
      return;
    }

    if (!canSendPointerControl) return;
    e.preventDefault();
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    pressedButtonsRef.current.delete(e.button);
    sendRemoteInput({
      kind: 'mouseup',
      x: coords.x,
      y: coords.y,
      button: e.button,
      ...monitorPayload,
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey && stream) {
      e.preventDefault();
      applyZoom(zoom + (e.deltaY < 0 ? 0.25 : -0.25));
      return;
    }
    if (!canSendPointerControl) return;
    sendRemoteInput({
      kind: 'wheel',
      delta_x: e.deltaX,
      delta_y: e.deltaY,
    });
  };

  const handleSendClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setClipboardToast('Pano boş');
        setTimeout(() => setClipboardToast(null), 2000);
        return;
      }
      sendRemoteClipboard(text);
      setClipboardToast('Pano gönderildi!');
      setTimeout(() => setClipboardToast(null), 2200);
    } catch {
      setClipboardToast('Pano okunamadı');
      setTimeout(() => setClipboardToast(null), 2200);
    }
  };

  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
    } catch {}
    setPendingSnapshotUrl(dataUrl);
    window.setTimeout(() => {
      setPendingSnapshotUrl((cur) => (cur === dataUrl ? null : cur));
    }, 6500);
  };

  const MODIFIER_CODE_MAP: Record<'ctrl' | 'alt' | 'shift' | 'meta', { key: string; code: string }> = {
    ctrl: { key: 'Control', code: 'ControlLeft' },
    alt: { key: 'Alt', code: 'AltLeft' },
    shift: { key: 'Shift', code: 'ShiftLeft' },
    meta: { key: 'Meta', code: 'MetaLeft' },
  };

  const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

  const sendKeyCombo = async (
    mods: Array<'ctrl' | 'alt' | 'shift' | 'meta'>,
    key: string,
    code: string
  ) => {
    if (!canSendPointerControl) return;
    for (const m of mods) {
      const def = MODIFIER_CODE_MAP[m];
      sendRemoteInput({ kind: 'keydown', key: def.key, code: def.code });
    }
    if (mods.length > 0) await delay(25);
    sendRemoteInput({
      kind: 'keydown',
      key,
      code,
      ctrl: mods.includes('ctrl'),
      alt: mods.includes('alt'),
      shift: mods.includes('shift'),
      meta: mods.includes('meta'),
    });
    await delay(35);
    sendRemoteInput({
      kind: 'keyup',
      key,
      code,
      ctrl: mods.includes('ctrl'),
      alt: mods.includes('alt'),
      shift: mods.includes('shift'),
      meta: mods.includes('meta'),
    });
    if (mods.length > 0) await delay(25);
    for (const m of [...mods].reverse()) {
      const def = MODIFIER_CODE_MAP[m];
      sendRemoteInput({ kind: 'keyup', key: def.key, code: def.code });
    }
    containerRef.current?.focus();
  };

  const handleVirtualKey = async (key: string, code: string) => {
    if (!canSendPointerControl) return;
    const activeMods = (['ctrl', 'alt', 'shift', 'meta'] as const).filter((m) => stickyMods[m]);
    await sendKeyCombo(activeMods, key, code);
    if (activeMods.length > 0) {
      setStickyMods({ ctrl: false, alt: false, shift: false, meta: false });
    }
  };

  const handleSendQuickText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSendPointerControl || !quickText) return;
    const textToSend = quickText;
    setQuickText('');
    sendRemoteInput({ kind: 'text', text: textToSend });
    containerRef.current?.focus();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const allStrokes: RemoteAssistAnnotationStroke[] = draftStroke
    ? [...remoteAnnotations, draftStroke]
    : remoteAnnotations;

  const qualityBadge = directCallQuality
    ? classifyConnectionQuality(directCallQuality.rttMs, directCallQuality.packetLossPct)
    : null;

  const isAnnotationTool = overlayTool === 'pen' || overlayTool === 'arrow' || overlayTool === 'rect';

  return createPortal(
    <div className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-5 animate-fade-in">
      <div
        ref={containerRef}
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFile(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget === e.target) setIsDraggingFile(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFile(false);
          const files = e.dataTransfer?.files;
          if (files && files.length > 0) {
            Array.from(files).forEach((f) => void sendFileToDirectPartner(f));
          }
        }}
        className="relative w-full max-w-7xl h-[88vh] rounded-3xl bg-[#0b0d14] border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden outline-none"
      >
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-sky-600/30 backdrop-blur-md border-2 border-dashed border-sky-400 flex flex-col items-center justify-center gap-2 text-white pointer-events-none">
            <Paperclip className="w-10 h-10 text-sky-300" />
            <div className="text-base font-bold">{partner.username} kullanıcısına dosya gönder</div>
            <div className="text-xs text-white/75">Bıraktığınız dosya DM sohbeti üzerinden iletilir (Maks 5MB)</div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              Array.from(e.target.files).forEach((f) => void sendFileToDirectPartner(f));
              e.target.value = '';
            }
          }}
        />

        {/* Pro Header Toolbar */}
        <div className="px-4 py-2.5 border-b border-white/10 bg-[#121520] flex flex-wrap items-center justify-between gap-2.5 shrink-0 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white truncate">
                  {partner.username} — Uzaktan Yardım
                </span>
                {isControlling ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                      remoteAssist.paused
                        ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                        : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {remoteAssist.paused
                      ? 'Duraklatıldı'
                      : remoteAssist.hostDesktopCapable
                      ? 'Tam Kontrol Aktif'
                      : 'Web İzleme'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/65 text-[10px] font-semibold">
                    İzleme Modu
                  </span>
                )}

                {directCallQuality && qualityBadge && (
                  <span
                    className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-mono text-white/75 flex items-center gap-1.5"
                    title="Canlı WebRTC & Girdi Hattı Telemetrisi"
                  >
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span>
                      {directCallQuality.width > 0
                        ? `${directCallQuality.width}×${directCallQuality.height}`
                        : 'Bağlı'}
                      {directCallQuality.fps > 0 ? ` • ${directCallQuality.fps}fps` : ''}
                      {` • ${directCallQuality.rttMs}ms`}
                      {directCallQuality.bitrateKbps > 0
                        ? ` • ${directCallQuality.bitrateKbps}kbps`
                        : ''}
                      {` • ${remoteAssist.inputTransport === 'datachannel' ? 'P2P DC' : 'Relay'}`}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/45 truncate">
                {isControlling
                  ? remoteAssist.paused
                    ? 'Host veya sizin tarafınızdan geçici olarak duraklatıldı.'
                    : remoteAssist.hostDesktopCapable
                    ? 'Fare, klavye ve çizimler düşük gecikmeyle iletiliyor. Yakınlaştırmak için Ctrl+Tekerlek kullanabilirsiniz.'
                    : 'Karşı taraf web tarayıcıda olduğu için tam OS kontrolü için masaüstü uygulaması gerekir.'
                  : 'Kontrol isteyebilir veya lazer/çizim araçlarıyla ekran üzerinde işaretleme yapabilirsiniz.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {remoteAssist.status === 'controlling' && (
              <span
                className={`px-2 py-0.5 rounded-full border text-[10px] font-bold flex items-center gap-1 ${
                  remoteAssistSafeMode
                    ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-400/35 text-amber-300'
                }`}
                title="Uzak sistem kısayol koruması durumu"
              >
                {remoteAssistSafeMode ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                <span>{remoteAssistSafeMode ? 'Güvenli Mod Açık' : 'Tam Kısayol'}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setRemoteAssistSafeMode(!remoteAssistSafeMode)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                remoteAssistSafeMode
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/30 text-emerald-200'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/30 text-amber-200'
              }`}
              title="Alt+F4, Win+R/X/L/E, Ctrl+Shift+Esc gibi kritik OS kısayollarını yerel tarafta engelle"
            >
              {remoteAssistSafeMode ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              <span className="hidden xl:inline">{remoteAssistSafeMode ? 'Kısayol Koruması' : 'Kısayol Açık'}</span>
            </button>
            {/* Monitor switcher if multi-monitor host */}
            {remoteAssist.hostMonitors.length > 1 && (
              <select
                value={remoteAssist.selectedMonitorIndex ?? 0}
                onChange={(e) => selectRemoteMonitor(Number(e.target.value))}
                className="bg-white/10 border border-white/15 rounded-xl px-2 py-1.5 text-[11px] text-white outline-none focus:border-sky-400"
                title="Hedef Monitör"
              >
                {remoteAssist.hostMonitors.map((m) => (
                  <option key={m.index} value={m.index} className="bg-[#121520] text-white">
                    {m.name}
                  </option>
                ))}
              </select>
            )}

            {/* Request / Pause / Release Control */}
            {isControlling ? (
              <>
                <button
                  type="button"
                  onClick={() => pauseRemoteAssist(!remoteAssist.paused)}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/35 text-amber-200 text-xs font-bold flex items-center gap-1 transition"
                >
                  {remoteAssist.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{remoteAssist.paused ? 'Devam' : 'Duraklat'}</span>
                </button>
                <button
                  type="button"
                  onClick={stopRemoteAssist}
                  className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-rose-500/25"
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Kontrolü Bırak</span>
                </button>
              </>
            ) : (
              <div className="relative flex items-center">
                <button
                  type="button"
                  disabled={isRequesting || !stream}
                  onClick={() => requestRemoteAssist(reqPerms)}
                  className="px-3 py-1.5 rounded-l-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-sky-500/25"
                >
                  <MousePointerClick className="w-3.5 h-3.5" />
                  <span>{isRequesting ? 'Onay Bekleniyor...' : 'Kontrol İste'}</span>
                </button>
                <button
                  type="button"
                  disabled={isRequesting || !stream}
                  onClick={() => setShowReqPerms((v) => !v)}
                  className="px-1.5 py-1.5 rounded-r-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white border-l border-white/20 transition"
                  title="İzin Profili Seç"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showReqPerms && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/15 bg-[#151926] p-3 shadow-2xl z-30 space-y-2 text-xs">
                    <div className="font-bold text-white/90 text-[11px]">Talep Edilecek İzinler</div>
                    {(
                      [
                        { key: 'control', label: 'Fare & Klavye Kontrolü' },
                        { key: 'clipboard', label: 'Pano Paylaşımı' },
                        { key: 'annotate', label: 'Lazer & Canlı Çizim' },
                      ] as const
                    ).map((item) => (
                      <label key={item.key} className="flex items-center gap-2 cursor-pointer text-white/80">
                        <input
                          type="checkbox"
                          checked={reqPerms[item.key]}
                          onChange={(e) =>
                            setReqPerms((p) => ({ ...p, [item.key]: e.target.checked }))
                          }
                          className="accent-sky-400"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Zoom & Pan Controls */}
            <div className="flex items-center rounded-xl bg-white/[0.06] border border-white/10 p-0.5">
              <button
                type="button"
                disabled={!stream || zoom <= 1}
                onClick={() => applyZoom(zoom - 0.25)}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-35 text-white/85"
                title="Uzaklaştır"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!stream}
                onClick={() => applyZoom(zoom === 1 ? 1.5 : 1)}
                className="px-1.5 text-[11px] font-mono text-white/85 hover:text-white"
                title="Sığdır / %150"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                disabled={!stream || zoom >= 2.5}
                onClick={() => applyZoom(zoom + 0.25)}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-35 text-white/85"
                title="Yakınlaştır (Ctrl+Tekerlek)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {zoom > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPanMode((v) => !v)}
                    className={`p-1.5 rounded-lg transition ${
                      panMode ? 'bg-sky-500 text-white' : 'hover:bg-white/10 text-white/80'
                    }`}
                    title="Görüntüyü Kaydır (veya orta fare tuşuyla sürükle)"
                  >
                    <Move className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyZoom(1)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/80"
                    title="Ekrana Sığdır"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Laser & Annotation Tools */}
            <div className="flex items-center rounded-xl bg-white/[0.06] border border-white/10 p-0.5 gap-0.5">
              {(
                [
                  { id: 'laser', icon: Crosshair, title: 'Lazer İşaretçi' },
                  { id: 'pen', icon: Pencil, title: 'Kalemle Çiz' },
                  { id: 'arrow', icon: ArrowUpRight, title: 'Ok Çiz' },
                  { id: 'rect', icon: Square, title: 'Kutu İşaretle' },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const active = overlayTool === tool.id;
                const allowed = !isControlling || remoteAssist.permissions.annotate;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    disabled={!stream || !allowed}
                    onClick={() => {
                      if (overlayTool === 'laser') {
                        setLocalLaserPos(null);
                        sendRemoteLaser(0, 0, false);
                      }
                      setOverlayTool(active ? 'none' : tool.id);
                    }}
                    className={`p-1.5 rounded-lg transition disabled:opacity-35 ${
                      active
                        ? 'bg-rose-500 text-white'
                        : 'hover:bg-white/10 text-white/80'
                    }`}
                    title={tool.title}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}

              {isAnnotationTool && (
                <div className="flex items-center gap-1 px-1">
                  {ANNOTATION_COLORS.map((clr) => (
                    <button
                      key={clr}
                      type="button"
                      onClick={() => setAnnotationColor(clr)}
                      className={`w-3.5 h-3.5 rounded-full border ${
                        annotationColor === clr ? 'border-white scale-125' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: clr }}
                    />
                  ))}
                </div>
              )}

              {remoteAnnotations.length > 0 && (
                <button
                  type="button"
                  onClick={clearRemoteAnnotations}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/80"
                  title="Çizimleri Temizle"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Clipboard Push & Pull */}
            <div className="flex items-center rounded-xl bg-white/[0.06] border border-white/10 p-0.5">
              <button
                type="button"
                onClick={handleSendClipboard}
                disabled={!stream || (isControlling && !remoteAssist.permissions.clipboard)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 hover:bg-white/10 disabled:opacity-40 text-white/85"
                title="Yerel panonu karşıya gönder"
              >
                <Clipboard className="w-3.5 h-3.5 text-emerald-300" />
                <span className="hidden lg:inline">{clipboardToast || 'Pano Gönder'}</span>
              </button>
              <button
                type="button"
                onClick={pullRemoteClipboard}
                disabled={!stream || (isControlling && !remoteAssist.permissions.clipboard)}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40 text-sky-300"
                title="Karşı bilgisayardan panoyu çek"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCaptureSnapshot}
              disabled={!stream}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white/85 transition"
              title="Anlık Ekran Görüntüsü Al"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/85 transition"
              title="Dosya Gönder (veya pencereye sürükle-bırak)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowShortcuts((v) => !v)}
              className={`p-2 rounded-xl transition ${
                showShortcuts
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
              title="Hızlı Kısayollar Çubuğu"
            >
              <Zap className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowKeyboard((v) => !v)}
              className={`p-2 rounded-xl transition ${
                showKeyboard
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                  : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
              title="Ekran Klavyesini Aç/Kapat"
            >
              <Keyboard className="w-4 h-4" />
            </button>

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

        {/* Snapshot Quick-Send Banner */}
        {pendingSnapshotUrl && (
          <div className="px-4 py-1.5 border-b border-emerald-400/30 bg-emerald-500/15 flex items-center justify-between gap-3 text-xs text-emerald-100 shrink-0">
            <span>📸 Ekran görüntüsü alındı ve panoya kopyalandı.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sendScreenshotToDirectPartner(pendingSnapshotUrl);
                  setPendingSnapshotUrl(null);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition"
              >
                DM&apos;e Gönder
              </button>
              <button
                type="button"
                onClick={() => setPendingSnapshotUrl(null)}
                className="text-white/60 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Quick Shortcuts & Unicode Text Sender Bar */}
        {showShortcuts && (
          <div className="px-4 py-2 border-b border-white/10 bg-[#0f131d] flex flex-wrap items-center justify-between gap-2 shrink-0 select-none">
            <div className="flex flex-wrap items-center gap-1">
              {[
                { label: 'Ctrl+C', mods: ['ctrl'] as const, key: 'c', code: 'KeyC', title: 'Kopyala' },
                { label: 'Ctrl+V', mods: ['ctrl'] as const, key: 'v', code: 'KeyV', title: 'Yapıştır' },
                { label: 'Ctrl+X', mods: ['ctrl'] as const, key: 'x', code: 'KeyX', title: 'Kes' },
                { label: 'Ctrl+Z', mods: ['ctrl'] as const, key: 'z', code: 'KeyZ', title: 'Geri Al' },
                { label: 'Ctrl+A', mods: ['ctrl'] as const, key: 'a', code: 'KeyA', title: 'Tümünü Seç' },
                { label: 'Alt+Tab', mods: ['alt'] as const, key: 'Tab', code: 'Tab', title: 'Pencere Değiştir' },
                { label: 'Alt+F4', mods: ['alt'] as const, key: 'F4', code: 'F4', title: 'Pencereyi Kapat' },
                { label: 'Win+D', mods: ['meta'] as const, key: 'd', code: 'KeyD', title: 'Masaüstünü Göster' },
                { label: 'Win+R', mods: ['meta'] as const, key: 'r', code: 'KeyR', title: 'Çalıştır' },
                { label: 'Win+E', mods: ['meta'] as const, key: 'e', code: 'KeyE', title: 'Dosya Gezgini' },
                { label: 'Win+Shift+S', mods: ['meta', 'shift'] as const, key: 's', code: 'KeyS', title: 'Ekran Alıntısı' },
                { label: 'PrtSc', mods: [] as const, key: 'PrintScreen', code: 'PrintScreen', title: 'PrintScreen' },
                { label: 'Home', mods: [] as const, key: 'Home', code: 'Home', title: 'Home' },
                { label: 'End', mods: [] as const, key: 'End', code: 'End', title: 'End' },
                { label: 'PgUp', mods: [] as const, key: 'PageUp', code: 'PageUp', title: 'PageUp' },
                { label: 'PgDn', mods: [] as const, key: 'PageDown', code: 'PageDown', title: 'PageDown' },
                { label: 'Görev Yön.', mods: ['ctrl', 'shift'] as const, key: 'Escape', code: 'Escape', title: 'Ctrl+Shift+Esc' },
                { label: 'Esc', mods: [] as const, key: 'Escape', code: 'Escape', title: 'Escape' },
                { label: 'Del', mods: [] as const, key: 'Delete', code: 'Delete', title: 'Delete' },
              ].map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => sendKeyCombo([...sc.mods], sc.key, sc.code)}
                  title={sc.title}
                  className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-sky-500/25 disabled:opacity-40 border border-white/10 hover:border-sky-400/40 text-[10px] font-mono text-white/85 transition"
                >
                  {sc.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={handleSendQuickText}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                disabled={!canSendPointerControl}
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="Unicode metin gönder (ğüşıöç)..."
                className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-white/35 outline-none focus:border-sky-400/50 w-44 sm:w-56 disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={!canSendPointerControl || !quickText}
                className="px-2.5 py-1 rounded-lg bg-sky-500/25 hover:bg-sky-500/40 disabled:opacity-40 border border-sky-400/30 text-sky-200 text-xs font-semibold flex items-center gap-1 transition"
                title="Metni karşı bilgisayara yazdır"
              >
                <Send className="w-3 h-3" />
                <span>Gönder</span>
              </button>
            </form>
          </div>
        )}

        {/* Windows UAC / Administrator Tip Banner */}
        {showUacTip && (
          <div className="px-4 py-1.5 border-b border-amber-400/20 bg-amber-500/10 flex items-center justify-between gap-3 text-[11px] text-amber-100/90 shrink-0 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="leading-snug truncate">
                <strong className="text-amber-300">İpucu:</strong> Karşı bilgisayarda Yönetici (UAC) pencerelerine müdahale edebilmek için Çakma&apos;yı <strong>&ldquo;Yönetici olarak çalıştır&rdquo;</strong> ile başlatın. Acil kesme kısayolu: <span className="font-mono">Ctrl+Alt+Esc</span> / <span className="font-mono">Pause</span>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowUacTip(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-amber-200/70 hover:text-white transition shrink-0"
              title="İpucunu Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Remote Screen Canvas Viewport */}
        <div
          ref={viewportRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            panDragRef.current = null;
            if (overlayTool === 'laser') {
              setLocalLaserPos(null);
              sendRemoteLaser(0, 0, false);
            }
          }}
          onWheel={handleWheel}
          onContextMenu={(e) => {
            if (canSendPointerControl) e.preventDefault();
          }}
          className={`relative flex-1 bg-black flex items-center justify-center overflow-hidden ${
            panMode && zoom > 1
              ? 'cursor-grab active:cursor-grabbing'
              : canSendPointerControl || overlayTool !== 'none'
              ? 'cursor-crosshair'
              : 'cursor-default'
          }`}
        >
          {stream ? (
            <div
              className="w-full h-full relative"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setVideoDims({ w: v.videoWidth, h: v.videoHeight });
                  }
                }}
                onResize={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                    setVideoDims({ w: v.videoWidth, h: v.videoHeight });
                  }
                }}
                className="w-full h-full object-contain pointer-events-none select-none"
              />

              {/* Aligned Video Content Surface for SVG Annotations & Laser */}
              {contentRect.width > 0 && contentRect.height > 0 && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: `${contentRect.left}px`,
                    top: `${contentRect.top}px`,
                    width: `${contentRect.width}px`,
                    height: `${contentRect.height}px`,
                  }}
                >
                  <svg
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    className="w-full h-full overflow-visible"
                  >
                    <defs>
                      {ANNOTATION_COLORS.map((clr) => (
                        <marker
                          key={clr}
                          id={`ra-arrow-${clr.slice(1)}`}
                          viewBox="0 0 10 10"
                          refX="8"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1 L 10 5 L 0 9 z" fill={clr} />
                        </marker>
                      ))}
                    </defs>
                    {allStrokes.map((st) => {
                      if (!st.points || st.points.length < 2) return null;
                      const p0 = st.points[0];
                      const p1 = st.points[st.points.length - 1];
                      if (st.tool === 'arrow') {
                        const markerId = `ra-arrow-${st.color.replace('#', '')}`;
                        return (
                          <line
                            key={st.id}
                            x1={p0.x * 1000}
                            y1={p0.y * 1000}
                            x2={p1.x * 1000}
                            y2={p1.y * 1000}
                            stroke={st.color}
                            strokeWidth={4}
                            strokeLinecap="round"
                            markerEnd={`url(#${markerId})`}
                          />
                        );
                      }
                      if (st.tool === 'rect') {
                        const rx = Math.min(p0.x, p1.x) * 1000;
                        const ry = Math.min(p0.y, p1.y) * 1000;
                        const rw = Math.abs(p1.x - p0.x) * 1000;
                        const rh = Math.abs(p1.y - p0.y) * 1000;
                        return (
                          <rect
                            key={st.id}
                            x={rx}
                            y={ry}
                            width={rw}
                            height={rh}
                            fill="none"
                            stroke={st.color}
                            strokeWidth={4}
                            rx={6}
                          />
                        );
                      }
                      const d = st.points
                        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x * 1000} ${pt.y * 1000}`)
                        .join(' ');
                      return (
                        <path
                          key={st.id}
                          d={d}
                          fill="none"
                          stroke={st.color}
                          strokeWidth={4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </svg>

                  {(localLaserPos || remoteLaser?.active) && (
                    <div
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-20"
                      style={{
                        left: `${((localLaserPos?.x ?? remoteLaser?.x ?? 0.5) * 100).toFixed(2)}%`,
                        top: `${((localLaserPos?.y ?? remoteLaser?.y ?? 0.5) * 100).toFixed(2)}%`,
                      }}
                    >
                      <div className="w-5 h-5 rounded-full bg-rose-500/80 ring-4 ring-rose-400/40 animate-ping absolute inset-0" />
                      <div className="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white shadow-[0_0_16px_rgba(244,63,94,0.95)] relative" />
                    </div>
                  )}
                </div>
              )}
            </div>
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

        {/* Toggleable On-Screen Virtual Keyboard */}
        {showKeyboard && (
          <div className="px-3 py-2.5 border-t border-white/10 bg-[#10131e] select-none shrink-0 space-y-1.5">
            <div className="flex flex-wrap items-center justify-center gap-1">
              {[
                { label: 'Esc', key: 'Escape', code: 'Escape' },
                { label: 'F1', key: 'F1', code: 'F1' },
                { label: 'F2', key: 'F2', code: 'F2' },
                { label: 'F3', key: 'F3', code: 'F3' },
                { label: 'F4', key: 'F4', code: 'F4' },
                { label: 'F5', key: 'F5', code: 'F5' },
                { label: 'F6', key: 'F6', code: 'F6' },
                { label: 'F7', key: 'F7', code: 'F7' },
                { label: 'F8', key: 'F8', code: 'F8' },
                { label: 'F9', key: 'F9', code: 'F9' },
                { label: 'F10', key: 'F10', code: 'F10' },
                { label: 'F11', key: 'F11', code: 'F11' },
                { label: 'F12', key: 'F12', code: 'F12' },
                { label: 'Del', key: 'Delete', code: 'Delete' },
                { label: '⌫ Sil', key: 'Backspace', code: 'Backspace' },
              ].map((k) => (
                <button
                  key={k.code}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => handleVirtualKey(k.key, k.code)}
                  className="px-2 py-1 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-[11px] font-mono text-white/90 transition"
                >
                  {k.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '-'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => handleVirtualKey(ch, `Digit${ch}`)}
                  className="min-w-[32px] px-2 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-xs font-semibold text-white transition"
                >
                  {ch}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                disabled={!canSendPointerControl}
                onClick={() => handleVirtualKey('Tab', 'Tab')}
                className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/10 text-[11px] font-semibold text-white/90 transition"
              >
                Tab
              </button>
              {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => handleVirtualKey(stickyMods.shift ? ch : ch.toLowerCase(), `Key${ch}`)}
                  className="min-w-[32px] px-2 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-xs font-semibold text-white transition"
                >
                  {ch}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                disabled={!canSendPointerControl}
                onClick={() => handleVirtualKey('CapsLock', 'CapsLock')}
                className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/10 text-[11px] font-semibold text-white/90 transition"
              >
                Caps
              </button>
              {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => handleVirtualKey(stickyMods.shift ? ch : ch.toLowerCase(), `Key${ch}`)}
                  className="min-w-[32px] px-2 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-xs font-semibold text-white transition"
                >
                  {ch}
                </button>
              ))}
              <button
                type="button"
                disabled={!canSendPointerControl}
                onClick={() => handleVirtualKey('Enter', 'Enter')}
                className="px-3 py-1.5 rounded-md bg-emerald-500/25 hover:bg-emerald-500/40 disabled:opacity-40 border border-emerald-400/30 text-[11px] font-bold text-emerald-200 transition"
              >
                Enter ↵
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                disabled={!canSendPointerControl}
                onClick={() => setStickyMods((s) => ({ ...s, shift: !s.shift }))}
                className={`px-3 py-1.5 rounded-md border text-[11px] font-bold transition ${
                  stickyMods.shift
                    ? 'bg-sky-500 text-white border-sky-400'
                    : 'bg-white/10 hover:bg-white/20 text-white/90 border-white/10'
                }`}
              >
                Shift
              </button>
              {['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', '.'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => handleVirtualKey(stickyMods.shift ? ch : ch.toLowerCase(), `Key${ch}`)}
                  className="min-w-[32px] px-2 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-xs font-semibold text-white transition"
                >
                  {ch}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1">
              {(
                [
                  { id: 'ctrl', label: 'Ctrl' },
                  { id: 'meta', label: 'Win' },
                  { id: 'alt', label: 'Alt' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => setStickyMods((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  className={`px-3 py-1.5 rounded-md border text-[11px] font-bold transition ${
                    stickyMods[m.id]
                      ? 'bg-sky-500 text-white border-sky-400'
                      : 'bg-white/10 hover:bg-white/20 text-white/90 border-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                disabled={!canSendPointerControl}
                onClick={() => handleVirtualKey(' ', 'Space')}
                className="w-40 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-[11px] font-semibold text-white/80 transition"
              >
                Boşluk
              </button>
              {[
                { label: '←', key: 'ArrowLeft', code: 'ArrowLeft' },
                { label: '↑', key: 'ArrowUp', code: 'ArrowUp' },
                { label: '↓', key: 'ArrowDown', code: 'ArrowDown' },
                { label: '→', key: 'ArrowRight', code: 'ArrowRight' },
              ].map((a) => (
                <button
                  key={a.code}
                  type="button"
                  disabled={!canSendPointerControl}
                  onClick={() => handleVirtualKey(a.key, a.code)}
                  className="px-2.5 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-xs font-bold text-white transition"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
