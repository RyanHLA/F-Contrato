-- Posição e tamanho da marca d'água por job
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS watermark_position text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS watermark_size     integer NOT NULL DEFAULT 30;
-- position: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right'
-- size: percentual da largura da foto (10-90)
