-- Enable pgcrypto for password hashing (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Migrate existing plain-text PINs to bcrypt hashes
-- (Only updates rows where PIN is set and not already a bcrypt hash)
UPDATE public.albums
SET client_pin = extensions.crypt(client_pin, extensions.gen_salt('bf', 10))
WHERE client_pin IS NOT NULL
  AND client_pin NOT LIKE '$2a$%'
  AND client_pin NOT LIKE '$2b$%';

-- Replace the PIN verification function to compare against bcrypt hash
CREATE OR REPLACE FUNCTION public.verify_album_pin(album_uuid UUID, pin_attempt TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT client_pin = crypt(pin_attempt, client_pin)
     FROM albums
     WHERE id = album_uuid
       AND client_enabled = true),
    false
  );
$$;

-- Add a helper function to hash a PIN before storing it
-- Usage: SELECT hash_pin('1234');
CREATE OR REPLACE FUNCTION public.hash_pin(plain_pin TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT crypt(plain_pin, gen_salt('bf', 10));
$$;
