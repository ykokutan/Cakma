import React, { useMemo, useState } from 'react';
import { X, Search, Inbox, AtSign, Hash, ArrowRight, Bookmark, Trash2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface GlobalInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalInboxModal: React.FC<GlobalInboxModalProps> = ({ isOpen, onClose }) => {
  const {
    messagesMap,
    servers,
    currentUser,
    selectChannel,
    bookmarkedMessages,
    toggleBookmarkMessage,
  } = useSocket();
  const [tab, setTab] = useState<'mentions' | 'search' | 'bookmarks'>('mentions');
  const [query, setQuery] = useState('');

  const channelLookup = useMemo(() => {
    const map: Record<string, { serverId: string; serverName: string; channelName: string }> = {};
    for (const s of servers) {
      for (const c of s.channels) {
        map[c.id] = { serverId: s.id, serverName: s.name, channelName: c.name };
      }
    }
    return map;
  }, [servers]);

  const { allMessages, msgChannelMap } = useMemo(() => {
    const list: Array<{ channelId: string; msg: any }> = [];
    const chMap: Record<string, string> = {};
    for (const [channelId, msgs] of Object.entries(messagesMap || {})) {
      for (const msg of msgs) {
        list.push({ channelId, msg });
        chMap[msg.id] = channelId;
      }
    }
    list.sort((a, b) => new Date(b.msg.timestamp).getTime() - new Date(a.msg.timestamp).getTime());
    return { allMessages: list, msgChannelMap: chMap };
  }, [messagesMap]);

  const mentionItems = useMemo(() => {
    const uname = (currentUser?.username || '').toLowerCase();
    if (!uname) return [];
    return allMessages
      .filter(({ msg }) => (msg.content || '').toLowerCase().includes(`@${uname}`))
      .slice(0, 60);
  }, [allMessages, currentUser?.username]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allMessages
      .filter(
        ({ msg }) =>
          (msg.content || '').toLowerCase().includes(q) ||
          (msg.author?.username || '').toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [allMessages, query]);

  const bookmarkItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarkedMessages
      .filter(
        (bm) =>
          !q ||
          (bm.content || '').toLowerCase().includes(q) ||
          (bm.author?.username || '').toLowerCase().includes(q)
      )
      .map((bm) => ({
        channelId: bm.channelId || msgChannelMap[bm.id] || '',
        msg: bm,
      }));
  }, [bookmarkedMessages, msgChannelMap, query]);

  if (!isOpen) return null;

  const items =
    tab === 'mentions' ? mentionItems : tab === 'bookmarks' ? bookmarkItems : searchResults;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[#131620] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Gelen Kutusu, Kaydedilenler &amp; Arama</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('mentions')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              tab === 'mentions'
                ? 'bg-cyan-500 text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <AtSign className="w-3.5 h-3.5" />
            <span>Bahsedilmeler ({mentionItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('bookmarks')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              tab === 'bookmarks'
                ? 'bg-cyan-500 text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Kaydedilenler ({bookmarkedMessages.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              tab === 'search'
                ? 'bg-cyan-500 text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Tüm Kanallarda Ara</span>
          </button>
          {(tab === 'search' || tab === 'bookmarks') && (
            <input
              type="text"
              autoFocus={tab === 'search'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === 'bookmarks'
                  ? 'Kaydedilen mesajlarda filtrele...'
                  : 'Tüm sunucularda mesaj veya kullanıcı ara...'
              }
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder:text-white/35 outline-none focus:border-cyan-400/60"
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/45">
              {tab === 'mentions'
                ? 'Henüz sizi etiketleyen (@) bir mesaj bulunmuyor.'
                : tab === 'bookmarks'
                ? 'Henüz kaydedilmiş yer imi mesajı bulunmuyor.'
                : query.trim()
                ? 'Aramanızla eşleşen mesaj bulunamadı.'
                : 'Aramak için yukarıya bir kelime yazın.'}
            </div>
          ) : (
            items.map(({ channelId, msg }) => {
              const loc = channelId ? channelLookup[channelId] : undefined;
              return (
                <div
                  key={msg.id}
                  className="p-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-cyan-400/30 transition flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] flex-wrap">
                      <span className="font-bold text-cyan-300">{msg.author?.username || 'Kullanıcı'}</span>
                      {loc && (
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 flex items-center gap-1">
                          <Hash className="w-2.5 h-2.5" />
                          {loc.serverName} / {loc.channelName}
                        </span>
                      )}
                      <span className="text-white/35">
                        {new Date(msg.timestamp).toLocaleString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/85 break-words whitespace-pre-wrap">
                      {msg.content || '[Ekli Dosya]'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {tab === 'bookmarks' && (
                      <button
                        type="button"
                        onClick={() => toggleBookmarkMessage(msg)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-white/45 hover:text-rose-300 transition"
                        title="Yer İminden Kaldır"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {loc && (
                      <button
                        type="button"
                        onClick={() => {
                          selectChannel(channelId);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[11px] font-semibold flex items-center gap-1 transition"
                      >
                        <span>Git</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
