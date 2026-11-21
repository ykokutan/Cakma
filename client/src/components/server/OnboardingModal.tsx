import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ShieldCheck, Sparkles, Tag, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { Server } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';
import { isSameUser } from '../../utils/serverIdentity';

interface OnboardingModalProps {
  server: Server;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ server, onClose }) => {
  const { currentUser, acceptServerOnboarding, toggleSelfRole, language } = useSocket();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);

  const myMember = useMemo(
    () =>
      (server.members || []).find((m) =>
        isSameUser({ id: m.userId, username: m.username }, currentUser)
      ),
    [server.members, currentUser]
  );

  const selfRoles = useMemo(() => {
    const allowedIds = new Set(server.onboarding?.selfAssignableRoleIds || []);
    return (server.roles || []).filter((r) => allowedIds.has(r.id));
  }, [server.roles, server.onboarding?.selfAssignableRoleIds]);

  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(() =>
    (myMember?.roleIds || []).filter((id) =>
      (server.onboarding?.selfAssignableRoleIds || []).includes(id)
    )
  );
  const [rulesChecked, setRulesChecked] = useState<boolean>(
    Boolean(myMember?.rulesAcceptedAt) || !server.onboarding?.requireRulesAccept
  );

  const toggleChoice = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleConfirm = () => {
    if (server.onboarding?.requireRulesAccept && !rulesChecked) {
      appToast('Devam etmek için sunucu kurallarını onaylayın.', 'warning');
      return;
    }
    acceptServerOnboarding(server.id, selectedRoleIds);
    appToast('Tercihleriniz ve rolleriniz güncellendi!', 'success');
    onClose();
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1050] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${server.name} ${t(language, 'serverOnboarding')}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#12131a]/95 border border-white/15 rounded-3xl shadow-2xl overflow-hidden text-white animate-scale-up"
      >
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-500/15 to-purple-500/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">{server.name} — {t(language, 'serverOnboarding')}</h3>
              <p className="text-[11px] text-white/50">Karşılama &amp; Seçilebilir Roller</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {server.onboarding?.welcomePrompt && (
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-white/85 whitespace-pre-wrap leading-relaxed">
              {server.onboarding.welcomePrompt}
            </div>
          )}

          {server.description && !server.onboarding?.welcomePrompt && (
            <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                Sunucu Hakkında
              </div>
              <p className="text-xs text-white/75 whitespace-pre-wrap leading-relaxed">
                {server.description}
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t(language, 'selfRoles')}</span>
              </span>
              {myMember?.rulesAcceptedAt && (
                <span className="text-[10px] text-emerald-300 font-semibold">
                  Kurallar onaylı ✓
                </span>
              )}
            </div>

            {selfRoles.length === 0 ? (
              <div className="text-xs text-white/45 py-3">
                Bu sunucu için seçilebilir rol tanımlanmamış.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selfRoles.map((role) => {
                  const chosen = selectedRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => {
                        toggleChoice(role.id);
                        if (myMember?.rulesAcceptedAt || !server.onboarding?.requireRulesAccept) {
                          toggleSelfRole(server.id, role.id);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                        chosen
                          ? 'bg-indigo-500/25 border-indigo-400 text-white shadow'
                          : 'bg-black/30 border-white/10 text-white/65 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: role.color || '#6366f1' }}
                      />
                      <span>{role.name}</span>
                      {chosen && <Check className="w-3 h-3 text-indigo-300" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {server.onboarding?.requireRulesAccept && (
            <label className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rulesChecked}
                onChange={(e) => setRulesChecked(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 bg-black/40 border-white/20"
              />
              <span className="text-xs font-semibold text-emerald-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Sunucu kurallarını okudum ve kabul ediyorum</span>
              </span>
            </label>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white/80 transition"
          >
            Kapat
          </button>
          <button
            type="button"
            disabled={Boolean(server.onboarding?.requireRulesAccept && !rulesChecked)}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition"
          >
            {t(language, 'acceptRules')} &amp; Kaydet
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
