interface ProgressInfoLike {
  status?: string;
  progress?: number;
  file?: string;
}

type WorkerRequest =
  | { type: 'init' }
  | { type: 'transcribe'; id: string; audio: Float32Array };

interface AsrChunkOutput {
  text?: string;
}

type AsrTranscriber = (
  audio: Float32Array,
  options?: {
    task?: 'transcribe' | 'translate';
    return_timestamps?: boolean;
  }
) => Promise<AsrChunkOutput | AsrChunkOutput[]>;

interface TransformersModuleLike {
  env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
  pipeline: (
    task: 'automatic-speech-recognition',
    model: string,
    options: {
      dtype: string;
      device: string;
      progress_callback: (info: ProgressInfoLike) => void;
    }
  ) => Promise<AsrTranscriber>;
}

const TRANSFORMERS_CDN_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0';

let pipelinePromise: Promise<AsrTranscriber> | null = null;

async function getTranscriber(): Promise<AsrTranscriber> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = (await import(/* @vite-ignore */ TRANSFORMERS_CDN_URL)) as TransformersModuleLike;
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = true;

      const progressCallback = (info: ProgressInfoLike) => {
        const progress = typeof info.progress === 'number' ? Math.round(info.progress) : 0;
        const file = typeof info.file === 'string' ? info.file : undefined;
        self.postMessage({
          type: 'progress',
          progress,
          status: info.status || 'progress',
          file,
        });
      };

      return mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressCallback,
      });
    })();
  }

  return pipelinePromise;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'init') {
    try {
      await getTranscriber();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      pipelinePromise = null;
      const message = err instanceof Error ? err.message : 'Whisper model yuklenemedi';
      self.postMessage({ type: 'error', message });
    }
    return;
  }

  if (data.type === 'transcribe') {
    try {
      const transcriber = await getTranscriber();
      const out = await transcriber(data.audio, {
        task: 'transcribe',
        return_timestamps: false,
      });
      const text = Array.isArray(out)
        ? out
            .map((chunk) => chunk?.text || '')
            .join(' ')
            .trim()
        : String(out?.text || '').trim();
      self.postMessage({ type: 'result', id: data.id, text });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ses cozumleme hatasi';
      self.postMessage({ type: 'error', id: data.id, message });
    }
  }
};
