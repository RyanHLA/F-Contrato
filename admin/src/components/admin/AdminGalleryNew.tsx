import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { r2Storage } from '@/lib/r2';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { CategoryCard, AlbumCard, GalleryImage, Album } from './gallery/GalleryCards';
import AlbumDialog from './gallery/AlbumDialog';
import PhotosPanel from './gallery/PhotosPanel';

type NavigationLevel = 'categories' | 'albums' | 'photos';

interface UploadingFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  preview: string;
}

const CATEGORIES = [
  { id: 'casamentos', label: 'Casamentos' },
  { id: 'gestantes', label: 'Gestantes' },
  { id: '15-anos', label: '15 Anos' },
  { id: 'pre-wedding', label: 'Pré-Wedding' },
  { id: 'externo', label: 'Externo' },
  { id: 'eventos', label: 'Eventos' },
];

const AdminGalleryNew = () => {
  const photographerId = usePhotographerId();
  const [currentLevel, setCurrentLevel] = useState<NavigationLevel>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [isAlbumDialogOpen, setIsAlbumDialogOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [albumFormData, setAlbumFormData] = useState({
    title: '', event_date: '', status: 'draft' as 'draft' | 'published',
  });
  const { toast } = useToast();

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.innerHTML = `* { font-family: 'Montserrat', sans-serif !important; }`;
    document.head.appendChild(style);
  }, []);

  useEffect(() => { if (photographerId) fetchAlbums(); }, [photographerId]);
  useEffect(() => { if (selectedAlbum) fetchPhotos(selectedAlbum.id); }, [selectedAlbum]);

  useEffect(() => {
    if (!photographerId) return;
    const fetchAllPhotoCounts = async () => {
      const { data } = await supabase
        .from('site_images')
        .select('album_id')
        .eq('photographer_id', photographerId);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((img) => { if (img.album_id) counts[img.album_id] = (counts[img.album_id] || 0) + 1; });
        setPhotoCounts(counts);
      }
    };
    fetchAllPhotoCounts();
  }, [albums, images, photographerId]);

  const fetchAlbums = async () => {
    if (!photographerId) return;
    const { data, error } = await supabase
      .from('albums')
      .select('*')
      .eq('photographer_id', photographerId)
      .order('created_at', { ascending: false });
    if (!error) setAlbums((data || []) as Album[]);
    setLoading(false);
  };

  const fetchPhotos = async (albumId: string) => {
    const { data, error } = await supabase
      .from('site_images')
      .select('*')
      .eq('album_id', albumId)
      .order('display_order');
    if (!error) setImages((data || []) as GalleryImage[]);
  };

  const getAlbumCount = (categoryId: string) => albums.filter(a => a.category === categoryId).length;
  const getCategoryCover = (categoryId: string) =>
    albums.filter(a => a.category === categoryId).find(a => a.cover_image_url)?.cover_image_url || null;

  const navigateBack = () => {
    if (currentLevel === 'photos') { setSelectedAlbum(null); setCurrentLevel('albums'); setImages([]); }
    else if (currentLevel === 'albums') { setSelectedCategory(null); setCurrentLevel('categories'); }
  };

  const openAlbumDialog = (album?: Album) => {
    if (album) {
      setEditingAlbum(album);
      setAlbumFormData({ title: album.title, event_date: album.event_date || '', status: album.status });
    } else {
      setEditingAlbum(null);
      setAlbumFormData({ title: '', event_date: '', status: 'draft' });
    }
    setIsAlbumDialogOpen(true);
  };

  const handleSaveAlbum = async () => {
    if (editingAlbum) {
      const { error } = await supabase.from('albums').update({
        title: albumFormData.title,
        event_date: albumFormData.event_date || null,
        status: albumFormData.status,
      }).eq('id', editingAlbum.id);
      if (!error) {
        await supabase.rpc('log_audit', { p_action: 'update_album', p_entity_type: 'album', p_entity_id: editingAlbum.id, p_metadata: { title: albumFormData.title } });
        toast({ title: 'Álbum atualizado!' });
      }
    } else {
      if (!selectedCategory || !albumFormData.title.trim()) return;
      const { data, error } = await supabase.from('albums').insert({
        category: selectedCategory,
        title: albumFormData.title,
        event_date: albumFormData.event_date || null,
        status: albumFormData.status,
        photographer_id: photographerId,
      }).select('id').single();
      if (!error) {
        await supabase.rpc('log_audit', { p_action: 'create_album', p_entity_type: 'album', p_entity_id: data?.id, p_metadata: { title: albumFormData.title, category: selectedCategory } });
        toast({ title: 'Álbum criado!' });
      }
    }
    setIsAlbumDialogOpen(false);
    setEditingAlbum(null);
    fetchAlbums();
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!confirm('Tem certeza? Todas as fotos do álbum serão excluídas.')) return;
    const { error } = await supabase.from('albums').delete().eq('id', albumId);
    if (!error) {
      await supabase.rpc('log_audit', { p_action: 'delete_album', p_entity_type: 'album', p_entity_id: albumId });
      toast({ title: 'Álbum excluído!' });
      fetchAlbums();
    }
  };

  const uploadImage = async (originalFile: File, onProgress: (p: number) => void): Promise<{ url: string; key: string; size: number } | null> => {
    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/webp' };
    try {
      const compressed = await imageCompression(originalFile, options);
      const result = await r2Storage.upload(compressed, 'gallery');
      if (result) { onProgress(100); return { url: result.publicUrl, key: result.key, size: compressed.size }; }
      return null;
    } catch { return null; }
  };

  const handleFilesSelected = useCallback(async (files: FileList | File[]) => {
    if (!selectedAlbum) return;
    const fileArray = Array.from(files);
    const newUploads: UploadingFile[] = fileArray.map((file) => ({
      file, progress: 0, status: 'pending' as const, preview: URL.createObjectURL(file),
    }));
    setUploadingFiles((prev) => [...prev, ...newUploads]);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadingFiles((prev) => prev.map((u) => u.file === file ? { ...u, status: 'uploading' as const } : u));
      const result = await uploadImage(file, (progress) => {
        setUploadingFiles((prev) => prev.map((u) => u.file === file ? { ...u, progress } : u));
      });
      if (result) {
        const { data: imgData } = await supabase.from('site_images').insert({
          section: 'gallery', category: selectedAlbum.category, album_id: selectedAlbum.id,
          title: file.name.replace(/\.[^/.]+$/, ''), description: '',
          image_url: result.url, r2_key: result.key,
          display_order: images.length + i, size_bytes: result.size,
          photographer_id: photographerId,
          file_size_bytes: result.size,
        }).select('id').single();
        await supabase.rpc('log_audit', { p_action: 'upload_image', p_entity_type: 'site_image', p_entity_id: imgData?.id, p_metadata: { file_name: file.name, album_id: selectedAlbum.id, size_bytes: result.size } });
        setUploadingFiles((prev) => prev.map((u) => u.file === file ? { ...u, status: 'complete' as const, progress: 100 } : u));
      }
    }
    setTimeout(() => { setUploadingFiles([]); fetchPhotos(selectedAlbum.id); }, 1500);
  }, [selectedAlbum, images.length]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);
      const newImages = arrayMove(images, oldIndex, newIndex);
      setImages(newImages);
      for (let i = 0; i < newImages.length; i++) {
        await supabase.from('site_images').update({ display_order: i }).eq('id', newImages[i].id);
      }
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if (!confirm('Excluir esta foto?')) return;
    const { data: photoData } = await supabase.from('site_images').select('r2_key, image_url').eq('id', id).single();
    // Usa r2_key se disponível (novo padrão); fallback para image_url (registros legados)
    const deleteTarget = photoData?.r2_key || photoData?.image_url;
    if (deleteTarget) await r2Storage.delete(deleteTarget);
    await supabase.from('site_images').delete().eq('id', id);
    await supabase.rpc('log_audit', { p_action: 'delete_image', p_entity_type: 'site_image', p_entity_id: id, p_metadata: { album_id: selectedAlbum?.id } });
    if (selectedAlbum) fetchPhotos(selectedAlbum.id);
  };

  const handleSetCover = async (image: GalleryImage) => {
    if (!selectedAlbum) return;
    await supabase.from('albums').update({ cover_image_url: image.image_url }).eq('id', selectedAlbum.id);
    toast({ title: 'Capa atualizada!' });
    fetchAlbums();
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#C65D3B]" /></div>;

  const currentCategoryLabel = selectedCategory ? CATEGORIES.find(c => c.id === selectedCategory)?.label : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {currentLevel === 'categories' ? (
            <h1 className="text-3xl font-black tracking-tighter uppercase text-black">Ensaios</h1>
          ) : (
            <div className="space-y-2">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink onClick={() => { setCurrentLevel('categories'); setSelectedCategory(null); }} className="cursor-pointer text-slate-600">
                      Ensaios
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {selectedCategory && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        {currentLevel === 'albums' ? (
                          <BreadcrumbPage>{currentCategoryLabel}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink onClick={() => { setCurrentLevel('albums'); setSelectedAlbum(null); }} className="cursor-pointer">
                            {currentCategoryLabel}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </>
                  )}
                  {selectedAlbum && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{selectedAlbum.title}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
              <Button variant="ghost" size="sm" onClick={navigateBack} className="mt-1">
                <ArrowLeft className="mr-2 h-4 w-4" />Voltar
              </Button>
            </div>
          )}
        </div>

        {currentLevel === 'albums' && selectedCategory && (
          <Button onClick={() => openAlbumDialog()} className="bg-[#C65D3B] text-white font-bold uppercase tracking-widest text-[10px] rounded-sm hover:bg-[#a34a2e]">
            <Plus className="mr-2 h-3 w-3" />Novo Ensaio
          </Button>
        )}
      </div>

      {/* Categories */}
      {currentLevel === 'categories' && (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in duration-700">
          {CATEGORIES.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              albumCount={getAlbumCount(category.id)}
              coverImage={getCategoryCover(category.id)}
              onClick={() => { setSelectedCategory(category.id); setCurrentLevel('albums'); }}
            />
          ))}
        </div>
      )}

      {/* Albums */}
      {currentLevel === 'albums' && selectedCategory && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {albums.filter(a => a.category === selectedCategory).map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              photoCount={photoCounts[album.id] || 0}
              onClick={() => { setSelectedAlbum(album); setCurrentLevel('photos'); }}
              onEdit={() => openAlbumDialog(album)}
              onDelete={() => handleDeleteAlbum(album.id)}
            />
          ))}
        </div>
      )}

      {/* Photos */}
      {currentLevel === 'photos' && selectedAlbum && (
        <PhotosPanel
          images={images}
          uploadingFiles={uploadingFiles}
          onFilesSelected={handleFilesSelected}
          onDragEnd={handleDragEnd}
          onDelete={handleDeletePhoto}
          onSetCover={handleSetCover}
        />
      )}

      <AlbumDialog
        open={isAlbumDialogOpen}
        onOpenChange={setIsAlbumDialogOpen}
        editingAlbum={editingAlbum}
        formData={albumFormData}
        onChange={setAlbumFormData}
        onSubmit={handleSaveAlbum}
      />
    </div>
  );
};

export default AdminGalleryNew;
