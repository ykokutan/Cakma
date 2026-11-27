export interface TrimRangeValidation {
  valid: boolean;
  startSec: number;
  endSec: number;
  reason?: string;
}

export function validateTrimRange(startSec: number, endSec: number, totalSec: number): TrimRangeValidation {
  const safeTotal = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 30;
  const start = Math.max(0, Math.min(safeTotal, Number.isFinite(startSec) ? startSec : 0));
  const end = Math.max(0, Math.min(safeTotal, Number.isFinite(endSec) ? endSec : safeTotal));
  if (end - start < 0.5) {
    return {
      valid: false,
      startSec: start,
      endSec: end,
      reason: 'Klip süresi en az 0.5 saniye olmalıdır.',
    };
  }
  return {
    valid: true,
    startSec: Math.round(start * 10) / 10,
    endSec: Math.round(end * 10) / 10,
  };
}

export async function sliceMediaBlobByTime(
  blob: Blob,
  startSec: number,
  endSec: number,
  totalSec: number,
  muteAudio: boolean
): Promise<Blob> {
  const validation = validateTrimRange(startSec, endSec, totalSec);
  if (!validation.valid) {
    throw new Error(validation.reason || 'Geçersiz klip aralığı.');
  }
  const isFullRange =
    validation.startSec <= 0.15 &&
    validation.endSec >= (Number.isFinite(totalSec) && totalSec > 0 ? totalSec - 0.15 : 29.85);

  if (isFullRange && !muteAudio) {
    return blob;
  }

  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    return blob;
  }

  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Video yükleme zaman aşımı')), 6000);
      video.onloadeddata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Video çözümlenemedi'));
      };
    });

    const captureFn =
      (video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream })
        .captureStream ||
      (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
    if (!captureFn) {
      return blob;
    }

    video.currentTime = validation.startSec;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.onseeked = done;
      window.setTimeout(done, 400);
    });

    const rawStream = captureFn.call(video);
    const tracks = muteAudio ? rawStream.getVideoTracks() : rawStream.getTracks();
    const recordStream = new MediaStream(tracks);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(recordStream, { mimeType });
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const recordedPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const out = new Blob(chunks, { type: mimeType });
        resolve(out.size > 0 ? out : blob);
      };
    });

    recorder.start(100);
    await video.play().catch(() => {});

    const durationMs = Math.max(500, Math.round((validation.endSec - validation.startSec) * 1000));
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(poll);
        window.clearTimeout(guardTimer);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        video.pause();
        resolve();
      };
      const poll = window.setInterval(() => {
        if (video.currentTime >= validation.endSec || video.ended) {
          finish();
        }
      }, 60);
      const guardTimer = window.setTimeout(finish, durationMs + 450);
    });

    return await recordedPromise;
  } catch {
    return blob;
  } finally {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {}
    URL.revokeObjectURL(objectUrl);
  }
}
