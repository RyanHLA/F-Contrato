import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Album } from './GalleryCards';

interface AlbumFormData {
  title: string;
  event_date: string;
  status: 'draft' | 'published';
}

interface AlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAlbum: Album | null;
  formData: AlbumFormData;
  onChange: (data: AlbumFormData) => void;
  onSubmit: () => void;
}

const AlbumDialog = ({ open, onOpenChange, editingAlbum, formData, onChange, onSubmit }: AlbumDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{editingAlbum ? 'Editar Ensaio' : 'Novo Ensaio'}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label>Título *</Label>
          <Input
            value={formData.title}
            onChange={(e) => onChange({ ...formData, title: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Data</Label>
          <Input
            type="date"
            value={formData.event_date}
            onChange={(e) => onChange({ ...formData, event_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={formData.status}
            onValueChange={(v) => onChange({ ...formData, status: v as 'draft' | 'published' })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-3 pt-4">
          <Button type="submit" className="flex-1 bg-[#C65D3B] text-white font-bold">
            Salvar
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
);

export default AlbumDialog;
