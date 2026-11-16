-- Applied to Adatacore production through Supabase on 2026-11-16.
-- Restrict anonymous invocation of admin-only or trigger-only SECURITY DEFINER
-- routines. Existing authenticated and service_role privileges remain intact.
-- Public platform status / public voice recruitment tracking remain callable.
--
-- Safe rollback: restore only the former anonymous grants shown below:
--   GRANT EXECUTE ON FUNCTION ... TO PUBLIC, anon;
-- Do not use that rollback unless an authenticated workflow demonstrably needs it.

revoke execute on function public.admin_delete_application(uuid) from public, anon;
revoke execute on function public.admin_get_inactivity_policy(integer) from public, anon;
revoke execute on function public.admin_get_quality_escalation_rule(integer) from public, anon;
revoke execute on function public.admin_people360_set_project_limit(uuid,integer,integer) from public, anon;
revoke execute on function public.admin_people_quality_timeline(uuid,integer) from public, anon;
revoke execute on function public.admin_project_smart_groups(integer) from public, anon;
revoke execute on function public.admin_set_inactivity_policy(integer,boolean,integer,integer,boolean) from public, anon;
revoke execute on function public.admin_set_quality_escalation_rule(integer,boolean,integer,integer,integer,integer) from public, anon;
revoke execute on function public.vs_script_prevent_rewriting_assigned() from public, anon;
revoke execute on function public.vs_script_track_revision() from public, anon;
revoke execute on function public.vs_track_submitted_status() from public, anon;
