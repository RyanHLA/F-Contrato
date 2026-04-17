import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, Loader2, Zap, Star, Rocket, Clock,
  AlertTriangle, CreditCard, HardDrive, RefreshCw
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price_brl: number;
  max_storage_gb: number;
  max_photos_per_album: number;
  abacatepay_product_id: string | null;
}

interface Photographer {
  account_status: string;
  trial_ends_at: string;
  storage_used_bytes: number;
  abacatepay_subscription_id: string | null;
  abacatepay_product_id: string | null;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  trial:    <Clock    className="h-5 w-5" />,
  basico:   <Zap      className="h-5 w-5" />,
  pro:      <Star     className="h-5 w-5" />,
  avancado: <Rocket   className="h-5 w-5" />,
};

const PLAN_COLORS: Record<string, string> = {
  trial:    'bg-slate-50  border-slate-200  text-slate-700',
  basico:   'bg-[#FAF0EC] border-[#e8c4b8] text-[#C65D3B]',
  pro:      'bg-[#FAF0EC] border-[#e8c4b8] text-[#C65D3B]',
  avancado: 'bg-[#FFF4F0] border-[#e8c4b8] text-[#a34a2e]',
};

const PLAN_BUTTON_COLORS: Record<string, string> = {
  basico:   'bg-[#C65D3B] hover:bg-[#a34a2e]',
  pro:      'bg-[#C65D3B] hover:bg-[#a34a2e]',
  avancado: 'bg-[#a34a2e] hover:bg-[#8a3e27]',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function trialDaysLeft(trialEndsAt: string): number {
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const AdminPlans = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [photographer, setPhotographer] = useState<Photographer | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [plansRes, photographerRes] = await Promise.all([
        supabase.from('plans').select('*').order('price_brl'),
        supabase.from('photographers')
          .select('account_status, trial_ends_at, storage_used_bytes, abacatepay_subscription_id, abacatepay_product_id')
          .maybeSingle(),
      ]);
      if (plansRes.data) setPlans(plansRes.data as Plan[]);
      if (photographerRes.data) setPhotographer(photographerRes.data as Photographer);
      setLoading(false);
    };
    load();
  }, []);

  const handleCheckout = async (planId: string) => {
    setCheckingOut(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await supabase.functions.invoke('create-checkout', {
        body: {
          plan_id:     planId,
          success_url: `${window.location.origin}/admin?checkout=success`,
          cancel_url:  `${window.location.origin}/admin?checkout=cancel`,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const url = res.data?.url;
      if (!url) throw new Error('URL de checkout não retornada.');

      window.location.href = url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao iniciar checkout', description: message, variant: 'destructive' });
      setCheckingOut(null);
    }
  };

  const currentPlanId = (() => {
    if (!photographer) return null;
    if (photographer.account_status === 'trial') return 'trial';
    if (photographer.account_status === 'suspended') return null;
    // Ativo: identifica plano pelo abacatepay_product_id
    return plans.find(p => p.abacatepay_product_id === photographer.abacatepay_product_id)?.id ?? null;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#C65D3B]" />
      </div>
    );
  }

  const daysLeft     = photographer ? trialDaysLeft(photographer.trial_ends_at) : 0;
  const storageUsed  = photographer?.storage_used_bytes ?? 0;
  const isTrial      = photographer?.account_status === 'trial';
  const isSuspended  = photographer?.account_status === 'suspended';
  const isActive     = photographer?.account_status === 'active';
  const paidPlans    = plans.filter(p => p.id !== 'trial');

  return (
    <div className="space-y-8">

      {/* Status atual da conta */}
      <div className={`rounded-sm border p-5 ${
        isSuspended ? 'bg-red-50 border-red-200' :
        isTrial     ? 'bg-amber-50 border-amber-200' :
                      'bg-emerald-50 border-emerald-200'
      }`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isSuspended ? (
              <AlertTriangle className="h-6 w-6 text-red-600" />
            ) : isTrial ? (
              <Clock className="h-6 w-6 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            )}
            <div>
              <p className={`font-semibold ${
                isSuspended ? 'text-red-800' : isTrial ? 'text-amber-800' : 'text-emerald-800'
              }`}>
                {isSuspended ? 'Conta Suspensa' :
                 isTrial     ? `Período de Teste — ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}` :
                               `Plano Ativo — ${plans.find(p => p.id === currentPlanId)?.name ?? 'Plano'}`}
              </p>
              <p className={`text-sm mt-0.5 ${
                isSuspended ? 'text-red-600' : isTrial ? 'text-amber-600' : 'text-emerald-600'
              }`}>
                {isSuspended
                  ? 'Seus dados são mantidos por 30 dias após a suspensão. Reative para recuperar o acesso.'
                  : isTrial
                  ? 'Explore todas as funcionalidades gratuitamente. Assine um plano antes do período encerrar.'
                  : 'Sua assinatura está ativa e em dia.'}
              </p>
            </div>
          </div>

          {/* Uso de storage */}
          <div className="flex items-center gap-2 rounded-sm bg-white/70 px-4 py-2">
            <HardDrive className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-600">
              <span className="font-semibold">{formatBytes(storageUsed)}</span> usado
            </span>
          </div>
        </div>
      </div>

      {/* Cards dos planos pagos */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          {isActive ? 'Mudar de Plano' : 'Escolha um Plano'}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {paidPlans.map((plan) => {
            const isCurrent   = plan.id === currentPlanId;
            const isLoading   = checkingOut === plan.id;
            const hasProductId = !!plan.abacatepay_product_id;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-sm border-2 p-6 transition-all ${
                  isCurrent
                    ? PLAN_COLORS[plan.id] + ' ring-2 ring-offset-2 ring-[#C65D3B]'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {isCurrent && (
                  <span className="absolute right-4 top-4 rounded-full bg-[#C65D3B] px-2.5 py-0.5 text-[11px] font-bold text-white uppercase tracking-wide">
                    Atual
                  </span>
                )}

                <div className="flex items-center gap-2 text-slate-700 mb-4">
                  {PLAN_ICONS[plan.id]}
                  <span className="font-bold text-lg">{plan.name}</span>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-black text-slate-800">
                    R$ {plan.price_brl.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-sm text-slate-400">/mês</span>
                </div>

                <ul className="mb-6 space-y-2 text-sm text-slate-600 flex-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    {plan.max_storage_gb} GB de armazenamento
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    Álbuns ilimitados
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    {plan.max_photos_per_album === -1 ? 'Fotos ilimitadas por álbum' : `Até ${plan.max_photos_per_album} fotos por álbum`}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    Acesso do cliente com PIN
                  </li>
                </ul>

                {isCurrent ? (
                  <Button disabled variant="outline" className="w-full">
                    Plano atual
                  </Button>
                ) : !hasProductId ? (
                  <Button disabled variant="outline" className="w-full text-slate-400">
                    Em breve
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleCheckout(plan.id)}
                    disabled={!!checkingOut}
                    className={`w-full text-white ${PLAN_BUTTON_COLORS[plan.id]}`}
                  >
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Aguarde...</>
                    ) : (
                      <><CreditCard className="mr-2 h-4 w-4" />Assinar {plan.name}</>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Seção de teste da integração AbacatePay */}
      <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="h-4 w-4 text-slate-500" />
          <h3 className="font-semibold text-slate-700">Testar Integração AbacatePay</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Use isso para verificar se a conexão com o AbacatePay está funcionando antes de ir para produção.
          Ao clicar, a Edge Function <code className="bg-white px-1 rounded border border-slate-200 text-xs">create-checkout</code> será
          chamada e você será redirecionado para a página de checkout do Sandbox.
          Nenhuma cobrança real será feita.
        </p>
        <div className="flex flex-wrap gap-3">
          {paidPlans.filter(p => p.abacatepay_product_id).map(plan => (
            <Button
              key={plan.id}
              variant="outline"
              size="sm"
              disabled={!!checkingOut}
              onClick={() => handleCheckout(plan.id)}
              className="border-slate-300 text-slate-600 hover:bg-white"
            >
              {checkingOut === plan.id
                ? <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                : <CreditCard className="mr-2 h-3 w-3" />
              }
              Testar checkout — {plan.name}
            </Button>
          ))}
          {paidPlans.every(p => !p.abacatepay_product_id) && (
            <p className="text-sm text-amber-600">
              Nenhum plano tem <code className="bg-white px-1 rounded border border-amber-200 text-xs">abacatepay_product_id</code> configurado ainda.
              Cadastre os produtos no AbacatePay e atualize a tabela <code className="bg-white px-1 rounded border border-amber-200 text-xs">plans</code>.
            </p>
          )}
        </div>

        {/* Status dos secrets */}
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Checklist de configuração
          </p>
          <ChecklistItem
            label="Planos com product_id configurado"
            ok={paidPlans.some(p => !!p.abacatepay_product_id)}
            hint="Atualize a tabela plans com os IDs do AbacatePay"
          />
          <ChecklistItem
            label="Fotógrafo encontrado no banco"
            ok={!!photographer}
            hint="Execute a migration 20260328000001 para criar seu registro"
          />
          <ChecklistItem
            label="Conta não suspensa"
            ok={!isSuspended}
            hint="Reative sua assinatura para habilitar o checkout"
          />
        </div>
      </div>
    </div>
  );
};

const ChecklistItem = ({
  label, ok, hint
}: { label: string; ok: boolean; hint: string }) => (
  <div className="flex items-start gap-2 py-1">
    {ok
      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
      : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
    }
    <div>
      <span className={`text-sm ${ok ? 'text-slate-700' : 'text-amber-700'}`}>{label}</span>
      {!ok && <p className="text-xs text-amber-500">{hint}</p>}
    </div>
  </div>
);

export default AdminPlans;
