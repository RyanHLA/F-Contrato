-- =============================================================================
-- Atualiza log_audit() para preencher photographer_id automaticamente
-- via public.current_photographer_id() (criada na migration 20260328000001)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id   TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_log (user_id, photographer_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    public.current_photographer_id(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata
  );
$$;
