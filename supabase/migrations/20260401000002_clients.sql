-- ============================================================
-- CRM de clientes por fotógrafo
-- Cada fotógrafo gerencia sua própria carteira de clientes
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela clients
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid        NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  email           text,
  whatsapp        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Índice para lookup por fotógrafo
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_photographer_id ON public.clients(photographer_id);

-- ------------------------------------------------------------
-- 3. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Fotógrafo: SELECT nos próprios clientes
DROP POLICY IF EXISTS "clients_photographer_select" ON public.clients;
CREATE POLICY "clients_photographer_select"
  ON public.clients
  FOR SELECT
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: INSERT nos próprios clientes
DROP POLICY IF EXISTS "clients_photographer_insert" ON public.clients;
CREATE POLICY "clients_photographer_insert"
  ON public.clients
  FOR INSERT
  WITH CHECK (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: UPDATE nos próprios clientes
DROP POLICY IF EXISTS "clients_photographer_update" ON public.clients;
CREATE POLICY "clients_photographer_update"
  ON public.clients
  FOR UPDATE
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );

-- Fotógrafo: DELETE nos próprios clientes
DROP POLICY IF EXISTS "clients_photographer_delete" ON public.clients;
CREATE POLICY "clients_photographer_delete"
  ON public.clients
  FOR DELETE
  USING (
    photographer_id = (
      SELECT id FROM public.photographers WHERE user_id = auth.uid()
    )
  );
