import crypto from 'crypto';

// Master Secret Key (Bu gizli anahtar lisansların taklit edilmesini önler)
export const MASTER_LICENSE_SECRET = 'DISCORD_TEAMSPEAK_MASTER_KEY_SECURE_9827349182374';
export const OFFICIAL_CLIENT_SIGNATURE = 'OFFICIAL_APP_CLIENT_TOKEN_V1_VERIFIED';

export interface LicenseData {
  licensee: string;
  maxSlots: number;
  expiresAt: string; // ISO string or 'lifetime'
  tier: 'Starter' | 'Pro' | 'Enterprise';
  issuedAt: string;
}

export function generateLicenseKey(
  licensee: string,
  maxSlots: number,
  expireDaysOrDate: number | string,
  tier: 'Starter' | 'Pro' | 'Enterprise' = 'Pro'
): string {
  let expiresAt: string;
  if (typeof expireDaysOrDate === 'string') {
    expiresAt = expireDaysOrDate;
  } else if (expireDaysOrDate === -1) {
    expiresAt = 'lifetime';
  } else {
    expiresAt = new Date(Date.now() + expireDaysOrDate * 24 * 60 * 60 * 1000).toISOString();
  }

  const payload: LicenseData = {
    licensee,
    maxSlots,
    expiresAt,
    tier,
    issuedAt: new Date().toISOString()
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', MASTER_LICENSE_SECRET)
    .update(payloadString)
    .digest('hex');

  return `LIC-${payloadString}.${signature}`;
}

export function verifyLicenseKey(licenseKey: string): { valid: boolean; error?: string; data?: LicenseData } {
  if (!licenseKey || !licenseKey.startsWith('LIC-')) {
    return { valid: false, error: 'Lisans anahtarı eksik veya geçersiz formatta.' };
  }

  const raw = licenseKey.replace('LIC-', '');
  const parts = raw.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Bozuk lisans anahtarı yapısı.' };
  }

  const [payloadBase64, providedSignature] = parts;

  // Verify HMAC-SHA256 signature
  const expectedSignature = crypto
    .createHmac('sha256', MASTER_LICENSE_SECRET)
    .update(payloadBase64)
    .digest('hex');

  if (providedSignature !== expectedSignature) {
    return { valid: false, error: 'Sahte veya değiştirilmiş lisans anahtarı! İmza doğrulanamadı.' };
  }

  try {
    const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const data: LicenseData = JSON.parse(jsonStr);

    // Check expiration
    if (data.expiresAt !== 'lifetime') {
      const expDate = new Date(data.expiresAt).getTime();
      if (Date.now() > expDate) {
        return { valid: false, error: `Lisansın kullanım süresi dolmuş! (${new Date(data.expiresAt).toLocaleDateString('tr-TR')})` };
      }
    }

    return { valid: true, data };
  } catch {
    return { valid: false, error: 'Lisans verisi çözümlenemedi.' };
  }
}
