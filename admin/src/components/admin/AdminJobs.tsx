import React, { useState, useEffect } from 'react';
import { Search, MoreVertical, X, ChevronRight, Loader2, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { useToast } from '@/hooks/use-toast';
import AdminJobDetail from './AdminJobDetail';
import AdminContractCreate from './AdminContractCreate';

/* ─── Tela de Confirmação ────────────────────────────────────────────── */
interface JobConfirmationProps {
  clientName: string;
  eventType: string | null;
  eventDate: string | null;
  onGenerateContract: () => void;
  onSkip: () => void;
}

const JobConfirmation = ({ clientName, eventType, eventDate, onGenerateContract, onSkip }: JobConfirmationProps) => {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const subtitle = [eventType, formatDate(eventDate)].filter(Boolean).join(' • ');

  return (
    <div className="fixed inset-0 z-[9999] bg-zinc-900/70 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 sm:p-10 rounded-[4px] shadow-2xl shadow-zinc-200/50 max-w-[450px] w-full text-center border border-zinc-100">

        {/* Ícone */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 bg-[#FAF0EC] rounded-full flex items-center justify-center text-[#C65D3B]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-medium text-[#1A1A1A] tracking-tight">Trabalho criado!</h2>
        <p className="text-zinc-500 mt-1.5 text-sm leading-relaxed">Próximo passo: gerar o contrato.</p>

        {/* Info Card */}
        <div className="my-6 p-4 bg-zinc-50 border border-zinc-100 rounded-[4px] flex items-center justify-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#C65D3B] shrink-0"></span>
          <span className="text-sm font-medium text-[#1A1A1A]">{clientName}</span>
          {subtitle && (
            <>
              <span className="text-zinc-300">•</span>
              <span className="text-zinc-500 text-xs font-medium">{subtitle}</span>
            </>
          )}
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <h3 className="font-medium text-[#1A1A1A]">Deseja gerar o contrato agora?</h3>
          <p className="text-sm text-zinc-500 px-2 leading-relaxed">
            O sistema já vai preencher os dados automaticamente com as informações que você cadastrou.
          </p>
          <div className="flex flex-col gap-2 mt-5">
            <button
              onClick={onGenerateContract}
              className="w-full py-4 bg-[#C65D3B] text-white rounded-sm font-semibold hover:bg-[#a34a2e] transition-colors focus:outline-none"
            >
              Sim, gerar contrato agora
            </button>
            <button
              onClick={onSkip}
              className="w-full py-3 text-sm font-bold text-zinc-400 hover:text-zinc-800 transition-all focus:outline-none focus:ring-2 focus:ring-zinc-100 rounded-[4px]"
            >
              Fazer depois
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

const STATUS_LABELS: Record<string, string> = {
  draft:               'Rascunho',
  contract_pending:    'Contrato pendente',
  contract_signed:     'Contrato assinado',
  gallery_active:      'Galeria ativa',
  selection_received:  'Seleção recebida',
  delivered:           'Entregue',
};

const STATUS_STYLES: Record<string, string> = {
  draft:               'bg-zinc-100 text-zinc-500 border-zinc-200',
  contract_pending:    'bg-amber-50 text-amber-600 border-amber-100',
  contract_signed:     'bg-[#FAF0EC] text-[#C65D3B] border-[#e8c4b8]',
  gallery_active:      'bg-[#FAF0EC] text-[#C65D3B] border-[#e8c4b8]',
  selection_received:  'bg-[#FFF4F0] text-[#a34a2e] border-[#e8c4b8]',
  delivered:           'bg-[#FAF0EC] text-[#C65D3B] border-[#e8c4b8]',
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded text-[12px] font-semibold border ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
    {STATUS_LABELS[status] ?? status}
  </span>
);

interface Job {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string | null;
  status: string;
  contract_status: string | null; // derivado de contracts(status)
  created_at: string;
  clients: { name: string } | null;
}

const CONTRACT_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado:  'Enviado',
  assinado: 'Assinado',
  arquivado:'Arquivado',
};

const CONTRACT_STYLES: Record<string, string> = {
  rascunho: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  enviado:  'bg-[#FAF0EC] text-[#C65D3B] border-[#e8c4b8]',
  assinado: 'bg-[#FAF0EC] text-[#C65D3B] border-[#e8c4b8]',
  arquivado:'bg-zinc-100 text-zinc-500 border-zinc-200',
};

const ContractBadge = ({ status, onOpenContract }: { status: string | null; onOpenContract: () => void }) => {
  if (!status) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpenContract(); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-semibold border border-dashed border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        Gerar
      </button>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpenContract(); }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-semibold border transition-colors hover:opacity-80 ${CONTRACT_STYLES[status] ?? CONTRACT_STYLES.rascunho}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      {CONTRACT_LABELS[status] ?? status}
    </button>
  );
};

interface ClientOption {
  id: string;
  name: string;
}

interface AdminJobsProps {
  initialClient?: { id: string; name: string } | null;
  onModalClose?: () => void;
  initialJobId?: string | null;
  onJobTitleChange?: (title: string | null) => void;
  onBackRegister?: (fn: () => void) => void;
  onGalleryUrlChange?: (url: string | null) => void;
  onContractActionsChange?: (actions: React.ReactNode) => void;
}

const EMPTY_FORM = { title: '', event_type: '', event_date: '', event_time: '', notes: '' };

export default function AdminJobs({ initialClient, onModalClose, initialJobId, onJobTitleChange, onBackRegister, onGalleryUrlChange, onContractActionsChange }: AdminJobsProps) {
  const photographerId = usePhotographerId();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(() => !!initialClient);
  const [selectedClientId, setSelectedClientId] = useState(initialClient?.id ?? '');
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [detailJobId, setDetailJobId] = useState<string | null>(initialJobId ?? null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    jobId: string;
    clientName: string;
    eventType: string | null;
    eventDate: string | null;
  } | null>(null);
  const [contractJobId, setContractJobId] = useState<string | null>(null);

  const fmtDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    if (!detailJobId) {
      onJobTitleChange?.(null);
      onBackRegister?.(() => {});
      return;
    }
    const job = jobs.find((j) => j.id === detailJobId);
    if (!job) return;
    onJobTitleChange?.(`${job.title}••${job.created_at}`);
    onBackRegister?.(() => { setDetailJobId(null); fetchJobs(); });
  }, [detailJobId, jobs]);

  useEffect(() => {
    if (!contractJobId) return;
    const job = jobs.find((j) => j.id === contractJobId);
    if (!job) return;
    onJobTitleChange?.(`${job.title}••${job.created_at}••contract`);
    onBackRegister?.(() => { setContractJobId(null); fetchJobs(); });
  }, [contractJobId, jobs]);

  useEffect(() => {
    if (!photographerId) return;
    fetchJobs();
    supabase
      .from('clients')
      .select('id, name')
      .eq('photographer_id', photographerId)
      .order('name')
      .then(({ data }) => setClientOptions((data as ClientOption[]) ?? []));
  }, [photographerId]);

  const fetchJobs = async () => {
    if (!photographerId) return;
    setLoading(true);

    // Busca jobs básicos
    const { data, error } = await supabase
      .from('jobs')
      .select('id, title, event_type, event_date, status, created_at, clients(name)')
      .eq('photographer_id', photographerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fetchJobs] erro:', error);
      setLoading(false);
      return;
    }

    const jobsBase = (data ?? []) as any[];

    // Busca contratos separadamente para derivar contract_status
    const jobIds = jobsBase.map((j) => j.id);
    let contractMap: Record<string, string> = {};

    if (jobIds.length > 0) {
      const { data: contracts, error: cErr } = await supabase
        .from('contracts')
        .select('job_id, signed_at')
        .in('job_id', jobIds);

      if (cErr) {
        console.error('[fetchJobs] erro ao buscar contratos:', cErr);
      } else {
        for (const c of contracts ?? []) {
          if (c.job_id) contractMap[c.job_id] = c.signed_at ? 'assinado' : 'enviado';
        }
      }
    }

    const normalized: Job[] = jobsBase.map((j) => ({
      ...j,
      contract_status: contractMap[j.id] ?? null,
    }));

    setJobs(normalized);
    setLoading(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedClientId('');
    setForm(EMPTY_FORM);
    onModalClose?.();
  };

  const handleOpenModal = () => {
    setSelectedClientId('');
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const clientId = initialClient?.id ?? selectedClientId;
    if (!photographerId || !clientId || !form.title.trim()) return;

    setSaving(true);
    const { data, error } = await supabase.from('jobs').insert({
      photographer_id: photographerId,
      client_id: clientId,
      title: form.title.trim(),
      event_type: form.event_type || null,
      event_date: form.event_date || null,
      notes: form.notes.trim() || null,
      status: 'draft',
    }).select('id').single();

    if (error || !data) {
      toast({ title: 'Erro ao criar trabalho', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Busca nome do cliente para exibir na confirmação
    const clientName =
      initialClient?.name ??
      clientOptions.find((c) => c.id === selectedClientId)?.name ??
      '';

    handleCloseModal();
    fetchJobs();
    setSaving(false);

    setConfirmation({
      jobId: data.id,
      clientName,
      eventType: form.event_type || null,
      eventDate: form.event_date || null,
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      j.clients?.name.toLowerCase().includes(q) ||
      j.event_type?.toLowerCase().includes(q) ||
      STATUS_LABELS[j.status]?.toLowerCase().includes(q)
    );
  });

  // Contadores por status
  const counts = Object.fromEntries(
    Object.keys(STATUS_LABELS).map((k) => [k, jobs.filter((j) => j.status === k).length])
  );

  if (contractJobId) {
    return (
      <AdminContractCreate
        jobId={contractJobId}
        onBack={() => { setContractJobId(null); fetchJobs(); onContractActionsChange?.(null); }}
        onActionsChange={onContractActionsChange}
      />
    );
  }

  if (detailJobId) {
    return (
      <AdminJobDetail
        jobId={detailJobId}
        onBack={() => { setDetailJobId(null); fetchJobs(); }}
        onOpenContract={(jId) => { setDetailJobId(null); setContractJobId(jId); }}
        onGalleryUrlChange={onGalleryUrlChange}
      />
    );
  }

  return (
    <>
      {confirmation && (
        <JobConfirmation
          clientName={confirmation.clientName}
          eventType={confirmation.eventType}
          eventDate={confirmation.eventDate}
          onGenerateContract={() => {
            const jobId = confirmation.jobId;
            setConfirmation(null);
            setContractJobId(jobId);
          }}
          onSkip={() => {
            const jobId = confirmation.jobId;
            setConfirmation(null);
            setDetailJobId(jobId);
          }}
        />
      )}
      <style>{`
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-modal-backdrop { animation: modalFadeIn 0.2s ease-out forwards; }
        .animate-modal-content { animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      <div>

        {/* Sub-header Controls */}
        <div className="flex justify-between items-center mb-8 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar trabalho..."
              className="pl-9 pr-4 py-2 w-[300px] bg-transparent border-0 border-b border-[#E5E7EB] text-[13px] text-[#1A1A1A] placeholder-[#999] focus:border-[#1A1A1A] focus:outline-none transition-all"
            />
          </div>
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 bg-[#C65D3B] text-white rounded-sm px-5 py-2 font-medium text-[13px] hover:bg-[#a34a2e] transition-colors"
          >
            + Novo Trabalho
          </button>
        </div>

        {/* Tabela */}
        <div className="w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[20%]">Cliente</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[20%]">Título</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[12%]">Tipo</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[10%]">Data</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[13%]">Status</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[15%]">Contrato</th>
                <th className="pb-3 text-center text-[12px] font-medium text-[#666666] tracking-wide w-[10%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-zinc-300 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <Briefcase className="mx-auto mb-3 h-9 w-9 text-zinc-200" />
                    <p className="text-[#666666] text-[13px]">{search ? 'Nenhum trabalho encontrado.' : 'Nenhum trabalho cadastrado ainda.'}</p>
                    {!search && (
                      <button onClick={handleOpenModal} className="mt-4 text-[13px] text-[#C65D3B] hover:underline transition-colors">
                        Criar primeiro trabalho
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((job, index) => (
                  <tr
                    key={job.id}
                    className="border-b border-[#E5E7EB] last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer"
                    onClick={() => setDetailJobId(job.id)}
                  >
                    <td className="py-4 pr-6">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#F2F2F2] flex items-center justify-center text-[11px] font-semibold text-[#C65D3B] shrink-0">
                          {job.clients?.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <span className="text-[13px] text-[#1A1A1A] font-medium">{job.clients?.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-[13px] text-[#1A1A1A] font-medium">{job.title}</td>
                    <td className="py-4 pr-6 text-[13px] text-[#666666]">{job.event_type ?? '—'}</td>
                    <td className="py-4 pr-6 text-[13px] text-[#666666]">{formatDate(job.event_date)}</td>
                    <td className="py-4 pr-6">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-4 pr-6">
                      <ContractBadge
                        status={job.contract_status}
                        onOpenContract={() => { setContractJobId(job.id); }}
                      />
                    </td>
                    <td className="py-4 text-center relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-[#999] hover:text-[#1A1A1A] transition-colors outline-none p-1 rounded-sm"
                        onClick={() => setOpenMenuIndex(openMenuIndex === index ? null : index)}
                      >
                        <MoreVertical className="w-4 h-4 mx-auto" />
                      </button>
                      {openMenuIndex === index && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuIndex(null)} />
                          <div className="absolute top-[36px] right-0 w-36 bg-white border border-[#E5E7EB] shadow-lg rounded-sm z-50 flex flex-col py-1.5">
                            <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white border-t border-l border-[#E5E7EB] rotate-45" />
                            <button
                              onClick={() => { setOpenMenuIndex(null); setDetailJobId(job.id); }}
                              className="px-4 py-2 text-left text-[13px] text-[#4A4A4A] hover:bg-[#F5F5F3] hover:text-[#1A1A1A] relative z-10 transition-colors flex items-center gap-2"
                            >
                              <ChevronRight className="w-3.5 h-3.5" /> Ver detalhes
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar Novo Trabalho */}
      {isModalOpen && (
        <div
          className="fixed inset-0 w-full h-full z-[9999] bg-zinc-900/60 flex items-center justify-center p-4 font-sans animate-modal-backdrop"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white w-full max-w-[550px] rounded shadow-2xl flex flex-col animate-modal-content max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 shrink-0">
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">Criar novo trabalho</h2>
              <button onClick={handleCloseModal} className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-all">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-6 overflow-y-auto">
              {/* Cliente */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1A1A1A]">Cliente <span className="text-zinc-400">*</span></label>
                <p className="text-xs text-zinc-500 mb-1">Quem contratou o serviço</p>
                {initialClient ? (
                  <div className="w-full h-[42px] px-4 flex items-center border border-zinc-200 rounded bg-zinc-50 text-sm text-zinc-500 cursor-not-allowed select-none">
                    {initialClient.name}
                  </div>
                ) : (
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all bg-white text-zinc-900"
                  >
                    <option value="" disabled>Selecione um cliente</option>
                    {clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Título */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1A1A1A]">Título <span className="text-zinc-400">*</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Casamento Ana e João" className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all" />
              </div>

              {/* Tipo de Ensaio */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1A1A1A]">Tipo de ensaio</label>
                <p className="text-xs text-zinc-500 mb-1">Define o template de contrato sugerido</p>
                <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all bg-white">
                  <option value="">Selecione um tipo</option>
                  <option>Gestante</option>
                  <option>Newborn</option>
                  <option>Casamento</option>
                  <option>Ensaio Pet</option>
                  <option>Institucional</option>
                  <option>15 Anos</option>
                  <option>Família</option>
                  <option>Formatura</option>
                </select>
              </div>

              {/* Data e Horário */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1A1A1A]">Data e horário</label>
                <p className="text-xs text-zinc-500 mb-1">Quando será o ensaio</p>
                <div className="flex gap-3">
                  <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="w-[60%] h-[42px] px-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all" />
                  <input type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} className="w-[40%] h-[42px] px-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all" />
                </div>
              </div>

              {/* Local */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1A1A1A]">Local</label>
                <input type="text" placeholder="Ex: Studio, Parque da Cidade..." className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all" />
              </div>

              {/* Valor e Pagamento */}
              <div className="flex flex-col gap-1 pt-3 border-t border-zinc-100">
                <label className="text-sm font-medium text-[#1A1A1A]">Valor e pagamento</label>
                <p className="text-xs text-zinc-500 mb-1">Pode preencher depois no contrato</p>
                <div className="flex gap-3 mt-1">
                  <div className="w-1/2 flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-zinc-700">Valor total</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">R$</span>
                      <input type="text" placeholder="0,00" onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/[^0-9,.]/g, ''); }} className="w-full h-[42px] pl-8 pr-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all" />
                    </div>
                  </div>
                  <div className="w-1/2 flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-zinc-700">Sinal (entrada)</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">R$</span>
                      <input type="text" placeholder="0,00" onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/[^0-9,.]/g, ''); }} className="w-full h-[42px] pl-8 pr-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Anotações Internas */}
              <div className="flex flex-col gap-1 pt-3 border-t border-zinc-100">
                <label className="text-sm font-medium text-[#1A1A1A]">Anotações internas</label>
                <p className="text-xs text-zinc-500 mb-1">Só o fotógrafo vê isto</p>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex: Cliente pediu foco em fotos mais espontâneas..." className="w-full p-4 border border-zinc-200 rounded text-sm outline-none focus:border-[#C65D3B] transition-all resize-none"></textarea>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-zinc-200 bg-white rounded-b shrink-0">
              <button onClick={handleCloseModal} className="text-sm font-bold text-zinc-500 hover:text-red-600 hover:bg-red-50 px-5 py-2.5 rounded transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !(initialClient?.id ?? selectedClientId)}
                className="bg-[#C65D3B] text-white text-sm font-bold px-6 py-2.5 rounded hover:bg-[#a34a2e] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar Trabalho
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

