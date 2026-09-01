create table if not exists app_private.transcription_l1_allowances (
  project_id integer not null references public.project_lab(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  limit_total integer not null default 0 check (limit_total between 0 and 100),
  remaining integer not null default 0 check (remaining between 0 and 100),
  granted_by uuid null references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

alter table app_private.transcription_l1_allowances enable row level security;
revoke all on app_private.transcription_l1_allowances from public, anon, authenticated;

alter table public.transcription_audio_items drop constraint if exists transcription_audio_items_queue_state_check;
alter table public.transcription_audio_items add constraint transcription_audio_items_queue_state_check check (queue_state in ('vault','queued','archived'));
alter table public.transcription_audio_items add column if not exists archived_at timestamptz;

create or replace function public.tx_set_l1_allowance(p_project_id integer,p_user_keys text[],p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare p public.project_lab; u public.users; k text; active_count integer; result jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if p_quantity is null or p_quantity not between 0 and 100 then raise exception 'Task allowance must be between 0 and 100'; end if;
  if coalesce(cardinality(p_user_keys),0) not between 1 and 100 then raise exception 'Choose between 1 and 100 participants'; end if;
  select * into p from public.project_lab where id=p_project_id and project_type='transcription' and lifecycle_status='active';
  if not found then raise exception 'Choose an active transcription project'; end if;
  foreach k in array p_user_keys loop
    select * into u from public.users where lower(email)=lower(trim(k)) or lower(coalesce("uniqueID",''))=lower(trim(k)) limit 1;
    if u.id is null or u."accountStatus"<>'active' or not app_private.user_has_project_access(u.id,p.project_name) then raise exception 'Participant unavailable or project access revoked: %',k; end if;
    select count(*) into active_count
    from public.transcription_audio_items a
    where a.transcription_project_id=p_project_id and a.assigned_to=u.id and a.queue_state='queued'
      and a.status in ('assigned','in_progress','changes_requested') and a.task_id is not null;
    insert into app_private.transcription_l1_allowances(project_id,user_id,limit_total,remaining,granted_by,updated_at)
    values(p_project_id,u.id,p_quantity,greatest(p_quantity-active_count,0),auth.uid(),now())
    on conflict(project_id,user_id) do update set
      limit_total=excluded.limit_total,remaining=excluded.remaining,granted_by=excluded.granted_by,updated_at=now();
    result:=result||jsonb_build_array(jsonb_build_object('user_id',u.id,'email',u.email,'limit',p_quantity,'active',active_count,'remaining',greatest(p_quantity-active_count,0)));
  end loop;
  perform app_private.log_project_activity(p_project_id,'transcription.allowance_set','participant',null,jsonb_build_object('quantity',p_quantity,'participants',jsonb_array_length(result)));
  return jsonb_build_object('updated',jsonb_array_length(result),'participants',result);
end
$$;

create or replace function public.tx_claim_next(p_project_id integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare p public.project_lab; u public.users; a public.transcription_audio_items; al app_private.transcription_l1_allowances; tid integer; pub text; rem integer;
begin
  select * into u from public.users where id=auth.uid() for update;
  if u.id is null then raise exception 'Sign in to start transcription'; end if;
  if u."accountStatus"<>'active' then raise exception 'Your account is not active'; end if;
  select * into p from public.project_lab where id=p_project_id and project_type='transcription' and lifecycle_status='active';
  if not found or not app_private.user_has_project_access(u.id,p.project_name) then raise exception 'This transcription project is unavailable'; end if;

  select ai.* into a
  from public.transcription_audio_items ai
  join public.tasks t on t.id=ai.task_id
  where ai.transcription_project_id=p_project_id and ai.assigned_to=u.id and ai.queue_state='queued'
    and ai.status in ('assigned','in_progress','changes_requested') and t.status='pending'
  order by case ai.status when 'in_progress' then 0 when 'changes_requested' then 1 else 2 end, ai.updated_at, ai.id
  limit 1 for update of ai;
  if found then
    select public_task_id into pub from public.tasks where id=a.task_id;
    select remaining into rem from app_private.transcription_l1_allowances where project_id=p_project_id and user_id=u.id;
    return jsonb_build_object('item_id',a.id,'task_id',a.task_id,'public_task_id',pub,'remaining',coalesce(rem,0),'resumed',true);
  end if;

  select * into al from app_private.transcription_l1_allowances where project_id=p_project_id and user_id=u.id for update;
  if not found or al.remaining<=0 then raise exception 'NO_TRANSCRIPTION_ALLOWANCE: No transcription tasks remain in your current allowance.'; end if;

  perform pg_advisory_xact_lock(27481,p_project_id);
  perform app_private.tx_queue_normalize(p_project_id);
  select ai.* into a from public.transcription_audio_items ai
  where ai.transcription_project_id=p_project_id and ai.queue_state='queued' and ai.status='unassigned' and ai.task_id is null
  order by ai.queue_position asc nulls last,ai.created_at,ai.id
  limit 1 for update skip locked;
  if not found then raise exception 'TRANSCRIPTION_QUEUE_EMPTY: No audio is currently ready in the live queue.'; end if;

  insert into public.tasks("assignedTo",title,price,layer,status,instructions)
  values(u.email,p.project_name,p.l1_rate,'L1','pending','Open the transcription workspace to segment, transcribe and review the audio.')
  returning id,public_task_id into tid,pub;
  update public.transcription_audio_items set task_id=tid,assigned_to=u.id,status='assigned',queue_position=null,updated_at=now() where id=a.id returning * into a;
  update app_private.transcription_l1_allowances set remaining=remaining-1,updated_at=now() where project_id=p_project_id and user_id=u.id returning remaining into rem;
  perform app_private.tx_queue_normalize(p_project_id);
  perform app_private.log_project_activity(p_project_id,'transcription.claimed_next','audio',a.id::text,jsonb_build_object('task_id',tid,'user_id',u.id,'remaining',rem));
  return jsonb_build_object('item_id',a.id,'task_id',tid,'public_task_id',pub,'remaining',rem,'resumed',false);
end
$$;

create or replace function public.tx_my_transcription_projects()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare u public.users;
begin
  select * into u from public.users where id=auth.uid();
  if u.id is null or u."accountStatus"<>'active' then raise exception 'Active account required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.project_name) from (
    select p.id as project_id,p.project_name,p.description,p.l1_rate as price,
      coalesce(al.limit_total,0) as limit_total,coalesce(al.remaining,0) as remaining,
      act.id as active_item_id,act.task_id as active_task_id,t.public_task_id as active_public_task_id,act.status as active_status,
      (select count(*) from public.transcription_audio_items q where q.transcription_project_id=p.id and q.queue_state='queued' and q.status='unassigned' and q.task_id is null) as queue_available
    from public.project_lab p
    left join app_private.transcription_l1_allowances al on al.project_id=p.id and al.user_id=u.id
    left join lateral (
      select a.id,a.task_id,a.status from public.transcription_audio_items a
      join public.tasks tt on tt.id=a.task_id
      where a.transcription_project_id=p.id and a.assigned_to=u.id and a.queue_state='queued'
        and a.status in ('assigned','in_progress','changes_requested') and tt.status='pending'
      order by case a.status when 'in_progress' then 0 when 'changes_requested' then 1 else 2 end,a.updated_at limit 1
    ) act on true
    left join public.tasks t on t.id=act.task_id
    where p.project_type='transcription' and p.lifecycle_status='active' and app_private.user_has_project_access(u.id,p.project_name)
      and (coalesce(al.remaining,0)>0 or act.id is not null)
  ) x),'[]'::jsonb);
end
$$;

create or replace function public.tx_admin_allowances(p_project integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',u.id,'name',u."fullName",'email',u.email,'uid',u."uniqueID",'limit',a.limit_total,'remaining',a.remaining,'updated_at',a.updated_at) order by u."fullName",u.email)
    from app_private.transcription_l1_allowances a join public.users u on u.id=a.user_id where a.project_id=p_project),'[]'::jsonb);
end
$$;

create or replace function public.tx_archive_queue_items(p_project integer,p_items uuid[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare aid uuid; n integer:=0; skipped integer:=0;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if coalesce(cardinality(p_items),0) not between 1 and 100 then raise exception 'Select between 1 and 100 items'; end if;
  perform pg_advisory_xact_lock(27481,p_project);
  foreach aid in array p_items loop
    update public.transcription_audio_items set queue_state='archived',archived_at=now(),queue_position=null,updated_at=now()
    where id=aid and transcription_project_id=p_project and queue_state='queued' and status='unassigned' and task_id is null and assigned_to is null;
    if found then n:=n+1; else skipped:=skipped+1; end if;
  end loop;
  perform app_private.tx_queue_normalize(p_project);
  perform app_private.log_project_activity(p_project,'transcription.queue_archived','audio',null,jsonb_build_object('archived',n,'skipped',skipped));
  return jsonb_build_object('archived',n,'skipped',skipped);
end
$$;

create or replace function public.tx_get_archived(p_project integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.archived_at desc,a.created_at desc) from public.transcription_audio_items a where a.transcription_project_id=p_project and a.queue_state='archived'),'[]'::jsonb);
end
$$;

create or replace function public.tx_restore_archived(p_project integer,p_items uuid[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare aid uuid; n integer:=0; skipped integer:=0;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if coalesce(cardinality(p_items),0) not between 1 and 100 then raise exception 'Select between 1 and 100 items'; end if;
  perform pg_advisory_xact_lock(27481,p_project);
  foreach aid in array p_items loop
    update public.transcription_audio_items set queue_state='queued',archived_at=null,queue_position=null,updated_at=now()
    where id=aid and transcription_project_id=p_project and queue_state='archived' and status='unassigned' and task_id is null and assigned_to is null;
    if found then n:=n+1; else skipped:=skipped+1; end if;
  end loop;
  perform app_private.tx_queue_normalize(p_project);
  perform app_private.log_project_activity(p_project,'transcription.queue_restored','audio',null,jsonb_build_object('restored',n,'skipped',skipped));
  return jsonb_build_object('restored',n,'skipped',skipped);
end
$$;

create or replace function public.tx_delete_queue_items(p_project integer,p_items uuid[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare aid uuid;a public.transcription_audio_items;deleted jsonb:='[]'::jsonb;skipped integer:=0;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if coalesce(cardinality(p_items),0) not between 1 and 100 then raise exception 'Select between 1 and 100 queue items'; end if;
 if not exists(select 1 from public.project_lab where id=p_project and project_type='transcription') then raise exception 'Choose a transcription project'; end if;
 perform pg_advisory_xact_lock(27481,p_project);
 foreach aid in array p_items loop
  select * into a from public.transcription_audio_items where id=aid and transcription_project_id=p_project for update;
  if not found or a.queue_state not in ('queued','archived') or a.status<>'unassigned' or a.task_id is not null or a.assigned_to is not null or a.review_task_id is not null then skipped:=skipped+1;continue;end if;
  delete from public.transcription_audio_items where id=a.id;
  deleted:=deleted||jsonb_build_array(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'recording_path',a.recording_path,'delete_storage',a.storage_bucket='transcription_audio' and a.source_recording_id is null));
 end loop;
 perform app_private.tx_queue_normalize(p_project);
 perform app_private.log_project_activity(p_project,'transcription.queue_deleted','audio',null,jsonb_build_object('deleted',jsonb_array_length(deleted),'skipped',skipped));
 return jsonb_build_object('deleted_count',jsonb_array_length(deleted),'skipped',skipped,'deleted',deleted);
end
$$;

revoke all on function public.tx_set_l1_allowance(integer,text[],integer) from public,anon;
revoke all on function public.tx_claim_next(integer) from public,anon;
revoke all on function public.tx_my_transcription_projects() from public,anon;
revoke all on function public.tx_admin_allowances(integer) from public,anon;
revoke all on function public.tx_archive_queue_items(integer,uuid[]) from public,anon;
revoke all on function public.tx_get_archived(integer) from public,anon;
revoke all on function public.tx_restore_archived(integer,uuid[]) from public,anon;
revoke all on function public.tx_delete_queue_items(integer,uuid[]) from public,anon;
grant execute on function public.tx_set_l1_allowance(integer,text[],integer) to authenticated;
grant execute on function public.tx_claim_next(integer) to authenticated;
grant execute on function public.tx_my_transcription_projects() to authenticated;
grant execute on function public.tx_admin_allowances(integer) to authenticated;
grant execute on function public.tx_archive_queue_items(integer,uuid[]) to authenticated;
grant execute on function public.tx_get_archived(integer) to authenticated;
grant execute on function public.tx_restore_archived(integer,uuid[]) to authenticated;
grant execute on function public.tx_delete_queue_items(integer,uuid[]) to authenticated;

-- Convert only untouched, never-started L1 transcription tasks into dynamic allowance slots.
with candidates as (
  select p.id project_id,u.id user_id,count(*)::integer n
  from public.tasks t
  join public.project_lab p on p.project_name=t.title and p.project_type='transcription'
  join public.users u on lower(u.email)=lower(t."assignedTo") or lower(coalesce(u."uniqueID",''))=lower(t."assignedTo")
  join public.transcription_audio_items a on a.task_id=t.id
  where t.layer='L1' and t.status='pending' and a.status='assigned' and a.queue_state='queued'
    and not exists(select 1 from public.submissions s where s.task_id=t.id)
  group by p.id,u.id
)
insert into app_private.transcription_l1_allowances(project_id,user_id,limit_total,remaining,updated_at)
select project_id,user_id,n,n,now() from candidates
on conflict(project_id,user_id) do update set limit_total=least(100,app_private.transcription_l1_allowances.limit_total+excluded.limit_total),remaining=least(100,app_private.transcription_l1_allowances.remaining+excluded.remaining),updated_at=now();

update public.transcription_audio_items a set task_id=null,assigned_to=null,status='unassigned',queue_position=null,updated_at=now()
from public.tasks t,public.project_lab p
where a.task_id=t.id and p.project_name=t.title and p.project_type='transcription' and t.layer='L1' and t.status='pending' and a.status='assigned' and a.queue_state='queued'
  and not exists(select 1 from public.submissions s where s.task_id=t.id);

delete from public.tasks t
using public.project_lab p
where p.project_name=t.title and p.project_type='transcription' and t.layer='L1' and t.status='pending'
  and not exists(select 1 from public.transcription_audio_items a where a.task_id=t.id or a.review_task_id=t.id)
  and not exists(select 1 from public.submissions s where s.task_id=t.id);

select app_private.tx_queue_normalize(id) from public.project_lab where project_type='transcription';
