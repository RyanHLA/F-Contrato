-- Client sessions table: issued only after correct PIN verification
CREATE TABLE public.client_sessions (
  token UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + INTERVAL '8 hours'
);

-- Enable RLS
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

-- No direct access from frontend — all access via SECURITY DEFINER functions
-- (no SELECT/INSERT/UPDATE/DELETE policies = blocked by default for anon/authenticated)

-- Admins can view sessions for monitoring
CREATE POLICY "Admins can view client sessions"
ON public.client_sessions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast token lookups
CREATE INDEX idx_client_sessions_token ON public.client_sessions(token);
CREATE INDEX idx_client_sessions_album_id ON public.client_sessions(album_id);

-- Clean up expired sessions automatically (called on verification)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.client_sessions WHERE expires_at < now();
$$;

-- Drop old function first (return type changed from BOOLEAN to UUID)
DROP FUNCTION IF EXISTS public.verify_album_pin(UUID, TEXT);

-- Replace verify_album_pin: now returns a session token on success, NULL on failure
-- This is the ONLY way to get a valid session token
CREATE OR REPLACE FUNCTION public.verify_album_pin(album_uuid UUID, pin_attempt TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pin_valid BOOLEAN;
  session_token UUID;
BEGIN
  -- Clean up stale sessions opportunistically
  DELETE FROM public.client_sessions WHERE expires_at < now();

  -- Verify PIN against bcrypt hash
  SELECT (client_pin = crypt(pin_attempt, client_pin)) INTO pin_valid
  FROM albums
  WHERE id = album_uuid
    AND client_enabled = true;

  IF NOT COALESCE(pin_valid, false) THEN
    RETURN NULL;
  END IF;

  -- Reuse existing valid session for this album if one exists
  SELECT token INTO session_token
  FROM public.client_sessions
  WHERE album_id = album_uuid
    AND expires_at > now()
  LIMIT 1;

  IF session_token IS NULL THEN
    INSERT INTO public.client_sessions (album_id)
    VALUES (album_uuid)
    RETURNING token INTO session_token;
  END IF;

  RETURN session_token;
END;
$$;

-- Helper to validate a session token for a given album (used in RLS policies)
CREATE OR REPLACE FUNCTION public.is_valid_client_session(p_token UUID, p_album_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_sessions
    WHERE token = p_token
      AND album_id = p_album_id
      AND expires_at > now()
  );
$$;

-- Update RLS policies on client_selections to require a valid session token
-- The token is passed as a Postgres session variable: app.client_token
DROP POLICY IF EXISTS "Anyone can insert selections within limit" ON public.client_selections;
DROP POLICY IF EXISTS "Anyone can insert selections" ON public.client_selections;
DROP POLICY IF EXISTS "Anyone can delete selections before submission" ON public.client_selections;
DROP POLICY IF EXISTS "Anyone can view selections for accessible albums" ON public.client_selections;

CREATE POLICY "Clients with valid session can view selections"
ON public.client_selections
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_valid_client_session(
    NULLIF(current_setting('app.client_token', true), '')::UUID,
    album_id
  )
);

CREATE POLICY "Clients with valid session can insert selections"
ON public.client_selections
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM albums
    WHERE id = album_id
      AND client_enabled = true
      AND client_submitted_at IS NULL
  )
  AND is_valid_client_session(
    NULLIF(current_setting('app.client_token', true), '')::UUID,
    album_id
  )
);

CREATE POLICY "Clients with valid session can delete selections"
ON public.client_selections
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM albums
    WHERE id = album_id
      AND client_submitted_at IS NULL
  )
  AND is_valid_client_session(
    NULLIF(current_setting('app.client_token', true), '')::UUID,
    album_id
  )
);

-- Function to set the client token as a Postgres session variable
-- Called from frontend before any RLS-protected operation on client_selections
CREATE OR REPLACE FUNCTION public.set_client_token(p_token TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT set_config('app.client_token', p_token, false);
$$;

-- Function to submit album selections (sets client_submitted_at)
-- Requires valid session token
CREATE OR REPLACE FUNCTION public.submit_client_selections(
  p_album_id UUID,
  p_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_valid_client_session(p_token, p_album_id) THEN
    RAISE EXCEPTION 'Invalid or expired session token';
  END IF;

  UPDATE public.albums
  SET client_submitted_at = now()
  WHERE id = p_album_id
    AND client_submitted_at IS NULL;

  RETURN FOUND;
END;
$$;
