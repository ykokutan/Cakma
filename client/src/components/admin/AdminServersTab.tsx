import React, { useState } from 'react';
import { Hash, Trash2, Volume2 } from 'lucide-react';
import type { AdminDashboardData, RequestAdminDialogFn } from './adminTypes';

interface AdminServersTabProps {
  adminData: AdminDashboardData | null;
  onDeleteServer: (serverId: string) => void;
  onDeleteChannel: (serverId: string, channelId: string) => void;
  onCreateChannel: (serverId: string, name: string, type: 'text' | 'voice') => void;
  onPurgeMessages: (channelId: string, mode: 'last_n' | 'all', count?: number) => void;
  onRequestDialog: RequestAdminDialogFn;
}

export const AdminServersTab: React.FC<AdminServersTabProps> = ({
  adminData,
  onDeleteServer,
  onDeleteChannel,
  onCreateChannel,
  onPurgeMessages,
  onRequestDialog,
}) => {
  const [newChannelInputs, setNewChannelInputs] = useState<
    Record<string, { name: string; type: 'text' | 'voice' }>
  >({});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
          Aktif Sunucu ve Kanal Mimarisi ({adminData?.servers.length || 0} Sunucu)
        </h3>
        <span className="text-[11px] text-white/40">Doğrudan kanal ekleyin, silin veya sunucuları yönetin</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adminData?.servers.map((s) => {
          const chForm = newChannelInputs[s.id] || { name: '', type: 'text' as const };
          return (
            <div key={s.id} className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{s.icon || '💬'}</span>
                  <div>
                    <div className="font-bold text-white text-sm">{s.name}</div>
                    <div className="text-[10px] text-white/40 font-mono">
                      ID: {s.id} · {s.members?.length || 0} Üye
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-white/60">
                    {s.channels.length} Kanal
                  </span>
                  {s.id !== 'default-server' && s.id !== 'direct-messages' && (
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDialog({
                          type: 'confirm',
                          title: 'Sunucuyu Kalıcı Olarak Sil',
                          description: `"${s.name}" sunucusunu kalıcı olarak silmek istediğinize emin misiniz?`,
                          confirmLabel: 'Sunucuyu Sil',
                          tone: 'danger',
                          onConfirm: () => onDeleteServer(s.id),
                        })
                      }
                      className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white transition"
                      title="Sunucuyu Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto pr-1">
                {s.channels.map((c) => (
                  <div
                    key={c.id}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/[0.08] flex items-center justify-between text-xs transition"
                  >
                    <div className="flex items-center gap-2">
                      {c.type === 'voice' ? (
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Hash className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span className="text-white/80 font-medium">{c.name}</span>
                      {c.slowmodeSeconds && c.slowmodeSeconds > 0 ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                          {c.slowmodeSeconds}s
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1">
                      {c.type === 'text' && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDialog({
                              type: 'purge_messages',
                              channelName: c.name,
                              onSubmit: (mode, count) => onPurgeMessages(c.id, mode, count),
                            })
                          }
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/15 transition"
                          title="Kanal Mesajlarını Temizle"
                        >
                          Temizle
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onRequestDialog({
                            type: 'confirm',
                            title: 'Kanalı Sil',
                            description: `"${c.name}" kanalını silmek istediğinize emin misiniz?`,
                            confirmLabel: 'Kanalı Sil',
                            tone: 'danger',
                            onConfirm: () => onDeleteChannel(s.id, c.id),
                          })
                        }
                        className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Kanalı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Add Channel */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chForm.name.trim()) return;
                  onCreateChannel(s.id, chForm.name.trim(), chForm.type);
                  setNewChannelInputs((prev) => ({ ...prev, [s.id]: { name: '', type: chForm.type } }));
                }}
                className="pt-2 border-t border-white/10 flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={chForm.name}
                  onChange={(e) =>
                    setNewChannelInputs((prev) => ({
                      ...prev,
                      [s.id]: { ...chForm, name: e.target.value },
                    }))
                  }
                  placeholder="Yeni kanal adı..."
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={chForm.type}
                  onChange={(e) =>
                    setNewChannelInputs((prev) => ({
                      ...prev,
                      [s.id]: { ...chForm, type: e.target.value as 'text' | 'voice' },
                    }))
                  }
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                >
                  <option value="text">Metin</option>
                  <option value="voice">Ses</option>
                </select>
                <button
                  type="submit"
                  disabled={!chForm.name.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition disabled:opacity-40"
                >
                  Ekle
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
};
