-- Applied to Adatacore production on 2026-11-16 following auth-policy audit.
-- public.can_review_application_audio() starts with auth.uid() IS NOT NULL;
-- anonymous callers always receive false. Storage access policies invoke it
-- only for authenticated users. Keep the authenticated and service role grants.
REVOKE EXECUTE ON FUNCTION public.can_review_application_audio() FROM PUBLIC, anon;
