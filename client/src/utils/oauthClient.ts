import { authFetch, resolveBackendBaseUrl } from './authFetch';
import type { VerifiedConnection, VerifiedProviderId } from '../types';

export interface OAuthProvidersAvailability {
  steam: boolean;
  github: boolean;
  google: boolean;
  registrationEnabled: boolean;
  inviteOnly: boolean;
}

export interface OAuthFlowOutcome {
  ok: boolean;
  status?: 'completed' | 'requires_2fa' | 'error';
  token?: string;
  mediaToken?: string;
  username?: string;
  pending2faToken?: string;
  connection?: VerifiedConnection;
  error?: string;
  code?: string;
}

export function getProviderDisplayMeta(provider: VerifiedProviderId): {
  label: string;
  badgeColor: string;
  icon: string;
} {
  if (provider === 'steam') {
    return {
      label: 'Steam',
      badgeColor: 'bg-sky-500/15 border-sky-400/35 text-sky-200',
      icon: '🎮',
    };
  }
  if (provider === 'github') {
    return {
      label: 'GitHub',
      badgeColor: 'bg-slate-500/20 border-white/25 text-white',
      icon: '💻',
    };
  }
  return {
    label: 'Google',
    badgeColor: 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200',
    icon: '🌐',
  };
}

export function formatConnectionSummary(conn: VerifiedConnection): string {
  const parts: string[] = [conn.username];
  if (conn.provider === 'steam') {
    if (conn.metadata?.currentGame) {
      parts.push(`Oyunda: ${conn.metadata.currentGame}`);
    } else if (typeof conn.metadata?.gameCount === 'number') {
      parts.push(`${conn.metadata.gameCount} oyun`);
    }
  } else if (conn.provider === 'github' && typeof conn.metadata?.publicRepos === 'number') {
    parts.push(`${conn.metadata.publicRepos} repo`);
  }
  return parts.join(' · ');
}

export async function fetchOAuthProviders(host: string): Promise<OAuthProvidersAvailability> {
  try {
    const resp = await authFetch(host, '/api/oauth/providers');
    const data = await resp.json().catch(() => null);
    if (resp.ok && data?.ok && data.providers) {
      return {
        steam: Boolean(data.providers.steam),
        github: Boolean(data.providers.github),
        google: Boolean(data.providers.google),
        registrationEnabled: data.registrationEnabled !== false,
        inviteOnly: Boolean(data.inviteOnly),
      };
    }
  } catch {
    // ignore offline errors
  }
  return {
    steam: false,
    github: false,
    google: false,
    registrationEnabled: true,
    inviteOnly: false,
  };
}

export async function runOAuthPopupAndPoll(
  host: string,
  params: { provider: VerifiedProviderId; intent: 'login' | 'link'; inviteCode?: string }
): Promise<OAuthFlowOutcome> {
  const startResp = await authFetch(host, '/api/oauth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const startData = await startResp.json().catch(() => null);
  if (!startResp.ok || !startData?.ok || !startData.authorizeUrl) {
    return {
      ok: false,
      status: 'error',
      error: startData?.error || 'Kimlik doğrulama oturumu başlatılamadı.',
    };
  }

  const attemptId = String(startData.attemptId);
  const pollSecret = String(startData.pollSecret);
  const authorizeUrl = String(startData.authorizeUrl);

  const width = 540;
  const height = 680;
  const left = typeof window !== 'undefined' ? Math.max(0, window.screenX + (window.outerWidth - width) / 2) : 100;
  const top = typeof window !== 'undefined' ? Math.max(0, window.screenY + (window.outerHeight - height) / 2) : 100;
  const popup = typeof window !== 'undefined'
    ? window.open(
        authorizeUrl,
        `cakma-oauth-${params.provider}`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      )
    : null;

  if (!popup && typeof window !== 'undefined') {
    window.open(authorizeUrl, '_blank');
  }

  const base = resolveBackendBaseUrl(host);

  return new Promise<OAuthFlowOutcome>((resolve) => {
    let settled = false;
    const deadline = Date.now() + 120_000;

    const finish = (outcome: OAuthFlowOutcome) => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollTimer);
      window.removeEventListener('message', onMsg);
      try {
        popup?.close();
      } catch {}
      resolve(outcome);
    };

    const pollOnce = async () => {
      if (settled) return;
      if (Date.now() > deadline) {
        return finish({
          ok: false,
          status: 'error',
          error: 'Doğrulama zaman aşımına uğradı. Lütfen tekrar deneyin.',
        });
      }
      try {
        const res = await fetch(
          `${base}/api/oauth/poll/${encodeURIComponent(attemptId)}?secret=${encodeURIComponent(pollSecret)}`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => null);
        if (!data) return;
        if (data.status === 'pending') {
          if (popup && popup.closed && Date.now() - (deadline - 120_000) > 2500) {
            // Give one final grace poll tick if popup closed right after callback
            return;
          }
          return;
        }
        if (!data.ok || data.status === 'error') {
          return finish({
            ok: false,
            status: 'error',
            error: data.error || 'Doğrulama tamamlanamadı.',
            code: data.code,
          });
        }
        return finish({
          ok: true,
          status: data.status,
          token: data.token,
          mediaToken: data.mediaToken,
          username: data.username,
          pending2faToken: data.pending2faToken,
          connection: data.connection,
        });
      } catch {
        // transient network issue, keep polling until deadline
      }
    };

    const onMsg = (ev: MessageEvent) => {
      if (ev.data && typeof ev.data === 'object' && ev.data.type === 'cakma-oauth-done' && ev.data.attemptId === attemptId) {
        void pollOnce();
      }
    };

    window.addEventListener('message', onMsg);
    const pollTimer = window.setInterval(() => {
      void pollOnce();
    }, 1200);
  });
}

export async function updateVerifiedConnectionVisibility(
  host: string,
  provider: VerifiedProviderId,
  showOnProfile: boolean
): Promise<{ ok: boolean; verifiedConnections?: VerifiedConnection[]; error?: string }> {
  const resp = await authFetch(host, `/api/oauth/connections/${encodeURIComponent(provider)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showOnProfile }),
  });
  const data = await resp.json().catch(() => null);
  return resp.ok && data?.ok
    ? { ok: true, verifiedConnections: data.verifiedConnections }
    : { ok: false, error: data?.error || 'Görünürlük güncellenemedi.' };
}

export async function unlinkVerifiedConnection(
  host: string,
  provider: VerifiedProviderId
): Promise<{ ok: boolean; verifiedConnections?: VerifiedConnection[]; error?: string }> {
  const resp = await authFetch(host, `/api/oauth/connections/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
  const data = await resp.json().catch(() => null);
  return resp.ok && data?.ok
    ? { ok: true, verifiedConnections: data.verifiedConnections }
    : { ok: false, error: data?.error || 'Bağlantı kaldırılamadı.' };
}

export async function refreshSteamConnection(
  host: string
): Promise<{ ok: boolean; verifiedConnections?: VerifiedConnection[]; error?: string }> {
  const resp = await authFetch(host, '/api/oauth/steam/refresh', {
    method: 'POST',
  });
  const data = await resp.json().catch(() => null);
  return resp.ok && data?.ok
    ? { ok: true, verifiedConnections: data.verifiedConnections }
    : { ok: false, error: data?.error || 'Steam bilgisi güncellenemedi.' };
}
