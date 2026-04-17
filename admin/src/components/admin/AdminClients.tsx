import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { useToast } from '@/hooks/use-toast';
import { Search, MoreVertical, X, Loader2, User, AlertTriangle, Briefcase, Copy, Check } from 'lucide-react';
import AdminClientProfile from './AdminClientProfile';

function generatePassword(length = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

interface Client {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
  created_at: string;
}

interface FormData {
  name: string;
  email: string;
  whatsapp: string;
  notes: string;
}

const EMPTY_FORM: FormData = { name: '', email: '', whatsapp: '', notes: '' };
const PAGE_SIZE = 7;

interface AdminClientsProps {
  onNewJob?: (client: Client) => void;
  onOpenJob?: (jobId: string) => void;
}

const AdminClients = ({ onNewJob, onOpenJob }: AdminClientsProps) => {
  const photographerId = usePhotographerId();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [profileClient, setProfileClient] = useState<Client | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    if (!photographerId) return;
    fetchClients();
  }, [photographerId]);

  const fetchClients = async () => {
    if (!photographerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('photographer_id', photographerId)
      .order('name');
    if (error) {
      toast({ title: 'Erro ao carregar clientes', variant: 'destructive' });
    } else {
      setClients((data || []) as Client[]);
    }
    setLoading(false);
  };

  const openNew = () => {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setGeneratedPassword(generatePassword());
    setIsModalOpen(true);
  };

  const copyToClipboard = async (text: string, field: 'email' | 'password') => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      email: client.email || '',
      whatsapp: client.whatsapp || '',
      notes: client.notes || '',
    });
    setOpenMenuIndex(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!photographerId || !form.name.trim()) return;

    // Validação de E-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim() || !emailRegex.test(form.email.trim())) {
      toast({ 
        title: 'E-mail inválido', 
        description: 'Por favor, insira um endereço de e-mail válido.', 
        variant: 'destructive' 
      });
      return;
    }

    // Validação de Telefone/WhatsApp (Exige 10 ou 11 dígitos numéricos)
    const phoneDigits = form.whatsapp.replace(/\D/g, '');
    if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      toast({ 
        title: 'Telefone inválido', 
        description: 'O telefone deve conter o DDD e o número (10 ou 11 dígitos).', 
        variant: 'destructive' 
      });
      return;
    }

    setSaving(true);

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update({
          name: form.name.trim(),
          email: form.email.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq('id', editingClient.id);

      if (error) {
        toast({ title: 'Erro ao atualizar cliente', variant: 'destructive' });
      } else {
        toast({ title: 'Cliente atualizado!' });
        setIsModalOpen(false);
        fetchClients();
      }
    } else {
      const { data: newClient, error } = await supabase.from('clients').insert({
        photographer_id: photographerId,
        name: form.name.trim(),
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        notes: form.notes.trim() || null,
      }).select('id').single();

      if (error || !newClient) {
        toast({ title: 'Erro ao cadastrar cliente', variant: 'destructive' });
      } else {
setIsModalOpen(false);
        fetchClients();
        setCreatedCredentials({
          name: form.name.trim(),
          email: form.email.trim(),
          password: generatedPassword,
        });
      }
    }
    setSaving(false);
  };

  const handleDeleteClick = (client: Client) => {
    setOpenMenuIndex(null);
    setClientToDelete(client);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    
    const { error } = await supabase.from('clients').delete().eq('id', clientToDelete.id);
    if (error) {
      toast({ title: 'Não é possível excluir este cliente', description: 'Este cliente possui trabalhos vinculados. Exclua os trabalhos primeiro.', variant: 'destructive' });
    } else {
      toast({ title: 'Cliente removido.' });
      fetchClients();
    }
    setClientToDelete(null);
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.whatsapp?.includes(search)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return '—';
    // Remove tudo que não for número
    const numbers = phone.replace(/\D/g, ''); 
    
    // Celular (11 dígitos): (99) 99999-9999
    if (numbers.length === 11) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    }
    // Fixo (10 dígitos): (99) 9999-9999
    if (numbers.length === 10) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    }
    // Retorna o original se não tiver 10 ou 11 dígitos
    return phone; 
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  if (profileClient) {
    return (
      <AdminClientProfile
        client={profileClient}
        onBack={() => setProfileClient(null)}
        onNewJob={(client) => { setProfileClient(null); onNewJob?.(client); }}
        onOpenJob={onOpenJob}
      />
    );
  }

  return (
    <>
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
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Pesquisar cliente..."
              className="pl-9 pr-4 py-2 w-[300px] bg-transparent border-0 border-b border-[#E5E7EB] text-[13px] text-[#1A1A1A] placeholder-[#999] focus:border-[#1A1A1A] focus:outline-none transition-all"
            />
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-[#C65D3B] text-white rounded-sm px-5 py-2 font-medium text-[13px] hover:bg-[#a34a2e] transition-colors"
          >
            + Novo Cliente
          </button>
        </div>

        {/* Table */}
        <div className="w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[25%]">Nome</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[30%]">E-mail</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[20%]">Telefone/WhatsApp</th>
                <th className="pb-3 pr-6 text-[12px] font-medium text-[#666666] tracking-wide w-[15%]">Adicionado em</th>
                <th className="pb-3 text-center text-[12px] font-medium text-[#666666] tracking-wide w-[10%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-zinc-300 mx-auto" />
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <User className="mx-auto mb-3 h-9 w-9 text-zinc-200" />
                    <p className="text-[#666666] text-[13px]">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
                    {!search && (
                      <button onClick={openNew} className="mt-4 text-[13px] text-[#C65D3B] hover:underline transition-colors">
                        Cadastrar primeiro cliente
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((client, index) => (
                  <tr key={client.id} className="border-b border-[#E5E7EB] last:border-0 hover:bg-black/[0.02] transition-colors relative">
                    <td className="py-4 pr-6 cursor-pointer" onClick={() => setProfileClient(client)}>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#F2F2F2] flex items-center justify-center text-[11px] font-semibold text-[#C65D3B] shrink-0">
                          {getInitial(client.name)}
                        </div>
                        <span className="text-[13px] text-[#1A1A1A] font-medium hover:text-[#C65D3B] transition-colors">{client.name}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-[13px] text-[#666666]">{client.email || '—'}</td>
                    <td className="py-4 pr-6 text-[13px] text-[#666666]">{formatPhone(client.whatsapp)}</td>
                    <td className="py-4 pr-6 text-[13px] text-[#666666]">{formatDate(client.created_at)}</td>
                    <td className={`py-4 text-center relative ${openMenuIndex === index ? 'z-30' : 'z-0'}`}>
                      <button
                        className="text-[#999] hover:text-[#1A1A1A] transition-colors outline-none p-1 rounded-sm"
                        onClick={() => setOpenMenuIndex(openMenuIndex === index ? null : index)}
                      >
                        <MoreVertical className="w-4 h-4 mx-auto" />
                      </button>

                      {openMenuIndex === index && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuIndex(null)} />
                          <div className="absolute top-[36px] right-0 w-44 bg-white border border-[#E5E7EB] shadow-lg rounded-sm z-50 flex flex-col py-1.5">
                            <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white border-t border-l border-[#E5E7EB] rotate-45" />
                            <button
                              onClick={() => openEdit(client)}
                              className="px-4 py-2 text-left text-[13px] text-[#4A4A4A] hover:bg-[#F5F5F3] hover:text-[#1A1A1A] relative z-10 transition-colors"
                            >
                              Editar
                            </button>
                            {onNewJob && (
                              <>
                                <div className="h-px bg-[#E5E7EB] my-1 relative z-10" />
                                <button
                                  onClick={() => { setOpenMenuIndex(null); onNewJob(client); }}
                                  className="px-4 py-2 text-left text-[13px] text-[#4A4A4A] hover:bg-[#F5F5F3] hover:text-[#1A1A1A] relative z-10 transition-colors flex items-center gap-2"
                                >
                                  <Briefcase className="w-3.5 h-3.5" />
                                  Novo Trabalho
                                </button>
                              </>
                            )}
                            <div className="h-px bg-[#E5E7EB] my-1 relative z-10" />
                            <button
                              onClick={() => handleDeleteClick(client)}
                              className="px-4 py-2 text-left text-[13px] text-red-500 hover:bg-red-50 relative z-10 transition-colors"
                            >
                              Excluir
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-10 pt-6 border-t border-[#E5E7EB]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-[13px] text-[#666666] hover:text-[#1A1A1A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded-sm flex items-center justify-center text-[13px] transition-colors ${
                  p === currentPage
                    ? 'bg-[#1A1A1A] text-white'
                    : 'text-[#666666] hover:text-[#1A1A1A]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-[13px] text-[#666666] hover:text-[#1A1A1A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Próximo →
            </button>
          </div>
        )}
      </div>

      {/* Modal Criar / Editar Cliente */}
      {isModalOpen && (
        <div
          className="fixed inset-0 w-full h-full z-[9999] bg-zinc-900/60 flex items-center justify-center p-4 font-sans animate-modal-backdrop"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-[550px] rounded shadow-2xl flex flex-col animate-modal-content max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 shrink-0">
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">
                {editingClient ? 'Editar cliente' : 'Criar novo cliente'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-all"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 flex flex-col gap-5 overflow-y-auto">
              {/* Nome */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#1A1A1A]">
                  Nome <span className="text-zinc-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Ana Paula Silva"
                  autoFocus
                  className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#C65D3B] transition-all"
                />
              </div>

              {/* E-mail */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#1A1A1A]">
                  E-mail <span className="text-zinc-400">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ana@email.com"
                  className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#C65D3B] transition-all"
                />
              </div>

              {/* Telefone / WhatsApp */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#1A1A1A]">
                  Telefone / Whatsapp <span className="text-zinc-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="(11) 99999-9999"
                  className="w-full h-[42px] px-4 border border-zinc-200 rounded text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#C65D3B] transition-all"
                />
              </div>

              {/* Senha (apenas no cadastro) */}
              {!editingClient && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[#1A1A1A]">Senha de acesso à galeria</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedPassword}
                      className="flex-1 h-[42px] px-4 border border-zinc-200 bg-zinc-50 rounded text-sm font-mono text-zinc-700 outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedPassword, 'password')}
                      className="h-[42px] px-3 border border-zinc-200 rounded bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 transition-colors"
                      title="Copiar senha"
                    >
                      {copiedField === 'password' ? <Check className="w-4 h-4 text-[#C65D3B]" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeneratedPassword(generatePassword())}
                      className="h-[42px] px-3 border border-zinc-200 rounded bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 transition-colors text-xs font-medium"
                      title="Gerar nova senha"
                    >
                      ↺
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Gerada automaticamente. Anote antes de salvar — será exibida uma vez após o cadastro.
                  </p>
                </div>
              )}

              {/* Observações */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#1A1A1A]">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Informações adicionais sobre o cliente..."
                  rows={3}
                  className="w-full px-4 py-3 border border-zinc-200 rounded text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-[#C65D3B] transition-all resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-zinc-200 bg-white rounded-b shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-sm font-bold text-zinc-500 hover:text-red-600 hover:bg-red-50 px-5 py-2.5 rounded transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="bg-[#C65D3B] text-white text-sm font-semibold px-6 py-2.5 rounded-sm hover:bg-[#a34a2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingClient ? 'Salvar' : 'Criar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão (Novo Design) */}
      {clientToDelete && (
        <div
          className="fixed inset-0 w-full h-full z-[9999] bg-zinc-900/60 flex items-center justify-center p-4 font-sans animate-modal-backdrop"
          onClick={() => setClientToDelete(null)}
        >
          <div
            className="bg-white rounded-[4px] p-6 w-full max-w-[400px] shadow-sm ring-1 ring-gray-100 animate-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Cabeçalho (Ícone + Título) */}
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" strokeWidth={1.5} />
              <h2 className="text-[20px] font-medium text-[#1A1A1A]">
                Excluir cliente
              </h2>
            </div>

            {/* Texto descritivo */}
            <p className="text-[15px] leading-relaxed text-zinc-500 mb-8">
              Tem certeza que deseja excluir o cliente <strong className="font-medium text-[#1A1A1A]">{clientToDelete.name}</strong>? Esta ação não pode ser desfeita.
            </p>

            {/* Botões de Ação */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setClientToDelete(null)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-[4px] text-[15px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Não, manter.
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 rounded-[4px] text-[15px] font-semibold text-white hover:bg-red-700 transition-colors shadow-sm"
              >
                Sim, excluir!
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* Modal de credenciais pós-criação */}
      {createdCredentials && (
        <div className="fixed inset-0 w-full h-full z-[9999] bg-zinc-900/60 flex items-center justify-center p-4 font-sans animate-modal-backdrop">
          <div className="bg-white w-full max-w-[460px] rounded shadow-2xl flex flex-col animate-modal-content">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#FAF0EC] flex items-center justify-center">
                  <Check className="w-4 h-4 text-[#C65D3B]" />
                </div>
                <h2 className="text-[16px] font-medium text-[#1A1A1A]">Cliente cadastrado!</h2>
              </div>
              <button
                onClick={() => setCreatedCredentials(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-all"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 flex flex-col gap-4">
              <p className="text-sm text-zinc-500">
                Anote ou envie as credenciais de acesso para <strong className="text-zinc-900">{createdCredentials.name}</strong>. A senha não poderá ser recuperada depois.
              </p>

              {/* E-mail */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">E-mail</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[42px] px-4 flex items-center bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-800 font-medium select-all">
                    {createdCredentials.email}
                  </div>
                  <button
                    onClick={() => copyToClipboard(createdCredentials.email, 'email')}
                    className="h-[42px] px-3 border border-zinc-200 rounded bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    {copiedField === 'email' ? <Check className="w-4 h-4 text-[#C65D3B]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Senha */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Senha de acesso à galeria</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[42px] px-4 flex items-center bg-zinc-50 border border-zinc-200 rounded text-sm font-mono text-zinc-800 font-bold tracking-wider select-all">
                    {createdCredentials.password}
                  </div>
                  <button
                    onClick={() => copyToClipboard(createdCredentials.password, 'password')}
                    className="h-[42px] px-3 border border-zinc-200 rounded bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    {copiedField === 'password' ? <Check className="w-4 h-4 text-[#C65D3B]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded px-4 py-3 text-xs text-amber-700 leading-relaxed">
                ⚠ Esta é a única vez que a senha aparece em texto. Depois só é possível redefinir dentro do trabalho do cliente.
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end px-6 py-5 border-t border-zinc-200">
              <button
                onClick={() => setCreatedCredentials(null)}
                className="bg-[#C65D3B] text-white text-sm font-semibold px-6 py-2.5 rounded-sm hover:bg-[#a34a2e] transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminClients;