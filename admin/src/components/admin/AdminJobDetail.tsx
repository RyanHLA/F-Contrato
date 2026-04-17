import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, X, Menu, FileText, Trash2, Plus, MoreVertical } from 'lucide-react';
import { r2Storage } from '@/lib/r2';
import imageCompression from 'browser-image-compression';

/* ─── Tipos Watermark ────────────────────────────────────────────────── */
interface Watermark {
  id: string;
  name: string;
  image_url: string;
  r2_key: string | null;
}

type WmPosition = 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';


const positionToStyle = (pos: WmPosition, size: number): React.CSSProperties => {
  const s = `${size}%`;
  const base: React.CSSProperties = { position: 'absolute', width: s, height: s, pointerEvents: 'none', opacity: 0.7 };
  const map: Record<WmPosition, React.CSSProperties> = {
    'top-left':      { top: '5%', left: '5%' },
    'top-center':    { top: '5%', left: '50%', transform: 'translateX(-50%)' },
    'top-right':     { top: '5%', right: '5%' },
    'center':        { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
    'bottom-left':   { bottom: '5%', left: '5%' },
    'bottom-center': { bottom: '5%', left: '50%', transform: 'translateX(-50%)' },
    'bottom-right':  { bottom: '5%', right: '5%' },
  };
  return { ...base, ...map[pos] };
};

/* ─── Modal Marca d'água ─────────────────────────────────────────────── */
const WatermarkModal = ({
  jobId,
  photographerId,
  currentWatermarkId,
  onClose,
  onSaved,
}: {
  jobId: string;
  photographerId: string;
  currentWatermarkId: string | null;
  onClose: () => void;
  onSaved: (id: string | null, position: WmPosition, size: number) => void;
}) => {
  const { toast } = useToast();
  const [watermarks, setWatermarks] = useState<Watermark[]>([]);
  const [selected, setSelected] = useState<string | null>(currentWatermarkId);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [position, setPosition] = useState<WmPosition>('center');
  const [size, setSize] = useState(30);
  const [step, setStep] = useState<'select' | 'position'>('select');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchWatermarks = useCallback(async () => {
    const { data } = await supabase
      .from('watermarks')
      .select('id, name, image_url, r2_key')
      .eq('photographer_id', photographerId)
      .order('created_at');
    const raw = (data ?? []) as Watermark[];
    // Gera presigned URLs para watermarks no bucket privado
    const keysToSign = raw.filter(w => w.r2_key).map(w => w.r2_key!);
    const urlMap = keysToSign.length > 0 ? await r2Storage.signBatch(keysToSign, 7200) : {};
    const signed = raw.map(w => ({
      ...w,
      image_url: w.r2_key ? (urlMap[w.r2_key] ?? w.image_url) : w.image_url,
    }));
    setWatermarks(signed);
  }, [photographerId]);

  // Carrega configurações atuais do job
  useEffect(() => {
    fetchWatermarks();
    supabase.from('jobs').select('watermark_position, watermark_size').eq('id', jobId).single()
      .then(({ data }) => {
        if (data?.watermark_position) setPosition(data.watermark_position as WmPosition);
        if (data?.watermark_size) setSize(data.watermark_size);
      });
  }, [fetchWatermarks, jobId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await r2Storage.upload(file, 'watermarks');
      if (!result) throw new Error('Upload falhou');
      const { data, error } = await supabase.from('watermarks').insert({
        photographer_id: photographerId,
        name: file.name.replace(/\.[^/.]+$/, ''),
        image_url: '',
        r2_key: result.key,
      }).select('id, name, image_url, r2_key').single();
      if (error) throw error;
      const wm = data as Watermark;
      const signedUrl = wm.r2_key ? await r2Storage.sign(wm.r2_key, 7200) : null;
      const wmWithUrl = { ...wm, image_url: signedUrl ?? wm.image_url };
      setWatermarks((prev) => [...prev, wmWithUrl]);
      setSelected(wmWithUrl.id);
      setStep('position');
    } catch {
      toast({ title: 'Erro ao fazer upload', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (wm: Watermark) => {
    setMenuOpen(null);
    if (!confirm(`Excluir "${wm.name}"?`)) return;
    if (wm.r2_key) await r2Storage.delete(wm.r2_key);
    await supabase.from('watermarks').delete().eq('id', wm.id);
    setWatermarks((prev) => prev.filter((w) => w.id !== wm.id));
    if (selected === wm.id) { setSelected(null); setStep('select'); }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('jobs').update({
      watermark_id: selected,
      watermark_position: selected ? position : 'center',
      watermark_size: selected ? size : 30,
    }).eq('id', jobId);
    setSaving(false);
    if (error) { toast({ title: 'Erro ao salvar', variant: 'destructive' }); return; }
    toast({ title: 'Marca d\'água salva!' });
    onSaved(selected, position, size);
    onClose();
  };

  const selectedWm = watermarks.find((w) => w.id === selected) ?? null;

  // ── Tela de posicionamento ──
  if (step === 'position' && selectedWm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl p-6 relative" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep('select')} className="text-gray-400 hover:text-gray-700 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-[15px] font-medium text-[#1A1A1A]">Posicionar marca d'água</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex gap-6">
            {/* Preview */}
            <div className="flex-1">
              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Preview</p>
              <div className="relative bg-gray-200 rounded-sm overflow-hidden" style={{ aspectRatio: '3/2' }}>
                <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                  <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                </div>
                <img
                  src={selectedWm.image_url}
                  alt="watermark"
                  style={positionToStyle(position, size)}
                  className="object-contain"
                />
              </div>
            </div>

            {/* Controles */}
            <div className="w-48 flex flex-col gap-5">
              {/* Grid de posição */}
              <div>
                <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Posição</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['top-left','top-center','top-right','center','center','center','bottom-left','bottom-center','bottom-right'] as WmPosition[]).map((pos, i) => {
                    // linha do meio: só o centro importa (índice 4)
                    if (i === 3 || i === 5) return <div key={i} />;
                    return (
                      <button
                        key={i}
                        onClick={() => setPosition(pos)}
                        className={`h-10 rounded border-2 transition-all ${position === pos ? 'border-[#C65D3B] bg-[#C65D3B]' : 'border-gray-200 hover:border-gray-400 bg-gray-50'}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Slider de tamanho */}
              <div>
                <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide mb-2">
                  Tamanho — <span className="text-gray-900">{size}%</span>
                </p>
                <input
                  type="range" min={10} max={80} step={5}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full accent-[#C65D3B]"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>10%</span><span>80%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setStep('select')} className="px-4 py-2 text-[13px] text-gray-600 hover:text-gray-900 font-medium">Voltar</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#C65D3B] hover:bg-[#a34a2e] text-white text-[13px] font-bold rounded-sm transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de seleção ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-sm shadow-2xl w-full max-w-lg p-6 relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-medium text-[#1A1A1A]">Selecione a marca d'água para essa galeria</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-[12px] font-bold rounded-sm mb-5 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          ADICIONAR MARCA D'ÁGUA
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/svg+xml,image/webp" className="sr-only"
          onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }} />

        <div className="flex flex-wrap gap-3 mb-6">
          {/* Sem marca d'água */}
          <div
            onClick={() => setSelected(null)}
            className={`relative w-36 h-44 rounded-sm border-2 cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${selected === null ? 'border-[#C65D3B] bg-[#FAF0EC]' : 'border-gray-200 hover:border-gray-400'}`}
          >
            <div className={`absolute top-2 left-2 w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected === null ? 'border-[#C65D3B]' : 'border-gray-300'}`}>
              {selected === null && <div className="w-2 h-2 rounded-full bg-[#C65D3B]" />}
            </div>
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="text-[11px] text-gray-500 font-medium">Sem marca d'água</span>
          </div>

          {watermarks.map((wm) => (
            <div
              key={wm.id}
              onClick={() => { setSelected(wm.id); setStep('position'); }}
              className={`relative w-36 h-44 rounded-sm border-2 cursor-pointer overflow-hidden transition-all ${selected === wm.id ? 'border-[#C65D3B]' : 'border-gray-200 hover:border-gray-400'}`}
            >
              <div className={`absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-2 ${selected === wm.id ? 'bg-[#C65D3B]' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected === wm.id ? 'border-white' : 'border-gray-400'}`}>
                  {selected === wm.id && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === wm.id ? null : wm.id); }} className="text-white/80 hover:text-white">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              {menuOpen === wm.id && (
                <div className="absolute top-8 right-1 z-10 bg-white border border-gray-200 rounded shadow-lg text-[12px]">
                  <button onClick={() => handleDelete(wm)} className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">Excluir</button>
                </div>
              )}
              <div className="absolute inset-0 top-8" style={{ backgroundImage: 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }}>
                <img src={wm.image_url} alt={wm.name} className="w-full h-full object-contain p-2" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:text-gray-900 font-medium">Cancelar</button>
          <button onClick={selected ? () => setStep('position') : handleSave} disabled={saving} className="px-5 py-2 bg-[#C65D3B] hover:bg-[#a34a2e] text-white text-[13px] font-bold rounded-sm transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Posicionar →' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Tipos ─────────────────────────────────────────────────────────── */
interface JobDetail {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string | null;
  created_at: string;
  status: string;
  notes: string | null;
  album_id: string | null;
  client_id: string;
  clients: {
    name: string;
    email: string | null;
    whatsapp: string | null;
  } | null;
  albums: {
    id: string;
    title: string;
    category: string;
    client_enabled: boolean;
    client_submitted_at: string | null;
  } | null;
}

interface Contract {
  id: string;
  body_html: string;
  signed_at: string | null;
  client_name: string | null;
}

interface Selection {
  id: string;
  image_id: string;
  site_images: { image_url: string; title: string | null } | null;
}

interface Props {
  jobId: string;
  onBack: () => void;
  onOpenContract?: (jobId: string) => void;
  onGalleryUrlChange?: (url: string | null) => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
const CONTRACT_STEPS = ['Criado', 'Enviado', 'Assinado', 'Arquivado'];

const getContractStep = (contract: Contract | null, jobStatus: string): number => {
  if (!contract) return -1;
  if (contract.signed_at) return 2;
  if (jobStatus === 'contract_pending') return 1;
  return 0;
};

const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getInitials = (name: string) =>
  name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();

/* ─── Drawer ─────────────────────────────────────────────────────────── */
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  job: JobDetail;
  contract: Contract | null;
  onOpenContract?: () => void;
}

const Drawer = ({ open, onClose, job, contract, onOpenContract }: DrawerProps) => {
  const contractStep = getContractStep(contract, job.status);
  const paymentBadge = { bg: '#F5EBE0', text: '#634E28', label: '50% pendente' };
  const contractBadge = contract?.signed_at
    ? { bg: '#EBF5EB', text: '#2E6B34', label: 'Contrato assinado' }
    : contract
    ? { bg: '#DBEAFE', text: '#1E40AF', label: 'Contrato enviado' }
    : { bg: '#F4F4F5', text: '#71717A', label: 'Sem contrato' };

  const contractStatusLabel = () => {
    if (!contract) return null;
    if (contract.signed_at) return { label: 'Assinado', bg: '#EBF5EB', text: '#2E6B34' };
    if (job.status === 'contract_pending') return { label: 'Enviado', bg: '#DBEAFE', text: '#1E40AF' };
    return { label: 'Rascunho', bg: '#FFFBEB', text: '#B45309' };
  };
  const ctStatus = contractStatusLabel();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Painel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[292px] bg-[#F6F6F6] border-l border-gray-200 shadow-2xl overflow-y-auto transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-[13px] font-medium text-[#1A1A1A]">Detalhes do Projeto</h1>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Badges de status */}
          <div className="flex gap-2 flex-wrap mb-4">
            <span
              className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight"
              style={{ background: paymentBadge.bg, color: paymentBadge.text }}
            >
              {paymentBadge.label}
            </span>
            <span
              className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight"
              style={{ background: contractBadge.bg, color: contractBadge.text }}
            >
              {contractBadge.label}
            </span>
          </div>

          <div className="flex flex-col gap-4">

            {/* ── Seção CLIENTE ── */}
            <div className="w-full border border-gray-200 rounded p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] bg-white">
              <h2 className="text-[9px] font-bold text-gray-500 tracking-wider mb-2 uppercase">Cliente</h2>
              <div className="flex items-start gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-[#D3E3FD] text-[#0B57D0] flex items-center justify-center text-[11px] font-semibold shrink-0">
                  {job.clients?.name ? getInitials(job.clients.name) : '?'}
                </div>
                <div className="leading-tight">
                  <div className="font-semibold text-gray-900 text-[12.5px]">{job.clients?.name ?? '—'}</div>
                  <div className="text-gray-500 text-[11px] mt-0.5 leading-none">
                    {[job.clients?.email, job.clients?.whatsapp].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-100 mt-3 mb-0.5" />
              <div className="flex flex-col">
                {[
                  { label: 'Tipo', value: job.event_type ?? '—' },
                  { label: 'Data do ensaio', value: formatDate(job.event_date) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-gray-500 text-[11.5px]">{label}</span>
                    <span className="text-gray-900 text-[11.5px] font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Seção CONTRATO ── */}
            <div className="w-full border border-gray-200 rounded p-3 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[9px] font-bold text-gray-500 tracking-wider uppercase">Contrato</h2>
                {ctStatus && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: ctStatus.bg, color: ctStatus.text }}
                  >
                    {ctStatus.label}
                  </span>
                )}
              </div>

              {contract ? (
                <>
                  {/* Barra de progresso */}
                  <div className="flex justify-between gap-1.5 mb-3">
                    {CONTRACT_STEPS.map((step, i) => {
                      const done = i <= contractStep;
                      return (
                        <div key={step} className="flex-1">
                          <div className={`h-[3px] w-full rounded-full mb-1 ${done ? 'bg-[#2E6B34]' : 'bg-[#E5E7EB]'}`} />
                          <span className={`text-[9px] font-medium block ${i === 0 ? '' : i === CONTRACT_STEPS.length - 1 ? 'text-right' : 'text-center'} ${done ? 'text-[#2E6B34]' : 'text-gray-400'}`}>
                            {step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={onOpenContract}
                      className="flex-1 py-1.5 border border-gray-300 rounded text-[10px] font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                    >
                      Visualizar
                    </button>
                    <button
                      className="flex-1 py-1.5 border border-gray-300 rounded text-[10px] font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                    >
                      Reenviar
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-3 gap-2">
                  <p className="text-[11px] text-gray-400 text-center">Nenhum contrato gerado ainda.</p>
                  <button
                    onClick={onOpenContract}
                    className="flex items-center gap-1.5 w-full justify-center py-2 bg-[#C65D3B] text-white rounded text-[11px] font-bold hover:bg-[#a34a2e] transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    Gerar contrato
                  </button>
                </div>
              )}
            </div>

            {/* ── Seção ANOTAÇÕES ── */}
            <div className="w-full border border-gray-200 rounded p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] bg-white">
              <h2 className="text-[9px] font-bold text-gray-500 tracking-wider mb-2 uppercase">Anotações</h2>
              <div className="border border-gray-200 rounded-sm p-2 h-[110px] overflow-y-auto bg-white">
                <p className="text-[12px] text-gray-800 leading-[1.4]">
                  {job.notes || <span className="text-gray-400 italic">Sem anotações.</span>}
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

/* ─── Placeholder das abas ainda não implementadas ───────────────────── */
const TabPlaceholder = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
      <FileText className="w-5 h-5 text-zinc-300" />
    </div>
    <p className="text-[13px] font-medium text-zinc-400">Aba <strong>{label}</strong> em construção.</p>
  </div>
);

/* ─── Tab Entrega em Alta ────────────────────────────────────────────── */
const TabEntrega = ({ job }: { job: JobDetail }) => {
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  // grupos independentes — null = nenhuma opção selecionada no grupo
  const [highResEnabled, setHighResEnabled] = useState(false);
  const [highRes, setHighRes] = useState<'original' | '3600'>('original');
  const [webEnabled, setWebEnabled] = useState(false);
  const [webSize, setWebSize] = useState<'2048' | '1024' | '640'>('2048');
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.from('jobs')
      .select('download_enabled, download_resolution, download_high_res, download_web_size')
      .eq('id', job.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const d = data as unknown as {
          download_enabled: boolean | null;
          download_resolution: string | null;
          download_high_res: string | null;
          download_web_size: string | null;
        };
        setDownloadEnabled(d.download_enabled ?? false);
        if (d.download_high_res) { setHighResEnabled(true); setHighRes(d.download_high_res as 'original' | '3600'); }
        if (d.download_web_size) { setWebEnabled(true); setWebSize(d.download_web_size as '2048' | '1024' | '640'); }
      });
  }, [job.id]);

  const flash = () => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2500);
  };

  const persist = async (patch: object) => {
    await supabase.from('jobs').update(patch as any).eq('id', job.id);
    flash();
  };

  const toggleDownload = (v: boolean) => { setDownloadEnabled(v); persist({ download_enabled: v }); };
  const toggleHighRes = (v: boolean) => { setHighResEnabled(v); persist({ download_high_res: v ? highRes : null }); };
  const toggleWeb = (v: boolean) => { setWebEnabled(v); persist({ download_web_size: v ? webSize : null }); };
  const pickHighRes = (v: 'original' | '3600') => { setHighRes(v); if (highResEnabled) persist({ download_high_res: v }); };
  const pickWeb = (v: '2048' | '1024' | '640') => { setWebSize(v); if (webEnabled) persist({ download_web_size: v }); };

  const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-[#C65D3B] border-[#C65D3B]' : 'border-gray-300 bg-white'}`}
    >
      {checked && (
        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );

  const RadioBtn = ({ active }: { active: boolean }) => (
    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${active ? 'border-[#C65D3B]' : 'border-gray-300'}`}>
      {active && <span className="w-1.5 h-1.5 rounded-full bg-[#C65D3B]" />}
    </span>
  );

  return (
    <div className="flex flex-col flex-1 p-6 gap-6 overflow-y-auto">

      {/* Toggle download */}
      <div className="flex items-center justify-between py-3 border-b border-gray-100">
        <div>
          <p className="text-[13px] font-semibold text-gray-800">Download de fotos</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Permitir que o cliente baixe as fotos</p>
        </div>
        <button
          onClick={() => toggleDownload(!downloadEnabled)}
          className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${downloadEnabled ? 'bg-[#C65D3B]' : 'bg-gray-200'}`}
        >
          <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${downloadEnabled ? 'translate-x-[18px]' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Grupos */}
      <div className={`flex flex-col gap-6 transition-opacity duration-200 ${downloadEnabled ? 'opacity-100' : 'opacity-35 pointer-events-none'}`}>

        {/* Alta Resolução */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Checkbox checked={highResEnabled} onChange={toggleHighRes} />
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Alta Resolução</p>
          </div>
          <div className={`flex gap-2 transition-opacity ${highResEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            {(['original', '3600'] as const).map((v) => (
              <button
                key={v}
                onClick={() => pickHighRes(v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${highRes === v && highResEnabled ? 'border-[#C65D3B] bg-[#f0faf8]' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}
              >
                <RadioBtn active={highRes === v && highResEnabled} />
                <span className={`text-[12px] font-medium ${highRes === v && highResEnabled ? 'text-[#C65D3B]' : 'text-gray-700'}`}>
                  {v === 'original' ? 'Original' : '3600px'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tamanho para Web */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Checkbox checked={webEnabled} onChange={toggleWeb} />
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tamanho para Web</p>
          </div>
          <div className={`flex gap-2 transition-opacity ${webEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            {(['2048', '1024', '640'] as const).map((v) => (
              <button
                key={v}
                onClick={() => pickWeb(v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${webSize === v && webEnabled ? 'border-[#C65D3B] bg-[#f0faf8]' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}
              >
                <RadioBtn active={webSize === v && webEnabled} />
                <span className={`text-[12px] font-medium ${webSize === v && webEnabled ? 'text-[#C65D3B]' : 'text-gray-700'}`}>
                  {v}px
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Aviso salvo */}
      <div className={`flex items-center gap-2 text-[11px] text-[#C65D3B] transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}>
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Alterações salvas
      </div>

    </div>
  );
};

/* ─── Calendário customizado ─────────────────────────────────────────── */
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface CalendarPickerProps {
  value: string; // 'YYYY-MM-DD' ou ''
  onChange: (v: string) => void;
}

const CalendarPicker = ({ value, onChange }: CalendarPickerProps) => {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedDate = value ? new Date(value + 'T12:00:00') : null;
  const displayText = selectedDate
    ? selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 border border-gray-200 hover:border-gray-300 rounded-sm bg-white transition-all text-[15px] cursor-pointer flex items-center justify-between hover:shadow-sm"
      >
        <span className={selectedDate ? 'text-gray-800' : 'text-gray-300'}>
          {displayText || 'Sem prazo'}
        </span>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-sm shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] p-5 w-[300px] z-50">
          {/* Nav mês */}
          <div className="flex justify-between items-center mb-5">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span className="font-bold text-[15px] text-gray-800">
              {MONTHS_PT[viewMonth]} <span className="font-medium text-gray-500">{viewYear}</span>
            </span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          {/* Dias da semana */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 font-bold mb-3 uppercase tracking-wider">
            {['D','S','T','Q','Q','S','S'].map((d, i) => <div key={i}>{d}</div>)}
          </div>
          {/* Células */}
          <div className="grid grid-cols-7 gap-y-2 gap-x-1 justify-items-center">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const mm = String(viewMonth + 1).padStart(2, '0');
              const dd = String(day).padStart(2, '0');
              const iso = `${viewYear}-${mm}-${dd}`;
              const isSelected = value === iso;
              const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
              return (
                <button
                  key={day}
                  onClick={() => selectDay(day)}
                  className={`w-8 h-8 rounded-full text-[13px] font-medium transition-all
                    ${isSelected ? 'bg-[#C65D3B] text-white' : isToday ? 'border border-[#C65D3B] text-[#C65D3B]' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {/* Limpar */}
          {value && (
            <div className="mt-5 pt-4 border-t border-gray-100 text-center">
              <button onClick={() => { onChange(''); setOpen(false); }} className="text-[13px] text-gray-500 hover:text-zinc-900 font-medium transition-colors">
                Remover data limite
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Dropdown "Forma de cobrar" ─────────────────────────────────────── */
interface ChargeDropdownProps {
  value: 'todas' | 'adicionais' | '';
  onChange: (v: 'todas' | 'adicionais') => void;
}

const ChargeDropdown = ({ value, onChange }: ChargeDropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    { value: 'todas' as const, title: 'Cobrar por todas as fotos selecionadas', desc: 'Ideal quando o cliente não contratou nenhum pacote prévio.' },
    { value: 'adicionais' as const, title: 'Cobrar apenas por fotos adicionais', desc: 'Ideal quando já existe um pacote contratado e você quer cobrar o que exceder.' },
  ];
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 border border-gray-200 hover:border-gray-300 rounded-sm bg-white transition-all text-[15px] cursor-pointer flex items-center justify-between shadow-sm"
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? selected.title : 'Selecione uma opção'}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-sm shadow-[0_15px_50px_-12px_rgba(0,0,0,0.12)] overflow-hidden z-50">
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="px-4 py-4 cursor-pointer transition-colors flex items-start gap-3 hover:bg-gray-50"
            >
              <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${value === opt.value ? 'border-[#C65D3B] bg-[#C65D3B]' : 'border-gray-300 bg-white'}`}>
                {value === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] leading-tight text-gray-700 font-semibold">{opt.title}</span>
                <span className="text-[12px] text-gray-400 mt-1 leading-snug">{opt.desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Fotos Extras ───────────────────────────────────────────────────── */
const ExtraPhotoConfig = ({ jobId, hasLimit }: { jobId: string; hasLimit: boolean }) => {
  const { toast } = useToast();
  const [enabled, setEnabled]     = useState(false);
  const [price, setPrice]         = useState('');
  const [mpConnected, setMpConnected] = useState<boolean | null>(null);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    // Carrega config atual do job + status MP do fotógrafo
    Promise.all([
      supabase.from('jobs').select('extra_photo_enabled, extra_photo_price').eq('id', jobId).single(),
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return null;
        const { data } = await supabase
          .from('photographers')
          .select('mp_connected_at')
          .eq('user_id', user.id)
          .single();
        return (data as any)?.mp_connected_at ?? null;
      }),
    ]).then(([jobRes, mpAt]) => {
      if (jobRes.data) {
        setEnabled((jobRes.data as any).extra_photo_enabled ?? false);
        const p = (jobRes.data as any).extra_photo_price;
        if (p) setPrice(String(p).replace('.', ','));
      }
      setMpConnected(!!mpAt);
    });
  }, [jobId]);

  const save = async (newEnabled: boolean, newPrice: string) => {
    setSaving(true);
    const priceNum = parseFloat(newPrice.replace(',', '.')) || null;
    await supabase.from('jobs').update({
      extra_photo_enabled: newEnabled,
      extra_photo_price:   priceNum,
    }).eq('id', jobId);
    setSaving(false);
    toast({ title: 'Configurações salvas' });
  };

  const toggle = (v: boolean) => {
    setEnabled(v);
    save(v, price);
  };

  if (!hasLimit) return null;

  return (
    <section className="border border-dashed border-gray-200 rounded-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-medium text-[#1A1A1A]">Permitir fotos extras mediante pagamento</p>
          <p className="text-xs text-gray-400 mt-0.5">O cliente pode selecionar além do limite pagando por cada foto adicional.</p>
        </div>
        {/* Toggle */}
        <button
          onClick={() => toggle(!enabled)}
          className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-[#C65D3B]' : 'bg-gray-200'}`}
          style={{ width: 40, height: 22 }}
        >
          <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-0'}`} />
        </button>
      </div>

      {enabled && (
        <>
          {mpConnected === false && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
              <span>
                Você precisa conectar o Mercado Pago para receber pagamentos.{' '}
                <a href="/admin?tab=settings" className="underline font-semibold">Conectar agora →</a>
              </span>
            </div>
          )}

          <div>
            <label className="block text-[13px] font-semibold text-gray-600 mb-1.5">Preço por foto extra</label>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-gray-500 font-medium">R$</span>
              <input
                type="text"
                value={price}
                onChange={e => setPrice(e.target.value)}
                onBlur={() => { if (price) save(enabled, price); }}
                placeholder="0,00"
                className="w-36 px-3 py-2 border border-gray-200 rounded-sm text-[14px] focus:outline-none focus:ring-1 focus:ring-[#C65D3B]"
              />
              {saving && <span className="text-xs text-gray-400">Salvando...</span>}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">A Fotux retém 2% de cada venda automaticamente via Mercado Pago.</p>
          </div>
        </>
      )}
    </section>
  );
};

/* ─── Aba Seleção de fotos ────────────────────────────────────────────── */
function generatePin(length = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

const TabSelecao = ({ job }: { job: JobDetail }) => {
  const { toast } = useToast();
  const [deadline, setDeadline] = useState('');
  const [venderFotos, setVenderFotos] = useState(false);
  const [formaCobranca, setFormaCobranca] = useState<'todas' | 'adicionais' | ''>('');
  const [qtdPacote, setQtdPacote] = useState('');
  const [valorFoto, setValorFoto] = useState('0,00');
  const [maxFotos, setMaxFotos] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email');
  const [subject, setSubject] = useState('Fotos disponíveis para seleção de fotos');
  const [message, setMessage] = useState('As suas fotos já estão disponíveis!');
  const [noPassword, setNoPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [pin, setPin] = useState(() => generatePin());
  const [shareToken, setShareToken] = useState(() => generateShareToken());
  const [photographerSlug, setPhotographerSlug] = useState('');
  const [alreadyActivated, setAlreadyActivated] = useState(false);

  const clientName = job.clients?.name ?? '';
  const clientEmail = job.clients?.email ?? '';
  const clientPhone = job.clients?.whatsapp ?? '';
  const initials = clientName.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase();

  // Monta URL da galeria usando job.id diretamente
  const galleryUrl = photographerSlug
    ? `${window.location.origin}/p/${photographerSlug}/${job.id}`
    : `${window.location.origin}/p/…/${job.id}`;

  const galleryUrlWithToken = noPassword && photographerSlug
    ? `${galleryUrl}?t=${shareToken}`
    : galleryUrl;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('photographers')
        .select('slug')
        .eq('user_id', user.id)
        .single();
      if (data) setPhotographerSlug(data.slug);
    });

    // Carrega configurações já salvas no job
    supabase
      .from('jobs')
      .select('gallery_deadline, gallery_selection_limit, gallery_enabled, gallery_pin, gallery_share_token, is_public, sell_photos, charge_mode, package_qty, photo_price, max_photos')
      .eq('id', job.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        if (d.gallery_deadline) setDeadline(d.gallery_deadline.slice(0, 10));
        if (d.gallery_selection_limit) setMaxFotos(String(d.gallery_selection_limit));
        if (d.is_public) setIsPublic(true);
        if (d.gallery_pin) {
          setPin(d.gallery_pin);
          setAlreadyActivated(true);
        }
        if (d.gallery_share_token) setShareToken(d.gallery_share_token);
        if (d.gallery_enabled) setAlreadyActivated(true);
        if (d.sell_photos) {
          setVenderFotos(true);
          if (d.charge_mode) setFormaCobranca(d.charge_mode);
          if (d.package_qty) setQtdPacote(String(d.package_qty));
          if (d.photo_price) setValorFoto(String(d.photo_price).replace('.', ','));
        }
      });
  }, [job.id]);

  const handleActivateAndSend = async () => {
    if (sendMethod === 'email' && !clientEmail) {
      toast({ title: 'E-mail do cliente não cadastrado', variant: 'destructive' });
      return;
    }
    if (sendMethod === 'whatsapp' && !clientPhone) {
      toast({ title: 'WhatsApp do cliente não cadastrado', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      // 1. Salva configurações diretamente no job
      // Se venda de fotos está ativa com cobrança por adicionais,
      // o pacote contratado é o limite de seleção gratuita
      const effectiveLimit = venderFotos && formaCobranca === 'adicionais' && qtdPacote
        ? parseInt(qtdPacote)
        : maxFotos ? parseInt(maxFotos) : null;

      const jobUpdate: Record<string, unknown> = {
        status: 'gallery_active',
        gallery_enabled: true,
        gallery_pin: noPassword ? null : pin,
        gallery_share_token: noPassword ? shareToken : null,
        gallery_selection_limit: effectiveLimit,
        gallery_deadline: deadline || null,
      };

      const { error: jobErr } = await supabase
        .from('jobs')
        .update(jobUpdate)
        .eq('id', job.id);

      if (jobErr) throw new Error('Erro ao salvar configurações: ' + jobErr.message);

      // 3. Envia
      if (sendMethod === 'email') {
        const { error: fnErr } = await supabase.functions.invoke('send-selection-email', {
          body: {
            to_email: clientEmail,
            to_name: clientName,
            subject,
            message,
            gallery_url: galleryUrlWithToken,
            client_pin: noPassword ? null : pin,
            no_password: noPassword,
          },
        });
        if (fnErr) throw new Error('Erro ao enviar e-mail: ' + fnErr.message);
        toast({ title: 'Galeria ativada e e-mail enviado!', description: `E-mail enviado para ${clientEmail}` });
      } else {
        // WhatsApp — monta mensagem e abre wa.me
        const pinLine = noPassword ? '' : `\n📧 E-mail: ${clientEmail}\n🔑 Senha: ${pin}`;
        const waText = encodeURIComponent(
          `Olá ${clientName}! 👋\n\n${message}\n\n🔗 Acesse suas fotos:\n${galleryUrlWithToken}${pinLine}`
        );
        const phone = clientPhone.replace(/\D/g, '');
        window.open(`https://wa.me/55${phone}?text=${waText}`, '_blank');
        toast({ title: 'Galeria ativada!', description: 'WhatsApp aberto com a mensagem pronta.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 overflow-y-auto text-gray-800">
      <div className="w-full max-w-4xl">
        <h1 className="text-[18px] font-medium mb-8 text-[#1A1A1A]">Defina as preferências da seleção de fotos</h1>

        <div className="space-y-10">

          {/* ── Data Limite ── */}
          <section>
            <label className="block text-[15px] font-medium mb-2 text-[#1A1A1A]">Data limite</label>
            <CalendarPicker value={deadline} onChange={setDeadline} />
            <p className="mt-2 text-xs text-gray-400 leading-relaxed italic">
              Quando chegar as 23:59 do dia escolhido, o seu cliente não poderá mais realizar a seleção de fotos. Se necessário você pode prolongar esse prazo posteriormente.
            </p>
          </section>

          {/* ── Vender Fotos ── */}
          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <label className="text-[15px] font-medium text-[#1A1A1A]">Vender fotos</label>
                <button
                  onClick={() => setVenderFotos(v => !v)}
                  className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${venderFotos ? 'bg-[#C65D3B]' : 'bg-zinc-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${venderFotos ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className="text-[13px] text-gray-400 leading-relaxed">
                Se você optar por vender fotos, basta marcar essa opção que o seu cliente poderá selecionar fotos além do contratado, e será informado do valor à ser pago.
              </p>
            </div>

            {venderFotos && (
              <div className="ml-2 pl-8 border-l-2 border-gray-100 space-y-6 pt-4 pb-2">
                {/* Forma de cobrar — dropdown */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-medium text-[#1A1A1A]">Forma de cobrar <span className="text-zinc-900">*</span></label>
                  <ChargeDropdown value={formaCobranca} onChange={setFormaCobranca} />
                </div>

                {/* Qtd pacote — só aparece se "adicionais" */}
                {formaCobranca === 'adicionais' && (
                  <div className="space-y-2">
                    <label className="block text-[14px] font-medium text-[#1A1A1A]">Quantidade de fotos do pacote contratado <span className="text-zinc-900">*</span></label>
                    <input
                      type="text"
                      value={qtdPacote}
                      onChange={e => setQtdPacote(e.target.value)}
                      placeholder="Ex: 20"
                      className="w-full px-4 py-3 border border-gray-200 rounded-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#C65D3B] text-[15px] text-gray-700 transition-all shadow-sm"
                    />
                    <p className="mt-2 text-[12px] text-gray-400 leading-relaxed italic">Informe a quantidade de fotos já contratadas pelo seu cliente. A partir dessa quantidade será iniciada a cobrança por foto adicional.</p>
                  </div>
                )}

                {/* Valor por foto */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-medium text-[#1A1A1A]">Valor de cada foto <span className="text-zinc-900">*</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-gray-600 text-[15px] font-medium">R$</span>
                    </div>
                    <input
                      type="text"
                      value={valorFoto}
                      onChange={e => setValorFoto(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#C65D3B] text-[15px] text-gray-700 transition-all shadow-sm"
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-gray-400 leading-relaxed italic">Informe o valor a ser cobrado por foto. O sistema irá calcular automaticamente o valor total a ser pago baseado na quantidade de fotos.</p>
                </div>
              </div>
            )}
          </section>

          {/* ── Quantidade máxima ── */}
          <section>
            <label className="block text-[15px] font-medium mb-2 text-[#1A1A1A]">Quantidade máxima de fotos para selecionar</label>
            <input
              type="text"
              value={maxFotos}
              onChange={e => setMaxFotos(e.target.value)}
              placeholder="Sem limite"
              className="w-full px-4 py-3 border border-gray-200 rounded-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#C65D3B] placeholder-gray-300 text-[15px] transition-all"
            />
            <p className="mt-2 text-xs text-gray-400 leading-relaxed italic">Ao atingir esse limite o seu cliente será bloqueado.</p>
          </section>

          {/* ── Fotos extras ── */}
          <ExtraPhotoConfig jobId={job.id} hasLimit={!!maxFotos} />

          {/* ── Cliente ── */}
          <section>
            <label className="block text-[15px] font-medium mb-2 text-[#1A1A1A]">Cliente</label>
            <div className="flex flex-col md:flex-row md:items-start gap-8">
              <div className="w-full md:max-w-[420px]">
                <div className="relative border border-gray-200 rounded-sm p-2 flex items-center bg-gray-50">
                  <div className="w-10 h-10 bg-zinc-200 rounded-full flex items-center justify-center mr-3 shrink-0">
                    {initials ? (
                      <span className="text-zinc-600 font-semibold text-sm">{initials}</span>
                    ) : (
                      <svg className="text-gray-400 w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#1A1A1A] font-medium text-sm truncate">{clientName || '—'}</div>
                    <div className="text-gray-500 text-[11px] font-medium truncate">{[clientEmail, clientPhone].filter(Boolean).join(' | ') || '—'}</div>
                  </div>
                </div>
                <div className="mt-2 text-[13px] text-[#C65D3B] flex gap-3">
                  <span className="hover:underline cursor-pointer font-medium">Editar dados do cliente</span>
                  <span className="text-gray-300">|</span>
                  <span className="hover:underline cursor-pointer font-medium">Redefinir senha</span>
                </div>
                <p className="mt-2 text-xs text-gray-400 leading-relaxed italic">Essa seleção de fotos será privada para o cliente selecionado.</p>
              </div>

              <div className="flex flex-col gap-1 md:mt-3">
                <div
                  className="flex items-center gap-3 select-none cursor-pointer"
                  onClick={() => setIsPublic(v => !v)}
                >
                  <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${isPublic ? 'bg-[#C65D3B] border-[#C65D3B]' : 'bg-white border-gray-300'}`}>
                    {isPublic && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[15px] font-medium text-[#1A1A1A]">Tornar essa seleção de fotos pública</span>
                  {/* Tooltip */}
                  <div className="group relative flex items-center">
                    <svg className="w-4 h-4 text-gray-400 cursor-help hover:text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-72 p-3 bg-gray-800 text-white text-xs rounded-sm shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50">
                      <p className="mb-2">Qualquer pessoa que tiver o link dessa galeria poderá se cadastrar e iniciar a seleção de fotos.</p>
                      <p className="font-medium text-gray-300 italic">Ideal para formaturas, apresentações, eventos esportivos, etc.</p>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-800" />
                    </div>
                  </div>
                </div>
                {isPublic && (
                  <div className="ml-8 mt-1">
                    <p className="text-sm text-gray-500 leading-tight">Qualquer pessoa que tiver o link dessa galeria poderá se cadastrar e iniciar a seleção de fotos.</p>
                    <p className="text-sm text-gray-500 leading-tight mt-1">Ideal para formaturas, apresentações, eventos esportivos, etc...</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Método de envio + Resumo ── */}
          {!isPublic && (
            <div>
              <div className="mt-2">
                <h3 className="text-sm font-medium mb-4 text-[#1A1A1A]">Como deseja enviar?</h3>
                <div className="flex flex-wrap gap-4">
                  {/* E-mail */}
                  <div
                    onClick={() => setSendMethod('email')}
                    className={`flex items-center gap-2.5 p-2 px-4 rounded-sm border-2 cursor-pointer transition-all ${sendMethod === 'email' ? 'border-[#C65D3B] bg-white' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sendMethod === 'email' ? 'border-[#C65D3B]' : 'border-gray-300'}`}>
                      {sendMethod === 'email' && <div className="w-2 h-2 rounded-full bg-[#C65D3B]" />}
                    </div>
                    <div className="relative">
                      <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      <svg className="absolute -top-1 -right-0.5 w-3 h-3 text-zinc-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </div>
                    <span className="text-zinc-900 text-[15px] font-semibold ml-1">E-mail</span>
                  </div>

                  {/* WhatsApp */}
                  <div
                    onClick={() => setSendMethod('whatsapp')}
                    className={`flex items-center gap-2.5 p-2 px-4 rounded-sm border-2 cursor-pointer transition-all ${sendMethod === 'whatsapp' ? 'border-[#C65D3B] bg-white' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sendMethod === 'whatsapp' ? 'border-[#C65D3B]' : 'border-gray-300'}`}>
                      {sendMethod === 'whatsapp' && <div className="w-2 h-2 rounded-full bg-[#C65D3B]" />}
                    </div>
                    <svg className="w-6 h-6 text-[#2ecc71] ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.445 0 .081 5.363.079 11.971c0 2.112.553 4.177 1.601 6.034L0 24l6.15-1.612a11.827 11.827 0 005.9 1.587h.005c6.59 0 11.954-5.367 11.957-11.975a11.81 11.81 0 00-3.253-8.411z"/></svg>
                    <span className="text-[#2ecc71] text-[15px] font-semibold ml-1">Whatsapp</span>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <section className="mt-12 border-t pt-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-sm font-medium text-[#1A1A1A] uppercase tracking-wide">Resumo do envio</h2>
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setNoPassword(v => !v)}>
                    <div className={`w-4 h-4 border rounded flex items-center justify-center ${noPassword ? 'bg-[#C65D3B] border-[#C65D3B]' : 'border-gray-300'}`}>
                      {noPassword && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                    <span className="text-xs text-gray-500">Permitir seleção sem senha</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-start">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Para</label>
                      <p className="text-[15px] text-gray-700 font-medium uppercase tracking-tight">
                        {clientName}{clientEmail && <> {'<'}{clientEmail}{'>'}</>}
                      </p>
                    </div>
                    {sendMethod === 'email' && (
                      <div id="subject-container">
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Assunto</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded text-[15px] outline-none focus:ring-1 focus:ring-gray-300"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Mensagem</label>
                      <textarea
                        rows={7}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded text-[15px] outline-none focus:ring-1 focus:ring-gray-300 resize-none"
                      />
                    </div>
                    {alreadyActivated && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-sm px-3 py-2">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                        Galeria já ativada. Clique abaixo para reenviar o acesso.
                      </div>
                    )}
                    <button
                      onClick={handleActivateAndSend}
                      disabled={sending}
                      className="bg-[#C65D3B] hover:bg-[#a34a2e] disabled:opacity-60 text-white font-bold py-3.5 px-10 rounded-sm text-sm uppercase tracking-wider active:scale-[0.98] transition-all flex items-center gap-2"
                    >
                      {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {alreadyActivated ? 'REENVIAR ACESSO' : 'ATIVAR E ENVIAR'}
                    </button>
                  </div>

                  {/* Preview E-mail */}
                  {sendMethod === 'email' && (
                    <div className="bg-[#f8f9fa] border border-gray-100 rounded-sm p-8 shadow-sm text-gray-600 text-[15px]">
                      <h3 className="text-xl font-medium text-[#1A1A1A] mb-6 leading-tight">{subject}</h3>
                      <p>Olá {clientName}! Tudo bem?</p>
                      <p className="mt-4">{message}</p>
                      {!noPassword && (
                        <div className="space-y-3 py-6">
                          <div className="flex items-center gap-3">
                            <span className="w-16 text-gray-400 text-sm">E-mail:</span>
                            <span className="bg-[#eff6ff] text-[#2563eb] px-3 py-1.5 rounded-sm text-[14px] font-medium border border-[#dbeafe]">{clientEmail || 'email@cliente.com'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="w-16 text-gray-400 text-sm">Senha:</span>
                            <span className="bg-[#eff6ff] text-[#2563eb] px-3 py-1.5 rounded-sm text-[14px] font-medium border border-[#dbeafe] tracking-wider">{pin}</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-4">
                        <button className="bg-[#C65D3B] text-white font-bold py-3 px-8 rounded-sm text-sm uppercase tracking-wide shadow-sm">VER FOTOS</button>
                      </div>
                      <div className="pt-6 border-t border-gray-200 mt-6 text-[12px] text-[#f39c12] italic">
                        * Não compartilhe esse e-mail caso queira manter a seleção das suas fotos em segurança.
                      </div>
                      <div className="pt-6 border-t border-gray-200 mt-6 space-y-2">
                        <p className="text-sm">Por favor, confirme o recebimento deste e-mail.</p>
                        <p className="text-sm">Um abraço,</p>
                        <p className="text-sm font-medium text-[#1A1A1A]">Fotógrafo.</p>
                      </div>
                      <div className="pt-6 border-t border-gray-200 mt-4 text-[11px] text-gray-400">
                        <p>Caso tenha algum problema com o botão acima, copie e cole o seguinte link no seu navegador:</p>
                        <p className="text-[#C65D3B] break-all mt-1 hover:underline cursor-pointer tracking-tight">{galleryUrlWithToken}</p>
                      </div>
                    </div>
                  )}

                  {/* Preview WhatsApp — mockup de celular */}
                  {sendMethod === 'whatsapp' && (
                    <div className="flex justify-center w-full">
                      <div className="relative w-[300px] h-[600px] bg-[#f8f9fa] rounded-[45px] shadow-2xl border-[3px] border-[#e5e7eb] flex flex-col items-center py-4">
                        <div className="w-14 h-[6px] bg-[#d1d5db] rounded-full mb-4" />
                        <div className="w-[272px] flex-1 bg-[#E5DDD5] flex flex-col overflow-hidden relative border border-gray-200 shadow-inner">
                          {/* Status bar */}
                          <div className="h-[22px] bg-[#054c44] flex justify-end items-center px-2 gap-1.5 text-white/90">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                            <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/></svg>
                            <span className="text-[10px] ml-1">19:33</span>
                          </div>
                          {/* Header chat */}
                          <div className="h-[52px] bg-[#075E54] px-2 text-white flex items-center justify-between z-10 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                              <div className="w-9 h-9 rounded-full bg-gray-300 border border-white/20" />
                              <div className="ml-1">
                                <div className="text-[15px] font-medium leading-tight">Fotógrafo</div>
                                <div className="text-[11px] text-white/80 leading-tight">online</div>
                              </div>
                            </div>
                          </div>
                          {/* Mensagem */}
                          <div className="flex-1 p-3 overflow-y-auto">
                            <div className="bg-white rounded-sm rounded-tl-none p-3 shadow-sm max-w-[220px]">
                              <p className="text-[13px] text-gray-800 leading-relaxed">
                                Olá {clientName || 'Cliente'}! 👋<br/><br/>
                                {message}<br/><br/>
                                🔗 Acesse suas fotos:<br/>
                                <span className="text-[#C65D3B] text-[12px] break-all">{galleryUrlWithToken}</span>
                              </p>
                              {!noPassword && (
                                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                                  <p className="text-[11px] text-gray-500">📧 {clientEmail || 'email@cliente.com'}</p>
                                  <p className="text-[11px] text-gray-500">🔑 Senha: <span className="font-mono font-bold">{pin}</span></p>
                                </div>
                              )}
                              <p className="text-[10px] text-gray-400 text-right mt-1">19:33 ✓✓</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

/* ─── Aba Fotos ──────────────────────────────────────────────────────── */
interface JobPhoto {
  id: string;
  image_url: string;
  title: string | null;
  r2_key: string | null;
  display_order: number;
}

interface UploadingFile {
  file: File;
  preview: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
}

interface PhotoSet {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
}

interface TabFotosProps {
  jobId: string;
  photographerId: string;
  galleryUrl?: string;
  activeSetId: string | null;
  activeSetName: string;
  showClientSelections?: boolean;
}

const TabFotos = ({ jobId, photographerId, activeSetId, activeSetName, showClientSelections }: TabFotosProps) => {
  const { toast: _toast } = useToast();
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [watermarkModalOpen, setWatermarkModalOpen] = useState(false);
  const [watermarkId, setWatermarkId] = useState<string | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [watermarkPosition, setWatermarkPosition] = useState<WmPosition>('center');
  const [watermarkSize, setWatermarkSize] = useState(30);
  // Modo de upload: definido no modal antes de cada lote
  const [uploadMode, setUploadMode] = useState<'selection' | 'delivery'>('selection');
  // Modal de escolha do modo antes do upload
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadModeModal, setUploadModeModal] = useState(false);
  // Mapa de presigned URLs para exibição: { [photo.id]: url }
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const fetchPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    let imgs: JobPhoto[] = [];

    if (showClientSelections) {
      const { data: sels } = await supabase
        .from('job_client_selections')
        .select('image_id, site_images(id, image_url, title, r2_key, display_order)')
        .eq('job_id', jobId);
      imgs = (sels ?? []).map((s: any) => s.site_images).filter(Boolean) as JobPhoto[];
    } else {
      const base = supabase
        .from('site_images')
        .select('id, image_url, title, r2_key, display_order')
        .eq('job_id', jobId)
        .order('display_order');
      const { data } = await (activeSetId
        ? base.eq('photo_set_id', activeSetId)
        : base.is('photo_set_id', null));
      imgs = (data ?? []) as JobPhoto[];
    }

    setPhotos(imgs);

    // Gera presigned URLs em lote — 1 chamada para todas as fotos
    const keysToSign = imgs.filter(p => p.r2_key).map(p => p.r2_key!);
    const urlMap = keysToSign.length > 0 ? await r2Storage.signBatch(keysToSign, 7200) : {};
    const entries = imgs.map((p): [string, string] => {
      if (!p.r2_key) return [p.id, p.image_url];
      return [p.id, urlMap[p.r2_key] ?? p.image_url];
    });
    setSignedUrls(Object.fromEntries(entries));
    setLoadingPhotos(false);
  }, [jobId, activeSetId, showClientSelections]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  useEffect(() => {
    supabase.from('jobs').select('watermark_id, watermark_position, watermark_size, watermarks(id, image_url, r2_key)').eq('id', jobId).single()
      .then(async ({ data }) => {
        if (!data) return;
        const wm = data as unknown as { watermark_id: string | null; watermark_position: string; watermark_size: number; watermarks: { id: string; image_url: string; r2_key: string | null } | null };
        setWatermarkId(wm.watermark_id);
        if (wm.watermarks) {
          const r2Key = wm.watermarks.r2_key;
          const url = r2Key ? await r2Storage.sign(r2Key, 7200) : wm.watermarks.image_url;
          setWatermarkUrl(url ?? null);
        }
        if (wm.watermark_position) setWatermarkPosition(wm.watermark_position as WmPosition);
        if (wm.watermark_size) setWatermarkSize(wm.watermark_size);
      });
  }, [jobId]);

  const handleFiles = useCallback(async (files: File[]) => {
    const newUploads: UploadingFile[] = files.map((file) => ({
      file, progress: 0, status: 'pending', preview: URL.createObjectURL(file),
    }));
    setUploading((prev) => [...prev, ...newUploads]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploading((prev) => prev.map((u) => u.file === file ? { ...u, status: 'uploading' } : u));
      try {
        // Upload do master ORIGINAL — sem compressão no browser
        // O Cloudflare Worker gera as variantes WebP de forma assíncrona
        const result = await r2Storage.upload(file, uploadMode);
        if (!result) throw new Error('Upload falhou');

        // Salva o registro com r2_key. image_url fica vazia por ora —
        // o Worker vai preencher variant_2048_key após processar.
        // A galeria usa presigned URLs geradas sob demanda via r2_key.
        await supabase.from('site_images').insert({
          section: 'gallery',
          category: 'jobs',
          job_id: jobId,
          photo_set_id: activeSetId ?? null,
          upload_mode: uploadMode,
          title: file.name.replace(/\.[^/.]+$/, ''),
          description: '',
          image_url: '',          // será populado após variante 2048 ser gerada
          r2_key: result.key,     // key do master no R2 privado
          display_order: photos.length + i,
          size_bytes: file.size,
          file_size_bytes: file.size,
          photographer_id: photographerId,
          variants_status: 'pending',
        } as any);

        setUploading((prev) => prev.map((u) => u.file === file ? { ...u, status: 'complete', progress: 100 } : u));
      } catch {
        setUploading((prev) => prev.map((u) => u.file === file ? { ...u, status: 'error' } : u));
      }
    }

    setTimeout(() => {
      setUploading([]);
      fetchPhotos();
    }, 1200);
  }, [jobId, photographerId, photos.length, fetchPhotos, activeSetId, uploadMode]);

  const handleDelete = async (photo: JobPhoto) => {
    if (!confirm('Excluir esta foto?')) return;
    const target = photo.r2_key || photo.image_url;
    if (target) await r2Storage.delete(target);
    await supabase.from('site_images').delete().eq('id', photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  };

  const openUploadModal = (files: File[]) => {
    if (!files.length) return;
    setPendingFiles(files);
    setUploadModeModal(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) openUploadModal(files);
  };

  const allPhotos = [...photos];

  return (
    <div className="p-4 flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 gap-4">

        {/* Esquerda: nome da categoria ativa */}
        <span className="text-[13px] font-semibold text-gray-700">{activeSetName}</span>

        {/* Direita: ações (da esquerda pra direita = ordem inversa da imagem) */}
        <div className={`flex items-center gap-5 ${showClientSelections ? 'hidden' : ''}`}>

          {/* Selecionar todas */}
          <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wide">Selecionar todas</span>
          </button>

          {/* Sugerir em lote */}
          <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-[14px] h-[14px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wide">Sugerir em lote</span>
          </button>

          {/* Ordenação */}
          <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
            <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 6h18M7 12h10M11 18h2"/>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wide">Ordenação</span>
          </button>

          {/* Marca d'água */}
          <button
            onClick={() => setWatermarkModalOpen(true)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wide">Marca d'água</span>
            {watermarkId && <span className="w-1.5 h-1.5 rounded-full bg-[#C65D3B] inline-block" />}
          </button>

          {/* Subir fotos */}
          <label className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
            <input ref={inputRef} type="file" accept="image/*,.heic,.heif,.tiff,.tif" multiple className="sr-only"
              onChange={(e) => { if (e.target.files) openUploadModal(Array.from(e.target.files)); e.target.value = ''; }} />
            <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wide">Subir fotos</span>
          </label>

        </div>
      </div>

      {allPhotos.length === 0 && uploading.length === 0 ? (
        showClientSelections ? (
          /* Empty state — selecionadas pelo cliente */
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-gray-700 mb-2">Nenhuma foto selecionada ainda</p>
            <p className="text-[13px] text-gray-400 max-w-xs leading-relaxed">
              Assim que o seu cliente marcar e eviar as fotos favoritas na galeria de seleção, elas aparecerão organizadas nesta área automaticamente.
            </p>
          </div>
        ) : (
          /* Empty state — upload */
          <label
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-sm cursor-pointer transition-colors group ${isDragging ? 'border-zinc-500 bg-zinc-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept="image/*,.heic,.heif,.tiff,.tif" multiple className="sr-only"
              onChange={(e) => { if (e.target.files) openUploadModal(Array.from(e.target.files)); e.target.value = ''; }} />
            <div className="flex flex-col items-center gap-3 py-16 px-8 text-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-zinc-100 group-hover:bg-zinc-200 flex items-center justify-center transition-colors">
                <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-700">Arraste fotos ou clique para fazer upload</p>
                <p className="text-[12px] text-gray-400 mt-1">JPG, PNG, WEBP</p>
              </div>
            </div>
          </label>
        )
      ) : loadingPhotos ? (
        /* Animação de carregamento — três pontinhos */
        <div className="flex-1 flex items-center justify-center">
          <style>{`
            @keyframes dot-wave {
              0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
              30% { transform: translateY(-12px); opacity: 1; }
            }
            .dot-wave { width: 14px; height: 14px; background-color: #C65D3B; border-radius: 50%; display: inline-block; animation: dot-wave 1.4s ease-in-out infinite; }
            .dot-wave:nth-child(2) { animation-delay: 0.2s; }
            .dot-wave:nth-child(3) { animation-delay: 0.4s; }
          `}</style>
          <div className="flex gap-4">
            <div className="dot-wave" />
            <div className="dot-wave" />
            <div className="dot-wave" />
          </div>
        </div>
      ) : (
        /* Grid masonry */
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridAutoRows: '4px', gap: '0 8px' }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {allPhotos.map((photo) => (
            <div
              key={photo.id}
              className="relative group"
              style={{ gridRowEnd: 'span 1' }}
              ref={(el) => {
                if (!el) return;
                const img = el.querySelector('img') as HTMLImageElement | null;
                const setSpan = () => {
                  if (!img || !img.naturalHeight) return;
                  const ratio = img.naturalHeight / img.naturalWidth;
                  const colWidth = el.offsetWidth;
                  const imgHeight = colWidth * ratio;
                  const span = Math.ceil((imgHeight + 8) / 4);
                  el.style.gridRowEnd = `span ${span}`;
                };
                if (img?.complete && img.naturalHeight) setSpan();
                else img?.addEventListener('load', setSpan, { once: true });
              }}
            >
              <img src={signedUrls[photo.id] ?? photo.image_url} alt={photo.title ?? ''} className="w-full h-auto block" />
              {watermarkUrl && (
                <img src={watermarkUrl} alt="watermark" style={positionToStyle(watermarkPosition, watermarkSize)} className="object-contain" />
              )}
              <button
                onClick={() => handleDelete(photo)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <Trash2 className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}

          {/* Uploads em andamento */}
          {uploading.map((u, i) => (
            <div
              key={i}
              className="relative overflow-hidden bg-zinc-100"
              style={{ gridRowEnd: 'span 1' }}
              ref={(el) => {
                if (!el) return;
                const img = el.querySelector('img') as HTMLImageElement | null;
                const setSpan = () => {
                  if (!img || !img.naturalHeight) return;
                  const ratio = img.naturalHeight / img.naturalWidth;
                  const colWidth = el.offsetWidth;
                  const imgHeight = colWidth * ratio;
                  const span = Math.ceil((imgHeight + 8) / 4);
                  el.style.gridRowEnd = `span ${span}`;
                };
                if (img?.complete && img.naturalHeight) setSpan();
                else img?.addEventListener('load', setSpan, { once: true });
              }}
            >
              <img src={u.preview} alt="" className="w-full h-auto block opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center">
                {u.status === 'uploading' || u.status === 'pending' ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin drop-shadow" />
                ) : u.status === 'error' ? (
                  <span className="text-[10px] text-red-400 font-bold">Erro</span>
                ) : null}
              </div>
            </div>
          ))}

        </div>
      )}

      {/* Modal — escolha do destino antes do upload */}
      {uploadModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-[15px] font-medium text-[#1A1A1A]">Essas fotos são para...</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">{pendingFiles.length} {pendingFiles.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {([
                { value: 'selection', label: 'Seleção pelo cliente', desc: 'O cliente irá escolher as fotos favoritas na galeria' },
                { value: 'delivery', label: 'Entrega final', desc: 'Fotos já aprovadas, prontas para entrega e download' },
              ] as const).map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setUploadMode(value)}
                  className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                    uploadMode === value
                      ? 'border-[#C65D3B] bg-[#C65D3B]/5'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    uploadMode === value ? 'border-[#C65D3B]' : 'border-gray-300'
                  }`}>
                    {uploadMode === value && <span className="w-2 h-2 rounded-full bg-[#C65D3B]" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-gray-800">{label}</span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 px-4 pb-5 pt-2">
              <button
                onClick={() => { setUploadModeModal(false); setPendingFiles([]); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setUploadModeModal(false); handleFiles(pendingFiles); setPendingFiles([]); }}
                className="flex-1 py-2.5 rounded-xl bg-[#C65D3B] text-white text-[12px] font-semibold hover:bg-[#0ea584] transition-colors"
              >
                Enviar fotos →
              </button>
            </div>
          </div>
        </div>
      )}

      {watermarkModalOpen && (
        <WatermarkModal
          jobId={jobId}
          photographerId={photographerId}
          currentWatermarkId={watermarkId}
          onClose={() => setWatermarkModalOpen(false)}
          onSaved={(id, pos, sz) => {
            setWatermarkId(id);
            setWatermarkPosition(pos);
            setWatermarkSize(sz);
            if (!id) { setWatermarkUrl(null); return; }
            supabase.from('watermarks').select('image_url, r2_key').eq('id', id).single()
              .then(async ({ data }) => {
                if (!data) return;
                const url = data.r2_key ? await r2Storage.sign(data.r2_key, 7200) : data.image_url;
                setWatermarkUrl(url ?? null);
              });
          }}
        />
      )}
    </div>
  );
};

/* ─── Componente Principal ───────────────────────────────────────────── */
const AdminJobDetail = ({ jobId, onBack: _onBack, onOpenContract, onGalleryUrlChange }: Props) => {
  const photographerId = usePhotographerId();
  const { toast } = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [_selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [photographerSlug, setPhotographerSlug] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Left panel state — must be declared before any early return
  type PanelIcon = 'fotos' | 'brush' | 'settings' | 'share';
  const [panelIcon, setPanelIcon] = useState<PanelIcon>('fotos');
  const [settingsTab, setSettingsTab] = useState<'selecao' | 'entrega' | 'configuracoes'>('selecao');
  const [sets, setSets] = useState<PhotoSet[]>([]);
  // null = Destaques (fotos sem set)
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [newSetModal, setNewSetModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [savingSet, setSavingSet] = useState(false);

  const fetchSets = useCallback(async () => {
    const { data } = await supabase
      .from('job_photo_sets')
      .select('id, name, description, display_order')
      .eq('job_id', jobId)
      .order('display_order');
    setSets((data ?? []) as PhotoSet[]);
  }, [jobId]);

  useEffect(() => {
    if (!photographerId) return;
    fetchAll();
    fetchSets();
    supabase.from('photographers').select('slug').eq('id', photographerId).single()
      .then(({ data }) => { if (data) setPhotographerSlug(data.slug); });
  }, [jobId, photographerId]);

  const handleCreateSet = async () => {
    if (!newSetName.trim() || !photographerId) return;
    setSavingSet(true);
    const { data, error } = await supabase.from('job_photo_sets').insert({
      job_id: jobId,
      photographer_id: photographerId,
      name: newSetName.trim(),
      description: newSetDesc.trim() || null,
      display_order: sets.length,
    }).select('id, name, description, display_order').single();
    setSavingSet(false);
    if (error) { toast({ title: 'Erro ao criar categoria', variant: 'destructive' }); return; }
    setSets(prev => [...prev, data as PhotoSet]);
    setActiveSet((data as PhotoSet).id);
    setNewSetModal(false);
    setNewSetName('');
    setNewSetDesc('');
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, clients(name, email, whatsapp), albums(id, title, category, client_enabled, client_submitted_at)')
      .eq('id', jobId)
      .single();

    const job = jobData as unknown as JobDetail & { gallery_cover_image_url?: string | null; gallery_cover_r2_key?: string | null };
    setJob(job);
    // gallery_cover_image_url stores the R2 key — sign it for display
    const coverKey = job?.gallery_cover_r2_key ?? job?.gallery_cover_image_url ?? null;
    if (coverKey && !coverKey.startsWith('http')) {
      const signed = await r2Storage.sign(coverKey, 7200);
      setCoverUrl(signed ?? null);
    } else {
      setCoverUrl(coverKey);
    }

    if (job?.album_id) {
      const { data: ct } = await supabase
        .from('contracts')
        .select('id, body_html, signed_at, client_name')
        .eq('album_id', job.album_id)
        .maybeSingle();
      setContract(ct as Contract | null);

      if (job.albums?.client_submitted_at) {
        const { data: sel } = await supabase
          .from('client_selections')
          .select('id, image_id, site_images(image_url, title)')
          .eq('album_id', job.album_id);
        setSelections((sel || []) as unknown as Selection[]);
      }
    }
    setLoading(false);
  };

  const galleryUrl = photographerSlug ? `${window.location.origin}/p/${photographerSlug}/${jobId}` : '';

  useEffect(() => {
    onGalleryUrlChange?.(galleryUrl || null);
    return () => { onGalleryUrlChange?.(null); };
  }, [galleryUrl]);

  if (loading || !job) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
      </div>
    );
  }

  const SETTINGS_TABS = [
    { key: 'selecao' as const,       label: 'Seleção de fotos' },
    { key: 'entrega' as const,       label: 'Entrega em alta' },
    { key: 'configuracoes' as const, label: 'Configurações' },
  ];

  return (
    <div className="w-full h-full flex flex-col">

      {/* Drawer lateral */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        job={job}
        contract={contract}
        onOpenContract={onOpenContract ? () => { setDrawerOpen(false); onOpenContract(jobId); } : undefined}
      />

      {/* Container principal */}
      <div className="border border-gray-200 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] bg-white overflow-hidden flex-1 flex">

        {/* ── Painel esquerdo (Pixieset-style) ── */}
        <aside className="w-[300px] shrink-0 border-r border-gray-200 flex flex-col bg-white z-10">

          {/* Imagem de capa — clicável para upload */}
          <div
            className="h-[180px] w-full bg-gray-100 shrink-0 overflow-hidden relative cursor-pointer group"
            onClick={() => !uploadingCover && coverInputRef.current?.click()}
          >
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !job) return;
                setUploadingCover(true);
                try {
                  const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
                  const result = await r2Storage.upload(compressed, 'covers');
                  if (!result) throw new Error('Upload falhou');
                  const signedCoverUrl = await r2Storage.sign(result.key, 7200);
                  await supabase.from('jobs').update({
                    gallery_cover_image_url: result.key,
                    gallery_cover_r2_key: result.key,
                  }).eq('id', job.id);
                  setCoverUrl(signedCoverUrl ?? '');
                } catch {
                  toast({ title: 'Erro ao fazer upload da capa', variant: 'destructive' });
                } finally {
                  setUploadingCover(false);
                  e.target.value = '';
                }
              }}
            />
            {uploadingCover ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#C65D3B]" />
              </div>
            ) : coverUrl ? (
              <>
                <img src={coverUrl} alt="Capa" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-semibold tracking-wide">Alterar capa</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 group-hover:text-[#C65D3B] transition-colors">
                  <svg className="w-10 h-10 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">Selecionar capa</span>
                </div>
              </>
            )}
          </div>

          {/* Toolbar de ícones horizontais */}
          <div className="flex border-b border-gray-100 shrink-0 bg-white">
            {/* Gallery icon */}
            <button
              onClick={() => setPanelIcon('fotos')}
              title="Fotos"
              className={`flex-1 py-4 flex justify-center items-center border-b-2 transition-colors ${panelIcon === 'fotos' ? 'border-[#C65D3B] text-[#C65D3B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            {/* Brush icon */}
            <button
              onClick={() => setPanelIcon('brush')}
              title="Editar"
              className={`flex-1 py-4 flex justify-center items-center border-b-2 transition-colors ${panelIcon === 'brush' ? 'border-[#C65D3B] text-[#C65D3B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="m18.37 2.63-14 14.37a2 2 0 0 0-.58 1.41V22h3.58a2 2 0 0 0 1.41-.58l14.37-14A2 2 0 0 0 18.37 2.63z"/><path d="M15 5l4 4"/>
              </svg>
            </button>
            {/* Settings icon */}
            <button
              onClick={() => setPanelIcon('settings')}
              title="Configurações"
              className={`flex-1 py-4 flex justify-center items-center border-b-2 transition-colors ${panelIcon === 'settings' ? 'border-[#C65D3B] text-[#C65D3B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            {/* Share/RSS icon */}
            <button
              onClick={() => setPanelIcon('share')}
              title="Compartilhar"
              className={`flex-1 py-4 flex justify-center items-center border-b-2 transition-colors ${panelIcon === 'share' ? 'border-[#C65D3B] text-[#C65D3B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>
              </svg>
            </button>
          </div>

          {/* Conteúdo dinâmico do painel */}
          <div className="flex-1 overflow-y-auto bg-white">

            {/* ── GALERIA: header + lista de sets ── */}
            {panelIcon === 'fotos' && (
              <div className="flex flex-col">
                <div className="flex justify-between items-center px-6 py-5">
                  <span className="text-[12px] font-bold text-gray-500 tracking-[0.05em] uppercase">Fotos</span>
                  <button
                    onClick={() => setNewSetModal(true)}
                    className="flex items-center gap-1.5 text-[#C65D3B] hover:text-[#a34a2e] font-medium text-[14px] transition-colors"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>
                    </svg>
                    Adicionar Categoria
                  </button>
                </div>
                <div className="flex flex-col pb-4">
                  {/* Destaques — set padrão (null) */}
                  {(() => {
                    const isActive = activeSet === null;
                    return (
                      <div
                        onClick={() => setActiveSet(null)}
                        className={`flex items-center gap-4 px-6 py-3.5 cursor-pointer border-l-2 transition-colors group ${isActive ? 'bg-gray-50 border-[#C65D3B]' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        <div className={`flex flex-col gap-1 shrink-0 ${isActive ? 'text-gray-500' : 'text-gray-300 group-hover:text-gray-500'}`}>
                          <div className="w-3.5 h-[2px] bg-current rounded-full" />
                          <div className="w-3.5 h-[2px] bg-current rounded-full" />
                        </div>
                        <span className={`flex-1 text-[15px] ${isActive ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>Destaques</span>
                      </div>
                    );
                  })()}
                  {/* Sets criados */}
                  {sets.map((s) => {
                    const isActive = activeSet === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setActiveSet(s.id)}
                        className={`flex items-center gap-4 px-6 py-3.5 cursor-pointer border-l-2 transition-colors group ${isActive ? 'bg-gray-50 border-[#C65D3B]' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        <div className={`flex flex-col gap-1 shrink-0 ${isActive ? 'text-gray-500' : 'text-gray-300 group-hover:text-gray-500'}`}>
                          <div className="w-3.5 h-[2px] bg-current rounded-full" />
                          <div className="w-3.5 h-[2px] bg-current rounded-full" />
                        </div>
                        <span className={`flex-1 text-[15px] ${isActive ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>{s.name}</span>
                      </div>
                    );
                  })}

                  {/* Divisor + Selecionadas pelo Cliente */}
                  <div className="mx-6 my-2 border-t border-gray-100" />
                  {(() => {
                    const isActive = activeSet === '__client_selections__';
                    return (
                      <div
                        onClick={() => setActiveSet('__client_selections__')}
                        className={`flex items-center gap-4 px-6 py-3.5 cursor-pointer border-l-2 transition-colors group ${isActive ? 'bg-gray-50 border-[#C65D3B]' : 'border-transparent hover:bg-gray-50'}`}
                      >
                        <svg className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#C65D3B]' : 'text-gray-300 group-hover:text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span className={`flex-1 text-[14px] ${isActive ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>Selecionadas pelo Cliente</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── CONFIGURAÇÕES: sub-tabs ── */}
            {panelIcon === 'settings' && (
              <div className="flex flex-col pt-4 pb-4">
                {SETTINGS_TABS.map(({ key, label }) => {
                  const isActive = settingsTab === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setSettingsTab(key)}
                      className={`px-6 py-3.5 cursor-pointer border-l-2 text-[15px] transition-colors ${isActive ? 'bg-gray-50 border-[#C65D3B] text-gray-900 font-medium' : 'border-transparent text-gray-700 hover:bg-gray-50'}`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── BRUSH / SHARE: placeholder ── */}
            {(panelIcon === 'brush' || panelIcon === 'share') && (
              <div className="flex items-center justify-center py-16 text-gray-300 text-[13px]">
                Em breve
              </div>
            )}
          </div>

          {/* Botão Detalhes do Trabalho no rodapé */}
          <div className="border-t border-gray-100 p-3 shrink-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-3.5 h-3.5 shrink-0" />
              Detalhes do trabalho
            </button>
          </div>
        </aside>

        {/* ── Modal Nova Categoria ── */}
        {newSetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setNewSetModal(false)}>
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[13px] font-bold uppercase tracking-widest text-gray-900">Nova Categoria</h2>
                <button onClick={() => setNewSetModal(false)} className="text-gray-400 hover:text-gray-700 transition-colors"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1.5">Nome da Categoria</label>
                  <input
                    autoFocus
                    type="text"
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateSet(); }}
                    placeholder="Ex: Cerimônia, Recepção, Ao ar livre..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-[13px] outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1.5">Descrição <span className="font-normal text-gray-400 normal-case">(opcional)</span></label>
                  <textarea
                    value={newSetDesc}
                    onChange={e => setNewSetDesc(e.target.value.slice(0, 500))}
                    placeholder="Descrição visível para o cliente ao visualizar esta categoria."
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-sm text-[13px] outline-none focus:border-gray-400 transition-colors resize-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-right">{newSetDesc.length} / 500</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setNewSetModal(false)} className="px-4 py-2 text-[12px] text-gray-600 hover:text-gray-900 font-medium transition-colors">Cancelar</button>
                <button
                  onClick={handleCreateSet}
                  disabled={savingSet || !newSetName.trim()}
                  className="px-5 py-2 bg-[#C65D3B] hover:bg-[#a34a2e] text-white text-[12px] font-bold rounded-sm transition-colors disabled:opacity-40 flex items-center gap-2"
                >
                  {savingSet && <Loader2 className="w-3 h-3 animate-spin" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Conteúdo principal ── */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {panelIcon === 'fotos' && (
            <TabFotos
              jobId={jobId}
              photographerId={photographerId}
              galleryUrl={galleryUrl}
              activeSetId={activeSet === '__client_selections__' ? null : activeSet}
              activeSetName={activeSet === '__client_selections__' ? 'Selecionadas pelo Cliente' : activeSet === null ? 'Destaques' : (sets.find(s => s.id === activeSet)?.name ?? 'Destaques')}
              showClientSelections={activeSet === '__client_selections__'}
            />
          )}
          {panelIcon === 'brush' && <TabPlaceholder label="Editar" />}
          {panelIcon === 'share' && <TabPlaceholder label="Compartilhar" />}
          {panelIcon === 'settings' && settingsTab === 'selecao' && <TabSelecao job={job} />}
          {panelIcon === 'settings' && settingsTab === 'entrega' && <TabEntrega job={job} />}
          {panelIcon === 'settings' && settingsTab === 'configuracoes' && <TabPlaceholder label="Configurações" />}
        </div>
      </div>
    </div>
  );
};

export default AdminJobDetail;
