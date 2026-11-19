import type {
  DirectScreenShareOptions,
  RemoteAssistAnnotationStroke,
} from '../types';

export interface VideoContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Compute rendered video rectangle under CSS `object-contain` inside a container. */
export function computeVideoContentRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number
): VideoContentRect {
  const cw = Math.max(0, containerWidth || 0);
  const ch = Math.max(0, containerHeight || 0);
  if (cw <= 0 || ch <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const vw = videoWidth > 0 ? videoWidth : cw;
  const vh = videoHeight > 0 ? videoHeight : ch;
  const videoAspect = vw / vh;
  const rectAspect = cw / ch;

  let renderW = cw;
  let renderH = ch;
  let left = 0;
  let top = 0;

  if (rectAspect > videoAspect) {
    renderW = ch * videoAspect;
    left = (cw - renderW) / 2;
  } else {
    renderH = cw / videoAspect;
    top = (ch - renderH) / 2;
  }

  return { left, top, width: renderW, height: renderH };
}

/**
 * Map a pointer event client coordinate in the viewport to normalized [0..1]
 * coordinates on the actual rendered video surface, accounting for letterboxing,
 * zoom factor, and pan offsets around the viewport center.
 */
export function clientPointToNormalizedVideo(
  clientX: number,
  clientY: number,
  viewportRect: { left: number; top: number; width: number; height: number },
  videoWidth: number,
  videoHeight: number,
  zoom = 1,
  panX = 0,
  panY = 0
): { x: number; y: number } | null {
  if (viewportRect.width <= 0 || viewportRect.height <= 0 || zoom <= 0) {
    return null;
  }

  const centerX = viewportRect.left + viewportRect.width / 2;
  const centerY = viewportRect.top + viewportRect.height / 2;
  const localX = (clientX - centerX - panX) / zoom + viewportRect.width / 2;
  const localY = (clientY - centerY - panY) / zoom + viewportRect.height / 2;

  const content = computeVideoContentRect(
    viewportRect.width,
    viewportRect.height,
    videoWidth,
    videoHeight
  );
  if (content.width <= 0 || content.height <= 0) return null;

  const relX = (localX - content.left) / content.width;
  const relY = (localY - content.top) / content.height;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

  return { x: relX, y: relY };
}

/** Clamp pan offsets to keep scaled video edges within the viewport bounds. */
export function clampPanOffset(
  panX: number,
  panY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): { panX: number; panY: number } {
  if (zoom <= 1 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { panX: 0, panY: 0 };
  }
  const maxX = ((zoom - 1) * viewportWidth) / 2;
  const maxY = ((zoom - 1) * viewportHeight) / 2;
  return {
    panX: Math.min(maxX, Math.max(-maxX, panX)),
    panY: Math.min(maxY, Math.max(-maxY, panY)),
  };
}

/** Build `getDisplayMedia` constraints & target bitrate for 1-on-1 share presets. */
export function getDirectScreenShareConstraints(
  opts?: Partial<DirectScreenShareOptions>
): {
  displayMediaOptions: DisplayMediaStreamOptions;
  maxBitrateBps: number;
  contentHint: 'text' | 'detail' | 'motion';
} {
  const preset = opts?.preset || 'balanced';
  const shareAudio = Boolean(opts?.shareAudio);

  switch (preset) {
    case 'sharp-text':
      return {
        displayMediaOptions: {
          video: {
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 },
            frameRate: { ideal: 15, max: 20 },
          },
          audio: shareAudio,
        },
        maxBitrateBps: 2_500_000,
        contentHint: 'text',
      };
    case 'smooth-60':
      return {
        displayMediaOptions: {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60, max: 60 },
          },
          audio: shareAudio,
        },
        maxBitrateBps: 6_500_000,
        contentHint: 'motion',
      };
    case 'source':
      return {
        displayMediaOptions: {
          video: {
            frameRate: { ideal: 60, max: 60 },
          },
          audio: shareAudio,
        },
        maxBitrateBps: 8_000_000,
        contentHint: 'detail',
      };
    case 'balanced':
    default:
      return {
        displayMediaOptions: {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: shareAudio,
        },
        maxBitrateBps: 4_000_000,
        contentHint: 'detail',
      };
  }
}

/** Format duration in seconds as `MM:SS` (or `H:MM:SS` for >= 1 hour). */
export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Filter out expired live annotations beyond TTL. */
export function pruneExpiredAnnotations(
  strokes: RemoteAssistAnnotationStroke[],
  nowMs: number,
  ttlMs = 4500
): RemoteAssistAnnotationStroke[] {
  return strokes.filter((s) => nowMs - s.createdAt < ttlMs);
}

/** Classify 1-on-1 call network quality based on RTT and packet loss percentage. */
export function classifyConnectionQuality(
  rttMs: number,
  packetLossPct: number
): { level: 'excellent' | 'good' | 'fair' | 'poor'; label: string } {
  if (rttMs >= 250 || packetLossPct >= 5) {
    return { level: 'poor', label: 'Zayıf' };
  }
  if (rttMs >= 130 || packetLossPct >= 2) {
    return { level: 'fair', label: 'Orta' };
  }
  if (rttMs >= 60 || packetLossPct >= 0.5) {
    return { level: 'good', label: 'İyi' };
  }
  return { level: 'excellent', label: 'Mükemmel' };
}
