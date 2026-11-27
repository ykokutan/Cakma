import crypto from 'node:crypto';
import fs from 'node:fs';
import { validateExternalWebhookUrl } from './adminAuth.js';

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

export interface S3UploadResult {
  ok: boolean;
  url?: string;
  key?: string;
  error?: string;
}

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

  const kDate = hmacSha256(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, params.region);
  const kService = hmacSha256(kRegion, params.service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    Host: host,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export async function uploadFileToS3(opts: S3UploadOptions): Promise<S3UploadResult> {
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

  if (!fs.existsSync(opts.filePath)) {
    return { ok: false, error: 'Yüklenecek yedek dosyası bulunamadı.' };
  }

  try {
    const body = await fs.promises.readFile(opts.filePath);
    const payloadHash = sha256Hex(body);
    const baseUrl = new URL(check.normalizedUrl);
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
        'Content-Length': String(body.length),
      },
      body: new Uint8Array(body),
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
