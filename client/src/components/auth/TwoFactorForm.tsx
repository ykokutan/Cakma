import React from 'react';
import { Loader2, Shield } from 'lucide-react';
import { t, type AppLanguage } from '../../utils/i18n';
import { OtpCodeInput } from './OtpCodeInput';

interface TwoFactorFormProps {
  language: AppLanguage;
  twoFaMode: 'totp' | 'backup';
  setTwoFaMode: (mode: 'totp' | 'backup') => void;
  totpCode: string;
  setTotpCode: (val: string) => void;
  loading: boolean;
  isConnected: boolean;
  onCancel: () => void;
  onClearError: () => void;
}

export const TwoFactorForm: React.FC<TwoFactorFormProps> = ({
  language,
  twoFaMode,
  setTwoFaMode,
  totpCode,
  setTotpCode,
  loading,
  isConnected,
  onCancel,
  onClearError,
}) => {
  return (
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
            onClearError();
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
            onClearError();
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
          onClick={onCancel}
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
  );
};
