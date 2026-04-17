import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Mail, Phone, FileText, Briefcase, Calendar, Plus } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
  created_at: string;
}

interface Job {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string | null;
  status: string;
  contract_status?: string | null;
  created_at: string;
}

interface AdminClientProfileProps {
  client: Client;
  onBack: () => void;
  onNewJob: (client: Client) => void;
  onOpenJob?: (jobId: string) => void;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  em_andamento: { label: 'Em andamento', color: 'bg-[#FAF0EC] text-[#C65D3B] border border-[#e8c4b8]' },
  aguardando:   { label: 'Aguardando',   color: 'bg-amber-50 text-amber-700 border border-amber-100' },
  concluido:    { label: 'Concluído',    color: 'bg-[#FAF0EC] text-[#C65D3B] border border-[#e8c4b8]' },
  cancelado:    { label: 'Cancelado',    color: 'bg-red-50 text-red-600 border border-red-100' },
};

const CONTRACT_LABEL: Record<string, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'bg-zinc-100 text-zinc-600' },
  enviado:  { label: 'Enviado',  color: 'bg-[#FAF0EC] text-[#C65D3B]' },
  assinado: { label: 'Assinado', color: 'bg-[#FAF0EC] text-[#C65D3B]' },
  arquivado:{ label: 'Arquivado',color: 'bg-zinc-100 text-zinc-500' },
};

const AdminClientProfile = ({ client, onBack, onNewJob, onOpenJob }: AdminClientProfileProps) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const initials = client.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return '—';
    const n = phone.replace(/\D/g, '');
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return phone;
  };

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('jobs')
        .select('id, title, event_type, event_date, status, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });
      setJobs((data || []) as Job[]);
      setLoading(false);
    };
    fetchJobs();
  }, [client.id]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[13px] text-[#666666] hover:text-[#1A1A1A] transition-colors group"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Clientes
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#F2F2F2] flex items-center justify-center text-[#C65D3B] text-lg font-semibold shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-[22px] font-medium text-[#1A1A1A] leading-tight">{client.name}</h1>
            <p className="text-[13px] text-[#666666] mt-0.5">
              Cliente desde {formatDate(client.created_at)}
            </p>
          </div>
        </div>

        <button
          onClick={() => onNewJob(client)}
          className="flex items-center gap-2 bg-[#C65D3B] text-white rounded-sm px-5 py-2 font-medium text-[13px] hover:bg-[#a34a2e] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Trabalho
        </button>
      </div>

      {/* Dados de contato */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-[#999] shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[#999] uppercase tracking-wide mb-0.5">E-mail</p>
            <p className="text-[13px] text-[#1A1A1A] truncate">{client.email || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Phone className="w-4 h-4 text-[#999] shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-[#999] uppercase tracking-wide mb-0.5">Telefone</p>
            <p className="text-[13px] text-[#1A1A1A]">{formatPhone(client.whatsapp)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Briefcase className="w-4 h-4 text-[#999] shrink-0" />
          <div>
            <p className="text-[11px] font-medium text-[#999] uppercase tracking-wide mb-0.5">Trabalhos</p>
            <p className="text-[13px] text-[#1A1A1A]">{loading ? '...' : jobs.length}</p>
          </div>
        </div>
      </div>

      {/* Observações */}
      {client.notes && (
        <div className="border-l-2 border-amber-300 pl-4 py-1">
          <p className="text-[11px] font-medium text-[#999] uppercase tracking-wide mb-1">Observações</p>
          <p className="text-[13px] text-[#4A4A4A]">{client.notes}</p>
        </div>
      )}

      {/* Histórico de trabalhos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[12px] font-medium text-[#666666] uppercase tracking-wide">Histórico de trabalhos</h2>
          <button
            onClick={() => onNewJob(client)}
            className="flex items-center gap-1.5 text-[13px] text-[#C65D3B] hover:underline transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo trabalho
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#CCC]" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center border-t border-[#E5E7EB]">
            <FileText className="mx-auto mb-3 w-9 h-9 text-[#DDD]" />
            <p className="text-[13px] text-[#666666] mb-4">Nenhum trabalho criado ainda.</p>
            <button
              onClick={() => onNewJob(client)}
              className="text-[13px] text-[#C65D3B] hover:underline transition-colors"
            >
              Criar primeiro trabalho
            </button>
          </div>
        ) : (
          <div className="border-t border-[#E5E7EB]">
            {jobs.map((job) => {
              const status = STATUS_LABEL[job.status] ?? { label: job.status, color: 'bg-zinc-100 text-zinc-600' };
              return (
                <div
                  key={job.id}
                  onClick={() => onOpenJob?.(job.id)}
                  className={`flex items-center justify-between py-4 border-b border-[#E5E7EB] ${onOpenJob ? 'hover:bg-black/[0.02] cursor-pointer transition-colors' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-sm bg-[#F2F2F2] flex items-center justify-center shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-[#999]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1A1A1A]">{job.title || job.event_type || '—'}</p>
                      <p className="text-[12px] text-[#999] mt-0.5">
                        {job.event_type && <span className="mr-2">{job.event_type}</span>}
                        {formatDate(job.event_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border ${status.color}`}>
                      {status.label}
                    </span>
                    {onOpenJob && (
                      <ArrowLeft className="w-3.5 h-3.5 text-[#CCC] rotate-180" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminClientProfile;
