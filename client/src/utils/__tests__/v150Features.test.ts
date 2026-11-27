import { describe, it, expect } from 'vitest';
import {
  formatConnectionSummary,
  getProviderDisplayMeta,
} from '../oauthClient';
import type { VerifiedConnection } from '../../types';

describe('v1.5.0 OAuth2 & Verified Connections client helpers', () => {
  it('returns distinct display metadata for Steam, GitHub, and Google', () => {
    const steam = getProviderDisplayMeta('steam');
    const github = getProviderDisplayMeta('github');
    const google = getProviderDisplayMeta('google');

    expect(steam.label).toBe('Steam');
    expect(github.label).toBe('GitHub');
    expect(google.label).toBe('Google');
    expect(steam.icon).toBeTruthy();
    expect(github.icon).toBeTruthy();
    expect(google.icon).toBeTruthy();
  });

  it('formats verified connection summaries accurately', () => {
    const steamInGame: VerifiedConnection = {
      provider: 'steam',
      externalId: '76561198012345678',
      username: 'AliGamer',
      metadata: { currentGame: 'Counter-Strike 2', gameCount: 42 },
      showOnProfile: true,
      verifiedAt: '2026-11-27T00:00:00.000Z',
    };
    expect(formatConnectionSummary(steamInGame)).toContain('Counter-Strike 2');

    const steamLibrary: VerifiedConnection = {
      provider: 'steam',
      externalId: '76561198012345679',
      username: 'AliGamer',
      metadata: { gameCount: 42 },
      showOnProfile: true,
      verifiedAt: '2026-11-27T00:00:00.000Z',
    };
    expect(formatConnectionSummary(steamLibrary)).toContain('42');

    const githubConn: VerifiedConnection = {
      provider: 'github',
      externalId: '12345',
      username: 'octocat',
      metadata: { publicRepos: 18 },
      showOnProfile: true,
      verifiedAt: '2026-11-27T00:00:00.000Z',
    };
    expect(formatConnectionSummary(githubConn)).toContain('18');

    const googleConn: VerifiedConnection = {
      provider: 'google',
      externalId: 'g-123',
      username: 'ali',
      displayName: 'Ali Google',
      metadata: { email: 'ali@example.com' },
      showOnProfile: true,
      verifiedAt: '2026-11-27T00:00:00.000Z',
    };
    expect(formatConnectionSummary(googleConn)).toBe('ali');
  });
});
