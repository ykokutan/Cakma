export interface ParsedDeepLink {
  type: 'invite';
  code: string;
}

const VALID_CODE_RE = /^[A-Za-z0-9_-]{3,48}$/;

export function parseDeepLinkUrl(rawUrl: string | null | undefined): ParsedDeepLink | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  try {
    // Handle cakma://invite/CODE or cakma://invite?code=CODE
    if (trimmed.toLowerCase().startsWith('cakma://')) {
      const normalized = trimmed.replace(/^cakma:\/\//i, 'https://cakma.local/');
      const url = new URL(normalized);
      const qCode = url.searchParams.get('code') || url.searchParams.get('invite');
      if (qCode && VALID_CODE_RE.test(qCode)) {
        return { type: 'invite', code: qCode };
      }
      const segments = url.pathname.split('/').filter(Boolean);
      if (url.hostname.toLowerCase() === 'invite' && segments[0] && VALID_CODE_RE.test(segments[0])) {
        return { type: 'invite', code: segments[0] };
      }
      if (segments[0]?.toLowerCase() === 'invite' && segments[1] && VALID_CODE_RE.test(segments[1])) {
        return { type: 'invite', code: segments[1] };
      }
      if (segments.length === 0 && url.hostname && url.hostname !== 'invite' && VALID_CODE_RE.test(url.hostname)) {
        return { type: 'invite', code: url.hostname };
      }
      return null;
    }

    const url = new URL(trimmed, 'https://cakma.local');
    const qCode = url.searchParams.get('invite');
    if (qCode && VALID_CODE_RE.test(qCode)) {
      return { type: 'invite', code: qCode };
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const invIdx = segments.findIndex((s) => s.toLowerCase() === 'invite');
    if (invIdx !== -1 && segments[invIdx + 1] && VALID_CODE_RE.test(segments[invIdx + 1])) {
      return { type: 'invite', code: segments[invIdx + 1] };
    }
  } catch {
    return null;
  }

  return null;
}
