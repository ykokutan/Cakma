import React from 'react';
import { Download } from 'lucide-react';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENTS_VERSION,
  LEGAL_LAST_UPDATED,
  type LegalDocumentId,
} from '../../data/legalDocuments';
import { ChangelogTab } from './ChangelogTab';

interface SettingsAboutTabProps {
  appVersion: string;
  isCheckingUpdate: boolean;
  onCheckUpdate: () => void;
  updateStatusMsg: string | null;
  updateProgress: { percent: number; downloadedMb: string; totalMb: string } | null;
  currentServerHost: string;
  preferredCodec: string;
  onOpenLegalDoc: (docId: LegalDocumentId) => void;
}

export const SettingsAboutTab: React.FC<SettingsAboutTabProps> = ({
  appVersion,
  isCheckingUpdate,
  onCheckUpdate,
  updateStatusMsg,
  updateProgress,
  currentServerHost,
  preferredCodec,
  onOpenLegalDoc,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white tracking-tight">Hakkında &amp; Güncelleme</h3>
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
            onClick={onCheckUpdate}
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
            <div className="text-white/40 mb-1">Ses &amp; Video Motoru</div>
            <div className="font-mono text-emerald-400">WebRTC + LiveKit SFU / {preferredCodec.toUpperCase()}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-white">Yasal Sayfalar &amp; Kullanıcı Sözleşmesi</div>
            <div className="text-[11px] text-white/45 mt-0.5">
              Sürüm v{LEGAL_DOCUMENTS_VERSION} · Son güncelleme: {LEGAL_LAST_UPDATED}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {LEGAL_DOCUMENTS.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onOpenLegalDoc(doc.id)}
              className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 hover:border-rose-400/35 text-left transition group"
            >
              <div className="text-xs font-bold text-white group-hover:text-rose-200 transition">
                {doc.shortTitle}
              </div>
              <div className="text-[10px] text-white/45 mt-0.5 line-clamp-2">
                {doc.subtitle}
              </div>
            </button>
          ))}
        </div>
      </div>

      <ChangelogTab appVersion={appVersion} />
    </div>
  );
};
