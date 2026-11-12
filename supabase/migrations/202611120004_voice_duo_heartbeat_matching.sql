-- Refresh active Duo lobby membership; abandon sessions without heartbeats after 45 seconds.
CREATE OR REPLACE FUNCTION public.vs_enter(p_project integer, p_mode text)
 RETURNS vs_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); v public.vs_sessions; sid uuid; daily_limit integer; used_today integer;
begin
 if u is null or not public.vs_can_join(p_project) then raise exception 'PROJECT_ACCESS_DENIED';end if;
 if p_mode not in ('solo','duo') then raise exception 'INVALID_MODE';end if;
 perform pg_catalog.pg_advisory_xact_lock(p_project::bigint);
 update public.vs_sessions set state='expired',updated_at=now() where project_id=p_project and state='waiting' and updated_at<now()-interval '45 seconds';
 select * into v from public.vs_sessions where project_id=p_project and state in ('waiting','matched','rehearsal','recording') and (actor_a=u or actor_b=u) order by created_at desc limit 1;
 if found then return v;end if;
 if not public.vs_is_admin() then
  select coalesce(task_limit,0) into daily_limit from public.project_access_controls where user_id=u and project_id=p_project and access_status='active';
  if daily_limit is null or daily_limit<1 then raise exception 'DAILY_TASK_LIMIT_REACHED';end if;
  select count(*) into used_today from public.vs_sessions where project_id=p_project and created_at>=date_trunc('day',now()) and (actor_a=u or actor_b=u) and state<>'expired';
  if used_today>=daily_limit then raise exception 'DAILY_TASK_LIMIT_REACHED';end if;
 end if;
 if p_mode='duo' then
  select * into v from public.vs_sessions where project_id=p_project and mode='duo' and state='waiting' and actor_a<>u and updated_at>now()-interval '45 seconds' order by created_at for update skip locked limit 1;
  if found then update public.vs_sessions set actor_b=u,state='matched',updated_at=now() where id=v.id returning * into v;return v;end if;
 end if;
 select id into sid from public.vs_scripts where project_id=p_project and mode=p_mode and (p_project<>94 or language='Hindi') order by random() limit 1;
 if sid is null then raise exception 'NO_AVAILABLE_SCRIPTS';end if;
 insert into public.vs_sessions(project_id,mode,script_id,actor_a,state) values(p_project,p_mode,sid,u,case when p_mode='solo' then 'matched' else 'waiting' end) returning * into v;
 return v;
end;
$function$
;

create or replace function public.vs_wait_heartbeat(p_session uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid := auth.uid();
begin
 if v_actor is null then return false; end if;
 update public.vs_sessions
    set updated_at=now()
  where id=p_session and mode='duo' and state='waiting' and actor_a=v_actor and actor_b is null;
 return found;
end;
$function$;
revoke all on function public.vs_wait_heartbeat(uuid) from public, anon;
grant execute on function public.vs_wait_heartbeat(uuid) to authenticated;
