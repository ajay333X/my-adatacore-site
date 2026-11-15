-- Universal dummy-account manager; test identities are not user logins.
-- Existing task counters and reset scopes remain project-local.
create or replace function public.admin_sandbox_list(p_project_id integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());
begin
 if v_owner is null or not(public.admin_has_capability('project_manage',p_project_id)
 or public.admin_has_capability('qa_review',p_project_id))
 then raise exception 'PROJECT_ADMIN_REQUIRED';end if;
 return jsonb_build_object(
   'project_id',p_project_id,
   'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.name)
    from app_private.sandbox_test_accounts a where a.owner_id=v_owner),'[]'::jsonb),
   'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (select * from app_private.sandbox_test_tasks
     where owner_id=v_owner and project_id=p_project_id order by created_at desc limit 200) t),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc)
    from (select * from app_private.sandbox_test_events
     where owner_id=v_owner and project_id=p_project_id order by created_at desc limit 100) e),'[]'::jsonb)
 );
end $$;

create or replace function public.admin_sandbox_update_account(
 p_account_id uuid,p_name text,p_level text,p_active boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid:=(select auth.uid());
 v_account app_private.sandbox_test_accounts;
 v_name text:=trim(coalesce(p_name,''));
begin
 select * into v_account from app_private.sandbox_test_accounts
 where id=p_account_id and owner_id=v_owner for update;
 if v_owner is null or v_account.id is null
   or not public.admin_has_capability('project_manage',v_account.project_id)
 then raise exception 'SANDBOX_ACCOUNT_MANAGE_DENIED';end if;
 if length(v_name) not between 1 and 80 or p_level not in ('L1','L2') or p_active is null
 then raise exception 'INVALID_SANDBOX_ACCOUNT';end if;
 if exists(select 1 from app_private.sandbox_test_accounts
   where owner_id=v_owner and project_id=v_account.project_id and lower(name)=lower(v_name) and id<>v_account.id)
 then raise exception 'SANDBOX_ACCOUNT_NAME_EXISTS';end if;
 update app_private.sandbox_test_accounts
 set name=v_name,level=p_level,active=p_active where id=v_account.id;
 if not p_active then
  update app_private.sandbox_test_sessions set ended_at=now()
  where owner_id=v_owner and account_id=v_account.id and ended_at is null;
 end if;
 insert into app_private.sandbox_test_events(owner_id,project_id,account_id,action,details)
 values(v_owner,v_account.project_id,v_account.id,'account.updated',
  jsonb_build_object('old_name',v_account.name,'new_name',v_name,
   'old_level',v_account.level,'new_level',p_level,'active',p_active));
 return jsonb_build_object('ok',true,'account_id',v_account.id,'name',v_name,'level',p_level,'active',p_active);
end $$;
revoke all on function public.admin_sandbox_update_account(uuid,text,text,boolean) from public,anon;
grant execute on function public.admin_sandbox_update_account(uuid,text,text,boolean) to authenticated;
