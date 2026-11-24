import React, { useState } from 'react';

export const SLASH_COMMANDS = [
  { cmd: '/zar', desc: '1-6 arası rastgele zar atar' },
  { cmd: '/yazitura', desc: 'Yazı veya Tura atar' },
  { cmd: '/anket', desc: 'Hızlı anket oluşturma penceresini açar' },
  { cmd: '/hatirlat', desc: 'Hatırlatıcı kurar (Örn: /hatirlat 10dk Mola bitti)' },
  { cmd: '/temizle', desc: 'Son N mesajı temizler (Örn: /temizle 10)' },
  { cmd: '/davet', desc: 'Sunucu davet bağlantısı oluşturup paylaşır' },
  { cmd: '/yardim', desc: 'Kullanılabilir slash komutlarını listeler' },
];

export type MarkdownBlock =
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'line'; text: string };

const GFM_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;

function splitPipeRow(line: string): string[] {
  const trimmed = line.trim();
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return stripped.split('|').map((cell) => cell.trim());
}

/**
 * Parses inline/block Markdown segments (GFM tables, headings, blockquotes, bullet lists, lines).
 */
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 1. GFM Table: header row with `|` followed by separator row
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      GFM_SEPARATOR_RE.test(lines[i + 1].trim())
    ) {
      const headers = splitPipeRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().includes('|')) {
        rows.push(splitPipeRow(lines[j]));
        j++;
      }
      blocks.push({ type: 'table', headers, rows });
      i = j;
      continue;
    }

    // 2. Headings (#, ##, ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // 3. Blockquote (> ...)
    if (line.startsWith('> ')) {
      blocks.push({ type: 'quote', text: line.slice(2) });
      i++;
      continue;
    }

    // 4. Consecutive unordered list items (- item or * item)
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    blocks.push({ type: 'line', text: line });
    i++;
  }

  return blocks;
}

export const SpoilerText: React.FC<{ text: string }> = ({ text }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      className={`px-1.5 py-0.5 rounded cursor-pointer transition select-none ${
        revealed
          ? 'bg-white/15 text-white'
          : 'bg-neutral-800 text-transparent hover:bg-neutral-700'
      }`}
      title={revealed ? '' : 'Spoilerı görmek için tıklayın'}
    >
      {text}
    </span>
  );
};

function renderInlineTokens(raw: string): React.ReactNode {
  if (!raw) return null;
  const parts = raw.split(
    /(`[^`\n]+`|\|\|[\s\S]*?\|\||\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|~~[\s\S]*?~~)/g
  );
  return parts.map((p, pIdx) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length >= 3) {
      return (
        <code
          key={pIdx}
          className="px-1.5 py-0.5 rounded bg-black/45 border border-white/10 font-mono text-[12px] text-amber-200"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.startsWith('||') && p.endsWith('||') && p.length >= 4) {
      return <SpoilerText key={pIdx} text={p.slice(2, -2)} />;
    }
    if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
      return (
        <strong key={pIdx} className="font-bold text-white">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length >= 2) {
      return (
        <em key={pIdx} className="italic text-white/90">
          {p.slice(1, -1)}
        </em>
      );
    }
    if (p.startsWith('~~') && p.endsWith('~~') && p.length >= 4) {
      return (
        <del key={pIdx} className="line-through text-white/50">
          {p.slice(2, -2)}
        </del>
      );
    }
    return <span key={pIdx}>{p}</span>;
  });
}

export const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="space-y-1">
      {blocks.map((block, bIdx) => {
        if (block.type === 'table') {
          return (
            <div key={bIdx} className="overflow-x-auto my-1.5 rounded-xl border border-white/10 bg-black/25">
              <table className="w-full border-collapse text-xs text-left">
                <thead>
                  <tr className="border-b border-white/15 bg-white/[0.05]">
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-2.5 py-1.5 font-bold text-white">
                        {renderInlineTokens(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-white/5 last:border-b-0">
                      {block.headers.map((_, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1 text-white/85">
                          {renderInlineTokens(row[cIdx] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'heading') {
          const cls =
            block.level === 1
              ? 'text-base font-extrabold text-white tracking-tight'
              : block.level === 2
              ? 'text-sm font-bold text-white'
              : 'text-xs font-bold uppercase tracking-wide text-cyan-200';
          return (
            <div key={bIdx} className={cls}>
              {renderInlineTokens(block.text)}
            </div>
          );
        }

        if (block.type === 'quote') {
          return (
            <span
              key={bIdx}
              className="block border-l-2 border-amber-400 pl-2.5 py-0.5 text-white/70 italic bg-white/[0.02] rounded-r"
            >
              {renderInlineTokens(block.text)}
            </span>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={bIdx} className="list-disc list-inside space-y-0.5 pl-1 text-white/90">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineTokens(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <span key={bIdx} className="block">
            {renderInlineTokens(block.text)}
          </span>
        );
      })}
    </div>
  );
};
