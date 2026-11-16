import React, { Suspense, lazy, useState, useEffect } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { ServerSidebar } from './components/ServerSidebar';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatArea } from './components/ChatArea';
import { MemberList } from './components/MemberList';
import { CreateChannelModal } from './components/CreateChannelModal';
import { CreateServerModal } from './components/CreateServerModal';
import { AuthModal } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { DirectCallModal } from './components/DirectCallModal';
import { DownloadAppModal } from './components/DownloadAppModal';
import { AutoUpdater } from './components/AutoUpdater';
import { SpeakersOverlay } from './components/SpeakersOverlay';
import { QuickSwitcherModal } from './components/QuickSwitcherModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';

const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const AdminDashboardModal = lazy(() => import('./components/AdminDashboardModal').then((m) => ({ default: m.AdminDashboardModal })));
const LicenseStoreModal = lazy(() => import('./components/LicenseStoreModal').then((m) => ({ default: m.LicenseStoreModal })));
const ServerSettingsModal = lazy(() => import('./components/ServerSettingsModal').then((m) => ({ default: m.ServerSettingsModal })));
const ConnectionDiagnosticsModal = lazy(() => import('./components/ConnectionDiagnosticsModal').then((m) => ({ default: m.ConnectionDiagnosticsModal })));
const ExploreModal = lazy(() => import('./components/ExploreModal').then((m) => ({ default: m.ExploreModal })));
import { User } from './types';
import { Megaphone, X, Volume2, Check } from 'lucide-react';

const MainLayout: React.FC = () => {
  const {
    systemAnnouncement,
    pinnedBanner,
    maintenanceStatus,
    storeSettings,
    dismissAnnouncement,
    voicePullInvite,
    voicePullNotice,
    respondVoicePullInvite,
    dismissVoicePullNotice,
    currentUser,
    activeServer,
    isAuthenticated,
    currentServerHost,
    isDedicatedServer,
    resetToMainServer,
    isDiagnosticsOpen,
    setIsDiagnosticsOpen,
    toggleMute,
    toggleDeafen,
  } = useSocket();
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === 'k') {
        e.preventDefault();
        setIsQuickSwitcherOpen((prev) => !prev);
        return;
      }

      if (key === '/' || key === '?') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;

      if (key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (key === 'd') {
        e.preventDefault();
        toggleDeafen();
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [toggleMute, toggleDeafen]);
  const [showMembers, setShowMembers] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);
  const [createChannelModal, setCreateChannelModal] = useState<{
    isOpen: boolean;
    type: 'text' | 'voice';
  }>({ isOpen: false, type: 'text' });

  // Mandatory Authentication Wall: Kayıt / Giriş yapılmadan platform açılamaz
  if (!isAuthenticated) {
    return (
      <div className="flex h-[100dvh] w-full overflow-hidden items-center justify-center bg-transparent">
        <AuthModal forced={true} onClose={() => {}} />
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-transparent text-[#f5f5f7] antialiased selection:bg-blue-500 selection:text-white md:p-2.5 md:gap-2.5">
      {/* Dedicated Server Banner Indicator */}
      {isDedicatedServer && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 animate-fade-in pointer-events-auto">
          <div className="ios-glass px-4 py-1.5 rounded-full border border-amber-500/40 bg-black/60 text-xs flex items-center gap-3 backdrop-blur-xl shadow-2xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 text-[11px]">
              Bağlı Özel Sunucu: <b className="text-amber-300 font-mono">{currentServerHost}</b>
            </span>
            <button
              onClick={resetToMainServer}
              className="px-2.5 py-0.5 rounded-full bg-amber-500 text-black font-bold text-[10px] hover:bg-amber-400 transition shadow-sm"
            >
              Ana Sunucuya Dön (Port 4000)
            </button>
          </div>
        </div>
      )}

      {/* Real-time Maintenance & Pinned System Banner */}
      {(maintenanceStatus?.active || pinnedBanner) && !systemAnnouncement && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-full px-4 pointer-events-none">
          <div className="space-y-1.5 pointer-events-auto">
            {maintenanceStatus?.active && (
              <div className="px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-100 text-xs font-semibold flex items-center justify-between gap-3 backdrop-blur-xl shadow-lg">
                <span>🛠️ Bakım Modu Aktif: {maintenanceStatus.message}</span>
              </div>
            )}
            {pinnedBanner && (
              <div className="px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-100 text-xs font-semibold flex items-center justify-between gap-3 backdrop-blur-xl shadow-lg">
                <span>📌 Sabit Duyuru ({pinnedBanner.sender}): {pinnedBanner.message}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Real-time System Announcement Banner */}
      {systemAnnouncement && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-full px-4 animate-fade-in">
          <div className="ios-glass p-3 rounded-2xl border border-amber-500/40 bg-amber-500/20 text-white flex items-center justify-between shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/30 flex items-center justify-center text-amber-300">
                <Megaphone className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  Sistem Duyurusu ({systemAnnouncement.sender}) · {systemAnnouncement.timestamp}
                </div>
                <div className="text-xs font-semibold text-white/90">
                  {systemAnnouncement.message}
                </div>
              </div>
            </div>
            <button
              onClick={dismissAnnouncement}
              className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Voice Pull Permission Invite Notification (for users not currently in voice) */}
      {voicePullInvite && (
        <div className="fixed top-5 right-5 z-[110] max-w-sm w-full animate-fade-in">
          <div className="ios-glass p-4 rounded-2xl border border-indigo-400/40 bg-slate-900/90 text-white shadow-2xl backdrop-blur-xl space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/25 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                <Volume2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                  Ses Odasına Çekilme İsteği
                </div>
                <div className="text-xs text-white/90 mt-0.5 leading-relaxed">
                  <strong className="text-white">{voicePullInvite.fromUsername}</strong> sizi{' '}
                  <strong className="text-indigo-300">#{voicePullInvite.channelName}</strong> ses odasına çekmek istiyor.
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => respondVoicePullInvite(voicePullInvite.requestId, false)}
                className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Reddet
              </button>
              <button
                type="button"
                onClick={() => respondVoicePullInvite(voicePullInvite.requestId, true)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Katıl
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Pull Status Notification (for requester: sent / accepted / rejected) */}
      {voicePullNotice && (
        <div className="fixed bottom-5 right-5 z-[110] max-w-sm w-full animate-fade-in">
          <div
            className={`ios-glass px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 text-xs font-medium ${
              voicePullNotice.status === 'rejected'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : voicePullNotice.status === 'accepted'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-slate-900/90 border-indigo-400/40 text-indigo-100'
            }`}
          >
            <span>{voicePullNotice.message}</span>
            <button
              type="button"
              onClick={dismissVoicePullNotice}
              className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition shrink-0"
              title="Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Navigation Backdrop */}
      {isMobileNavOpen && (
        <div
          onClick={() => setIsMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
        />
      )}

      {/* 1 & 2. Sol Sunucular & Kanallar Sütunu (Responsive Drawer) */}
      <div
        className={`${
          isMobileNavOpen ? 'fixed inset-y-0 left-0 z-40 flex max-w-[92vw] animate-fade-in' : 'hidden'
        } md:relative md:flex md:gap-2 h-full shrink-0`}
      >
        <ServerSidebar
          onOpenCreateServer={() => { setIsCreateServerOpen(true); setIsMobileNavOpen(false); }}
          onOpenExplore={() => { setIsExploreOpen(true); setIsMobileNavOpen(false); }}
          onOpenDownload={() => { setIsDownloadOpen(true); setIsMobileNavOpen(false); }}
        />

        <ChannelSidebar
          onOpenCreateChannel={(type) => {
            setCreateChannelModal({ isOpen: true, type });
            setIsMobileNavOpen(false);
          }}
          onOpenSettings={() => { setIsSettingsOpen(true); setIsMobileNavOpen(false); }}
          onOpenServerSettings={() => { setIsServerSettingsOpen(true); setIsMobileNavOpen(false); }}
          onOpenAuth={() => { setIsAuthOpen(true); setIsMobileNavOpen(false); }}
          onOpenAdminDashboard={() => { setIsAdminDashboardOpen(true); setIsMobileNavOpen(false); }}
          onOpenStore={() => { setIsStoreOpen(true); setIsMobileNavOpen(false); }}
          onOpenProfile={(user) => { setSelectedProfileUser(user); setIsMobileNavOpen(false); }}
        />
      </div>

      {/* 3. Ana Mesajlaşma / Ses Odası Alanı */}
      <div className="flex-1 min-w-0 h-full flex overflow-hidden md:rounded-2xl md:border md:border-white/[0.08] md:bg-[#0d0f16]/60 md:backdrop-blur-2xl md:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65)]">
        <ChatArea
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers((prev) => !prev)}
          onOpenProfile={(user) => setSelectedProfileUser(user)}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
        />
      </div>

      {/* 4. Sağ Üye Listesi Sütunu (Mobilde çekmece, masaüstünde sabit) */}
      {showMembers && (
        <>
          <div
            onClick={() => setShowMembers(false)}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          />
          <div className="fixed inset-y-0 right-0 z-40 lg:relative lg:z-auto flex h-full shrink-0 animate-fade-in">
            <MemberList
              onOpenProfile={(user) => {
                setSelectedProfileUser(user);
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setShowMembers(false);
                }
              }}
            />
          </div>
        </>
      )}

      {/* 1-on-1 Direct Voice Calling Floating Widget */}
      <DirectCallModal />

      {/* User Profile Modal */}
      {selectedProfileUser && (
        <UserProfileModal
          user={selectedProfileUser}
          onClose={() => setSelectedProfileUser(null)}
        />
      )}

      {/* Network & Voice Connection Diagnostics Modal */}
      <Suspense fallback={null}>
        <ConnectionDiagnosticsModal
          isOpen={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
        />

        {/* Modallar */}
        {isSettingsOpen && (
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        )}

        {isAuthOpen && (
          <AuthModal onClose={() => setIsAuthOpen(false)} />
        )}

        {isAdminDashboardOpen && currentUser?.role === 'admin' && (
          <AdminDashboardModal onClose={() => setIsAdminDashboardOpen(false)} />
        )}

        {isStoreOpen && (storeSettings?.isOpen ?? true) && (
          <LicenseStoreModal onClose={() => setIsStoreOpen(false)} />
        )}

        <ExploreModal
          isOpen={isExploreOpen}
          onClose={() => setIsExploreOpen(false)}
        />

        <DownloadAppModal
          isOpen={isDownloadOpen}
          onClose={() => setIsDownloadOpen(false)}
        />

        {isCreateServerOpen && (
          <CreateServerModal onClose={() => setIsCreateServerOpen(false)} />
        )}

        {isServerSettingsOpen && activeServer && (
          <ServerSettingsModal
            server={activeServer}
            onClose={() => setIsServerSettingsOpen(false)}
          />
        )}
      </Suspense>

      {createChannelModal.isOpen && (
        <CreateChannelModal
          initialType={createChannelModal.type}
          onClose={() =>
            setCreateChannelModal({ isOpen: false, type: 'text' })
          }
        />
      )}

      <QuickSwitcherModal
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};

export function App() {
  if (typeof window !== 'undefined' && window.location.search.includes('overlay=1')) {
    return <SpeakersOverlay />;
  }

  return (
    <SocketProvider>
      <MainLayout />
      <AutoUpdater />
    </SocketProvider>
  );
}

export default App;
