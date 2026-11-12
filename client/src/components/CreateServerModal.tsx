import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { X, Globe, Plus, RotateCcw } from 'lucide-react';

interface CreateServerModalProps {
  onClose: () => void;
}

const SERVER_EMOJIS = ['🎮', '⚡', '🚀', '🔥', '🛡️', '⚔️', '👾', '🎧', '☕', '🌟'];

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ onClose }) => {
  const { createServer, connectToDedicatedServer, currentServerHost } = useSocket();
  const [tab, setTab] = useState<'create' | 'direct'>('create');
  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState('🎮');
  const [directHost, setDirectHost] = useState('');

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

  const isDedicatedActive = currentServerHost !== 'localhost:4000';

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
          <div className="flex bg-white/5 p-1 rounded-2xl mt-4 border border-white/10">
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 ${
                tab === 'create'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Sunucu Oluştur
            </button>
            <button
              type="button"
              onClick={() => setTab('direct')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 ${
                tab === 'direct'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Özel IP ile Bağlan
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
                  onClick={() => connectToDedicatedServer('localhost:4000')}
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
