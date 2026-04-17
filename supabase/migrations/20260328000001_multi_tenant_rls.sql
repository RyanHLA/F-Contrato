-- =============================================================================
-- Fase 1: Estratégia de Multi-Tenancy no Supabase (RLS)
-- Ref: MULTI_TENANT_ARCHITECTURE.md § 1
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabela `photographers`
-- ---------------------------------------------------------------------------

CREATE TABLE public.photographers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug                        TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  email                       TEXT NOT NULL,

  -- Ciclo de vida da conta
  account_status              TEXT NOT NULL DEFAULT 'trial'
                                CHECK (account_status IN ('trial', 'active', 'suspended')),
  trial_ends_at               TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  trial_used                  BOOLEAN NOT NULL DEFAULT false,

  -- Suspensão / retenção
  suspended_at                TIMESTAMPTZ,
  data_deletion_scheduled_at  TIMESTAMPTZ,

  -- AbacatePay
  abacatepay_customer_id      TEXT UNIQUE,
  abacatepay_subscription_id  TEXT,

  storage_used_bytes          BIGINT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_photographers_user_id
  ON public.photographers(user_id);

CREATE UNIQUE INDEX idx_photographers_abacatepay_id
  ON public.photographers(abacatepay_customer_id)
  WHERE abacatepay_customer_id IS NOT NULL;

CREATE INDEX idx_photographers_deletion_scheduled
  ON public.photographers(data_deletion_scheduled_at)
  WHERE data_deletion_scheduled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Colunas `photographer_id` nas tabelas existentes
-- ---------------------------------------------------------------------------

ALTER TABLE public.albums
  ADD COLUMN photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE;

ALTER TABLE public.site_images
  ADD COLUMN photographer_id UUID REFERENCES public.photographers(id) ON DELETE CASCADE;
-- Pré-requisito do job de reconciliação de storage
ALTER TABLE public.site_images
  ADD COLUMN file_size_bytes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.audit_log
  ADD COLUMN photographer_id UUID REFERENCES public.photographers(id) ON DELETE SET NULL;

CREATE INDEX idx_albums_photographer_id
  ON public.albums(photographer_id);

CREATE INDEX idx_site_images_photographer_id
  ON public.site_images(photographer_id);

CREATE INDEX idx_audit_log_photographer_id
  ON public.audit_log(photographer_id);

-- ---------------------------------------------------------------------------
-- 3. Função auxiliar para o RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_photographer_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.photographers WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS — tabela `photographers`
-- ---------------------------------------------------------------------------

ALTER TABLE public.photographers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photographer_select_own"
  ON public.photographers FOR SELECT
  USING (user_id = auth.uid());

-- Fotógrafo pode editar nome, slug, email, etc.
-- Campos de ciclo de vida são imutáveis pelo próprio fotógrafo (somente webhooks/jobs alteram).
CREATE POLICY "photographer_update_own"
  ON public.photographers FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND account_status             = (SELECT account_status             FROM public.photographers WHERE user_id = auth.uid())
    AND trial_used                 = (SELECT trial_used                 FROM public.photographers WHERE user_id = auth.uid())
    AND suspended_at               IS NOT DISTINCT FROM (SELECT suspended_at               FROM public.photographers WHERE user_id = auth.uid())
    AND data_deletion_scheduled_at IS NOT DISTINCT FROM (SELECT data_deletion_scheduled_at FROM public.photographers WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. RLS — tabela `albums`
--    Substitui as policies antigas baseadas em has_role('admin')
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view published albums"                        ON public.albums;
DROP POLICY IF EXISTS "Admins can insert albums"                                ON public.albums;
DROP POLICY IF EXISTS "Admins can update albums"                                ON public.albums;
DROP POLICY IF EXISTS "Admins can delete albums"                                ON public.albums;
DROP POLICY IF EXISTS "Anyone can view client-enabled albums for PIN verification" ON public.albums;

CREATE POLICY "albums_photographer_select"
  ON public.albums FOR SELECT
  USING (photographer_id = public.current_photographer_id());

CREATE POLICY "albums_photographer_insert"
  ON public.albums FOR INSERT
  WITH CHECK (photographer_id = public.current_photographer_id());

CREATE POLICY "albums_photographer_update"
  ON public.albums FOR UPDATE
  USING (photographer_id = public.current_photographer_id());

CREATE POLICY "albums_photographer_delete"
  ON public.albums FOR DELETE
  USING (photographer_id = public.current_photographer_id());

-- Cliente final acessa álbum pelo PIN (sem auth Supabase)
CREATE POLICY "albums_client_public_view"
  ON public.albums FOR SELECT
  USING (client_enabled = true);

-- ---------------------------------------------------------------------------
-- 6. RLS — tabela `site_images`
--    Substitui as policies antigas baseadas em has_role('admin')
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view site images"        ON public.site_images;
DROP POLICY IF EXISTS "Admins can insert site images"      ON public.site_images;
DROP POLICY IF EXISTS "Admins can update site images"      ON public.site_images;
DROP POLICY IF EXISTS "Admins can delete site images"      ON public.site_images;

CREATE POLICY "images_photographer_all"
  ON public.site_images FOR ALL
  USING    (photographer_id = public.current_photographer_id())
  WITH CHECK (photographer_id = public.current_photographer_id());

-- Imagens de álbuns públicos são visíveis ao cliente final
CREATE POLICY "images_client_view"
  ON public.site_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = site_images.album_id
        AND albums.client_enabled = true
    )
  );

-- ---------------------------------------------------------------------------
-- 7. RLS — tabela `audit_log`
--    Substitui a policy antiga baseada em has_role('admin')
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can view audit log"                   ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated users can insert audit log"    ON public.audit_log;

-- Fotógrafo vê apenas seus próprios registros de auditoria
CREATE POLICY "audit_log_photographer_select"
  ON public.audit_log FOR SELECT
  USING (photographer_id = public.current_photographer_id());

-- Inserção via service role (Edge Functions) ou usuário autenticado
CREATE POLICY "audit_log_authenticated_insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 8. RLS — tabela `client_selections`
--    Substitui referências a has_role('admin') pela nova lógica de photographer
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all selections" ON public.client_selections;

-- Fotógrafo vê seleções dos seus próprios álbuns
CREATE POLICY "client_selections_photographer_select"
  ON public.client_selections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = client_selections.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );

CREATE POLICY "client_selections_photographer_delete"
  ON public.client_selections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = client_selections.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. RLS — tabela `client_sessions`
--    Substitui a policy de has_role('admin')
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can view client sessions" ON public.client_sessions;

CREATE POLICY "photographer_view_own_sessions"
  ON public.client_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = client_sessions.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Seed: migrar dados existentes para o primeiro fotógrafo
--     Encontra o usuário com role 'admin' e cria o registro em photographers.
--     Os dados existentes em albums, site_images e audit_log são vinculados.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_id      UUID;
  v_user_email   TEXT;
  v_photographer_id UUID;
BEGIN
  -- Busca o primeiro admin cadastrado
  SELECT ur.user_id, u.email
    INTO v_user_id, v_user_email
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
   WHERE ur.role = 'admin'
   ORDER BY ur.created_at
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Nenhum usuário admin encontrado — seed ignorado.';
    RETURN;
  END IF;

  -- Cria o registro do primeiro fotógrafo
  -- account_status = 'active' pois é o proprietário original do sistema
  INSERT INTO public.photographers (
    user_id,
    slug,
    name,
    email,
    account_status,
    trial_used
  )
  VALUES (
    v_user_id,
    'admin',               -- slug padrão; altere no painel após o deploy
    'Administrador',       -- nome padrão; altere no painel após o deploy
    v_user_email,
    'active',              -- proprietário original: pula o trial
    true
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_photographer_id;

  IF v_photographer_id IS NULL THEN
    -- Já existia — apenas busca o id
    SELECT id INTO v_photographer_id
      FROM public.photographers
     WHERE user_id = v_user_id;
  END IF;

  -- Vincula álbuns existentes ao fotógrafo
  UPDATE public.albums
    SET photographer_id = v_photographer_id
  WHERE photographer_id IS NULL;

  -- Vincula imagens existentes ao fotógrafo
  UPDATE public.site_images
    SET photographer_id = v_photographer_id
  WHERE photographer_id IS NULL;

  -- Vincula entradas de auditoria existentes ao fotógrafo
  UPDATE public.audit_log
    SET photographer_id = v_photographer_id
  WHERE photographer_id IS NULL
    AND user_id = v_user_id;

  RAISE NOTICE 'Seed concluído: photographer_id = %', v_photographer_id;
END;
$$;
