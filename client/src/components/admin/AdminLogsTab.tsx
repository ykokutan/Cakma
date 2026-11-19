import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, Trash2 } from 'lucide-react';
import type { AdminDashboardData, RequestAdminDialogFn } from './adminTypes';
import {
  AuditDateRange,
  downloadTextFile,
  exportRowsToCsv,
  filterAuditLogsByDateRange,
} from '../../utils/adminHelpers';

interface AdminLogsTabProps {
  adminData: AdminDashboardData | null;
  onClearAuditLogs: () => void;
  onRequestDialog: RequestAdminDialogFn;
}

const LOGS_PER_PAGE = 30;

export const AdminLogsTab: React.FC<AdminLogsTabProps> = ({
  adminData,
  onClearAuditLogs,
  onRequestDialog,
}) => {
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'info' | 'warn' | 'voice' | 'auth' | 'security'>('all');
  const [dateRange, setDateRange] = useState<AuditDateRange>('all');
  const [page, setPage] = useState(1);

  const allLogs = adminData?.auditLogs || [];
  const filteredLogs = useMemo(() => {
    const byDate = filterAuditLogsByDateRange(allLogs, dateRange);
    return byDate.filter((log) => {
      if (logTypeFilter === 'security') {
        const act = (log.action || '').toUpperCase();
        const isSec =
          act.includes('GUVENLIK') ||
          act.includes('YASAK') ||
          act.includes('IP_') ||
          act.includes('2FA') ||
          act.includes('OTURUM') ||
          log.type === 'auth';
        if (!isSec) return false;
      } else if (logTypeFilter !== 'all' && log.type !== logTypeFilter) {
        return false;
      }
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        return log.action.toLowerCase().includes(q) || log.details.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allLogs, dateRange, logTypeFilter, logSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedLogs = filteredLogs.slice((safePage - 1) * LOGS_PER_PAGE, safePage * LOGS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [logSearchQuery, logTypeFilter, dateRange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Sistem &amp; Güvenlik Denetim Günlüğü ({filteredLogs.length} / {allLogs.length})
          </h3>
          <span className="text-[11px] text-white/40">Anlık olarak Socket üzerinden yayınlanır</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              placeholder="Loglarda ara..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-amber-500 w-44"
            />
          </div>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as AuditDateRange)}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white outline-none focus:ring-1 focus:ring-amber-500"
            title="Tarih Filtresi"
          >
            <option value="all" className="bg-[#151722]">Tüm Zamanlar</option>
            <option value="today" className="bg-[#151722]">Bugün</option>
            <option value="24h" className="bg-[#151722]">Son 24 Saat</option>
            <option value="7d" className="bg-[#151722]">Son 7 Gün</option>
          </select>

          <div className="flex bg-white/5 p-0.5 rounded-xl border border-white/10 text-[11px]">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'security', label: 'Güvenlik' },
              { id: 'info', label: 'Bilgi' },
              { id: 'warn', label: 'Uyarı' },
              { id: 'auth', label: 'Yetki' },
              { id: 'voice', label: 'Ses' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLogTypeFilter(t.id as any)}
                className={`px-2 py-1 rounded-lg font-semibold transition ${
                  logTypeFilter === t.id ? 'bg-amber-500 text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const csv = exportRowsToCsv(
                ['timestamp', 'type', 'action', 'details'],
                filteredLogs.map((l) => [l.timestamp, l.type, l.action, l.details])
              );
              downloadTextFile(
                `cakma-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
                csv,
                'text/csv;charset=utf-8'
              );
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-[11px] font-bold transition flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            CSV
          </button>

          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                `cakma-audit-logs-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(filteredLogs, null, 2),
                'application/json'
              )
            }
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-[11px] font-bold transition flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            JSON
          </button>

          <button
            type="button"
            onClick={() =>
              onRequestDialog({
                type: 'confirm',
                title: 'Denetim Günlüklerini Temizle',
                description: 'Tüm denetim günlüklerini kalıcı olarak temizlemek istediğinize emin misiniz?',
                confirmLabel: 'Günlükleri Temizle',
                tone: 'danger',
                onConfirm: onClearAuditLogs,
              })
            }
            className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-bold transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Temizle
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/40 p-3 space-y-2 font-mono text-xs max-h-[430px] overflow-y-auto">
        {paginatedLogs.map((log) => {
          let badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
          if (log.type === 'warn') badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
          if (log.type === 'voice') badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
          if (log.type === 'auth') badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';

          return (
            <div
              key={log.id}
              className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3"
            >
              <span className="text-white/30 shrink-0 text-[11px]">{log.timestamp}</span>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${badgeColor}`}>
                {log.action}
              </span>
              <span className="text-white/80 break-words">{log.details}</span>
            </div>
          );
        })}
        {paginatedLogs.length === 0 && (
          <div className="py-8 text-center text-white/30 text-xs">Eşleşen denetim kaydı bulunamadı.</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>
            Sayfa <b className="text-white">{safePage}</b> / {totalPages} ({filteredLogs.length} kayıt)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Önceki
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 border border-white/10 flex items-center gap-1"
            >
              Sonraki
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
