import React, { useRef, useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { X, Trash2, Download, Palette } from 'lucide-react';

interface WhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName?: string;
}

const COLORS = [
  { id: 'white', value: '#ffffff', label: 'Beyaz' },
  { id: 'red', value: '#ef4444', label: 'Kırmızı' },
  { id: 'green', value: '#10b981', label: 'Yeşil' },
  { id: 'blue', value: '#3b82f6', label: 'Mavi' },
  { id: 'yellow', value: '#f59e0b', label: 'Sarı' },
  { id: 'purple', value: '#a855f7', label: 'Mor' },
  { id: 'eraser', value: '#0f172a', label: 'Silgi' },
];

const SIZES = [2, 4, 8, 16];

export const WhiteboardModal: React.FC<WhiteboardModalProps> = ({
  isOpen,
  onClose,
  channelName,
}) => {
  const { socket } = useSocket();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill dark background once
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const handleRemoteDraw = (data: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      color: string;
      size: number;
    }) => {
      ctx.beginPath();
      ctx.moveTo(data.x0, data.y0);
      ctx.lineTo(data.x1, data.y1);
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    const handleRemoteClear = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    socket?.on('whiteboard_draw', handleRemoteDraw);
    socket?.on('whiteboard_clear', handleRemoteClear);

    return () => {
      socket?.off('whiteboard_draw', handleRemoteDraw);
      socket?.off('whiteboard_clear', handleRemoteClear);
    };
  }, [isOpen, socket]);

  if (!isOpen) return null;

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    lastPosRef.current = getCanvasCoords(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPosRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPos = getCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    socket?.emit('whiteboard_draw', {
      x0: lastPosRef.current.x,
      y0: lastPosRef.current.y,
      x1: currentPos.x,
      y1: currentPos.y,
      color: selectedColor,
      size: brushSize,
    });

    lastPosRef.current = currentPos;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  };

  const handleClear = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    socket?.emit('whiteboard_clear');
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cizim-${channelName || 'Ortak-Tuval'}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 px-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Ortak Çizim & Tuval (Canlı)
                <span className="text-[10px] font-mono bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">
                  Gerçek Zamanlı
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition"
              title="Çizimi İndir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>İndir</span>
            </button>

            <button
              onClick={handleClear}
              className="px-3 py-1.5 rounded-full bg-red-500/15 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
              title="Tuvali Temizle"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Temizle</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition ml-2"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2.5 border-b border-white/5 bg-black/40 flex items-center justify-between flex-wrap gap-4 select-none">
          {/* Colors */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50 mr-1 font-medium">Renk:</span>
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedColor(c.value)}
                style={{ backgroundColor: c.value }}
                className={`w-7 h-7 rounded-full border transition transform hover:scale-110 ${
                  selectedColor === c.value
                    ? 'ring-2 ring-white scale-110 border-white'
                    : 'border-white/20'
                }`}
                title={c.label}
              />
            ))}
          </div>

          {/* Sizes */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50 mr-1 font-medium">Fırça:</span>
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setBrushSize(s)}
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition border ${
                  brushSize === s
                    ? 'bg-blue-500 text-white border-blue-400'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border-white/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Body */}
        <div className="p-4 bg-slate-950 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={854}
            height={480}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full max-w-[854px] aspect-video rounded-2xl cursor-crosshair border border-white/10 shadow-2xl touch-none"
          />
        </div>
      </div>
    </div>
  );
};
