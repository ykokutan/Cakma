import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../utils/i18n';

interface SessionInfo {
  socketId: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
  isCurrent: boolean;
}

export const ActiveSessionsCard: React.FC = () => {
  const { socket } = useSocket();
  const { isAuthenticated, revokeSingleSession, language } = useAuth();

  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [sessionsNotice, setSessionsNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    socket.emit('get_active_sessions');
    const onSessions = (list: SessionInfo[]) => setActiveSessions(list || []);
    const onRevokeRes = (res: { revokedCount: number }) => {
      setSessionsNotice(`Diğer ${res.revokedCount} oturum başarıyla kapatıldı.`);
      window.setTimeout(() => setSessionsNotice(null), 3500);
    };
    socket.on('active_sessions_list', onSessions);
    socket.on('revoke_sessions_result', onRevokeRes);
    return () => {
      socket.off('active_sessions_list', onSessions);
      socket.off('revoke_sessions_result', onRevokeRes);
    };
  }, [socket, isAuthenticated]);

  return (
    <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Smartphone className="w-4 h-4 text-sky-400" />
          <span>{t(language, 'activeSessionsTitle')}</span>
        </div>
        {isAuthenticated && activeSessions.length > 1 && (
          <button
            type="button"
            onClick={() => socket?.emit('revoke_other_sessions')}
            className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-xs font-semibold transition"
          >
            {t(language, 'endOtherSessionsBtn')}
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
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs"
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
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-white/40">
                  {new Date(sess.connectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {!sess.isCurrent && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await revokeSingleSession(sess.socketId);
                      if (!res.success && res.error) {
                        setSessionsNotice(res.error);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-[10px] font-bold transition"
                  >
                    {t(language, 'endSessionBtn')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
