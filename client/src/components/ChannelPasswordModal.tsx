import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, ShieldAlert } from 'lucide-react';

interface ChannelPasswordModalProps {
  channelName: string;
  channelId: string;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (password: string) => void;
}

export const ChannelPasswordModal: React.FC<ChannelPasswordModalProps> = ({
  channelName,
  errorMessage,
  onClose,
  onSubmit,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    onSubmit(password.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden ios-glass shadow-2xl border border-white/15 text-white p-6 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 shadow-lg shadow-amber-500/10">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">Korumalı Ses Odası</h3>
          <p className="text-xs text-white/60 mt-1">
            <span className="font-semibold text-amber-300">🔊 {channelName}</span> odasına katılmak için şifre gereklidir.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">
              Oda Şifresi
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifreyi giriniz..."
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-black/40 border border-white/15 focus:border-amber-400/60 text-xs text-white placeholder:text-white/30 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-white/40 hover:text-white/80 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-white/60 hover:text-white rounded-xl transition"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={!password.trim()}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-40 transition"
            >
              Odaya Katıl
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
