import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

export interface ClusterBusEnvelope<T = unknown> {
  v: 1;
  nodeId: string;
  event: string;
  payload: T;
  ts: number;
}

export type RespValue = string | number | null | RespValue[] | Error;

export function encodeRespCommand(args: Array<string | number>): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
  for (const rawArg of args) {
    const buf = Buffer.from(String(rawArg), 'utf8');
    parts.push(Buffer.from(`$${buf.length}\r\n`, 'utf8'));
    parts.push(buf);
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  return Buffer.concat(parts);
}

/**
 * Streaming zero-dependency RESP2 parser handling fragmented TCP/TLS packets.
 */
export class RespFrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): RespValue[] {
    if (!chunk || chunk.length === 0) return [];
    this.buffer = this.buffer.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buffer, chunk]);
    const frames: RespValue[] = [];
    while (this.buffer.length > 0) {
      const parsed = this.tryReadValue(0);
      if (!parsed) break;
      frames.push(parsed.value);
      this.buffer = this.buffer.subarray(parsed.nextOffset);
    }
    return frames;
  }

  private tryReadLine(offset: number): { line: string; nextOffset: number } | null {
    const idx = this.buffer.indexOf('\r\n', offset);
    if (idx === -1) return null;
    return {
      line: this.buffer.toString('utf8', offset, idx),
      nextOffset: idx + 2,
    };
  }

  private tryReadValue(offset: number): { value: RespValue; nextOffset: number } | null {
    if (offset >= this.buffer.length) return null;
    const prefix = String.fromCharCode(this.buffer[offset]);

    if (prefix === '+' || prefix === '-' || prefix === ':') {
      const lineRes = this.tryReadLine(offset + 1);
      if (!lineRes) return null;
      if (prefix === '+') return { value: lineRes.line, nextOffset: lineRes.nextOffset };
      if (prefix === '-') return { value: new Error(lineRes.line), nextOffset: lineRes.nextOffset };
      return { value: Number.parseInt(lineRes.line, 10), nextOffset: lineRes.nextOffset };
    }

    if (prefix === '$') {
      const header = this.tryReadLine(offset + 1);
      if (!header) return null;
      const len = Number.parseInt(header.line, 10);
      if (Number.isNaN(len)) return null;
      if (len < 0) return { value: null, nextOffset: header.nextOffset };
      const endOffset = header.nextOffset + len;
      if (this.buffer.length < endOffset + 2) return null;
      const val = this.buffer.toString('utf8', header.nextOffset, endOffset);
      return { value: val, nextOffset: endOffset + 2 };
    }

    if (prefix === '*') {
      const header = this.tryReadLine(offset + 1);
      if (!header) return null;
      const count = Number.parseInt(header.line, 10);
      if (Number.isNaN(count)) return null;
      if (count < 0) return { value: null, nextOffset: header.nextOffset };
      const items: RespValue[] = [];
      let cursor = header.nextOffset;
      for (let i = 0; i < count; i++) {
        const elem = this.tryReadValue(cursor);
        if (!elem) return null;
        items.push(elem.value);
        cursor = elem.nextOffset;
      }
      return { value: items, nextOffset: cursor };
    }

    // Fallback inline line
    const lineRes = this.tryReadLine(offset);
    if (!lineRes) return null;
    return { value: lineRes.line, nextOffset: lineRes.nextOffset };
  }
}

export interface RedisRealtimeBusOptions {
  redisUrl: string;
  channel?: string;
  nodeId?: string;
  reconnectDelayMs?: number;
  onEvent?: (envelope: ClusterBusEnvelope) => void;
  onError?: (err: Error) => void;
}

interface ParsedRedisEndpoint {
  useTls: boolean;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

export function parseRedisConnectionUrl(rawUrl: string): ParsedRedisEndpoint | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') return null;
    const useTls = parsed.protocol === 'rediss:';
    const host = parsed.hostname || '127.0.0.1';
    const port = parsed.port ? Number(parsed.port) : useTls ? 6380 : 6379;
    const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const rawDb = parsed.pathname.replace(/^\/+/, '');
    const dbNum = rawDb ? Number.parseInt(rawDb, 10) : undefined;
    return {
      useTls,
      host,
      port: Number.isFinite(port) && port > 0 ? port : 6379,
      username,
      password,
      db: Number.isFinite(dbNum) && dbNum! >= 0 ? dbNum : undefined,
    };
  } catch {
    return null;
  }
}

export class RedisRealtimeBus {
  readonly nodeId: string;
  readonly channel: string;
  private readonly endpoint: ParsedRedisEndpoint | null;
  private readonly reconnectDelayMs: number;
  private readonly onEvent?: (envelope: ClusterBusEnvelope) => void;
  private readonly onError?: (err: Error) => void;

  private pubSocket: net.Socket | tls.TLSSocket | null = null;
  private subSocket: net.Socket | tls.TLSSocket | null = null;
  private pubReady = false;
  private subReady = false;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private publishedCount = 0;
  private receivedCount = 0;

  constructor(opts: RedisRealtimeBusOptions) {
    this.endpoint = parseRedisConnectionUrl(opts.redisUrl);
    this.channel = String(opts.channel || 'cakma:cluster:v1').trim() || 'cakma:cluster:v1';
    this.nodeId = opts.nodeId || `node-${crypto.randomBytes(6).toString('hex')}`;
    this.reconnectDelayMs = Math.max(500, opts.reconnectDelayMs ?? 3000);
    this.onEvent = opts.onEvent;
    this.onError = opts.onError;
  }

  isConfigured(): boolean {
    return Boolean(this.endpoint);
  }

  isConnected(): boolean {
    return this.pubReady && this.subReady && !this.stopped;
  }

  getStats() {
    return {
      nodeId: this.nodeId,
      channel: this.channel,
      configured: this.isConfigured(),
      connected: this.isConnected(),
      publishedCount: this.publishedCount,
      receivedCount: this.receivedCount,
    };
  }

  async start(): Promise<void> {
    if (!this.endpoint) {
      this.onError?.(new Error('Geçersiz REDIS_URL bağlantısı.'));
      return;
    }
    this.stopped = false;
    await Promise.all([this.connectPublisher(), this.connectSubscriber()]);
  }

  private createRawSocket(ep: ParsedRedisEndpoint): net.Socket | tls.TLSSocket {
    if (ep.useTls) {
      return tls.connect({ host: ep.host, port: ep.port, servername: ep.host });
    }
    return net.createConnection({ host: ep.host, port: ep.port });
  }

  private sendAuthAndSelect(sock: net.Socket | tls.TLSSocket, ep: ParsedRedisEndpoint): void {
    if (ep.password) {
      if (ep.username) {
        sock.write(encodeRespCommand(['AUTH', ep.username, ep.password]));
      } else {
        sock.write(encodeRespCommand(['AUTH', ep.password]));
      }
    }
    if (typeof ep.db === 'number' && ep.db > 0) {
      sock.write(encodeRespCommand(['SELECT', String(ep.db)]));
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      if (!this.pubReady) void this.connectPublisher();
      if (!this.subReady) void this.connectSubscriber();
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  private connectPublisher(): Promise<void> {
    const ep = this.endpoint;
    if (!ep || this.stopped) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const sock = this.createRawSocket(ep);
      const parser = new RespFrameParser();
      this.pubSocket = sock;

      const onConnect = () => {
        this.sendAuthAndSelect(sock, ep);
        this.pubReady = true;
        done();
      };

      sock.once(ep.useTls ? 'secureConnect' : 'connect', onConnect);
      sock.on('data', (chunk: Buffer) => {
        const frames = parser.push(chunk);
        for (const f of frames) {
          if (f instanceof Error) {
            this.onError?.(f);
          }
        }
      });
      sock.on('error', (err: Error) => {
        this.pubReady = false;
        this.onError?.(err);
        done();
      });
      sock.on('close', () => {
        this.pubReady = false;
        if (!this.stopped) this.scheduleReconnect();
        done();
      });
    });
  }

  private connectSubscriber(): Promise<void> {
    const ep = this.endpoint;
    if (!ep || this.stopped) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const sock = this.createRawSocket(ep);
      const parser = new RespFrameParser();
      this.subSocket = sock;

      const onConnect = () => {
        this.sendAuthAndSelect(sock, ep);
        sock.write(encodeRespCommand(['SUBSCRIBE', this.channel]));
        this.subReady = true;
        done();
      };

      sock.once(ep.useTls ? 'secureConnect' : 'connect', onConnect);
      sock.on('data', (chunk: Buffer) => {
        const frames = parser.push(chunk);
        for (const frame of frames) {
          if (frame instanceof Error) {
            this.onError?.(frame);
            continue;
          }
          if (!Array.isArray(frame) || frame.length < 3) continue;
          const kind = String(frame[0] || '').toLowerCase();
          if (kind !== 'message') continue;
          const payloadRaw = frame[2];
          if (typeof payloadRaw !== 'string') continue;
          try {
            const env = JSON.parse(payloadRaw) as ClusterBusEnvelope;
            if (!env || env.v !== 1 || !env.event || env.nodeId === this.nodeId) continue;
            this.receivedCount += 1;
            this.onEvent?.(env);
          } catch {}
        }
      });
      sock.on('error', (err: Error) => {
        this.subReady = false;
        this.onError?.(err);
        done();
      });
      sock.on('close', () => {
        this.subReady = false;
        if (!this.stopped) this.scheduleReconnect();
        done();
      });
    });
  }

  async publish<T = unknown>(event: string, payload: T): Promise<boolean> {
    if (!this.pubReady || !this.pubSocket || this.pubSocket.destroyed || this.stopped) {
      return false;
    }
    const envelope: ClusterBusEnvelope<T> = {
      v: 1,
      nodeId: this.nodeId,
      event,
      payload,
      ts: Date.now(),
    };
    try {
      this.pubSocket.write(encodeRespCommand(['PUBLISH', this.channel, JSON.stringify(envelope)]));
      this.publishedCount += 1;
      return true;
    } catch (err: any) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.pubReady = false;
    this.subReady = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const s of [this.pubSocket, this.subSocket]) {
      if (s && !s.destroyed) {
        try {
          s.destroy();
        } catch {}
      }
    }
    this.pubSocket = null;
    this.subSocket = null;
  }
}
