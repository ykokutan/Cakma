import { getAuthHeaders } from './authFetch';
import { cleanWhisperTranscript, downsampleTo16kHz } from './liveCaptionHelpers';

type WorkerMsg =
  | { type: 'progress'; progress: number; status: string; file?: string }
  | { type: 'ready' }
  | { type: 'result'; id: string; text: string }
  | { type: 'error'; id?: string; message: string };

const transcriptCache = new Map<string, string>();
let sharedWorker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
const progressListeners = new Set<(pct: number) => void>();
const pendingJobs = new Map<
  string,
  { resolve: (text: string) => void; reject: (err: Error) => void }
>();

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return win.AudioContext || win.webkitAudioContext || null;
}

function ensureWorkerReady(onProgress?: (pct: number) => void): Promise<Worker> {
  if (onProgress) progressListeners.add(onProgress);

  if (!sharedWorker) {
    sharedWorker = new Worker(
      new URL('../workers/whisperCaptionWorker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  const worker = sharedWorker;

  if (!workerReadyPromise) {
    workerReadyPromise = new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerMsg>) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'progress') {
          const pct = Math.max(0, Math.min(100, msg.progress ?? 0));
          progressListeners.forEach((cb) => cb(pct));
          return;
        }

        if (msg.type === 'ready') {
          progressListeners.forEach((cb) => cb(100));
          resolve();
          return;
        }

        if (msg.type === 'error') {
          if (msg.id) {
            const job = pendingJobs.get(msg.id);
            if (job) {
              pendingJobs.delete(msg.id);
              job.reject(new Error(msg.message || 'Ses çözümleme hatası'));
            }
          } else {
            workerReadyPromise = null;
            reject(new Error(msg.message || 'Whisper modeli yüklenemedi'));
          }
          return;
        }

        if (msg.type === 'result') {
          const job = pendingJobs.get(msg.id);
          if (job) {
            pendingJobs.delete(msg.id);
            job.resolve(msg.text || '');
          }
        }
      };

      worker.postMessage({ type: 'init' });
    });
  }

  return workerReadyPromise.then(() => worker);
}

export async function transcribeVoiceNoteUrl(
  url: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const cached = transcriptCache.get(url);
  if (cached) return cached;

  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx) {
    throw new Error('Tarayıcı Web Audio çözümlemeyi desteklemiyor.');
  }

  const response = await fetch(url, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Ses dosyası indirilemedi (${response.status})`);
  }

  const rawBuffer = await response.arrayBuffer();
  const audioCtx = new AudioCtx();
  let pcm16k: Float32Array;
  try {
    const audioBuffer = await audioCtx.decodeAudioData(rawBuffer);
    const channelData = audioBuffer.getChannelData(0);
    pcm16k = downsampleTo16kHz(new Float32Array(channelData), audioBuffer.sampleRate);
  } finally {
    await audioCtx.close().catch(() => {});
  }

  if (pcm16k.length === 0) {
    throw new Error('Ses kaydında çözümlenecek veri bulunamadı.');
  }

  try {
    const worker = await ensureWorkerReady(onProgress);
    const id = `vn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rawText = await new Promise<string>((resolve, reject) => {
      pendingJobs.set(id, { resolve, reject });
      worker.postMessage({ type: 'transcribe', id, audio: pcm16k }, [pcm16k.buffer]);
    });
    const cleaned = cleanWhisperTranscript(rawText);
    if (cleaned) {
      transcriptCache.set(url, cleaned);
    }
    return cleaned;
  } finally {
    if (onProgress) progressListeners.delete(onProgress);
  }
}
