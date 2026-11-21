import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, Plus, Repeat, Trash2 } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { ScheduledMessage, Server } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';

interface ScheduledMessagesTabProps {
  server: Server;
  canManage: boolean;
}

function defaultScheduleDateTimeLocal(): string {
  const d = new Date(Date.now() + 10 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ScheduledMessagesTab: React.FC<ScheduledMessagesTabProps> = ({
  server,
  canManage,
}) => {
  const {
    fetchScheduledMessages,
    createScheduledMessage,
    deleteScheduledMessage,
    language,
  } = useSocket();

  const textChannels = (server.channels || []).filter(
    (c) => c.type !== 'voice' && c.type !== 'stage'
  );

  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelId, setChannelId] = useState(textChannels[0]?.id || '');
  const [content, setContent] = useState('');
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleDateTimeLocal);
  const [repeatIntervalMinutes, setRepeatIntervalMinutes] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const list = await fetchScheduledMessages(server.id);
    setItems(list);
    setLoading(false);
  }, [fetchScheduledMessages, server.id]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!channelId && textChannels.length > 0) {
      setChannelId(textChannels[0].id);
    }
  }, [channelId, textChannels]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !channelId || !content.trim() || !scheduledFor) return;
    setSaving(true);
    const isoDate = new Date(scheduledFor).toISOString();
    const res = await createScheduledMessage(server.id, {
      channelId,
      content: content.trim(),
      scheduledFor: isoDate,
      ...(repeatIntervalMinutes >= 5 ? { repeatIntervalMinutes } : {}),
    });
    setSaving(false);
    if (!res.success) {
      appToast(res.error || 'Zamanlanmış mesaj kaydedilemedi.', 'error');
      return;
    }
    appToast('Mesaj zamanlandı.', 'success');
    setContent('');
    setScheduledFor(defaultScheduleDateTimeLocal());
    await loadItems();
  };

  const handleCancel = async (id: string) => {
    const ok = await deleteScheduledMessage(server.id, id);
    if (ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      appToast('Zamanlanmış mesaj iptal edildi.', 'info');
    }
  };

  const formatRepeat = (mins?: number) => {
    if (!mins) return 'Tek sefer';
    if (mins === 60) return 'Saatlik';
    if (mins === 1440) return 'Günlük';
    if (mins === 10080) return 'Haftalık';
    return `${mins} dk`;
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-1 flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-sky-400" />
          <span>{t(language, 'scheduledMessages')}</span>
        </h2>
        <p className="text-xs text-white/50">
          Belirli bir tarih/saatte otomatik gönderilecek veya periyodik tekrarlanacak kanal mesajları planlayın.
        </p>
      </div>

      {canManage && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                Hedef Kanal
              </label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
              >
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id} className="bg-neutral-900">
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                Gönderim Tarihi
              </label>
              <input
                type="datetime-local"
                required
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                {t(language, 'repeatEvery')}
              </label>
              <select
                value={repeatIntervalMinutes}
                onChange={(e) => setRepeatIntervalMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
              >
                <option value={0} className="bg-neutral-900">Tek Seferlik</option>
                <option value={60} className="bg-neutral-900">Her Saat (60 dk)</option>
                <option value={1440} className="bg-neutral-900">Her Gün (24 sa)</option>
                <option value={10080} className="bg-neutral-900">Her Hafta (7 gün)</option>
              </select>
            </div>
          </div>

          <textarea
            rows={2}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Zamanlanacak duyuru veya hatırlatma mesajı..."
            className="w-full p-3 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-sky-400 resize-none"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !channelId || !content.trim()}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{saving ? 'Planlanıyor...' : t(language, 'scheduleMessage')}</span>
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-white/40">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Yükleniyor...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
          Henüz zamanlanmış mesaj bulunmuyor.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => {
            const ch = server.channels.find((c) => c.id === item.channelId);
            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        item.status === 'pending'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {item.status === 'pending' ? 'Bekliyor' : 'Gönderildi'}
                    </span>
                    <span className="text-xs font-bold text-white">
                      #{ch?.name || item.channelId}
                    </span>
                    <span className="text-[11px] text-white/50 font-mono">
                      {new Date(item.scheduledFor).toLocaleString()}
                    </span>
                    {item.repeatIntervalMinutes && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/75">
                        <Repeat className="w-3 h-3" /> {formatRepeat(item.repeatIntervalMinutes)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/80 whitespace-pre-wrap break-words">
                    {item.content}
                  </p>
                </div>

                {canManage && item.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void handleCancel(item.id)}
                    className="p-2 rounded-xl text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/20 transition shrink-0"
                    title="İptal Et"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
