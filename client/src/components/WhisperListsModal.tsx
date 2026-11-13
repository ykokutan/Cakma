import React, { useState } from 'react';
import { X, Radio, Plus, Trash2, Send, Users } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface WhisperList {
  id: string;
  name: string;
  targetUserIds: string[];
}

interface WhisperListsModalProps {
  onClose: () => void;
}

const STORAGE_KEY = 'cakma_whisper_lists';

export const WhisperListsModal: React.FC<WhisperListsModalProps> = ({ onClose }) => {
  const { onlineUsers, currentUser, sendWhisper } = useSocket();
  const [lists, setLists] = useState<WhisperList[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [newName, setNewName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeWhisperListId, setActiveWhisperListId] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  const saveLists = (next: WhisperList[]) => {
    setLists(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || selectedIds.length === 0) return;
    const item: WhisperList = {
      id: `wl-${Date.now()}`,
      name: newName.trim(),
      targetUserIds: selectedIds,
    };
    saveLists([...lists, item]);
    setNewName('');
    setSelectedIds([]);
  };

  const handleToggleWhisperList = (list: WhisperList) => {
    const isStopping = activeWhisperListId === list.id;
    let count = 0;
    for (const uid of list.targetUserIds) {
      if (onlineUsers.some((u) => u.id === uid)) {
        sendWhisper(uid, !isStopping);
        count++;
      }
    }
    setActiveWhisperListId(isStopping ? null : list.id);
    setSentNotice(
      isStopping
        ? `"${list.name}" fısıltısı durduruldu.`
        : `"${list.name}" listesindeki ${count} çevrimiçi kişiye sesli fısıltı başlatıldı!`
    );
  };

  const otherUsers = onlineUsers.filter((u) => u.id !== currentUser?.id);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101626] text-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="text-sm font-bold">TeamSpeak Fısıltı Listeleri (Whisper Lists)</h3>
              <p className="text-[11px] text-white/50">Belirli kişilere tek tıkla fısıltı mesajı/uyarısı gönderin.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {sentNotice && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300">
              {sentNotice}
            </div>
          )}

          {/* Saved Lists */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/70">Kayıtlı Fısıltı Listeleri</div>
            {lists.length === 0 ? (
              <p className="text-xs text-white/40 py-2">Henüz fısıltı listesi oluşturmadınız.</p>
            ) : (
              <div className="space-y-2">
                {lists.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{l.name}</div>
                      <div className="text-[11px] text-white/40 flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3" />
                        <span>{l.targetUserIds.length} hedef kişi</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleWhisperList(l)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition ${
                          activeWhisperListId === l.id
                            ? 'bg-amber-500 hover:bg-amber-600 animate-pulse'
                            : 'bg-teal-500 hover:bg-teal-600'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        {activeWhisperListId === l.id ? 'Durdur' : 'Fısılda'}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveLists(lists.filter((x) => x.id !== l.id))}
                        className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create New List */}
          <form onSubmit={handleCreateList} className="pt-3 border-t border-white/10 space-y-3">
            <div className="text-xs font-semibold text-white/70">Yeni Fısıltı Listesi Oluştur</div>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Liste adı (ör: Takım Kaptanları)"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="max-h-36 overflow-y-auto space-y-1 bg-black/25 rounded-xl p-2 border border-white/5">
              {otherUsers.length === 0 ? (
                <div className="text-xs text-white/40 text-center py-2">Çevrimiçi başka kullanıcı yok.</div>
              ) : (
                otherUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="accent-teal-500"
                    />
                    <span className="text-white/90">{u.username}</span>
                  </label>
                ))
              )}
            </div>
            <button
              type="submit"
              disabled={!newName.trim() || selectedIds.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              Listeyi Kaydet
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
