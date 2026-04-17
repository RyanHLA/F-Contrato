-- Adiciona colunas de galeria diretamente no jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS gallery_pin TEXT,
  ADD COLUMN IF NOT EXISTS gallery_share_token TEXT,
  ADD COLUMN IF NOT EXISTS gallery_selection_limit INTEGER,
  ADD COLUMN IF NOT EXISTS gallery_deadline DATE,
  ADD COLUMN IF NOT EXISTS gallery_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gallery_submitted_at TIMESTAMPTZ;

-- Torna album_id opcional em site_images
ALTER TABLE public.site_images
  ALTER COLUMN album_id DROP NOT NULL;

-- Adiciona job_id em site_images
ALTER TABLE public.site_images
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_images_job_id ON public.site_images(job_id);

-- Torna album_id opcional em client_selections
ALTER TABLE public.client_selections
  ALTER COLUMN album_id DROP NOT NULL;

-- Adiciona job_id em client_selections
ALTER TABLE public.client_selections
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_client_selections_job_id ON public.client_selections(job_id);

-- Adiciona job_id em contracts (para vincular contrato ao job sem depender do album)
-- (já pode existir, só garante)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_job_id ON public.contracts(job_id);
