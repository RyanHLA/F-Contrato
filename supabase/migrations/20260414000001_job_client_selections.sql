-- Tabela de seleções do cliente para o sistema de jobs (novo sistema)
CREATE TABLE IF NOT EXISTS public.job_client_selections (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  image_id   UUID NOT NULL REFERENCES public.site_images(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(job_id, image_id)
);

ALTER TABLE public.job_client_selections ENABLE ROW LEVEL SECURITY;

-- Fotógrafo dono do job pode ver todas as seleções
CREATE POLICY "photographer_select_job_selections"
  ON public.job_client_selections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_client_selections.job_id
        AND jobs.photographer_id = public.current_photographer_id()
    )
  );

-- Qualquer um pode inserir (cliente não autenticado — segurança feita via share_token/pin na app)
CREATE POLICY "anyone_insert_job_selections"
  ON public.job_client_selections FOR INSERT
  WITH CHECK (true);

-- Qualquer um pode deletar (para permitir deselecionar)
CREATE POLICY "anyone_delete_job_selections"
  ON public.job_client_selections FOR DELETE
  USING (true);

-- Qualquer um pode ler (galeria pública ou verificada via PIN na app)
CREATE POLICY "anyone_select_job_selections"
  ON public.job_client_selections FOR SELECT
  USING (true);
