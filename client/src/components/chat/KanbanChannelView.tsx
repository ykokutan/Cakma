import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowRight, ArrowLeft, Calendar, User as UserIcon, Lock, X } from 'lucide-react';
import type { Channel, KanbanCard, Server } from '../../types';
import { useSocket } from '../../context/SocketContext';
import { appToast } from '../../utils/appDialogs';

interface KanbanChannelViewProps {
  server: Server;
  channel: Channel;
}

const COLUMNS: Array<{ id: KanbanCard['columnId']; title: string; accent: string }> = [
  { id: 'todo', title: 'Yapılacak', accent: 'border-amber-400/35 text-amber-300' },
  { id: 'in_progress', title: 'Sürüyor', accent: 'border-cyan-400/35 text-cyan-300' },
  { id: 'done', title: 'Tamamlandı', accent: 'border-emerald-400/35 text-emerald-300' },
];

export const KanbanChannelView: React.FC<KanbanChannelViewProps> = ({ server, channel }) => {
  const { socket, hasServerPermission } = useSocket();
  const cards = channel.kanbanCards || [];
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [editorCard, setEditorCard] = useState<Partial<KanbanCard> & { columnId: KanbanCard['columnId'] } | null>(null);
  const [labelsInput, setLabelsInput] = useState('');

  const canEdit =
    channel.collabMode === 'admins_only'
      ? hasServerPermission('manage_channels')
      : hasServerPermission('send_messages');

  const memberNames = useMemo(() => {
    const names = (server.members || []).map((m) => m.username).filter(Boolean);
    return Array.from(new Set(names));
  }, [server.members]);

  const openNewCard = (columnId: KanbanCard['columnId']) => {
    if (!canEdit) return;
    setEditorCard({ columnId, title: '', description: '', assigneeUsername: '', dueDate: '', labels: [] });
    setLabelsInput('');
  };

  const openEditCard = (card: KanbanCard) => {
    if (!canEdit) return;
    setEditorCard({ ...card });
    setLabelsInput((card.labels || []).join(', '));
  };

  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !editorCard || !editorCard.title?.trim()) return;
    const labels = labelsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    socket.emit('kanban_card_upsert', {
      serverId: server.id,
      channelId: channel.id,
      cardId: editorCard.id,
      title: editorCard.title.trim(),
      description: editorCard.description?.trim() || undefined,
      columnId: editorCard.columnId,
      assigneeUsername: editorCard.assigneeUsername?.trim() || undefined,
      dueDate: editorCard.dueDate?.trim() || undefined,
      labels,
    });
    setEditorCard(null);
    appToast('Görev kartı kaydedildi!', 'success');
  };

  const moveCard = (cardId: string, toColumnId: KanbanCard['columnId']) => {
    if (!socket || !canEdit) return;
    socket.emit('kanban_card_move', {
      serverId: server.id,
      channelId: channel.id,
      cardId,
      toColumnId,
    });
  };

  const deleteCard = (cardId: string) => {
    if (!socket || !canEdit) return;
    socket.emit('kanban_card_delete', {
      serverId: server.id,
      channelId: channel.id,
      cardId,
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 pb-3 shrink-0">
        <div className="text-xs text-white/55">
          Toplam <strong className="text-white">{cards.length}</strong> görev kartı · Kartları sütunlar arasında sürükleyip bırakabilirsiniz.
        </div>
        {!canEdit && (
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/10 text-white/60 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Yalnızca yöneticiler düzenleyebilir
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-3.5 overflow-y-auto md:overflow-hidden">
        {COLUMNS.map((col, colIdx) => {
          const colCards = cards
            .filter((c) => c.columnId === col.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                if (canEdit && draggingCardId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const droppedId = draggingCardId || e.dataTransfer.getData('text/plain');
                setDraggingCardId(null);
                if (droppedId && canEdit) {
                  moveCard(droppedId, col.id);
                }
              }}
              className="rounded-2xl bg-black/25 border border-white/10 flex flex-col min-h-[260px] overflow-hidden"
            >
              <div className={`px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between bg-white/[0.03]`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${col.accent.split(' ')[1]}`}>{col.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/75 font-mono">
                    {colCards.length}
                  </span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openNewCard(col.id)}
                    className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center transition"
                    title="Bu sütuna kart ekle"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                {colCards.length === 0 ? (
                  <div className="text-[11px] text-white/35 text-center py-8 border border-dashed border-white/10 rounded-xl">
                    Kart yok
                  </div>
                ) : (
                  colCards.map((card) => (
                    <div
                      key={card.id}
                      draggable={canEdit}
                      onDragStart={(e) => {
                        setDraggingCardId(card.id);
                        e.dataTransfer.setData('text/plain', card.id);
                      }}
                      onDragEnd={() => setDraggingCardId(null)}
                      onClick={() => canEdit && openEditCard(card)}
                      className={`p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 space-y-2 transition ${
                        canEdit ? 'cursor-pointer' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-bold text-white leading-snug">{card.title}</div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCard(card.id);
                            }}
                            className="text-white/35 hover:text-rose-400 transition shrink-0"
                            title="Kartı Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {card.description && (
                        <p className="text-[11px] text-white/60 line-clamp-2">{card.description}</p>
                      )}

                      {card.labels && card.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {card.labels.map((lb) => (
                            <span
                              key={lb}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-400/30 text-purple-200"
                            >
                              {lb}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-white/50">
                        <div className="flex items-center gap-2 min-w-0">
                          {card.assigneeUsername && (
                            <span className="inline-flex items-center gap-1 text-cyan-300 truncate">
                              <UserIcon className="w-3 h-3" />
                              {card.assigneeUsername}
                            </span>
                          )}
                          {card.dueDate && (
                            <span className="inline-flex items-center gap-1 text-amber-300 shrink-0">
                              <Calendar className="w-3 h-3" />
                              {card.dueDate}
                            </span>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {colIdx > 0 && (
                              <button
                                type="button"
                                onClick={() => moveCard(card.id, COLUMNS[colIdx - 1].id)}
                                className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/80"
                                title={`${COLUMNS[colIdx - 1].title} sütununa taşı`}
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}
                            {colIdx < COLUMNS.length - 1 && (
                              <button
                                type="button"
                                onClick={() => moveCard(card.id, COLUMNS[colIdx + 1].id)}
                                className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/80"
                                title={`${COLUMNS[colIdx + 1].title} sütununa taşı`}
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editorCard && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-lg flex items-center justify-center p-4"
          onClick={() => setEditorCard(null)}
        >
          <form
            onSubmit={handleSaveCard}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md ios-glass rounded-3xl border border-white/15 p-5 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {editorCard.id ? 'Görev Kartını Düzenle' : 'Yeni Görev Kartı'}
              </h3>
              <button
                type="button"
                onClick={() => setEditorCard(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/75"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              required
              value={editorCard.title || ''}
              onChange={(e) => setEditorCard({ ...editorCard, title: e.target.value })}
              placeholder="Görev başlığı..."
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <textarea
              rows={3}
              value={editorCard.description || ''}
              onChange={(e) => setEditorCard({ ...editorCard, description: e.target.value })}
              placeholder="Açıklama (isteğe bağlı)..."
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-cyan-500"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-white/45 uppercase mb-1">Sorumlu Kişi</label>
                <select
                  value={editorCard.assigneeUsername || ''}
                  onChange={(e) => setEditorCard({ ...editorCard, assigneeUsername: e.target.value })}
                  className="w-full bg-black/45 border border-white/15 rounded-xl px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value="">Atanmadı</option>
                  {memberNames.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-white/45 uppercase mb-1">Son Tarih</label>
                <input
                  type="date"
                  value={editorCard.dueDate || ''}
                  onChange={(e) => setEditorCard({ ...editorCard, dueDate: e.target.value })}
                  className="w-full bg-black/45 border border-white/15 rounded-xl px-2.5 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-white/45 uppercase mb-1">
                Etiketler (virgülle ayırın)
              </label>
              <input
                type="text"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="Örn: Acil, Turnuva, Tasarım"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditorCard(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs text-white/75"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-black"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
