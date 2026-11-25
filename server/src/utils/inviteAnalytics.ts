import type { ServerInvite } from '../types.js';

export interface InviteSourceSummary {
  sourceLabel: string;
  inviteCount: number;
  totalUses: number;
}

export function normalizeInviteSourceLabel(raw?: string | null): string {
  const trimmed = String(raw || '').trim().slice(0, 32);
  return trimmed || 'Genel';
}

export function summarizeInviteSources(invites: ServerInvite[]): {
  totalUses: number;
  sources: InviteSourceSummary[];
} {
  const bySource = new Map<string, InviteSourceSummary>();
  let totalUses = 0;

  for (const inv of invites || []) {
    const label = normalizeInviteSourceLabel(inv.sourceLabel);
    const uses = Math.max(0, Number(inv.uses) || 0);
    totalUses += uses;
    const prev = bySource.get(label);
    if (prev) {
      prev.inviteCount += 1;
      prev.totalUses += uses;
    } else {
      bySource.set(label, {
        sourceLabel: label,
        inviteCount: 1,
        totalUses: uses,
      });
    }
  }

  const sources = Array.from(bySource.values()).sort((a, b) => {
    if (b.totalUses !== a.totalUses) return b.totalUses - a.totalUses;
    return a.sourceLabel.localeCompare(b.sourceLabel, 'tr');
  });

  return { totalUses, sources };
}
