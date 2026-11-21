import React from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { t, type AppLanguage } from '../../utils/i18n';
import { evaluatePasswordStrength, normalizeOtpInput } from '../../utils/authValidation';
import { OtpCodeInput } from './OtpCodeInput';

interface ForgotPasswordFormProps {
  language: AppLanguage;
  resetEmail: string;
  setResetEmail: (val: string) => void;
  resetEmailValid: boolean;
  resetCodeSent: boolean;
  resetSending: boolean;
  resetCooldown: number;
  resetFeedback: { ok: boolean; text: string } | null;
  onClearFeedback: () => void;
  onSendResetCode: () => void;
  resetCode: string;
  setResetCode: (val: string) => void;
  resetNewPassword: string;
  setResetNewPassword: (val: string) => void;
  resetConfirmPassword: string;
  setResetConfirmPassword: (val: string) => void;
  showResetPassword: boolean;
  setShowResetPassword: React.Dispatch<React.SetStateAction<boolean>>;
  capsLockOn: boolean;
  onKeyModifiers: (e: React.KeyboardEvent | React.MouseEvent) => void;
  loading: boolean;
  isConnected: boolean;
  onExit: () => void;
}

const STRENGTH_COLORS = [
  'bg-white/10',
  'bg-rose-500',
  'bg-amber-400',
  'bg-emerald-400',
  'bg-teal-400',
];

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  language,
  resetEmail,
  setResetEmail,
  resetEmailValid,
  resetCodeSent,
  resetSending,
  resetCooldown,
  resetFeedback,
  onClearFeedback,
  onSendResetCode,
  resetCode,
  setResetCode,
  resetNewPassword,
  setResetNewPassword,
  resetConfirmPassword,
  setResetConfirmPassword,
  showResetPassword,
  setShowResetPassword,
  capsLockOn,
  onKeyModifiers,
  loading,
  isConnected,
  onExit,
}) => {
  const resetStrength = evaluatePasswordStrength(resetNewPassword);
  const resetMismatch = resetConfirmPassword.length > 0 && resetNewPassword !== resetConfirmPassword;

  return (
    <div className="space-y-3.5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[11px] font-semibold text-white/50 uppercase">
            {t(language, 'emailLabel')}
          </label>
          {resetEmail.trim().length > 0 && (
            <span className={`text-[10px] font-semibold ${resetEmailValid ? 'text-emerald-300' : 'text-rose-300'}`}>
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
                onClearFeedback();
              }}
              placeholder="kayitli@eposta.com"
              className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl pl-9 pr-3.5 py-2.5 outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-white/25"
            />
          </div>
          {resetCodeSent && (
            <button
              type="button"
              onClick={onSendResetCode}
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
              <span className="font-mono text-white/50">{normalizeOtpInput(resetCode, 6).length}/6</span>
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
                {capsLockOn && <span className="text-[10px] font-bold text-amber-300">Caps Lock</span>}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  onKeyUp={onKeyModifiers}
                  onKeyDown={onKeyModifiers}
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
                  <span className={`text-[10px] font-semibold ${resetMismatch ? 'text-rose-300' : 'text-emerald-300'}`}>
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
                    resetMismatch ? 'border-rose-500/60 focus:ring-rose-500' : 'border-white/10 focus:ring-rose-500'
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
                      resetStrength.level >= seg ? STRENGTH_COLORS[resetStrength.level] : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-white/75 shrink-0">{resetStrength.label}</span>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onExit}
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
  );
};
