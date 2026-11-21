import React, { useEffect, useState } from 'react';
import { Download, KeyRound, Loader2, Mail, MailCheck, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { t } from '../../utils/i18n';
import { normalizeOtpInput, validateEmail } from '../../utils/authValidation';
import { exportEncryptedE2eeBackup, importEncryptedE2eeBackup } from '../../utils/e2ee';
import { OtpCodeInput } from '../auth/OtpCodeInput';
import { PasskeySettingsCard } from './PasskeySettingsCard';

export const AccountSecuritySection: React.FC = () => {
  const { socket } = useSocket();
  const {
    currentUser,
    isAuthenticated,
    requestEmailChangeCode,
    confirmEmailChange,
    deleteMyAccount,
    language,
  } = useAuth();

  // E2EE Encrypted Key Backup State
  const [e2eeExportPass, setE2eeExportPass] = useState('');
  const [e2eeImportPass, setE2eeImportPass] = useState('');
  const [e2eeImportJson, setE2eeImportJson] = useState('');
  const [e2eeBusy, setE2eeBusy] = useState(false);
  const [e2eeStatus, setE2eeStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Email change state
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStepSent, setEmailStepSent] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Account deletion state
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteTotp, setDeleteTotp] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = window.setTimeout(() => setEmailCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [emailCooldown]);

  if (!isAuthenticated) {
    return null;
  }

  const handleRequestEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailStatus(null);
    if (!validateEmail(newEmail)) {
      setEmailStatus({ type: 'error', text: 'Lütfen geçerli bir yeni e-posta adresi girin.' });
      return;
    }
    setEmailBusy(true);
    const res = await requestEmailChangeCode(emailPassword, newEmail.trim());
    setEmailBusy(false);
    if (res.success) {
      setEmailStepSent(true);
      setEmailCooldown(60);
      setEmailStatus({ type: 'success', text: res.message || 'Doğrulama kodu gönderildi.' });
    } else {
      setEmailStatus({ type: 'error', text: res.error || 'Doğrulama kodu gönderilemedi.' });
    }
  };

  const handleConfirmEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailStatus(null);
    const cleaned = normalizeOtpInput(emailCode, 6);
    if (cleaned.length !== 6) {
      setEmailStatus({ type: 'error', text: 'Lütfen 6 haneli doğrulama kodunu eksiksiz girin.' });
      return;
    }
    setEmailBusy(true);
    const res = await confirmEmailChange(cleaned);
    setEmailBusy(false);
    if (res.success) {
      setEmailStatus({ type: 'success', text: res.message || 'E-posta adresiniz güncellendi.' });
      setEmailPassword('');
      setNewEmail('');
      setEmailCode('');
      setEmailStepSent(false);
    } else {
      setEmailStatus({ type: 'error', text: res.error || 'E-posta doğrulanamadı.' });
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    const norm = deleteConfirm.trim().toUpperCase();
    if (!['SİL', 'SIL', 'DELETE'].includes(norm)) {
      setDeleteError('Onaylamak için kutucuğa SİL yazmalısınız.');
      return;
    }
    setDeleteBusy(true);
    const res = await deleteMyAccount(
      deletePassword,
      deleteConfirm.trim(),
      currentUser?.twoFactorEnabled ? deleteTotp.trim() : undefined
    );
    setDeleteBusy(false);
    if (!res.success) {
      setDeleteError(res.error || 'Hesap silinemedi.');
    }
  };

  return (
    <div className="space-y-6">
      {/* OTP-Verified Email Change */}
      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Mail className="w-4 h-4 text-sky-400" />
              <span>{t(language, 'changeEmailTitle')}</span>
            </div>
            <p className="text-[11px] text-white/50 mt-0.5">{t(language, 'changeEmailDesc')}</p>
          </div>
          {currentUser?.email && (
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-white/75">
              {currentUser.email}
            </span>
          )}
        </div>

        <form onSubmit={handleRequestEmailCode} className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="password"
              required
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Mevcut Şifreniz"
              className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
            />
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="yeni@eposta.com"
              className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={emailBusy || emailCooldown > 0 || !emailPassword || !validateEmail(newEmail)}
            className="px-4 py-2 rounded-full bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/35 text-sky-200 text-xs font-semibold transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {emailBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MailCheck className="w-3.5 h-3.5" />}
            {emailCooldown > 0 ? `${emailCooldown} sn bekleyin` : t(language, 'sendCode')}
          </button>
        </form>

        {emailStepSent && (
          <form onSubmit={handleConfirmEmail} className="pt-2 border-t border-white/10 space-y-2.5 animate-fade-in">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase">
              Yeni E-Postaya Gelen 6 Haneli Doğrulama Kodu
            </div>
            <OtpCodeInput
              value={emailCode}
              onChange={setEmailCode}
              length={6}
              accent="emerald"
              disabled={emailBusy}
              ariaLabel="Yeni e-posta doğrulama kodu"
            />
            <button
              type="submit"
              disabled={emailBusy || normalizeOtpInput(emailCode, 6).length !== 6}
              className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition disabled:opacity-50"
            >
              {emailBusy ? 'Doğrulanıyor...' : 'E-Postayı Onayla ve Güncelle'}
            </button>
          </form>
        )}

        {emailStatus && (
          <div
            className={`text-xs px-3 py-2 rounded-xl border ${
              emailStatus.type === 'success'
                ? 'bg-emerald-400/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/15 border-red-500/30 text-red-300'
            }`}
          >
            {emailStatus.text}
          </div>
        )}
      </div>

      {/* Dangerous Zone: Permanent Account Deletion */}
      <div className="p-4 rounded-2xl bg-red-500/[0.06] border border-red-500/25 space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span>{t(language, 'deleteAccountTitle')}</span>
          </div>
          <p className="text-[11px] text-white/55 mt-0.5">{t(language, 'deleteAccountDesc')}</p>
        </div>

        <form onSubmit={handleDeleteAccount} className="space-y-2.5">
          <div className={`grid grid-cols-1 ${currentUser?.twoFactorEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2.5`}>
            <input
              type="password"
              required
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Mevcut Şifre"
              className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
            />
            {currentUser?.twoFactorEnabled && (
              <input
                type="text"
                required
                value={deleteTotp}
                onChange={(e) => setDeleteTotp(e.target.value)}
                placeholder="2FA Kodu (6 hane)"
                className="w-full bg-black/30 border border-white/10 text-white font-mono text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
              />
            )}
            <input
              type="text"
              required
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder='Onay için "SİL" yazın'
              className="w-full bg-black/30 border border-red-500/35 text-white font-mono text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {deleteError && (
            <div className="text-xs px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/35 text-red-300">
              {deleteError}
            </div>
          )}

          <button
            type="submit"
            disabled={deleteBusy || !deletePassword || !['SİL', 'SIL', 'DELETE'].includes(deleteConfirm.trim().toUpperCase())}
            className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {deleteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {t(language, 'deleteAccountConfirmBtn')}
          </button>
        </form>
      </div>

      {/* E2EE Key Encrypted Backup & Restore */}
      <div className="p-4 rounded-2xl bg-white/[0.04] border border-emerald-500/20 space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <span>E2EE Anahtar Yedeği (Çoklu Cihaz Kurtarma)</span>
          </div>
          <p className="text-[11px] text-white/55 mt-0.5">
            DM şifreleme anahtarınız IndexedDB içinde saklanır. Başka bir cihazda eski şifreli mesajlarınızı okumak için PBKDF2 + AES-GCM ile şifreli yedek indirebilir veya içe aktarabilirsiniz.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!currentUser?.username) return;
              setE2eeStatus(null);
              setE2eeBusy(true);
              const res = await exportEncryptedE2eeBackup(currentUser.username, e2eeExportPass);
              setE2eeBusy(false);
              if (!res.ok) {
                setE2eeStatus({ type: 'error', text: res.error });
                return;
              }
              const blob = new Blob([res.backupJson], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `cakma-e2ee-yedek-${currentUser.username}.json`;
              a.click();
              URL.revokeObjectURL(url);
              setE2eeExportPass('');
              setE2eeStatus({ type: 'success', text: 'Şifreli E2EE anahtar yedeği başarıyla indirildi.' });
            }}
            className="p-3 rounded-xl bg-black/25 border border-white/10 space-y-2"
          >
            <div className="text-xs font-semibold text-white">Yedek İndir</div>
            <input
              type="password"
              required
              value={e2eeExportPass}
              onChange={(e) => setE2eeExportPass(e.target.value)}
              placeholder="Yedek koruma parolası (en az 6 kar.)"
              className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={e2eeBusy || e2eeExportPass.trim().length < 6}
              className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition"
            >
              <Download className="w-3.5 h-3.5" /> Şifreli Yedek Al
            </button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!currentUser?.username) return;
              setE2eeStatus(null);
              setE2eeBusy(true);
              const res = await importEncryptedE2eeBackup(currentUser.username, e2eeImportJson, e2eeImportPass);
              setE2eeBusy(false);
              if (!res.ok) {
                setE2eeStatus({ type: 'error', text: res.error });
                return;
              }
              socket?.emit('e2ee_publish_key', { publicKey: JSON.stringify(res.publicKeyJwk) });
              setE2eeImportPass('');
              setE2eeImportJson('');
              setE2eeStatus({ type: 'success', text: 'E2EE anahtarı başarıyla geri yüklendi ve sunucuda güncellendi.' });
            }}
            className="p-3 rounded-xl bg-black/25 border border-white/10 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">Yedekten Geri Yükle</span>
              <label className="text-[11px] font-semibold text-emerald-300 hover:underline cursor-pointer">
                Dosya Seç
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') setE2eeImportJson(reader.result);
                    };
                    reader.readAsText(f);
                    ev.target.value = '';
                  }}
                />
              </label>
            </div>
            <textarea
              rows={2}
              required
              value={e2eeImportJson}
              onChange={(e) => setE2eeImportJson(e.target.value)}
              placeholder="Yedek JSON içeriğini yapıştırın veya dosya seçin..."
              className="w-full bg-black/30 border border-white/10 text-white font-mono text-[10px] rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="password"
                required
                value={e2eeImportPass}
                onChange={(e) => setE2eeImportPass(e.target.value)}
                placeholder="Yedek parolası"
                className="flex-1 min-w-0 bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={e2eeBusy || !e2eeImportJson.trim() || !e2eeImportPass.trim()}
                className="px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50 shrink-0 transition"
              >
                <Upload className="w-3.5 h-3.5" /> Yükle
              </button>
            </div>
          </form>
        </div>

        {e2eeStatus && (
          <div
            className={`text-xs px-3 py-2 rounded-xl border ${
              e2eeStatus.type === 'success'
                ? 'bg-emerald-400/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/15 border-red-500/30 text-red-300'
            }`}
          >
            {e2eeStatus.text}
          </div>
        )}
      </div>

      <PasskeySettingsCard />
    </div>
  );
};
