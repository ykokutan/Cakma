import type { RegisteredAccount, UserBadge } from '../types.js';

export type ExtendedAvatarFrameId =
  | 'none'
  | 'gold'
  | 'neon'
  | 'emerald'
  | 'crimson'
  | 'rainbow'
  | 'aurora'
  | 'cyberpunk'
  | 'phoenix'
  | 'diamond';

export type NameGradientId =
  | 'none'
  | 'gold'
  | 'ocean'
  | 'sunset'
  | 'matrix'
  | 'royal';

export interface CosmeticItemDef {
  id: string;
  kind: 'frame' | 'gradient';
  key: string;
  label: string;
  requiredLevel: number;
  walletPrice: number;
}

export const COSMETIC_CATALOG: CosmeticItemDef[] = [
  { id: 'frame:none', kind: 'frame', key: 'none', label: 'Yok', requiredLevel: 1, walletPrice: 0 },
  { id: 'frame:gold', kind: 'frame', key: 'gold', label: 'Altın', requiredLevel: 1, walletPrice: 0 },
  { id: 'frame:neon', kind: 'frame', key: 'neon', label: 'Neon Mor', requiredLevel: 1, walletPrice: 0 },
  { id: 'frame:emerald', kind: 'frame', key: 'emerald', label: 'Zümrüt', requiredLevel: 1, walletPrice: 0 },
  { id: 'frame:crimson', kind: 'frame', key: 'crimson', label: 'Kızıl', requiredLevel: 1, walletPrice: 0 },
  { id: 'frame:rainbow', kind: 'frame', key: 'rainbow', label: 'Prizma', requiredLevel: 2, walletPrice: 50 },
  { id: 'frame:aurora', kind: 'frame', key: 'aurora', label: 'Aurora Borealis', requiredLevel: 4, walletPrice: 120 },
  { id: 'frame:cyberpunk', kind: 'frame', key: 'cyberpunk', label: 'Cyberpunk 2077', requiredLevel: 6, walletPrice: 200 },
  { id: 'frame:phoenix', kind: 'frame', key: 'phoenix', label: 'Anka Alevi', requiredLevel: 8, walletPrice: 300 },
  { id: 'frame:diamond', kind: 'frame', key: 'diamond', label: 'Elmas Kristal', requiredLevel: 10, walletPrice: 500 },
  { id: 'grad:none', kind: 'gradient', key: 'none', label: 'Standart', requiredLevel: 1, walletPrice: 0 },
  { id: 'grad:gold', kind: 'gradient', key: 'gold', label: 'Altın Işıltı', requiredLevel: 2, walletPrice: 60 },
  { id: 'grad:ocean', kind: 'gradient', key: 'ocean', label: 'Okyanus', requiredLevel: 3, walletPrice: 90 },
  { id: 'grad:sunset', kind: 'gradient', key: 'sunset', label: 'Gün Batımı', requiredLevel: 5, walletPrice: 140 },
  { id: 'grad:matrix', kind: 'gradient', key: 'matrix', label: 'Siber Yeşil', requiredLevel: 7, walletPrice: 220 },
  { id: 'grad:royal', kind: 'gradient', key: 'royal', label: 'Kraliyet Moru', requiredLevel: 10, walletPrice: 350 },
];

export const VALID_AVATAR_FRAMES = new Set<string>(
  COSMETIC_CATALOG.filter((c) => c.kind === 'frame').map((c) => c.key)
);

export const VALID_NAME_GRADIENTS = new Set<string>(
  COSMETIC_CATALOG.filter((c) => c.kind === 'gradient').map((c) => c.key)
);

export function isCosmeticUnlocked(
  cosmeticId: string,
  userLevel: number,
  unlockedList?: string[]
): boolean {
  const item = COSMETIC_CATALOG.find((c) => c.id === cosmeticId);
  if (!item) return false;
  if (item.walletPrice === 0 && item.requiredLevel <= 1) return true;
  if (userLevel >= item.requiredLevel) return true;
  return Array.isArray(unlockedList) && unlockedList.includes(cosmeticId);
}

export interface AchievementStatsInput {
  messageCount?: number;
  voiceMinutes?: number;
  gameWins?: number;
  level?: number;
}

export function evaluateUserAchievements(
  existingBadges: UserBadge[] = [],
  stats: AchievementStatsInput
): UserBadge[] {
  const map = new Map<string, UserBadge>();
  for (const b of existingBadges) {
    if (b?.id) map.set(b.id, b);
  }

  const grant = (badge: UserBadge, condition: boolean) => {
    if (condition && !map.has(badge.id)) {
      map.set(badge.id, badge);
    }
  };

  grant(
    {
      id: 'badge-first-msg',
      name: 'İlk Ses',
      icon: '💬',
      description: 'Toplulukta ilk mesajını gönderdi.',
      color: 'from-sky-500 to-cyan-400',
    },
    (stats.messageCount || 0) >= 1
  );
  grant(
    {
      id: 'badge-chatter-100',
      name: 'Sohbet Ustası',
      icon: '✍️',
      description: '100+ mesaj paylaşarak sohbete yön verdi.',
      color: 'from-indigo-500 to-purple-500',
    },
    (stats.messageCount || 0) >= 100
  );
  grant(
    {
      id: 'badge-voice-60',
      name: 'Ses Müdavimi',
      icon: '🎙️',
      description: 'Ses odalarında 60+ dakika aktif kaldı.',
      color: 'from-emerald-500 to-teal-400',
    },
    (stats.voiceMinutes || 0) >= 60
  );
  grant(
    {
      id: 'badge-gamer-win',
      name: 'Oyun Şampiyonu',
      icon: '🏆',
      description: 'Oda mini oyunlarında zafer kazandı.',
      color: 'from-amber-500 to-yellow-400',
    },
    (stats.gameWins || 0) >= 1
  );
  grant(
    {
      id: 'badge-level-10',
      name: 'Efsane Üye',
      icon: '🌟',
      description: 'Seviye 10 ve üzerine ulaştı.',
      color: 'from-rose-500 to-pink-500',
    },
    (stats.level || 1) >= 10
  );

  return Array.from(map.values());
}

export function unlockCosmeticWithWallet(
  acc: RegisteredAccount,
  cosmeticId: string,
  currentLevel: number
): { ok: true; newBalance: number; unlockedCosmetics: string[] } | { ok: false; error: string } {
  const item = COSMETIC_CATALOG.find((c) => c.id === cosmeticId);
  if (!item) {
    return { ok: false, error: 'Geçersiz kozmetik öğesi.' };
  }
  const existing = Array.isArray(acc.unlockedCosmetics) ? acc.unlockedCosmetics : [];
  if (isCosmeticUnlocked(cosmeticId, currentLevel, existing)) {
    return { ok: true, newBalance: acc.walletBalance || 0, unlockedCosmetics: existing };
  }
  const bal = Number(acc.walletBalance) || 0;
  if (bal < item.walletPrice) {
    return {
      ok: false,
      error: `Yetersiz cüzdan bakiyesi (Gerekli: ₺${item.walletPrice}, Mevcut: ₺${bal}). Seviye ${item.requiredLevel}'da ücretsiz açılır.`,
    };
  }
  acc.walletBalance = bal - item.walletPrice;
  acc.unlockedCosmetics = [...existing, cosmeticId];
  return {
    ok: true,
    newBalance: acc.walletBalance,
    unlockedCosmetics: acc.unlockedCosmetics,
  };
}
