-- Fix 1: Create server-side PIN verification function (prevents PIN exposure)
CREATE OR REPLACE FUNCTION public.verify_album_pin(album_uuid UUID, pin_attempt TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT client_pin = pin_attempt 
     FROM albums 
     WHERE id = album_uuid 
       AND client_enabled = true),
    false
  );
$$;

-- Fix 2: Create function to check selection limit before insert
CREATE OR REPLACE FUNCTION public.check_selection_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limit_count INTEGER;
  current_count INTEGER;
BEGIN
  -- Get the selection limit for this album
  SELECT selection_limit INTO limit_count 
  FROM albums 
  WHERE id = NEW.album_id;
  
  -- If no limit set, allow the insert
  IF limit_count IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Count current selections for this album
  SELECT COUNT(*) INTO current_count 
  FROM client_selections 
  WHERE album_id = NEW.album_id;
  
  -- Check if limit would be exceeded
  IF current_count >= limit_count THEN
    RAISE EXCEPTION 'Selection limit of % photos exceeded for this album', limit_count;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce selection limit on insert
DROP TRIGGER IF EXISTS enforce_selection_limit ON client_selections;
CREATE TRIGGER enforce_selection_limit
BEFORE INSERT ON client_selections
FOR EACH ROW
EXECUTE FUNCTION public.check_selection_limit();

-- Fix 3: Update RLS policy for client_selections to also verify album is not submitted
-- Drop old policy and create updated one with limit check
DROP POLICY IF EXISTS "Anyone can insert selections" ON client_selections;
CREATE POLICY "Anyone can insert selections within limit"
ON client_selections FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM albums 
    WHERE id = album_id 
      AND client_enabled = true 
      AND client_submitted_at IS NULL
  )
);