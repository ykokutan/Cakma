import express, { Express } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { getPersistentDir, getStorageEngineInfo } from '../storage.js';
import { collectReferencedMediaUrls, scanAndCleanOrphanUploads } from '../utils/uploadCleaner.js';
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
}

const DATA_DIR = getPersistentDir();
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
const PREFS_FILE = path.join(DATA_DIR, 'user-prefs.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR, { recursive: true });
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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export interface OrphanCleanupContext {
  getMessagesMap: () => Record<string, Message[]>;
  getAccounts: () => Map<string, RegisteredAccount>;
  getServers: () => Server[];
}

export function registerCloudSyncAndEvents(
  app: Express,
  io: SocketIOServer,
  activeUsers: Map<string, { username: string }>,
  orphanContext?: OrphanCleanupContext
) {
  ensureDirs();

  const runOrphanScan = (dryRun: boolean, minAgeMs: number) => {
    const referencedUrls = collectReferencedMediaUrls({
      dataDir: DATA_DIR,
      messagesMap: orphanContext?.getMessagesMap?.(),
      accounts: orphanContext?.getAccounts?.(),
      servers: orphanContext?.getServers?.(),
    });
    return scanAndCleanOrphanUploads({
      dataDir: DATA_DIR,
      referencedUrls,
      minAgeMs,
      dryRun,
    });
  };

  if (orphanContext) {
    const gcTimer = setInterval(() => {
      try {
        const res = runOrphanScan(false, 24 * 3600 * 1000);
        if (res.deletedFiles > 0) {
          console.log(`🧹 [GarbageCollector] ${res.deletedFiles} artık dosya temizlendi (${res.freedBytes} bayt).`);
        }
      } catch {}
    }, 6 * 3600 * 1000);
    gcTimer.unref?.();
  }

  // 1. Cloud User Preferences Sync
  app.get('/api/user-prefs/:username', (req, res) => {
    const uname = String(req.params.username || '').trim().toLowerCase();
    if (!uname) return res.status(400).json({ error: 'Username required' });
    const all = readJson<Record<string, any>>(PREFS_FILE, {});
    res.json({ ok: true, prefs: all[uname] || null });
  });

  app.post('/api/user-prefs/:username', express.json({ limit: '1mb' }), (req, res) => {
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

  // 2. Server Events (Etkinlikler)
  app.get('/api/events/:serverId', (req, res) => {
    const serverId = String(req.params.serverId || '').trim();
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    res.json({ ok: true, events: all[serverId] || [] });
  });

  app.post('/api/events/:serverId', express.json({ limit: '256kb' }), (req, res) => {
    const serverId = String(req.params.serverId || '').trim();
    const { title, description, scheduledAt, createdBy } = req.body || {};
    if (!serverId || !title || !scheduledAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    const item: ServerEventItem = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serverId,
      title: String(title).slice(0, 80),
      description: String(description || '').slice(0, 400),
      scheduledAt: String(scheduledAt),
      createdBy: String(createdBy || 'Üye'),
      attendees: createdBy ? [String(createdBy)] : [],
      createdAt: new Date().toISOString(),
    };
    all[serverId] = [item, ...(all[serverId] || [])].slice(0, 50);
    writeJson(EVENTS_FILE, all);
    io.emit('server_events_updated', { serverId, events: all[serverId] });
    res.json({ ok: true, event: item, events: all[serverId] });
  });

  app.post('/api/events/:serverId/:eventId/rsvp', express.json({ limit: '64kb' }), (req, res) => {
    const { serverId, eventId } = req.params;
    const username = String(req.body?.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username required' });
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
    io.emit('server_events_updated', { serverId, events: list });
    res.json({ ok: true, events: list });
  });

  app.delete('/api/events/:serverId/:eventId', (req, res) => {
    const { serverId, eventId } = req.params;
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    all[serverId] = (all[serverId] || []).filter((e) => e.id !== eventId);
    writeJson(EVENTS_FILE, all);
    io.emit('server_events_updated', { serverId, events: all[serverId] });
    res.json({ ok: true, events: all[serverId] });
  });

  // 3. Server-side Custom Soundboard Upload & Serving
  app.post('/api/sounds/upload', express.json({ limit: '2mb' }), (req, res) => {
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

  app.get('/api/sounds/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    const fullPath = path.join(SOUNDS_DIR, safeName);
    if (!fs.existsSync(fullPath)) return res.status(404).end();
    res.sendFile(fullPath);
  });

  // 4. Active Sessions & Remote Logout
  app.get('/api/sessions/:username', (req, res) => {
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

  app.post('/api/sessions/:username/revoke-others', express.json({ limit: '32kb' }), (req, res) => {
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

  // 5. Admin Panel Utilities: Disk Usage, Uploaded Sounds Management, All Events, Webhook Test & Force Logout
  app.get('/api/admin/disk-usage', (_req, res) => {
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
    const orphanStats = orphanContext ? runOrphanScan(true, 0) : null;
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

  app.post('/api/admin/cleanup-orphans', express.json({ limit: '16kb' }), (req, res) => {
    const minAgeMs = Math.max(0, Number(req.body?.minAgeMs ?? 0) || 0);
    const result = runOrphanScan(false, minAgeMs);
    res.json({ ok: true, result });
  });

  app.delete('/api/admin/sounds/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    const fullPath = path.join(SOUNDS_DIR, safeName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Dosya bulunamadı' });
    fs.unlinkSync(fullPath);
    res.json({ ok: true });
  });

  app.get('/api/admin/all-events', (_req, res) => {
    const all = readJson<Record<string, ServerEventItem[]>>(EVENTS_FILE, {});
    const flat: ServerEventItem[] = [];
    for (const list of Object.values(all)) {
      if (Array.isArray(list)) flat.push(...list);
    }
    res.json({ ok: true, events: flat });
  });

  app.post('/api/admin/webhook-test', express.json({ limit: '32kb' }), async (req, res) => {
    const webhookUrl = String(req.body?.webhookUrl || '').trim();
    if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
      return res.status(400).json({ ok: false, error: 'Geçerli bir http/https Webhook URL girin.' });
    }
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
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

  app.post('/api/admin/users/:username/force-logout', (req, res) => {
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
    res.json({ ok: true, disconnected: count });
  });
}
