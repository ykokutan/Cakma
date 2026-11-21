import React, { useCallback, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import type { VoiceScreenAnnotationStroke } from '../../types';

interface ScreenAnnotationOverlayProps {
  channelId: string;
  targetSharerId: string;
  active: boolean;
  color: string;
  clearSignal: number;
}

interface TimedStroke extends VoiceScreenAnnotationStroke {
  expiresAt: number;
}

const STROKE_TTL_MS = 15_000;

export const ScreenAnnotationOverlay: React.FC<ScreenAnnotationOverlayProps> = ({
  channelId,
  targetSharerId,
  active,
  color,
  clearSignal,
}) => {
  const { subscribeVoiceScreenAnnotations, sendVoiceScreenAnnotation } = useSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<TimedStroke[]>([]);
  const draftStrokeRef = useRef<TimedStroke | null>(null);
  const isDrawingRef = useRef(false);
  const prevClearSignalRef = useRef(clearSignal);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawStroke = (st: VoiceScreenAnnotationStroke) => {
      if (!st.points || st.points.length === 0) return;
      ctx.save();
      ctx.strokeStyle = st.color || '#f43f5e';
      ctx.lineWidth = (st.width || 3) * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      st.points.forEach((pt, idx) => {
        const px = pt.x * canvas.width;
        const py = pt.y * canvas.height;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (st.points.length === 1) {
        const px = st.points[0].x * canvas.width;
        const py = st.points[0].y * canvas.height;
        ctx.lineTo(px + 0.5, py + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    };

    const now = Date.now();
    strokesRef.current = strokesRef.current.filter((s) => s.expiresAt > now);
    strokesRef.current.forEach(drawStroke);
    if (draftStrokeRef.current) drawStroke(draftStrokeRef.current);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeVoiceScreenAnnotations((ev) => {
      if (ev.channelId !== channelId || ev.targetSharerId !== targetSharerId) return;
      if (ev.stroke?.kind === 'clear') {
        strokesRef.current = [];
        draftStrokeRef.current = null;
        redraw();
        return;
      }
      if (ev.stroke?.points && ev.stroke.points.length > 0) {
        strokesRef.current.push({
          ...ev.stroke,
          expiresAt: Date.now() + STROKE_TTL_MS,
        });
        redraw();
      }
    });
    return unsubscribe;
  }, [channelId, targetSharerId, subscribeVoiceScreenAnnotations, redraw]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (strokesRef.current.length > 0) redraw();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => redraw());
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [redraw]);

  useEffect(() => {
    if (clearSignal !== prevClearSignalRef.current) {
      prevClearSignalRef.current = clearSignal;
      strokesRef.current = [];
      draftStrokeRef.current = null;
      redraw();
      sendVoiceScreenAnnotation(channelId, targetSharerId, {
        kind: 'clear',
        color,
        width: 0,
        points: [],
      });
    }
  }, [clearSignal, channelId, targetSharerId, color, redraw, sendVoiceScreenAnnotation]);

  const toNormPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))),
    };
  };

  const commitDraft = () => {
    const draft = draftStrokeRef.current;
    draftStrokeRef.current = null;
    if (!draft || draft.points.length === 0) return;
    const stamped: TimedStroke = {
      ...draft,
      expiresAt: Date.now() + STROKE_TTL_MS,
    };
    strokesRef.current.push(stamped);
    sendVoiceScreenAnnotation(channelId, targetSharerId, {
      kind: draft.kind,
      color: draft.color,
      width: draft.width,
      points: draft.points,
    });
    redraw();
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={(e) => {
        if (!active) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        isDrawingRef.current = true;
        draftStrokeRef.current = {
          kind: 'draw',
          color,
          width: 3,
          points: [toNormPoint(e)],
          expiresAt: Date.now() + STROKE_TTL_MS,
        };
        redraw();
      }}
      onPointerMove={(e) => {
        if (!active || !isDrawingRef.current || !draftStrokeRef.current) return;
        e.stopPropagation();
        const pt = toNormPoint(e);
        draftStrokeRef.current.points.push(pt);
        redraw();
        if (draftStrokeRef.current.points.length >= 40) {
          commitDraft();
          draftStrokeRef.current = {
            kind: 'draw',
            color,
            width: 3,
            points: [pt],
            expiresAt: Date.now() + STROKE_TTL_MS,
          };
        }
      }}
      onPointerUp={(e) => {
        if (!isDrawingRef.current) return;
        e.stopPropagation();
        isDrawingRef.current = false;
        commitDraft();
      }}
      onPointerCancel={() => {
        isDrawingRef.current = false;
        draftStrokeRef.current = null;
        redraw();
      }}
      className={`absolute inset-0 w-full h-full z-15 ${
        active ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
    />
  );
};
