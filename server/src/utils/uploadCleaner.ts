import fs from 'fs';
import path from 'path';
import type { Message, RegisteredAccount, Server } from '../types.js';

export interface OrphanScanResult {
  scannedFiles: number;
  orphanFiles: number;
  deletedFiles: number;
  freedBytes: number;
  orphanNames: string[];
  dryRun: boolean;
}

const SOUND_REF_REGEX = /(?:\/api\/sounds\/|\/uploads\/)([a-zA-Z0-9._-]+)/g;

function collectFromString(val: unknown, out: Set<string>) {
  if (typeof val !== 'string' || !val) return;
  let match: RegExpExecArray | null;
  SOUND_REF_REGEX.lastIndex = 0;
  while ((match = SOUND_REF_REGEX.exec(val)) !== null) {
    if (match[1]) out.add(path.basename(match[1]));
  }
  if (!val.startsWith('data:') && (val.includes('snd-') || val.startsWith('http') || val.startsWith('/'))) {
    const clean = val.split('?')[0].split('#')[0];
    const base = path.basename(clean);
    if (base && base.includes('.')) {
      out.add(base);
    }
  }
}

export function collectReferencedMediaUrls(params: {
  dataDir: string;
  messagesMap?: Record<string, Message[]>;
  accounts?: Map<string, RegisteredAccount>;
  servers?: Server[];
  extraReferencedUrls?: Iterable<string>;
}): Set<string> {
  const refs = new Set<string>();
  const { dataDir, messagesMap, accounts, servers, extraReferencedUrls } = params;

  if (extraReferencedUrls) {
    for (const url of extraReferencedUrls) {
      collectFromString(url, refs);
    }
  }

  // 1. User preferences (customSoundboard)
  try {
    const prefsPath = path.join(dataDir, 'user-prefs.json');
    if (fs.existsSync(prefsPath)) {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')) as Record<string, any>;
      for (const userPref of Object.values(prefs || {})) {
        const list = userPref?.customSoundboard;
        if (Array.isArray(list)) {
          for (const item of list) {
            collectFromString(item?.dataUrl, refs);
            collectFromString(item?.url, refs);
          }
        }
      }
    }
  } catch {}

  // 2. Messages & attachments
  if (messagesMap) {
    for (const msgs of Object.values(messagesMap)) {
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        collectFromString(m.content, refs);
        if (Array.isArray(m.attachments)) {
          for (const att of m.attachments) {
            collectFromString(att?.url, refs);
          }
        }
      }
    }
  }

  // 3. Account avatars & banners
  if (accounts) {
    for (const acc of accounts.values()) {
      collectFromString(acc.avatar, refs);
      collectFromString(acc.bannerImage, refs);
    }
  }

  // 4. Server icons, banners & emojis
  if (servers) {
    for (const srv of servers) {
      collectFromString(srv.icon, refs);
      collectFromString(srv.bannerImage, refs);
      const emojis = (srv as any).customEmojis || (srv as any).emojis;
      if (Array.isArray(emojis)) {
        for (const em of emojis) {
          collectFromString(em?.url, refs);
        }
      }
    }
  }

  return refs;
}

export function scanAndCleanOrphanUploads(options: {
  dataDir: string;
  referencedUrls: Set<string>;
  minAgeMs?: number;
  dryRun?: boolean;
  nowMs?: number;
}): OrphanScanResult {
  const {
    dataDir,
    referencedUrls,
    minAgeMs = 24 * 3600 * 1000,
    dryRun = true,
    nowMs = Date.now(),
  } = options;

  const dirs = [path.join(dataDir, 'sounds'), path.join(dataDir, 'uploads')];
  let scannedFiles = 0;
  let orphanFiles = 0;
  let deletedFiles = 0;
  let freedBytes = 0;
  const orphanNames: string[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        scannedFiles++;
        if (referencedUrls.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        try {
          const st = fs.statSync(fullPath);
          if (minAgeMs > 0 && nowMs - st.mtimeMs < minAgeMs) {
            continue;
          }
          orphanFiles++;
          orphanNames.push(entry.name);
          freedBytes += st.size;
          if (!dryRun) {
            fs.unlinkSync(fullPath);
            deletedFiles++;
          }
        } catch {}
      }
    } catch {}
  }

  return {
    scannedFiles,
    orphanFiles,
    deletedFiles,
    freedBytes,
    orphanNames: orphanNames.slice(0, 100),
    dryRun,
  };
}
