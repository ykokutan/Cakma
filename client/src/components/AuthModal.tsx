import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Headphones,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MailCheck,
  Monitor,
  Moon,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  UserPlus,
  Wifi,
  X,
} from 'lucide-react';
import { LIGHT_THEMES, useSocket } from '../context/SocketContext';
import { useNetworkPing } from '../context/NetworkMetricsContext';
import { AppLanguage, LANGUAGE_OPTIONS, t } from '../utils/i18n';
import {
  evaluatePasswordStrength,
  normalizeOtpInput,
  validateEmail,
  validateUsername,
} from '../utils/authValidation';
import { OtpCodeInput } from './auth/OtpCodeInput';

interface AuthModalProps {
  onClose: () => void;
  forced?: boolean;
}

const AVATAR_OPTIONS = ['🛡️', '🚀', '🎮', '⚡', '🎧', '👾', '🐱', '🐺', '🔥', '💻', '👑', '🦊'];
const LAST_USERNAME_KEY = 'dc_last_login_user';

function readSavedUsername(): string {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, forced = false }) => {
  const {
    login,
    verify2faLogin,
    register,
    requestRegisterChallenge,
    sendRegisterEmailCode,
    requestPasswordResetCode,
    confirmPasswordReset,
    currentServerHost,
    isDedicatedServer,
    connectToDedicatedServer,
    resetToMainServer,
    language,
    setLanguage,
    uiTheme,
    setUiTheme,
    connectionState,
    maintenanceStatus,
  } = useSocket();
  const ping = useNetworkPing();

  const [savedInitialUser] = useState<string>(() => readSavedUsername());
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState(savedInitialUser);
  const [rememberUsername, setRememberUsername] = useState<boolean>(() => Boolean(savedInitialUser));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [avatar, setAvatar] = useState('🛡️');
  const [inviteCode, setInviteCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [requireEmailVerif, setRequireEmailVerif] = useState(false);
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const [emailCodeFeedback, setEmailCodeFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [challengeToken, setChallengeToken] = useState('');
  const [challengeQuestion, setChallengeQuestion] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [inviteOnlyMode, setInviteOnlyMode] = useState(false);
  const [strongPolicyMode, setStrongPolicyMode] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pending2faToken, setPending2faToken] = useState<string | null>(null);
  const [twoFaMode, setTwoFaMode] = useState<'totp' | 'backup'>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [resetFeedback, setResetFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetSuccessNotice, setResetSuccessNotice] = useState('');
  const [showServerSwitch, setShowServerSwitch] = useState(false);
  const [customServerInput, setCustomServerInput] = useState('');

  const isLightTheme = uiTheme !== 'custom' && LIGHT_THEMES.has(uiTheme);
  const usernameCheck = validateUsername(username);
  const emailValid = validateEmail(email);
  const passwordStrength = evaluatePasswordStrength(password);
  const passwordsMismatch = isRegister && confirmPassword.length > 0 && password !== confirmPassword;
  const resetEmailValid = validateEmail(resetEmail);
  const resetStrength = evaluatePasswordStrength(resetNewPassword);
  const resetMismatch = resetConfirmPassword.length > 0 && resetNewPassword !== resetConfirmPassword;
  const isConnected = connectionState === 'connected';

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setErrorKey((k) => k + 1);
  };

  const handleKeyModifiers = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const loadChallenge = async () => {
    const ch = await requestRegisterChallenge();
    if (ch) {
      setChallengeToken(ch.token);
      setChallengeQuestion(ch.question);
      setChallengeAnswer('');
      setInviteOnlyMode(ch.inviteOnly);
      setStrongPolicyMode(ch.requireStrongPasswords);
      setRequireEmailVerif(Boolean(ch.requireEmailVerification));
    }
  };

  useEffect(() => {
    if (emailCodeCooldown <= 0) return;
    const timer = window.setTimeout(() => setEmailCodeCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [emailCodeCooldown]);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = window.setTimeout(() => setResetCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resetCooldown]);

  useEffect(() => {
    if (isRegister && connectionState === 'connected') {
      loadChallenge();
    }
  }, [isRegister, connectionState]);

  const openForgotMode = () => {
    setForgotMode(true);
    setIsRegister(false);
    setErrorMessage('');
    setPending2faToken(null);
    setResetFeedback(null);
    setResetSuccessNotice('');
    if (!resetEmail && username.includes('@')) {
      setResetEmail(username.trim());
    }
  };

  const exitForgotMode = () => {
    setForgotMode(false);
    setErrorMessage('');
    setResetFeedback(null);
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetCodeSent(false);
    setShowResetPassword(false);
  };

  const handleSendResetCode = async () => {
    setErrorMessage('');
    setResetFeedback(null);
    if (!resetEmailValid) {
      triggerError('Lütfen geçerli bir kayıtlı e-posta adresi girin.');
      return;
    }
    if (resetSending || resetCooldown > 0 || !isConnected) return;
    setResetSending(true);
    try {
      const res = await requestPasswordResetCode(resetEmail.trim());
      if (res.success) {
        setResetCodeSent(true);
        setResetCooldown(60);
        setResetFeedback({
          ok: true,
          text: res.message || 'Şifre sıfırlama kodu e-posta adresinize gönderildi.',
        });
      } else {
        setResetFeedback({
          ok: false,
          text: res.error || 'Sıfırlama kodu gönderilemedi.',
        });
      }
    } catch {
      setResetFeedback({ ok: false, text: 'Sunucu ile bağlantı kurulamadı.' });
    } finally {
      setResetSending(false);
    }
  };

  const handleSendEmailCode = async () => {
    if (!emailValid || emailCodeSending || emailCodeCooldown > 0 || !isConnected) return;
    setEmailCodeSending(true);
    setEmailCodeFeedback(null);
    const res = await sendRegisterEmailCode(email.trim());
    setEmailCodeSending(false);
    if (res.success) {
      setEmailCodeCooldown(60);
      setEmailCodeFeedback({ ok: true, text: res.message || 'Doğrulama kodu gönderildi.' });
    } else {
      setEmailCodeFeedback({ ok: false, text: res.error || 'Kod gönderilemedi.' });
    }
  };

  const persistRememberedUser = (loggedInUsername: string) => {
    try {
      if (rememberUsername && loggedInUsername.trim()) {
        localStorage.setItem(LAST_USERNAME_KEY, loggedInUsername.trim());
      } else {
        localStorage.removeItem(LAST_USERNAME_KEY);
      }
    } catch {}
  };

  const handleServerConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = customServerInput.replace(/^https?:\/\//, '').trim();
    if (!cleaned) return;
    connectToDedicatedServer(cleaned);
  };

  const switchAuthMode = (registerMode: boolean) => {
    setIsRegister(registerMode);
    setForgotMode(false);
    setErrorMessage('');
    setResetFeedback(null);
    setResetSuccessNotice('');
    setConfirmPassword('');
    setPending2faToken(null);
    setTotpCode('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setResetSuccessNotice('');

    if (!isConnected) {
      triggerError('Sunucuya henüz bağlanılmadı. Lütfen bağlantının kurulmasını bekleyin.');
      return;
    }

    if (forgotMode) {
      if (!resetCodeSent) {
        await handleSendResetCode();
        return;
      }
      if (!resetEmailValid) {
        triggerError('Lütfen geçerli bir e-posta adresi girin.');
        return;
      }
      const cleanedResetCode = normalizeOtpInput(resetCode, 6);
      if (cleanedResetCode.length !== 6) {
        triggerError('Lütfen e-postanıza gelen 6 haneli sıfırlama kodunu eksiksiz girin.');
        return;
      }
      if (!resetNewPassword) {
        triggerError('Lütfen yeni şifrenizi girin.');
        return;
      }
      if (resetNewPassword !== resetConfirmPassword) {
        triggerError('Yeni şifre ve tekrar alanı birbiriyle eşleşmiyor.');
        return;
      }

      setLoading(true);
      try {
        const res = await confirmPasswordReset(resetEmail.trim(), cleanedResetCode, resetNewPassword);
        if (res.success) {
          const msg = res.message || 'Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.';
          exitForgotMode();
          setPassword('');
          setResetSuccessNotice(msg);
        } else {
          triggerError(res.error || 'Şifre sıfırlanamadı.');
        }
      } catch {
        triggerError('Sunucu ile bağlantı kurulamadı.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (pending2faToken) {
      const cleaned2fa = twoFaMode === 'totp' ? normalizeOtpInput(totpCode, 6) : totpCode.trim();
      if (twoFaMode === 'totp' && cleaned2fa.length !== 6) {
        triggerError('Lütfen Authenticator uygulamanızdaki 6 haneli doğrulama kodunu eksiksiz girin.');
        return;
      }
      if (!cleaned2fa) {
        triggerError('Lütfen doğrulama veya yedek kurtarma kodunu girin.');
        return;
      }

      setLoading(true);
      try {
        const res = await verify2faLogin(pending2faToken, cleaned2fa);
        if (res.success) {
          persistRememberedUser(username);
          onClose();
        } else {
          triggerError(res.error || '2FA doğrulaması başarısız oldu.');
        }
      } catch {
        triggerError('Sunucu ile bağlantı kurulamadı.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isRegister) {
      if (!usernameCheck.valid) {
        triggerError(usernameCheck.reason || 'Geçerli bir kullanıcı adı girin.');
        return;
      }
      if (!emailValid) {
        triggerError('Lütfen geçerli bir e-posta adresi girin.');
        return;
      }
      if (password !== confirmPassword) {
        triggerError('Girdiğiniz şifreler eşleşmiyor. Lütfen kontrol edin.');
        return;
      }
      if (requireEmailVerif && normalizeOtpInput(emailCode, 6).length !== 6) {
        triggerError('Lütfen e-postanıza gelen 6 haneli doğrulama kodunu eksiksiz girin.');
        return;
      }
      if (!challengeToken || !challengeAnswer.trim()) {
        triggerError('Lütfen güvenlik doğrulaması sorusunu yanıtlayın.');
        return;
      }

      setLoading(true);
      try {
        const res = await register({
          username: username.trim(),
          email: email.trim(),
          password,
          avatar,
          inviteCode: inviteCode.trim() || undefined,
          emailCode: emailCode.trim() || undefined,
          challengeToken,
          challengeAnswer: challengeAnswer.trim(),
          honeypot,
        });
        if (res.success) {
          persistRememberedUser(username);
          onClose();
        } else {
          triggerError(res.error || 'Kayıt başarısız oldu.');
          loadChallenge();
        }
      } catch {
        triggerError('Sunucu ile bağlantı kurulamadı.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await login(username.trim(), password);
      if (res.success) {
        persistRememberedUser(username);
        onClose();
      } else if (res.requires2fa && res.pending2faToken) {
        setPending2faToken(res.pending2faToken);
        setTwoFaMode('totp');
        setTotpCode('');
      } else {
        triggerError(res.error || 'Giriş başarısız oldu.');
      }
    } catch {
      triggerError('Sunucu ile bağlantı kurulamadı.');
    } finally {
      setLoading(false);
    }
  };

  const statusDotClass =
    connectionState === 'connected'
      ? 'bg-emerald-400 animate-pulse'
      : connectionState === 'reconnecting'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-rose-500';

  const statusLabel =
    connectionState === 'connected'
      ? 'Çevrimiçi'
      : connectionState === 'reconnecting'
      ? 'Bağlanıyor...'
      : 'Bağlantı Yok';

  const renderServerWidget = (compact = false) => (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] ${
        compact ? 'p-3 space-y-2' : 'p-3.5 space-y-2.5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
          <span className="text-white/60 truncate">
            <span className="text-white/45 mr-1">{t(language, 'serverLabel')}</span>
            <b className="text-white font-mono">{currentServerHost}</b>
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
              connectionState === 'connected'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : connectionState === 'reconnecting'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            <Wifi className="w-2.5 h-2.5" />
            {connectionState === 'connected' && ping > 0 ? `${ping} ms` : statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowServerSwitch((v) => !v)}
          className="text-[11px] font-semibold text-white/60 hover:text-white inline-flex items-center gap-1 transition"
        >
          <ArrowRightLeft className="w-3 h-3" />
          {showServerSwitch ? 'Vazgeç' : t(language, 'switchServer')}
        </button>

        {isDedicatedServer && (
          <button
            type="button"
            onClick={resetToMainServer}
            className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-semibold transition inline-flex items-center gap-1"
            title={t(language, 'returnMainServer')}
          >
            <RefreshCw className="w-3 h-3" />
            {t(language, 'returnMainServer')}
          </button>
        )}
      </div>

      {showServerSwitch && (
        <div className="flex items-center gap-1.5 pt-1 animate-fade-in">
          <input
            type="text"
            value={customServerInput}
            onChange={(e) => setCustomServerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleServerConnect();
              }
            }}
            placeholder="host:port (örn. ses.alanadiniz.com:4001)"
            className="flex-1 min-w-0 bg-black/25 border border-white/10 text-white font-mono text-[11px] rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={() => handleServerConnect()}
            disabled={!customServerInput.trim()}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white text-[11px] font-semibold disabled:opacity-50 transition shrink-0"
          >
            Bağlan
          </button>
        </div>
      )}
    </div>
  );

  const heroTitle = pending2faToken
    ? 'İki Faktörlü Koruma'
    : forgotMode
    ? t(language, 'forgotPasswordTitle')
    : isRegister
    ? t(language, 'registerTitle')
    : t(language, 'loginTitle');

  const heroSubtitle = pending2faToken
    ? 'Hesap güvenliğin için tek kullanımlık doğrulama kodunu onaylayarak devam et.'
    : forgotMode
    ? t(language, 'forgotPasswordSubtitle')
    : isRegister
    ? t(language, 'registerSubtitle')
    : t(language, 'loginSubtitle');

  const strengthColors = [
    'bg-white/10',
    'bg-rose-500',
    'bg-amber-400',
    'bg-emerald-400',
    'bg-teal-400',
  ];

  const outerClass = forced
    ? 'relative w-full h-full overflow-y-auto flex justify-center p-3 sm:p-6'
    : 'fixed inset-0 z-50 bg-black/70 backdrop-blur-2xl overflow-y-auto flex justify-center p-4';

  return (
    <div className={outerClass}>
      {/* Ambient background orbs in forced mode */}
      {forced && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="auth-orb-float absolute -top-24 -left-24 w-80 h-80 rounded-full bg-rose-500/15 blur-3xl" />
          <div
            className="auth-orb-float absolute -bottom-28 -right-24 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl"
            style={{ animationDelay: '-5.5s' }}
          />
        </div>
      )}

      <div
        className={`relative my-auto w-full ${
          forced ? 'max-w-[920px]' : 'max-w-[460px]'
        } ios-glass rounded-3xl shadow-2xl overflow-hidden border border-white/15 animate-fade-in`}
      >
        <div className={forced ? 'grid grid-cols-1 lg:grid-cols-12' : 'flex flex-col'}>
          {/* Left Hero Showcase Panel (Desktop forced mode) */}
          {forced && (
            <aside className="hidden lg:flex lg:col-span-5 flex-col justify-between p-7 border-r border-white/10 bg-gradient-to-br from-rose-600/15 via-red-500/[0.04] to-black/20 relative overflow-hidden">
              <div className="space-y-6 relative z-10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src="/app-icon.png"
                      alt="Çakma"
                      className="w-12 h-12 rounded-2xl shadow-xl shadow-red-600/30 ring-1 ring-white/15 object-cover"
                      draggable={false}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-extrabold tracking-tight text-white">Çakma</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 border border-rose-500/35 text-rose-300">
                          v0.7.1
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50">Ses &amp; Topluluk Platformu</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold text-white/75">
                    <Sparkles className="w-3 h-3 text-rose-400" />
                    Yeni Nesil İletişim
                  </div>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight leading-snug">
                    {heroTitle}
                  </h1>
                  <p className="text-xs text-white/60 leading-relaxed">{heroSubtitle}</p>
                </div>

                <div className="space-y-2.5">
                  {[
                    {
                      icon: Headphones,
                      title: '48kHz Stüdyo Ses & Hibrit SFU',
                      desc: 'Düşük gecikmeli Opus DSP ses motoru ve akıllı oda ölçekleme.',
                      tint: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25',
                    },
                    {
                      icon: Monitor,
                      title: '1-e-1 Görüşme & Uzaktan Yardım',
                      desc: 'P2P ekran paylaşımı, kamera ve güvenli uzaktan kontrol.',
                      tint: 'text-sky-300 bg-sky-500/15 border-sky-500/25',
                    },
                    {
                      icon: ShieldCheck,
                      title: '2FA, E2EE & E-Posta OTP',
                      desc: 'Uçtan uca şifreli DM ve katmanlı hesap doğrulama.',
                      tint: 'text-rose-300 bg-rose-500/15 border-rose-500/25',
                    },
                  ].map((feat) => {
                    const Icon = feat.icon;
                    return (
                      <div
                        key={feat.title}
                        className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-3"
                      >
                        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${feat.tint}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white leading-tight">{feat.title}</div>
                          <div className="text-[11px] text-white/55 mt-0.5 leading-snug">{feat.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-5 relative z-10">{renderServerWidget(false)}</div>
            </aside>
          )}

          {/* Right Form Panel */}
          <div className={forced ? 'lg:col-span-7 p-5 sm:p-7 flex flex-col justify-between' : 'p-5 sm:p-6 flex flex-col'}>
            <div>
              {/* Compact Top Controls Bar */}
              <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/[0.07]">
                <div className={`flex items-center gap-2.5 min-w-0 ${forced ? 'lg:hidden' : ''}`}>
                  <img
                    src="/app-icon.png"
                    alt="Çakma"
                    className="w-9 h-9 rounded-xl shadow-md shadow-red-600/25 ring-1 ring-white/15 object-cover shrink-0"
                    draggable={false}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white truncate">Çakma</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} title={statusLabel} />
                    </div>
                    <div className="text-[10px] text-white/45 font-mono truncate">{currentServerHost}</div>
                  </div>
                </div>

                {forced && (
                  <div className="hidden lg:flex items-center gap-2 text-xs text-white/55">
                    <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
                    <span>{isConnected ? 'Sunucuya güvenli bağlantı aktif' : statusLabel}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <div className="relative flex items-center">
                    <Globe className="w-3.5 h-3.5 text-white/50 absolute left-2 pointer-events-none" />
                    <select
                      aria-label="Dil seçimi"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                      className="pl-7 pr-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-white outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                          {opt.flag} {opt.id.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setUiTheme(isLightTheme ? 'vision-dark' : 'pearl-white')}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/75 hover:text-white transition"
                    title={isLightTheme ? 'Karanlık Temaya Geç' : 'Aydınlık Temaya Geç'}
                    aria-label={isLightTheme ? 'Karanlık Temaya Geç' : 'Aydınlık Temaya Geç'}
                  >
                    {isLightTheme ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  </button>

                  {!forced && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition"
                      aria-label="Kapat"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dynamic Form Title */}
              <div className="mt-4">
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  {pending2faToken
                    ? 'İki Faktörlü Doğrulama (2FA)'
                    : forgotMode
                    ? t(language, 'forgotPasswordTitle')
                    : isRegister
                    ? t(language, 'registerTitle')
                    : t(language, 'loginTitle')}
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  {pending2faToken
                    ? 'Oturumu tamamlamak için doğrulama kodunuzu girin'
                    : forgotMode
                    ? t(language, 'forgotPasswordSubtitle')
                    : isRegister
                    ? t(language, 'registerSubtitle')
                    : t(language, 'loginSubtitle')}
                </p>
              </div>

              {/* Maintenance Mode Banner */}
              {maintenanceStatus?.active && (
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-start gap-2.5 text-amber-200 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{maintenanceStatus.message || 'Sistem şu anda planlı bakım modundadır.'}</span>
                </div>
              )}

              {/* Segmented Switcher */}
              {!pending2faToken && !forgotMode && (
                <div className="flex bg-white/5 p-1 rounded-2xl mt-4 border border-white/10">
                  <button
                    type="button"
                    onClick={() => switchAuthMode(false)}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                      !isRegister
                        ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/25'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {t(language, 'loginBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchAuthMode(true)}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                      isRegister
                        ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/25'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {t(language, 'registerBtn')}
                  </button>
                </div>
              )}

              {/* Form Body */}
              <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                {resetSuccessNotice && !forgotMode && (
                  <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-start gap-2.5 text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resetSuccessNotice}</span>
                  </div>
                )}

                {errorMessage && (
                  <div
                    key={errorKey}
                    className="animate-shake p-3 rounded-2xl bg-red-500/15 border border-red-500/35 flex items-start gap-2.5 text-red-300 text-xs"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {pending2faToken ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-white/80 leading-relaxed">
                      Hesabınız <b>İki Faktörlü Doğrulama (2FA)</b> ile korunuyor. Google Authenticator / Authy
                      uygulamanızdaki 6 haneli kodu veya 8 haneli yedek kurtarma kodunuzu girin.
                    </div>

                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFaMode('totp');
                          setTotpCode('');
                          setErrorMessage('');
                        }}
                        className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition ${
                          twoFaMode === 'totp'
                            ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Authenticator (6 Haneli)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFaMode('backup');
                          setTotpCode('');
                          setErrorMessage('');
                        }}
                        className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition ${
                          twoFaMode === 'backup'
                            ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Yedek Kurtarma Kodu
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 uppercase mb-2">
                        {twoFaMode === 'totp' ? '6 Haneli Doğrulama Kodu' : 'Yedek Kurtarma Kodu'}
                      </label>
                      {twoFaMode === 'totp' ? (
                        <OtpCodeInput
                          value={totpCode}
                          onChange={setTotpCode}
                          length={6}
                          accent="rose"
                          autoFocus={true}
                          disabled={loading}
                          ariaLabel="2FA doğrulama kodu"
                        />
                      ) : (
                        <input
                          type="text"
                          required
                          autoFocus
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.toUpperCase())}
                          placeholder="XXXX-XXXX"
                          className="w-full bg-white/5 border border-white/10 text-white text-center font-mono text-base tracking-widest rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                        />
                      )}
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
                        {t(language, 'back')}
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !isConnected}
                        className="flex-1 py-2.5 bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 hover:brightness-110 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                        {loading ? 'Doğrulanıyor...' : t(language, 'verifyAndLogin')}
                      </button>
                    </div>
                  </div>
                ) : forgotMode ? (
                  <div className="space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-white/50 uppercase">
                          {t(language, 'emailLabel')}
                        </label>
                        {resetEmail.trim().length > 0 && (
                          <span
                            className={`text-[10px] font-semibold ${
                              resetEmailValid ? 'text-emerald-300' : 'text-rose-300'
                            }`}
                          >
                            {resetEmailValid ? 'Geçerli' : 'Geçersiz format'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1 min-w-0">
                          <Mail className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="email"
                            required
                            autoComplete="email"
                            value={resetEmail}
                            onChange={(e) => {
                              setResetEmail(e.target.value);
                              setResetFeedback(null);
                            }}
                            placeholder="kayitli@eposta.com"
                            className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                          />
                        </div>
                        {resetCodeSent && (
                          <button
                            type="button"
                            onClick={handleSendResetCode}
                            disabled={resetSending || resetCooldown > 0 || !resetEmailValid || !isConnected}
                            className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white/85 text-[11px] font-semibold transition disabled:opacity-50 shrink-0"
                          >
                            {resetSending
                              ? t(language, 'sending')
                              : resetCooldown > 0
                              ? `${resetCooldown} sn`
                              : t(language, 'sendCode')}
                          </button>
                        )}
                      </div>
                    </div>

                    {resetFeedback && (
                      <div
                        className={`px-3 py-2 rounded-xl text-[11px] border ${
                          resetFeedback.ok
                            ? 'bg-emerald-400/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-400/10 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {resetFeedback.text}
                      </div>
                    )}

                    {resetCodeSent && (
                      <>
                        <div className="p-3 rounded-2xl bg-white/[0.03] border border-rose-500/25 space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-rose-300">
                            <span>{t(language, 'resetCodeLabel')}</span>
                            <span className="font-mono text-white/50">
                              {normalizeOtpInput(resetCode, 6).length}/6
                            </span>
                          </div>
                          <OtpCodeInput
                            value={resetCode}
                            onChange={setResetCode}
                            length={6}
                            accent="rose"
                            disabled={loading}
                            ariaLabel="Şifre sıfırlama kodu"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-white/50 uppercase">
                                {t(language, 'newPasswordLabel')}
                              </label>
                              {capsLockOn && (
                                <span className="text-[10px] font-bold text-amber-300">Caps Lock</span>
                              )}
                            </div>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type={showResetPassword ? 'text' : 'password'}
                                required
                                autoComplete="new-password"
                                value={resetNewPassword}
                                onChange={(e) => setResetNewPassword(e.target.value)}
                                onKeyUp={handleKeyModifiers}
                                onKeyDown={handleKeyModifiers}
                                placeholder="••••••••"
                                className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl pl-9 pr-9 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                              />
                              <button
                                type="button"
                                onClick={() => setShowResetPassword((v) => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white transition"
                                aria-label={showResetPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                              >
                                {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-white/50 uppercase">
                                {t(language, 'newPasswordConfirmLabel')}
                              </label>
                              {resetConfirmPassword.length > 0 && (
                                <span
                                  className={`text-[10px] font-semibold ${
                                    resetMismatch ? 'text-rose-300' : 'text-emerald-300'
                                  }`}
                                >
                                  {resetMismatch ? 'Eşleşmiyor' : 'Eşleşti'}
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type={showResetPassword ? 'text' : 'password'}
                                required
                                autoComplete="new-password"
                                value={resetConfirmPassword}
                                onChange={(e) => setResetConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                className={`w-full bg-white/5 border text-white text-xs rounded-xl pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 placeholder:text-white/25 ${
                                  resetMismatch
                                    ? 'border-rose-500/60 focus:ring-rose-500'
                                    : 'border-white/10 focus:ring-rose-500'
                                }`}
                              />
                            </div>
                          </div>
                        </div>

                        {resetNewPassword.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 grid grid-cols-4 gap-1.5">
                              {[1, 2, 3, 4].map((seg) => (
                                <div
                                  key={seg}
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    resetStrength.level >= seg ? strengthColors[resetStrength.level] : 'bg-white/10'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-bold text-white/75 shrink-0">
                              {resetStrength.label}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={exitForgotMode}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white/80 transition"
                      >
                        {t(language, 'backToLogin')}
                      </button>
                      <button
                        type="submit"
                        disabled={loading || resetSending || !isConnected}
                        className="flex-1 py-2.5 bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 hover:brightness-110 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {(loading || resetSending) && <Loader2 className="w-4 h-4 animate-spin" />}
                        {!isConnected
                          ? t(language, 'connectingServer')
                          : resetCodeSent
                          ? t(language, 'resetPasswordSubmit')
                          : resetSending
                          ? t(language, 'sending')
                          : t(language, 'resetCodeSend')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Register: Live Avatar Preview & Grid */}
                    {isRegister && (
                      <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/25 to-amber-500/15 border border-white/15 flex items-center justify-center text-xl shadow-inner shrink-0">
                              {avatar}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {username.trim() || 'kullanici_adi'}
                              </div>
                              <div className="text-[10px] text-white/45 truncate">
                                Canlı Profil Önizlemesi
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-white/45 uppercase shrink-0">
                            Avatar Seç
                          </span>
                        </div>
                        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                          {AVATAR_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAvatar(opt)}
                              className={`h-8 rounded-xl bg-white/5 hover:scale-105 transition flex items-center justify-center text-base border ${
                                avatar === opt
                                  ? 'border-rose-400 bg-rose-400/15 ring-1 ring-rose-400/40'
                                  : 'border-white/10 hover:border-white/25'
                              }`}
                              aria-label={`Avatar ${opt}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Username / Username or Email */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-white/50 uppercase">
                          {isRegister ? t(language, 'usernameLabel') : t(language, 'usernameOrEmailLabel')}
                        </label>
                        {isRegister && username.trim().length > 0 && (
                          <span
                            className={`text-[10px] font-semibold ${
                              usernameCheck.valid ? 'text-emerald-300' : 'text-rose-300'
                            }`}
                          >
                            {usernameCheck.valid ? 'Uygun' : usernameCheck.reason}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <User className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          required
                          autoComplete="username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder={isRegister ? 'Örn: ahmet_01' : 'Kullanıcı adınız veya E-Posta'}
                          className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                        />
                      </div>
                    </div>

                    {/* Register Email + OTP Flow */}
                    {isRegister && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-semibold text-white/50 uppercase">
                            {t(language, 'emailLabel')}
                          </label>
                          {email.trim().length > 0 && (
                            <span
                              className={`text-[10px] font-semibold inline-flex items-center gap-1 ${
                                emailValid ? 'text-emerald-300' : 'text-rose-300'
                              }`}
                            >
                              {emailValid ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3" /> Geçerli
                                </>
                              ) : (
                                'Geçersiz format'
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1 min-w-0">
                            <Mail className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="email"
                              required
                              autoComplete="email"
                              value={email}
                              onChange={(e) => {
                                setEmail(e.target.value);
                                setEmailCodeFeedback(null);
                              }}
                              placeholder="ahmet@example.com"
                              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                            />
                          </div>
                          {requireEmailVerif && (
                            <button
                              type="button"
                              onClick={handleSendEmailCode}
                              disabled={emailCodeSending || emailCodeCooldown > 0 || !emailValid || !isConnected}
                              className="px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-emerald-300 text-[11px] font-bold transition disabled:opacity-50 shrink-0 inline-flex items-center gap-1.5"
                            >
                              {emailCodeSending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <MailCheck className="w-3.5 h-3.5" />
                              )}
                              {emailCodeSending
                                ? t(language, 'sending')
                                : emailCodeCooldown > 0
                                ? `${emailCodeCooldown} sn`
                                : t(language, 'sendCode')}
                            </button>
                          )}
                        </div>

                        {requireEmailVerif && emailCodeFeedback && (
                          <div
                            className={`px-3 py-2 rounded-xl text-[11px] border ${
                              emailCodeFeedback.ok
                                ? 'bg-emerald-400/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-400/10 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            {emailCodeFeedback.text}
                          </div>
                        )}

                        {requireEmailVerif && (
                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-emerald-500/25 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-emerald-300">
                              <span>6 Haneli E-Posta Doğrulama Kodu</span>
                              <span className="font-mono text-white/50">
                                {normalizeOtpInput(emailCode, 6).length}/6
                              </span>
                            </div>
                            <OtpCodeInput
                              value={emailCode}
                              onChange={setEmailCode}
                              length={6}
                              accent="emerald"
                              disabled={loading}
                              ariaLabel="E-posta doğrulama kodu"
                            />
                            {!emailCodeFeedback && (
                              <div className="text-[11px] text-white/50">
                                Önce <b>Kod Gönder</b> butonuna basın. Mail görünmezse Spam / Gereksiz klasörünü kontrol edin.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Password (+ Confirm Password in Register) */}
                    <div className="space-y-2">
                      <div className={isRegister ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : ''}>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-semibold text-white/50 uppercase">
                              {t(language, 'passwordLabel')}
                            </label>
                            {capsLockOn && (
                              <span className="text-[10px] font-bold text-amber-300">Caps Lock Açık</span>
                            )}
                          </div>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              autoComplete={isRegister ? 'new-password' : 'current-password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              onKeyUp={handleKeyModifiers}
                              onKeyDown={handleKeyModifiers}
                              placeholder="••••••••"
                              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl pl-9 pr-9 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white transition"
                              aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {isRegister && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-white/50 uppercase">
                                {t(language, 'confirmPasswordLabel')}
                              </label>
                              {confirmPassword.length > 0 && (
                                <span
                                  className={`text-[10px] font-semibold ${
                                    passwordsMismatch ? 'text-rose-300' : 'text-emerald-300'
                                  }`}
                                >
                                  {passwordsMismatch ? 'Eşleşmiyor' : 'Eşleşti'}
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                required
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                onKeyUp={handleKeyModifiers}
                                onKeyDown={handleKeyModifiers}
                                placeholder="••••••••"
                                className={`w-full bg-white/5 border text-white text-xs rounded-xl pl-9 pr-9 py-2.5 outline-none focus:ring-2 placeholder:text-white/25 ${
                                  passwordsMismatch
                                    ? 'border-rose-500/60 focus:ring-rose-500'
                                    : 'border-white/10 focus:ring-rose-500'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword((v) => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white transition"
                                aria-label={showConfirmPassword ? 'Şifre tekrarını gizle' : 'Şifre tekrarını göster'}
                              >
                                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Password Strength Meter & Requirement Chips */}
                      {isRegister && password.length > 0 && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 grid grid-cols-4 gap-1.5">
                              {[1, 2, 3, 4].map((seg) => (
                                <div
                                  key={seg}
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    passwordStrength.level >= seg ? strengthColors[passwordStrength.level] : 'bg-white/10'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-bold text-white/75 shrink-0">
                              {passwordStrength.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { ok: passwordStrength.checks.hasLen, text: '8+ karakter' },
                              { ok: passwordStrength.checks.hasUpper, text: 'A-Z' },
                              { ok: passwordStrength.checks.hasLower, text: 'a-z' },
                              { ok: passwordStrength.checks.hasDigit, text: '0-9' },
                              { ok: passwordStrength.checks.hasSymbol, text: 'Sembol' },
                            ].map((chip) => (
                              <span
                                key={chip.text}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition ${
                                  chip.ok
                                    ? 'bg-emerald-400/10 border-emerald-500/35 text-emerald-300'
                                    : strongPolicyMode && chip.text !== 'Sembol'
                                    ? 'bg-amber-400/10 border-amber-500/30 text-amber-200'
                                    : 'bg-white/5 border-white/10 text-white/45'
                                }`}
                              >
                                {chip.ok && <Check className="w-2.5 h-2.5" />}
                                {chip.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Login: Remember Username & Forgot Password */}
                    {!isRegister && (
                      <div className="flex items-center justify-between pt-0.5 gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-white/65 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rememberUsername}
                            onChange={(e) => setRememberUsername(e.target.checked)}
                            className="rounded border-white/20 bg-white/10 text-rose-500 focus:ring-rose-500"
                          />
                          {t(language, 'rememberUsername')}
                        </label>
                        <button
                          type="button"
                          onClick={openForgotMode}
                          className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
                        >
                          {t(language, 'forgotPasswordLink')}
                        </button>
                      </div>
                    )}

                    {/* Register: Invite Code */}
                    {isRegister && inviteOnlyMode && (
                      <div>
                        <label className="block text-[11px] font-semibold text-amber-300 uppercase mb-1">
                          Kayıt Davet Kodu (Zorunlu)
                        </label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-amber-300/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            required
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                            placeholder="Örn: A1B2C3D4"
                            className="w-full bg-white/5 border border-amber-500/35 text-white font-mono text-xs rounded-xl pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-white/25"
                          />
                        </div>
                      </div>
                    )}

                    {/* Register: Honeypot & Security Challenge */}
                    {isRegister && (
                      <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
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
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-semibold text-white/55 uppercase">
                            Güvenlik Doğrulaması:{' '}
                            <span className="text-cyan-300 font-mono text-xs">
                              {challengeQuestion || 'Bağlantı bekleniyor...'}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={loadChallenge}
                            disabled={!isConnected}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-semibold text-white/70 hover:text-white inline-flex items-center gap-1 disabled:opacity-50 transition"
                          >
                            <RefreshCw className="w-3 h-3" /> Yenile
                          </button>
                        </div>
                        <input
                          type="number"
                          required
                          value={challengeAnswer}
                          onChange={(e) => setChallengeAnswer(e.target.value)}
                          placeholder="İşlemin sonucunu yazın..."
                          className="w-full bg-white/5 border border-white/10 text-white font-mono text-xs rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !isConnected}
                      className="w-full py-2.5 bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 hover:brightness-110 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                    >
                      {loading || !isConnected ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isRegister ? (
                        <UserPlus className="w-4 h-4" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      {!isConnected
                        ? t(language, 'connectingServer')
                        : loading
                        ? 'İşleniyor...'
                        : isRegister
                        ? t(language, 'registerSubmit')
                        : t(language, 'loginSubmit')}
                    </button>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => switchAuthMode(!isRegister)}
                        className="text-xs text-white/55 hover:text-white transition"
                      >
                        {isRegister ? (
                          <>
                            {t(language, 'haveAccountLogin')}{' '}
                            <span className="font-bold text-rose-400">{t(language, 'loginBtn')}</span>
                          </>
                        ) : (
                          <>
                            {t(language, 'noAccountRegister')}{' '}
                            <span className="font-bold text-rose-400">{t(language, 'registerBtn')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>

            {/* Compact Mobile / Modal Server Status Bar */}
            <div className={forced ? 'lg:hidden mt-4 pt-3 border-t border-white/10' : 'mt-4 pt-3 border-t border-white/10'}>
              {renderServerWidget(true)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
