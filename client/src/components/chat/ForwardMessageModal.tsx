import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Forward, Hash, Megaphone, MessageCircle, MessagesSquare, Search, Users, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { Message } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';
import { AvatarView } from '../AvatarView';

interface ForwardMessageModalProps {
  sourceChannelId: string;
  message: Message;
  onClose: () => void;
}

interface ForwardTargetItem {
  id: string;
  kind: 'channel' | 'group' | 'dm';
  title: string;
  subtitle: string;
  targetChannelId: string;
  targetServerId?: string;
  icon: React.ReactNode;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  sourceChannelId,
  message,
  onClose,
}) => {
  const { servers, groupDms, onlineUsers, friends, currentUser, forwardMessage, language } = useSocket();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const targets = useMemo<ForwardTargetItem[]>(() => {
    const items: ForwardTargetItem[] = [];

    // 1. Server non-voice channels
    for (const srv of servers) {
      if (srv.id === 'direct-messages') continue;
      for (const ch of srv.channels) {
        if (ch.type === 'voice') continue;
        const icon =
          ch.type === 'announcement' ? (
            <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
          ) : ch.type === 'forum' ? (
            <MessagesSquare className="w-4 h-4 text-cyan-400 shrink-0" />
          ) : (
            <Hash className="w-4 h-4 text-white/60 shrink-0" />
          );
        items.push({
          id: `ch-${ch.id}`,
          kind: 'channel',
          title: `#${ch.name}`,
          subtitle: srv.name,
          targetChannelId: ch.id,
          targetServerId: srv.id,
          icon,
        });
      }
    }

    // 2. Group DMs
    for (const g of groupDms) {
      items.push({
        id: `gdm-${g.id}`,
        kind: 'group',
        title: g.name,
        subtitle: `${g.members.length} ${t(language, 'membersCount')}`,
        targetChannelId: g.id,
        targetServerId: 'direct-messages',
        icon: (
          <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xs shrink-0">
            {g.icon || <Users className="w-3.5 h-3.5 text-indigo-300" />}
          </div>
        ),
      });
    }

    // 3. Direct Messages
    if (currentUser?.username) {
      const seen = new Set<string>();
      const myLower = currentUser.username.toLowerCase();
      const candidates: Array<{ username: string; avatar?: string }> = [];
      for (const u of onlineUsers) {
        const lower = u.username.toLowerCase();
        if (lower === myLower || seen.has(lower)) continue;
        seen.add(lower);
        candidates.push({ username: u.username, avatar: u.avatar });
      }
      for (const f of friends) {
        const lower = f.username.toLowerCase();
        if (lower === myLower || seen.has(lower)) continue;
        seen.add(lower);
        candidates.push({ username: f.username, avatar: f.avatar });
      }

      for (const user of candidates) {
        const dmChannelId = `dm-${[myLower, user.username.toLowerCase()].sort().join('-')}`;
        items.push({
          id: `dm-${user.username}`,
          kind: 'dm',
          title: `@${user.username}`,
          subtitle: 'Direkt Mesaj',
          targetChannelId: dmChannelId,
          targetServerId: 'direct-messages',
          icon: (
            <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
              <AvatarView avatar={user.avatar} alt={user.username} fallback="👤" className="w-full h-full object-cover" />
            </div>
          ),
        });
      }
    }

    return items;
  }, [servers, groupDms, onlineUsers, friends, currentUser?.username, language]);

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q)
    );
  }, [targets, query]);

  const handleForward = (target: ForwardTargetItem) => {
    forwardMessage(sourceChannelId, message.id, target.targetChannelId, target.targetServerId);
    appToast(`Mesaj "${target.title}" hedefine iletildi.`, 'success');
    onClose();
  };

  const previewText =
    message.content?.trim() ||
    (message.attachments && message.attachments.length > 0
      ? `📎 ${message.attachments.length} ek dosya`
      : 'Mesaj');

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl ios-glass border border-white/15 bg-[#12141e]/95 shadow-2xl overflow-hidden text-white"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Forward className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{t(language, 'forwardMessage')}</h3>
              <p className="text-[11px] text-white/50">{t(language, 'selectForwardTarget')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Forwarded message preview */}
          <div className="px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/10 text-xs">
            <div className="text-[10px] font-bold text-indigo-300 mb-0.5">
              @{message.author.username} · {message.timestamp}
            </div>
            <div className="text-white/75 line-clamp-2 break-words">{previewText}</div>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kanal, grup veya kişi ara..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-indigo-400"
            />
          </div>

          {/* Target list */}
          <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {filteredTargets.length === 0 ? (
              <div className="py-8 text-center text-xs text-white/40 flex flex-col items-center gap-2">
                <MessageCircle className="w-5 h-5 text-white/25" />
                <span>Eşleşen hedef bulunamadı.</span>
              </div>
            ) : (
              filteredTargets.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.07] transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.icon}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                      <div className="text-[10px] text-white/45 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleForward(item)}
                    className="px-3 py-1 rounded-xl bg-indigo-500/25 hover:bg-indigo-500 border border-indigo-400/35 text-[11px] font-bold text-indigo-200 hover:text-white transition shrink-0"
                  >
                    İlet
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
