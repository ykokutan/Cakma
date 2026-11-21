import React, { Suspense, lazy, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { isSameUser, isUserServerOwner } from '../utils/serverIdentity';
import { Server, ServerCategory, ServerRole, ServerPermission } from '../types';
import { AvatarView, isImageAvatar, processUploadedImage } from './AvatarView';
import { appConfirm, appPrompt, appToast } from '../utils/appDialogs';
import { t } from '../utils/i18n';
import {
  X,
  Settings,
  Shield,
  Users,
  Trash2,
  Plus,
  Check,
  AlertTriangle,
  Crown,
  Radio,
  Lock,
  Copy,
  Link,
  CheckCircle2,
  Download,
  Upload,
  FileJson,
  Bot,
  Image as ImageIcon,
  Webhook,
} from 'lucide-react';

import {
  CalendarClock as ScheduledClockIcon,
  ClipboardList as AuditClipboardIcon,
  Sparkles as OnboardingSparklesIcon,
  Workflow as AutomationWorkflowIcon,
} from 'lucide-react';

const WebhooksTab = lazy(() =>
  import('./server/WebhooksTab').then((m) => ({ default: m.WebhooksTab }))
);
const ServerAuditAndModTab = lazy(() =>
  import('./server/ServerAuditAndModTab').then((m) => ({ default: m.ServerAuditAndModTab }))
);
const ServerOnboardingTab = lazy(() =>
  import('./server/ServerOnboardingTab').then((m) => ({ default: m.ServerOnboardingTab }))
);
const ScheduledMessagesTab = lazy(() =>
  import('./server/ScheduledMessagesTab').then((m) => ({ default: m.ScheduledMessagesTab }))
);
const AutomationAndBotsTab = lazy(() =>
  import('./server/AutomationAndBotsTab').then((m) => ({ default: m.AutomationAndBotsTab }))
);

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

const PRESET_ICONS = ['🎮', '🚀', '🛡️', '⚔️', '🎧', '💻', '🏆', '🔥', '👑', '⚡', '💎', '👾', '🎯', '⚽', '🏎️', '💬'];

const BANNER_THEMES = [
  { id: 'indigo', name: 'Gece Mavisi', class: 'from-blue-600 via-indigo-600 to-purple-600' },
  { id: 'emerald', name: 'Zümrüt Yeşili', class: 'from-emerald-600 via-teal-600 to-cyan-600' },
  { id: 'sunset', name: 'Ateş Kırmızı', class: 'from-amber-500 via-orange-600 to-red-600' },
  { id: 'cyber', name: 'Siberpunk Mor', class: 'from-fuchsia-600 via-purple-600 to-pink-600' },
  { id: 'midnight', name: 'Titanyum Siyah', class: 'from-neutral-800 via-neutral-900 to-black' },
];

const BITRATE_PRESETS = [
  { kbps: 64, label: '64 kbps', title: 'Mobil / Tasarruf', desc: 'Düşük internet kullanımı, temel ses iletişimi.' },
  { kbps: 128, label: '128 kbps', title: 'Standart HD', desc: 'Discord varsayılanı, kristal netliğinde insan sesi.' },
  { kbps: 256, label: '256 kbps', title: 'TeamSpeak Pro', desc: 'Geniş dinamik aralık ve ultra düşük sıkıştırma.' },
  { kbps: 384, label: '384 kbps', title: 'Ultra Studio', desc: 'Kayıpsız seviyesinde stereo müzik ve profesyonel yayıncı kalitesi.' },
];

const PERMISSION_DEFINITIONS: { key: ServerPermission; title: string; desc: string; category: string }[] = [
  { key: 'manage_server', title: 'Sunucuyu Yönet', desc: 'Sunucu adını, simgesini ve temel ayarlarını düzenleme yetkisi.', category: 'Yönetim' },
  { key: 'manage_roles', title: 'Rolleri Yönet', desc: 'Yeni roller oluşturma, yetkileri düzenleme ve üyelere rol verme yetkisi.', category: 'Yönetim' },
  { key: 'manage_channels', title: 'Kanalları Yönet', desc: 'Metin ve ses kanalları açma, düzenleme veya silme yetkisi.', category: 'Yönetim' },
  { key: 'kick_members', title: 'Üyeleri At (Kick)', desc: 'İhlal yapan kullanıcıları sunucudan uzaklaştırma yetkisi.', category: 'Moderasyon' },
  { key: 'mute_members', title: 'Kullanıcıları Sustur', desc: 'Ses odalarındaki diğer kullanıcıları susturma yetkisi (Server Mute).', category: 'Moderasyon' },
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
    restoreServerBackup,
    createServerRole,
    updateServerRole,
    deleteServerRole,
    toggleMemberRole,
    kickServerMember,
    deleteServer,
    hasServerPermission,
    addServerEmoji,
    deleteServerEmoji,
    language,
  } = useSocket();

  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'voice'
    | 'security'
    | 'roles'
    | 'members'
    | 'welcome'
    | 'webhooks'
    | 'onboarding'
    | 'scheduled'
    | 'automation'
    | 'audit_mod'
    | 'backup'
    | 'danger'
  >('overview');

  // Overview Form State
  const [name, setName] = useState(server.name);
  const [icon, setIcon] = useState(server.icon || '💬');
  const [bannerGradient, setBannerGradient] = useState(server.bannerGradient || BANNER_THEMES[0].class);
  const [bannerImage, setBannerImage] = useState<string>(server.bannerImage || '');
  const [description, setDescription] = useState(server.description || '');
  const [isPublic, setIsPublic] = useState<boolean>(server.isPublic !== false);
  const [category, setCategory] = useState<ServerCategory>(server.category || 'community');
  const [tagsText, setTagsText] = useState<string>((server.tags || []).join(', '));
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [systemChannelId, setSystemChannelId] = useState<string>(server.systemChannelId || '');
  const [defaultNotification, setDefaultNotification] = useState<'all' | 'mentions'>(server.defaultNotification || 'all');
  const [vanityCode, setVanityCode] = useState(server.vanityCode || '');
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Welcome & Auto-Role State
  const [welcomeEnabled, setWelcomeEnabled] = useState<boolean>(server.welcomeEnabled ?? true);
  const [welcomeChannelId, setWelcomeChannelId] = useState<string>(server.welcomeChannelId || (server.channels.find(c => c.type === 'text')?.id || ''));
  const [welcomeMessage, setWelcomeMessage] = useState<string>(server.welcomeMessage || '🎉 **{user}** sunucumuza katıldı! Hoş geldin! 🚀');
  const [autoRoleId, setAutoRoleId] = useState<string>(server.autoRoleId || '');

  // Voice & TeamSpeak State
  const [bitrateKbps, setBitrateKbps] = useState<number>(server.bitrateKbps || 128);
  const [sfuMode, setSfuMode] = useState<'auto' | 'p2p' | 'sfu'>(server.sfuMode || 'auto');
  const [afkChannelId, setAfkChannelId] = useState<string>(server.afkChannelId || '');
  const [afkTimeoutMinutes, setAfkTimeoutMinutes] = useState<number>(server.afkTimeoutMinutes || 15);
  const [voiceRegion, setVoiceRegion] = useState<string>(server.voiceRegion || 'tr-istanbul');

  // Security & Moderation State
  const [verificationLevel, setVerificationLevel] = useState<'none' | 'low' | 'medium' | 'high'>(server.verificationLevel || 'low');
  const [autoModEnabled, setAutoModEnabled] = useState<boolean>(server.autoModEnabled ?? true);

  const [saveSuccess, setSaveSuccess] = useState(false);

  // Roles Tab State
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    server.roles && server.roles.length > 0 ? server.roles[0].id : ''
  );
  const selectedRole = server.roles?.find((r) => r.id === selectedRoleId) || server.roles?.[0];

  const [roleName, setRoleName] = useState(selectedRole?.name || '');
  const [roleColor, setRoleColor] = useState(selectedRole?.color || '#3b82f6');
  const [rolePerms, setRolePerms] = useState<ServerPermission[]>(selectedRole?.permissions || []);

  const handleSelectRole = (r: ServerRole) => {
    setSelectedRoleId(r.id);
    setRoleName(r.name);
    setRoleColor(r.color);
    setRolePerms(r.permissions);
  };

  // Members Tab Search
  const [memberSearch, setMemberSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);

  const isOwner = isUserServerOwner(currentUser, server);
  const canManageServer = hasServerPermission('manage_server');
  const canManageRoles = hasServerPermission('manage_roles');
  const canKick = hasServerPermission('kick_members');

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaUploadError(null);
    const res = await processUploadedImage(file, {
      maxWidth: 512,
      maxHeight: 512,
      maxGifBytes: 1.5 * 1024 * 1024,
    });
    if (!res.ok) {
      setMediaUploadError(res.error);
      return;
    }
    setIcon(res.dataUrl);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaUploadError(null);
    const res = await processUploadedImage(file, {
      maxWidth: 960,
      maxHeight: 540,
      maxGifBytes: 2 * 1024 * 1024,
    });
    if (!res.ok) {
      setMediaUploadError(res.error);
      return;
    }
    setBannerImage(res.dataUrl);
  };

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateServerSettings({
      serverId: server.id,
      name,
      icon,
      bannerGradient,
      bannerImage,
      description,
      isPublic,
      category,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 6),
      systemChannelId: systemChannelId || null,
      defaultNotification,
      vanityCode: vanityCode.trim() || undefined,
      bitrateKbps,
      sfuMode,
      afkChannelId: afkChannelId || null,
      afkTimeoutMinutes,
      voiceRegion,
      verificationLevel,
      autoModEnabled,
      welcomeEnabled,
      welcomeChannelId: welcomeChannelId || null,
      welcomeMessage,
      autoRoleId: autoRoleId || null,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleCopyInvite = () => {
    const inviteUrl = `https://ses.yahyakemalokutan.com/c/${vanityCode.trim() || server.id}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleExportBackup = () => {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      name: server.name,
      icon: server.icon,
      bannerGradient: server.bannerGradient,
      description: server.description,
      category: server.category,
      tags: server.tags,
      bitrateKbps: server.bitrateKbps,
      voiceRegion: server.voiceRegion,
      verificationLevel: server.verificationLevel,
      autoModEnabled: server.autoModEnabled,
      welcomeEnabled,
      welcomeChannelId,
      welcomeMessage,
      autoRoleId,
      categories: (server.categories || []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        position: cat.position,
      })),
      channels: (server.channels || []).map((c) => ({
        name: c.name,
        type: c.type,
        categoryId: c.categoryId ?? null,
        position: c.position,
        topic: c.topic,
        bitrateKbps: c.bitrateKbps,
        userLimit: c.userLimit,
        isTempCreatorChannel: c.isTempCreatorChannel,
      })),
      roles: (server.roles || []).map((r) => ({
        name: r.name,
        color: r.color,
        permissions: r.permissions,
        isDefault: r.isDefault,
      })),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sunucu-yedek-${server.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || typeof json !== 'object') {
          appToast('Geçersiz yedek dosyası!', 'error');
          return;
        }
        if (await appConfirm({ title: 'Sunucu Yedeğini Uygula', message: `"${json.name || 'Bilinmeyen'}" adlı sunucu şablonu/yedeği uygulansın mı? Mevcut kanallar ve ayarlar güncellenecektir.`, confirmLabel: 'Uygula' })) {
          restoreServerBackup(server.id, json);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } catch (err) {
        appToast('Yedek dosyası okunamadı veya JSON formatı hatalı.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateNewRole = () => {
    createServerRole({
      serverId: server.id,
      name: 'Yeni Rol',
      color: '#3b82f6',
      permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice'],
    });
  };

  const handleSaveRole = () => {
    if (!selectedRole) return;
    updateServerRole({
      serverId: server.id,
      roleId: selectedRole.id,
      name: roleName,
      color: roleColor,
      permissions: rolePerms,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleDeleteRole = async (rId: string) => {
    if (await appConfirm({ title: 'Rolü Sil', message: 'Bu rolü silmek istediğinize emin misiniz?', danger: true, confirmLabel: 'Sil' })) {
      deleteServerRole(server.id, rId);
      const remaining = server.roles.filter((r) => r.id !== rId);
      if (remaining.length > 0) {
        handleSelectRole(remaining[0]);
      }
    }
  };

  const togglePermission = (perm: ServerPermission) => {
    if (rolePerms.includes(perm)) {
      setRolePerms(rolePerms.filter((p) => p !== perm));
    } else {
      setRolePerms([...rolePerms, perm]);
    }
  };

  const handleDeleteServerConfirm = async () => {
    const confirmName = await appPrompt({
      title: 'Sunucuyu Sil',
      message: `DİKKAT: Sunucuyu tamamen silmek üzeresiniz!\nOnaylamak için lütfen sunucu adını ("${server.name}") birebir yazın:`,
      placeholder: server.name,
      confirmLabel: 'Kalıcı Olarak Sil',
    });
    if (confirmName === server.name) {
      deleteServer(server.id);
      onClose();
    } else if (confirmName !== null) {
      appToast('Sunucu adı eşleşmedi, silme işlemi iptal edildi.', 'warning');
    }
  };

  const filteredMembers = (server.members || []).filter((m) =>
    m.username.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${server.name} Sunucu Ayarları`}
        className="relative w-full max-w-4xl bg-[#121318]/95 border border-white/10 rounded-3xl shadow-2xl flex overflow-hidden h-[620px] text-white animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition z-20"
          title="Kapat"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Navigation Sidebar */}
        <div className="w-64 bg-white/[0.02] border-r border-white/[0.08] p-5 flex flex-col justify-between shrink-0">
          <div className="space-y-4">
            {/* Server Badge Header */}
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-xl shadow">
                {icon}
              </div>
              <div className="truncate min-w-0">
                <div className="text-xs font-bold text-white truncate">{name}</div>
                <div className="text-[10px] text-white/40">Sunucu Ayarları</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'overview'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Genel Bakış & Tema</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('voice')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'voice'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Ses Kalitesi & WebRTC</span>
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  {bitrateKbps}k
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('onboarding')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'onboarding'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <OnboardingSparklesIcon className="w-4 h-4 text-indigo-400" />
                <span className="truncate">{t(language, 'serverOnboarding')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('scheduled')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'scheduled'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <ScheduledClockIcon className="w-4 h-4 text-sky-400" />
                <span className="truncate">{t(language, 'scheduledMessages')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('automation')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'automation'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <AutomationWorkflowIcon className="w-4 h-4 text-emerald-400" />
                <span className="truncate">{t(language, 'automationRules')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit_mod')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'audit_mod'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <AuditClipboardIcon className="w-4 h-4 text-amber-400" />
                <span className="truncate">{t(language, 'serverAuditLog')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'security'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Lock className="w-4 h-4 text-purple-400" />
                <span>Güvenlik & Moderasyon</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('roles')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'roles'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Roller & Yetkiler</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">
                  {server.roles?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'members'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Üye Yönetimi</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">
                  {server.members?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('welcome')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'welcome'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Bot className="w-4 h-4 text-amber-400" />
                <span>Karşılama & Auto-Rol</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('webhooks')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'webhooks'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Webhook className="w-4 h-4 text-cyan-400" />
                <span>{t(language, 'tabWebhooks')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('backup')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'backup'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileJson className="w-4 h-4 text-emerald-400" />
                <span>Yedek & Şablon</span>
              </button>
            </nav>
          </div>

          {/* Danger Zone Tab */}
          {isOwner && (
            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('danger')}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
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
            <div className="mb-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in shadow-lg">
              <Check className="w-4 h-4 shrink-0" />
              <span>Sunucu ayarları ve ses iletim parametreleri başarıyla güncellendi!</span>
            </div>
          )}

          {/* 1. OVERVIEW & THEME TAB */}
          {activeTab === 'overview' && (
            <>
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">Genel Bakış & Sunucu Kimliği</h2>
                <p className="text-xs text-white/50">
                  Sunucunuzun adını, simgesini, temasını ve genel davet bağlantısını özelleştirin.
                </p>
              </div>

              {/* Server Name & Icon */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                      {isImageAvatar(icon) ? (
                        <img src={icon} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <input
                          type="text"
                          value={icon}
                          maxLength={4}
                          onChange={(e) => setIcon(e.target.value)}
                          aria-label="Sunucu simgesi emoji"
                          className="w-full h-full text-center text-2xl bg-transparent outline-none text-white"
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-white/40 uppercase">
                        Sunucu Simgesi (Maks. 512×512)
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={iconFileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={handleIconUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => iconFileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/30 text-blue-300 text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Simge Yükle
                        </button>
                        {isImageAvatar(icon) && (
                          <button
                            type="button"
                            onClick={() => setIcon('💬')}
                            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-white/70 hover:text-red-300 text-xs transition"
                          >
                            Görseli Kaldır
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-white/35">PNG, JPG, WEBP veya GIF (otomatik ≤512×512 boyutlandırılır)</p>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
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

                {mediaUploadError && (
                  <div className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{mediaUploadError}</span>
                  </div>
                )}
              </div>

              {/* Quick Icon Selector */}
              <div>
                <span className="text-[10px] text-white/40 block mb-1.5 uppercase font-medium">Hızlı Emoji Simge Seç:</span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setIcon(emoji)}
                      className={`w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-base transition ${
                        icon === emoji ? 'ring-2 ring-blue-500 bg-blue-500/20' : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Server Banner Image (960x540) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase">
                      Sunucu Banner Görseli (Maks. 960×540 · 16:9)
                    </label>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      Kanal listesinin üst başlığında görünür. PNG, JPG, WEBP veya GIF desteklenir.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      ref={bannerFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleBannerUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bannerFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      {bannerImage ? 'Banner Değiştir' : 'Banner Yükle'}
                    </button>
                    {bannerImage && (
                      <button
                        type="button"
                        onClick={() => setBannerImage('')}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-white/70 hover:text-red-300 text-xs transition"
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative h-28 rounded-2xl overflow-hidden border border-white/10 bg-[#141720]">
                  {bannerImage ? (
                    <img src={bannerImage} alt={`${name} banner`} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${bannerGradient}`} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex items-end p-3.5 gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-black/40 border border-white/15 overflow-hidden flex items-center justify-center shrink-0">
                      {isImageAvatar(icon) ? (
                        <img src={icon} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">{icon}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{name || 'Sunucu Adı'}</p>
                      <p className="text-[10px] text-white/60">
                        {bannerImage ? 'Özel Banner Önizleme (960×540)' : 'Gradient Tema Önizleme'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Banner / Theme Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                  Sunucu Başlık Teması (Görsel Gradient)
                </label>
                <div className="grid grid-cols-5 gap-2.5">
                  {BANNER_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setBannerGradient(theme.class)}
                      className={`h-12 rounded-xl bg-gradient-to-r ${theme.class} p-1 relative border transition flex items-end justify-start ${
                        bannerGradient === theme.class ? 'ring-2 ring-white border-transparent scale-105' : 'border-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <span className="text-[9px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm truncate">
                        {theme.name}
                      </span>
                      {bannerGradient === theme.class && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">Sunucu Açıklaması</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Sunucunuz hakkında üyelere ve ziyaretçilere kısa bilgi verin..."
                  rows={2}
                  className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-xs text-white resize-none"
                />
              </div>

              {/* Discovery Visibility, Category & Tags */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Sunucuları Keşfet&apos;te Listele</div>
                    <div className="text-[10px] text-white/45">
                      Açıkken bu sunucu Keşfet dizininde görünür ve kullanıcılar kendi isteğiyle katılabilir.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPublic((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                      isPublic ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                      Sunucu Kategorisi
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ServerCategory)}
                      className="w-full bg-[#18191f] border border-white/15 text-white text-xs rounded-xl px-3 py-2 outline-none"
                    >
                      <option value="gaming">🎮 Oyun &amp; e-Spor</option>
                      <option value="community">💬 Topluluk &amp; Sohbet</option>
                      <option value="tech">💻 Teknoloji &amp; Yazılım</option>
                      <option value="music">🎵 Müzik &amp; Eğlence</option>
                      <option value="education">📚 Eğitim &amp; Çalışma</option>
                      <option value="other">✨ Diğer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1">
                      Etiketler (virgülle ayırın, maks. 6)
                    </label>
                    <input
                      type="text"
                      value={tagsText}
                      onChange={(e) => setTagsText(e.target.value)}
                      placeholder="Örn: Valorant, Sohbet, 18+"
                      className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-xs text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Vanity URL / Custom Invite Link */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                    <Link className="w-4 h-4" />
                    <span>Özel Davet Bağlantısı (Vanity URL)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="px-2.5 py-1 rounded-xl bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-400/30 text-[11px] font-semibold flex items-center gap-1.5 transition"
                  >
                    {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedInvite ? 'Kopyalandı!' : 'Linki Kopyala'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40 font-mono">ses.yahyakemalokutan.com/c/</span>
                  <input
                    type="text"
                    value={vanityCode}
                    placeholder={server.id}
                    onChange={(e) => setVanityCode(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white font-mono outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* System Messages & Notifications */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">
                    Sistem Mesajları Kanalı
                  </label>
                  <select
                    value={systemChannelId}
                    onChange={(e) => setSystemChannelId(e.target.value)}
                    className="w-full bg-[#18191f] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 outline-none"
                  >
                    <option value="">(Otomatik Duyuru Yok)</option>
                    {server.channels.filter((c) => c.type === 'text').map((tc) => (
                      <option key={tc.id} value={tc.id}># {tc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase mb-1.5">
                    Varsayılan Bildirimler
                  </label>
                  <select
                    value={defaultNotification}
                    onChange={(e) => setDefaultNotification(e.target.value as 'all' | 'mentions')}
                    className="w-full bg-[#18191f] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 outline-none"
                  >
                    <option value="all">Tüm Yeni Mesajlar</option>
                    <option value="mentions">Yalnızca @Bahsetmeler (@mention)</option>
                  </select>
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

            {/* Custom Server Emojis */}
            {canManageServer && (
              <div className="mt-6 p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">Özel Sunucu Emojileri</div>
                    <div className="text-xs text-white/40">Sunucuya özel PNG veya GIF emojiler yükleyin.</div>
                  </div>
                  <label className="cursor-pointer px-3.5 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition">
                    Emoji Yükle
                    <input
                      type="file"
                      accept="image/png,image/gif,image/webp,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 350 * 1024) {
                          appToast('Emoji boyutu 350KB altında olmalıdır.', 'warning');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string') {
                            const emojiName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '') || 'emoji';
                            addServerEmoji(server.id, emojiName, reader.result);
                          }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {(!server.customEmojis || server.customEmojis.length === 0) ? (
                  <p className="text-xs text-white/40">Henüz özel emoji eklenmedi.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {server.customEmojis.map((em) => (
                      <div key={em.id} className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-white/10">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <img src={em.url} alt={em.name} className="w-6 h-6 object-contain rounded shrink-0" />
                          <span className="text-[11px] text-white/80 truncate">:{em.name}:</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteServerEmoji(server.id, em.id)}
                          className="text-red-400 hover:text-red-300 text-xs px-1"
                          title="Sil"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </>
          )}

          {/* 2. VOICE & WEBRTC PIPELINE TAB */}
          {activeTab === 'voice' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">Ses Kalitesi & WebRTC Parametreleri</h2>
                <p className="text-xs text-white/50">
                  Sunucudaki ses kanallarının Opus kodek bant genişliğini, AFK süresini ve bölgesel iletim ayarlarını yapılandırın.
                </p>
              </div>

              {/* Bitrate Control Card */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-white">Ses İletim Kalitesi (Opus Bitrate)</span>
                  </div>
                  <span className="text-sm font-black font-mono px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow">
                    {bitrateKbps} kbps
                  </span>
                </div>

                {/* Range Slider */}
                <div className="space-y-2">
                  <input
                    type="range"
                    min={64}
                    max={384}
                    step={32}
                    value={bitrateKbps}
                    onChange={(e) => setBitrateKbps(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-2 bg-white/10 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 font-mono">
                    <span>64 kbps</span>
                    <span>128 kbps (HD)</span>
                    <span>256 kbps (Pro)</span>
                    <span>384 kbps (Ultra)</span>
                  </div>
                </div>

                {/* Preset Quality Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                  {BITRATE_PRESETS.map((preset) => (
                    <button
                      key={preset.kbps}
                      type="button"
                      onClick={() => setBitrateKbps(preset.kbps)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        bitrateKbps === preset.kbps
                          ? 'bg-emerald-500/20 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">{preset.label}</span>
                        {bitrateKbps === preset.kbps && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-400 mb-0.5">{preset.title}</div>
                      <div className="text-[10px] text-white/40 leading-tight">{preset.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Hybrid P2P / LiveKit SFU Mode */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Ses &amp; Yayın Mimarisi (P2P / LiveKit SFU)</span>
                    <span className="text-[10px] text-white/45">Sunucu geneli geçerlidir</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'auto' as const, title: 'Otomatik (Hibrit)', desc: 'Küçük odalar P2P, kalabalık odalar LiveKit SFU' },
                      { id: 'p2p' as const, title: 'Her Zaman P2P Mesh', desc: 'Doğrudan uçtan uca bağlantı (düşük gecikme)' },
                      { id: 'sfu' as const, title: 'Her Zaman LiveKit SFU', desc: 'Tüm odalar merkezi LiveKit SFU üzerinden akar' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSfuMode(opt.id)}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          sfuMode === opt.id
                            ? 'bg-blue-500/20 border-blue-400/60 text-white'
                            : 'bg-white/[0.02] border-white/10 text-white/70 hover:bg-white/5'
                        }`}
                      >
                        <div className="text-xs font-bold">{opt.title}</div>
                        <div className="text-[10px] text-white/45 mt-0.5 leading-tight">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* TeamSpeak AFK & Voice Region Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase">
                    AFK Odası
                  </label>
                  <select
                    value={afkChannelId}
                    onChange={(e) => setAfkChannelId(e.target.value)}
                    className="w-full bg-[#18191f] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 outline-none"
                  >
                    <option value="">(AFK Odası Yok)</option>
                    {server.channels.filter((c) => c.type === 'voice').map((vc) => (
                      <option key={vc.id} value={vc.id}>🔊 {vc.name}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-white/40 block">
                    Uzun süre mikrofon kullanmayanlar bu kanala taşınır.
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <label className="block text-[11px] font-semibold text-white/40 uppercase">
                    AFK Zaman Aşımı
                  </label>
                  <select
                    value={afkTimeoutMinutes}
                    onChange={(e) => setAfkTimeoutMinutes(Number(e.target.value))}
                    className="w-full bg-[#18191f] border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 outline-none"
                  >
                    <option value={1}>1 Dakika (Agresif)</option>
                    <option value={5}>5 Dakika</option>
                    <option value={15}>15 Dakika (Önerilen)</option>
                    <option value={30}>30 Dakika</option>
                    <option value={60}>1 Saat</option>
                  </select>
                  <span className="text-[10px] text-white/40 block">
                    Sessizlik süresi dolduğunda otomatik tetiklenir.
                  </span>
                </div>
              </div>

              {/* Voice Edge Region Selection */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <label className="block text-[11px] font-semibold text-white/40 uppercase">
                  Bölgesel Ses İletim Düğümü (Voice Region)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setVoiceRegion('tr-istanbul')}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      voiceRegion === 'tr-istanbul'
                        ? 'bg-blue-500/20 border-blue-500/60'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>🇹🇷 Türkiye (İstanbul Edge)</span>
                      </div>
                      <div className="text-[10px] text-emerald-400 mt-0.5">Ultra Düşük Gecikme (10-18ms)</div>
                    </div>
                    {voiceRegion === 'tr-istanbul' && <Check className="w-4 h-4 text-blue-400" />}
                  </div>

                  <div
                    onClick={() => setVoiceRegion('eu-frankfurt')}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      voiceRegion === 'eu-frankfurt'
                        ? 'bg-blue-500/20 border-blue-500/60'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>🇩🇪 Almanya (Frankfurt Node)</span>
                      </div>
                      <div className="text-[10px] text-white/40 mt-0.5">Avrupa İçi Düşük Ping (35-45ms)</div>
                    </div>
                    {voiceRegion === 'eu-frankfurt' && <Check className="w-4 h-4 text-blue-400" />}
                  </div>
                </div>
              </div>

              {canManageServer && (
                <button
                  type="button"
                  onClick={() => handleSaveSettings()}
                  className="px-6 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/30 transition flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Ses Ayarlarını & Bitrate'i Uygula</span>
                </button>
              )}
            </div>
          )}

          {/* 3. SECURITY & MODERATION TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">Güvenlik & Moderasyon</h2>
                <p className="text-xs text-white/50">
                  Sunucunuza yeni katılan kullanıcıların doğrulama seviyesini ve otomatik moderasyon kurallarını belirleyin.
                </p>
              </div>

              {/* Verification Level */}
              <div className="space-y-3">
                <label className="block text-[11px] font-semibold text-white/40 uppercase">
                  Doğrulama Seviyesi (Spam Önleme)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { id: 'none', title: 'Yok', desc: 'Herhangi bir kısıtlama yok, katılan anında yazabilir.' },
                      { id: 'low', title: 'Düşük (Önerilen)', desc: 'Kullanıcının kayıtlı bir hesabı olması gerekir.' },
                      { id: 'medium', title: 'Orta', desc: 'Platformda en az 5 dakikadır kayıtlı olmalıdır.' },
                      { id: 'high', title: 'Yüksek', desc: 'Sunucuda en az 10 dakikadır üye olmalıdır.' },
                    ] as const
                  ).map((lvl) => (
                    <div
                      key={lvl.id}
                      onClick={() => setVerificationLevel(lvl.id)}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                        verificationLevel === lvl.id
                          ? 'bg-purple-600/20 border-purple-500 shadow-lg shadow-purple-500/10'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">{lvl.title}</span>
                        {verificationLevel === lvl.id && <Check className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                      <span className="text-[11px] text-white/40 leading-tight">{lvl.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AutoMod Rules */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Otomatik Moderatör (AutoMod)</div>
                    <div className="text-[11px] text-white/40">Spam mesajları, flood ve aşırı büyük harfleri otomatik engeller.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoModEnabled(!autoModEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors p-1 flex items-center ${
                      autoModEnabled ? 'bg-purple-600 justify-end' : 'bg-white/20 justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                  </button>
                </div>
              </div>

              {canManageServer && (
                <button
                  type="button"
                  onClick={() => handleSaveSettings()}
                  className="px-6 py-2.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-500/30 transition"
                >
                  Güvenlik Ayarlarını Kaydet
                </button>
              )}
            </div>
          )}

          {/* 4. ROLES TAB */}
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

                  {server.roles?.map((r) => (
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
                        {AVAILABLE_COLORS.map((c) => (
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
                      {PERMISSION_DEFINITIONS.map((p) => {
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

          {/* 5. MEMBERS TAB */}
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
                {filteredMembers.map((m) => {
                  const memberRoleObjects = (server.roles || []).filter((r) => m.roleIds?.includes(r.id) && !r.isDefault);
                  return (
                    <div
                      key={m.userId}
                      className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between hover:bg-white/[0.05] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-lg shadow overflow-hidden">
                          <AvatarView avatar={m.avatar} alt={m.username} fallback="👤" className="w-full h-full object-cover" />
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
                              memberRoleObjects.map((r) => (
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
                            {server.roles?.filter((r) => !r.isDefault && r.id !== 'role-owner').map((r) => {
                              const hasThisRole = m.roleIds?.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => toggleMemberRole(server.id, m.userId, r.id)}
                                  style={{
                                    borderColor: hasThisRole ? r.color : 'rgba(255,255,255,0.1)',
                                    backgroundColor: hasThisRole ? `${r.color}30` : 'rgba(255,255,255,0.05)',
                                    color: hasThisRole ? r.color : 'rgba(255,255,255,0.6)',
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

                        {canKick && !m.isOwner && !isSameUser({ id: m.userId, username: m.username }, currentUser) && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (await appConfirm({ title: 'Üyeyi Sunucudan At', message: `${m.username} adlı üyeyi sunucudan atmak istediğinize emin misiniz?`, danger: true, confirmLabel: 'At (Kick)' })) {
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

          {/* 6. WELCOME BOT & AUTO-ROLE TAB */}
          {activeTab === 'welcome' && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">Karşılama Botu & Otomatik Rol (Auto-Role)</h2>
                <p className="text-xs text-white/50">
                  Sunucuya yeni katılan kullanıcıları otomatik karşılayın ve başlangıç rollerini tanımlayın.
                </p>
              </div>

              {/* Welcome Bot Toggle */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Karşılama Mesajları</h4>
                  <p className="text-[11px] text-white/50">
                    Yeni üyeler sunucuya katıldığında seçilen kanala otomatik karşılama kartı gönderir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWelcomeEnabled(!welcomeEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    welcomeEnabled ? 'bg-amber-500' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      welcomeEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {welcomeEnabled && (
                <>
                  {/* Target Channel */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                      Karşılama Kanalı
                    </label>
                    <select
                      value={welcomeChannelId}
                      onChange={(e) => setWelcomeChannelId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-amber-500 outline-none text-xs text-white"
                    >
                      {server.channels
                        .filter((c) => c.type === 'text')
                        .map((c) => (
                          <option key={c.id} value={c.id} className="bg-neutral-900">
                            #{c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Custom Welcome Template */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 uppercase mb-2">
                      Karşılama Mesajı Şablonu
                    </label>
                    <textarea
                      rows={3}
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="🎉 **{user}** sunucumuza katıldı! Hoş geldin! 🚀"
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-amber-500 outline-none text-xs text-white resize-none"
                    />
                    <p className="text-[10px] text-white/40 mt-1">
                      Kullanılabilir etiketler: <code className="text-amber-300 font-mono">{"{user}"}</code> (üye adı), <code className="text-amber-300 font-mono">{"{server}"}</code> (sunucu adı)
                    </p>
                  </div>
                </>
              )}

              {/* Auto-Role Assignment */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white">Otomatik Başlangıç Rolü (Auto-Role)</h4>
                  <p className="text-[11px] text-white/50">
                    Sunucuya katılan yeni kullanıcılara verilecek başlangıç rolü.
                  </p>
                </div>

                <select
                  value={autoRoleId}
                  onChange={(e) => setAutoRoleId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-amber-500 outline-none text-xs text-white"
                >
                  <option value="" className="bg-neutral-900">Otomatik rol yok (Yalnızca @everyone)</option>
                  {(server.roles || [])
                    .filter((r) => !r.isDefault && r.id !== 'role-owner')
                    .map((r) => (
                      <option key={r.id} value={r.id} className="bg-neutral-900">
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>

              {canManageServer && (
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition shadow-lg shadow-amber-500/20"
                >
                  Bot ve Karşılama Ayarlarını Kaydet
                </button>
              )}
            </form>
          )}

          {/* 6b. WEBHOOKS TAB */}
          {activeTab === 'webhooks' && (
            <Suspense fallback={<div className="text-xs text-white/40 py-8">Yükleniyor...</div>}>
              <WebhooksTab
                server={server}
                canManage={canManageServer || hasServerPermission('manage_channels')}
              />
            </Suspense>
          )}

          {/* 6c. ONBOARDING TAB */}
          {activeTab === 'onboarding' && (
            <Suspense fallback={<div className="text-xs text-white/40 py-8">Yükleniyor...</div>}>
              <ServerOnboardingTab server={server} canManageServer={canManageServer} />
            </Suspense>
          )}

          {/* 6d. SCHEDULED MESSAGES TAB */}
          {activeTab === 'scheduled' && (
            <Suspense fallback={<div className="text-xs text-white/40 py-8">Yükleniyor...</div>}>
              <ScheduledMessagesTab
                server={server}
                canManage={canManageServer || hasServerPermission('manage_channels')}
              />
            </Suspense>
          )}

          {/* 6e. AUTOMATION & BOTS TAB */}
          {activeTab === 'automation' && (
            <Suspense fallback={<div className="text-xs text-white/40 py-8">Yükleniyor...</div>}>
              <AutomationAndBotsTab server={server} canManageServer={canManageServer} />
            </Suspense>
          )}

          {/* 6f. AUDIT LOG & MODERATION CASES TAB */}
          {activeTab === 'audit_mod' && (
            <Suspense fallback={<div className="text-xs text-white/40 py-8">Yükleniyor...</div>}>
              <ServerAuditAndModTab
                server={server}
                canModerate={
                  canManageServer ||
                  hasServerPermission('kick_members') ||
                  hasServerPermission('ban_members')
                }
              />
            </Suspense>
          )}

          {/* 7. BACKUP & TEMPLATE TAB */}
          {activeTab === 'backup' && (
            <div className="space-y-6 max-w-lg">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white mb-1">Sunucu Yedekleme & Şablon</h2>
                <p className="text-xs text-white/50">
                  Sunucunuzun tüm kanal yapısını, rollerini, yetkilerini ve ses kalitesi ayarlarını JSON formatında dışa aktarın veya hazır bir şablon yükleyin.
                </p>
              </div>

              {/* Export Card */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Şablonu Dışa Aktar (JSON)</h4>
                    <p className="text-[11px] text-white/50">
                      Mevcut kanallar ({server.channels?.length || 0}), roller ({server.roles?.length || 0}) ve sunucu ayarlarını dosya olarak kaydeder.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Sunucu Yedeğini İndir (.json)</span>
                </button>
              </div>

              {/* Import Card */}
              {canManageServer && (
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">Yedekten / Şablondan Geri Yükle</h4>
                      <p className="text-[11px] text-white/50">
                        Önceden indirilmiş bir .json sunucu şablonunu yükleyerek kanal ve rol düzenini otomatik uygulayın.
                      </p>
                    </div>
                  </div>

                  <label className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Şablon / Yedek Dosyası Seç (.json)</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={handleImportBackup}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* 7. DANGER ZONE TAB */}
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
