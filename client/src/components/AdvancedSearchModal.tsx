import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  CornerDownRight,
  User as UserIcon,
} from 'lucide-react';
import { Message } from '../types';

interface AdvancedSearchModalProps {
  messages: Message[];
  channelName: string;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}

export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
  messages,
  channelName,
  onClose,
  onJumpToMessage,
}) => {
  const [query, setQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'media' | 'files' | 'links'>('all');

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const authorQ = authorFilter.trim().toLowerCase();

    return messages.filter((msg) => {
      // 1. Author Filter
      if (authorQ && !msg.author?.username.toLowerCase().includes(authorQ)) {
        return false;
      }

      // 2. Type Filter
      if (filterType === 'media') {
        const hasImg =
          (msg.attachments && msg.attachments.some((a) => a.type.startsWith('image/'))) ||
          msg.content.match(/\.(jpeg|jpg|gif|png|webp)/i);
        if (!hasImg) return false;
      } else if (filterType === 'files') {
        const hasFile =
          msg.attachments && msg.attachments.some((a) => !a.type.startsWith('image/'));
        if (!hasFile) return false;
      } else if (filterType === 'links') {
        const hasUrl = msg.content.match(/https?:\/\/[^\s]+/i);
        if (!hasUrl) return false;
      }

      // 3. Keyword Filter
      if (q) {
        const contentMatch = msg.content.toLowerCase().includes(q);
        const attachmentMatch =
          msg.attachments && msg.attachments.some((a) => a.name.toLowerCase().includes(q));
        if (!contentMatch && !attachmentMatch) return false;
      }

      return true;
    });
  }, [messages, query, authorFilter, filterType]);

  const highlightMatch = (text: string, term: string) => {
    if (!term.trim()) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="bg-amber-400 text-black px-1 rounded font-semibold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-xl rounded-3xl overflow-hidden ios-glass shadow-2xl border border-white/15 text-white flex flex-col max-h-[85vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Gelişmiş Sohbet Araması</h3>
              <p className="text-[11px] text-white/50">#{channelName} kanalında arama yapın</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Controls */}
        <div className="p-4 border-b border-white/10 bg-black/20 space-y-3">
          {/* Main Keyword Input */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mesaj içeriği, kelime veya dosya adı ara..."
              className="w-full pl-10 pr-9 py-2.5 bg-white/[0.05] border border-white/10 rounded-xl text-xs text-white placeholder:text-white/30 outline-none focus:border-blue-500 transition"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 text-white/40 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterType === 'all'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                Tümü
              </button>
              <button
                onClick={() => setFilterType('media')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterType === 'media'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Resimler</span>
              </button>
              <button
                onClick={() => setFilterType('files')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterType === 'files'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Dosyalar</span>
              </button>
              <button
                onClick={() => setFilterType('links')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterType === 'links'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Linkler</span>
              </button>
            </div>

            {/* Author Filter Input */}
            <div className="relative flex items-center">
              <UserIcon className="w-3 h-3 text-white/40 absolute left-2.5" />
              <input
                type="text"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                placeholder="Gönderen filtrele..."
                className="pl-7 pr-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white placeholder:text-white/30 outline-none w-36 focus:w-44 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-[11px] text-white/40 font-semibold uppercase tracking-wider px-1">
            {filteredResults.length} Sonuç Bulundu
          </div>

          {filteredResults.length > 0 ? (
            filteredResults.map((msg) => (
              <div
                key={msg.id}
                onClick={() => {
                  onJumpToMessage(msg.id);
                  onClose();
                }}
                className="group p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-blue-500/30 cursor-pointer transition flex items-start justify-between gap-3"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-blue-400">{msg.author?.username || 'Kullanıcı'}</span>
                    <span className="text-[10px] text-white/40 font-mono">{msg.timestamp}</span>
                  </div>

                  {msg.content && (
                    <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">
                      {highlightMatch(msg.content, query)}
                    </p>
                  )}

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] text-white/70"
                        >
                          <FileText className="w-3 h-3 text-blue-400" />
                          <span className="truncate max-w-[150px]">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="shrink-0 px-2.5 py-1 rounded-xl bg-blue-500/10 group-hover:bg-blue-500 group-hover:text-white text-blue-400 border border-blue-500/20 text-xs font-semibold flex items-center gap-1 transition"
                >
                  <CornerDownRight className="w-3.5 h-3.5" />
                  <span>Işınlan</span>
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-xs text-white/40 space-y-1">
              <div>Eşleşen mesaj bulunamadı.</div>
              <div className="text-[11px] text-white/30">Filtreleri veya arama kelimesini değiştirmeyi deneyin.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
