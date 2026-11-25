import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Flag, Loader2, RefreshCw, Search, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { ContentReport, ModerationCaseAction, Server, ServerAuditEntry, ServerModerationCase } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { authFetch } from '../../utils/authFetch';
import { t } from '../../utils/i18n';
import { isUserServerOwner } from '../../utils/serverIdentity';

interface ServerAuditAndModTabProps {
  server: Server;
  canModerate: boolean;
}

const ACTION_BADGES: Record<ModerationCaseAction, string> = {
  warn: 'bg-amber-500/20 text-amber-300 border-amber-500/35',
  timeout: 'bg-orange-500/20 text-orange-300 border-orange-500/35',
  untimeout: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35',
  kick: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
  ban: 'bg-red-600/25 text-red-300 border-red-500/40',
};

export const ServerAuditAndModTab: React.FC<ServerAuditAndModTabProps> = ({
  server,
  canModerate,
}) => {
  const {
    fetchServerAuditLogs,
    fetchServerCases,
    createServerModCase,
    currentServerHost,
    language,
  } = useSocket();

  const [subTab, setSubTab] = useState<'audit' | 'cases' | 'reports'>('audit');
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<ServerAuditEntry[]>([]);
  const [cases, setCases] = useState<ServerModerationCase[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create moderation case form
  const [targetUsername, setTargetUsername] = useState('');
  const [action, setAction] = useState<ModerationCaseAction>('warn');
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [logsRes, casesRes, reportsRes] = await Promise.all([
      fetchServerAuditLogs(server.id),
      fetchServerCases(server.id),
      authFetch(currentServerHost, `/api/servers/${encodeURIComponent(server.id)}/reports`)
        .then(async (r) => {
          const json = (await r.json().catch(() => ({}))) as { ok?: boolean; reports?: ContentReport[] };
          return r.ok && json.ok && Array.isArray(json.reports) ? json.reports : [];
        })
        .catch(() => [] as ContentReport[]),
    ]);
    setAuditLogs(logsRes);
    setCases(casesRes);
    setReports(reportsRes);
    setLoading(false);
  }, [currentServerHost, fetchServerAuditLogs, fetchServerCases, server.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSubmitCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModerate || !targetUsername.trim()) return;
    setSubmitting(true);
    const res = await createServerModCase(server.id, {
      targetUsername: targetUsername.trim(),
      action,
      reason: reason.trim() || 'Belirtilmedi',
      ...(action === 'timeout' ? { durationMinutes } : {}),
    });
    setSubmitting(false);
    if (!res.success) {
      appToast(res.error || 'İşlem kaydedilemedi.', 'error');
      return;
    }
    appToast('Moderasyon işlemi uygulandı ve sicile kaydedildi.', 'success');
    setReason('');
    await loadData();
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredAudit = auditLogs.filter(
    (entry) =>
      !q ||
      entry.action.toLowerCase().includes(q) ||
      entry.actorUsername.toLowerCase().includes(q) ||
      (entry.targetLabel || '').toLowerCase().includes(q) ||
      entry.details.toLowerCase().includes(q)
  );
  const filteredCases = cases.filter(
    (c) =>
      !q ||
      c.targetUsername.toLowerCase().includes(q) ||
      c.moderatorUsername.toLowerCase().includes(q) ||
      c.action.toLowerCase().includes(q) ||
      c.reason.toLowerCase().includes(q)
  );
  const filteredReports = reports.filter(
    (r) =>
      !q ||
      r.targetUsername.toLowerCase().includes(q) ||
      r.reporterUsername.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q)
  );

  const handleResolveReport = async (
    reportId: string,
    status: 'resolved' | 'dismissed',
    deleteMessage = false
  ) => {
    setReportBusyId(reportId);
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
        appToast(json.error || 'Şikayet güncellenemedi.', 'error');
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === reportId ? json.report! : r)));
      appToast(
        json.deletedMessage ? 'Mesaj silindi ve şikayet çözüldü.' : 'Şikayet güncellendi.',
        'success'
      );
    } catch {
      appToast('Sunucuya bağlanılamadı.', 'error');
    } finally {
      setReportBusyId(null);
    }
  };

  const selectableMembers = (server.members || []).filter(
    (m) => !m.isOwner && !isUserServerOwner({ id: m.userId, username: m.username }, server)
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {t(language, 'serverAuditLog')} &amp; {t(language, 'moderationCases')}
          </h2>
          <p className="text-xs text-white/50">
            Sunucuda gerçekleşen yönetici aksiyonlarını inceleyin ve üye moderasyon sicili yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Yenile</span>
        </button>
      </div>

      {/* Sub-navigation & filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              subTab === 'audit' ? 'bg-blue-500 text-white shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t(language, 'serverAuditLog')} ({auditLogs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('cases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              subTab === 'cases' ? 'bg-amber-500 text-black shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{t(language, 'moderationCases')} ({cases.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              subTab === 'reports' ? 'bg-rose-500 text-white shadow' : 'text-white/60 hover:text-white'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            <span>Şikayetler ({reports.filter((r) => r.status === 'open').length})</span>
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Aktör, hedef veya detay ara..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {subTab === 'cases' && canModerate && (
        <form
          onSubmit={handleSubmitCase}
          className="p-4 rounded-2xl bg-amber-500/[0.07] border border-amber-500/25 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>{t(language, 'warnMember')} / Moderasyon İşlemi Uygula</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                Hedef Üye
              </label>
              <input
                list="mod-target-members"
                type="text"
                required
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                placeholder="Kullanıcı adı..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-amber-400"
              />
              <datalist id="mod-target-members">
                {selectableMembers.map((m) => (
                  <option key={m.username} value={m.username} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                İşlem Türü
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as ModerationCaseAction)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
              >
                <option value="warn" className="bg-neutral-900">Uyarı (Warn)</option>
                <option value="timeout" className="bg-neutral-900">Sustur (Timeout)</option>
                <option value="untimeout" className="bg-neutral-900">Susturmayı Kaldır</option>
                <option value="kick" className="bg-neutral-900">Sunucudan At (Kick)</option>
                <option value="ban" className="bg-neutral-900">Yasakla (Ban)</option>
              </select>
            </div>

            {action === 'timeout' ? (
              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  Süre (Dakika)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(1, Math.min(10080, Number(e.target.value) || 10)))}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">
                  Kısa Sebep
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Kural ihlali..."
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {action === 'timeout' && (
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Moderasyon sebebi..."
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-amber-400"
            />
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !targetUsername.trim()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition disabled:opacity-40"
            >
              {submitting ? 'Kaydediliyor...' : 'İşlemi Uygula'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-xs text-white/40">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Yükleniyor...</span>
        </div>
      ) : subTab === 'audit' ? (
        filteredAudit.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
            Görüntülenecek denetim kaydı bulunamadı.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredAudit.map((entry) => (
              <div
                key={entry.id}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/30 text-blue-300 font-mono text-[10px] font-bold">
                      {entry.action}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      @{entry.actorUsername}
                    </span>
                    {entry.targetLabel && (
                      <span className="text-[11px] text-white/60 truncate">
                        → {entry.targetLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/40 shrink-0 font-mono">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-white/75">{entry.details}</div>
              </div>
            ))}
          </div>
        )
      ) : subTab === 'reports' ? (
        filteredReports.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
            Bu sunucu için şikayet kaydı bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredReports.map((rep) => (
              <div
                key={rep.id}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                        rep.status === 'open'
                          ? 'bg-rose-500/20 border-rose-500/35 text-rose-300'
                          : rep.status === 'resolved'
                          ? 'bg-emerald-500/20 border-emerald-500/35 text-emerald-300'
                          : 'bg-white/10 border-white/15 text-white/60'
                      }`}
                    >
                      {rep.status === 'open' ? 'Açık' : rep.status === 'resolved' ? 'Çözüldü' : 'Reddedildi'}
                    </span>
                    <span className="text-white/75 truncate">
                      @{rep.reporterUsername} → <strong className="text-rose-200">@{rep.targetUsername}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40 font-mono shrink-0">
                    {new Date(rep.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-white/80">{rep.reason}</div>
                {rep.messageExcerpt && (
                  <div className="text-[11px] text-white/55 italic border-l-2 border-rose-400/40 pl-2">
                    &ldquo;{rep.messageExcerpt}&rdquo;
                  </div>
                )}
                {rep.status === 'open' && canModerate && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {rep.channelId && rep.messageId && (
                      <button
                        type="button"
                        disabled={reportBusyId === rep.id}
                        onClick={() => void handleResolveReport(rep.id, 'resolved', true)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/35 text-rose-200 text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Mesajı Sil &amp; Çöz</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={reportBusyId === rep.id}
                      onClick={() => void handleResolveReport(rep.id, 'resolved', false)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-emerald-200 text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Çözüldü</span>
                    </button>
                    <button
                      type="button"
                      disabled={reportBusyId === rep.id}
                      onClick={() => void handleResolveReport(rep.id, 'dismissed', false)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white/75 text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Reddet</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : filteredCases.length === 0 ? (
        <div className="py-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
          Kayıtlı moderasyon vakası bulunamadı.
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {filteredCases.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                      ACTION_BADGES[item.action] || 'bg-white/10 text-white'
                    }`}
                  >
                    {item.action}
                    {item.durationMinutes ? ` (${item.durationMinutes} dk)` : ''}
                  </span>
                  <span className="text-xs font-bold text-white truncate">
                    @{item.targetUsername}
                  </span>
                  <span className="text-[11px] text-white/45 truncate">
                    Mod: @{item.moderatorUsername}
                  </span>
                </div>
                <span className="text-[10px] text-white/40 shrink-0 font-mono">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-white/75">{item.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
