import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Flag, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import type { ContentReport } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { authFetch } from '../../utils/authFetch';

interface AdminReportsTabProps {
  currentServerHost: string;
  initialReports?: ContentReport[];
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  harassment: 'Taciz / Zorbalık',
  spam: 'Spam / Flood',
  illegal: '5651 Yasa Dışı İçerik',
  malware: 'Zararlı / Dolandırıcılık',
  other: 'Diğer',
};

export const AdminReportsTab: React.FC<AdminReportsTabProps> = ({
  currentServerHost,
  initialReports,
  onNotify,
}) => {
  const [reports, setReports] = useState<ContentReport[]>(() => initialReports || []);
  const [loading, setLoading] = useState(() => !Array.isArray(initialReports));
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasSocketReportsRef = useRef(Array.isArray(initialReports));

  useEffect(() => {
    if (Array.isArray(initialReports)) {
      hasSocketReportsRef.current = true;
      setReports(initialReports);
      setLoading(false);
    }
  }, [initialReports]);

  const loadReports = useCallback(
    async (manual = false) => {
      setLoading(true);
      try {
        const res = await authFetch(currentServerHost, '/api/admin/reports');
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reports?: ContentReport[];
        };
        if (res.ok && json.ok && Array.isArray(json.reports)) {
          setReports(json.reports);
        } else if (manual || !hasSocketReportsRef.current) {
          onNotify('error', 'Şikayet kayıtları alınamadı.');
        }
      } catch {
        if (manual || !hasSocketReportsRef.current) {
          onNotify('error', 'Şikayet kayıtları alınamadı.');
        }
      } finally {
        setLoading(false);
      }
    },
    [currentServerHost, onNotify]
  );

  useEffect(() => {
    void loadReports(false);
  }, [loadReports]);

  const handleAction = async (
    reportId: string,
    status: 'resolved' | 'dismissed',
    deleteMessage = false
  ) => {
    setBusyId(reportId);
    try {
      const res = await authFetch(currentServerHost, `/api/reports/${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, deleteMessage }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        report?: ContentReport;
        error?: string;
        deletedMessage?: boolean;
      };
      if (!res.ok || !json.ok || !json.report) {
        onNotify('error', json.error || 'İşlem başarısız oldu.');
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === reportId ? json.report! : r)));
      appToast(
        json.deletedMessage
          ? 'Şikayet çözüldü ve bildirilen mesaj silindi.'
          : status === 'resolved'
          ? 'Şikayet çözüldü olarak işaretlendi.'
          : 'Şikayet reddedildi.',
        'success'
      );
    } catch {
      onNotify('error', 'Sunucu ile iletişim kurulamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const visible = filter === 'open' ? reports.filter((r) => r.status === 'open') : reports;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-400" />
            <span>5651 &amp; İçerik Şikayet Yönetimi</span>
          </h3>
          <p className="text-xs text-white/50">
            Kullanıcılar tarafından bildirilen mesaj ve hesap şikayetlerini inceleyin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setFilter('open')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                filter === 'open' ? 'bg-rose-500 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Açık ({reports.filter((r) => r.status === 'open').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                filter === 'all' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Tümü ({reports.length})
            </button>
          </div>
          <button
            type="button"
            onClick={() => void loadReports(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 transition"
            title="Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-xs text-white/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Şikayet kayıtları yükleniyor...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center text-xs text-white/45 rounded-2xl border border-dashed border-white/10">
          {filter === 'open' ? 'Bekleyen açık şikayet bulunmuyor.' : 'Henüz hiç şikayet bildirimi oluşturulmamış.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((rep) => (
            <div
              key={rep.id}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      rep.status === 'open'
                        ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                        : rep.status === 'resolved'
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                        : 'bg-white/10 border-white/15 text-white/60'
                    }`}
                  >
                    {rep.status === 'open' ? 'Açık' : rep.status === 'resolved' ? 'Çözüldü' : 'Reddedildi'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 text-[10px] font-semibold border border-amber-400/30">
                    {CATEGORY_LABELS[rep.category] || rep.category}
                  </span>
                  <span className="text-white/80">
                    <strong>@{rep.reporterUsername}</strong> → <strong className="text-rose-200">@{rep.targetUsername}</strong>
                  </span>
                </div>
                <span className="text-[10px] font-mono text-white/40">
                  {new Date(rep.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="text-xs text-white/85">{rep.reason}</div>

              {rep.messageExcerpt && (
                <div className="p-2.5 rounded-xl bg-black/35 border-l-2 border-rose-400/50 text-[11px] text-white/65">
                  Bildirilen Mesaj: &ldquo;{rep.messageExcerpt}&rdquo;
                </div>
              )}

              {rep.status === 'open' ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {rep.channelId && rep.messageId && (
                    <button
                      type="button"
                      disabled={busyId === rep.id}
                      onClick={() => void handleAction(rep.id, 'resolved', true)}
                      className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 text-rose-200 text-[11px] font-semibold inline-flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Mesajı Sil &amp; Çözüldü İşaretle</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === rep.id}
                    onClick={() => void handleAction(rep.id, 'resolved', false)}
                    className="px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 text-[11px] font-semibold inline-flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Çözüldü</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyId === rep.id}
                    onClick={() => void handleAction(rep.id, 'dismissed', false)}
                    className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white/75 text-[11px] font-semibold inline-flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Reddet</span>
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-white/45">
                  İşlem: <strong>@{rep.resolvedBy}</strong> ({rep.resolvedAt ? new Date(rep.resolvedAt).toLocaleString() : ''})
                  {rep.resolutionNote ? ` · ${rep.resolutionNote}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
