-- Migration: Trigger handle_new_user
-- Cria automaticamente um registro em `photographers` sempre que um novo
-- usuário se cadastrar via supabase.auth.signUp() — seja pela landing page
-- ou por qualquer outro fluxo de cadastro.
--
-- O registro é criado com account_status = 'trial' (padrão da tabela),
-- trial_ends_at = now() + 14 days (padrão da tabela) e storage_used_bytes = 0.
--
-- Slug: gerado a partir da parte local do e-mail, substituindo caracteres
-- inválidos por hífen. Ex: "joao.silva@gmail.com" → "joao-silva"
-- Em caso de conflito de slug (dois usuários com mesmo prefixo de e-mail),
-- adiciona os primeiros 6 caracteres do UUID do usuário como sufixo.
-- Ex: "joao-silva-a1b2c3"

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_slug TEXT;
  v_slug      TEXT;
  v_name      TEXT;
BEGIN
  -- Gera slug base a partir da parte local do e-mail
  -- "joao.silva@gmail.com" → "joao-silva"
  -- "foto_grafo+teste@outlook.com" → "foto-grafo-teste"
  v_base_slug := lower(
    regexp_replace(
      split_part(NEW.email, '@', 1),
      '[^a-z0-9]+', '-', 'gi'
    )
  );
  -- Remove hífens no início e no fim
  v_base_slug := trim(BOTH '-' FROM v_base_slug);

  -- Tenta o slug base primeiro; se já existir, adiciona sufixo do UUID
  v_slug := v_base_slug;
  IF EXISTS (SELECT 1 FROM public.photographers WHERE slug = v_slug) THEN
    v_slug := v_base_slug || '-' || left(replace(NEW.id::text, '-', ''), 6);
  END IF;

  -- Nome: usa metadado 'name' se informado no signUp, senão usa o slug
  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    v_base_slug
  );

  INSERT INTO public.photographers (
    user_id,
    slug,
    name,
    email
    -- account_status  → padrão 'trial'
    -- trial_ends_at   → padrão now() + 14 days
    -- storage_used_bytes → padrão 0
  )
  VALUES (
    NEW.id,
    v_slug,
    v_name,
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;
  -- ON CONFLICT garante idempotência: se o registro já existir
  -- (ex: seed manual, migração existente), não lança erro.

  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
