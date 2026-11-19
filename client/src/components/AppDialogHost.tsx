import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import {
  AppConfirmOptions,
  AppPromptOptions,
  AppToastVariant,
  registerAppDialogHandlers,
} from '../utils/appDialogs';

interface ToastEntry {
  id: string;
  message: string;
  variant: AppToastVariant;
}

type PendingModal =
  | {
      kind: 'confirm';
      options: AppConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'prompt';
      options: AppPromptOptions;
      resolve: (value: string | null) => void;
    };

export const AppDialogHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [modal, setModal] = useState<PendingModal | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<PendingModal[]>([]);
  const modalRef = useRef<PendingModal | null>(null);

  useEffect(() => {
    modalRef.current = modal;
    if (modal?.kind === 'prompt') {
      setPromptValue(modal.options.defaultValue || '');
      window.setTimeout(() => {
        promptInputRef.current?.focus();
        promptInputRef.current?.select();
      }, 30);
    }
  }, [modal]);

  useEffect(() => {
    const showNextOrClear = () => {
      const next = queueRef.current.shift() || null;
      setModal(next);
    };

    return registerAppDialogHandlers({
      toast: (message, variant) => {
        const id = `apptoast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4600);
      },
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          const item: PendingModal = {
            kind: 'confirm',
            options,
            resolve: (val) => {
              resolve(val);
              showNextOrClear();
            },
          };
          if (modalRef.current) {
            queueRef.current.push(item);
          } else {
            setModal(item);
          }
        }),
      prompt: (options) =>
        new Promise<string | null>((resolve) => {
          const item: PendingModal = {
            kind: 'prompt',
            options,
            resolve: (val) => {
              resolve(val);
              showNextOrClear();
            },
          };
          if (modalRef.current) {
            queueRef.current.push(item);
          } else {
            setModal(item);
          }
        }),
    });
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (modal.kind === 'confirm') modal.resolve(false);
        else modal.resolve(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const toastNode =
    toasts.length > 0 ? (
      <div className="fixed top-12 right-5 z-[10010] space-y-2 max-w-sm w-full pointer-events-none select-none">
        {toasts.map((t) => {
          const styles =
            t.variant === 'error'
              ? 'border-rose-400/50 bg-[#231218]/95 text-rose-100'
              : t.variant === 'warning'
              ? 'border-amber-400/50 bg-[#221c10]/95 text-amber-100'
              : t.variant === 'success'
              ? 'border-emerald-400/50 bg-[#0f221b]/95 text-emerald-100'
              : 'border-sky-400/45 bg-[#111622]/95 text-slate-100';
          const Icon =
            t.variant === 'error'
              ? XCircle
              : t.variant === 'warning'
              ? AlertTriangle
              : t.variant === 'success'
              ? CheckCircle2
              : Info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-2xl border px-3.5 py-2.5 shadow-2xl backdrop-blur-xl flex items-start gap-2.5 text-xs animate-fade-in ${styles}`}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-line leading-relaxed">{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="p-0.5 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    ) : null;

  const modalNode = modal ? (
    <div
      className="fixed inset-0 z-[10020] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={() => {
        if (modal.kind === 'confirm') modal.resolve(false);
        else modal.resolve(null);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-white/15 bg-[#121622] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.8)] space-y-4 text-white"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-white">
            {modal.options.title || (modal.kind === 'confirm' ? 'Onay Gerekli' : 'Bilgi Girin')}
          </h3>
          <button
            type="button"
            onClick={() => {
              if (modal.kind === 'confirm') modal.resolve(false);
              else modal.resolve(null);
            }}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-white/80 whitespace-pre-line leading-relaxed">
          {modal.options.message}
        </p>

        {modal.kind === 'confirm' ? (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => modal.resolve(false)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/85 transition"
            >
              {modal.options.cancelLabel || 'İptal'}
            </button>
            <button
              type="button"
              onClick={() => modal.resolve(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                modal.options.danger
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/25'
                  : 'bg-sky-500 hover:bg-sky-400 text-black shadow-lg shadow-sky-500/20'
              }`}
            >
              {modal.options.confirmLabel || 'Onayla'}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              modal.resolve(promptValue);
            }}
            className="space-y-3"
          >
            <input
              ref={promptInputRef}
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={modal.options.placeholder || ''}
              className="w-full rounded-xl bg-white/[0.06] border border-white/15 px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-sky-400/60"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => modal.resolve(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/85 transition"
              >
                {modal.options.cancelLabel || 'İptal'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition"
              >
                {modal.options.confirmLabel || 'Tamam'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  ) : null;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {toastNode}
      {modalNode}
    </>,
    document.body
  );
};
