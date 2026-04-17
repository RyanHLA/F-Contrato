-- ============================================================
-- Migra contratos de album_id para job_id como chave principal
-- album_id permanece na tabela mas deixa de ser obrigatório
-- ============================================================

-- 1. Remove constraint UNIQUE de album_id (era a chave de lookup)
ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_album_id_unique;

-- 2. Torna album_id opcional (já era nullable, mas remove índice único)
DROP INDEX IF EXISTS idx_contracts_album_id;

-- 3. Garante que job_id existe e cria constraint UNIQUE nele
--    (já foi adicionado em 20260401000003, mas sem unique)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_contracts_job_id;
CREATE UNIQUE INDEX idx_contracts_job_id ON public.contracts(job_id)
  WHERE job_id IS NOT NULL;

-- 4. Atualiza função sign_contract para aceitar job_id
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_job_id       UUID,
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
  v_body_hash       text;
  v_auto_sign       boolean;
  v_photographer_id uuid;
  v_contract_id     uuid;
BEGIN
  SELECT c.id, c.photographer_id
  INTO v_contract_id, v_photographer_id
  FROM contracts c
  WHERE c.job_id = p_job_id
    AND c.signed_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT encode(digest(body_html::text, 'sha256'), 'hex')
  INTO v_body_hash
  FROM contracts WHERE id = v_contract_id;

  SELECT auto_countersign INTO v_auto_sign
  FROM photographers WHERE id = v_photographer_id;

  UPDATE contracts
  SET
    client_name      = p_client_name,
    client_ip        = p_client_ip,
    client_doc       = NULLIF(p_client_doc, ''),
    client_email     = NULLIF(p_client_email, ''),
    document_hash    = v_body_hash,
    signed_at        = now(),
    countersigned_at = CASE WHEN v_auto_sign THEN now() ELSE NULL END
  WHERE id = v_contract_id;

  UPDATE jobs
  SET status = 'contract_signed'
  WHERE id = p_job_id
    AND status = 'contract_pending';

  RETURN TRUE;
END;
$$;
