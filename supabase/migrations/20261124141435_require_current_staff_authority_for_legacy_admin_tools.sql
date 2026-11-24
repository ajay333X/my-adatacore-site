-- Global participant, task and limit administration requires an active super-admin assignment.
CREATE OR REPLACE FUNCTION public.admin_get_participant_snapshot(p_lookup text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'auth', 'pg_temp'
AS $function$
declare
  v_admin public.users%rowtype; v_user public.users%rowtype; v_last_seen timestamptz;
  v_assignments_received int:=0; v_active_assignments int:=0; v_completed_submissions int:=0; v_approved int:=0; v_rejected int:=0; v_pending int:=0; v_reviewed int:=0;
  v_approved_earnings numeric:=0; v_pending_payout numeric:=0; v_processing numeric:=0; v_paid numeric:=0; v_voice_sessions int:=0; v_voice_seconds bigint:=0;
  v_first_submission timestamptz; v_last_submission timestamptz; v_assignments jsonb:='[]'::jsonb; v_submissions jsonb:='[]'::jsonb; v_projects jsonb:='[]'::jsonb; v_voice jsonb:='[]'::jsonb;
begin
  select * into v_admin from public.users where id=auth.uid();
  if not app_private.is_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  if v_admin."lastOnline" is null or v_admin."lastOnline" < now()-interval '30 seconds' then update public.users set "lastOnline"=now() where id=v_admin.id; end if;
  if coalesce(trim(p_lookup),'')='' then return null; end if;
  select * into v_user from public.users where (email is not null and lower(email)=lower(trim(p_lookup))) or ("uniqueID" is not null and lower("uniqueID")=lower(trim(p_lookup))) order by case when email is not null and lower(email)=lower(trim(p_lookup)) then 0 else 1 end limit 1;
  if not found then return null; end if;
  v_last_seen := app_private.effective_last_seen(v_user.id);

  select count(*),count(*) filter(where status='pending') into v_assignments_received,v_active_assignments from public.tasks where (v_user.email is not null and lower("assignedTo")=lower(v_user.email)) or (v_user."uniqueID" is not null and lower("assignedTo")=lower(v_user."uniqueID"));
  select count(*),count(*) filter(where status='Approved'),count(*) filter(where status='Rejected'),count(*) filter(where status='Pending'),count(*) filter(where status='Reviewed'),coalesce(sum("earnedAmount") filter(where status='Approved'),0),min("timestamp"),max("timestamp") into v_completed_submissions,v_approved,v_rejected,v_pending,v_reviewed,v_approved_earnings,v_first_submission,v_last_submission from public.submissions where v_user."uniqueID" is not null and lower("workerUID")=lower(v_user."uniqueID");
  select coalesce(sum(s."earnedAmount") filter(where coalesce(sp.payment_status,'pending') in('pending','scheduled','on_hold')),0),coalesce(sum(s."earnedAmount") filter(where coalesce(sp.payment_status,'pending')='processing'),0),coalesce(sum(s."earnedAmount") filter(where coalesce(sp.payment_status,'pending')='paid'),0) into v_pending_payout,v_processing,v_paid from public.submissions s left join public.submission_payments sp on sp.submission_id=s.id where v_user."uniqueID" is not null and lower(s."workerUID")=lower(v_user."uniqueID") and s.status='Approved';
  select count(*),coalesce(sum(coalesce(duration_seconds,0)),0) into v_voice_sessions,v_voice_seconds from public.voice_sessions where v_user.email is not null and (lower(host_email)=lower(v_user.email) or lower(guest_email)=lower(v_user.email));
  select coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_at desc),'[]'::jsonb) into v_assignments from (select id,title as project,price,"createdAt" as assigned_at,status,layer,parent_task_id from public.tasks where (v_user.email is not null and lower("assignedTo")=lower(v_user.email)) or (v_user."uniqueID" is not null and lower("assignedTo")=lower(v_user."uniqueID")) order by "createdAt" desc limit 20)x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at desc),'[]'::jsonb) into v_submissions from (select s.id,s.task_id,s."projectTitle" as project,s."earnedAmount" as amount,s."timestamp" as submitted_at,s.status,s.reviewed_at,s.approved_at,s.rejected_at,coalesce(sp.payment_status,case when s.status='Approved' then 'pending' else null end) as payment_status,sp.scheduled_for,sp.processing_at,sp.paid_at,sp.payment_reference from public.submissions s left join public.submission_payments sp on sp.submission_id=s.id where v_user."uniqueID" is not null and lower(s."workerUID")=lower(v_user."uniqueID") order by s."timestamp" desc limit 20)x;
  with activity as (select title as project,count(*)::int assignments,0::int submissions,max("createdAt") last_activity from public.tasks where (v_user.email is not null and lower("assignedTo")=lower(v_user.email)) or (v_user."uniqueID" is not null and lower("assignedTo")=lower(v_user."uniqueID")) group by title union all select "projectTitle",0::int,count(*)::int,max("timestamp") from public.submissions where v_user."uniqueID" is not null and lower("workerUID")=lower(v_user."uniqueID") group by "projectTitle"),agg as(select project,sum(assignments)::int assignments,sum(submissions)::int submissions,max(last_activity) last_activity from activity where project is not null group by project) select coalesce(jsonb_agg(jsonb_build_object('project',a.project,'assignments',a.assignments,'submissions',a.submissions,'last_activity',a.last_activity,'access_status',coalesce((select pac.access_status from public.project_lab pl left join public.project_access_controls pac on pac.project_id=pl.id and pac.user_id=v_user.id where lower(pl.project_name)=lower(a.project) order by pl.id desc limit 1),'active')) order by a.last_activity desc),'[]'::jsonb) into v_projects from agg a;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_voice from (select session_id,project_title as project,status,duration_seconds,created_at,ended_at,case when lower(host_email)=lower(v_user.email) then 'host' else 'guest' end participant_role from public.voice_sessions where v_user.email is not null and (lower(host_email)=lower(v_user.email) or lower(guest_email)=lower(v_user.email)) order by created_at desc limit 10)x;

  return jsonb_build_object('profile',jsonb_build_object('id',v_user.id,'full_name',v_user."fullName",'email',v_user.email,'uid',v_user."uniqueID",'role',v_user.role,'account_status',v_user."accountStatus",'last_online',v_last_seen,'balance',coalesce(v_user.balance,0),'education',v_user.education,'occupation',v_user.occupation),'metrics',jsonb_build_object('assignments_received',v_assignments_received,'active_assignments',v_active_assignments,'submissions_completed',v_completed_submissions,'approved',v_approved,'rejected',v_rejected,'pending_review',v_pending,'reviewed',v_reviewed,'approval_rate',case when(v_approved+v_rejected)>0 then round((v_approved::numeric*100)/(v_approved+v_rejected),1) else null end,'approved_earnings',v_approved_earnings,'pending_payout',v_pending_payout,'processing',v_processing,'paid',v_paid,'voice_sessions',v_voice_sessions,'voice_minutes',round(v_voice_seconds::numeric/60,1),'first_submission_at',v_first_submission,'last_submission_at',v_last_submission),'projects',v_projects,'assignments',v_assignments,'submissions',v_submissions,'voice_sessions',v_voice);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_task_snapshot_by_key(p_task_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'auth', 'pg_temp'
AS $function$
declare
  v_admin public.users%rowtype;
  v_task_id integer;
  v_result jsonb;
begin
  select * into v_admin from public.users where id=auth.uid();
  if not app_private.is_admin() then
    raise exception 'ACTIVE_ADMIN_REQUIRED';
  end if;

  if coalesce(trim(p_task_key),'')='' then return null; end if;

  select id into v_task_id
  from public.tasks
  where upper(public_task_id)=upper(regexp_replace(trim(p_task_key),'^TASK[[:space:]#-]*','','i'))
  limit 1;

  if v_task_id is null and trim(p_task_key) ~ '^[0-9]+$' then
    select id into v_task_id from public.tasks where id=trim(p_task_key)::integer;
  end if;

  if v_task_id is null then return null; end if;

  v_result := public.admin_get_task_snapshot(v_task_id);

  return v_result || jsonb_build_object(
    'searched_public_task_id',(select public_task_id from public.tasks where id=v_task_id),
    'task',coalesce(v_result->'task','{}'::jsonb) || jsonb_build_object(
      'public_task_id',(select public_task_id from public.tasks where id=v_task_id),
      'archived_at',(select archived_at from public.tasks where id=v_task_id),
      'archive_reason',(select archive_reason from public.tasks where id=v_task_id),
      'archive_previous_status',(select archive_previous_status from public.tasks where id=v_task_id)
    ),
    'links',coalesce(v_result->'links','{}'::jsonb) || jsonb_build_object(
      'l1_public_task_id',(select public_task_id from public.tasks where id=nullif((v_result->'links'->>'l1_task_id')::text,'')::integer),
      'l2_public_task_id',(select public_task_id from public.tasks where id=nullif((v_result->'links'->>'l2_task_id')::text,'')::integer)
    ),
    'l1_task',case when v_result->'l1_task' is null or v_result->'l1_task'='null'::jsonb then null else (v_result->'l1_task') || jsonb_build_object(
      'public_task_id',(select public_task_id from public.tasks where id=(v_result->'l1_task'->>'task_id')::integer)
    ) end,
    'l2_task',case when v_result->'l2_task' is null or v_result->'l2_task'='null'::jsonb then null else (v_result->'l2_task') || jsonb_build_object(
      'public_task_id',(select public_task_id from public.tasks where id=(v_result->'l2_task'->>'task_id')::integer)
    ) end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_task_snapshot_raw(p_task_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'auth', 'pg_temp'
AS $function$
declare
  v_admin public.users%rowtype;
  v_task public.tasks%rowtype;
  v_l1 public.tasks%rowtype;
  v_l2 public.tasks%rowtype;
  v_sub public.submissions%rowtype;
  v_claim public.voice_l2_review_claims%rowtype;
  v_review public.voice_l2_reviews%rowtype;
  v_pay public.submission_payments%rowtype;
  v_rec public.voice_recordings%rowtype;
  v_l1_user public.users%rowtype;
  v_l2_user public.users%rowtype;
  v_submission_id integer;
  v_parent_id integer;
begin
  select * into v_admin from public.users where id=auth.uid();
  if not app_private.is_admin() then
    raise exception 'ACTIVE_ADMIN_REQUIRED';
  end if;

  if p_task_id is null then return null; end if;
  select * into v_task from public.tasks where id=p_task_id;
  if not found then return null; end if;

  if v_task.layer='L1' then
    v_l1:=v_task;
    select * into v_sub
    from public.submissions
    where task_id=v_l1.id
    order by "timestamp" desc,id desc
    limit 1;
  else
    select * into v_review
    from public.voice_l2_reviews
    where reviewer_task_id=v_task.id
    order by created_at desc,id desc
    limit 1;

    if found then
      v_submission_id:=v_review.submission_id;
    else
      select * into v_claim
      from public.voice_l2_review_claims
      where reviewer_task_id=v_task.id
      order by claimed_at desc,id desc
      limit 1;
      if found then v_submission_id:=v_claim.submission_id; end if;
    end if;

    if v_submission_id is not null then
      select * into v_sub from public.submissions where id=v_submission_id;
    elsif coalesce(v_task.parent_task_id,'') ~ '^\d+$' then
      v_parent_id:=v_task.parent_task_id::integer;
      select * into v_sub
      from public.submissions
      where task_id=v_parent_id
      order by "timestamp" desc,id desc
      limit 1;
    end if;

    if v_sub.task_id is not null then
      select * into v_l1 from public.tasks where id=v_sub.task_id;
    elsif coalesce(v_task.parent_task_id,'') ~ '^\d+$' then
      select * into v_l1 from public.tasks where id=v_task.parent_task_id::integer;
    end if;
  end if;

  if v_l1.id is not null and v_sub.id is null then
    select * into v_sub
    from public.submissions
    where task_id=v_l1.id
    order by "timestamp" desc,id desc
    limit 1;
  end if;

  if v_task.layer='L2' then
    v_l2:=v_task;
  elsif v_sub.id is not null then
    if v_review.id is null then
      select * into v_review
      from public.voice_l2_reviews
      where submission_id=v_sub.id
      order by created_at desc,id desc
      limit 1;
    end if;
    if v_review.id is not null then
      select * into v_l2 from public.tasks where id=v_review.reviewer_task_id;
    else
      select * into v_claim
      from public.voice_l2_review_claims
      where submission_id=v_sub.id
      order by claimed_at desc,id desc
      limit 1;
      if v_claim.id is not null then
        select * into v_l2 from public.tasks where id=v_claim.reviewer_task_id;
      else
        select * into v_l2
        from public.tasks
        where layer='L2' and parent_task_id=v_l1.id::text
        order by "createdAt" desc,id desc
        limit 1;
      end if;
    end if;
  end if;

  if v_sub.id is not null and v_review.id is null then
    if v_l2.id is not null then
      select * into v_review
      from public.voice_l2_reviews
      where submission_id=v_sub.id and reviewer_task_id=v_l2.id
      order by created_at desc,id desc
      limit 1;
    else
      select * into v_review
      from public.voice_l2_reviews
      where submission_id=v_sub.id
      order by created_at desc,id desc
      limit 1;
    end if;
  end if;

  if v_sub.id is not null and v_claim.id is null then
    if v_l2.id is not null then
      select * into v_claim
      from public.voice_l2_review_claims
      where submission_id=v_sub.id and reviewer_task_id=v_l2.id
      order by claimed_at desc,id desc
      limit 1;
    else
      select * into v_claim
      from public.voice_l2_review_claims
      where submission_id=v_sub.id
      order by claimed_at desc,id desc
      limit 1;
    end if;
  end if;

  if v_sub.id is not null then
    select * into v_pay
    from public.submission_payments
    where submission_id=v_sub.id
    order by updated_at desc,id desc
    limit 1;

    if nullif(btrim(coalesce(v_sub."audioData",'')),'') is not null then
      select * into v_rec
      from public.voice_recordings
      where recording_path=v_sub."audioData"
      order by submitted_at desc
      limit 1;
    end if;
  end if;

  if v_l1.id is not null then
    if v_sub."workerUID" is not null then
      select * into v_l1_user from public.users where lower("uniqueID")=lower(v_sub."workerUID") limit 1;
    end if;
    if v_l1_user.id is null then
      select * into v_l1_user from public.users
      where (email is not null and lower(email)=lower(v_l1."assignedTo"))
         or ("uniqueID" is not null and lower("uniqueID")=lower(v_l1."assignedTo"))
      limit 1;
    end if;
  end if;

  if v_l2.id is not null then
    if v_review.reviewer_id is not null then
      select * into v_l2_user from public.users where id=v_review.reviewer_id;
    elsif v_claim.reviewer_id is not null then
      select * into v_l2_user from public.users where id=v_claim.reviewer_id;
    end if;
    if v_l2_user.id is null then
      select * into v_l2_user from public.users
      where (email is not null and lower(email)=lower(v_l2."assignedTo"))
         or ("uniqueID" is not null and lower("uniqueID")=lower(v_l2."assignedTo"))
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'lookup_task',jsonb_build_object(
      'id',v_task.id,'project',v_task.title,'layer',v_task.layer,'status',v_task.status,
      'assigned_to',v_task."assignedTo",'rate',coalesce(v_task.price,0),'assigned_at',v_task."createdAt",
      'parent_task_id',case when coalesce(v_task.parent_task_id,'')~'^\d+$' then v_task.parent_task_id::integer else null end
    ),
    'l1',case when v_l1.id is null then null else jsonb_build_object(
      'task_id',v_l1.id,'status',v_l1.status,'assigned_to',v_l1."assignedTo",'rate',coalesce(v_l1.price,0),'assigned_at',v_l1."createdAt",
      'user_id',v_l1_user.id,'full_name',v_l1_user."fullName",'email',v_l1_user.email,'uid',v_l1_user."uniqueID"
    ) end,
    'submission',case when v_sub.id is null then null else jsonb_build_object(
      'id',v_sub.id,'task_id',v_sub.task_id,'worker_uid',v_sub."workerUID",'project',v_sub."projectTitle",
      'status',v_sub.status,'amount',coalesce(v_sub."earnedAmount",0),'submitted_at',v_sub."timestamp",
      'reviewed_at',v_sub.reviewed_at,'approved_at',v_sub.approved_at,'rejected_at',v_sub.rejected_at,
      'has_audio',nullif(btrim(coalesce(v_sub."audioData",'')),'') is not null,'audio_path',v_sub."audioData"
    ) end,
    'recording',case when v_rec.id is null then null else jsonb_build_object(
      'id',v_rec.id,'session_id',v_rec.session_id,'duration_seconds',coalesce(v_rec.duration_seconds,0),
      'recording_path',v_rec.recording_path,'submitted_at',v_rec.submitted_at,'audit_status',v_rec.audit_status,
      'latest_verdict',v_rec.latest_verdict,'latest_feedback',v_rec.latest_feedback,'audited_at',v_rec.audited_at
    ) end,
    'l2',case when v_l2.id is null then null else jsonb_build_object(
      'task_id',v_l2.id,'status',v_l2.status,'assigned_to',v_l2."assignedTo",'rate',coalesce(v_l2.price,0),'assigned_at',v_l2."createdAt",
      'parent_task_id',case when coalesce(v_l2.parent_task_id,'')~'^\d+$' then v_l2.parent_task_id::integer else null end,
      'user_id',v_l2_user.id,'full_name',v_l2_user."fullName",'email',v_l2_user.email,'uid',v_l2_user."uniqueID",
      'claimed_at',v_claim.claimed_at,'claim_completed_at',v_claim.completed_at
    ) end,
    'review',case when v_review.id is null then null else jsonb_build_object(
      'id',v_review.id,'decision',v_review.decision,'feedback',v_review.feedback,'rubric',coalesce(v_review.rubric,'{}'::jsonb),
      'reviewed_at',v_review.created_at,'reviewer_task_id',v_review.reviewer_task_id
    ) end,
    'payment',case when v_sub.id is null then null else jsonb_build_object(
      'status',coalesce(v_pay.payment_status,case when v_sub.status='Approved' then 'pending' else null end),
      'scheduled_for',v_pay.scheduled_for,'processing_at',v_pay.processing_at,'paid_at',v_pay.paid_at,
      'reference',v_pay.payment_reference,'updated_at',v_pay.updated_at
    ) end,
    'timeline',jsonb_build_object(
      'l1_assigned_at',v_l1."createdAt",'submitted_at',v_sub."timestamp",'l2_assigned_at',v_l2."createdAt",
      'l2_claimed_at',v_claim.claimed_at,'l2_reviewed_at',v_review.created_at,
      'approved_at',v_sub.approved_at,'rejected_at',v_sub.rejected_at,
      'payment_processing_at',v_pay.processing_at,'payment_paid_at',v_pay.paid_at
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_daily_task_limit(p_user_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_admin public.users; v_target public.users; v_used integer:=0; v_day_start timestamptz;
begin
  select * into v_admin from public.users where id=auth.uid();
  if not app_private.is_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  if p_limit is not null and (p_limit<0 or p_limit>10000) then raise exception 'LIMIT_MUST_BE_0_TO_10000_OR_NULL'; end if;
  update public.users set daily_task_limit=p_limit where id=p_user_id returning * into v_target;
  if v_target.id is null then raise exception 'USER_NOT_FOUND'; end if;
  v_day_start:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  select count(*) into v_used from app_private.daily_task_starts s where s.user_id=v_target.id and s.started_at>=v_day_start and s.started_at<v_day_start+interval '1 day';
  return jsonb_build_object('user_id',v_target.id,'daily_task_limit',p_limit,'started_today',v_used,'remaining',case when p_limit is null then null else greatest(p_limit-v_used,0) end,'timezone','UTC','resets_at',v_day_start+interval '1 day');
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_get_daily_task_limits()
 RETURNS TABLE(user_id uuid, daily_task_limit integer, started_today integer, remaining integer, resets_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_admin public.users; v_day_start timestamptz;
begin
  select * into v_admin from public.users where id=auth.uid();
  if not app_private.is_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  v_day_start:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  return query select u.id,u.daily_task_limit,count(s.work_key)::integer,case when u.daily_task_limit is null then null else greatest(u.daily_task_limit-count(s.work_key)::integer,0) end,v_day_start+interval '1 day' from public.users u left join app_private.daily_task_starts s on s.user_id=u.id and s.started_at>=v_day_start and s.started_at<v_day_start+interval '1 day' group by u.id,u.daily_task_limit order by u."fullName" nulls last,u.email;
end $function$
;