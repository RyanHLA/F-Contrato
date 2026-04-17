-- ============================================================
-- Senha de galeria por cliente
-- O cliente usa e-mail + senha para acessar qualquer galeria
-- vinculada ao seu cadastro. A senha é gerada automaticamente
-- no cadastro e pode ser redefinida pelo fotógrafo.
-- ============================================================

-- 1. Coluna gallery_password na tabela clients (bcrypt hash)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS gallery_password text;

-- 2. Função para gerar e salvar senha (retorna a senha em texto para exibição)
CREATE OR REPLACE FUNCTION public.set_client_gallery_password(
  p_client_id uuid,
  p_plain_password text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.clients
  SET gallery_password = crypt(p_plain_password, gen_salt('bf', 10))
  WHERE id = p_client_id;
$$;

-- 3. Função de verificação: e-mail + senha → session token
--    Valida que o cliente tem acesso ao álbum via job vinculado
CREATE OR REPLACE FUNCTION public.verify_client_password(
  p_email    text,
  p_password text,
  p_album_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client_id      uuid;
  v_pwd_valid      boolean;
  v_album_linked   boolean;
  v_session_token  uuid;
BEGIN
  -- Limpa sessões expiradas oportunisticamente
  DELETE FROM public.client_sessions WHERE expires_at < now();

  -- Busca cliente pelo e-mail e verifica senha
  SELECT
    id,
    (gallery_password = crypt(p_password, gallery_password))
  INTO v_client_id, v_pwd_valid
  FROM public.clients
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_client_id IS NULL OR NOT COALESCE(v_pwd_valid, false) THEN
    RETURN NULL;
  END IF;

  -- Verifica se o álbum está vinculado a um job deste cliente
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.client_id = v_client_id
      AND j.album_id  = p_album_id
  ) INTO v_album_linked;

  -- Aceita também acesso via PIN legado (album sem job vinculado a cliente)
  -- Nesse caso pula a verificação de vínculo e permite acesso se o álbum existe
  IF NOT v_album_linked THEN
    SELECT EXISTS (
      SELECT 1 FROM public.albums
      WHERE id = p_album_id AND client_enabled = true
    ) INTO v_album_linked;
  END IF;

  IF NOT v_album_linked THEN
    RETURN NULL;
  END IF;

  -- Reutiliza sessão válida existente ou cria nova
  SELECT token INTO v_session_token
  FROM public.client_sessions
  WHERE album_id = p_album_id
    AND expires_at > now()
  LIMIT 1;

  IF v_session_token IS NULL THEN
    INSERT INTO public.client_sessions (album_id)
    VALUES (p_album_id)
    RETURNING token INTO v_session_token;
  END IF;

  RETURN v_session_token;
END;
$$;
