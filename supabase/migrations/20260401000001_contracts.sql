-- ============================================================
-- Contratos digitais por álbum
-- Permite que fotógrafos criem contratos HTML e clientes assinem
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna contract_template na tabela albums
--    Armazena o template bruto (com variáveis) por álbum
-- ------------------------------------------------------------
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS contract_template text;

-- ------------------------------------------------------------
-- 2. Tabela contracts
--    Um contrato por álbum; signed_at NULL = não assinado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id        uuid        NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  photographer_id uuid        NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  body_html       text        NOT NULL,           -- HTML com variáveis já substituídas
  client_name     text,                           -- preenchido na assinatura
  client_ip       text,                           -- preenchido na assinatura
  signed_at       timestamptz,                    -- NULL = não assinado
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contracts_album_id_unique UNIQUE (album_id)  -- um contrato por álbum
);

-- ------------------------------------------------------------
-- 3. Índice para lookup por álbum
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contracts_album_id ON public.contracts(album_id);

-- ------------------------------------------------------------
-- 4. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Fotógrafo: SELECT nos próprios contratos
DROP POLICY IF EXISTS "contracts_photographer_select" ON public.contracts;
CREATE POLICY "contracts_photographer_select"
  ON public.contracts
  FOR SELECT
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: INSERT nos próprios contratos
DROP POLICY IF EXISTS "contracts_photographer_insert" ON public.contracts;
CREATE POLICY "contracts_photographer_insert"
  ON public.contracts
  FOR INSERT
  WITH CHECK (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: UPDATE nos próprios contratos
DROP POLICY IF EXISTS "contracts_photographer_update" ON public.contracts;
CREATE POLICY "contracts_photographer_update"
  ON public.contracts
  FOR UPDATE
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: DELETE nos próprios contratos
DROP POLICY IF EXISTS "contracts_photographer_delete" ON public.contracts;
CREATE POLICY "contracts_photographer_delete"
  ON public.contracts
  FOR DELETE
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Público (anon): SELECT para a página de assinatura do cliente
-- A mutação (assinatura) é feita exclusivamente via sign_contract() SECURITY DEFINER
DROP POLICY IF EXISTS "contracts_public_select" ON public.contracts;
CREATE POLICY "contracts_public_select"
  ON public.contracts
  FOR SELECT
  USING (true);

-- ------------------------------------------------------------
-- 5. Função SECURITY DEFINER para assinatura do cliente
--    Garante que apenas os campos permitidos sejam alterados
--    e que o contrato só possa ser assinado uma vez
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_album_id    UUID,
  p_client_name TEXT,
  p_client_ip   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE contracts
  SET
    client_name = p_client_name,
    client_ip   = p_client_ip,
    signed_at   = now()
  WHERE album_id = p_album_id
    AND signed_at IS NULL;  -- idempotente: só assina uma vez

  RETURN FOUND;
END;
$$;
