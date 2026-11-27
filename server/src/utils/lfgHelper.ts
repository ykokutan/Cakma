import type { LfgPostData } from '../types.js';

export function createLfgData(input: {
  game: string;
  title: string;
  rankOrNote?: string;
  maxSlots?: number;
  voiceChannelId?: string | null;
  voiceChannelName?: string;
  creatorUsername: string;
  creatorAvatar: string;
  nowIso?: string;
}): LfgPostData | null {
  const game = String(input.game || '').trim().slice(0, 64);
  const title = String(input.title || '').trim().slice(0, 120);
  if (!game || !title || !input.creatorUsername) return null;

  const rawSlots = Number(input.maxSlots);
  const maxSlots = Number.isFinite(rawSlots) ? Math.max(2, Math.min(16, Math.round(rawSlots))) : 5;
  const nowIso = input.nowIso || new Date().toISOString();
  const cleanRank = String(input.rankOrNote || '').trim().slice(0, 64);

  return {
    id: `lfg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    game,
    title,
    ...(cleanRank ? { rankOrNote: cleanRank } : {}),
    maxSlots,
    voiceChannelId: input.voiceChannelId || null,
    ...(input.voiceChannelName ? { voiceChannelName: String(input.voiceChannelName).slice(0, 64) } : {}),
    participants: [
      {
        username: input.creatorUsername,
        avatar: input.creatorAvatar || '🎮',
        joinedAt: nowIso,
      },
    ],
    closed: false,
    createdAt: nowIso,
  };
}

export function toggleLfgParticipant(
  lfg: LfgPostData,
  username: string,
  avatar: string,
  nowIso: string = new Date().toISOString()
): { updated: boolean; reason?: string; lfg: LfgPostData } {
  if (lfg.closed) {
    return { updated: false, reason: 'Bu takım ilanı kapatılmış.', lfg };
  }
  const lower = username.toLowerCase();
  const exists = lfg.participants.some((p) => p.username.toLowerCase() === lower);

  if (exists) {
    if (lfg.participants.length <= 1) {
      return { updated: false, reason: 'Son katılımcı ayrılmak yerine ilanı kapatabilir.', lfg };
    }
    return {
      updated: true,
      lfg: {
        ...lfg,
        participants: lfg.participants.filter((p) => p.username.toLowerCase() !== lower),
      },
    };
  }

  if (lfg.participants.length >= lfg.maxSlots) {
    return { updated: false, reason: 'Bu takım kadrosu dolu.', lfg };
  }

  return {
    updated: true,
    lfg: {
      ...lfg,
      participants: [
        ...lfg.participants,
        { username, avatar: avatar || '👤', joinedAt: nowIso },
      ],
    },
  };
}

export function closeLfgData(lfg: LfgPostData): LfgPostData {
  return { ...lfg, closed: true };
}
