create table if not exists app_private.application_review_events (
  id bigint generated always as identity primary key,
  application_id uuid not null,
  user_id uuid not null,
  reviewer_id uuid,
  track text not null,
  language_code text not null,
  language_label text,
  status text not null check (status in ('under_review','changes_requested','approved','rejected')),
  note text,
  submitted_at timestamptz,
  occurred_at timestamptz not null default now()
);
create index if not exists application_review_events_application_idx on app_private.application_review_events(application_id,occurred_at desc);
create index if not exists application_review_events_occurred_idx on app_private.application_review_events(occurred_at desc);
create index if not exists application_review_events_reviewer_idx on app_private.application_review_events(reviewer_id,occurred_at desc);
create index if not exists application_review_events_track_language_idx on app_private.application_review_events(track,language_code,occurred_at desc);
revoke all on app_private.application_review_events from public,anon,authenticated;

insert into app_private.application_review_events(application_id,user_id,reviewer_id,track,language_code,language_label,status,note,submitted_at,occurred_at)
select a.id,a.user_id,a.reviewed_by,a.track,a.language_code,a.language_label,a.status,a.reviewer_note,a.submitted_at,a.reviewed_at
from app_private.contributor_applications a
where a.reviewed_at is not null and a.status in ('changes_requested','approved','rejected')
  and not exists(select 1 from app_private.application_review_events e where e.application_id=a.id and e.status=a.status and e.occurred_at=a.reviewed_at);

create or replace function public.admin_set_application_decision(p_application_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare a app_private.contributor_applications%rowtype; mapped integer; v_now timestamptz:=now();
begin
  if not app_private.can_review_applications() then raise exception 'APPLICATION_REVIEW_REQUIRED'; end if;
  if p_status not in ('under_review','changes_requested','approved','rejected') then raise exception 'INVALID_STATUS'; end if;
  select * into a from app_private.contributor_applications where id=p_application_id;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  update app_private.contributor_applications set status=p_status,reviewed_by=auth.uid(),reviewed_at=case when p_status in ('approved','rejected','changes_requested') then v_now else reviewed_at end,
    reviewer_note=nullif(trim(coalesce(p_note,'')),''),updated_at=v_now where id=a.id;
  insert into app_private.application_review_events(application_id,user_id,reviewer_id,track,language_code,language_label,status,note,submitted_at,occurred_at)
  values(a.id,a.user_id,auth.uid(),a.track,a.language_code,a.language_label,p_status,nullif(trim(coalesce(p_note,'')),''),a.submitted_at,v_now);
  if p_status='approved' then
    select project_id into mapped from app_private.application_project_map where track=a.track and language_code=a.language_code and active;
    if mapped is not null then
      insert into public.project_access_controls(user_id,project_id,access_status,updated_by,updated_at)
      values(a.user_id,mapped,'active',auth.uid(),v_now)
      on conflict(user_id,project_id) do update set access_status='active',updated_by=excluded.updated_by,updated_at=v_now;
    end if;
    update app_private.contributor_operations_profile set application_state='active',updated_at=v_now where user_id=a.user_id;
  elsif p_status='rejected' and not exists(select 1 from app_private.contributor_applications x where x.user_id=a.user_id and x.id<>a.id and x.status in ('pending','under_review','approved')) then
    update app_private.contributor_operations_profile set application_state='rejected',updated_at=v_now where user_id=a.user_id;
  end if;
  return public.admin_application_detail(a.id);
end;
$function$;

create or replace function public.admin_application_analytics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_track text default null,
  p_language text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to timestamptz := coalesce(p_to, now());
  v_window interval;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_result jsonb;
begin
  if not app_private.can_review_applications() then raise exception 'APPLICATION_REVIEW_REQUIRED'; end if;
  if v_to <= v_from then raise exception 'INVALID_DATE_RANGE'; end if;
  v_window := v_to - v_from; v_prev_to := v_from; v_prev_from := v_from - v_window;

  with filtered as (
    select a.*,u."fullName" as applicant_name,u.email as applicant_email
    from app_private.contributor_applications a join public.users u on u.id=a.user_id
    where (p_track is null or p_track='' or a.track=p_track) and (p_language is null or p_language='' or a.language_code=p_language)
  ),
  cohort as (select * from filtered where submitted_at>=v_from and submitted_at<v_to),
  prev_cohort as (select * from filtered where submitted_at>=v_prev_from and submitted_at<v_prev_to),
  review_events as (
    select e.*,u."fullName" as applicant_name,u.email as applicant_email
    from app_private.application_review_events e join public.users u on u.id=e.user_id
    where (p_track is null or p_track='' or e.track=p_track) and (p_language is null or p_language='' or e.language_code=p_language)
  ),
  decision_events as (select * from review_events where occurred_at>=v_from and occurred_at<v_to and status in ('approved','rejected','changes_requested')),
  prev_decisions as (select * from review_events where occurred_at>=v_prev_from and occurred_at<v_prev_to and status in ('approved','rejected','changes_requested')),
  open_backlog as (select * from filtered where status in ('pending','under_review') and submitted_at is not null),
  applicant_action as (select * from filtered where status='changes_requested'),
  summary as (
    select jsonb_build_object(
      'received',(select count(*)::int from cohort),'unique_applicants',(select count(distinct user_id)::int from cohort),
      'voice_acting_received',(select count(*)::int from cohort where track='voice_acting'),'transcription_received',(select count(*)::int from cohort where track='transcription'),
      'approved_decisions',(select count(*)::int from decision_events where status='approved'),'rejected_decisions',(select count(*)::int from decision_events where status='rejected'),
      'changes_requested_decisions',(select count(*)::int from decision_events where status='changes_requested'),'decisions',(select count(*)::int from decision_events),
      'approval_rate',coalesce((select round((100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1) from decision_events),0),
      'rejection_rate',coalesce((select round((100.0*count(*) filter(where status='rejected')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1) from decision_events),0),
      'review_backlog',(select count(*)::int from open_backlog),'pending',(select count(*)::int from open_backlog where status='pending'),'under_review',(select count(*)::int from open_backlog where status='under_review'),'applicant_action',(select count(*)::int from applicant_action),
      'avg_decision_hours',coalesce((select round(avg(extract(epoch from (occurred_at-submitted_at))/3600.0)::numeric,1) from decision_events where submitted_at is not null and occurred_at>=submitted_at),0),
      'median_decision_hours',coalesce((select round((percentile_cont(0.5) within group(order by extract(epoch from (occurred_at-submitted_at))/3600.0))::numeric,1) from decision_events where submitted_at is not null and occurred_at>=submitted_at),0),
      'reviewed_within_24h_pct',coalesce((select round((100.0*count(*) filter(where occurred_at-submitted_at<=interval '24 hours')/nullif(count(*),0))::numeric,1) from decision_events where submitted_at is not null and occurred_at>=submitted_at),0),
      'avg_open_age_hours',coalesce((select round(avg(extract(epoch from (now()-submitted_at))/3600.0)::numeric,1) from open_backlog),0),'oldest_open_age_hours',coalesce((select round(max(extract(epoch from (now()-submitted_at))/3600.0)::numeric,1) from open_backlog),0),
      'previous_received',(select count(*)::int from prev_cohort),'previous_decisions',(select count(*)::int from prev_decisions),
      'received_change_pct',case when (select count(*) from prev_cohort)=0 then null else round((100.0*((select count(*) from cohort)-(select count(*) from prev_cohort))/nullif((select count(*) from prev_cohort),0))::numeric,1) end,
      'decisions_change_pct',case when (select count(*) from prev_decisions)=0 then null else round((100.0*((select count(*) from decision_events)-(select count(*) from prev_decisions))/nullif((select count(*) from prev_decisions),0))::numeric,1) end
    ) as data
  ),
  status_rows as (select status,count(*)::int as status_count from cohort group by status),
  trend_days as (select gs::date as event_day from generate_series(date_trunc('day',v_from),date_trunc('day',v_to-interval '1 millisecond'),interval '1 day') gs),
  trend_rows as (
    select d.event_day,
      (select count(*)::int from filtered f where f.submitted_at>=d.event_day::timestamptz and f.submitted_at<d.event_day::timestamptz+interval '1 day') as submitted_count,
      (select count(*)::int from review_events e where e.status='approved' and e.occurred_at>=d.event_day::timestamptz and e.occurred_at<d.event_day::timestamptz+interval '1 day') as approved_count,
      (select count(*)::int from review_events e where e.status='rejected' and e.occurred_at>=d.event_day::timestamptz and e.occurred_at<d.event_day::timestamptz+interval '1 day') as rejected_count
    from trend_days d
  ),
  language_rows as (
    select language_code,max(language_label) as language_label,count(*)::int as total,count(*) filter(where status='pending')::int as pending,count(*) filter(where status='under_review')::int as under_review,count(*) filter(where status='changes_requested')::int as changes_requested,count(*) filter(where status='approved')::int as approved,count(*) filter(where status='rejected')::int as rejected,
      coalesce(round((100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1),0) as approval_rate,
      coalesce(round((avg(extract(epoch from (reviewed_at-submitted_at))/3600.0) filter(where reviewed_at is not null and submitted_at is not null and reviewed_at>=submitted_at))::numeric,1),0) as avg_decision_hours
    from cohort group by language_code
  ),
  track_rows as (
    select track,count(*)::int as total,count(*) filter(where status='pending')::int as pending,count(*) filter(where status='under_review')::int as under_review,count(*) filter(where status='changes_requested')::int as changes_requested,count(*) filter(where status='approved')::int as approved,count(*) filter(where status='rejected')::int as rejected,
      coalesce(round((100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1),0) as approval_rate
    from cohort group by track
  ),
  aging_rows as (
    select age_bucket,age_sort,count(*)::int as bucket_count from (
      select case when now()-submitted_at<interval '24 hours' then '<24h' when now()-submitted_at<interval '3 days' then '1–3d' when now()-submitted_at<interval '7 days' then '3–7d' else '7d+' end as age_bucket,
             case when now()-submitted_at<interval '24 hours' then 1 when now()-submitted_at<interval '3 days' then 2 when now()-submitted_at<interval '7 days' then 3 else 4 end as age_sort
      from open_backlog
    ) x group by age_bucket,age_sort
  ),
  reviewer_rows as (
    select e.reviewer_id,coalesce(u."fullName",u.email,'Unknown reviewer') as reviewer_name,u.email as reviewer_email,count(*)::int as decisions,count(*) filter(where e.status='approved')::int as approved,count(*) filter(where e.status='rejected')::int as rejected,count(*) filter(where e.status='changes_requested')::int as changes_requested,
      coalesce(round((avg(extract(epoch from (e.occurred_at-e.submitted_at))/3600.0) filter(where e.submitted_at is not null and e.occurred_at>=e.submitted_at))::numeric,1),0) as avg_decision_hours
    from decision_events e left join public.users u on u.id=e.reviewer_id group by e.reviewer_id,u."fullName",u.email
  ),
  recent_rows as (
    select application_id as id,user_id,applicant_name,applicant_email,track,language_code,language_label,status,submitted_at,occurred_at as reviewed_at,reviewer_id as reviewed_by
    from decision_events order by occurred_at desc limit 12
  )
  select jsonb_build_object(
    'generated_at',now(),'period',jsonb_build_object('from',v_from,'to',v_to,'previous_from',v_prev_from,'previous_to',v_prev_to),'summary',(select data from summary),
    'status',coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',status_count) order by status_count desc) from status_rows),'[]'::jsonb),
    'trend',coalesce((select jsonb_agg(jsonb_build_object('day',event_day,'submitted',submitted_count,'approved',approved_count,'rejected',rejected_count) order by event_day) from trend_rows),'[]'::jsonb),
    'languages',coalesce((select jsonb_agg(to_jsonb(language_rows) order by total desc,language_label) from language_rows),'[]'::jsonb),'tracks',coalesce((select jsonb_agg(to_jsonb(track_rows) order by total desc) from track_rows),'[]'::jsonb),
    'aging',coalesce((select jsonb_agg(jsonb_build_object('bucket',age_bucket,'count',bucket_count) order by age_sort) from aging_rows),'[]'::jsonb),'reviewers',coalesce((select jsonb_agg(to_jsonb(reviewer_rows) order by decisions desc,reviewer_name) from reviewer_rows),'[]'::jsonb),
    'recent_decisions',coalesce((select jsonb_agg(to_jsonb(recent_rows) order by reviewed_at desc) from recent_rows),'[]'::jsonb)
  ) into v_result;
  insert into app_private.platform_audit_log(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'applications.analytics.view','application_dashboard','all',jsonb_build_object('from',v_from,'to',v_to,'track',p_track,'language',p_language));
  return v_result;
end;
$function$;
revoke all on function public.admin_application_analytics(timestamptz,timestamptz,text,text) from public;
grant execute on function public.admin_application_analytics(timestamptz,timestamptz,text,text) to authenticated;