alter table public.transcription_audio_items
  add column if not exists queue_state text not null default 'queued',
  add column if not exists vaulted_at timestamptz,
  add column if not exists released_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.transcription_audio_items'::regclass
      and conname='transcription_audio_items_queue_state_check'
  ) then
    alter table public.transcription_audio_items
      add constraint transcription_audio_items_queue_state_check
      check (queue_state in ('vault','queued'));
  end if;
end $$;

create index if not exists transcription_audio_items_project_queue_created_idx
  on public.transcription_audio_items(transcription_project_id,queue_state,created_at,id);

create or replace function public.tx_get_lab(p_project_id integer default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 return jsonb_build_object(
 'projects',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.project_name,'description',p.description,'status',p.lifecycle_status,
   'count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.queue_state='queued'),
   'vault_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.queue_state='vault')
 ) order by p.id),'[]') from public.project_lab p where p.project_type='transcription'),
 'items',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('assignee',t."assignedTo",'reviewer',r."assignedTo",'task_status',t.status,'review_task_status',r.status) order by a.created_at desc),'[]')
   from public.transcription_audio_items a left join public.tasks t on t.id=a.task_id left join public.tasks r on r.id=a.review_task_id
   where a.transcription_project_id=p_project_id and a.queue_state='queued'),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u."fullName",'email',u.email,'uid',u."uniqueID") order by u."fullName"),'[]') from public.users u where u."accountStatus"='active'));
end $$;

create or replace function public.tx_get_vault(p_project_id integer default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 return jsonb_build_object(
   'projects',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.project_name,'description',p.description,'status',p.lifecycle_status,
      'vault_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.queue_state='vault'),
      'queue_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.queue_state='queued')
    ) order by p.id),'[]') from public.project_lab p where p.project_type='transcription'),
   'items',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]')
      from public.transcription_audio_items a where a.transcription_project_id=p_project_id and a.queue_state='vault')
 );
end $$;

create or replace function public.tx_register_vault_upload(p_project_id integer,p_path text,p_name text,p_folder text,p_duration_ms integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare aid uuid; size_bytes bigint;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id and project_type='transcription' and lifecycle_status='active') then raise exception 'Choose an active transcription project'; end if;
 if split_part(p_path,'/',1)<>p_project_id::text then raise exception 'Upload the audio before registering it'; end if;
 select case when (metadata->>'size') ~ '^[0-9]+$' then (metadata->>'size')::bigint end into size_bytes from storage.objects where bucket_id='transcription_audio' and name=p_path;
 if not found then raise exception 'Upload the audio before registering it'; end if;
 if lower(p_path) !~ '\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$' then raise exception 'Vault AI supports WAV, MP3, M4A, MP4, WebM, OGG or FLAC'; end if;
 if coalesce(size_bytes,0)>24000000 then raise exception 'Vault AI supports files up to 24 MB'; end if;
 if p_duration_ms is null or p_duration_ms not between 1 and 900000 then raise exception 'Vault audio must be 15 minutes or shorter'; end if;
 insert into public.transcription_audio_items(transcription_project_id,storage_bucket,recording_path,display_name,source_project_title,source_folder,duration_seconds,duration_ms,queue_state,vaulted_at)
 values(p_project_id,'transcription_audio',p_path,left(coalesce(nullif(trim(p_name),''),'Uploaded audio'),200),'External upload',left(coalesce(nullif(trim(p_folder),''),'Vault'),120),ceil(p_duration_ms/1000.0),p_duration_ms,'vault',now()) returning id into aid;
 perform app_private.tx_ai_queue_item(aid,auth.uid(),false);
 perform app_private.tx_ai_dispatch();
 return aid;
end $$;

create or replace function public.tx_import_sources_to_vault(p_project_id integer,p_sources jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare x jsonb;o storage.objects;v public.voice_recordings;n integer:=0;aid uuid;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id and project_type='transcription' and lifecycle_status='active') then raise exception 'Choose an active transcription project'; end if;
 if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 500 then raise exception 'Select 1–500 audio files'; end if;
 for x in select value from jsonb_array_elements(p_sources) loop
  aid:=null;
  select * into o from storage.objects where bucket_id=x->>'bucket' and name=x->>'path' and bucket_id in ('recordings','conversation_records');
  if o.id is null then raise exception 'Source audio no longer exists'; end if;
  select * into v from public.voice_recordings vr where vr.recording_path=o.name or vr.recording_path='https://llmhyezgcnbognmmsnzq.supabase.co/storage/v1/object/public/'||o.bucket_id||'/'||o.name limit 1;
  insert into public.transcription_audio_items(transcription_project_id,storage_bucket,recording_path,display_name,source_recording_id,source_project_id,source_project_title,source_folder,duration_seconds,duration_ms,queue_state,vaulted_at)
  values(p_project_id,o.bucket_id,o.name,regexp_replace(o.name,'^.*/',''),v.id,v.project_id,coalesce(v.project_title,split_part(o.name,'/',1)),case when position('/' in o.name)>0 then regexp_replace(o.name,'/[^/]*$','') else 'Root' end,coalesce(v.duration_seconds,0),coalesce(v.duration_seconds,0)*1000,'vault',now())
  on conflict(transcription_project_id,storage_bucket,recording_path) do nothing returning id into aid;
  if aid is not null then n:=n+1;perform app_private.tx_ai_queue_item(aid,auth.uid(),false);end if;
 end loop;
 perform app_private.tx_ai_dispatch();
 perform app_private.log_project_activity(p_project_id,'transcription.vault_imported','audio',null,jsonb_build_object('imported',n));
 return jsonb_build_object('imported',n,'duplicates',jsonb_array_length(p_sources)-n);
end $$;

create or replace function public.tx_release_vault(p_project integer,p_items uuid[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare aid uuid;a public.transcription_audio_items;j app_private.transcription_ai_jobs;seg jsonb;sp jsonb;ord integer;released integer:=0;skipped integer:=0;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if coalesce(cardinality(p_items),0) not between 1 and 100 then raise exception 'Select between 1 and 100 vault items'; end if;
 if not exists(select 1 from public.project_lab where id=p_project and project_type='transcription' and lifecycle_status='active') then raise exception 'Choose an active transcription project'; end if;
 for aid in select distinct unnest(p_items) loop
  select * into a from public.transcription_audio_items where id=aid and transcription_project_id=p_project for update;
  if not found or a.queue_state<>'vault' or a.status<>'unassigned' or a.task_id is not null then skipped:=skipped+1;continue;end if;
  select * into j from app_private.transcription_ai_jobs where audio_item_id=a.id and kind='draft' and status='ready' order by created_at desc,id desc limit 1;
  if not found or jsonb_array_length(coalesce(j.segments,'[]'::jsonb))=0 then skipped:=skipped+1;continue;end if;
  if not exists(select 1 from public.transcription_segments where audio_item_id=a.id) then
    if a.revision<>j.source_revision then skipped:=skipped+1;continue;end if;
    for seg,ord in select value,ordinality::integer from jsonb_array_elements(j.segments) with ordinality loop
      select value into sp from jsonb_array_elements(j.speakers) where value->>'id'=seg->>'speaker_id';
      insert into public.transcription_segments(id,audio_item_id,segment_index,speaker_id,speaker_label,start_ms,end_ms,transcript,lint_status)
      values((seg->>'id')::uuid,a.id,ord-1,seg->>'speaker_id',coalesce(sp->>'label','Speaker 1'),(seg->>'start_ms')::integer,(seg->>'end_ms')::integer,seg->>'transcript','warning');
    end loop;
    update public.transcription_audio_items set speakers=j.speakers,duration_ms=coalesce(j.duration_ms,duration_ms),duration_seconds=ceil(coalesce(j.duration_ms,duration_ms)::numeric/1000),revision=revision+1 where id=a.id;
  end if;
  update public.transcription_audio_items set queue_state='queued',released_at=now(),updated_at=now() where id=a.id;
  released:=released+1;
 end loop;
 perform app_private.log_project_activity(p_project,'transcription.vault_released','audio',null,jsonb_build_object('released',released,'skipped',skipped));
 return jsonb_build_object('released',released,'skipped',skipped);
end $$;

create or replace function public.tx_assign(p_project_id integer,p_user_keys text[],p_layer text default 'L1',p_quantity integer default 1,p_item_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare p public.project_lab;u public.users;a public.transcription_audio_items;k text;i integer;tid integer;pub text;result jsonb:='[]';
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if p_layer not in ('L1','L2') or p_layer is null or p_quantity is null or p_quantity not between 1 and 100 or coalesce(array_length(p_user_keys,1),0) not between 1 and 100 then raise exception 'Choose people, layer and a quantity between 1 and 100'; end if;
 select * into p from public.project_lab where id=p_project_id and project_type='transcription' for update;
 if p.id is null or p.lifecycle_status<>'active' then raise exception 'Choose an active transcription project'; end if;
 foreach k in array p_user_keys loop
  select * into u from public.users where lower(email)=lower(trim(k)) or "uniqueID"=trim(k) limit 1;
  if u.id is null or u."accountStatus"<>'active' or not app_private.user_has_project_access(u.id,p.project_name) then raise exception 'Participant unavailable or project access revoked: %',k; end if;
  for i in 1..p_quantity loop
   select ai.* into a from public.transcription_audio_items ai left join public.tasks t on t.id=ai.task_id left join public.tasks r on r.id=ai.review_task_id
   where ai.transcription_project_id=p_project_id and ai.queue_state='queued' and (p_item_ids is null or ai.id=any(p_item_ids))
   and ((p_layer='L1' and ai.status in ('unassigned','assigned','in_progress','changes_requested') and (ai.task_id is null or t.status='cancelled')) or (p_layer='L2' and ai.status in ('submitted','in_review') and (ai.review_task_id is null or r.status='cancelled') and lower(coalesce(t."assignedTo",'')) not in (lower(u.email),lower(coalesce(u."uniqueID",'')))))
   order by ai.created_at,ai.id limit 1 for update of ai skip locked;
   if a.id is null then raise exception 'Not enough eligible audio modules. Release AI-ready audio from the Vault for L1, or submit transcripts before assigning L2.'; end if;
   insert into public.tasks("assignedTo",title,price,layer,status,instructions) values(u.email,p.project_name,case when p_layer='L1' then p.l1_rate else p.l2_rate end,p_layer,'pending','Open the transcription workspace to segment, transcribe and review the audio.') returning id,public_task_id into tid,pub;
   if p_layer='L1' then update public.transcription_audio_items set task_id=tid,assigned_to=u.id,status='assigned',updated_at=now() where id=a.id;else update public.transcription_audio_items set review_task_id=tid,status='in_review',updated_at=now() where id=a.id;end if;
   result:=result||jsonb_build_array(jsonb_build_object('id',tid,'task_id',pub,'user',u.email,'audio_item_id',a.id));
  end loop;
 end loop;
 perform app_private.log_project_activity(p_project_id,'transcription.assigned','audio',null,jsonb_build_object('layer',p_layer,'count',jsonb_array_length(result)));
 return jsonb_build_object('created',jsonb_array_length(result),'tasks',result,'skipped','[]'::jsonb);
end $$;

create or replace function public.tx_ai_finish(p_job uuid,p_token uuid,p_result jsonb default null,p_error_code text default null,p_error_message text default null)
returns boolean language plpgsql security definer set search_path=''
as $$
declare j app_private.transcription_ai_jobs;a public.transcription_audio_items;seg jsonb;sp jsonb;ord integer;seeded boolean:=false;
begin
 select audio_item_id into a.id from app_private.transcription_ai_jobs where id=p_job;
 if a.id is not null then select * into a from public.transcription_audio_items where id=a.id for update;end if;
 select * into j from app_private.transcription_ai_jobs where id=p_job and dispatch_token=p_token and status='running' for update;
 if not found then return false;end if;
 if p_error_code is not null then update app_private.transcription_ai_jobs set status='failed',error_code=left(p_error_code,80),error_message=left(p_error_message,400),finished_at=now(),dispatch_token=null where id=j.id;return true;end if;
 if j.kind='draft' then
  if jsonb_typeof(p_result->'segments') is distinct from 'array' or jsonb_array_length(p_result->'segments') not between 1 and 3000 or jsonb_typeof(p_result->'speakers') is distinct from 'array' or jsonb_array_length(p_result->'speakers') not between 1 and 12 or coalesce((p_result->>'duration_ms')::integer,0) not between 1 and 900000 then raise exception 'Invalid AI draft';end if;
  for seg in select value from jsonb_array_elements(p_result->'segments') loop
   if (seg->>'start_ms')::integer<0 or (seg->>'end_ms')::integer<=(seg->>'start_ms')::integer or (seg->>'end_ms')::integer>(p_result->>'duration_ms')::integer or length(coalesce(seg->>'transcript','')) not between 1 and 20000 or not exists(select 1 from jsonb_array_elements(p_result->'speakers') s where s->>'id'=seg->>'speaker_id') then raise exception 'Invalid AI segment';end if;
  end loop;
  seeded:=a.revision=0 and j.source_revision=0 and a.task_id is null and a.status='unassigned' and a.queue_state='queued' and not exists(select 1 from public.transcription_segments where audio_item_id=a.id) and exists(select 1 from public.project_lab where id=a.transcription_project_id and lifecycle_status='active');
  if seeded then
   for seg,ord in select value,ordinality::integer from jsonb_array_elements(p_result->'segments') with ordinality loop
    select value into sp from jsonb_array_elements(p_result->'speakers') where value->>'id'=seg->>'speaker_id';
    insert into public.transcription_segments(id,audio_item_id,segment_index,speaker_id,speaker_label,start_ms,end_ms,transcript,lint_status) values((seg->>'id')::uuid,a.id,ord-1,seg->>'speaker_id',sp->>'label',(seg->>'start_ms')::integer,(seg->>'end_ms')::integer,seg->>'transcript','warning');
   end loop;
   update public.transcription_audio_items set speakers=p_result->'speakers',duration_ms=(p_result->>'duration_ms')::integer,duration_seconds=ceil((p_result->>'duration_ms')::numeric/1000),revision=revision+1,updated_at=now() where id=a.id;
  end if;
 end if;
 update app_private.transcription_ai_jobs set status='ready',segments=coalesce(p_result->'segments','[]'),speakers=coalesce(p_result->'speakers','[]'),duration_ms=(p_result->>'duration_ms')::integer,applied=seeded,finished_at=now(),dispatch_token=null where id=j.id;
 return true;
end $$;

create or replace function public.tx_submit(p_item uuid,p_revision integer,p_action text default 'submit',p_feedback text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare a public.transcription_audio_items;m text;rows jsonb;tid integer;u public.users;t public.tasks;newstatus text;
begin
 select * into u from public.users where id=auth.uid() for update;
 m:=app_private.tx_mode(p_item);if m='none' then raise exception 'This audio is not assigned to you'; end if;
 select * into a from public.transcription_audio_items where id=p_item for update;
 if a.queue_state<>'queued' then raise exception 'Release this audio from the Vault before submitting it'; end if;
 if a.revision is distinct from p_revision then raise exception 'VERSION_CONFLICT: Reload the latest transcript'; end if;
 if not exists(select 1 from public.project_lab where id=a.transcription_project_id and lifecycle_status='active') then raise exception 'Project is paused'; end if;
 if p_action='submit' then if m not in ('contributor','admin') or a.status not in ('assigned','in_progress','changes_requested','unassigned') then raise exception 'Transcript cannot be submitted at this stage'; end if;tid:=a.task_id;newstatus:='submitted';
 elsif p_action in ('approve','request_changes') then if m not in ('reviewer','admin') or a.status not in ('submitted','in_review') then raise exception 'Review access required'; end if;if p_action='request_changes' and length(trim(coalesce(p_feedback,'')))<3 then raise exception 'Add feedback explaining the requested changes'; end if;tid:=a.review_task_id;newstatus:=case when p_action='approve' then 'approved' else 'changes_requested' end;
 else raise exception 'Invalid submission action';end if;
 if m<>'admin' then perform app_private.consume_daily_work_slot(tid,auth.uid(),'task:'||tid);end if;
 rows:=app_private.tx_rows(a.id);
 if p_action<>'request_changes' then if jsonb_array_length(rows)=0 then raise exception 'Add at least one transcript segment'; end if;if exists(select 1 from public.transcription_segments s where s.audio_item_id=a.id and (s.end_ms<=s.start_ms or s.end_ms>a.duration_ms or trim(s.transcript)='')) then raise exception 'Fix empty text and invalid segment times before submission'; end if;if exists(select 1 from public.transcription_segments s join public.transcription_segments other on s.audio_item_id=other.audio_item_id and s.speaker_id=other.speaker_id and s.id<other.id and s.start_ms<other.end_ms and other.start_ms<s.end_ms where s.audio_item_id=a.id) then raise exception 'Resolve overlapping segments for the same speaker'; end if;end if;
 insert into app_private.transcription_history(audio_item_id,actor_id,revision,action,segments,speakers,feedback) values(a.id,auth.uid(),a.revision+1,p_action,rows,a.speakers,left(p_feedback,10000));
 update public.transcription_audio_items set status=newstatus,revision=revision+1,submitted_segments=case when p_action='submit' then rows else submitted_segments end,submitted_at=case when p_action='submit' then now() else submitted_at end,reviewed_at=case when p_action<>'submit' then now() else reviewed_at end,feedback=case when p_action<>'submit' then left(p_feedback,10000) else feedback end,updated_at=now() where id=a.id returning * into a;
 if tid is not null then update public.tasks set status='submitted' where id=tid;end if;
 if p_action='submit' and a.task_id is not null then select * into t from public.tasks where id=a.task_id;select * into u from public.users where lower(email)=lower(t."assignedTo") or lower("uniqueID")=lower(t."assignedTo") limit 1;if not exists(select 1 from public.submissions where task_id=a.task_id) then insert into public.submissions("workerUID","projectTitle","earnedAmount","audioData",status,task_id) values(u."uniqueID",t.title,coalesce(t.price,0),'transcription:'||a.id,'Pending',t.id);else update public.submissions set status='Pending' where task_id=a.task_id;end if;
 elsif p_action='request_changes' then update public.tasks set status='pending' where id=a.task_id and status='submitted';update public.transcription_audio_items set review_task_id=null where id=a.id;
 elsif p_action='approve' then update public.submissions set status='Reviewed',reviewed_at=now() where task_id=a.task_id;end if;
 return jsonb_build_object('revision',a.revision,'status',newstatus);
end $$;

revoke execute on function public.tx_get_vault(integer) from public,anon;
revoke execute on function public.tx_register_vault_upload(integer,text,text,text,integer) from public,anon;
revoke execute on function public.tx_import_sources_to_vault(integer,jsonb) from public,anon;
revoke execute on function public.tx_release_vault(integer,uuid[]) from public,anon;
grant execute on function public.tx_get_vault(integer) to authenticated;
grant execute on function public.tx_register_vault_upload(integer,text,text,text,integer) to authenticated;
grant execute on function public.tx_import_sources_to_vault(integer,jsonb) to authenticated;
grant execute on function public.tx_release_vault(integer,uuid[]) to authenticated;
