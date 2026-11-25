import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleDot, MessageSquare, MessagesSquare, Paperclip, Plus, RotateCcw, Search, Send, Tag, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { Channel, Message } from '../../types';
import { t } from '../../utils/i18n';
import { isUserServerOwner } from '../../utils/serverIdentity';
import { AvatarView } from '../AvatarView';

interface ForumChannelViewProps {
  channel: Channel;
  messages: Message[];
  onOpenThread: (messageId: string) => void;
  onAuthorClick: (authorId: string, authorUsername: string, authorAvatar: string) => void;
}

export const ForumChannelView: React.FC<ForumChannelViewProps> = ({
  channel,
  messages,
  onOpenThread,
  onAuthorClick,
}) => {
  const { sendMessage, addReaction, toggleForumSolved, currentUser, activeServer, hasServerPermission, language } = useSocket();
  const [isComposing, setIsComposing] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postTagsText, setPostTagsText] = useState('');
  const [postBody, setPostBody] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'solved'>('all');

  const { solvedCount, openCount } = useMemo(() => {
    let solved = 0;
    for (const msg of messages) {
      if (msg.forumPost?.solved) solved += 1;
    }
    return { solvedCount: solved, openCount: messages.length - solved };
  }, [messages]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const msg of messages) {
      for (const rawTag of msg.forumPost?.tags || []) {
        const cleaned = rawTag.trim();
        if (cleaned) tagSet.add(cleaned);
      }
    }
    return Array.from(tagSet);
  }, [messages]);

  const sortedAndFiltered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return [...messages]
      .reverse()
      .filter((msg) => {
        const isSolved = Boolean(msg.forumPost?.solved);
        if (statusFilter === 'open' && isSolved) return false;
        if (statusFilter === 'solved' && !isSolved) return false;
        if (activeTag) {
          const tags = msg.forumPost?.tags || [];
          if (!tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase())) {
            return false;
          }
        }
        if (!q) return true;
        const title = msg.forumPost?.title || '';
        const tagsJoined = (msg.forumPost?.tags || []).join(' ');
        return (
          title.toLowerCase().includes(q) ||
          msg.content.toLowerCase().includes(q) ||
          tagsJoined.toLowerCase().includes(q) ||
          msg.author.username.toLowerCase().includes(q)
        );
      });
  }, [messages, searchText, activeTag, statusFilter]);

  const handleSubmitTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const title = postTitle.trim();
    const body = postBody.trim();
    if (!title || !body) return;

    const tags = Array.from(
      new Set(
        postTagsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ).slice(0, 5);

    sendMessage(body, [], undefined, {
      forumPost: {
        title: title.slice(0, 120),
        tags,
      },
    });
    setPostTitle('');
    setPostTagsText('');
    setPostBody('');
    setIsComposing(false);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Forum Top Filter & Composer Bar */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-white/[0.06] bg-white/[0.02] space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md relative">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={`#${channel.name} konularında ara...`}
              className="w-full bg-black/35 border border-white/10 rounded-xl pl-8 pr-8 py-1.5 text-xs text-white placeholder:text-white/35 outline-none focus:border-cyan-400"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="absolute right-2.5 text-white/40 hover:text-white"
                aria-label="Aramayı temizle"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsComposing((v) => !v)}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-cyan-500/20"
          >
            {isComposing ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isComposing ? 'Kapat' : t(language, 'newForumPost')}</span>
          </button>
        </div>

        {(messages.length > 0 || allTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center rounded-full bg-black/30 border border-white/10 p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
                  statusFilter === 'all'
                    ? 'bg-cyan-500/25 text-cyan-200'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Tümü ({messages.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('open')}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
                  statusFilter === 'open'
                    ? 'bg-amber-500/25 text-amber-200'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <CircleDot className="w-2.5 h-2.5" />
                <span>Açık ({openCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('solved')}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
                  statusFilter === 'solved'
                    ? 'bg-emerald-500/25 text-emerald-200'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Çözüldü ({solvedCount})</span>
              </button>
            </div>
            {allTags.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                  activeTag === null
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                Tüm Etiketler
              </button>
            )}
            {allTags.map((tag) => {
              const selected = activeTag?.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(selected ? null : tag)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                    selected
                      ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200'
                      : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Tag className="w-2.5 h-2.5" />
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
        )}

        {isComposing && (
          <form
            onSubmit={handleSubmitTopic}
            className="p-4 rounded-2xl ios-glass border border-cyan-400/25 bg-slate-950/60 space-y-2.5 animate-fade-in"
          >
            <input
              type="text"
              required
              maxLength={120}
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder={t(language, 'forumPostTitlePlaceholder')}
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm font-semibold text-white placeholder:text-white/35 outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              value={postTagsText}
              onChange={(e) => setPostTagsText(e.target.value)}
              placeholder={t(language, 'forumPostTagsPlaceholder')}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/35 outline-none focus:border-cyan-400"
            />
            <textarea
              required
              rows={3}
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              placeholder="Konu açıklamanızı ve detaylarını yazın..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-cyan-400 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={!postTitle.trim() || !postBody.trim()}
                className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t(language, 'publishTopic')}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Forum Posts List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {sortedAndFiltered.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-cyan-300">
              <MessagesSquare className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-white">{t(language, 'noForumPostsYet')}</div>
            <p className="text-xs text-white/45 max-w-sm">
              {channel.topic || 'İlk forum konusunu açarak tartışmayı başlatabilirsin.'}
            </p>
            <button
              type="button"
              onClick={() => setIsComposing(true)}
              className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold transition"
            >
              + {t(language, 'newForumPost')}
            </button>
          </div>
        ) : (
          sortedAndFiltered.map((msg) => {
            const title =
              msg.forumPost?.title ||
              msg.content.split('\n')[0]?.slice(0, 90) ||
              'Başlıksız Konu';
            const replyCount = msg.threadMessages?.length || 0;
            const tags = msg.forumPost?.tags || [];
            const attachmentCount = msg.attachments?.length || 0;
            const isSolved = Boolean(msg.forumPost?.solved);
            const canToggleSolved = Boolean(
              msg.forumPost &&
                currentUser &&
                (msg.author.username.toLowerCase() === currentUser.username.toLowerCase() ||
                  currentUser.role === 'admin' ||
                  isUserServerOwner(currentUser, activeServer) ||
                  hasServerPermission('manage_channels') ||
                  hasServerPermission('manage_server'))
            );

            return (
              <div
                key={msg.id}
                onClick={() => onOpenThread(msg.id)}
                className={`group p-4 rounded-2xl ios-glass border transition cursor-pointer space-y-2.5 ${
                  isSolved
                    ? 'border-emerald-400/30 hover:border-emerald-400/60 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]'
                    : 'border-white/10 hover:border-cyan-400/40 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isSolved && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-300 shrink-0"
                          title={msg.forumPost?.solvedBy ? `Çözen: ${msg.forumPost.solvedBy}` : undefined}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Çözüldü</span>
                        </span>
                      )}
                      <h3 className="text-sm font-bold text-white group-hover:text-cyan-200 transition truncate">
                        {title}
                      </h3>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-semibold text-cyan-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <p className="text-xs text-white/70 line-clamp-2 break-words">
                      {msg.content}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-400/20 text-[11px] font-semibold text-cyan-200">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>
                        {replyCount} {t(language, 'repliesCount')}
                      </span>
                    </div>
                    {canToggleSolved && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleForumSolved(channel.id, msg.id);
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition ${
                          isSolved
                            ? 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
                            : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300 hover:bg-emerald-500/25'
                        }`}
                      >
                        {isSolved ? (
                          <>
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Yeniden Aç</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Çözüldü İşaretle</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAuthorClick(msg.author.id, msg.author.username, msg.author.avatar);
                    }}
                    className="flex items-center gap-2 text-xs text-white/75 hover:text-white transition"
                  >
                    <div className="w-5 h-5 rounded-full bg-white/10 overflow-hidden shrink-0">
                      <AvatarView avatar={msg.author.avatar} alt={msg.author.username} />
                    </div>
                    <span className="font-semibold">{msg.author.username}</span>
                    <span className="text-[10px] text-white/40">{msg.timestamp}</span>
                  </button>

                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {attachmentCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/60">
                        <Paperclip className="w-2.5 h-2.5" />
                        {attachmentCount}
                      </span>
                    )}
                    {Object.entries(msg.reactions || {}).map(([emoji, users]) => {
                      const hasMine = currentUser && users.includes(currentUser.username);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => addReaction(msg.id, emoji)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition ${
                            hasMine
                              ? 'ui-accent-soft font-semibold'
                              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{users.length}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => addReaction(msg.id, '👍')}
                      className="px-1.5 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/60 hover:text-white transition"
                      title="Beğen"
                    >
                      👍
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
