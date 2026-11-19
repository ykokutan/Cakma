import type { Server, ServerCategory, User } from '../types.js';

export interface DiscoverableServerSummary {
  id: string;
  name: string;
  icon: string;
  bannerGradient?: string;
  bannerImage?: string;
  description: string;
  category: ServerCategory;
  tags: string[];
  memberCount: number;
  onlineCount: number;
  voiceActiveCount: number;
  textChannelCount: number;
  voiceChannelCount: number;
  channelPreview: Array<{ id: string; name: string; type: 'text' | 'voice' }>;
  bitrateKbps: number;
  sfuMode: 'auto' | 'p2p' | 'sfu';
  isJoined: boolean;
  isOwner: boolean;
}

export function isUserMemberOfServer(
  user: { id?: string; username: string },
  srv: Pick<Server, 'ownerId' | 'members'>
): boolean {
  const unameLower = String(user.username || '').trim().toLowerCase();
  if (!unameLower && !user.id) return false;
  if (user.id && srv.ownerId === user.id) return true;
  if (unameLower && srv.ownerId && srv.ownerId.toLowerCase() === unameLower) return true;
  return (srv.members || []).some(
    (m) =>
      (user.id && m.userId === user.id) ||
      (unameLower !== '' && m.username.toLowerCase() === unameLower)
  );
}

export function filterServersForUser(
  allServers: Server[],
  user: { id?: string; username: string }
): Server[] {
  return allServers.filter((srv) => isUserMemberOfServer(user, srv));
}

export function buildDiscoverableServerSummaries(
  allServers: Server[],
  activeUsers: Iterable<User>,
  currentUser?: { id?: string; username: string } | null
): DiscoverableServerSummary[] {
  const uniqueOnlineByName = new Map<string, User>();
  for (const u of activeUsers) {
    if (!u || u.status === 'offline') continue;
    const key = u.username.toLowerCase();
    const existing = uniqueOnlineByName.get(key);
    if (!existing || (u.currentVoiceChannelId && !existing.currentVoiceChannelId)) {
      uniqueOnlineByName.set(key, u);
    }
  }
  const uniqueOnlineUsers = Array.from(uniqueOnlineByName.values());

  return allServers
    .filter((srv) => srv.isPublic !== false)
    .map((srv) => {
      const channels = srv.channels || [];
      const voiceChannelIds = new Set(
        channels.filter((c) => c.type === 'voice').map((c) => c.id)
      );

      let onlineCount = 0;
      let voiceActiveCount = 0;
      for (const u of uniqueOnlineUsers) {
        if (isUserMemberOfServer(u, srv)) {
          onlineCount++;
          if (u.currentVoiceChannelId && voiceChannelIds.has(u.currentVoiceChannelId)) {
            voiceActiveCount++;
          }
        }
      }

      const textChannels = channels.filter((c) => c.type === 'text');
      const voiceChannels = channels.filter((c) => c.type === 'voice' && !c.isTempCreatorChannel);

      const channelPreview = [
        ...textChannels.slice(0, 2),
        ...voiceChannels.slice(0, 2),
      ].map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      }));

      const isJoined = currentUser ? isUserMemberOfServer(currentUser, srv) : false;
      const isOwner = Boolean(
        currentUser &&
          ((currentUser.id && srv.ownerId === currentUser.id) ||
            (currentUser.username && srv.ownerId.toLowerCase() === currentUser.username.toLowerCase()) ||
            (srv.members || []).some(
              (m) =>
                m.isOwner &&
                currentUser.username &&
                m.username.toLowerCase() === currentUser.username.toLowerCase()
            ))
      );

      return {
        id: srv.id,
        name: srv.name,
        icon: srv.icon || '💬',
        bannerGradient: srv.bannerGradient,
        bannerImage: srv.bannerImage,
        description: srv.description || '',
        category: srv.category || 'community',
        tags: Array.isArray(srv.tags) ? srv.tags : [],
        memberCount: srv.members?.length || 0,
        onlineCount,
        voiceActiveCount,
        textChannelCount: textChannels.length,
        voiceChannelCount: channels.filter((c) => c.type === 'voice').length,
        channelPreview,
        bitrateKbps: srv.bitrateKbps || 128,
        sfuMode: srv.sfuMode || 'auto',
        isJoined,
        isOwner,
      };
    });
}
