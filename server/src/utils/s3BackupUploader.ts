import crypto from 'node:crypto';
import fs from 'node:fs';
import { validateExternalWebhookUrl } from './adminAuth.js';
import type { SystemConfig } from '../storage.js';

export interface S3UploadOptions {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
  filePath: string;
  contentType?: string;
  skipDns?: boolean;
}

export interface S3BufferUploadOptions {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
  body: Buffer;
  contentType?: string;
  skipDns?: boolean;
}

export interface S3UploadResult {
  ok: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface ResolvedMediaS3Config {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  publicBaseUrl: string;
  minSizeBytes: number;
}

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function encodeS3PathSegments(key: string): string {
  return key
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

export function resolveEffectiveMediaS3Config(cfg?: SystemConfig | null): ResolvedMediaS3Config {
  const shareBackup = cfg?.mediaS3UseBackupCredentials !== false;
  const endpoint = String((shareBackup ? cfg?.backupS3Endpoint : cfg?.mediaS3Endpoint) || cfg?.mediaS3Endpoint || '')
    .trim()
    .replace(/\/+$/, '');
  const bucket = String(cfg?.mediaS3Bucket || (shareBackup ? cfg?.backupS3Bucket : '') || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const region =
    String((shareBackup ? cfg?.backupS3Region : cfg?.mediaS3Region) || cfg?.mediaS3Region || 'auto').trim() || 'auto';
  const accessKeyId = String(
    (shareBackup ? cfg?.backupS3AccessKey : cfg?.mediaS3AccessKey) || cfg?.mediaS3AccessKey || ''
  ).trim();
  const secretAccessKey = String(
    (shareBackup ? cfg?.backupS3SecretKey : cfg?.mediaS3SecretKey) || cfg?.mediaS3SecretKey || ''
  ).trim();
  const rawPrefix = String(cfg?.mediaS3Prefix ?? 'uploads/').trim().replace(/^\/+/, '');
  const prefix = rawPrefix ? (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) : '';
  const publicBaseUrl = String(cfg?.mediaS3PublicBaseUrl || '').trim().replace(/\/+$/, '');
  const minSizeBytes = Math.max(0, Math.floor((Number(cfg?.mediaS3MinSizeKb) || 0) * 1024));

  return {
    enabled: Boolean(cfg?.mediaS3Enabled && endpoint && bucket && accessKeyId && secretAccessKey),
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    prefix,
    publicBaseUrl,
    minSizeBytes,
  };
}

export function buildAwsSigV4Headers(params: {
  method: 'PUT' | 'GET' | 'HEAD';
  url: URL;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  now?: Date;
}): Record<string, string> {
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = params.url.host;
  const canonicalUri = params.url.pathname || '/';
  const canonicalQuery = '';

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${params.payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kSigning = deriveSigningKey(params.secretAccessKey, dateStamp, params.region, params.service);
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    Host: host,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export function buildAwsSigV4PresignedGetUrl(params: {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
  expiresSeconds?: number;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = String(params.region || 'auto').trim() || 'auto';
  const bucket = String(params.bucket || '').trim().replace(/^\/+|\/+$/g, '');
  const expires = Math.min(86400, Math.max(60, Math.floor(params.expiresSeconds ?? 3600)));

  const targetUrl = new URL(String(params.endpoint || '').trim().replace(/\/+$/, ''));
  const basePath = targetUrl.pathname.replace(/\/+$/, '');
  const encodedKey = encodeS3PathSegments(params.objectKey);
  targetUrl.pathname = `${basePath}/${encodeURIComponent(bucket)}/${encodedKey}`;

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const queryPairs: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${params.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQuery = queryPairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    targetUrl.pathname || '/',
    canonicalQuery,
    `host:${targetUrl.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kSigning = deriveSigningKey(params.secretAccessKey, dateStamp, region, 's3');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return `${targetUrl.origin}${targetUrl.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function validateS3TargetConfig(opts: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  skipDns?: boolean;
}): Promise<
  | { ok: true; endpointUrl: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string }
  | { ok: false; error: string }
> {
  const endpointRaw = String(opts.endpoint || '').trim().replace(/\/+$/, '');
  const bucket = String(opts.bucket || '').trim().replace(/^\/+|\/+$/g, '');
  const accessKeyId = String(opts.accessKeyId || '').trim();
  const secretAccessKey = String(opts.secretAccessKey || '').trim();
  const region = String(opts.region || 'auto').trim() || 'auto';

  if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) {
    return {
      ok: false,
      error: 'S3/R2/MinIO yapılandırması eksik (endpoint, bucket, accessKey ve secretKey gerekli).',
    };
  }

  const check = await validateExternalWebhookUrl(endpointRaw, { skipDns: opts.skipDns });
  if (!check.ok || !check.normalizedUrl) {
    return { ok: false, error: check.error || 'S3 endpoint adresi güvenlik doğrulamasından geçemedi.' };
  }

  return { ok: true, endpointUrl: check.normalizedUrl, bucket, accessKeyId, secretAccessKey, region };
}

export async function uploadBufferToS3(opts: S3BufferUploadOptions): Promise<S3UploadResult> {
  const target = await validateS3TargetConfig(opts);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }
  const { endpointUrl, bucket, accessKeyId, secretAccessKey, region } = target;

  try {
    const payloadHash = sha256Hex(opts.body);
    const baseUrl = new URL(endpointUrl);
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    const encodedKey = encodeS3PathSegments(opts.objectKey);
    baseUrl.pathname = `${basePath}/${encodeURIComponent(bucket)}/${encodedKey}`;

    const sigHeaders = buildAwsSigV4Headers({
      method: 'PUT',
      url: baseUrl,
      region,
      service: 's3',
      accessKeyId,
      secretAccessKey,
      payloadHash,
    });

    const resp = await fetch(baseUrl.toString(), {
      method: 'PUT',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...sigHeaders,
        'Content-Type': opts.contentType || 'application/octet-stream',
        'Content-Length': String(opts.body.length),
      },
      body: new Uint8Array(opts.body),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return {
        ok: false,
        error: `S3 yükleme hatası (HTTP ${resp.status})${detail ? `: ${detail.slice(0, 140)}` : ''}`,
      };
    }

    return {
      ok: true,
      url: baseUrl.toString(),
      key: opts.objectKey,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'S3/R2 bağlantısı kurulamadı.',
    };
  }
}

export async function uploadFileToS3(opts: S3UploadOptions): Promise<S3UploadResult> {
  const target = await validateS3TargetConfig(opts);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }
  if (!fs.existsSync(opts.filePath)) {
    return { ok: false, error: 'Yüklenecek yedek dosyası bulunamadı.' };
  }
  try {
    const body = await fs.promises.readFile(opts.filePath);
    return uploadBufferToS3({
      endpoint: opts.endpoint,
      bucket: opts.bucket,
      region: opts.region,
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      objectKey: opts.objectKey,
      body,
      contentType: opts.contentType,
      skipDns: opts.skipDns,
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Dosya okunamadı.' };
  }
}

export async function fetchBufferFromS3(opts: {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
  skipDns?: boolean;
}): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string; error?: string }> {
  const endpointRaw = String(opts.endpoint || '').trim().replace(/\/+$/, '');
  const bucket = String(opts.bucket || '').trim().replace(/^\/+|\/+$/g, '');
  const region = String(opts.region || 'auto').trim() || 'auto';
  const check = await validateExternalWebhookUrl(endpointRaw, { skipDns: opts.skipDns });
  if (!check.ok || !check.normalizedUrl) {
    return { ok: false, error: check.error || 'S3 endpoint doğrulanamadı.' };
  }
  try {
    const baseUrl = new URL(check.normalizedUrl);
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    const encodedKey = encodeS3PathSegments(opts.objectKey);
    baseUrl.pathname = `${basePath}/${encodeURIComponent(bucket)}/${encodedKey}`;

    const sigHeaders = buildAwsSigV4Headers({
      method: 'GET',
      url: baseUrl,
      region,
      service: 's3',
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      payloadHash: EMPTY_SHA256,
    });
    const resp = await fetch(baseUrl.toString(), {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
      headers: sigHeaders,
    });
    if (!resp.ok) {
      return { ok: false, error: `S3 indirme hatası (HTTP ${resp.status})` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      ok: true,
      buffer: buf,
      contentType: resp.headers.get('content-type') || undefined,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'S3 okuma hatası.' };
  }
}
