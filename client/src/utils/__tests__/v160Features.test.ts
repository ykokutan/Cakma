import { describe, it, expect } from 'vitest';
import { compareSemver, evaluateAndroidUpdatePayload } from '../androidUpdater';
import { resolveGameAudioProfile, type CustomGameRule } from '../gameDetectionRules';
import { formatTransferSpeed, isExpiredDiscordCdnUrl } from '../mediaHealth';
import { matchesSmartSearch, parseSmartSearchQuery } from '../chatExportAndFilters';
import { computeServerBoostSummary } from '../serverBoosts';
import type { Message } from '../../types';

describe('v1.6.0 client features', () => {
  it('compares semver versions and evaluates Android OTA payload', () => {
    expect(compareSemver('1.6.0', '1.5.0')).toBe(1);
    expect(compareSemver('1.5.0', '1.6.0')).toBe(-1);
    expect(compareSemver('v1.6.0', '1.6.0')).toBe(0);

    const update = evaluateAndroidUpdatePayload(
      {
        version: '1.6.0',
        android: {
          version: '1.6.0',
          url: '/downloads/Cakma.apk',
          sha256: 'abc123',
        },
      },
      '1.5.0',
      'https://ses.example.com'
    );
    expect(update.available).toBe(true);
    expect(update.latestVersion).toBe('1.6.0');
    expect(update.sha256).toBe('abc123');
    expect(update.apkUrl).toBe('/downloads/Cakma.apk');

    const upToDate = evaluateAndroidUpdatePayload(
      { version: '1.6.0', android: { version: '1.6.0' } },
      '1.6.0',
      'https://ses.example.com'
    );
    expect(upToDate.available).toBe(false);
  });

  it('resolves per-game audio and overlay profiles by detected game name', () => {
    const rules: CustomGameRule[] = [
      {
        exe: 'cs2.exe',
        name: 'Counter-Strike 2',
        inputMode: 'ptt',
        dspProfile: 'keyboard_guard',
        autoOpenOverlay: true,
      },
      {
        exe: 'spotify.exe',
        name: 'Spotify',
        inputMode: 'auto',
        dspProfile: 'auto',
      },
    ];

    const cs2 = resolveGameAudioProfile('counter-strike 2', rules);
    expect(cs2).toEqual({
      gameName: 'Counter-Strike 2',
      inputMode: 'ptt',
      dspProfile: 'keyboard_guard',
      autoOpenOverlay: true,
    });
    expect(resolveGameAudioProfile('Spotify', rules)).toBeNull();
  });

  it('detects expired Discord CDN links and formats upload speeds', () => {
    const pastSec = Math.floor((Date.UTC(2025, 0, 1) / 1000)).toString(16);
    const futureSec = Math.floor((Date.UTC(2028, 0, 1) / 1000)).toString(16);
    const now = Date.UTC(2026, 10, 27);

    expect(
      isExpiredDiscordCdnUrl(`https://cdn.discordapp.com/attachments/1/2/test.png?ex=${pastSec}`, now)
    ).toBe(true);
    expect(
      isExpiredDiscordCdnUrl(`https://media.discordapp.net/attachments/1/2/test.png?ex=${futureSec}`, now)
    ).toBe(false);
    expect(isExpiredDiscordCdnUrl('/uploads/local.webp', now)).toBe(false);

    expect(formatTransferSpeed(512 * 1024)).toBe('512 KB/s');
    expect(formatTransferSpeed(2.5 * 1024 * 1024)).toBe('2.5 MB/s');
  });

  it('parses and matches Advanced Search v2 queries (code, lang, ext, video, audio)', () => {
    const parsed = parseSmartSearchQuery('has:code lang:ts ext:json demo');
    expect(parsed.hasCode).toBe(true);
    expect(parsed.codeLanguages).toEqual(['ts']);
    expect(parsed.extensions).toEqual(['json']);
    expect(parsed.text).toBe('demo');

    const msg: Message = {
      id: 'm1',
      serverId: 's1',
      channelId: 'c1',
      author: { id: 'u1', username: 'ali', avatar: '🎮' },
      content: 'Demo kodu:\n```typescript\nconsole.log(1);\n```',
      timestamp: '12:00',
      reactions: {},
      attachments: [
        { id: 'att1', name: 'config.json', size: 120, type: 'application/json', url: '/uploads/config.json' },
      ],
    };
    expect(matchesSmartSearch(msg, parsed)).toBe(true);
    expect(matchesSmartSearch(msg, parseSmartSearchQuery('has:video'))).toBe(false);

    const videoMsg: Message = {
      ...msg,
      id: 'm2',
      content: '',
      attachments: [
        { id: 'v1', name: 'clip.webm', size: 5000, type: 'video/webm', url: '/uploads/clip.webm' },
      ],
    };
    expect(matchesSmartSearch(videoMsg, parseSmartSearchQuery('has:video ext:webm'))).toBe(true);
  });

  it('computes server boost tiers accurately on client', () => {
    const now = Date.UTC(2026, 10, 27, 12, 0, 0);
    const future = new Date(now + 15 * 86_400_000).toISOString();
    const summary = computeServerBoostSummary(
      {
        boosts: Array.from({ length: 5 }, (_, i) => ({
          id: `b${i}`,
          username: `u${i}`,
          coinsSpent: 100,
          boostedAt: new Date(now).toISOString(),
          expiresAt: future,
        })),
      },
      now
    );
    expect(summary.tier).toBe(2);
    expect(summary.maxBitrateKbps).toBe(320);
    expect(summary.vanityUnlocked).toBe(true);
  });
});
