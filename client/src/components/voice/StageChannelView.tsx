import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Edit3, Hand, Mic, MicOff, Radio, Users } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { Channel, Server, User } from '../../types';
import { t } from '../../utils/i18n';
import { isUserServerOwner } from '../../utils/serverIdentity';
import { AvatarView } from '../AvatarView';

interface StageChannelViewProps {
  server: Server;
  channel: Channel;
  usersInRoom: User[];
  currentUser: User | null;
  isConnected: boolean;
  onJoin: () => void;
  onContextMenuUser: (e: React.MouseEvent, user: User) => void;
}

export const StageChannelView: React.FC<StageChannelViewProps> = ({
  server,
  channel,
  usersInRoom,
  currentUser,
  isConnected,
  onJoin,
  onContextMenuUser,
}) => {
  const {
    stageRequestSpeak,
    stageCancelSpeak,
    stagePromoteSpeaker,
    stageDemoteSpeaker,
    stageSetTopic,
    isMuted,
    isSpeaking,
    language,
  } = useSocket();

  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState(channel.stageState?.topic || channel.topic || '');

  useEffect(() => {
    setTopicDraft(channel.stageState?.topic || channel.topic || '');
  }, [channel.stageState?.topic, channel.topic]);

  const canModerateStage = Boolean(
    currentUser &&
      (isUserServerOwner(currentUser, server) ||
        currentUser.role === 'admin' ||
        server.members?.some((m) => {
          if (m.username.toLowerCase() !== currentUser.username.toLowerCase()) return false;
          return m.roleIds.some((rId) => {
            const r = server.roles?.find((role) => role.id === rId);
            return (
              r?.permissions.includes('manage_server') ||
              r?.permissions.includes('manage_channels')
            );
          });
        }))
  );

  const speakersLower = new Set(
    (channel.stageState?.speakerUsernames || []).map((s) => s.toLowerCase())
  );
  const raisedLower = new Set(
    (channel.stageState?.raisedHands || []).map((s) => s.toLowerCase())
  );

  const speakers = usersInRoom.filter((u) => speakersLower.has(u.username.toLowerCase()));
  const raisedHandUsers = usersInRoom.filter(
    (u) => !speakersLower.has(u.username.toLowerCase()) && raisedLower.has(u.username.toLowerCase())
  );
  const audienceUsers = usersInRoom.filter((u) => !speakersLower.has(u.username.toLowerCase()));

  const meLower = currentUser?.username?.toLowerCase() || '';
  const amISpeaker = Boolean(meLower && speakersLower.has(meLower));
  const amIRaisingHand = Boolean(meLower && raisedLower.has(meLower));

  const currentTopic = channel.stageState?.topic || channel.topic || '';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 py-2">
      {/* Stage Topic Banner */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-blue-500/10 border border-purple-400/25 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-400/35 flex items-center justify-center text-purple-300 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
              {t(language, 'channelTypeStage')} · #{channel.name}
            </div>
            {editingTopic ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  stageSetTopic(server.id, channel.id, topicDraft.trim());
                  setEditingTopic(false);
                }}
                className="flex items-center gap-2 mt-1"
              >
                <input
                  type="text"
                  autoFocus
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  placeholder="Sahne konusunu yazın..."
                  className="flex-1 min-w-0 px-3 py-1 rounded-xl bg-black/40 border border-purple-400/40 text-xs text-white outline-none"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {currentTopic || 'Sahne yayınına hoş geldiniz!'}
                </h3>
                {canModerateStage && (
                  <button
                    type="button"
                    onClick={() => setEditingTopic(true)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
                    title={t(language, 'stageTopic')}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isConnected ? (
            <button
              type="button"
              onClick={onJoin}
              className="px-4 py-2 rounded-full bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-500/25 transition"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Dinleyici Olarak Katıl</span>
            </button>
          ) : !amISpeaker ? (
            <button
              type="button"
              onClick={() =>
                amIRaisingHand
                  ? stageCancelSpeak(server.id, channel.id)
                  : stageRequestSpeak(server.id, channel.id)
              }
              className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border transition ${
                amIRaisingHand
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 hover:bg-amber-500/30'
                  : 'bg-purple-500 hover:bg-purple-600 border-purple-400/50 text-white shadow-lg shadow-purple-500/25'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>
                {amIRaisingHand
                  ? t(language, 'stageCancelSpeak')
                  : t(language, 'stageRequestSpeak')}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Speakers Grid */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-white/60">
          <Mic className="w-3.5 h-3.5 text-purple-400" />
          <span>{t(language, 'stageSpeakers')} ({speakers.length})</span>
        </div>

        {speakers.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-dashed border-white/10 text-center text-xs text-white/40">
            Şu anda sahnede konuşmacı bulunmuyor. Moderatörler dinleyicileri sahneye davet edebilir.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {speakers.map((u) => {
              const isMe = u.id === currentUser?.id;
              const speaking = isMe ? isSpeaking : u.isSpeaking;
              const muted = isMe ? isMuted : u.isMuted;
              return (
                <div
                  key={u.id}
                  onContextMenu={(e) => onContextMenuUser(e, u)}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 transition ${
                    speaking
                      ? 'bg-purple-500/15 border-purple-400/60 shadow-[0_0_24px_rgba(168,85,247,0.2)]'
                      : 'bg-white/[0.04] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-full bg-white/10 overflow-hidden shrink-0 ${
                        speaking ? 'ring-2 ring-purple-400' : ''
                      }`}
                    >
                      <AvatarView
                        avatar={u.avatar}
                        alt={u.username}
                        fallback="🎙️"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{u.username}</span>
                        {muted && <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      </div>
                      <div className="text-[11px] text-purple-300/80 font-medium">Konuşmacı</div>
                    </div>
                  </div>
                  {canModerateStage && (
                    <button
                      type="button"
                      onClick={() => stageDemoteSpeaker(server.id, channel.id, u.username)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition shrink-0"
                      title={t(language, 'stageDemote')}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Raised Hands Queue */}
      {raisedHandUsers.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Hand className="w-3.5 h-3.5" />
            <span>{t(language, 'stageRaisedHands')} ({raisedHandUsers.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {raisedHandUsers.map((u) => (
              <div
                key={u.id}
                onContextMenu={(e) => onContextMenuUser(e, u)}
                className="px-3 py-2 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center gap-2.5"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">
                  <AvatarView
                    avatar={u.avatar}
                    alt={u.username}
                    fallback="✋"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-semibold text-white">{u.username}</span>
                {canModerateStage && (
                  <button
                    type="button"
                    onClick={() => stagePromoteSpeaker(server.id, channel.id, u.username)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black text-[11px] font-bold flex items-center gap-1 transition"
                    title={t(language, 'stagePromote')}
                  >
                    <ArrowUp className="w-3 h-3" />
                    <span>Sahneye Al</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audience */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-white/50">
          <Users className="w-3.5 h-3.5" />
          <span>{t(language, 'stageAudience')} ({audienceUsers.length})</span>
        </div>
        {audienceUsers.length === 0 ? (
          <div className="text-xs text-white/35 px-1">Odada dinleyici bulunmuyor.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {audienceUsers.map((u) => (
              <div
                key={u.id}
                onContextMenu={(e) => onContextMenuUser(e, u)}
                className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 flex items-center gap-2"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 shrink-0">
                  <AvatarView
                    avatar={u.avatar}
                    alt={u.username}
                    fallback="👤"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs text-white/85">{u.username}</span>
                {raisedLower.has(u.username.toLowerCase()) && (
                  <span className="text-[11px]" title="Söz istiyor">✋</span>
                )}
                {canModerateStage && (
                  <button
                    type="button"
                    onClick={() => stagePromoteSpeaker(server.id, channel.id, u.username)}
                    className="p-1 rounded-full hover:bg-purple-500/25 text-purple-300 transition"
                    title={t(language, 'stagePromote')}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
