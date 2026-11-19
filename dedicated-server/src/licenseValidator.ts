import crypto from 'crypto';

export const OFFICIAL_CLIENT_SIGNATURE = 'OFFICIAL_APP_CLIENT_TOKEN_V1_VERIFIED';

export interface LicenseData {
  licensee: string;
  maxSlots: number;
  expiresAt: string; // ISO string or 'lifetime'
  tier: 'Starter' | 'Pro' | 'Enterprise';
  issuedAt: string;
}

export interface LicenseVerifyResult {
  valid: boolean;
  error?: string;
  data?: LicenseData;
  needsOnlineVerification?: boolean;
  algorithm?: 'ed25519' | 'hmac-legacy';
}

export function verifyLicenseKey(licenseKey: string, overridePublicKeyPem?: string): LicenseVerifyResult {
  const trimmed = String(licenseKey || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Lisans anahtarı eksik veya geçersiz formatta.' };
  }

  // Asymmetric Ed25519 verification (`LIC2-<payload>.<sig>`)
  if (trimmed.startsWith('LIC2-')) {
    const raw = trimmed.slice(5);
    const parts = raw.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { valid: false, error: 'Bozuk Ed25519 lisans anahtarı yapısı.' };
    }
    const [payloadBase64Url, sigBase64Url] = parts;
    const pubKey = (overridePublicKeyPem || process.env.LICENSE_PUBLIC_KEY || '').trim();
    if (!pubKey) {
      return {
        valid: false,
        needsOnlineVerification: true,
        error: 'Ed25519 lisans açık anahtarı yerel yapılandırmada bulunamadı; ana sunucudan çekilecek.',
      };
    }

    try {
      const ok = crypto.verify(
        null,
        Buffer.from(payloadBase64Url, 'utf-8'),
        pubKey,
        Buffer.from(sigBase64Url, 'base64url')
      );
      if (!ok) {
        return { valid: false, error: 'Sahte veya değiştirilmiş lisans anahtarı! Ed25519 imzası doğrulanamadı.' };
      }
      const data = JSON.parse(Buffer.from(payloadBase64Url, 'base64url').toString('utf-8')) as LicenseData;
      if (data.expiresAt !== 'lifetime' && Date.now() > new Date(data.expiresAt).getTime()) {
        return {
          valid: false,
          error: `Lisansın kullanım süresi dolmuş! (${new Date(data.expiresAt).toLocaleDateString('tr-TR')})`,
        };
      }
      return { valid: true, data, algorithm: 'ed25519' };
    } catch {
      return { valid: false, error: 'Ed25519 lisans verisi çözümlenemedi.' };
    }
  }

  // Legacy HMAC (`LIC-...`): never embed symmetric forging secret in dedicated-server binary.
  // Allow offline verify only if operator explicitly provides MASTER_LICENSE_SECRET via env,
  // otherwise decode payload metadata and require online confirmation from Master Server.
  if (!trimmed.startsWith('LIC-')) {
    return { valid: false, error: 'Lisans anahtarı eksik veya geçersiz formatta.' };
  }

  const raw = trimmed.slice(4);
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'Bozuk lisans anahtarı yapısı.' };
  }

  const [payloadBase64, providedSignature] = parts;
  const envSecret = process.env.MASTER_LICENSE_SECRET?.trim();
  if (!envSecret) {
    try {
      const data = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8')) as LicenseData;
      return {
        valid: false,
        needsOnlineVerification: true,
        data,
        algorithm: 'hmac-legacy',
        error: 'Eski HMAC lisans anahtarı ana sunucu tarafından çevrimiçi doğrulanmalıdır.',
      };
    } catch {
      return { valid: false, error: 'Lisans verisi çözümlenemedi.' };
    }
  }

  const expectedSignature = crypto
    .createHmac('sha256', envSecret)
    .update(payloadBase64)
    .digest('hex');

  try {
    const provBuf = Buffer.from(providedSignature, 'utf-8');
    const expBuf = Buffer.from(expectedSignature, 'utf-8');
    if (provBuf.length !== expBuf.length || !crypto.timingSafeEqual(provBuf, expBuf)) {
      return { valid: false, error: 'Sahte veya değiştirilmiş lisans anahtarı! İmza doğrulanamadı.' };
    }
    const data = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8')) as LicenseData;
    if (data.expiresAt !== 'lifetime' && Date.now() > new Date(data.expiresAt).getTime()) {
      return {
        valid: false,
        error: `Lisansın kullanım süresi dolmuş! (${new Date(data.expiresAt).toLocaleDateString('tr-TR')})`,
      };
    }
    return { valid: true, data, algorithm: 'hmac-legacy' };
  } catch {
    return { valid: false, error: 'Lisans verisi çözümlenemedi.' };
  }
}
