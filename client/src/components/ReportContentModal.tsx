import React, { useEffect, useRef, useState } from 'react';
import { Flag, Loader2, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { ContentReportCategory } from '../types';
import { appToast } from '../utils/appDialogs';
import { authFetch } from '../utils/authFetch';
import { t } from '../utils/i18n';

interface ReportContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUsername: string;
  serverId?: string;
  channelId?: string;
  messageId?: string;
  messagePreview?: string;
}

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  isOpen,
  onClose,
  targetUsername,
  serverId,
  channelId,
  messageId,
  messagePreview,
}) => {
  const { currentServerHost, language } = useAuth();
  const [category, setCategory] = useState<ContentReportCategory>('harassment');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCategory('harassment');
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, targetUsername, messageId]);

  useFocusTrap(modalRef, isOpen, onClose);

  if (!isOpen) return null;

  const categories: Array<{ id: ContentReportCategory; label: string }> = [
    { id: 'harassment', label: t(language, 'reportCatHarassment') },
    { id: 'spam', label: t(language, 'reportCatSpam') },
    { id: 'illegal', label: t(language, 'reportCatIllegal') },
    { id: 'malware', label: t(language, 'reportCatMalware') },
    { id: 'other', label: t(language, 'reportCatOther') },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 3) {
      setError('Lütfen en az 3 karakterlik bir gerekçe belirtin.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(currentServerHost, '/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUsername,
          category,
          reason: reason.trim(),
          ...(serverId ? { serverId } : {}),
          ...(channelId ? { channelId } : {}),
          ...(messageId ? { messageId } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || 'Şikayet gönderilemedi.');
        return;
      }
      appToast('Şikayet bildiriminiz moderasyon ekibine iletildi.', 'success');
      onClose();
    } catch {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0f131f]/95 text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-rose-500/10">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Flag className="w-4 h-4 text-rose-400" />
            <span>{t(language, 'reportModalTitle')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
            aria-label={t(language, 'close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs space-y-1">
            <div className="text-white/60">
              Hedef Kullanıcı: <strong className="text-white">@{targetUsername}</strong>
            </div>
            {messagePreview && (
              <div className="text-[11px] text-white/50 line-clamp-2 italic border-l-2 border-rose-400/50 pl-2 mt-1">
                {messagePreview}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/60 uppercase mb-1.5">
              {t(language, 'reportCategoryLabel')}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left border transition ${
                    category === cat.id
                      ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                      : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/60 uppercase mb-1.5">
              {t(language, 'reportReasonLabel')}
            </label>
            <textarea
              required
              rows={3}
              maxLength={600}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(language, 'reportReasonPlaceholder')}
              className="w-full px-3 py-2 rounded-xl bg-black/35 border border-white/15 text-xs text-white placeholder:text-white/35 outline-none focus:border-rose-400 resize-none"
            />
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 transition"
            >
              {t(language, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 3}
              className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{t(language, 'reportSubmitBtn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
