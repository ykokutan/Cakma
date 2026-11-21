import React, { useState } from 'react';
import { Plus, Smile, Sticker, Trash2, X } from 'lucide-react';
import type { MessageAttachment, Server, ServerSticker } from '../../types';
import { appToast } from '../../utils/appDialogs';
import { resolveMediaUrl } from '../../utils/authFetch';
import { t, type AppLanguage } from '../../utils/i18n';

interface EmojiAndStickerPickerProps {
  activeServer: Server | null;
  currentServerHost: string;
  canManageChannels: boolean;
  language: AppLanguage;
  emojiGroups: Array<{ label: string; emojis: string[] }>;
  onInsertEmoji: (em: string) => void;
  onSelectCustomEmoji: (att: MessageAttachment) => void;
  onSendSticker: (sticker: ServerSticker) => void;
  onAddSticker: (serverId: string, name: string, imageUrl: string) => void;
  onDeleteSticker: (serverId: string, stickerId: string) => void;
  onClose: () => void;
}

export const EmojiAndStickerPicker: React.FC<EmojiAndStickerPickerProps> = ({
  activeServer,
  currentServerHost,
  canManageChannels,
  language,
  emojiGroups,
  onInsertEmoji,
  onSelectCustomEmoji,
  onSendSticker,
  onAddSticker,
  onDeleteSticker,
  onClose,
}) => {
  const [tab, setTab] = useState<'emojis' | 'stickers'>('emojis');
  const isServer = Boolean(activeServer && activeServer.id !== 'direct-messages');
  const serverStickers = activeServer?.stickers || [];

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeServer || !isServer) return;
    if (file.size > 500 * 1024) {
      appToast('Sticker görseli 500 KB boyutundan küçük olmalıdır.', 'warning');
      return;
    }
    const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 24) || 'Sticker';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onAddSticker(activeServer.id, cleanName, reader.result);
        appToast(`"${cleanName}" stickeri eklendi!`, 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="absolute bottom-14 right-0 z-30 w-[calc(100vw-24px)] max-w-80 p-3 rounded-2xl ios-glass border border-white/15 shadow-2xl space-y-3 animate-slide-up">
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('emojis')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
              tab === 'emojis' ? 'bg-amber-500/20 text-amber-200' : 'text-white/55 hover:text-white'
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>Emojiler</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('stickers')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
              tab === 'stickers' ? 'bg-pink-500/20 text-pink-200' : 'text-white/55 hover:text-white'
            }`}
          >
            <Sticker className="w-3.5 h-3.5" />
            <span>{t(language, 'serverStickers')}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-white/40 hover:text-white transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {tab === 'emojis' ? (
        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {activeServer?.customEmojis && activeServer.customEmojis.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80 mb-1.5">
                Sunucu Emojileri
              </div>
              <div className="grid grid-cols-6 gap-1">
                {activeServer.customEmojis.map((ce) => (
                  <button
                    key={ce.id}
                    type="button"
                    onClick={() => {
                      onSelectCustomEmoji({
                        id: `emj-${Date.now()}`,
                        name: `${ce.name}.png`,
                        size: 1024,
                        type: 'image/png',
                        url: ce.url,
                      });
                      onClose();
                    }}
                    title={`:${ce.name}:`}
                    className="h-8 rounded-lg hover:bg-white/15 flex items-center justify-center p-1 transition hover:scale-110"
                  >
                    <img src={ce.url} alt={ce.name} className="w-6 h-6 object-contain rounded" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {emojiGroups.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                {group.label}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {group.emojis.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => onInsertEmoji(em)}
                    className="h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-lg transition hover:scale-110"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {isServer && canManageChannels && activeServer && (
            <label className="w-full py-1.5 px-3 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/30 text-pink-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition">
              <Plus className="w-3.5 h-3.5" />
              <span>Sticker Ekle (Maks. 500 KB)</span>
              <input
                type="file"
                accept="image/png,image/webp,image/gif,image/jpeg"
                onChange={handleStickerUpload}
                className="hidden"
              />
            </label>
          )}

          {serverStickers.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-white/40">
              {isServer
                ? 'Bu sunucuda henüz sticker paketi eklenmemiş.'
                : 'Sticker paketleri sunucu kanallarında yönetilebilir.'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {serverStickers.map((st) => (
                <div
                  key={st.id}
                  className="relative group rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 p-1.5 flex flex-col items-center gap-1 transition"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSendSticker(st);
                      onClose();
                    }}
                    className="w-full flex flex-col items-center gap-1"
                    title={st.name}
                  >
                    <img
                      src={resolveMediaUrl(st.imageUrl, currentServerHost)}
                      alt={st.name}
                      className="w-14 h-14 object-contain rounded-lg"
                    />
                    <span className="text-[10px] text-white/75 truncate w-full text-center">
                      {st.name}
                    </span>
                  </button>
                  {isServer && canManageChannels && activeServer && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSticker(activeServer.id, st.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 p-1 rounded-md bg-rose-500/80 text-white transition"
                      title="Stickeri Sil"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
