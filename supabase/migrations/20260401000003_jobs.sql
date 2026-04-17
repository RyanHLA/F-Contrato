-- ============================================================
-- Jobs (atendimentos) — entidade central do fluxo de trabalho
-- Liga cliente, álbum e contrato em um único registro rastreável
-- Status possíveis:
--   draft | contract_pending | contract_signed |
--   gallery_active | selection_received | delivered
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela jobs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid        NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  album_id        uuid        REFERENCES public.albums(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  event_type      text,                              -- 'Casamento', 'Gestante', 'Família', etc.
  event_date      date,
  status          text        NOT NULL DEFAULT 'draft',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Índices para lookups frequentes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_photographer_id ON public.jobs(photographer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id       ON public.jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status          ON public.jobs(status);

-- ------------------------------------------------------------
-- 3. Trigger de updated_at (reutiliza função já existente)
-- ------------------------------------------------------------
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 4. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Fotógrafo: SELECT nos próprios jobs
DROP POLICY IF EXISTS "jobs_photographer_select" ON public.jobs;
CREATE POLICY "jobs_photographer_select"
  ON public.jobs
  FOR SELECT
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: INSERT nos próprios jobs
DROP POLICY IF EXISTS "jobs_photographer_insert" ON public.jobs;
CREATE POLICY "jobs_photographer_insert"
  ON public.jobs
  FOR INSERT
  WITH CHECK (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: UPDATE nos próprios jobs
DROP POLICY IF EXISTS "jobs_photographer_update" ON public.jobs;
CREATE POLICY "jobs_photographer_update"
  ON public.jobs
  FOR UPDATE
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: DELETE nos próprios jobs
DROP POLICY IF EXISTS "jobs_photographer_delete" ON public.jobs;
CREATE POLICY "jobs_photographer_delete"
  ON public.jobs
  FOR DELETE
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 5. Coluna job_id na tabela contracts
--    Relaciona um contrato ao job correspondente (opcional)
-- ------------------------------------------------------------
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
