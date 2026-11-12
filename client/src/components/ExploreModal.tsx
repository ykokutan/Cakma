import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import {
  X,
  Compass,
  Server,
  Users,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Gamepad2,
  ShieldCheck,
  Terminal,
  Globe,
  Headphones,
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
}

export const ExploreModal: React.FC<ExploreModalProps> = ({ isOpen, onClose }) => {
  const { socket, connectToDedicatedServer, currentServerHost, isDedicatedServer, resetToMainServer } = useSocket();
  const [activeTab, setActiveTab] = useState<'servers' | 'guide'>('servers');
  const [serversList, setServersList] = useState<PublicDedicatedServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [manualHost, setManualHost] = useState('');

  const fetchServers = () => {
    if (!socket) return;
    setIsLoading(true);
    socket.emit('get_public_dedicated_servers');
    setTimeout(() => setIsLoading(false), 600);
  };

  useEffect(() => {
    if (!isOpen || !socket) return;

    const handleList = (list: PublicDedicatedServer[]) => {
      setServersList(list || []);
      setIsLoading(false);
    };

    socket.on('public_dedicated_servers_list', handleList);
    fetchServers();

    return () => {
      socket.off('public_dedicated_servers_list', handleList);
    };
  }, [isOpen, socket]);

  if (!isOpen) return null;

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-3xl overflow-hidden ios-glass shadow-2xl border border-white/15 text-white flex flex-col max-h-[86vh] animate-slide-up"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Compass className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">Keşfet & Rehber</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {serversList.length} Çevrimiçi Sunucu
                </span>
              </div>
              <p className="text-xs text-white/50">
                Aktif Dedicated ses sunucularına bağlanın veya platform ipuçlarını inceleyin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {isDedicatedServer && (
              <button
                onClick={resetToMainServer}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 text-xs font-bold transition"
              >
                Ana Sunucuya Dön
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 pb-2 border-b border-white/[0.06] flex items-center gap-2 bg-black/20">
          <button
            onClick={() => setActiveTab('servers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'servers'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Çevrimiçi Dedicated Sunucular</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'guide'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kullanım İpuçları & Kısayollar</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'servers' ? (
            <>
              {/* Direct Connect Bar */}
              <form
                onSubmit={handleManualConnect}
                className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <div className="flex items-center gap-2 flex-1 px-2">
                  <Server className="w-4 h-4 text-blue-400 shrink-0" />
                  <input
                    type="text"
                    value={manualHost}
                    onChange={(e) => setManualHost(e.target.value)}
                    placeholder="Özel Sunucu Adresi girin (örn: 45.133.36.190:4001)"
                    className="w-full bg-transparent text-xs text-white placeholder-white/40 outline-none font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
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
                    onClick={fetchServers}
                    className={`p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition ${
                      isLoading ? 'animate-spin' : ''
                    }`}
                    title="Sunucu Listesini Yenile"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {/* Online Dedicated Servers Grid */}
              {serversList.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
                    <Server className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white/90">Şu anda aktif harici Dedicated sunucu yok</h3>
                    <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">
                      Şu an ana topluluk sunucusu (<span className="text-blue-300 font-mono">{currentServerHost}</span>) üzerindesiniz.
                      Lisans Mağazası'ndan lisans edinip kendi bağımsız sunucunuzu başlattığınızda burada otomatik olarak listelenir.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {serversList.map((srv) => {
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
                              <div className="text-[11px] text-white/45 font-mono truncate mt-0.5">
                                {srv.host}
                              </div>
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
            </>
          ) : (
            /* Usage Tips & Guide Tab */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Headphones className="w-4 h-4" />
                  <span>Ses Odaları & TeamSpeak Özellikleri</span>
                </div>
                <ul className="space-y-1.5 text-xs text-white/70 leading-relaxed">
                  <li>• <b>Bas-Konuş (PTT):</b> Sol alt Ayarlar'dan ses algılama veya özel PTT tuşu atayabilirsiniz.</li>
                  <li>• <b>3D Uzamsal Ses & Soundboard:</b> Ses odasına girdiğinizde üst menüden efekt çalabilir veya 3D ses yönü ayarlayabilirsiniz.</li>
                  <li>• <b>Şifreli Odalar:</b> Kanal oluştururken kilit ekleyerek yalnızca şifreyi bilenlerin girmesini sağlayabilirsiniz.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <Terminal className="w-4 h-4" />
                  <span>Sohbet Komutları & Biçimlendirme</span>
                </div>
                <ul className="space-y-1.5 text-xs text-white/70 leading-relaxed">
                  <li>• <b>Eğlence Komutları:</b> Sohbete <code className="text-blue-300">/zar</code>, <code className="text-blue-300">/yazitura</code>, <code className="text-blue-300">/8ball soru</code>, <code className="text-blue-300">/rank</code> veya <code className="text-blue-300">/liderlik</code> yazabilirsiniz.</li>
                  <li>• <b>Markdown:</b> <code className="text-amber-300">**kalın**</code>, <code className="text-amber-300">||spoiler||</code>, <code className="text-amber-300">~~üstü çizili~~</code> ve <code className="text-amber-300">```kod```</code> desteklenir.</li>
                  <li>• <b>Yanıtla & Kopyala:</b> Mesajın üzerine gelerek alıntıyla yanıtlayabilir veya tek tıkla kopyalayabilirsiniz.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <Gamepad2 className="w-4 h-4" />
                  <span>Birlikte İzle, Tahta & Mini Oyunlar</span>
                </div>
                <ul className="space-y-1.5 text-xs text-white/70 leading-relaxed">
                  <li>• <b>YouTube Sineması:</b> Ses odasındayken arkadaşlarınızla senkronize video izleyebilirsiniz.</li>
                  <li>• <b>Ortak Beyaz Tahta:</b> Ses odasındaki herkesle aynı anda çizim yapıp not alabilirsiniz.</li>
                  <li>• <b>Mini Oyunlar & Anket:</b> Üst araç çubuğundan XOX, Hızlı Yazma (TypeRacer) veya anket başlatabilirsiniz.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Özel Sunucu (Dedicated) & Güvenlik</span>
                </div>
                <ul className="space-y-1.5 text-xs text-white/70 leading-relaxed">
                  <li>• <b>Lisans Mağazası:</b> Sol menüden kendi slot kapasitenize özel bağımsız sunucu lisansı alabilirsiniz.</li>
                  <li>• <b>Sesli Mesaj & Medya:</b> Mikrofon simgesine basılıp sesli mesaj kaydedebilir, sürükle-bırakla dosya yükleyebilirsiniz.</li>
                  <li>• <b>Bağlantı Teşhisi:</b> Sol alttaki yeşil ping göstergesine tıklayıp anlık ağ kalitenizi ölçebilirsiniz.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
