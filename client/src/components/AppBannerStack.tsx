import React from 'react';
import { Megaphone, X } from 'lucide-react';

interface AppBannerStackProps {
  isDedicatedServer: boolean;
  currentServerHost: string;
  onResetToMainServer: () => void;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  maintenanceStatus?: { active: boolean; message?: string } | null;
  pinnedBanner?: { sender: string; message: string } | null;
  systemAnnouncement?: { sender: string; message: string; timestamp: string } | null;
  onDismissAnnouncement: () => void;
  newIpAlert?: { ip: string } | null;
  onDismissNewIpAlert: () => void;
}

export const AppBannerStack: React.FC<AppBannerStackProps> = ({
  isDedicatedServer,
  currentServerHost,
  onResetToMainServer,
  connectionState,
  maintenanceStatus,
  pinnedBanner,
  systemAnnouncement,
  onDismissAnnouncement,
  newIpAlert,
  onDismissNewIpAlert,
}) => {
  const hasAny =
    isDedicatedServer ||
    connectionState !== 'connected' ||
    Boolean(maintenanceStatus?.active) ||
    Boolean(pinnedBanner && !systemAnnouncement) ||
    Boolean(systemAnnouncement) ||
    Boolean(newIpAlert);

  if (!hasAny) return null;

  return (
    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-3 flex flex-col items-center gap-1.5 pointer-events-none">
      {isDedicatedServer && (
        <div className="pointer-events-auto animate-fade-in">
          <div className="ios-glass px-4 py-1.5 rounded-full border border-amber-500/40 bg-black/60 text-xs flex items-center gap-3 shadow-2xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 text-[11px]">
              Bağlı Özel Sunucu: <b className="text-amber-300 font-mono">{currentServerHost}</b>
            </span>
            <button
              type="button"
              onClick={onResetToMainServer}
              className="px-2.5 py-0.5 rounded-full bg-amber-500 text-black font-bold text-[10px] hover:bg-amber-400 transition shadow-sm"
            >
              Ana Sunucuya Dön (Port 4000)
            </button>
          </div>
        </div>
      )}

      {connectionState !== 'connected' && (
        <div
          role="status"
          className="pointer-events-auto px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 backdrop-blur-xl text-amber-200 text-xs font-semibold flex items-center gap-2 shadow-xl animate-fade-in"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>
            {connectionState === 'reconnecting'
              ? 'Bağlantı koptu, yeniden bağlanılıyor... (Mesajlarınız sıraya alınıyor)'
              : 'Sunucu bağlantısı kesildi.'}
          </span>
        </div>
      )}

      {maintenanceStatus?.active && !systemAnnouncement && (
        <div className="w-full pointer-events-auto px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-100 text-xs font-semibold flex items-center justify-between gap-3 backdrop-blur-xl shadow-lg animate-fade-in">
          <span>🛠️ Bakım Modu Aktif: {maintenanceStatus.message}</span>
        </div>
      )}

      {pinnedBanner && !systemAnnouncement && (
        <div className="w-full pointer-events-auto px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-100 text-xs font-semibold flex items-center justify-between gap-3 backdrop-blur-xl shadow-lg animate-fade-in">
          <span>📌 Sabit Duyuru ({pinnedBanner.sender}): {pinnedBanner.message}</span>
        </div>
      )}

      {systemAnnouncement && (
        <div className="w-full pointer-events-auto ios-glass p-3 rounded-2xl border border-amber-500/40 bg-amber-500/20 text-white flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
              <Megaphone className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                Sistem Duyurusu ({systemAnnouncement.sender}) · {systemAnnouncement.timestamp}
              </div>
              <div className="text-xs font-semibold text-white/90 truncate">
                {systemAnnouncement.message}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissAnnouncement}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition shrink-0"
            title="Kapat"
            aria-label="Sistem duyurusunu kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {newIpAlert && (
        <div className="w-full pointer-events-auto ios-glass p-3 rounded-2xl border border-rose-500/40 bg-rose-950/90 text-white flex items-center justify-between gap-3 shadow-2xl animate-fade-in">
          <div className="text-xs leading-relaxed">
            <div className="font-bold text-rose-300">⚠️ Yeni IP Adresinden Giriş Algılandı</div>
            <div className="text-white/85">
              Hesabınıza yeni bir IP adresinden (<span className="font-mono font-semibold">{newIpAlert.ip}</span>) giriş yapıldı. Siz değilseniz şifrenizi değiştirin.
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissNewIpAlert}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white shrink-0"
            title="Kapat"
            aria-label="IP uyarısını kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
