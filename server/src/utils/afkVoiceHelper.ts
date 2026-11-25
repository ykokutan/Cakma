export interface AfkCheckInput {
  currentVoiceChannelId?: string | null;
  isSpeaking?: boolean;
  lastActivityMs: number;
  nowMs: number;
  afkChannelId?: string | null;
  afkTimeoutMinutes?: number;
}

export function shouldMoveUserToAfk(input: AfkCheckInput): boolean {
  const {
    currentVoiceChannelId,
    isSpeaking,
    lastActivityMs,
    nowMs,
    afkChannelId,
    afkTimeoutMinutes,
  } = input;

  if (!currentVoiceChannelId || !afkChannelId) return false;
  if (currentVoiceChannelId === afkChannelId) return false;
  if (isSpeaking) return false;

  const mins = Number(afkTimeoutMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return false;

  const timeoutMs = mins * 60_000;
  return nowMs - lastActivityMs >= timeoutMs;
}
