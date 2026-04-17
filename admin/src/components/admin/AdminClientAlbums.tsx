import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Users, Eye, Copy, Check,
  Lock, Image, Loader2, ChevronRight, RotateCcw, FileText, ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Album {
  id: string;
  title: string;
  category: string;
  cover_image_url: string | null;
  client_enabled: boolean;
  client_pin: string | null;
  selection_limit: number | null;
  client_submitted_at: string | null;
  contract_template: string | null;
  created_at: string;
}

interface Contract {
  signed_at: string | null;
  client_name: string | null;
}

interface Selection {
  id: string;
  image_id: string;
  image_url: string;
  title: string | null;
}

const AdminClientAlbums = () => {
  const photographerId = usePhotographerId();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [photographerSlug, setPhotographerSlug] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isSelectionsDialogOpen, setIsSelectionsDialogOpen] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [selectionsLoading, setSelectionsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Contrato
  const [contracts, setContracts] = useState<Record<string, Contract>>({});
  const [savingContract, setSavingContract] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    client_enabled: false,
    client_pin: '',
    selection_limit: '',
    contract_template: '',
  });
  
  const { toast } = useToast();

  useEffect(() => {
    if (!photographerId) return;
    fetchAlbums();
    fetchContracts();
    supabase
      .from('photographers')
      .select('slug')
      .eq('id', photographerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPhotographerSlug(data.slug);
      });
  }, [photographerId]);

  const fetchContracts = async () => {
    if (!photographerId) return;
    const { data } = await supabase
      .from('contracts')
      .select('album_id, signed_at, client_name')
      .eq('photographer_id', photographerId);
    if (data) {
      const map: Record<string, Contract> = {};
      data.forEach((c) => { map[c.album_id] = { signed_at: c.signed_at, client_name: c.client_name }; });
      setContracts(map);
    }
  };

  const fetchAlbums = async () => {
    if (!photographerId) return;
    const { data, error } = await supabase
      .from('albums')
      .select('*')
      .eq('photographer_id', photographerId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao carregar álbuns', variant: 'destructive' });
    } else {
      setAlbums((data || []) as Album[]);
    }
    setLoading(false);
  };

  const fetchSelections = async (albumId: string) => {
    setSelectionsLoading(true);

    const { data, error } = await supabase
      .from('client_selections')
      .select(`
        id,
        image_id,
        site_images (
          image_url,
          title
        )
      `)
      .eq('album_id', albumId);

    if (!error && data) {
      const mapped = data.map((s) => {
        const img = s.site_images as { image_url: string; title: string | null } | null;
        return {
          id: s.id,
          image_id: s.image_id,
          image_url: img?.image_url || '',
          title: img?.title || null,
        };
      });
      setSelections(mapped);
    }
    setSelectionsLoading(false);
  };

  const openConfigDialog = (album: Album) => {
    setSelectedAlbum(album);
    setFormData({
      client_enabled: album.client_enabled,
      client_pin: album.client_pin || '',
      selection_limit: album.selection_limit?.toString() || '',
      contract_template: album.contract_template || '',
    });
    setIsConfigDialogOpen(true);
  };

  const handleSaveContract = async () => {
    if (!selectedAlbum || !photographerId) return;
    if (!formData.contract_template.trim()) {
      toast({ title: 'Contrato vazio', description: 'Escreva o texto do contrato antes de salvar.', variant: 'destructive' });
      return;
    }
    setSavingContract(true);

    // Salva o template no álbum
    await supabase.from('albums').update({ contract_template: formData.contract_template }).eq('id', selectedAlbum.id);

    // Substitui variáveis básicas e upsert na tabela contracts
    const bodyHtml = formData.contract_template
      .replace(/\n/g, '<br/>')
      .replace(/\{\{titulo_album\}\}/g, selectedAlbum.title)
      .replace(/\{\{categoria\}\}/g, selectedAlbum.category);

    const existing = contracts[selectedAlbum.id];

    if (existing) {
      // Atualiza apenas se ainda não assinado
      if (!existing.signed_at) {
        await supabase.from('contracts').update({ body_html: bodyHtml }).eq('album_id', selectedAlbum.id);
      }
    } else {
      await supabase.from('contracts').insert({
        album_id: selectedAlbum.id,
        photographer_id: photographerId,
        body_html: bodyHtml,
      });
    }

    await fetchContracts();
    setSavingContract(false);
    toast({ title: 'Contrato salvo!' });
  };

  const openSelectionsDialog = async (album: Album) => {
    setSelectedAlbum(album);
    await fetchSelections(album.id);
    setIsSelectionsDialogOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!selectedAlbum) return;
    
    if (formData.client_enabled && !formData.client_pin.trim()) {
      toast({ 
        title: 'PIN obrigatório', 
        description: 'Defina um PIN para compartilhar o álbum.',
        variant: 'destructive' 
      });
      return;
    }
    
    // Hash the PIN server-side before storing
    const pinValue = formData.client_pin.trim() || null;
    let hashedPin: string | null = null;
    if (pinValue) {
      const { data: hashData, error: hashError } = await supabase.rpc('hash_pin', { plain_pin: pinValue });
      if (hashError || !hashData) {
        toast({ title: 'Erro ao processar PIN', variant: 'destructive' });
        return;
      }
      hashedPin = hashData;
    }

    const { error } = await supabase
      .from('albums')
      .update({
        client_enabled: formData.client_enabled,
        client_pin: hashedPin,
        selection_limit: formData.selection_limit ? parseInt(formData.selection_limit) : null,
      })
      .eq('id', selectedAlbum.id);
    
    if (error) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } else {
      await supabase.rpc('log_audit', { p_action: 'configure_client_album', p_entity_type: 'album', p_entity_id: selectedAlbum.id, p_metadata: { client_enabled: formData.client_enabled, selection_limit: formData.selection_limit || null } });
      toast({ title: 'Configurações salvas!' });
      setIsConfigDialogOpen(false);
      fetchAlbums();
    }
  };

  const handleResetSubmission = async (albumId: string) => {
    const confirmed = window.confirm(
      'Isso permitirá que o cliente faça novas seleções. As seleções atuais serão mantidas. Continuar?'
    );
    
    if (!confirmed) return;
    
    const { error } = await supabase
      .from('albums')
      .update({ client_submitted_at: null })
      .eq('id', albumId);
    
    if (error) {
      toast({ title: 'Erro ao resetar', variant: 'destructive' });
    } else {
      toast({ title: 'Álbum reaberto para seleção!' });
      fetchAlbums();
    }
  };

  const copyLink = async (albumId: string) => {
    const url = photographerSlug
      ? `${window.location.origin}/p/${photographerSlug}/${albumId}`
      : `${window.location.origin}/cliente/${albumId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(albumId);
    toast({ title: 'Link copiado!' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getClientEnabledAlbums = () => albums.filter(a => a.client_enabled);
  const getSubmittedCount = () => albums.filter(a => a.client_submitted_at).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#C65D3B]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sm bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[#FAF0EC]">
              <Users className="h-6 w-6 text-[#C65D3B]" />
            </div>
            <div>
              <p className="text-2xl font-light text-slate-800">
                {getClientEnabledAlbums().length}
              </p>
              <p className="text-sm text-slate-500">Álbuns compartilhados</p>
            </div>
          </div>
        </div>
        <div className="rounded-sm bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-emerald-50">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-light text-slate-800">{getSubmittedCount()}</p>
              <p className="text-sm text-slate-500">Seleções recebidas</p>
            </div>
          </div>
        </div>
        <div className="rounded-sm bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[#FAF0EC]">
              <Image className="h-6 w-6 text-[#C65D3B]" />
            </div>
            <div>
              <p className="text-2xl font-light text-slate-800">{albums.length}</p>
              <p className="text-sm text-slate-500">Total de álbuns</p>
            </div>
          </div>
        </div>
      </div>

      {/* Albums List */}
      <div className="rounded-sm bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <h2 className="font-serif text-xl text-slate-800">Álbuns para Clientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure o acesso e veja as seleções dos seus clientes
          </p>
        </div>
        
        <div className="divide-y divide-slate-100">
          {albums.length === 0 ? (
            <div className="p-12 text-center">
              <Image className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              <p className="text-slate-500">Nenhum álbum criado ainda.</p>
              <p className="mt-1 text-sm text-slate-400">
                Crie álbuns na seção Portfólio para compartilhar com clientes.
              </p>
            </div>
          ) : (
            albums.map((album) => (
              <div
                key={album.id}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50"
              >
                {/* Cover */}
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-sm bg-slate-100">
                  {album.cover_image_url ? (
                    <img
                      src={album.cover_image_url}
                      alt={album.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Image className="h-6 w-6 text-slate-300" />
                    </div>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-slate-800 truncate">{album.title}</h3>
                    {album.client_enabled && (
                      <Badge className="bg-[#FAF0EC] text-[#C65D3B] border-0">
                        Ativo
                      </Badge>
                    )}
                    {contracts[album.id] && !contracts[album.id].signed_at && (
                      <Badge className="bg-amber-100 text-amber-700 border-0">
                        Contrato pendente
                      </Badge>
                    )}
                    {contracts[album.id]?.signed_at && (
                      <Badge className="bg-[#FAF0EC] text-[#C65D3B] border-0">
                        Contrato assinado
                      </Badge>
                    )}
                    {album.client_submitted_at && (
                      <Badge className="bg-[#FAF0EC] text-[#C65D3B] border-0">
                        Seleção enviada
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500 capitalize">{album.category}</p>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                  {album.client_enabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(album.id)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      {copiedId === album.id ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  
                  {album.client_submitted_at && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openSelectionsDialog(album)}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Ver Seleção
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetSubmission(album.id)}
                        className="text-slate-500 hover:text-[#C65D3B]"
                        title="Reabrir para novas seleções"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfigDialog(album)}
                    className="border-slate-200"
                  >
                    <Lock className="mr-1 h-4 w-4" />
                    Configurar
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Config Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              Configurar Acesso do Cliente
            </DialogTitle>
          </DialogHeader>
          
          {selectedAlbum && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 rounded-sm bg-slate-50 p-4">
                <div className="h-12 w-12 overflow-hidden rounded-sm bg-slate-200">
                  {selectedAlbum.cover_image_url && (
                    <img
                      src={selectedAlbum.cover_image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{selectedAlbum.title}</p>
                  <p className="text-sm text-slate-500 capitalize">{selectedAlbum.category}</p>
                </div>
              </div>
              
              {/* Enable Switch */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-slate-700">Habilitar acesso do cliente</Label>
                  <p className="text-sm text-slate-500">
                    Permite compartilhar via link + PIN
                  </p>
                </div>
                <Switch
                  checked={formData.client_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, client_enabled: checked })}
                />
              </div>
              
              {formData.client_enabled && (
                <>
                  {/* PIN */}
                  <div className="space-y-2">
                    <Label className="text-slate-700">PIN de Acesso *</Label>
                    <Input
                      value={formData.client_pin}
                      onChange={(e) => setFormData({ ...formData, client_pin: e.target.value })}
                      placeholder="Ex: 1234 ou abc123"
                      className="rounded-sm border-slate-200"
                    />
                    <p className="text-xs text-slate-500">
                      O cliente precisará deste PIN para acessar o álbum
                    </p>
                  </div>
                  
                  {/* Selection Limit */}
                  <div className="space-y-2">
                    <Label className="text-slate-700">Limite de seleção (opcional)</Label>
                    <Input
                      type="number"
                      value={formData.selection_limit}
                      onChange={(e) => setFormData({ ...formData, selection_limit: e.target.value })}
                      placeholder="Ex: 30"
                      className="rounded-sm border-slate-200"
                      min={1}
                    />
                    <p className="text-xs text-slate-500">
                      Deixe vazio para seleção ilimitada
                    </p>
                  </div>
                  
                  {/* Contrato */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-700">Contrato Digital (opcional)</Label>
                      {contracts[selectedAlbum.id]?.signed_at && (
                        <Badge className="bg-[#FAF0EC] text-[#C65D3B] border-0 text-xs">
                          Assinado por {contracts[selectedAlbum.id].client_name}
                        </Badge>
                      )}
                    </div>
                    <textarea
                      value={formData.contract_template}
                      onChange={(e) => setFormData({ ...formData, contract_template: e.target.value })}
                      placeholder={`Ex:\nCONTRATO DE PRESTAÇÃO DE SERVIÇOS FOTOGRÁFICOS\n\nO presente contrato é firmado entre {{nome_cliente}} e o fotógrafo para o álbum {{titulo_album}}.\n\n...\n\nVariáveis disponíveis: {{titulo_album}}, {{categoria}}`}
                      rows={6}
                      className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                      disabled={!!contracts[selectedAlbum.id]?.signed_at}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveContract}
                        disabled={savingContract || !!contracts[selectedAlbum.id]?.signed_at}
                        className="border-slate-200 text-slate-600"
                      >
                        {savingContract ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        <span className="ml-1">{contracts[selectedAlbum.id] ? 'Atualizar Contrato' : 'Salvar Contrato'}</span>
                      </Button>
                      {contracts[selectedAlbum.id] && photographerSlug && (
                        <a
                          href={`${window.location.origin}/p/${photographerSlug}/${selectedAlbum.id}/contrato`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#C65D3B] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver link do contrato
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      O cliente precisará assinar antes de acessar a galeria de fotos.
                    </p>
                  </div>

                  {/* Share Link */}
                  <div className="rounded-sm bg-[#FAF0EC] p-4">
                    <p className="mb-2 text-sm font-medium text-[#a34a2e]">Link para compartilhar:</p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={
                          photographerSlug
                            ? `${window.location.origin}/p/${photographerSlug}/${selectedAlbum.id}`
                            : `${window.location.origin}/cliente/${selectedAlbum.id}`
                        }
                        readOnly
                        className="flex-1 rounded-sm border-[#e8c4b8] bg-white text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyLink(selectedAlbum.id)}
                        className="border-[#e8c4b8] text-[#C65D3B] hover:bg-[#FAF0EC]"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
              
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsConfigDialogOpen(false)}
                  className="flex-1 rounded-sm border-slate-200"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  className="flex-1 rounded-sm bg-[#C65D3B] text-white hover:bg-[#a34a2e]"
                >
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Selections Dialog */}
      <Dialog open={isSelectionsDialogOpen} onOpenChange={setIsSelectionsDialogOpen}>
        <DialogContent className="max-w-4xl rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              Fotos Selecionadas pelo Cliente
            </DialogTitle>
          </DialogHeader>
          
          {selectedAlbum && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-sm bg-slate-50 p-4">
                <div>
                  <p className="font-medium text-slate-800">{selectedAlbum.title}</p>
                  <p className="text-sm text-slate-500">
                    {selections.length} foto(s) selecionada(s)
                  </p>
                </div>
                {selectedAlbum.client_submitted_at && (
                  <Badge className="bg-[#FAF0EC] text-[#C65D3B] border-0">
                    Enviado em {new Date(selectedAlbum.client_submitted_at).toLocaleDateString('pt-BR')}
                  </Badge>
                )}
              </div>
              
              {selectionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#C65D3B]" />
                </div>
              ) : selections.length === 0 ? (
                <div className="py-12 text-center">
                  <Image className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                  <p className="text-slate-500">Nenhuma foto selecionada ainda.</p>
                </div>
              ) : (
                <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                  {selections.map((selection) => (
                    <div
                      key={selection.id}
                      className="group relative aspect-square overflow-hidden rounded-sm"
                    >
                      <img
                        src={selection.image_url}
                        alt={selection.title || ''}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClientAlbums;
