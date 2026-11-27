import React, { useCallback, useEffect, useState } from 'react';
import {
  Ticket,
  ClipboardList,
  Plus,
  X,
  Download,
  Lock,
  Check,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import type {
  Server,
  ServerApplicationForm,
  ServerApplicationSubmission,
  SupportTicket,
} from '../../types';
import { authFetch } from '../../utils/authFetch';
import { appToast } from '../../utils/appDialogs';
import { useSocket } from '../../context/SocketContext';

interface TicketsAndFormsModalProps {
  server: Server;
  onClose: () => void;
}

export const TicketsAndFormsModal: React.FC<TicketsAndFormsModalProps> = ({
  server,
  onClose,
}) => {
  const { currentServerHost, selectChannel } = useSocket();
  const [tab, setTab] = useState<'tickets' | 'forms' | 'staff'>('tickets');
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [forms, setForms] = useState<ServerApplicationForm[]>([]);
  const [submissions, setSubmissions] = useState<ServerApplicationSubmission[]>([]);

  // New Ticket
  const [tCategory, setTCategory] = useState('Genel Destek');
  const [tSubject, setTSubject] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Fill Form
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  // Create Form (Staff)
  const [newFormTitle, setNewFormTitle] = useState('');
  const [newFormQuestions, setNewFormQuestions] = useState('Neden bu topluluğa/ekibe katılmak istiyorsunuz?\nGünlük aktifliğiniz nedir?');
  const [newFormRoleId, setNewFormRoleId] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, fRes] = await Promise.all([
        authFetch(currentServerHost, `/api/servers/${encodeURIComponent(server.id)}/tickets`),
        authFetch(currentServerHost, `/api/servers/${encodeURIComponent(server.id)}/forms`),
      ]);
      const tJson = await tRes.json().catch(() => ({}));
      const fJson = await fRes.json().catch(() => ({}));
      if (tRes.ok && tJson.ok) {
        setTickets(tJson.tickets || []);
        setIsStaff(Boolean(tJson.staff));
      }
      if (fRes.ok && fJson.ok) {
        setForms(fJson.forms || []);
        setSubmissions(fJson.submissions || []);
        if (fJson.staff) setIsStaff(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentServerHost, server.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tSubject.trim()) return;
    setCreatingTicket(true);
    try {
      const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(server.id)}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: tCategory, subject: tSubject, description: tDesc }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        appToast(json.error || 'Destek talebi açılamadı.', 'error');
        return;
      }
      appToast(`Destek talebi #${json.ticket.number} oluşturuldu!`, 'success');
      setTSubject('');
      setTDesc('');
      await loadAll();
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    const res = await authFetch(
      currentServerHost,
      `/api/servers/${encodeURIComponent(server.id)}/tickets/${encodeURIComponent(ticketId)}/close`,
      { method: 'POST' }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      appToast(json.error || 'Ticket kapatılamadı.', 'error');
      return;
    }
    appToast('Destek talebi kapatıldı ve transkript kaydedildi.', 'success');
    await loadAll();
  };

  const handleDownloadTranscript = async (ticket: SupportTicket) => {
    const res = await authFetch(
      currentServerHost,
      `/api/servers/${encodeURIComponent(server.id)}/tickets/${encodeURIComponent(ticket.id)}/transcript`
    );
    if (!res.ok) {
      appToast('Transkript indirilemedi.', 'error');
      return;
    }
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${ticket.number}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSubmitForm = async (form: ServerApplicationForm) => {
    const res = await authFetch(
      currentServerHost,
      `/api/servers/${encodeURIComponent(server.id)}/forms/${encodeURIComponent(form.id)}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      appToast(json.error || 'Başvuru gönderilemedi.', 'error');
      return;
    }
    appToast('Başvurunuz yetkililere iletildi!', 'success');
    setSelectedFormId(null);
    setAnswers([]);
    await loadAll();
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const questions = newFormQuestions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!newFormTitle.trim() || questions.length === 0) return;
    const res = await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(server.id)}/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newFormTitle.trim(),
        questions,
        approveRoleId: newFormRoleId || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      appToast(json.error || 'Form oluşturulamadı.', 'error');
      return;
    }
    appToast('Başvuru formu oluşturuldu!', 'success');
    setNewFormTitle('');
    await loadAll();
  };

  const handleReviewSubmission = async (subId: string, decision: 'approved' | 'rejected') => {
    const res = await authFetch(
      currentServerHost,
      `/api/servers/${encodeURIComponent(server.id)}/forms/submissions/${encodeURIComponent(subId)}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      }
    );
    if (res.ok) {
      appToast(decision === 'approved' ? 'Başvuru onaylandı!' : 'Başvuru reddedildi.', 'success');
      await loadAll();
    }
  };

  const openTicketChannel = (channelId: string) => {
    const ch = server.channels.find((c) => c.id === channelId);
    if (ch) {
      selectChannel(ch.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#0e121e] text-white shadow-2xl overflow-hidden flex flex-col max-h-[86vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{server.name} · Destek &amp; Başvurular</h3>
              <p className="text-[11px] text-white/50">Özel destek kanalları, transkript arşivi ve klan/yetkili formları</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 flex items-center gap-2 border-b border-white/10 bg-black/20">
          <button
            type="button"
            onClick={() => setTab('tickets')}
            className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
              tab === 'tickets' ? 'border-amber-400 text-amber-300' : 'border-transparent text-white/55 hover:text-white'
            }`}
          >
            Destek Talepleri ({tickets.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('forms')}
            className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
              tab === 'forms' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-white/55 hover:text-white'
            }`}
          >
            Başvuru Formları ({forms.length})
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => setTab('staff')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
                tab === 'staff' ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-white/55 hover:text-white'
              }`}
            >
              Yetkili Yönetimi ({submissions.filter((s) => s.status === 'pending').length})
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-white/50 gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Yükleniyor...</span>
            </div>
          ) : tab === 'tickets' ? (
            <>
              <form onSubmit={handleCreateTicket} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 text-xs">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span>Yeni Destek Talebi Aç</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                  <select
                    value={tCategory}
                    onChange={(e) => setTCategory(e.target.value)}
                    className="bg-[#151a2a] border border-white/15 rounded-xl px-2.5 py-2 text-white outline-none"
                  >
                    <option value="Genel Destek">Genel Destek</option>
                    <option value="Şikayet / İhlal">Şikayet / İhlal</option>
                    <option value="Teknik Sorun">Teknik Sorun</option>
                    <option value="Öneri">Öneri</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={tSubject}
                    onChange={(e) => setTSubject(e.target.value)}
                    placeholder="Konu başlığı..."
                    className="bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                  />
                </div>
                <textarea
                  rows={2}
                  value={tDesc}
                  onChange={(e) => setTDesc(e.target.value)}
                  placeholder="Detaylı açıklama (isteğe bağlı)..."
                  className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
                >
                  {creatingTicket ? 'Açılıyor...' : 'Özel Ticket Kanalı Aç'}
                </button>
              </form>

              <div className="space-y-2">
                {tickets.length === 0 ? (
                  <p className="text-xs text-white/45 text-center py-6">Henüz destek talebi yok.</p>
                ) : (
                  tickets.map((tk) => (
                    <div key={tk.id} className="p-3.5 rounded-2xl bg-black/35 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-white flex items-center gap-2">
                          <span className="text-amber-300 font-mono">#{tk.number}</span>
                          <span className="truncate">{tk.subject}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${tk.status === 'open' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700/50 text-zinc-300'}`}>
                            {tk.status === 'open' ? 'Açık' : 'Kapalı'}
                          </span>
                        </div>
                        <div className="text-[11px] text-white/50 mt-0.5">
                          {tk.category} · Açan: {tk.creatorUsername}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {tk.status === 'open' && server.channels.some((c) => c.id === tk.channelId) && (
                          <button
                            type="button"
                            onClick={() => openTicketChannel(tk.channelId)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-semibold"
                          >
                            Kanala Git
                          </button>
                        )}
                        {tk.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => void handleCloseTicket(tk.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold flex items-center gap-1"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Kapat</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDownloadTranscript(tk)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-semibold flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Transkript</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : tab === 'forms' ? (
            <div className="space-y-3 text-xs">
              {forms.length === 0 ? (
                <p className="text-white/45 text-center py-6">Sunucuda aktif başvuru formu yok.</p>
              ) : (
                forms.map((fm) => (
                  <div key={fm.id} className="p-4 rounded-2xl bg-black/35 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <ClipboardList className="w-4 h-4 text-cyan-400" />
                          <span>{fm.title}</span>
                        </div>
                        {fm.description && <p className="text-white/55 text-[11px] mt-0.5">{fm.description}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedFormId === fm.id) {
                            setSelectedFormId(null);
                          } else {
                            setSelectedFormId(fm.id);
                            setAnswers(fm.questions.map(() => ''));
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-bold"
                      >
                        {selectedFormId === fm.id ? 'Kapat' : 'Başvur'}
                      </button>
                    </div>
                    {selectedFormId === fm.id && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10">
                        {fm.questions.map((q, idx) => (
                          <div key={idx}>
                            <label className="block text-[11px] text-white/75 mb-1">{q}</label>
                            <textarea
                              rows={2}
                              value={answers[idx] || ''}
                              onChange={(e) =>
                                setAnswers((prev) => prev.map((a, i) => (i === idx ? e.target.value : a)))
                              }
                              className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-1.5 text-white outline-none resize-none"
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => void handleSubmitForm(fm)}
                          className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                        >
                          Başvuruyu Gönder
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {submissions.filter((s) => !isStaff || s.status !== 'pending').length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-[11px] font-bold text-white/60 uppercase">Gönderilen Başvurularım</div>
                  {submissions.map((s) => (
                    <div key={s.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                      <span>{forms.find((f) => f.id === s.formId)?.title || 'Form'}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                        s.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {s.status === 'approved' ? 'Onaylandı' : s.status === 'rejected' ? 'Reddedildi' : 'Beklemede'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <form onSubmit={handleCreateForm} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
                <div className="font-bold text-emerald-300">Yeni Başvuru Formu Oluştur</div>
                <input
                  type="text"
                  required
                  value={newFormTitle}
                  onChange={(e) => setNewFormTitle(e.target.value)}
                  placeholder="Form başlığı (örn: Moderatör Başvurusu)"
                  className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                />
                <textarea
                  rows={3}
                  value={newFormQuestions}
                  onChange={(e) => setNewFormQuestions(e.target.value)}
                  placeholder="Her satıra bir soru yazın..."
                  className="w-full bg-black/45 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={newFormRoleId}
                    onChange={(e) => setNewFormRoleId(e.target.value)}
                    className="flex-1 bg-[#151a2a] border border-white/15 rounded-xl px-2.5 py-2 text-white outline-none"
                  >
                    <option value="">Onaylanınca rol verme</option>
                    {server.roles
                      .filter((r) => !r.isDefault)
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                  >
                    Formu Ekle
                  </button>
                </div>
              </form>

              {forms.map((f) => (
                <div key={f.id} className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between">
                  <span className="font-semibold">{f.title} ({f.questions.length} soru)</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await authFetch(currentServerHost, `/api/servers/${encodeURIComponent(server.id)}/forms/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
                      await loadAll();
                    }}
                    className="text-rose-300 hover:text-rose-200 p-1"
                    title="Formu Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <div className="space-y-2">
                <div className="font-bold text-white/75">Gelen Başvurular ({submissions.length})</div>
                {submissions.map((sub) => {
                  const frm = forms.find((f) => f.id === sub.formId);
                  return (
                    <div key={sub.id} className="p-3 rounded-2xl bg-black/35 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{sub.applicantUsername} · <span className="text-cyan-300">{frm?.title || 'Form'}</span></span>
                        <span className="text-[10px] text-white/50">{sub.status}</span>
                      </div>
                      <div className="space-y-1 text-[11px] text-white/75">
                        {sub.answers.map((ans, idx) => (
                          <div key={idx} className="bg-white/[0.03] rounded-lg p-2">
                            <div className="text-white/45 text-[10px]">{frm?.questions[idx] || `Soru ${idx + 1}`}</div>
                            <div>{ans}</div>
                          </div>
                        ))}
                      </div>
                      {sub.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReviewSubmission(sub.id, 'approved')}
                            className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 font-bold flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Onayla</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReviewSubmission(sub.id, 'rejected')}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 font-bold flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reddet</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
