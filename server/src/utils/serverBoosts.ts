import type { Server } from '../types.js';

export const BOOST_COST_COINS = 100;
export const BOOST_DURATION_DAYS = 30;

export interface ServerBoostTierSummary {
  activeBoostCount: number;
  tier: 0 | 1 | 2 | 3;
  maxEmojis: number;
  maxStickers: number;
  maxBitrateKbps: number;
  vanityUnlocked: boolean;
  nextTierAt: number | null;
}

export function computeServerBoostSummary(
  server: Pick<Server, 'boosts'> | undefined | null,
  nowMs: number = Date.now()
): ServerBoostTierSummary {
  const boosts = Array.isArray(server?.boosts) ? server!.boosts : [];
  const activeCount = boosts.filter((b) => {
    const expMs = Date.parse(b?.expiresAt || '');
    return Number.isFinite(expMs) && expMs > nowMs;
  }).length;

  if (activeCount >= 10) {
    return {
      activeBoostCount: activeCount,
      tier: 3,
      maxEmojis: 120,
      maxStickers: 80,
      maxBitrateKbps: 384,
      vanityUnlocked: true,
      nextTierAt: null,
    };
  }
  if (activeCount >= 5) {
    return {
      activeBoostCount: activeCount,
      tier: 2,
      maxEmojis: 60,
      maxStickers: 40,
      maxBitrateKbps: 320,
      vanityUnlocked: true,
      nextTierAt: 10,
    };
  }
  if (activeCount >= 2) {
    return {
      activeBoostCount: activeCount,
      tier: 1,
      maxEmojis: 30,
      maxStickers: 20,
      maxBitrateKbps: 256,
      vanityUnlocked: false,
      nextTierAt: 5,
    };
  }
  return {
    activeBoostCount: activeCount,
    tier: 0,
    maxEmojis: 15,
    maxStickers: 8,
    maxBitrateKbps: 128,
    vanityUnlocked: false,
    nextTierAt: 2,
  };
}
