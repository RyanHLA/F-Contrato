-- Create albums table for hierarchical portfolio structure
CREATE TABLE public.albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add album_id to site_images for photo-album relationship
ALTER TABLE public.site_images 
ADD COLUMN album_id UUID REFERENCES public.albums(id) ON DELETE CASCADE;

-- Enable RLS on albums table
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

-- RLS Policies for albums
CREATE POLICY "Anyone can view published albums" 
ON public.albums 
FOR SELECT 
USING (status = 'published' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert albums" 
ON public.albums 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update albums" 
ON public.albums 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete albums" 
ON public.albums 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_albums_updated_at
BEFORE UPDATE ON public.albums
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_albums_category ON public.albums(category);
CREATE INDEX idx_albums_status ON public.albums(status);
CREATE INDEX idx_site_images_album_id ON public.site_images(album_id);