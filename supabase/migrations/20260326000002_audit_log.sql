-- Audit log table for tracking admin actions
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,         -- e.g. 'upload_image', 'delete_image', 'create_album'
  entity_type TEXT,             -- e.g. 'album', 'site_image'
  entity_id TEXT,               -- UUID or identifier of the affected record
  metadata JSONB,               -- extra context (file name, album title, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log
CREATE POLICY "Admins can view audit log"
ON public.audit_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only authenticated users can insert (server-side inserts via service role bypass RLS)
CREATE POLICY "Authenticated users can insert audit log"
ON public.audit_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- No updates or deletes allowed (immutable log)
-- (no policies for UPDATE/DELETE = blocked by default)

-- Index for fast queries per user and per entity
CREATE INDEX idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- Helper function to insert an audit entry (callable from frontend via RPC)
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
$$;
