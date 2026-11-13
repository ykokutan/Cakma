import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { X, Globe, Plus, RotateCcw, UserPlus, Users } from 'lucide-react';
import { isImageAvatar } from './AvatarView';

interface CreateServerModalProps {
  onClose: () => void;
}

const SERVER_EMOJIS = ['🎮', '⚡', '🚀', '🔥', '🛡️', '⚔️', '👾', '🎧', '☕', '🌟'];

function extractInviteCode(rawInput: string): string {
  const raw = rawInput.trim();
  if (!raw) return '';
  try {
    if (raw.includes('invite=')) {
      const urlObj = new URL(raw.startsWith('http') ? raw : `https://dummy.local/${raw}`);
      return urlObj.searchParams.get('invite') || raw;
    }
  } catch {
    const match = raw.match(/invite=([A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }
  return raw;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ onClose }) => {
  const { createServer, connectToDedicatedServer, resetToMainServer, currentServerHost, isDedicatedServer, joinServerByInvite, previewServerInvite } = useSocket();
  const [tab, setTab] = useState<'create' | 'invite' | 'direct'>('create');
  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState('🎮');
  const [directHost, setDirectHost] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [invitePreview, setInvitePreview] = useState<{
    id: string;
    name: string;
    icon: string;
    bannerGradient?: string;
    bannerImage?: string;
    description?: string;
    memberCount: number;
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'invite') return;
    const code = extractInviteCode(inviteInput);
    if (code.length < 4) {
      setInvitePreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      const res = await previewServerInvite(code);
      setIsPreviewLoading(false);
      if (res.success && res.server) {
        setInvitePreview(res.server);
        setInviteError(null);
      } else {
        setInvitePreview(null);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [inviteInput, tab, previewServerInvite]);

  const handleJoinInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractInviteCode(inviteInput);
    if (!code) return;
    setInviteError(null);
    setIsJoiningInvite(true);
    const res = await joinServerByInvite(code);
    setIsJoiningInvite(false);
    if (res.success) {
      onClose();
    } else {
      setInviteError(res.error || 'Davet koduna katılınamadı.');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;
    createServer(serverName.trim(), serverIcon);
    onClose();
  };

  const handleConnectDirect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directHost.trim()) return;
    connectToDedicatedServer(directHost.trim());
    onClose();
  };

  const isDedicatedActive = isDedicatedServer;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-md ios-glass rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        <div className="p-6 text-center border-b border-white/[0.06] relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
          <h3 className="text-xl font-bold text-white tracking-tight mb-1">Sunucu Ekle & Bağlan</h3>
          <p className="text-xs text-white/50">
            Yeni bir topluluk açın veya bir arkadaşınızın özel IP sunucusuna bağlanın.
          </p>

          {/* Segmented Control */}
          <div className="flex bg-white/5 p-1 rounded-2xl mt-4 border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                tab === 'create'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Oluştur
            </button>
            <button
              type="button"
              onClick={() => setTab('invite')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                tab === 'invite'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Davet Kodu
            </button>
            <button
              type="button"
              onClick={() => setTab('direct')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                tab === 'direct'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Özel IP
            </button>
          </div>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="p-6 space-y-5">
            <div className="text-center">
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                Sunucu Simgesi
              </label>
              <div className="flex flex-wrap justify-center gap-2">
                {SERVER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setServerIcon(emoji)}
                    className={`w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-xl transition hover:scale-105 border ${
                      serverIcon === emoji ? 'border-blue-400 bg-blue-500/20' : 'border-white/5'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                Sunucu Adı
              </label>
              <input
                type="text"
                required
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Örn: Valorant Tayfası"
                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-white/60 hover:text-white transition"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={!serverName.trim()}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-full transition shadow-md shadow-blue-500/25 disabled:opacity-40"
              >
                Oluştur
              </button>
            </div>
          </form>
        ) : tab === 'invite' ? (
          <form onSubmit={handleJoinInvite} className="p-6 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                Davet Bağlantısı veya Kodu
              </label>
              <input
                type="text"
                required
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="Örn: A1B2C3D4 veya https://...?invite=A1B2C3D4"
                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <span className="text-[11px] text-white/40 mt-1 block">
                Arkadaşınızın paylaştığı sunucu davet linkini veya kodunu girerek topluluğa katılın.
              </span>
            </div>

            {isPreviewLoading && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/50">
                Sunucu önizlemesi yükleniyor...
              </div>
            )}

            {invitePreview && !isPreviewLoading && (
              <div className="rounded-2xl overflow-hidden border border-white/15 bg-white/[0.04] shadow-xl">
                <div className="relative h-24 w-full overflow-hidden">
                  {invitePreview.bannerImage ? (
                    <img src={invitePreview.bannerImage} alt={invitePreview.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${invitePreview.bannerGradient || 'from-blue-600/40 via-indigo-600/30 to-purple-600/40'}`} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                </div>
                <div className="p-3.5 -mt-8 relative flex items-end gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#16171d] border-2 border-white/20 overflow-hidden flex items-center justify-center shrink-0 shadow-lg">
                    {isImageAvatar(invitePreview.icon) ? (
                      <img src={invitePreview.icon} alt={invitePreview.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{invitePreview.icon || '💬'}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{invitePreview.name}</p>
                    <p className="text-[11px] text-white/60 flex items-center gap-1">
                      <Users className="w-3 h-3 text-emerald-400" />
                      {invitePreview.memberCount} üye
                    </p>
                  </div>
                </div>
                {invitePreview.description && (
                  <p className="px-3.5 pb-3 text-[11px] text-white/55 line-clamp-2">
                    {invitePreview.description}
                  </p>
                )}
              </div>
            )}

            {inviteError && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
                {inviteError}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-white/60 hover:text-white transition"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={!inviteInput.trim() || isJoiningInvite}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-full transition shadow-md shadow-indigo-500/25 disabled:opacity-40 flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {isJoiningInvite ? 'Katılınıyor...' : 'Sunucuya Katıl'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConnectDirect} className="p-6 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                Sunucu IP Adresi veya Hostname
              </label>
              <input
                type="text"
                required
                value={directHost}
                onChange={(e) => setDirectHost(e.target.value)}
                placeholder="Örn: localhost:4001 veya 185.12.34.56:4001"
                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
              <span className="text-[11px] text-white/40 mt-1 block">
                TeamSpeak tarzı kendi VPS sunucusunda server açan arkadaşlarınızın IP ve Portunu buraya yazarak bağlanabilirsiniz.
              </span>
            </div>

            {isDedicatedActive && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
                <span>Şu an özel sunucudasınız: <b>{currentServerHost}</b></span>
                <button
                  type="button"
                  onClick={() => resetToMainServer()}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-bold text-[10px] flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Ana Sunucuya Dön
                </button>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-white/60 hover:text-white transition"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={!directHost.trim()}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-full transition shadow-md shadow-emerald-500/25 disabled:opacity-40 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                Doğrudan Bağlan
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
