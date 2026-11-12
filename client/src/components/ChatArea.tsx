import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { VoiceRoomArea } from './VoiceRoomArea';
import { FriendsDashboard } from './FriendsDashboard';
import { MessageAttachment, User } from '../types';
import {
  Hash,
  Bell,
  Pin,
  Users,
  Search,
  Plus,
  Smile,
  ArrowUp,
  X,
  FileText,
  Download,
  Phone,
  MessageCircle,
} from 'lucide-react';

interface ChatAreaProps {
  onToggleMembers: () => void;
  showMembers: boolean;
  onOpenProfile: (user: User) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onToggleMembers,
  showMembers,
  onOpenProfile,
}) => {
  const {
    activeServer,
    activeChannel,
    messages,
    sendMessage,
    currentUser,
    activeDMUser,
    startDirectCall,
    onlineUsers,
  } = useSocket();

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (activeServer?.id === 'direct-messages' && !activeDMUser) {
    return <FriendsDashboard onOpenProfile={onOpenProfile} />;
  }

  if (!activeServer || !activeChannel) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
        Bir kanal seçin
      </div>
    );
  }

  // If this channel is a voice channel, render the iOS voice room area
  if (activeChannel.type === 'voice') {
    return <VoiceRoomArea />;
  }

  const isDM = activeServer.id === 'direct-messages';

  // Find partner for DM
  const dmPartner = isDM
    ? activeDMUser || onlineUsers.find((u) => u.id !== currentUser?.id)
    : null;

  const getAuthorColor = (authorUsername: string): string => {
    if (!activeServer || !activeServer.roles || !activeServer.members) return '#94a3b8';
    const member = activeServer.members.find(
      (m) => m.username.toLowerCase() === authorUsername.toLowerCase()
    );
    if (!member || !member.roleIds || member.roleIds.length === 0) return '#94a3b8';
    const userRoles = activeServer.roles
      .filter((r) => member.roleIds.includes(r.id) && !r.isDefault)
      .sort((a, b) => a.position - b.position);
    return userRoles.length > 0 ? userRoles[0].color : '#94a3b8';
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && pendingAttachments.length === 0) return;
    sendMessage(inputText.trim(), pendingAttachments);
    setInputText('');
    setPendingAttachments([]);
  };

  const processFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      // 5MB limit
      if (file.size > 5 * 1024 * 1024) {
        alert(`"${file.name}" çok büyük! Lütfen 5MB'dan küçük dosyalar yükleyin.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const newAtt: MessageAttachment = {
            id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            url: reader.result,
          };
          setPendingAttachments((prev) => [...prev, newAtt]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAuthorClick = (authorId: string, authorUsername: string, authorAvatar: string) => {
    const matched = onlineUsers.find((u) => u.id === authorId || u.username === authorUsername);
    if (matched) {
      onOpenProfile(matched);
    } else {
      onOpenProfile({
        id: authorId,
        username: authorUsername,
        avatar: authorAvatar,
        role: authorUsername === 'admin' ? 'admin' : 'user',
        status: 'online',
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
      });
    }
  };

  return (
    <main
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 flex flex-col h-full overflow-hidden select-text bg-transparent"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-blue-600/30 backdrop-blur-md border-2 border-dashed border-blue-400 flex flex-col items-center justify-center gap-3 text-white pointer-events-none animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-blue-500/40 flex items-center justify-center text-3xl shadow-xl">
            📂
          </div>
          <p className="text-lg font-bold">Dosyaları buraya bırakın</p>
          <p className="text-xs text-white/70">Resimler, ekran görüntüleri ve belgeler (Maks 5MB)</p>
        </div>
      )}

      {/* iOS Translucent Header */}
      <header className="h-14 px-6 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#16161a]/60 backdrop-blur-2xl shadow-sm select-none">
        <div className="flex items-center gap-3">
          {isDM ? (
            <div
              onClick={() => dmPartner && onOpenProfile(dmPartner)}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition"
              title="Kullanıcı Profilini Görüntüle"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">
                  {dmPartner?.avatar || '👤'}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black ${
                    dmPartner?.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-white text-sm tracking-tight">
                    {dmPartner?.username || activeChannel.name}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                    DM
                  </span>
                </div>
                <span className="text-[11px] text-white/40 block truncate max-w-xs">
                  {dmPartner?.statusMessage || 'Direkt Mesajlaşma'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/60">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm tracking-tight">{activeChannel.name}</h3>
                <span className="text-[11px] text-white/40 hidden sm:inline">
                  {activeServer.name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Header Action Icons */}
        <div className="flex items-center gap-3 text-white/60">
          {isDM && dmPartner && (
            <button
              onClick={() => startDirectCall(dmPartner)}
              className="px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
              title="1-e-1 Sesli Arama Başlat"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Sesli Ara</span>
            </button>
          )}

          <button
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"
            title="Bildirimler"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"
            title="Sabitlenmiş Mesajlar"
          >
            <Pin className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleMembers}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              showMembers ? 'bg-white/15 text-white' : 'hover:bg-white/10'
            }`}
            title="Kişileri Göster/Gizle"
          >
            <Users className="w-4 h-4" />
          </button>

          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="Ara..."
              className="bg-white/5 border border-white/10 text-xs text-white rounded-full px-3 py-1.5 pl-8 w-36 focus:w-48 transition-all duration-200 outline-none placeholder:text-white/30"
            />
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-2" />
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Welcome Banner */}
        <div className="pt-2 pb-6 border-b border-white/[0.06] space-y-2 select-none max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center text-blue-400">
            {isDM ? <MessageCircle className="w-7 h-7" /> : <Hash className="w-7 h-7" />}
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isDM ? `${dmPartner?.username || 'Sohbet'}` : `#${activeChannel.name}`}
          </h2>
          <p className="text-white/50 text-xs leading-relaxed">
            {isDM
              ? `Bu, ${dmPartner?.username || 'bu kullanıcı'} ile olan özel direkt mesajlaşma geçmişiniz. Mesaj gönderip dosya ve resim paylaşabilirsiniz.`
              : 'Bu kanalın başlangıcındasınız. Sohbet etmek ve düşüncelerinizi paylaşmak için bir mesaj yazın.'}
          </p>
        </div>

        {/* Message Items - iOS Messages Bubble Design */}
        {messages.map((msg, index) => {
          const isMe = msg.author.id === currentUser?.id;
          const prevMsg = messages[index - 1];
          const isSameAuthorAsPrev =
            prevMsg &&
            prevMsg.author.id === msg.author.id &&
            prevMsg.timestamp === msg.timestamp;

          return (
            <div
              key={msg.id}
              className={`flex gap-3 items-end group ${
                isMe ? 'justify-end' : 'justify-start'
              } ${isSameAuthorAsPrev ? 'mt-1' : 'mt-4'}`}
            >
              {/* Other User Avatar with click to open profile */}
              {!isMe && (
                <button
                  type="button"
                  onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm shrink-0 shadow select-none cursor-pointer transition hover:scale-105"
                  title={`${msg.author.username} profilini görüntüle`}
                >
                  {msg.author.avatar || '👤'}
                </button>
              )}

              <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isSameAuthorAsPrev && (
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <button
                      type="button"
                      onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                      style={{ color: getAuthorColor(msg.author.username) }}
                      className="text-[11px] font-bold hover:underline cursor-pointer transition"
                    >
                      {isMe ? 'Sen' : msg.author.username}
                    </button>
                    <span className="text-[10px] text-white/30 select-none">
                      {msg.timestamp}
                    </span>
                  </div>
                )}

                {/* Bubble Container */}
                <div
                  className={`space-y-2 px-4 py-2.5 text-sm leading-relaxed break-words shadow-md transition-all ${
                    isMe
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl rounded-br-sm'
                      : 'bg-white/10 text-white/90 border border-white/10 rounded-2xl rounded-bl-sm backdrop-blur-md'
                  }`}
                >
                  {/* Text Content */}
                  {msg.content && <p>{msg.content}</p>}

                  {/* Attachments rendering */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {msg.attachments.map((att) => {
                        const isImage = att.type.startsWith('image/');
                        if (isImage) {
                          return (
                            <div key={att.id} className="relative group/att overflow-hidden rounded-xl">
                              <img
                                src={att.url}
                                alt={att.name}
                                onClick={() => setLightboxImage(att.url)}
                                className="max-h-64 max-w-full rounded-xl cursor-pointer hover:opacity-95 transition object-cover shadow-lg"
                              />
                              <div className="absolute top-2 right-2 opacity-0 group/att:opacity-100 transition flex items-center gap-1.5">
                                <a
                                  href={att.url}
                                  download={att.name}
                                  className="p-1.5 rounded-lg bg-black/60 hover:bg-black text-white text-xs backdrop-blur-md shadow"
                                  title="İndir"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          );
                        }

                        // Document / File Card
                        return (
                          <div
                            key={att.id}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/20 border border-white/10 max-w-sm"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-white/80">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="truncate">
                                <div className="text-xs font-semibold truncate text-white">
                                  {att.name}
                                </div>
                                <div className="text-[10px] text-white/50">
                                  {formatFileSize(att.size)}
                                </div>
                              </div>
                            </div>

                            <a
                              href={att.url}
                              download={att.name}
                              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0"
                              title="Dosyayı İndir"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Attachments Preview Shelf */}
      {pendingAttachments.length > 0 && (
        <div className="px-6 py-2 bg-neutral-900/80 border-t border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar select-none animate-fade-in">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative group shrink-0 flex items-center gap-2 p-1.5 pl-2.5 rounded-xl bg-white/10 border border-white/15 text-xs text-white max-w-[200px]"
            >
              {att.type.startsWith('image/') ? (
                <img
                  src={att.url}
                  alt={att.name}
                  className="w-6 h-6 rounded object-cover shrink-0"
                />
              ) : (
                <FileText className="w-4 h-4 shrink-0 text-blue-400" />
              )}
              <span className="truncate text-[11px]">{att.name}</span>
              <button
                type="button"
                onClick={() => removePendingAttachment(att.id)}
                className="w-5 h-5 rounded-full hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center transition ml-1"
                title="Kaldır"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Message Input Box - iOS Messages Capsule Bar */}
      <div className="px-6 pb-6 pt-2 shrink-0 select-none">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        <form
          onSubmit={handleSend}
          className="ios-glass-card rounded-full px-3 py-2 flex items-center gap-2.5 shadow-2xl border border-white/15"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition shrink-0"
            title="Resim veya Dosya Ekle"
          >
            <Plus className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isDM
                ? `Mesaj (${dmPartner?.username || 'Sohbet'})...`
                : `iMessage (#${activeChannel.name})...`
            }
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none px-2"
          />

          <button
            type="button"
            className="w-8 h-8 rounded-full hover:bg-white/10 text-white/60 hover:text-yellow-400 flex items-center justify-center transition shrink-0"
            title="Emoji Ekle"
            onClick={() => setInputText((prev) => prev + ' 😊')}
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="submit"
            disabled={!inputText.trim() && pendingAttachments.length === 0}
            className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition disabled:opacity-20 shrink-0 shadow-md shadow-blue-500/30"
            title="Gönder"
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      </div>

      {/* Lightbox Image Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center backdrop-blur-md transition shadow"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="Önizleme"
              className="max-h-[85vh] w-auto rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </main>
  );
};