import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserX,
  Wallet,
  X,
} from 'lucide-react';
import type { AdminDialogState } from './adminTypes';
import { generateStrongPassword } from '../../utils/adminHelpers';

interface AdminActionDialogsProps {
  dialog: AdminDialogState | null;
  onClose: () => void;
}

export const AdminActionDialogs: React.FC<AdminActionDialogsProps> = ({ dialog, onClose }) => {
  const [banReason, setBanReason] = useState('Kural ihlali');
  const [banMinutes, setBanMinutes] = useState<number>(0);

  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const [walletMode, setWalletMode] = useState<'set' | 'add'>('set');
  const [walletAmount, setWalletAmount] = useState<string>('0');

  const [kickReason, setKickReason] = useState('Kural ihlali');

  const [ipReason, setIpReason] = useState('Şüpheli trafik / kural ihlali');
  const [ipMinutes, setIpMinutes] = useState<number>(0);

  const [purgeMode, setPurgeMode] = useState<'last_n' | 'all'>('last_n');
  const [purgeCount, setPurgeCount] = useState<number>(50);
  const [purgeAllConfirmed, setPurgeAllConfirmed] = useState(false);

  useEffect(() => {
    if (!dialog) return;
    if (dialog.type === 'ban_user') {
      setBanReason('Kural ihlali');
      setBanMinutes(0);
    } else if (dialog.type === 'reset_password') {
      setNewPassword('');
      setShowPassword(false);
      setCopiedPass(false);
    } else if (dialog.type === 'edit_wallet') {
      if (dialog.targets.length === 1 && dialog.currentBalance !== undefined) {
        setWalletMode('set');
        setWalletAmount(String(dialog.currentBalance));
      } else {
        setWalletMode('add');
        setWalletAmount('100');
      }
    } else if (dialog.type === 'kick_user') {
      setKickReason('Kural ihlali');
    } else if (dialog.type === 'ban_ip') {
      setIpReason(dialog.defaultReason || 'Şüpheli trafik / kural ihlali');
      setIpMinutes(0);
    } else if (dialog.type === 'purge_messages') {
      setPurgeMode('last_n');
      setPurgeCount(50);
      setPurgeAllConfirmed(false);
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, onClose]);

  if (!dialog) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl ios-glass border border-white/15 shadow-2xl p-6 space-y-4 relative bg-[#11131b]/95"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition"
          aria-label="Kapat"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 1. CONFIRM DIALOG */}
        {dialog.type === 'confirm' && (
          <>
            <div className="flex items-start gap-3 pr-6">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                  dialog.tone === 'danger'
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : dialog.tone === 'amber'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{dialog.title}</h3>
                <p className="text-xs text-white/65 mt-1 leading-relaxed">{dialog.description}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75 transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  dialog.onConfirm();
                  onClose();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg ${
                  dialog.tone === 'danger'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25'
                    : dialog.tone === 'amber'
                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25'
                    : 'bg-teal-500 hover:bg-teal-400 text-black shadow-teal-500/25'
                }`}
              >
                {dialog.confirmLabel || 'Onayla'}
              </button>
            </div>
          </>
        )}

        {/* 2. BAN USER DIALOG */}
        {dialog.type === 'ban_user' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              dialog.onSubmit(banReason.trim() || 'Kural ihlali', Math.max(0, Number(banMinutes) || 0));
              onClose();
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {dialog.targets.length > 1
                    ? `Toplu Yasaklama (${dialog.targets.length} Kullanıcı)`
                    : `Hesabı Yasakla: ${dialog.targets[0]}`}
                </h3>
                <p className="text-xs text-white/55 mt-0.5">
                  Yasaklanan hesapların aktif oturumları derhal kesilir.
                </p>
              </div>
            </div>

            {dialog.targets.length > 1 && (
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-2 rounded-xl bg-black/30 border border-white/10">
                {dialog.targets.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-200 text-[11px] font-semibold">
                    @{t}
                  </span>
                ))}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-white/55 uppercase mb-1">Yasaklama Sebebi</label>
              <input
                type="text"
                autoFocus
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Örn: Kural ihlali / Spam"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-rose-400"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-white/55 uppercase">Süre Seçimi</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { mins: 15, label: '15 dk' },
                  { mins: 60, label: '1 Saat' },
                  { mins: 1440, label: '24 Saat' },
                  { mins: 10080, label: '7 Gün' },
                  { mins: 0, label: 'Kalıcı' },
                ].map((p) => (
                  <button
                    key={p.mins}
                    type="button"
                    onClick={() => setBanMinutes(p.mins)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                      banMinutes === p.mins
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                        : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-white/45 shrink-0">Özel (dakika, 0 = Kalıcı):</span>
                <input
                  type="number"
                  min={0}
                  value={banMinutes}
                  onChange={(e) => setBanMinutes(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/15 text-xs text-white font-mono outline-none focus:border-rose-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-lg shadow-rose-500/25"
              >
                Yasakla
              </button>
            </div>
          </form>
        )}

        {/* 3. MASKED PASSWORD RESET DIALOG */}
        {dialog.type === 'reset_password' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword.length < 6) return;
              dialog.onSubmit(newPassword);
              onClose();
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Şifre Sıfırla: @{dialog.username}</h3>
                <p className="text-xs text-white/55 mt-0.5">
                  Yeni şifre en az 6 karakter olmalı ve mevcut tokenlar iptal edilir.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Yeni şifre (min 6 karakter)..."
                    className="w-full pl-3 pr-9 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white font-mono outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                    title={showPassword ? 'Gizle' : 'Göster'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newPassword) return;
                    navigator.clipboard.writeText(newPassword);
                    setCopiedPass(true);
                    setTimeout(() => setCopiedPass(false), 1800);
                  }}
                  disabled={!newPassword}
                  className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-xs text-white/80 flex items-center gap-1"
                  title="Kopyala"
                >
                  {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewPassword(generateStrongPassword(14));
                    setShowPassword(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-[11px] font-semibold flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  Rastgele Üret
                </button>
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <span className="text-[11px] text-rose-400">En az 6 karakter girin</span>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={newPassword.length < 6}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-indigo-500/25"
              >
                Şifreyi Güncelle
              </button>
            </div>
          </form>
        )}

        {/* 4. EDIT WALLET DIALOG */}
        {dialog.type === 'edit_wallet' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = Number(walletAmount);
              if (Number.isNaN(parsed)) return;
              dialog.onSubmit(parsed, walletMode);
              onClose();
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {dialog.targets.length > 1
                    ? `Toplu Bakiye Güncelle (${dialog.targets.length} Kullanıcı)`
                    : `Cüzdan Bakiyesi: @${dialog.targets[0]}`}
                </h3>
                <p className="text-xs text-white/55 mt-0.5">
                  Sabit değer atayabilir veya mevcut bakiyeye ekleyip çıkarabilirsiniz.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setWalletMode('set')}
                className={`py-1.5 rounded-lg font-semibold transition ${
                  walletMode === 'set' ? 'bg-emerald-500 text-black' : 'text-white/65 hover:text-white'
                }`}
              >
                Sabit Değer Belirle
              </button>
              <button
                type="button"
                onClick={() => setWalletMode('add')}
                className={`py-1.5 rounded-lg font-semibold transition ${
                  walletMode === 'add' ? 'bg-emerald-500 text-black' : 'text-white/65 hover:text-white'
                }`}
              >
                Ekle / Çıkar (±₺)
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[50, 100, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      if (walletMode === 'add') {
                        setWalletAmount(String(amt));
                      } else {
                        setWalletAmount(String((Number(walletAmount) || 0) + amt));
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold"
                  >
                    +{amt}₺
                  </button>
                ))}
              </div>
              <input
                type="number"
                autoFocus
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="Miktar (₺)"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white font-mono outline-none focus:border-emerald-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={walletAmount.trim() === '' || Number.isNaN(Number(walletAmount))}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black text-xs font-bold shadow-lg shadow-emerald-500/25"
              >
                Bakiyeyi Güncelle
              </button>
            </div>
          </form>
        )}

        {/* 5. KICK USER DIALOG */}
        {dialog.type === 'kick_user' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              dialog.onSubmit(kickReason.trim() || 'Kural ihlali');
              onClose();
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Bağlantıyı Kes: @{dialog.username}</h3>
                <p className="text-xs text-white/55 mt-0.5">
                  Kullanıcının anlık soket bağlantısı sonlandırılır.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {['Kural ihlali', 'Ses odası rahatsızlığı', 'Yetkili tarafından çıkarıldı'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setKickReason(preset)}
                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-white/75"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                autoFocus
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                placeholder="Sunucudan atma sebebi..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
              >
                Bağlantıyı Kes
              </button>
            </div>
          </form>
        )}

        {/* 6. BAN IP DIALOG */}
        {dialog.type === 'ban_ip' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              dialog.onSubmit(ipReason.trim() || 'Yönetici engeli', Math.max(0, Number(ipMinutes) || 0));
              onClose();
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">IP Adresini Engelle</h3>
                <div className="mt-1 inline-block px-2 py-0.5 rounded bg-black/50 border border-white/10 font-mono text-xs text-amber-300">
                  {dialog.ip}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/55 uppercase mb-1">Engelleme Sebebi</label>
              <input
                type="text"
                autoFocus
                value={ipReason}
                onChange={(e) => setIpReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-rose-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/55 uppercase">Engel Süresi</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { mins: 60, label: '1 Saat' },
                  { mins: 1440, label: '24 Saat' },
                  { mins: 10080, label: '7 Gün' },
                  { mins: 0, label: 'Kalıcı' },
                ].map((p) => (
                  <button
                    key={p.mins}
                    type="button"
                    onClick={() => setIpMinutes(p.mins)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                      ipMinutes === p.mins
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                        : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
              >
                IP Engelle
              </button>
            </div>
          </form>
        )}

        {/* 7. PURGE CHANNEL MESSAGES DIALOG */}
        {dialog.type === 'purge_messages' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (purgeMode === 'all' && !purgeAllConfirmed) return;
              if (purgeMode === 'all') {
                dialog.onSubmit('all');
              } else {
                dialog.onSubmit('last_n', Math.min(1000, Math.max(1, Number(purgeCount) || 50)));
              }
              onClose();
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Mesajları Temizle: #{dialog.channelName}</h3>
                <p className="text-xs text-white/55 mt-0.5">
                  Silinen mesajlar kalıcı olarak kaldırılır.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setPurgeMode('last_n')}
                className={`py-1.5 rounded-lg font-semibold transition ${
                  purgeMode === 'last_n' ? 'bg-amber-500 text-black' : 'text-white/65 hover:text-white'
                }`}
              >
                Son N Mesaj
              </button>
              <button
                type="button"
                onClick={() => setPurgeMode('all')}
                className={`py-1.5 rounded-lg font-semibold transition ${
                  purgeMode === 'all' ? 'bg-rose-500 text-white' : 'text-white/65 hover:text-white'
                }`}
              >
                TÜM Mesajları Sil
              </button>
            </div>

            {purgeMode === 'last_n' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {[25, 50, 100, 500].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPurgeCount(n)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        purgeCount === n
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                      }`}
                    >
                      Son {n}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={purgeCount}
                  onChange={(e) => setPurgeCount(Math.min(1000, Math.max(1, Number(e.target.value) || 50)))}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white font-mono outline-none focus:border-amber-400"
                />
              </div>
            ) : (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 cursor-pointer text-xs text-rose-200">
                <input
                  type="checkbox"
                  checked={purgeAllConfirmed}
                  onChange={(e) => setPurgeAllConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-rose-400 bg-black/40 text-rose-500"
                />
                <span>#{dialog.channelName} kanalındaki tüm mesaj geçmişinin kalıcı olarak silineceğini onaylıyorum.</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={purgeMode === 'all' && !purgeAllConfirmed}
                className={`px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40 ${
                  purgeMode === 'all' ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'
                }`}
              >
                {purgeMode === 'all' ? 'Tümünü Sil' : `Son ${purgeCount} Mesajı Sil`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
