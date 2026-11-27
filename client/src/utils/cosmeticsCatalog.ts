import type { AvatarFrameId, NameGradientId } from '../types';

export interface FrameCatalogEntry {
  id: AvatarFrameId;
  label: string;
  ringClass: string;
  swatch: string;
  requiredLevel: number;
  walletPrice: number;
  animated?: boolean;
}

export const AVATAR_FRAME_CATALOG: FrameCatalogEntry[] = [
  { id: 'none', label: 'Yok', ringClass: 'border-neutral-900', swatch: 'bg-white/10', requiredLevel: 1, walletPrice: 0 },
  {
    id: 'gold',
    label: 'Altın',
    ringClass: 'border-amber-400 ring-2 ring-amber-400/40 shadow-[0_0_20px_rgba(251,191,36,0.35)]',
    swatch: 'bg-gradient-to-tr from-amber-500 to-yellow-300',
    requiredLevel: 1,
    walletPrice: 0,
  },
  {
    id: 'neon',
    label: 'Neon Mor',
    ringClass: 'border-fuchsia-400 ring-2 ring-purple-500/50 shadow-[0_0_20px_rgba(192,132,252,0.45)]',
    swatch: 'bg-gradient-to-tr from-purple-600 to-fuchsia-400',
    requiredLevel: 1,
    walletPrice: 0,
  },
  {
    id: 'emerald',
    label: 'Zümrüt',
    ringClass: 'border-emerald-400 ring-2 ring-emerald-500/45 shadow-[0_0_20px_rgba(52,211,153,0.4)]',
    swatch: 'bg-gradient-to-tr from-emerald-500 to-teal-300',
    requiredLevel: 1,
    walletPrice: 0,
  },
  {
    id: 'crimson',
    label: 'Kızıl',
    ringClass: 'border-rose-500 ring-2 ring-rose-500/45 shadow-[0_0_20px_rgba(244,63,94,0.4)]',
    swatch: 'bg-gradient-to-tr from-rose-600 to-orange-400',
    requiredLevel: 1,
    walletPrice: 0,
  },
  {
    id: 'rainbow',
    label: 'Prizma',
    ringClass: 'border-cyan-300 ring-2 ring-pink-500/50 shadow-[0_0_22px_rgba(56,189,248,0.45)]',
    swatch: 'bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500',
    requiredLevel: 2,
    walletPrice: 50,
  },
  {
    id: 'aurora',
    label: 'Aurora',
    ringClass: 'border-teal-300 ring-2 ring-cyan-400/60 shadow-[0_0_24px_rgba(45,212,191,0.55)] animate-pulse',
    swatch: 'bg-gradient-to-tr from-teal-400 via-cyan-300 to-indigo-400',
    requiredLevel: 4,
    walletPrice: 120,
    animated: true,
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    ringClass: 'border-yellow-300 ring-2 ring-fuchsia-500/70 shadow-[0_0_24px_rgba(232,121,249,0.55)]',
    swatch: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-cyan-400',
    requiredLevel: 6,
    walletPrice: 200,
    animated: true,
  },
  {
    id: 'phoenix',
    label: 'Anka',
    ringClass: 'border-orange-400 ring-2 ring-rose-500/70 shadow-[0_0_24px_rgba(251,146,60,0.6)] animate-pulse',
    swatch: 'bg-gradient-to-tr from-red-600 via-orange-400 to-yellow-300',
    requiredLevel: 8,
    walletPrice: 300,
    animated: true,
  },
  {
    id: 'diamond',
    label: 'Elmas',
    ringClass: 'border-sky-200 ring-2 ring-sky-400/75 shadow-[0_0_26px_rgba(125,211,252,0.7)]',
    swatch: 'bg-gradient-to-tr from-white via-sky-300 to-indigo-400',
    requiredLevel: 10,
    walletPrice: 500,
    animated: true,
  },
];

export interface NameGradientCatalogEntry {
  id: NameGradientId;
  label: string;
  textClass: string;
  swatch: string;
  requiredLevel: number;
  walletPrice: number;
}

export const NAME_GRADIENT_CATALOG: NameGradientCatalogEntry[] = [
  { id: 'none', label: 'Standart', textClass: '', swatch: 'bg-white/25', requiredLevel: 1, walletPrice: 0 },
  {
    id: 'gold',
    label: 'Altın',
    textClass: 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent font-extrabold',
    swatch: 'bg-gradient-to-r from-amber-400 to-yellow-200',
    requiredLevel: 2,
    walletPrice: 60,
  },
  {
    id: 'ocean',
    label: 'Okyanus',
    textClass: 'bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-transparent font-extrabold',
    swatch: 'bg-gradient-to-r from-cyan-400 to-blue-500',
    requiredLevel: 3,
    walletPrice: 90,
  },
  {
    id: 'sunset',
    label: 'Gün Batımı',
    textClass: 'bg-gradient-to-r from-rose-300 via-orange-300 to-amber-300 bg-clip-text text-transparent font-extrabold',
    swatch: 'bg-gradient-to-r from-rose-500 to-amber-400',
    requiredLevel: 5,
    walletPrice: 140,
  },
  {
    id: 'matrix',
    label: 'Siber Yeşil',
    textClass: 'bg-gradient-to-r from-emerald-300 via-lime-300 to-teal-300 bg-clip-text text-transparent font-extrabold',
    swatch: 'bg-gradient-to-r from-emerald-400 to-lime-300',
    requiredLevel: 7,
    walletPrice: 220,
  },
  {
    id: 'royal',
    label: 'Kraliyet',
    textClass: 'bg-gradient-to-r from-fuchsia-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent font-extrabold',
    swatch: 'bg-gradient-to-r from-fuchsia-500 to-indigo-400',
    requiredLevel: 10,
    walletPrice: 350,
  },
];

export function getAvatarFrameEntry(id?: AvatarFrameId): FrameCatalogEntry {
  return AVATAR_FRAME_CATALOG.find((f) => f.id === id) || AVATAR_FRAME_CATALOG[0];
}

export function getNameGradientClass(id?: NameGradientId): string {
  return NAME_GRADIENT_CATALOG.find((g) => g.id === id)?.textClass || '';
}

export function isClientCosmeticUnlocked(
  cosmeticId: string,
  userLevel = 1,
  unlockedList: string[] = []
): boolean {
  const [kind, key] = cosmeticId.split(':');
  const entry =
    kind === 'frame'
      ? AVATAR_FRAME_CATALOG.find((f) => f.id === key)
      : NAME_GRADIENT_CATALOG.find((g) => g.id === key);
  if (!entry) return false;
  if (entry.walletPrice === 0 && entry.requiredLevel <= 1) return true;
  if (userLevel >= entry.requiredLevel) return true;
  return unlockedList.includes(cosmeticId);
}
