-- Tabela de marcas d'água dos fotógrafos
CREATE TABLE IF NOT EXISTS public.watermarks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid        NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  name            text        NOT NULL DEFAULT 'Minha marca d''água',
  image_url       text        NOT NULL,
  r2_key          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watermarks_photographer_id ON public.watermarks(photographer_id);

ALTER TABLE public.watermarks ENABLE ROW LEVEL SECURITY;

-- Fotógrafo gerencia suas próprias marcas d'água
CREATE POLICY "watermarks_photographer_all"
  ON public.watermarks FOR ALL
  USING    (photographer_id = (SELECT id FROM public.photographers WHERE user_id = auth.uid()))
  WITH CHECK (photographer_id = (SELECT id FROM public.photographers WHERE user_id = auth.uid()));

-- Coluna na tabela jobs para vincular marca d'água selecionada
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS watermark_id uuid REFERENCES public.watermarks(id) ON DELETE SET NULL;
