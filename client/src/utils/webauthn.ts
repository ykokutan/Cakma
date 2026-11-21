import type { PasskeyInfo } from '../types';
import { authFetch, resolveBackendBaseUrl } from './authFetch';

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    Boolean(navigator?.credentials?.create) &&
    Boolean(navigator?.credentials?.get)
  );
}

export function base64UrlToUint8Array(b64url: string): Uint8Array {
  const clean = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (clean.length % 4)) % 4;
  const padded = clean + '='.repeat(padLen);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function arrayBufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

export async function listPasskeys(host: string): Promise<PasskeyInfo[]> {
  try {
    const res = await authFetch(host, '/api/auth/passkeys');
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.passkeys) ? json.passkeys : [];
  } catch {
    return [];
  }
}

export async function deletePasskey(host: string, credId: string): Promise<boolean> {
  try {
    const res = await authFetch(host, `/api/auth/passkeys/${encodeURIComponent(credId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function registerPasskey(
  host: string,
  label: string
): Promise<{ success: boolean; passkey?: PasskeyInfo; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'Bu tarayıcı/cihaz WebAuthn Passkey desteklemiyor.' };
  }
  try {
    const optRes = await authFetch(host, '/api/auth/passkey/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const optJson = await optRes.json().catch(() => ({}));
    if (!optRes.ok || !optJson?.success || !optJson?.options) {
      return { success: false, error: optJson?.error || 'Passkey kayıt seçenekleri alınamadı.' };
    }

    const opts = optJson.options;
    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      rp: opts.rp,
      user: {
        id: toArrayBuffer(base64UrlToUint8Array(opts.user.id)),
        name: opts.user.name,
        displayName: opts.user.displayName,
      },
      challenge: toArrayBuffer(base64UrlToUint8Array(opts.challenge)),
      pubKeyCredParams: opts.pubKeyCredParams,
      timeout: opts.timeout || 60_000,
      attestation: opts.attestation || 'none',
      authenticatorSelection: opts.authenticatorSelection,
      excludeCredentials: Array.isArray(opts.excludeCredentials)
        ? opts.excludeCredentials.map((c: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }) => ({
            type: c.type,
            id: toArrayBuffer(base64UrlToUint8Array(c.id)),
            ...(Array.isArray(c.transports) ? { transports: c.transports } : {}),
          }))
        : [],
    };

    const cred = (await navigator.credentials.create({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential | null;
    if (!cred) {
      return { success: false, error: 'Passkey oluşturma iptal edildi.' };
    }

    const response = cred.response as AuthenticatorAttestationResponse;
    const transports = typeof response.getTransports === 'function' ? response.getTransports() : undefined;

    const verifyRes = await authFetch(host, '/api/auth/passkey/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: optJson.challengeId,
        label: label.trim(),
        transports,
        response: {
          attestationObject: arrayBufferToBase64Url(response.attestationObject),
          clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
        },
      }),
    });
    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyJson?.success) {
      return { success: false, error: verifyJson?.error || 'Passkey doğrulanamadı.' };
    }
    return { success: true, passkey: verifyJson.passkey };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Passkey ekleme sırasında hata oluştu.',
    };
  }
}

export async function loginWithPasskey(
  host: string,
  username?: string
): Promise<{ success: boolean; token?: string; mediaToken?: string; username?: string; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'Bu tarayıcı/cihaz WebAuthn Passkey desteklemiyor.' };
  }
  try {
    const base = resolveBackendBaseUrl(host);
    const optRes = await fetch(`${base}/api/auth/passkey/login-options`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(username?.trim() ? { username: username.trim() } : {}),
    });
    const optJson = await optRes.json().catch(() => ({}));
    if (!optRes.ok || !optJson?.success || !optJson?.options) {
      return { success: false, error: optJson?.error || 'Passkey giriş oturumu başlatılamadı.' };
    }

    const opts = optJson.options;
    const requestOptions: PublicKeyCredentialRequestOptions = {
      challenge: toArrayBuffer(base64UrlToUint8Array(opts.challenge)),
      rpId: opts.rpId,
      timeout: opts.timeout || 60_000,
      userVerification: opts.userVerification || 'preferred',
      ...(Array.isArray(opts.allowCredentials) && opts.allowCredentials.length > 0
        ? {
            allowCredentials: opts.allowCredentials.map(
              (c: { type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }) => ({
                type: c.type,
                id: toArrayBuffer(base64UrlToUint8Array(c.id)),
                ...(Array.isArray(c.transports) ? { transports: c.transports } : {}),
              })
            ),
          }
        : {}),
    };

    const cred = (await navigator.credentials.get({
      publicKey: requestOptions,
    })) as PublicKeyCredential | null;
    if (!cred) {
      return { success: false, error: 'Passkey doğrulaması iptal edildi.' };
    }

    const assertion = cred.response as AuthenticatorAssertionResponse;
    const verifyRes = await fetch(`${base}/api/auth/passkey/login-verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: optJson.challengeId,
        id: arrayBufferToBase64Url(cred.rawId),
        response: {
          authenticatorData: arrayBufferToBase64Url(assertion.authenticatorData),
          clientDataJSON: arrayBufferToBase64Url(assertion.clientDataJSON),
          signature: arrayBufferToBase64Url(assertion.signature),
        },
      }),
    });
    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyJson?.success || !verifyJson?.token) {
      return { success: false, error: verifyJson?.error || 'Passkey ile giriş yapılamadı.' };
    }

    return {
      success: true,
      token: verifyJson.token,
      mediaToken: verifyJson.mediaToken,
      username: verifyJson.username,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Passkey girişi sırasında hata oluştu.',
    };
  }
}
