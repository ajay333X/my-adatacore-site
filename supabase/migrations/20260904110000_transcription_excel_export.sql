-- Admin-only paginated export payload for secure transcription .xlsx generation.
create or replace function public.tx_export_project_page(
  p_project_id integer,
  p_offset integer default 0,
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.project_lab;
  result jsonb;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Admin access required';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Invalid export offset';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Export page size must be between 1 and 100';
  end if;

  select * into p
  from public.project_lab
  where id=p_project_id and project_type='transcription';
  if not found then raise exception 'Transcription project not found'; end if;

  select jsonb_build_object(
    'project', jsonb_build_object(
      'id',p.id,
      'name',p.project_name,
      'description',p.description,
      'status',p.lifecycle_status,
      'language',p.transcription_language,
      'l1_rate',p.l1_rate,
      'l2_rate',p.l2_rate,
      'hourly_rate',p.transcription_hourly_rate,
      'currency',p.transcription_currency,
      'created_at',p.created_at,
      'updated_at',p.updated_at
    ),
    'total',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id),
    'offset',p_offset,
    'limit',p_limit,
    'items',coalesce((
      select jsonb_agg(x.item order by x.created_at,x.id)
      from (
        select a.created_at,a.id,
          jsonb_build_object(
            'id',a.id,
            'transcription_project_id',a.transcription_project_id,
            'display_name',a.display_name,
            'storage_bucket',a.storage_bucket,
            'recording_path',a.recording_path,
            'source_recording_id',a.source_recording_id,
            'source_project_id',a.source_project_id,
            'source_project_title',a.source_project_title,
            'source_folder',a.source_folder,
            'source_original_name',a.source_original_name,
            'source_chunk_index',a.source_chunk_index,
            'source_chunk_count',a.source_chunk_count,
            'source_start_ms',a.source_start_ms,
            'source_end_ms',a.source_end_ms,
            'source_split_mode',a.source_split_mode,
            'duration_seconds',a.duration_seconds,
            'duration_ms',a.duration_ms,
            'status',a.status,
            'queue_state',a.queue_state,
            'queue_position',a.queue_position,
            'revision',a.revision,
            'feedback',a.feedback,
            'created_at',a.created_at,
            'updated_at',a.updated_at,
            'submitted_at',a.submitted_at,
            'reviewed_at',a.reviewed_at,
            'vaulted_at',a.vaulted_at,
            'released_at',a.released_at,
            'archived_at',a.archived_at,
            'upload_group_id',a.upload_group_id,
            'speakers',a.speakers,
            'l1_task',case when t.id is null then null else jsonb_build_object(
              'id',t.id,'public_task_id',t.public_task_id,'assigned_to',t."assignedTo",'status',t.status,
              'layer',t.layer,'price',t.price,'created_at',t."createdAt",'started_at',t.started_at,
              'worker',case when l1u.id is null then null else jsonb_build_object('id',l1u.id,'name',l1u."fullName",'email',l1u.email,'uid',l1u."uniqueID") end
            ) end,
            'l2_task',case when r.id is null then null else jsonb_build_object(
              'id',r.id,'public_task_id',r.public_task_id,'assigned_to',r."assignedTo",'status',r.status,
              'layer',r.layer,'price',r.price,'created_at',r."createdAt",'started_at',r.started_at,
              'worker',case when l2u.id is null then null else jsonb_build_object('id',l2u.id,'name',l2u."fullName",'email',l2u.email,'uid',l2u."uniqueID") end
            ) end,
            'current_segments',coalesce((
              select jsonb_agg(jsonb_build_object(
                'id',s.id,'segment_index',s.segment_index,'speaker_id',s.speaker_id,'speaker_label',s.speaker_label,
                'start_ms',s.start_ms,'end_ms',s.end_ms,'transcript',s.transcript,'confidence',s.confidence,
                'lint_status',s.lint_status,'metadata',s.metadata,'created_at',s.created_at,'updated_at',s.updated_at
              ) order by s.segment_index,s.start_ms,s.id)
              from public.transcription_segments s where s.audio_item_id=a.id
            ),'[]'::jsonb),
            'history',coalesce((
              select jsonb_agg(jsonb_build_object(
                'id',h.id,'revision',h.revision,'action',h.action,'segments',h.segments,'speakers',h.speakers,
                'feedback',h.feedback,'created_at',h.created_at,
                'actor',case when hu.id is null then null else jsonb_build_object('id',hu.id,'name',hu."fullName",'email',hu.email,'uid',hu."uniqueID") end
              ) order by h.revision desc,h.created_at desc,h.id desc)
              from app_private.transcription_history h
              left join public.users hu on hu.id=h.actor_id
              where h.audio_item_id=a.id
            ),'[]'::jsonb),
            'ai_jobs',coalesce((
              select jsonb_agg(jsonb_build_object(
                'id',j.id,'kind',j.kind,'status',j.status,'source_revision',j.source_revision,'language',j.language,
                'model',j.model,'created_at',j.created_at,'started_at',j.started_at,'finished_at',j.finished_at,
                'segments',j.segments,'speakers',j.speakers,'duration_ms',j.duration_ms,'applied',j.applied,
                'error_code',j.error_code,'error_message',j.error_message,
                'requested_by',case when ju.id is null then null else jsonb_build_object('id',ju.id,'name',ju."fullName",'email',ju.email,'uid',ju."uniqueID") end
              ) order by j.created_at desc,j.id desc)
              from app_private.transcription_ai_jobs j
              left join public.users ju on ju.id=j.requested_by
              where j.audio_item_id=a.id and j.kind='draft'
            ),'[]'::jsonb)
          ) as item
        from public.transcription_audio_items a
        left join public.tasks t on t.id=a.task_id
        left join public.tasks r on r.id=a.review_task_id
        left join lateral (
          select u.* from public.users u
          where t."assignedTo" is not null and (lower(u.email)=lower(t."assignedTo") or lower(coalesce(u."uniqueID",''))=lower(t."assignedTo"))
          limit 1
        ) l1u on true
        left join lateral (
          select u.* from public.users u
          where r."assignedTo" is not null and (lower(u.email)=lower(r."assignedTo") or lower(coalesce(u."uniqueID",''))=lower(r."assignedTo"))
          limit 1
        ) l2u on true
        where a.transcription_project_id=p.id
        order by a.created_at,a.id
        offset p_offset limit p_limit
      ) x
    ),'[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.tx_export_project_page(integer,integer,integer) from public,anon;
grant execute on function public.tx_export_project_page(integer,integer,integer) to authenticated;
