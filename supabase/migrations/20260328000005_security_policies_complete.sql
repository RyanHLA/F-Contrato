-- Passo 4 — Políticas de Segurança Completas
-- Garante isolamento total em client_selections e client_sessions

-- ============================================================
-- client_selections
-- ============================================================

-- Remove políticas antigas se existirem
DROP POLICY IF EXISTS "client_select_own_album_selections" ON client_selections;
DROP POLICY IF EXISTS "client_insert_own_album_selections" ON client_selections;
DROP POLICY IF EXISTS "client_delete_own_album_selections" ON client_selections;

-- Habilita RLS (idempotente)
ALTER TABLE client_selections ENABLE ROW LEVEL SECURITY;

-- SELECT: fotógrafo vê seleções dos seus álbuns OU cliente com token válido
CREATE POLICY "client_selections_select"
  ON client_selections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = client_selections.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
    OR
    is_valid_client_session(
      NULLIF(current_setting('app.client_token', true), '')::UUID,
      album_id
    )
  );

-- INSERT: apenas cliente com token de sessão válido pode inserir
CREATE POLICY "client_selections_insert"
  ON client_selections FOR INSERT
  WITH CHECK (
    is_valid_client_session(
      NULLIF(current_setting('app.client_token', true), '')::UUID,
      album_id
    )
  );

-- DELETE: apenas o fotógrafo dono do álbum pode remover seleções
CREATE POLICY "client_selections_delete"
  ON client_selections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = client_selections.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );

-- ============================================================
-- client_sessions
-- ============================================================

-- Remove políticas antigas se existirem
DROP POLICY IF EXISTS "photographer_view_own_sessions" ON client_sessions;
DROP POLICY IF EXISTS "client_sessions_insert" ON client_sessions;
DROP POLICY IF EXISTS "client_sessions_delete" ON client_sessions;

-- Habilita RLS (idempotente)
ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: fotógrafo vê apenas sessões dos seus álbuns
CREATE POLICY "client_sessions_select"
  ON client_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = client_sessions.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );

-- INSERT: qualquer um pode criar sessão (verify_album_pin retorna token e insere via SECURITY DEFINER)
-- A função verify_album_pin já valida o PIN antes de inserir — não precisamos restringir aqui.
-- Mas para não deixar tabela aberta a INSERTs diretos não autenticados, bloqueamos via RLS
-- e confiamos que o INSERT é feito pela função SECURITY DEFINER (que bypassa RLS).
-- Portanto: sem política de INSERT = bloqueado por padrão para usuários diretos. OK.

-- DELETE: fotógrafo pode limpar sessões dos seus álbuns
CREATE POLICY "client_sessions_delete"
  ON client_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = client_sessions.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );

-- ============================================================
-- Verificação de RLS nas demais tabelas críticas
-- (garante que estejam habilitadas — idempotente)
-- ============================================================

ALTER TABLE albums           ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE photographers    ENABLE ROW LEVEL SECURITY;
