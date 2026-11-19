import { authFetch } from './authFetch';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToWebPush(serverHost: string): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushSupported()) {
    return { ok: false, error: 'Bu tarayıcı/ortam Web Push bildirimlerini desteklemiyor.' };
  }
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, error: 'Tarayıcı bildirim izni reddedildi.' };
    }

    const keyRes = await authFetch(serverHost, '/api/push/vapid-public-key');
    const keyData = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok || !keyData?.publicKey) {
      return { ok: false, error: 'Sunucudan VAPID ortak anahtarı alınamadı.' };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(String(keyData.publicKey)) as BufferSource,
      });
    }

    const subJson = sub.toJSON();
    const res = await authFetch(serverHost, '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subJson }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || 'Web Push aboneliği sunucuya kaydedilemedi.' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Web Push aboneliği başlatılamadı.' };
  }
}

export async function unsubscribeFromWebPush(serverHost: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sub = await getCurrentPushSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await authFetch(serverHost, '/api/push/unsubscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Web Push aboneliği iptal edilemedi.' };
  }
}

export async function sendTestWebPush(serverHost: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(serverHost, '/api/push/test', {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'Test bildirimi gönderilemedi.' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Bağlantı hatası.' };
  }
}
