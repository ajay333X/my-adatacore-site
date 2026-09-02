create or replace function public.admin_impersonation_start_solo_voice_session(p_session_id uuid,p_project text,p_task_id integer)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_user public.users; v_task public.tasks; v_session uuid; v_mode text;
begin
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_user from public.users where id=v_target_id for update;
  if v_user.id is null or v_user."accountStatus"<>'active' then raise exception 'TARGET_PLATFORM_ACCESS_REQUIRED'; end if;
  if not app_private.user_has_project_access(v_user.id,p_project) then raise exception 'TARGET_PROJECT_ACCESS_REVOKED'; end if;
  select coalesce(config->>'mode','') into v_mode from public.project_lab where project_name=p_project and is_published=true order by id desc limit 1;
  if v_mode<>'solo_voice_recording' then raise exception 'PAIRED_VOICE_NOT_AVAILABLE_IN_SUPPORT_MODE'; end if;
  select * into v_task from public.tasks where id=p_task_id and title=p_project and status='pending' and layer='L1' and (lower("assignedTo")=lower(v_user.email) or lower("assignedTo")=lower(v_user."uniqueID")) limit 1;
  if v_task.id is null then raise exception 'TARGET_ASSIGNMENT_NOT_AVAILABLE'; end if;
  perform app_private.consume_daily_task_slot(v_task.id,v_user.id);
  select session_id into v_session from public.voice_sessions where project_title=p_project and lower(host_email)=lower(v_user.email) and guest_email is null and status='connected' and host_task_id=v_task.id order by created_at desc limit 1;
  if v_session is null then
    v_session:=gen_random_uuid();
    insert into public.voice_sessions(session_id,project_title,host_email,guest_email,status,host_task_id) values(v_session,p_project,v_user.email,null,'connected',v_task.id);
  end if;
  perform app_private.ops_log('impersonation.voice.start','task',v_task.id::text,null,jsonb_build_object('session_id',p_session_id,'voice_session_id',v_session,'target_user_id',v_user.id));
  return v_session;
end;
$$;

create or replace function public.admin_impersonation_complete_solo_voice_session(p_session_id uuid,p_voice_session uuid,p_recording_path text,p_duration integer)
returns void
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_user public.users; v_s public.voice_sessions; v_task public.tasks;
begin
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_user from public.users where id=v_target_id for update;
  if v_user.id is null then raise exception 'CONTRIBUTOR_NOT_FOUND'; end if;
  select * into v_s from public.voice_sessions where session_id=p_voice_session for update;
  if v_s.session_id is null or v_s.guest_email is not null or lower(v_s.host_email)<>lower(v_user.email) then raise exception 'VOICE_SESSION_NOT_OWNED_BY_TARGET'; end if;
  if p_duration<0 or p_duration>14400 then raise exception 'INVALID_DURATION'; end if;
  if p_recording_path is null or split_part(p_recording_path,'_',1)<>p_voice_session::text then raise exception 'INVALID_RECORDING_PATH'; end if;
  if not app_private.user_has_project_access(v_user.id,v_s.project_title) then raise exception 'TARGET_PROJECT_ACCESS_REVOKED'; end if;
  if v_s.status<>'completed' then
    update public.voice_sessions set status='completed',recording_url=p_recording_path,duration_seconds=p_duration,ended_at=now() where session_id=p_voice_session;
    select * into v_task from public.tasks where id=v_s.host_task_id and title=v_s.project_title and layer='L1' and status='pending' and (lower("assignedTo")=lower(v_user.email) or lower("assignedTo")=lower(v_user."uniqueID")) for update;
    if v_task.id is not null then
      perform app_private.consume_daily_task_slot(v_task.id,v_user.id);
      if not exists(select 1 from public.submissions where task_id=v_task.id) then
        insert into public.submissions("workerUID","projectTitle","earnedAmount","audioData",status,task_id) values(v_user."uniqueID",v_task.title,coalesce(v_task.price,0),p_recording_path,'Pending',v_task.id);
      end if;
      update public.tasks set status='submitted' where id=v_task.id;
    end if;
    delete from public.voice_queue where matched_session_id=p_voice_session;
  end if;
  perform app_private.ops_log('impersonation.voice.complete','task',coalesce(v_task.id,v_s.host_task_id)::text,null,jsonb_build_object('session_id',p_session_id,'voice_session_id',p_voice_session,'target_user_id',v_user.id,'duration',p_duration));
end;
$$;

create or replace function public.admin_impersonation_claim_next_voice_l2_review(p_session_id uuid,p_task_id integer)
returns table(submission_id integer,worker_uid text,project_title text,source_task_id integer,audio_path text,submitted_at timestamptz,recording_id uuid,duration_seconds integer,rubric jsonb,claimed_at timestamptz)
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_u public.users; v_t public.tasks; v_submission_id integer; v_lifecycle text;
begin
  if exists(select 1 from public.transcription_audio_items tx where tx.task_id=p_task_id or tx.review_task_id=p_task_id) then raise exception 'OPEN_TRANSCRIPTION_WORKSPACE'; end if;
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_u from public.users where id=v_target_id for update;
  if v_u.id is null or v_u."accountStatus"<>'active' then raise exception 'TARGET_PLATFORM_ACCESS_REQUIRED'; end if;
  select * into v_t from public.tasks where id=p_task_id and layer='L2' and status='pending' and (lower("assignedTo")=lower(v_u.email) or lower("assignedTo")=lower(v_u."uniqueID")) for update;
  if v_t.id is null then raise exception 'TARGET_REVIEWER_ASSIGNMENT_NOT_FOUND'; end if;
  if not app_private.user_has_project_access(v_u.id,v_t.title) then raise exception 'TARGET_PROJECT_ACCESS_REVOKED'; end if;
  select lifecycle_status into v_lifecycle from public.project_lab where project_name=v_t.title order by id desc limit 1;
  if coalesce(v_lifecycle,'active')<>'active' then raise exception 'PROJECT_PAUSED_OR_ARCHIVED'; end if;
  update public.voice_l2_review_claims c set completed_at=now() where c.completed_at is null and exists(select 1 from public.tasks old_t where old_t.id=c.reviewer_task_id and old_t.status<>'pending');
  select c.submission_id into v_submission_id from public.voice_l2_review_claims c join public.submissions s on s.id=c.submission_id where c.reviewer_task_id=v_t.id and c.reviewer_id=v_u.id and c.completed_at is null and s."projectTitle"=v_t.title and coalesce(s.status,'Pending')='Pending' order by c.claimed_at limit 1;
  if v_submission_id is null then
    select s.id into v_submission_id from public.submissions s where s."projectTitle"=v_t.title and coalesce(s.status,'Pending')='Pending' and nullif(trim(coalesce(s."audioData",'')),'') is not null and not exists(select 1 from public.voice_l2_reviews r where r.submission_id=s.id) and not exists(select 1 from public.voice_l2_review_claims c where c.submission_id=s.id and c.completed_at is null) order by s."timestamp",s.id for update skip locked limit 1;
    if v_submission_id is not null then
      insert into public.voice_l2_review_claims(submission_id,reviewer_task_id,reviewer_id) values(v_submission_id,v_t.id,v_u.id) on conflict on constraint voice_l2_review_claims_submission_id_key do nothing;
      if not found then v_submission_id:=null; end if;
    end if;
  end if;
  if v_submission_id is null then return; end if;
  perform app_private.consume_daily_work_slot(v_t.id,v_u.id,'review:'||v_submission_id);
  perform app_private.ops_log('impersonation.review.claim','task',v_t.id::text,null,jsonb_build_object('session_id',p_session_id,'target_user_id',v_u.id,'submission_id',v_submission_id));
  return query select s.id,s."workerUID",s."projectTitle",s.task_id,s."audioData",s."timestamp",vr.id,coalesce(vr.duration_seconds,vs.duration_seconds,0),case when v_t.rubric_data ? 'rubric' then coalesce(v_t.rubric_data->'rubric','[]'::jsonb) else coalesce(pl.config->'audit_rubric','[]'::jsonb) end,c.claimed_at from public.submissions s join public.voice_l2_review_claims c on c.submission_id=s.id and c.reviewer_task_id=v_t.id and c.reviewer_id=v_u.id and c.completed_at is null left join public.voice_recordings vr on vr.recording_path=s."audioData" and vr.project_title=s."projectTitle" left join public.voice_sessions vs on vs.recording_url=s."audioData" and vs.project_title=s."projectTitle" left join lateral(select p.config from public.project_lab p where p.project_name=s."projectTitle" order by p.id desc limit 1) pl on true where s.id=v_submission_id;
end;
$$;

create or replace function public.admin_impersonation_get_voice_l2_review_history(p_session_id uuid,p_task_id integer,p_submission_id integer)
returns table(review_id bigint,decision text,feedback text,rubric jsonb,created_at timestamptz)
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_u public.users; v_t public.tasks;
begin
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_u from public.users where id=v_target_id;
  select * into v_t from public.tasks where id=p_task_id and layer='L2' and (lower("assignedTo")=lower(v_u.email) or lower("assignedTo")=lower(v_u."uniqueID"));
  if v_t.id is null then raise exception 'TARGET_REVIEWER_ASSIGNMENT_NOT_FOUND'; end if;
  if not exists(select 1 from public.submissions s where s.id=p_submission_id and s."projectTitle"=v_t.title) then raise exception 'SUBMISSION_UNAVAILABLE'; end if;
  return query select r.id,r.decision,r.feedback,r.rubric,r.created_at from public.voice_l2_reviews r where r.submission_id=p_submission_id order by r.created_at desc;
end;
$$;

create or replace function public.admin_impersonation_submit_voice_l2_review(p_session_id uuid,p_task_id integer,p_submission_id integer,p_rubric jsonb,p_decision text,p_feedback text default null)
returns bigint
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_u public.users; v_t public.tasks; v_claim public.voice_l2_review_claims; v_sub public.submissions; v_recording_id uuid; v_review_id bigint; v_remaining integer;
begin
  if exists(select 1 from public.transcription_audio_items tx where tx.task_id=p_task_id or tx.review_task_id=p_task_id) then raise exception 'OPEN_TRANSCRIPTION_WORKSPACE'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'INVALID_REVIEW_DECISION'; end if;
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_u from public.users where id=v_target_id for update;
  if v_u.id is null or v_u."accountStatus"<>'active' then raise exception 'TARGET_PLATFORM_ACCESS_REQUIRED'; end if;
  select * into v_t from public.tasks where id=p_task_id and layer='L2' and status='pending' and (lower("assignedTo")=lower(v_u.email) or lower("assignedTo")=lower(v_u."uniqueID")) for update;
  if v_t.id is null then raise exception 'TARGET_REVIEWER_ASSIGNMENT_NOT_FOUND'; end if;
  if not app_private.user_has_project_access(v_u.id,v_t.title) then raise exception 'TARGET_PROJECT_ACCESS_REVOKED'; end if;
  select * into v_claim from public.voice_l2_review_claims where submission_id=p_submission_id and reviewer_task_id=v_t.id and reviewer_id=v_u.id and completed_at is null for update;
  if v_claim.id is null then raise exception 'REVIEW_ITEM_NOT_CLAIMED_BY_TARGET'; end if;
  select * into v_sub from public.submissions where id=p_submission_id and "projectTitle"=v_t.title and coalesce(status,'Pending')='Pending' for update;
  if v_sub.id is null then raise exception 'SUBMISSION_UNAVAILABLE'; end if;
  perform app_private.consume_daily_work_slot(v_t.id,v_u.id,'review:'||p_submission_id);
  select vr.id into v_recording_id from public.voice_recordings vr where vr.recording_path=v_sub."audioData" and vr.project_title=v_sub."projectTitle" order by vr.submitted_at desc limit 1;
  insert into public.voice_l2_reviews(submission_id,recording_id,reviewer_task_id,reviewer_id,rubric,decision,feedback) values(p_submission_id,v_recording_id,v_t.id,v_u.id,coalesce(p_rubric,'{}'::jsonb),p_decision,nullif(trim(coalesce(p_feedback,'')),'')) returning id into v_review_id;
  update public.voice_l2_review_claims set completed_at=now() where id=v_claim.id;
  if p_decision='approved' then
    update public.users set balance=coalesce(balance,0)+coalesce(v_sub."earnedAmount",0) where "uniqueID"=v_sub."workerUID";
    update public.submissions set status='Approved',reviewed_at=now(),approved_at=now(),rejected_at=null where id=p_submission_id;
    insert into public.submission_payments(submission_id,payment_status,updated_at,updated_by) values(p_submission_id,'pending',now(),auth.uid()) on conflict(submission_id) do nothing;
  else
    update public.submissions set status='Rejected',reviewed_at=now(),rejected_at=now(),approved_at=null where id=p_submission_id;
  end if;
  if v_recording_id is not null then update public.voice_recordings set audit_status='audited',latest_verdict=p_decision,latest_feedback=nullif(trim(coalesce(p_feedback,'')),''),audited_at=now(),updated_at=now() where id=v_recording_id; end if;
  select count(*) into v_remaining from public.submissions s where s."projectTitle"=v_t.title and coalesce(s.status,'Pending')='Pending' and s."audioData" is not null and not exists(select 1 from public.voice_l2_reviews r where r.submission_id=s.id) and not exists(select 1 from public.voice_l2_review_claims c where c.submission_id=s.id and c.completed_at is null);
  if v_remaining=0 and exists(select 1 from public.voice_l2_reviews r where r.reviewer_task_id=v_t.id) then update public.tasks set status='submitted' where id=v_t.id; end if;
  perform app_private.ops_log('impersonation.review.submit','submission',p_submission_id::text,null,jsonb_build_object('session_id',p_session_id,'target_user_id',v_u.id,'review_task_id',v_t.id,'decision',p_decision,'review_id',v_review_id));
  return v_review_id;
end;
$$;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='conversation_records_insert_admin_support') then
    create policy conversation_records_insert_admin_support on storage.objects for insert to authenticated with check (bucket_id='conversation_records' and public.is_active_admin());
  end if;
end $$;

revoke all on function public.admin_impersonation_start_solo_voice_session(uuid,text,integer) from public,anon;
revoke all on function public.admin_impersonation_complete_solo_voice_session(uuid,uuid,text,integer) from public,anon;
revoke all on function public.admin_impersonation_claim_next_voice_l2_review(uuid,integer) from public,anon;
revoke all on function public.admin_impersonation_get_voice_l2_review_history(uuid,integer,integer) from public,anon;
revoke all on function public.admin_impersonation_submit_voice_l2_review(uuid,integer,integer,jsonb,text,text) from public,anon;
grant execute on function public.admin_impersonation_start_solo_voice_session(uuid,text,integer) to authenticated;
grant execute on function public.admin_impersonation_complete_solo_voice_session(uuid,uuid,text,integer) to authenticated;
grant execute on function public.admin_impersonation_claim_next_voice_l2_review(uuid,integer) to authenticated;
grant execute on function public.admin_impersonation_get_voice_l2_review_history(uuid,integer,integer) to authenticated;
grant execute on function public.admin_impersonation_submit_voice_l2_review(uuid,integer,integer,jsonb,text,text) to authenticated;
