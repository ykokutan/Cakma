import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
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
} from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const AVATAR_OPTIONS = ['🎮', '🚀', '🔥', '🎧', '⚡', '💻', '🐱', '🐺', '🦊', '👾', '🕹️', '🛡️'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const {
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
  } = useSocket();

  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '🎮');
  const [activeTab, setActiveTab] = useState<'audio' | 'voice_processing' | 'profile'>('audio');
  const [recordingKey, setRecordingKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    updateProfile(username.trim(), avatar);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="w-full max-w-3xl ios-glass rounded-3xl shadow-2xl flex overflow-hidden border border-white/10 h-[580px]">
        {/* Left Settings Sidebar - iOS Translucent Panel */}
        <div className="w-56 bg-white/[0.02] p-5 flex flex-col justify-between shrink-0 border-r border-white/[0.06]">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-white/40 uppercase px-2 mb-3 tracking-wider">
              Ayarlar
            </div>

            <button
              onClick={() => setActiveTab('audio')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-medium transition ${
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
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-medium transition ${
                activeTab === 'voice_processing'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Gürültü & Filtreler
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-medium transition ${
                activeTab === 'profile'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              Profilim
            </button>
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
        <div className="flex-1 p-8 flex flex-col justify-between overflow-y-auto relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition shadow"
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
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl shadow">
                  {avatar}
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
        </div>
      </div>
    </div>
  );
};
