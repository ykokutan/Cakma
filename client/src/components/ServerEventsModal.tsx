import React, { useState } from 'react';
import { X, Calendar, Clock, Volume2, Users, Plus, Trash2, Check } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface ServerEventsModalProps {
  onClose: () => void;
}

export const ServerEventsModal: React.FC<ServerEventsModalProps> = ({ onClose }) => {
  const { activeServer, currentUser, createServerEvent, rsvpServerEvent, deleteServerEvent, joinVoiceChannel } = useSocket();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [voiceChannelId, setVoiceChannelId] = useState<string>('');

  if (!activeServer) return null;

  const events = activeServer.events || [];
  const voiceChannels = activeServer.channels.filter((c) => c.type === 'voice');

  const canManageEvents = Boolean(
    currentUser &&
    (
      activeServer.ownerId === currentUser.id ||
      activeServer.ownerId === currentUser.username ||
      currentUser.role === 'admin' ||
      activeServer.members?.some((m) =>
        m.username.toLowerCase() === currentUser.username.toLowerCase() &&
        m.roleIds.some((rid) => {
          const role = activeServer.roles?.find((r) => r.id === rid);
          return role?.permissions.includes('manage_server') || role?.permissions.includes('manage_channels');
        })
      )
    )
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime.trim()) return;
    createServerEvent(activeServer.id, {
      title: title.trim(),
      description: description.trim(),
      startTime: startTime.trim(),
      voiceChannelId: voiceChannelId || null,
    });
    setTitle('');
    setDescription('');
    setStartTime('');
    setVoiceChannelId('');
    setShowForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-[#11131a]/95 border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Sunucu Etkinlikleri</h3>
              <p className="text-[11px] text-white/45">{activeServer.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManageEvents && (
              <button
                type="button"
                onClick={() => setShowForm((p) => !p)}
                className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                {showForm ? 'Vazgeç' : 'Etkinlik Oluştur'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {showForm && (
            <form onSubmit={handleCreate} className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-white/45 uppercase mb-1">Etkinlik Başlığı</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Cuma Akşamı Turnuva"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-indigo-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-white/45 uppercase mb-1">Tarih & Saat</label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-white/45 uppercase mb-1">Ses Odası (Opsiyonel)</label>
                  <select
                    value={voiceChannelId}
                    onChange={(e) => setVoiceChannelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-indigo-400"
                  >
                    <option value="">Seçilmedi</option>
                    {voiceChannels.map((vc) => (
                      <option key={vc.id} value={vc.id}>{vc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/45 uppercase mb-1">Açıklama</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Etkinlik detayları..."
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-indigo-400 resize-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition"
                >
                  Yayınla
                </button>
              </div>
            </form>
          )}

          {events.length === 0 ? (
            <div className="text-center py-10 text-xs text-white/40">
              Planlanmış bir sunucu etkinliği yok.
            </div>
          ) : (
            events.map((ev) => {
              const isGoing = Boolean(currentUser && ev.rsvps.some((u) => u.toLowerCase() === currentUser.username.toLowerCase()));
              const voiceCh = voiceChannels.find((vc) => vc.id === ev.voiceChannelId);
              const canDel = Boolean(
                currentUser && (canManageEvents || ev.createdBy.toLowerCase() === currentUser.username.toLowerCase())
              );
              const formattedDate = ev.startTime.includes('T')
                ? new Date(ev.startTime).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
                : ev.startTime;

              return (
                <div key={ev.id} className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-indigo-300 font-semibold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formattedDate}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-0.5">{ev.title}</h4>
                    </div>
                    {canDel && (
                      <button
                        type="button"
                        onClick={() => deleteServerEvent(activeServer.id, ev.id)}
                        className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Etkinliği Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {ev.description && (
                    <p className="text-xs text-white/65 leading-relaxed">{ev.description}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-3 text-[11px] text-white/50">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        {ev.rsvps.length} katılımcı
                      </span>
                      {voiceCh && (
                        <button
                          type="button"
                          onClick={() => {
                            joinVoiceChannel(voiceCh.id);
                            onClose();
                          }}
                          className="flex items-center gap-1 text-cyan-300 hover:underline"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          {voiceCh.name}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => rsvpServerEvent(activeServer.id, ev.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                        isGoing
                          ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      {isGoing && <Check className="w-3.5 h-3.5" />}
                      {isGoing ? 'Katılıyorum' : 'İlgileniyorum'}
                    </button>
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
