import { isStrongPassword } from './security.js';

export const COMMON_WEAK_PASSWORDS = new Set([
  '1234',
  '12345',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'qwerty',
  'qwerty123',
  'admin123',
  '11111111',
  '00000000',
  'letmein',
  'abc12345',
]);

export function validatePasswordAgainstPolicy(
  password: unknown,
  username: string,
  requireStrongPasswords: boolean
): { ok: boolean; error?: string } {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'Lütfen geçerli bir şifre girin.' };
  }

  const trimmedUsername = (username || '').trim();
  if (trimmedUsername && password.toLowerCase() === trimmedUsername.toLowerCase()) {
    return { ok: false, error: 'Şifre kullanıcı adınızla aynı olamaz.' };
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      error: 'Bu şifre çok yaygın ve güvensiz. Lütfen daha güçlü bir şifre seçin.',
    };
  }

  if (requireStrongPasswords) {
    if (!isStrongPassword(password)) {
      return {
        ok: false,
        error: 'Güçlü şifre politikası: en az 8 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.',
      };
    }
  } else if (password.length < 6) {
    return {
      ok: false,
      error: 'Şifre en az 6 karakter olmalıdır.',
    };
  }

  return { ok: true };
}
