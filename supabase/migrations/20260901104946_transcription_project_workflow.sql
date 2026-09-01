-- Separate audio transcription projects, assignments and versioned review workflow.
alter table public.transcription_audio_items
 add column if not exists storage_bucket text not null default 'conversation_records',
 add column if not exists display_name text,
 add column if not exists task_id integer references public.tasks(id) on delete set null,
 add column if not exists review_task_id integer references public.tasks(id) on delete set null,
 add column if not exists revision integer not null default 0,
 add column if not exists duration_ms integer not null default 0,
 add column if not exists speakers jsonb not null default '[{"id":"speaker-1","label":"Speaker 1","channel":0},{"id":"speaker-2","label":"Speaker 2","channel":0}]',
 add column if not exists submitted_segments jsonb not null default '[]',
 add column if not exists feedback text not null default '',
 add column if not exists submitted_at timestamptz,
 add column if not exists reviewed_at timestamptz;
alter table public.transcription_audio_items drop constraint if exists transcription_audio_items_status_check;
alter table public.transcription_audio_items add constraint transcription_audio_items_status_check check(status in ('unassigned','assigned','in_progress','submitted','in_review','changes_requested','approved','reviewed'));
alter table public.transcription_audio_items drop constraint if exists transcription_audio_items_transcription_project_id_recordin_key;
create unique index if not exists tx_audio_source_unique on public.transcription_audio_items(transcription_project_id,storage_bucket,recording_path);
create unique index if not exists tx_audio_task_unique on public.transcription_audio_items(task_id) where task_id is not null;
create unique index if not exists tx_audio_review_task_unique on public.transcription_audio_items(review_task_id) where review_task_id is not null;
create index if not exists tx_audio_queue on public.transcription_audio_items(transcription_project_id,status,created_at);
alter table public.transcription_segments add column if not exists speaker_id text not null default 'speaker-1';
create table if not exists app_private.transcription_history(
 id bigint generated always as identity primary key,
 audio_item_id uuid not null references public.transcription_audio_items(id) on delete cascade,
 actor_id uuid references public.users(id) on delete set null,
 revision integer not null,action text not null,segments jsonb not null,speakers jsonb not null,
 feedback text,created_at timestamptz not null default now()
);
alter table app_private.transcription_history enable row level security;
revoke all on app_private.transcription_history from public,anon,authenticated;
create index if not exists tx_history_item on app_private.transcription_history(audio_item_id,created_at desc);

create or replace function app_private.tx_sync_inventory() returns trigger language plpgsql security definer set search_path='' as $$
declare pid integer;
begin
 pid:=coalesce(new.transcription_project_id,old.transcription_project_id);
 if not exists(select 1 from public.project_lab where id=pid) then return null;end if;
 insert into public.project_task_inventory(project_id,l1_available,l2_available)
 select pid,count(*) filter(where a.status='unassigned'),count(*) filter(where a.status='submitted' and a.review_task_id is null) from public.transcription_audio_items a where a.transcription_project_id=pid
 on conflict(project_id) do update set l1_available=excluded.l1_available,l2_available=excluded.l2_available,updated_at=now();
 return null;
end $$;
revoke all on function app_private.tx_sync_inventory() from public,anon,authenticated;
create trigger tx_sync_inventory after insert or update or delete on public.transcription_audio_items for each row execute function app_private.tx_sync_inventory();

create or replace function app_private.tx_mode(p_item uuid) returns text language sql stable security definer set search_path='' as $$
 select case when public.is_active_admin() then 'admin'
 when exists(select 1 from public.transcription_audio_items a join public.tasks t on t.id=a.review_task_id join public.users u on u.id=auth.uid() join public.project_lab p on p.id=a.transcription_project_id
 where a.id=p_item and u."accountStatus"='active' and lower(t."assignedTo") in (lower(u.email),lower(u."uniqueID")) and t.status<>'cancelled' and app_private.has_project_access(p.project_name) and not exists(select 1 from public.tasks own where own.id=a.task_id and lower(own."assignedTo") in (lower(u.email),lower(u."uniqueID")))) then 'reviewer'
 when exists(select 1 from public.transcription_audio_items a join public.tasks t on t.id=a.task_id join public.users u on u.id=auth.uid() join public.project_lab p on p.id=a.transcription_project_id
 where a.id=p_item and u."accountStatus"='active' and lower(t."assignedTo") in (lower(u.email),lower(u."uniqueID")) and t.status<>'cancelled' and app_private.has_project_access(p.project_name)) then 'contributor' else 'none' end
$$;
revoke all on function app_private.tx_mode(uuid) from public,anon,authenticated;

create or replace function public.tx_can_read_audio(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_active_admin() or exists(select 1 from public.transcription_audio_items a where a.storage_bucket=p_bucket and a.recording_path=p_path and app_private.tx_mode(a.id)<>'none'))
$$;
revoke all on function public.tx_can_read_audio(text,text) from public,anon;
grant execute on function public.tx_can_read_audio(text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('transcription_audio','transcription_audio',false,52428800,array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/webm','audio/ogg','audio/mp4','audio/x-m4a','audio/flac','audio/aac']) on conflict(id) do nothing;
create policy transcription_storage_read on storage.objects for select to authenticated using(bucket_id in ('recordings','conversation_records','transcription_audio') and public.tx_can_read_audio(bucket_id,name));
-- This older policy had no USING expression and allowed every authenticated user
-- to read every bucket. Restrict it to its intended administrator audience.
alter policy "Allow admin access to conversation vault" on storage.objects using(public.is_active_admin());
create policy transcription_storage_upload on storage.objects for insert to authenticated with check(bucket_id='transcription_audio' and public.is_active_admin() and exists(select 1 from public.project_lab p where p.id::text=split_part(name,'/',1) and p.project_type='transcription'));
create policy transcription_storage_cleanup on storage.objects for delete to authenticated using(bucket_id='transcription_audio' and public.is_active_admin() and not exists(select 1 from public.transcription_audio_items a where a.storage_bucket=bucket_id and a.recording_path=name));

create or replace function public.tx_create_project(p_name text default 'Transcription',p_description text default '') returns integer language plpgsql security definer set search_path='' as $$
declare pid integer;
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if length(trim(p_name)) not between 1 and 120 then raise exception 'Enter a project name (1–120 characters)'; end if;
 insert into public.project_lab(project_name,project_type,description,config,is_published,lifecycle_status,l1_rate,l2_rate)
 values(trim(p_name),'transcription',p_description,'{"mode":"transcription","review_flow":"transcription_audit"}',true,'active',0,0) returning id into pid;
 return pid;
end $$;

create or replace function public.tx_get_lab(p_project_id integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 return jsonb_build_object(
 'projects',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.project_name,'description',p.description,'status',p.lifecycle_status,'count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id)) order by p.id),'[]') from public.project_lab p where p.project_type='transcription'),
 'items',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('assignee',t."assignedTo",'reviewer',r."assignedTo",'task_status',t.status,'review_task_status',r.status) order by a.created_at desc),'[]') from public.transcription_audio_items a left join public.tasks t on t.id=a.task_id left join public.tasks r on r.id=a.review_task_id where a.transcription_project_id=p_project_id),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u."fullName",'email',u.email,'uid',u."uniqueID") order by u."fullName"),'[]') from public.users u where u."accountStatus"='active'));
end $$;

-- Sources are actual stored objects, including older project/folder recordings.
create or replace function public.tx_audio_sources() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('key',o.id,'bucket',o.bucket_id,'path',o.name,'name',regexp_replace(o.name,'^.*/',''),'project',coalesce(v.project_title,split_part(o.name,'/',1)),'folder',case when position('/' in o.name)>0 then regexp_replace(o.name,'/[^/]*$','') else 'Root' end,'recording_id',v.id,'duration_seconds',coalesce(v.duration_seconds,0)) order by o.created_at desc),'[]')
 from storage.objects o left join lateral (select vr.* from public.voice_recordings vr where vr.recording_path=o.name or vr.recording_path='https://llmhyezgcnbognmmsnzq.supabase.co/storage/v1/object/public/'||o.bucket_id||'/'||o.name limit 1) v on true
 where o.bucket_id in ('recordings','conversation_records') and o.name ~* '\.(webm|wav|mp3|ogg|m4a|mp4|flac|aac)$');
end $$;

create or replace function public.tx_import_sources(p_project_id integer,p_sources jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare x jsonb;o storage.objects;v public.voice_recordings;n integer:=0;added integer;
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id and project_type='transcription') then raise exception 'Choose a transcription project'; end if;
 if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 500 then raise exception 'Select 1–500 audio files'; end if;
 for x in select value from jsonb_array_elements(p_sources) loop
  select * into o from storage.objects where bucket_id=x->>'bucket' and name=x->>'path' and bucket_id in ('recordings','conversation_records');
  if o.id is null then raise exception 'Source audio no longer exists'; end if;
  select * into v from public.voice_recordings vr where vr.recording_path=o.name or vr.recording_path='https://llmhyezgcnbognmmsnzq.supabase.co/storage/v1/object/public/'||o.bucket_id||'/'||o.name limit 1;
  insert into public.transcription_audio_items(transcription_project_id,storage_bucket,recording_path,display_name,source_recording_id,source_project_id,source_project_title,source_folder,duration_seconds,duration_ms)
  values(p_project_id,o.bucket_id,o.name,regexp_replace(o.name,'^.*/',''),v.id,v.project_id,coalesce(v.project_title,split_part(o.name,'/',1)),case when position('/' in o.name)>0 then regexp_replace(o.name,'/[^/]*$','') else 'Root' end,coalesce(v.duration_seconds,0),coalesce(v.duration_seconds,0)*1000)
  on conflict(transcription_project_id,storage_bucket,recording_path) do nothing;
  get diagnostics added=row_count;n:=n+added;
 end loop;
 perform app_private.log_project_activity(p_project_id,'transcription.imported','audio',null,jsonb_build_object('imported',n));
 return jsonb_build_object('imported',n,'duplicates',jsonb_array_length(p_sources)-n);
end $$;

create or replace function public.tx_register_upload(p_project_id integer,p_path text,p_name text,p_folder text,p_duration_ms integer) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid;
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id and project_type='transcription') then raise exception 'Choose a transcription project'; end if;
 if split_part(p_path,'/',1)<>p_project_id::text or not exists(select 1 from storage.objects where bucket_id='transcription_audio' and name=p_path) then raise exception 'Upload the audio before registering it'; end if;
 if p_duration_ms is null or p_duration_ms not between 1 and 14400000 then raise exception 'Audio duration must be between 0 and 4 hours'; end if;
 insert into public.transcription_audio_items(transcription_project_id,storage_bucket,recording_path,display_name,source_project_title,source_folder,duration_seconds,duration_ms)
 values(p_project_id,'transcription_audio',p_path,left(coalesce(nullif(trim(p_name),''),'Uploaded audio'),200),'External upload',left(coalesce(nullif(trim(p_folder),''),'Uploads'),120),ceil(p_duration_ms/1000.0),p_duration_ms) returning id into aid;
 return aid;
end $$;

create or replace function public.tx_assign(p_project_id integer,p_user_keys text[],p_layer text default 'L1',p_quantity integer default 1,p_item_ids uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
   where ai.transcription_project_id=p_project_id and (p_item_ids is null or ai.id=any(p_item_ids))
   and ((p_layer='L1' and ai.status in ('unassigned','assigned','in_progress','changes_requested') and (ai.task_id is null or t.status='cancelled'))
    or (p_layer='L2' and ai.status in ('submitted','in_review') and (ai.review_task_id is null or r.status='cancelled') and lower(coalesce(t."assignedTo",'')) not in (lower(u.email),lower(coalesce(u."uniqueID",'')))))
   order by ai.created_at,ai.id limit 1 for update of ai skip locked;
   if a.id is null then raise exception 'Not enough eligible audio modules. Import audio for L1, or submit transcripts before assigning L2. Reviewers must differ from transcribers.'; end if;
   insert into public.tasks("assignedTo",title,price,layer,status,instructions) values(u.email,p.project_name,case when p_layer='L1' then p.l1_rate else p.l2_rate end,p_layer,'pending','Open the transcription workspace to segment, transcribe and review the audio.') returning id,public_task_id into tid,pub;
   if p_layer='L1' then update public.transcription_audio_items set task_id=tid,assigned_to=u.id,status='assigned',updated_at=now() where id=a.id;
   else update public.transcription_audio_items set review_task_id=tid,status='in_review',updated_at=now() where id=a.id;end if;
   result:=result||jsonb_build_array(jsonb_build_object('id',tid,'task_id',pub,'user',u.email,'audio_item_id',a.id));
  end loop;
 end loop;
 perform app_private.log_project_activity(p_project_id,'transcription.assigned','audio',null,jsonb_build_object('layer',p_layer,'count',jsonb_array_length(result)));
 return jsonb_build_object('created',jsonb_array_length(result),'tasks',result,'skipped','[]'::jsonb);
end $$;

create or replace function app_private.tx_rows(p_item uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'speaker_id',speaker_id,'speaker_label',speaker_label,'start_ms',start_ms,'end_ms',end_ms,'transcript',transcript) order by segment_index),'[]') from public.transcription_segments where audio_item_id=p_item
$$;
revoke all on function app_private.tx_rows(uuid) from public,anon,authenticated;

create or replace function public.tx_open(p_item uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.transcription_audio_items;p public.project_lab;m text;tid integer;editable boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to open transcription'; end if;
 perform 1 from public.users where id=auth.uid() for update;
 m:=app_private.tx_mode(p_item);if m='none' then raise exception 'This audio is not assigned to you'; end if;
 select * into a from public.transcription_audio_items where id=p_item for update;
 if a.id is null then raise exception 'Audio module not found'; end if;
 select * into p from public.project_lab where id=a.transcription_project_id;
 editable:=p.lifecycle_status='active' and (m='admin' and a.status not in ('approved','reviewed') or m='contributor' and a.status in ('assigned','in_progress','changes_requested') or m='reviewer' and a.status in ('submitted','in_review'));
 if editable and m<>'admin' then
  tid:=case when m='reviewer' then a.review_task_id else a.task_id end;
  perform app_private.consume_daily_work_slot(tid,auth.uid(),'task:'||tid);
  update public.transcription_audio_items set status=case when m='reviewer' then 'in_review' when status='changes_requested' then status else 'in_progress' end,updated_at=now() where id=a.id returning * into a;
 end if;
 return jsonb_build_object('item',to_jsonb(a),'project',jsonb_build_object('id',p.id,'name',p.project_name,'description',p.description),'mode',m,'editable',editable,'segments',app_private.tx_rows(a.id),'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc),'[]') from (select revision,action,feedback,created_at from app_private.transcription_history where audio_item_id=a.id order by created_at desc limit 30) h));
end $$;

create or replace function public.tx_save(p_item uuid,p_revision integer,p_segments jsonb,p_speakers jsonb,p_duration_ms integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.transcription_audio_items;m text;s jsonb;sp jsonb;idx integer:=0;sid text;label text;tid integer;
begin
 perform 1 from public.users where id=auth.uid() for update;
 m:=app_private.tx_mode(p_item);if m='none' then raise exception 'This audio is not assigned to you'; end if;
 select * into a from public.transcription_audio_items where id=p_item for update;
 if not exists(select 1 from public.project_lab where id=a.transcription_project_id and lifecycle_status='active') then raise exception 'Project is paused'; end if;
 if not ((m='admin' and a.status not in ('approved','reviewed')) or (m='contributor' and a.status in ('assigned','in_progress','changes_requested')) or (m='reviewer' and a.status in ('submitted','in_review'))) then raise exception 'This transcript is read only'; end if;
 if p_revision is distinct from a.revision then raise exception 'VERSION_CONFLICT: Another session saved changes. Reload before editing.'; end if;
 if jsonb_typeof(p_segments) is distinct from 'array' or jsonb_array_length(p_segments)>3000 or jsonb_typeof(p_speakers) is distinct from 'array' or jsonb_array_length(p_speakers) not between 1 and 12 then raise exception 'Invalid transcript structure'; end if;
 if p_duration_ms is null or p_duration_ms not between 1 and 14400000 then raise exception 'Load audio before saving'; end if;
 if exists(select 1 from jsonb_array_elements(p_speakers) x where coalesce(x->>'id','') !~ '^speaker-[0-9]+$' or length(trim(coalesce(x->>'label',''))) not between 1 and 80 or coalesce((x->>'channel')::int,0) not between 0 and 31) or (select count(distinct x->>'id') from jsonb_array_elements(p_speakers) x)<>jsonb_array_length(p_speakers) then raise exception 'Invalid speaker labels'; end if;
 if m<>'admin' then tid:=case when m='reviewer' then a.review_task_id else a.task_id end;perform app_private.consume_daily_work_slot(tid,auth.uid(),'task:'||tid);end if;
 delete from public.transcription_segments where audio_item_id=a.id;
 for s in select value from jsonb_array_elements(p_segments) loop
  sid:=s->>'speaker_id';select x->>'label' into label from jsonb_array_elements(p_speakers) x where x->>'id'=sid;
  if label is null or s->>'start_ms' is null or s->>'end_ms' is null or (s->>'start_ms')::integer not between 0 and 14400000 or (s->>'end_ms')::integer not between 0 and 14400000 or length(coalesce(s->>'transcript',''))>20000 then raise exception 'Invalid segment'; end if;
  insert into public.transcription_segments(id,audio_item_id,segment_index,speaker_id,speaker_label,start_ms,end_ms,transcript)
  values(coalesce(nullif(s->>'id','')::uuid,gen_random_uuid()),a.id,idx,sid,label,(s->>'start_ms')::int,(s->>'end_ms')::int,coalesce(s->>'transcript',''));idx:=idx+1;
 end loop;
 update public.transcription_audio_items set speakers=p_speakers,duration_ms=p_duration_ms,duration_seconds=ceil(p_duration_ms/1000.0),revision=revision+1,updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('revision',a.revision,'saved',idx);
end $$;

create or replace function public.tx_submit(p_item uuid,p_revision integer,p_action text default 'submit',p_feedback text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.transcription_audio_items;m text;rows jsonb;tid integer;u public.users;t public.tasks;newstatus text;
begin
 select * into u from public.users where id=auth.uid() for update;
 m:=app_private.tx_mode(p_item);if m='none' then raise exception 'This audio is not assigned to you'; end if;
 select * into a from public.transcription_audio_items where id=p_item for update;
 if a.revision is distinct from p_revision then raise exception 'VERSION_CONFLICT: Reload the latest transcript'; end if;
 if not exists(select 1 from public.project_lab where id=a.transcription_project_id and lifecycle_status='active') then raise exception 'Project is paused'; end if;
 if p_action='submit' then
  if m not in ('contributor','admin') or a.status not in ('assigned','in_progress','changes_requested','unassigned') then raise exception 'Transcript cannot be submitted at this stage'; end if;
  tid:=a.task_id;newstatus:='submitted';
 elsif p_action in ('approve','request_changes') then
  if m not in ('reviewer','admin') or a.status not in ('submitted','in_review') then raise exception 'Review access required'; end if;
  if p_action='request_changes' and length(trim(coalesce(p_feedback,'')))<3 then raise exception 'Add feedback explaining the requested changes'; end if;
  tid:=a.review_task_id;newstatus:=case when p_action='approve' then 'approved' else 'changes_requested' end;
 else raise exception 'Invalid submission action';end if;
 if m<>'admin' then perform app_private.consume_daily_work_slot(tid,auth.uid(),'task:'||tid);end if;
 rows:=app_private.tx_rows(a.id);
 if p_action<>'request_changes' then
  if jsonb_array_length(rows)=0 then raise exception 'Add at least one transcript segment'; end if;
  if exists(select 1 from public.transcription_segments s where s.audio_item_id=a.id and (s.end_ms<=s.start_ms or s.end_ms>a.duration_ms or trim(s.transcript)='')) then raise exception 'Fix empty text and invalid segment times before submission'; end if;
  if exists(select 1 from public.transcription_segments s join public.transcription_segments other on s.audio_item_id=other.audio_item_id and s.speaker_id=other.speaker_id and s.id<other.id and s.start_ms<other.end_ms and other.start_ms<s.end_ms where s.audio_item_id=a.id) then raise exception 'Resolve overlapping segments for the same speaker'; end if;
 end if;
 insert into app_private.transcription_history(audio_item_id,actor_id,revision,action,segments,speakers,feedback) values(a.id,auth.uid(),a.revision+1,p_action,rows,a.speakers,left(p_feedback,10000));
 update public.transcription_audio_items set status=newstatus,revision=revision+1,submitted_segments=case when p_action='submit' then rows else submitted_segments end,submitted_at=case when p_action='submit' then now() else submitted_at end,reviewed_at=case when p_action<>'submit' then now() else reviewed_at end,feedback=case when p_action<>'submit' then left(p_feedback,10000) else feedback end,updated_at=now() where id=a.id returning * into a;
 if tid is not null then update public.tasks set status='submitted' where id=tid;end if;
 if p_action='submit' and a.task_id is not null then
  select * into t from public.tasks where id=a.task_id;
  select * into u from public.users where lower(email)=lower(t."assignedTo") or lower("uniqueID")=lower(t."assignedTo") limit 1;
  if not exists(select 1 from public.submissions where task_id=a.task_id) then insert into public.submissions("workerUID","projectTitle","earnedAmount","audioData",status,task_id) values(u."uniqueID",t.title,coalesce(t.price,0),'transcription:'||a.id,'Pending',t.id);
  else update public.submissions set status='Pending' where task_id=a.task_id;end if;
 elsif p_action='request_changes' then
  update public.tasks set status='pending' where id=a.task_id and status='submitted';
  update public.transcription_audio_items set review_task_id=null where id=a.id;
 elsif p_action='approve' then
  -- Preserve the platform's final payment/audit stage; a transcription review is not a payout.
  update public.submissions set status='Reviewed',reviewed_at=now() where task_id=a.task_id;
 end if;
 return jsonb_build_object('revision',a.revision,'status',newstatus);
end $$;

-- Superseded admin-only save RPC cannot bypass locking, version checks or submission state.
create or replace function public.admin_save_transcription_segments(p_audio_item_id uuid,p_segments jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Open the new Transcription Lab to edit this audio';end $$;
create or replace function public.admin_import_transcription_audio(p_transcription_project_id integer,p_source_project_title text,p_source_folder text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Use Transcription Lab to choose audio sources';end $$;

do $$ declare r record;begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('tx_create_project','tx_get_lab','tx_audio_sources','tx_import_sources','tx_register_upload','tx_assign','tx_open','tx_save','tx_submit') loop
 execute format('revoke all on function %s from public,anon',r.signature);execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end $$;
-- All mutations use the checked RPCs. Reading the tables directly remains admin-only.
revoke all on public.transcription_audio_items,public.transcription_segments from public,authenticated,anon;
grant select on public.transcription_audio_items,public.transcription_segments to authenticated;

insert into public.project_lab(project_name,project_type,description,config,is_published,lifecycle_status,l1_rate,l2_rate)
select 'Transcription','transcription','Segment, transcribe and audit audio imported from existing projects or external uploads.','{"mode":"transcription","review_flow":"transcription_audit"}',true,'active',0,0
where not exists(select 1 from public.project_lab where lower(project_name)='transcription');
CREATE OR REPLACE FUNCTION public.get_contributor_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_user public.users;
  v_tasks jsonb;
  v_submissions jsonb;
  v_payments jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_user."accountStatus" = 'blocked' then raise exception 'PLATFORM_BLOCKED'; end if;
  if v_user."accountStatus" <> 'active' then raise exception 'VERIFICATION_REQUIRED'; end if;

  if v_user."lastOnline" is null or v_user."lastOnline" < now() - interval '30 seconds' then
    update public.users set "lastOnline" = now() where id = v_user.id;
    v_user."lastOnline" := now();
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc), '[]'::jsonb) into v_tasks
  from (
    select t.id,t.public_task_id,t.title,t.price,t."createdAt",t.status,t.layer,tx.id as transcription_item_id
    from public.tasks t
    left join public.transcription_audio_items tx on t.id=tx.task_id or t.id=tx.review_task_id
    where (t."assignedTo"=v_user.email or t."assignedTo"=v_user."uniqueID")
      and app_private.has_project_access(t.title)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."timestamp" desc), '[]'::jsonb) into v_submissions
  from (
    select s.id,s."projectTitle",s."earnedAmount",s."timestamp",s.status,s.task_id,t.public_task_id as task_public_id,s.reviewed_at,s.approved_at,s.rejected_at
    from public.submissions s
    left join public.tasks t on t.id=s.task_id
    where s."workerUID"=v_user."uniqueID"
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb) into v_payments
  from (
    select p.id,p.submission_id,p.payment_status,p.scheduled_for,p.processing_at,p.paid_at,p.payment_reference,p.updated_at,t.public_task_id as task_public_id
    from public.submission_payments p
    join public.submissions s on s.id=p.submission_id
    left join public.tasks t on t.id=s.task_id
    where s."workerUID"=v_user."uniqueID"
  ) x;

  return jsonb_build_object(
    'profile',jsonb_build_object('id',v_user.id,'email',v_user.email,'fullName',v_user."fullName",'uniqueID',v_user."uniqueID",'balance',v_user.balance,'role',v_user.role,'accountStatus',v_user."accountStatus",'dateOfBirth',v_user."Date of Birth",'education',v_user.education,'occupation',v_user.occupation,'phone',v_user.phone,'lastOnline',v_user."lastOnline"),
    'tasks',v_tasks,'submissions',v_submissions,'payments',v_payments
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.claim_next_voice_l2_review(p_task_id integer)
 RETURNS TABLE(submission_id integer, worker_uid text, project_title text, source_task_id integer, audio_path text, submitted_at timestamp with time zone, recording_id uuid, duration_seconds integer, rubric jsonb, claimed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_u public.users; v_t public.tasks; v_submission_id integer; v_lifecycle text;
begin
 if exists(select 1 from public.transcription_audio_items tx where tx.task_id=p_task_id or tx.review_task_id=p_task_id) then raise exception 'Open the transcription workspace for this assignment'; end if;
  select * into v_u from public.users where id=auth.uid() for update; if v_u.id is null then raise exception 'Not authenticated'; end if;
  if v_u."accountStatus"<>'active' and not app_private.is_admin() then raise exception 'Platform access required'; end if;
  select * into v_t from public.tasks where id=p_task_id and layer='L2' and status='pending' and ("assignedTo"=v_u.email or "assignedTo"=v_u."uniqueID") for update;
  if v_t.id is null then raise exception 'Reviewer assignment not found'; end if;
  if not app_private.has_project_access(v_t.title) then raise exception 'Project access revoked'; end if;
  select lifecycle_status into v_lifecycle from public.project_lab where project_name=v_t.title order by id desc limit 1;
  if coalesce(v_lifecycle,'active')<>'active' then raise exception 'Project is currently paused or archived'; end if;
  update public.voice_l2_review_claims c set completed_at=now() where c.completed_at is null and exists(select 1 from public.tasks old_t where old_t.id=c.reviewer_task_id and old_t.status<>'pending');
  select c.submission_id into v_submission_id from public.voice_l2_review_claims c join public.submissions s on s.id=c.submission_id where c.reviewer_task_id=v_t.id and c.reviewer_id=v_u.id and c.completed_at is null and s."projectTitle"=v_t.title and coalesce(s.status,'Pending')='Pending' order by c.claimed_at limit 1;
  if v_submission_id is null then
    select s.id into v_submission_id from public.submissions s where s."projectTitle"=v_t.title and coalesce(s.status,'Pending')='Pending' and nullif(trim(coalesce(s."audioData",'')),'') is not null and not exists(select 1 from public.voice_l2_reviews r where r.submission_id=s.id) and not exists(select 1 from public.voice_l2_review_claims c where c.submission_id=s.id and c.completed_at is null) order by s."timestamp",s.id for update skip locked limit 1;
    if v_submission_id is not null then insert into public.voice_l2_review_claims(submission_id,reviewer_task_id,reviewer_id) values(v_submission_id,v_t.id,v_u.id) on conflict on constraint voice_l2_review_claims_submission_id_key do nothing; if not found then v_submission_id:=null; end if; end if;
  end if;
  if v_submission_id is null then return; end if;
  perform app_private.consume_daily_work_slot(v_t.id,v_u.id,'review:'||v_submission_id);
  return query select s.id,s."workerUID",s."projectTitle",s.task_id,s."audioData",s."timestamp",vr.id,coalesce(vr.duration_seconds,vs.duration_seconds,0),case when v_t.rubric_data ? 'rubric' then coalesce(v_t.rubric_data->'rubric','[]'::jsonb) else coalesce(pl.config->'audit_rubric','[]'::jsonb) end,c.claimed_at from public.submissions s join public.voice_l2_review_claims c on c.submission_id=s.id and c.reviewer_task_id=v_t.id and c.reviewer_id=v_u.id and c.completed_at is null left join public.voice_recordings vr on vr.recording_path=s."audioData" and vr.project_title=s."projectTitle" left join public.voice_sessions vs on vs.recording_url=s."audioData" and vs.project_title=s."projectTitle" left join lateral(select p.config from public.project_lab p where p.project_name=s."projectTitle" order by p.id desc limit 1) pl on true where s.id=v_submission_id;
end $function$;

CREATE OR REPLACE FUNCTION public.get_review_queue(p_task_id integer)
 RETURNS TABLE(submission_id integer, worker_uid text, project_title text, earned_amount numeric, status text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_u public.users; v_t public.tasks;
begin
 if exists(select 1 from public.transcription_audio_items tx where tx.task_id=p_task_id or tx.review_task_id=p_task_id) then raise exception 'Open the transcription workspace for this assignment'; end if;
 select * into v_u from public.users where id=auth.uid();
 if v_u.id is null then raise exception 'Not authenticated'; end if;
 if v_u."accountStatus"<>'active' and not app_private.is_admin() then raise exception 'Platform access required'; end if;
 select * into v_t from public.tasks where id=p_task_id and layer='L2' and status='pending' and ("assignedTo"=v_u.email or "assignedTo"=v_u."uniqueID");
 if v_t.id is null then raise exception 'Reviewer assignment not found'; end if;
 if not app_private.has_project_access(v_t.title) then raise exception 'Project access revoked'; end if;
 return query select s.id,s."workerUID",s."projectTitle",s."earnedAmount",s.status,s."timestamp" from public.submissions s where s."projectTitle"=v_t.title and coalesce(s.status,'Pending')='Pending' order by s."timestamp";
end
$function$;

CREATE OR REPLACE FUNCTION public.review_submission(p_task_id integer, p_submission_id integer, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_u public.users; v_t public.tasks;
begin
 if exists(select 1 from public.transcription_audio_items tx where tx.task_id=p_task_id or tx.review_task_id=p_task_id) then raise exception 'Open the transcription workspace for this assignment'; end if;
 if p_decision not in ('Reviewed','Rejected') then raise exception 'Invalid review decision'; end if;
 select * into v_u from public.users where id=auth.uid() for update;
 if v_u.id is null then raise exception 'Not authenticated'; end if;
 if v_u."accountStatus"<>'active' and not app_private.is_admin() then raise exception 'Platform access required'; end if;
 select * into v_t from public.tasks where id=p_task_id and layer='L2' and status='pending' and ("assignedTo"=v_u.email or "assignedTo"=v_u."uniqueID") for update;
 if v_t.id is null then raise exception 'Reviewer assignment not found'; end if;
 if not app_private.has_project_access(v_t.title) then raise exception 'Project access revoked'; end if;
 if not exists(select 1 from public.submissions where id=p_submission_id and "projectTitle"=v_t.title and coalesce(status,'Pending')='Pending') then raise exception 'Submission unavailable'; end if;
 perform app_private.consume_daily_work_slot(v_t.id,v_u.id,'review:'||p_submission_id);
 update public.submissions
 set status=p_decision,
     reviewed_at=case when p_decision='Reviewed' then now() else reviewed_at end,
     rejected_at=case when p_decision='Rejected' then now() else rejected_at end
 where id=p_submission_id;
 if not exists(select 1 from public.submissions where "projectTitle"=v_t.title and coalesce(status,'Pending')='Pending') then update public.tasks set status='submitted' where id=v_t.id; end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.submit_voice_l2_review(p_task_id integer, p_submission_id integer, p_rubric jsonb, p_decision text, p_feedback text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_u public.users;
  v_t public.tasks;
  v_claim public.voice_l2_review_claims;
  v_sub public.submissions;
  v_recording_id uuid;
  v_review_id bigint;
  v_remaining integer;
begin
 if exists(select 1 from public.transcription_audio_items tx where tx.task_id=p_task_id or tx.review_task_id=p_task_id) then raise exception 'Open the transcription workspace for this assignment'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid review decision'; end if;
  select * into v_u from public.users where id=auth.uid() for update;
  if v_u.id is null then raise exception 'Not authenticated'; end if;
  if v_u."accountStatus"<>'active' and not app_private.is_admin() then raise exception 'Platform access required'; end if;

  select * into v_t
  from public.tasks
  where id=p_task_id and layer='L2' and status='pending'
    and ("assignedTo"=v_u.email or "assignedTo"=v_u."uniqueID")
  for update;
  if v_t.id is null then raise exception 'Reviewer assignment not found'; end if;
  if not app_private.has_project_access(v_t.title) then raise exception 'Project access revoked'; end if;

  select * into v_claim
  from public.voice_l2_review_claims
  where submission_id=p_submission_id and reviewer_task_id=v_t.id and reviewer_id=v_u.id and completed_at is null
  for update;
  if v_claim.id is null then raise exception 'Review item is not claimed by this assignment'; end if;

  select * into v_sub from public.submissions
  where id=p_submission_id and "projectTitle"=v_t.title and coalesce(status,'Pending')='Pending'
  for update;
  if v_sub.id is null then raise exception 'Submission unavailable'; end if;

  perform app_private.consume_daily_work_slot(v_t.id,v_u.id,'review:'||p_submission_id);
  select vr.id into v_recording_id
  from public.voice_recordings vr
  where vr.recording_path=v_sub."audioData" and vr.project_title=v_sub."projectTitle"
  order by vr.submitted_at desc
  limit 1;

  insert into public.voice_l2_reviews(submission_id,recording_id,reviewer_task_id,reviewer_id,rubric,decision,feedback)
  values(p_submission_id,v_recording_id,v_t.id,v_u.id,coalesce(p_rubric,'{}'::jsonb),p_decision,nullif(trim(coalesce(p_feedback,'')),''))
  returning id into v_review_id;

  update public.voice_l2_review_claims set completed_at=now() where id=v_claim.id;

  if p_decision='approved' then
    update public.users
    set balance=coalesce(balance,0)+coalesce(v_sub."earnedAmount",0)
    where "uniqueID"=v_sub."workerUID";

    update public.submissions
    set status='Approved', reviewed_at=now(), approved_at=now(), rejected_at=null
    where id=p_submission_id;

    insert into public.submission_payments(submission_id,payment_status,updated_at,updated_by)
    values(p_submission_id,'pending',now(),auth.uid())
    on conflict(submission_id) do nothing;
  else
    update public.submissions
    set status='Rejected', reviewed_at=now(), rejected_at=now(), approved_at=null
    where id=p_submission_id;
  end if;

  if v_recording_id is not null then
    update public.voice_recordings
    set audit_status='audited', latest_verdict=p_decision,
        latest_feedback=nullif(trim(coalesce(p_feedback,'')),''), audited_at=now(), updated_at=now()
    where id=v_recording_id;
  end if;

  select count(*) into v_remaining
  from public.submissions s
  where s."projectTitle"=v_t.title
    and coalesce(s.status,'Pending')='Pending'
    and s."audioData" is not null
    and not exists(select 1 from public.voice_l2_reviews r where r.submission_id=s.id)
    and not exists(select 1 from public.voice_l2_review_claims c where c.submission_id=s.id and c.completed_at is null);

  if v_remaining=0 and exists(select 1 from public.voice_l2_reviews r where r.reviewer_task_id=v_t.id) then
    update public.tasks set status='submitted' where id=v_t.id;
  end if;

  return v_review_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_assign_project_tasks(p_project_id integer, p_layer text, p_user_keys text[], p_template_id uuid DEFAULT NULL::uuid, p_quantity_per_user integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_p public.project_lab; v_inv public.project_task_inventory; v_tpl public.project_assignment_templates; v_key text; v_u public.users;
  v_price numeric; v_created integer:=0; v_skipped jsonb:='[]'::jsonb; v_ids jsonb:='[]'::jsonb; v_n integer; v_id integer; v_public text;
begin
  if not app_private.is_admin() then raise exception 'Admin only'; end if;
  if p_layer not in ('L1','L2') then raise exception 'Invalid layer'; end if;
  if p_quantity_per_user<1 or p_quantity_per_user>100 then raise exception 'Quantity per person must be 1–100'; end if;
  if coalesce(array_length(p_user_keys,1),0)<1 or array_length(p_user_keys,1)>500 then raise exception 'Provide between 1 and 500 people'; end if;
  select * into v_p from public.project_lab where id=p_project_id for update;
  if v_p.id is null then raise exception 'Project not found'; end if;
  if v_p.lifecycle_status<>'active' then raise exception 'Project must be active to assign work'; end if;
  if v_p.project_type='transcription' then
    if p_template_id is not null then raise exception 'Transcription assignments use imported audio modules'; end if;
    return public.tx_assign(p_project_id,p_user_keys,p_layer,p_quantity_per_user,null);
  end if;
  if p_template_id is not null then
    select * into v_tpl from public.project_assignment_templates where id=p_template_id and project_id=p_project_id and is_active=true;
    if v_tpl.id is null then raise exception 'Active template not found'; end if;
    if v_tpl.layer<>p_layer then raise exception 'Template layer does not match assignment layer'; end if;
  end if;
  insert into public.project_task_inventory(project_id) values(p_project_id) on conflict(project_id) do nothing;
  select * into v_inv from public.project_task_inventory where project_id=p_project_id for update;

  foreach v_key in array p_user_keys loop
    select * into v_u from public.users where lower(email)=lower(trim(v_key)) or "uniqueID"=trim(v_key) limit 1;
    if v_u.id is null then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('key',v_key,'reason','User not found')); continue; end if;
    if v_u."accountStatus"<>'active' then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('key',v_key,'reason','Platform access inactive')); continue; end if;
    if exists(select 1 from public.project_access_controls where user_id=v_u.id and project_id=p_project_id and access_status='revoked') then v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('key',v_key,'reason','Project access revoked')); continue; end if;
    for v_n in 1..p_quantity_per_user loop
      if p_layer='L1' and v_inv.l1_available-v_created<=0 then raise exception 'Not enough L1 inventory for this bulk assignment'; end if;
      if p_layer='L2' and v_inv.l2_available-v_created<=0 then raise exception 'Not enough L2 inventory for this bulk assignment'; end if;
      v_price:=coalesce(v_tpl.price_override,case when p_layer='L1' then v_p.l1_rate else v_p.l2_rate end,0);
      insert into public.tasks("assignedTo",title,price,layer,status,public_task_id,template_id,task_type,instructions,passing_score,rubric_data)
      values(v_u.email,v_p.project_name,v_price,p_layer,'pending',app_private.generate_public_task_id(),v_tpl.id,coalesce(v_tpl.task_type,'standard'),v_tpl.instructions,v_tpl.passing_score,
        case when v_tpl.id is null then null else jsonb_build_object('template_id',v_tpl.id,'template_name',v_tpl.name,'task_type',v_tpl.task_type,'passing_score',v_tpl.passing_score,'rubric',v_tpl.rubric,'instructions',v_tpl.instructions) end)
      returning id,public_task_id into v_id,v_public;
      v_created:=v_created+1;
      v_ids:=v_ids||jsonb_build_array(jsonb_build_object('id',v_id,'task_id',v_public,'user',v_u.email));
    end loop;
  end loop;
  update public.project_task_inventory set l1_available=l1_available-case when p_layer='L1' then v_created else 0 end,l2_available=l2_available-case when p_layer='L2' then v_created else 0 end,updated_at=now(),updated_by=auth.uid() where project_id=p_project_id;
  perform app_private.log_project_activity(p_project_id,'tasks.bulk_assigned','task',null,jsonb_build_object('layer',p_layer,'created',v_created,'quantity_per_user',p_quantity_per_user,'template_id',p_template_id,'skipped',v_skipped));
  return jsonb_build_object('created',v_created,'tasks',v_ids,'skipped',v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.submit_assigned_task(p_task_id integer, p_audio_data text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_task public.tasks; v_user public.users; v_id integer;
begin
 select * into v_user from public.users where id=auth.uid() for update;
 if v_user.id is null then raise exception 'Not authenticated'; end if;
 if v_user."accountStatus"<>'active' and not app_private.is_admin() then raise exception 'Platform access required'; end if;
 select * into v_task from public.tasks where id=p_task_id and status='pending' and ("assignedTo"=v_user.email or "assignedTo"=v_user."uniqueID") for update;
 if v_task.id is null then raise exception 'Task not available'; end if;
 if not app_private.has_project_access(v_task.title) then raise exception 'Project access revoked'; end if;
 if exists(select 1 from public.transcription_audio_items a where a.task_id=v_task.id or a.review_task_id=v_task.id) then raise exception 'Submit transcription through the transcription workspace'; end if;
 perform app_private.consume_daily_task_slot(v_task.id,v_user.id);
 insert into public.submissions("workerUID","projectTitle","earnedAmount","audioData",status,task_id)
 values(v_user."uniqueID",v_task.title,coalesce(v_task.price,0),p_audio_data,'Pending',v_task.id)
 returning id into v_id;
 update public.tasks set status='submitted' where id=v_task.id;
 return v_id;
end
$function$;
