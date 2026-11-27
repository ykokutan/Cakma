import pkg from '../../package.json';
import { isCapacitorRuntime, isTauriRuntime, resolveBackendBaseUrl } from './authFetch';

export const APP_MANIFEST_VERSION: string = pkg.version || '1.5.0';

export interface AndroidApkUpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl: string;
  sha256?: string;
  notes?: string;
}

interface AndroidBridgeVersionExt {
  getAppVersion?: () => string;
}

export function compareSemver(a: string, b: string): number {
  const norm = (v: string) =>
    String(v || '0.0.0')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function isCapacitorAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    CakmaAndroidBridge?: unknown;
    Capacitor?: { getPlatform?: () => string };
  };
  if (w.CakmaAndroidBridge) return true;
  if (w.Capacitor?.getPlatform?.() === 'android') return true;
  return isCapacitorRuntime() && /android/i.test(navigator.userAgent || '');
}

export async function getInstalledAppVersion(): Promise<string> {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { CakmaAndroidBridge?: AndroidBridgeVersionExt };
    try {
      const nativeVer = w.CakmaAndroidBridge?.getAppVersion?.();
      if (nativeVer && nativeVer.trim()) return nativeVer.trim();
    } catch {
      // ignore
    }
    if (isTauriRuntime()) {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const v = await getVersion();
        if (v && v.trim()) return v.trim();
      } catch {
        // ignore
      }
    }
  }
  return APP_MANIFEST_VERSION;
}

export function evaluateAndroidUpdatePayload(
  payload: unknown,
  currentVersion: string,
  baseUrl: string
): AndroidApkUpdateInfo {
  const data = (payload && typeof payload === 'object' ? payload : {}) as {
    version?: string;
    notes?: string;
    android?: { version?: string; url?: string; sha256?: string };
  };
  const latestVersion = String(data.android?.version || data.version || '').trim();
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const apkUrl =
    String(data.android?.url || '').trim() ||
    (cleanBase ? `${cleanBase}/downloads/Cakma.apk` : '/downloads/Cakma.apk');

  const available = Boolean(latestVersion && compareSemver(latestVersion, currentVersion) > 0);
  return {
    available,
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    apkUrl,
    ...(data.android?.sha256 ? { sha256: String(data.android.sha256) } : {}),
    ...(data.notes ? { notes: String(data.notes) } : {}),
  };
}

export async function checkAndroidApkUpdate(
  host: string,
  explicitCurrentVersion?: string
): Promise<AndroidApkUpdateInfo> {
  const currentVersion = explicitCurrentVersion || (await getInstalledAppVersion());
  const base = resolveBackendBaseUrl(host);
  const endpoints = [`${base}/api/releases/latest`, `${base}/downloads/latest.json`];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json();
      return evaluateAndroidUpdatePayload(json, currentVersion, base);
    } catch {
      // try next candidate
    }
  }

  return {
    available: false,
    currentVersion,
    latestVersion: currentVersion,
    apkUrl: base ? `${base}/downloads/Cakma.apk` : '/downloads/Cakma.apk',
  };
}
