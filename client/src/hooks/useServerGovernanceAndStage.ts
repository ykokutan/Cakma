import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  AutomationActionType,
  AutomationTriggerType,
  BotEventType,
  BotSlashCommand,
  ChannelPermissionOverride,
  GroupDmRoom,
  GroupE2eeKeyEnvelope,
  IncomingVoiceScreenAnnotation,
  ModerationCaseAction,
  ScheduledMessage,
  Server,
  ServerAuditEntry,
  ServerAutomationRule,
  ServerBotPublic,
  ServerModerationCase,
  ServerOnboardingConfig,
  StageChannelState,
  User,
  VoiceScreenAnnotationStroke,
} from '../types';
import { authFetch } from '../utils/authFetch';
import { getOrCreateE2eeKeyPair } from '../utils/e2ee';
import {
  cacheGroupSenderKey,
  generateGroupSenderKey,
  unwrapGroupKeyEnvelope,
  wrapGroupKeyForMembers,
} from '../utils/groupE2ee';

interface UseServerGovernanceAndStageParams {
  socket: Socket | null;
  currentUser: User | null;
  currentServerHost: string;
  setServers: Dispatch<SetStateAction<Server[]>>;
  groupDms: GroupDmRoom[];
  onlineUsers: User[];
}

export interface ModerationNoticeBanner {
  serverId: string;
  serverName: string;
  caseItem: ServerModerationCase;
}

export function useServerGovernanceAndStage(params: UseServerGovernanceAndStageParams) {
  const { socket, currentUser, currentServerHost, setServers, groupDms, onlineUsers } = params;

  const [latestModerationNotice, setLatestModerationNotice] = useState<ModerationNoticeBanner | null>(null);
  const [groupE2eeReadyEpochs, setGroupE2eeReadyEpochs] = useState<Record<string, number>>({});
  const [groupE2eeVersion, setGroupE2eeVersion] = useState(0);

  const annotationListenersRef = useRef<Set<(ev: IncomingVoiceScreenAnnotation) => void>>(new Set());
  const onlineUsersRef = useRef(onlineUsers);
  onlineUsersRef.current = onlineUsers;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const groupDmsRef = useRef(groupDms);
  groupDmsRef.current = groupDms;

  const dismissModerationNotice = useCallback(() => setLatestModerationNotice(null), []);

  const resolveMemberPublicKey = useCallback(
    async (username: string): Promise<string | null> => {
      const targetLower = username.trim().toLowerCase();
      const me = currentUserRef.current;
      if (me && me.username.toLowerCase() === targetLower) {
        if (me.e2eePublicKey) return me.e2eePublicKey;
        const pair = await getOrCreateE2eeKeyPair(me.username);
        return pair ? JSON.stringify(pair.publicKeyJwk) : null;
      }
      const match = onlineUsersRef.current.find((u) => u.username.toLowerCase() === targetLower);
      return match?.e2eePublicKey || null;
    },
    []
  );

  const enableOrRotateGroupE2ee = useCallback(
    async (groupId: string, forcedEpoch?: number): Promise<boolean> => {
      const me = currentUserRef.current;
      const room = groupDmsRef.current.find((g) => g.id === groupId);
      if (!socket || !me || !room) return false;

      const generated = await generateGroupSenderKey();
      if (!generated) return false;

      const nextEpoch = forcedEpoch ?? (room.e2eeEnabled ? (room.e2eeEpoch || 1) + 1 : 1);
      const recipients: Array<{ username: string; publicKeyJson: string }> = [];
      for (const memberName of room.members) {
        const pk = await resolveMemberPublicKey(memberName);
        if (pk) recipients.push({ username: memberName, publicKeyJson: pk });
      }
      if (recipients.length === 0) return false;

      const envelopes = await wrapGroupKeyForMembers(generated.rawBytes, me.username, recipients);
      if (envelopes.length === 0) return false;

      cacheGroupSenderKey(groupId, nextEpoch, generated.key);
      setGroupE2eeReadyEpochs((prev) => ({ ...prev, [groupId]: nextEpoch }));
      setGroupE2eeVersion((v) => v + 1);

      socket.emit('group_e2ee_distribute_keys', {
        groupId,
        epoch: nextEpoch,
        envelopes,
      });
      return true;
    },
    [socket, resolveMemberPublicKey]
  );

  const requestGroupE2eeKeys = useCallback(
    (groupId: string) => {
      if (!socket || !groupId) return;
      socket.emit('group_e2ee_request_keys', { groupId });
    },
    [socket]
  );

  useEffect(() => {
    if (!socket) return;

    const onStageStateUpdated = ({
      serverId,
      channelId,
      stageState,
    }: {
      serverId: string;
      channelId: string;
      stageState: StageChannelState;
    }) => {
      if (!serverId || !channelId || !stageState) return;
      setServers((prev) =>
        prev.map((srv) =>
          srv.id !== serverId
            ? srv
            : {
                ...srv,
                channels: srv.channels.map((ch) => (ch.id === channelId ? { ...ch, stageState } : ch)),
              }
        )
      );
    };

    const onVoiceScreenAnnotation = (payload: IncomingVoiceScreenAnnotation) => {
      annotationListenersRef.current.forEach((cb) => {
        try {
          cb(payload);
        } catch {}
      });
    };

    const onModerationNotice = (payload: ModerationNoticeBanner) => {
      if (payload?.caseItem) {
        setLatestModerationNotice(payload);
      }
    };

    const onGroupE2eeKeyBundle = async (payload: {
      groupId: string;
      epoch: number;
      envelope: GroupE2eeKeyEnvelope;
    }) => {
      const me = currentUserRef.current;
      if (!me || !payload?.groupId || !payload?.envelope) return;
      const senderPk = await resolveMemberPublicKey(payload.envelope.senderUsername);
      if (!senderPk) return;
      const key = await unwrapGroupKeyEnvelope(payload.envelope, me.username, senderPk);
      if (!key) return;
      cacheGroupSenderKey(payload.groupId, payload.epoch, key);
      setGroupE2eeReadyEpochs((prev) => ({ ...prev, [payload.groupId]: payload.epoch }));
      setGroupE2eeVersion((v) => v + 1);
    };

    const onGroupE2eeRotationRequired = (payload: { groupId: string; epoch: number }) => {
      const me = currentUserRef.current;
      const room = groupDmsRef.current.find((g) => g.id === payload?.groupId);
      if (!me || !room) return;
      if (room.ownerUsername.toLowerCase() === me.username.toLowerCase()) {
        void enableOrRotateGroupE2ee(room.id, payload.epoch);
      }
    };

    const onGroupE2eeKeyNeeded = (payload: { groupId: string; requesterUsername: string; epoch: number }) => {
      const me = currentUserRef.current;
      const room = groupDmsRef.current.find((g) => g.id === payload?.groupId);
      if (!me || !room) return;
      if (room.ownerUsername.toLowerCase() === me.username.toLowerCase()) {
        void enableOrRotateGroupE2ee(room.id, payload.epoch);
      }
    };

    socket.on('stage_state_updated', onStageStateUpdated);
    socket.on('voice_screen_annotation', onVoiceScreenAnnotation);
    socket.on('moderation_notice', onModerationNotice);
    socket.on('group_e2ee_key_bundle', onGroupE2eeKeyBundle);
    socket.on('group_e2ee_rotation_required', onGroupE2eeRotationRequired);
    socket.on('group_e2ee_key_needed', onGroupE2eeKeyNeeded);

    return () => {
      socket.off('stage_state_updated', onStageStateUpdated);
      socket.off('voice_screen_annotation', onVoiceScreenAnnotation);
      socket.off('moderation_notice', onModerationNotice);
      socket.off('group_e2ee_key_bundle', onGroupE2eeKeyBundle);
      socket.off('group_e2ee_rotation_required', onGroupE2eeRotationRequired);
      socket.off('group_e2ee_key_needed', onGroupE2eeKeyNeeded);
    };
  }, [socket, setServers, resolveMemberPublicKey, enableOrRotateGroupE2ee]);

  // Socket Governance & Media Emitters
  const updateChannelPermissions = useCallback(
    (serverId: string, channelId: string, isPrivate: boolean, permissionOverrides: ChannelPermissionOverride[]) => {
      if (!socket) return;
      socket.emit('update_channel_permissions', { serverId, channelId, isPrivate, permissionOverrides });
    },
    [socket]
  );

  const updateServerOnboarding = useCallback(
    (serverId: string, onboarding: ServerOnboardingConfig) => {
      if (!socket) return;
      socket.emit('update_server_onboarding', { serverId, onboarding });
    },
    [socket]
  );

  const acceptServerOnboarding = useCallback(
    (serverId: string, selectedRoleIds: string[]) => {
      if (!socket) return;
      socket.emit('accept_server_onboarding', { serverId, selectedRoleIds });
    },
    [socket]
  );

  const toggleSelfRole = useCallback(
    (serverId: string, roleId: string) => {
      if (!socket) return;
      socket.emit('toggle_self_role', { serverId, roleId });
    },
    [socket]
  );

  const addServerSound = useCallback(
    (serverId: string, name: string, emoji: string, dataUrl: string) => {
      if (!socket) return;
      socket.emit('add_server_sound', { serverId, name, emoji, dataUrl });
    },
    [socket]
  );

  const deleteServerSound = useCallback(
    (serverId: string, soundId: string) => {
      if (!socket) return;
      socket.emit('delete_server_sound', { serverId, soundId });
    },
    [socket]
  );

  const addServerSticker = useCallback(
    (serverId: string, name: string, imageUrl: string) => {
      if (!socket) return;
      socket.emit('add_server_sticker', { serverId, name, imageUrl });
    },
    [socket]
  );

  const deleteServerSticker = useCallback(
    (serverId: string, stickerId: string) => {
      if (!socket) return;
      socket.emit('delete_server_sticker', { serverId, stickerId });
    },
    [socket]
  );

  const stageRequestSpeak = useCallback(
    (serverId: string, channelId: string) => {
      socket?.emit('stage_request_speak', { serverId, channelId });
    },
    [socket]
  );

  const stageCancelSpeak = useCallback(
    (serverId: string, channelId: string) => {
      socket?.emit('stage_cancel_speak', { serverId, channelId });
    },
    [socket]
  );

  const stagePromoteSpeaker = useCallback(
    (serverId: string, channelId: string, targetUsername: string) => {
      socket?.emit('stage_promote_speaker', { serverId, channelId, targetUsername });
    },
    [socket]
  );

  const stageDemoteSpeaker = useCallback(
    (serverId: string, channelId: string, targetUsername: string) => {
      socket?.emit('stage_demote_speaker', { serverId, channelId, targetUsername });
    },
    [socket]
  );

  const stageSetTopic = useCallback(
    (serverId: string, channelId: string, topic: string) => {
      socket?.emit('stage_set_topic', { serverId, channelId, topic });
    },
    [socket]
  );

  const sendVoiceScreenAnnotation = useCallback(
    (channelId: string, targetSharerId: string, stroke: VoiceScreenAnnotationStroke) => {
      socket?.emit('voice_screen_annotation', { channelId, targetSharerId, stroke });
    },
    [socket]
  );

  const subscribeVoiceScreenAnnotations = useCallback((cb: (ev: IncomingVoiceScreenAnnotation) => void) => {
    annotationListenersRef.current.add(cb);
    return () => {
      annotationListenersRef.current.delete(cb);
    };
  }, []);

  const executeCustomCommand = useCallback(
    (serverId: string, channelId: string, commandName: string, args: string) => {
      socket?.emit('execute_custom_command', { serverId, channelId, commandName, args });
    },
    [socket]
  );

  // REST Governance / Scheduled / Bots / Automations API
  const fetchServerAuditLogs = useCallback(
    async (serverId: string): Promise<ServerAuditEntry[]> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/audit-logs`);
        const json = await res.json().catch(() => ({}));
        return res.ok && Array.isArray(json?.logs) ? json.logs : [];
      } catch {
        return [];
      }
    },
    [currentServerHost]
  );

  const fetchServerCases = useCallback(
    async (serverId: string): Promise<ServerModerationCase[]> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/cases`);
        const json = await res.json().catch(() => ({}));
        return res.ok && Array.isArray(json?.cases) ? json.cases : [];
      } catch {
        return [];
      }
    },
    [currentServerHost]
  );

  const createServerModCase = useCallback(
    async (
      serverId: string,
      payload: { targetUsername: string; action: ModerationCaseAction; reason: string; durationMinutes?: number }
    ): Promise<{ success: boolean; caseItem?: ServerModerationCase; error?: string }> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { success: false, error: json?.error || 'Moderasyon işlemi kaydedilemedi.' };
        }
        return { success: true, caseItem: json.caseItem };
      } catch {
        return { success: false, error: 'Sunucu bağlantı hatası.' };
      }
    },
    [currentServerHost]
  );

  const fetchScheduledMessages = useCallback(
    async (serverId: string): Promise<ScheduledMessage[]> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/scheduled-messages`);
        const json = await res.json().catch(() => ({}));
        return res.ok && Array.isArray(json?.scheduledMessages) ? json.scheduledMessages : [];
      } catch {
        return [];
      }
    },
    [currentServerHost]
  );

  const createScheduledMessage = useCallback(
    async (
      serverId: string,
      payload: { channelId: string; content: string; scheduledFor: string; repeatIntervalMinutes?: number }
    ): Promise<{ success: boolean; scheduledMessage?: ScheduledMessage; error?: string }> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/scheduled-messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { success: false, error: json?.error || 'Zamanlanmış mesaj kaydedilemedi.' };
        }
        return { success: true, scheduledMessage: json.scheduledMessage };
      } catch {
        return { success: false, error: 'Sunucu bağlantı hatası.' };
      }
    },
    [currentServerHost]
  );

  const deleteScheduledMessage = useCallback(
    async (serverId: string, id: string): Promise<boolean> => {
      try {
        const res = await authFetch(
          currentServerHost,
          `/api/servers/${encodeURIComponent(serverId)}/scheduled-messages/${encodeURIComponent(id)}`,
          { method: 'DELETE' }
        );
        return res.ok;
      } catch {
        return false;
      }
    },
    [currentServerHost]
  );

  const fetchServerBots = useCallback(
    async (serverId: string): Promise<ServerBotPublic[]> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/bots`);
        const json = await res.json().catch(() => ({}));
        return res.ok && Array.isArray(json?.bots) ? json.bots : [];
      } catch {
        return [];
      }
    },
    [currentServerHost]
  );

  const createServerBot = useCallback(
    async (
      serverId: string,
      payload: {
        name: string;
        avatar?: string;
        webhookUrl?: string;
        events?: BotEventType[];
        slashCommands?: BotSlashCommand[];
      }
    ): Promise<{ success: boolean; bot?: ServerBotPublic; botToken?: string; error?: string }> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/bots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { success: false, error: json?.error || 'Bot oluşturulamadı.' };
        }
        return { success: true, bot: json.bot, botToken: json.botToken };
      } catch {
        return { success: false, error: 'Sunucu bağlantı hatası.' };
      }
    },
    [currentServerHost]
  );

  const updateServerBot = useCallback(
    async (
      serverId: string,
      botId: string,
      payload: Partial<{ name: string; enabled: boolean; webhookUrl: string; events: BotEventType[]; slashCommands: BotSlashCommand[] }>
    ): Promise<{ success: boolean; bot?: ServerBotPublic; error?: string }> => {
      try {
        const res = await authFetch(
          currentServerHost,
          `/api/servers/${encodeURIComponent(serverId)}/bots/${encodeURIComponent(botId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { success: false, error: json?.error || 'Bot güncellenemedi.' };
        }
        return { success: true, bot: json.bot };
      } catch {
        return { success: false, error: 'Sunucu bağlantı hatası.' };
      }
    },
    [currentServerHost]
  );

  const deleteServerBot = useCallback(
    async (serverId: string, botId: string): Promise<boolean> => {
      try {
        const res = await authFetch(
          currentServerHost,
          `/api/servers/${encodeURIComponent(serverId)}/bots/${encodeURIComponent(botId)}`,
          { method: 'DELETE' }
        );
        return res.ok;
      } catch {
        return false;
      }
    },
    [currentServerHost]
  );

  const fetchServerAutomations = useCallback(
    async (serverId: string): Promise<ServerAutomationRule[]> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/automations`);
        const json = await res.json().catch(() => ({}));
        return res.ok && Array.isArray(json?.rules) ? json.rules : [];
      } catch {
        return [];
      }
    },
    [currentServerHost]
  );

  const createServerAutomation = useCallback(
    async (
      serverId: string,
      payload: {
        name: string;
        triggerType: AutomationTriggerType;
        keywords?: string[];
        spamCount?: number;
        spamWindowSeconds?: number;
        actionType: AutomationActionType;
        timeoutMinutes?: number;
        roleId?: string;
        noticeChannelId?: string;
        noticeTemplate?: string;
      }
    ): Promise<{ success: boolean; rule?: ServerAutomationRule; error?: string }> => {
      try {
        const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(serverId)}/automations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { success: false, error: json?.error || 'Otomasyon kuralı oluşturulamadı.' };
        }
        return { success: true, rule: json.rule };
      } catch {
        return { success: false, error: 'Sunucu bağlantı hatası.' };
      }
    },
    [currentServerHost]
  );

  const updateServerAutomation = useCallback(
    async (
      serverId: string,
      ruleId: string,
      payload: Partial<{ enabled: boolean; name: string; keywords: string[] }>
    ): Promise<{ success: boolean; rule?: ServerAutomationRule; error?: string }> => {
      try {
        const res = await authFetch(
          currentServerHost,
          `/api/servers/${encodeURIComponent(serverId)}/automations/${encodeURIComponent(ruleId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { success: false, error: json?.error || 'Kural güncellenemedi.' };
        }
        return { success: true, rule: json.rule };
      } catch {
        return { success: false, error: 'Sunucu bağlantı hatası.' };
      }
    },
    [currentServerHost]
  );

  const deleteServerAutomation = useCallback(
    async (serverId: string, ruleId: string): Promise<boolean> => {
      try {
        const res = await authFetch(
          currentServerHost,
          `/api/servers/${encodeURIComponent(serverId)}/automations/${encodeURIComponent(ruleId)}`,
          { method: 'DELETE' }
        );
        return res.ok;
      } catch {
        return false;
      }
    },
    [currentServerHost]
  );

  return useMemo(
    () => ({
      latestModerationNotice,
      dismissModerationNotice,
      groupE2eeReadyEpochs,
      groupE2eeVersion,
      enableOrRotateGroupE2ee,
      requestGroupE2eeKeys,
      updateChannelPermissions,
      updateServerOnboarding,
      acceptServerOnboarding,
      toggleSelfRole,
      addServerSound,
      deleteServerSound,
      addServerSticker,
      deleteServerSticker,
      stageRequestSpeak,
      stageCancelSpeak,
      stagePromoteSpeaker,
      stageDemoteSpeaker,
      stageSetTopic,
      sendVoiceScreenAnnotation,
      subscribeVoiceScreenAnnotations,
      executeCustomCommand,
      fetchServerAuditLogs,
      fetchServerCases,
      createServerModCase,
      fetchScheduledMessages,
      createScheduledMessage,
      deleteScheduledMessage,
      fetchServerBots,
      createServerBot,
      updateServerBot,
      deleteServerBot,
      fetchServerAutomations,
      createServerAutomation,
      updateServerAutomation,
      deleteServerAutomation,
    }),
    [
      latestModerationNotice,
      dismissModerationNotice,
      groupE2eeReadyEpochs,
      groupE2eeVersion,
      enableOrRotateGroupE2ee,
      requestGroupE2eeKeys,
      updateChannelPermissions,
      updateServerOnboarding,
      acceptServerOnboarding,
      toggleSelfRole,
      addServerSound,
      deleteServerSound,
      addServerSticker,
      deleteServerSticker,
      stageRequestSpeak,
      stageCancelSpeak,
      stagePromoteSpeaker,
      stageDemoteSpeaker,
      stageSetTopic,
      sendVoiceScreenAnnotation,
      subscribeVoiceScreenAnnotations,
      executeCustomCommand,
      fetchServerAuditLogs,
      fetchServerCases,
      createServerModCase,
      fetchScheduledMessages,
      createScheduledMessage,
      deleteScheduledMessage,
      fetchServerBots,
      createServerBot,
      updateServerBot,
      deleteServerBot,
      fetchServerAutomations,
      createServerAutomation,
      updateServerAutomation,
      deleteServerAutomation,
    ]
  );
}
