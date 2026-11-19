export interface BlurredWebcamController {
  stream: MediaStream;
  setBlurred: (blurred: boolean) => void;
  isBlurred: () => boolean;
  stop: () => void;
}

/**
 * Wraps a raw camera MediaStream with a zero-dependency Canvas2D center-portrait focus blur.
 */
export function createBlurredWebcamStream(
  rawStream: MediaStream,
  initiallyBlurred = true
): BlurredWebcamController {
  let blurred = initiallyBlurred;
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
      if (blurred) {
        ctx.save();
        ctx.filter = 'blur(14px) brightness(0.88)';
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();

        // Crisp centered oval spotlight for the speaker portrait
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(width / 2, height * 0.54, width * 0.34, height * 0.45, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, width, height);
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
      blurred = next;
    },
    isBlurred: () => blurred,
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
