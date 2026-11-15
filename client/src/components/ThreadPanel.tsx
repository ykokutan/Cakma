import React, { useState } from 'react';
import { X, MessageSquare, Send } from 'lucide-react';
import { Message } from '../types';
import { useSocket } from '../context/SocketContext';
import { AvatarView } from './AvatarView';

interface ThreadPanelProps {
  message: Message;
  onClose: () => void;
}

export const ThreadPanel: React.FC<ThreadPanelProps> = ({ message, onClose }) => {
  const { sendThreadMessage } = useSocket();
  const [replyText, setReplyText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    sendThreadMessage(message.channelId, message.id, replyText.trim());
    setReplyText('');
  };

  const replies = message.threadMessages || [];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 md:static md:w-80 ios-glass-panel md:rounded-2xl md:border md:border-white/[0.08] flex flex-col shrink-0 shadow-2xl">
      <div className="h-14 px-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-sm font-bold text-white truncate">Alt Konu (Thread)</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
            {replies.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
          title="Kapat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent Message */}
      <div className="p-3.5 border-b border-white/[0.06] bg-white/[0.03]">
        <div className="flex items-center gap-2 mb-1.5">
          <AvatarView avatar={message.author.avatar} alt={message.author.username} className="w-6 h-6" />
          <span className="text-xs font-bold text-white">{message.author.username}</span>
          <span className="text-[10px] text-white/40">{message.timestamp}</span>
        </div>
        <p className="text-xs text-white/80 break-words leading-relaxed">{message.content}</p>
      </div>

      {/* Thread Replies */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {replies.length === 0 ? (
          <div className="text-center py-8 text-xs text-white/40">
            Henüz bu konuda yanıt yok. İlk yanıtı siz yazın!
          </div>
        ) : (
          replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2.5">
              <AvatarView avatar={r.author.avatar} alt={r.author.username} className="w-7 h-7 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-white">{r.author.username}</span>
                  <span className="text-[10px] text-white/35">{r.timestamp}</span>
                </div>
                <p className="text-xs text-white/80 break-words leading-relaxed mt-0.5">{r.content}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reply Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.08] flex items-center gap-2">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Alt konuya yanıt yaz..."
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400/50"
        />
        <button
          type="submit"
          disabled={!replyText.trim()}
          className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white disabled:opacity-40 transition shrink-0"
          title="Gönder"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </aside>
  );
};
