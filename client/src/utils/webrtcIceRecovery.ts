export interface IceRecoveryControllerOptions {
  localId: string;
  peerId: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  politeDelayMs?: number;
  onRestart: () => Promise<void>;
}

/**
 * Deterministic tie-breaker so only one peer waits a short grace offset
 * before initiating an overlapping ICE restart offer.
 */
export function isPolitePeer(localId: string, peerId: string): boolean {
  return localId > peerId;
}

/**
 * Coordinates WebRTC ICE restart retries with exponential backoff,
 * attempt limits, and automatic reset once connectivity recovers.
 */
export class IceRecoveryController {
  private readonly localId: string;
  private readonly peerId: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly politeDelayMs: number;
  private readonly onRestart: () => Promise<void>;

  private attempts = 0;
  private inFlight = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingTriggerState: 'failed' | 'disconnected' | null = null;

  constructor(options: IceRecoveryControllerOptions) {
    this.localId = options.localId;
    this.peerId = options.peerId;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 2000;
    this.politeDelayMs = options.politeDelayMs ?? 1500;
    this.onRestart = options.onRestart;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingTriggerState = null;
  }

  handleStateChange(state: RTCIceConnectionState | RTCPeerConnectionState): void {
    if (this.disposed) return;

    if (state === 'connected' || state === 'completed') {
      this.clearTimer();
      this.attempts = 0;
      this.inFlight = false;
      return;
    }

    if (state === 'closed') {
      this.dispose();
      return;
    }

    if (state !== 'failed' && state !== 'disconnected') {
      return;
    }

    if (this.inFlight || this.attempts >= this.maxAttempts) {
      return;
    }

    if (this.timer !== null) {
      if (state === 'failed' && this.pendingTriggerState !== 'failed') {
        this.clearTimer();
      } else {
        return;
      }
    }

    const baseDelay =
      state === 'failed'
        ? this.attempts === 0
          ? 0
          : this.baseDelayMs * Math.pow(2, this.attempts - 1)
        : this.baseDelayMs * Math.pow(2, this.attempts);
    const politeOffset =
      this.attempts === 0 && isPolitePeer(this.localId, this.peerId)
        ? this.politeDelayMs
        : 0;
    const delayMs = baseDelay + politeOffset;

    this.pendingTriggerState = state;
    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      this.pendingTriggerState = null;
      if (this.disposed || this.inFlight || this.attempts >= this.maxAttempts) {
        return;
      }
      this.attempts += 1;
      this.inFlight = true;
      void (async () => {
        try {
          await this.onRestart();
        } catch {
          // Swallow restart errors so the retry budget safely decays instead of throwing unhandled rejections.
        } finally {
          this.inFlight = false;
        }
      })();
    }, delayMs);
  }

  getAttempts(): number {
    return this.attempts;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.inFlight = false;
  }
}
