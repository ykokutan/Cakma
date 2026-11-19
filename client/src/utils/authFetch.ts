export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    window.location.hostname === 'tauri.localhost' ||
    window.location.protocol === 'tauri:'
  );
}

export function resolveBackendBaseUrl(host: string): string {
  const cleaned = String(host || '').trim().replace(/\/+$/, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  const lower = cleaned.toLowerCase();
  if (lower.startsWith('localhost') || lower.startsWith('127.0.0.1')) {
    return `http://${cleaned}`;
  }
  if (isTauriRuntime()) {
    return `https://${cleaned}`;
  }
  if (typeof window !== 'undefined' && window.location?.protocol) {
    return `${window.location.protocol}//${cleaned}`;
  }
  return `https://${cleaned}`;
}

export function getStoredMediaToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('dc_clone_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const mt = typeof parsed?.mediaToken === 'string' ? parsed.mediaToken.trim() : '';
    return mt || null;
  } catch {
    return null;
  }
}

/** Resolve relative `/uploads/...` or `/api/sounds/...` media URLs against the active server host. */
export function resolveMediaUrl(rawUrl: string | undefined | null, host: string): string {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  if (
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://')
  ) {
    return raw;
  }
  if (raw.startsWith('/')) {
    let targetPath = raw;
    if (targetPath.startsWith('/uploads/') && !/[?&]mt=/.test(targetPath)) {
      const mt = getStoredMediaToken();
      if (mt) {
        const sep = targetPath.includes('?') ? '&' : '?';
        targetPath = `${targetPath}${sep}mt=${encodeURIComponent(mt)}`;
      }
    }
    const base = resolveBackendBaseUrl(host);
    return base ? `${base}${targetPath}` : targetPath;
  }
  return raw;
}

export function getStoredAuthToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('dc_clone_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
    if (!token || token === '__cookie__') return null;
    return token;
  } catch {
    return null;
  }
}

export function getAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getStoredAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

export async function authFetch(
  hostOrFullUrl: string,
  pathOrInit?: string | RequestInit,
  maybeInit?: RequestInit
): Promise<Response> {
  let url = hostOrFullUrl;
  let init: RequestInit | undefined;
  if (typeof pathOrInit === 'string') {
    const base = resolveBackendBaseUrl(hostOrFullUrl);
    const suffix = pathOrInit.startsWith('/') ? pathOrInit : `/${pathOrInit}`;
    url = `${base}${suffix}`;
    init = maybeInit;
  } else {
    init = pathOrInit;
  }
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: getAuthHeaders(init?.headers),
  });
}
