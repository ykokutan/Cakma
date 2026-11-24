import React, { useEffect, useRef, useState } from 'react';
import { FileText, Shield, Scale, BookOpen, Cookie, X, Check } from 'lucide-react';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENTS_VERSION,
  LEGAL_LAST_UPDATED,
  type LegalDocumentId,
} from '../data/legalDocuments';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface LegalDocumentsModalProps {
  isOpen: boolean;
  initialDocId?: LegalDocumentId;
  onClose: () => void;
  onAccept?: () => void;
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
}) => {
  const [activeDocId, setActiveDocId] = useState<LegalDocumentId>(initialDocId);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveDocId(initialDocId);
    }
  }, [isOpen, initialDocId]);

  useFocusTrap(modalRef, isOpen, onClose);

  if (!isOpen) return null;

  const activeDoc = LEGAL_DOCUMENTS.find((d) => d.id === activeDocId) || LEGAL_DOCUMENTS[0];

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
                Yasal Metinler ve Kullanıcı Sözleşmesi
              </h2>
              <p className="text-[11px] text-white/50 truncate">
                Sürüm v{LEGAL_DOCUMENTS_VERSION} · Son güncelleme: {LEGAL_LAST_UPDATED}
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
          <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
            <div className="border-b border-white/10 pb-3.5">
              <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                {activeDoc.title}
              </h3>
              <p className="text-xs text-white/55 mt-1">{activeDoc.subtitle}</p>
            </div>

            <div className="space-y-4">
              {activeDoc.sections.map((section) => (
                <section
                  key={section.heading}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2"
                >
                  <h4 className="text-xs sm:text-sm font-bold text-rose-200">
                    {section.heading}
                  </h4>
                  {section.paragraphs.map((p, idx) => (
                    <p key={idx} className="text-xs text-white/75 leading-relaxed">
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
          <span className="text-[11px] text-white/45">
            Çakma Platform Yasal Bilgilendirme · v{LEGAL_DOCUMENTS_VERSION}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/85 transition"
            >
              Kapat
            </button>
            {onAccept && (
              <button
                type="button"
                onClick={onAccept}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold inline-flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Okudum ve Kabul Ediyorum</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
