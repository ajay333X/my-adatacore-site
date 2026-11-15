-- One independent active Solo and Duo workflow per test identity.
-- Keep both modes isolated and forbid the Solo RPC from operating on Duo takes.
drop index if exists app_private.sandbox_voice_one_recording_per_account;
create unique index sandbox_voice_one_recording_per_account
 on app_private.sandbox_voice_takes(owner_id,account_id,project_id,mode)
 where state='recording';

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
    and state='recording' and mode='solo' and duo_session_id is null order by created_at desc limit 1;
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
   where id=(p_payload->>'take_id')::uuid and owner_id=v_owner and account_id=v_account.id and state='recording' and mode='solo' and duo_session_id is null
   returning * into v_take;
   if v_take.id is null then raise exception 'SANDBOX_TAKE_NOT_FOUND';end if;
   return jsonb_build_object('ok',true);
 elsif p_action='submit' then
   if v_role<>'L1' then raise exception 'L1_ONLY';end if;
   select * into v_take from app_private.sandbox_voice_takes where
   id=(p_payload->>'take_id')::uuid and owner_id=v_owner and account_id=v_account.id and project_id=v_session.project_id and state='recording' and mode='solo' and duo_session_id is null for update;
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
   and project_id=v_session.project_id and state='l2_pending' and mode='solo' and duo_session_id is null returning * into v_take;
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
