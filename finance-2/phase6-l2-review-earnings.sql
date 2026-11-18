-- Finance 2.0: L2 review-task earning snapshots.
-- Reviewer completion is a separately compensable work unit.
begin;
create table if not exists app_private.finance2_review_earnings (
 id bigint generated always as identity primary key,
 project_id integer not null references public.project_lab(id),
 reviewer_id uuid not null references public.users(id),
 review_source text not null check(review_source in ('voice_l2','tx_l2','generic_l2')),
 review_key text not null,
 submission_id integer references public.submissions(id),
 reviewer_task_id integer references public.tasks(id),
 rule_version integer not null,
 payment_model text not null,
 earning_trigger text not null,
 unit_count numeric(18,6) not null check(unit_count>=0),
 unit_rate numeric(18,4) not null check(unit_rate>=0),
 amount numeric(18,4) not null check(amount>=0),
 currency text not null check(currency='USD'),
 eligibility text not null check(eligibility in ('eligible','pending','held','excluded')),
 decision text not null,
 created_at timestamptz not null default now(),
 unique(review_source,review_key)
);
create index if not exists finance2_reviews_project_idx on app_private.finance2_review_earnings(project_id,created_at);
create index if not exists finance2_reviews_user_idx on app_private.finance2_review_earnings(reviewer_id,created_at);
alter table app_private.finance2_review_earnings enable row level security;
revoke all on app_private.finance2_review_earnings from public,anon,authenticated;

create or replace function app_private.finance2_record_review_earning(
 p_project_id integer,p_reviewer uuid,p_source text,p_key text,p_submission integer,
 p_reviewer_task integer,p_decision text,p_audio_duration_ms integer)
returns void language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_rule app_private.finance2_project_rules;v_units numeric;v_state text;
begin
 select * into v_rule from app_private.finance2_project_rules where project_id=p_project_id;
 if v_rule.project_id is null or v_rule.currency<>'USD' or p_reviewer is null then return;end if;
 if v_rule.model='per_task' then v_units:=1;
 elsif v_rule.model='per_audio_minute' then
   if coalesce(p_audio_duration_ms,0)<=0 then return;end if;
   v_units:=p_audio_duration_ms/60000.0;
 else return;end if;
 v_state:=case
   when v_rule.earning_trigger='manual' then 'pending'
   when v_rule.earning_trigger='approved' and lower(p_decision) not in ('approved','approve','reviewed') then 'pending'
   else 'eligible' end;
 insert into app_private.finance2_review_earnings(
  project_id,reviewer_id,review_source,review_key,submission_id,reviewer_task_id,
  rule_version,payment_model,earning_trigger,unit_count,unit_rate,amount,currency,
  eligibility,decision)
 values(p_project_id,p_reviewer,p_source,p_key,p_submission,p_reviewer_task,
  v_rule.version,v_rule.model,v_rule.earning_trigger,v_units,v_rule.l2_rate,
  round(v_units*v_rule.l2_rate,4),'USD',v_state,p_decision)
 on conflict(review_source,review_key) do nothing;
end $$;

create or replace function app_private.finance2_voice_review_capture()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_project integer;v_duration integer;
begin
 select p.id into v_project from public.project_lab p
 join public.submissions s on s."projectTitle"=p.project_name where s.id=new.submission_id
 order by p.id limit 1;
 if v_project is null then return new;end if;
 select duration_seconds*1000 into v_duration from public.voice_recordings where id=new.recording_id;
 perform app_private.finance2_record_review_earning(v_project,new.reviewer_id,'voice_l2',new.id::text,
 new.submission_id,new.reviewer_task_id,new.decision,v_duration);
 return new;
end $$;
drop trigger if exists finance2_capture_voice_l2_review on public.voice_l2_reviews;
create trigger finance2_capture_voice_l2_review after insert on public.voice_l2_reviews
for each row execute function app_private.finance2_voice_review_capture();

create or replace function app_private.finance2_tx_review_capture()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_item public.transcription_audio_items;
begin
 select * into v_item from public.transcription_audio_items where id=new.audio_item_id;
 if v_item.id is null then return new;end if;
 perform app_private.finance2_record_review_earning(v_item.transcription_project_id,new.reviewer_id,
 'tx_l2',new.history_id::text,
 (select id from public.submissions where task_id=v_item.task_id order by id desc limit 1),
 v_item.review_task_id,new.decision,coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000));
 return new;
end $$;
drop trigger if exists finance2_capture_tx_l2_review on app_private.transcription_review_assessments;
create trigger finance2_capture_tx_l2_review after insert on app_private.transcription_review_assessments
for each row execute function app_private.finance2_tx_review_capture();

create or replace function app_private.finance2_generic_review_capture()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_admin uuid;v_task public.tasks;v_project integer;v_recording public.voice_recordings;
begin
 if old.status is not distinct from new.status or lower(coalesce(old.status,''))<>'pending'
 or lower(coalesce(new.status,'')) not in ('reviewed','rejected') then return new;end if;
 -- Voice review records create their own entry and must not be counted twice.
 if exists(select 1 from public.voice_l2_reviews where submission_id=new.id) then return new;end if;
 v_admin:=auth.uid();if v_admin is null then return new;end if;
 select t.* into v_task from public.tasks t join public.users u on u.id=v_admin
 where t.layer='L2' and t.title=new."projectTitle"
  and t.status in ('pending','submitted')
  and lower(t."assignedTo") in (lower(u.email),lower(coalesce(u."uniqueID",'')))
 order by t.id desc limit 1;
 if v_task.id is null then return new;end if;
 select id into v_project from public.project_lab where project_name=new."projectTitle" order by id limit 1;
 if v_project is null then return new;end if;
 select * into v_recording from public.voice_recordings
 where recording_path=new."audioData" and project_title=new."projectTitle" limit 1;
 perform app_private.finance2_record_review_earning(v_project,v_admin,'generic_l2',new.id::text,
 new.id,v_task.id,new.status,v_recording.duration_seconds*1000);
 return new;
end $$;
drop trigger if exists finance2_capture_generic_l2_review on public.submissions;
create trigger finance2_capture_generic_l2_review after update of status on public.submissions
for each row execute function app_private.finance2_generic_review_capture();

create or replace function public.finance2_my_review_earnings(p_limit integer default 150)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'project_id',e.project_id,'project',p.project_name,'submission_id',e.submission_id,
  'reviewer_task_id',e.reviewer_task_id,'source',e.review_source,'units',e.unit_count,
  'rate',e.unit_rate,'amount',e.amount,'currency',e.currency,'eligibility',e.eligibility,
  'decision',e.decision,'rule_version',e.rule_version,'created_at',e.created_at)
 order by e.created_at desc)
 from (select * from app_private.finance2_review_earnings where reviewer_id=auth.uid()
 order by created_at desc limit greatest(1,least(coalesce(p_limit,150),300))) e
 join public.project_lab p on p.id=e.project_id),'[]'::jsonb);
end $$;
create or replace function public.finance2_admin_review_earnings(p_limit integer default 300)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'project_id',e.project_id,'project',p.project_name,'reviewer_id',e.reviewer_id,
  'source',e.review_source,'submission_id',e.submission_id,'units',e.unit_count,
  'rate',e.unit_rate,'amount',e.amount,'currency',e.currency,'eligibility',e.eligibility,
  'decision',e.decision,'rule_version',e.rule_version,'created_at',e.created_at)
 order by e.created_at desc)
 from (select * from app_private.finance2_review_earnings order by created_at desc
 limit greatest(1,least(coalesce(p_limit,300),1000))) e join public.project_lab p on p.id=e.project_id),'[]'::jsonb);
end $$;
revoke all on function public.finance2_my_review_earnings(integer),public.finance2_admin_review_earnings(integer)
 from public,anon;
grant execute on function public.finance2_my_review_earnings(integer),public.finance2_admin_review_earnings(integer)
 to authenticated;
commit;