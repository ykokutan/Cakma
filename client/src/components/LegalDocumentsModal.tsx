import React, { useContext, useEffect, useRef, useState } from 'react';
import { FileText, Shield, Scale, BookOpen, Cookie, X, Check, Copy } from 'lucide-react';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENTS_VERSION,
  LEGAL_LAST_UPDATED,
  type LegalDocumentId,
} from '../data/legalDocuments';
import { AuthContext } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { t } from '../utils/i18n';

interface LegalDocumentsModalProps {
  isOpen: boolean;
  initialDocId?: LegalDocumentId;
  onClose: () => void;
  onAccept?: () => void;
  requireReconsent?: boolean;
  onAcceptReconsent?: () => Promise<void> | void;
}

const DOC_ICONS: Record<LegalDocumentId, React.ComponentType<{ className?: string }>> = {
  terms: Scale,
  privacy: Shield,
  kvkk: FileText,
  community: BookOpen,
  cookies: Cookie,
};

export const LegalDocumentsModal: React.FC<LegalDocumentsModalProps> = ({
  isOpen,
  initialDocId = 'terms',
  onClose,
  onAccept,
  requireReconsent = false,
  onAcceptReconsent,
}) => {
  const language = useContext(AuthContext)?.language || 'tr';
  const [activeDocId, setActiveDocId] = useState<LegalDocumentId>(initialDocId);
  const [copiedDoc, setCopiedDoc] = useState(false);
  const [submittingReconsent, setSubmittingReconsent] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveDocId(initialDocId);
      setCopiedDoc(false);
    }
  }, [isOpen, initialDocId]);

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    setCopiedDoc(false);
  }, [activeDocId]);

  useFocusTrap(modalRef, isOpen, onClose);

  if (!isOpen) return null;

  const activeDoc = LEGAL_DOCUMENTS.find((d) => d.id === activeDocId) || LEGAL_DOCUMENTS[0];

  const handleCopyDocText = () => {
    const plain = [
      `${activeDoc.title} (v${LEGAL_DOCUMENTS_VERSION} - ${LEGAL_LAST_UPDATED})`,
      activeDoc.subtitle,
      '',
      ...activeDoc.sections.flatMap((sec) => [
        sec.heading,
        ...sec.paragraphs,
        ...(sec.bullets || []).map((b) => `- ${b}`),
        '',
      ]),
    ].join('\n');
    try {
      void navigator.clipboard?.writeText(plain);
      setCopiedDoc(true);
      window.setTimeout(() => setCopiedDoc(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const scrollToSection = (idx: number) => {
    const el = document.getElementById(`legal-sec-${activeDoc.id}-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/15 bg-[#0d111a]/95 text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-black/30 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="legal-modal-title" className="text-sm font-bold text-white truncate">
                {t(language, 'legalModalTitle')}
              </h2>
              <p className="text-[11px] text-white/50 truncate">
                v{LEGAL_DOCUMENTS_VERSION} · {LEGAL_LAST_UPDATED}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition shrink-0"
            aria-label="Yasal metin penceresini kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Layout */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Navigation Sidebar / Mobile Pills */}
          <nav
            aria-label="Yasal belgeler listesi"
            className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-white/10 bg-black/20 p-2.5 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto"
          >
            {LEGAL_DOCUMENTS.map((doc) => {
              const Icon = DOC_ICONS[doc.id];
              const isSelected = doc.id === activeDoc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveDocId(doc.id)}
                  className={`shrink-0 md:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition ${
                    isSelected
                      ? 'bg-rose-500/20 border border-rose-400/40 text-white shadow-sm'
                      : 'text-white/65 hover:text-white hover:bg-white/[0.06] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-rose-300' : 'text-white/45'
                    }`}
                  />
                  <span className="truncate">{doc.shortTitle}</span>
                </button>
              );
            })}
          </nav>

          {/* Document Content */}
          <div ref={contentScrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
            <div className="border-b border-white/10 pb-3.5 space-y-2.5">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  {activeDoc.title}
                </h3>
                <p className="text-xs text-white/55 mt-1">{activeDoc.subtitle}</p>
              </div>

              {/* İçindekiler / Madde Atlama */}
              <div className="pt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                  {t(language, 'legalTocLabel')} ({activeDoc.sections.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeDoc.sections.map((sec, idx) => (
                    <button
                      key={sec.heading}
                      type="button"
                      onClick={() => scrollToSection(idx)}
                      className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 border border-white/10 hover:border-rose-400/35 text-[10px] font-medium text-white/75 hover:text-white transition text-left"
                    >
                      {sec.heading}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {activeDoc.sections.map((section, idx) => (
                <section
                  key={section.heading}
                  id={`legal-sec-${activeDoc.id}-${idx}`}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 scroll-mt-4"
                >
                  <h4 className="text-xs sm:text-sm font-bold text-rose-200">
                    {section.heading}
                  </h4>
                  {section.paragraphs.map((p, pIdx) => (
                    <p key={pIdx} className="text-xs text-white/75 leading-relaxed">
                      {p}
                    </p>
                  ))}
                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="list-disc list-inside space-y-1 text-xs text-white/75 leading-relaxed pt-1">
                      {section.bullets.map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-white/10 bg-black/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-white/45">
              Çakma Platform Yasal Bilgilendirme · v{LEGAL_DOCUMENTS_VERSION}
            </span>
            <button
              type="button"
              onClick={handleCopyDocText}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[11px] font-medium text-white/75 hover:text-white inline-flex items-center gap-1 transition"
            >
              {copiedDoc ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>{t(language, 'legalCopied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{t(language, 'legalCopyText')}</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/85 transition"
            >
              {t(language, 'close')}
            </button>
            {(onAccept || (requireReconsent && onAcceptReconsent)) && (
              <button
                type="button"
                disabled={submittingReconsent}
                onClick={async () => {
                  if (requireReconsent && onAcceptReconsent) {
                    setSubmittingReconsent(true);
                    try {
                      await onAcceptReconsent();
                    } finally {
                      setSubmittingReconsent(false);
                    }
                    return;
                  }
                  onAccept?.();
                }}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold inline-flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(language, 'legalAcceptBtn')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
