import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, Save, Monitor, Smartphone, ImageIcon, Instagram, Phone, Replace, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AboutData {
  id: string;
  image_url: string;
  displayName: string;
  jobTitle: string;
  biography: string;
  quote: string;
  instagramUrl: string;
  whatsappNumber: string;
}

const defaultData: Omit<AboutData, 'id' | 'image_url'> = {
  displayName: 'Iasmin Santos',
  jobTitle: 'Fotógrafa de Casamentos',
  biography: 'Há mais de 8 anos, dedico minha vida a eternizar momentos únicos. Acredito que cada história merece ser contada com sensibilidade, autenticidade e muito carinho.\n\nMinha abordagem fotográfica busca capturar a essência de cada pessoa, cada sorriso espontâneo, cada lágrima de emoção. Trabalho com luz natural sempre que possível, criando imagens atemporais que transcendem tendências.\n\nPara mim, fotografar não é apenas um trabalho — é uma forma de celebrar a vida, o amor e as conexões humanas.',
  quote: 'Cada foto conta uma história de amor',
  instagramUrl: '',
  whatsappNumber: '',
};

const AdminAbout = () => {
  const photographerId = usePhotographerId();
  const [aboutData, setAboutData] = useState<AboutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDesktopPreview, setIsDesktopPreview] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  // Form fields for real-time preview
  const [displayName, setDisplayName] = useState(defaultData.displayName);
  const [jobTitle, setJobTitle] = useState(defaultData.jobTitle);
  const [biography, setBiography] = useState(defaultData.biography);
  const [quote, setQuote] = useState(defaultData.quote);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAboutData();
  }, []);

  const fetchAboutData = async () => {
    const { data, error } = await supabase
      .from('site_images')
      .select('*')
      .eq('section', 'about')
      .maybeSingle();

    if (error) {
      console.error('Error fetching about:', error);
    } else if (data) {
      // Parse content from description field
      let content = { ...defaultData };
      try {
        if (data.description) {
          const parsed = JSON.parse(data.description);
          content = { ...content, ...parsed };
        }
      } catch (e) {
        console.log('No parsed content, using defaults');
      }

      setAboutData({
        id: data.id,
        image_url: data.image_url,
        ...content,
      });
      setDisplayName(content.displayName);
      setJobTitle(content.jobTitle);
      setBiography(content.biography);
      setQuote(content.quote);
      setInstagramUrl(content.instagramUrl || '');
      setWhatsappNumber(content.whatsappNumber || '');
      setPreviewImageUrl(data.image_url);
    }
    setLoading(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  }, []);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setPreviewImageUrl(URL.createObjectURL(file));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `about/${Date.now()}.${fileExt}`;

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
    setSaving(true);

    try {
      let imageUrl = aboutData?.image_url || '';

      // Upload new image if selected
      if (selectedFile) {
        setUploading(true);
        const uploadedUrl = await uploadImage(selectedFile);
        if (!uploadedUrl) {
          toast({ title: 'Erro ao fazer upload da imagem', variant: 'destructive' });
          setSaving(false);
          setUploading(false);
          return;
        }
        imageUrl = uploadedUrl;
        setUploading(false);
      }

      // Prepare content JSON
      const contentData = {
        displayName,
        jobTitle,
        biography,
        quote,
        instagramUrl,
        whatsappNumber,
      };

      if (aboutData?.id) {
        // Update existing
        const { error } = await supabase
          .from('site_images')
          .update({
            image_url: imageUrl,
            description: JSON.stringify(contentData),
          })
          .eq('id', aboutData.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('site_images')
          .insert({
            section: 'about',
            image_url: imageUrl,
            title: 'About Image',
            description: JSON.stringify(contentData),
            photographer_id: photographerId,
          });

        if (error) throw error;
      }

      toast({ title: 'Seção "Sobre Mim" atualizada com sucesso!' });
      setSelectedFile(null);
      fetchAboutData();
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Erro ao salvar alterações', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setPreviewImageUrl(aboutData?.image_url || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#C65D3B]" />
      </div>
    );
  }

  const displayImageUrl = previewImageUrl || aboutData?.image_url;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl text-foreground">Seção "Sobre Mim"</h2>
        <p className="text-sm text-muted-foreground">
          Edite sua foto, biografia e informações de contato
        </p>
      </div>

      {/* Desktop/Mobile Toggle */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card p-1">
          <button
            onClick={() => setIsDesktopPreview(true)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              isDesktopPreview
                ? 'bg-[#C65D3B] text-soft-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Monitor className="h-4 w-4" />
            Desktop
          </button>
          <button
            onClick={() => setIsDesktopPreview(false)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              !isDesktopPreview
                ? 'bg-[#C65D3B] text-soft-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            Mobile
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left Column - Live Preview (3/5 width) */}
        <div className="lg:col-span-3">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Prévia ao Vivo</Label>
            <div
              className={`overflow-hidden rounded-lg border border-border/50 bg-secondary transition-all duration-300 ${
                isDesktopPreview ? 'w-full' : 'mx-auto max-w-[375px]'
              }`}
            >
              {/* Preview Content */}
              <div className={`p-6 ${isDesktopPreview ? '' : 'p-4'}`}>
                <div
                  className={`grid items-center gap-6 ${
                    isDesktopPreview ? 'lg:grid-cols-2 lg:gap-8' : 'grid-cols-1'
                  }`}
                >
                  {/* Image Preview */}
                  <div className="relative">
                    <div className="relative overflow-hidden">
                      {displayImageUrl ? (
                        <img
                          src={displayImageUrl}
                          alt="Preview"
                          className={`w-full object-cover shadow-medium ${
                            isDesktopPreview ? 'aspect-[3/4]' : 'aspect-square'
                          }`}
                        />
                      ) : (
                        <div
                          className={`flex w-full items-center justify-center bg-muted ${
                            isDesktopPreview ? 'aspect-[3/4]' : 'aspect-square'
                          }`}
                        >
                          <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Decorative Frame */}
                      <div className="absolute -bottom-2 -right-2 -z-10 h-full w-full border-2 border-gold/30" />
                    </div>
                  </div>

                  {/* Text Preview */}
                  <div className={isDesktopPreview ? 'lg:pl-2' : 'text-center'}>
                    <p className="mb-2 font-sans text-xs uppercase tracking-[0.2em] text-[#C65D3B]">
                      Conheça
                    </p>
                    <h3 className={`font-serif font-normal text-foreground ${
                      isDesktopPreview ? 'text-2xl' : 'text-xl'
                    }`}>
                      {displayName || 'Seu Nome'}
                    </h3>
                    {jobTitle && (
                      <p className="mt-1 font-sans text-sm text-muted-foreground">
                        {jobTitle}
                      </p>
                    )}
                    <div className={`mt-3 h-[1px] w-12 bg-[#C65D3B]/50 ${!isDesktopPreview ? 'mx-auto' : ''}`} />

                    <div className={`mt-4 space-y-3 font-sans text-sm font-light leading-relaxed text-muted-foreground ${
                      isDesktopPreview ? '' : 'text-left'
                    }`}>
                      {biography.split('\n\n').map((paragraph, i) => (
                        <p key={i} className="line-clamp-3">{paragraph || 'Sua biografia aqui...'}</p>
                      ))}
                    </div>

                    {/* Quote */}
                    {quote && (
                      <div className="mt-6">
                        <p className={`font-serif italic text-foreground ${
                          isDesktopPreview ? 'text-base' : 'text-sm'
                        }`}>
                          "{quote}"
                        </p>
                        <div className={`mt-3 flex items-center gap-3 ${!isDesktopPreview ? 'justify-center' : ''}`}>
                          <div className="h-[1px] w-6 bg-[#C65D3B]" />
                          <span className="font-sans text-xs tracking-wide text-muted-foreground">
                            {displayName}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Social Links Preview */}
                    {(instagramUrl || whatsappNumber) && (
                      <div className={`mt-4 flex items-center gap-3 ${!isDesktopPreview ? 'justify-center' : ''}`}>
                        {instagramUrl && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C65D3B]/10">
                            <Instagram className="h-4 w-4 text-[#C65D3B]" />
                          </div>
                        )}
                        {whatsappNumber && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C65D3B]/10">
                            <Phone className="h-4 w-4 text-[#C65D3B]" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Editor (2/5 width) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Photo Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Foto de Perfil</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="rounded-lg border border-gold/30 bg-[#C65D3B]/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C65D3B]/10">
                      <ImageIcon className="h-5 w-5 text-[#C65D3B]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[#C65D3B] hover:text-[#C65D3B]"
                    >
                      <Replace className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelectedFile}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-all ${
                  isDragging
                    ? 'border-gold bg-[#C65D3B]/5'
                    : 'border-border/50 hover:border-gold/50 hover:bg-[#C65D3B]/5'
                }`}
              >
                <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Arraste sua foto ou clique para selecionar
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Recomendado: formato retrato 3:4
                </p>
              </div>
            )}
          </div>

          {/* Personal Info */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Informações Pessoais</Label>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-xs text-muted-foreground">
                  Nome de Exibição
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                  className="bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jobTitle" className="text-xs text-muted-foreground">
                  Título Profissional
                </Label>
                <Input
                  id="jobTitle"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ex: Fotógrafa de Casamentos"
                  className="bg-card"
                />
              </div>
            </div>
          </div>

          {/* Biography */}
          <div className="space-y-3">
            <Label htmlFor="biography" className="text-sm font-medium">
              Biografia
            </Label>
            <Textarea
              id="biography"
              value={biography}
              onChange={(e) => setBiography(e.target.value)}
              placeholder="Conte sua história..."
              rows={6}
              className="resize-none bg-card"
            />
            <p className="text-xs text-muted-foreground">
              Use linhas em branco para separar parágrafos
            </p>
          </div>

          {/* Quote */}
          <div className="space-y-3">
            <Label htmlFor="quote" className="text-sm font-medium">
              Frase/Citação
            </Label>
            <Input
              id="quote"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="Uma frase que te representa"
              className="bg-card"
            />
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Redes Sociais</Label>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="instagram" className="text-xs text-muted-foreground">
                  Instagram
                </Label>
                <div className="relative">
                  <Instagram className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="instagram"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://instagram.com/seu_perfil"
                    className="bg-card pl-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp" className="text-xs text-muted-foreground">
                  WhatsApp
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="whatsapp"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    className="bg-card pl-10"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#C65D3B] text-soft-black hover:bg-[#C65D3B]-dark"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading ? 'Enviando imagem...' : 'Salvando...'}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminAbout;
