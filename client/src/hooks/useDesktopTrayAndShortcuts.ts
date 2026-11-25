import { useEffect, useRef } from 'react';
import type { UserStatus } from '../types';

export function toTauriAccelerator(shortcut: string): string | null {
  const raw = String(shortcut || '').trim();
  if (!raw) return null;
  const parts = raw
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    // Require at least one modifier key so normal typing keys are never hijacked globally
    return null;
  }

  let hasModifier = false;
  const normalized = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmdorctrl' || lower === 'commandorcontrol') {
      hasModifier = true;
      return 'CommandOrControl';
    }
    if (lower === 'shift') {
      hasModifier = true;
      return 'Shift';
    }
    if (lower === 'alt' || lower === 'option') {
      hasModifier = true;
      return 'Alt';
    }
    if (lower === 'super' || lower === 'meta' || lower === 'win' || lower === 'cmd') {
      hasModifier = true;
      return 'Super';
    }
    if (lower.startsWith('key') && part.length === 4) {
      return part.slice(3).toUpperCase();
    }
    if (lower.startsWith('digit') && part.length === 6) {
      return part.slice(5);
    }
    if (part.length === 1) {
      return part.toUpperCase();
    }
    return part;
  });

  if (!hasModifier) return null;
  return normalized.join('+');
}

interface DesktopTrayAndShortcutsParams {
  isTauri: boolean;
  isAuthenticated: boolean;
  inVoice: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  status: UserStatus;
  voiceChannelName?: string;
  globalMuteShortcut: string;
  globalDeafenShortcut: string;
  soundboardShortcut: string;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onTriggerSoundboard: () => void;
}

/** Syncs Tauri tray tooltip/badge dot and dynamic global desktop shortcuts cleanly via refs. */
export function useDesktopTrayAndShortcuts(params: DesktopTrayAndShortcutsParams): void {
  const {
    isTauri,
    isAuthenticated,
    inVoice,
    isMuted,
    isDeafened,
    status,
    voiceChannelName,
    globalMuteShortcut,
    globalDeafenShortcut,
    soundboardShortcut,
    onToggleMute,
    onToggleDeafen,
    onTriggerSoundboard,
  } = params;

  const muteRef = useRef(onToggleMute);
  muteRef.current = onToggleMute;
  const deafenRef = useRef(onToggleDeafen);
  deafenRef.current = onToggleDeafen;
  const soundboardRef = useRef(onTriggerSoundboard);
  soundboardRef.current = onTriggerSoundboard;

  // Dynamic system tray tooltip & corner badge dot
  useEffect(() => {
    if (!isTauri) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke('update_tray_state', {
          inVoice,
          isMuted,
          isDeafened,
          status: status || 'online',
          channelName: voiceChannelName || null,
        })
      )
      .catch(() => {});
  }, [isTauri, inVoice, isMuted, isDeafened, status, voiceChannelName]);

  // Configurable global shortcuts (mute, deafen, soundboard, overlay lock)
  useEffect(() => {
    if (!isTauri || !isAuthenticated) return;
    let cancelled = false;

    const muteAcc = toTauriAccelerator(globalMuteShortcut) || 'CommandOrControl+Shift+M';
    const deafenAcc = toTauriAccelerator(globalDeafenShortcut) || 'CommandOrControl+Shift+D';
    const soundboardAcc = toTauriAccelerator(soundboardShortcut);

    (async () => {
      try {
        const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
        await unregisterAll().catch(() => {});
        if (cancelled) return;

        await register(muteAcc, (e) => {
          if (e.state === 'Pressed') muteRef.current();
        }).catch(() => {});

        if (deafenAcc !== muteAcc) {
          await register(deafenAcc, (e) => {
            if (e.state === 'Pressed') deafenRef.current();
          }).catch(() => {});
        }

        if (soundboardAcc && soundboardAcc !== muteAcc && soundboardAcc !== deafenAcc) {
          await register(soundboardAcc, (e) => {
            if (e.state === 'Pressed') soundboardRef.current();
          }).catch(() => {});
        }

        const overlayAcc = 'CommandOrControl+Shift+O';
        if (overlayAcc !== muteAcc && overlayAcc !== deafenAcc && overlayAcc !== soundboardAcc) {
          await register(overlayAcc, async (e) => {
            if (e.state === 'Pressed') {
              try {
                const nextLocked = localStorage.getItem('dc_overlay_locked') !== '1';
                localStorage.setItem('dc_overlay_locked', nextLocked ? '1' : '0');
                const { invoke } = await import('@tauri-apps/api/core');
                const { emit } = await import('@tauri-apps/api/event');
                await invoke('set_overlay_ignore_cursor', { ignore: nextLocked });
                await emit('overlay-lock-changed', nextLocked);
                await emit('overlay-interactive-changed', !nextLocked);
              } catch {}
            }
          }).catch(() => {});
        }

        const interactiveOverlayAcc = 'Alt+O';
        if (
          interactiveOverlayAcc !== muteAcc &&
          interactiveOverlayAcc !== deafenAcc &&
          interactiveOverlayAcc !== soundboardAcc
        ) {
          await register(interactiveOverlayAcc, async (e) => {
            if (e.state === 'Pressed') {
              try {
                const nextLocked = localStorage.getItem('dc_overlay_locked') !== '1';
                localStorage.setItem('dc_overlay_locked', nextLocked ? '1' : '0');
                const { invoke } = await import('@tauri-apps/api/core');
                const { emit } = await import('@tauri-apps/api/event');
                if (!nextLocked) {
                  await invoke('set_overlay_window', { enabled: true }).catch(() => {});
                }
                await invoke('set_overlay_ignore_cursor', { ignore: nextLocked });
                await emit('overlay-lock-changed', nextLocked);
                await emit('overlay-interactive-changed', !nextLocked);
              } catch {}
            }
          }).catch(() => {});
        }
      } catch {
        // ignore outside desktop capabilities
      }
    })();

    return () => {
      cancelled = true;
      import('@tauri-apps/plugin-global-shortcut')
        .then(({ unregisterAll }) => unregisterAll())
        .catch(() => {});
    };
  }, [isTauri, isAuthenticated, globalMuteShortcut, globalDeafenShortcut, soundboardShortcut]);
}
