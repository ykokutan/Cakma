export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,24}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface UsernameValidationResult {
  valid: boolean;
  reason?: string;
}

export type PasswordStrengthLabel = 'Zayıf' | 'Orta' | 'Güçlü' | 'Çok Güçlü';

export interface PasswordStrengthChecks {
  hasLen: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
}

export interface PasswordStrengthResult {
  score: number;
  level: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrengthLabel;
  checks: PasswordStrengthChecks;
  meetsStrongPolicy: boolean;
}

export function validateUsername(raw: string): UsernameValidationResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { valid: false, reason: 'Kullanıcı adı boş bırakılamaz.' };
  }
  if (trimmed.length < 3) {
    return { valid: false, reason: 'Kullanıcı adı en az 3 karakter olmalıdır.' };
  }
  if (trimmed.length > 24) {
    return { valid: false, reason: 'Kullanıcı adı en fazla 24 karakter olabilir.' };
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, reason: 'Yalnızca harf, rakam ve _, ., - karakterleri kullanılabilir.' };
  }
  return { valid: true };
}

export function validateEmail(raw: string): boolean {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return EMAIL_REGEX.test(trimmed);
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const safe = typeof password === 'string' ? password : '';
  const checks: PasswordStrengthChecks = {
    hasLen: safe.length >= 8,
    hasUpper: /[A-Z]/.test(safe),
    hasLower: /[a-z]/.test(safe),
    hasDigit: /\d/.test(safe),
    hasSymbol: /[^a-zA-Z0-9]/.test(safe),
  };

  const score = [checks.hasLen, checks.hasUpper, checks.hasLower, checks.hasDigit, checks.hasSymbol].filter(Boolean).length;

  let level: 0 | 1 | 2 | 3 | 4 = 0;
  let label: PasswordStrengthLabel = 'Zayıf';

  if (safe.length === 0) {
    level = 0;
    label = 'Zayıf';
  } else if (score >= 5) {
    level = 4;
    label = 'Çok Güçlü';
  } else if (score === 4) {
    level = 3;
    label = 'Güçlü';
  } else if (score === 3) {
    level = 2;
    label = 'Orta';
  } else {
    level = 1;
    label = 'Zayıf';
  }

  return {
    score,
    level,
    label,
    checks,
    meetsStrongPolicy: checks.hasLen && checks.hasUpper && checks.hasLower && checks.hasDigit,
  };
}

export function normalizeOtpInput(raw: string, maxLen = 6): string {
  const safeMax = Math.max(0, Math.floor(maxLen));
  return (typeof raw === 'string' ? raw : '').replace(/\D/g, '').slice(0, safeMax);
}
