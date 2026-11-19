import { describe, it, expect } from 'vitest';
import {
  evaluatePasswordStrength,
  normalizeOtpInput,
  validateEmail,
  validateUsername,
} from '../authValidation';

describe('authValidation helpers', () => {
  it('validates usernames with length and character rules', () => {
    expect(validateUsername('').valid).toBe(false);
    expect(validateUsername('ab').valid).toBe(false);
    expect(validateUsername('a'.repeat(25)).valid).toBe(false);
    expect(validateUsername('ali veli').valid).toBe(false);
    expect(validateUsername('ahmet@test').valid).toBe(false);
    expect(validateUsername('  ahmet_01.tr-x  ')).toEqual({ valid: true });
  });

  it('validates emails after trimming', () => {
    expect(validateEmail('  user@example.com ')).toBe(true);
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('user@localhost')).toBe(false);
  });

  it('evaluates password strength score, level, checks, and strong policy', () => {
    const empty = evaluatePasswordStrength('');
    expect(empty.score).toBe(0);
    expect(empty.level).toBe(0);
    expect(empty.meetsStrongPolicy).toBe(false);

    const weak = evaluatePasswordStrength('abc');
    expect(weak.level).toBe(1);
    expect(weak.label).toBe('Zayıf');
    expect(weak.meetsStrongPolicy).toBe(false);

    const medium = evaluatePasswordStrength('abcdefgh');
    expect(medium.checks.hasLen).toBe(true);
    expect(medium.checks.hasLower).toBe(true);
    expect(medium.meetsStrongPolicy).toBe(false);

    const policyMet = evaluatePasswordStrength('Abcdef12');
    expect(policyMet.score).toBe(4);
    expect(policyMet.level).toBe(3);
    expect(policyMet.label).toBe('Güçlü');
    expect(policyMet.meetsStrongPolicy).toBe(true);

    const veryStrong = evaluatePasswordStrength('Abcdef12!');
    expect(veryStrong.score).toBe(5);
    expect(veryStrong.level).toBe(4);
    expect(veryStrong.label).toBe('Çok Güçlü');
    expect(veryStrong.meetsStrongPolicy).toBe(true);
  });

  it('normalizes OTP inputs by stripping non-digits and clamping length', () => {
    expect(normalizeOtpInput('12a-34b 5678')).toBe('123456');
    expect(normalizeOtpInput('ab-99', 4)).toBe('99');
    expect(normalizeOtpInput('   ')).toBe('');
  });
});
