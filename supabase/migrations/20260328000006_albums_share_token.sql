-- Passo 5 — Share Token para álbuns
-- Permite link direto sem PIN: /p/[slug]/[albumId]?t=[share_token]

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_share_token
  ON public.albums(share_token)
  WHERE share_token IS NOT NULL;

-- Gera tokens para álbuns que não têm (registros existentes)
UPDATE public.albums
  SET share_token = gen_random_uuid()
  WHERE share_token IS NULL;

-- Função: valida share_token e retorna session token (UUID) para o RLS
-- Reutiliza a mesma lógica de client_sessions que verify_album_pin já usa.
CREATE OR REPLACE FUNCTION public.verify_share_token(
  p_album_id UUID,
  p_share_token UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  -- Verifica se o share_token bate e o álbum está habilitado
  IF NOT EXISTS (
    SELECT 1 FROM albums
    WHERE id = p_album_id
      AND share_token = p_share_token
      AND client_enabled = true
  ) THEN
    RETURN NULL;
  END IF;

  -- Gera session token válido por 24h (mesmo padrão de verify_album_pin)
  v_token   := gen_random_uuid();
  v_expires := now() + INTERVAL '24 hours';

  INSERT INTO client_sessions (token, album_id, expires_at)
  VALUES (v_token, p_album_id, v_expires);

  RETURN v_token;
END;
$$;
