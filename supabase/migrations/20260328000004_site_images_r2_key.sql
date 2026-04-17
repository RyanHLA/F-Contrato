-- Adiciona coluna r2_key em site_images
-- Armazena a key do objeto no R2 ({photographer_id}/{folder}/...) para delete seguro.
-- Registros legados ficam com NULL e continuam usando image_url no delete (fallback no frontend).

ALTER TABLE public.site_images
  ADD COLUMN IF NOT EXISTS r2_key TEXT;

CREATE INDEX IF NOT EXISTS idx_site_images_r2_key ON public.site_images(r2_key)
  WHERE r2_key IS NOT NULL;
