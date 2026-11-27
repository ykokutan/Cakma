import React from 'react';
import { X, Sparkles, Lock, Link2, HelpCircle, CheckCircle2, Users } from 'lucide-react';
import type { ClientConversationDigest } from '../../utils/clientSummarizer';

interface ChannelSummaryCardProps {
  digest: ClientConversationDigest;
  isE2eeLocalOnly?: boolean;
  loading?: boolean;
  onClose: () => void;
}

export const ChannelSummaryCard: React.FC<ChannelSummaryCardProps> = ({
  digest,
  isE2eeLocalOnly = false,
  loading = false,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl ios-glass rounded-3xl border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-500/15 via-cyan-500/10 to-transparent">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/35 flex items-center justify-center text-indigo-300 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Ben Yokken Ne Oldu?</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-cyan-200 font-semibold uppercase">
                  {digest.mode === 'builtin' ? 'Yerleşik Motor' : digest.mode.toUpperCase()}
                </span>
              </h3>
              <p className="text-[11px] text-white/55 truncate">{digest.headline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/75 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4">
          {isE2eeLocalOnly && (
            <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-[11px] text-emerald-200 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Uçtan uca şifreli sohbet gizliliği nedeniyle özet tamamen cihazınızda yerel olarak üretildi.</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-xs text-white/60">Mesajlar analiz ediliyor...</div>
          ) : (
            <>
              {digest.highlights.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                    Öne Çıkan Konular
                  </div>
                  <div className="space-y-1.5">
                    {digest.highlights.map((h, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white/85"
                      >
                        <strong className="text-cyan-300">{h.author}:</strong> {h.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {digest.decisionsAndQuestions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Kararlar &amp; Açık Sorular
                  </div>
                  <div className="space-y-1.5">
                    {digest.decisionsAndQuestions.map((dq, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white/85 flex items-start gap-2"
                      >
                        {dq.kind === 'decision' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <strong className="text-white">{dq.author}:</strong> {dq.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {digest.sharedLinks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Paylaşılan Bağlantılar ({digest.sharedLinks.length})</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {digest.sharedLinks.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-300 hover:underline truncate px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10"
                      >
                        {url}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {digest.participants.length > 0 && (
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-white/50 flex items-center gap-1 mr-1">
                    <Users className="w-3.5 h-3.5" /> Katılımcılar:
                  </span>
                  {digest.participants.map((p) => (
                    <span
                      key={p.username}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/80"
                    >
                      {p.username} ({p.count})
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
