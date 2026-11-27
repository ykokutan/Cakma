import crypto from 'crypto';
import type { Socket } from 'socket.io';
import type {
  Channel,
  KanbanCard,
  Server,
  ServerPermission,
  User,
  WikiPage,
} from '../types.js';
import type { SocketEventRateLimiter } from '../utils/socketGuard.js';

export interface WikiAndKanbanDeps {
  activeUsers: Map<string, User>;
  servers: Server[];
  socketEventLimiter: SocketEventRateLimiter;
  sanitizeText: (input: string) => string;
  checkServerPermission: (
    user: User,
    server: Server,
    permission: ServerPermission,
    channel?: Channel
  ) => boolean;
  saveServers: (servers: Server[]) => void;
  emitServerUpdatedToMembers: (srv: Server) => void;
}

export function canEditStructuredChannel(
  user: User,
  server: Server,
  channel: Channel,
  checkServerPermission: WikiAndKanbanDeps['checkServerPermission']
): boolean {
  if (channel.collabMode === 'admins_only') {
    return checkServerPermission(user, server, 'manage_channels', channel);
  }
  const isMember =
    server.ownerId === user.id ||
    server.ownerId === user.accountId ||
    server.members?.some(
      (m) =>
        m.userId === user.id ||
        m.userId === user.accountId ||
        m.username.toLowerCase() === user.username.toLowerCase()
    );
  if (!isMember) return false;
  return checkServerPermission(user, server, 'send_messages', channel);
}

function slugifyWikiTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9çğıöşü\s-]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || `sayfa-${Date.now()}`
  );
}

export function registerWikiAndKanbanHandlers(
  socket: Pick<Socket, 'id' | 'on' | 'emit'>,
  deps: WikiAndKanbanDeps
): void {
  const {
    activeUsers,
    servers,
    socketEventLimiter,
    sanitizeText,
    checkServerPermission,
    saveServers,
    emitServerUpdatedToMembers,
  } = deps;

  const findTargetChannel = (serverId: string, channelId: string) => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return null;
    const channel = server.channels.find((c) => c.id === channelId);
    if (!channel) return null;
    return { server, channel };
  };

  socket.on('wiki_page_upsert', (raw: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !raw || typeof raw !== 'object') return;
    if (!socketEventLimiter.allow(socket.id, 'wiki_page_upsert', 20, 30_000)) return;
    const found = findTargetChannel(String(raw.serverId || ''), String(raw.channelId || ''));
    if (!found || found.channel.type !== 'wiki') return;
    if (!canEditStructuredChannel(user, found.server, found.channel, checkServerPermission)) {
      return socket.emit('server_action_error', {
        message: 'Bu Wiki kanalında düzenleme yetkiniz yok.',
      });
    }

    const title = sanitizeText(String(raw.title || '').trim()).slice(0, 100);
    const content = sanitizeText(String(raw.content || '')).slice(0, 40_000);
    const summary = raw.summary ? sanitizeText(String(raw.summary).trim()).slice(0, 120) : undefined;
    if (!title) return;

    if (!Array.isArray(found.channel.wikiPages)) found.channel.wikiPages = [];
    const now = new Date().toISOString();
    const existing = raw.pageId
      ? found.channel.wikiPages.find((p) => p.id === String(raw.pageId))
      : undefined;

    if (existing) {
      if (existing.content !== content) {
        existing.revisions = [
          {
            id: `rev-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
            content: existing.content,
            editedBy: existing.updatedBy,
            editedAt: existing.updatedAt,
            ...(summary ? { summary } : {}),
          },
          ...(existing.revisions || []),
        ].slice(0, 15);
      }
      existing.title = title;
      existing.slug = slugifyWikiTitle(title);
      existing.content = content;
      existing.updatedBy = user.username;
      existing.updatedAt = now;
    } else {
      const page: WikiPage = {
        id: `wiki-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        title,
        slug: slugifyWikiTitle(title),
        content,
        updatedBy: user.username,
        updatedAt: now,
        revisions: [],
      };
      found.channel.wikiPages.push(page);
    }

    saveServers(servers);
    emitServerUpdatedToMembers(found.server);
  });

  socket.on('wiki_page_delete', (raw: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !raw || typeof raw !== 'object') return;
    const found = findTargetChannel(String(raw.serverId || ''), String(raw.channelId || ''));
    if (!found || found.channel.type !== 'wiki') return;
    if (!canEditStructuredChannel(user, found.server, found.channel, checkServerPermission)) {
      return socket.emit('server_action_error', {
        message: 'Bu Wiki sayfasını silme yetkiniz yok.',
      });
    }
    const pageId = String(raw.pageId || '');
    found.channel.wikiPages = (found.channel.wikiPages || []).filter((p) => p.id !== pageId);
    saveServers(servers);
    emitServerUpdatedToMembers(found.server);
  });

  socket.on('wiki_page_restore_revision', (raw: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !raw || typeof raw !== 'object') return;
    const found = findTargetChannel(String(raw.serverId || ''), String(raw.channelId || ''));
    if (!found || found.channel.type !== 'wiki') return;
    if (!canEditStructuredChannel(user, found.server, found.channel, checkServerPermission)) {
      return socket.emit('server_action_error', {
        message: 'Sürüm geri yükleme yetkiniz yok.',
      });
    }
    const page = (found.channel.wikiPages || []).find((p) => p.id === String(raw.pageId || ''));
    if (!page) return;
    const rev = (page.revisions || []).find((r) => r.id === String(raw.revisionId || ''));
    if (!rev) return;

    const now = new Date().toISOString();
    page.revisions = [
      {
        id: `rev-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        content: page.content,
        editedBy: page.updatedBy,
        editedAt: page.updatedAt,
        summary: 'Sürüm geri alma öncesi yedek',
      },
      ...(page.revisions || []),
    ].slice(0, 15);
    page.content = rev.content;
    page.updatedBy = user.username;
    page.updatedAt = now;

    saveServers(servers);
    emitServerUpdatedToMembers(found.server);
  });

  socket.on('kanban_card_upsert', (raw: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !raw || typeof raw !== 'object') return;
    if (!socketEventLimiter.allow(socket.id, 'kanban_card_upsert', 30, 30_000)) return;
    const found = findTargetChannel(String(raw.serverId || ''), String(raw.channelId || ''));
    if (!found || found.channel.type !== 'kanban') return;
    if (!canEditStructuredChannel(user, found.server, found.channel, checkServerPermission)) {
      return socket.emit('server_action_error', {
        message: 'Bu Kanban panosunda kart düzenleme yetkiniz yok.',
      });
    }

    const title = sanitizeText(String(raw.title || '').trim()).slice(0, 140);
    if (!title) return;
    const columnId: KanbanCard['columnId'] =
      raw.columnId === 'in_progress' || raw.columnId === 'done' ? raw.columnId : 'todo';
    const description = raw.description
      ? sanitizeText(String(raw.description).trim()).slice(0, 2000)
      : undefined;
    const assigneeUsername = raw.assigneeUsername
      ? sanitizeText(String(raw.assigneeUsername).trim()).slice(0, 48)
      : undefined;
    const dueDate = raw.dueDate ? String(raw.dueDate).trim().slice(0, 24) : undefined;
    const labels = Array.isArray(raw.labels)
      ? raw.labels
          .map((l: unknown) => sanitizeText(String(l || '').trim()).slice(0, 24))
          .filter(Boolean)
          .slice(0, 5)
      : undefined;

    if (!Array.isArray(found.channel.kanbanCards)) found.channel.kanbanCards = [];
    const now = new Date().toISOString();
    const existing = raw.cardId
      ? found.channel.kanbanCards.find((c) => c.id === String(raw.cardId))
      : undefined;

    if (existing) {
      existing.title = title;
      existing.description = description;
      existing.columnId = columnId;
      existing.assigneeUsername = assigneeUsername;
      existing.dueDate = dueDate;
      existing.labels = labels;
      existing.updatedAt = now;
    } else {
      const colCount = found.channel.kanbanCards.filter((c) => c.columnId === columnId).length;
      const card: KanbanCard = {
        id: `kbn-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        title,
        description,
        columnId,
        assigneeUsername,
        labels,
        dueDate,
        position: colCount,
        createdBy: user.username,
        updatedAt: now,
      };
      found.channel.kanbanCards.push(card);
    }

    saveServers(servers);
    emitServerUpdatedToMembers(found.server);
  });

  socket.on('kanban_card_move', (raw: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !raw || typeof raw !== 'object') return;
    const found = findTargetChannel(String(raw.serverId || ''), String(raw.channelId || ''));
    if (!found || found.channel.type !== 'kanban') return;
    if (!canEditStructuredChannel(user, found.server, found.channel, checkServerPermission)) {
      return socket.emit('server_action_error', {
        message: 'Bu Kanban panosunda kart taşıma yetkiniz yok.',
      });
    }
    const cards = found.channel.kanbanCards || [];
    const card = cards.find((c) => c.id === String(raw.cardId || ''));
    if (!card) return;
    const toColumnId: KanbanCard['columnId'] =
      raw.toColumnId === 'in_progress' || raw.toColumnId === 'done' ? raw.toColumnId : 'todo';
    card.columnId = toColumnId;
    if (typeof raw.toPosition === 'number' && Number.isFinite(raw.toPosition)) {
      card.position = Math.max(0, Math.round(raw.toPosition));
    } else {
      card.position = cards.filter((c) => c.columnId === toColumnId && c.id !== card.id).length;
    }
    card.updatedAt = new Date().toISOString();

    saveServers(servers);
    emitServerUpdatedToMembers(found.server);
  });

  socket.on('kanban_card_delete', (raw: any) => {
    const user = activeUsers.get(socket.id);
    if (!user || !raw || typeof raw !== 'object') return;
    const found = findTargetChannel(String(raw.serverId || ''), String(raw.channelId || ''));
    if (!found || found.channel.type !== 'kanban') return;
    if (!canEditStructuredChannel(user, found.server, found.channel, checkServerPermission)) {
      return socket.emit('server_action_error', {
        message: 'Bu Kanban panosunda kart silme yetkiniz yok.',
      });
    }
    const cardId = String(raw.cardId || '');
    found.channel.kanbanCards = (found.channel.kanbanCards || []).filter((c) => c.id !== cardId);
    saveServers(servers);
    emitServerUpdatedToMembers(found.server);
  });
}
