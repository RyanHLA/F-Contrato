import { useRef, useState, useCallback } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { GalleryImage, MasonryPhotoCard } from './GalleryCards';

interface UploadingFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  preview: string;
}

interface PhotosPanelProps {
  images: GalleryImage[];
  uploadingFiles: UploadingFile[];
  onFilesSelected: (files: FileList | File[]) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDelete: (id: string) => void;
  onSetCover: (image: GalleryImage) => void;
}

const PhotosPanel = ({
  images,
  uploadingFiles,
  onFilesSelected,
  onDragEnd,
  onDelete,
  onSetCover,
}: PhotosPanelProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onFilesSelected(e.target.files)}
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files) onFilesSelected(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-all ${isDragOver ? 'border-[#C65D3B] bg-[#FAF0EC]' : 'border-[#e8c4b8] hover:border-[#C65D3B]'}`}
      >
        <Upload className="mx-auto mb-4 h-12 w-12 text-[#e8c4b8]" />
        <p className="font-medium text-slate-700">Arraste suas fotos aqui ou clique para selecionar</p>
      </div>

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          {uploadingFiles.map((upload, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <img src={upload.preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
              <div className="flex-1"><Progress value={upload.progress} className="h-2" /></div>
              {upload.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-[#C65D3B]" />}
            </div>
          ))}
        </div>
      )}

      {/* Sortable photo grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
          <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
            {images.map((image) => (
              <MasonryPhotoCard
                key={image.id}
                image={image}
                onEdit={() => {}}
                onDelete={() => onDelete(image.id)}
                onPreview={() => setPreviewImage(image)}
                onSetCover={() => onSetCover(image)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl bg-slate-900 p-0 border-0">
          {previewImage && (
            <div className="relative">
              <img src={previewImage.image_url} alt="" className="w-full rounded-lg" />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute right-4 top-4 h-10 w-10 bg-white rounded-full flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotosPanel;
