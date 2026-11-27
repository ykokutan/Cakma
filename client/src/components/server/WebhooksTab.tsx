import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Copy, Loader2, Plus, Send, Trash2, Webhook } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import type { BridgeDirection, BridgePlatform, PublicChannelBridgeView, Server, ServerWebhook } from '../../types';
import { authFetch, resolveBackendBaseUrl } from '../../utils/authFetch';
import { appConfirm, appToast } from '../../utils/appDialogs';
import { t } from '../../utils/i18n';

interface WebhooksTabProps {
  server: Server;
  canManage: boolean;
}

const WEBHOOK_ICONS = ['🪝', '🤖', '🛠️', '🚀', '📣', '⚡'];

export const WebhooksTab: React.FC<WebhooksTabProps> = ({ server, canManage }) => {
  const { currentServerHost, language } = useSocket();
  const nonVoiceChannels = (server.channels || []).filter((c) => c.type !== 'voice');

  const [webhooks, setWebhooks] = useState<ServerWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [channelId, setChannelId] = useState<string>(nonVoiceChannels[0]?.id || '');
  const [avatar, setAvatar] = useState('🪝');

  // Bidirectional Channel Bridges (Telegram & Discord)
  const bridgeEligibleChannels = (server.channels || []).filter(
    (c) => c.type === 'text' || c.type === 'announcement'
  );
  const [bridges, setBridges] = useState<PublicChannelBridgeView[]>([]);
  const [loadingBridges, setLoadingBridges] = useState(true);
  const [bridgePlatform, setBridgePlatform] = useState<BridgePlatform>('telegram');
  const [bridgeDirection, setBridgeDirection] = useState<BridgeDirection>('both');
  const [bridgeName, setBridgeName] = useState('');
  const [bridgeChannelId, setBridgeChannelId] = useState<string>(bridgeEligibleChannels[0]?.id || '');
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgMode, setTgMode] = useState<'polling' | 'webhook'>('polling');
  const [dcWebhookUrl, setDcWebhookUrl] = useState('');
  const [dcBotToken, setDcBotToken] = useState('');
  const [dcChannelId, setDcChannelId] = useState('');
  const [creatingBridge, setCreatingBridge] = useState(false);
  const [busyBridgeId, setBusyBridgeId] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId && nonVoiceChannels.length > 0) {
      setChannelId(nonVoiceChannels[0].id);
    }
  }, [channelId, nonVoiceChannels]);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/webhooks`
      );
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.ok && Array.isArray(data.webhooks)) {
        setWebhooks(data.webhooks);
      }
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  }, [currentServerHost, server.id]);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  useEffect(() => {
    if (!bridgeChannelId && bridgeEligibleChannels.length > 0) {
      setBridgeChannelId(bridgeEligibleChannels[0].id);
    }
  }, [bridgeChannelId, bridgeEligibleChannels]);

  const fetchBridges = useCallback(async () => {
    setLoadingBridges(true);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/bridges`
      );
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.ok && Array.isArray(data.bridges)) {
        setBridges(data.bridges);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBridges(false);
    }
  }, [currentServerHost, server.id]);

  useEffect(() => {
    void fetchBridges();
  }, [fetchBridges]);

  const handleCreateBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !bridgeChannelId) return;
    setCreatingBridge(true);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/bridges`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: bridgePlatform,
            direction: bridgeDirection,
            channelId: bridgeChannelId,
            name: bridgeName.trim() || `${bridgePlatform.toUpperCase()} Köprüsü`,
            telegramBotToken: tgBotToken.trim() || undefined,
            telegramChatId: tgChatId.trim() || undefined,
            telegramMode: tgMode,
            discordWebhookUrl: dcWebhookUrl.trim() || undefined,
            discordBotToken: dcBotToken.trim() || undefined,
            discordChannelId: dcChannelId.trim() || undefined,
          }),
        }
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok || !data.bridge) {
        appToast(data?.error || 'Kanal köprüsü oluşturulamadı.', 'error');
        return;
      }
      setBridges((prev) => [...prev, data.bridge]);
      setBridgeName('');
      setTgBotToken('');
      setTgChatId('');
      setDcWebhookUrl('');
      setDcBotToken('');
      setDcChannelId('');
      appToast('Çift yönlü kanal köprüsü oluşturuldu!', 'success');
    } catch {
      appToast('Köprü oluşturulurken ağ hatası oluştu.', 'error');
    } finally {
      setCreatingBridge(false);
    }
  };

  const handleToggleBridge = async (b: PublicChannelBridgeView) => {
    setBusyBridgeId(`toggle:${b.id}`);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/bridges/${encodeURIComponent(b.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !b.enabled }),
        }
      );
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.ok && data.bridge) {
        setBridges((prev) => prev.map((x) => (x.id === b.id ? data.bridge : x)));
      }
    } finally {
      setBusyBridgeId(null);
    }
  };

  const handleTestBridge = async (b: PublicChannelBridgeView) => {
    setBusyBridgeId(`test:${b.id}`);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/bridges/${encodeURIComponent(b.id)}/test`,
        { method: 'POST' }
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        appToast(data?.error || 'Köprü testi başarısız.', 'error');
        return;
      }
      if (data.bridge) {
        setBridges((prev) => prev.map((x) => (x.id === b.id ? data.bridge : x)));
      }
      appToast('Test mesajı karşı platforma gönderildi!', 'success');
    } finally {
      setBusyBridgeId(null);
    }
  };

  const handleDeleteBridge = async (b: PublicChannelBridgeView) => {
    const ok = await appConfirm({
      title: 'Köprüyü Sil',
      message: `"${b.name}" kanal köprüsünü silmek istediğinize emin misiniz?`,
      danger: true,
      confirmLabel: 'Sil',
    });
    if (!ok) return;
    setBusyBridgeId(`del:${b.id}`);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/bridges/${encodeURIComponent(b.id)}`,
        { method: 'DELETE' }
      );
      if (resp.ok) {
        setBridges((prev) => prev.filter((x) => x.id !== b.id));
        appToast('Kanal köprüsü kaldırıldı.', 'info');
      }
    } finally {
      setBusyBridgeId(null);
    }
  };

  const buildWebhookUrl = (wh: ServerWebhook): string => {
    const base = resolveBackendBaseUrl(currentServerHost) || window.location.origin;
    return `${base}/api/webhooks/${encodeURIComponent(wh.id)}/${encodeURIComponent(wh.token)}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !nameInput.trim() || !channelId) return;
    setCreating(true);
    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/webhooks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameInput.trim(),
            channelId,
            avatar,
          }),
        }
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok || !data.webhook) {
        appToast(data?.error || 'Webhook oluşturulamadı.', 'error');
        return;
      }
      setWebhooks((prev) => [...prev, data.webhook]);
      setNameInput('');
      appToast('Webhook oluşturuldu!', 'success');
    } catch {
      appToast('Webhook oluşturulurken bağlantı hatası oluştu.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (wh: ServerWebhook) => {
    const url = buildWebhookUrl(wh);
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedId(wh.id);
        appToast(t(language, 'webhookUrlCopied'), 'success');
        setTimeout(() => setCopiedId((prev) => (prev === wh.id ? null : prev)), 2000);
      })
      .catch(() => {
        appToast('URL panoya kopyalanamadı.', 'error');
      });
  };

  const handleTest = async (wh: ServerWebhook) => {
    setTestingId(wh.id);
    try {
      const url = buildWebhookUrl(wh);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '✅ Test webhook bildirimi başarıyla ulaştı!',
          username: wh.name,
          avatar: wh.avatar || '🪝',
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        appToast(data?.error || 'Test mesajı gönderilemedi.', 'error');
        return;
      }
      appToast('Test webhook mesajı kanala gönderildi!', 'success');
      void fetchWebhooks();
    } catch {
      appToast('Webhook test isteği başarısız oldu.', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (wh: ServerWebhook) => {
    const ok = await appConfirm({
      title: 'Webhook Sil',
      message: `"${wh.name}" webhook'unu silmek istediğinize emin misiniz? Bu URL artık çalışmayacaktır.`,
      danger: true,
      confirmLabel: 'Sil',
    });
    if (!ok) return;

    try {
      const resp = await authFetch(
        currentServerHost,
        `/api/servers/${encodeURIComponent(server.id)}/webhooks/${encodeURIComponent(wh.id)}`,
        { method: 'DELETE' }
      );
      if (!resp.ok) {
        appToast('Webhook silinemedi.', 'error');
        return;
      }
      setWebhooks((prev) => prev.filter((item) => item.id !== wh.id));
      appToast('Webhook silindi.', 'info');
    } catch {
      appToast('Webhook silinirken hata oluştu.', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-1 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-cyan-400" />
          <span>{t(language, 'tabWebhooks')}</span>
        </h2>
        <p className="text-xs text-white/50">
          Forgejo, GitHub veya Discord uyumlu JSON webhook yükleriyle otomatik kanal bildirimleri alın.
        </p>
      </div>

      {canManage && nonVoiceChannels.length > 0 && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3"
        >
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>{t(language, 'createWebhook')}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {WEBHOOK_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setAvatar(ic)}
                className={`w-8 h-8 rounded-xl border text-sm flex items-center justify-center transition ${
                  avatar === ic
                    ? 'bg-cyan-500/25 border-cyan-400 scale-105'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              maxLength={48}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Örn: CI / GitHub Bildirimi"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-cyan-400"
            />
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
            >
              {nonVoiceChannels.map((ch) => (
                <option key={ch.id} value={ch.id} className="bg-neutral-900">
                  #{ch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating || !nameInput.trim() || !channelId}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{t(language, 'createWebhook')}</span>
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-10 text-center text-xs text-white/45 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Webhook&apos;lar yükleniyor...</span>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center text-xs text-white/45">
          Bu sunucuda henüz tanımlanmış webhook yok.
        </div>
      ) : (
        <div className="space-y-2.5">
          {webhooks.map((wh) => {
            const targetCh = nonVoiceChannels.find((c) => c.id === wh.channelId);
            const maskedUrl = `/api/webhooks/${wh.id}/••••••••`;
            return (
              <div
                key={wh.id}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-lg shrink-0">
                      {wh.avatar || '🪝'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{wh.name}</div>
                      <div className="text-[11px] text-white/45 truncate">
                        Kanal: <span className="text-cyan-300 font-semibold">#{targetCh?.name || wh.channelId}</span> · Oluşturan: @{wh.createdBy}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-white/35 shrink-0 text-right">
                    {wh.lastUsedAt
                      ? `Son: ${new Date(wh.lastUsedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`
                      : 'Henüz kullanılmadı'}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-[11px] font-mono text-white/55">
                  <span className="truncate">{maskedUrl}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(wh)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-sans font-semibold flex items-center gap-1 transition"
                    >
                      {copiedId === wh.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === wh.id ? 'Kopyalandı' : 'URL Kopyala'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTest(wh)}
                      disabled={testingId === wh.id}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 text-[11px] font-sans font-semibold flex items-center gap-1 transition disabled:opacity-50"
                    >
                      {testingId === wh.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      <span>{t(language, 'testWebhook')}</span>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(wh)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 transition"
                        title="Webhook Sil"
                        aria-label={`${wh.name} webhook sil`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bidirectional Channel Bridges (Telegram & Discord) */}
      <div className="pt-4 border-t border-white/10 space-y-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-white mb-1 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
            <span>Çift Yönlü Kanal Köprüleri (Telegram &amp; Discord)</span>
          </h3>
          <p className="text-xs text-white/50">
            Seçili metin veya duyuru kanallarını harici Telegram gruplarına veya Discord kanallarına çift yönlü bağlayın (E2EE kanallar güvenlik gereği kapsam dışıdır).
          </p>
        </div>

        {canManage && bridgeEligibleChannels.length > 0 && (
          <form
            onSubmit={handleCreateBridge}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={bridgePlatform}
                onChange={(e) => setBridgePlatform(e.target.value as BridgePlatform)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
              >
                <option value="telegram" className="bg-neutral-900">✈️ Telegram Grubu / Kanalı</option>
                <option value="discord" className="bg-neutral-900">🎮 Discord Kanalı</option>
              </select>
              <select
                value={bridgeChannelId}
                onChange={(e) => setBridgeChannelId(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
              >
                {bridgeEligibleChannels.map((ch) => (
                  <option key={ch.id} value={ch.id} className="bg-neutral-900">
                    #{ch.name}
                  </option>
                ))}
              </select>
              <select
                value={bridgeDirection}
                onChange={(e) => setBridgeDirection(e.target.value as BridgeDirection)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
              >
                <option value="both" className="bg-neutral-900">⇄ Çift Yönlü</option>
                <option value="outbound" className="bg-neutral-900">→ Yalnızca Dışa Aktar</option>
                <option value="inbound" className="bg-neutral-900">← Yalnızca İçe Aktar</option>
              </select>
            </div>

            <input
              type="text"
              value={bridgeName}
              onChange={(e) => setBridgeName(e.target.value)}
              placeholder="Köprü adı (Örn: Genel Telegram Senkron)"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-emerald-400"
            />

            {bridgePlatform === 'telegram' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="password"
                  value={tgBotToken}
                  onChange={(e) => setTgBotToken(e.target.value)}
                  placeholder="Telegram Bot Token"
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="Chat ID (Örn: -1001234567890)"
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
                <select
                  value={tgMode}
                  onChange={(e) => setTgMode(e.target.value === 'webhook' ? 'webhook' : 'polling')}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
                >
                  <option value="polling" className="bg-neutral-900">Otomatik Polling (Önerilen)</option>
                  <option value="webhook" className="bg-neutral-900">Harici Webhook Modu</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="url"
                  value={dcWebhookUrl}
                  onChange={(e) => setDcWebhookUrl(e.target.value)}
                  placeholder="Discord Webhook URL (Giden mesajlar için)"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-emerald-400"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    value={dcBotToken}
                    onChange={(e) => setDcBotToken(e.target.value)}
                    placeholder="Discord Bot Token (İsteğe bağlı, gelen mesajlar için)"
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-emerald-400"
                  />
                  <input
                    type="text"
                    value={dcChannelId}
                    onChange={(e) => setDcChannelId(e.target.value)}
                    placeholder="Discord Kanal ID (Gelen polling için)"
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creatingBridge || !bridgeChannelId}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition"
              >
                {creatingBridge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Köprü Oluştur</span>
              </button>
            </div>
          </form>
        )}

        {loadingBridges ? (
          <div className="py-6 text-center text-xs text-white/45">Köprüler yükleniyor...</div>
        ) : bridges.length === 0 ? (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center text-xs text-white/45">
            Henüz tanımlanmış kanal köprüsü yok.
          </div>
        ) : (
          <div className="space-y-2.5">
            {bridges.map((b) => {
              const targetCh = bridgeEligibleChannels.find((c) => c.id === b.channelId);
              const fullInboundUrl = `${resolveBackendBaseUrl(currentServerHost) || window.location.origin}${b.inboundPath}`;
              return (
                <div
                  key={b.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{b.platform === 'telegram' ? '✈️' : '🎮'}</span>
                        <span className="text-xs font-bold text-white truncate">{b.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            b.enabled
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                              : 'bg-white/5 border-white/10 text-white/45'
                          }`}
                        >
                          {b.enabled ? 'Aktif' : 'Duraklatıldı'}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/50 mt-0.5">
                        #{targetCh?.name || b.channelId} · Yön: {b.direction === 'both' ? 'Çift Yönlü' : b.direction === 'outbound' ? 'Dışa' : 'İçe'}
                        {b.lastSyncAt && ` · Son: ${new Date(b.lastSyncAt).toLocaleTimeString('tr-TR')}`}
                      </div>
                      {b.lastError && (
                        <div className="text-[10px] text-rose-300 mt-0.5 truncate">⚠️ {b.lastError}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleBridge(b)}
                        disabled={busyBridgeId !== null}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition"
                      >
                        {b.enabled ? 'Duraklat' : 'Etkinleştir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTestBridge(b)}
                        disabled={busyBridgeId !== null}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[10px] font-bold transition"
                      >
                        {busyBridgeId === `test:${b.id}` ? '...' : 'Test'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(fullInboundUrl).then(() => {
                            appToast('Gelen köprü webhook URL kopyalandı.', 'success');
                          });
                        }}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
                        title="Gelen Webhook URL Kopyala"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteBridge(b)}
                        disabled={busyBridgeId !== null}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 transition"
                        title="Köprüyü Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
