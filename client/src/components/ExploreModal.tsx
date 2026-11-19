import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { isImageAvatar } from './AvatarView';
import type { DiscoverableServerSummary, ServerCategory } from '../types';
import {
  ExploreSortMode,
  SERVER_CATEGORY_LABELS,
  extractInviteCodeFromInput,
  filterAndSortDiscoverableServers,
} from '../utils/exploreHelpers';
import {
  ArrowRight,
  Check,
  Compass,
  Gamepad2,
  Hash,
  Headphones,
  Keyboard,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server as ServerIcon,
  ShieldCheck,
  Sparkles,
  Terminal,
  Ticket,
  Users,
  Video,
  Volume2,
  X,
  Globe,
} from 'lucide-react';

interface PublicDedicatedServer {
  id: string;
  serverName: string;
  host: string;
  port: number;
  onlineCount: number;
  maxSlots: number;
  tier: string;
  status: string;
}

interface ExploreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateServer?: () => void;
}

type GuideTopic = 'all' | 'start' | 'voice' | 'chat' | 'shortcuts' | 'security';

const CATEGORY_GRADIENTS: Record<ServerCategory, string> = {
  gaming: 'from-violet-600/80 via-fuchsia-600/60 to-rose-600/70',
  community: 'from-emerald-600/80 via-teal-600/60 to-cyan-600/70',
  tech: 'from-blue-600/80 via-indigo-600/60 to-cyan-600/70',
  music: 'from-pink-600/80 via-rose-500/60 to-amber-500/70',
  education: 'from-amber-500/80 via-orange-600/60 to-yellow-600/70',
  other: 'from-slate-600/80 via-zinc-700/60 to-slate-800/80',
};

const GUIDE_CARDS: Array<{
  id: string;
  topic: Exclude<GuideTopic, 'all' | 'shortcuts'>;
  title: string;
  accentClass: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  items: Array<{ title: string; detail: string }>;
}> = [
  {
    id: 'voice-sfu',
    topic: 'voice',
    title: 'Ses Odaları, LiveKit SFU & Stüdyo DSP',
    accentClass: 'text-emerald-400',
    icon: Headphones,
    keywords: 'ses p2p livekit sfu eq audioworklet gürültü ptt bas konuş bitrate spatial 3d',
    items: [
      {
        title: 'Hibrit P2P Mesh & LiveKit SFU',
        detail: 'Küçük odalar düşük gecikmeli P2P üzerinden, kalabalık odalar otomatik LiveKit SFU üzerinden aktarılır.',
      },
      {
        title: '48kHz AudioWorklet & Kişisel EQ',
        detail: 'Spektral gürültü temizleyici ile arka plan seslerini kesin; her kullanıcıya %0–%200 ses, Bas/Tiz EQ ve çıktı cihazı atayın.',
      },
      {
        title: 'Oyun İçi Global Bas-Konuş (PTT)',
        detail: 'Ayarlar → Ses bölümünden oyun içindeyken bile çalışan global PTT tuşu tanımlayabilirsiniz.',
      },
    ],
  },
  {
    id: 'stream-video',
    topic: 'voice',
    title: 'HD Ekran Yayını, Kamera & Spotlight',
    accentClass: 'text-cyan-400',
    icon: Video,
    keywords: 'ekran paylaşımı yayın wasapi pencere sesi pip kamera bulanıklaştırma spotlight sinema youtube tahta',
    items: [
      {
        title: 'WASAPI Pencere Sesi & Mini PiP',
        detail: 'Yalnızca seçili oyun/uygulama sesini yayınlayın; izleyici tarafında Oto/Kaynak/1080p/720p kalite ve yüzen PiP kullanın.',
      },
      {
        title: 'Spotlight & Kamera Bulanıklaştırma',
        detail: 'Aktif konuşanı büyüten Spotlight düzenini açın ve kameranızda gerçek zamanlı arka plan bulanıklaştırma kullanın.',
      },
      {
        title: 'Ortak Aktiviteler',
        detail: 'Ses odasındayken YouTube Sineması, Ortak Beyaz Tahta, XOX ve TypeRacer mini oyunlarını başlatın.',
      },
    ],
  },
  {
    id: 'chat-commands',
    topic: 'chat',
    title: 'Sohbet Komutları, Taslaklar & Medya',
    accentClass: 'text-blue-400',
    icon: Terminal,
    keywords: 'sohbet komut slash zar yazı tura anket hatırlat temizle davet markdown spoiler gif lightbox taslak düzenle',
    items: [
      {
        title: 'Slash Komutları & Markdown',
        detail: '/zar, /yazitura, /anket, /hatirlat, /temizle, /davet ve **kalın**, ||spoiler||, ~~üstü çizili~~, ```kod``` desteklenir.',
      },
      {
        title: 'Taslak Kaydı & ↑ Hızlı Düzenleme',
        detail: 'Yarım bıraktığınız mesajlar kanal bazlı saklanır; boş kutuda ↑ tuşuna basarak son mesajınızı anında düzenleyin.',
      },
      {
        title: 'Lightbox Galeri & WebP Sıkıştırma',
        detail: 'Görsellere tıklayarak yakınlaştırma ve galeri gezintisi açın; büyük görseller otomatik hafif WebP ile yüklenir.',
      },
    ],
  },
  {
    id: 'security-desktop',
    topic: 'security',
    title: 'Güvenlik, Masaüstü & Özelleştirme',
    accentClass: 'text-amber-400',
    icon: ShieldCheck,
    keywords: '2fa e2ee şifreleme oturum tema özel tema overlay tauri masaüstü ping teşhis cakma davet link',
    items: [
      {
        title: '2FA (TOTP), E2EE DM & Oturum Kontrolü',
        detail: 'Ayarlar → Gizlilik & Güvenlikten iki adımlı doğrulamayı açın ve bağlı tüm cihaz oturumlarını tek tıkla yönetin.',
      },
      {
        title: '12 Tema + Özel Tema & Çoklu Dil',
        detail: '8 koyu ve 4 açık tema arasında geçiş yapın veya Özel Tema Oluşturucu ile kendi paletinizi tasarlayın (TR/EN/DE/RU).',
      },
      {
        title: 'Cam Overlay, Tepsi & Derin Bağlantı',
        detail: 'Oyun içi şeffaf Konuşanlar Overlay penceresini kullanın; cakma://invite/... bağlantılarıyla doğrudan sunucuya katılın.',
      },
    ],
  },
];

const SHORTCUT_ITEMS: Array<{ keys: string; desc: string }> = [
  { keys: 'Ctrl + K', desc: 'Hızlı Geçiş (Sunucu, Kanal, DM)' },
  { keys: 'Ctrl + /', desc: 'Tüm Klavye Kısayollarını Göster' },
  { keys: 'Ctrl + M', desc: 'Mikrofonu Aç / Kapat' },
  { keys: 'Ctrl + D', desc: 'Kulaklığı Sağırlaştır / Aç' },
  { keys: 'Ctrl + Shift + M', desc: 'Global Mikrofon Susturma (Oyun İçi)' },
  { keys: 'Ctrl + Shift + D', desc: 'Global Sağırlaştırma (Oyun İçi)' },
  { keys: 'Ctrl + Shift + O', desc: 'Oyun İçi Overlay Kilit / Tıklama Geçişi' },
  { keys: 'Alt + ↑ / ↓', desc: 'Sonraki / Önceki Metin Kanalına Geç' },
  { keys: 'Alt + Shift + ↑ / ↓', desc: 'Okunmamış Kanallar Arasında Gez' },
  { keys: '↑ (Boş Kutu)', desc: 'Son Gönderdiğin Mesajı Hızlı Düzenle' },
];

export const ExploreModal: React.FC<ExploreModalProps> = ({ isOpen, onClose, onOpenCreateServer }) => {
  const {
    socket,
    connectToDedicatedServer,
    currentServerHost,
    isDedicatedServer,
    resetToMainServer,
    fetchDiscoverableServers,
    joinPublicServer,
    selectServer,
    previewServerInvite,
    joinServerByInvite,
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'communities' | 'dedicated' | 'guide'>('communities');

  // Community discovery state
  const [publicServers, setPublicServers] = useState<DiscoverableServerSummary[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [communitySearch, setCommunitySearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ServerCategory>('all');
  const [sortMode, setSortMode] = useState<ExploreSortMode>('popular');
  const [onlyUnjoined, setOnlyUnjoined] = useState(false);
  const [joiningServerId, setJoiningServerId] = useState<string | null>(null);
  const [joinFeedback, setJoinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Quick invite bar state
  const [showInviteBar, setShowInviteBar] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<{
    id: string;
    name: string;
    icon: string;
    bannerGradient?: string;
    bannerImage?: string;
    description?: string;
    memberCount: number;
  } | null>(null);

  // Dedicated discovery state
  const [dedicatedServers, setDedicatedServers] = useState<PublicDedicatedServer[]>([]);
  const [loadingDedicated, setLoadingDedicated] = useState(false);
  const [manualHost, setManualHost] = useState('');
  const [dedicatedSearch, setDedicatedSearch] = useState('');

  // Guide state
  const [guideSearch, setGuideSearch] = useState('');
  const [guideTopic, setGuideTopic] = useState<GuideTopic>('all');

  const refreshCommunities = async () => {
    setLoadingPublic(true);
    const list = await fetchDiscoverableServers();
    setPublicServers(list);
    setLoadingPublic(false);
  };

  const refreshDedicated = () => {
    if (!socket) return;
    setLoadingDedicated(true);
    socket.emit('get_public_dedicated_servers');
    setTimeout(() => setLoadingDedicated(false), 600);
  };

  useEffect(() => {
    if (!isOpen || !socket) return;

    const handleDedicatedList = (list: PublicDedicatedServer[]) => {
      setDedicatedServers(list || []);
      setLoadingDedicated(false);
    };

    const handleDiscoverableList = (list: DiscoverableServerSummary[]) => {
      if (Array.isArray(list)) {
        setPublicServers(list);
        setLoadingPublic(false);
      }
    };

    socket.on('public_dedicated_servers_list', handleDedicatedList);
    socket.on('discoverable_servers_list', handleDiscoverableList);

    refreshCommunities();
    refreshDedicated();

    return () => {
      socket.off('public_dedicated_servers_list', handleDedicatedList);
      socket.off('discoverable_servers_list', handleDiscoverableList);
    };
  }, [isOpen, socket]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!showInviteBar) return;
    const code = extractInviteCodeFromInput(inviteInput);
    if (code.length < 4) {
      setInvitePreview(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await previewServerInvite(code);
      if (res.success && res.server) {
        setInvitePreview(res.server);
        setInviteError(null);
      } else {
        setInvitePreview(null);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [inviteInput, showInviteBar, previewServerInvite]);

  const filteredPublicServers = useMemo(
    () =>
      filterAndSortDiscoverableServers(publicServers, {
        query: communitySearch,
        category: selectedCategory,
        onlyUnjoined,
        sort: sortMode,
      }),
    [publicServers, communitySearch, selectedCategory, onlyUnjoined, sortMode]
  );

  const filteredDedicated = useMemo(() => {
    const q = dedicatedSearch.trim().toLowerCase();
    if (!q) return dedicatedServers;
    return dedicatedServers.filter(
      (s) => s.serverName.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.tier.toLowerCase().includes(q)
    );
  }, [dedicatedServers, dedicatedSearch]);

  const filteredGuideCards = useMemo(() => {
    const q = guideSearch.trim().toLowerCase();
    return GUIDE_CARDS.filter((card) => {
      if (guideTopic !== 'all' && card.topic !== guideTopic) return false;
      if (!q) return true;
      return (
        card.title.toLowerCase().includes(q) ||
        card.keywords.toLowerCase().includes(q) ||
        card.items.some((it) => it.title.toLowerCase().includes(q) || it.detail.toLowerCase().includes(q))
      );
    });
  }, [guideSearch, guideTopic]);

  const filteredShortcuts = useMemo(() => {
    const q = guideSearch.trim().toLowerCase();
    if (guideTopic !== 'all' && guideTopic !== 'shortcuts') return [];
    if (!q) return SHORTCUT_ITEMS;
    return SHORTCUT_ITEMS.filter(
      (s) => s.keys.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)
    );
  }, [guideSearch, guideTopic]);

  const totalOnlineInPublic = useMemo(
    () => publicServers.reduce((acc, s) => acc + (s.onlineCount || 0), 0),
    [publicServers]
  );
  const totalVoiceInPublic = useMemo(
    () => publicServers.reduce((acc, s) => acc + (s.voiceActiveCount || 0), 0),
    [publicServers]
  );

  if (!isOpen) return null;

  const handleJoinServer = async (srv: DiscoverableServerSummary) => {
    setJoiningServerId(srv.id);
    setJoinFeedback(null);
    const res = await joinPublicServer(srv.id);
    setJoiningServerId(null);
    if (res.success) {
      setPublicServers((prev) =>
        prev.map((item) =>
          item.id === srv.id
            ? {
                ...item,
                isJoined: true,
                memberCount: item.isJoined ? item.memberCount : item.memberCount + 1,
                onlineCount: item.isJoined ? item.onlineCount : item.onlineCount + 1,
              }
            : item
        )
      );
      setJoinFeedback({
        type: 'success',
        message: `"${srv.name}" sunucusuna katıldın! Hemen geçebilir veya keşfetmeye devam edebilirsin.`,
      });
    } else {
      setJoinFeedback({
        type: 'error',
        message: res.error || 'Sunucuya katılınamadı.',
      });
    }
  };

  const handleJoinViaInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractInviteCodeFromInput(inviteInput);
    if (!code) return;
    setInviteError(null);
    setInviteLoading(true);
    const res = await joinServerByInvite(code);
    setInviteLoading(false);
    if (res.success) {
      setInviteInput('');
      setInvitePreview(null);
      setShowInviteBar(false);
      onClose();
    } else {
      setInviteError(res.error || 'Davet koduna katılınamadı.');
    }
  };

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualHost.trim()) return;
    connectToDedicatedServer(manualHost.trim());
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'Enterprise':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Pro':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xl animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl rounded-3xl overflow-hidden ios-glass shadow-2xl border border-white/15 text-white flex flex-col max-h-[90dvh] animate-slide-up bg-[#0e1018]/95"
      >
        {/* Hero Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-indigo-500/10">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
              <Compass className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight">Sunucuları Keşfet &amp; Rehber</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {publicServers.length} Açık Topluluk
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/75 text-[10px] font-semibold border border-white/10">
                  🟢 {totalOnlineInPublic} Çevrimiçi
                </span>
                {totalVoiceInPublic > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-semibold border border-cyan-500/30">
                    🎙️ {totalVoiceInPublic} Seste
                  </span>
                )}
              </div>
              <p className="text-xs text-white/55 mt-1">
                İstediğiniz topluluklara kendi tercihinizle katılın, özel sunuculara bağlanın veya platform rehberini inceleyin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
            <button
              type="button"
              onClick={() => setShowInviteBar((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${
                showInviteBar
                  ? 'bg-indigo-500 text-white border-indigo-400'
                  : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/85'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              Davet Kodu
            </button>

            {onOpenCreateServer && (
              <button
                type="button"
                onClick={onOpenCreateServer}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Sunucu Oluştur
              </button>
            )}

            {isDedicatedServer && (
              <button
                type="button"
                onClick={resetToMainServer}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 text-xs font-bold transition"
              >
                Ana Sunucuya Dön
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Invite Code Join Bar */}
        {showInviteBar && (
          <form
            onSubmit={handleJoinViaInvite}
            className="px-5 sm:px-6 py-3 bg-indigo-500/10 border-b border-indigo-400/25 space-y-2.5 animate-fade-in"
          >
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/15">
                <Ticket className="w-4 h-4 text-indigo-300 shrink-0" />
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Davet kodu veya bağlantısı (örn: ABC123, https://...?invite=ABC123, cakma://invite/ABC123)"
                  className="w-full bg-transparent text-xs text-white placeholder-white/40 outline-none font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={!extractInviteCodeFromInput(inviteInput) || inviteLoading}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-bold transition shrink-0"
              >
                {inviteLoading ? 'Katılıyor...' : 'Davetle Katıl'}
              </button>
            </div>

            {invitePreview && (
              <div className="p-2.5 rounded-xl bg-black/35 border border-indigo-400/30 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {isImageAvatar(invitePreview.icon) ? (
                      <img src={invitePreview.icon} alt={invitePreview.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{invitePreview.icon || '🎮'}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{invitePreview.name}</div>
                    <div className="text-[11px] text-white/55 truncate">
                      {invitePreview.memberCount} üye {invitePreview.description ? `• ${invitePreview.description}` : ''}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
                  Geçerli Davet
                </span>
              </div>
            )}

            {inviteError && <div className="text-xs text-rose-300">{inviteError}</div>}
          </form>
        )}

        {/* Navigation Tabs */}
        <div className="px-5 sm:px-6 pt-3 pb-2.5 border-b border-white/[0.06] flex flex-wrap items-center gap-2 bg-black/25">
          <button
            type="button"
            onClick={() => setActiveTab('communities')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'communities'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25'
                : 'text-white/65 hover:text-white hover:bg-white/5'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Topluluk Sunucuları ({publicServers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dedicated')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'dedicated'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'text-white/65 hover:text-white hover:bg-white/5'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Dedicated Sunucular ({dedicatedServers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'guide'
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/25'
                : 'text-white/65 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Platform Rehberi &amp; Kısayollar</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {joinFeedback && (
            <div
              className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in ${
                joinFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
              }`}
            >
              <span>{joinFeedback.message}</span>
              <button
                type="button"
                onClick={() => setJoinFeedback(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: PUBLIC COMMUNITY SERVERS */}
          {activeTab === 'communities' && (
            <div className="space-y-4">
              {/* Filters Toolbar */}
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={communitySearch}
                      onChange={(e) => setCommunitySearch(e.target.value)}
                      placeholder="Sunucu adı, açıklama, etiket veya kanal ara..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/35 outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as ExploreSortMode)}
                      className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-emerald-400"
                      title="Sıralama"
                    >
                      <option value="popular">Popüler (Üye Sayısı)</option>
                      <option value="online">En Aktif (Çevrimiçi)</option>
                      <option value="voice">Seste Aktiflik</option>
                      <option value="name">Alfabetik (A-Z)</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setOnlyUnjoined((v) => !v)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                        onlyUnjoined
                          ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                      }`}
                    >
                      Sadece Katılmadıklarım
                    </button>

                    <button
                      type="button"
                      onClick={refreshCommunities}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition"
                      title="Listeyi Yenile"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingPublic ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                      selectedCategory === 'all'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                    }`}
                  >
                    Tümü
                  </button>
                  {(Object.keys(SERVER_CATEGORY_LABELS) as ServerCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                        selectedCategory === cat
                          ? 'bg-emerald-500 text-black border-emerald-400'
                          : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                      }`}
                    >
                      {SERVER_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discovery Cards Grid */}
              {loadingPublic && publicServers.length === 0 ? (
                <div className="py-12 text-center text-xs text-white/45">Sunucular yükleniyor...</div>
              ) : filteredPublicServers.length === 0 ? (
                <div className="p-10 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold text-white/90">Aramanızla eşleşen açık sunucu bulunamadı</div>
                  <p className="text-xs text-white/50 max-w-md mx-auto">
                    Filtreleri temizleyebilir, bir davet kodu kullanabilir veya kendi topluluğunuzu kurabilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredPublicServers.map((srv) => {
                    const bannerClass = srv.bannerGradient || CATEGORY_GRADIENTS[srv.category || 'community'];
                    const isJoining = joiningServerId === srv.id;

                    return (
                      <div
                        key={srv.id}
                        className="rounded-2xl ios-glass-card border border-white/10 hover:border-white/25 overflow-hidden flex flex-col justify-between transition shadow-lg group"
                      >
                        <div>
                          {/* Card Banner */}
                          <div className="relative h-24 overflow-hidden bg-[#141720]">
                            {srv.bannerImage ? (
                              <img
                                src={srv.bannerImage}
                                alt={srv.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                              />
                            ) : (
                              <div className={`w-full h-full bg-gradient-to-br ${bannerClass}`} />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                            {/* Top-right category & bitrate badges */}
                            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-semibold text-white/90">
                                {SERVER_CATEGORY_LABELS[srv.category || 'community']}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-mono text-cyan-300">
                                {srv.bitrateKbps} kbps
                              </span>
                            </div>

                            {/* Floating Icon + Title */}
                            <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end gap-3">
                              <div className="w-11 h-11 rounded-2xl bg-[#11131b] border border-white/20 overflow-hidden flex items-center justify-center text-xl shadow-lg shrink-0">
                                {isImageAvatar(srv.icon) ? (
                                  <img src={srv.icon} alt={srv.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{srv.icon || '💬'}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-sm font-bold text-white truncate">{srv.name}</h4>
                                  {srv.isJoined && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-[9px] font-bold shrink-0">
                                      ÜYESİN
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-4 space-y-3">
                            <p className="text-xs text-white/65 line-clamp-2 min-h-[2rem]">
                              {srv.description || 'Bu topluluk için henüz bir açıklama eklenmemiş.'}
                            </p>

                            {/* Tags */}
                            {srv.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {srv.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[10px] text-white/75"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Channel Preview Chips */}
                            {srv.channelPreview.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {srv.channelPreview.map((ch) => (
                                  <span
                                    key={ch.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/35 border border-white/5 text-[10px] text-white/60"
                                  >
                                    {ch.type === 'voice' ? (
                                      <Volume2 className="w-2.5 h-2.5 text-emerald-400" />
                                    ) : (
                                      <Hash className="w-2.5 h-2.5 text-blue-400" />
                                    )}
                                    <span className="truncate max-w-[110px]">{ch.name}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer Stats + Join Action */}
                        <div className="px-4 py-3 border-t border-white/[0.07] bg-black/25 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 text-[11px] text-white/60">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              <b className="text-white">{srv.onlineCount}</b> Çevrimiçi
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-white/45" />
                              <b className="text-white">{srv.memberCount}</b> Üye
                            </span>
                            {srv.voiceActiveCount > 0 && (
                              <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                                <Radio className="w-3 h-3 animate-pulse" />
                                {srv.voiceActiveCount} Seste
                              </span>
                            )}
                          </div>

                          {srv.isJoined ? (
                            <button
                              type="button"
                              onClick={() => {
                                selectServer(srv.id);
                                onClose();
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition shrink-0"
                            >
                              <span>Sunucuya Git</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isJoining}
                              onClick={() => handleJoinServer(srv)}
                              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition shrink-0"
                            >
                              {isJoining ? (
                                <span>Katılıyor...</span>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Sunucuya Katıl</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DEDICATED SERVERS */}
          {activeTab === 'dedicated' && (
            <div className="space-y-4">
              <form
                onSubmit={handleManualConnect}
                className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <div className="flex items-center gap-2 flex-1 px-2">
                  <ServerIcon className="w-4 h-4 text-blue-400 shrink-0" />
                  <input
                    type="text"
                    value={manualHost}
                    onChange={(e) => setManualHost(e.target.value)}
                    placeholder="Özel Sunucu Adresi girin (örn: 45.133.36.190:4001)"
                    className="w-full bg-transparent text-xs text-white placeholder-white/40 outline-none font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3 h-3 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={dedicatedSearch}
                      onChange={(e) => setDedicatedSearch(e.target.value)}
                      placeholder="Listede filtrele..."
                      className="pl-7 pr-2.5 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder:text-white/35 outline-none w-36"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!manualHost.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <span>Bağlan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={refreshDedicated}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition"
                    title="Dedicated Sunucu Listesini Yenile"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingDedicated ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </form>

              {filteredDedicated.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
                    <ServerIcon className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white/90">Şu anda aktif harici Dedicated sunucu yok</h3>
                    <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">
                      Şu an ana sunucu (<span className="text-blue-300 font-mono">{currentServerHost}</span>) üzerindesiniz.
                      Lisans Mağazası&apos;ndan lisans edinip kendi bağımsız sunucunuzu başlattığınızda burada listelenir.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredDedicated.map((srv) => {
                    const pct = Math.min(100, Math.round((srv.onlineCount / Math.max(1, srv.maxSlots)) * 100));
                    const isCurrent = currentServerHost === srv.host;
                    return (
                      <div
                        key={srv.id}
                        className="p-4 rounded-2xl ios-glass-card border border-white/10 flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                <h4 className="text-sm font-bold text-white truncate">{srv.serverName}</h4>
                              </div>
                              <div className="text-[11px] text-white/45 font-mono truncate mt-0.5">{srv.host}</div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getTierBadge(
                                srv.tier
                              )}`}
                            >
                              {srv.tier}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-white/60">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3 text-emerald-400" />
                                Doluluk
                              </span>
                              <span className="font-mono font-bold text-white/80">
                                {srv.onlineCount} / {srv.maxSlots} Slot
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all"
                                style={{ width: `${Math.max(4, pct)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => connectToDedicatedServer(srv.host)}
                          disabled={isCurrent}
                          className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                            isCurrent
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                              : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                          }`}
                        >
                          {isCurrent ? (
                            <span>Şu An Bağlısınız</span>
                          ) : (
                            <>
                              <span>Sunucuya Bağlan</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INTERACTIVE PLATFORM GUIDE & SHORTCUTS */}
          {activeTab === 'guide' && (
            <div className="space-y-5">
              {/* Guide Search & Filter Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: 'Tümü' },
                    { id: 'start', label: 'Başlangıç' },
                    { id: 'voice', label: 'Ses & Video' },
                    { id: 'chat', label: 'Sohbet & Komutlar' },
                    { id: 'shortcuts', label: 'Kısayollar' },
                    { id: 'security', label: 'Güvenlik & Masaüstü' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setGuideTopic(item.id as GuideTopic)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                        guideTopic === item.id
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={guideSearch}
                    onChange={(e) => setGuideSearch(e.target.value)}
                    placeholder="Özellik veya kısayol ara..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/35 outline-none focus:ring-1 focus:ring-amber-400 w-56"
                  />
                </div>
              </div>

              {/* 3-Step Onboarding Strip */}
              {(guideTopic === 'all' || guideTopic === 'start') && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-indigo-500/10 border border-emerald-400/25 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4" />
                      Yeni Başlayanlar İçin 3 Adımda Hızlı Başlangıç
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('communities')}
                      className="text-[11px] font-bold text-emerald-300 hover:underline flex items-center gap-1"
                    >
                      Topluluklara Git <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-1">
                      <div className="font-bold text-white">1. Sunucu Seç &amp; Katıl</div>
                      <p className="text-[11px] text-white/60 leading-relaxed">
                        Kayıt sonrası açık toplulukları incele, beğendiğin sunucuya katıl veya davet kodu gir.
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-1">
                      <div className="font-bold text-white">2. Ses &amp; PTT Ayarla</div>
                      <p className="text-[11px] text-white/60 leading-relaxed">
                        Sol alt Ayarlar&apos;dan 48kHz gürültü engellemeyi ve dilersen oyun içi Bas-Konuş tuşunu seç.
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-1">
                      <div className="font-bold text-white">3. Arkadaş Ekle &amp; Yayın Aç</div>
                      <p className="text-[11px] text-white/60 leading-relaxed">
                        Direkt Mesajlar sekmesinden arkadaşlarını ekle, 1-e-1 görüşme başlat veya HDR ekran paylaş.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Feature Cards */}
              {filteredGuideCards.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredGuideCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.id}
                        className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3"
                      >
                        <div className={`flex items-center gap-2 font-bold text-sm ${card.accentClass}`}>
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{card.title}</span>
                        </div>
                        <ul className="space-y-2 text-xs text-white/75">
                          {card.items.map((it) => (
                            <li key={it.title} className="leading-relaxed">
                              <b className="text-white">{it.title}:</b>{' '}
                              <span className="text-white/65">{it.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Keyboard Shortcuts Grid */}
              {filteredShortcuts.length > 0 && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                    <Keyboard className="w-4 h-4" />
                    <span>Klavye Kısayolları Özeti</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredShortcuts.map((sc) => (
                      <div
                        key={sc.keys}
                        className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-white/70">{sc.desc}</span>
                        <kbd className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 font-mono text-[10px] font-bold text-amber-300 shrink-0">
                          {sc.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredGuideCards.length === 0 && filteredShortcuts.length === 0 && (
                <div className="py-8 text-center text-xs text-white/40">
                  Aramanızla eşleşen rehber içeriği bulunamadı.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
