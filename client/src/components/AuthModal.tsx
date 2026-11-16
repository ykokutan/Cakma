import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { LogIn, UserPlus, Shield, X, AlertCircle, RefreshCw } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
  forced?: boolean;
}

const AVATAR_OPTIONS = ['🛡️', '🚀', '🎮', '⚡', '🎧', '👾', '🐱', '🐺', '🔥', '💻'];

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, forced = false }) => {
  const { login, verify2faLogin, register, requestRegisterChallenge, currentServerHost, isDedicatedServer, resetToMainServer } = useSocket();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('🛡️');
  const [inviteCode, setInviteCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [challengeQuestion, setChallengeQuestion] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [inviteOnlyMode, setInviteOnlyMode] = useState(false);
  const [strongPolicyMode, setStrongPolicyMode] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending2faToken, setPending2faToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');

  const loadChallenge = async () => {
    const ch = await requestRegisterChallenge();
    if (ch) {
      setChallengeToken(ch.token);
      setChallengeQuestion(ch.question);
      setChallengeAnswer('');
      setInviteOnlyMode(ch.inviteOnly);
      setStrongPolicyMode(ch.requireStrongPasswords);
    }
  };

  useEffect(() => {
    if (isRegister) {
      loadChallenge();
    }
  }, [isRegister]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      if (pending2faToken) {
        const res = await verify2faLogin(pending2faToken, totpCode);
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.error || '2FA doğrulaması başarısız oldu.');
        }
        return;
      }

      if (isRegister) {
        const res = await register({
          username,
          email,
          password,
          avatar,
          inviteCode: inviteCode.trim() || undefined,
          challengeToken,
          challengeAnswer: challengeAnswer.trim(),
          honeypot,
        });
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.error || 'Kayıt başarısız oldu.');
          loadChallenge();
        }
      } else {
        const res = await login(username, password);
        if (res.success) {
          onClose();
        } else if (res.requires2fa && res.pending2faToken) {
          setPending2faToken(res.pending2faToken);
          setTotpCode('');
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

          {pending2faToken ? (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-xs text-blue-200 leading-relaxed">
                Hesabınız <b>İki Faktörlü Doğrulama (2FA)</b> ile korunuyor. Google Authenticator / Authy uygulamanızdaki 6 haneli kodu veya 8 haneli yedek kurtarma kodunuzu girin.
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                  Doğrulama Kodu
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456 veya XXXX-XXXX"
                  className="w-full bg-white/5 border border-white/10 text-white text-center font-mono text-base tracking-widest rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/20"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPending2faToken(null);
                    setTotpCode('');
                    setErrorMessage('');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white/80 transition"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Shield className="w-4 h-4" />
                  {loading ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'}
                </button>
              </div>
            </div>
          ) : (
            <>
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
                {isRegister && password.length > 0 && (() => {
                  const hasLen = password.length >= 8;
                  const hasUpper = /[A-Z]/.test(password);
                  const hasLower = /[a-z]/.test(password);
                  const hasDigit = /\d/.test(password);
                  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
                  const pts = [hasLen, hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
                  const label = pts >= 4 ? 'Güçlü' : pts >= 3 ? 'Orta' : 'Zayıf';
                  const barCls = pts >= 4 ? 'bg-emerald-400' : pts >= 3 ? 'bg-amber-400' : 'bg-rose-500';
                  return (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full transition-all ${barCls}`} style={{ width: `${Math.max(20, pts * 20)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-white/70">{label}</span>
                      </div>
                      {strongPolicyMode && (
                        <div className="text-[10px] text-white/45">
                          Gereksinim: min. 8 karakter, büyük/küçük harf ve rakam
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {isRegister && inviteOnlyMode && (
                <div>
                  <label className="block text-[11px] font-semibold text-amber-300/80 uppercase mb-1">
                    Kayıt Davet Kodu (Zorunlu)
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Örn: A1B2C3D4"
                    className="w-full bg-white/5 border border-amber-500/30 text-white font-mono text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-white/20"
                  />
                </div>
              )}

              {isRegister && (
                <div className="space-y-1">
                  {/* Honeypot field hidden from humans */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase">
                      Güvenlik Doğrulaması: <span className="text-cyan-300 font-mono">{challengeQuestion || '...'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={loadChallenge}
                      className="text-[10px] text-white/50 hover:text-white flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Yenile
                    </button>
                  </div>
                  <input
                    type="number"
                    required
                    value={challengeAnswer}
                    onChange={(e) => setChallengeAnswer(e.target.value)}
                    placeholder="Sonucu yazın..."
                    className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/20"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {loading ? 'İşleniyor...' : isRegister ? 'Hesap Oluştur ve Giriş Yap' : 'Oturum Aç'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
