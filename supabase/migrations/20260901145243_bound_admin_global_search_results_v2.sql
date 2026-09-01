create or replace function public.admin_global_search(p_query text,p_limit integer default 24)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  q text:=lower(trim(coalesce(p_query,'')));
  task_q text:=lower(regexp_replace(trim(coalesce(p_query,'')),'^task[[:space:]#:\-]*','','i'));
  lim integer:=greatest(5,least(coalesce(p_limit,24),40));
  result jsonb;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  if q='' then return '[]'::jsonb; end if;

  with all_results as (
    select * from (
      select 'participant'::text as kind,
             coalesce(u.email,u."uniqueID",u.id::text)::text as key,
             coalesce(nullif(u."fullName",''),u.email,u."uniqueID",'Unnamed participant')::text as title,
             concat_ws(' · ',u.email,case when u."uniqueID" is not null then 'UID '||u."uniqueID" end)::text as meta,
             coalesce(u."accountStatus",'unknown')::text as status,
             null::text as url,
             case when lower(coalesce(u.email,''))=q or lower(coalesce(u."uniqueID",''))=q then 0
                  when lower(coalesce(u."fullName",''))=q then 1
                  when lower(coalesce(u.email,'')) like q||'%' or lower(coalesce(u."uniqueID",'')) like q||'%' or lower(coalesce(u."fullName",'')) like q||'%' then 5
                  else 15 end::integer as rank
      from public.users u
      where lower(coalesce(u.email,'')) like '%'||q||'%'
         or lower(coalesce(u."uniqueID",'')) like '%'||q||'%'
         or lower(coalesce(u."fullName",'')) like '%'||q||'%'
      order by rank,coalesce(u."fullName",u.email)
      limit 10
    ) participants
    union all
    select * from (
      select 'task'::text as kind,
             coalesce(t.public_task_id,t.id::text)::text as key,
             ('Task '||coalesce(t.public_task_id,'#'||t.id::text))::text as title,
             concat_ws(' · ',t.title,t.layer,t."assignedTo")::text as meta,
             coalesce(t.status,'unknown')::text as status,
             null::text as url,
             case when lower(coalesce(t.public_task_id,''))=task_q or t.id::text=q then 0
                  when lower(coalesce(t.public_task_id,'')) like task_q||'%' then 3
                  when lower(coalesce(t.title,''))=q then 12
                  else 20 end::integer as rank
      from public.tasks t
      where (task_q<>'' and lower(coalesce(t.public_task_id,'')) like '%'||task_q||'%')
         or (q ~ '^[0-9]+$' and t.id::text=q)
         or (length(q)>=3 and (lower(coalesce(t.title,'')) like '%'||q||'%' or lower(coalesce(t."assignedTo",'')) like '%'||q||'%'))
      order by rank,t."createdAt" desc
      limit 10
    ) tasks
    union all
    select * from (
      select 'project'::text as kind,
             p.id::text as key,
             p.project_name::text as title,
             concat_ws(' · ',coalesce(p.project_type,'project'),nullif(p.description,''))::text as meta,
             coalesce(p.lifecycle_status,'unknown')::text as status,
             case when p.project_type='transcription' then '/admin/transcription?project='||p.id::text else '/admin/project-lab?project='||p.id::text end::text as url,
             case when lower(p.project_name)=q then 2 when lower(p.project_name) like q||'%' then 6 else 18 end::integer as rank
      from public.project_lab p
      where lower(coalesce(p.project_name,'')) like '%'||q||'%'
         or (length(q)>=3 and lower(coalesce(p.description,'')) like '%'||q||'%')
      order by rank,p.id desc
      limit 8
    ) projects
    union all
    select * from (
      select 'audio'::text as kind,
             a.id::text as key,
             coalesce(nullif(a.display_name,''),a.id::text)::text as title,
             concat_ws(' · ',coalesce(a.source_project_title,'Transcription audio'),nullif(a.source_folder,''),'Audio module')::text as meta,
             coalesce(a.status,'unknown')::text as status,
             ('/transcription?item='||a.id::text)::text as url,
             case when lower(a.id::text)=q then 1
                  when lower(coalesce(a.display_name,''))=q then 4
                  when lower(a.id::text) like q||'%' then 7
                  else 22 end::integer as rank
      from public.transcription_audio_items a
      where lower(a.id::text) like '%'||q||'%'
         or lower(coalesce(a.display_name,'')) like '%'||q||'%'
         or lower(coalesce(a.source_project_title,'')) like '%'||q||'%'
         or lower(coalesce(a.source_folder,'')) like '%'||q||'%'
      order by rank,a.updated_at desc
      limit 10
    ) audio
  ), limited as (
    select * from all_results order by rank,kind,title limit lim
  )
  select coalesce(jsonb_agg(to_jsonb(limited)-'rank' order by rank,kind,title),'[]'::jsonb) into result from limited;
  return result;
end
$$;

revoke all on function public.admin_global_search(text,integer) from public,anon;
grant execute on function public.admin_global_search(text,integer) to authenticated;
