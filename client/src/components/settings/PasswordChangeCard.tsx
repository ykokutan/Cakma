import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { evaluatePasswordStrength } from '../../utils/authValidation';

const STRENGTH_BAR_COLORS = ['bg-white/10', 'bg-rose-500', 'bg-amber-400', 'bg-emerald-400', 'bg-teal-400'];

export const PasswordChangeCard: React.FC = () => {
  const { isAuthenticated, changePassword } = useAuth();

  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const strength = newPasswordInput.length > 0 ? evaluatePasswordStrength(newPasswordInput) : null;

  return (
    <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Lock className="w-4 h-4 text-amber-400" />
        <span>Şifre Değiştir</span>
      </div>

      {!isAuthenticated ? (
        <p className="text-xs text-white/50">
          Şifre değiştirebilmek için kayıtlı bir hesapla giriş yapmış olmalısınız.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPasswordStatus(null);
            if (newPasswordInput.length < 6) {
              setPasswordStatus({ type: 'error', text: 'Yeni şifre en az 6 karakter olmalıdır.' });
              return;
            }
            if (newPasswordInput !== confirmPasswordInput) {
              setPasswordStatus({ type: 'error', text: 'Yeni şifreler eşleşmiyor.' });
              return;
            }
            setIsChangingPassword(true);
            const res = await changePassword(currentPasswordInput, newPasswordInput);
            setIsChangingPassword(false);
            if (res.success) {
              setPasswordStatus({ type: 'success', text: res.message || 'Şifreniz başarıyla güncellendi.' });
              setCurrentPasswordInput('');
              setNewPasswordInput('');
              setConfirmPasswordInput('');
            } else {
              setPasswordStatus({ type: 'error', text: res.error || 'Şifre güncellenemedi.' });
            }
          }}
          className="space-y-2.5"
        >
          <input
            type="password"
            required
            value={currentPasswordInput}
            onChange={(e) => setCurrentPasswordInput(e.target.value)}
            placeholder="Mevcut Şifre"
            className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="password"
              required
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              placeholder="Yeni Şifre (en az 6 karakter)"
              className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="password"
              required
              value={confirmPasswordInput}
              onChange={(e) => setConfirmPasswordInput(e.target.value)}
              placeholder="Yeni Şifre (Tekrar)"
              className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {strength && (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((seg) => (
                  <div
                    key={seg}
                    className={`h-1.5 rounded-full transition-all ${
                      strength.level >= seg ? STRENGTH_BAR_COLORS[strength.level] : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-white/70">{strength.label}</span>
            </div>
          )}
          {passwordStatus && (
            <div
              className={`text-xs px-3 py-2 rounded-xl border ${
                passwordStatus.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/15 border-red-500/30 text-red-300'
              }`}
            >
              {passwordStatus.text}
            </div>
          )}
          <button
            type="submit"
            disabled={isChangingPassword}
            className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition disabled:opacity-50"
          >
            {isChangingPassword ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
          </button>
        </form>
      )}
    </div>
  );
};
