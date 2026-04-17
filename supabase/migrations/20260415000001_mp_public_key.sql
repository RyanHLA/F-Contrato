-- Adiciona coluna mp_public_key na tabela photographers
ALTER TABLE public.photographers
  ADD COLUMN IF NOT EXISTS mp_public_key TEXT;
