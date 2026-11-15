-- Sandbox Voice Studio: isolated runtime backing the SAME contributor UI.
-- New private tables and storage bucket only; production Voice tables are untouched.
create table if not exists app_private.sandbox_voice_takes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  account_id uuid not null references app_private.sandbox_test_accounts(id),
  project_id integer not null references public.project_lab(id),
  script_id uuid not null references public.vs_scripts(id),
  mode text not null default 'solo' check (mode='solo'),
  state text not null default 'recording' check (state in ('recording','l2_pending','changes_requested','approved')),
  storage_path text,
  mime_type text,
  duration_seconds integer,
  bytes integer,
  transcript text not null default '',
  feedback text not null default '',
  rating integer check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
create index if not exists sandbox_voice_owner_project_idx on app_private.sandbox_voice_takes(owner_id,project_id,account_id,created_at desc);
create unique index if not exists sandbox_voice_one_recording_per_account on app_private.sandbox_voice_takes(owner_id,account_id,project_id) where state='recording';
alter table app_private.sandbox_voice_takes enable row level security;
revoke all on app_private.sandbox_voice_takes from public, anon, authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sandbox-voice','sandbox-voice',false,26214400,array['audio/webm','audio/mp4','audio/ogg'])
on conflict (id) do update set public=false,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;

-- Storage policy calls a narrowly scoped SECURITY DEFINER predicate because app_private
-- tables intentionally have NO SELECT grant for authenticated browser users.
create or replace function public.sandbox_voice_storage_allowed(p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
  and split_part(p_path,'/',1)=(select auth.uid())::text
  and exists (
    select 1 from app_private.sandbox_voice_takes t
    where t.owner_id=(select auth.uid())
      and t.id::text=split_part(p_path,'/',2)
      and t.account_id::text=split_part(split_part(p_path,'/',3),'.',1)
      and (not p_write or t.state='recording')
      and exists(select 1 from app_private.sandbox_test_sessions s
      where s.owner_id=(select auth.uid()) and s.account_id=t.account_id
       and s.project_id=t.project_id and s.ended_at is null and s.expires_at>now())
  );
$$;
revoke all on function public.sandbox_voice_storage_allowed(text,boolean) from public,anon;
grant execute on function public.sandbox_voice_storage_allowed(text,boolean) to authenticated;
drop policy if exists sandbox_voice_upload_only on storage.objects;
create policy sandbox_voice_upload_only on storage.objects
for insert to authenticated with check (
 bucket_id='sandbox-voice' and public.sandbox_voice_storage_allowed(name,true)
);
drop policy if exists sandbox_voice_read_only on storage.objects;
create policy sandbox_voice_read_only on storage.objects
for select to authenticated using (
 bucket_id='sandbox-voice' and public.sandbox_voice_storage_allowed(name,false)
);

create or replace function public.admin_sandbox_voice_action(
 p_session_id uuid, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := (select auth.uid());
 v_session app_private.sandbox_test_sessions;
 v_account app_private.sandbox_test_accounts;
 v_role text;
 v_take app_private.sandbox_voice_takes;
 v_script public.vs_scripts;
 v_path text;
 v_bytes integer;
 v_decision text;
 v_feedback text;
begin
 select * into v_session from app_private.sandbox_test_sessions
 where id=p_session_id and owner_id=v_owner and ended_at is null and expires_at>now();
 if v_owner is null or v_session.id is null then raise exception 'SANDBOX_SESSION_INVALID'; end if;
 select * into v_account from app_private.sandbox_test_accounts
 where id=v_session.account_id and owner_id=v_owner and active;
 select level into v_role from app_private.sandbox_test_project_access
 where account_id=v_session.account_id and project_id=v_session.project_id;
 if v_account.id is null or v_role is null
  or not (public.admin_has_capability('project_manage',v_session.project_id)
     or public.admin_has_capability('qa_review',v_session.project_id))
 then raise exception 'SANDBOX_ACCESS_DENIED'; end if;
 if v_session.project_id<>94 or not exists(
  select 1 from public.project_lab where id=v_session.project_id and project_type='voice_recording' and lifecycle_status='active'
 ) then raise exception 'SANDBOX_VOICE_STUDIO_PROJECT_REQUIRED';end if;
 if p_action='validate' then
   return jsonb_build_object('ok',true,'account_id',v_account.id,'name',v_account.name,'level',v_role,'project_id',v_session.project_id);
 elsif p_action='enter' then
   if v_role<>'L1' or p_payload->>'mode'<>'solo' then raise exception 'SANDBOX_SOLO_L1_ONLY';end if;
   select * into v_take from app_private.sandbox_voice_takes
    where owner_id=v_owner and account_id=v_account.id and project_id=v_session.project_id
    and state='recording' order by created_at desc limit 1;
   if v_take.id is null then
     select * into v_script from public.vs_scripts
     where project_id=v_session.project_id and is_active and language='Hindi' and mode='solo'
     order by created_at desc limit 1;
     if v_script.id is null then raise exception 'NO_ACTIVE_SOLO_SCRIPT';end if;
     insert into app_private.sandbox_voice_takes(owner_id,account_id,project_id,script_id)
     values(v_owner,v_account.id,v_session.project_id,v_script.id) returning * into v_take;
     insert into app_private.sandbox_test_events(owner_id,project_id,account_id,action,details)
     values(v_owner,v_session.project_id,v_account.id,'voice.sandbox.enter',jsonb_build_object('take_id',v_take.id));
   end if;
   return jsonb_build_object('id',v_take.id,'script_id',v_take.script_id,'mode','solo','state','recording','sandbox',true);
 elsif p_action='leave' then
   if v_role<>'L1' then raise exception 'L1_ONLY';end if;
   update app_private.sandbox_voice_takes set state='changes_requested'
   where id=(p_payload->>'take_id')::uuid and owner_id=v_owner and account_id=v_account.id and state='recording'
   returning * into v_take;
   if v_take.id is null then raise exception 'SANDBOX_TAKE_NOT_FOUND';end if;
   return jsonb_build_object('ok',true);
 elsif p_action='submit' then
   if v_role<>'L1' then raise exception 'L1_ONLY';end if;
   select * into v_take from app_private.sandbox_voice_takes where
   id=(p_payload->>'take_id')::uuid and owner_id=v_owner and account_id=v_account.id and project_id=v_session.project_id and state='recording' for update;
   if v_take.id is null then raise exception 'SANDBOX_TAKE_NOT_FOUND';end if;
   v_path := v_owner::text||'/'||v_take.id::text||'/'||v_account.id::text||'.'||(p_payload->>'extension');
   v_bytes := nullif(p_payload->>'bytes','')::integer;
   if coalesce(p_payload->>'extension','') not in ('webm','mp4','ogg') or v_bytes is null or v_bytes<1024 or v_bytes>26214400
    or not exists(select 1 from storage.objects where bucket_id='sandbox-voice' and name=v_path)
    then raise exception 'SANDBOX_AUDIO_UPLOAD_REQUIRED';end if;
   update app_private.sandbox_voice_takes set
    storage_path=v_path,mime_type=p_payload->>'mime',bytes=v_bytes,
    duration_seconds=greatest(1,least(10800,(p_payload->>'seconds')::integer)),
    state='l2_pending',submitted_at=now()
   where id=v_take.id returning * into v_take;
   insert into app_private.sandbox_test_events(owner_id,project_id,account_id,action,details)
   values(v_owner,v_session.project_id,v_account.id,'voice.sandbox.submitted',jsonb_build_object('take_id',v_take.id,'bytes',v_bytes));
   return jsonb_build_object('id',v_take.id,'script_id',v_take.script_id,'mode','solo','state','submitted','sandbox',true);
 elsif p_action='transcript' then
   if v_role<>'L1' then raise exception 'L1_ONLY';end if;
   update app_private.sandbox_voice_takes set transcript=left(coalesce(p_payload->>'text',''),30000)
   where id=(p_payload->>'take_id')::uuid and owner_id=v_owner and account_id=v_account.id
   and project_id=v_session.project_id and state='l2_pending' returning * into v_take;
   if v_take.id is null then raise exception 'SANDBOX_TAKE_NOT_FOUND';end if;
   return jsonb_build_object('ok',true);
 elsif p_action='list' then
   return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'script_id',t.script_id,
     'mode',t.mode,'state',t.state,'created_at',t.created_at,'submitted_at',t.submitted_at,
     'feedback',t.feedback,'rating',t.rating,'storage_path',case when v_role='L2' then t.storage_path else null end)
     order by t.created_at desc)
    from app_private.sandbox_voice_takes t
    where t.owner_id=v_owner and t.project_id=v_session.project_id
      and (v_role='L2' or t.account_id=v_account.id)),'[]'::jsonb);
 elsif p_action='review' then
   if v_role<>'L2' then raise exception 'L2_ONLY';end if;
   v_decision := p_payload->>'decision';
   v_feedback := trim(coalesce(p_payload->>'feedback',''));
   if v_decision not in ('approve','request_changes') or length(v_feedback)>4000
    or (v_decision='request_changes' and length(v_feedback)<3) then
     raise exception 'INVALID_REVIEW';end if;
   update app_private.sandbox_voice_takes set
    state=case when v_decision='approve' then 'approved' else 'changes_requested' end,
    feedback=v_feedback,rating=nullif(p_payload->>'rating','')::integer,reviewed_at=now()
   where id=(p_payload->>'take_id')::uuid and owner_id=v_owner and project_id=v_session.project_id
     and account_id<>v_account.id and state='l2_pending'
   returning * into v_take;
   if v_take.id is null then raise exception 'SANDBOX_REVIEW_NOT_ALLOWED';end if;
   insert into app_private.sandbox_test_events(owner_id,project_id,account_id,action,details)
   values(v_owner,v_session.project_id,v_account.id,'voice.sandbox.review',jsonb_build_object('take_id',v_take.id,'decision',v_decision));
   return jsonb_build_object('ok',true,'state',v_take.state);
 else raise exception 'SANDBOX_ACTION_NOT_SUPPORTED';end if;
end $$;
revoke all on function public.admin_sandbox_voice_action(uuid,text,jsonb) from public,anon;
grant execute on function public.admin_sandbox_voice_action(uuid,text,jsonb) to authenticated;
