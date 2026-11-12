import React, { useState } from 'react';
import { X, Image, FileText, Music, Download } from 'lucide-react';
import { Message, MessageAttachment } from '../types';

interface ChannelMediaModalProps {
  channelName: string;
  messages: Message[];
  onClose: () => void;
}

interface MediaItem {
  id: string;
  author: string;
  timestamp: string;
  attachment: MessageAttachment;
}

export const ChannelMediaModal: React.FC<ChannelMediaModalProps> = ({ channelName, messages, onClose }) => {
  const [filterType, setFilterType] = useState<'all' | 'image' | 'audio' | 'file'>('all');
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

  // Extract all attachments from channel messages
  const mediaItems: MediaItem[] = [];
  (messages || []).forEach((msg) => {
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach((att, idx) => {
        mediaItems.push({
          id: `${msg.id}-${idx}`,
          author: msg.author?.username || 'Kullanıcı',
          timestamp: msg.timestamp,
          attachment: att,
        });
      });
    }
  });

  const filtered = mediaItems.filter((item) => {
    if (filterType === 'all') return true;
    if (filterType === 'image') return item.attachment.type.startsWith('image/');
    if (filterType === 'audio') return item.attachment.type.startsWith('audio/');
    if (filterType === 'file') return !item.attachment.type.startsWith('image/') && !item.attachment.type.startsWith('audio/');
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-3xl bg-[#12131a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-500/20 text-pink-400 flex items-center justify-center text-xl shadow-lg shadow-pink-500/20">
              <Image className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                #{channelName} Medya & Dosya Galerisi
              </h3>
              <p className="text-[11px] text-white/50">
                Bu kanalda paylaşılan fotoğraflar, sesler ve belgeler ({mediaItems.length} öge)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center gap-2 p-4 border-b border-white/10 bg-white/[0.01]">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Tümü ({mediaItems.length})
          </button>
          <button
            onClick={() => setFilterType('image')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              filterType === 'image'
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            Fotoğraflar
          </button>
          <button
            onClick={() => setFilterType('audio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              filterType === 'audio'
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            Sesler
          </button>
          <button
            onClick={() => setFilterType('file')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              filterType === 'file'
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Belgeler
          </button>
        </div>

        {/* Media Grid */}
        <div className="p-5 overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-white/40 text-xs">
              <Image className="w-10 h-10 mx-auto mb-2 text-white/20" />
              <p>Bu kategoride henüz paylaşılan bir medya bulunamadı.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((item) => {
                const isImg = item.attachment.type.startsWith('image/');
                const isAud = item.attachment.type.startsWith('audio/');

                return (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden flex flex-col justify-between hover:border-pink-500/50 transition-all hover:scale-[1.02]"
                  >
                    {isImg ? (
                      <div
                        onClick={() => setSelectedPreview(item.attachment.url)}
                        className="w-full aspect-square bg-black/40 overflow-hidden cursor-pointer"
                      >
                        <img
                          src={item.attachment.url}
                          alt={item.attachment.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : isAud ? (
                      <div className="w-full aspect-square bg-blue-500/10 flex flex-col items-center justify-center p-3 text-center">
                        <Music className="w-8 h-8 text-blue-400 mb-2" />
                        <span className="text-[10px] text-white/70 truncate w-full px-2">
                          {item.attachment.name}
                        </span>
                        <audio src={item.attachment.url} controls className="w-full mt-2 h-7" />
                      </div>
                    ) : (
                      <div className="w-full aspect-square bg-purple-500/10 flex flex-col items-center justify-center p-3 text-center">
                        <FileText className="w-8 h-8 text-purple-400 mb-2" />
                        <span className="text-[10px] text-white/70 truncate w-full px-2">
                          {item.attachment.name}
                        </span>
                      </div>
                    )}

                    {/* Metadata Footer */}
                    <div className="p-2.5 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] text-white/50">
                      <div className="truncate pr-1">
                        <span className="font-semibold text-white/80 block truncate">@{item.author}</span>
                        <span>{item.timestamp}</span>
                      </div>
                      <a
                        href={item.attachment.url}
                        download={item.attachment.name}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition shrink-0"
                        title="İndir"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Full Image Preview Modal */}
        {selectedPreview && (
          <div
            className="fixed inset-0 z-60 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setSelectedPreview(null)}
          >
            <button
              onClick={() => setSelectedPreview(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedPreview}
              alt="Preview"
              className="max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain border border-white/20"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
};
