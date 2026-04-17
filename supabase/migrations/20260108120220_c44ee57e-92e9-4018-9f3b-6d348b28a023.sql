-- Add client proofing columns to albums table
ALTER TABLE public.albums 
ADD COLUMN client_pin TEXT,
ADD COLUMN client_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN selection_limit INTEGER,
ADD COLUMN client_submitted_at TIMESTAMP WITH TIME ZONE;

-- Create table for client photo selections
CREATE TABLE public.client_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES public.site_images(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(album_id, image_id)
);

-- Enable RLS on client_selections
ALTER TABLE public.client_selections ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view selections for albums they have access to (PIN verified in app)
CREATE POLICY "Anyone can view selections for accessible albums"
ON public.client_selections
FOR SELECT
USING (true);

-- Policy: Anyone can insert selections (PIN verification handled in app)
CREATE POLICY "Anyone can insert selections"
ON public.client_selections
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.albums 
    WHERE id = album_id 
    AND client_enabled = true 
    AND client_submitted_at IS NULL
  )
);

-- Policy: Anyone can delete their own selections before submission
CREATE POLICY "Anyone can delete selections before submission"
ON public.client_selections
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.albums 
    WHERE id = album_id 
    AND client_submitted_at IS NULL
  )
);

-- Policy: Admins can manage all selections
CREATE POLICY "Admins can manage all selections"
ON public.client_selections
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update albums RLS to allow public access to client-enabled albums (for PIN verification)
CREATE POLICY "Anyone can view client-enabled albums for PIN verification"
ON public.albums
FOR SELECT
USING (client_enabled = true);

-- Add index for faster lookups
CREATE INDEX idx_client_selections_album_id ON public.client_selections(album_id);
CREATE INDEX idx_albums_client_enabled ON public.albums(client_enabled) WHERE client_enabled = true;