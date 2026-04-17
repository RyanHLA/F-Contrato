-- =============================================================================
-- Fase 2: Gestão de Planos e Assinaturas (AbacatePay)
-- Ref: MULTI_TENANT_ARCHITECTURE.md § 2
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabela `plans`
-- ---------------------------------------------------------------------------

CREATE TABLE public.plans (
  id                        TEXT PRIMARY KEY,  -- 'trial', 'basico', 'pro', 'avancado'
  name                      TEXT NOT NULL,
  price_brl                 NUMERIC(8,2) NOT NULL DEFAULT 0,  -- preço em reais (0 = grátis)
  max_albums                INTEGER NOT NULL,  -- -1 = ilimitado
  max_storage_gb            INTEGER NOT NULL,
  max_photos_per_album      INTEGER NOT NULL,  -- -1 = ilimitado
  abacatepay_product_id     TEXT              -- NULL apenas para 'trial'
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_public_read"
  ON public.plans FOR SELECT
  USING (true);  -- qualquer usuário autenticado pode consultar os planos disponíveis

INSERT INTO public.plans (id, name, price_brl, max_albums, max_storage_gb, max_photos_per_album, abacatepay_product_id) VALUES
  ('trial',   'Período Teste', 0.00,  -1,  10,  500,  NULL),  -- 14 dias grátis
  ('basico',  'Básico',        19.90, -1,  10,  500,  NULL),  -- preencher com prod_id do AbacatePay
  ('pro',     'Pro',           59.90, -1,  50,  1000, NULL),  -- preencher com prod_id do AbacatePay
  ('avancado','Avançado',      89.90, -1,  100, -1,   NULL);  -- preencher com prod_id do AbacatePay

-- ---------------------------------------------------------------------------
-- 2. Tabela `email_log`
--    Garante idempotência nos jobs de e-mail — evita envio duplicado
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  email_type      TEXT NOT NULL,  -- 'suspension_day1', 'suspension_day15', 'suspension_day27', 'deletion_day30'
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photographer_id, email_type)  -- um envio por tipo por fotógrafo
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
-- Apenas service role acessa (sem policies = bloqueado para anon/authenticated)

CREATE INDEX idx_email_log_photographer_id ON public.email_log(photographer_id);

-- ---------------------------------------------------------------------------
-- 3. Função: resolve o plano ativo de um fotógrafo
--    Retorna o registro de plans correspondente ao estado atual da conta.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_photographer_plan(p_photographer_id UUID)
RETURNS public.plans
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photographer   photographers%ROWTYPE;
  v_plan           plans%ROWTYPE;
  v_product_id     TEXT;
BEGIN
  SELECT * INTO v_photographer
    FROM photographers
   WHERE id = p_photographer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photographer not found: %', p_photographer_id;
  END IF;

  -- Conta suspensa ou trial: retorna o plano pelo account_status
  IF v_photographer.account_status IN ('suspended', 'trial') THEN
    SELECT * INTO v_plan FROM plans WHERE id = v_photographer.account_status;
    -- 'suspended' não tem plano — retorna NULL (quota = 0 efetivamente)
    IF v_photographer.account_status = 'suspended' THEN
      RETURN NULL;
    END IF;
    RETURN v_plan;
  END IF;

  -- Conta ativa: deriva o plano pelo abacatepay_subscription_id
  -- O product_id é armazenado em photographers.abacatepay_subscription_id
  -- como "<subscription_id>|<product_id>" — ou pode ser resolvido via
  -- uma coluna dedicada adicionada abaixo.
  SELECT * INTO v_plan
    FROM plans
   WHERE abacatepay_product_id = v_photographer.abacatepay_subscription_id
   LIMIT 1;

  -- Fallback: se o product_id não bater, retorna trial (seguro)
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE id = 'trial';
  END IF;

  RETURN v_plan;
END;
$$;

-- Coluna auxiliar para armazenar o product_id da assinatura ativa
-- separado do subscription_id (evita parsing de string concatenada)
ALTER TABLE public.photographers
  ADD COLUMN IF NOT EXISTS abacatepay_product_id TEXT;

-- Reescreve resolve_photographer_plan para usar a coluna dedicada
CREATE OR REPLACE FUNCTION public.resolve_photographer_plan(p_photographer_id UUID)
RETURNS public.plans
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photographer   photographers%ROWTYPE;
  v_plan           plans%ROWTYPE;
BEGIN
  SELECT * INTO v_photographer
    FROM photographers
   WHERE id = p_photographer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Photographer not found: %', p_photographer_id;
  END IF;

  IF v_photographer.account_status = 'suspended' THEN
    RETURN NULL;  -- sem acesso a quotas
  END IF;

  IF v_photographer.account_status = 'trial' THEN
    SELECT * INTO v_plan FROM plans WHERE id = 'trial';
    RETURN v_plan;
  END IF;

  -- account_status = 'active': usa abacatepay_product_id
  SELECT * INTO v_plan
    FROM plans
   WHERE abacatepay_product_id = v_photographer.abacatepay_product_id;

  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE id = 'trial';  -- fallback seguro
  END IF;

  RETURN v_plan;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Função: verifica quota de storage antes do upload
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_storage_quota(
  p_photographer_id UUID,
  p_file_size_bytes BIGINT
)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photographer  photographers%ROWTYPE;
  v_plan          plans%ROWTYPE;
  v_max_bytes     BIGINT;
BEGIN
  SELECT * INTO v_photographer FROM photographers WHERE id = p_photographer_id;

  IF v_photographer.account_status = 'suspended' THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
  END IF;

  SELECT * INTO v_plan FROM public.resolve_photographer_plan(p_photographer_id);

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
  END IF;

  IF v_plan.max_storage_gb = -1 THEN
    RETURN;  -- ilimitado
  END IF;

  v_max_bytes := v_plan.max_storage_gb::BIGINT * 1024 * 1024 * 1024;

  IF v_photographer.storage_used_bytes + p_file_size_bytes > v_max_bytes THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: % GB limit reached', v_plan.max_storage_gb;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Job: expire_trials — suspende contas em trial vencido
--    Agendado via pg_cron: SELECT cron.schedule('expire-trials', '0 3 * * *', $$...$$)
--    (executar manualmente no SQL Editor do Supabase após confirmar pg_cron ativo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE photographers
  SET
    account_status             = 'suspended',
    trial_used                 = true,
    suspended_at               = now(),
    data_deletion_scheduled_at = now() + INTERVAL '30 days'
  WHERE
    account_status = 'trial'
    AND trial_ends_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Job: mark_retention_emails — retorna contas que precisam de e-mail
--    Chamada pelas Edge Functions de lifecycle para saber quem notificar.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_retention_email_targets(p_email_type TEXT)
RETURNS TABLE (
  photographer_id UUID,
  email           TEXT,
  name            TEXT,
  days_remaining  INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.name,
    EXTRACT(DAY FROM (p.data_deletion_scheduled_at - now()))::INTEGER AS days_remaining
  FROM photographers p
  WHERE
    p.account_status = 'suspended'
    AND p.suspended_at IS NOT NULL
    -- Não reenvia e-mail que já foi enviado
    AND NOT EXISTS (
      SELECT 1 FROM email_log el
       WHERE el.photographer_id = p.id
         AND el.email_type = p_email_type
    )
    AND CASE p_email_type
      WHEN 'suspension_day1'  THEN (now() - p.suspended_at) >= INTERVAL '0 days'  AND (now() - p.suspended_at) < INTERVAL '1 day'
      -- Dia 1: janela de 24h após suspended_at
      -- Nota: na prática o job roda uma vez/dia, então qualquer conta
      -- suspensa nas últimas 24h cai aqui.
      WHEN 'suspension_day15' THEN (now() - p.suspended_at) >= INTERVAL '14 days' AND (now() - p.suspended_at) < INTERVAL '15 days'
      WHEN 'suspension_day27' THEN (now() - p.suspended_at) >= INTERVAL '26 days' AND (now() - p.suspended_at) < INTERVAL '27 days'
      WHEN 'deletion_day30'   THEN p.data_deletion_scheduled_at::date = now()::date
      ELSE false
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Agendamento pg_cron (executar no SQL Editor após confirmar extensão ativa)
--    SELECT * FROM cron.job;  -- lista jobs existentes
-- ---------------------------------------------------------------------------

-- Habilita pg_cron (pode já estar habilitado no Supabase):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agenda expire_trials para rodar todo dia às 03:00 UTC:
-- SELECT cron.schedule(
--   'expire-trials',
--   '0 3 * * *',
--   $$ SELECT public.expire_trials(); $$
-- );
