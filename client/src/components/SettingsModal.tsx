import React, { useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useMicVolumeLevel } from '../context/VoiceMetricsContext';
import { playTeamSpeakChime, SoundPackType, playCallRingtone, RingtonePack } from '../utils/tsSoundEffects';
import { DEFAULT_CUSTOM_THEME } from '../utils/themeBuilder';
import { AvatarView, processUploadedImage } from './AvatarView';
import { LANGUAGE_OPTIONS, t } from '../utils/i18n';
import { authFetch, resolveBackendBaseUrl } from '../utils/authFetch';
import { appToast } from '../utils/appDialogs';
import { WebPushSettingsCard } from './settings/WebPushSettingsCard';
import { AccountSecuritySection } from './settings/AccountSecuritySection';
import { ActiveSessionsCard } from './settings/ActiveSessionsCard';
import { PasswordChangeCard } from './settings/PasswordChangeCard';
import { ChangelogTab } from './settings/ChangelogTab';
import {
  X,
  Mic,
  User,
  Keyboard,
  Check,
  Sliders,
  Sparkles,
  Headphones,
  RefreshCw,
  VolumeX,
  LogOut,
  Bell,
  Smartphone,
  Lock,
  ShieldAlert,
  Palette,
  Video,
  MessageSquare,
  Radio,
  Info,
  Cpu,
  Camera,
  Download,
  Trash2,
  Upload,
  Volume2,
  Globe,
  Copy,
} from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const AVATAR_OPTIONS = ['🎮', '🚀', '🔥', '🎧', '⚡', '💻', '🐱', '🐺', '🦊', '👾', '🕹️', '🛡️'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const {
    socket,
    currentUser,
    updateProfile,
    inputMode,
    setInputMode,
    pttKey,
    setPttKey,
    isSpeaking,
    audioInputDevices,
    audioOutputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    noiseSuppression,
    setNoiseSuppression,
    echoCancellation,
    setEchoCancellation,
    autoGainControl,
    setAutoGainControl,
    studioAudioDsp,
    setStudioAudioDsp,
    aiNoiseSuppression,
    setAiNoiseSuppression,
    lowLatencyAudio,
    setLowLatencyAudio,
    inputSensitivity,
    setInputSensitivity,
    inputVolume,
    setInputVolume,
    outputVolume,
    setOutputVolume,
    isMicTesting,
    toggleMicTest,
    refreshAudioDevices,
    logout,
    isAuthenticated,
    tsSoundEffectsEnabled,
    setTsSoundEffectsEnabled,
    soundPack,
    setSoundPack,
    pttBeepEnabled,
    setPttBeepEnabled,
    desktopNotificationsEnabled,
    setDesktopNotificationsEnabled,
    unblockUser,
    uiTheme,
    setUiTheme,
    customTheme,
    setCustomTheme,
    chatFontSize,
    setChatFontSize,
    glassIntensity,
    setGlassIntensity,
    messageDensity,
    setMessageDensity,
    chatLayout,
    setChatLayout,
    cornerStyle,
    setCornerStyle,
    bgPattern,
    setBgPattern,
    reduceMotion,
    setReduceMotion,
    currentServerHost,
    overlayEnabled,
    setOverlayEnabled,
    overlayCorner,
    setOverlayCorner,
    overlayOpacity,
    setOverlayOpacity,
    ringtonePack,
    setRingtonePack,
    showLinkPreviews,
    setShowLinkPreviews,
    customSoundboard,
    addCustomSound,
    removeCustomSound,
    userNotes,
    setUserNote,
    reminders,
    removeReminder,
    detectedGame,
    refreshDetectedGame,
    language,
    setLanguage,
    updateProfileDetails,
  } = useSocket();
  const micVolumeLevel = useMicVolumeLevel();

  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '🎮');
  const [profileStatus, setProfileStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(currentUser?.status || 'online');
  const [profileStatusMessage, setProfileStatusMessage] = useState(currentUser?.statusMessage || 'Çevrimiçi');
  const [profileBio, setProfileBio] = useState(currentUser?.bio || '');
  const [profileBannerColor, setProfileBannerColor] = useState(
    currentUser?.bannerColor || 'from-indigo-600 via-purple-600 to-pink-600'
  );
  const [profileBannerImage, setProfileBannerImage] = useState(currentUser?.bannerImage || '');
  const [bannerUrlInput, setBannerUrlInput] = useState('');
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  const [idCopied, setIdCopied] = useState(false);
  const [profileUploadErr, setProfileUploadErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    | 'audio'
    | 'voice_processing'
    | 'video'
    | 'keybindings'
    | 'chats'
    | 'notifications'
    | 'profile'
    | 'security'
    | 'appearance'
    | 'overlay'
    | 'about'
  >('audio');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [defaultStreamHdr, setDefaultStreamHdr] = useState<boolean>(() => {
    try { return localStorage.getItem('cakma_default_stream_hdr') === 'true'; } catch { return false; }
  });
  const [defaultViewerQuality, setDefaultViewerQuality] = useState<string>(() => {
    try { return localStorage.getItem('cakma_default_viewer_quality') || 'auto'; } catch { return 'auto'; }
  });
  const [defaultStreamVolume, setDefaultStreamVolume] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('cakma_default_stream_volume'));
      return Number.isFinite(raw) ? raw : 80;
    } catch { return 80; }
  });
  const [duckingEnabled, setDuckingEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('cakma_ducking_enabled');
      return raw !== null ? raw === 'true' : true;
    } catch { return true; }
  });
  const [duckingLevel, setDuckingLevel] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('cakma_ducking_level'));
      return Number.isFinite(raw) && raw >= 10 && raw <= 70 ? raw : 30;
    } catch { return 30; }
  });

  const [advSettings, setAdvSettings] = useState(() => {
    const defaults = {
      useOpenH264: true,
      hardwareAcceleration: true,
      preferredCodec: 'auto' as 'auto' | 'AV1' | 'H264' | 'VP9' | 'VP8',
      av1Backend: 'Hardware (Auto)',
      h264Backend: 'Hardware (Auto)',
      vp9Backend: 'Internal (Software)',
      vp8Backend: 'Internal (Software)',
      cameraResolution: '720p' as '480p' | '720p' | '1080p',
      cameraFps: 30 as 15 | 30 | 60,
      muteShortcut: 'KeyM',
      deafenShortcut: 'KeyD',
      screenShareShortcut: 'KeyS',
      enterToSend: true,
      showLinkPreviews: true,
      autoPlayGifs: true,
      whisperMode: 'everyone' as 'everyone' | 'friends' | 'disabled',
      whisperVolume: 100,
      soundOnJoinLeave: true,
      soundOnMention: true,
      soundOnWhisper: true,
      soundOnStreamStart: true,
    };
    try {
      const saved = localStorage.getItem('cakma_advanced_settings');
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return defaults;
  });

  const updateAdv = (patch: Partial<typeof advSettings>) => {
    setAdvSettings((prev: typeof advSettings) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem('cakma_advanced_settings', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [recordingShortcutFor, setRecordingShortcutFor] = useState<
    null | 'muteShortcut' | 'deafenShortcut' | 'screenShareShortcut'
  >(null);
  const [isCameraTesting, setIsCameraTesting] = useState(false);
  const cameraVideoRef = React.useRef<HTMLVideoElement>(null);
  const cameraStreamRef = React.useRef<MediaStream | null>(null);
  const [appVersion, setAppVersion] = useState<string>('0.8.2');
  const [updateProgress, setUpdateProgress] = useState<{
    percent: number;
    downloadedMb: string;
    totalMb: string;
  } | null>(null);
  const [pushRegStatus, setPushRegStatus] = useState<string | null>(null);
  const [overlayConfig, setOverlayConfig] = useState<{
    onlySpeaking: boolean;
    showControls: boolean;
    showPing: boolean;
    size: 'compact' | 'standard' | 'wide';
  }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dc_overlay_config') || 'null');
      return {
        onlySpeaking: Boolean(saved?.onlySpeaking),
        showControls: saved?.showControls !== false,
        showPing: saved?.showPing !== false,
        size: saved?.size === 'compact' || saved?.size === 'wide' ? saved.size : 'standard',
      };
    } catch {
      return { onlySpeaking: false, showControls: true, showPing: true, size: 'standard' };
    }
  });
  const [overlayLocked, setOverlayLocked] = useState<boolean>(() => {
    try { return localStorage.getItem('dc_overlay_locked') === '1'; } catch { return false; }
  });

  const updateOverlayConfig = async (patch: Partial<typeof overlayConfig>) => {
    const next = { ...overlayConfig, ...patch };
    setOverlayConfig(next);
    try { localStorage.setItem('dc_overlay_config', JSON.stringify(next)); } catch {}
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauriEnv) {
      try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('overlay-config-changed', next);
      } catch {}
    }
  };

  const toggleOverlayLockSetting = async () => {
    const next = !overlayLocked;
    setOverlayLocked(next);
    try { localStorage.setItem('dc_overlay_locked', next ? '1' : '0'); } catch {}
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauriEnv) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { emit } = await import('@tauri-apps/api/event');
        await invoke('set_overlay_ignore_cursor', { ignore: next });
        await emit('overlay-lock-changed', next);
      } catch {}
    }
  };
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
  const [closeToTrayEnabled, setCloseToTrayEnabled] = useState<boolean>(true);

  React.useEffect(() => {
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauriEnv) return;
    import('@tauri-apps/api/core')
      .then(async ({ invoke }) => {
        const [autoRes, trayRes] = await Promise.all([
          invoke<boolean>('get_autostart').catch(() => false),
          invoke<boolean>('get_close_to_tray').catch(() => true),
        ]);
        setAutostartEnabled(Boolean(autoRes));
        setCloseToTrayEnabled(Boolean(trayRes));
      })
      .catch(() => {});
  }, []);

  const handleToggleAutostart = async () => {
    const next = !autostartEnabled;
    setAutostartEnabled(next);
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauriEnv) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_autostart', { enabled: next });
    } catch {
      setAutostartEnabled(!next);
    }
  };

  const handleToggleCloseToTray = async () => {
    const next = !closeToTrayEnabled;
    setCloseToTrayEnabled(next);
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauriEnv) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_close_to_tray', { enabled: next });
    } catch {
      setCloseToTrayEnabled(!next);
    }
  };

  const handleOverlayCornerChange = async (corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    setOverlayCorner(corner);
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauriEnv) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('position_overlay_window', { corner });
    } catch {}
  };
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // 2FA State
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [twoFaQrDataUrl, setTwoFaQrDataUrl] = useState<string | null>(null);
  const [twoFaCodeInput, setTwoFaCodeInput] = useState('');
  const [twoFaDisablePassword, setTwoFaDisablePassword] = useState('');
  const [twoFaDisableCode, setTwoFaDisableCode] = useState('');
  const [twoFaBackupCodes, setTwoFaBackupCodes] = useState<string[] | null>(null);
  const [twoFaStatusMsg, setTwoFaStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const handleInit2fa = () => {
    if (!socket) return;
    setTwoFaStatusMsg(null);
    setTwoFaBackupCodes(null);
    setTwoFaLoading(true);
    socket.emit('2fa_setup_init');
    socket.once('2fa_setup_data', async ({ secret, otpauthUri }: { secret: string; otpauthUri: string }) => {
      setTwoFaSetup({ secret, otpauthUri });
      try {
        const QRCode = await import('qrcode');
        const url = await QRCode.toDataURL(otpauthUri, { width: 180, margin: 1 });
        setTwoFaQrDataUrl(url);
      } catch {
        setTwoFaQrDataUrl(null);
      }
      setTwoFaLoading(false);
    });
  };

  const handleVerifyEnable2fa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !twoFaCodeInput.trim()) return;
    setTwoFaStatusMsg(null);
    setTwoFaLoading(true);
    socket.emit('2fa_setup_verify', { code: twoFaCodeInput.trim() });
    socket.once(
      '2fa_status_response',
      (res: { success: boolean; enabled?: boolean; backupCodes?: string[]; message?: string; error?: string }) => {
        setTwoFaLoading(false);
        if (res.success && res.enabled) {
          setTwoFaSetup(null);
          setTwoFaQrDataUrl(null);
          setTwoFaCodeInput('');
          setTwoFaBackupCodes(res.backupCodes || null);
          setTwoFaStatusMsg({ type: 'success', text: res.message || '2FA etkinleştirildi!' });
        } else {
          setTwoFaStatusMsg({ type: 'error', text: res.error || '2FA doğrulanamadı.' });
        }
      }
    );
  };

  const handleDisable2fa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;
    setTwoFaStatusMsg(null);
    setTwoFaLoading(true);
    socket.emit('2fa_disable', { password: twoFaDisablePassword, code: twoFaDisableCode.trim() });
    socket.once('2fa_status_response', (res: { success: boolean; message?: string; error?: string }) => {
      setTwoFaLoading(false);
      if (res.success) {
        setTwoFaDisablePassword('');
        setTwoFaDisableCode('');
        setTwoFaBackupCodes(null);
        setTwoFaStatusMsg({ type: 'success', text: res.message || '2FA devre dışı bırakıldı.' });
      } else {
        setTwoFaStatusMsg({ type: 'error', text: res.error || '2FA kapatılamadı.' });
      }
    });
  };

  React.useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.protocol === 'tauri:');
    if (!isTauri) return;
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((v) => setAppVersion(v))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleCameraTest = async () => {
    if (isCameraTesting) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      setIsCameraTesting(false);
      return;
    }
    try {
      const dims =
        advSettings.cameraResolution === '1080p'
          ? { width: 1920, height: 1080 }
          : advSettings.cameraResolution === '720p'
            ? { width: 1280, height: 720 }
            : { width: 854, height: 480 };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...dims, frameRate: { ideal: advSettings.cameraFps } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraTesting(true);
      setTimeout(() => {
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
      }, 50);
    } catch {
      appToast('Kamera erişimi reddedildi veya kamera bulunamadı.', 'error');
    }
  };

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMsg(null);
    setUpdateProgress(null);
    try {
      const isTauri =
        typeof window !== 'undefined' &&
        ('__TAURI_INTERNALS__' in window ||
          window.location.hostname === 'tauri.localhost' ||
          window.location.protocol === 'tauri:');
      if (!isTauri) {
        setUpdateStatusMsg('Web sürümünde her zaman en güncel sürümü kullanıyorsunuz.');
        return;
      }
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setUpdateStatusMsg(`Yeni sürüm bulundu: v${update.version}. İndiriliyor...`);
        let totalBytes = 0;
        let downloadedBytes = 0;
        await update.downloadAndInstall((event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => {
          if (event.event === 'Started') {
            totalBytes = Number(event.data?.contentLength || 0);
            setUpdateProgress({
              percent: 0,
              downloadedMb: '0.0',
              totalMb: totalBytes > 0 ? (totalBytes / 1048576).toFixed(1) : '?',
            });
          } else if (event.event === 'Progress') {
            downloadedBytes += Number(event.data?.chunkLength || 0);
            const pct = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 50;
            setUpdateProgress({
              percent: pct,
              downloadedMb: (downloadedBytes / 1048576).toFixed(1),
              totalMb: totalBytes > 0 ? (totalBytes / 1048576).toFixed(1) : '?',
            });
          } else if (event.event === 'Finished') {
            setUpdateProgress((prev) => ({
              percent: 100,
              downloadedMb: prev?.totalMb && prev.totalMb !== '?' ? prev.totalMb : prev?.downloadedMb || '0',
              totalMb: prev?.totalMb || '0',
            }));
          }
        });
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } else {
        setUpdateStatusMsg(`Uygulama güncel (v${appVersion}).`);
      }
    } catch {
      setUpdateStatusMsg('Güncelleme sunucusuna şu anda ulaşılamadı.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleRegisterWebPush = async () => {
    setPushRegStatus(null);
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setPushRegStatus('Bu tarayıcı/ortam Service Worker (PWA Push) desteklemiyor.');
      return;
    }
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
        if (perm !== 'granted') {
          setPushRegStatus('Bildirim izni verilmediği için Web Push etkinleştirilemedi.');
          return;
        }
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await reg.update().catch(() => {});
      setPushRegStatus(`PWA Service Worker aktif (${reg.scope}). Arka plan bildirimleri hazır.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setPushRegStatus(`Service Worker kaydı başarısız: ${msg || 'Bilinmeyen hata'}`);
    }
  };
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);
  const [recordingKey, setRecordingKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    const trimmedUrl = avatarUrlInput.trim();
    const finalAvatar =
      trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')
        ? trimmedUrl
        : avatar;
    const trimmedBannerUrl = bannerUrlInput.trim();
    const finalBannerImage =
      trimmedBannerUrl.startsWith('http://') || trimmedBannerUrl.startsWith('https://')
        ? trimmedBannerUrl
        : profileBannerImage;
    updateProfile(username.trim(), finalAvatar);
    updateProfileDetails({
      avatar: finalAvatar,
      status: profileStatus,
      statusMessage: profileStatusMessage.trim(),
      bio: profileBio.trim(),
      bannerColor: profileBannerColor,
      bannerImage: finalBannerImage,
    });
    setAvatar(finalAvatar);
    setProfileBannerImage(finalBannerImage);
    setBannerUrlInput('');
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-0 sm:p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(language, 'settings')}
        className="w-full max-w-5xl ios-glass rounded-none sm:rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border-0 sm:border border-white/10 h-[100dvh] sm:h-[660px] sm:max-h-[90vh]"
      >
        {/* Left Settings Sidebar - TeamSpeak-style Categorized Panel */}
        <div className="w-full md:w-60 max-h-44 md:max-h-none bg-white/[0.02] p-3 md:p-4 flex flex-col justify-between shrink-0 border-b md:border-b-0 md:border-r border-white/[0.06] overflow-y-auto">
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-white/40 uppercase px-2 tracking-wider">
              {t(language, 'settings')}
            </div>

            <div className="px-1">
              <input
                type="text"
                value={settingsSearch}
                onChange={(e) => setSettingsSearch(e.target.value)}
                placeholder="Ayar ara (HDR, DSP, Overlay...)"
                className="w-full px-2.5 py-1.5 rounded-xl bg-black/35 border border-white/10 text-xs text-white placeholder-white/35 outline-none focus:border-blue-400"
              />
              {settingsSearch.trim() && (
                <div className="mt-1.5 max-h-40 overflow-y-auto rounded-xl bg-black/60 border border-white/10 p-1 space-y-0.5">
                  {[
                    { label: 'Profil & Durum', tab: 'profile' as const, kw: 'profil avatar durum bio rozet' },
                    { label: '2FA & Aktif Oturumlar', tab: 'security' as const, kw: '2fa güvenlik şifre oturum gizlilik' },
                    { label: 'Tema, Dil & Cam Efekti', tab: 'appearance' as const, kw: 'tema görünüm dil cam font' },
                    { label: 'Oyun İçi Overlay & Saydamlık', tab: 'overlay' as const, kw: 'overlay oyun saydamlık ping kilit köşe boyut' },
                    { label: 'Mikrofon & Hoparlör', tab: 'audio' as const, kw: 'ses mikrofon hoparlör cihaz test ses düzeyi' },
                    { label: 'Stüdyo DSP, Ducking & Tampon', tab: 'voice_processing' as const, kw: 'dsp gürültü yankı agc ducking tampon 20ms hassasiyet' },
                    { label: 'HDR Yayın, Kalite & Codec', tab: 'video' as const, kw: 'video hdr av1 vp9 h264 codec kalite gpu' },
                    { label: 'Kısayol Tuşları', tab: 'keybindings' as const, kw: 'kısayol ptt tuş bas konuş' },
                    { label: 'Sohbet & Fısıltı', tab: 'chats' as const, kw: 'sohbet fısıltı link gif' },
                    { label: 'Bildirimler & Ses Paketi', tab: 'notifications' as const, kw: 'bildirim zil ses paketi' },
                    { label: 'Hakkında & Güncelleme', tab: 'about' as const, kw: 'hakkında sürüm güncelleme' },
                  ]
                    .filter((item) => {
                      const q = settingsSearch.trim().toLowerCase();
                      return item.label.toLowerCase().includes(q) || item.kw.includes(q);
                    })
                    .map((item) => (
                      <button
                        key={item.tab}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.tab);
                          setSettingsSearch('');
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-500/25 text-[11px] text-white/85 hover:text-white transition"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* USER SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase px-2 pb-1 tracking-wider">
                {t(language, 'userGroup')}
              </div>
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'profile'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <User className="w-4 h-4" />
                {t(language, 'tabProfile')}
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'security'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Lock className={`w-4 h-4 ${activeTab === 'security' ? 'text-white' : 'text-amber-400'}`} />
                {t(language, 'tabSecurity')}
              </button>
            </div>

            {/* APPLICATION SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase px-2 pb-1 tracking-wider">
                {t(language, 'appGroup')}
              </div>
              <button
                onClick={() => setActiveTab('appearance')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'appearance'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Palette className={`w-4 h-4 ${activeTab === 'appearance' ? 'text-white' : 'text-purple-400'}`} />
                {t(language, 'tabAppearance')}
              </button>
              <button
                onClick={() => setActiveTab('overlay')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'overlay'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Radio className={`w-4 h-4 ${activeTab === 'overlay' ? 'text-white' : 'text-emerald-400'}`} />
                <span>{t(language, 'tabOverlay')}</span>
              </button>
              <button
                onClick={() => setActiveTab('audio')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'audio'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
                {t(language, 'tabAudio')}
              </button>
              <button
                onClick={() => setActiveTab('voice_processing')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'voice_processing'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Sparkles className={`w-4 h-4 ${activeTab === 'voice_processing' ? 'text-white' : 'text-emerald-400'}`} />
                {t(language, 'tabVoiceProcessing')}
              </button>
              <button
                onClick={() => setActiveTab('video')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'video'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Video className={`w-4 h-4 ${activeTab === 'video' ? 'text-white' : 'text-sky-400'}`} />
                {t(language, 'tabVideo')}
              </button>
              <button
                onClick={() => setActiveTab('keybindings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'keybindings'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Keyboard className={`w-4 h-4 ${activeTab === 'keybindings' ? 'text-white' : 'text-indigo-400'}`} />
                {t(language, 'tabKeybindings')}
              </button>
              <button
                onClick={() => setActiveTab('chats')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'chats'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <MessageSquare className={`w-4 h-4 ${activeTab === 'chats' ? 'text-white' : 'text-teal-400'}`} />
                {t(language, 'tabChats')}
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'notifications'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Bell className={`w-4 h-4 ${activeTab === 'notifications' ? 'text-white' : 'text-pink-400'}`} />
                {t(language, 'tabNotifications')}
              </button>
            </div>

            {/* INFORMATION SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase px-2 pb-1 tracking-wider">
                {t(language, 'infoGroup')}
              </div>
              <button
                onClick={() => setActiveTab('about')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'about'
                    ? 'ui-accent-bg shadow-md'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Info className={`w-4 h-4 ${activeTab === 'about' ? 'text-white' : 'text-slate-300'}`} />
                {t(language, 'tabAbout')}
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 transition shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Hesaptan Çıkış Yap</span>
              </button>
            )}

            <div className="text-[11px] text-white/30 px-2 space-y-1">
              <div className="font-semibold text-white/50">Studio Pro Audio</div>
              <div>WebRTC Opus 48kHz HD</div>
            </div>
          </div>
        </div>

        {/* Right Settings Content */}
        <div className="flex-1 p-4 sm:p-8 flex flex-col justify-between overflow-y-auto relative min-w-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-6 sm:right-6 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition shadow z-10"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>

          {/* TAB 1: Ses Aygıtları & Giriş */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Ses Aygıtları & Giriş</h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Mikrofon, kulaklık ve giriş hassasiyetini özelleştirin.
                  </p>
                </div>
                <button
                  onClick={refreshAudioDevices}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition flex items-center gap-1.5 text-xs"
                  title="Aygıtları Yenile"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Yenile</span>
                </button>
              </div>

              {/* Hardware Device Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Input Device (Microphone) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50 uppercase flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    Giriş Aygıtı (Mikrofon)
                  </label>
                  <select
                    value={selectedInputDeviceId}
                    onChange={(e) => setSelectedInputDeviceId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-2xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {audioInputDevices.map((device, idx) => (
                      <option key={device.deviceId || idx} value={device.deviceId} className="bg-[#1a1b22] text-white">
                        {device.label || `Mikrofon ${idx + 1}`}
                      </option>
                    ))}
                    {audioInputDevices.length === 0 && (
                      <option value="" className="bg-[#1a1b22] text-white">Varsayılan Sistem Mikrofonu</option>
                    )}
                  </select>

                  {/* Input Volume Slider */}
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between text-[11px] text-white/60">
                      <span>Mikrofon Düzeyi</span>
                      <span>{inputVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="150"
                      value={inputVolume}
                      onChange={(e) => setInputVolume(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Output Device (Headphones / Speakers) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50 uppercase flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-blue-400" />
                    Çıkış Aygıtı (Kulaklık / Hoparlör)
                  </label>
                  <select
                    value={selectedOutputDeviceId}
                    onChange={(e) => setSelectedOutputDeviceId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-2xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {audioOutputDevices.map((device, idx) => (
                      <option key={device.deviceId || idx} value={device.deviceId} className="bg-[#1a1b22] text-white">
                        {device.label || `Hoparlör ${idx + 1}`}
                      </option>
                    ))}
                    {audioOutputDevices.length === 0 && (
                      <option value="" className="bg-[#1a1b22] text-white">Varsayılan Sistem Çıkışı</option>
                    )}
                  </select>

                  {/* Output Volume Slider */}
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between text-[11px] text-white/60">
                      <span>Çıkış Ses Düzeyi</span>
                      <span>{outputVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="150"
                      value={outputVolume}
                      onChange={(e) => setOutputVolume(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Input Mode: VAD vs PTT */}
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                  İletim Modu
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInputMode('vad')}
                    className={`p-3.5 rounded-2xl border text-left transition ${
                      inputMode === 'vad'
                        ? 'border-blue-400 bg-blue-500/15 text-white shadow-sm'
                        : 'border-white/10 text-white/60 hover:border-white/20'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center gap-2 mb-1">
                      <Mic className="w-4 h-4 text-emerald-400" />
                      Ses Algılama (VAD)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Konuştuğunda sesin otomatik iletilir.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInputMode('ptt')}
                    className={`p-3.5 rounded-2xl border text-left transition ${
                      inputMode === 'ptt'
                        ? 'border-blue-400 bg-blue-500/15 text-white shadow-sm'
                        : 'border-white/10 text-white/60 hover:border-white/20'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center gap-2 mb-1">
                      <Keyboard className="w-4 h-4 text-blue-400" />
                      Bas-Konuş (PTT)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Belirlediğin tuşa basılı tutarak konuş.
                    </div>
                  </button>
                </div>
              </div>

              {/* PTT Key Assignment */}
              {inputMode === 'ptt' && (
                <div className="bg-white/[0.04] p-3.5 rounded-2xl flex items-center justify-between border border-white/10">
                  <div>
                    <div className="text-xs font-semibold text-white">Bas-Konuş Tuşu</div>
                    <div className="text-[11px] text-white/40">Tuşu değiştirmek için butona tıklayıp basılı tutun.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingKey(true);
                      const handleOnce = (e: KeyboardEvent) => {
                        e.preventDefault();
                        setPttKey(e.key);
                        setRecordingKey(false);
                        window.removeEventListener('keydown', handleOnce);
                      };
                      window.addEventListener('keydown', handleOnce);
                    }}
                    className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-xl border border-white/15 transition shadow-sm"
                  >
                    {recordingKey ? 'Bir tuşa basın...' : `Tuş: [${pttKey}]`}
                  </button>
                </div>
              )}

              {/* Live Mic Test with Loopback */}
              <div className="bg-white/[0.04] p-4 rounded-2xl space-y-3 border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-white">Mikrofon Testi & Sesimi Dinle</div>
                    <div className="text-[11px] text-white/40">Mikrofonunuzun nasıl duyulduğunu kendi kulaklığınızda test edin.</div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleMicTest}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition shadow-md ${
                      isMicTesting
                        ? 'bg-red-500 text-white shadow-red-500/30'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
                    }`}
                  >
                    {isMicTesting ? 'Testi Durdur' : 'Sesimi Dinle'}
                  </button>
                </div>

                {/* Level Meter */}
                <div className="space-y-1">
                  <div className="h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        isSpeaking ? 'bg-emerald-400' : 'bg-blue-400'
                      }`}
                      style={{ width: `${micVolumeLevel}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>Sessiz</span>
                    <span className={isSpeaking ? 'text-emerald-400 font-bold' : ''}>
                      {isSpeaking ? 'SES ALGILANDI (İletiliyor)' : 'Eşik Altı (Sessiz)'}
                    </span>
                    <span>%100</span>
                  </div>
                </div>
              </div>

              {/* Custom Soundboard Sounds */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Özel Soundboard Sesleri</div>
                    <div className="text-xs text-white/40">
                      Ses odalarında çalmak için kendi kısa ses efektlerinizi yükleyin (Maks. 500 KB)
                    </div>
                  </div>
                  <label className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shrink-0 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Ses Ekle</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 500 * 1024) {
                          appToast('Özel ses dosyası 500 KB boyutunu geçmemelidir.', 'warning');
                          e.target.value = '';
                          return;
                        }
                        const soundName = file.name.replace(/\.[^/.]+$/, '').slice(0, 24) || 'Özel Ses';
                        const reader = new FileReader();
                        reader.onload = async () => {
                          if (typeof reader.result === 'string') {
                            try {
                              const res = await authFetch(currentServerHost, '/api/sounds/upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: soundName, dataUrl: reader.result }),
                              });
                              const data = await res.json();
                              if (data?.ok && data?.url) {
                                addCustomSound(soundName, `${resolveBackendBaseUrl(currentServerHost)}${data.url}`);
                                return;
                              }
                            } catch {}
                            addCustomSound(soundName, reader.result);
                          }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {customSoundboard.length === 0 ? (
                  <div className="text-xs text-white/40 py-2">Henüz özel ses yüklenmedi.</div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {customSoundboard.map((cs) => (
                      <div
                        key={cs.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 border border-white/10"
                      >
                        <span className="text-xs font-medium text-white truncate">🎵 {cs.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const audio = new Audio(cs.dataUrl);
                              audio.volume = 0.8;
                              audio.play().catch(() => {});
                            }}
                            className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 transition"
                            title="Dinle"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCustomSound(cs.id)}
                            className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Gelişmiş Gürültü Engelleme & Filtreler */}
          {activeTab === 'voice_processing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Gürültü & Ses İşleme (DSP)</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Arka plan gürültülerini filtreleyin ve ses kalitesini stüdyo seviyesine çıkarın.
                </p>
              </div>

              {/* Ready Audio & Codec Profiles */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
                <div className="text-xs font-semibold text-white">Hazır Ses & Kodek Profilleri</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNoiseSuppression(true);
                      setEchoCancellation(true);
                      setAutoGainControl(true);
                    }}
                    className="p-2.5 rounded-xl bg-black/30 hover:bg-blue-500/20 border border-white/10 hover:border-blue-400/40 text-left transition"
                  >
                    <div className="text-xs font-bold text-white">🎮 Oyun Modu</div>
                    <div className="text-[10px] text-white/50 mt-0.5">Net ses, klavye filtresi açık</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNoiseSuppression(true);
                      setEchoCancellation(true);
                      setAutoGainControl(true);
                    }}
                    className="p-2.5 rounded-xl bg-black/30 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/40 text-left transition"
                  >
                    <div className="text-xs font-bold text-white">🎙️ Toplantı / Sohbet</div>
                    <div className="text-[10px] text-white/50 mt-0.5">Dengeli yankı & AGC kontrolü</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNoiseSuppression(false);
                      setEchoCancellation(false);
                      setAutoGainControl(false);
                    }}
                    className="p-2.5 rounded-xl bg-black/30 hover:bg-purple-500/20 border border-white/10 hover:border-purple-400/40 text-left transition"
                  >
                    <div className="text-xs font-bold text-white">🎵 Müzik / Stüdyo</div>
                    <div className="text-[10px] text-white/50 mt-0.5">Ham ses (DSP filtreleri kapalı)</div>
                  </button>
                </div>
              </div>

              {/* Toggles List */}
              <div className="space-y-3">
                {/* Noise Suppression */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Yapay Zeka Gürültü Engelleme (Noise Suppression)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Klavye tıklamalarını, bilgisayar fanını ve arka plan uğultularını tamamen siler.
                    </div>
                  </div>
                  <div
                    onClick={() => setNoiseSuppression(!noiseSuppression)}
                    className={`ios-toggle ${noiseSuppression ? 'bg-emerald-500' : 'bg-white/20'}`}
                  >
                    <div
                      className="ios-toggle-dot"
                      style={{ transform: noiseSuppression ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </div>
                </div>

                {/* Echo Cancellation */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <VolumeX className="w-3.5 h-3.5 text-blue-400" />
                      Yankı Engelleme (Echo Cancellation)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Hoparlörden çıkan seslerin mikrofonunuza geri dönmesini ve yankı yapmasını önler.
                    </div>
                  </div>
                  <div
                    onClick={() => setEchoCancellation(!echoCancellation)}
                    className={`ios-toggle ${echoCancellation ? 'bg-blue-500' : 'bg-white/20'}`}
                  >
                    <div
                      className="ios-toggle-dot"
                      style={{ transform: echoCancellation ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </div>
                </div>

                {/* Auto Gain Control */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      Otomatik Kazanç Denetimi (Auto Gain Control)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Kısık veya yüksek sesle konuştuğunuzda ses düzeyinizi otomatik olarak dengeler.
                    </div>
                  </div>
                  <div
                    onClick={() => setAutoGainControl(!autoGainControl)}
                    className={`ios-toggle ${autoGainControl ? 'bg-indigo-500' : 'bg-white/20'}`}
                  >
                    <div
                      className="ios-toggle-dot"
                      style={{ transform: autoGainControl ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </div>
                </div>

                {/* Studio Audio DSP Chain */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Stüdyo DSP Zinciri (80Hz Uğultu Filtresi &amp; Compressor)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Masa/fan uğultusunu keser, ani bağırmalarda patlamayı önler ve gerçek giriş kazancını uygular.
                    </div>
                  </div>
                  <div
                    onClick={() => setStudioAudioDsp(!studioAudioDsp)}
                    className={`ios-toggle ${studioAudioDsp ? 'bg-amber-500' : 'bg-white/20'}`}
                  >
                    <div
                      className="ios-toggle-dot"
                      style={{ transform: studioAudioDsp ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </div>
                </div>

                {/* Real-Time Spectral AI Noise Suppression (AudioWorklet) */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Yapay Zekâ / Spektral Gürültü Engelleme (AudioWorklet 48kHz)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Klavye tıklaması, kasa fanı ve sabit oda gürültüsünü ana iş parçacığını yormadan temizler (Stüdyo DSP açıkken aktiftir).
                    </div>
                  </div>
                  <div
                    onClick={() => setAiNoiseSuppression(!aiNoiseSuppression)}
                    className={`ios-toggle ${aiNoiseSuppression ? 'bg-emerald-500' : 'bg-white/20'}`}
                  >
                    <div
                      className="ios-toggle-dot"
                      style={{ transform: aiNoiseSuppression ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </div>
                </div>

                {/* Low Latency Playout Delay */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-cyan-400" />
                      Düşük Gecikmeli Ses Tamponu (20 ms)
                    </div>
                    <div className="text-[11px] text-white/40">
                      Gelen ses tamponunu 20 ms seviyesine indirir; ağ dalgalıysa kapatarak kararlılık artırılabilir.
                    </div>
                  </div>
                  <div
                    onClick={() => setLowLatencyAudio(!lowLatencyAudio)}
                    className={`ios-toggle ${lowLatencyAudio ? 'bg-cyan-500' : 'bg-white/20'}`}
                  >
                    <div
                      className="ios-toggle-dot"
                      style={{ transform: lowLatencyAudio ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </div>
                </div>

                {/* Audio Ducking Default & Level */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-white">
                        Audio Ducking (Konuşma Anında Radyo/Müzik Kısma)
                      </div>
                      <div className="text-[11px] text-white/40">
                        Ses odasında biri konuşurken Radyo Botu / YouTube sesini otomatik düşürür.
                      </div>
                    </div>
                    <div
                      onClick={() => {
                        const next = !duckingEnabled;
                        setDuckingEnabled(next);
                        try { localStorage.setItem('cakma_ducking_enabled', String(next)); } catch {}
                      }}
                      className={`ios-toggle ${duckingEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                    >
                      <div
                        className="ios-toggle-dot"
                        style={{ transform: duckingEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </div>
                  </div>
                  {duckingEnabled && (
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="flex justify-between text-[11px] text-white/70">
                        <span>Kısma Seviyesi</span>
                        <span className="font-mono font-semibold text-emerald-300">%{duckingLevel}</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={70}
                        step={5}
                        value={duckingLevel}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDuckingLevel(v);
                          try { localStorage.setItem('cakma_ducking_level', String(v)); } catch {}
                        }}
                        className="w-full accent-emerald-400 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Voice Sensitivity Slider */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white">Giriş Hassasiyeti (Eşik Değeri)</span>
                  <span className="text-white/60">{inputSensitivity}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="80"
                  value={inputSensitivity}
                  onChange={(e) => setInputSensitivity(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Çok Hassas (Fısıltı)</span>
                  <span>Dengeli</span>
                  <span>Gürültülü Ortam (Sert)</span>
                </div>
              </div>

              {/* TeamSpeak Sound Events */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>📢 TeamSpeak Sesli Uyarıları (Sound Events)</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">Klasik TS</span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    Odaya biri girdiğinde/çıktığında ve mikrofon susturulduğunda sesli uyarı çal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTsSoundEffectsEnabled(!tsSoundEffectsEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    tsSoundEffectsEnabled ? 'bg-amber-500' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      tsSoundEffectsEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Desktop Push Notifications */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>🔔 Masaüstü Bildirimleri (Push Notifications)</span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    Birisi sizden bahsettiğinde (@etiket) veya özel mesaj attığında masaüstünde bildirim göster.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDesktopNotificationsEnabled(!desktopNotificationsEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    desktopNotificationsEnabled ? 'bg-blue-500' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      desktopNotificationsEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Hesap & Profil */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">{t(language, 'profileTitle')}</h3>
                <p className="text-xs text-white/50 mt-0.5">{t(language, 'profileDesc')}</p>
              </div>

              {/* Live Profile Banner & Card Preview */}
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] shadow-lg">
                <div className={`h-24 bg-gradient-to-r ${profileBannerColor} relative overflow-hidden`}>
                  {(bannerUrlInput.trim().startsWith('http://') ||
                    bannerUrlInput.trim().startsWith('https://') ||
                    profileBannerImage) && (
                    <img
                      src={
                        bannerUrlInput.trim().startsWith('http://') ||
                        bannerUrlInput.trim().startsWith('https://')
                          ? bannerUrlInput.trim()
                          : profileBannerImage
                      }
                      alt="Profil Banner"
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />
                  {currentUser?.role && (
                    <span className="relative z-10 float-right m-3 px-2.5 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-[10px] font-bold text-amber-300 border border-white/15 uppercase">
                      {currentUser.role}
                    </span>
                  )}
                </div>
                <div className="relative z-10 px-5 pb-4 -mt-8 flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-end gap-3.5">
                    <div className="relative w-16 h-16 rounded-2xl bg-[#131620] ring-4 ring-[#131620] flex items-center justify-center text-3xl shadow-xl overflow-hidden shrink-0">
                      <AvatarView avatar={avatar} alt={username} fallback="🎮" className="w-full h-full object-cover" />
                      <span
                        className={`absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full ring-2 ring-[#131620] ${
                          profileStatus === 'online'
                            ? 'bg-emerald-400'
                            : profileStatus === 'idle'
                            ? 'bg-amber-400'
                            : profileStatus === 'dnd'
                            ? 'bg-red-500'
                            : 'bg-slate-500'
                        }`}
                      />
                    </div>
                    <div className="pb-0.5">
                      <div className="text-base font-bold text-white">{username || 'Kullanıcı'}</div>
                      <div className="text-xs text-white/60 truncate max-w-[260px]">{profileStatusMessage || 'Çevrimiçi'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentUser?.id) {
                          navigator.clipboard?.writeText(currentUser.id).catch(() => {});
                          setIdCopied(true);
                          setTimeout(() => setIdCopied(false), 1800);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/75 flex items-center gap-1.5 transition"
                      title="Kullanıcı ID Kopyala"
                    >
                      <Copy className="w-3 h-3" />
                      <span className="font-mono">{idCopied ? 'Kopyalandı' : `ID: ${currentUser?.id?.slice(0, 8)}`}</span>
                    </button>
                    {typeof currentUser?.walletBalance === 'number' && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                        {currentUser.walletBalance.toLocaleString('tr-TR')} ₺
                      </div>
                    )}
                  </div>
                </div>
                {profileBio && (
                  <div className="px-5 pb-3.5 text-xs text-white/70 border-t border-white/5 pt-2.5">
                    {profileBio}
                  </div>
                )}
              </div>

              {/* Custom Avatar Upload & Emoji Selector */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                    Avatar Seç veya Resim Yükle
                  </label>
                  <label className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Resim / GIF Yükle</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setProfileUploadErr(null);
                        try {
                          const res = await processUploadedImage(file, {
                            maxWidth: 256,
                            maxHeight: 256,
                            maxGifBytes: 1_500_000,
                          });
                          if (!res.ok) {
                            setProfileUploadErr(res.error);
                          } else {
                            setAvatar(res.dataUrl);
                            setAvatarUrlInput('');
                          }
                        } catch (err: unknown) {
                          setProfileUploadErr(err instanceof Error && err.message ? err.message : 'Görsel işlenemedi.');
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {profileUploadErr && <div className="text-xs text-red-400">{profileUploadErr}</div>}
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setAvatar(opt);
                        setAvatarUrlInput('');
                      }}
                      className={`w-10 h-10 rounded-2xl bg-white/5 hover:scale-105 transition flex items-center justify-center text-xl border ${
                        avatar === opt ? 'border-blue-400 bg-blue-500/20' : 'border-white/5'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  type="url"
                  value={avatarUrlInput}
                  onChange={(e) => setAvatarUrlInput(e.target.value)}
                  placeholder="Veya doğrudan Avatar URL yapıştırın (https://...)"
                  className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Profile Form */}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                      Kullanıcı Adı
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                      Özel Durum Mesajı
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      value={profileStatusMessage}
                      onChange={(e) => setProfileStatusMessage(e.target.value)}
                      placeholder="Örn: CS2 oynuyor..."
                      className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Online Status */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">
                    Çevrimiçi Durum
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'online', label: 'Çevrimiçi', dot: 'bg-emerald-400' },
                        { id: 'idle', label: 'Boşta', dot: 'bg-amber-400' },
                        { id: 'dnd', label: 'Rahatsız Etmeyin', dot: 'bg-red-500' },
                        { id: 'offline', label: 'Görünmez', dot: 'bg-slate-500' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setProfileStatus(st.id)}
                        className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition ${
                          profileStatus === st.id
                            ? 'bg-blue-500/20 border-blue-400 text-white'
                            : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                    Hakkımda (Bio)
                  </label>
                  <textarea
                    rows={3}
                    maxLength={220}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    placeholder="Kendinizden kısaca bahsedin..."
                    className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Banner Color & Image */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-semibold text-white/40 uppercase">
                      Profil Afiş Rengi &amp; Görseli
                    </label>
                    <div className="flex items-center gap-2">
                      {profileBannerImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileBannerImage('');
                            setBannerUrlInput('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-medium transition"
                        >
                          Görseli Kaldır
                        </button>
                      )}
                      <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 text-[11px] font-medium transition">
                        Afiş / GIF Yükle
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setProfileUploadErr(null);
                            const res = await processUploadedImage(file, {
                              maxWidth: 960,
                              maxHeight: 380,
                              maxGifBytes: 2 * 1024 * 1024,
                            });
                            if (res.ok) {
                              setProfileBannerImage(res.dataUrl);
                              setBannerUrlInput('');
                            } else {
                              setProfileUploadErr(res.error);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'from-indigo-600 via-purple-600 to-pink-600',
                      'from-emerald-600 via-teal-600 to-cyan-600',
                      'from-amber-500 via-orange-600 to-red-600',
                      'from-blue-600 via-cyan-500 to-teal-400',
                      'from-fuchsia-600 via-purple-600 to-pink-500',
                      'from-yellow-500 via-amber-600 to-yellow-700',
                      'from-neutral-800 via-neutral-900 to-black',
                    ].map((cls) => (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setProfileBannerColor(cls)}
                        className={`w-12 h-7 rounded-lg bg-gradient-to-r ${cls} border-2 transition ${
                          profileBannerColor === cls ? 'border-white scale-105 shadow-lg' : 'border-white/15 opacity-75 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                  <input
                    type="url"
                    value={bannerUrlInput}
                    onChange={(e) => setBannerUrlInput(e.target.value)}
                    placeholder="Veya doğrudan Afiş (Banner) URL yapıştırın (https://...)"
                    className="w-full bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-white/40">
                    {currentUser?.email ? `E-posta: ${currentUser.email}` : 'Yerel / Hızlı Hesap'}
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-full text-xs transition shadow-md shadow-blue-500/25 flex items-center gap-1.5"
                  >
                    {savedSuccess ? <Check className="w-4 h-4" /> : null}
                    {savedSuccess ? t(language, 'saved') : t(language, 'save')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3.5: Security & Blocked Users */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Hesap & Güvenlik</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  İki faktörlü doğrulama (2FA), şifre ve engellenen kullanıcıları yönetin.
                </p>
              </div>

              {/* Two-Factor Authentication (2FA) */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>İki Faktörlü Doğrulama (2FA / Authenticator)</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      currentUser?.twoFactorEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/10 text-white/50 border border-white/10'
                    }`}
                  >
                    {currentUser?.twoFactorEnabled ? 'Aktif' : 'Kapalı'}
                  </span>
                </div>

                {twoFaStatusMsg && (
                  <div
                    className={`text-xs px-3 py-2 rounded-xl border ${
                      twoFaStatusMsg.type === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/15 border-red-500/30 text-red-300'
                    }`}
                  >
                    {twoFaStatusMsg.text}
                  </div>
                )}

                {twoFaBackupCodes && twoFaBackupCodes.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="text-xs font-bold text-amber-300">
                      Tek Kullanımlık Yedek Kurtarma Kodlarınız (Güvenli Bir Yere Kaydedin):
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 font-mono text-xs text-white">
                      {twoFaBackupCodes.map((c) => (
                        <div key={c} className="bg-black/40 rounded-lg px-2 py-1 text-center border border-white/10">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isAuthenticated ? (
                  <p className="text-xs text-white/50">2FA ayarlarını yönetmek için giriş yapmış olmalısınız.</p>
                ) : currentUser?.twoFactorEnabled ? (
                  <form onSubmit={handleDisable2fa} className="space-y-2.5 pt-1">
                    <p className="text-xs text-white/60">
                      2FA şu anda hesabınızı koruyor. Devre dışı bırakmak için şifrenizi ve güncel 6 haneli kodunuzu girin:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="password"
                        required
                        value={twoFaDisablePassword}
                        onChange={(e) => setTwoFaDisablePassword(e.target.value)}
                        placeholder="Mevcut Şifre"
                        className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <input
                        type="text"
                        required
                        value={twoFaDisableCode}
                        onChange={(e) => setTwoFaDisableCode(e.target.value)}
                        placeholder="6 haneli 2FA kodu"
                        className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={twoFaLoading}
                      className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-xs font-semibold transition disabled:opacity-50"
                    >
                      {twoFaLoading ? 'İşleniyor...' : '2FA Korumasını Kapat'}
                    </button>
                  </form>
                ) : twoFaSetup ? (
                  <form onSubmit={handleVerifyEnable2fa} className="space-y-3 pt-1">
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/30 p-3 rounded-xl border border-white/10">
                      {twoFaQrDataUrl && (
                        <img
                          src={twoFaQrDataUrl}
                          alt="2FA QR Code"
                          className="w-36 h-36 rounded-lg bg-white p-1.5 shrink-0"
                        />
                      )}
                      <div className="space-y-2 text-xs text-white/70 min-w-0">
                        <div>
                          Google Authenticator, Authy veya Microsoft Authenticator ile QR kodu okutun.
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase font-semibold">Manuel Kurulum Anahtarı:</div>
                          <div className="font-mono text-white bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/10 break-all select-all mt-1">
                            {twoFaSetup.secret}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={twoFaCodeInput}
                        onChange={(e) => setTwoFaCodeInput(e.target.value)}
                        placeholder="Uygulamadaki 6 haneli kodu girin"
                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={twoFaLoading}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition disabled:opacity-50"
                      >
                        {twoFaLoading ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFaSetup(null);
                          setTwoFaQrDataUrl(null);
                        }}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/70"
                      >
                        İptal
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-white/50">
                      Giriş yaparken şifrenize ek olarak telefonunuzdaki 6 haneli doğrulama kodunu isteyin.
                    </p>
                    <button
                      type="button"
                      onClick={handleInit2fa}
                      disabled={twoFaLoading}
                      className="shrink-0 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold shadow transition disabled:opacity-50"
                    >
                      {twoFaLoading ? 'Hazırlanıyor...' : "2FA'yı Etkinleştir"}
                    </button>
                  </div>
                )}
              </div>

              {/* Active Sessions Management */}
              <ActiveSessionsCard />

              {/* Password Change */}
              <PasswordChangeCard />

              {/* Modular Self-Service Email Change (OTP) & Permanent Account Deletion */}
              <AccountSecuritySection />

              {/* Blocked Users */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    <span>Engellenen Kullanıcılar</span>
                  </div>
                  <span className="text-[11px] text-white/40">
                    {(currentUser?.blockedUsers || []).length} kişi
                  </span>
                </div>

                {(!currentUser?.blockedUsers || currentUser.blockedUsers.length === 0) ? (
                  <p className="text-xs text-white/40">Şu anda engellediğiniz bir kullanıcı yok.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {currentUser.blockedUsers.map((blockedName) => (
                      <div
                        key={blockedName}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 border border-white/5"
                      >
                        <span className="text-xs font-medium text-white/80">{blockedName}</span>
                        <button
                          type="button"
                          onClick={() => unblockUser(blockedName)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white/80 hover:text-white transition"
                        >
                          Engeli Kaldır
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Appearance & Notifications */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {t(language, 'appearanceTitle')}
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Renk temalarını, uygulama dilini, cam saydamlığını, yazı boyutunu ve oyun içi overlay&apos;i özelleştirin.
                </p>
              </div>

              {/* Language Selector */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="text-sm font-semibold text-white">{t(language, 'languageTitle')}</div>
                      <div className="text-xs text-white/45">{t(language, 'languageDesc')}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLanguage(opt.id)}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                        language === opt.id
                          ? 'bg-blue-500 text-white border-blue-400 shadow'
                          : 'bg-black/30 border-white/10 text-white/70 hover:text-white'
                      }`}
                    >
                      <span>{opt.flag}</span>
                      <span>{opt.native}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme Presets & Live Preview */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-white/90">Arayüz Teması (8 Koyu + 4 Açık Tema)</div>
                    <span className="text-[11px] text-white/45 font-mono">{uiTheme}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(
                      [
                        { id: 'vision-dark', label: 'Vision Dark', desc: 'Obsidian & Amber', grad: 'from-slate-800 via-zinc-900 to-amber-900/60', dot: 'bg-slate-300' },
                        { id: 'midnight-blue', label: 'Midnight Blue', desc: 'Safir & İndigo', grad: 'from-blue-950 via-indigo-950 to-slate-900', dot: 'bg-blue-400' },
                        { id: 'cyber-emerald', label: 'Cyber Emerald', desc: 'Zümrüt & Camgöbeği', grad: 'from-emerald-950 via-teal-950 to-slate-900', dot: 'bg-emerald-400' },
                        { id: 'amber-gold', label: 'Amber Gold', desc: 'Sıcak Altın', grad: 'from-amber-950 via-orange-950 to-stone-950', dot: 'bg-amber-400' },
                        { id: 'crimson-rose', label: 'Crimson Rose', desc: 'Yakut & Pembe', grad: 'from-rose-950 via-pink-950 to-zinc-950', dot: 'bg-rose-400' },
                        { id: 'royal-violet', label: 'Royal Violet', desc: 'Kozmik Mor', grad: 'from-violet-950 via-purple-950 to-slate-950', dot: 'bg-violet-400' },
                        { id: 'nordic-frost', label: 'Nordic Frost', desc: 'Buz Mavisi', grad: 'from-sky-950 via-slate-900 to-zinc-950', dot: 'bg-sky-400' },
                        { id: 'oled-black', label: 'OLED Siyah', desc: 'Saf AMOLED #000', grad: 'from-black via-neutral-950 to-black', dot: 'bg-white' },
                        { id: 'pearl-white', label: 'İnci Beyazı', desc: 'Açık · Saf Cam', grad: 'from-white via-slate-100 to-blue-100', dot: 'bg-blue-600' },
                        { id: 'sky-daylight', label: 'Gündüz Mavisi', desc: 'Açık · Ferah Gökyüzü', grad: 'from-sky-50 via-sky-100 to-indigo-100', dot: 'bg-sky-600' },
                        { id: 'warm-sand', label: 'Sıcak Kum', desc: 'Açık · Göz Dostu Krem', grad: 'from-amber-50 via-orange-50 to-stone-200', dot: 'bg-amber-600' },
                        { id: 'mint-breeze', label: 'Nane Esintisi', desc: 'Açık · Pastel Yeşil', grad: 'from-emerald-50 via-teal-50 to-emerald-100', dot: 'bg-emerald-600' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setUiTheme(t.id)}
                        className={`text-left p-2.5 rounded-xl border transition-all group ${
                          uiTheme === t.id
                            ? 'bg-blue-500/15 border-blue-400 text-white shadow-lg shadow-blue-500/10'
                            : 'bg-black/25 border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className={`w-full h-7 rounded-lg bg-gradient-to-r ${t.grad} border border-white/10 mb-2 flex items-center px-2`}>
                          <span className={`w-2.5 h-2.5 rounded-full ${t.dot} shadow`} />
                        </div>
                        <div className="text-xs font-bold truncate">{t.label}</div>
                        <div className="text-[10px] text-white/45 truncate">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Theme Builder (CSS Variables) */}
                <div className="p-4 rounded-2xl bg-black/25 border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <Palette className="w-3.5 h-3.5 text-indigo-400" />
                        Özel Tema Oluşturucu (CSS Değişkenleri)
                      </div>
                      <div className="text-[11px] text-white/50">
                        Kendi zemin renginizi, vurgu renginizi ve açık/koyu kontrast modunuzu oluşturun.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUiTheme('custom')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                          uiTheme === 'custom'
                            ? 'bg-indigo-500 border-indigo-400 text-white shadow'
                            : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                        }`}
                      >
                        {uiTheme === 'custom' ? '✓ Özel Tema Aktif' : 'Özel Temayı Uygula'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomTheme(DEFAULT_CUSTOM_THEME)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/60"
                      >
                        Sıfırla
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">Kontrast Modu</label>
                      <div className="flex gap-1.5">
                        {(['dark', 'light'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setCustomTheme({ mode: m, bgColor: m === 'light' && customTheme.bgColor === '#111827' ? '#f3f6fb' : m === 'dark' && customTheme.bgColor === '#f3f6fb' ? '#111827' : customTheme.bgColor });
                              setUiTheme('custom');
                            }}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              customTheme.mode === m
                                ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                                : 'bg-black/25 border-white/10 text-white/60'
                            }`}
                          >
                            {m === 'dark' ? '🌙 Koyu' : '☀️ Açık'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">Zemin Rengi</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customTheme.bgColor}
                          onChange={(e) => {
                            setCustomTheme({ bgColor: e.target.value });
                            setUiTheme('custom');
                          }}
                          className="w-9 h-8 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-white/75">{customTheme.bgColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-white/50 uppercase mb-1">Vurgu Parlaması</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customTheme.accentColor}
                          onChange={(e) => {
                            setCustomTheme({ accentColor: e.target.value });
                            setUiTheme('custom');
                          }}
                          className="w-9 h-8 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-white/75">{customTheme.accentColor}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Mini Preview */}
                <div className="p-3.5 rounded-xl ios-glass border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-sm shrink-0">
                      🎨
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">Canlı Görünüm Önizlemesi</div>
                      <div
                        className={`text-white/70 truncate ${
                          chatFontSize === 'sm' ? 'text-xs' : chatFontSize === 'lg' ? 'text-base' : 'text-sm'
                        }`}
                      >
                        Merhaba! Seçtiğin tema ve yazı boyutu anlık olarak uygulanır.
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-[10px] font-mono text-white/75 shrink-0">
                    {glassIntensity} • {cornerStyle}
                  </span>
                </div>

                {/* Font Size & Density */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                  <div>
                    <div className="text-xs font-semibold text-white/80 mb-2">Sohbet Yazı Boyutu</div>
                    <div className="flex gap-2">
                      {(
                        [
                          { id: 'sm', label: 'Küçük' },
                          { id: 'base', label: 'Normal' },
                          { id: 'lg', label: 'Büyük' },
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setChatFontSize(s.id)}
                          className={`flex-1 py-1.5 px-2.5 rounded-xl border text-xs font-semibold transition ${
                            chatFontSize === s.id
                              ? 'ui-accent-bg shadow'
                              : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white/80 mb-2">Mesaj Görünüm Yoğunluğu</div>
                    <div className="flex gap-2">
                      {(
                        [
                          { id: 'cozy', label: 'Rahat (Cozy)' },
                          { id: 'compact', label: 'Sıkışık (Compact)' },
                        ] as const
                      ).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setMessageDensity(d.id)}
                          className={`flex-1 py-1.5 px-2.5 rounded-xl border text-xs font-semibold transition ${
                            messageDensity === d.id
                              ? 'ui-accent-bg shadow'
                              : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chat Layout Mode */}
                <div className="pt-2 border-t border-white/10">
                  <div className="text-xs font-semibold text-white/80 mb-2">{t(language, 'chatLayoutTitle')}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'auto', label: `${t(language, 'chatLayoutAuto')} (Sunucu: Klasik · DM: Balon)` },
                        { id: 'classic', label: t(language, 'chatLayoutClassic') },
                        { id: 'bubble', label: t(language, 'chatLayoutBubble') },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setChatLayout(mode.id)}
                        className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-semibold transition ${
                          chatLayout === mode.id
                            ? 'ui-accent-bg shadow'
                            : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Glass, Corners & Background Pattern */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/10">
                  <div>
                    <div className="text-xs font-semibold text-white/80 mb-2">Cam Efekti (Blur)</div>
                    <div className="flex gap-1.5">
                      {(
                        [
                          { id: 'low', label: 'Hafif' },
                          { id: 'normal', label: 'Dengeli' },
                          { id: 'high', label: 'Yoğun' },
                        ] as const
                      ).map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setGlassIntensity(g.id)}
                          className={`flex-1 py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition ${
                            glassIntensity === g.id
                              ? 'ui-accent-bg shadow'
                              : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white/80 mb-2">Köşe Stili</div>
                    <div className="flex gap-1.5">
                      {(
                        [
                          { id: 'rounded', label: 'Yumuşak' },
                          { id: 'sharp', label: 'Keskin' },
                        ] as const
                      ).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCornerStyle(c.id)}
                          className={`flex-1 py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition ${
                            cornerStyle === c.id
                              ? 'ui-accent-bg shadow'
                              : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white/80 mb-2">Arka Plan Deseni</div>
                    <div className="flex gap-1.5">
                      {(
                        [
                          { id: 'grid', label: 'Izgara' },
                          { id: 'dots', label: 'Nokta' },
                          { id: 'clean', label: 'Sade' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setBgPattern(p.id)}
                          className={`flex-1 py-1.5 px-2 rounded-xl border text-[11px] font-semibold transition ${
                            bgPattern === p.id
                              ? 'ui-accent-bg shadow'
                              : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Reduce Motion Toggle */}
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div>
                    <div className="text-xs font-semibold text-white">Animasyonları Azalt (Performans Modu)</div>
                    <div className="text-[11px] text-white/45">Oyun oynarken veya düşük GPU kullanımında geçiş animasyonlarını kapatır.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReduceMotion(!reduceMotion)}
                    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                      reduceMotion ? 'ui-accent-bg' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        reduceMotion ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* In-Game Overlay & Game Detection Card */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Windows Başlangıçta Otomatik Başlat</div>
                    <div className="text-xs text-white/40">
                      Bilgisayar açıldığında Çakma masaüstü uygulamasını otomatik başlatır
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAutostart}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autostartEnabled ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autostartEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Kapat (X) Tuşunda Sistem Tepsisine Küçült</div>
                    <div className="text-xs text-white/40">
                      Açıkken pencere kapatıldığında arka planda çalışmaya devam eder; kapatılırsa uygulamadan tamamen çıkar
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCloseToTray}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                      closeToTrayEnabled ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        closeToTrayEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Masaüstü Bildirimleri</div>
                      <div className="text-xs text-white/40">
                        Bahsedildiğinizde veya özel mesaj aldığınızda anlık bildirim alın
                      </div>
                    </div>
                  </div>

                  {notifPermission === 'granted' ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> İzin Verildi
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={requestNotificationPermission}
                      className="px-4 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow transition"
                    >
                      İzin Ver
                    </button>
                  )}
                </div>
              </div>

              {/* PWA Standalone Install & Web Push Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">PWA &amp; Web Push Arka Plan Bildirimleri</div>
                      <div className="text-xs text-purple-200/70">
                        Service Worker kaydederek tarayıcı sekmesi arka plandayken bile bildirim ve PWA kurulumu sağlayın.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegisterWebPush}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-500/25 hover:bg-purple-500/35 border border-purple-400/40 text-purple-200 text-xs font-semibold transition shrink-0"
                  >
                    Service Worker / Push Etkinleştir
                  </button>
                </div>
                {pushRegStatus && (
                  <div className="text-xs px-3 py-2 rounded-xl bg-black/30 border border-purple-400/30 text-purple-200">
                    {pushRegStatus}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: In-Game Overlay */}
          {activeTab === 'overlay' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Oyun İçi Overlay &amp; Oyun Algılama</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Saydamlık, köşe konumu, boyut, ping göstergesi ve tıklama geçirgenliği ayarlarını özelleştirin.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Oyun İçi Konuşanlar Overlay&apos;i</div>
                      <div className="text-xs text-white/45">
                        Ses odasındayken konuşanları ve ping durumunu her zaman üstte göster (Masaüstü)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverlayEnabled(!overlayEnabled)}
                    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                      overlayEnabled ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        overlayEnabled ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">Otomatik Oyun Algılama</div>
                      <div className="text-[11px] text-white/45 truncate">
                        {detectedGame ? (
                          <span className="text-emerald-400 font-semibold">Algılanan: {detectedGame}</span>
                        ) : (
                          'Şu anda çalışan bilinen bir oyun algılanmadı'
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshDetectedGame()}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Şimdi Tara</span>
                  </button>
                </div>
              </div>

              {/* Live Mini Overlay Preview */}
              <div className="relative h-28 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950/50 to-slate-950 overflow-hidden p-3">
                <div className="text-[10px] text-white/35 uppercase font-semibold tracking-wider">Canlı Önizleme</div>
                <div
                  style={{ opacity: Math.max(0.2, overlayOpacity / 100) }}
                  className={`absolute ${
                    overlayCorner === 'top-left'
                      ? 'top-2 left-2'
                      : overlayCorner === 'top-right'
                      ? 'top-2 right-2'
                      : overlayCorner === 'bottom-left'
                      ? 'bottom-2 left-2'
                      : 'bottom-2 right-2'
                  } ${
                    overlayConfig.size === 'compact' ? 'w-36' : overlayConfig.size === 'wide' ? 'w-56' : 'w-44'
                  } rounded-xl bg-slate-950/65 backdrop-blur-md border border-white/15 p-2 shadow-xl space-y-1`}
                >
                  <div className="flex items-center justify-between text-[9px] text-white/75">
                    <span className="font-bold truncate">🔊 Ses Odası</span>
                    {overlayConfig.showPing && <span className="font-mono text-emerald-300">24ms</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="truncate">{currentUser?.username || 'Kullanıcı'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="space-y-2.5">
                  <div>
                    <div className="text-sm font-semibold text-white">Overlay Konumu</div>
                    <div className="text-xs text-white/40">Oyun içi konuşanlar penceresinin ekran köşesi</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'top-left', label: 'Sol Üst' },
                        { id: 'top-right', label: 'Sağ Üst' },
                        { id: 'bottom-left', label: 'Sol Alt' },
                        { id: 'bottom-right', label: 'Sağ Alt' },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleOverlayCornerChange(c.id)}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                          overlayCorner === c.id
                            ? 'bg-blue-500 text-white border-blue-400 shadow'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex justify-between text-xs text-white/70 mb-1.5">
                    <span>Overlay Cam Saydamlığı</span>
                    <span className="font-mono">%{overlayOpacity}</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                  />
                </div>

                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-white mb-1.5">Overlay Pencere Boyutu</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'compact', label: 'Kompakt' },
                          { id: 'standard', label: 'Standart' },
                          { id: 'wide', label: 'Geniş' },
                        ] as const
                      ).map((sz) => (
                        <button
                          key={sz.id}
                          type="button"
                          onClick={() => updateOverlayConfig({ size: sz.id })}
                          className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition ${
                            overlayConfig.size === sz.id
                              ? 'bg-blue-500 text-white border-blue-400 shadow'
                              : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {sz.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      {
                        label: 'Yalnızca Konuşanları Göster',
                        desc: 'Sessizdeki kişileri gizler',
                        checked: overlayConfig.onlySpeaking,
                        onToggle: () => updateOverlayConfig({ onlySpeaking: !overlayConfig.onlySpeaking }),
                      },
                      {
                        label: 'Hızlı Kontrol Çubuğu',
                        desc: 'Alt Mikrofon/Kulaklık butonları',
                        checked: overlayConfig.showControls,
                        onToggle: () => updateOverlayConfig({ showControls: !overlayConfig.showControls }),
                      },
                      {
                        label: 'Ping Göstergesi',
                        desc: 'Başlıkta ms gecikmesini gösterir',
                        checked: overlayConfig.showPing,
                        onToggle: () => updateOverlayConfig({ showPing: !overlayConfig.showPing }),
                      },
                      {
                        label: 'Tıklama Geçirgenliği (Ctrl+Shift+O)',
                        desc: 'Oyun içinde fare tıklamalarını geçirir',
                        checked: overlayLocked,
                        onToggle: toggleOverlayLockSetting,
                      },
                    ].map((opt) => (
                      <div
                        key={opt.label}
                        className="p-2.5 rounded-xl bg-black/25 border border-white/10 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{opt.label}</div>
                          <div className="text-[10px] text-white/45 truncate">{opt.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={opt.onToggle}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                            opt.checked ? 'bg-emerald-500' : 'bg-white/15'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              opt.checked ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Video & Codec (TeamSpeak-style Hardware Acceleration & Camera) */}
          {activeTab === 'video' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Video & Donanım Hızlandırma</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Video codec tercihlerini, donanım hızlandırmayı ve kamera kalitesini yapılandırın.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <span>Hardware Acceleration</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Cisco OpenH264 Kullan</div>
                    <div className="text-xs text-white/40">H.264 video kodlama ve çözme için OpenH264 desteğini etkinleştirir.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAdv({ useOpenH264: !advSettings.useOpenH264 })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      advSettings.useOpenH264 ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${advSettings.useOpenH264 ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div>
                    <div className="text-sm font-semibold text-white">Donanım Hızlandırma (GPU)</div>
                    <div className="text-xs text-white/40">Video akışlarını işlerken GPU hızlandırmasından faydalanır.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAdv({ hardwareAcceleration: !advSettings.hardwareAcceleration })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      advSettings.hardwareAcceleration ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${advSettings.hardwareAcceleration ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Codec Backends */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="text-xs font-semibold text-white/70">Tercih Edilen Video Codec</div>
                  <div className="grid grid-cols-5 gap-2">
                    {(['auto', 'AV1', 'H264', 'VP9', 'VP8'] as const).map((codec) => (
                      <button
                        key={codec}
                        type="button"
                        onClick={() => updateAdv({ preferredCodec: codec })}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                          advSettings.preferredCodec === codec
                            ? 'bg-blue-500 text-white border-blue-400 shadow'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {codec === 'auto' ? 'Otomatik' : codec}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {[
                      { label: 'AV1 Codec Backend', key: 'av1Backend' as const, opts: ['Hardware (Auto)', 'AMD AMF AV1', 'NVIDIA NVENC AV1', 'Internal (Software)'] },
                      { label: 'H.264 Codec Backend', key: 'h264Backend' as const, opts: ['Hardware (Auto)', 'AMD AMF H.264', 'NVIDIA NVENC H.264', 'OpenH264 (Software)'] },
                      { label: 'VP9 Codec Backend', key: 'vp9Backend' as const, opts: ['Internal (Software)', 'Hardware (Auto)'] },
                      { label: 'VP8 Codec Backend', key: 'vp8Backend' as const, opts: ['Internal (Software)', 'Hardware (Auto)'] },
                    ].map((item) => (
                      <div key={item.key} className="bg-black/30 rounded-xl p-3 border border-white/5 space-y-1.5">
                        <div className="text-[11px] font-semibold text-white/70">{item.label}</div>
                        <select
                          value={advSettings[item.key]}
                          onChange={(e) => updateAdv({ [item.key]: e.target.value })}
                          className="w-full bg-[#161c2c] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {item.opts.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Camera Settings & Test */}
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Kamera Kalitesi & Test</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCameraTest}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                      isCameraTesting
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {isCameraTesting ? 'Kamerayı Kapat' : 'Kamerayı Test Et'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-white/60 mb-1.5">Çözünürlük</div>
                    <div className="flex gap-1.5">
                      {(['480p', '720p', '1080p'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => updateAdv({ cameraResolution: r })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            advSettings.cameraResolution === r
                              ? 'bg-blue-500 text-white border-blue-400'
                              : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1.5">FPS</div>
                    <div className="flex gap-1.5">
                      {([15, 30, 60] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => updateAdv({ cameraFps: f })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            advSettings.cameraFps === f
                              ? 'bg-blue-500 text-white border-blue-400'
                              : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {f} FPS
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {isCameraTesting && (
                  <div className="aspect-video w-full max-w-md mx-auto rounded-xl overflow-hidden border border-white/10 bg-black">
                    <video ref={cameraVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Default Screen Share & Viewer Preferences */}
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-white/50">
                  Varsayılan Ekran Yayını &amp; İzleme Tercihleri
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Varsayılan HDR Yayın Modu (10-bit AV1 / VP9)</div>
                    <div className="text-xs text-white/40">Go Live açıldığında HDR modu varsayılan olarak seçili gelir.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !defaultStreamHdr;
                      setDefaultStreamHdr(next);
                      try { localStorage.setItem('cakma_default_stream_hdr', String(next)); } catch {}
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                      defaultStreamHdr ? 'bg-amber-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${defaultStreamHdr ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                  <div>
                    <label className="block text-xs text-white/60 mb-1.5">Varsayılan İzleme Kalitesi</label>
                    <select
                      value={defaultViewerQuality}
                      onChange={(e) => {
                        setDefaultViewerQuality(e.target.value);
                        try { localStorage.setItem('cakma_default_viewer_quality', e.target.value); } catch {}
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="auto">Otomatik</option>
                      <option value="source">Kaynak</option>
                      <option value="1080">1080p</option>
                      <option value="720">720p</option>
                      <option value="480">480p</option>
                      <option value="360">360p</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-white/60 mb-1.5">
                      <span>Varsayılan Yayın Sesi</span>
                      <span className="font-mono">%{defaultStreamVolume}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={defaultStreamVolume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDefaultStreamVolume(v);
                        try { localStorage.setItem('cakma_default_stream_volume', String(v)); } catch {}
                      }}
                      className="w-full accent-emerald-400 cursor-pointer mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Key Bindings */}
          {activeTab === 'keybindings' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Kısayol Tuşları (Key Bindings)</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Bas-Konuş, mikrofon susturma, sağırlaştırma ve yayın kısayollarını atayın.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Bas-Konuş (Push-to-Talk) Tuşu</div>
                    <div className="text-xs text-white/40">Bas-Konuş modu seçiliyken mikrofonu açmak için basılı tutulacak tuş.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingKey(true);
                      const handler = (e: KeyboardEvent) => {
                        e.preventDefault();
                        setPttKey(e.code);
                        setRecordingKey(false);
                        window.removeEventListener('keydown', handler);
                      };
                      window.addEventListener('keydown', handler);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition ${
                      recordingKey
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse'
                        : 'bg-black/40 border-white/15 text-white hover:border-blue-400'
                    }`}
                  >
                    {recordingKey ? 'Tuşa Basın...' : pttKey}
                  </button>
                </div>

                {(
                  [
                    { key: 'muteShortcut', label: 'Mikrofonu Sessize Al / Aç', desc: 'Ses kanalındayken mikrofon durumunu değiştirir.' },
                    { key: 'deafenShortcut', label: 'Kulaklığı Kapat / Aç (Deafen)', desc: 'Gelen tüm sesleri susturur.' },
                    { key: 'screenShareShortcut', label: 'Ekran Yayınını Başlat / Durdur', desc: 'Yayın ayarlarını açar veya yayını sonlandırır.' },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between pt-3 border-t border-white/5">
                    <div>
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <div className="text-xs text-white/40">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRecordingShortcutFor(item.key);
                        const handler = (e: KeyboardEvent) => {
                          e.preventDefault();
                          updateAdv({ [item.key]: e.code });
                          setRecordingShortcutFor(null);
                          window.removeEventListener('keydown', handler);
                        };
                        window.addEventListener('keydown', handler);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition ${
                        recordingShortcutFor === item.key
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse'
                          : 'bg-black/40 border-white/15 text-white hover:border-blue-400'
                      }`}
                    >
                      {recordingShortcutFor === item.key ? 'Tuşa Basın...' : advSettings[item.key]}
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-3">
                <div className="text-sm font-semibold text-white">Masaüstü &amp; Hızlı Kullanım Kısayolları</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Global Mikrofon Sustur</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">Ctrl + Shift + M</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Global Sağırlaştır</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">Ctrl + Shift + D</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Üyeyi Odaya Taşıma</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">Sürükle &amp; Bırak</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Uzaktan Yardım Klavye/Kısayol</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">1-e-1 Görüşme</kbd>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Chats & Whispers */}
          {activeTab === 'chats' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Sohbet & Fısıltı (Whispers)</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Mesajlaşma davranışlarını ve TeamSpeak tarzı fısıltı izinlerini yönetin.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Enter ile Mesaj Gönder</div>
                    <div className="text-xs text-white/40">Kapalıysa mesaj göndermek için Ctrl+Enter kullanılır.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAdv({ enterToSend: !advSettings.enterToSend })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      advSettings.enterToSend ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${advSettings.enterToSend ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div>
                    <div className="text-sm font-semibold text-white">Bağlantı Önizlemeleri & GIF Otomatik Oynatma</div>
                    <div className="text-xs text-white/40">Sohbette paylaşılan medya ve bağlantıları otomatik yükler.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAdv({ autoPlayGifs: !advSettings.autoPlayGifs })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      advSettings.autoPlayGifs ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${advSettings.autoPlayGifs ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div>
                    <div className="text-sm font-semibold text-white">Zengin Bağlantı Önizlemeleri (YouTube & URL)</div>
                    <div className="text-xs text-white/40">Mesajlardaki web ve YouTube bağlantıları için önizleme kartı gösterir.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLinkPreviews(!showLinkPreviews)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      showLinkPreviews ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showLinkPreviews ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Radio className="w-4 h-4 text-teal-400" />
                    <span>Fısıltı (Whisper) İzinleri</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'everyone', label: 'Herkesten' },
                        { id: 'friends', label: 'Sadece Arkadaşlar' },
                        { id: 'disabled', label: 'Fısıltıyı Kapat' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateAdv({ whisperMode: opt.id })}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                          advSettings.whisperMode === opt.id
                            ? 'bg-blue-500 text-white border-blue-400 shadow'
                            : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-white/70 mb-1.5">
                      <span>Fısıltı Ses Seviyesi</span>
                      <span className="font-mono">{advSettings.whisperVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={150}
                      value={advSettings.whisperVolume}
                      onChange={(e) => updateAdv({ whisperVolume: Number(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-white/10 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Kaydedilen Kullanıcı Notları */}
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-white">Kaydedilen Kullanıcı Notları ({Object.keys(userNotes).length})</div>
                  <div className="text-xs text-white/40">Kullanıcı profillerine eklediğiniz yalnızca size özel notlar</div>
                </div>
                {Object.keys(userNotes).length === 0 ? (
                  <div className="text-xs text-white/40">Henüz kimse için özel not kaydetmediniz.</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {Object.entries(userNotes).map(([uname, note]) => (
                      <div
                        key={uname}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 border border-white/10 gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-amber-300">@{uname}</div>
                          <div className="text-xs text-white/75 truncate">{note}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUserNote(uname, '')}
                          className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition shrink-0"
                          title="Notu Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Bildirimler & Ses Paketleri</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Masaüstü bildirimlerini ve olay bazlı ses efektlerini ayrı ayrı yönetin.
                </p>
              </div>

              <WebPushSettingsCard currentServerHost={currentServerHost} />

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">TeamSpeak Ses Efektleri</div>
                    <div className="text-xs text-white/40">Bağlantı, ayrılma ve sesli uyarı efektleri.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTsSoundEffectsEnabled(!tsSoundEffectsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      tsSoundEffectsEnabled ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tsSoundEffectsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Sound Pack Selector */}
                <div className="pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Ses Paketi (Sound Pack)</div>
                      <div className="text-xs text-white/40">Oda giriş/çıkış ve susturma tonlarını özelleştirin.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => playTeamSpeakChime('join', soundPack)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition"
                    >
                      Sesi Dene
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      { id: 'modern', label: 'Modern' },
                      { id: 'classic-ts', label: 'TeamSpeak Klasik' },
                      { id: 'minimal', label: 'Minimal' },
                      { id: 'silent', label: 'Sessiz' },
                    ] as { id: SoundPackType; label: string }[]).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSoundPack(p.id);
                          if (p.id !== 'silent') playTeamSpeakChime('unmute', p.id);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition ${
                          soundPack === p.id
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PTT Beep Toggle */}
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div>
                    <div className="text-sm font-semibold text-white">Bas-Konuş (PTT) Bip Sesi</div>
                    <div className="text-xs text-white/40">PTT tuşuna basıldığında ve bırakıldığında telsiz bip sesi çalar.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !pttBeepEnabled;
                      setPttBeepEnabled(next);
                      if (next) playTeamSpeakChime('ptt_on');
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      pttBeepEnabled ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pttBeepEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div>
                    <div className="text-sm font-semibold text-white">Masaüstü Bildirimleri</div>
                    <div className="text-xs text-white/40">Uygulama arka plandayken yeni mesaj ve çağrı bildirimi gösterir.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {notifPermission !== 'granted' && (
                      <button
                        type="button"
                        onClick={requestNotificationPermission}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-semibold hover:bg-blue-500/30"
                      >
                        İzin Ver
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDesktopNotificationsEnabled(!desktopNotificationsEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        desktopNotificationsEnabled ? 'bg-emerald-500' : 'bg-white/15'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${desktopNotificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                {(
                  [
                    { key: 'soundOnJoinLeave', label: 'Odaya Giriş / Çıkış Sesi' },
                    { key: 'soundOnMention', label: '@Bahsetme ve DM Bildirim Sesi' },
                    { key: 'soundOnWhisper', label: 'Fısıltı (Whisper) Sesi' },
                    { key: 'soundOnStreamStart', label: 'Ekran Yayını Başlangıç Sesi' },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-xs font-medium text-white/80">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => updateAdv({ [item.key]: !advSettings[item.key] })}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                        advSettings[item.key] ? 'bg-blue-500' : 'bg-white/15'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${advSettings[item.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Arama Zil Sesi Paketi */}
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Arama Zil Sesi Paketi</div>
                    <div className="text-xs text-white/50">1-e-1 gelen ve giden aramalarda çalacak zil sesi stili</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => playCallRingtone('incoming', ringtonePack)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Test Et</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'modern', label: 'Modern' },
                    { id: 'classic', label: 'Klasik' },
                    { id: 'minimal', label: 'Minimal' },
                    { id: 'silent', label: 'Sessiz' },
                  ].map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setRingtonePack(pack.id as RingtonePack)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                        ringtonePack === pack.id
                          ? 'bg-blue-500 text-white border-blue-400 shadow'
                          : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      {pack.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aktif Hatırlatıcılar */}
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Aktif Hatırlatıcılar ({reminders.length})</div>
                    <div className="text-xs text-white/50">Sohbette /hatirlat komutuyla kurulan zamanlayıcılar</div>
                  </div>
                </div>
                {reminders.length === 0 ? (
                  <div className="text-xs text-white/40">Aktif hatırlatıcı bulunmuyor. Sohbette /hatirlat 10dk Mola yazabilirsiniz.</div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {reminders.map((rem) => (
                      <div
                        key={rem.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 border border-white/10 gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white truncate">{rem.text}</div>
                          <div className="text-[10px] text-cyan-300">
                            {new Date(rem.triggerAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeReminder(rem.id)}
                          className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition shrink-0"
                          title="Hatırlatıcıyı İptal Et"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-3">
                <div className="text-sm font-semibold text-white">Masaüstü &amp; Hızlı Kullanım Kısayolları</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Global Mikrofon Sustur</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">Ctrl + Shift + M</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Global Sağırlaştır</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">Ctrl + Shift + D</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Üyeyi Odaya Taşıma</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">Sürükle &amp; Bırak</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/70">Uzaktan Yardım Klavye/Kısayol</span>
                    <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono text-white">1-e-1 Görüşme</kbd>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: About & Version */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Hakkında & Güncelleme</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Çakma istemci sürüm bilgileri ve otomatik güncelleme denetimi.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src="/app-icon.png"
                      alt="Çakma"
                      className="w-11 h-11 rounded-2xl shadow-lg shadow-red-600/25 ring-1 ring-white/15 shrink-0 object-cover"
                      draggable={false}
                    />
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-white truncate">Çakma Masaüstü &amp; Web İstemcisi</div>
                      <div className="text-xs text-white/50 mt-0.5">Sürüm: v{appVersion} • WebRTC Opus 48kHz HD</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualUpdateCheck}
                    disabled={isCheckingUpdate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-xs font-semibold text-white shadow transition shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    {isCheckingUpdate ? 'Kontrol Ediliyor...' : 'Güncellemeleri Denetle'}
                  </button>
                </div>

                {updateStatusMsg && (
                  <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-2.5 text-xs text-blue-200 space-y-2">
                    <div>{updateStatusMsg}</div>
                    {updateProgress && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-blue-200">
                          <span>İndiriliyor... %{updateProgress.percent}</span>
                          <span>{updateProgress.downloadedMb} / {updateProgress.totalMb} MB</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-150"
                            style={{ width: `${updateProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs">
                  <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                    <div className="text-white/40 mb-1">Bağlı Sunucu</div>
                    <div className="font-mono text-white/90 truncate">{currentServerHost || 'ses.yahyakemalokutan.com'}</div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                    <div className="text-white/40 mb-1">Ses & Video Motoru</div>
                    <div className="font-mono text-emerald-400">WebRTC + LiveKit SFU / {advSettings.preferredCodec.toUpperCase()}</div>
                  </div>
                </div>
              </div>

              <ChangelogTab appVersion={appVersion} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
