/**
 * Android Capacitor native voice foreground service + Bluetooth MediaSession bridge.
 * Safely degrades to no-op in Web / Tauri desktop environments.
 */

interface AndroidVoiceBridge {
  startVoiceService?: (roomName: string, username: string) => void;
  stopVoiceService?: () => void;
  updateMuteState?: (muted: boolean) => void;
}

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

export function stopNativeVoiceForegroundService(): void {
  try {
    getAndroidBridge()?.stopVoiceService?.();
  } catch {
    // ignore outside Android WebView
  }
}

export function setupBluetoothVoiceMediaSession(opts: {
  roomName: string;
  username: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onDisconnect: () => void;
}): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {};
  }
  const ms = navigator.mediaSession;
  try {
    if (typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title: `${opts.roomName || 'Ses Odası'} (${opts.isMuted ? 'Mikrofon Kapalı' : 'Canlı Ses'})`,
        artist: opts.username || 'Çakma',
        album: 'Çakma Sesli İletişim',
      });
    }
    ms.playbackState = opts.isMuted ? 'paused' : 'playing';
  } catch {
    // ignore unsupported MediaMetadata environments
  }

  try {
    getAndroidBridge()?.updateMuteState?.(Boolean(opts.isMuted));
  } catch {
    // ignore
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
