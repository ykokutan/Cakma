import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Server, ServerRole, ServerPermission } from '../types';
import {
  X,
  Settings,
  Shield,
  Users,
  Trash2,
  Plus,
  Check,
  Sparkles,
  AlertTriangle,
  Crown
} from 'lucide-react';

interface ServerSettingsModalProps {
  server: Server;
  onClose: () => void;
}

const AVAILABLE_COLORS = [
  '#f59e0b', // Amber / Gold
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald / Green
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#94a3b8', // Gray
];

const PERMISSION_DEFINITIONS: { key: ServerPermission; title: string; desc: string; category: string }[] = [
  { key: 'manage_server', title: 'Sunucuyu Yönet', desc: 'Sunucu adını, simgesini ve temel ayarlarını düzenleme yetkisi.', category: 'Yönetim' },
  { key: 'manage_roles', title: 'Rolleri Yönet', desc: 'Yeni roller oluşturma, yetkileri düzenleme ve üyelere rol verme yetkisi.', category: 'Yönetim' },
  { key: 'manage_channels', title: 'Kanalları Yönet', desc: 'Metin ve ses kanalları açma, düzenleme veya silme yetkisi.', category: 'Yönetim' },
  { key: 'kick_members', title: 'Üyeleri At (Kick)', desc: 'İhlal yapan kullanıcıları sunucudan uzaklaştırma yetkisi.', category: 'Moderasyon' },
  { key: 'mute_members', title: 'Kullanıcıları Sustur', desc: 'Ses odalarındaki diğer kullanıcıları susturma yetkisi (TeamSpeak / Server Mute).', category: 'Moderasyon' },
  { key: 'send_messages', title: 'Mesaj Gönder', desc: 'Metin kanallarında sohbet mesajı yazabilme izni.', category: 'Metin & Medya' },
  { key: 'attach_files', title: 'Dosya & Resim Yükle', desc: 'Sohbette fotoğraf, ses ve belge paylaşabilme izni.', category: 'Metin & Medya' },
  { key: 'connect_voice', title: 'Ses Odalarına Bağlan', desc: 'Sesli sohbet odalarına katılabilme izni.', category: 'Ses (WebRTC)' },
  { key: 'speak_voice', title: 'Sesli Konuşma', desc: 'Ses odalarında mikrofon açarak konuşabilme izni.', category: 'Ses (WebRTC)' },
  { key: 'priority_speaker', title: 'Öncelikli Konuşmacı', desc: 'Konuşurken kanaldaki diğer kişilerin sesini otomatik kısar (TeamSpeak Özelliği).', category: 'Ses (WebRTC)' },
];

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({ server, onClose }) => {
  const {
    currentUser,
    updateServerSettings,
    createServerRole,
    updateServerRole,
    deleteServerRole,
    toggleMemberRole,
    kickServerMember,
    deleteServer,
    hasServerPermission
  } = useSocket();

  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'members' | 'danger'>('overview');

  // Overview Form State
  const [name, setName] = useState(server.name);
  const [icon, setIcon] = useState(server.icon || '💬');
  const [description, setDescription] = useState(server.description || '');
  const [afkChannelId, setAfkChannelId] = useState<string>(server.afkChannelId || '');
  const [bitrateKbps, setBitrateKbps] = useState<number>(server.bitrateKbps || 128);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Roles Tab State
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    server.roles && server.roles.length > 0 ? server.roles[0].id : ''
  );
  const selectedRole = server.roles?.find(r => r.id === selectedRoleId) || server.roles?.[0];

  const [roleName, setRoleName] = useState(selectedRole?.name || '');
  const [roleColor, setRoleColor] = useState(selectedRole?.color || '#3b82f6');
  const [rolePerms, setRolePerms] = useState<ServerPermission[]>(selectedRole?.permissions || []);

  // Update role form when selectedRole changes
  const handleSelectRole = (r: ServerRole) => {
    setSelectedRoleId(r.id);
    setRoleName(r.name);
    setRoleColor(r.color);
    setRolePerms(r.permissions);
  };

  // Members Tab Search
  const [memberSearch, setMemberSearch] = useState('');

  const isOwner = currentUser?.id === server.ownerId;
  const canManageServer = hasServerPermission('manage_server');
  const canManageRoles = hasServerPermission('manage_roles');
  const canKick = hasServerPermission('kick_members');

  const handleSaveOverview = (e: React.FormEvent) => {
    e.preventDefault();
    updateServerSettings({
      serverId: server.id,
      name,
      icon,
      description,
      afkChannelId: afkChannelId || null,
      bitrateKbps
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleCreateNewRole = () => {
    createServerRole({
      serverId: server.id,
      name: 'Yeni Rol',
      color: '#3b82f6',
      permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice']
    });
  };

  const handleSaveRole = () => {
    if (!selectedRole) return;
    updateServerRole({
      serverId: server.id,
      roleId: selectedRole.id,
      name: roleName,
      color: roleColor,
      permissions: rolePerms
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleDeleteRole = (rId: string) => {
    if (confirm('Bu rolü silmek istediğinize emin misiniz?')) {
      deleteServerRole(server.id, rId);
      const remaining = server.roles.filter(r => r.id !== rId);
      if (remaining.length > 0) {
        handleSelectRole(remaining[0]);
      }
    }
  };

  const togglePermission = (perm: ServerPermission) => {
    if (rolePerms.includes(perm)) {
      setRolePerms(rolePerms.filter(p => p !== perm));
    } else {
      setRolePerms([...rolePerms, perm]);
    }
  };

  const handleDeleteServerConfirm = () => {
    if (confirm(`"${server.name}" sunucusunu kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) {
      deleteServer(server.id);
      onClose();
    }
  };

  // Filter members
  const filteredMembers = (server.members || []).filter(m =>
    m.username.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="w-full max-w-4xl h-[680px] max-h-[90vh] ios-glass rounded-3xl shadow-2xl border border-white/10 flex overflow-hidden relative text-white">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition z-20"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Sidebar */}
        <div className="w-64 bg-black/40 border-r border-white/10 p-5 flex flex-col justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3 px-2 mb-6">
              <span className="text-2xl">{server.icon || '💬'}</span>
              <div className="overflow-hidden">
                <h3 className="font-bold text-sm truncate text-white">{server.name}</h3>
                <span className="text-[11px] text-white/40 uppercase tracking-wider block">Sunucu Ayarları</span>
              </div>
            </div>

            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'overview'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Genel Bakış</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('roles')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'roles'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Roller & Yetkiler</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">
                  {server.roles?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'members'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Üye Yönetimi</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">
                  {server.members?.length || 0}
                </span>
              </button>
            </nav>
          </div>

          {/* Danger Zone Tab */}
          {isOwner && (
            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('danger')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'danger'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Sunucuyu Sil</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {saveSuccess && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4" />
              <span>Değişiklikler başarıyla kaydedildi!</span>
            </div>
          )}

          {/* 1. OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <form onSubmit={handleSaveOverview} className="space-y-6 max-w-xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">Sunucu Genel Bakış</h2>
                <p className="text-xs text-white/50">Sunucunun adını, simgesini ve TeamSpeak ses odası parametrelerini özelleştirin.</p>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">Simge</label>
                  <input
                    type="text"
                    value={icon}
                    maxLength={4}
                    onChange={(e) => setIcon(e.target.value)}
                    className="w-full text-center text-2xl h-12 rounded-2xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">Sunucu Adı</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-12 px-4 rounded-2xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">Açıklama</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Sunucu hakkında kısa bilgi..."
                  rows={2}
                  className="w-full p-3.5 rounded-2xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-xs text-white resize-none"
                />
              </div>

              {/* TeamSpeak Features: AFK Channel & Bitrate */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>TeamSpeak Özellikleri (Ses Kalitesi & AFK)</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">
                    AFK Odası
                  </label>
                  <select
                    value={afkChannelId}
                    onChange={(e) => setAfkChannelId(e.target.value)}
                    className="w-full bg-[#18191f] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 outline-none"
                  >
                    <option value="">(AFK Odası Yok)</option>
                    {server.channels.filter(c => c.type === 'voice').map(vc => (
                      <option key={vc.id} value={vc.id}>🔊 {vc.name}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-white/40 mt-1 block">
                    Uzun süre sessiz kalan kullanıcılar otomatik olarak bu odaya aktarılır.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">
                    Ses Kalitesi / Bitrate: <b className="text-blue-400">{bitrateKbps} kbps</b>
                  </label>
                  <input
                    type="range"
                    min={64}
                    max={384}
                    step={32}
                    value={bitrateKbps}
                    onChange={(e) => setBitrateKbps(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-1">
                    <span>64 kbps (Düşük Veri)</span>
                    <span>128 kbps (Standart HD)</span>
                    <span>384 kbps (Ultra Studio)</span>
                  </div>
                </div>
              </div>

              {canManageServer && (
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-500/30 transition"
                >
                  Değişiklikleri Kaydet
                </button>
              )}
            </form>
          )}

          {/* 2. ROLES TAB */}
          {activeTab === 'roles' && (
            <div className="h-full flex gap-6">
              {/* Role List */}
              <div className="w-56 shrink-0 flex flex-col justify-between border-r border-white/10 pr-4">
                <div className="space-y-1 overflow-y-auto max-h-[460px]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold text-white/40 uppercase">Roller</span>
                    {canManageRoles && (
                      <button
                        type="button"
                        onClick={handleCreateNewRole}
                        className="p-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs transition"
                        title="Yeni Rol Ekle"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {server.roles?.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelectRole(r)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                        selectedRoleId === r.id
                          ? 'bg-white/10 text-white font-bold border border-white/20'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="truncate">{r.name}</span>
                      </div>
                      {r.isDefault && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/40 uppercase">Herkes</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Role Editor */}
              {selectedRole ? (
                <div className="flex-1 space-y-5 overflow-y-auto pr-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedRole.color }} />
                        {selectedRole.name} Rolünü Düzenle
                      </h3>
                      <span className="text-[11px] text-white/40">Rol adı, rengi ve sunucu izinlerini yapılandırın.</span>
                    </div>

                    {canManageRoles && !selectedRole.isDefault && selectedRole.id !== 'role-owner' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole.id)}
                        className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Rolü Sil</span>
                      </button>
                    )}
                  </div>

                  {/* Role Name & Color */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">Rol Adı</label>
                      <input
                        type="text"
                        disabled={selectedRole.isDefault}
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">Rol Rengi</label>
                      <div className="flex items-center gap-1.5">
                        {AVAILABLE_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setRoleColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-6 h-6 rounded-full transition hover:scale-110 flex items-center justify-center ${
                              roleColor === c ? 'ring-2 ring-white scale-110' : ''
                            }`}
                          >
                            {roleColor === c && <Check className="w-3 h-3 text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Permissions Toggles */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-3">
                      Rol İzinleri ({rolePerms.length} / {PERMISSION_DEFINITIONS.length})
                    </label>

                    <div className="space-y-2">
                      {PERMISSION_DEFINITIONS.map(p => {
                        const isGranted = rolePerms.includes(p.key);
                        return (
                          <div
                            key={p.key}
                            onClick={() => canManageRoles && togglePermission(p.key)}
                            className={`p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                              isGranted
                                ? 'bg-blue-500/10 border-blue-500/30'
                                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold text-white flex items-center gap-2">
                                <span>{p.title}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-white/50">{p.category}</span>
                              </div>
                              <p className="text-[11px] text-white/40 mt-0.5">{p.desc}</p>
                            </div>

                            <button
                              type="button"
                              className={`w-10 h-6 rounded-full transition-colors p-1 flex items-center ${
                                isGranted ? 'bg-blue-500 justify-end' : 'bg-white/20 justify-start'
                              }`}
                            >
                              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {canManageRoles && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSaveRole}
                        className="px-6 py-2.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-500/30 transition"
                      >
                        Rolü Kaydet
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-white/40 text-xs">
                  Soldan düzenlemek istediğiniz bir rolü seçin.
                </div>
              )}
            </div>
          )}

          {/* 3. MEMBERS TAB */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight mb-1">Sunucu Üyeleri</h2>
                  <p className="text-xs text-white/50">Sunucuya katılmış kullanıcıları görüntüleyin ve rolleri yönetin.</p>
                </div>
                <input
                  type="text"
                  placeholder="Üye ara..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-blue-500 w-48"
                />
              </div>

              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
                {filteredMembers.map(m => {
                  const memberRoleObjects = (server.roles || []).filter(r => m.roleIds?.includes(r.id) && !r.isDefault);
                  return (
                    <div
                      key={m.userId}
                      className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between hover:bg-white/[0.05] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-lg shadow">
                          {m.avatar || '👤'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">{m.username}</span>
                            {m.isOwner && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center gap-1 border border-amber-500/30">
                                <Crown className="w-3 h-3" /> Sahip
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {memberRoleObjects.length > 0 ? (
                              memberRoleObjects.map(r => (
                                <span
                                  key={r.id}
                                  style={{ borderColor: `${r.color}55`, color: r.color, backgroundColor: `${r.color}15` }}
                                  className="text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                                  {r.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-white/30">@everyone</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Role Assignment Actions */}
                      <div className="flex items-center gap-2">
                        {canManageRoles && !m.isOwner && (
                          <div className="flex items-center gap-1">
                            {server.roles?.filter(r => !r.isDefault && r.id !== 'role-owner').map(r => {
                              const hasThisRole = m.roleIds?.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => toggleMemberRole(server.id, m.userId, r.id)}
                                  style={{
                                    borderColor: hasThisRole ? r.color : 'rgba(255,255,255,0.1)',
                                    backgroundColor: hasThisRole ? `${r.color}30` : 'rgba(255,255,255,0.05)',
                                    color: hasThisRole ? r.color : 'rgba(255,255,255,0.6)'
                                  }}
                                  className="px-2 py-1 rounded-xl text-[10px] font-semibold border transition hover:scale-105"
                                  title={`${r.name} rolünü ${hasThisRole ? 'kaldır' : 'ata'}`}
                                >
                                  {hasThisRole ? '✓ ' : '+ '}
                                  {r.name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {canKick && !m.isOwner && m.userId !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`${m.username} adlı üyeyi sunucudan atmak istediğinize emin misiniz?`)) {
                                kickServerMember(server.id, m.userId);
                              }
                            }}
                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"
                            title="Sunucudan At (Kick)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. DANGER ZONE TAB */}
          {activeTab === 'danger' && isOwner && (
            <div className="space-y-6 max-w-lg">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-red-400 mb-1">Tehlikeli Bölge</h2>
                <p className="text-xs text-white/50">Sunucuyu tamamen silme ve geri dönüşü olmayan işlemler.</p>
              </div>

              <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-xl">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-red-300">Bu Sunucuyu Sil</h4>
                    <p className="text-[11px] text-white/50">
                      Sunucu silindiğinde tüm kanallar, sohbet geçmişi ve roller kalıcı olarak yok edilir.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDeleteServerConfirm}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-lg shadow-red-600/30 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Sunucuyu Kalıcı Olarak Sil</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
