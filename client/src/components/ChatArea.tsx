import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { VoiceRoomArea } from './VoiceRoomArea';
import { FriendsDashboard } from './FriendsDashboard';
import { PollModal } from './PollModal';
import { PinnedMessagesModal } from './PinnedMessagesModal';
import { GifPickerModal } from './GifPickerModal';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { CodeBlock } from './CodeBlock';
import { ChannelMediaModal } from './ChannelMediaModal';
import { LeaderboardModal } from './LeaderboardModal';
import { MiniGamesModal } from './MiniGamesModal';
import { AdvancedSearchModal } from './AdvancedSearchModal';
import { AvatarView } from './AvatarView';
import { ThreadPanel } from './ThreadPanel';
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
  BarChart2,
  Clock,
  Mic,
  Sparkles,
  Image as ImageIcon,
  Trophy,
  Gamepad2,
  Tag,
  Edit2,
  Trash2,
  Copy,
  Check,
  CornerUpLeft,
  ArrowDown,
  Menu,
  MessageSquare,
} from 'lucide-react';

const SLASH_COMMANDS = [
  { cmd: '/zar', desc: '1-6 arası rastgele zar atar' },
  { cmd: '/yazitura', desc: 'Yazı veya Tura atar' },
  { cmd: '/anket', desc: 'Hızlı anket oluşturma penceresini açar' },
  { cmd: '/temizle', desc: 'Son N mesajı temizler (Örn: /temizle 10)' },
  { cmd: '/davet', desc: 'Sunucu davet bağlantısı oluşturup paylaşır' },
  { cmd: '/yardim', desc: 'Kullanılabilir slash komutlarını listeler' },
];

interface ChatAreaProps {
  onToggleMembers: () => void;
  showMembers: boolean;
  onOpenProfile: (user: User) => void;
  onOpenMobileNav?: () => void;
}

const SpoilerText: React.FC<{ text: string }> = ({ text }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      className={`px-1.5 py-0.5 rounded cursor-pointer transition select-none ${
        revealed
          ? 'bg-white/15 text-white'
          : 'bg-neutral-800 text-transparent hover:bg-neutral-700'
      }`}
      title={revealed ? '' : 'Spoilerı görmek için tıklayın'}
    >
      {text}
    </span>
  );
};

const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, lineIdx) => {
        const isQuote = line.startsWith('> ');
        const processedLine = isQuote ? line.slice(2) : line;
        const parts = processedLine.split(/(\|\|[\s\S]*?\|\||\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|~~[\s\S]*?~~)/g);

        return (
          <span
            key={lineIdx}
            className={
              isQuote
                ? 'block border-l-2 border-amber-400 pl-2.5 py-0.5 text-white/70 italic bg-white/[0.02] rounded-r'
                : 'block'
            }
          >
            {parts.map((p, pIdx) => {
              if (p.startsWith('||') && p.endsWith('||') && p.length >= 4) {
                return <SpoilerText key={pIdx} text={p.slice(2, -2)} />;
              }
              if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
                return (
                  <strong key={pIdx} className="font-bold text-white">
                    {p.slice(2, -2)}
                  </strong>
                );
              }
              if (p.startsWith('*') && p.endsWith('*') && p.length >= 2) {
                return (
                  <em key={pIdx} className="italic text-white/90">
                    {p.slice(1, -1)}
                  </em>
                );
              }
              if (p.startsWith('~~') && p.endsWith('~~') && p.length >= 4) {
                return (
                  <del key={pIdx} className="line-through text-white/50">
                    {p.slice(2, -2)}
                  </del>
                );
              }
              return <span key={pIdx}>{p}</span>;
            })}
          </span>
        );
      })}
    </div>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({
  onToggleMembers,
  showMembers,
  onOpenProfile,
  onOpenMobileNav,
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
    addReaction,
    togglePinMessage,
    createPoll,
    votePoll,
    updateChannelNotice,
    editMessage,
    deleteMessage,
    typingUsers,
    sendTyping,
    chatFontSize,
    clearChannelMessages,
    createServerInvite,
  } = useSocket();

  const [activeThreadMsgId, setActiveThreadMsgId] = useState<string | null>(null);
  const activeThreadMessage = activeThreadMsgId ? messages.find((m) => m.id === activeThreadMsgId) || null : null;

  const [inputText, setInputText] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [slowmodeRemaining, setSlowmodeRemaining] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isChatMiniGamesOpen, setIsChatMiniGamesOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [noticeEditText, setNoticeEditText] = useState('');
  const [topicEditText, setTopicEditText] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string; content: string } | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const EMOJI_GROUPS = [
    { label: 'Popüler', emojis: ['😊', '😂', '❤️', '🔥', '👍', '🎉', '🙌', '😎', '🤔', '👀', '💀', '💯'] },
    { label: 'İfadeler', emojis: ['😁', '😅', '🤣', '😍', '🥰', '🤩', '🥳', '😭', '😡', '🤯', '😴', '🙏'] },
    { label: 'Oyun & Teknoloji', emojis: ['🎮', '🎧', '🎤', '💻', '🚀', '⚡', '🏆', '🥇', '💎', '🛡️', '⚔️', '🎲'] },
  ];

  const handleCopyMessage = (msgId: string, content: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    }).catch(() => {});
  };

  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distFromBottom > 220);
  };

  const handleJumpToMessage = (messageId: string) => {
    setHighlightedMessageId(messageId);
    setTimeout(() => {
      const el = document.getElementById(`message-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    setTimeout(() => {
      setHighlightedMessageId(null);
    }, 3000);
  };

  // Voice note recording states
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordSeconds, setVoiceRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceRecordIntervalRef = useRef<any>(null);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start(100);
      setIsVoiceRecording(true);
      setVoiceRecordSeconds(0);
      voiceRecordIntervalRef.current = setInterval(() => {
        setVoiceRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Mikrofon erişimi sağlanamadı.');
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (voiceRecordIntervalRef.current) clearInterval(voiceRecordIntervalRef.current);
    setIsVoiceRecording(false);
    setVoiceRecordSeconds(0);
    audioChunksRef.current = [];
  };

  const finishVoiceRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (voiceRecordIntervalRef.current) clearInterval(voiceRecordIntervalRef.current);
    const duration = voiceRecordSeconds;

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const newAtt: MessageAttachment = {
          id: `att-voice-${Date.now()}`,
          name: `Sesli Mesaj (${duration}s).webm`,
          size: blob.size,
          type: 'audio/webm',
          url: base64,
        };
        sendMessage('🎙️ Sesli Mesaj', [newAtt]);
      };
      reader.readAsDataURL(blob);
      setIsVoiceRecording(false);
      setVoiceRecordSeconds(0);
      audioChunksRef.current = [];
    };

    mediaRecorderRef.current.stop();
  };

  const handleSelectGif = (gifUrl: string, title: string) => {
    const newAtt: MessageAttachment = {
      id: `att-gif-${Date.now()}`,
      name: `${title}.gif`,
      size: 0,
      type: 'image/gif',
      url: gifUrl,
    };
    sendMessage('', [newAtt]);
    setIsGifModalOpen(false);
  };

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    if (content.includes('```')) {
      const parts = content.split(/(```[\s\S]*?```)/g);
      return parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const raw = part.slice(3, -3);
          const firstLineBreak = raw.indexOf('\n');
          let lang = 'code';
          let codeText = raw;
          if (firstLineBreak !== -1) {
            const possibleLang = raw.slice(0, firstLineBreak).trim();
            if (possibleLang && !possibleLang.includes(' ')) {
              lang = possibleLang;
              codeText = raw.slice(firstLineBreak + 1);
            }
          }
          return <CodeBlock key={index} code={codeText} language={lang} />;
        }
        return <InlineMarkdown key={index} text={part} />;
      });
    }
    return <InlineMarkdown text={content} />;
  };

  const filteredMessages = messages.filter((m) => {
    if (currentUser?.blockedUsers?.includes(m.author.username)) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const contentMatch = m.content?.toLowerCase().includes(query);
    const authorMatch = m.author.username.toLowerCase().includes(query);
    return contentMatch || authorMatch;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slowmode timer effect
  useEffect(() => {
    if (slowmodeRemaining > 0) {
      const timer = setTimeout(() => {
        setSlowmodeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [slowmodeRemaining]);

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
    return <VoiceRoomArea onOpenMobileNav={onOpenMobileNav} />;
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slowmodeRemaining > 0) return;
    if (!inputText.trim() && pendingAttachments.length === 0) return;
    const finalMessage = inputText.trim();

    if (finalMessage.startsWith('/')) {
      const [rawCmd, ...args] = finalMessage.split(/\s+/);
      const cmd = rawCmd.toLowerCase();
      if (cmd === '/zar') {
        const roll = Math.floor(Math.random() * 6) + 1;
        sendMessage(`🎲 **Zar Attı:** ${roll} geldi!`);
        setInputText('');
        return;
      }
      if (cmd === '/yazitura') {
        const coin = Math.random() < 0.5 ? 'Yazı' : 'Tura';
        sendMessage(`🪙 **Yazı-Tura:** **${coin}** geldi!`);
        setInputText('');
        return;
      }
      if (cmd === '/anket' && !isDM) {
        setInputText('');
        setIsPollModalOpen(true);
        return;
      }
      if (cmd === '/temizle' && activeServer && activeChannel && !isDM) {
        const count = Math.min(Math.max(parseInt(args[0] || '10', 10) || 10, 1), 100);
        clearChannelMessages(activeServer.id, activeChannel.id, count);
        setInputText('');
        return;
      }
      if (cmd === '/davet' && activeServer && !isDM) {
        setInputText('');
        const inv = await createServerInvite(activeServer.id, 0, 0);
        if (inv?.code) {
          sendMessage(`🔗 **Sunucu Davet Linki:** ${window.location.origin}/?invite=${inv.code} (Kod: \`${inv.code}\`)`);
        }
        return;
      }
      if (cmd === '/yardim') {
        sendMessage('⚡ **Slash Komutları:** `/zar`, `/yazitura`, `/anket`, `/temizle [sayı]`, `/davet`, `/yardim`');
        setInputText('');
        return;
      }
    }

    sendMessage(finalMessage, pendingAttachments, replyingTo || undefined);
    setInputText('');
    setPendingAttachments([]);
    setReplyingTo(null);
    setIsEmojiPickerOpen(false);
    if (activeChannel?.slowmodeSeconds && activeChannel.slowmodeSeconds > 0) {
      setSlowmodeRemaining(activeChannel.slowmodeSeconds);
    }
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
      className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden select-text bg-transparent"
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
      <header className="h-14 px-3 sm:px-6 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0 bg-[#101218]/75 backdrop-blur-2xl shadow-sm select-none">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              className="md:hidden w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0"
              title="Menüyü Aç"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
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
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/60 shrink-0">
                <Hash className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-white text-sm tracking-tight truncate">{activeChannel.name}</h3>
                <span className="text-[11px] text-white/40 hidden sm:inline">
                  {activeServer.name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Header Action Icons */}
        <div className="flex items-center gap-1 sm:gap-2.5 text-white/60 shrink-0">
          {isDM && dmPartner && (
            <button
              onClick={() => startDirectCall(dmPartner)}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
              title="1-e-1 Sesli Arama Başlat"
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sesli Ara</span>
            </button>
          )}

          <button
            className="hidden sm:flex w-8 h-8 rounded-full hover:bg-white/10 items-center justify-center transition"
            title="Bildirimler"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMediaModalOpen(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition text-pink-400"
            title="Kanal Medya & Dosya Galerisi"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          {activeServer && (
            <button
              onClick={() => setIsLeaderboardOpen(true)}
              className="hidden sm:flex w-8 h-8 rounded-full hover:bg-white/10 items-center justify-center transition text-amber-400"
              title="Sunucu Liderlik Tablosu (XP & Seviye)"
            >
              <Trophy className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsChatMiniGamesOpen(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition text-purple-400"
            title="Aktiviteler & Mini Oyunlar (XOX, Hızlı Yazma)"
          >
            <Gamepad2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPinModalOpen(true)}
            className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"
            title="Sabitlenmiş Mesajlar"
          >
            <Pin className={`w-4 h-4 ${messages.some(m => m.isPinned) ? 'text-amber-400' : ''}`} />
            {messages.filter(m => m.isPinned).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                {messages.filter(m => m.isPinned).length}
              </span>
            )}
          </button>
          <button
            onClick={onToggleMembers}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition ${
              showMembers ? 'bg-white/15 text-white' : 'hover:bg-white/10'
            }`}
            title="Kişileri Göster/Gizle"
          >
            <Users className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition text-blue-400"
            title="Gelişmiş Sohbet Araması & Işınlanma"
          >
            <Search className="w-4 h-4" />
          </button>

          <div className="relative hidden md:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hızlı filtrele..."
              className="bg-white/5 border border-white/10 text-xs text-white rounded-full px-3 py-1.5 pl-8 pr-7 w-36 focus:w-44 transition-all duration-200 outline-none placeholder:text-white/30"
            />
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-2" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-white/40 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Channel Sticky Notice & Topic Bar */}
      {activeServer.id !== 'direct-messages' && activeChannel.type === 'text' && (
        <div className="border-b border-white/[0.06] bg-[#141418]/90 backdrop-blur-md px-6 py-2 flex items-center justify-between text-xs transition select-none">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {activeChannel.stickyNotice ? (
              <div className="flex items-center gap-2 truncate">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1 border border-amber-500/30 shrink-0">
                  📌 Sabit Duyuru
                </span>
                <span className="text-white/90 font-medium truncate">
                  {activeChannel.stickyNotice.text}
                </span>
                <span className="text-white/40 text-[11px] shrink-0 hidden sm:inline">
                  • @{activeChannel.stickyNotice.author} ({activeChannel.stickyNotice.updatedAt})
                </span>
              </div>
            ) : activeChannel.topic ? (
              <div className="flex items-center gap-2 text-white/70 truncate">
                <Tag className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">{activeChannel.topic}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/40 text-[11px]">
                <Tag className="w-3.5 h-3.5 text-white/30 shrink-0" />
                <span>Bu kanal için henüz konu veya sabit duyuru belirlenmedi.</span>
              </div>
            )}
          </div>

          {/* Admin actions: Edit / remove sticky notice */}
          {(currentUser?.role === 'admin' || activeServer.ownerId === currentUser?.id) && (
            <div className="flex items-center gap-1.5 shrink-0 pl-3">
              <button
                onClick={() => {
                  setNoticeEditText(activeChannel.stickyNotice?.text || '');
                  setTopicEditText(activeChannel.topic || '');
                  setIsEditingNotice(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[11px] font-medium flex items-center gap-1 transition"
                title="Sabit Duyuru veya Kanal Başlığını Düzenle"
              >
                <Edit2 className="w-3 h-3 text-blue-400" />
                <span>{activeChannel.stickyNotice ? 'Düzenle' : 'Duyuru / Başlık Ekle'}</span>
              </button>
              {activeChannel.stickyNotice && (
                <button
                  onClick={() => {
                    if (confirm('Sabit duyuruyu kaldırmak istediğinize emin misiniz?')) {
                      updateChannelNotice(activeServer.id, activeChannel.id, null);
                    }
                  }}
                  className="p-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition"
                  title="Sabit Duyuruyu Kaldır"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className="relative flex-1 overflow-y-auto px-6 py-6 space-y-4"
      >
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
        {filteredMessages.map((msg, index) => {
          const isMe = msg.author.id === currentUser?.id;
          const prevMsg = filteredMessages[index - 1];
          const isSameAuthorAsPrev =
            prevMsg &&
            prevMsg.author.id === msg.author.id &&
            prevMsg.timestamp === msg.timestamp;

          return (
            <div
              key={msg.id}
              id={`message-${msg.id}`}
              className={`flex gap-3 items-end group ${
                isMe ? 'justify-end' : 'justify-start'
              } ${isSameAuthorAsPrev ? 'mt-1' : 'mt-4'} ${
                highlightedMessageId === msg.id
                  ? 'ring-2 ring-amber-400 bg-amber-500/15 p-2 rounded-2xl shadow-xl shadow-amber-500/20 transition-all duration-300'
                  : 'transition-all duration-200'
              }`}
            >
              {/* Other User Avatar with click to open profile */}
              {!isMe && (
                <button
                  type="button"
                  onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm shrink-0 shadow select-none cursor-pointer transition hover:scale-105 overflow-hidden"
                  title={`${msg.author.username} profilini görüntüle`}
                >
                  <AvatarView avatar={msg.author.avatar} alt={msg.author.username} />
                </button>
              )}

              <div className={`relative group/msg flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Floating Quick Action Bar on Hover */}
                <div
                  className={`absolute -top-3.5 ${
                    isMe ? 'right-2' : 'left-2'
                  } opacity-0 group-hover/msg:opacity-100 transition-opacity z-20 flex items-center gap-1 bg-slate-900/95 border border-white/15 rounded-full px-2 py-0.5 shadow-xl backdrop-blur-md select-none`}
                >
                  {['👍', '❤️', '🔥', '😂', '🎉', '💀'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => addReaction(msg.id, emoji)}
                      className="text-xs hover:scale-125 transition-transform px-1 py-0.5"
                      title={`${emoji} tepkisi ver`}
                    >
                      {emoji}
                    </button>
                  ))}
                  <div className="w-[1px] h-3 bg-white/20 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setReplyingTo({ id: msg.id, username: msg.author.username, content: msg.content || 'Ek / Medya' })}
                    title="Yanıtla"
                    className="p-1 rounded-full text-xs text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    <CornerUpLeft className="w-3 h-3" />
                  </button>
                  {!isDM && (
                    <button
                      type="button"
                      onClick={() => setActiveThreadMsgId(msg.id)}
                      title="Alt Konu (Thread) Aç"
                      className="p-1 rounded-full text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                    </button>
                  )}
                  {msg.content && (
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      title="Mesajı Kopyala"
                      className={`p-1 rounded-full text-xs transition-colors ${
                        copiedMsgId === msg.id ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {copiedMsgId === msg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePinMessage(msg.id)}
                    title={msg.isPinned ? 'Sabitlemeyi Kaldır' : 'Mesajı Sabitle'}
                    className={`p-1 rounded-full text-xs transition-colors ${
                      msg.isPinned ? 'text-amber-400 bg-amber-400/20' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                  {isMe && msg.content && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMsgId(msg.id);
                        setEditingText(msg.content);
                      }}
                      title="Mesajı Düzenle"
                      className="p-1 rounded-full text-xs text-slate-400 hover:text-amber-300 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                  {(isMe || activeServer?.ownerId === currentUser?.id) && (
                    <button
                      type="button"
                      onClick={() => deleteMessage(msg.id)}
                      title="Mesajı Sil"
                      className="p-1 rounded-full text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

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
                    {msg.author.username === 'AI Asistan' && (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded-full border border-indigo-500/30">
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400" /> AI BOT
                      </span>
                    )}
                    <span className="text-[10px] text-white/30 select-none">
                      {msg.timestamp}
                      {msg.isEdited && <span className="ml-1 italic text-white/40">(düzenlendi)</span>}
                    </span>
                    {msg.isPinned && (
                      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                        <Pin className="w-2.5 h-2.5" /> Sabitlendi
                      </span>
                    )}
                  </div>
                )}

                {/* Bubble Container */}
                <div
                  className={`space-y-2 px-4 py-2.5 ${
                    chatFontSize === 'sm' ? 'text-xs' : chatFontSize === 'lg' ? 'text-base' : 'text-sm'
                  } leading-relaxed break-words shadow-md transition-all ${
                    isMe
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl rounded-br-sm'
                      : 'bg-white/10 text-white/90 border border-white/10 rounded-2xl rounded-bl-sm backdrop-blur-md'
                  }`}
                >
                  {/* Text Content with Code Block Formatting or Inline Edit */}
                  {editingMsgId === msg.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = editingText.trim();
                        if (trimmed && trimmed !== msg.content) {
                          editMessage(msg.id, trimmed);
                        }
                        setEditingMsgId(null);
                      }}
                      className="flex items-center gap-1.5 min-w-[220px]"
                    >
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingMsgId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-black/30 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-white/50"
                      />
                      <button
                        type="submit"
                        title="Kaydet"
                        className="p-1 rounded-md bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-200 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMsgId(null)}
                        title="İptal"
                        className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white/70 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      {msg.replyTo && (
                        <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/25 border-l-2 border-blue-400 text-[11px] text-white/70">
                          <span className="font-semibold text-blue-300">@{msg.replyTo.username}: </span>
                          <span className="truncate">{msg.replyTo.content}</span>
                        </div>
                      )}
                      {msg.content && (
                        <div>
                        {renderMessageContent(msg.content)}
                        {isSameAuthorAsPrev && msg.isEdited && (
                          <span className="ml-1.5 text-[10px] italic opacity-60">(düzenlendi)</span>
                        )}
                      </div>
                    )}
                  </>
                )}

                  {/* Interactive Poll Card */}
                  {msg.poll && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-950/60 border border-white/15 space-y-2 min-w-[240px]">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-1">
                        <BarChart2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{msg.poll.question}</span>
                      </div>
                      <div className="space-y-1.5">
                        {msg.poll.options.map((opt) => {
                          const isVoted = currentUser && opt.votes.includes(currentUser.username);
                          const total = msg.poll!.totalVotes || 1;
                          const pct = total > 0 ? Math.round((opt.votes.length / total) * 100) : 0;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => votePoll(msg.id, opt.id)}
                              className={`w-full relative overflow-hidden flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-all ${
                                isVoted
                                  ? 'border-emerald-500 bg-emerald-500/20 text-white font-semibold'
                                  : 'border-white/5 bg-white/5 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <div
                                className="absolute left-0 top-0 bottom-0 bg-emerald-500/25 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="relative z-10 truncate">{opt.text}</span>
                              <span className="relative z-10 text-[10px] text-slate-400 font-mono ml-2">
                                %{pct} ({opt.votes.length})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-white/10 flex items-center justify-between select-none">
                        <span>Toplam {msg.poll.totalVotes || 0} oy</span>
                        <span className="text-emerald-400">Oylamak için dokunun</span>
                      </div>
                    </div>
                  )}

                  {/* Attachments rendering */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {msg.attachments.map((att) => {
                        // Voice Note / Audio
                        if (att.type.startsWith('audio/')) {
                          return (
                            <div key={att.id} className="pt-1">
                              <VoiceNotePlayer
                                url={att.url}
                                authorName={msg.author.username}
                              />
                            </div>
                          );
                        }

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

                {/* Reaction Badges Pill Container */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 px-0.5 select-none">
                    {Object.entries(msg.reactions).map(([emoji, usernames]) => {
                      const hasMyVote = currentUser && usernames.includes(currentUser.username);
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => addReaction(msg.id, emoji)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                            hasMyVote
                              ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                          title={`Tepki verenler: ${usernames.join(', ')}`}
                        >
                          <span>{emoji}</span>
                          <span className="font-bold text-[10px]">{usernames.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isDM && msg.threadMessages && msg.threadMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveThreadMsgId(msg.id)}
                    className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/25 text-[11px] font-semibold text-cyan-300 transition"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>{msg.threadMessages.length} alt konu yanıtı</span>
                  </button>
                )}
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
      <div className="px-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6 pt-2 shrink-0 select-none">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        {isVoiceRecording ? (
          <div className="ios-glass-card rounded-full px-5 py-2.5 flex items-center justify-between shadow-2xl border border-red-500/30 bg-red-950/30 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-bold text-red-400 font-mono">
                {Math.floor(voiceRecordSeconds / 60).toString().padStart(2, '0')}:
                {(voiceRecordSeconds % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-xs text-white/80 font-medium hidden sm:inline">
                Sesli mesaj kaydediliyor...
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-semibold transition"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={finishVoiceRecording}
                className="px-4 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Gönder</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Typing Indicator */}
            {(() => {
              const activeTypers = (typingUsers[activeChannel.id] || []).filter(
                (u) => u !== currentUser?.username && !currentUser?.blockedUsers?.includes(u)
              );
              if (activeTypers.length === 0) return null;
              const text =
                activeTypers.length === 1
                  ? `${activeTypers[0]} yazıyor...`
                  : activeTypers.length === 2
                  ? `${activeTypers[0]} ve ${activeTypers[1]} yazıyor...`
                  : `${activeTypers.length} kişi yazıyor...`;
              return (
                <div className="flex items-center gap-2 px-4 pb-1.5 text-[11px] text-white/60 animate-fadeIn">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="font-medium">{text}</span>
                </div>
              );
            })()}
            {/* Scroll to Bottom Floating Pill */}
            {showScrollBottom && (
              <button
                type="button"
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="absolute -top-12 right-2 z-20 px-3 py-1.5 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl backdrop-blur-md border border-blue-400/30 transition animate-fade-in"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>En Alta İn</span>
              </button>
            )}

            {/* Reply Preview Banner */}
            {replyingTo && (
              <div className="mb-2 px-4 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-between text-xs animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <CornerUpLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-blue-300 font-semibold shrink-0">@{replyingTo.username}</span>
                  <span className="text-white/60 truncate">{replyingTo.content}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition shrink-0"
                  title="Yanıtı İptal Et"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Emoji Picker Popover */}
            {isEmojiPickerOpen && (
              <div className="absolute bottom-14 right-0 z-30 w-[calc(100vw-24px)] max-w-72 p-3 rounded-2xl ios-glass border border-white/15 shadow-2xl space-y-3 animate-slide-up">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="text-xs font-bold text-white/90">Emoji Seç</span>
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen(false)}
                    className="text-white/40 hover:text-white transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {activeServer?.customEmojis && activeServer.customEmojis.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80 mb-1.5">
                        Sunucu Emojileri
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {activeServer.customEmojis.map((ce) => (
                          <button
                            key={ce.id}
                            type="button"
                            onClick={() => {
                              setPendingAttachments((prev) => [
                                ...prev,
                                { id: `emj-${Date.now()}`, name: `${ce.name}.png`, size: 1024, type: 'image/png', url: ce.url }
                              ]);
                              setIsEmojiPickerOpen(false);
                            }}
                            title={`:${ce.name}:`}
                            className="h-8 rounded-lg hover:bg-white/15 flex items-center justify-center p-1 transition hover:scale-110"
                          >
                            <img src={ce.url} alt={ce.name} className="w-6 h-6 object-contain rounded" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {EMOJI_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {group.emojis.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setInputText((prev) => prev + em)}
                            className="h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-lg transition hover:scale-110"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inputText.startsWith('/') && !inputText.includes(' ') && (
              <div className="mb-2 rounded-2xl bg-[#131620]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Slash Komutları
                </div>
                {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(inputText.toLowerCase())).map((c) => (
                  <button
                    key={c.cmd}
                    type="button"
                    onClick={() => setInputText(c.cmd === '/temizle' ? '/temizle 10' : c.cmd)}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-white/10 text-left transition"
                  >
                    <span className="text-xs font-mono font-bold text-cyan-300">{c.cmd}</span>
                    <span className="text-[11px] text-white/55">{c.desc}</span>
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={handleSend}
              className="ios-glass-card rounded-full px-2 sm:px-3 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2.5 shadow-2xl border border-white/15 focus-within:border-amber-400/50 focus-within:shadow-[0_0_28px_rgba(245,158,11,0.18)] transition-all"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition shrink-0"
                title="Resim veya Dosya Ekle"
              >
                <Plus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsGifModalOpen(true)}
                className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[10px] font-bold tracking-wider transition shrink-0 border border-white/10"
                title="GIF Arama & Ekleme"
              >
                GIF
              </button>

              {!isDM && (
                <button
                  type="button"
                  onClick={() => setIsPollModalOpen(true)}
                  className="w-8 h-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition shrink-0"
                  title="Anket Başlat (Poll)"
                >
                  <BarChart2 className="w-4 h-4" />
                </button>
              )}

              {slowmodeRemaining > 0 ? (
                <div className="flex-1 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>Yavaş Mod aktif: Lütfen {slowmodeRemaining} saniye bekleyin...</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputText(val);
                    if (val.trim().length > 0) {
                      if (!isTypingRef.current) {
                        isTypingRef.current = true;
                        sendTyping(true);
                      }
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                      typingTimeoutRef.current = setTimeout(() => {
                        isTypingRef.current = false;
                        sendTyping(false);
                      }, 2500);
                    } else if (isTypingRef.current) {
                      isTypingRef.current = false;
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                      sendTyping(false);
                    }
                  }}
                  placeholder={
                    isDM
                      ? `Mesaj (${dmPartner?.username || 'Sohbet'})...`
                      : `iMessage (#${activeChannel.name})...`
                  }
                  className="flex-1 min-w-0 bg-transparent text-white placeholder-white/30 text-base sm:text-sm outline-none px-1 sm:px-2"
                />
              )}

              <button
                type="button"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
                  isEmojiPickerOpen
                    ? 'bg-yellow-400/20 text-yellow-300'
                    : 'hover:bg-white/10 text-white/60 hover:text-yellow-400'
                }`}
                title="Emoji Seç"
                onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
              >
                <Smile className="w-5 h-5" />
              </button>

              {!inputText.trim() && pendingAttachments.length === 0 ? (
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="w-8 h-8 rounded-full bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 text-emerald-300 hover:text-white flex items-center justify-center transition shrink-0 shadow"
                  title="Sesli Mesaj Kaydet"
                >
                  <Mic className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={(!inputText.trim() && pendingAttachments.length === 0) || slowmodeRemaining > 0}
                  className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-teal-500 hover:brightness-110 text-white flex items-center justify-center transition disabled:opacity-20 shrink-0 shadow-md shadow-amber-500/25"
                  title="Gönder"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* GIF Picker Modal */}
      <GifPickerModal
        isOpen={isGifModalOpen}
        onClose={() => setIsGifModalOpen(false)}
        onSelectGif={handleSelectGif}
      />

      {/* Poll Creation Modal */}
      <PollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onCreatePoll={(question, options) => createPoll(question, options)}
      />

      {/* Pinned Messages Modal */}
      <PinnedMessagesModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        channelName={activeChannel.name}
        pinnedMessages={messages.filter((m) => m.isPinned)}
        onUnpin={(mId) => togglePinMessage(mId)}
      />

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

      {/* Channel Media Gallery Modal */}
      {isMediaModalOpen && activeChannel && (
        <ChannelMediaModal
          channelName={activeChannel.name}
          messages={messages}
          onClose={() => setIsMediaModalOpen(false)}
        />
      )}

      {/* Server Leaderboard Modal */}
      {isLeaderboardOpen && activeServer && (
        <LeaderboardModal
          serverId={activeServer.id}
          serverName={activeServer.name}
          onClose={() => setIsLeaderboardOpen(false)}
        />
      )}

      {/* Mini Games & Activities Modal */}
      {isChatMiniGamesOpen && activeChannel && (
        <MiniGamesModal
          channelId={activeChannel.id}
          onClose={() => setIsChatMiniGamesOpen(false)}
        />
      )}

      {/* Advanced Search & Jump Modal */}
      {isSearchModalOpen && activeChannel && (
        <AdvancedSearchModal
          channelName={activeChannel.name}
          messages={messages}
          onClose={() => setIsSearchModalOpen(false)}
          onJumpToMessage={handleJumpToMessage}
        />
      )}

      {/* Channel Notice & Topic Edit Modal */}
      {isEditingNotice && activeServer && activeChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md rounded-3xl ios-glass p-6 border border-white/15 text-white space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold tracking-tight">Kanal Konusu & Sabit Duyuru</h3>
              <button
                onClick={() => setIsEditingNotice(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Kanal Konusu / Açıklama
                </label>
                <input
                  type="text"
                  value={topicEditText}
                  onChange={(e) => setTopicEditText(e.target.value)}
                  placeholder="Örn: Genel sohbet, duyurular ve kurallar"
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📌 Sabit Başlık & Duyuru (Kanal Üstünde Sabitlenir)</span>
                </label>
                <textarea
                  value={noticeEditText}
                  onChange={(e) => setNoticeEditText(e.target.value)}
                  rows={3}
                  placeholder="Kanalın en üstünde herkesin göreceği sabit duyuru mesajı..."
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500 resize-none transition"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingNotice(false)}
                className="px-4 py-2 text-xs text-white/60 hover:text-white transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  updateChannelNotice(
                    activeServer.id,
                    activeChannel.id,
                    noticeEditText.trim() || null,
                    topicEditText.trim()
                  );
                  setIsEditingNotice(false);
                }}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 transition"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {activeThreadMessage && (
        <ThreadPanel
          message={activeThreadMessage}
          onClose={() => setActiveThreadMsgId(null)}
        />
      )}
    </main>
  );
};