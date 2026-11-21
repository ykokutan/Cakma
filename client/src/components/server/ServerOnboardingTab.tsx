import React, { useState } from 'react';
import { Check, ShieldCheck, Sparkles, Tag } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { Server, ServerPermission } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';

interface ServerOnboardingTabProps {
  server: Server;
  canManageServer: boolean;
}

const PRIVILEGED_PERMS: ReadonlySet<ServerPermission> = new Set([
  'manage_server',
  'manage_roles',
  'manage_channels',
  'kick_members',
  'ban_members',
]);

export const ServerOnboardingTab: React.FC<ServerOnboardingTabProps> = ({
  server,
  canManageServer,
}) => {
  const { updateServerOnboarding, language } = useSocket();

  const [enabled, setEnabled] = useState<boolean>(Boolean(server.onboarding?.enabled));
  const [welcomePrompt, setWelcomePrompt] = useState<string>(
    server.onboarding?.welcomePrompt || ''
  );
  const [requireRulesAccept, setRequireRulesAccept] = useState<boolean>(
    Boolean(server.onboarding?.requireRulesAccept)
  );
  const [selfRoleIds, setSelfRoleIds] = useState<string[]>(
    server.onboarding?.selfAssignableRoleIds || []
  );

  const candidateRoles = (server.roles || []).filter(
    (r) =>
      !r.isDefault &&
      r.id !== 'role-owner' &&
      !r.permissions.some((p) => PRIVILEGED_PERMS.has(p))
  );

  const toggleRoleCandidate = (roleId: string) => {
    setSelfRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageServer) return;
    updateServerOnboarding(server.id, {
      enabled,
      welcomePrompt: welcomePrompt.trim(),
      requireRulesAccept,
      selfAssignableRoleIds: selfRoleIds,
    });
    appToast('Onboarding ve seçilebilir rol ayarları kaydedildi.', 'success');
  };

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-1 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span>{t(language, 'serverOnboarding')}</span>
        </h2>
        <p className="text-xs text-white/50">
          Yeni veya mevcut üyelerin kuralları onaylayıp ilgi alanı rollerini kendilerinin seçmesini sağlayın.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-white">Onboarding Ekranını Etkinleştir</div>
          <div className="text-[11px] text-white/50">
            Üyeler kanal listesi üstünden karşılama ve rol seçim penceresine erişebilir.
          </div>
        </div>
        <button
          type="button"
          disabled={!canManageServer}
          onClick={() => setEnabled((v) => !v)}
          className={`w-11 h-6 rounded-full transition relative shrink-0 ${
            enabled ? 'bg-indigo-500' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <label className="block text-[11px] font-semibold text-white/50 uppercase">
          Karşılama Metni / Yönerge
        </label>
        <textarea
          rows={3}
          disabled={!canManageServer}
          value={welcomePrompt}
          onChange={(e) => setWelcomePrompt(e.target.value)}
          placeholder="Örn: Topluluğumuza hoş geldin! Aşağıdan kuralları kabul edip ilgi alanı rollerini seçebilirsin."
          className="w-full p-3 rounded-xl bg-black/35 border border-white/10 text-xs text-white outline-none focus:border-indigo-400 resize-none"
        />

        <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            disabled={!canManageServer}
            checked={requireRulesAccept}
            onChange={(e) => setRequireRulesAccept(e.target.checked)}
            className="w-4 h-4 rounded text-indigo-500 bg-black/40 border-white/20"
          />
          <span className="text-xs text-white/85 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Kayıt tamamlamadan önce kural onayı iste ({t(language, 'acceptRules')})</span>
          </span>
        </label>
      </div>

      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Tag className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t(language, 'selfRoles')}</span>
        </div>
        <p className="text-[11px] text-white/45">
          Güvenlik nedeniyle yalnızca yönetici yetkisi olmayan roller üyelerin kendi seçimine açılabilir.
        </p>

        {candidateRoles.length === 0 ? (
          <div className="text-xs text-white/40 py-3">
            Seçilebilir güvenli rol bulunamadı. &quot;Roller &amp; Yetkiler&quot; sekmesinden yeni bir üye rolü oluşturun.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {candidateRoles.map((role) => {
              const selected = selfRoleIds.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  disabled={!canManageServer}
                  onClick={() => toggleRoleCandidate(role.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                    selected
                      ? 'bg-indigo-500/25 border-indigo-400 text-white'
                      : 'bg-black/30 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: role.color || '#6366f1' }}
                  />
                  <span>{role.name}</span>
                  {selected && <Check className="w-3 h-3 text-indigo-300" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {canManageServer && (
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition"
        >
          Onboarding Ayarlarını Kaydet
        </button>
      )}
    </form>
  );
};
