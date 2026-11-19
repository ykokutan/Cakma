import React, { useEffect, useState } from 'react';
import { Calendar, Plus, Trash2, Users, X, Check } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { authFetch } from '../utils/authFetch';

interface ServerEventItem {
  id: string;
  serverId: string;
  title: string;
  description: string;
  scheduledAt: string;
  createdBy: string;
  attendees: string[];
}

interface ServerEventsModalProps {
  isOpen?: boolean;
  onClose: () => void;
}

export const ServerEventsModal: React.FC<ServerEventsModalProps> = ({ isOpen = true, onClose }) => {
  const { activeServer, currentUser, currentServerHost } = useSocket();
  const [events, setEvents] = useState<ServerEventItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const loadEvents = async () => {
    if (!activeServer) return;
    try {
      const res = await authFetch(currentServerHost, `/api/events/${encodeURIComponent(activeServer.id)}`);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen && activeServer) {
      loadEvents();
    }
  }, [isOpen, activeServer?.id]);

  if (!isOpen || !activeServer) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !scheduledAt) return;
    try {
      const res = await authFetch(currentServerHost, `/api/events/${encodeURIComponent(activeServer.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          scheduledAt,
          createdBy: currentUser?.username || 'Üye',
        }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.events)) {
        setEvents(data.events);
        setTitle('');
        setDescription('');
        setScheduledAt('');
        setIsCreating(false);
      }
    } catch {}
  };

  const handleRsvp = async (eventId: string) => {
    if (!currentUser?.username) return;
    try {
      const res = await authFetch(
        currentServerHost,
        `/api/events/${encodeURIComponent(activeServer.id)}/${encodeURIComponent(eventId)}/rsvp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUser.username }),
        }
      );
      const data = await res.json();
      if (data?.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch {}
  };

  const handleDelete = async (eventId: string) => {
    try {
      const res = await authFetch(
        currentServerHost,
        `/api/events/${encodeURIComponent(activeServer.id)}/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data?.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch {}
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-[#131620] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
      >
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">{activeServer.name} — Sunucu Etkinlikleri</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(!isCreating)}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Etkinlik Oluştur</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 rounded-xl bg-white/[0.04] border border-emerald-500/30 space-y-3">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Etkinlik Başlığı (Örn: Akşam CS2 Turnuvası)"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-emerald-400"
              />
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-emerald-400"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Açıklama (isteğe bağlı)..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-emerald-400 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white/70 hover:text-white"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold"
                >
                  Yayınla
                </button>
              </div>
            </form>
          )}

          {events.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/45">
              Bu sunucuda henüz planlanmış etkinlik yok. Yukarıdan yeni bir etkinlik oluşturabilirsiniz.
            </div>
          ) : (
            events.map((evt) => {
              const joined = currentUser?.username ? evt.attendees.includes(currentUser.username) : false;
              const canDelete =
                evt.createdBy === currentUser?.username ||
                activeServer.ownerId === currentUser?.id ||
                currentUser?.role === 'admin';
              return (
                <div key={evt.id} className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-white">{evt.title}</div>
                      <div className="text-[11px] text-emerald-300 mt-0.5">
                        📅 {new Date(evt.scheduledAt).toLocaleString('tr-TR')} • Oluşturan: {evt.createdBy}
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(evt.id)}
                        className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition"
                        title="Etkinliği Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {evt.description && <p className="text-xs text-white/70">{evt.description}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-white/50 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {evt.attendees.length} Katılımcı
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRsvp(evt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                        joined
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      {joined && <Check className="w-3.5 h-3.5" />}
                      <span>{joined ? 'Katılıyorum' : 'Katılacağım'}</span>
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
