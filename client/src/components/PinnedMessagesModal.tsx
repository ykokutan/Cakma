import React from 'react';
import { Pin, X, Trash2 } from 'lucide-react';
import { AvatarView } from './AvatarView';
import { Message, User } from '../types';

interface PinnedMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  pinnedMessages: Message[];
  onUnpin: (messageId: string) => void;
  onOpenProfile?: (user: User) => void;
}

export const PinnedMessagesModal: React.FC<PinnedMessagesModalProps> = ({
  isOpen,
  onClose,
  channelName,
  pinnedMessages,
  onUnpin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Pin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Sabitlenmiş Mesajlar
                <span className="text-[11px] font-semibold px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300">
                  {pinnedMessages.length}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">#{channelName} kanalındaki sabit duyurular</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 space-y-3 overflow-y-auto flex-1">
          {pinnedMessages.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
              <Pin className="w-10 h-10 mb-2 stroke-1 opacity-40" />
              <p className="text-xs font-semibold text-slate-400">Bu kanalda henüz sabitlenmiş mesaj yok.</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                Mesajların üzerine gelip iğne (📌) ikonuna basarak önemli duyuruları buraya sabitleyebilirsiniz.
              </p>
            </div>
          ) : (
            pinnedMessages.map((msg) => (
              <div
                key={msg.id}
                className="group relative p-3 rounded-xl bg-white/5 border border-white/5 hover:border-amber-500/30 transition-all flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xl shrink-0 overflow-hidden select-none">
                  <AvatarView avatar={msg.author.avatar} alt={msg.author.username} fallback="🎮" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{msg.author.username}</span>
                    <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
                <button
                  onClick={() => onUnpin(msg.id)}
                  title="Sabitlemeyi Kaldır"
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/5 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-medium transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
