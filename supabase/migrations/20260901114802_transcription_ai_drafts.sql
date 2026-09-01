-- AI drafts are append-only baselines, separate from human transcription rows.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table app_private.transcription_ai_jobs (
 id uuid primary key default gen_random_uuid(),
 audio_item_id uuid references public.transcription_audio_items(id) on delete cascade,
 project_id integer references public.project_lab(id) on delete cascade,
 kind text not null default 'draft' check (kind in ('draft','check')),
 requested_by uuid references public.users(id) on delete set null,
 status text not null default 'queued' check(status in ('queued','dispatched','running','ready','failed','cancelled')),
 source_revision integer not null default 0,
 language text not null default '',
 model text not null default 'gpt-4o-transcribe-diarize',
 dispatch_token uuid,
 request_id bigint,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz,
 segments jsonb not null default '[]',
 speakers jsonb not null default '[]',
 duration_ms integer,
 applied boolean not null default false,
 error_code text,
 error_message text,
 check ((kind='draft' and audio_item_id is not null and project_id is not null) or (kind='check' and audio_item_id is null))
);
alter table app_private.transcription_ai_jobs enable row level security;
revoke all on app_private.transcription_ai_jobs from public,anon,authenticated;
create unique index tx_ai_one_active on app_private.transcription_ai_jobs(audio_item_id) where status in ('queued','dispatched','running');
create index tx_ai_item_history on app_private.transcription_ai_jobs(audio_item_id,created_at desc);
create index tx_ai_queue on app_private.transcription_ai_jobs(status,created_at) where status in ('queued','dispatched','running');
create index tx_ai_project_history on app_private.transcription_ai_jobs(project_id,created_at desc);
create index tx_ai_check_history on app_private.transcription_ai_jobs(created_at desc) where kind='check';

create function app_private.tx_ai_job_summary(j app_private.transcription_ai_jobs) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',j.id,'audio_item_id',j.audio_item_id,'status',j.status,'created_at',j.created_at,
 'finished_at',j.finished_at,'model',j.model,'applied',j.applied,'error_code',j.error_code,'error_message',j.error_message)
$$;
revoke all on function app_private.tx_ai_job_summary(app_private.transcription_ai_jobs) from public,anon,authenticated;

-- Dispatch carries only a single-job ticket (no audio, credentials or reusable
-- authority). Even a replay can only start this already-admin-authorized job once.
-- pg_net is platform-managed; do not rely on its queue ACLs to protect secrets.
-- The API key never enters the database, browser, HTTP response or repository.
create function app_private.tx_ai_dispatch() returns integer
language plpgsql security definer set search_path='' as $$
declare j app_private.transcription_ai_jobs; slots integer; dispatched integer:=0; token uuid;
begin
 if not pg_try_advisory_xact_lock(81734629) then return 0; end if;
 update app_private.transcription_ai_jobs set status='failed',error_code='WORKER_TIMEOUT',
 error_message='Processing did not finish. Retry explicitly; a previous provider request may have been charged.',finished_at=now(),dispatch_token=null
 where status in ('dispatched','running') and started_at<now()-interval '5 minutes';
 select greatest(0,2-count(*)::integer) into slots from app_private.transcription_ai_jobs where status in ('dispatched','running');
 for j in select * from app_private.transcription_ai_jobs where status='queued' order by created_at,id limit slots for update skip locked loop
  if j.kind='draft' and not exists(select 1 from public.project_lab where id=j.project_id and lifecycle_status='active') then
   update app_private.transcription_ai_jobs set status='cancelled',finished_at=now(),error_message='Project is paused or archived.' where id=j.id;
   continue;
  end if;
  token:=gen_random_uuid();
  update app_private.transcription_ai_jobs set status='dispatched',started_at=now(),dispatch_token=token,
  request_id=net.http_post(url:='https://llmhyezgcnbognmmsnzq.supabase.co/functions/v1/transcription-ai',
   body:=jsonb_build_object('job_id',j.id,'token',token),
   headers:='{"Content-Type":"application/json"}',timeout_milliseconds:=10000)
  where id=j.id;
  dispatched:=dispatched+1;
 end loop;
 return dispatched;
end $$;
revoke all on function app_private.tx_ai_dispatch() from public,anon,authenticated;

create function app_private.tx_ai_queue_item(p_item uuid,p_actor uuid,p_regenerate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.transcription_audio_items; jid uuid; problem text; lang text; size_bytes bigint;
begin
 select * into a from public.transcription_audio_items where id=p_item for update;
 if not found or a.status in ('submitted','in_review','approved','reviewed') then return null; end if;
 if exists(select 1 from app_private.transcription_ai_jobs where audio_item_id=a.id and
   (status in ('queued','dispatched','running') or (status='ready' and not p_regenerate))) then return null; end if;
 select coalesce(config->>'ai_language','') into lang from public.project_lab where id=a.transcription_project_id and lifecycle_status='active';
 if not found then return null; end if;
 -- A bounded daily queue prevents an accidental bulk import creating unbounded costs.
 if (select count(*) from app_private.transcription_ai_jobs where project_id=a.transcription_project_id and created_at>=date_trunc('day',now()))>=500 then
  return null;
 end if;
 select case when (metadata->>'size') ~ '^[0-9]+$' then (metadata->>'size')::bigint end into size_bytes
 from storage.objects where bucket_id=a.storage_bucket and name=a.recording_path;
 if not found then problem:='Audio file is missing from storage.';
 elsif lower(a.recording_path) !~ '\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$' then problem:='Convert this file to WAV, MP3, M4A, WebM, OGG or FLAC for AI drafting.';
 elsif size_bytes>24000000 then problem:='AI drafting supports files up to 24 MB. Compress or split this audio before importing it.';
 elsif greatest(a.duration_ms,a.duration_seconds*1000)>900000 then problem:='AI drafting supports clips up to 15 minutes. Split this audio before importing it.';
 end if;
 insert into app_private.transcription_ai_jobs(audio_item_id,project_id,requested_by,source_revision,language,status,error_code,error_message,finished_at)
 values(a.id,a.transcription_project_id,p_actor,a.revision,lang,case when problem is null then 'queued' else 'failed' end,
 case when problem is null then null else 'UNSUPPORTED_AUDIO' end,problem,case when problem is null then null else now() end) returning id into jid;
 return jid;
end $$;
revoke all on function app_private.tx_ai_queue_item(uuid,uuid,boolean) from public,anon,authenticated;

create function public.tx_ai_enqueue(p_project integer,p_items uuid[],p_regenerate boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare aid uuid; jid uuid; added integer:=0; skipped integer:=0;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if coalesce(cardinality(p_items),0) not between 1 and 100 then raise exception 'Select between 1 and 100 modules.'; end if;
 perform 1 from public.project_lab where id=p_project and project_type='transcription' and lifecycle_status='active' for update;
 if not found then raise exception 'Choose an active transcription project.'; end if;
 if exists(select 1 from unnest(p_items) i where not exists(select 1 from public.transcription_audio_items where id=i and transcription_project_id=p_project)) then raise exception 'A selected module does not belong to this project.'; end if;
 for aid in select distinct unnest(p_items) loop
  jid:=app_private.tx_ai_queue_item(aid,auth.uid(),p_regenerate);
  if jid is null then skipped:=skipped+1;else added:=added+1;end if;
 end loop;
 perform app_private.tx_ai_dispatch();
 return jsonb_build_object('added',added,'skipped',skipped);
end $$;

create function public.tx_ai_settings(p_project integer,p_enabled boolean,p_language text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if p_enabled is null or p_language is null or p_language not in ('','hi','en','mr','bn','ta','te','gu','kn','ml','pa','ur') then raise exception 'Choose a supported language or automatic detection.'; end if;
 update public.project_lab set config=coalesce(config,'{}')||jsonb_build_object('ai_auto_draft',p_enabled,'ai_language',p_language)
 where id=p_project and project_type='transcription';
 if not found then raise exception 'Transcription project not found';end if;
end $$;

create function public.tx_ai_lab(p_project integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 select jsonb_build_object('auto_draft',coalesce(p.config->'ai_auto_draft','false'),'language',coalesce(p.config->>'ai_language',''),
 'jobs',coalesce((select jsonb_agg(app_private.tx_ai_job_summary(j)) from
   (select distinct on (audio_item_id) * from app_private.transcription_ai_jobs where project_id=p.id order by audio_item_id,created_at desc,id desc) j),'[]'),
 'connection',(select app_private.tx_ai_job_summary(j) from app_private.transcription_ai_jobs j where kind='check' order by created_at desc limit 1))
 into result from public.project_lab p where id=p_project and project_type='transcription';
 return result;
end $$;

create function public.tx_ai_item(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or app_private.tx_mode(p_item)='none' then raise exception 'Audio access denied';end if;
 return jsonb_build_object('latest',(select app_private.tx_ai_job_summary(j) from app_private.transcription_ai_jobs j where audio_item_id=p_item order by created_at desc,id desc limit 1),
 'draft',(select app_private.tx_ai_job_summary(j)||jsonb_build_object('segments',segments,'speakers',speakers,'duration_ms',duration_ms)
 from app_private.transcription_ai_jobs j where audio_item_id=p_item and status='ready' order by created_at desc,id desc limit 1));
end $$;

create function public.tx_ai_check_connection() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 perform pg_advisory_xact_lock(81734630);
 if not exists(select 1 from app_private.transcription_ai_jobs where kind='check' and (status in ('queued','dispatched','running') or created_at>now()-interval '1 minute')) then
  insert into app_private.transcription_ai_jobs(kind,requested_by) values('check',auth.uid());
 end if;
 perform app_private.tx_ai_dispatch();
end $$;

create function public.tx_ai_cancel(p_project integer,p_items uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required';end if;
 update app_private.transcription_ai_jobs set status='cancelled',finished_at=now(),dispatch_token=null,error_message='Cancelled before processing.'
 where project_id=p_project and audio_item_id=any(p_items) and status in ('queued','dispatched');
 get diagnostics n=row_count;return n;
end $$;

create function app_private.tx_ai_on_import() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.project_lab where id=new.transcription_project_id and config->>'ai_auto_draft'='true' and lifecycle_status='active') then
  perform app_private.tx_ai_queue_item(new.id,auth.uid(),false);
 end if;
 return new;
end $$;
revoke all on function app_private.tx_ai_on_import() from public,anon,authenticated;
create trigger tx_ai_on_import after insert on public.transcription_audio_items for each row execute function app_private.tx_ai_on_import();

-- Only the server-side service role can claim or finish jobs. The worker first
-- verifies the single-use capability; callers cannot supply arbitrary audio URLs.
create function public.tx_ai_claim(p_job uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.transcription_ai_jobs;a public.transcription_audio_items;
begin
 select * into j from app_private.transcription_ai_jobs where id=p_job and dispatch_token=p_token and status='dispatched'
 and started_at>now()-interval '5 minutes' for update;
 if not found then return null; end if;
 if j.kind='draft' then
  select * into a from public.transcription_audio_items where id=j.audio_item_id;
  if not exists(select 1 from public.project_lab where id=j.project_id and lifecycle_status='active') or a.status in ('submitted','in_review','approved','reviewed') then
   update app_private.transcription_ai_jobs set status='cancelled',finished_at=now(),dispatch_token=null,error_message='Module is no longer eligible.' where id=j.id;
   return null;
  end if;
 end if;
 update app_private.transcription_ai_jobs set status='running' where id=j.id;
 return jsonb_build_object('id',j.id,'kind',j.kind,'model',j.model,'language',j.language,'bucket',a.storage_bucket,'path',a.recording_path,'duration_ms',greatest(a.duration_ms,a.duration_seconds*1000));
end $$;

create function public.tx_ai_finish(p_job uuid,p_token uuid,p_result jsonb default null,p_error_code text default null,p_error_message text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare j app_private.transcription_ai_jobs;a public.transcription_audio_items; seg jsonb;sp jsonb;ord integer; seeded boolean:=false;
begin
 -- Item first, then job: same order as enqueue; avoids deadlocks with editors.
 select audio_item_id into a.id from app_private.transcription_ai_jobs where id=p_job;
 if a.id is not null then select * into a from public.transcription_audio_items where id=a.id for update;end if;
 select * into j from app_private.transcription_ai_jobs where id=p_job and dispatch_token=p_token and status='running' for update;
 if not found then return false;end if;
 if p_error_code is not null then
  update app_private.transcription_ai_jobs set status='failed',error_code=left(p_error_code,80),error_message=left(p_error_message,400),finished_at=now(),dispatch_token=null where id=j.id;
  return true;
 end if;
 if j.kind='draft' then
  if jsonb_typeof(p_result->'segments') is distinct from 'array' or jsonb_array_length(p_result->'segments') not between 1 and 3000
   or jsonb_typeof(p_result->'speakers') is distinct from 'array' or jsonb_array_length(p_result->'speakers') not between 1 and 12
   or coalesce((p_result->>'duration_ms')::integer,0) not between 1 and 900000 then raise exception 'Invalid AI draft';end if;
  for seg in select value from jsonb_array_elements(p_result->'segments') loop
   if (seg->>'start_ms')::integer<0 or (seg->>'end_ms')::integer<=(seg->>'start_ms')::integer
    or (seg->>'end_ms')::integer>(p_result->>'duration_ms')::integer or length(coalesce(seg->>'transcript','')) not between 1 and 20000
    or not exists(select 1 from jsonb_array_elements(p_result->'speakers') s where s->>'id'=seg->>'speaker_id') then raise exception 'Invalid AI segment';end if;
  end loop;
  -- Only an untouched, unassigned module may be prefilled automatically.
  seeded:=a.revision=0 and j.source_revision=0 and a.task_id is null and a.status='unassigned'
    and not exists(select 1 from public.transcription_segments where audio_item_id=a.id)
    and exists(select 1 from public.project_lab where id=a.transcription_project_id and lifecycle_status='active');
  if seeded then
   for seg,ord in select value,ordinality::integer from jsonb_array_elements(p_result->'segments') with ordinality loop
    select value into sp from jsonb_array_elements(p_result->'speakers') where value->>'id'=seg->>'speaker_id';
    insert into public.transcription_segments(id,audio_item_id,segment_index,speaker_id,speaker_label,start_ms,end_ms,transcript,lint_status)
    values((seg->>'id')::uuid,a.id,ord-1,seg->>'speaker_id',sp->>'label',(seg->>'start_ms')::integer,(seg->>'end_ms')::integer,seg->>'transcript','warning');
   end loop;
   update public.transcription_audio_items set speakers=p_result->'speakers',duration_ms=(p_result->>'duration_ms')::integer,
    duration_seconds=ceil((p_result->>'duration_ms')::numeric/1000),revision=revision+1,updated_at=now() where id=a.id;
  end if;
 end if;
 update app_private.transcription_ai_jobs set status='ready',segments=coalesce(p_result->'segments','[]'),speakers=coalesce(p_result->'speakers','[]'),
 duration_ms=(p_result->>'duration_ms')::integer,applied=seeded,finished_at=now(),dispatch_token=null where id=j.id;
 return true;
end $$;
revoke all on function public.tx_ai_claim(uuid,uuid),public.tx_ai_finish(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.tx_ai_claim(uuid,uuid),public.tx_ai_finish(uuid,uuid,jsonb,text,text) to service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('tx_ai_enqueue','tx_ai_settings','tx_ai_lab','tx_ai_item','tx_ai_check_connection','tx_ai_cancel') loop
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
select cron.schedule('transcription-ai-dispatch','* * * * *','select app_private.tx_ai_dispatch()');
-- Checks connectivity only; no existing recordings are queued by this migration.
insert into app_private.transcription_ai_jobs(kind) values('check');
