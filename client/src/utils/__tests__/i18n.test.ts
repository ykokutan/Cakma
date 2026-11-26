import { describe, it, expect } from 'vitest';
import { t, LANGUAGE_OPTIONS, getDictionaryKeys } from '../i18n';

describe('i18n translations', () => {
  it('supports all 5 configured languages (tr, en, de, ru, fr) with 100% key parity and core UI keys', () => {
    expect(LANGUAGE_OPTIONS.map((l) => l.id)).toEqual(['tr', 'en', 'de', 'ru', 'fr']);
    const trKeys = getDictionaryKeys('tr').sort();
    for (const lang of LANGUAGE_OPTIONS) {
      expect(getDictionaryKeys(lang.id).sort()).toEqual(trKeys);
    }

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
      'streamClipBuffer',
      'streamClipSave',
      'watchQueueTitle',
      'skipVote',
      'highContrastMode',
      'colorblindStatusMode',
      'narrowCompactMode',
      'echoLoopbackTest',
      'activitiesMenu',
      'foldersLabel',
      'newFolderAction',
      'accessibilityTitle',
      'watchTogetherTitle',
      'addToQueue',
      'closeCinema',
      'statusOnline',
      'statusIdle',
      'statusDnd',
      'statusOffline',
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
