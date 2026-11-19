import type { DiscoverableServerSummary, ServerCategory } from '../types';

export type ExploreSortMode = 'popular' | 'online' | 'voice' | 'name';

export const SERVER_CATEGORY_LABELS: Record<ServerCategory, string> = {
  gaming: 'Oyun & e-Spor',
  community: 'Topluluk & Sohbet',
  tech: 'Teknoloji & Yazılım',
  music: 'Müzik & Eğlence',
  education: 'Eğitim & Çalışma',
  other: 'Diğer',
};

export function extractInviteCodeFromInput(rawInput: string): string {
  const raw = String(rawInput || '').trim();
  if (!raw) return '';

  // Support cakma://invite/CODE and cakma://invite?code=CODE
  const deepSlashMatch = raw.match(/^cakma:\/\/invite\/([A-Za-z0-9_-]+)/i);
  if (deepSlashMatch?.[1]) {
    return deepSlashMatch[1];
  }

  try {
    if (/^[a-z]+:\/\//i.test(raw) || raw.includes('invite=') || raw.includes('code=')) {
      const normalized = /^[a-z]+:\/\//i.test(raw) ? raw : `https://dummy.local/${raw.replace(/^\/+/, '')}`;
      const urlObj = new URL(normalized);
      const queryCode = urlObj.searchParams.get('invite') || urlObj.searchParams.get('code');
      if (queryCode) return queryCode.trim();
      const pathMatch = urlObj.pathname.match(/\/invite\/([A-Za-z0-9_-]+)/i);
      if (pathMatch?.[1]) return pathMatch[1].trim();
    }
  } catch {
    const fallbackMatch = raw.match(/(?:invite|code)=([A-Za-z0-9_-]+)/i);
    if (fallbackMatch?.[1]) return fallbackMatch[1].trim();
  }

  return raw;
}

export function filterAndSortDiscoverableServers(
  servers: DiscoverableServerSummary[],
  opts: {
    query?: string;
    category?: 'all' | ServerCategory;
    onlyUnjoined?: boolean;
    sort?: ExploreSortMode;
  } = {}
): DiscoverableServerSummary[] {
  const query = (opts.query || '').trim().toLowerCase();
  const category = opts.category || 'all';
  const onlyUnjoined = Boolean(opts.onlyUnjoined);
  const sort = opts.sort || 'popular';

  const filtered = servers.filter((srv) => {
    if (category !== 'all' && (srv.category || 'community') !== category) {
      return false;
    }
    if (onlyUnjoined && srv.isJoined) {
      return false;
    }
    if (query) {
      const inName = srv.name.toLowerCase().includes(query);
      const inDesc = (srv.description || '').toLowerCase().includes(query);
      const inTags = (srv.tags || []).some((t) => t.toLowerCase().includes(query));
      const inChannels = (srv.channelPreview || []).some((c) => c.name.toLowerCase().includes(query));
      if (!inName && !inDesc && !inTags && !inChannels) {
        return false;
      }
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sort === 'online') {
      return b.onlineCount - a.onlineCount || b.memberCount - a.memberCount || a.name.localeCompare(b.name, 'tr');
    }
    if (sort === 'voice') {
      return b.voiceActiveCount - a.voiceActiveCount || b.onlineCount - a.onlineCount || a.name.localeCompare(b.name, 'tr');
    }
    if (sort === 'name') {
      return a.name.localeCompare(b.name, 'tr');
    }
    // popular (default): active online/members weighted cleanly
    return b.memberCount - a.memberCount || b.onlineCount - a.onlineCount || a.name.localeCompare(b.name, 'tr');
  });
}
