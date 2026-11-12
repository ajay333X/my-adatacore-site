-- Applied in Supabase on 2026-11-12 via admin_email_center_send_audit_rls_and_unique_requests.
-- Admin-only outgoing email audit history; browser never gets direct table access.
CREATE TABLE IF NOT EXISTS public.admin_email_center_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 from_address text NOT NULL,
 recipient_email text NOT NULL,
 subject text NOT NULL,
 body_markdown text NOT NULL,
 kind text NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','test')),
 status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','accepted','failed','unknown')),
 provider_message_id text,
 provider_response_code integer,
 error_message text,
 finalized_at timestamptz,
 CONSTRAINT admin_email_recipient_limit CHECK(length(recipient_email) BETWEEN 5 AND 320),
 CONSTRAINT admin_email_subject_limit CHECK(length(subject) BETWEEN 1 AND 180),
 CONSTRAINT admin_email_body_limit CHECK(length(body_markdown) BETWEEN 1 AND 20000)
);
CREATE INDEX IF NOT EXISTS admin_email_center_created_idx ON public.admin_email_center_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_email_center_sender_idx ON public.admin_email_center_messages(created_by,created_at DESC);
ALTER TABLE public.admin_email_center_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_email_center_messages FROM public,anon,authenticated;
GRANT ALL ON public.admin_email_center_messages TO service_role;
