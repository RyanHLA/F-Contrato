import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

type Stage = 'loading' | 'sign' | 'already_signed' | 'signed' | 'not_found';

interface ContractData {
  id: string;
  body_html: string;
  signed_at: string | null;
  client_name: string | null;
  albums: {
    title: string;
    photographers: {
      name: string;
    } | null;
  } | null;
}

const ClientContract = () => {
  const { slug, albumId } = useParams<{ slug: string; albumId: string }>();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('loading');
  const [contract, setContract] = useState<ContractData | null>(null);
  const [clientName, setClientName] = useState('');
  const [nameError, setNameError] = useState('');
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!albumId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          id,
          body_html,
          signed_at,
          client_name,
          albums (
            title,
            photographers ( name )
          )
        `)
        .eq('album_id', albumId)
        .maybeSingle();

      if (error || !data) {
        setStage('not_found');
        return;
      }

      setContract(data as ContractData);

      if (data.signed_at) {
        setStage('already_signed');
      } else {
        setStage('sign');
      }
    };

    load();
  }, [albumId]);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumId || !clientName.trim()) {
      setNameError('Por favor, insira seu nome completo para assinar.');
      return;
    }
    setNameError('');
    setSigning(true);

    // get client IP from a public API (best effort — not security-critical)
    let clientIp = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const json = await res.json();
      clientIp = json.ip ?? '';
    } catch {
      // silently ignore — IP is informational only
    }

    const { data: success, error } = await supabase.rpc('sign_contract', {
      p_album_id: albumId,
      p_client_name: clientName.trim(),
      p_client_ip: clientIp,
    });

    if (error || !success) {
      setSigning(false);
      setNameError('Erro ao registrar assinatura. Tente novamente.');
      return;
    }

    setStage('signed');
    setSigning(false);

    // Redireciona para a galeria após 3 segundos
    setTimeout(() => {
      navigate(`/p/${slug}/${albumId}`);
    }, 3000);
  };

  // --- CARREGANDO ---
  if (stage === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  // --- NÃO ENCONTRADO ---
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

  // --- JÁ ASSINADO ---
  if (stage === 'already_signed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <div>
            <h1 className="font-serif text-2xl text-slate-800">Contrato já assinado</h1>
            <p className="mt-2 text-sm text-slate-500">
              Este contrato foi assinado por <span className="font-medium">{contract?.client_name}</span>.
            </p>
          </div>
          <Button
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => navigate(`/p/${slug}/${albumId}`)}
          >
            Acessar Álbum
          </Button>
        </div>
      </div>
    );
  }

  // --- ASSINADO AGORA ---
  if (stage === 'signed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <div>
            <h1 className="font-serif text-2xl text-slate-800">Contrato assinado!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Obrigado, <span className="font-medium">{clientName}</span>. Sua assinatura foi registrada com sucesso.
            </p>
            <p className="mt-3 text-xs text-slate-400">Redirecionando para o álbum...</p>
          </div>
        </div>
      </div>
    );
  }

  // --- TELA DE ASSINATURA ---
  const photographerName = contract?.albums?.photographers?.name;
  const albumTitle = contract?.albums?.title;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center gap-3">
          <FileText className="h-5 w-5 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-700">{albumTitle}</p>
            {photographerName && (
              <p className="text-xs text-slate-400">{photographerName}</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {/* Corpo do contrato */}
        <div className="rounded-2xl bg-white shadow-sm p-8">
          <div
            className="prose prose-slate max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: contract?.body_html ?? '' }}
          />
        </div>

        {/* Formulário de assinatura */}
        <div className="rounded-2xl bg-white shadow-sm p-8 space-y-6">
          <div>
            <h2 className="font-serif text-xl text-slate-800">Assinar Contrato</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ao clicar em "Assinar", você declara ter lido e concordado com todos os termos acima.
              Sua assinatura será registrada com data, hora e endereço IP.
            </p>
          </div>

          <form onSubmit={handleSign} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name" className="text-slate-700">
                Nome completo *
              </Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Digite seu nome completo"
                className="rounded-xl border-slate-200"
                required
                autoFocus
              />
              {nameError && (
                <p className="text-sm text-red-600">{nameError}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={signing || !clientName.trim()}
              className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 py-6 text-base"
            >
              {signing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Assinar Contrato'
              )}
            </Button>

            <p className="text-center text-xs text-slate-400">
              Esta assinatura eletrônica tem validade jurídica conforme a Lei nº 14.063/2020.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
};

export default ClientContract;
