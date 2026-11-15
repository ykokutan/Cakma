import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { playTeamSpeakChime, SoundPackType } from '../utils/tsSoundEffects';
import { AvatarView } from './AvatarView';
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
    inputSensitivity,
    setInputSensitivity,
    inputVolume,
    setInputVolume,
    outputVolume,
    setOutputVolume,
    isMicTesting,
    toggleMicTest,
    micVolumeLevel,
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
    changePassword,
    unblockUser,
    uiTheme,
    setUiTheme,
    chatFontSize,
    setChatFontSize,
    currentServerHost,
    overlayEnabled,
    setOverlayEnabled,
    detectedGame,
    refreshDetectedGame,
  } = useSocket();

  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '🎮');
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
    | 'about'
  >('audio');

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
  const [appVersion, setAppVersion] = useState<string>('0.1.2');
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

  // Active Sessions State
  const [activeSessions, setActiveSessions] = useState<
    { socketId: string; ip: string; userAgent: string; connectedAt: string; isCurrent: boolean }[]
  >([]);
  const [sessionsNotice, setSessionsNotice] = useState<string | null>(null);

  React.useEffect(() => {
    if (activeTab !== 'security' || !socket || !isAuthenticated) return;
    socket.emit('get_active_sessions');
    const onSessions = (list: any[]) => setActiveSessions(list || []);
    const onRevokeRes = (res: { revokedCount: number }) => {
      setSessionsNotice(`Diğer ${res.revokedCount} oturum başarıyla kapatıldı.`);
      setTimeout(() => setSessionsNotice(null), 3500);
    };
    socket.on('active_sessions_list', onSessions);
    socket.on('revoke_sessions_result', onRevokeRes);
    return () => {
      socket.off('active_sessions_list', onSessions);
      socket.off('revoke_sessions_result', onRevokeRes);
    };
  }, [activeTab, socket, isAuthenticated]);

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
      alert('Kamera erişimi reddedildi veya kamera bulunamadı.');
    }
  };

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMsg(null);
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
        setUpdateStatusMsg(`Yeni sürüm bulundu: v${update.version}. Otomatik indiriliyor...`);
        await update.downloadAndInstall();
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
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
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
    updateProfile(username.trim(), avatar);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-5xl ios-glass rounded-none sm:rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border-0 sm:border border-white/10 h-[100dvh] sm:h-[660px] sm:max-h-[90vh]">
        {/* Left Settings Sidebar - TeamSpeak-style Categorized Panel */}
        <div className="w-full md:w-60 max-h-44 md:max-h-none bg-white/[0.02] p-3 md:p-4 flex flex-col justify-between shrink-0 border-b md:border-b-0 md:border-r border-white/[0.06] overflow-y-auto">
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-white/40 uppercase px-2 tracking-wider">
              Ayarlar
            </div>

            {/* USER SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase px-2 pb-1 tracking-wider">
                Kullanıcı
              </div>
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'profile'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <User className="w-4 h-4" />
                Hesap & Profil
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'security'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Lock className="w-4 h-4 text-amber-400" />
                Gizlilik & Güvenlik
              </button>
            </div>

            {/* APPLICATION SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase px-2 pb-1 tracking-wider">
                Uygulama
              </div>
              <button
                onClick={() => setActiveTab('appearance')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'appearance'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Palette className="w-4 h-4 text-purple-400" />
                Görünüm
              </button>
              <button
                onClick={() => setActiveTab('audio')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'audio'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
                Ses Aygıtları & Giriş
              </button>
              <button
                onClick={() => setActiveTab('voice_processing')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'voice_processing'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Gürültü & Filtreler
              </button>
              <button
                onClick={() => setActiveTab('video')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'video'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Video className="w-4 h-4 text-sky-400" />
                Video & Codec
              </button>
              <button
                onClick={() => setActiveTab('keybindings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'keybindings'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Keyboard className="w-4 h-4 text-indigo-400" />
                Kısayol Tuşları
              </button>
              <button
                onClick={() => setActiveTab('chats')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'chats'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-teal-400" />
                Sohbet & Fısıltı
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'notifications'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Bell className="w-4 h-4 text-pink-400" />
                Bildirimler
              </button>
            </div>

            {/* INFORMATION SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-white/30 uppercase px-2 pb-1 tracking-wider">
                Bilgi
              </div>
              <button
                onClick={() => setActiveTab('about')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'about'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Info className="w-4 h-4 text-slate-300" />
                Hakkında & Sürüm
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

          {/* TAB 3: Profilim */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Profilim</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Avatarınızı ve kullanıcı adınızı özelleştirin.
                </p>
              </div>

              {/* Profile Card Preview */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-4 shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl shadow overflow-hidden shrink-0">
                  <AvatarView avatar={avatar} alt={username} fallback="🎮" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">{username || 'Kullanıcı'}</div>
                  <div className="text-xs text-white/40">
                    Kullanıcı ID: {currentUser?.id?.slice(0, 8)}
                  </div>
                </div>
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                  Avatar Seç
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAvatar(opt)}
                      className={`w-10 h-10 rounded-2xl bg-white/5 hover:scale-105 transition flex items-center justify-center text-xl border ${
                        avatar === opt ? 'border-blue-400 bg-blue-500/20' : 'border-white/5'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Username Input */}
              <form onSubmit={handleSaveProfile} className="space-y-3">
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

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-full text-xs transition shadow-md shadow-blue-500/25 flex items-center gap-1.5"
                  >
                    {savedSuccess ? <Check className="w-4 h-4" /> : null}
                    {savedSuccess ? 'Kaydedildi' : 'Kaydet'}
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
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Smartphone className="w-4 h-4 text-sky-400" />
                    <span>Aktif Oturumlarım (Cihazlar)</span>
                  </div>
                  {isAuthenticated && activeSessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => socket?.emit('revoke_other_sessions')}
                      className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-xs font-semibold transition"
                    >
                      Diğer Tüm Oturumları Kapat
                    </button>
                  )}
                </div>

                {sessionsNotice && (
                  <div className="text-xs px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    {sessionsNotice}
                  </div>
                )}

                {!isAuthenticated ? (
                  <p className="text-xs text-white/50">Aktif oturumları görmek için giriş yapmalısınız.</p>
                ) : activeSessions.length === 0 ? (
                  <p className="text-xs text-white/50">Aktif oturum bilgisi yükleniyor...</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {activeSessions.map((sess) => (
                      <div
                        key={sess.socketId}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span className="font-mono">{sess.ip}</span>
                            {sess.isCurrent && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                Bu Cihaz
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/40 truncate mt-0.5">{sess.userAgent}</div>
                        </div>
                        <div className="text-[10px] text-white/40 shrink-0">
                          {new Date(sess.connectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Password Change */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Şifre Değiştir</span>
                </div>

                {!isAuthenticated ? (
                  <p className="text-xs text-white/50">
                    Şifre değiştirebilmek için kayıtlı bir hesapla giriş yapmış olmalısınız.
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setPasswordStatus(null);
                      if (newPasswordInput.length < 6) {
                        setPasswordStatus({ type: 'error', text: 'Yeni şifre en az 6 karakter olmalıdır.' });
                        return;
                      }
                      if (newPasswordInput !== confirmPasswordInput) {
                        setPasswordStatus({ type: 'error', text: 'Yeni şifreler eşleşmiyor.' });
                        return;
                      }
                      setIsChangingPassword(true);
                      const res = await changePassword(currentPasswordInput, newPasswordInput);
                      setIsChangingPassword(false);
                      if (res.success) {
                        setPasswordStatus({ type: 'success', text: res.message || 'Şifreniz başarıyla güncellendi.' });
                        setCurrentPasswordInput('');
                        setNewPasswordInput('');
                        setConfirmPasswordInput('');
                      } else {
                        setPasswordStatus({ type: 'error', text: res.error || 'Şifre güncellenemedi.' });
                      }
                    }}
                    className="space-y-2.5"
                  >
                    <input
                      type="password"
                      required
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Mevcut Şifre"
                      className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="password"
                        required
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        placeholder="Yeni Şifre (en az 6 karakter)"
                        className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <input
                        type="password"
                        required
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        placeholder="Yeni Şifre (Tekrar)"
                        className="w-full bg-black/30 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    {passwordStatus && (
                      <div
                        className={`text-xs px-3 py-2 rounded-xl border ${
                          passwordStatus.type === 'success'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-500/15 border-red-500/30 text-red-300'
                        }`}
                      >
                        {passwordStatus.text}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition disabled:opacity-50"
                    >
                      {isChangingPassword ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                    </button>
                  </form>
                )}
              </div>

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
                <h3 className="text-base font-semibold text-white tracking-tight">
                  Bildirimler & Masaüstü Uygulaması (PWA)
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  Masaüstü bildirimlerinizi açın ve uygulamayı yerel uygulama olarak bilgisayarınıza veya telefonunuza kurun.
                </p>
              </div>

              {/* In-Game Overlay & Game Detection Card */}
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

              {/* Push Notifications Card */}
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

              {/* PWA Standalone Install Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">PWA / Bağımsız Uygulama Olarak Yükle</div>
                    <div className="text-xs text-purple-200/70">
                      Chrome, Edge veya Safari'de adres çubuğundaki "Uygulamayı Yükle" ikonuna tıklayarak doğrudan masaüstü uygulaması yapabilirsiniz.
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme Presets & Chat Font Size */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-white/80 mb-2">Arayüz Teması</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'vision-dark', label: 'Vision Dark', dot: 'bg-slate-400' },
                      { id: 'midnight-blue', label: 'Midnight Blue', dot: 'bg-blue-400' },
                      { id: 'cyber-emerald', label: 'Cyber Emerald', dot: 'bg-emerald-400' },
                      { id: 'amber-gold', label: 'Amber Gold', dot: 'bg-amber-400' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setUiTheme(t.id as any)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                          uiTheme === t.id
                            ? 'bg-blue-500/20 border-blue-400 text-white shadow'
                            : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                        <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <div className="text-xs font-semibold text-white/80 mb-2">Sohbet Yazı Boyutu</div>
                  <div className="flex gap-2">
                    {[
                      { id: 'sm', label: 'Küçük (12px)' },
                      { id: 'base', label: 'Normal (14px)' },
                      { id: 'lg', label: 'Büyük (16px)' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setChatFontSize(s.id as any)}
                        className={`flex-1 py-1.5 px-3 rounded-xl border text-xs font-semibold transition ${
                          chatFontSize === s.id
                            ? 'bg-blue-500 text-white border-blue-400 shadow'
                            : 'bg-black/25 border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {s.label}
                      </button>
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

                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Radio className="w-4 h-4 text-teal-400" />
                    <span>Fısıltı (Whisper) İzinleri</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'everyone', label: 'Herkesten' },
                      { id: 'friends', label: 'Sadece Arkadaşlar' },
                      { id: 'disabled', label: 'Fısıltıyı Kapat' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateAdv({ whisperMode: opt.id as any })}
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
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-white">Çakma Masaüstü & Web İstemcisi</div>
                    <div className="text-xs text-white/50 mt-0.5">Sürüm: v{appVersion} • WebRTC Opus 48kHz HD</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualUpdateCheck}
                    disabled={isCheckingUpdate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-xs font-semibold text-white shadow transition"
                  >
                    <Download className="w-4 h-4" />
                    {isCheckingUpdate ? 'Kontrol Ediliyor...' : 'Güncellemeleri Denetle'}
                  </button>
                </div>

                {updateStatusMsg && (
                  <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-2.5 text-xs text-blue-200">
                    {updateStatusMsg}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs">
                  <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                    <div className="text-white/40 mb-1">Bağlı Sunucu</div>
                    <div className="font-mono text-white/90 truncate">{currentServerHost || 'ses.yahyakemalokutan.com'}</div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                    <div className="text-white/40 mb-1">Ses & Video Motoru</div>
                    <div className="font-mono text-emerald-400">WebRTC Mesh + Opus / {advSettings.preferredCodec.toUpperCase()}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
