import { env, pipeline, type ProgressInfo } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

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

let pipelinePromise: Promise<AsrTranscriber> | null = null;

async function getTranscriber(): Promise<AsrTranscriber> {
  if (!pipelinePromise) {
    const progressCallback = (info: ProgressInfo) => {
      const progress =
        'progress' in info && typeof info.progress === 'number'
          ? Math.round(info.progress)
          : 0;
      const file = 'file' in info && typeof info.file === 'string' ? info.file : undefined;
      self.postMessage({
        type: 'progress',
        progress,
        status: info.status || 'progress',
        file,
      });
    };

    const createPipeline = pipeline as unknown as (
      task: 'automatic-speech-recognition',
      model: string,
      options: {
        dtype: string;
        device: string;
        progress_callback: (info: ProgressInfo) => void;
      }
    ) => Promise<AsrTranscriber>;

    pipelinePromise = createPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: progressCallback,
    });
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
