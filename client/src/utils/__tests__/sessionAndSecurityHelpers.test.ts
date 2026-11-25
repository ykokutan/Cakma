import { describe, it, expect } from 'vitest';
import {
  buildTwoFactorBackupCodesText,
  parseReadableUserAgent,
} from '../sessionAndSecurityHelpers';

describe('sessionAndSecurityHelpers', () => {
  it('formats 2FA backup codes into numbered printable plain text', () => {
    const text = buildTwoFactorBackupCodesText('ykokutas', ['ABCD-1234', 'EFGH-5678']);
    expect(text).toContain('Hesap: ykokutas');
    expect(text).toContain('01. ABCD-1234');
    expect(text).toContain('02. EFGH-5678');
    expect(text).toContain('tek seferlik kullanılabilir');
  });

  it('parses common User-Agent strings into concise OS + Browser labels', () => {
    expect(
      parseReadableUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36')
    ).toBe('Windows · Chrome');
    expect(
      parseReadableUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')
    ).toBe('macOS · Safari');
    expect(
      parseReadableUserAgent('Mozilla/5.0 (Linux; Android 14) Gecko/20100101 Firefox/126.0')
    ).toBe('Android · Firefox');
    expect(
      parseReadableUserAgent('Mozilla/5.0 (Windows NT 10.0) Tauri/2.0')
    ).toBe('Windows · Çakma Masaüstü');
  });
});
