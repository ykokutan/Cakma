import crypto from 'crypto';

export const LEGACY_MASTER_LICENSE_SECRET = 'DISCORD_TEAMSPEAK_MASTER_KEY_SECURE_9827349182374';
export const OFFICIAL_CLIENT_SIGNATURE = 'OFFICIAL_APP_CLIENT_TOKEN_V1_VERIFIED';

export interface LicenseData {
  licensee: string;
  maxSlots: number;
  expiresAt: string;
  tier: 'Starter' | 'Pro' | 'Enterprise';
  issuedAt: string;
}

export interface LicenseKeyConfig {
  privateKeyPem?: string;
  publicKeyPem?: string;
  allowLegacyHmac?: boolean;
  legacyHmacSecret?: string;
}

let activePrivateKeyPem: string | null = process.env.LICENSE_PRIVATE_KEY?.trim() || null;
let activePublicKeyPem: string | null = process.env.LICENSE_PUBLIC_KEY?.trim() || null;
let allowLegacyHmac: boolean = process.env.ALLOW_LEGACY_HMAC_LICENSES !== 'false';
let activeLegacyHmacSecret: string = LEGACY_MASTER_LICENSE_SECRET;

export function generateEd25519KeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

export function configureLicenseKeys(cfg: LicenseKeyConfig): void {
  if (cfg.privateKeyPem !== undefined) {
    activePrivateKeyPem = cfg.privateKeyPem ? cfg.privateKeyPem.trim() : null;
  }
  if (cfg.publicKeyPem !== undefined) {
    activePublicKeyPem = cfg.publicKeyPem ? cfg.publicKeyPem.trim() : null;
  }
  if (typeof cfg.allowLegacyHmac === 'boolean') {
    allowLegacyHmac = cfg.allowLegacyHmac;
  }
  if (cfg.legacyHmacSecret !== undefined && cfg.legacyHmacSecret) {
    activeLegacyHmacSecret = cfg.legacyHmacSecret;
  }
}

export function getLicensePublicKeyPem(): string {
  return activePublicKeyPem || '';
}

function normalizeExpiration(expireDaysOrDate: number | string): string {
  if (typeof expireDaysOrDate === 'string') return expireDaysOrDate;
  if (expireDaysOrDate === -1) return 'lifetime';
  return new Date(Date.now() + expireDaysOrDate * 24 * 60 * 60 * 1000).toISOString();
}

export function generateLicenseKey(
  licensee: string,
  maxSlots: number,
  expireDaysOrDate: number | string,
  tier: 'Starter' | 'Pro' | 'Enterprise' = 'Pro',
  overridePrivateKeyPem?: string
): string {
  const payload: LicenseData = {
    licensee,
    maxSlots,
    expiresAt: normalizeExpiration(expireDaysOrDate),
    tier,
    issuedAt: new Date().toISOString(),
  };

  const privKey = overridePrivateKeyPem?.trim() || activePrivateKeyPem;
  if (privKey) {
    const payloadBase64Url = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const signature = crypto
      .sign(null, Buffer.from(payloadBase64Url, 'utf-8'), privKey)
      .toString('base64url');
    return `LIC2-${payloadBase64Url}.${signature}`;
  }

  // Fallback for standalone invocations when no Ed25519 key is configured
  const payloadString = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', activeLegacyHmacSecret)
    .update(payloadString)
    .digest('hex');
  return `LIC-${payloadString}.${signature}`;
}

export function verifyLicenseKey(
  licenseKey: string,
  overridePublicKeyPem?: string
): { valid: boolean; error?: string; data?: LicenseData; algorithm?: 'ed25519' | 'hmac-legacy' } {
  const trimmed = String(licenseKey || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Lisans anahtarı eksik veya geçersiz formatta.' };
  }

  if (trimmed.startsWith('LIC2-')) {
    const raw = trimmed.slice(5);
    const parts = raw.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { valid: false, error: 'Bozuk Ed25519 lisans anahtarı yapısı.' };
    }
    const [payloadBase64Url, sigBase64Url] = parts;
    const pubKey = overridePublicKeyPem?.trim() || activePublicKeyPem;
    if (!pubKey) {
      return { valid: false, error: 'Lisans doğrulama açık anahtarı yapılandırılmamış.' };
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

  if (!trimmed.startsWith('LIC-')) {
    return { valid: false, error: 'Lisans anahtarı eksik veya geçersiz formatta.' };
  }

  if (!allowLegacyHmac) {
    return { valid: false, error: 'Eski HMAC lisans biçimi devre dışı bırakılmıştır (LIC2 gerekir).' };
  }

  const raw = trimmed.slice(4);
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'Bozuk lisans anahtarı yapısı.' };
  }

  const [payloadBase64, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', activeLegacyHmacSecret)
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
