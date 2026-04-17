import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Save, Monitor, Smartphone, ImageIcon, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import heroImageFallback from '@/assets/herocasamento.jpg';

interface HeroContent {
  id: string;
  image_url: string;
  section: string;
  title?: string;
}

const AdminHero = () => {
  const photographerId = usePhotographerId();
  // --- ESTADOS ---
  const [desktopData, setDesktopData] = useState<HeroContent | null>(null);
  const [mobileData, setMobileData] = useState<HeroContent | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // Arquivos
  const [selectedDesktopFile, setSelectedDesktopFile] = useState<File | null>(null);
  const [selectedMobileFile, setSelectedMobileFile] = useState<File | null>(null);
  
  // Prévias
  const [previewDesktopUrl, setPreviewDesktopUrl] = useState<string | null>(null);
  const [previewMobileUrl, setPreviewMobileUrl] = useState<string | null>(null);

  // Controla a aba ativa (Visual e Edição)
  const [isMobilePreview, setIsMobilePreview] = useState(false);
  
  // Conteúdos
  const [mainTitle, setMainTitle] = useState('Iasmin Santos');
  const [subtitle, setSubtitle] = useState('Eternizando momentos únicos com sensibilidade');
  const [buttonText, setButtonText] = useState('Solicitar Orçamento');
  const [focalPoint, setFocalPoint] = useState({ x: 50, y: 50 });
  
  const previewImageRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHeroData();
  }, []);

  const fetchHeroData = async () => {
    const { data, error } = await supabase
      .from('site_images')
      .select('*')
      .in('section', ['hero', 'hero_mobile']);

    if (error) {
      console.error('Error fetching hero:', error);
    } else if (data) {
      const desktop = data.find(item => item.section === 'hero');
      const mobile = data.find(item => item.section === 'hero_mobile');

      if (desktop) {
        setDesktopData(desktop);
        if (desktop.title) {
          try {
            const parsed = JSON.parse(desktop.title);
            if (parsed.mainTitle) setMainTitle(parsed.mainTitle);
            if (parsed.subtitle) setSubtitle(parsed.subtitle);
            if (parsed.buttonText) setButtonText(parsed.buttonText);
            if (parsed.focalPoint) setFocalPoint(parsed.focalPoint);
          } catch { /* ignorar */ }
        }
      }
      if (mobile) {
        setMobileData(mobile);
      }
    }
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'desktop' | 'mobile') => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'desktop') {
        setSelectedDesktopFile(file);
        setPreviewDesktopUrl(URL.createObjectURL(file));
        // Mantém na aba desktop
      } else {
        setSelectedMobileFile(file);
        setPreviewMobileUrl(URL.createObjectURL(file));
        // Mantém na aba mobile
      }
    }
  };

  const uploadImageToBucket = async (file: File, prefix: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `hero/${prefix}_${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('site-images')
      .upload(fileName, file);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('site-images')
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const handleSave = async () => {
    setUploading(true);

    try {
      // 1. Desktop
      let desktopUrl = desktopData?.image_url;
      if (selectedDesktopFile) {
        const url = await uploadImageToBucket(selectedDesktopFile, 'desktop');
        if (url) desktopUrl = url;
      }

      const contentData = JSON.stringify({
        mainTitle,
        subtitle,
        buttonText,
        focalPoint,
      });

      const { error: errDesktop } = await supabase
        .from('site_images')
        .upsert({
          id: desktopData?.id,
          section: 'hero',
          image_url: desktopUrl || '',
          title: contentData,
          photographer_id: photographerId,
        });

      if (errDesktop) throw errDesktop;

      // 2. Mobile
      let mobileUrl = mobileData?.image_url;
      if (selectedMobileFile) {
        const url = await uploadImageToBucket(selectedMobileFile, 'mobile');
        if (url) mobileUrl = url;
      }

      if (mobileUrl || selectedMobileFile) {
        const { error: errMobile } = await supabase
          .from('site_images')
          .upsert({
            id: mobileData?.id,
            section: 'hero_mobile',
            image_url: mobileUrl || desktopUrl || '',
            title: null,
            photographer_id: photographerId,
          });
          
        if (errMobile) throw errMobile;
      }

      toast({ title: 'Alterações salvas com sucesso!' });
      
      setSelectedDesktopFile(null);
      setPreviewDesktopUrl(null);
      setSelectedMobileFile(null);
      setPreviewMobileUrl(null);
      fetchHeroData();

    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const getCurrentDisplayUrl = () => {
    if (isMobilePreview) {
      return previewMobileUrl || mobileData?.image_url || previewDesktopUrl || desktopData?.image_url || heroImageFallback;
    }
    return previewDesktopUrl || desktopData?.image_url || heroImageFallback;
  };

  const displayUrl = getCurrentDisplayUrl();

  const handleFocalPointClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobilePreview || !previewImageRef.current) return;
    const rect = previewImageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setFocalPoint({ x: Math.round(x), y: Math.round(y) });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Componente de Caixa de Upload Reutilizável
  const UploadBox = ({ 
    type, 
    label, 
    currentImage, 
    previewFile, 
    inputRef 
  }: { 
    type: 'desktop' | 'mobile', 
    label: string, 
    currentImage: string | undefined, 
    previewFile: File | null,
    inputRef: React.RefObject<HTMLInputElement>
  }) => {
    const hasImage = !!(currentImage || previewFile);
    const displayImage = previewFile ? URL.createObjectURL(previewFile) : currentImage;
    const fileName = previewFile ? previewFile.name : (currentImage ? 'Imagem Salva' : '');

    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{label}</Label>
            {hasImage && <span className="text-xs text-[#C65D3B] flex items-center gap-1"><Check className="h-3 w-3" /> Imagem ativa</span>}
        </div>
        
        <div
          onClick={() => inputRef.current?.click()}
          className={`
            group relative cursor-pointer rounded-xl border-2 border-dashed transition-all hover:bg-muted/30
            ${hasImage ? 'border-border/50' : 'border-muted-foreground/25 hover:border-gold/50'}
            p-6
          `}
        >
          {hasImage ? (
            <div className="flex flex-col items-center gap-3">
              <div className={`relative overflow-hidden rounded-md border border-border shadow-sm ${type === 'mobile' ? 'h-40 w-24' : 'h-32 w-full max-w-[200px]'}`}>
                <img src={displayImage} alt="Preview" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                   <Upload className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{fileName}</p>
                <p className="text-[10px] text-muted-foreground">Clique para trocar</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted group-hover:bg-background shadow-sm transition-colors">
                {type === 'mobile' ? <Smartphone className="h-6 w-6 text-muted-foreground" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Clique para selecionar</p>
                
                {/* --- ALTERAÇÃO AQUI: Texto com as proporções explícitas --- */}
                <p className="text-xs text-muted-foreground mt-1">
                  {type === 'desktop' 
                    ? 'Recomendado: 16:9 (Ex: 1920x1080)' 
                    : 'Recomendado: 9:16 (Ex: 1080x1920)'
                  }
                </p>
              </div>
            </div>
          )}
        </div>
        
        <input 
          ref={inputRef} 
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={(e) => handleFileChange(e, type)} 
        />
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl text-foreground">Editor do Hero</h2>
        <p className="text-sm text-muted-foreground">
          Alterne entre Desktop e Mobile para editar a imagem específica de cada versão.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        
        {/* --- COLUNA ESQUERDA: VISUALIZAÇÃO --- */}
        <div className="space-y-4 lg:col-span-3">
          
          {/* Controles de Aba */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              Modo de Edição: {isMobilePreview ? 'Celular' : 'Computador'}
            </Label>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-1">
              <button
                onClick={() => setIsMobilePreview(false)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    !isMobilePreview 
                    ? 'bg-white text-black shadow-sm ring-1 ring-black/5' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" /> Desktop
              </button>
              <button
                onClick={() => setIsMobilePreview(true)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    isMobilePreview 
                    ? 'bg-white text-black shadow-sm ring-1 ring-black/5' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" /> Mobile
              </button>
            </div>
          </div>

          {/* Área da Imagem de Prévia */}
          <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/20 p-4 min-h-[400px] flex items-center justify-center">
            <div
              className={`relative mx-auto overflow-hidden rounded-lg shadow-2xl transition-all duration-500 bg-black ${isMobilePreview ? 'max-w-[280px]' : 'w-full'}`}
              style={{ aspectRatio: isMobilePreview ? '9/16' : '16/9' }}
            >
              <div
                ref={previewImageRef}
                className={`relative h-full w-full ${!isMobilePreview ? 'cursor-crosshair' : ''}`}
                onClick={handleFocalPointClick}
              >
                <img
                  src={displayUrl}
                  alt="Preview"
                  className="h-full w-full object-cover transition-all"
                  style={{ objectPosition: isMobilePreview ? 'center top' : `${focalPoint.x}% ${focalPoint.y}%` }}
                />
                
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60" />

                <div className="absolute inset-0 flex flex-col items-start justify-end p-6 text-left md:p-12 pb-12 md:pb-16">
                  <h1 className={`font-serif font-light leading-tight text-white ${isMobilePreview ? 'text-2xl' : 'text-3xl lg:text-5xl'}`}>
                    {mainTitle}
                  </h1>
                  <p className={`mt-2 font-sans text-white/90 font-light ${isMobilePreview ? 'text-xs' : 'text-sm'}`}>
                    {subtitle}
                  </p>
                  <div className={`mt-4 inline-block rounded-sm border border-white/40 bg-white/10 px-4 py-2 font-sans text-white uppercase tracking-widest backdrop-blur-sm ${isMobilePreview ? 'text-[10px]' : 'text-xs'}`}>
                    {buttonText}
                  </div>
                </div>

                {!isMobilePreview && (
                  <div
                    className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/30 opacity-0 transition-opacity hover:opacity-100"
                    style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                  >
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            </div>
          </div>
          {!isMobilePreview && (
              <p className="text-center text-xs text-muted-foreground mt-2">Clique na imagem para ajustar o ponto focal (apenas Desktop)</p>
          )}
        </div>

        {/* --- COLUNA DIREITA: EDIÇÃO --- */}
        <div className="space-y-6 lg:col-span-2 flex flex-col h-full">
          
          {/* LÓGICA CONDICIONAL: Mostra apenas o upload correspondente à aba ativa */}
          <div className="bg-card rounded-xl border border-border/50 p-4 shadow-sm flex-1">
              {!isMobilePreview ? (
                /* MODO DESKTOP */
                <UploadBox 
                    type="desktop" 
                    label="Banner Desktop (Horizontal)" 
                    currentImage={desktopData?.image_url} 
                    previewFile={selectedDesktopFile}
                    inputRef={desktopInputRef}
                />
              ) : (
                /* MODO MOBILE */
                <UploadBox 
                    type="mobile" 
                    label="Banner Mobile (Vertical)" 
                    currentImage={mobileData?.image_url} 
                    previewFile={selectedMobileFile}
                    inputRef={mobileInputRef}
                />
              )}
          </div>

          {/* Textos (Comuns para ambos) */}
          <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
            <h3 className="text-sm font-medium text-foreground">Textos (Visível em ambos)</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Título Principal</Label>
                <Input value={mainTitle} onChange={(e) => setMainTitle(e.target.value)} className="h-8 text-sm mt-1 bg-background" />
              </div>
              <div>
                <Label className="text-xs">Subtítulo</Label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="h-8 text-sm mt-1 bg-background" />
              </div>
              <div>
                <Label className="text-xs">Botão</Label>
                <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} className="h-8 text-sm mt-1 bg-background" />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={uploading} className="w-full bg-[#C65D3B] text-white hover:bg-[#a34a2e] mt-auto">
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="mr-2 h-4 w-4" /> Salvar Alterações</>}
          </Button>

        </div>
      </div>
    </div>
  );
};

export default AdminHero;