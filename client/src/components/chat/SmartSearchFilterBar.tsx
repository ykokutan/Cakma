import React from 'react';
import { Code2, FileText, Film, Image as ImageIcon, Link2, Mic, Pin, User, X } from 'lucide-react';

interface SmartSearchFilterBarProps {
  searchQuery: string;
  onChangeQuery: (q: string) => void;
  matchCount: number;
  onCloseFilters: () => void;
}

const TOKEN_CHIPS = [
  { token: 'has:image', label: 'has:image', icon: ImageIcon },
  { token: 'has:file', label: 'has:file', icon: FileText },
  { token: 'has:code', label: 'has:code', icon: Code2 },
  { token: 'has:video', label: 'has:video', icon: Film },
  { token: 'has:ses', label: 'has:ses', icon: Mic },
  { token: 'has:link', label: 'has:link', icon: Link2 },
  { token: 'is:pinned', label: 'is:pinned', icon: Pin },
] as const;

export const SmartSearchFilterBar: React.FC<SmartSearchFilterBarProps> = ({
  searchQuery,
  onChangeQuery,
  matchCount,
  onCloseFilters,
}) => {
  const tokens = searchQuery.trim().split(/\s+/).filter(Boolean);
  const hasToken = (tok: string) => tokens.some((t) => t.toLowerCase() === tok);

  const toggleToken = (tok: string) => {
    const filtered = tokens.filter((t) => t.toLowerCase() !== tok);
    if (!hasToken(tok)) filtered.push(tok);
    onChangeQuery(filtered.join(' '));
  };

  const hasFrom = tokens.some((t) => t.toLowerCase().startsWith('from:'));

  return (
    <div className="px-4 py-2 border-b border-white/[0.08] bg-black/30 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/45 mr-1">
          Akıllı Filtre:
        </span>
        {TOKEN_CHIPS.map((chip) => {
          const Icon = chip.icon;
          const active = hasToken(chip.token);
          return (
            <button
              key={chip.token}
              type="button"
              onClick={() => toggleToken(chip.token)}
              className={`px-2 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1 transition ${
                active
                  ? 'bg-blue-500/25 border-blue-400 text-blue-200'
                  : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{chip.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            if (hasFrom) {
              onChangeQuery(tokens.filter((t) => !t.toLowerCase().startsWith('from:')).join(' '));
            } else {
              onChangeQuery([...tokens, 'from:@'].join(' '));
            }
          }}
          className={`px-2 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1 transition ${
            hasFrom
              ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
              : 'bg-white/5 border-white/10 text-white/65 hover:text-white'
          }`}
        >
          <User className="w-3 h-3" />
          <span>from:@</span>
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {searchQuery.trim() && (
          <span className="text-[11px] font-semibold text-white/60">
            {matchCount} sonuç
          </span>
        )}
        <button
          type="button"
          onClick={onCloseFilters}
          className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white"
          title="Filtre çubuğunu kapat"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
