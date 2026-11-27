/**
 * Android Capacitor native voice foreground service + Bluetooth MediaSession + notification action bridge.
 * Safely degrades to no-op in Web / Tauri desktop environments.
 */

interface AndroidVoiceBridge {
  startVoiceService?: (roomName: string, username: string) => void;
  stopVoiceService?: () => void;
  updateMuteState?: (muted: boolean) => void;
  updateVoiceState?: (muted: boolean, deafened: boolean) => void;
  triggerHaptic?: (style?: 'light' | 'heavy') => void;
}

export const ANDROID_ACTION_TOGGLE_MUTE = 'com.cakma.app.ACTION_TOGGLE_MUTE';
export const ANDROID_ACTION_TOGGLE_DEAFEN = 'com.cakma.app.ACTION_TOGGLE_DEAFEN';
export const ANDROID_ACTION_LEAVE_VOICE = 'com.cakma.app.ACTION_LEAVE_VOICE';

function getAndroidBridge(): AndroidVoiceBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { CakmaAndroidBridge?: AndroidVoiceBridge };
  return w.CakmaAndroidBridge || null;
}

export function startNativeVoiceForegroundService(roomName: string, username: string): void {
  try {
    getAndroidBridge()?.startVoiceService?.(
      String(roomName || 'Ses Odası'),
      String(username || 'Kullanıcı')
    );
  } catch {
    // ignore outside Android WebView
  }
}

export function updateNativeVoiceState(muted: boolean, deafened: boolean): void {
  try {
    const bridge = getAndroidBridge();
    if (!bridge) return;
    if (bridge.updateVoiceState) {
      bridge.updateVoiceState(Boolean(muted), Boolean(deafened));
    } else {
      bridge.updateMuteState?.(Boolean(muted));
    }
  } catch {
    // ignore outside Android WebView
  }
}

export function stopNativeVoiceForegroundService(): void {
  try {
    getAndroidBridge()?.stopVoiceService?.();
  } catch {
    // ignore outside Android WebView
  }
}

export function triggerMobileHaptic(style: 'light' | 'heavy' = 'light'): void {
  try {
    const bridge = getAndroidBridge();
    if (bridge?.triggerHaptic) {
      bridge.triggerHaptic(style);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'heavy' ? 28 : 12);
    }
  } catch {
    // ignore unsupported environments
  }
}

export function subscribeNativeVoiceActions(handlers: {
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onDisconnect: () => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<string>).detail;
    if (detail === ANDROID_ACTION_TOGGLE_MUTE) {
      handlers.onToggleMute();
    } else if (detail === ANDROID_ACTION_TOGGLE_DEAFEN) {
      handlers.onToggleDeafen();
    } else if (detail === ANDROID_ACTION_LEAVE_VOICE) {
      handlers.onDisconnect();
    }
  };
  window.addEventListener('cakma:android-voice-action', listener as EventListener);
  return () => {
    window.removeEventListener('cakma:android-voice-action', listener as EventListener);
  };
}

export function setupBluetoothVoiceMediaSession(opts: {
  roomName: string;
  username: string;
  isMuted: boolean;
  isDeafened?: boolean;
  onToggleMute: () => void;
  onDisconnect: () => void;
}): () => void {
  updateNativeVoiceState(opts.isMuted, Boolean(opts.isDeafened));

  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {};
  }
  const ms = navigator.mediaSession;
  try {
    if (typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title: `${opts.roomName || 'Ses Odası'} (${opts.isDeafened ? 'Sağırlaştırıldı' : opts.isMuted ? 'Mikrofon Kapalı' : 'Canlı Ses'})`,
        artist: opts.username || 'Çakma',
        album: 'Çakma Sesli İletişim',
      });
    }
    ms.playbackState = opts.isMuted ? 'paused' : 'playing';
  } catch {
    // ignore unsupported MediaMetadata environments
  }

  const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(action, handler);
    } catch {
      // ignore action unsupported on this browser/webview
    }
  };

  setHandler('play', () => opts.onToggleMute());
  setHandler('pause', () => opts.onToggleMute());
  setHandler('stop', () => opts.onDisconnect());

  return () => {
    setHandler('play', null);
    setHandler('pause', null);
    setHandler('stop', null);
    try {
      ms.playbackState = 'none';
    } catch {
      // ignore
    }
  };
}
