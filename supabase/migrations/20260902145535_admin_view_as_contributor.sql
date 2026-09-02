create table if not exists app_private.admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  ended_at timestamptz,
  constraint admin_impersonation_not_self check (admin_id <> target_user_id)
);

create index if not exists admin_impersonation_sessions_admin_active_idx
  on app_private.admin_impersonation_sessions(admin_id, ended_at, expires_at desc);
create index if not exists admin_impersonation_sessions_target_idx
  on app_private.admin_impersonation_sessions(target_user_id, started_at desc);

revoke all on app_private.admin_impersonation_sessions from public, anon, authenticated;

create or replace function app_private.admin_impersonation_target(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target uuid;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  update app_private.admin_impersonation_sessions
     set last_seen_at=now()
   where id=p_session_id and admin_id=auth.uid() and ended_at is null and expires_at>now()
   returning target_user_id into v_target;
  if v_target is null then raise exception 'IMPERSONATION_SESSION_INVALID_OR_EXPIRED'; end if;
  return v_target;
end;
$$;
revoke all on function app_private.admin_impersonation_target(uuid) from public, anon, authenticated;

create or replace function public.admin_begin_contributor_impersonation(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target public.users; v_id uuid; v_exp timestamptz;
begin
  if not public.is_active_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  select * into v_target from public.users where id=p_user_id;
  if v_target.id is null then raise exception 'CONTRIBUTOR_NOT_FOUND'; end if;
  if v_target.role='admin' then raise exception 'ADMIN_ACCOUNTS_CANNOT_BE_IMPERSONATED'; end if;
  update app_private.admin_impersonation_sessions set ended_at=coalesce(ended_at,now()) where admin_id=auth.uid() and ended_at is null;
  insert into app_private.admin_impersonation_sessions(admin_id,target_user_id)
  values(auth.uid(),v_target.id)
  returning id,expires_at into v_id,v_exp;
  perform app_private.ops_log('impersonation.start','user',v_target.id::text,null,jsonb_build_object('session_id',v_id,'target_email',v_target.email,'target_uid',v_target."uniqueID",'expires_at',v_exp));
  return jsonb_build_object('session_id',v_id,'expires_at',v_exp,'target',jsonb_build_object('id',v_target.id,'email',v_target.email,'fullName',v_target."fullName",'uniqueID',v_target."uniqueID",'accountStatus',v_target."accountStatus"));
end;
$$;

create or replace function public.admin_get_contributor_impersonation(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_target public.users; v_session app_private.admin_impersonation_sessions;
begin
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_target from public.users where id=v_target_id;
  select * into v_session from app_private.admin_impersonation_sessions where id=p_session_id;
  return jsonb_build_object('session_id',v_session.id,'started_at',v_session.started_at,'expires_at',v_session.expires_at,'target',jsonb_build_object('id',v_target.id,'email',v_target.email,'fullName',v_target."fullName",'uniqueID',v_target."uniqueID",'role',v_target.role,'accountStatus',v_target."accountStatus"));
end;
$$;

create or replace function public.admin_end_contributor_impersonation(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target uuid;
begin
  if not public.is_active_admin() then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  select target_user_id into v_target from app_private.admin_impersonation_sessions where id=p_session_id and admin_id=auth.uid() and ended_at is null;
  if v_target is null then return false; end if;
  update app_private.admin_impersonation_sessions set ended_at=now(),last_seen_at=now() where id=p_session_id and admin_id=auth.uid() and ended_at is null;
  perform app_private.ops_log('impersonation.end','user',v_target::text,null,jsonb_build_object('session_id',p_session_id));
  return true;
end;
$$;

create or replace function public.admin_get_impersonated_contributor_workspace(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_user public.users; v_tasks jsonb; v_submissions jsonb; v_payments jsonb;
begin
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_user from public.users where id=v_target_id;
  if v_user.id is null then raise exception 'CONTRIBUTOR_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]'::jsonb) into v_tasks
  from (
    select t.id,t.public_task_id,t.title,t.price,t."createdAt",t.status,t.layer,tx.id as transcription_item_id
    from public.tasks t
    left join public.transcription_audio_items tx on t.id=tx.task_id or t.id=tx.review_task_id
    where (lower(t."assignedTo")=lower(v_user.email) or lower(t."assignedTo")=lower(v_user."uniqueID"))
      and app_private.user_has_project_access(v_user.id,t.title)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."timestamp" desc),'[]'::jsonb) into v_submissions
  from (
    select s.id,s."projectTitle",s."earnedAmount",s."timestamp",s.status,s.task_id,t.public_task_id as task_public_id,s.reviewed_at,s.approved_at,s.rejected_at
    from public.submissions s left join public.tasks t on t.id=s.task_id
    where v_user."uniqueID" is not null and lower(s."workerUID")=lower(v_user."uniqueID")
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb) into v_payments
  from (
    select p.id,p.submission_id,p.payment_status,p.scheduled_for,p.processing_at,p.paid_at,p.payment_reference,p.updated_at,t.public_task_id as task_public_id
    from public.submission_payments p join public.submissions s on s.id=p.submission_id left join public.tasks t on t.id=s.task_id
    where v_user."uniqueID" is not null and lower(s."workerUID")=lower(v_user."uniqueID")
  ) x;

  return jsonb_build_object(
    'profile',jsonb_build_object('id',v_user.id,'email',v_user.email,'fullName',v_user."fullName",'uniqueID',v_user."uniqueID",'balance',v_user.balance,'role',v_user.role,'accountStatus',v_user."accountStatus",'dateOfBirth',v_user."Date of Birth",'education',v_user.education,'occupation',v_user.occupation,'phone',v_user.phone,'phone_country_iso2',v_user.phone_country_iso2,'phone_calling_code',v_user.phone_calling_code,'phone_national',v_user.phone_national,'phone_e164',v_user.phone_e164,'lastOnline',v_user."lastOnline"),
    'tasks',v_tasks,'submissions',v_submissions,'payments',v_payments,
    'impersonation',jsonb_build_object('session_id',p_session_id,'admin_id',auth.uid(),'target_user_id',v_user.id)
  );
end;
$$;

create or replace function public.admin_impersonation_update_profile(
  p_session_id uuid,
  p_full_name text,
  p_education text,
  p_occupation text,
  p_phone numeric,
  p_date_of_birth date
)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_target_id uuid; v_before public.users; v_after public.users;
begin
  v_target_id:=app_private.admin_impersonation_target(p_session_id);
  select * into v_before from public.users where id=v_target_id for update;
  if v_before.id is null then raise exception 'CONTRIBUTOR_NOT_FOUND'; end if;
  update public.users set
    "fullName"=nullif(trim(coalesce(p_full_name,'')),''),
    education=nullif(trim(coalesce(p_education,'')),''),
    occupation=nullif(trim(coalesce(p_occupation,'')),''),
    phone=p_phone,
    "Date of Birth"=p_date_of_birth
  where id=v_target_id returning * into v_after;
  perform app_private.ops_log('impersonation.profile_update','user',v_target_id::text,null,jsonb_build_object('session_id',p_session_id,'fields',jsonb_build_array('fullName','education','occupation','phone','dateOfBirth')));
  return jsonb_build_object('id',v_after.id,'email',v_after.email,'fullName',v_after."fullName",'uniqueID',v_after."uniqueID",'balance',v_after.balance,'role',v_after.role,'accountStatus',v_after."accountStatus",'dateOfBirth',v_after."Date of Birth",'education',v_after.education,'occupation',v_after.occupation,'phone',v_after.phone,'lastOnline',v_after."lastOnline");
end;
$$;

revoke all on function public.admin_begin_contributor_impersonation(uuid) from public,anon;
revoke all on function public.admin_get_contributor_impersonation(uuid) from public,anon;
revoke all on function public.admin_end_contributor_impersonation(uuid) from public,anon;
revoke all on function public.admin_get_impersonated_contributor_workspace(uuid) from public,anon;
revoke all on function public.admin_impersonation_update_profile(uuid,text,text,text,numeric,date) from public,anon;
grant execute on function public.admin_begin_contributor_impersonation(uuid) to authenticated;
grant execute on function public.admin_get_contributor_impersonation(uuid) to authenticated;
grant execute on function public.admin_end_contributor_impersonation(uuid) to authenticated;
grant execute on function public.admin_get_impersonated_contributor_workspace(uuid) to authenticated;
grant execute on function public.admin_impersonation_update_profile(uuid,text,text,text,numeric,date) to authenticated;
