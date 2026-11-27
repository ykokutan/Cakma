import type { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  Channel,
  ChannelCategory,
  Message,
  RegisteredAccount,
  Server,
  ServerCategory,
  ServerMember,
  ServerPermission,
  ServerRole,
  User,
} from '../types.js';
import { getDefaultRoles } from '../mockData.js';
import { SERVER_TEMPLATES } from './webhooksAndTemplatesRoutes.js';
import { findServerMember, getPersistentUserId, isServerOwner } from '../utils/serverIdentity.js';
import { isUserMemberOfServer } from '../utils/serverDiscovery.js';
import { validatePayload, type SocketEventRateLimiter } from '../utils/socketGuard.js';
import { normalizeInviteSourceLabel } from '../utils/inviteAnalytics.js';

export interface ServerAdminHandlerDeps {
  io: Pick<SocketIOServer, 'to'>;
  activeUsers: Map<string, User>;
  registeredAccounts: Map<string, RegisteredAccount>;
  servers: Server[];
  messages: Record<string, Message[]>;
  socketEventLimiter: SocketEventRateLimiter;
  sanitizeText: (input: string) => string;
  isSafeImageMedia: (val: string) => boolean;
  isSafeEmojiOrShortIcon: (val: string) => boolean;
  checkServerPermission: (user: User, server: Server, permission: ServerPermission) => boolean;
  addUserToServer: (user: User, srv: Server) => boolean;
  saveServers: (servers: Server[]) => void;
  saveChannelMessageBulkReplace: (channelId: string, channelMessages: Message[]) => void;
  emitToServerMembers: (srv: Server, event: string, payload: unknown) => void;
  emitServerUpdatedToMembers: (srv: Server) => void;
  emitServersUpdatedForAll: () => void;
  emitToUserSockets: (username: string, event: string, payload: unknown) => void;
  emitToChannelAudience: (
    channelId: string,
    serverId: string | undefined,
    event: string,
    payload: unknown,
    excludeSocketId?: string
  ) => void;
  emitUserUpdated: (user: User) => void;
  cleanupTemporaryChannels: () => void;
  getInitialMessagesForServers: (
    userServers: Server[],
    username: string,
    userId?: string
  ) => { initialMessages: Record<string, Message[]>; hasMoreMessages: Record<string, boolean> };
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  onModerationEvent?: (
    serverId: string,
    entry: { targetUsername: string; moderatorUsername: string; action: 'kick' | 'timeout' | 'untimeout'; reason: string; durationMinutes?: number }
  ) => void;
}

export function registerServerAdminSocketHandlers(socket: Socket, deps: ServerAdminHandlerDeps): void {
  const {
    io,
    activeUsers,
    registeredAccounts,
    servers,
    messages,
    socketEventLimiter,
    sanitizeText,
    isSafeImageMedia,
    isSafeEmojiOrShortIcon,
    checkServerPermission,
    addUserToServer,
    saveServers,
    saveChannelMessageBulkReplace,
    emitToServerMembers,
    emitServerUpdatedToMembers,
    emitServersUpdatedForAll,
    emitToUserSockets,
    emitToChannelAudience,
    emitUserUpdated,
    cleanupTemporaryChannels,
    getInitialMessagesForServers,
    addAuditLog,
    onModerationEvent,
  } = deps;

  socket.on('create_channel', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (!socketEventLimiter.allow(socket.id, 'create_channel', 10, 30_000)) {
      return socket.emit('server_action_error', { message: 'Çok sık kanal oluşturuyorsunuz. Lütfen bekleyin.' });
    }
    const check = validatePayload<{
      serverId: string;
      name: string;
      type: 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'wiki' | 'kanban';
      categoryId?: string | null;
      isLocked?: boolean;
      password?: string;
      topic?: string;
      bitrateKbps?: number;
      userLimit?: number;
      isTempCreatorChannel?: boolean;
      collabMode?: 'members' | 'admins_only';
    }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      name: { type: 'string', required: true, minLen: 1, maxLen: 48 },
      type: { type: 'string', required: true, enum: ['text', 'voice', 'announcement', 'forum', 'stage', 'wiki', 'kanban'] },
      categoryId: { type: 'string', required: false, maxLen: 120 },
      isLocked: { type: 'boolean', required: false },
      password: { type: 'string', required: false, maxLen: 64 },
      topic: { type: 'string', required: false, maxLen: 120 },
      bitrateKbps: { type: 'number', required: false, min: 32, max: 320 },
      userLimit: { type: 'number', required: false, min: 0, max: 99 },
      isTempCreatorChannel: { type: 'boolean', required: false },
      collabMode: { type: 'string', required: false, enum: ['members', 'admins_only'] },
    });
    if (!check.ok) {
      return socket.emit('server_action_error', { message: check.error });
    }
    const { serverId, name, type, categoryId, isLocked, password, topic, bitrateKbps, userLimit, isTempCreatorChannel, collabMode } = check.data;
    const targetServer = servers.find((s) => s.id === serverId);
    if (!targetServer) return;

    if (!checkServerPermission(user, targetServer, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Kanal oluşturmak için Kanalları Yönet yetkiniz yok.' });
    }

    const cleanName = sanitizeText(name).toLowerCase().replace(/\s+/g, '-').slice(0, 32);
    if (!cleanName) {
      return socket.emit('server_action_error', { message: 'Geçerli bir kanal adı girin.' });
    }
    const cleanTopic = topic ? sanitizeText(topic.trim()).slice(0, 100) : undefined;
    const validCatId =
      categoryId && targetServer.categories?.some((c) => c.id === categoryId) ? categoryId : null;

    const isVoiceOrStage = type === 'voice' || type === 'stage';
    const newChannel: Channel = {
      id: `ch-${type}-${Date.now()}`,
      name: cleanName,
      type,
      serverId,
      categoryId: validCatId,
      position: targetServer.channels.length,
      isLocked: !!isLocked,
      password: password?.trim() || undefined,
      topic: cleanTopic,
      ...(isVoiceOrStage && bitrateKbps ? { bitrateKbps: Math.min(320, Math.max(32, Number(bitrateKbps))) } : {}),
      ...(isVoiceOrStage && userLimit !== undefined ? { userLimit: Math.min(99, Math.max(0, Number(userLimit) || 0)) } : {}),
      ...(type === 'voice' && isTempCreatorChannel ? { isTempCreatorChannel: true } : {}),
      ...(type === 'stage' ? { stageState: { topic: cleanTopic || '', speakerUsernames: [user.username], raisedHands: [] } } : {}),
      ...((type === 'wiki' || type === 'kanban')
        ? {
            collabMode: collabMode === 'admins_only' ? 'admins_only' : 'members',
            ...(type === 'wiki' ? { wikiPages: [] } : { kanbanCards: [] }),
          }
        : {}),
    };

    targetServer.channels.push(newChannel);
    saveServers(servers);
    addAuditLog(
      'KANAL_OLUSTURULDU',
      `${targetServer.name} sunucusunda #${newChannel.name} (${type}${newChannel.password ? ' - Şifreli' : ''}) oluşturuldu.`
    );
    emitToServerMembers(targetServer, 'channel_created', { serverId, channel: newChannel });
    emitServersUpdatedForAll();
  });

  socket.on(
    'update_channel_settings',
    ({
      serverId,
      channelId,
      bitrateKbps,
      userLimit,
      topic,
    }: {
      serverId: string;
      channelId: string;
      bitrateKbps?: number;
      userLimit?: number;
      topic?: string;
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const targetServer = servers.find((s) => s.id === serverId);
      if (!targetServer) return;
      if (!checkServerPermission(user, targetServer, 'manage_channels')) {
        return socket.emit('server_action_error', {
          message: 'Kanal ayarlarını düzenlemek için Kanalları Yönet yetkiniz yok.',
        });
      }
      const ch = targetServer.channels.find((c) => c.id === channelId);
      if (!ch) return;

      if (bitrateKbps !== undefined && (ch.type === 'voice' || ch.type === 'stage')) {
        ch.bitrateKbps = Math.min(320, Math.max(32, Number(bitrateKbps) || 128));
      }
      if (userLimit !== undefined && (ch.type === 'voice' || ch.type === 'stage')) {
        ch.userLimit = Math.min(99, Math.max(0, Number(userLimit) || 0));
      }
      if (topic !== undefined) {
        ch.topic = topic.trim() ? sanitizeText(topic.trim()).slice(0, 100) : undefined;
      }

      saveServers(servers);
      emitServersUpdatedForAll();
      addAuditLog('KANAL_GUNCELLENDI', `${targetServer.name} / #${ch.name} ayarları güncellendi (${user.username}).`);
    }
  );

  socket.on(
    'update_channel_notice',
    ({ serverId, channelId, notice, topic }: { serverId: string; channelId: string; notice?: string | null; topic?: string }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const targetServer = servers.find((s) => s.id === serverId);
      if (!targetServer) return;

      if (!checkServerPermission(user, targetServer, 'manage_channels')) {
        return socket.emit('server_action_error', { message: 'Kanal duyurusunu düzenlemek için yetkiniz yok.' });
      }

      const ch = targetServer.channels.find((c) => c.id === channelId);
      if (!ch) return;

      if (notice !== undefined) {
        ch.stickyNotice = notice
          ? {
              text: sanitizeText(notice.trim()).slice(0, 300),
              author: user.username,
              updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : null;
      }
      if (topic !== undefined) {
        ch.topic = sanitizeText(topic.trim()).slice(0, 100);
      }

      saveServers(servers);
      emitToServerMembers(targetServer, 'channel_updated', { serverId, channel: ch });
      emitServersUpdatedForAll();
    }
  );

  socket.on('create_server', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (!socketEventLimiter.allow(socket.id, 'create_server', 5, 60_000)) {
      return socket.emit('server_action_error', { message: 'Çok sık sunucu oluşturuyorsunuz. Lütfen bekleyin.' });
    }
    const check = validatePayload<{
      name: string;
      icon?: string;
      template?: 'empty' | 'gaming' | 'friends' | 'work' | 'community' | 'study';
      isPublic?: boolean;
      category?: ServerCategory;
    }>(rawPayload, {
      name: { type: 'string', required: true, minLen: 1, maxLen: 64 },
      icon: { type: 'string', required: false, maxLen: 16 },
      template: { type: 'string', required: false, enum: ['empty', 'gaming', 'friends', 'work', 'community', 'study'] },
      isPublic: { type: 'boolean', required: false },
      category: { type: 'string', required: false, maxLen: 32 },
    });
    if (!check.ok) {
      return socket.emit('server_action_error', { message: check.error });
    }
    const { name, icon, template, isPublic, category } = check.data;
    const ownerId = getPersistentUserId(user);
    const newServerId = `server-${Date.now()}`;
    const roles = getDefaultRoles();
    const members: ServerMember[] = [
      {
        userId: getPersistentUserId(user),
        username: user.username,
        avatar: user.avatar,
        roleIds: ['role-owner', 'role-admin'],
        joinedAt: new Date().toLocaleDateString('tr-TR'),
        isOwner: true,
      },
    ];

    const now = Date.now();
    const tplDef = template && template !== 'empty' ? SERVER_TEMPLATES.find((t) => t.id === template) : undefined;
    const categories: ChannelCategory[] = [];
    let channels: Channel[];

    if (tplDef) {
      const keyToId = new Map<string, string>();
      tplDef.categories.forEach((cat, idx) => {
        const cid = `cat-${now}-${idx}`;
        keyToId.set(cat.key, cid);
        categories.push({ id: cid, name: cat.name, position: cat.position });
      });
      channels = tplDef.channels.map((ch, idx) => ({
        id: `ch-${ch.type}-${now}-${idx}`,
        name: ch.name,
        type: ch.type,
        serverId: newServerId,
        categoryId: ch.categoryKey ? keyToId.get(ch.categoryKey) ?? null : null,
        position: idx,
        topic: ch.topic,
        ...(ch.isTempCreatorChannel ? { isTempCreatorChannel: true } : {}),
      }));
    } else {
      channels = [
        { id: `ch-text-${now}-1`, name: 'genel', type: 'text', serverId: newServerId, position: 0 },
        { id: `ch-voice-${now}-2`, name: 'Genel Ses', type: 'voice', serverId: newServerId, position: 1 },
      ];
    }

    const validCategories: ServerCategory[] = ['gaming', 'community', 'tech', 'music', 'education', 'other'];
    const inferredCategory: ServerCategory =
      category && validCategories.includes(category)
        ? category
        : tplDef?.category || 'community';

    const newServer: Server = {
      id: newServerId,
      name,
      icon: icon || tplDef?.icon || '⚡',
      description: tplDef?.description || '',
      isPublic: isPublic !== false,
      category: inferredCategory,
      tags: [],
      ownerId,
      bitrateKbps: 128,
      roles,
      members,
      categories,
      channels,
      ...(tplDef?.rules?.length ? { rules: tplDef.rules } : {}),
    };

    servers.push(newServer);
    saveServers(servers);
    addAuditLog('SUNUCU_OLUSTURULDU', `Yeni sunucu olusturuldu: ${name} (Sahip: ${user.username})`);
    emitToUserSockets(user.username, 'server_created', newServer);
  });

  socket.on(
    'update_server_settings',
    (data: {
      serverId: string;
      name?: string;
      icon?: string;
      bannerGradient?: string;
      bannerImage?: string;
      description?: string;
      afkChannelId?: string | null;
      afkTimeoutMinutes?: number;
      bitrateKbps?: number;
      voiceRegion?: string;
      sfuMode?: 'auto' | 'p2p' | 'sfu';
      systemChannelId?: string | null;
      verificationLevel?: 'none' | 'low' | 'medium' | 'high';
      defaultNotification?: 'all' | 'mentions';
      autoModEnabled?: boolean;
      vanityCode?: string;
      welcomeChannelId?: string | null;
      welcomeMessage?: string;
      welcomeEnabled?: boolean;
      autoRoleId?: string | null;
      isPublic?: boolean;
      category?: ServerCategory;
      tags?: string[];
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !data) return;
      const s = servers.find((srv) => srv.id === data.serverId);
      if (!s) return;
      if (!checkServerPermission(user, s, 'manage_server')) {
        return socket.emit('server_action_error', {
          message: 'Bu ayarları değiştirmek için Sunucu Yönetimi yetkiniz yok.',
        });
      }

      if (data.name) s.name = sanitizeText(data.name).trim().slice(0, 80);
      if (data.icon !== undefined && typeof data.icon === 'string') {
        const trimmedIcon = data.icon.trim();
        if (isSafeImageMedia(trimmedIcon) || isSafeEmojiOrShortIcon(trimmedIcon)) {
          s.icon = trimmedIcon;
        }
      }
      if (data.bannerGradient !== undefined) s.bannerGradient = data.bannerGradient;
      if (data.bannerImage !== undefined && typeof data.bannerImage === 'string') {
        if (data.bannerImage === '' || isSafeImageMedia(data.bannerImage)) {
          s.bannerImage = data.bannerImage;
        }
      }
      if (data.description !== undefined) s.description = sanitizeText(data.description).trim().slice(0, 500);
      if (data.afkChannelId !== undefined) s.afkChannelId = data.afkChannelId;
      if (data.afkTimeoutMinutes !== undefined) s.afkTimeoutMinutes = data.afkTimeoutMinutes;
      if (data.bitrateKbps !== undefined) s.bitrateKbps = data.bitrateKbps;
      if (data.voiceRegion !== undefined) s.voiceRegion = data.voiceRegion;
      if (data.systemChannelId !== undefined) s.systemChannelId = data.systemChannelId;
      if (data.verificationLevel !== undefined) s.verificationLevel = data.verificationLevel;
      if (data.defaultNotification !== undefined) s.defaultNotification = data.defaultNotification;
      if (data.autoModEnabled !== undefined) s.autoModEnabled = data.autoModEnabled;
      if (data.vanityCode !== undefined)
        s.vanityCode = data.vanityCode.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      if (data.welcomeChannelId !== undefined) s.welcomeChannelId = data.welcomeChannelId;
      if (data.welcomeMessage !== undefined) s.welcomeMessage = sanitizeText(data.welcomeMessage).trim().slice(0, 500);
      if (data.welcomeEnabled !== undefined) s.welcomeEnabled = data.welcomeEnabled;
      if (data.autoRoleId !== undefined) s.autoRoleId = data.autoRoleId;
      if (data.sfuMode && ['auto', 'p2p', 'sfu'].includes(data.sfuMode)) s.sfuMode = data.sfuMode;
      if (typeof data.isPublic === 'boolean') s.isPublic = data.isPublic;
      if (data.category && ['gaming', 'community', 'tech', 'music', 'education', 'other'].includes(data.category)) {
        s.category = data.category;
      }
      if (Array.isArray(data.tags)) {
        s.tags = data.tags.map((t) => sanitizeText(String(t)).trim().slice(0, 24)).filter(Boolean).slice(0, 6);
      }

      saveServers(servers);
      addAuditLog(
        'SUNUCU_GUNCELLENDI',
        `${s.name} sunucu ayarları güncellendi (Bitrate: ${s.bitrateKbps || 128}kbps, Yetkili: ${user.username})`
      );
      emitServerUpdatedToMembers(s);
    }
  );

  socket.on('restore_server_backup', ({ serverId, backupData }: { serverId: string; backupData: any }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !backupData) return;
    const s = servers.find((srv) => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_server')) {
      return socket.emit('server_action_error', {
        message: 'Sunucu yedeğini yüklemek için Sunucu Yönetimi yetkiniz yok.',
      });
    }

    if (backupData.name) s.name = backupData.name.trim();
    if (backupData.icon) s.icon = backupData.icon;
    if (backupData.bannerGradient) s.bannerGradient = backupData.bannerGradient;
    if (backupData.description !== undefined) s.description = backupData.description;
    if (backupData.bitrateKbps) s.bitrateKbps = backupData.bitrateKbps;
    if (backupData.voiceRegion) s.voiceRegion = backupData.voiceRegion;
    if (backupData.verificationLevel) s.verificationLevel = backupData.verificationLevel;
    if (backupData.autoModEnabled !== undefined) s.autoModEnabled = backupData.autoModEnabled;

    if (Array.isArray(backupData.categories)) {
      s.categories = backupData.categories.slice(0, 20).map((cat: any, idx: number) => ({
        id: cat.id || `cat-${Date.now()}-${idx}`,
        name: sanitizeText(String(cat.name || 'Kategori')).trim().slice(0, 48) || 'Kategori',
        position: typeof cat.position === 'number' ? cat.position : idx,
        collapsedByDefault: Boolean(cat.collapsedByDefault),
      }));
    }

    if (Array.isArray(backupData.channels) && backupData.channels.length > 0) {
      s.channels = backupData.channels.map((ch: any, idx: number) => ({
        id: ch.id || `ch-${ch.type || 'text'}-${Date.now() + idx}`,
        name: ch.name || 'kanal',
        type: ch.type === 'voice' || ch.type === 'announcement' || ch.type === 'forum' ? ch.type : 'text',
        serverId: s.id,
        categoryId: ch.categoryId || null,
        position: typeof ch.position === 'number' ? ch.position : idx,
        topic: ch.topic || '',
        bitrateKbps: ch.bitrateKbps || s.bitrateKbps || 128,
        userLimit: ch.userLimit || 0,
        isTempCreatorChannel: !!ch.isTempCreatorChannel,
      }));
    }

    if (Array.isArray(backupData.roles) && backupData.roles.length > 0) {
      s.roles = backupData.roles.map((r: any, idx: number) => ({
        id: r.id || `role-${Date.now() + idx}`,
        name: r.name || 'Yeni Rol',
        color: r.color || '#3b82f6',
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
        isDefault: !!r.isDefault,
      }));
    }

    saveServers(servers);
    addAuditLog('SUNUCU_YEDEKTEN_YUKLENDI', `${s.name} sunucusu şablondan/yedekten yüklendi (Yetkili: ${user.username})`);
    emitServerUpdatedToMembers(s);
    socket.emit('server_restore_success', { message: 'Sunucu şablonu/yedeği başarıyla geri yüklendi!' });
  });

  socket.on(
    'create_server_role',
    ({
      serverId,
      name,
      color,
      icon,
      permissions,
    }: {
      serverId: string;
      name: string;
      color: string;
      icon?: string;
      permissions: ServerPermission[];
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const s = servers.find((srv) => srv.id === serverId);
      if (!s) return;
      if (!checkServerPermission(user, s, 'manage_roles')) {
        return socket.emit('server_action_error', { message: 'Rol oluşturmak için Rolleri Yönet yetkiniz yok.' });
      }

      if (!s.roles) s.roles = getDefaultRoles();
      const cleanIcon = typeof icon === 'string' && icon.trim() ? icon.trim().slice(0, 8) : undefined;

      const newRole: ServerRole = {
        id: `role-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        name: name.trim() || 'Yeni Rol',
        color: color || '#3b82f6',
        ...(cleanIcon ? { icon: cleanIcon } : {}),
        position: s.roles.length + 1,
        permissions: permissions || ['send_messages', 'connect_voice', 'speak_voice'],
      };

      s.roles.push(newRole);
      saveServers(servers);
      addAuditLog('ROL_OLUSTURULDU', `${s.name} sunucusunda yeni rol olusturuldu: ${newRole.name}`);
      emitServerUpdatedToMembers(s);
    }
  );

  socket.on(
    'update_server_role',
    ({
      serverId,
      roleId,
      name,
      color,
      icon,
      permissions,
      position,
    }: {
      serverId: string;
      roleId: string;
      name: string;
      color: string;
      icon?: string;
      permissions: ServerPermission[];
      position?: number;
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const s = servers.find((srv) => srv.id === serverId);
      if (!s) return;
      if (!checkServerPermission(user, s, 'manage_roles')) {
        return socket.emit('server_action_error', { message: 'Rol düzenlemek için Rolleri Yönet yetkiniz yok.' });
      }

      if (!s.roles) s.roles = getDefaultRoles();
      const role = s.roles.find((r) => r.id === roleId);
      if (!role) return;

      role.name = name.trim() || role.name;
      role.color = color || role.color;
      if (icon !== undefined) {
        const cleanIcon = typeof icon === 'string' ? icon.trim().slice(0, 8) : '';
        if (cleanIcon) role.icon = cleanIcon;
        else delete role.icon;
      }
      role.permissions = permissions;
      if (position !== undefined) role.position = position;
      saveServers(servers);

      emitServerUpdatedToMembers(s);
    }
  );

  socket.on('delete_server_role', ({ serverId, roleId }: { serverId: string; roleId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find((srv) => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'manage_roles')) {
      return socket.emit('server_action_error', { message: 'Rol silmek için yetkiniz yok.' });
    }

    if (!s.roles) s.roles = getDefaultRoles();
    const role = s.roles.find((r) => r.id === roleId);
    if (!role || role.isDefault || role.id === 'role-owner') {
      return socket.emit('server_action_error', { message: 'Bu rol korumalıdır ve silinemez.' });
    }

    s.roles = s.roles.filter((r) => r.id !== roleId);
    if (s.members) {
      s.members.forEach((m) => {
        m.roleIds = m.roleIds.filter((id) => id !== roleId);
      });
    }
    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on(
    'toggle_member_role',
    ({ serverId, targetUserId, roleId }: { serverId: string; targetUserId: string; roleId: string }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const s = servers.find((srv) => srv.id === serverId);
      if (!s) return;
      if (!checkServerPermission(user, s, 'manage_roles')) {
        return socket.emit('server_action_error', { message: 'Üyelere rol atamak için yetkiniz yok.' });
      }

      if (!s.members) s.members = [];
      const activeTarget = activeUsers.get(targetUserId);
      const lookupIdentity = activeTarget ? activeTarget : { id: targetUserId, accountId: targetUserId, username: targetUserId };
      let member = findServerMember(s, lookupIdentity);
      if (!member) {
        let targetUser: User | undefined = activeTarget;
        if (!targetUser) {
          for (const u of activeUsers.values()) {
            if (
              u.id === targetUserId ||
              u.accountId === targetUserId ||
              u.username.toLowerCase() === String(targetUserId || '').toLowerCase()
            ) {
              targetUser = u;
              break;
            }
          }
        }
        if (targetUser) {
          member = {
            userId: getPersistentUserId(targetUser),
            username: targetUser.username,
            avatar: targetUser.avatar,
            roleIds: [],
            joinedAt: new Date().toLocaleDateString('tr-TR'),
          };
          s.members.push(member);
        } else {
          return;
        }
      }

      if (member.roleIds.includes(roleId)) {
        member.roleIds = member.roleIds.filter((id) => id !== roleId);
      } else {
        member.roleIds.push(roleId);
      }
      saveServers(servers);
      emitServerUpdatedToMembers(s);
    }
  );

  socket.on('kick_server_member', ({ serverId, targetUserId }: { serverId: string; targetUserId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find((srv) => srv.id === serverId);
    if (!s) return;
    if (!checkServerPermission(user, s, 'kick_members')) {
      return socket.emit('server_action_error', { message: 'Üyeyi atmak için yetkiniz yok.' });
    }

    const activeTarget = activeUsers.get(targetUserId);
    const lookupIdentity = activeTarget ? activeTarget : { id: targetUserId, accountId: targetUserId, username: targetUserId };
    const kickedMember = findServerMember(s, lookupIdentity);
    if (targetUserId === s.ownerId || (kickedMember && kickedMember.isOwner) || isServerOwner(lookupIdentity, s)) {
      return socket.emit('server_action_error', { message: 'Sunucu sahibini atamazsınız!' });
    }

    if (s.members) {
      const targetLower = String(lookupIdentity.username || '').toLowerCase();
      s.members = s.members.filter(
        (m) =>
          m.userId !== targetUserId &&
          (!lookupIdentity.accountId || m.userId !== lookupIdentity.accountId) &&
          (!targetLower || m.username.toLowerCase() !== targetLower)
      );
    }
    saveServers(servers);
    addAuditLog('UYE_ATILDI', `${kickedMember?.username || targetUserId} sunucudan atildi (Yetkili: ${user.username})`, 'warn');
    emitServerUpdatedToMembers(s);
    const kickedName = kickedMember?.username || activeTarget?.username;
    onModerationEvent?.(s.id, {
      targetUsername: kickedName || targetUserId,
      moderatorUsername: user.username,
      action: 'kick',
      reason: 'Sunucu yetkilisi tarafından atıldı',
    });
    if (kickedName) {
      emitToUserSockets(kickedName, 'server_removed', { serverId });
    }
  });

  socket.on(
    'timeout_server_member',
    ({ serverId, targetUsername, durationMinutes }: { serverId: string; targetUsername: string; durationMinutes: number }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const s = servers.find((srv) => srv.id === serverId);
      if (!s) return;
      if (!checkServerPermission(user, s, 'kick_members') && !checkServerPermission(user, s, 'mute_members')) {
        return socket.emit('server_action_error', { message: 'Üyeyi susturmak için yetkiniz yok.' });
      }
      const targetLower = targetUsername.toLowerCase();
      const targetAcc = registeredAccounts.get(targetLower);
      if (
        targetAcc?.role === 'admin' ||
        isServerOwner({ id: targetAcc?.id, accountId: targetAcc?.id, username: targetAcc?.username || targetUsername }, s)
      ) {
        return socket.emit('server_action_error', { message: 'Yöneticilere veya sunucu sahibine zaman aşımı uygulanamaz.' });
      }

      if (!s.timeouts) s.timeouts = {};
      if (durationMinutes <= 0) {
        delete s.timeouts[targetLower];
        addAuditLog('ZAMAN_ASIMI_KALDIRILDI', `${targetUsername} kullanıcısının susturması kaldırıldı (Yetkili: ${user.username})`, 'info');
        onModerationEvent?.(s.id, {
          targetUsername,
          moderatorUsername: user.username,
          action: 'untimeout',
          reason: 'Zaman aşımı kaldırıldı',
        });
      } else {
        s.timeouts[targetLower] = Date.now() + durationMinutes * 60 * 1000;
        addAuditLog(
          'ZAMAN_ASIMI_UYGULANDI',
          `${targetUsername} ${durationMinutes} dakika susturuldu (Yetkili: ${user.username})`,
          'warn'
        );
        onModerationEvent?.(s.id, {
          targetUsername,
          moderatorUsername: user.username,
          action: 'timeout',
          reason: `${durationMinutes} dakika zaman aşımı uygulandı`,
          durationMinutes,
        });
      }
      saveServers(servers);
      emitServerUpdatedToMembers(s);
    }
  );

  socket.on('create_server_invite', ({ serverId, maxUses, expireMinutes, sourceLabel }: { serverId: string; maxUses?: number; expireMinutes?: number; sourceLabel?: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const s = servers.find((srv) => srv.id === serverId);
    if (!s) return;

    if (!s.invites) s.invites = [];
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newInvite = {
      code,
      serverId,
      createdBy: user.username,
      createdAt: new Date().toISOString(),
      expiresAt: expireMinutes && expireMinutes > 0 ? Date.now() + expireMinutes * 60 * 1000 : null,
      maxUses: maxUses && maxUses > 0 ? maxUses : undefined,
      uses: 0,
      sourceLabel: normalizeInviteSourceLabel(sourceLabel),
      recentJoiners: [],
    };
    s.invites.unshift(newInvite);
    if (s.invites.length > 20) s.invites = s.invites.slice(0, 20);
    saveServers(servers);
    emitServerUpdatedToMembers(s);
    socket.emit('server_invite_created', newInvite);
  });

  socket.on('preview_server_invite', ({ code }: { code: string }) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      return socket.emit('preview_invite_response', { success: false, error: 'Davet kodu boş olamaz.' });
    }

    for (const s of servers) {
      const inv = s.invites?.find((i) => i.code === cleanCode);
      if (inv) {
        if (inv.expiresAt && inv.expiresAt < Date.now()) {
          return socket.emit('preview_invite_response', { success: false, error: 'Bu davet linkinin süresi dolmuş.' });
        }
        if (inv.maxUses && inv.uses >= inv.maxUses) {
          return socket.emit('preview_invite_response', {
            success: false,
            error: 'Bu davet linki maksimum kullanım sınırına ulaşmış.',
          });
        }
        return socket.emit('preview_invite_response', {
          success: true,
          server: {
            id: s.id,
            name: s.name,
            icon: s.icon,
            bannerGradient: s.bannerGradient,
            bannerImage: s.bannerImage,
            description: s.description,
            memberCount: s.members?.length || 0,
          },
        });
      }
    }

    socket.emit('preview_invite_response', { success: false, error: 'Geçersiz veya bulunamayan davet kodu.' });
  });

  socket.on('join_server_by_invite', ({ code }: { code: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !code) return;
    const cleanCode = code.trim().toUpperCase();

    for (const s of servers) {
      const inv = s.invites?.find((i) => i.code === cleanCode);
      if (inv) {
        if (inv.expiresAt && inv.expiresAt < Date.now()) {
          return socket.emit('join_invite_response', { success: false, error: 'Bu davet linkinin süresi dolmuş.' });
        }
        if (inv.maxUses && inv.uses >= inv.maxUses) {
          return socket.emit('join_invite_response', {
            success: false,
            error: 'Bu davet linki maksimum kullanım sınırına ulaşmış.',
          });
        }

        addUserToServer(user, s);
        inv.uses += 1;
        const joiners = Array.isArray(inv.recentJoiners) ? inv.recentJoiners : [];
        joiners.push({ username: user.username, joinedAt: new Date().toISOString() });
        inv.recentJoiners = joiners.slice(-50);
        saveServers(servers);
        emitServerUpdatedToMembers(s);
        const srvMsgs = getInitialMessagesForServers([s], user.username);
        return socket.emit('join_invite_response', {
          success: true,
          serverId: s.id,
          serverName: s.name,
          server: s,
          messages: srvMsgs.initialMessages,
          hasMoreMessages: srvMsgs.hasMoreMessages,
        });
      }
    }

    socket.emit('join_invite_response', { success: false, error: 'Geçersiz veya bulunamayan davet kodu.' });
  });

  socket.on('create_category', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (!socketEventLimiter.allow(socket.id, 'create_category', 15, 30_000)) return;
    const check = validatePayload<{ serverId: string; name: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      name: { type: 'string', required: true, minLen: 1, maxLen: 48 },
    });
    if (!check.ok) return socket.emit('server_action_error', { message: check.error });
    const s = servers.find((srv) => srv.id === check.data.serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Kategori oluşturmak için Kanalları Yönet yetkiniz yok.' });
    }
    const cleanName = sanitizeText(check.data.name).trim().slice(0, 40);
    if (!cleanName) return;
    if (!s.categories) s.categories = [];
    if (s.categories.length >= 25) {
      return socket.emit('server_action_error', { message: 'Sunucu başına en fazla 25 kategori eklenebilir.' });
    }
    s.categories.push({
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      position: s.categories.length,
    });
    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on('rename_category', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const check = validatePayload<{ serverId: string; categoryId: string; name: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      categoryId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      name: { type: 'string', required: true, minLen: 1, maxLen: 48 },
    });
    if (!check.ok) return;
    const s = servers.find((srv) => srv.id === check.data.serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) return;
    const cat = s.categories?.find((c) => c.id === check.data.categoryId);
    if (!cat) return;
    const cleanName = sanitizeText(check.data.name).trim().slice(0, 40);
    if (!cleanName) return;
    cat.name = cleanName;
    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on('delete_category', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const check = validatePayload<{ serverId: string; categoryId: string }>(rawPayload, {
      serverId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
      categoryId: { type: 'string', required: true, minLen: 1, maxLen: 120 },
    });
    if (!check.ok) return;
    const s = servers.find((srv) => srv.id === check.data.serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) return;
    if (!s.categories) return;
    s.categories = s.categories.filter((c) => c.id !== check.data.categoryId);
    s.channels.forEach((ch) => {
      if (ch.categoryId === check.data.categoryId) ch.categoryId = null;
    });
    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on('reorder_channels', (rawPayload: unknown) => {
    const user = activeUsers.get(socket.id);
    if (!user || !rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return;
    const payload = rawPayload as {
      serverId?: string;
      channelId?: string;
      direction?: 'up' | 'down';
      updates?: Array<{ channelId: string; categoryId?: string | null; position: number }>;
      categoryOrder?: string[];
    };
    if (!payload.serverId) return;

    const s = servers.find((srv) => srv.id === payload.serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) return;

    if (Array.isArray(payload.updates)) {
      const validCatSet = new Set((s.categories || []).map((c) => c.id));
      for (const upd of payload.updates) {
        if (!upd || typeof upd.channelId !== 'string') continue;
        const ch = s.channels.find((c) => c.id === upd.channelId);
        if (!ch) continue;
        if (upd.categoryId === null || upd.categoryId === '') {
          ch.categoryId = null;
        } else if (typeof upd.categoryId === 'string' && validCatSet.has(upd.categoryId)) {
          ch.categoryId = upd.categoryId;
        }
        if (typeof upd.position === 'number' && Number.isFinite(upd.position)) {
          ch.position = Math.max(0, Math.floor(upd.position));
        }
      }
      s.channels.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      if (Array.isArray(payload.categoryOrder) && Array.isArray(s.categories)) {
        const orderMap = new Map<string, number>();
        payload.categoryOrder.forEach((cid, i) => orderMap.set(cid, i));
        s.categories.forEach((cat) => {
          if (orderMap.has(cat.id)) cat.position = orderMap.get(cat.id)!;
        });
        s.categories.sort((a, b) => a.position - b.position);
      }
      saveServers(servers);
      emitServerUpdatedToMembers(s);
      return;
    }

    if (!payload.channelId || !payload.direction) return;
    const idx = s.channels.findIndex((c) => c.id === payload.channelId);
    if (idx === -1) return;

    const targetType = s.channels[idx].type;
    const sameTypeIndices: number[] = [];
    s.channels.forEach((ch, i) => {
      if (ch.type === targetType) sameTypeIndices.push(i);
    });

    const posInType = sameTypeIndices.indexOf(idx);
    if (posInType === -1) return;

    const swapPosInType = payload.direction === 'up' ? posInType - 1 : posInType + 1;
    if (swapPosInType < 0 || swapPosInType >= sameTypeIndices.length) return;

    const swapIdx = sameTypeIndices[swapPosInType];
    const temp = s.channels[idx];
    s.channels[idx] = s.channels[swapIdx];
    s.channels[swapIdx] = temp;

    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on('clear_channel_messages', ({ serverId, channelId, count }: { serverId: string; channelId: string; count: number }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !channelId) return;
    const s = servers.find((srv) => srv.id === serverId);
    if (!s || !checkServerPermission(user, s, 'manage_channels')) {
      return socket.emit('server_action_error', { message: 'Mesaj temizlemek için Kanal/Sunucu Yönetimi yetkiniz yok.' });
    }
    const safeCount = Math.min(Math.max(Number(count) || 10, 1), 100);
    const list = messages[channelId] || [];
    if (list.length === 0) return;
    messages[channelId] = list.slice(0, Math.max(0, list.length - safeCount));
    saveChannelMessageBulkReplace(channelId, messages[channelId]);
    emitToChannelAudience(channelId, serverId, 'channel_messages_cleared', {
      channelId,
      messages: messages[channelId],
    });
  });

  socket.on(
    'create_server_event',
    ({
      serverId,
      title,
      description,
      startTime,
      voiceChannelId,
    }: {
      serverId: string;
      title: string;
      description?: string;
      startTime: string;
      voiceChannelId?: string | null;
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !serverId) return;
      const s = servers.find((srv) => srv.id === serverId);
      if (!s || !checkServerPermission(user, s, 'manage_channels')) {
        return socket.emit('server_action_error', { message: 'Etkinlik oluşturmak için yetkiniz yok.' });
      }
      const cleanTitle = sanitizeText(title).trim().slice(0, 100);
      if (!cleanTitle || !startTime) return;
      if (!s.events) s.events = [];
      s.events.unshift({
        id: `evt-${Date.now()}`,
        title: cleanTitle,
        description: sanitizeText(description || '').trim().slice(0, 400),
        startTime: sanitizeText(startTime).trim().slice(0, 64),
        voiceChannelId: voiceChannelId || null,
        createdBy: user.username,
        rsvps: [user.username],
      });
      if (s.events.length > 30) s.events = s.events.slice(0, 30);
      saveServers(servers);
      emitServerUpdatedToMembers(s);
    }
  );

  socket.on('rsvp_server_event', ({ serverId, eventId }: { serverId: string; eventId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !eventId) return;
    const s = servers.find((srv) => srv.id === serverId);
    const ev = s?.events?.find((e) => e.id === eventId);
    if (!s || !ev) return;
    const idx = ev.rsvps.findIndex((u) => u.toLowerCase() === user.username.toLowerCase());
    if (idx === -1) {
      ev.rsvps.push(user.username);
    } else {
      ev.rsvps.splice(idx, 1);
    }
    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on('delete_server_event', ({ serverId, eventId }: { serverId: string; eventId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId || !eventId) return;
    const s = servers.find((srv) => srv.id === serverId);
    const ev = s?.events?.find((e) => e.id === eventId);
    if (!s || !ev) return;
    const canDelete = ev.createdBy.toLowerCase() === user.username.toLowerCase() || checkServerPermission(user, s, 'manage_server');
    if (!canDelete) return;
    s.events = (s.events || []).filter((e) => e.id !== eventId);
    saveServers(servers);
    emitServerUpdatedToMembers(s);
  });

  socket.on('delete_server', ({ serverId }: { serverId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const sIdx = servers.findIndex((srv) => srv.id === serverId);
    if (sIdx === -1) return;
    const s = servers[sIdx];

    if (!isServerOwner(user, s) && user.role !== 'admin') {
      return socket.emit('server_action_error', {
        message: 'Yalnızca sunucu sahibi veya Sistem Yöneticisi sunucuyu silebilir!',
      });
    }

    const sName = s.name;
    const recipientSocketIds = new Set<string>();
    for (const [sId, u] of activeUsers.entries()) {
      if (u.role === 'admin' || isUserMemberOfServer(u, s)) {
        recipientSocketIds.add(sId);
      }
    }
    servers.splice(sIdx, 1);
    saveServers(servers);
    addAuditLog('SUNUCU_SILINDI', `${sName} sunucusu silindi (Silen: ${user.username})`, 'warn');
    for (const sId of recipientSocketIds) {
      io.to(sId).emit('server_deleted', { serverId });
    }
  });

  socket.on('leave_server', ({ serverId }: { serverId: string }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !serverId) {
      return socket.emit('leave_server_response', { success: false, error: 'Geçersiz istek.' });
    }
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) {
      return socket.emit('leave_server_response', { success: false, error: 'Sunucu bulunamadı.' });
    }
    const isOwner = isServerOwner(user, srv);
    if (isOwner) {
      return socket.emit('leave_server_response', {
        success: false,
        error: 'Sunucu sahibi kendi sunucusundan ayrılamaz. Sunucuyu silebilirsiniz.',
      });
    }

    if (srv.members) {
      srv.members = srv.members.filter(
        (m) =>
          m.userId !== user.id &&
          (!user.accountId || m.userId !== user.accountId) &&
          m.username.toLowerCase() !== user.username.toLowerCase()
      );
    }

    if (user.currentVoiceChannelId && srv.channels.some((c) => c.id === user.currentVoiceChannelId)) {
      const prevCh = user.currentVoiceChannelId;
      socket.leave(prevCh);
      user.currentVoiceChannelId = undefined;
      io.to(prevCh).emit('user_left_voice', { userId: socket.id, channelId: prevCh });
      emitUserUpdated(user);
      cleanupTemporaryChannels();
    }

    saveServers(servers);
    emitServerUpdatedToMembers(srv);
    emitToUserSockets(user.username, 'server_removed', { serverId });
    addAuditLog('SUNUCUDAN_AYRILDI', `${user.username}, "${srv.name}" sunucusundan ayrıldı.`, 'info');
    socket.emit('leave_server_response', { success: true, serverId });
  });
}
