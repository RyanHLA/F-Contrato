import { useState, useEffect } from 'react';
import { Globe, Palette, Bell, CreditCard, CheckCircle2, Loader2, AlertCircle, Eye, EyeOff, Save, Unlink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/* ── Mercado Pago Connect ──────────────────────────────────────────────── */
const MercadoPagoConnect = () => {
  const { toast } = useToast();
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [photographerId, setPhotographerId] = useState<string | null>(null);
  const [mpConnectedAt, setMpConnectedAt]   = useState<string | null>(null);
  const [accessToken, setAccessToken]       = useState('');
  const [publicKey, setPublicKey]           = useState('');
  const [showToken, setShowToken]           = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('photographers')
        .select('id, mp_connected_at')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setPhotographerId(data.id);
        setMpConnectedAt((data as any).mp_connected_at ?? null);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!photographerId || !accessToken.trim()) return;
    if (!accessToken.startsWith('APP_USR-') && !accessToken.startsWith('TEST-')) {
      toast({ title: 'Token inválido', description: 'O Access Token deve começar com APP_USR- (produção) ou TEST- (teste).', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Salva o token e valida via Edge Function (evita CORS)
      const { data, error } = await supabase.functions.invoke('mp-save-token', {
        body: { photographerId, accessToken: accessToken.trim(), publicKey: publicKey.trim() || undefined },
      });

      if (error || data?.error) {
        toast({ title: 'Token inválido', description: data?.error ?? 'Verifique o Access Token e tente novamente.', variant: 'destructive' });
        return;
      }

      setMpConnectedAt(new Date().toISOString());
      setAccessToken('');
      toast({ title: 'Mercado Pago conectado com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o Mercado Pago? Os clientes não poderão comprar fotos extras.')) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('photographers')
        .update({ mp_access_token: null, mp_connected_at: null })
        .eq('id', photographerId!);
      if (error) throw error;
      setMpConnectedAt(null);
      toast({ title: 'Mercado Pago desconectado.' });
    } catch {
      toast({ title: 'Erro ao desconectar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const isConnected = !!mpConnectedAt;

  return (
    <div className="rounded-sm bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#00B1EA]/10">
          <CreditCard className="h-5 w-5 text-[#009EE3]" />
        </div>
        <div>
          <h3 className="font-medium text-slate-800">Mercado Pago</h3>
          <p className="text-sm text-slate-500">Receba pagamentos de fotos extras diretamente na sua conta</p>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando...
          </div>
        ) : isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Conta conectada</p>
                  <p className="text-xs text-slate-400">
                    Desde {new Date(mpConnectedAt!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <Unlink className="w-3.5 h-3.5" />
                Desconectar
              </button>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-xs text-slate-500">Atualizar credenciais:</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    placeholder="Access Token (APP_USR-...)"
                    className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm pr-9 focus:outline-none focus:border-[#009EE3]"
                  />
                  <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-2.5 top-2.5 text-slate-400">
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicKey}
                  onChange={e => setPublicKey(e.target.value)}
                  placeholder="Public Key (APP_USR-...)"
                  className="flex-1 rounded-sm border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#009EE3]"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !accessToken.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#009EE3] hover:bg-[#007FC0] text-white text-sm rounded-sm disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-sm px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Cole seu <strong>Access Token</strong> e <strong>Public Key</strong> do Mercado Pago para habilitar a venda de fotos extras.{' '}
                Acesse <strong>mercadopago.com.br/developers</strong> → sua aplicação → Credenciais → Access Token e Public Key.
              </span>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="Access Token (APP_USR-...)"
                  className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm pr-9 focus:outline-none focus:border-[#009EE3]"
                />
                <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-2.5 top-2.5 text-slate-400">
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicKey}
                  onChange={e => setPublicKey(e.target.value)}
                  placeholder="Public Key (APP_USR-...)"
                  className="flex-1 rounded-sm border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#009EE3]"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !accessToken.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#009EE3] hover:bg-[#007FC0] text-white text-sm rounded-sm disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Conectar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main ─────────────────────────────────────────────────────────────── */
const AdminSettings = () => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl text-slate-800">Configurações</h2>
        <p className="mt-1 text-slate-500">Gerencie as configurações da sua conta.</p>
      </div>

      <div className="space-y-6">

        {/* Mercado Pago */}
        <MercadoPagoConnect />

        {/* General */}
        <div className="rounded-sm bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-amber-50">
              <Globe className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-medium text-slate-800">Configurações Gerais</h3>
              <p className="text-sm text-slate-500">Nome do site, descrição e informações básicas</p>
            </div>
          </div>
          <div className="mt-6 text-center text-slate-400">Em breve</div>
        </div>

        {/* Appearance */}
        <div className="rounded-sm bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-purple-50">
              <Palette className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-slate-800">Aparência</h3>
              <p className="text-sm text-slate-500">Cores, fontes e estilo visual</p>
            </div>
          </div>
          <div className="mt-6 text-center text-slate-400">Em breve</div>
        </div>

        {/* Notifications */}
        <div className="rounded-sm bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-blue-50">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-slate-800">Notificações</h3>
              <p className="text-sm text-slate-500">E-mails e alertas do sistema</p>
            </div>
          </div>
          <div className="mt-6 text-center text-slate-400">Em breve</div>
        </div>

      </div>
    </div>
  );
};

export default AdminSettings;
