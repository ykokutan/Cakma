import React, { useMemo, useState } from 'react';
import { Copy, Check, WrapText } from 'lucide-react';
import {
  normalizeCodeLanguage,
  tokenizeCodeLine,
  type CodeTokenKind,
} from '../utils/codeSyntax';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const TOKEN_CLASSES: Record<CodeTokenKind, string> = {
  plain: 'text-white/85',
  comment: 'text-white/40 italic',
  string: 'text-amber-300',
  number: 'text-cyan-300',
  keyword: 'text-fuchsia-400 font-semibold',
  type: 'text-sky-300',
  key: 'text-emerald-300 font-medium',
  diffAdd: 'text-emerald-300',
  diffDel: 'text-rose-300',
  diffHunk: 'text-cyan-300 font-semibold',
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const detectedLang = language || 'code';
  const normalizedLang = normalizeCodeLanguage(language);
  const lines = useMemo(() => code.split('\n'), [code]);

  return (
    <div className="my-2 rounded-2xl overflow-hidden border border-white/10 bg-[#0d0e12] shadow-2xl max-w-xl text-left select-text">
      {/* Code Editor Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.04] border-b border-white/[0.06] select-none gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-white/55 uppercase ml-1 truncate">
            {detectedLang}
          </span>
          <span className="text-[10px] font-mono text-white/30 shrink-0">
            {lines.length} satır
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setWrapLines((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition ${
              wrapLines
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white'
            }`}
            title="Satır Kaydırmayı Aç/Kapat"
          >
            <WrapText className="w-3 h-3" />
            <span className="hidden sm:inline">Kaydır</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[10px] font-bold transition shadow-sm"
            title="Kodu Kopyala"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Kopyalandı!' : 'Kopyala'}</span>
          </button>
        </div>
      </div>

      {/* Code Content with Syntax Highlighting & Line Numbers */}
      <pre className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed no-scrollbar">
        <code>
          {lines.map((line, i) => {
            const tokens = tokenizeCodeLine(line, normalizedLang);
            const firstKind = tokens[0]?.kind;
            const rowBg =
              normalizedLang === 'diff'
                ? firstKind === 'diffAdd'
                  ? 'bg-emerald-500/15'
                  : firstKind === 'diffDel'
                  ? 'bg-rose-500/15'
                  : firstKind === 'diffHunk'
                  ? 'bg-cyan-500/10'
                  : 'hover:bg-white/[0.03]'
                : 'hover:bg-white/[0.03]';
            return (
              <div key={i} className={`flex gap-3 px-1 rounded ${rowBg}`}>
                <span className="w-6 shrink-0 text-right text-white/25 select-none">{i + 1}</span>
                <span className={wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}>
                  {tokens.map((tok, tIdx) => (
                    <span key={tIdx} className={TOKEN_CLASSES[tok.kind]}>
                      {tok.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
};
