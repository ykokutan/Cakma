import React, { useState } from 'react';
import { BarChart2, Plus, Trash2, X, Check } from 'lucide-react';

interface PollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePoll: (question: string, options: string[]) => void;
}

export const PollModal: React.FC<PollModalProps> = ({
  isOpen,
  onClose,
  onCreatePoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuestion = question.trim();
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);

    if (!cleanQuestion || cleanOptions.length < 2) return;

    onCreatePoll(cleanQuestion, cleanOptions);
    setQuestion('');
    setOptions(['', '']);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Anket Oluştur (Poll)</h2>
              <p className="text-[11px] text-slate-400">Kanal üyelerinin oy kullanabileceği anket</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Anket Sorusu</label>
            <input
              type="text"
              placeholder="Örn: Bu akşam hangi haritada oynuyoruz?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">Seçenekler</label>
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Seçenek Ekle
                </button>
              )}
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 w-4">{idx + 1}.</span>
                  <input
                    type="text"
                    placeholder={`Seçenek ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    className="flex-1 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all"
            >
              <Check className="w-3.5 h-3.5" /> Anketi Başlat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
