import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const detectedLang = language || 'code';

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

      {/* Code Content */}
      <pre className="p-4 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed no-scrollbar">
        <code>{code}</code>
      </pre>
    </div>
  );
};
