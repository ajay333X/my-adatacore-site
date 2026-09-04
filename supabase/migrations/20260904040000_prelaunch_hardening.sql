-- Pre-launch hardening: repair contributor onboarding status and remove anonymous
-- execution from CoreForge administrative SECURITY DEFINER functions.

create or replace function public.get_my_onboarding_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  u public.users%rowtype;
  confirmed boolean;
  skills integer;
  projects integer;
  submitted integer;
  completed integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into u from public.users where id=auth.uid();
  select email_confirmed_at is not null into confirmed from auth.users where id=auth.uid();
  select count(*) into skills from public.contributor_skills where user_id=auth.uid();
  select count(*) into projects from public.project_access_controls where user_id=auth.uid() and access_status='active';
  select count(*) into submitted from public.submissions where "workerUID"=u."uniqueID";

  completed := (case when confirmed then 1 else 0 end)
    +(case when coalesce(trim(u."fullName"),'')<>'' then 1 else 0 end)
    +(case when u.phone_e164 is not null and trim(u.phone_e164)<>'' then 1 else 0 end)
    +(case when u.phone_country_iso2 is not null then 1 else 0 end)
    +(case when skills>0 then 1 else 0 end);

  return jsonb_build_object(
    'progress_percent',completed*20,
    'checks',jsonb_build_array(
      jsonb_build_object('key','email','label','Verify email','complete',confirmed,'link','/workspace#profile'),
      jsonb_build_object('key','name','label','Confirm full name','complete',coalesce(trim(u."fullName"),'')<>'','link','/workspace#profile'),
      jsonb_build_object('key','phone','label','Add phone number','complete',u.phone_e164 is not null and trim(u.phone_e164)<>'','link','/workspace#profile'),
      jsonb_build_object('key','country','label','Set country','complete',u.phone_country_iso2 is not null,'link','/workspace#profile'),
      jsonb_build_object('key','skills','label','Add language or skill','complete',skills>0,'link','/workspace#profile')
    ),
    'active_projects',projects,
    'submissions',submitted,
    'skills',skills
  );
end
$$;

revoke execute on function public.get_my_onboarding_status() from anon, public;
grant execute on function public.get_my_onboarding_status() to authenticated, service_role;

revoke execute on function public.coreforge_connect_open_connector(uuid) from anon, public;
revoke execute on function public.coreforge_create_worker_key(text,jsonb) from anon, public;
revoke execute on function public.coreforge_revoke_worker(uuid) from anon, public;
revoke execute on function public.coreforge_set_auto_policy(uuid,boolean,numeric,numeric,integer) from anon, public;

grant execute on function public.coreforge_connect_open_connector(uuid) to authenticated, service_role;
grant execute on function public.coreforge_create_worker_key(text,jsonb) to authenticated, service_role;
grant execute on function public.coreforge_revoke_worker(uuid) to authenticated, service_role;
grant execute on function public.coreforge_set_auto_policy(uuid,boolean,numeric,numeric,integer) to authenticated, service_role;
