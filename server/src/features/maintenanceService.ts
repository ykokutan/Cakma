import fs from 'fs';
import path from 'path';
import type { Express, Request } from 'express';
import type { Message, MetricsHistoryPoint, RegisteredAccount, Server } from '../types.js';
import { extractSessionToken } from '../utils/adminAuth.js';
import { collectReferencedMediaUrls, scanAndCleanOrphanUploads, type OrphanScanResult } from '../utils/uploadCleaner.js';
import { uploadFileToS3, type S3UploadResult } from '../utils/s3BackupUploader.js';
import { exportAllDataBundle, sqliteStore, type SystemConfig } from '../storage.js';

export interface MaintenanceSqliteAdapter {
  isActive: () => boolean;
  backupToFile: (destPath: string) => { ok: boolean; bytes?: number; error?: string };
  getAllReferencedAttachmentUrls: () => string[];
}

export interface SqliteBackupFileInfo {
  filename: string;
  bytes: number;
  createdAt: string;
  format?: 'sqlite' | 'json';
}

export interface MaintenanceServiceDeps {
  dataDir: string;
  buildRuntimeMetrics: () => {
    uptimeSeconds: number;
    onlineUsers: number;
    serverCount: number;
    activeVoiceRooms: number;
    voiceParticipantsCount?: number;
    cpuPercent?: number;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    pendingStorageWrites: number;
    storageEngine: string;
    livekitEnabled: boolean;
    pushSubscriptionCount: number;
  };
  messages: Record<string, Message[]>;
  registeredAccounts: Map<string, RegisteredAccount>;
  servers: Server[];
  sqlite?: MaintenanceSqliteAdapter;
  exportJsonBundle?: () => unknown;
  getSystemConfig?: () => SystemConfig;
  sendBackupWebhook?: (title: string, details: string) => Promise<boolean>;
  addAuditLog?: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
}

const BACKUP_NAME_RE = /^cakma-backup-[a-zA-Z0-9._-]+\.(sqlite|json)$/;
const DOWNLOADABLE_BACKUP_NAME_RE = /^(cakma-)?backup-[a-zA-Z0-9._-]+\.(sqlite|json)$/;

export class MaintenanceService {
  private readonly history: MetricsHistoryPoint[] = [];
  private readonly maxHistoryPoints = 120;
  private messagesSinceLastSample = 0;
  private lastSampleTs = Date.now();
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private backupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: MaintenanceServiceDeps) {}

  getBackupsDir(): string {
    return path.join(this.deps.dataDir, 'backups');
  }

  incrementMessageCount(): void {
    this.messagesSinceLastSample += 1;
  }

  async measureEventLoopLagMs(): Promise<number> {
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 10);
      t.unref?.();
    });
    const elapsed = performance.now() - start;
    return Math.max(0, Math.round((elapsed - 10) * 10) / 10);
  }

  recordSample(lagMs = 0): MetricsHistoryPoint {
    const now = Date.now();
    const elapsedMin = Math.max(1 / 60, (now - this.lastSampleTs) / 60_000);
    const messagesPerMin = Math.round(this.messagesSinceLastSample / elapsedMin);
    this.messagesSinceLastSample = 0;
    this.lastSampleTs = now;

    const m = this.deps.buildRuntimeMetrics();
    const point: MetricsHistoryPoint = {
      ts: now,
      memoryRssMb: m.memoryRssMb,
      memoryHeapUsedMb: m.memoryHeapUsedMb,
      cpuPercent: typeof m.cpuPercent === 'number' ? m.cpuPercent : 0,
      onlineUsers: m.onlineUsers,
      activeVoiceRooms: m.activeVoiceRooms,
      voiceParticipantsCount: typeof m.voiceParticipantsCount === 'number' ? m.voiceParticipantsCount : 0,
      messagesPerMin,
      eventLoopLagMs: lagMs,
      pendingStorageWrites: m.pendingStorageWrites,
    };

    this.history.push(point);
    if (this.history.length > this.maxHistoryPoints) {
      this.history.splice(0, this.history.length - this.maxHistoryPoints);
    }
    return point;
  }

  getHistory(limit = 60): MetricsHistoryPoint[] {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 60), this.maxHistoryPoints);
    return this.history.slice(-safeLimit);
  }

  listSqliteBackups(): SqliteBackupFileInfo[] {
    const dir = this.getBackupsDir();
    if (!fs.existsSync(dir)) return [];
    const results: SqliteBackupFileInfo[] = [];
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!BACKUP_NAME_RE.test(name)) continue;
        try {
          const st = fs.statSync(path.join(dir, name));
          if (st.isFile()) {
            results.push({
              filename: name,
              bytes: st.size,
              createdAt: st.mtime.toISOString(),
              format: name.endsWith('.json') ? 'json' : 'sqlite',
            });
          }
        } catch {}
      }
    } catch {}
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return results;
  }

  createSqliteBackup(label?: string, maxToKeep = 10): { ok: boolean; backup?: SqliteBackupFileInfo; error?: string } {
    const dir = this.getBackupsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeLabel = label ? `-${label.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)}` : '';
    const sqlite = this.deps.sqlite ?? sqliteStore;
    const isSqlite = sqlite.isActive();
    const filename = isSqlite
      ? `cakma-backup-${stamp}${safeLabel}.sqlite`
      : `cakma-backup-${stamp}${safeLabel}.json`;
    const destPath = path.join(dir, filename);

    let bytes: number;
    if (isSqlite) {
      const res = sqlite.backupToFile(destPath);
      if (!res.ok) {
        return { ok: false, error: res.error || 'SQLite yedeği alınamadı.' };
      }
      bytes = res.bytes || 0;
    } else {
      const bundle = this.deps.exportJsonBundle ? this.deps.exportJsonBundle() : exportAllDataBundle();
      const serialized = JSON.stringify(bundle, null, 2);
      fs.writeFileSync(destPath, serialized, 'utf-8');
      bytes = fs.statSync(destPath).size;
    }

    const all = this.listSqliteBackups();
    const limit = Math.min(Math.max(1, maxToKeep), 50);
    if (all.length > limit) {
      for (const old of all.slice(limit)) {
        try {
          fs.unlinkSync(path.join(dir, old.filename));
        } catch {}
      }
    }

    const created: SqliteBackupFileInfo = {
      filename,
      bytes,
      createdAt: new Date().toISOString(),
      format: isSqlite ? 'sqlite' : 'json',
    };
    this.deps.addAuditLog?.(
      isSqlite ? 'SQLITE_YEDEK_ALINDI' : 'JSON_YEDEK_ALINDI',
      `${isSqlite ? 'Sıcak SQLite' : 'JSON'} yedeği oluşturuldu: ${filename} (${created.bytes} B)`,
      'info'
    );
    return { ok: true, backup: created };
  }

  getBackupFile(filename: string): {
    filename: string;
    filePath: string;
    bytes: number;
    contentType: string;
  } | null {
    const safeName = path.basename(filename || '');
    if (!DOWNLOADABLE_BACKUP_NAME_RE.test(safeName)) return null;
    const dir = path.resolve(this.getBackupsDir());
    const fullPath = path.resolve(dir, safeName);
    if (!fullPath.startsWith(dir + path.sep) && fullPath !== dir) return null;
    if (!fs.existsSync(fullPath)) return null;
    const st = fs.statSync(fullPath);
    if (!st.isFile()) return null;
    return {
      filename: safeName,
      filePath: fullPath,
      bytes: st.size,
      contentType: safeName.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/vnd.sqlite3',
    };
  }

  async pushBackupToS3(filename: string, cfg?: SystemConfig): Promise<S3UploadResult> {
    const config = cfg ?? this.deps.getSystemConfig?.();
    if (!config || !config.backupS3Enabled) {
      return { ok: false, error: 'Bulut S3/R2/MinIO yedekleme sistem ayarlarında etkin değil.' };
    }
    const fileInfo = this.getBackupFile(filename);
    if (!fileInfo) {
      return { ok: false, error: 'Yedek dosyası bulunamadı veya geçersiz dosya adı.' };
    }
    const rawPrefix = String(config.backupS3Prefix || 'cakma-backups/').trim().replace(/^\/+/, '');
    const cleanPrefix = rawPrefix ? (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) : '';
    const objectKey = `${cleanPrefix}${fileInfo.filename}`;
    const result = await uploadFileToS3({
      endpoint: config.backupS3Endpoint || '',
      bucket: config.backupS3Bucket || '',
      region: config.backupS3Region || 'auto',
      accessKeyId: config.backupS3AccessKey || '',
      secretAccessKey: config.backupS3SecretKey || '',
      objectKey,
      filePath: fileInfo.filePath,
      contentType: fileInfo.contentType,
    });
    if (result.ok) {
      this.deps.addAuditLog?.(
        'BULUT_YEDEK_YUKLENDI',
        `Yedek S3/R2 deposuna yüklendi: ${fileInfo.filename} -> ${config.backupS3Bucket}/${objectKey}`,
        'info'
      );
      void this.deps.sendBackupWebhook?.(
        'Yedek Bulut Depoya Gönderildi',
        `Dosya: ${fileInfo.filename} (${(fileInfo.bytes / 1024).toFixed(1)} KB) -> Bucket: ${config.backupS3Bucket}/${objectKey}`
      );
    } else {
      this.deps.addAuditLog?.(
        'BULUT_YEDEK_HATASI',
        `S3/R2 yüklemesi başarısız (${fileInfo.filename}): ${result.error || 'Bilinmeyen hata'}`,
        'warn'
      );
    }
    return result;
  }

  deleteSqliteBackup(filename: string): boolean {
    const safeName = path.basename(filename || '');
    if (!BACKUP_NAME_RE.test(safeName)) return false;
    const fullPath = path.join(this.getBackupsDir(), safeName);
    if (!fs.existsSync(fullPath)) return false;
    fs.unlinkSync(fullPath);
    return true;
  }

  isSqliteActive(): boolean {
    const sqlite = this.deps.sqlite ?? sqliteStore;
    return sqlite.isActive();
  }

  scanOrphanMedia(options?: { minAgeMs?: number; dryRun?: boolean }): OrphanScanResult {
    const sqlite = this.deps.sqlite ?? sqliteStore;
    const refs = collectReferencedMediaUrls({
      dataDir: this.deps.dataDir,
      messagesMap: this.deps.messages,
      accounts: this.deps.registeredAccounts,
      servers: this.deps.servers,
      extraReferencedUrls: sqlite.getAllReferencedAttachmentUrls(),
    });
    const result = scanAndCleanOrphanUploads({
      dataDir: this.deps.dataDir,
      referencedUrls: refs,
      minAgeMs: options?.minAgeMs ?? 24 * 3600 * 1000,
      dryRun: options?.dryRun ?? true,
    });
    if (!result.dryRun && result.deletedFiles > 0) {
      this.deps.addAuditLog?.(
        'MEDYA_TEMIZLIK',
        `${result.deletedFiles} sahipsiz yükleme dosyası temizlendi (${result.freedBytes} B kazanıldı).`,
        'info'
      );
    }
    return result;
  }

  startSchedulers(opts?: { sampleIntervalMs?: number; backupIntervalMs?: number }): void {
    this.stopSchedulers();
    const sampleMs = Math.max(5_000, opts?.sampleIntervalMs ?? 30_000);
    const backupMs = Math.max(60_000, opts?.backupIntervalMs ?? 6 * 3600 * 1000);

    // Seed an immediate initial sample
    this.recordSample(0);

    this.metricsTimer = setInterval(() => {
      void this.measureEventLoopLagMs().then((lag) => {
        this.recordSample(lag);
      });
    }, sampleMs);
    this.metricsTimer.unref?.();

    this.backupTimer = setInterval(() => {
      if (this.isSqliteActive()) {
        this.createSqliteBackup('auto', 10);
      }
      this.scanOrphanMedia({ dryRun: false, minAgeMs: 48 * 3600 * 1000 });
    }, backupMs);
    this.backupTimer.unref?.();
  }

  stopSchedulers(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }
}

export interface MaintenanceRoutesDeps {
  maintenance: MaintenanceService;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  getAccount: (usernameLower: string) => RegisteredAccount | undefined;
  isMasterRequest: (req: Request) => boolean;
  getSystemConfig?: () => SystemConfig;
  sendBackupWebhook?: (title: string, details: string) => Promise<boolean>;
}

export function registerMaintenanceRoutes(app: Express, deps: MaintenanceRoutesDeps): void {
  const { maintenance, verifySessionTokenWithMeta, getAccount, isMasterRequest } = deps;

  const isAuthorizedAdmin = (req: Request): boolean => {
    if (isMasterRequest(req)) return true;
    const token = extractSessionToken(req);
    if (!token) return false;
    const verified = verifySessionTokenWithMeta(token);
    if (!verified) return false;
    const acc = getAccount(verified.username.toLowerCase());
    if (!acc || acc.role !== 'admin') return false;
    if (acc.minTokenIssuedAt && verified.iat < acc.minTokenIssuedAt) return false;
    return true;
  };

  app.get('/api/admin/metrics-history', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const limit = Number(req.query.limit) || 60;
    return res.json({
      ok: true,
      points: maintenance.getHistory(limit),
    });
  });

  app.get('/api/admin/backups', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    return res.json({
      ok: true,
      sqliteActive: maintenance.isSqliteActive(),
      backups: maintenance.listSqliteBackups(),
    });
  });

  app.post('/api/admin/backups/create', async (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const label = typeof req.body?.label === 'string' ? req.body.label : undefined;
    const cfg = deps.getSystemConfig?.();
    const result = maintenance.createSqliteBackup(label, cfg?.maxBackupsToKeep || 10);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    if (result.backup) {
      void deps.sendBackupWebhook?.(
        'Manuel Bakım Yedeği Oluşturuldu',
        `Dosya: ${result.backup.filename} (${(result.backup.bytes / 1024).toFixed(1)} KB)`
      );
    }
    let s3Push: S3UploadResult | undefined;
    if (result.backup && cfg?.backupS3Enabled && cfg?.backupS3AutoPush) {
      s3Push = await maintenance.pushBackupToS3(result.backup.filename, cfg);
    }
    return res.json({
      ok: true,
      backup: result.backup,
      backups: maintenance.listSqliteBackups(),
      s3Push,
    });
  });

  app.get('/api/admin/backups/:filename/download', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const fileInfo = maintenance.getBackupFile(req.params.filename || '');
    if (!fileInfo) {
      return res.status(404).json({ ok: false, error: 'Yedek dosyası bulunamadı veya geçersiz ad.' });
    }
    res.setHeader('Content-Type', fileInfo.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
    return res.sendFile(fileInfo.filePath);
  });

  app.post('/api/admin/backups/:filename/push-remote', async (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const cfg = deps.getSystemConfig?.();
    const result = await maintenance.pushBackupToS3(req.params.filename || '', cfg);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'Uzak depoya yüklenemedi.' });
    }
    return res.json({ ok: true, url: result.url, key: result.key });
  });

  app.delete('/api/admin/backups/:filename', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const ok = maintenance.deleteSqliteBackup(req.params.filename || '');
    if (!ok) {
      return res.status(404).json({ ok: false, error: 'Yedek dosyası bulunamadı veya geçersiz ad.' });
    }
    return res.json({ ok: true, backups: maintenance.listSqliteBackups() });
  });

  app.get('/api/admin/orphan-media', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const minAgeHours = Number(req.query.minAgeHours);
    const minAgeMs = Number.isFinite(minAgeHours) && minAgeHours >= 0 ? minAgeHours * 3600 * 1000 : 24 * 3600 * 1000;
    return res.json({ ok: true, scan: maintenance.scanOrphanMedia({ dryRun: true, minAgeMs }) });
  });

  app.post('/api/admin/orphan-media/cleanup', (req, res) => {
    if (!isAuthorizedAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'Yönetici yetkisi gerekli.' });
    }
    const minAgeHours = Number(req.body?.minAgeHours);
    const minAgeMs = Number.isFinite(minAgeHours) && minAgeHours >= 0 ? minAgeHours * 3600 * 1000 : 24 * 3600 * 1000;
    return res.json({ ok: true, scan: maintenance.scanOrphanMedia({ dryRun: false, minAgeMs }) });
  });
}
