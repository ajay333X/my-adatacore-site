alter table public.transcription_audio_items
  add column if not exists queue_position bigint;

create or replace function app_private.tx_queue_position_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform pg_advisory_xact_lock(27481, new.transcription_project_id);
  if new.queue_state='queued' and new.status='unassigned' and new.task_id is null then
    if new.queue_position is null then
      select coalesce(max(a.queue_position),0)+1 into new.queue_position
      from public.transcription_audio_items a
      where a.transcription_project_id=new.transcription_project_id
        and a.queue_state='queued' and a.status='unassigned' and a.task_id is null
        and (tg_op='INSERT' or a.id<>new.id);
    end if;
  else
    new.queue_position:=null;
  end if;
  return new;
end
$function$;

revoke all on function app_private.tx_queue_position_guard() from public, anon, authenticated;

drop trigger if exists tx_queue_position_guard on public.transcription_audio_items;
create trigger tx_queue_position_guard
before insert or update of transcription_project_id,queue_state,status,task_id,queue_position
on public.transcription_audio_items
for each row execute function app_private.tx_queue_position_guard();

with ranked as (
  select id,row_number() over(partition by transcription_project_id order by created_at,id)::bigint as pos
  from public.transcription_audio_items
  where queue_state='queued' and status='unassigned' and task_id is null
)
update public.transcription_audio_items a
set queue_position=r.pos
from ranked r
where a.id=r.id;

update public.transcription_audio_items
set queue_position=null
where not (queue_state='queued' and status='unassigned' and task_id is null)
  and queue_position is not null;

create index if not exists transcription_audio_queue_priority_idx
on public.transcription_audio_items(transcription_project_id,queue_position,created_at)
where queue_state='queued' and status='unassigned' and task_id is null;

create or replace function app_private.tx_queue_normalize(p_project integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  with ranked as (
    select id,row_number() over(order by queue_position nulls last,created_at,id)::bigint as pos
    from public.transcription_audio_items
    where transcription_project_id=p_project
      and queue_state='queued' and status='unassigned' and task_id is null
  )
  update public.transcription_audio_items a
  set queue_position=r.pos
  from ranked r
  where a.id=r.id and a.queue_position is distinct from r.pos;
end
$function$;

revoke all on function app_private.tx_queue_normalize(integer) from public, anon, authenticated;

create or replace function public.tx_queue_reorder(p_project integer,p_item uuid,p_position integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare current_position bigint; total integer; target integer;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if p_position is null or p_position<1 then raise exception 'Queue position must be 1 or higher'; end if;
  perform 1 from public.project_lab where id=p_project and project_type='transcription' and lifecycle_status='active' for update;
  if not found then raise exception 'Choose an active transcription project'; end if;
  perform 1 from public.transcription_audio_items
    where transcription_project_id=p_project and queue_state='queued' and status='unassigned' and task_id is null
    for update;
  perform app_private.tx_queue_normalize(p_project);
  select queue_position into current_position from public.transcription_audio_items
    where id=p_item and transcription_project_id=p_project
      and queue_state='queued' and status='unassigned' and task_id is null
    for update;
  if current_position is null then raise exception 'Only unassigned live-queue audio can be reordered'; end if;
  select count(*) into total from public.transcription_audio_items
    where transcription_project_id=p_project and queue_state='queued' and status='unassigned' and task_id is null;
  target:=least(p_position,total);
  if target<current_position then
    update public.transcription_audio_items set queue_position=queue_position+1
      where transcription_project_id=p_project and queue_state='queued' and status='unassigned' and task_id is null
        and id<>p_item and queue_position>=target and queue_position<current_position;
  elsif target>current_position then
    update public.transcription_audio_items set queue_position=queue_position-1
      where transcription_project_id=p_project and queue_state='queued' and status='unassigned' and task_id is null
        and id<>p_item and queue_position>current_position and queue_position<=target;
  end if;
  update public.transcription_audio_items set queue_position=target,updated_at=now() where id=p_item;
  perform app_private.log_project_activity(p_project,'transcription.queue_reordered','audio',p_item::text,jsonb_build_object('from',current_position,'to',target));
  return jsonb_build_object('position',target,'total',total);
end
$function$;

revoke all on function public.tx_queue_reorder(integer,uuid,integer) from public, anon;
grant execute on function public.tx_queue_reorder(integer,uuid,integer) to authenticated;

create or replace function public.tx_get_lab(p_project_id integer default null::integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 return jsonb_build_object(
 'projects',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.project_name,'description',p.description,'status',p.lifecycle_status,
   'count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.queue_state='queued'),
   'vault_count',(select count(*) from public.transcription_audio_items a where a.transcription_project_id=p.id and a.queue_state='vault')
 ) order by p.id),'[]') from public.project_lab p where p.project_type='transcription'),
 'items',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('assignee',t."assignedTo",'reviewer',r."assignedTo",'task_status',t.status,'review_task_status',r.status)
   order by case when a.status='unassigned' and a.task_id is null then 0 else 1 end,
            a.queue_position nulls last,a.created_at desc,a.id),'[]')
   from public.transcription_audio_items a
   left join public.tasks t on t.id=a.task_id
   left join public.tasks r on r.id=a.review_task_id
   where a.transcription_project_id=p_project_id and a.queue_state='queued'),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u."fullName",'email',u.email,'uid',u."uniqueID") order by u."fullName"),'[]') from public.users u where u."accountStatus"='active'));
end
$function$;

create or replace function public.tx_assign(p_project_id integer, p_user_keys text[], p_layer text default 'L1'::text, p_quantity integer default 1, p_item_ids uuid[] default null::uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare p public.project_lab;u public.users;a public.transcription_audio_items;k text;i integer;tid integer;pub text;result jsonb:='[]';
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if p_layer not in ('L1','L2') or p_layer is null or p_quantity is null or p_quantity not between 1 and 100 or coalesce(array_length(p_user_keys,1),0) not between 1 and 100 then raise exception 'Choose people, layer and a quantity between 1 and 100'; end if;
 select * into p from public.project_lab where id=p_project_id and project_type='transcription' for update;
 if p.id is null or p.lifecycle_status<>'active' then raise exception 'Choose an active transcription project'; end if;
 if p_layer='L1' then perform app_private.tx_queue_normalize(p_project_id); end if;
 foreach k in array p_user_keys loop
  select * into u from public.users where lower(email)=lower(trim(k)) or "uniqueID"=trim(k) limit 1;
  if u.id is null or u."accountStatus"<>'active' or not app_private.user_has_project_access(u.id,p.project_name) then raise exception 'Participant unavailable or project access revoked: %',k; end if;
  for i in 1..p_quantity loop
   select ai.* into a from public.transcription_audio_items ai left join public.tasks t on t.id=ai.task_id left join public.tasks r on r.id=ai.review_task_id
   where ai.transcription_project_id=p_project_id and ai.queue_state='queued' and (p_item_ids is null or ai.id=any(p_item_ids))
   and ((p_layer='L1' and ai.status in ('unassigned','assigned','in_progress','changes_requested') and (ai.task_id is null or t.status='cancelled'))
    or (p_layer='L2' and ai.status in ('submitted','in_review') and (ai.review_task_id is null or r.status='cancelled') and lower(coalesce(t."assignedTo",'')) not in (lower(u.email),lower(coalesce(u."uniqueID",'')))))
   order by case when p_layer='L1' then ai.queue_position end asc nulls last,
            case when p_layer='L2' then ai.submitted_at end asc nulls last,
            ai.created_at,ai.id limit 1 for update of ai skip locked;
   if a.id is null then raise exception 'Not enough eligible audio modules. Release AI-ready audio from the Vault for L1, or submit transcripts before assigning L2.'; end if;
   insert into public.tasks("assignedTo",title,price,layer,status,instructions) values(u.email,p.project_name,case when p_layer='L1' then p.l1_rate else p.l2_rate end,p_layer,'pending','Open the transcription workspace to segment, transcribe and review the audio.') returning id,public_task_id into tid,pub;
   if p_layer='L1' then update public.transcription_audio_items set task_id=tid,assigned_to=u.id,status='assigned',queue_position=null,updated_at=now() where id=a.id;
   else update public.transcription_audio_items set review_task_id=tid,status='in_review',updated_at=now() where id=a.id;end if;
   result:=result||jsonb_build_array(jsonb_build_object('id',tid,'task_id',pub,'user',u.email,'audio_item_id',a.id));
  end loop;
 end loop;
 if p_layer='L1' then perform app_private.tx_queue_normalize(p_project_id); end if;
 perform app_private.log_project_activity(p_project_id,'transcription.assigned','audio',null,jsonb_build_object('layer',p_layer,'count',jsonb_array_length(result)));
 return jsonb_build_object('created',jsonb_array_length(result),'tasks',result,'skipped','[]'::jsonb);
end
$function$;