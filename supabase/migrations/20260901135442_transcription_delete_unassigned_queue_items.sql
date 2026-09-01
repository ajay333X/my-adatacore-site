create or replace function public.tx_delete_queue_items(p_project integer, p_items uuid[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  aid uuid;
  a public.transcription_audio_items;
  deleted jsonb := '[]'::jsonb;
  skipped integer := 0;
  pos integer := 0;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Admin access required';
  end if;
  if coalesce(cardinality(p_items),0) not between 1 and 100 then
    raise exception 'Select between 1 and 100 queue items';
  end if;
  if not exists(select 1 from public.project_lab where id=p_project and project_type='transcription') then
    raise exception 'Choose a transcription project';
  end if;

  perform pg_advisory_xact_lock(27481,p_project);

  for aid in select distinct unnest(p_items) loop
    select * into a
    from public.transcription_audio_items
    where id=aid and transcription_project_id=p_project
    for update;

    if not found
       or a.queue_state<>'queued'
       or a.status<>'unassigned'
       or a.task_id is not null
       or a.assigned_to is not null
       or a.review_task_id is not null then
      skipped:=skipped+1;
      continue;
    end if;

    deleted:=deleted||jsonb_build_array(jsonb_build_object(
      'id',a.id,
      'name',coalesce(a.display_name,regexp_replace(a.recording_path,'^.*/','')),
      'storage_bucket',a.storage_bucket,
      'recording_path',a.recording_path,
      'delete_storage',a.storage_bucket='transcription_audio'
    ));

    delete from public.transcription_audio_items where id=a.id;
  end loop;

  for aid in
    select id
    from public.transcription_audio_items
    where transcription_project_id=p_project
      and queue_state='queued'
      and status='unassigned'
      and task_id is null
    order by queue_position nulls last,created_at,id
    for update
  loop
    pos:=pos+1;
    update public.transcription_audio_items set queue_position=pos,updated_at=now() where id=aid;
  end loop;

  perform app_private.log_project_activity(
    p_project,
    'transcription.queue_deleted',
    'audio',
    null,
    jsonb_build_object('deleted',jsonb_array_length(deleted),'skipped',skipped)
  );

  return jsonb_build_object('deleted',deleted,'deleted_count',jsonb_array_length(deleted),'skipped',skipped);
end
$$;

revoke all on function public.tx_delete_queue_items(integer,uuid[]) from public;
grant execute on function public.tx_delete_queue_items(integer,uuid[]) to authenticated;
