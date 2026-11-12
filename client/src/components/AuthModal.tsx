import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { LogIn, UserPlus, Shield, X, AlertCircle, RefreshCw } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
  forced?: boolean;
}

const AVATAR_OPTIONS = ['🛡️', '🚀', '🎮', '⚡', '🎧', '👾', '🐱', '🐺', '🔥', '💻'];

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, forced = false }) => {
  const { login, register, currentServerHost, isDedicatedServer, resetToMainServer } = useSocket();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('🛡️');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await register({ username, email, password, avatar });
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.error || 'Kayıt başarısız oldu.');
        }
      } else {
        const res = await login(username, password);
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.error || 'Giriş başarısız oldu.');
        }
      }
    } catch {
      setErrorMessage('Sunucu ile bağlantı kurulamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="w-full max-w-md ios-glass rounded-3xl shadow-2xl overflow-hidden border border-white/10 relative">
        {/* Close Button */}
        {!forced && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Modal Header */}
        <div className="p-6 text-center border-b border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-2xl mx-auto shadow-lg shadow-blue-500/30 mb-3">
            {isRegister ? <UserPlus className="w-6 h-6 text-white" /> : <Shield className="w-6 h-6 text-white" />}
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {isRegister ? 'Yeni Hesap Oluştur' : 'Sisteme Giriş Yap'}
          </h2>
          <p className="text-xs text-white/50 mt-1">
            {isRegister
              ? 'Çakma platformuna kaydolun'
              : 'Hesabınızla oturum açın veya yönetici paneline erişin'}
          </p>

          {/* Active Server Info & Escape Hatch */}
          <div className="mt-4 flex items-center justify-between px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/10 text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-white/60 truncate">
                Sunucu: <b className="text-white font-mono">{currentServerHost}</b>
              </span>
            </div>
            {isDedicatedServer && (
              <button
                type="button"
                onClick={resetToMainServer}
                className="px-2 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-[10px] font-semibold transition shrink-0 flex items-center gap-1"
                title="Ana sunucuya dön"
              >
                <RefreshCw className="w-3 h-3" />
                Ana Sunucu (4000)
              </button>
            )}
          </div>

          {/* iOS Segmented Control */}
          <div className="flex bg-white/5 p-1 rounded-2xl mt-3 border border-white/10">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setErrorMessage(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition ${
                !isRegister ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30' : 'text-white/60 hover:text-white'
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); setErrorMessage(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition ${
                isRegister ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30' : 'text-white/60 hover:text-white'
              }`}
            >
              Kayıt Ol
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isRegister && (
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                Avatar Seç
              </label>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {AVATAR_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAvatar(opt)}
                    className={`w-9 h-9 rounded-xl bg-white/5 hover:scale-110 transition flex items-center justify-center text-lg border ${
                      avatar === opt ? 'border-blue-400 bg-blue-500/25' : 'border-white/5'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Kullanıcı Adı {isRegister ? '' : 'veya E-Posta'}
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isRegister ? 'Örn: kullanıcı_adınız' : 'Kullanıcı adınız veya E-Posta'}
              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/20"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                E-Posta Adresi
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmet@example.com"
                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/20"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
              Şifre
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {loading ? 'İşleniyor...' : isRegister ? 'Hesap Oluştur ve Giriş Yap' : 'Oturum Aç'}
          </button>
        </form>
      </div>
    </div>
  );
};
