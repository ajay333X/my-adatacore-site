create or replace function public.admin_get_transcription_project_settings(p_project_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_p public.project_lab;
begin
  if not app_private.is_admin() then raise exception 'Admin only'; end if;
  select * into v_p from public.project_lab where id=p_project_id;
  if v_p.id is null then raise exception 'Project not found'; end if;
  if v_p.project_type <> 'transcription' then raise exception 'Not a transcription project'; end if;
  return jsonb_build_object(
    'id',v_p.id,'name',v_p.project_name,'description',v_p.description,'project_type',v_p.project_type,
    'lifecycle_status',v_p.lifecycle_status,'published',coalesce(v_p.is_published,false),
    'l1_rate',coalesce(v_p.l1_rate,0),'l2_rate',coalesce(v_p.l2_rate,0),
    'language',coalesce(v_p.transcription_language,'hi'),
    'hourly_rate',coalesce(v_p.transcription_hourly_rate,0),
    'currency',coalesce(nullif(v_p.transcription_currency,''),'USD'),
    'config',coalesce(v_p.config,'{}'::jsonb),'style_config',coalesce(v_p.style_config,'{}'::jsonb),
    'updated_at',v_p.updated_at
  );
end $$;

create or replace function public.admin_update_transcription_project_settings(
  p_project_id integer,
  p_language text,
  p_hourly_rate numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_p public.project_lab;
  v_language text:=lower(trim(coalesce(p_language,'')));
  v_currency text:=upper(trim(coalesce(p_currency,'')));
begin
  if not app_private.is_admin() then raise exception 'Admin only'; end if;
  select * into v_p from public.project_lab where id=p_project_id for update;
  if v_p.id is null then raise exception 'Project not found'; end if;
  if v_p.project_type <> 'transcription' then raise exception 'Not a transcription project'; end if;
  if v_language not in ('hi','en','mr','bn','ta','te','gu','kn','ml','pa','ur') then raise exception 'Unsupported transcription language'; end if;
  if p_hourly_rate is null or p_hourly_rate < 0 then raise exception 'Hourly rate must be zero or greater'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code'; end if;

  update public.project_lab
  set transcription_language=v_language,
      transcription_hourly_rate=p_hourly_rate,
      transcription_currency=v_currency,
      updated_at=now(),
      updated_by=auth.uid()
  where id=p_project_id;

  perform app_private.log_project_activity(
    p_project_id,'transcription.settings.updated','project',p_project_id::text,
    jsonb_build_object('language',v_language,'hourly_rate',p_hourly_rate,'currency',v_currency)
  );

  return public.admin_get_transcription_project_settings(p_project_id);
end $$;

revoke all on function public.admin_get_transcription_project_settings(integer) from public, anon, authenticated;
revoke all on function public.admin_update_transcription_project_settings(integer,text,numeric,text) from public, anon, authenticated;
grant execute on function public.admin_get_transcription_project_settings(integer) to authenticated;
grant execute on function public.admin_update_transcription_project_settings(integer,text,numeric,text) to authenticated;
