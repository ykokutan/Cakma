export type VirtualBgMode = 'none' | 'blur-soft' | 'blur-strong' | 'studio-dim';

export interface BlurredWebcamController {
  stream: MediaStream;
  setBlurred: (blurred: boolean) => void;
  isBlurred: () => boolean;
  setMode: (mode: VirtualBgMode) => void;
  getMode: () => VirtualBgMode;
  stop: () => void;
}

/**
 * Wraps a raw camera MediaStream with Canvas2D virtual background modes:
 * - none: passthrough draw
 * - blur-soft: light halo bokeh behind speaker
 * - blur-strong: deep privacy bokeh behind speaker
 * - studio-dim: darkened background vignette + sharp portrait center
 */
export function createBlurredWebcamStream(
  rawStream: MediaStream,
  initiallyBlurredOrMode: boolean | VirtualBgMode = true
): BlurredWebcamController {
  let mode: VirtualBgMode =
    typeof initiallyBlurredOrMode === 'boolean'
      ? initiallyBlurredOrMode
        ? 'blur-soft'
        : 'none'
      : initiallyBlurredOrMode;
  let stopped = false;
  let rafId = 0;

  const video = document.createElement('video');
  video.srcObject = rawStream;
  video.muted = true;
  video.playsInline = true;
  void video.play().catch(() => {});

  const trackSettings = rawStream.getVideoTracks()[0]?.getSettings?.();
  const width = trackSettings?.width || 640;
  const height = trackSettings?.height || 480;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const renderFrame = () => {
    if (stopped) return;
    if (ctx && video.readyState >= 2) {
      if (mode === 'none') {
        ctx.drawImage(video, 0, 0, width, height);
      } else {
        ctx.save();
        if (mode === 'blur-strong') {
          ctx.filter = 'blur(22px) brightness(0.78)';
        } else if (mode === 'studio-dim') {
          ctx.filter = 'blur(10px) brightness(0.45) contrast(1.1)';
        } else {
          ctx.filter = 'blur(12px) brightness(0.88)';
        }
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();

        // Crisp centered oval spotlight for the speaker portrait
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(width / 2, height * 0.54, width * 0.34, height * 0.45, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();
      }
    }
    rafId = window.requestAnimationFrame(renderFrame);
  };

  rafId = window.requestAnimationFrame(renderFrame);

  const canvasStream = canvas.captureStream(24);
  const audioTracks = rawStream.getAudioTracks();
  for (const at of audioTracks) {
    canvasStream.addTrack(at);
  }

  return {
    stream: canvasStream,
    setBlurred: (next: boolean) => {
      mode = next ? (mode === 'none' ? 'blur-soft' : mode) : 'none';
    },
    isBlurred: () => mode !== 'none',
    setMode: (nextMode: VirtualBgMode) => {
      mode = nextMode;
    },
    getMode: () => mode,
    stop: () => {
      stopped = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      canvasStream.getVideoTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
