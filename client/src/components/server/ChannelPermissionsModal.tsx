import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock, Minus, Plus, Shield, Trash2, Users, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { Channel, ChannelOverridePerm, ChannelPermissionOverride, Server } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';
import { isUserServerOwner } from '../../utils/serverIdentity';

interface ChannelPermissionsModalProps {
  server: Server;
  channel: Channel;
  onClose: () => void;
}

const PERM_LABELS: Array<{ perm: ChannelOverridePerm; label: string; desc: string }> = [
  { perm: 'view_channel', label: 'Kanalı Görüntüle', desc: 'Üyenin kanalı listede görmesine izin ver' },
  { perm: 'send_messages', label: 'Mesaj Gönder', desc: 'Metin ve duyuru kanallarına mesaj yazma' },
  { perm: 'attach_files', label: 'Dosya & Medya Ekle', desc: 'Görsel, video, ses ve dosya yükleme' },
  { perm: 'connect_voice', label: 'Ses / Tribüne Bağlan', desc: 'Sesli veya tribün odasına katılma' },
  { perm: 'speak_voice', label: 'Konuş / Yayın Aç', desc: 'Mikrofon açma ve söz isteme' },
];

function cloneOverrides(raw: ChannelPermissionOverride[] | undefined): ChannelPermissionOverride[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => ({
    targetType: o.targetType,
    targetId: o.targetId,
    allow: [...(o.allow || [])],
    deny: [...(o.deny || [])],
  }));
}

export const ChannelPermissionsModal: React.FC<ChannelPermissionsModalProps> = ({
  server,
  channel,
  onClose,
}) => {
  const { updateChannelPermissions, language } = useSocket();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);

  const [isPrivate, setIsPrivate] = useState<boolean>(Boolean(channel.isPrivate));
  const [overrides, setOverrides] = useState<ChannelPermissionOverride[]>(() =>
    cloneOverrides(channel.permissionOverrides)
  );
  const [addKind, setAddKind] = useState<'role' | 'user'>('role');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedUsername, setSelectedUsername] = useState<string>('');

  const availableRoles = useMemo(
    () =>
      (server.roles || []).filter(
        (r) =>
          r.id !== 'role-owner' &&
          !overrides.some((o) => o.targetType === 'role' && o.targetId === r.id)
      ),
    [server.roles, overrides]
  );

  const availableMembers = useMemo(
    () =>
      (server.members || [])
        .filter((m) => !m.isOwner && !isUserServerOwner({ id: m.userId, username: m.username }, server))
        .filter(
          (m) =>
            !overrides.some(
              (o) => o.targetType === 'user' && o.targetId.toLowerCase() === m.username.toLowerCase()
            )
        )
        .sort((a, b) => a.username.localeCompare(b.username)),
    [server, overrides]
  );

  const handleAddOverride = () => {
    const targetId = addKind === 'role' ? selectedRoleId : selectedUsername;
    if (!targetId.trim()) return;
    setOverrides((prev) => {
      if (
        prev.some(
          (o) =>
            o.targetType === addKind &&
            o.targetId.toLowerCase() === targetId.trim().toLowerCase()
        )
      ) {
        return prev;
      }
      return [
        ...prev,
        {
          targetType: addKind,
          targetId: targetId.trim(),
          allow: isPrivate ? ['view_channel'] : [],
          deny: [],
        },
      ];
    });
    if (addKind === 'role') setSelectedRoleId('');
    else setSelectedUsername('');
  };

  const setPermState = (
    idx: number,
    perm: ChannelOverridePerm,
    state: 'allow' | 'neutral' | 'deny'
  ) => {
    setOverrides((prev) =>
      prev.map((ov, i) => {
        if (i !== idx) return ov;
        const allow = ov.allow.filter((p) => p !== perm);
        const deny = ov.deny.filter((p) => p !== perm);
        if (state === 'allow') allow.push(perm);
        if (state === 'deny') deny.push(perm);
        return { ...ov, allow, deny };
      })
    );
  };

  const handleRemoveOverride = (idx: number) => {
    setOverrides((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const cleaned = overrides.filter((o) => o.allow.length > 0 || o.deny.length > 0);
    updateChannelPermissions(server.id, channel.id, isPrivate, cleaned);
    appToast(`#${channel.name} izinleri kaydedildi.`, 'success');
    onClose();
  };

  const resolveTargetLabel = (ov: ChannelPermissionOverride): { name: string; color?: string } => {
    if (ov.targetType === 'role') {
      const role = (server.roles || []).find((r) => r.id === ov.targetId);
      return { name: role ? `@${role.name}` : ov.targetId, color: role?.color };
    }
    return { name: `@${ov.targetId}` };
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
        aria-label={`${channel.name} ${t(language, 'channelPermissions')}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[86vh] bg-[#12131a]/95 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white animate-scale-up"
      >
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                #{channel.name} — {t(language, 'channelPermissions')}
              </h3>
              <p className="text-[11px] text-white/45 truncate">{server.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Private Channel Toggle */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t(language, 'privateChannel')}</div>
                <div className="text-[11px] text-white/50">
                  Etkinleştirildiğinde yalnızca yöneticiler ve aşağıda izin verilen rol/üyeler bu kanalı görebilir.
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPrivate}
              onClick={() => setIsPrivate((v) => !v)}
              className={`w-11 h-6 rounded-full transition relative shrink-0 ${
                isPrivate ? 'bg-amber-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isPrivate ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Add Role / User Override */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">{t(language, 'permissionOverrides')}</span>
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setAddKind('role')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                    addKind === 'role' ? 'bg-indigo-500 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Shield className="w-3 h-3" /> Rol Ekle
                </button>
                <button
                  type="button"
                  onClick={() => setAddKind('user')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                    addKind === 'user' ? 'bg-indigo-500 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Users className="w-3 h-3" /> Üye Ekle
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {addKind === 'role' ? (
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/15 text-white text-xs rounded-xl px-3 py-2 outline-none"
                >
                  <option value="" className="bg-neutral-900">
                    Bir rol seçin...
                  </option>
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id} className="bg-neutral-900">
                      @{r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedUsername}
                  onChange={(e) => setSelectedUsername(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/15 text-white text-xs rounded-xl px-3 py-2 outline-none"
                >
                  <option value="" className="bg-neutral-900">
                    Bir üye seçin...
                  </option>
                  {availableMembers.map((m) => (
                    <option key={m.username} value={m.username} className="bg-neutral-900">
                      @{m.username}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={addKind === 'role' ? !selectedRoleId : !selectedUsername}
                onClick={handleAddOverride}
                className="px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Ekle
              </button>
            </div>
          </div>

          {/* Override List */}
          {overrides.length === 0 ? (
            <div className="text-center py-6 text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
              Henüz rol veya üye geçersiz kılması eklenmedi. Varsayılan sunucu rol izinleri geçerli.
            </div>
          ) : (
            <div className="space-y-3">
              {overrides.map((ov, idx) => {
                const target = resolveTargetLabel(ov);
                return (
                  <div
                    key={`${ov.targetType}:${ov.targetId}`}
                    className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-white/70">
                          {ov.targetType === 'role' ? 'Rol' : 'Üye'}
                        </span>
                        <span
                          className="text-xs font-bold"
                          style={target.color ? { color: target.color } : undefined}
                        >
                          {target.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveOverride(idx)}
                        className="p-1.5 rounded-lg text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/20 transition"
                        title="Geçersiz kılmayı kaldır"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {PERM_LABELS.map((item) => {
                        const state: 'allow' | 'neutral' | 'deny' = ov.allow.includes(item.perm)
                          ? 'allow'
                          : ov.deny.includes(item.perm)
                          ? 'deny'
                          : 'neutral';
                        return (
                          <div
                            key={item.perm}
                            className="flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-xl bg-white/[0.03]"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-white">{item.label}</div>
                              <div className="text-[10px] text-white/40 truncate">{item.desc}</div>
                            </div>
                            <div className="flex items-center rounded-xl bg-black/50 border border-white/10 p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPermState(idx, item.perm, 'deny')}
                                title="Reddet"
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                  state === 'deny'
                                    ? 'bg-rose-500 text-white'
                                    : 'text-white/40 hover:text-rose-300'
                                }`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPermState(idx, item.perm, 'neutral')}
                                title="Varsayılan"
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                  state === 'neutral'
                                    ? 'bg-white/20 text-white'
                                    : 'text-white/40 hover:text-white'
                                }`}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPermState(idx, item.perm, 'allow')}
                                title="İzin Ver"
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                  state === 'allow'
                                    ? 'bg-emerald-500 text-white'
                                    : 'text-white/40 hover:text-emerald-300'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white/80 transition"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition"
          >
            İzinleri Kaydet
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
