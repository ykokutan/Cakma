import express, { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getPersistentDir, getStorageEngineInfo } from '../storage.js';
import { collectReferencedMediaUrls, scanAndCleanOrphanUploads } from '../utils/uploadCleaner.js';
import { validateAttachmentSafety } from '../utils/security.js';
import { isServerOwner } from '../utils/serverIdentity.js';
import {
  AuthenticatedRequest,
  createAuthMiddlewares,
  extractSessionToken,
  validateExternalWebhookUrl,
} from '../utils/adminAuth.js';
import type { Message, RegisteredAccount, Server } from '../types.js';

export interface ServerEventItem {
  id: string;
  serverId: string;
  title: string;
  description: string;
  scheduledAt: string;
  createdBy: string;
  attendees: string[];
  createdAt: string;
  remindedAt?: string;
}

export function findDueEventReminders(
  eventsByServer: Record<string, ServerEventItem[]>,
  nowMs: number,
  leadWindowMs = 15 * 60_000
): ServerEventItem[] {
  const due: ServerEventItem[] = [];
  for (const list of Object.values(eventsByServer || {})) {
    if (!Array.isArray(list)) continue;
    for (const ev of list) {
      if (!ev || ev.remindedAt) continue;
      const scheduledMs = Date.parse(ev.scheduledAt);
      if (!Number.isFinite(scheduledMs)) continue;
      if (scheduledMs > nowMs && scheduledMs - nowMs <= leadWindowMs) {
        due.push(ev);
      }
    }
  }
  return due;
}

const DATA_DIR = getPersistentDir();
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PREFS_FILE = path.join(DATA_DIR, 'user-prefs.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown) {
  ensureDirs();
  const tempPath = `${filePath}.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function toHttpUrlFromLiveKit(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('wss://')) return `https://${trimmed.slice(6)}`;
  if (trimmed.startsWith('ws://')) return `http://${trimmed.slice(5)}`;
  return trimmed;
}

export interface OrphanCleanupContext {
  getMessagesMap: () => Record<string, Message[]>;
  getAccounts: () => Map<string, RegisteredAccount>;
  getServers: () => Server[];
}

export interface EffectiveLiveKitConfigSnapshot {
  enabled: boolean;
  threshold?: number;
  url: string;
  apiKey: string;
  apiSecret: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}

export function computeUploadsDirectoryStats(dir: string): { totalBytes: number; fileCount: number } {
  if (!fs.existsSync(dir)) return { totalBytes: 0, fileCount: 0 };
  let totalBytes = 0;
  let fileCount = 0;
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile()) {
          totalBytes += st.size;
          fileCount += 1;
        }
      } catch {}
    }
  } catch {}
  return { totalBytes, fileCount };
}

export interface CloudSyncContext extends OrphanCleanupContext {
  verifySessionToken?: (token: string) => string | null;
  verifySessionTokenWithMeta?: (token: string) => { username: string; iat: number } | null;
  verifyMediaToken?: (token: string) => string | null;
  getAccount?: (usernameLower: string) => RegisteredAccount | undefined;
  getEffectiveLiveKitConfig?: () => EffectiveLiveKitConfigSnapshot;
  addAuditLog?: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
  getMaxUploadSizeMb?: () => number;
  uploadsDir?: string;
  maxUploadsDiskMb?: number;
  isUserMemberOfServer?: (
    user: { id?: string; accountId?: string; username: string; role?: string },
    server: Server
  ) => boolean;
  emitToServerMembers?: (server: Server, event: string, payload: unknown) => void;
}

export function registerCloudSyncAndEvents(
  app: Express,
  io: SocketIOServer,
  activeUsers: Map<string, { username: string }>,
  context?: CloudSyncContext
) {
  const uploadsDir = context?.uploadsDir ? path.resolve(context.uploadsDir) : UPLOADS_DIR;
  const ensureUploadsDir = () => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  };
  ensureDirs();
  ensureUploadsDir();

  const failClosed: RequestHandler = (_req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ ok: false, error: 'Kimlik doğrulama bağlamı yapılandırılmadı.' });
  };

  const authMiddlewares =
    context?.verifySessionTokenWithMeta && context?.getAccount
      ? createAuthMiddlewares({
          verifySessionTokenWithMeta: context.verifySessionTokenWithMeta,
          getAccount: context.getAccount,
        })
      : {
          requireAuth: failClosed,
          requireAdmin: failClosed,
          requireSelfOrAdmin: () => failClosed,
        };

  const { requireAuth, requireAdmin, requireSelfOrAdmin } = authMiddlewares;

  const runOrphanScan = (dryRun: boolean, minAgeMs: number) => {
    const referencedUrls = collectReferencedMediaUrls({
      dataDir: DATA_DIR,
      messagesMap: context?.getMessagesMap?.(),
      accounts: context?.getAccounts?.(),
      servers: context?.getServers?.(),
    });
    return scanAndCleanOrphanUploads({
      dataDir: DATA_DIR,
      referencedUrls,
      minAgeMs,
      dryRun,
    });
  };

  if (context) {
    const gcTimer = setInterval(() => {
      try {
        const res = runOrphanScan(false, 24 * 3600 * 1000);
        if (res.deletedFiles > 0) {
          console.log(`🧹 [GarbageCollector] ${res.deletedFiles} artık dosya temizlendi (${res.freedBytes} bayt).`);
        }
      } catch {}
    }, 6 * 3600 * 1000);
    gcTimer.unref?.();

    const eventReminderTimer = setInterval(() => {
      try {
        const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
        const nowMs = Date.now();
        const due = findDueEventReminders(all, nowMs, 15 * 60_000);
        if (due.length === 0) return;

        const remindedIso = new Date(nowMs).toISOString();
        const dueIds = new Set(due.map((e) => e.id));
        for (const list of Object.values(all)) {
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (dueIds.has(item.id)) item.remindedAt = remindedIso;
          }
        }
        writeJson(EVENTS_FILE, all);

        for (const ev of due) {
          const targetServer = context.getServers?.()?.find((s) => s.id === ev.serverId);
          for (const [sockId, u] of activeUsers.entries()) {
            const isAttendee = ev.attendees.some((a) => a.toLowerCase() === u.username.toLowerCase());
            const isMember = targetServer && context.isUserMemberOfServer?.(u, targetServer);
            if (isAttendee || (ev.attendees.length === 0 && isMember)) {
              io.to(sockId).emit('event_reminder', {
                serverId: ev.serverId,
                serverName: targetServer?.name || 'Sunucu',
                eventId: ev.id,
                title: ev.title,
                scheduledAt: ev.scheduledAt,
              });
            }
          }
        }
      } catch {}
    }, 60_000);
    eventReminderTimer.unref?.();
  }

  // 1. Cloud User Preferences Sync (authenticated self or admin only)
  app.get('/api/user-prefs/:username', requireSelfOrAdmin('username'), (req, res) => {
    const uname = String(req.params.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ error: 'Username required' });
    const all = readJson<Record<string, any>>(PREFS_FILE, {});
    res.json({ ok: true, prefs: all[uname] || null });
  });

  app.post('/api/user-prefs/:username', requireSelfOrAdmin('username'), express.json({ limit: '1mb' }), (req, res) => {
    const uname = String(req.params.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ error: 'Username required' });
    const all = readJson<Record<string, any>>(PREFS_FILE, {});
    all[uname] = {
      ...(all[uname] || {}),
      ...(req.body || {}),
      updatedAt: new Date().toISOString(),
    };
    writeJson(PREFS_FILE, all);
    res.json({ ok: true, prefs: all[uname] });
  });

  // 2. Server Events (Etkinlikler) - Membership & Audience Isolated
  const resolveAuthorizedServer = (req: Request, res: Response, rawServerId: string): Server | null => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const serverId = String(rawServerId || '').trim();
    const targetServer = context?.getServers?.()?.find((s) => s.id === serverId);
    if (!targetServer) {
      res.status(404).json({ ok: false, error: 'Sunucu bulunamadı.' });
      return null;
    }
    const isMember =
      authUser.role === 'admin' ||
      Boolean(
        context?.isUserMemberOfServer?.(
          {
            id: authUser.account.id,
            accountId: authUser.account.id,
            username: authUser.username,
            role: authUser.role,
          },
          targetServer
        )
      );
    if (!isMember) {
      res.status(403).json({ ok: false, error: 'Bu sunucunun etkinliklerine erişim yetkiniz yok.' });
      return null;
    }
    return targetServer;
  };

  const broadcastServerEvents = (targetServer: Server, events: ServerEventItem[]) => {
    const payload = { serverId: targetServer.id, events };
    if (context?.emitToServerMembers) {
      context.emitToServerMembers(targetServer, 'server_events_updated', payload);
    } else {
      io.to('admins').emit('server_events_updated', payload);
    }
  };

  app.get('/api/events/:serverId', requireAuth, (req, res) => {
    const targetServer = resolveAuthorizedServer(req, res, req.params.serverId);
    if (!targetServer) return;
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    res.json({ ok: true, events: all[targetServer.id] || [] });
  });

  app.post('/api/events/:serverId', requireAuth, express.json({ limit: '256kb' }), (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const targetServer = resolveAuthorizedServer(req, res, req.params.serverId);
    if (!targetServer) return;
    const serverId = targetServer.id;
    const { title, description, scheduledAt, createdBy } = req.body || {};
    if (!title || !scheduledAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const creator =
      authUser.role === 'admin' && typeof createdBy === 'string' && createdBy.trim()
        ? String(createdBy).trim().slice(0, 48)
        : authUser.username;

    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    const item: ServerEventItem = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serverId,
      title: String(title).slice(0, 80),
      description: String(description || '').slice(0, 400),
      scheduledAt: String(scheduledAt),
      createdBy: creator,
      attendees: creator ? [creator] : [],
      createdAt: new Date().toISOString(),
    };
    all[serverId] = [item, ...(all[serverId] || [])].slice(0, 50);
    writeJson(EVENTS_FILE, all);
    broadcastServerEvents(targetServer, all[serverId]);
    res.json({ ok: true, event: item, events: all[serverId] });
  });

  app.post('/api/events/:serverId/:eventId/rsvp', requireAuth, express.json({ limit: '64kb' }), (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const targetServer = resolveAuthorizedServer(req, res, req.params.serverId);
    if (!targetServer) return;
    const serverId = targetServer.id;
    const { eventId } = req.params;
    const requestedName = String(req.body?.username || '').trim();
    const username = authUser.role === 'admin' && requestedName ? requestedName : authUser.username;
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    const list = all[serverId] || [];
    const target = list.find((e) => e.id === eventId);
    if (!target) return res.status(404).json({ error: 'Event not found' });
    if (target.attendees.includes(username)) {
      target.attendees = target.attendees.filter((u) => u !== username);
    } else {
      target.attendees.push(username);
    }
    writeJson(EVENTS_FILE, all);
    broadcastServerEvents(targetServer, list);
    res.json({ ok: true, events: list });
  });

  app.delete('/api/events/:serverId/:eventId', requireAuth, (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const targetServer = resolveAuthorizedServer(req, res, req.params.serverId);
    if (!targetServer) return;
    const serverId = targetServer.id;
    const { eventId } = req.params;
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    const list = all[serverId] || [];
    const target = list.find((e) => e.id === eventId);
    if (!target) {
      return res.status(404).json({ ok: false, error: 'Etkinlik bulunamadı.' });
    }
    const ownerCheck = isServerOwner(
      { id: authUser.account.id, accountId: authUser.account.id, username: authUser.username },
      targetServer
    );
    const isCreator = target.createdBy.toLowerCase() === authUser.username.toLowerCase();
    if (authUser.role !== 'admin' && !isCreator && !ownerCheck) {
      return res.status(403).json({ ok: false, error: 'Bu etkinliği silme yetkiniz yok.' });
    }

    all[serverId] = list.filter((e) => e.id !== eventId);
    writeJson(EVENTS_FILE, all);
    broadcastServerEvents(targetServer, all[serverId]);
    res.json({ ok: true, events: all[serverId] });
  });

  // 3. Server-side Custom Soundboard Upload (authenticated) & Public Audio Tag Serving
  app.post('/api/sounds/upload', requireAuth, express.json({ limit: '2mb' }), (req, res) => {
    const { name, dataUrl } = req.body || {};
    if (!name || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:audio/')) {
      return res.status(400).json({ error: 'Geçersiz ses verisi' });
    }
    const match = dataUrl.match(/^data:audio\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Base64 formatı geçersiz' });
    const ext = match[1].includes('mpeg') ? 'mp3' : match[1].includes('ogg') ? 'ogg' : match[1].includes('wav') ? 'wav' : 'webm';
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 1024 * 1024) {
      return res.status(413).json({ error: 'Ses dosyası 1MB sınırını aşıyor' });
    }
    ensureDirs();
    const safeId = `snd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    fs.writeFileSync(path.join(SOUNDS_DIR, safeId), buf);
    res.json({
      ok: true,
      id: safeId,
      name: String(name).slice(0, 32),
      url: `/api/sounds/${safeId}`,
    });
  });

  // Keep GET /api/sounds/:filename readable for <audio src="/api/sounds/..."> elements
  app.get('/api/sounds/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      return res.status(400).json({ error: 'Geçersiz dosya adı' });
    }
    const fullPath = path.join(SOUNDS_DIR, safeName);
    if (!fs.existsSync(fullPath)) return res.status(404).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(fullPath);
  });

  // 4. Active Sessions & Remote Logout (authenticated self or admin)
  app.get('/api/sessions/:username', requireSelfOrAdmin('username'), (req, res) => {
    const uname = String(req.params.username || '').trim().toLowerCase();
    const sessions: Array<{ id: string; ip: string; userAgent: string; connectedAt: string }> = [];
    for (const [id, sock] of io.sockets.sockets) {
      const sUser = activeUsers.get(id)?.username || (sock as any).data?.username || (sock.handshake.auth as any)?.username;
      if (sUser && String(sUser).toLowerCase() === uname) {
        sessions.push({
          id,
          ip: String(sock.handshake.address || 'Bilinmiyor'),
          userAgent: String(sock.handshake.headers['user-agent'] || 'İstemci').slice(0, 90),
          connectedAt: String(sock.handshake.time || ''),
        });
      }
    }
    res.json({ ok: true, sessions });
  });

  app.post('/api/sessions/:username/revoke-others', requireSelfOrAdmin('username'), express.json({ limit: '32kb' }), (req, res) => {
    const uname = String(req.params.username || '').trim().toLowerCase();
    const keepSocketId = String(req.body?.keepSocketId || '');
    let revoked = 0;
    for (const [id, sock] of io.sockets.sockets) {
      const sUser = activeUsers.get(id)?.username || (sock as any).data?.username || (sock.handshake.auth as any)?.username;
      if (sUser && String(sUser).toLowerCase() === uname && id !== keepSocketId) {
        sock.emit('force_logout', { reason: 'Başka bir cihazdan tüm diğer oturumlar sonlandırıldı.' });
        sock.disconnect(true);
        revoked++;
      }
    }
    res.json({ ok: true, revoked });
  });

  // 5. Admin Panel Utilities (strictly requireAdmin)
  app.get('/api/admin/disk-usage', requireAdmin, (_req, res) => {
    ensureDirs();
    const getDirStats = (dir: string) => {
      let totalBytes = 0;
      let fileCount = 0;
      const files: Array<{ name: string; sizeBytes: number; mtime: string }> = [];
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isFile()) {
            const st = fs.statSync(full);
            totalBytes += st.size;
            fileCount++;
            files.push({ name: entry.name, sizeBytes: st.size, mtime: st.mtime.toISOString() });
          } else if (entry.isDirectory()) {
            for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
              if (sub.isFile()) {
                const st = fs.statSync(path.join(full, sub.name));
                totalBytes += st.size;
                fileCount++;
              }
            }
          }
        }
      } catch {}
      return { totalBytes, fileCount, files };
    };

    const dataStats = getDirStats(DATA_DIR);
    const soundsStats = getDirStats(SOUNDS_DIR);
    const orphanStats = context ? runOrphanScan(true, 0) : null;
    res.json({
      ok: true,
      storageEngine: getStorageEngineInfo(),
      orphanStats,
      dataBytes: dataStats.totalBytes,
      dataFiles: dataStats.fileCount,
      soundsBytes: soundsStats.totalBytes,
      sounds: soundsStats.files.map((f) => ({
        name: f.name,
        sizeBytes: f.sizeBytes,
        mtime: f.mtime,
        url: `/api/sounds/${f.name}`,
      })),
    });
  });

  app.post('/api/admin/cleanup-orphans', requireAdmin, express.json({ limit: '16kb' }), (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const minAgeMs = Math.max(0, Number(req.body?.minAgeMs ?? 0) || 0);
    const result = runOrphanScan(false, minAgeMs);
    context?.addAuditLog?.(
      'ARTIK_DOSYA_TEMIZLIGI',
      `${authUser.username}, ${result.deletedFiles} artık dosyayı temizledi (${result.freedBytes} bayt).`,
      'info'
    );
    res.json({ ok: true, result });
  });

  app.delete('/api/admin/sounds/:filename', requireAdmin, (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const safeName = path.basename(String(req.params.filename || ''));
    const fullPath = path.join(SOUNDS_DIR, safeName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Dosya bulunamadı' });
    fs.unlinkSync(fullPath);
    context?.addAuditLog?.('SOUNDBOARD_SILINDI', `${authUser.username}, "${safeName}" ses dosyasını sildi.`, 'info');
    res.json({ ok: true });
  });

  app.get('/api/admin/all-events', requireAdmin, (_req, res) => {
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    const flat: ServerEventItem[] = [];
    for (const list of Object.values(all)) {
      if (Array.isArray(list)) flat.push(...list);
    }
    res.json({ ok: true, events: flat });
  });

  app.post('/api/admin/webhook-test', requireAdmin, express.json({ limit: '32kb' }), async (req, res) => {
    const webhookUrl = String(req.body?.webhookUrl || '').trim();
    const validation = await validateExternalWebhookUrl(webhookUrl);
    if (!validation.ok || !validation.normalizedUrl) {
      return res.status(400).json({ ok: false, error: validation.error || 'Geçerli bir harici http/https Webhook URL girin.' });
    }
    try {
      const resp = await fetch(validation.normalizedUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '✅ **Çakma Sistem Yönetim Paneli:** Webhook test bildirimi başarıyla ulaştı!',
          username: 'Çakma Sistem Botu',
        }),
      });
      res.json({ ok: resp.ok, status: resp.status });
    } catch (err: any) {
      res.json({ ok: false, error: err?.message || 'Bağlantı hatası' });
    }
  });

  app.post('/api/admin/users/:username/force-logout', requireAdmin, (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const uname = String(req.params.username || '').trim().toLowerCase();
    let count = 0;
    for (const [id, sock] of io.sockets.sockets) {
      const sUser = activeUsers.get(id)?.username || (sock as any).data?.username || (sock.handshake.auth as any)?.username;
      if (sUser && String(sUser).toLowerCase() === uname) {
        sock.emit('force_logout', { reason: 'Sistem yöneticisi tarafından oturumunuz sonlandırıldı.' });
        sock.disconnect(true);
        count++;
      }
    }
    context?.addAuditLog?.(
      'ZORUNLU_CIKIS',
      `${authUser.username}, "${req.params.username}" kullanıcısının ${count} aktif oturumunu sonlandırdı.`,
      'auth'
    );
    res.json({ ok: true, disconnected: count });
  });

  app.post('/api/admin/sessions/:socketId/revoke', requireAdmin, (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const socketId = String(req.params.socketId || '').trim();
    if (!socketId) {
      return res.status(400).json({ ok: false, error: 'Geçerli socketId gereklidir.' });
    }
    const targetSocket = io.sockets.sockets.get(socketId);
    if (!targetSocket) {
      return res.json({ ok: true, revoked: false });
    }
    const targetUsername =
      activeUsers.get(socketId)?.username ||
      (targetSocket as any).data?.username ||
      (targetSocket.handshake.auth as any)?.username ||
      socketId;
    targetSocket.emit('force_logout', { reason: 'Sistem yöneticisi tarafından oturumunuz sonlandırıldı.' });
    targetSocket.disconnect(true);
    context?.addAuditLog?.(
      'OTURUM_IPTAL',
      `${authUser.username}, "${targetUsername}" kullanıcısının oturumunu (${socketId}) kapattı.`,
      'auth'
    );
    res.json({ ok: true, revoked: true });
  });

  app.post('/api/admin/livekit-test', requireAdmin, express.json({ limit: '32kb' }), async (req, res) => {
    const current = context?.getEffectiveLiveKitConfig?.();
    const rawUrl = String(req.body?.livekitUrl ?? '').trim() || current?.url || 'http://127.0.0.1:7880';
    const livekitUrl = toHttpUrlFromLiveKit(rawUrl);
    const livekitApiKey = String(req.body?.livekitApiKey ?? '').trim() || current?.apiKey || '';
    const livekitApiSecret = String(req.body?.livekitApiSecret ?? '').trim() || current?.apiSecret || '';
    const turnUrl = String(req.body?.turnUrl ?? '').trim() || current?.turnUrl || '';
    const turnUsername = String(req.body?.turnUsername ?? '').trim() || current?.turnUsername || '';
    const turnCredential = String(req.body?.turnCredential ?? '').trim() || current?.turnCredential || '';

    const configured = Boolean(livekitApiKey && livekitApiSecret);
    let livekitReachable = false;
    let status = 0;
    let latencyMs = 0;
    let livekitMessage: string;

    let parsedLk: URL | null;
    try {
      parsedLk = new URL(livekitUrl);
    } catch {
      parsedLk = null;
    }

    if (!parsedLk || (parsedLk.protocol !== 'http:' && parsedLk.protocol !== 'https:')) {
      livekitMessage = 'LiveKit URL yalnızca http://, https://, ws:// veya wss:// olmalıdır.';
    } else {
      const started = Date.now();
      try {
        const resp = await fetch(parsedLk.toString(), {
          method: 'GET',
          signal: AbortSignal.timeout(2500),
        });
        latencyMs = Date.now() - started;
        status = resp.status;
        livekitReachable = resp.status < 500;
        livekitMessage = livekitReachable
          ? `Bağlantı başarılı (${latencyMs} ms)${configured ? '' : ' — Uyarı: API Key/Secret eksik'}`
          : `LiveKit HTTP ${resp.status} hatası döndü.`;
      } catch (err: any) {
        latencyMs = Date.now() - started;
        livekitMessage = `LiveKit sunucusuna ulaşılamadı: ${err?.message || 'Bağlantı zaman aşımı'}`;
      }
    }

    let turnValid = true;
    let turnMessage = 'Özel TURN tanımlanmamış (varsayılan STUN/LiveKit ICE kullanılacak).';
    if (turnUrl) {
      const turnPattern = /^(turns?|stuns?):(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:\d{1,5})?(\?.*)?$/i;
      if (!turnPattern.test(turnUrl)) {
        turnValid = false;
        turnMessage = 'TURN/STUN URL formatı geçersiz (örn: turn:turn.alanadiniz.com:3478).';
      } else if (/^turns?:/i.test(turnUrl) && (!turnUsername || !turnCredential)) {
        turnValid = true;
        turnMessage = 'TURN URI sözdizimi geçerli ancak kullanıcı adı veya şifre boş bırakılmış.';
      } else {
        turnValid = true;
        turnMessage = 'TURN sunucu adresi ve kimlik bilgileri geçerli görünüyor.';
      }
    }

    res.json({
      ok: livekitReachable && turnValid,
      livekit: {
        url: livekitUrl,
        configured,
        reachable: livekitReachable,
        status,
        latencyMs,
        message: livekitMessage,
      },
      turn: {
        configured: Boolean(turnUrl),
        valid: turnValid,
        message: turnMessage,
      },
    });
  });

  // 7. Authenticated Disk File Upload & Safe Static Retrieval
  const SAFE_UPLOAD_EXTS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
    'mp3', 'wav', 'ogg', 'webm', 'mp4',
    'pdf', 'txt', 'csv', 'json', 'zip', 'rar', '7z',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md',
  ]);
  const INLINE_MEDIA_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
    '.mp4': 'video/mp4',
  };

  const uploadQuotaMap = new Map<
    string,
    { countWindowStart: number; count: number; bytesWindowStart: number; bytes: number }
  >();
  if (context) {
    const quotaPruner = setInterval(() => {
      const now = Date.now();
      for (const [k, q] of uploadQuotaMap.entries()) {
        if (now - q.bytesWindowStart > 3600_000 && now - q.countWindowStart > 600_000) {
          uploadQuotaMap.delete(k);
        }
      }
    }, 10 * 60_000);
    quotaPruner.unref?.();
  }

  const persistVerifiedUpload = async (params: {
    name: string;
    mimeType: string;
    buffer: Buffer;
    username: string;
    role: string;
  }): Promise<
    | { ok: true; attachment: { id: string; name: string; size: number; type: string; url: string } }
    | { ok: false; status: number; error: string }
  > => {
    const cleanName = params.name.trim();
    const maxMb = context?.getMaxUploadSizeMb ? context.getMaxUploadSizeMb() : 5;
    const safety = validateAttachmentSafety(
      { name: cleanName, size: params.buffer.length, type: params.mimeType },
      maxMb
    );
    if (!safety.ok) {
      return {
        ok: false,
        status: 400,
        error: safety.error || 'Dosya güvenlik kontrolünden geçemedi.',
      };
    }

    const now = Date.now();
    const uKey = params.username.toLowerCase();
    const q = uploadQuotaMap.get(uKey) || {
      countWindowStart: now,
      count: 0,
      bytesWindowStart: now,
      bytes: 0,
    };
    if (now - q.countWindowStart > 600_000) {
      q.countWindowStart = now;
      q.count = 0;
    }
    if (now - q.bytesWindowStart > 3600_000) {
      q.bytesWindowStart = now;
      q.bytes = 0;
    }
    const maxCount = params.role === 'admin' ? 100 : 20;
    const maxHourlyBytes = (params.role === 'admin' ? 500 : 100) * 1024 * 1024;
    if (q.count + 1 > maxCount) {
      return {
        ok: false,
        status: 429,
        error: '10 dakikalık dosya yükleme limitine ulaştınız. Lütfen biraz bekleyin.',
      };
    }
    if (q.bytes + params.buffer.length > maxHourlyBytes) {
      return {
        ok: false,
        status: 429,
        error: 'Saatlik yükleme kotanız doldu. Lütfen daha sonra tekrar deneyin.',
      };
    }

    const maxDiskMb = Math.max(
      0.01,
      context?.maxUploadsDiskMb ?? (Number(process.env.MAX_UPLOADS_DISK_MB) || 2048)
    );
    const maxDiskBytes = Math.floor(maxDiskMb * 1024 * 1024);
    const diskStats = computeUploadsDirectoryStats(uploadsDir);
    if (diskStats.totalBytes + params.buffer.length > maxDiskBytes) {
      return {
        ok: false,
        status: 507,
        error: 'Sunucu dosya depolama kotası doldu.',
      };
    }

    const rawExt = path.extname(cleanName).toLowerCase().replace(/^\./, '');
    const ext = SAFE_UPLOAD_EXTS.has(rawExt) ? rawExt : 'bin';
    const isVideoUpload = params.mimeType.toLowerCase().startsWith('video/');
    const storedName = `${isVideoUpload ? 'upl-vid' : 'upl'}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${ext}`;
    try {
      ensureUploadsDir();
      await fs.promises.writeFile(path.join(uploadsDir, storedName), params.buffer);
    } catch (err) {
      console.error('❌ [Upload] Dosya yazılamadı:', err);
      return { ok: false, status: 500, error: 'Dosya sunucuya kaydedilemedi.' };
    }

    q.count += 1;
    q.bytes += params.buffer.length;
    uploadQuotaMap.set(uKey, q);

    context?.addAuditLog?.(
      'DOSYA_YUKLENDI',
      `${params.username} diske dosya yükledi: ${cleanName} (${params.buffer.length} B)`,
      'info'
    );

    return {
      ok: true,
      attachment: {
        id: `att-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        name: cleanName.slice(0, 140),
        size: params.buffer.length,
        type: params.mimeType.slice(0, 120),
        url: `/uploads/${storedName}`,
      },
    };
  };

  app.post('/api/upload', requireAuth, express.json({ limit: '35mb' }), async (req, res) => {
    const authUser = (req as AuthenticatedRequest).authUser!;
    const { name, type, dataUrl } = req.body || {};
    if (typeof name !== 'string' || typeof dataUrl !== 'string' || !name.trim() || !dataUrl) {
      return res.status(400).json({ ok: false, error: 'Geçersiz dosya yükleme isteği.' });
    }
    const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ ok: false, error: 'Desteklenmeyen veri formatı (Base64 bekleniyor).' });
    }

    const mimeType = typeof type === 'string' && type.trim() ? type.trim() : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const result = await persistVerifiedUpload({
      name,
      mimeType,
      buffer,
      username: authUser.username,
      role: authUser.role,
    });
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, attachment: result.attachment });
  });

  app.post(
    '/api/upload/stream',
    requireAuth,
    express.raw({ type: 'application/octet-stream', limit: '35mb' }),
    async (req, res) => {
      const authUser = (req as AuthenticatedRequest).authUser!;
      const rawNameHeader = String(req.headers['x-file-name'] || '').trim();
      let decodedName: string;
      try {
        decodedName = decodeURIComponent(rawNameHeader);
      } catch {
        decodedName = rawNameHeader;
      }
      if (!decodedName || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, error: 'Geçersiz ikili dosya yükleme isteği.' });
      }
      const mimeType =
        String(req.headers['x-file-type'] || '').trim() || 'application/octet-stream';
      const result = await persistVerifiedUpload({
        name: decodedName,
        mimeType,
        buffer: req.body,
        username: authUser.username,
        role: authUser.role,
      });
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error });
      }
      return res.json({ ok: true, attachment: result.attachment });
    }
  );

  app.get('/uploads/:filename', (req, res) => {
    const sessionToken = extractSessionToken(req);
    const queryMt = typeof req.query?.mt === 'string' ? req.query.mt.trim() : '';
    const sessionUser =
      sessionToken && context?.verifySessionToken
        ? context.verifySessionToken(sessionToken)
        : sessionToken && context?.verifySessionTokenWithMeta
        ? (() => {
            const meta = context.verifySessionTokenWithMeta(sessionToken);
            if (!meta) return null;
            if (context.getAccount) {
              const acc = context.getAccount(meta.username.toLowerCase());
              if (!acc) return null;
              if (acc.isBanned && (!acc.bannedUntil || Date.now() < acc.bannedUntil)) return null;
              if (acc.minTokenIssuedAt && meta.iat < acc.minTokenIssuedAt) return null;
            }
            return meta.username;
          })()
        : null;
    const mediaUser =
      !sessionUser && queryMt && context?.verifyMediaToken
        ? context.verifyMediaToken(queryMt)
        : null;

    if (!sessionUser && !mediaUser) {
      return res.status(401).json({ error: 'Bu dosyayı görüntülemek için oturum açmalısınız.' });
    }

    const safeName = path.basename(String(req.params.filename || ''));
    if (!/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      return res.status(400).json({ error: 'Geçersiz dosya adı' });
    }
    const filePath = path.join(uploadsDir, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }
    const ext = path.extname(safeName).toLowerCase();
    const inlineMime =
      ext === '.webm' && safeName.startsWith('upl-vid-') ? 'video/webm' : INLINE_MEDIA_MIME[ext];
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (inlineMime) {
      res.setHeader('Content-Type', inlineMime);
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }
    res.sendFile(filePath);
  });

  app.get('/api/storage/usage', requireAuth, (_req, res) => {
    const stats = computeUploadsDirectoryStats(uploadsDir);
    const maxDiskMb = Math.max(
      0.01,
      context?.maxUploadsDiskMb ?? (Number(process.env.MAX_UPLOADS_DISK_MB) || 2048)
    );
    const quotaBytes = Math.floor(maxDiskMb * 1024 * 1024);
    const usagePercent = Math.min(100, Math.round((stats.totalBytes / Math.max(1, quotaBytes)) * 1000) / 10);
    res.json({
      ok: true,
      totalBytes: stats.totalBytes,
      fileCount: stats.fileCount,
      quotaBytes,
      usagePercent,
    });
  });

  app.post('/api/storage/prune', requireAdmin, express.json({ limit: '64kb' }), (req, res) => {
    const rawAgeDays = Number(req.body?.maxAgeDays);
    const maxAgeDays = Number.isFinite(rawAgeDays) && rawAgeDays > 0 ? rawAgeDays : 30;
    const cutoffMs = Date.now() - maxAgeDays * 86_400_000;
    const targetFreeBytes = Math.max(0, Number(req.body?.targetFreeBytes) || 0);

    ensureUploadsDir();
    const fileItems: Array<{ fullPath: string; size: number; mtimeMs: number }> = [];
    for (const name of fs.readdirSync(uploadsDir)) {
      const fullPath = path.join(uploadsDir, name);
      try {
        const st = fs.statSync(fullPath);
        if (st.isFile()) {
          fileItems.push({ fullPath, size: st.size, mtimeMs: st.mtimeMs });
        }
      } catch {}
    }
    fileItems.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let deletedCount = 0;
    let freedBytes = 0;
    for (const item of fileItems) {
      const shouldDeleteForAge = item.mtimeMs < cutoffMs;
      const shouldDeleteForSpace = targetFreeBytes > 0 && freedBytes < targetFreeBytes;
      if (!shouldDeleteForAge && !shouldDeleteForSpace) continue;
      try {
        fs.unlinkSync(item.fullPath);
        deletedCount += 1;
        freedBytes += item.size;
      } catch {}
    }

    const remaining = computeUploadsDirectoryStats(uploadsDir);
    if (deletedCount > 0) {
      context?.addAuditLog?.(
        'DEPOLAMA_TEMIZLIGI',
        `${deletedCount} yükleme dosyası silindi (${freedBytes} B boşaltıldı).`,
        'info'
      );
    }
    res.json({
      ok: true,
      deletedCount,
      freedBytes,
      remainingBytes: remaining.totalBytes,
    });
  });
}
