import React from 'react';
import { Clock, RefreshCw, WifiOff, X } from 'lucide-react';
import { useChat } from '../../context/ChatContext';

interface OfflineQueueBannerProps {
  channelId: string;
}

export const OfflineQueueBanner: React.FC<OfflineQueueBannerProps> = ({ channelId }) => {
  const { offlineQueue, retryQueuedMessage, cancelQueuedMessage } = useChat();
  const channelItems = offlineQueue.filter((q) => q.channelId === channelId);

  if (channelItems.length === 0) return null;

  return (
    <div className="mb-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1.5 animate-fade-in">
      <div className="flex items-center justify-between text-[11px] font-semibold text-amber-200 px-1">
        <span className="inline-flex items-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5 text-amber-300" />
          Çevrimdışı / Bekleyen Mesaj Kuyruğu ({channelItems.length})
        </span>
        <span className="text-[10px] text-amber-200/75">
          Bağlantı sağlandığında otomatik gönderilir
        </span>
      </div>

      <div className="space-y-1 max-h-28 overflow-y-auto">
        {channelItems.map((item) => (
          <div
            key={item.localId}
            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/35 border border-white/10 text-xs"
          >
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <Clock
                className={`w-3.5 h-3.5 shrink-0 ${
                  item.status === 'failed'
                    ? 'text-rose-400'
                    : item.status === 'sending'
                    ? 'text-sky-400 animate-spin'
                    : 'text-amber-300'
                }`}
              />
              <span className="text-white/90 truncate">{item.content}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0 ${
                  item.status === 'failed'
                    ? 'bg-rose-500/20 text-rose-300'
                    : item.status === 'sending'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {item.status === 'failed'
                  ? 'Başarısız'
                  : item.status === 'sending'
                  ? 'Gönderiliyor'
                  : 'Kuyrukta'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => retryQueuedMessage(item.localId)}
                title="Tekrar Dene"
                aria-label="Tekrar Dene"
                className="p-1 rounded-lg bg-white/10 hover:bg-emerald-500/25 text-white/80 hover:text-emerald-300 transition"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => cancelQueuedMessage(item.localId)}
                title="Kuyruktan Kaldır"
                aria-label="Kuyruktan Kaldır"
                className="p-1 rounded-lg bg-white/10 hover:bg-rose-500/25 text-white/80 hover:text-rose-300 transition"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
