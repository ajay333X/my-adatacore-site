-- Make admin_staff_roles the authoritative source for Admin access.
-- Legacy users.role remains synchronized for compatibility but is never an authorization bypass.

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public','app_private','pg_temp'
as $$
  select exists(
    select 1
    from public.users u
    join public.admin_staff_roles r on r.user_id=u.id
    where u.id=auth.uid()
      and u."accountStatus"='active'
      and r.role='super_admin'
      and r.active=true
  )
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public','app_private','pg_temp'
as $$ select app_private.is_admin() $$;

create or replace function public.get_my_admin_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_user public.users;
  v_super boolean:=false;
  v_roles jsonb:='[]'::jsonb;
  v_projects jsonb:='[]'::jsonb;
  v_caps jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('allowed',false); end if;
  select * into v_user from public.users where id=auth.uid();
  if v_user.id is null or v_user."accountStatus"<>'active' then
    return jsonb_build_object('allowed',false,'account_status',coalesce(v_user."accountStatus",'missing'));
  end if;

  v_super:=exists(select 1 from public.admin_staff_roles r where r.user_id=v_user.id and r.active=true and r.role='super_admin');

  select coalesce(jsonb_agg(jsonb_build_object('role',x.role,'project_id',x.project_id) order by x.role,x.project_id nulls first),'[]'::jsonb)
  into v_roles
  from (select distinct r.role,r.project_id from public.admin_staff_roles r where r.user_id=v_user.id and r.active=true) x;

  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.project_name,'roles',x.roles) order by x.project_name),'[]'::jsonb)
  into v_projects
  from (
    select p.id,p.project_name,jsonb_agg(distinct r.role) roles
    from public.admin_staff_roles r join public.project_lab p on p.id=r.project_id
    where r.user_id=v_user.id and r.active=true and r.role in ('project_manager','qa_manager')
    group by p.id,p.project_name
  ) x;

  if v_super then
    v_caps:='["overview","access","staff","support","projects","assignments","qa_review","payments","finance","voice","leads","operations"]'::jsonb;
  else
    select coalesce(jsonb_agg(cap),'[]'::jsonb) into v_caps
    from (
      select distinct cap from (
        select 'overview'::text cap
        union all select 'support' where exists(select 1 from public.admin_staff_roles where user_id=v_user.id and active and role='support')
        union all select 'finance' where exists(select 1 from public.admin_staff_roles where user_id=v_user.id and active and role='finance')
        union all select 'payments' where exists(select 1 from public.admin_staff_roles where user_id=v_user.id and active and role='finance')
        union all select 'projects' where exists(select 1 from public.admin_staff_roles where user_id=v_user.id and active and role in ('project_manager','qa_manager'))
        union all select 'assignments' where exists(select 1 from public.admin_staff_roles where user_id=v_user.id and active and role='project_manager')
        union all select 'qa_review' where exists(select 1 from public.admin_staff_roles where user_id=v_user.id and active and role='qa_manager')
      ) q
    ) c;
  end if;

  return jsonb_build_object('allowed',v_super or jsonb_array_length(v_roles)>0,'is_super_admin',v_super,'legacy_role',v_user.role,'roles',v_roles,'capabilities',v_caps,'projects',v_projects);
end
$$;

create or replace function public.admin_has_capability(p_capability text,p_project_id integer default null)
returns boolean
language sql
stable
security definer
set search_path to 'public','app_private','pg_temp'
as $$
  with me as (
    select u.id,u."accountStatus" from public.users u where u.id=auth.uid()
  ), active_roles as (
    select r.role,r.project_id from public.admin_staff_roles r join me on me.id=r.user_id where r.active=true and me."accountStatus"='active'
  )
  select coalesce((select "accountStatus"='active' from me),false) and (
    exists(select 1 from active_roles where role='super_admin')
    or case lower(coalesce(p_capability,''))
      when 'admin_shell' then exists(select 1 from active_roles)
      when 'support' then exists(select 1 from active_roles where role='support')
      when 'finance' then exists(select 1 from active_roles where role='finance')
      when 'assignments' then exists(select 1 from active_roles where role='project_manager' and (p_project_id is null or project_id=p_project_id))
      when 'qa_review' then exists(select 1 from active_roles where role='qa_manager' and (p_project_id is null or project_id=p_project_id))
      when 'project_read' then exists(select 1 from active_roles where role in ('project_manager','qa_manager') and (p_project_id is null or project_id=p_project_id))
      when 'project_manage' then exists(select 1 from active_roles where role='project_manager' and (p_project_id is null or project_id=p_project_id))
      else false
    end
  );
$$;

create or replace function public.admin_set_staff_role(p_user_id uuid,p_role text,p_project_id integer default null,p_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_id uuid;
  v_project integer:=p_project_id;
  v_enabled boolean:=coalesce(p_active,true);
  v_status text;
  v_super_count integer;
begin
  if not public.is_active_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  if p_role not in ('super_admin','project_manager','qa_manager','finance','support') then raise exception 'INVALID_ROLE'; end if;
  if p_role in ('project_manager','qa_manager') and v_project is null then raise exception 'PROJECT_REQUIRED'; end if;
  if p_role in ('super_admin','finance','support') then v_project:=null; end if;

  select "accountStatus" into v_status from public.users where id=p_user_id for update;
  if v_status is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_enabled and v_status<>'active' then raise exception 'ACTIVE_USER_REQUIRED'; end if;

  if p_role='super_admin' and not v_enabled and exists(select 1 from public.admin_staff_roles where user_id=p_user_id and role='super_admin' and active=true) then
    select count(*) into v_super_count from public.admin_staff_roles r join public.users u on u.id=r.user_id
    where r.role='super_admin' and r.active=true and u."accountStatus"='active';
    if v_super_count<=1 then raise exception 'CANNOT_REMOVE_LAST_SUPER_ADMIN'; end if;
  end if;

  update public.admin_staff_roles set active=v_enabled,granted_by=auth.uid(),updated_at=now()
  where user_id=p_user_id and role=p_role and project_id is not distinct from v_project returning id into v_id;
  if v_id is null then
    insert into public.admin_staff_roles(user_id,role,project_id,active,granted_by,updated_at)
    values(p_user_id,p_role,v_project,v_enabled,auth.uid(),now()) returning id into v_id;
  end if;

  if p_role='super_admin' then
    update public.users set role=case when v_enabled then 'admin' else 'user' end where id=p_user_id;
    if not v_enabled then
      update app_private.admin_impersonation_sessions set ended_at=coalesce(ended_at,now()) where admin_id=p_user_id and ended_at is null;
    end if;
  end if;
  return v_id;
end
$$;

create or replace function public.admin_set_user_role(p_user_id uuid,p_role text)
returns void
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_status text;
  v_super_count integer;
begin
  if not public.is_active_admin() then raise exception 'Admin only'; end if;
  if p_role not in ('admin','user') then raise exception 'Invalid role'; end if;
  select "accountStatus" into v_status from public.users where id=p_user_id for update;
  if v_status is null then raise exception 'User not found'; end if;

  if p_role='admin' then
    if v_status<>'active' then raise exception 'Only active users can become admins'; end if;
    perform public.admin_set_staff_role(p_user_id,'super_admin',null,true);
    return;
  end if;

  if exists(select 1 from public.admin_staff_roles where user_id=p_user_id and role='super_admin' and active=true) then
    select count(*) into v_super_count from public.admin_staff_roles r join public.users u on u.id=r.user_id
    where r.role='super_admin' and r.active=true and u."accountStatus"='active';
    if v_super_count<=1 then raise exception 'Cannot remove the last active admin'; end if;
  end if;

  update public.admin_staff_roles set active=false,updated_at=now(),granted_by=auth.uid() where user_id=p_user_id and active=true;
  update public.users set role='user' where id=p_user_id;
  update app_private.admin_impersonation_sessions set ended_at=coalesce(ended_at,now()) where admin_id=p_user_id and ended_at is null;
end
$$;

create or replace function public.admin_staff_roles_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
begin
  if not public.is_active_admin() then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'name',u."fullName",'email',u.email,'role',r.role,'project_id',r.project_id,'project_name',p.project_name,'active',r.active,'account_status',u."accountStatus",'created_at',r.created_at,'updated_at',r.updated_at) order by u."fullName",r.role,p.project_name nulls first) from public.admin_staff_roles r join public.users u on u.id=r.user_id left join public.project_lab p on p.id=r.project_id),'[]'::jsonb),
    'catalog',jsonb_build_array(
      jsonb_build_object('role','super_admin','label','Super Admin','scope','platform'),
      jsonb_build_object('role','project_manager','label','Project Manager','scope','project'),
      jsonb_build_object('role','qa_manager','label','QA Manager','scope','project'),
      jsonb_build_object('role','finance','label','Finance','scope','platform'),
      jsonb_build_object('role','support','label','Support','scope','platform')
    )
  );
end
$$;

update public.users u
set role=case when exists(select 1 from public.admin_staff_roles r where r.user_id=u.id and r.role='super_admin' and r.active=true) then 'admin' else 'user' end
where u.role='admin' or exists(select 1 from public.admin_staff_roles r where r.user_id=u.id and r.role='super_admin');
