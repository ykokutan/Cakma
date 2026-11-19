import { describe, expect, it } from 'vitest';
import type { DiscoverableServerSummary, ServerCategory } from '../../types';
import {
  SERVER_CATEGORY_LABELS,
  extractInviteCodeFromInput,
  filterAndSortDiscoverableServers,
} from '../exploreHelpers';

function makeSummary(overrides: Partial<DiscoverableServerSummary> = {}): DiscoverableServerSummary {
  return {
    id: 'srv-1',
    name: 'Varsayılan Sunucu',
    icon: 'VS',
    description: 'Açıklama',
    category: 'community',
    tags: [],
    memberCount: 10,
    onlineCount: 2,
    voiceActiveCount: 0,
    textChannelCount: 1,
    voiceChannelCount: 1,
    channelPreview: [{ id: 'ch-1', name: 'genel', type: 'text' }],
    bitrateKbps: 64,
    sfuMode: 'auto',
    isJoined: false,
    isOwner: false,
    ...overrides,
  };
}

describe('exploreHelpers', () => {
  describe('SERVER_CATEGORY_LABELS', () => {
    it('provides non-empty labels for all supported server categories', () => {
      const categories: ServerCategory[] = [
        'gaming',
        'community',
        'tech',
        'music',
        'education',
        'other',
      ];
      for (const cat of categories) {
        expect(typeof SERVER_CATEGORY_LABELS[cat]).toBe('string');
        expect(SERVER_CATEGORY_LABELS[cat].trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('extractInviteCodeFromInput', () => {
    it('extracts invite codes from raw input, web URLs, and deep links', () => {
      expect(extractInviteCodeFromInput('   ')).toBe('');
      expect(extractInviteCodeFromInput('  ABC123  ')).toBe('ABC123');
      expect(extractInviteCodeFromInput('https://chat.example.com/?invite=XYZ789')).toBe('XYZ789');
      expect(extractInviteCodeFromInput('https://chat.example.com/join?code=DEF456')).toBe('DEF456');
      expect(extractInviteCodeFromInput('cakma://invite/GHI321')).toBe('GHI321');
      expect(extractInviteCodeFromInput('cakma://invite?code=JKL654')).toBe('JKL654');
    });
  });

  describe('filterAndSortDiscoverableServers', () => {
    const gaming = makeSummary({
      id: 'srv-gaming',
      name: 'Valorant Türkiye',
      description: 'Rekabetçi FPS ve takım bulma',
      category: 'gaming',
      tags: ['fps', 'turnuva'],
      memberCount: 120,
      onlineCount: 15,
      voiceActiveCount: 8,
      channelPreview: [{ id: 'c1', name: 'dereceli-takim', type: 'voice' }],
      isJoined: true,
    });

    const tech = makeSummary({
      id: 'srv-tech',
      name: 'Açık Kaynak Lab',
      description: 'TypeScript ve LiveKit geliştirici merkezi',
      category: 'tech',
      tags: ['typescript', 'webrtc'],
      memberCount: 45,
      onlineCount: 30,
      voiceActiveCount: 2,
      channelPreview: [{ id: 'c2', name: 'kod-inceleme', type: 'text' }],
      isJoined: false,
    });

    const music = makeSummary({
      id: 'srv-music',
      name: 'Akustik Sahne',
      description: 'Canlı jam ve müzik paylaşımı',
      category: 'music',
      tags: ['lofi', 'canli'],
      memberCount: 30,
      onlineCount: 12,
      voiceActiveCount: 12,
      channelPreview: [{ id: 'c3', name: 'dj-kabini', type: 'voice' }],
      isJoined: false,
    });

    const list = [gaming, tech, music];

    it('filters by category and onlyUnjoined flag', () => {
      expect(
        filterAndSortDiscoverableServers(list, { category: 'tech' }).map((s) => s.id)
      ).toEqual(['srv-tech']);

      expect(
        filterAndSortDiscoverableServers(list, { onlyUnjoined: true }).map((s) => s.id)
      ).not.toContain('srv-gaming');
    });

    it('matches search queries across name, description, tags, and channel previews', () => {
      expect(
        filterAndSortDiscoverableServers(list, { query: 'akustik' }).map((s) => s.id)
      ).toEqual(['srv-music']);
      expect(
        filterAndSortDiscoverableServers(list, { query: 'livekit' }).map((s) => s.id)
      ).toEqual(['srv-tech']);
      expect(
        filterAndSortDiscoverableServers(list, { query: 'turnuva' }).map((s) => s.id)
      ).toEqual(['srv-gaming']);
      expect(
        filterAndSortDiscoverableServers(list, { query: 'dj-kabini' }).map((s) => s.id)
      ).toEqual(['srv-music']);
    });

    it('sorts properly in popular, online, voice, and name modes', () => {
      expect(
        filterAndSortDiscoverableServers(list, { sort: 'popular' }).map((s) => s.id)[0]
      ).toBe('srv-gaming');

      expect(
        filterAndSortDiscoverableServers(list, { sort: 'online' }).map((s) => s.id)
      ).toEqual(['srv-tech', 'srv-gaming', 'srv-music']);

      expect(
        filterAndSortDiscoverableServers(list, { sort: 'voice' }).map((s) => s.id)
      ).toEqual(['srv-music', 'srv-gaming', 'srv-tech']);

      expect(
        filterAndSortDiscoverableServers(list, { sort: 'name' }).map((s) => s.id)
      ).toEqual(['srv-tech', 'srv-music', 'srv-gaming']);
    });
  });
});
