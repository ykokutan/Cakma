import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { CardSkeleton } from '../Skeleton';

interface StorageUsageSnapshot {
  totalBytes: number;
  fileCount: number;
  quotaBytes: number;
  usagePercent: number;
}

interface PaymentWebhookRecord {
  eventId: string;
  eventType: string;
  username: string;
  summary: string;
  processedAt: string;
}

function formatBytesReadable(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const AdminStorageAndWebhooksCard: React.FC<{ currentServerHost: string }> = ({
  currentServerHost,
}) => {
  const [usage, setUsage] = useState<StorageUsageSnapshot | null>(null);
  const [webhooks, setWebhooks] = useState<PaymentWebhookRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, wRes] = await Promise.all([
        authFetch(currentServerHost, '/api/storage/usage'),
        authFetch(currentServerHost, '/api/admin/payment-webhooks'),
      ]);
      if (uRes.ok) {
        const uJson = (await uRes.json()) as { ok?: boolean } & StorageUsageSnapshot;
        if (uJson.ok) {
          setUsage({
            totalBytes: uJson.totalBytes,
            fileCount: uJson.fileCount,
            quotaBytes: uJson.quotaBytes,
            usagePercent: uJson.usagePercent,
          });
        }
      }
      if (wRes.ok) {
        const wJson = (await wRes.json()) as { ok?: boolean; events?: PaymentWebhookRecord[] };
        if (wJson.ok && Array.isArray(wJson.events)) {
          setWebhooks(wJson.events);
        }
      }
    } catch {
      // ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, [currentServerHost]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePruneOld = async () => {
    setPruning(true);
    setNotice(null);
    try {
      const res = await authFetch(currentServerHost, '/api/storage/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxAgeDays: 30 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deletedCount?: number;
        freedBytes?: number;
        error?: string;
      };
      if (res.ok && data.ok) {
        setNotice(
          `${data.deletedCount || 0} eski dosya temizlendi (${formatBytesReadable(data.freedBytes || 0)} alan açıldı).`
        );
        await loadData();
      } else {
        setNotice(data.error || 'Depolama temizliği başarısız oldu.');
      }
    } catch {
      setNotice('Depolama temizliği sırasında ağ hatası oluştu.');
    } finally {
      setPruning(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          Yükleme Disk Kotası &amp; Ödeme Webhook Geçmişi
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-white/75 flex items-center gap-1 transition"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <button
            type="button"
            onClick={() => void handlePruneOld()}
            disabled={pruning}
            className="px-2.5 py-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-[11px] font-semibold text-rose-200 flex items-center gap-1 transition"
          >
            <Trash2 className="w-3 h-3" />
            <span>{pruning ? 'Temizleniyor...' : '30 Günden Eski Yüklemeleri Temizle'}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/25 text-xs text-cyan-200">
          {notice}
        </div>
      )}

      {loading && !usage ? (
        <CardSkeleton rows={3} />
      ) : usage ? (
        <div className="p-3.5 rounded-xl bg-black/25 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/70">
              Yüklenen Medya: <b className="text-white">{usage.fileCount} dosya</b>
            </span>
            <span className="font-mono font-bold text-cyan-300">
              {formatBytesReadable(usage.totalBytes)} / {formatBytesReadable(usage.quotaBytes)} (%{usage.usagePercent})
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                usage.usagePercent > 85
                  ? 'bg-rose-500'
                  : usage.usagePercent > 60
                    ? 'bg-amber-400'
                    : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, usage.usagePercent))}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-white/65 flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
          <span>Son Ödeme Webhook Olayları ({webhooks.length})</span>
        </div>
        {webhooks.length === 0 ? (
          <div className="text-[11px] text-white/40 px-3 py-2 rounded-xl bg-black/20 border border-white/5">
            Henüz kaydedilmiş ödeme webhook olayı bulunmuyor.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {webhooks.slice(0, 10).map((ev) => (
              <div
                key={ev.eventId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/25 border border-white/5 text-[11px]"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px]">
                    {ev.eventType}
                  </span>
                  <span className="font-semibold text-white">{ev.username}</span>
                  <span className="text-white/60 truncate">{ev.summary}</span>
                </div>
                <span className="font-mono text-[10px] text-white/40 shrink-0">
                  {new Date(ev.processedAt).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
