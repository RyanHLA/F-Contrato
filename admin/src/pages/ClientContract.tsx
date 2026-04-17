import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Loader2, CheckCircle2, AlertCircle, PenLine } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */
type Stage = 'loading' | 'sign' | 'already_signed' | 'signed' | 'not_found';

interface ContractData {
  id: string;
  body_html: string;
  signed_at: string | null;
  client_name: string | null;
  client_doc: string | null;
  client_email: string | null;
  jobs: {
    title: string;
    photographers: {
      name: string;
      email: string | null;
      slug: string;
    } | null;
  } | null;
}

/* ─── Helpers ────────────────────────────────────────────────── */

/** Extrai o valor de um smartField pelo atributo `field` do JSON do contrato */
function extractSmartField(bodyHtml: string, fieldName: string): string {
  try {
    const blocks: Array<{ content: string }> = JSON.parse(bodyHtml);
    for (const block of blocks) {
      const doc = JSON.parse(block.content);
      const found = findNodeAttr(doc, fieldName);
      if (found) return found;
    }
  } catch {
    /* não é JSON de blocos — ignora */
  }
  return '';
}

function findNodeAttr(node: any, fieldName: string): string | null {
  if (node?.type === 'smartField' && node?.attrs?.field === fieldName) {
    return node.attrs.value ?? '';
  }
  if (Array.isArray(node?.content)) {
    for (const child of node.content) {
      const r = findNodeAttr(child, fieldName);
      if (r !== null) return r;
    }
  }
  return null;
}

/** Converte os blocos TipTap JSON para HTML legível na página do cliente */
function blocksToHtml(bodyHtml: string): string {
  // Se começa com '[', é JSON de blocos TipTap — retorna o body_html cru
  // (a renderização HTML real exigiria o TipTap em modo read-only, aqui usamos
  // uma representação simples apenas para a preview do contrato)
  if (bodyHtml.trim().startsWith('[')) {
    // Extrai o texto de todos os blocos para preview simples
    try {
      const blocks: Array<{ content: string }> = JSON.parse(bodyHtml);
      return blocks
        .map(b => {
          try {
            return tiptapJsonToHtml(JSON.parse(b.content));
          } catch {
            return '';
          }
        })
        .join('');
    } catch {
      return bodyHtml;
    }
  }
  return bodyHtml;
}

function tiptapJsonToHtml(doc: any): string {
  if (!doc || !doc.content) return '';
  return doc.content.map((node: any) => nodeToHtml(node)).join('');
}

function nodeToHtml(node: any): string {
  if (!node) return '';
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(nodeToHtml).join('');
    case 'paragraph': {
      const inner = (node.content ?? []).map(nodeToHtml).join('');
      const align = node.attrs?.textAlign ?? 'left';
      return `<p style="text-align:${align};margin:0 0 8px;font-size:12px;line-height:1.7;color:#333;">${inner || '&nbsp;'}</p>`;
    }
    case 'heading': {
      const lvl = node.attrs?.level ?? 2;
      const inner = (node.content ?? []).map(nodeToHtml).join('');
      if (lvl === 1) return `<h1 style="font-size:22px;font-weight:500;letter-spacing:0.04em;color:#1a1a1a;margin:0 0 4px;">${inner}</h1>`;
      if (lvl === 2) return `<h2 style="font-size:13px;font-weight:700;color:#1a1a1a;margin:20px 0 8px;padding-bottom:6px;border-bottom:1.5px solid #e0e0e0;text-transform:uppercase;letter-spacing:0.04em;">${inner}</h2>`;
      return `<h3 style="font-size:12px;font-weight:700;margin:12px 0 4px;">${inner}</h3>`;
    }
    case 'bulletList':
      return `<ul style="margin:0 0 10px;padding-left:20px;list-style-type:disc;">${(node.content ?? []).map(nodeToHtml).join('')}</ul>`;
    case 'listItem':
      return `<li style="font-size:12px;color:#333;line-height:1.7;margin-bottom:4px;">${(node.content ?? []).map(nodeToHtml).join('')}</li>`;
    case 'text': {
      let t = (node.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      (node.marks ?? []).forEach((m: any) => {
        if (m.type === 'bold') t = `<strong>${t}</strong>`;
        if (m.type === 'italic') t = `<em>${t}</em>`;
        if (m.type === 'underline') t = `<u>${t}</u>`;
        if (m.type === 'textStyle' && m.attrs?.color) t = `<span style="color:${m.attrs.color}">${t}</span>`;
      });
      return t;
    }
    case 'smartField': {
      const val = node.attrs?.value;
      const ph  = node.attrs?.placeholder ?? '';
      return `<span style="background:#fef9c3;border-radius:3px;padding:1px 4px;">${val || ph}</span>`;
    }
    default:
      return (node.content ?? []).map(nodeToHtml).join('');
  }
}

/* ─── Signature preview ──────────────────────────────────────── */
const SignaturePreview = ({ name }: { name: string }) => (
  <div style={{
    minHeight: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '2px solid #334155',
    marginBottom: 4,
    padding: '8px 4px',
  }}>
    {name ? (
      <span style={{
        fontFamily: "'Dancing Script', cursive",
        fontSize: 36,
        color: '#1e293b',
        fontVariant: 'none',
        lineHeight: 1.1,
        userSelect: 'none',
      }}>
        {name}
      </span>
    ) : (
      <span style={{ color: '#cbd5e1', fontSize: 13, fontStyle: 'italic' }}>
        Sua assinatura aparecerá aqui
      </span>
    )}
  </div>
);

/* ─── Component ──────────────────────────────────────────────── */
const ClientContract = () => {
  const { jobId } = useParams<{ slug: string; jobId: string }>();

  const [stage, setStage]       = useState<Stage>('loading');
  const [contract, setContract] = useState<ContractData | null>(null);
  const [signing, setSigning]   = useState(false);

  // Campos do bloco de assinatura
  const [agreed, setAgreed]         = useState(false);
  const [sigName, setSigName]       = useState('');
  const [clientDoc, setClientDoc]   = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [fieldError, setFieldError] = useState('');

  // Carrega a fonte Dancing Script para a assinatura cursiva
  useEffect(() => {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    if (!jobId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          id,
          body_html,
          signed_at,
          client_name,
          client_doc,
          client_email,
          jobs (
            title,
            photographers ( name, email, slug )
          )
        `)
        .eq('job_id', jobId)
        .maybeSingle();

      if (error || !data) {
        setStage('not_found');
        return;
      }

      setContract(data as ContractData);

      if (data.signed_at) {
        setStage('already_signed');
      } else {
        // Pré-preenche campos com valores dos Smart Fields do contrato
        const prefilledName  = extractSmartField(data.body_html, 'cliente');
        const prefilledDoc   = extractSmartField(data.body_html, 'cpfCliente');
        const prefilledEmail = extractSmartField(data.body_html, 'emailCliente');
        if (prefilledName)  setSigName(prefilledName);
        if (prefilledDoc)   setClientDoc(prefilledDoc);
        if (prefilledEmail) setClientEmail(prefilledEmail);
        setStage('sign');
      }
    };

    load();
  }, [jobId]);

  const contractHtml = useMemo(
    () => contract ? blocksToHtml(contract.body_html) : '',
    [contract]
  );

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');

    if (!agreed) {
      setFieldError('Marque o checkbox de aceite para continuar.');
      return;
    }
    if (!sigName.trim()) {
      setFieldError('Digite seu nome completo para assinar.');
      return;
    }
    if (!jobId) return;

    setSigning(true);

    // Captura IP do cliente (melhor esforço)
    let clientIp = '';
    try {
      const res  = await fetch('https://api.ipify.org?format=json');
      const json = await res.json();
      clientIp   = json.ip ?? '';
    } catch { /* silently ignore */ }

    const { data: success, error } = await supabase.rpc('sign_contract', {
      p_job_id:       jobId,
      p_client_name:  sigName.trim(),
      p_client_ip:    clientIp,
      p_client_doc:   clientDoc.trim(),
      p_client_email: clientEmail.trim(),
    });

    if (error || !success) {
      setSigning(false);
      setFieldError('Erro ao registrar assinatura. Tente novamente.');
      return;
    }

    // Notifica o fotógrafo por e-mail (fire-and-forget)
    supabase.functions.invoke('send-contract-signed-email', {
      body: { job_id: jobId },
    }).catch(() => { /* silently ignore */ });

    setStage('signed');
    setSigning(false);
  };

  /* ── Loading ── */
  if (stage === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  /* ── Não encontrado ── */
  if (stage === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="font-serif text-2xl text-slate-700">Contrato não encontrado</h1>
          <p className="text-sm text-slate-400">
            Este link pode ter expirado ou o contrato não está disponível.
          </p>
        </div>
      </div>
    );
  }

  /* ── Já assinado ── */
  if (stage === 'already_signed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <div>
            <h1 className="font-serif text-2xl text-slate-800">Contrato já assinado</h1>
            <p className="mt-2 text-sm text-slate-500">
              Este contrato foi assinado por{' '}
              <span className="font-medium">{contract?.client_name}</span>.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Em caso de dúvidas, entre em contato com o fotógrafo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Sucesso pós-assinatura ── */
  if (stage === 'signed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <div>
            <h1 className="font-serif text-2xl text-slate-800">Contrato assinado!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Obrigado, <span className="font-medium">{sigName}</span>.{' '}
              Sua assinatura foi registrada com sucesso.
            </p>
            <p className="mt-3 text-sm text-slate-400 font-medium">
              O fotógrafo será notificado para finalizar o processo.
            </p>
            <p className="mt-4 text-xs text-slate-400">
              Você pode fechar esta página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Tela de assinatura ── */
  const photographerName = contract?.jobs?.photographers?.name;
  const jobTitle         = contract?.jobs?.title;

  return (
    <>
      {/* Fonte cursiva para a assinatura */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');
        .sig-checkbox { width: 18px; height: 18px; accent-color: #059669; cursor: pointer; flex-shrink: 0; margin-top: 2px; }
      `}</style>

      <div className="min-h-screen bg-neutral-50">
        {/* Header */}
        <header className="border-b border-slate-100 bg-white px-6 py-4 sticky top-0 z-10">
          <div className="mx-auto max-w-3xl flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">{jobTitle}</p>
              {photographerName && (
                <p className="text-xs text-slate-400">{photographerName}</p>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">

          {/* Corpo do contrato (read-only) */}
          <div className="rounded-2xl bg-white shadow-sm p-8">
            <div
              className="prose prose-slate max-w-none text-sm leading-relaxed"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
              dangerouslySetInnerHTML={{ __html: contractHtml }}
            />
          </div>

          {/* ── Bloco de Assinatura ── */}
          <div className="rounded-2xl bg-white shadow-sm p-8 space-y-7">

            {/* Título */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                <PenLine className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-lg text-slate-800">Assinar Contrato</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Leia o contrato acima antes de assinar.
                </p>
              </div>
            </div>

            <form onSubmit={handleSign} className="space-y-6">

              {/* Campos de identificação */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sig-name" className="text-slate-700 text-sm">
                    Nome completo <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="sig-name"
                    value={sigName}
                    onChange={e => setSigName(e.target.value)}
                    placeholder="Digite seu nome completo"
                    className="rounded-xl border-slate-200"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sig-doc" className="text-slate-700 text-sm">
                      CPF / CNPJ
                    </Label>
                    <Input
                      id="sig-doc"
                      value={clientDoc}
                      onChange={e => setClientDoc(e.target.value)}
                      placeholder="000.000.000-00"
                      className="rounded-xl border-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sig-email" className="text-slate-700 text-sm">
                      E-mail
                    </Label>
                    <Input
                      id="sig-email"
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="rounded-xl border-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Preview da assinatura cursiva (Type-to-Sign) */}
              <div className="space-y-1.5">
                <Label className="text-slate-700 text-sm">
                  Visualização da assinatura
                </Label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-4">
                  <SignaturePreview name={sigName} />
                  <p className="mt-2 text-center text-xs text-slate-400">
                    Assinatura gerada a partir do seu nome
                  </p>
                </div>
              </div>

              {/* Checkbox de aceite */}
              <label className="flex gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="sig-checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                />
                <span className="text-sm text-slate-600 leading-snug">
                  Li e concordo com todos os termos e condições deste contrato. Declaro que as
                  informações fornecidas são verdadeiras e que esta assinatura eletrônica representa
                  meu consentimento pleno.
                </span>
              </label>

              {/* Mensagem de erro */}
              {fieldError && (
                <p className="text-sm text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {fieldError}
                </p>
              )}

              {/* Botão de assinatura */}
              <Button
                type="submit"
                disabled={signing || !sigName.trim() || !agreed}
                className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 py-6 text-base font-semibold disabled:opacity-50"
              >
                {signing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Registrando assinatura...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <PenLine className="h-5 w-5" />
                    Assinar Contrato
                  </span>
                )}
              </Button>

              <p className="text-center text-xs text-slate-400">
                Esta assinatura eletrônica tem validade jurídica conforme a Lei nº 14.063/2020.
                Sua assinatura será registrada com data, hora e endereço IP.
              </p>
            </form>
          </div>
        </main>
      </div>
    </>
  );
};

export default ClientContract;
