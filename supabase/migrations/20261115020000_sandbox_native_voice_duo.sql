-- Isolated Duo Voice Studio sessions; never write to public.vs_sessions/tracks/signals.
create table if not exists app_private.sandbox_voice_duo_sessions(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 project_id integer not null references public.project_lab(id),
 script_id uuid not null references public.vs_scripts(id),
 mode text not null default 'duo' check (mode='duo'),
 recording_started_at timestamptz,
 actor_a uuid not null references app_private.sandbox_test_accounts(id),
 actor_b uuid references app_private.sandbox_test_accounts(id),
 state text not null default 'waiting' check(state in ('waiting','matched','rehearsal','recording','submitted','cancelled')),
 consent_a boolean not null default false,
 consent_b boolean not null default false,
 rehearsal_started_at timestamptz,
 recording_request_status text not null default 'none',
 actor_a_track_state text not null default 'not_started',
 actor_b_track_state text not null default 'not_started',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists sx_duo_pair_idx on app_private.sandbox_voice_duo_sessions(owner_id,project_id,state,created_at);
alter table app_private.sandbox_voice_duo_sessions enable row level security;
revoke all on app_private.sandbox_voice_duo_sessions from public,anon,authenticated;
create table if not exists app_private.sandbox_voice_duo_signals(
 id bigint generated always as identity primary key,
 duo_id uuid not null references app_private.sandbox_voice_duo_sessions(id) on delete cascade,
 sender uuid not null references app_private.sandbox_test_accounts(id),
 kind text not null,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists sx_duo_signals_idx on app_private.sandbox_voice_duo_signals(duo_id,id);
alter table app_private.sandbox_voice_duo_signals enable row level security;
revoke all on app_private.sandbox_voice_duo_signals from public,anon,authenticated;
alter table app_private.sandbox_voice_takes
 drop constraint if exists sandbox_voice_takes_mode_check;
alter table app_private.sandbox_voice_takes
 add constraint sandbox_voice_takes_mode_check check(mode in ('solo','duo'));
alter table app_private.sandbox_voice_takes
 add column if not exists duo_session_id uuid references app_private.sandbox_voice_duo_sessions(id);
create unique index if not exists sx_duo_take_once on app_private.sandbox_voice_takes(duo_session_id,account_id) where duo_session_id is not null;

create or replace function public.admin_sandbox_duo_action(p_session_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := (select auth.uid());
 v_sid app_private.sandbox_test_sessions;
 v_account app_private.sandbox_test_accounts;
 v_role text;
 v_duo app_private.sandbox_voice_duo_sessions;
 v_script public.vs_scripts;
 v_take app_private.sandbox_voice_takes;
 v_id uuid;
 v_mine boolean;
 v_path text;
 v_ext text;
 v_bytes bigint;
 v_status text;
begin
 select * into v_sid from app_private.sandbox_test_sessions
 where id=p_session_id and owner_id=v_owner and ended_at is null and expires_at>now();
 if v_owner is null or v_sid.id is null then raise exception 'SANDBOX_SESSION_INVALID';end if;
 select * into v_account from app_private.sandbox_test_accounts
 where id=v_sid.account_id and owner_id=v_owner and active;
 select level into v_role from app_private.sandbox_test_project_access
 where account_id=v_sid.account_id and project_id=v_sid.project_id;
 if v_account.id is null or v_role is null or v_sid.project_id<>94
 or not(public.admin_has_capability('project_manage',v_sid.project_id)
 or public.admin_has_capability('qa_review',v_sid.project_id))
 then raise exception 'SANDBOX_ACCESS_DENIED';end if;
 if p_action='enter' then
  if v_role<>'L1' then raise exception 'DUO_L1_REQUIRED';end if;
  select * into v_duo from app_private.sandbox_voice_duo_sessions
  where owner_id=v_owner and project_id=v_sid.project_id and
  (actor_a=v_account.id or actor_b=v_account.id)
  and state in ('waiting','matched','rehearsal','recording')
  order by created_at desc limit 1;
  if v_duo.id is null then
   select * into v_duo from app_private.sandbox_voice_duo_sessions
   where owner_id=v_owner and project_id=v_sid.project_id
    and state='waiting' and actor_a<>v_account.id and actor_b is null
   order by created_at limit 1 for update skip locked;
   if v_duo.id is not null then
    update app_private.sandbox_voice_duo_sessions set actor_b=v_account.id,state='matched',updated_at=now()
    where id=v_duo.id returning * into v_duo;
   else
    select * into v_script from public.vs_scripts
    where project_id=v_sid.project_id and mode='duo' and language='Hindi' and is_active
    order by created_at desc limit 1;
    if v_script.id is null then raise exception 'NO_DUO_SCRIPT_AVAILABLE';end if;
    insert into app_private.sandbox_voice_duo_sessions(owner_id,project_id,script_id,actor_a)
    values(v_owner,v_sid.project_id,v_script.id,v_account.id) returning * into v_duo;
   end if;
  end if;
  insert into app_private.sandbox_voice_takes(owner_id,account_id,project_id,script_id,mode,duo_session_id)
  values(v_owner,v_account.id,v_sid.project_id,v_duo.script_id,'duo',v_duo.id)
  on conflict (duo_session_id,account_id) where duo_session_id is not null do nothing;
  return to_jsonb(v_duo);
 end if;
 if p_action='waiting' then
  return to_jsonb((select count(*) from app_private.sandbox_voice_duo_sessions
  where owner_id=v_owner and project_id=v_sid.project_id and state='waiting'));
 end if;
 v_id:=nullif(p_payload->>'session_id','')::uuid;
 select * into v_duo from app_private.sandbox_voice_duo_sessions
 where id=v_id and owner_id=v_owner and project_id=v_sid.project_id
 and (actor_a=v_account.id or actor_b=v_account.id)
 for update;
 if v_duo.id is null then raise exception 'SANDBOX_DUO_NOT_FOUND';end if;
 v_mine:=v_duo.actor_a=v_account.id;
 if p_action='get' then return to_jsonb(v_duo);end if;
 if p_action='heartbeat' then
  update app_private.sandbox_voice_duo_sessions set updated_at=now() where id=v_duo.id;
 elseif p_action='consent' then
  if v_duo.state not in ('matched','rehearsal') then raise exception 'DUO_NOT_READY';end if;
  if v_mine then update app_private.sandbox_voice_duo_sessions set consent_a=true where id=v_duo.id;
  else update app_private.sandbox_voice_duo_sessions set consent_b=true where id=v_duo.id;end if;
  update app_private.sandbox_voice_duo_sessions set state='rehearsal',rehearsal_started_at=coalesce(rehearsal_started_at,now())
  where id=v_duo.id and consent_a and consent_b;
 elseif p_action='request' then
  if not v_mine or v_duo.state<>'rehearsal' or not(v_duo.consent_a and v_duo.consent_b)
   or now()<v_duo.rehearsal_started_at+interval '60 seconds'
  then raise exception 'DUO_REQUEST_NOT_ALLOWED';end if;
  update app_private.sandbox_voice_duo_sessions set recording_request_status='pending' where id=v_duo.id;
 elseif p_action='respond' then
  if v_mine or v_duo.state<>'rehearsal' or v_duo.recording_request_status<>'pending'
  then raise exception 'DUO_RESPONSE_NOT_ALLOWED';end if;
  update app_private.sandbox_voice_duo_sessions
   set recording_request_status=case when coalesce((p_payload->>'accept')::boolean,false) then 'approved' else 'declined' end
  where id=v_duo.id;
 elseif p_action='begin' then
  if not v_mine or v_duo.state<>'rehearsal' or v_duo.recording_request_status<>'approved'
  then raise exception 'DUO_START_NOT_ALLOWED';end if;
  update app_private.sandbox_voice_duo_sessions set state='recording',recording_started_at=now() where id=v_duo.id;
 elseif p_action='progress' then
  if v_duo.state<>'recording' or p_payload->>'state' not in ('recording','stopped')
  then raise exception 'DUO_PROGRESS_NOT_ALLOWED';end if;
  v_status:=p_payload->>'state';
  if v_mine then update app_private.sandbox_voice_duo_sessions set actor_a_track_state=v_status where id=v_duo.id;
  else update app_private.sandbox_voice_duo_sessions set actor_b_track_state=v_status where id=v_duo.id;end if;
 elseif p_action='upload_target' then
  select * into v_take from app_private.sandbox_voice_takes
  where duo_session_id=v_duo.id and account_id=v_account.id and owner_id=v_owner;
  if v_take.id is null or v_take.state<>'recording' or v_duo.state<>'recording'
  then raise exception 'DUO_TAKE_NOT_RECORDING';end if;
  return jsonb_build_object('take_id',v_take.id);
 elseif p_action='submit' then
  if v_duo.state<>'recording' then raise exception 'DUO_NOT_RECORDING';end if;
  select * into v_take from app_private.sandbox_voice_takes
   where duo_session_id=v_duo.id and account_id=v_account.id and owner_id=v_owner for update;
  if v_take.id is null or v_take.state<>'recording' then raise exception 'DUO_TAKE_NOT_ACTIVE';end if;
  v_ext:=p_payload->>'extension';v_bytes:=nullif(p_payload->>'bytes','')::bigint;
  if v_ext not in ('webm','mp4','ogg') or v_bytes is null or v_bytes<1024 or v_bytes>26214400
  then raise exception 'INVALID_SANDBOX_AUDIO';end if;
  v_path:=v_owner::text||'/'||v_take.id::text||'/'||v_account.id::text||'.'||v_ext;
  if not exists(select 1 from storage.objects where bucket_id='sandbox-voice' and name=v_path)
  then raise exception 'SANDBOX_AUDIO_UPLOAD_REQUIRED';end if;
  update app_private.sandbox_voice_takes set state='l2_pending',storage_path=v_path,
   bytes=v_bytes::integer,mime_type=left(coalesce(p_payload->>'mime',''),100),
   duration_seconds=greatest(1,least(10800,coalesce((p_payload->>'seconds')::integer,1))),
   submitted_at=now() where id=v_take.id;
  if v_mine then update app_private.sandbox_voice_duo_sessions set actor_a_track_state='submitted' where id=v_duo.id;
  else update app_private.sandbox_voice_duo_sessions set actor_b_track_state='submitted' where id=v_duo.id;end if;
  update app_private.sandbox_voice_duo_sessions set state='submitted'
  where id=v_duo.id and actor_a_track_state='submitted' and actor_b_track_state='submitted';
 elseif p_action='tracks' then
  return coalesce((select jsonb_agg(jsonb_build_object('actor_id',t.account_id))
   from app_private.sandbox_voice_takes t where t.duo_session_id=v_duo.id
   and t.owner_id=v_owner and t.storage_path is not null),'[]'::jsonb);
 elseif p_action='signal_send' then
  if p_payload->>'kind' not in ('offer','answer','candidate','stop') or length((p_payload->'payload')::text)>100000 then
   raise exception 'INVALID_SIGNAL';end if;
  insert into app_private.sandbox_voice_duo_signals(duo_id,sender,kind,payload)
  values(v_duo.id,v_account.id,p_payload->>'kind',coalesce(p_payload->'payload','{}'::jsonb));
  return jsonb_build_object('ok',true);
 elseif p_action='signal_list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'sender',x.sender,'kind',x.kind,'payload',x.payload) order by x.id)
  from (select * from app_private.sandbox_voice_duo_signals
    where duo_id=v_duo.id and id>greatest(coalesce((p_payload->>'after')::bigint,0),0)
    order by id limit 100) x),'[]'::jsonb);
 elseif p_action='leave' then
  if v_duo.state='submitted' then return to_jsonb(v_duo);end if;
  update app_private.sandbox_voice_takes set state='changes_requested'
   where duo_session_id=v_duo.id and owner_id=v_owner and state='recording';
  update app_private.sandbox_voice_duo_sessions set state='cancelled' where id=v_duo.id;
 elseif p_action='flag' then
  insert into app_private.sandbox_test_events(owner_id,project_id,account_id,action,details)
  values(v_owner,v_sid.project_id,v_account.id,'duo.flagged',jsonb_build_object('session',v_duo.id,'reason',left(coalesce(p_payload->>'reason',''),500)));
 else raise exception 'UNSUPPORTED_SANDBOX_DUO_ACTION';end if;
 select * into v_duo from app_private.sandbox_voice_duo_sessions where id=v_duo.id;
 return to_jsonb(v_duo);
end $$;
revoke all on function public.admin_sandbox_duo_action(uuid,text,jsonb) from public,anon;
grant execute on function public.admin_sandbox_duo_action(uuid,text,jsonb) to authenticated;
