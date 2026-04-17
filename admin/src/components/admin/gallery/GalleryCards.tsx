import { GripVertical, Trash2, Eye, Star, FolderOpen, Calendar, Edit } from 'lucide-react';
import { Badge as BadgeUI } from '@/components/ui/badge';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface GalleryImage {
  id: string;
  category: string;
  title: string;
  description: string;
  image_url: string;
  r2_key?: string | null;   // key do objeto no R2 — usado para delete seguro
  display_order: number;
  is_featured?: boolean;
  album_id?: string | null;
}

export interface Album {
  id: string;
  category: string;
  title: string;
  event_date: string | null;
  status: 'draft' | 'published';
  cover_image_url: string | null;
  created_at: string;
}

export const CategoryCard = ({
  category,
  albumCount,
  coverImage,
  onClick,
}: {
  category: { id: string; label: string };
  albumCount: number;
  coverImage: string | null;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    className="group relative aspect-[4/5] overflow-hidden rounded-sm border border-black/10 bg-white transition-all duration-500 hover:border-black/30 shadow-sm cursor-pointer"
  >
    {coverImage ? (
      <img src={coverImage} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" alt={category.label} />
    ) : (
      <div className="h-full w-full flex flex-col items-center justify-center text-black/10 gap-3 bg-neutral-50">
        <FolderOpen className="h-10 w-10 opacity-20" />
        <span className="text-[8px] font-black tracking-widest uppercase">Sem conteúdo</span>
      </div>
    )}
    <div className="absolute bottom-0 left-0 right-0 py-2.5 px-6 bg-[#E8E8E8] border-t border-black/5 flex items-center justify-between">
      <h3 className="text-black text-[13px] font-black uppercase tracking-widest leading-none">
        {category.label}
      </h3>
      <div className="flex items-center gap-2 bg-[#D4D4D4] px-3 py-1.5 rounded-sm border border-black/5">
        <span className="text-black text-[12px] font-black leading-none">{albumCount}</span>
        <span className="text-black/60 text-[10px] uppercase tracking-tight font-extrabold leading-none">
          {albumCount === 1 ? 'ensaio' : 'ensaios'}
        </span>
      </div>
    </div>
  </div>
);

export const MasonryPhotoCard = ({
  image,
  onDelete,
  onPreview,
  onSetCover,
}: {
  image: GalleryImage;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onSetCover: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="group relative mb-4 break-inside-avoid overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div {...attributes} {...listeners} className="absolute right-2 top-2 z-20 cursor-grab rounded-lg bg-white/90 p-1.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-slate-400" />
      </div>
      <img src={image.image_url} alt={image.title} className="w-full" loading="lazy" />
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
        <button onClick={onDelete} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-red-50 hover:text-red-600 hover:scale-110"><Trash2 className="h-4 w-4" /></button>
        <button onClick={onPreview} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-slate-100 hover:scale-110"><Eye className="h-4 w-4" /></button>
        <button onClick={onSetCover} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-[#FAF0EC] hover:text-[#C65D3B] hover:scale-110"><Star className="h-4 w-4" /></button>
      </div>
      <div className="bg-white p-3"><p className="truncate text-sm font-medium text-slate-700">{image.title || 'Sem título'}</p></div>
    </div>
  );
};

export const AlbumCard = ({
  album,
  photoCount,
  onClick,
  onEdit,
  onDelete,
}: {
  album: Album;
  photoCount: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <div className="group cursor-pointer overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
    <div onClick={onClick} className="aspect-[4/3] relative overflow-hidden">
      {album.cover_image_url ? (
        <img src={album.cover_image_url} alt={album.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-[#e8c4b8]/60 bg-[#FAF0EC]/50">
          <FolderOpen className="h-12 w-12 text-[#C65D3B]/40" strokeWidth={1.5} />
        </div>
      )}
      <div className="absolute left-3 top-3">
        <BadgeUI className={album.status === 'published' ? 'bg-emerald-500 text-white border-0' : 'bg-slate-500 text-white border-0'}>
          {album.status === 'published' ? 'Publicado' : 'Rascunho'}
        </BadgeUI>
      </div>
      <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-600 shadow-sm hover:bg-slate-100"><Edit className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-red-500 shadow-sm hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
    <div onClick={onClick} className="bg-white p-4">
      <h4 className="font-serif text-lg text-slate-800 truncate">{album.title}</h4>
      <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {album.event_date ? new Date(album.event_date).toLocaleDateString('pt-BR') : 'Sem data'}
        </span>
        <span>{photoCount} fotos</span>
      </div>
    </div>
  </div>
);
