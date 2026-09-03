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
  v_window := v_to - v_from;
  v_prev_to := v_from;
  v_prev_from := v_from - v_window;

  with filtered as (
    select a.*, u."fullName" as applicant_name, u.email as applicant_email
    from app_private.contributor_applications a
    join public.users u on u.id=a.user_id
    where (p_track is null or p_track='' or a.track=p_track)
      and (p_language is null or p_language='' or a.language_code=p_language)
  ),
  cohort as (select * from filtered where submitted_at >= v_from and submitted_at < v_to),
  prev_cohort as (select * from filtered where submitted_at >= v_prev_from and submitted_at < v_prev_to),
  decision_events as (select * from filtered where reviewed_at >= v_from and reviewed_at < v_to and status in ('approved','rejected','changes_requested')),
  prev_decisions as (select * from filtered where reviewed_at >= v_prev_from and reviewed_at < v_prev_to and status in ('approved','rejected','changes_requested')),
  open_backlog as (select * from filtered where status in ('pending','under_review') and submitted_at is not null),
  applicant_action as (select * from filtered where status='changes_requested'),
  summary as (
    select jsonb_build_object(
      'received',(select count(*)::int from cohort),
      'unique_applicants',(select count(distinct user_id)::int from cohort),
      'voice_acting_received',(select count(*)::int from cohort where track='voice_acting'),
      'transcription_received',(select count(*)::int from cohort where track='transcription'),
      'approved_decisions',(select count(*)::int from decision_events where status='approved'),
      'rejected_decisions',(select count(*)::int from decision_events where status='rejected'),
      'changes_requested_decisions',(select count(*)::int from decision_events where status='changes_requested'),
      'decisions',(select count(*)::int from decision_events),
      'approval_rate',coalesce((select round((100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1) from decision_events),0),
      'rejection_rate',coalesce((select round((100.0*count(*) filter(where status='rejected')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1) from decision_events),0),
      'review_backlog',(select count(*)::int from open_backlog),
      'pending',(select count(*)::int from open_backlog where status='pending'),
      'under_review',(select count(*)::int from open_backlog where status='under_review'),
      'applicant_action',(select count(*)::int from applicant_action),
      'avg_decision_hours',coalesce((select round(avg(extract(epoch from (reviewed_at-submitted_at))/3600.0)::numeric,1) from decision_events where submitted_at is not null and reviewed_at>=submitted_at),0),
      'median_decision_hours',coalesce((select round((percentile_cont(0.5) within group(order by extract(epoch from (reviewed_at-submitted_at))/3600.0))::numeric,1) from decision_events where submitted_at is not null and reviewed_at>=submitted_at),0),
      'reviewed_within_24h_pct',coalesce((select round((100.0*count(*) filter(where reviewed_at-submitted_at<=interval '24 hours')/nullif(count(*),0))::numeric,1) from decision_events where submitted_at is not null and reviewed_at>=submitted_at),0),
      'avg_open_age_hours',coalesce((select round(avg(extract(epoch from (now()-submitted_at))/3600.0)::numeric,1) from open_backlog),0),
      'oldest_open_age_hours',coalesce((select round(max(extract(epoch from (now()-submitted_at))/3600.0)::numeric,1) from open_backlog),0),
      'previous_received',(select count(*)::int from prev_cohort),
      'previous_decisions',(select count(*)::int from prev_decisions),
      'received_change_pct',case when (select count(*) from prev_cohort)=0 then null else round((100.0*((select count(*) from cohort)-(select count(*) from prev_cohort))/nullif((select count(*) from prev_cohort),0))::numeric,1) end,
      'decisions_change_pct',case when (select count(*) from prev_decisions)=0 then null else round((100.0*((select count(*) from decision_events)-(select count(*) from prev_decisions))/nullif((select count(*) from prev_decisions),0))::numeric,1) end
    ) as data
  ),
  status_rows as (select status,count(*)::int as status_count from cohort group by status),
  trend_days as (
    select gs::date as event_day
    from generate_series(date_trunc('day',v_from),date_trunc('day',v_to-interval '1 millisecond'),interval '1 day') gs
  ),
  trend_rows as (
    select d.event_day,
      (select count(*)::int from filtered f where f.submitted_at>=d.event_day::timestamptz and f.submitted_at<d.event_day::timestamptz+interval '1 day') as submitted_count,
      (select count(*)::int from filtered f where f.status='approved' and f.reviewed_at>=d.event_day::timestamptz and f.reviewed_at<d.event_day::timestamptz+interval '1 day') as approved_count,
      (select count(*)::int from filtered f where f.status='rejected' and f.reviewed_at>=d.event_day::timestamptz and f.reviewed_at<d.event_day::timestamptz+interval '1 day') as rejected_count
    from trend_days d
  ),
  language_rows as (
    select language_code,max(language_label) as language_label,count(*)::int as total,
      count(*) filter(where status='pending')::int as pending,
      count(*) filter(where status='under_review')::int as under_review,
      count(*) filter(where status='changes_requested')::int as changes_requested,
      count(*) filter(where status='approved')::int as approved,
      count(*) filter(where status='rejected')::int as rejected,
      coalesce(round((100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0))::numeric,1),0) as approval_rate,
      coalesce(round((avg(extract(epoch from (reviewed_at-submitted_at))/3600.0) filter(where reviewed_at is not null and submitted_at is not null and reviewed_at>=submitted_at))::numeric,1),0) as avg_decision_hours
    from cohort group by language_code
  ),
  track_rows as (
    select track,count(*)::int as total,
      count(*) filter(where status='pending')::int as pending,
      count(*) filter(where status='under_review')::int as under_review,
      count(*) filter(where status='changes_requested')::int as changes_requested,
      count(*) filter(where status='approved')::int as approved,
      count(*) filter(where status='rejected')::int as rejected,
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
    select d.reviewed_by as reviewer_id,coalesce(u."fullName",u.email,'Unknown reviewer') as reviewer_name,u.email as reviewer_email,
      count(*)::int as decisions,
      count(*) filter(where d.status='approved')::int as approved,
      count(*) filter(where d.status='rejected')::int as rejected,
      count(*) filter(where d.status='changes_requested')::int as changes_requested,
      coalesce(round((avg(extract(epoch from (d.reviewed_at-d.submitted_at))/3600.0) filter(where d.submitted_at is not null and d.reviewed_at>=d.submitted_at))::numeric,1),0) as avg_decision_hours
    from decision_events d left join public.users u on u.id=d.reviewed_by
    group by d.reviewed_by,u."fullName",u.email
  ),
  recent_rows as (
    select id,user_id,applicant_name,applicant_email,track,language_code,language_label,status,submitted_at,reviewed_at,reviewed_by
    from decision_events order by reviewed_at desc limit 12
  )
  select jsonb_build_object(
    'generated_at',now(),
    'period',jsonb_build_object('from',v_from,'to',v_to,'previous_from',v_prev_from,'previous_to',v_prev_to),
    'summary',(select data from summary),
    'status',coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',status_count) order by status_count desc) from status_rows),'[]'::jsonb),
    'trend',coalesce((select jsonb_agg(jsonb_build_object('day',event_day,'submitted',submitted_count,'approved',approved_count,'rejected',rejected_count) order by event_day) from trend_rows),'[]'::jsonb),
    'languages',coalesce((select jsonb_agg(to_jsonb(language_rows) order by total desc,language_label) from language_rows),'[]'::jsonb),
    'tracks',coalesce((select jsonb_agg(to_jsonb(track_rows) order by total desc) from track_rows),'[]'::jsonb),
    'aging',coalesce((select jsonb_agg(jsonb_build_object('bucket',age_bucket,'count',bucket_count) order by age_sort) from aging_rows),'[]'::jsonb),
    'reviewers',coalesce((select jsonb_agg(to_jsonb(reviewer_rows) order by decisions desc,reviewer_name) from reviewer_rows),'[]'::jsonb),
    'recent_decisions',coalesce((select jsonb_agg(to_jsonb(recent_rows) order by reviewed_at desc) from recent_rows),'[]'::jsonb)
  ) into v_result;

  insert into app_private.platform_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'applications.analytics.view','application_dashboard','all',jsonb_build_object('from',v_from,'to',v_to,'track',p_track,'language',p_language));
  return v_result;
end;
$function$;
revoke all on function public.admin_application_analytics(timestamptz,timestamptz,text,text) from public;
grant execute on function public.admin_application_analytics(timestamptz,timestamptz,text,text) to authenticated;