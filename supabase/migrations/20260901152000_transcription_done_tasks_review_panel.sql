create or replace function public.tx_submission_status(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare a public.transcription_audio_items; m text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  m:=app_private.tx_mode(p_item);
  if m='none' then raise exception 'This transcription item is unavailable'; end if;
  select * into a from public.transcription_audio_items where id=p_item;
  if not found then raise exception 'Transcription item not found'; end if;
  return jsonb_build_object('item_id',a.id,'project_id',a.transcription_project_id,'status',a.status,'mode',m,'submitted_at',a.submitted_at);
end
$$;

create or replace function public.tx_admin_done_projects()
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.project_name,'description',p.description,
      'submitted_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.submitted_at is not null and a.status in ('submitted','in_review','approved')),
      'awaiting_review_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.status='submitted'),
      'in_review_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.status='in_review'),
      'approved_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.status='approved')
    ) order by p.project_name)
    from public.project_lab p
    where p.project_type='transcription' and exists(select 1 from public.transcription_audio_items a where a.transcription_project_id=p.id and a.submitted_at is not null)
  ),'[]'::jsonb);
end
$$;

create or replace function public.tx_admin_done_tasks(p_project integer)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.project_lab where id=p_project and project_type='transcription') then raise exception 'Choose a transcription project'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.submitted_at desc,x.item_id)
    from (
      select a.id as item_id,a.display_name,a.source_project_title,a.source_folder,a.duration_ms,a.status,a.submitted_at,a.reviewed_at,a.task_id,t.public_task_id,t."assignedTo" as assigned_to,u.id as contributor_id,u."fullName" as contributor_name,u.email as contributor_email,u."uniqueID" as contributor_uid,jsonb_array_length(coalesce(a.submitted_segments,'[]'::jsonb)) as segment_count
      from public.transcription_audio_items a
      left join public.tasks t on t.id=a.task_id
      left join public.users u on u.id=a.assigned_to
      where a.transcription_project_id=p_project and a.submitted_at is not null and a.status in ('submitted','in_review','approved')
      order by a.submitted_at desc,a.id
    ) x
  ),'[]'::jsonb);
end
$$;

create or replace function public.tx_admin_done_task(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare a public.transcription_audio_items; p public.project_lab; t public.tasks; rt public.tasks; u public.users; segs jsonb;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  select * into a from public.transcription_audio_items where id=p_item;
  if not found or a.submitted_at is null then raise exception 'Submitted transcription not found'; end if;
  select * into p from public.project_lab where id=a.transcription_project_id;
  if p.project_type is distinct from 'transcription' then raise exception 'Submitted transcription not found'; end if;
  if a.status not in ('submitted','in_review','approved','changes_requested') then raise exception 'This item has not reached the submitted review workflow'; end if;
  select * into t from public.tasks where id=a.task_id;
  select * into rt from public.tasks where id=a.review_task_id;
  select * into u from public.users where id=a.assigned_to;
  segs:=coalesce(a.submitted_segments,'[]'::jsonb);
  if jsonb_array_length(segs)=0 then segs:=app_private.tx_rows(a.id); end if;
  return jsonb_build_object(
    'project',jsonb_build_object('id',p.id,'name',p.project_name,'description',p.description),
    'item',jsonb_build_object('id',a.id,'display_name',a.display_name,'source_project_title',a.source_project_title,'source_folder',a.source_folder,'duration_ms',a.duration_ms,'duration_seconds',a.duration_seconds,'status',a.status,'submitted_at',a.submitted_at,'reviewed_at',a.reviewed_at,'storage_bucket',a.storage_bucket,'recording_path',a.recording_path,'speakers',coalesce(a.speakers,'[]'::jsonb),'segments',segs,'feedback',a.feedback),
    'task',case when t.id is null then null else jsonb_build_object('id',t.id,'public_task_id',t.public_task_id,'status',t.status,'rate',t.price,'layer',t.layer) end,
    'review_task',case when rt.id is null then null else jsonb_build_object('id',rt.id,'public_task_id',rt.public_task_id,'status',rt.status,'rate',rt.price,'layer',rt.layer) end,
    'contributor',case when u.id is null then null else jsonb_build_object('id',u.id,'name',u."fullName",'email',u.email,'uid',u."uniqueID") end
  );
end
$$;

revoke all on function public.tx_submission_status(uuid) from public,anon;
revoke all on function public.tx_admin_done_projects() from public,anon;
revoke all on function public.tx_admin_done_tasks(integer) from public,anon;
revoke all on function public.tx_admin_done_task(uuid) from public,anon;
grant execute on function public.tx_submission_status(uuid) to authenticated;
grant execute on function public.tx_admin_done_projects() to authenticated;
grant execute on function public.tx_admin_done_tasks(integer) to authenticated;
grant execute on function public.tx_admin_done_task(uuid) to authenticated;
