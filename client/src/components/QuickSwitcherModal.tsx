import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import {
  Search,
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Settings,
  Activity,
  Keyboard,
  MessageCircle,
  Server as ServerIcon,
  CornerDownLeft,
  X,
} from 'lucide-react';
import { AvatarView } from './AvatarView';

interface QuickSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
}

interface SwitcherItem {
  id: string;
  category: 'channel' | 'server' | 'user' | 'action';
  title: string;
  subtitle: string;
  keywords: string;
  shortcut?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export const QuickSwitcherModal: React.FC<QuickSwitcherModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenShortcuts,
}) => {
  const {
    servers,
    onlineUsers,
    currentUser,
    connectedVoiceChannelId,
    isMuted,
    isDeafened,
    selectServer,
    selectChannel,
    joinVoiceChannel,
    leaveVoiceChannel,
    openDirectMessage,
    toggleMute,
    toggleDeafen,
    setIsDiagnosticsOpen,
  } = useSocket();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const allItems = useMemo<SwitcherItem[]>(() => {
    const items: SwitcherItem[] = [];

    // 1. Channels across all servers
    servers.forEach((srv) => {
      srv.channels.forEach((ch) => {
        if (ch.isTempCreatorChannel) return;
        const isVoice = ch.type === 'voice';
        items.push({
          id: `ch-${ch.id}`,
          category: 'channel',
          title: isVoice ? ch.name : `#${ch.name}`,
          subtitle: `${srv.name} · ${isVoice ? 'Ses Odası' : 'Metin Kanalı'}`,
          keywords: `${ch.name} ${srv.name} ${isVoice ? 'ses voice' : 'metin text'}`,
          icon: isVoice ? (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Hash className="w-4 h-4 text-white/60" />
          ),
          onSelect: () => {
            selectServer(srv.id);
            if (isVoice) {
              joinVoiceChannel(ch.id);
            } else {
              selectChannel(ch.id);
            }
            onClose();
          },
        });
      });
    });

    // 2. Servers
    servers.forEach((srv) => {
      items.push({
        id: `srv-${srv.id}`,
        category: 'server',
        title: srv.name,
        subtitle: `Sunucu · ${srv.channels.length} kanal`,
        keywords: `${srv.name} sunucu server`,
        icon: <ServerIcon className="w-4 h-4 text-amber-400" />,
        onSelect: () => {
          selectServer(srv.id);
          onClose();
        },
      });
    });

    // 3. Online users (for quick DM)
    const seenUsers = new Set<string>();
    onlineUsers.forEach((u) => {
      if (u.id === currentUser?.id) return;
      const key = u.username.toLowerCase();
      if (seenUsers.has(key)) return;
      seenUsers.add(key);
      items.push({
        id: `usr-${u.id}`,
        category: 'user',
        title: `@${u.username}`,
        subtitle: u.statusMessage || 'Direkt Mesaj Gönder',
        keywords: `${u.username} dm mesaj`,
        icon: (
          <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10">
            <AvatarView avatar={u.avatar} alt={u.username} fallback="👤" className="w-full h-full object-cover" />
          </div>
        ),
        onSelect: () => {
          openDirectMessage(u);
          onClose();
        },
      });
    });

    // 4. Quick actions
    items.push(
      {
        id: 'act-dm',
        category: 'action',
        title: 'Direkt Mesajlar',
        subtitle: 'Özel sohbetlere ve arkadaşlara git',
        keywords: 'dm direkt mesaj arkadas',
        icon: <MessageCircle className="w-4 h-4 text-teal-400" />,
        onSelect: () => {
          selectServer('direct-messages');
          onClose();
        },
      },
      {
        id: 'act-mute',
        category: 'action',
        title: isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat (Sustur)',
        subtitle: 'Ses girişini hızlıca değiştir',
        keywords: 'mikrofon mute sustur ses',
        shortcut: 'Ctrl + M',
        icon: isMuted ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4 text-rose-400" />,
        onSelect: () => {
          toggleMute();
          onClose();
        },
      },
      {
        id: 'act-deafen',
        category: 'action',
        title: isDeafened ? 'Sağırlaştırmayı Kapat' : 'Sağırlaştır (Sesi Kapat)',
        subtitle: 'Gelen sesleri hızlıca aç/kapat',
        keywords: 'sagir deafen kulaklik',
        shortcut: 'Ctrl + D',
        icon: <Headphones className="w-4 h-4 text-sky-400" />,
        onSelect: () => {
          toggleDeafen();
          onClose();
        },
      },
      ...(connectedVoiceChannelId
        ? [
            {
              id: 'act-leave-voice',
              category: 'action' as const,
              title: 'Ses Odasından Ayrıl',
              subtitle: 'Aktif ses bağlantısını sonlandır',
              keywords: 'ayril cik ses disconnect',
              icon: <PhoneOff className="w-4 h-4 text-rose-400" />,
              onSelect: () => {
                leaveVoiceChannel();
                onClose();
              },
            },
          ]
        : []),
      {
        id: 'act-diagnostics',
        category: 'action',
        title: 'Bağlantı Teşhisi & Ping',
        subtitle: 'Gecikme, jitter ve paket kaybı durumu',
        keywords: 'ping teshis baglanti network',
        icon: <Activity className="w-4 h-4 text-emerald-400" />,
        onSelect: () => {
          setIsDiagnosticsOpen(true);
          onClose();
        },
      },
      {
        id: 'act-settings',
        category: 'action',
        title: 'Kullanıcı & Ses Ayarları',
        subtitle: 'Mikrofon, kamera, tema ve güvenlik ayarları',
        keywords: 'ayarlar settings profil ses',
        icon: <Settings className="w-4 h-4 text-white/75" />,
        onSelect: () => {
          onOpenSettings();
          onClose();
        },
      },
      {
        id: 'act-shortcuts',
        category: 'action',
        title: 'Klavye Kısayolları',
        subtitle: 'Tüm hızlı tuşları ve ipuçlarını gör',
        keywords: 'kisayol klavye shortcut yardim',
        shortcut: 'Ctrl + /',
        icon: <Keyboard className="w-4 h-4 text-indigo-400" />,
        onSelect: () => {
          onOpenShortcuts();
          onClose();
        },
      }
    );

    return items;
  }, [
    servers,
    onlineUsers,
    currentUser?.id,
    connectedVoiceChannelId,
    isMuted,
    isDeafened,
    selectServer,
    selectChannel,
    joinVoiceChannel,
    leaveVoiceChannel,
    openDirectMessage,
    toggleMute,
    toggleDeafen,
    setIsDiagnosticsOpen,
    onOpenSettings,
    onOpenShortcuts,
    onClose,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 14);
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q)
      )
      .slice(0, 16);
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].onSelect();
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9998] bg-black/65 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl rounded-2xl bg-[#12141c]/95 border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden"
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nereye gitmek istersin? Kanal, sunucu, kişi veya komut ara..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-white/40">
              Eşleşen kanal, kullanıcı veya komut bulunamadı.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-500/20 to-teal-500/15 border border-amber-400/30 text-white'
                      : 'border border-transparent text-white/75 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.title}</div>
                      <div className="text-[11px] text-white/45 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <kbd className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-mono text-white/75">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 border-t border-white/[0.07] bg-black/25 flex items-center justify-between text-[10px] text-white/45">
          <div className="flex items-center gap-3">
            <span>↑↓ Gezin</span>
            <span>↵ Seç</span>
            <span>Esc Kapat</span>
          </div>
          <span>Hızlı Geçiş: Ctrl + K</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
