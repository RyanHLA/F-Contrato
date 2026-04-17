-- Permite acesso público (anônimo) a jobs com galeria ativada
-- Necessário para que o cliente consiga acessar a página de seleção sem login
CREATE POLICY "jobs_public_gallery_select"
  ON public.jobs
  FOR SELECT
  USING (gallery_enabled = true);
