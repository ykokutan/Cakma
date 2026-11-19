import { describe, it, expect } from 'vitest';
import { t, LANGUAGE_OPTIONS } from '../i18n';

describe('i18n translations', () => {
  it('supports all configured languages with core UI, auth, security, and chat keys', () => {
    const requiredKeys = [
      'settings',
      'textChannels',
      'voiceChannels',
      'directMessages',
      'newMessagesDivider',
      'roomChat',
      'editProfile',
      'loginTitle',
      'registerTitle',
      'forgotPasswordTitle',
      'forgotPasswordLink',
      'usernameOrEmailLabel',
      'emailLabel',
      'passwordLabel',
      'confirmPasswordLabel',
      'rememberUsername',
      'sendCode',
      'verifyAndLogin',
      'switchServer',
      'changeEmailTitle',
      'deleteAccountTitle',
      'activeSessionsTitle',
      'linkPreviewOpen',
    ];

    for (const lang of LANGUAGE_OPTIONS) {
      for (const key of requiredKeys) {
        const value = t(lang.id, key);
        expect(value).toBeTruthy();
        expect(value).not.toBe(key);
      }
    }
  });

  it('falls back to Turkish or key name for unknown keys', () => {
    expect(t('en', 'nonexistent_key_123')).toBe('nonexistent_key_123');
  });
});
