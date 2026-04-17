-- ============================================================
-- Fase 1-3: Assinatura digital, contra-assinatura e audit log
-- ============================================================

-- ------------------------------------------------------------
-- 1. Novos campos na tabela contracts
-- ------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_doc          text,          -- CPF/CNPJ do cliente (capturado na assinatura)
  ADD COLUMN IF NOT EXISTS client_email        text,          -- e-mail do cliente (capturado na assinatura)
  ADD COLUMN IF NOT EXISTS document_hash       text,          -- SHA-256 do body_html no momento da assinatura
  ADD COLUMN IF NOT EXISTS countersigned_at    timestamptz,   -- assinatura do fotógrafo
  ADD COLUMN IF NOT EXISTS photographer_ip     text;          -- IP do fotógrafo na contra-assinatura

-- ------------------------------------------------------------
-- 2. Campo auto_countersign na tabela photographers
--    true  = fotógrafo assina automaticamente quando cliente assina
--    false = fotógrafo precisa clicar manualmente
-- ------------------------------------------------------------
ALTER TABLE public.photographers
  ADD COLUMN IF NOT EXISTS auto_countersign boolean NOT NULL DEFAULT true;

-- ------------------------------------------------------------
-- 3. Trigger: imutabilidade do conteúdo após qualquer assinatura
--    Bloqueia UPDATE em body_html quando signed_at OU
--    countersigned_at estão preenchidos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_contract_content_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se body_html está sendo alterado E o contrato já foi assinado, rejeita
  IF NEW.body_html IS DISTINCT FROM OLD.body_html THEN
    IF OLD.signed_at IS NOT NULL OR OLD.countersigned_at IS NOT NULL THEN
      RAISE EXCEPTION
        'contract_immutable: O conteúdo do contrato não pode ser alterado após assinatura. Anule e crie um novo rascunho.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_immutable ON public.contracts;
CREATE TRIGGER trg_contracts_immutable
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_contract_content_update();

-- ------------------------------------------------------------
-- 4. Função sign_contract — atualizada
--    Agora captura: client_doc, client_email, hash SHA-256
--    E executa auto_countersign se configurado no fotógrafo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_album_id     UUID,
  p_client_name  TEXT,
  p_client_ip    TEXT,
  p_client_doc   TEXT  DEFAULT '',
  p_client_email TEXT  DEFAULT ''
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body_hash     text;
  v_auto_sign     boolean;
  v_photographer_id uuid;
  v_contract_id   uuid;
BEGIN
  -- Busca contrato ainda não assinado
  SELECT c.id, c.photographer_id
  INTO v_contract_id, v_photographer_id
  FROM contracts c
  WHERE c.album_id = p_album_id
    AND c.signed_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Gera hash SHA-256 do conteúdo atual
  SELECT encode(
    digest(body_html::text, 'sha256'),
    'hex'
  )
  INTO v_body_hash
  FROM contracts
  WHERE id = v_contract_id;

  -- Verifica preferência de auto_countersign do fotógrafo
  SELECT auto_countersign
  INTO v_auto_sign
  FROM photographers
  WHERE id = v_photographer_id;

  -- Atualiza contrato com dados da assinatura do cliente
  UPDATE contracts
  SET
    client_name    = p_client_name,
    client_ip      = p_client_ip,
    client_doc     = NULLIF(p_client_doc, ''),
    client_email   = NULLIF(p_client_email, ''),
    document_hash  = v_body_hash,
    signed_at      = now(),
    -- Auto contra-assina se configurado
    countersigned_at = CASE WHEN v_auto_sign THEN now() ELSE NULL END
  WHERE id = v_contract_id;

  -- Atualiza status do job para contract_signed
  UPDATE jobs
  SET status = 'contract_signed'
  WHERE album_id = p_album_id
    AND status = 'contract_pending';

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------
-- 5. Função countersign_contract — contra-assinatura manual
--    Chamada pelo fotógrafo autenticado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.countersign_contract(
  p_contract_id   UUID,
  p_photographer_ip TEXT DEFAULT ''
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photographer_id uuid;
BEGIN
  -- Garante que o contrato pertence ao fotógrafo autenticado
  -- e que o cliente já assinou mas o fotógrafo ainda não
  SELECT photographer_id
  INTO v_photographer_id
  FROM photographers
  WHERE user_id = auth.uid();

  UPDATE contracts
  SET
    countersigned_at = now(),
    photographer_ip  = NULLIF(p_photographer_ip, '')
  WHERE id = p_contract_id
    AND photographer_id = v_photographer_id
    AND signed_at IS NOT NULL
    AND countersigned_at IS NULL;

  RETURN FOUND;
END;
$$;
