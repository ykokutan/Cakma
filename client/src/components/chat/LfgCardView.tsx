import React from 'react';
import { Gamepad2, Users, Radio, Lock, UserPlus, UserMinus } from 'lucide-react';
import type { LfgPostData } from '../../types';
import { AvatarView } from '../AvatarView';

interface LfgCardViewProps {
  lfg: LfgPostData;
  currentUsername: string;
  authorUsername: string;
  isAdmin: boolean;
  onToggleSlot: () => void;
  onClose: () => void;
  onJoinVoice?: (channelId: string) => void;
}

export const LfgCardView: React.FC<LfgCardViewProps> = ({
  lfg,
  currentUsername,
  authorUsername,
  isAdmin,
  onToggleSlot,
  onClose,
  onJoinVoice,
}) => {
  const lowerMe = currentUsername.toLowerCase();
  const isJoined = lfg.participants.some((p) => p.username.toLowerCase() === lowerMe);
  const isFull = lfg.participants.length >= lfg.maxSlots;
  const canClose =
    !lfg.closed && (authorUsername.toLowerCase() === lowerMe || isAdmin);

  return (
    <div className="my-1.5 w-full max-w-md rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 via-slate-900/90 to-slate-950 p-3.5 shadow-xl space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 truncate">
              {lfg.game}
            </div>
            <div className="text-sm font-bold text-white truncate">{lfg.title}</div>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono shrink-0 border ${
            lfg.closed
              ? 'bg-zinc-700/40 text-zinc-300 border-white/10'
              : isFull
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
          }`}
        >
          {lfg.closed
            ? 'Kapandı'
            : `${lfg.participants.length} / ${lfg.maxSlots} Oyuncu`}
        </span>
      </div>

      {lfg.rankOrNote && (
        <div className="text-xs text-slate-300 bg-black/30 rounded-xl px-2.5 py-1.5 border border-white/5">
          {lfg.rankOrNote}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: lfg.maxSlots }).map((_, idx) => {
          const p = lfg.participants[idx];
          if (!p) {
            return (
              <div
                key={`empty-${idx}`}
                className="flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-white/15 text-[10px] text-white/40"
              >
                <Users className="w-2.5 h-2.5" />
                <span>Boş Slot</span>
              </div>
            );
          }
          return (
            <div
              key={p.username}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] text-white font-medium"
            >
              <div className="w-4 h-4 rounded-full overflow-hidden bg-black/40 flex items-center justify-center shrink-0">
                <AvatarView avatar={p.avatar} alt={p.username} fallback="👤" className="w-full h-full object-cover" />
              </div>
              <span className="truncate max-w-[90px]">{p.username}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-white/10">
        {!lfg.closed && (
          <button
            type="button"
            disabled={!isJoined && isFull}
            onClick={onToggleSlot}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              isJoined
                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30'
                : isFull
                  ? 'bg-white/5 text-white/35 cursor-not-allowed border border-white/5'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {isJoined ? <UserMinus className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>{isJoined ? 'Ayrıl' : isFull ? 'Kadro Dolu' : 'Takıma Katıl'}</span>
          </button>
        )}

        {lfg.voiceChannelId && onJoinVoice && (
          <button
            type="button"
            onClick={() => onJoinVoice(lfg.voiceChannelId!)}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/35 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{lfg.voiceChannelName ? `#${lfg.voiceChannelName}` : 'Ses Odasına Gir'}</span>
          </button>
        )}

        {canClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/75 text-[11px] font-semibold flex items-center gap-1 transition"
          >
            <Lock className="w-3 h-3" />
            <span>Kapat</span>
          </button>
        )}
      </div>
    </div>
  );
};
