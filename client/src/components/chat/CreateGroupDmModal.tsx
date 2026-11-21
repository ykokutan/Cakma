import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, Users, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { t } from '../../utils/i18n';
import { AvatarView } from '../AvatarView';

interface CreateGroupDmModalProps {
  onClose: () => void;
}

const GROUP_ICONS = ['👥', '🎮', '🔥', '💼', '🎵', '🚀', '💬', '⭐'];

export const CreateGroupDmModal: React.FC<CreateGroupDmModalProps> = ({ onClose }) => {
  const { onlineUsers, friends, currentUser, createGroupDm, language } = useSocket();
  const [groupName, setGroupName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('👥');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const candidateUsers = useMemo(() => {
    const myLower = currentUser?.username?.toLowerCase() || '';
    const map = new Map<string, { username: string; avatar?: string; isOnline: boolean }>();

    for (const u of onlineUsers) {
      const lower = u.username.toLowerCase();
      if (lower === myLower || map.has(lower)) continue;
      map.set(lower, { username: u.username, avatar: u.avatar, isOnline: true });
    }
    for (const f of friends) {
      const lower = f.username.toLowerCase();
      if (lower === myLower || map.has(lower)) continue;
      map.set(lower, { username: f.username, avatar: f.avatar, isOnline: false });
    }
    return Array.from(map.values());
  }, [onlineUsers, friends, currentUser?.username]);

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return candidateUsers;
    return candidateUsers.filter((c) => c.username.toLowerCase().includes(q));
  }, [candidateUsers, searchQuery]);

  const toggleUser = (username: string) => {
    setSelectedUsers((prev) => {
      if (prev.includes(username)) {
        return prev.filter((u) => u !== username);
      }
      if (prev.length >= 15) return prev;
      return [...prev, username];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUsers.length === 0) return;
    const finalName = groupName.trim() || selectedUsers.slice(0, 3).join(', ');
    createGroupDm(finalName, selectedUsers, selectedIcon);
    onClose();
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl ios-glass border border-white/15 bg-[#12141e]/95 shadow-2xl overflow-hidden text-white"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{t(language, 'newGroupDm')}</h3>
              <p className="text-[11px] text-white/50">
                En fazla 15 üye seçin ({selectedUsers.length}/15)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/45">
              Grup Simgesi &amp; Adı
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm border transition ${
                    selectedIcon === icon
                      ? 'bg-indigo-500/25 border-indigo-400 scale-105'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              maxLength={48}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t(language, 'groupDmNamePlaceholder')}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-indigo-400"
            />
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Arkadaş veya çevrimiçi kullanıcı ara..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-indigo-400"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {filteredCandidates.length === 0 ? (
                <div className="py-6 text-center text-xs text-white/40">
                  Eklenebilecek kullanıcı bulunamadı.
                </div>
              ) : (
                filteredCandidates.map((cand) => {
                  const isChecked = selectedUsers.includes(cand.username);
                  return (
                    <button
                      key={cand.username}
                      type="button"
                      onClick={() => toggleUser(cand.username)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition ${
                        isChecked
                          ? 'bg-indigo-500/20 border-indigo-400/40 text-white'
                          : 'bg-white/[0.03] border-transparent hover:bg-white/[0.07] text-white/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                          <AvatarView avatar={cand.avatar} alt={cand.username} fallback="👤" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{cand.username}</div>
                          <div className={`text-[10px] ${cand.isOnline ? 'text-emerald-400' : 'text-white/40'}`}>
                            {cand.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                          isChecked
                            ? 'bg-indigo-500 border-indigo-400 text-white'
                            : 'border-white/25 bg-black/30'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/75"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={selectedUsers.length === 0}
              className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold disabled:opacity-40 transition"
            >
              Grup Oluştur ({selectedUsers.length})
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
};
