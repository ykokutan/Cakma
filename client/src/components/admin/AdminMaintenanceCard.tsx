import React, { useCallback, useEffect, useState } from 'react';
import { CloudUpload, Database, Download, FolderSearch, HardDriveDownload, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { authFetch } from '../../utils/authFetch';
import { t } from '../../utils/i18n';
import type { RequestAdminDialogFn } from './adminTypes';

interface SqliteBackupEntry {
  filename: string;
  bytes: number;
  createdAt: string;
}

interface OrphanScanSummary {
  scannedFiles: number;
  orphanFiles: number;
  deletedFiles: number;
  freedBytes: number;
  orphanNames: string[];
  dryRun: boolean;
}

interface AdminMaintenanceCardProps {
  currentServerHost: string;
  onRequestDialog: RequestAdminDialogFn;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AdminMaintenanceCard: React.FC<AdminMaintenanceCardProps> = ({
  currentServerHost,
  onRequestDialog,
  onNotify,
}) => {
  const { language } = useSocket();
  const [sqliteActive, setSqliteActive] = useState(false);
  const [backups, setBackups] = useState<SqliteBackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [pushingName, setPushingName] = useState<string | null>(null);

  const [minAgeHours, setMinAgeHours] = useState(24);
  const [scanResult, setScanResult] = useState<OrphanScanSummary | null>(null);
  const [scanningOrphans, setScanningOrphans] = useState(false);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const resp = await authFetch(currentServerHost, '/api/admin/backups');
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.ok) {
        setSqliteActive(Boolean(data.sqliteActive));
        setBackups(Array.isArray(data.backups) ? data.backups : []);
      }
    } catch {
      // ignore if unsupported on legacy server
    } finally {
      setLoadingBackups(false);
    }
  }, [currentServerHost]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const resp = await authFetch(currentServerHost, '/api/admin/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'manual' }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        onNotify('error', data?.error || 'SQLite yedeği alınamadı.');
        return;
      }
      setBackups(Array.isArray(data.backups) ? data.backups : []);
      const pushNote = data.s3Push?.ok ? ' + S3 bulutuna gönderildi' : '';
      onNotify('success', `Anlık yedek oluşturuldu: ${data.backup?.filename || ''}${pushNote}`);
    } catch {
      onNotify('error', 'Yedek alınırken bağlantı hatası oluştu.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    setDownloadingName(filename);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/admin/backups/${encodeURIComponent(filename)}/download`
      );
      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        onNotify('error', errData?.error || 'Yedek dosyası indirilemedi.');
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotify('success', `Yedek indirildi: ${filename}`);
    } catch {
      onNotify('error', 'Yedek indirilirken ağ hatası oluştu.');
    } finally {
      setDownloadingName(null);
    }
  };

  const handlePushBackupToS3 = async (filename: string) => {
    setPushingName(filename);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/admin/backups/${encodeURIComponent(filename)}/push-remote`,
        { method: 'POST' }
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        onNotify('error', data?.error || 'S3/R2 bulutuna yüklenemedi.');
        return;
      }
      onNotify('success', `Yedek S3/R2 deposuna yüklendi: ${data.key || filename}`);
    } catch {
      onNotify('error', 'S3/R2 yükleme isteği başarısız.');
    } finally {
      setPushingName(null);
    }
  };

  const handleDeleteBackup = (filename: string) => {
    onRequestDialog({
      type: 'confirm',
      title: 'SQLite Yedeğini Sil',
      description: `"${filename}" dosyasını sunucu diskinden silmek istediğinize emin misiniz?`,
      confirmLabel: 'Sil',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const resp = await authFetch(
            currentServerHost,
            `/api/admin/backups/${encodeURIComponent(filename)}`,
            { method: 'DELETE' }
          );
          const data = await resp.json().catch(() => null);
          if (!resp.ok || !data?.ok) {
            onNotify('error', data?.error || 'Yedek dosyası silinemedi.');
            return;
          }
          setBackups(Array.isArray(data.backups) ? data.backups : []);
          onNotify('success', 'Yedek dosyası silindi.');
        } catch {
          onNotify('error', 'Yedek silinirken hata oluştu.');
        }
      },
    });
  };

  const handleScanOrphans = async () => {
    setScanningOrphans(true);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/admin/orphan-media?minAgeHours=${encodeURIComponent(String(minAgeHours))}`
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok || !data.scan) {
        onNotify('error', data?.error || 'Sahipsiz dosya taraması başarısız.');
        return;
      }
      setScanResult(data.scan);
    } catch {
      onNotify('error', 'Tarama sırasında bağlantı hatası oluştu.');
    } finally {
      setScanningOrphans(false);
    }
  };

  const handleCleanOrphans = () => {
    if (!scanResult || scanResult.orphanFiles <= 0) return;
    onRequestDialog({
      type: 'confirm',
      title: t(language, 'orphanMediaTitle'),
      description: `${scanResult.orphanFiles} sahipsiz yükleme dosyası (${formatBytes(scanResult.freedBytes)}) kalıcı olarak silinecek. Devam edilsin mi?`,
      confirmLabel: t(language, 'cleanOrphanMedia'),
      tone: 'danger',
      onConfirm: async () => {
        setCleaningOrphans(true);
        try {
          const resp = await authFetch(currentServerHost, '/api/admin/orphan-media/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minAgeHours }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok || !data?.ok || !data.scan) {
            onNotify('error', data?.error || 'Temizlik başarısız.');
            return;
          }
          setScanResult(data.scan);
          onNotify(
            'success',
            `${data.scan.deletedFiles} dosya temizlendi (${formatBytes(data.scan.freedBytes)} kazanıldı).`
          );
        } catch {
          onNotify('error', 'Temizlik isteği sırasında hata oluştu.');
        } finally {
          setCleaningOrphans(false);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* SQLite Hot Backups (VACUUM INTO) */}
      <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-400" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                {t(language, 'sqliteBackupsTitle')}
              </h4>
              <p className="text-[11px] text-white/45">
                {sqliteActive
                  ? 'Canlı veritabanını kilitlemeden atomik SQLite yedeği alır (.sqlite, son 10 yedek).'
                  : 'SQLite kapalı olduğu için tam sistem JSON anlık yedeği alır (.json).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                sqliteActive
                  ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-400/35 text-amber-200'
              }`}
            >
              {sqliteActive ? 'SQLite Aktif' : 'JSON Yedek Modu'}
            </span>
            <button
              type="button"
              onClick={() => void loadBackups()}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 transition"
              title="Listeyi Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={creatingBackup}
              className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              {creatingBackup ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <HardDriveDownload className="w-3.5 h-3.5" />
              )}
              <span>{t(language, 'createBackupNow')}</span>
            </button>
          </div>
        </div>

        {backups.length === 0 ? (
          <div className="text-xs text-white/40 py-2">Henüz anlık yedek oluşturulmamış.</div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {backups.map((b) => (
              <div
                key={b.filename}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-mono text-white/90 truncate">{b.filename}</div>
                  <div className="text-[10px] text-white/45">
                    {formatBytes(b.bytes)} · {new Date(b.createdAt).toLocaleString('tr-TR')}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDownloadBackup(b.filename)}
                    disabled={downloadingName === b.filename}
                    className="p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-300 transition disabled:opacity-40"
                    title="Dosyayı İndir"
                  >
                    {downloadingName === b.filename ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePushBackupToS3(b.filename)}
                    disabled={pushingName === b.filename}
                    className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-300 transition disabled:opacity-40"
                    title="S3 / R2 Bulutuna Gönder"
                  >
                    {pushingName === b.filename ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBackup(b.filename)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 transition"
                    title="Yedeği Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orphan Media Garbage Collector */}
      <div className="p-5 rounded-2xl ios-glass-card border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderSearch className="w-4 h-4 text-amber-400" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                {t(language, 'orphanMediaTitle')}
              </h4>
              <p className="text-[11px] text-white/45">
                Hiçbir mesaj, profil, emoji veya SQLite kaydında referansı kalmamış eski `/uploads` dosyalarını tarar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={minAgeHours}
              onChange={(e) => setMinAgeHours(Number(e.target.value))}
              className="bg-black/40 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none"
              aria-label="Minimum dosya yaşı (saat)"
            >
              <option value={0} className="bg-neutral-900">Tüm yaşlar (0 sa)</option>
              <option value={1} className="bg-neutral-900">&gt; 1 saat</option>
              <option value={24} className="bg-neutral-900">&gt; 24 saat</option>
              <option value={48} className="bg-neutral-900">&gt; 48 saat</option>
            </select>

            <button
              type="button"
              onClick={() => void handleScanOrphans()}
              disabled={scanningOrphans}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              {scanningOrphans ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderSearch className="w-3.5 h-3.5" />}
              <span>{t(language, 'scanOrphanMedia')}</span>
            </button>

            <button
              type="button"
              onClick={handleCleanOrphans}
              disabled={!scanResult || scanResult.orphanFiles <= 0 || cleaningOrphans}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 border border-rose-400/35 text-rose-200 hover:text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-35 transition"
            >
              {cleaningOrphans ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>{t(language, 'cleanOrphanMedia')}</span>
            </button>
          </div>
        </div>

        {scanResult && (
          <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-white/80">
              <span>Taranan: <b className="text-white">{scanResult.scannedFiles}</b></span>
              <span>Sahipsiz: <b className="text-amber-300">{scanResult.orphanFiles}</b></span>
              <span>Kazanım: <b className="text-emerald-300">{formatBytes(scanResult.freedBytes)}</b></span>
              {!scanResult.dryRun && (
                <span>Silinen: <b className="text-rose-300">{scanResult.deletedFiles}</b></span>
              )}
            </div>
            {scanResult.orphanNames.length > 0 && (
              <div className="text-[10px] font-mono text-white/45 truncate">
                Örnekler: {scanResult.orphanNames.slice(0, 10).join(', ')}
                {scanResult.orphanNames.length > 10 ? ` (+${scanResult.orphanNames.length - 10})` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
