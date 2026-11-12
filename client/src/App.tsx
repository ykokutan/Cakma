import React, { useState } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { ServerSidebar } from './components/ServerSidebar';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatArea } from './components/ChatArea';
import { MemberList } from './components/MemberList';
import { SettingsModal } from './components/SettingsModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { CreateServerModal } from './components/CreateServerModal';
import { AuthModal } from './components/AuthModal';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { LicenseStoreModal } from './components/LicenseStoreModal';
import { UserProfileModal } from './components/UserProfileModal';
import { DirectCallModal } from './components/DirectCallModal';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { ConnectionDiagnosticsModal } from './components/ConnectionDiagnosticsModal';
import { ExploreModal } from './components/ExploreModal';
import { DownloadAppModal } from './components/DownloadAppModal';
import { AutoUpdater } from './components/AutoUpdater';
import { User } from './types';
import { Megaphone, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const {
    systemAnnouncement,
    dismissAnnouncement,
    currentUser,
    activeServer,
    isAuthenticated,
    currentServerHost,
    isDedicatedServer,
    resetToMainServer,
    isDiagnosticsOpen,
    setIsDiagnosticsOpen,
  } = useSocket();
  const [showMembers, setShowMembers] = useState(true);
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
      <div className="flex h-screen w-screen overflow-hidden items-center justify-center bg-transparent">
        <AuthModal forced={true} onClose={() => {}} />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-transparent text-[#f5f5f7] antialiased selection:bg-blue-500 selection:text-white">
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
          isMobileNavOpen ? 'fixed inset-y-0 left-0 z-40 flex animate-fade-in' : 'hidden'
        } md:relative md:flex h-full shrink-0`}
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
      <ChatArea
        showMembers={showMembers}
        onToggleMembers={() => setShowMembers((prev) => !prev)}
        onOpenProfile={(user) => setSelectedProfileUser(user)}
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
      />

      {/* 4. Sağ Üye Listesi Sütunu */}
      {showMembers && (
        <div className="hidden lg:flex h-full shrink-0">
          <MemberList onOpenProfile={(user) => setSelectedProfileUser(user)} />
        </div>
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

      {isStoreOpen && (
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

      {createChannelModal.isOpen && (
        <CreateChannelModal
          initialType={createChannelModal.type}
          onClose={() =>
            setCreateChannelModal({ isOpen: false, type: 'text' })
          }
        />
      )}
    </div>
  );
};

export function App() {
  return (
    <SocketProvider>
      <MainLayout />
      <AutoUpdater />
    </SocketProvider>
  );
}

export default App;
