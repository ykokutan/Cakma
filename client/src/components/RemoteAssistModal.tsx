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
  Keyboard,
  Send,
  Zap,
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
  const pressedKeysRef = useRef<Map<string, { key: string; code: string }>>(new Map());
  const pressedButtonsRef = useRef<Set<number>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [showUacTip, setShowUacTip] = useState(true);
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
  const isRequesting = remoteAssist.status === 'requesting';

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isOpen]);

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

  // Global keyboard & input-release listeners while controlling so focus shifts or Alt+Tab never freeze/stick keys
  useEffect(() => {
    if (!isOpen || !isControlling) {
      releaseAllRemoteInputs();
      return;
    }

    const onWinKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      pressedKeysRef.current.set(e.code, { key: e.key, code: e.code });
      sendRemoteInput({ kind: 'keydown', key: e.key, code: e.code });
    };

    const onWinKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      pressedKeysRef.current.delete(e.code);
      sendRemoteInput({ kind: 'keyup', key: e.key, code: e.code });
    };

    const onWinMouseUp = (e: MouseEvent) => {
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
  }, [isOpen, isControlling]);

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
    pressedButtonsRef.current.add(e.button);
    sendRemoteInput({ kind: 'mousedown', x: coords.x, y: coords.y, button: e.button });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!isControlling) return;
    e.preventDefault();
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    pressedButtonsRef.current.delete(e.button);
    sendRemoteInput({ kind: 'mouseup', x: coords.x, y: coords.y, button: e.button });
  };

  const handleWheel = (e: React.WheelEvent<HTMLVideoElement>) => {
    if (!isControlling) return;
    sendRemoteInput({ kind: 'wheel', delta_y: e.deltaY });
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
    if (!isControlling) return;
    for (const m of mods) {
      const def = MODIFIER_CODE_MAP[m];
      sendRemoteInput({ kind: 'keydown', key: def.key, code: def.code });
    }
    if (mods.length > 0) await delay(25);
    sendRemoteInput({ kind: 'keydown', key, code });
    await delay(35);
    sendRemoteInput({ kind: 'keyup', key, code });
    if (mods.length > 0) await delay(25);
    for (const m of [...mods].reverse()) {
      const def = MODIFIER_CODE_MAP[m];
      sendRemoteInput({ kind: 'keyup', key: def.key, code: def.code });
    }
    containerRef.current?.focus();
  };

  const handleVirtualKey = async (key: string, code: string) => {
    if (!isControlling) return;
    const activeMods = (['ctrl', 'alt', 'shift', 'meta'] as const).filter((m) => stickyMods[m]);
    await sendKeyCombo(activeMods, key, code);
    if (activeMods.length > 0) {
      setStickyMods({ ctrl: false, alt: false, shift: false, meta: false });
    }
  };

  const handleSendQuickText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isControlling || !quickText) return;
    const textToSend = quickText;
    setQuickText('');
    for (const ch of textToSend) {
      const code = ch === ' ' ? 'Space' : ch === '\n' ? 'Enter' : `Key${ch.toUpperCase()}`;
      sendRemoteInput({ kind: 'keydown', key: ch, code });
      await delay(15);
      sendRemoteInput({ kind: 'keyup', key: ch, code });
      await delay(15);
    }
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

  return createPortal(
    <div className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div
        ref={containerRef}
        tabIndex={0}
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
              onClick={() => setShowShortcuts((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                showShortcuts
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                  : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
              title="Hızlı Kısayollar Çubuğu"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kısayollar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowKeyboard((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                showKeyboard
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                  : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
              title="Ekran Klavyesini Aç/Kapat"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Klavye</span>
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

        {/* Quick Shortcuts & Text Sender Bar */}
        {showShortcuts && (
          <div className="px-4 py-2 border-b border-white/10 bg-[#0f131d] flex flex-wrap items-center justify-between gap-2 shrink-0 select-none">
            <div className="flex flex-wrap items-center gap-1.5">
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
                { label: 'Görev Yön.', mods: ['ctrl', 'shift'] as const, key: 'Escape', code: 'Escape', title: 'Ctrl+Shift+Esc' },
                { label: 'Esc', mods: [] as const, key: 'Escape', code: 'Escape', title: 'Escape' },
                { label: 'Del', mods: [] as const, key: 'Delete', code: 'Delete', title: 'Delete' },
              ].map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  disabled={!isControlling}
                  onClick={() => sendKeyCombo([...sc.mods], sc.key, sc.code)}
                  title={sc.title}
                  className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-sky-500/25 disabled:opacity-40 border border-white/10 hover:border-sky-400/40 text-[11px] font-mono text-white/85 transition"
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
                disabled={!isControlling}
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="Karşıya metin gönder..."
                className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-white/35 outline-none focus:border-sky-400/50 w-44 sm:w-56 disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={!isControlling || !quickText}
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
          <div className="px-4 py-2 border-b border-amber-400/20 bg-amber-500/10 flex items-center justify-between gap-3 text-[11px] text-amber-100/90 shrink-0 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="leading-snug">
                <strong className="text-amber-300">İpucu:</strong> Karşı bilgisayarda Yönetici (UAC) penceresi (Görev Yöneticisi, Yönetici CMD vb.) açılırsa Windows güvenlik kısıtlaması (UIPI) gereği standart yetkili Çakma o pencereye girdi gönderemez; Çakma&apos;yı <strong>&ldquo;Yönetici olarak çalıştır&rdquo;</strong> ile açmak bu durumu da çözer.
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
                  disabled={!isControlling}
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
                  disabled={!isControlling}
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
                disabled={!isControlling}
                onClick={() => handleVirtualKey('Tab', 'Tab')}
                className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/10 text-[11px] font-semibold text-white/90 transition"
              >
                Tab
              </button>
              {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={!isControlling}
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
                disabled={!isControlling}
                onClick={() => handleVirtualKey('CapsLock', 'CapsLock')}
                className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/10 text-[11px] font-semibold text-white/90 transition"
              >
                Caps
              </button>
              {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={!isControlling}
                  onClick={() => handleVirtualKey(stickyMods.shift ? ch : ch.toLowerCase(), `Key${ch}`)}
                  className="min-w-[32px] px-2 py-1.5 rounded-md bg-white/[0.07] hover:bg-white/20 disabled:opacity-40 border border-white/10 text-xs font-semibold text-white transition"
                >
                  {ch}
                </button>
              ))}
              <button
                type="button"
                disabled={!isControlling}
                onClick={() => handleVirtualKey('Enter', 'Enter')}
                className="px-3 py-1.5 rounded-md bg-emerald-500/25 hover:bg-emerald-500/40 disabled:opacity-40 border border-emerald-400/30 text-[11px] font-bold text-emerald-200 transition"
              >
                Enter ↵
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                disabled={!isControlling}
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
                  disabled={!isControlling}
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
                  disabled={!isControlling}
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
                disabled={!isControlling}
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
                  disabled={!isControlling}
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
