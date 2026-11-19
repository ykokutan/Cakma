export type NotificationLevel = 'all' | 'mentions' | 'muted';

export function getTargetNotificationPref(
  prefs: Record<string, NotificationLevel> | undefined | null,
  channelId?: string | null,
  serverId?: string | null
): NotificationLevel {
  if (!prefs) return 'all';
  if (channelId && prefs[channelId]) return prefs[channelId];
  if (serverId && prefs[serverId]) return prefs[serverId];
  return 'all';
}

export function shouldNotifyForMessage(params: {
  level: NotificationLevel;
  isMention: boolean;
  isDM: boolean;
}): boolean {
  const { level, isMention, isDM } = params;
  if (level === 'muted') return false;
  if (level === 'mentions') return isMention || isDM;
  return true;
}

export function shouldShowUnreadForChannel(params: {
  level: NotificationLevel;
  isMention: boolean;
}): boolean {
  const { level, isMention } = params;
  if (level === 'muted') return false;
  if (level === 'mentions') return isMention;
  return true;
}
