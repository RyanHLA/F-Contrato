-- Permite acesso público (anônimo) a fotos vinculadas a jobs com galeria ativada
CREATE POLICY "images_client_gallery_view"
  ON public.site_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = site_images.job_id
        AND jobs.gallery_enabled = true
    )
  );
