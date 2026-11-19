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

export const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, lineIdx) => {
        const isQuote = line.startsWith('> ');
        const processedLine = isQuote ? line.slice(2) : line;
        const parts = processedLine.split(/(\|\|[\s\S]*?\|\||\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|~~[\s\S]*?~~)/g);

        return (
          <span
            key={lineIdx}
            className={
              isQuote
                ? 'block border-l-2 border-amber-400 pl-2.5 py-0.5 text-white/70 italic bg-white/[0.02] rounded-r'
                : 'block'
            }
          >
            {parts.map((p, pIdx) => {
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
            })}
          </span>
        );
      })}
    </div>
  );
};
