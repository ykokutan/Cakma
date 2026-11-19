import React, { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import type { AdminDashboardData } from './adminTypes';

interface AdminBroadcastTabProps {
  adminData: AdminDashboardData | null;
  onBroadcastAnnouncement: (
    message: string,
    options?: { target?: 'all' | 'admins' | 'server'; serverId?: string; pinBanner?: boolean }
  ) => void;
  onClearPinnedBanner: () => void;
}

export const AdminBroadcastTab: React.FC<AdminBroadcastTabProps> = ({
  adminData,
  onBroadcastAnnouncement,
  onClearPinnedBanner,
}) => {
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [announcementSent, setAnnouncementSent] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'admins' | 'server'>('all');
  const [broadcastServerId, setBroadcastServerId] = useState('');
  const [broadcastPinBanner, setBroadcastPinBanner] = useState(false);

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    onBroadcastAnnouncement(broadcastMessage.trim(), {
      target: broadcastTarget,
      serverId: broadcastTarget === 'server' ? broadcastServerId || adminData?.servers?.[0]?.id : undefined,
      pinBanner: broadcastPinBanner,
    });
    setBroadcastMessage('');
    setAnnouncementSent(true);
    setTimeout(() => setAnnouncementSent(false), 3000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-5 pt-4">
      <div className="text-center space-y-1">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-amber-500/30">
          <Megaphone className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white">Genel Sistem Duyurusu</h3>
        <p className="text-xs text-white/50">
          Bu mesaj bağlı olan tüm kullanıcıların ekranının üst kısmında parlayan bildirim olarak görünecektir.
        </p>
      </div>

      {announcementSent && (
        <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs text-center font-medium">
          ✓ Duyuru tüm aktif kullanıcılara başarıyla iletildi!
        </div>
      )}

      {adminData?.pinnedBanner && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between gap-3">
          <div className="text-xs text-amber-100">
            <span className="font-bold text-amber-300">📌 Aktif Sabit Banner: </span>
            {adminData.pinnedBanner.message}
          </div>
          <button
            type="button"
            onClick={() => onClearPinnedBanner()}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white text-[10px] font-bold shrink-0 transition"
          >
            Bannerı Kaldır
          </button>
        </div>
      )}

      <form onSubmit={handleSendBroadcast} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">Hedef Kitle</label>
            <select
              value={broadcastTarget}
              onChange={(e) => setBroadcastTarget(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
            >
              <option value="all">Tüm Bağlı Kullanıcılar</option>
              <option value="admins">Yalnızca Sistem Yöneticileri</option>
              <option value="server">Belirli Bir Sunucu Üyeleri</option>
            </select>
          </div>
          {broadcastTarget === 'server' && (
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1">Hedef Sunucu</label>
              <select
                value={broadcastServerId || adminData?.servers?.[0]?.id || ''}
                onChange={(e) => setBroadcastServerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-amber-400"
              >
                {(adminData?.servers || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={broadcastPinBanner}
            onChange={(e) => setBroadcastPinBanner(e.target.checked)}
            className="rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500"
          />
          <span>Kalıcı Üst Banner olarak sabitle (yeni bağlananlar da görür)</span>
        </label>

        <textarea
          required
          rows={4}
          value={broadcastMessage}
          onChange={(e) => setBroadcastMessage(e.target.value)}
          placeholder="Örn: Sunucu bakımı 10 dakika içinde başlayacaktır. Lütfen ses odalarından ayrılınız..."
          className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-2xl p-4 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-white/20 resize-none"
        />

        <button
          type="submit"
          disabled={!broadcastMessage.trim()}
          className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-black font-bold text-xs rounded-2xl transition shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          Duyuruyu Canlı Yayınla
        </button>
      </form>
    </div>
  );
};
