import React, { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'default',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch',
  'finally', 'throw', 'new', 'class', 'extends', 'interface', 'type', 'enum', 'async',
  'await', 'true', 'false', 'null', 'undefined', 'void', 'def', 'fn', 'pub', 'struct',
  'impl', 'use', 'match', 'in', 'as', 'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE',
  'DELETE', 'JOIN', 'ON', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'select', 'from', 'where',
]);

function highlightLine(line: string): React.ReactNode[] {
  const tokenRegex = /(\/\/.*$|#.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('//') || token.startsWith('#') || token.startsWith('/*')) {
      parts.push(<span key={key++} className="text-white/35 italic">{token}</span>);
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      parts.push(<span key={key++} className="text-amber-300">{token}</span>);
    } else if (/^\d/.test(token)) {
      parts.push(<span key={key++} className="text-cyan-300">{token}</span>);
    } else if (KEYWORDS.has(token)) {
      parts.push(<span key={key++} className="text-fuchsia-400 font-semibold">{token}</span>);
    } else {
      parts.push(<span key={key++} className="text-emerald-300">{token}</span>);
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < line.length) {
    parts.push(line.slice(lastIdx));
  }
  return parts.length > 0 ? parts : [' '];
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const detectedLang = language || 'code';
  const lines = useMemo(() => code.split('\n'), [code]);

  return (
    <div className="my-2 rounded-2xl overflow-hidden border border-white/10 bg-[#0d0e12] shadow-2xl max-w-xl text-left select-text">
      {/* Code Editor Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.04] border-b border-white/[0.06] select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-white/50 uppercase ml-1">
            {detectedLang}
          </span>
        </div>

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

      {/* Code Content with Syntax Highlighting & Line Numbers */}
      <pre className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed no-scrollbar">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex gap-3 hover:bg-white/[0.03] px-1 rounded">
              <span className="w-6 shrink-0 text-right text-white/20 select-none">{i + 1}</span>
              <span className="text-white/85 whitespace-pre">{highlightLine(line)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
};
