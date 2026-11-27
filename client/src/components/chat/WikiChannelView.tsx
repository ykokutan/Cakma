import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit3,
  History,
  RotateCcw,
  Trash2,
  Save,
  Lock,
  CheckCircle,
} from 'lucide-react';
import type { Channel, Server, WikiPage } from '../../types';
import { useSocket } from '../../context/SocketContext';
import { InlineMarkdown } from './MessageTextRenderer';
import { appConfirm, appToast } from '../../utils/appDialogs';

interface WikiChannelViewProps {
  server: Server;
  channel: Channel;
}

export const WikiChannelView: React.FC<WikiChannelViewProps> = ({ server, channel }) => {
  const { socket, currentUser, hasServerPermission } = useSocket();
  const pages = channel.wikiPages || [];
  const [selectedPageId, setSelectedPageId] = useState<string | null>(() => pages[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftSummary, setDraftSummary] = useState('');

  const canEdit =
    channel.collabMode === 'admins_only'
      ? hasServerPermission('manage_channels')
      : hasServerPermission('send_messages');

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
    );
  }, [pages, searchQuery]);

  const activePage: WikiPage | null = useMemo(() => {
    if (isCreatingNew) return null;
    if (selectedPageId) {
      const hit = pages.find((p) => p.id === selectedPageId);
      if (hit) return hit;
    }
    return pages[0] || null;
  }, [pages, selectedPageId, isCreatingNew]);

  const startCreateNew = () => {
    if (!canEdit) return;
    setIsCreatingNew(true);
    setIsEditing(true);
    setShowRevisions(false);
    setDraftTitle('');
    setDraftContent('# Yeni Rehber Başlığı\n\nEkibiniz için kural veya dokümantasyon yazın...');
    setDraftSummary('İlk sürüm');
  };

  const startEditPage = (page: WikiPage) => {
    if (!canEdit) return;
    setIsCreatingNew(false);
    setIsEditing(true);
    setShowRevisions(false);
    setDraftTitle(page.title);
    setDraftContent(page.content);
    setDraftSummary('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !draftTitle.trim()) return;
    socket.emit('wiki_page_upsert', {
      serverId: server.id,
      channelId: channel.id,
      pageId: isCreatingNew ? undefined : activePage?.id,
      title: draftTitle.trim(),
      content: draftContent,
      summary: draftSummary.trim() || undefined,
    });
    setIsEditing(false);
    setIsCreatingNew(false);
    appToast('Wiki sayfası kaydedildi!', 'success');
  };

  const handleDelete = async (page: WikiPage) => {
    if (!socket || !canEdit) return;
    const ok = await appConfirm({
      title: 'Sayfayı Sil',
      message: `"${page.title}" wiki sayfası kalıcı olarak silinsin mi?`,
      danger: true,
    });
    if (!ok) return;
    socket.emit('wiki_page_delete', {
      serverId: server.id,
      channelId: channel.id,
      pageId: page.id,
    });
    setSelectedPageId(null);
    setIsEditing(false);
    appToast('Wiki sayfası silindi.', 'info');
  };

  const handleRestoreRevision = async (pageId: string, revisionId: string) => {
    if (!socket || !canEdit) return;
    socket.emit('wiki_page_restore_revision', {
      serverId: server.id,
      channelId: channel.id,
      pageId,
      revisionId,
    });
    setShowRevisions(false);
    appToast('Önceki sürüm geri yüklendi.', 'success');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-black/15">
      {/* Left Sidebar: Wiki Index */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/10 p-3 flex flex-col gap-2.5 shrink-0 bg-black/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Sayfalar ({pages.length})</span>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={startCreateNew}
              className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-[11px] font-semibold text-emerald-200 flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3" />
              <span>Yeni Sayfa</span>
            </button>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              Salt Okunur
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sayfa ara..."
            className="w-full bg-black/35 border border-white/10 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 max-h-40 md:max-h-none">
          {filteredPages.length === 0 ? (
            <div className="text-[11px] text-white/40 p-2 text-center">
              Henüz wiki sayfası bulunmuyor.
            </div>
          ) : (
            filteredPages.map((p) => {
              const isSelected = !isCreatingNew && activePage?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setIsCreatingNew(false);
                    setIsEditing(false);
                    setShowRevisions(false);
                    setSelectedPageId(p.id);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-xl border transition ${
                    isSelected
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-white'
                      : 'bg-white/[0.03] border-transparent hover:bg-white/[0.07] text-white/75'
                  }`}
                >
                  <div className="text-xs font-semibold truncate">{p.title}</div>
                  <div className="text-[10px] text-white/40 truncate">
                    Son: {p.updatedBy} · {new Date(p.updatedAt).toLocaleDateString('tr-TR')}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
        {isEditing ? (
          <form onSubmit={handleSave} className="flex-1 flex flex-col p-4 sm:p-6 gap-3 min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                {isCreatingNew ? 'Yeni Wiki Sayfası' : `"${activePage?.title}" Düzenle`}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setIsCreatingNew(false);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white/75 transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-black flex items-center gap-1.5 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Kaydet</span>
                </button>
              </div>
            </div>

            <input
              type="text"
              required
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Sayfa başlığı (örn: Sunucu Kuralları)"
              className="bg-black/35 border border-white/15 rounded-xl px-3.5 py-2 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={14}
              placeholder="Markdown / metin içeriğinizi yazın..."
              className="flex-1 min-h-[260px] bg-black/35 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
            <input
              type="text"
              value={draftSummary}
              onChange={(e) => setDraftSummary(e.target.value)}
              placeholder="Değişiklik notu (isteğe bağlı, örn: Kural 3 güncellendi)"
              className="bg-black/35 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
            />
          </form>
        ) : activePage ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 bg-white/[0.02]">
              <div>
                <h2 className="text-lg font-extrabold text-white tracking-tight">{activePage.title}</h2>
                <div className="text-[11px] text-white/45 flex items-center gap-2">
                  <span>Son düzenleyen: <strong className="text-white/75">{activePage.updatedBy}</strong></span>
                  <span>·</span>
                  <span>{new Date(activePage.updatedAt).toLocaleString('tr-TR')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevisions((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                    showRevisions
                      ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
                      : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Geçmiş ({activePage.revisions?.length || 0})</span>
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEditPage(activePage)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-xs font-semibold text-emerald-200 flex items-center gap-1.5 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Düzenle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(activePage)}
                      className="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 transition"
                      title="Sayfayı Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {showRevisions && (
              <div className="border-b border-white/10 bg-black/35 p-3.5 max-h-52 overflow-y-auto space-y-2">
                <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                  Sürüm Geçmişi
                </div>
                {(activePage.revisions || []).length === 0 ? (
                  <div className="text-xs text-white/45">Henüz kayıtlı eski sürüm bulunmuyor.</div>
                ) : (
                  activePage.revisions.map((rev) => (
                    <div
                      key={rev.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="text-white/85 font-semibold truncate">
                          {rev.editedBy} · {new Date(rev.editedAt).toLocaleString('tr-TR')}
                        </div>
                        {rev.summary && <div className="text-[11px] text-white/50 truncate">{rev.summary}</div>}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void handleRestoreRevision(activePage.id, rev.id)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-500/25 hover:bg-indigo-500/40 border border-indigo-400/35 text-[11px] font-semibold text-indigo-100 flex items-center gap-1 shrink-0 transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Geri Yükle</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 text-sm text-white/85 leading-relaxed">
              {activePage.content.split(/\r?\n/).map((line, idx) => {
                if (line.startsWith('### ')) {
                  return <h4 key={idx} className="text-sm font-bold text-emerald-300 pt-2">{line.slice(4)}</h4>;
                }
                if (line.startsWith('## ')) {
                  return <h3 key={idx} className="text-base font-bold text-white pt-3">{line.slice(3)}</h3>;
                }
                if (line.startsWith('# ')) {
                  return <h2 key={idx} className="text-xl font-extrabold text-white border-b border-white/10 pb-1.5">{line.slice(2)}</h2>;
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return (
                    <div key={idx} className="flex items-start gap-2 pl-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-1 shrink-0" />
                      <span><InlineMarkdown text={line.slice(2)} customEmojis={server.customEmojis} /></span>
                    </div>
                  );
                }
                if (!line.trim()) return <div key={idx} className="h-2" />;
                return (
                  <p key={idx}>
                    <InlineMarkdown text={line} customEmojis={server.customEmojis} />
                  </p>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3 text-white/60">
            <BookOpen className="w-10 h-10 text-emerald-400/70" />
            <div>
              <div className="text-sm font-bold text-white">#{channel.name} Wiki Bilgi Bankası</div>
              <p className="text-xs text-white/50 mt-1 max-w-sm">
                Kurallar, oyun rehberleri ve sabit ekip notlarını düzenli sayfalar halinde burada tutun.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={startCreateNew}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-black flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>İlk Sayfayı Oluştur</span>
              </button>
            )}
            {currentUser?.role === 'user' && !canEdit && (
              <span className="text-[11px] text-white/40">Yöneticiler sayfa eklediğinde burada görünecek.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
