import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { FriendUser, User } from '../types';
import {
  Users,
  UserPlus,
  MessageCircle,
  Phone,
  UserMinus,
  Check,
  X,
  Search,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface FriendsDashboardProps {
  onOpenProfile: (user: User) => void;
}

type TabType = 'online' | 'all' | 'pending' | 'add';

export const FriendsDashboard: React.FC<FriendsDashboardProps> = ({ onOpenProfile }) => {
  const {
    friends,
    incomingFriendRequests,
    outgoingFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    removeFriend,
    openDirectMessage,
    startDirectCall,
    onlineUsers,
  } = useSocket();

  const [activeTab, setActiveTab] = useState<TabType>('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [addUsernameInput, setAddUsernameInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync friends with real-time online status
  const friendsWithStatus = friends.map((f) => {
    const liveUser = onlineUsers.find(
      (u) => u.username.toLowerCase() === f.username.toLowerCase()
    );
    return {
      ...f,
      status: liveUser ? liveUser.status : 'offline',
      id: liveUser ? liveUser.id : f.id,
      isSpeaking: liveUser?.isSpeaking || false,
      statusMessage: liveUser?.statusMessage || f.statusMessage,
      avatar: liveUser?.avatar || f.avatar,
    };
  });

  const onlineFriends = friendsWithStatus.filter((f) => f.status !== 'offline');
  const pendingCount = incomingFriendRequests.length + outgoingFriendRequests.length;

  const filteredFriends = (activeTab === 'online' ? onlineFriends : friendsWithStatus).filter(
    (f) => f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = addUsernameInput.trim();
    if (!target) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await sendFriendRequest(target);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'İstek başarıyla gönderildi!' });
        setAddUsernameInput('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'İstek gönderilemedi.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Bir hata oluştu.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDM = (friend: FriendUser) => {
    const liveUser = onlineUsers.find((u) => u.username.toLowerCase() === friend.username.toLowerCase());
    openDirectMessage({
      id: liveUser ? liveUser.id : friend.id,
      username: friend.username,
      avatar: friend.avatar,
      role: friend.role,
      status: friend.status,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
    });
  };

  const handleStartCall = (friend: FriendUser) => {
    const liveUser = onlineUsers.find((u) => u.username.toLowerCase() === friend.username.toLowerCase());
    startDirectCall({
      id: liveUser ? liveUser.id : friend.id,
      username: friend.username,
      avatar: friend.avatar,
      role: friend.role,
      status: friend.status,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
    });
  };

  const handleFriendClick = (friend: FriendUser) => {
    const liveUser = onlineUsers.find((u) => u.username.toLowerCase() === friend.username.toLowerCase());
    onOpenProfile({
      id: liveUser ? liveUser.id : friend.id,
      username: friend.username,
      avatar: friend.avatar,
      role: friend.role,
      status: friend.status,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      statusMessage: friend.statusMessage,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent select-none">
      {/* Top Navbar */}
      <header className="h-14 px-6 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#16161a]/60 backdrop-blur-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-4 border-r border-white/10 font-bold text-sm text-white">
            <Users className="w-5 h-5 text-white/70" />
            <span>Arkadaşlar</span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('online')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'online'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              Çevrimiçi ({onlineFriends.length})
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'all'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              Tümü ({friends.length})
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`relative px-3 py-1.5 rounded-lg transition ${
                activeTab === 'pending'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <span>Bekleyen</span>
              {pendingCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('add')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === 'add'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Arkadaş Ekle</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ADD FRIEND TAB */}
        {activeTab === 'add' ? (
          <div className="max-w-xl space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white tracking-tight uppercase">
                Arkadaş Ekle
              </h2>
              <p className="text-xs text-white/50">
                Kullanıcı adını girerek Discord & TeamSpeak ağındaki arkadaşlarınıza istek gönderebilirsiniz.
              </p>
            </div>

            <form
              onSubmit={handleSendRequest}
              className="relative flex items-center p-2 rounded-2xl bg-black/40 border border-white/15 focus-within:border-emerald-500 shadow-xl transition"
            >
              <input
                type="text"
                value={addUsernameInput}
                onChange={(e) => setAddUsernameInput(e.target.value)}
                placeholder="Arkadaş olarak eklemek istediğiniz kullanıcı adı..."
                className="flex-1 bg-transparent px-3 text-sm text-white placeholder-white/30 outline-none"
              />
              <button
                type="submit"
                disabled={!addUsernameInput.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white text-xs font-bold transition shadow-lg shadow-emerald-500/30 flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Gönderiliyor...' : 'İstek Gönder'}</span>
              </button>
            </form>

            {/* Feedback alert */}
            {feedback && (
              <div
                className={`p-3 rounded-2xl border text-xs flex items-center gap-2.5 animate-fade-in ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            <div className="pt-6 border-t border-white/10 flex items-center gap-4 text-white/40 text-xs">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                İpucu: Arkadaşınız çevrimdışı olsa bile kullanıcı adını yazarak istek gönderebilirsiniz.
              </span>
            </div>
          </div>
        ) : activeTab === 'pending' ? (
          /* PENDING REQUESTS TAB */
          <div className="space-y-6 max-w-2xl animate-fade-in">
            {/* Incoming Requests */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                Gelen İstekler — {incomingFriendRequests.length}
              </div>

              {incomingFriendRequests.length === 0 ? (
                <div className="text-xs text-white/30 py-4 text-center bg-white/[0.02] rounded-2xl border border-white/5">
                  Bekleyen gelen arkadaşlık isteği yok.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {incomingFriendRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">
                          {req.fromAvatar || '👤'}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{req.fromUsername}</div>
                          <div className="text-[10px] text-white/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Gelen Arkadaşlık İsteği · {req.createdAt}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => acceptFriendRequest(req.id)}
                          className="w-9 h-9 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 text-emerald-300 hover:text-white flex items-center justify-center transition shadow"
                          title="Kabul Et"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => declineFriendRequest(req.id)}
                          className="w-9 h-9 rounded-xl bg-red-500/20 hover:bg-red-500 border border-red-400/30 text-red-300 hover:text-white flex items-center justify-center transition shadow"
                          title="Reddet"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Requests */}
            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                Giden İstekler — {outgoingFriendRequests.length}
              </div>

              {outgoingFriendRequests.length === 0 ? (
                <div className="text-xs text-white/30 py-4 text-center bg-white/[0.02] rounded-2xl border border-white/5">
                  Bekleyen giden arkadaşlık isteği yok.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {outgoingFriendRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">
                          👤
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{req.toUsername}</div>
                          <div className="text-[10px] text-white/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Giden Arkadaşlık İsteği · {req.createdAt}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => cancelFriendRequest(req.id)}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/20 text-white/70 hover:text-red-300 border border-white/10 text-xs font-semibold transition"
                      >
                        İptal Et
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ONLINE & ALL FRIENDS TABS */
          <div className="space-y-4 max-w-3xl animate-fade-in">
            {/* Search Filter */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Arkadaşlarda ara..."
                className="w-full bg-black/40 border border-white/10 text-xs text-white rounded-xl px-3 py-2 pl-9 outline-none focus:border-blue-500 transition placeholder:text-white/30"
              />
              <Search className="w-4 h-4 text-white/40 absolute left-3 top-2.5" />
            </div>

            <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
              {activeTab === 'online' ? 'Çevrimiçi Arkadaşlar' : 'Tüm Arkadaşlar'} — {filteredFriends.length}
            </div>

            {filteredFriends.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mx-auto">
                  👥
                </div>
                <div className="text-sm text-white/60 font-medium">
                  {activeTab === 'online'
                    ? 'Şu anda çevrimiçi arkadaş bulunmuyor.'
                    : 'Henüz arkadaş listenizde kimse yok.'}
                </div>
                <button
                  onClick={() => setActiveTab('add')}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition shadow-lg shadow-emerald-500/30"
                >
                  Arkadaş Ekle
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredFriends.map((friend) => (
                  <div
                    key={friend.username}
                    onClick={() => handleFriendClick(friend)}
                    className="group flex items-center justify-between p-2.5 px-3 rounded-2xl bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg ${
                            (friend as any).isSpeaking ? 'ios-halo' : ''
                          }`}
                        >
                          {friend.avatar || '👤'}
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black ${
                            friend.status === 'online'
                              ? 'bg-emerald-400'
                              : friend.status === 'idle'
                              ? 'bg-amber-400'
                              : friend.status === 'dnd'
                              ? 'bg-red-400'
                              : 'bg-white/30'
                          }`}
                        />
                      </div>

                      <div className="truncate">
                        <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                          <span>{friend.username}</span>
                          {friend.role === 'admin' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/50 truncate">
                          {friend.statusMessage || (friend.status === 'offline' ? 'Çevrimdışı' : 'Çevrimiçi')}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleOpenDM(friend)}
                        className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition shadow"
                        title="Özel Mesaj Gönder"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleStartCall(friend)}
                        className="w-9 h-9 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-white/70 hover:text-emerald-400 flex items-center justify-center transition shadow"
                        title="Sesli Ara"
                      >
                        <Phone className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`${friend.username} adlı kullanıcıyı arkadaş listenizden çıkarmak istediğinize emin misiniz?`)) {
                            removeFriend(friend.username);
                          }
                        }}
                        className="w-9 h-9 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                        title="Arkadaşlıktan Çıkar"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};