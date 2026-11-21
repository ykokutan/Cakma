import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Check, Copy, Loader2, Plus, Terminal, Trash2, Workflow } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type {
  AutomationActionType,
  AutomationTriggerType,
  BotEventType,
  BotSlashCommand,
  Server,
  ServerAutomationRule,
  ServerBotPublic,
  ServerPermission,
} from '../../types';
import { appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';

interface AutomationAndBotsTabProps {
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

const BOT_AVATARS = ['🤖', '⚡', '🛡️', '🎯', '🚀', '🧠'];

export const AutomationAndBotsTab: React.FC<AutomationAndBotsTabProps> = ({
  server,
  canManageServer,
}) => {
  const {
    fetchServerBots,
    createServerBot,
    updateServerBot,
    deleteServerBot,
    fetchServerAutomations,
    createServerAutomation,
    updateServerAutomation,
    deleteServerAutomation,
    language,
  } = useSocket();

  const [subTab, setSubTab] = useState<'automations' | 'bots'>('automations');
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<ServerAutomationRule[]>([]);
  const [bots, setBots] = useState<ServerBotPublic[]>([]);

  // Automation creation state
  const [ruleName, setRuleName] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('message_contains');
  const [keywordsText, setKeywordsText] = useState('');
  const [spamCount, setSpamCount] = useState(5);
  const [spamWindowSeconds, setSpamWindowSeconds] = useState(8);
  const [actionType, setActionType] = useState<AutomationActionType>('delete_message');
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [roleId, setRoleId] = useState('');
  const [noticeChannelId, setNoticeChannelId] = useState('');
  const [noticeTemplate, setNoticeTemplate] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  // Bot creation state
  const [botName, setBotName] = useState('');
  const [botAvatar, setBotAvatar] = useState('🤖');
  const [botWebhookUrl, setBotWebhookUrl] = useState('');
  const [botEvents, setBotEvents] = useState<BotEventType[]>(['message_create']);
  const [slashDrafts, setSlashDrafts] = useState<BotSlashCommand[]>([]);
  const [cmdName, setCmdName] = useState('');
  const [cmdDesc, setCmdDesc] = useState('');
  const [cmdTemplate, setCmdTemplate] = useState('');
  const [savingBot, setSavingBot] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const nonVoiceChannels = (server.channels || []).filter(
    (c) => c.type !== 'voice' && c.type !== 'stage'
  );
  const safeAssignableRoles = (server.roles || []).filter(
    (r) =>
      !r.isDefault &&
      r.id !== 'role-owner' &&
      !r.permissions.some((p) => PRIVILEGED_PERMS.has(p))
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [rulesRes, botsRes] = await Promise.all([
      fetchServerAutomations(server.id),
      fetchServerBots(server.id),
    ]);
    setRules(rulesRes);
    setBots(botsRes);
    setLoading(false);
  }, [fetchServerAutomations, fetchServerBots, server.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageServer || !ruleName.trim()) return;
    setSavingRule(true);
    const keywords = keywordsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await createServerAutomation(server.id, {
      name: ruleName.trim(),
      triggerType,
      ...(triggerType === 'message_contains' && keywords.length > 0 ? { keywords } : {}),
      ...(triggerType === 'spam_burst' ? { spamCount, spamWindowSeconds } : {}),
      actionType,
      ...(actionType === 'timeout_user' ? { timeoutMinutes } : {}),
      ...(actionType === 'assign_role' && roleId ? { roleId } : {}),
      ...(actionType === 'send_channel_notice'
        ? {
            noticeChannelId: noticeChannelId || nonVoiceChannels[0]?.id,
            noticeTemplate: noticeTemplate.trim() || '👋 Hoş geldin {user}!',
          }
        : {}),
    });
    setSavingRule(false);
    if (!res.success) {
      appToast(res.error || 'Otomasyon kuralı oluşturulamadı.', 'error');
      return;
    }
    appToast('Otomasyon kuralı eklendi.', 'success');
    setRuleName('');
    setKeywordsText('');
    setNoticeTemplate('');
    await loadAll();
  };

  const handleAddSlashDraft = () => {
    const clean = cmdName.replace(/^\/+/, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean) return;
    setSlashDrafts((prev) => [
      ...prev.filter((c) => c.name !== clean),
      {
        name: clean,
        description: cmdDesc.trim() || `${clean} komutu`,
        responseTemplate: cmdTemplate.trim() || '✅ Komut çalıştırıldı ({user}).',
      },
    ]);
    setCmdName('');
    setCmdDesc('');
    setCmdTemplate('');
  };

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageServer || !botName.trim()) return;
    setSavingBot(true);
    const res = await createServerBot(server.id, {
      name: botName.trim(),
      avatar: botAvatar,
      ...(botWebhookUrl.trim() ? { webhookUrl: botWebhookUrl.trim() } : {}),
      events: botEvents,
      slashCommands: slashDrafts,
    });
    setSavingBot(false);
    if (!res.success) {
      appToast(res.error || 'Bot oluşturulamadı.', 'error');
      return;
    }
    if (res.botToken) {
      setRevealedToken(res.botToken);
      setTokenCopied(false);
    }
    appToast('Bot oluşturuldu!', 'success');
    setBotName('');
    setBotWebhookUrl('');
    setSlashDrafts([]);
    await loadAll();
  };

  const toggleBotEvent = (ev: BotEventType) => {
    setBotEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-1">
          {t(language, 'automationRules')} &amp; {t(language, 'botsAndCommands')}
        </h2>
        <p className="text-xs text-white/50">
          Kodsuz AutoMod iş akışları tanımlayın veya REST/Webhook botları ile özel <code className="text-indigo-300">/komutlar</code> oluşturun.
        </p>
      </div>

      <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10 w-fit">
        <button
          type="button"
          onClick={() => setSubTab('automations')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
            subTab === 'automations' ? 'bg-indigo-500 text-white shadow' : 'text-white/60 hover:text-white'
          }`}
        >
          <Workflow className="w-3.5 h-3.5" />
          <span>{t(language, 'automationRules')} ({rules.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('bots')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
            subTab === 'bots' ? 'bg-emerald-500 text-black shadow' : 'text-white/60 hover:text-white'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>{t(language, 'botsAndCommands')} ({bots.length})</span>
        </button>
      </div>

      {subTab === 'automations' ? (
        <>
          {canManageServer && (
            <form
              onSubmit={handleCreateRule}
              className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Kural adı (Örn: Link Koruması)"
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-indigo-400"
                />
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
                >
                  <option value="message_contains" className="bg-neutral-900">Mesaj Anahtar Kelime</option>
                  <option value="spam_burst" className="bg-neutral-900">Spam Patlaması</option>
                  <option value="link_posted" className="bg-neutral-900">Link Paylaşıldı</option>
                  <option value="member_join" className="bg-neutral-900">Üye Katıldı</option>
                </select>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as AutomationActionType)}
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none"
                >
                  <option value="delete_message" className="bg-neutral-900">Mesajı Sil</option>
                  <option value="warn_member" className="bg-neutral-900">Üyeyi Uyar (Case)</option>
                  <option value="timeout_user" className="bg-neutral-900">Sustur (Timeout)</option>
                  <option value="assign_role" className="bg-neutral-900">Rol Ata</option>
                  <option value="send_channel_notice" className="bg-neutral-900">Kanala Bildirim Yaz</option>
                </select>
              </div>

              {triggerType === 'message_contains' && (
                <input
                  type="text"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="Anahtar kelimeler (virgülle ayırın: reklam, bahis, spam)"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-indigo-400"
                />
              )}

              {triggerType === 'spam_burst' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-white/50 uppercase mb-1">Mesaj Eşiği</label>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={spamCount}
                      onChange={(e) => setSpamCount(Number(e.target.value) || 5)}
                      className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/50 uppercase mb-1">Süre Penceresi (sn)</label>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={spamWindowSeconds}
                      onChange={(e) => setSpamWindowSeconds(Number(e.target.value) || 8)}
                      className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {actionType === 'timeout_user' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">Susturma Süresi (dk):</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={timeoutMinutes}
                    onChange={(e) => setTimeoutMinutes(Number(e.target.value) || 5)}
                    className="w-24 px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  />
                </div>
              )}

              {actionType === 'assign_role' && (
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                >
                  <option value="" className="bg-neutral-900">Atanacak güvenli rol seçin...</option>
                  {safeAssignableRoles.map((r) => (
                    <option key={r.id} value={r.id} className="bg-neutral-900">{r.name}</option>
                  ))}
                </select>
              )}

              {actionType === 'send_channel_notice' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={noticeChannelId || nonVoiceChannels[0]?.id || ''}
                    onChange={(e) => setNoticeChannelId(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  >
                    {nonVoiceChannels.map((c) => (
                      <option key={c.id} value={c.id} className="bg-neutral-900">#{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={noticeTemplate}
                    onChange={(e) => setNoticeTemplate(e.target.value)}
                    placeholder="Şablon: Hoş geldin {user}!"
                    className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingRule || !ruleName.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-40 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{savingRule ? 'Ekleniyor...' : t(language, 'createRule')}</span>
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>
          ) : rules.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
              Henüz otomasyon kuralı tanımlanmadı.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">{r.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                        {r.triggerType} → {r.actionType}
                      </span>
                    </div>
                    {r.keywords && r.keywords.length > 0 && (
                      <div className="text-[11px] text-white/50 truncate">
                        Kelimeler: {r.keywords.join(', ')}
                      </div>
                    )}
                  </div>
                  {canManageServer && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await updateServerAutomation(server.id, r.id, { enabled: !r.enabled });
                          if (res.success && res.rule) {
                            setRules((prev) => prev.map((x) => (x.id === r.id ? res.rule! : x)));
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                          r.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
                        }`}
                      >
                        {r.enabled ? 'Aktif' : 'Pasif'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await deleteServerAutomation(server.id, r.id)) {
                            setRules((prev) => prev.filter((x) => x.id !== r.id));
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/20 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {revealedToken && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 space-y-2">
              <div className="text-xs font-bold text-emerald-200">
                Bot Token (Yalnızca Bir Kez Gösterilir — Güvenli Yerde Saklayın)
              </div>
              <div className="flex items-center gap-2 bg-black/50 rounded-xl p-2 border border-white/10">
                <code className="flex-1 text-[11px] font-mono text-emerald-300 break-all">
                  {revealedToken}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedToken);
                    setTokenCopied(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  {tokenCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{tokenCopied ? 'Kopyalandı' : 'Kopyala'}</span>
                </button>
              </div>
            </div>
          )}

          {canManageServer && (
            <form
              onSubmit={handleCreateBot}
              className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  {BOT_AVATARS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setBotAvatar(em)}
                      className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition ${
                        botAvatar === em ? 'bg-emerald-500/30 ring-1 ring-emerald-400' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="Bot adı (Örn: ModYardımcı)"
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-emerald-400"
                />
              </div>

              <input
                type="url"
                value={botWebhookUrl}
                onChange={(e) => setBotWebhookUrl(e.target.value)}
                placeholder="Giden Olay Webhook URL (İsteğe bağlı: https://...)"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-emerald-400"
              />

              <div className="flex flex-wrap gap-2">
                {(['message_create', 'member_join', 'reaction_add'] as BotEventType[]).map((ev) => (
                  <label
                    key={ev}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/30 border border-white/10 text-[11px] text-white/80 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={botEvents.includes(ev)}
                      onChange={() => toggleBotEvent(ev)}
                    />
                    <span className="font-mono">{ev}</span>
                  </label>
                ))}
              </div>

              {/* Custom Slash Commands Builder */}
              <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
                <div className="text-[11px] font-bold text-white/70 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Özel /Komut Ekle (İsteğe bağlı)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={cmdName}
                    onChange={(e) => setCmdName(e.target.value)}
                    placeholder="komut-adi"
                    className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white font-mono"
                  />
                  <input
                    type="text"
                    value={cmdDesc}
                    onChange={(e) => setCmdDesc(e.target.value)}
                    placeholder="Açıklama"
                    className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={cmdTemplate}
                      onChange={(e) => setCmdTemplate(e.target.value)}
                      placeholder="Yanıt şablonu"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddSlashDraft}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                {slashDrafts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {slashDrafts.map((c) => (
                      <span
                        key={c.name}
                        className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-mono flex items-center gap-1"
                      >
                        /{c.name}
                        <button
                          type="button"
                          onClick={() => setSlashDrafts((prev) => prev.filter((x) => x.name !== c.name))}
                          className="text-white/60 hover:text-white"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingBot || !botName.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{savingBot ? 'Oluşturuluyor...' : t(language, 'createBot')}</span>
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>
          ) : bots.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
              Bu sunucuda henüz kayıtlı bot yok.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {bots.map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-lg shrink-0">
                      {b.avatar || '🤖'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{b.name}</span>
                        <span className="text-[10px] font-mono text-white/40">{b.tokenPrefix}</span>
                      </div>
                      <div className="text-[11px] text-white/50 truncate">
                        {(b.slashCommands || []).map((c) => `/${c.name}`).join(' ') || 'Özel komut yok'}
                      </div>
                    </div>
                  </div>

                  {canManageServer && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await updateServerBot(server.id, b.id, { enabled: !b.enabled });
                          if (res.success && res.bot) {
                            setBots((prev) => prev.map((x) => (x.id === b.id ? res.bot! : x)));
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                          b.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
                        }`}
                      >
                        {b.enabled ? 'Aktif' : 'Pasif'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await deleteServerBot(server.id, b.id)) {
                            setBots((prev) => prev.filter((x) => x.id !== b.id));
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-300 hover:bg-rose-500/20 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
