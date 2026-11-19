import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { generateLicenseKey, getLicensePublicKeyPem, verifyLicenseKey } from '../licenseGenerator.js';
import { extractSessionToken } from '../utils/adminAuth.js';
import type { DedicatedServerInfo, IssuedLicense, RegisteredAccount, StoreSettings } from '../types.js';

export interface DedicatedRoutesDeps {
  dedicatedServersRegistry: Map<string, DedicatedServerInfo>;
  issuedLicenses: Map<string, IssuedLicense>;
  saveLicenses: (licenses: Map<string, IssuedLicense>) => void;
  storeSettings: StoreSettings;
  saveStoreSettings: (settings: StoreSettings) => void;
  registeredAccounts: Map<string, RegisteredAccount>;
  verifySessionTokenWithMeta: (token: string) => { username: string; iat: number } | null;
  isMasterRequest: (req: Request) => boolean;
  addAuditLog: (action: string, details: string, type?: 'info' | 'warn' | 'voice' | 'auth') => void;
}

export function notifyDedicatedLicenseRevoked(
  io: SocketIOServer,
  dedicatedServersRegistry: Map<string, DedicatedServerInfo>,
  lic: IssuedLicense,
  reason?: string
): void {
  const effectiveReason = reason || 'Sistem yöneticisi tarafından lisans feshedildi.';
  const candidateEndpoints = new Set<string>([
    'http://127.0.0.1:4001/api/license/revoked',
    'http://localhost:4001/api/license/revoked',
  ]);

  for (const s of dedicatedServersRegistry.values()) {
    if (s.licenseKey === lic.licenseKey || s.licensee.toLowerCase() === lic.licensee.toLowerCase()) {
      s.status = 'revoked';
      io.to('admins').emit('admin_dedicated_updated', s);
      const hostsToTry = [
        s.host,
        s.host.replace('localhost', '127.0.0.1'),
        `127.0.0.1:${s.port || 4001}`,
        `localhost:${s.port || 4001}`,
      ];
      for (const h of hostsToTry) {
        if (h) candidateEndpoints.add(`http://${h}/api/license/revoked`);
      }
    }
  }

  for (const endpoint of candidateEndpoints) {
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: effectiveReason,
          licenseKey: lic.licenseKey,
        }),
        signal: AbortSignal.timeout(2500),
      }).catch(() => {});
    } catch {}
  }

  io.emit('dedicated_server_terminated', {
    title: 'Sunucu Lisansı İptal Edildi',
    reason: reason || 'Sistem yöneticisi bu özel sunucunun lisansını feshetti.',
    action: 'disconnect',
  });
}

export function registerDedicatedAndMasterRoutes(app: Express, io: SocketIOServer, deps: DedicatedRoutesDeps) {
  const requireMasterAuth = (req: Request, res: Response, next: NextFunction) => {
    if (deps.isMasterRequest(req)) {
      return next();
    }
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim: Geçersiz master API anahtarı.' });
  };

  const getSessionUsername = (req: Request): string | null => {
    const token = extractSessionToken(req);
    if (!token) return null;
    const verified = deps.verifySessionTokenWithMeta(token);
    if (!verified) return null;
    const acc = deps.registeredAccounts.get(verified.username.toLowerCase());
    if (!acc) return null;
    if (acc.minTokenIssuedAt && verified.iat < acc.minTokenIssuedAt) return null;
    return acc.username;
  };

  app.get('/api/dedicated/public-key', (_req, res) => {
    const publicKeyPem = getLicensePublicKeyPem();
    res.json({
      ok: Boolean(publicKeyPem),
      algorithm: 'ed25519',
      publicKeyPem,
    });
  });

  app.post('/api/dedicated/heartbeat', (req, res) => {
    const {
      id,
      serverName,
      host,
      port,
      licenseKey,
      channelsCount,
      onlineCount,
      uptimeSeconds,
    } = req.body;

    if (!id || !licenseKey || !serverName) {
      return res.status(400).json({ success: false, error: 'Eksik sunucu veya lisans parametresi.' });
    }

    const licVerify = verifyLicenseKey(licenseKey);
    if (!licVerify.valid || !licVerify.data) {
      return res.status(403).json({ success: false, error: licVerify.error || 'Geçersiz lisans anahtarı.' });
    }

    let matchedIssuedLicense: IssuedLicense | undefined;
    for (const lic of deps.issuedLicenses.values()) {
      if (lic.licenseKey === licenseKey || (licVerify.data && lic.licensee.toLowerCase() === licVerify.data.licensee.toLowerCase())) {
        matchedIssuedLicense = lic;
        break;
      }
    }

    if (matchedIssuedLicense) {
      if (matchedIssuedLicense.status === 'revoked') {
        const existing = deps.dedicatedServersRegistry.get(id);
        if (existing) {
          existing.status = 'revoked';
          io.to('admins').emit('admin_dedicated_updated', existing);
        }
        return res.status(403).json({
          success: false,
          revoked: true,
          error: 'LİSANS İPTAL EDİLDİ: Bu lisans sistem yöneticisi tarafından feshedilmiştir.',
        });
      }
      matchedIssuedLicense.activeServerHost = host || `localhost:${port || 4001}`;
    }

    const isNew = !deps.dedicatedServersRegistry.has(id);
    const serverInfo: DedicatedServerInfo = {
      id,
      serverName,
      host: host || `localhost:${port || 4001}`,
      port: port || 4001,
      licenseKey,
      licensee: licVerify.data.licensee,
      tier: licVerify.data.tier,
      maxSlots: licVerify.data.maxSlots,
      onlineCount: onlineCount || 0,
      channelsCount: channelsCount || 0,
      uptimeSeconds: uptimeSeconds || 0,
      lastHeartbeat: new Date().toISOString(),
      status: 'online',
    };

    deps.dedicatedServersRegistry.set(id, serverInfo);

    if (isNew) {
      deps.addAuditLog(
        'DEDICATED_SUNUCU_BAGLANDI',
        `Yeni Dedicated Ses Sunucusu sinyal verdi: "${serverName}" (${serverInfo.host}) - Lisans: ${serverInfo.licensee}`,
        'info'
      );
    }

    io.to('admins').emit('admin_dedicated_updated', serverInfo);
    res.json({ success: true, message: 'Heartbeat kabul edildi.' });
  });

  app.post('/api/dedicated/shutdown', (req, res) => {
    const { id, licenseKey } = req.body || {};
    if (id && deps.dedicatedServersRegistry.has(id)) {
      const s = deps.dedicatedServersRegistry.get(id)!;
      const isMaster = deps.isMasterRequest(req);
      const hasMatchingLicense =
        typeof licenseKey === 'string' &&
        licenseKey.length > 0 &&
        typeof s.licenseKey === 'string' &&
        s.licenseKey.length > 0 &&
        crypto.timingSafeEqual(
          crypto.createHash('sha256').update(licenseKey).digest(),
          crypto.createHash('sha256').update(s.licenseKey).digest()
        );
      if (!isMaster && !hasMatchingLicense) {
        return res.status(401).json({ success: false, error: 'Yetkisiz erişim: Geçersiz sunucu lisans anahtarı.' });
      }
      s.status = 'offline';
      deps.addAuditLog('DEDICATED_SUNUCU_KAPANDI', `Dedicated Ses Sunucusu kapandi: "${s.serverName}" (${s.host})`, 'warn');
      io.to('admins').emit('admin_dedicated_updated', s);
    }
    res.json({ success: true });
  });

  app.get('/api/dedicated/list', (req, res) => {
    const sessionUser = getSessionUsername(req);
    const isAdminSession = sessionUser ? deps.registeredAccounts.get(sessionUser.toLowerCase())?.role === 'admin' : false;
    if (!deps.isMasterRequest(req) && !isAdminSession) {
      return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
    }
    res.json({
      total: deps.dedicatedServersRegistry.size,
      servers: Array.from(deps.dedicatedServersRegistry.values()),
    });
  });

  app.get('/api/dedicated/verify-license', (req, res) => {
    const licenseKey = (req.query.licenseKey as string)?.trim();
    if (!licenseKey) {
      return res.status(400).json({ valid: false, error: 'Lisans anahtarı parametresi eksik.' });
    }

    const licVerify = verifyLicenseKey(licenseKey);
    if (!licVerify.valid || !licVerify.data) {
      return res.status(403).json({ valid: false, error: licVerify.error || 'Lisans anahtarı imza kontrolünü geçemedi.' });
    }

    for (const lic of deps.issuedLicenses.values()) {
      if (lic.licenseKey === licenseKey || (licVerify.data && lic.licensee.toLowerCase() === licVerify.data.licensee.toLowerCase())) {
        if (lic.status !== 'active') {
          return res.status(403).json({
            valid: false,
            status: lic.status,
            error:
              lic.status === 'revoked'
                ? 'Bu lisans sistem yöneticisi tarafından feshedilmiştir.'
                : 'Bu lisans henüz aktif değildir (Ödeme veya yönetici onayı bekleniyor).',
          });
        }
        return res.json({ valid: true, status: lic.status, data: licVerify.data });
      }
    }

    return res.json({ valid: true, status: 'active', data: licVerify.data });
  });

  app.get('/api/master/licenses', requireMasterAuth, (_req, res) => {
    res.json({
      success: true,
      licenses: Array.from(deps.issuedLicenses.values()),
    });
  });

  app.get('/api/master/user-licenses', (req, res) => {
    const username = (req.query.username as string)?.trim()?.toLowerCase();
    const isMaster = deps.isMasterRequest(req);
    const sessionUser = getSessionUsername(req);
    const isAdminSession = sessionUser ? deps.registeredAccounts.get(sessionUser.toLowerCase())?.role === 'admin' : false;

    if (!isMaster && (!sessionUser || (!isAdminSession && sessionUser.toLowerCase() !== username))) {
      return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
    }

    if (!username) {
      return res.json({ success: true, licenses: [] });
    }
    const userLics = Array.from(deps.issuedLicenses.values()).filter(
      (l) => l.assignedUsername.toLowerCase() === username
    );
    res.json({ success: true, licenses: userLics });
  });

  app.post('/api/master/license/generate', requireMasterAuth, (req, res) => {
    const { licensee, maxSlots, expireDays, tier, assignedUsername } = req.body;
    const cleanLicensee = (licensee || 'Ozel Musteri').trim();
    const slots = Number(maxSlots) || 64;
    const days = Number(expireDays) || 365;
    const selectedTier = tier || 'Pro';
    const targetUsername = assignedUsername?.trim() || 'admin';

    const licenseKey = generateLicenseKey(cleanLicensee, slots, days, selectedTier);
    const expiresAt =
      days === -1 ? 'lifetime' : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const newLicense: IssuedLicense = {
      id: `lic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      licenseKey,
      licensee: cleanLicensee,
      assignedUsername: targetUsername,
      maxSlots: slots,
      tier: selectedTier,
      status: 'active',
      issuedAt: new Date().toISOString(),
      expiresAt,
      source: 'admin',
    };

    deps.issuedLicenses.set(newLicense.id, newLicense);
    deps.saveLicenses(deps.issuedLicenses);
    io.to('admins').emit('admin_licenses_list', Array.from(deps.issuedLicenses.values()));
    res.json({ success: true, license: newLicense });
  });

  app.post('/api/master/license/revoke', requireMasterAuth, (req, res) => {
    const { licenseId, reason } = req.body;
    const lic = deps.issuedLicenses.get(licenseId);
    if (lic) {
      lic.status = 'revoked';
      deps.saveLicenses(deps.issuedLicenses);
      io.to('admins').emit('admin_licenses_list', Array.from(deps.issuedLicenses.values()));
      notifyDedicatedLicenseRevoked(io, deps.dedicatedServersRegistry, lic, reason);
      return res.json({ success: true, message: 'Lisans iptal edildi.' });
    }
    res.status(404).json({ success: false, error: 'Lisans bulunamadı.' });
  });

  app.post('/api/master/license/extend', requireMasterAuth, (req, res) => {
    const { licenseId, addDays } = req.body;
    const lic = deps.issuedLicenses.get(licenseId);
    if (!lic) return res.status(404).json({ success: false, error: 'Lisans bulunamadı.' });

    const days = Number(addDays);
    let newExpiresAt: string;
    if (days === -1) {
      newExpiresAt = 'lifetime';
    } else {
      const currentExpiry =
        lic.expiresAt === 'lifetime' || lic.expiresAt.startsWith('2099')
          ? Date.now()
          : new Date(lic.expiresAt).getTime();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const newLicenseKey = generateLicenseKey(lic.licensee, lic.maxSlots, newExpiresAt, lic.tier);
    lic.licenseKey = newLicenseKey;
    lic.expiresAt = newExpiresAt;
    if (lic.status === 'expired') {
      lic.status = 'active';
    }

    deps.saveLicenses(deps.issuedLicenses);
    io.to('admins').emit('admin_licenses_list', Array.from(deps.issuedLicenses.values()));
    res.json({ success: true, license: lic });
  });

  app.get('/api/master/store-settings', (_req, res) => {
    res.json(deps.storeSettings);
  });

  app.post('/api/master/store-settings', requireMasterAuth, (req, res) => {
    Object.assign(deps.storeSettings, req.body);
    deps.saveStoreSettings(deps.storeSettings);
    io.emit('store_settings_updated', deps.storeSettings);
    res.json({ success: true, storeSettings: deps.storeSettings });
  });

  // Periodic Heartbeat Sweeper: 30 saniye sinyal vermeyenleri offline yap
  const sweeper = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const srv of deps.dedicatedServersRegistry.values()) {
      if (srv.status === 'online' && now - new Date(srv.lastHeartbeat).getTime() > 30000) {
        srv.status = 'offline';
        changed = true;
        io.to('admins').emit('admin_dedicated_updated', srv);
      }
    }
    if (changed) {
      io.to('admins').emit('admin_dedicated_list', Array.from(deps.dedicatedServersRegistry.values()));
    }
  }, 15000);
  sweeper.unref?.();
}
