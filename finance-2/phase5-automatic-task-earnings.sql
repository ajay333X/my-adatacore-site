-- Finance 2.0 task earnings: opt-in per-project, no bank transfers.
-- Calculates and snapshots earnings on new task submissions.
begin;
create table if not exists app_private.finance2_task_earnings (
 id bigint generated always as identity primary key,
 submission_id integer not null unique references public.submissions(id) on delete restrict,
 task_id integer references public.tasks(id) on delete restrict,
 project_id integer not null references public.project_lab(id) on delete restrict,
 contributor_id uuid not null references public.users(id) on delete restrict,
 rule_version integer not null,
 work_role text not null check(work_role in ('L1','L2')),
 payment_model text not null,
 earning_trigger text not null check(earning_trigger in ('valid_submission','review_complete','approved','manual')),
 unit_count numeric(18,6) not null check(unit_count>=0),
 unit_rate numeric(18,4) not null check(unit_rate>=0),
 amount numeric(18,4) not null check(amount>=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 eligibility text not null check(eligibility in ('pending','eligible','held','excluded')),
 measurement_source text not null,
 created_at timestamptz not null default now(),
 eligible_at timestamptz,
 unique(project_id,submission_id)
);
create index if not exists finance2_earned_project_idx on app_private.finance2_task_earnings(project_id,eligibility,created_at);
create index if not exists finance2_earned_user_idx on app_private.finance2_task_earnings(contributor_id,created_at);
alter table app_private.finance2_task_earnings enable row level security;
revoke all on app_private.finance2_task_earnings from public,anon,authenticated;

-- A submission must not change the contractual amount after its rate snapshot.
create or replace function app_private.finance2_submission_amount()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_rule app_private.finance2_project_rules; v_project_id integer; v_task public.tasks;
 v_item public.transcription_audio_items; v_amount numeric; v_units numeric; v_rate numeric;
begin
 if tg_op='UPDATE' then
   if old."earnedAmount" is distinct from new."earnedAmount"
    and exists(select 1 from app_private.finance2_task_earnings where submission_id=old.id)
   then new."earnedAmount":=old."earnedAmount";end if;
   return new;
 end if;
 if new.task_id is null then return new;end if;
 select * into v_task from public.tasks where id=new.task_id;
 if v_task.id is null or coalesce(v_task.layer,'') not in ('L1','L2') or v_task.title is distinct from new."projectTitle" then return new;end if;
 select id into v_project_id from public.project_lab where project_name=new."projectTitle" order by id limit 1;
 if v_project_id is null then return new;end if;
 select * into v_rule from app_private.finance2_project_rules where project_id=v_project_id;
 if v_rule.project_id is null or v_rule.currency <> 'USD' then return new;end if;
 if v_rule.model='per_task' then
   v_units:=1;
 elsif v_rule.model='per_audio_minute' then
   select * into v_item from public.transcription_audio_items where task_id=new.task_id order by created_at desc limit 1;
   if v_item.id is null or coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000,0)<=0 then
     raise exception 'FINANCE2_TRUSTED_AUDIO_DURATION_REQUIRED';
   end if;
   v_units:=coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000)/60000.0;
 else
   raise exception 'FINANCE2_UNSUPPORTED_AUTOMATIC_MEASUREMENT';
 end if;
 v_rate:=case when v_task.layer='L2' then v_rule.l2_rate else v_rule.l1_rate end;
 v_amount:=round(v_units*v_rate,4);
 new."earnedAmount":=v_amount;
 return new;
end $$;

create or replace function app_private.finance2_snapshot_earning()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_rule app_private.finance2_project_rules;v_task public.tasks;v_user public.users;
 v_project_id integer;v_unit_count numeric;v_unit_rate numeric;v_source text;v_item public.transcription_audio_items;
 v_elig text;
begin
 if tg_op='UPDATE' then
   if old.status is not distinct from new.status then return new;end if;
   update app_private.finance2_task_earnings e
   set eligibility=case
     when exists(select 1 from app_private.finance2_payment_overrides o
       where o.submission_id=new.id and o.state in ('hold','exclude')) then eligibility
     when e.eligibility='pending' and
       ((e.earning_trigger='review_complete' and lower(coalesce(new.status,'')) in ('reviewed','rejected','approved')) or
        (e.earning_trigger='approved' and lower(coalesce(new.status,''))='approved'))
     then 'eligible'
     else eligibility end,
   eligible_at=case when e.eligibility='pending' and
      ((e.earning_trigger='review_complete' and lower(coalesce(new.status,'')) in ('reviewed','rejected','approved')) or
       (e.earning_trigger='approved' and lower(coalesce(new.status,''))='approved'))
     then now() else eligible_at end
   where e.submission_id=new.id;
   return new;
 end if;
 if new.task_id is null then return new;end if;
 select * into v_task from public.tasks where id=new.task_id;
 if v_task.id is null or v_task.layer not in ('L1','L2') or v_task.title is distinct from new."projectTitle" then return new;end if;
 select id into v_project_id from public.project_lab where project_name=v_task.title order by id limit 1;
 if v_project_id is null then return new;end if;
 select * into v_rule from app_private.finance2_project_rules where project_id=v_project_id;
 if v_rule.project_id is null or v_rule.currency <> 'USD' then return new;end if;
 select * into v_user from public.users
 where "uniqueID"=new."workerUID" or lower(email)=lower(new."workerUID")
 order by case when "uniqueID"=new."workerUID" then 0 else 1 end limit 1;
 if v_user.id is null then raise exception 'FINANCE2_CONTRIBUTOR_NOT_FOUND';end if;
 if v_rule.model='per_task' then
   v_unit_count:=1;v_source:='completed_task';
 elsif v_rule.model='per_audio_minute' then
   select * into v_item from public.transcription_audio_items where task_id=new.task_id order by created_at desc limit 1;
   if v_item.id is null or coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000,0)<=0
     then raise exception 'FINANCE2_TRUSTED_AUDIO_DURATION_REQUIRED';end if;
   v_unit_count:=coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000)/60000.0;
   v_source:='transcription_audio_items.duration_ms';
 else
   raise exception 'FINANCE2_UNSUPPORTED_AUTOMATIC_MEASUREMENT';
 end if;
 v_unit_rate:=case when v_task.layer='L2' then v_rule.l2_rate else v_rule.l1_rate end;
 v_elig:=case when v_rule.earning_trigger='valid_submission'
       or (v_rule.earning_trigger='approved' and lower(new.status)='approved')
       or (v_rule.earning_trigger='review_complete' and lower(new.status) in ('reviewed','rejected','approved'))
      then 'eligible' else 'pending' end;
 insert into app_private.finance2_task_earnings
 (submission_id,task_id,project_id,contributor_id,rule_version,work_role,payment_model,
  earning_trigger,unit_count,unit_rate,amount,currency,eligibility,measurement_source,eligible_at)
 values(new.id,new.task_id,v_project_id,v_user.id,v_rule.version,v_task.layer,v_rule.model,
  v_rule.earning_trigger,v_unit_count,v_unit_rate,round(v_unit_count*v_unit_rate,4),
  v_rule.currency,v_elig,v_source,case when v_elig='eligible' then now() end)
 on conflict(submission_id) do nothing;
 return new;
end $$;

drop trigger if exists finance2_submission_amount on public.submissions;
create trigger finance2_submission_amount before insert or update of "earnedAmount" on public.submissions
for each row execute function app_private.finance2_submission_amount();
drop trigger if exists finance2_snapshot_earning on public.submissions;
create trigger finance2_snapshot_earning after insert or update of status on public.submissions
for each row execute function app_private.finance2_snapshot_earning();

-- Financial configurations are effective only where the system has a trusted
-- measurement and a USD legacy wallet. Other currencies/units fail closed.
create or replace function public.finance2_set_project_rule(
 p_project_id integer,p_model text,p_trigger text,p_currency text,
 p_l1_rate numeric,p_l2_rate numeric)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_old app_private.finance2_project_rules;v_new app_private.finance2_project_rules;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 if not exists(select 1 from public.project_lab where id=p_project_id) then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_model not in ('per_task','per_audio_minute') then raise exception 'AUTOMATIC_MODEL_NOT_YET_SUPPORTED';end if;
 if p_trigger not in ('valid_submission','review_complete','approved','manual')
   or p_currency <> 'USD' or p_l1_rate is null or p_l2_rate is null or p_l1_rate<0 or p_l2_rate<0
   then raise exception 'INVALID_RULE_OR_UNSUPPORTED_CURRENCY';end if;
 perform pg_advisory_xact_lock(87022,p_project_id);
 select * into v_old from app_private.finance2_project_rules where project_id=p_project_id for update;
 insert into app_private.finance2_project_rules(project_id,model,earning_trigger,currency,l1_rate,l2_rate,version,updated_by)
 values(p_project_id,p_model,p_trigger,p_currency,p_l1_rate,p_l2_rate,coalesce(v_old.version,0)+1,auth.uid())
 on conflict(project_id) do update set model=excluded.model,earning_trigger=excluded.earning_trigger,
 currency=excluded.currency,l1_rate=excluded.l1_rate,l2_rate=excluded.l2_rate,
 version=excluded.version,updated_at=now(),updated_by=auth.uid() returning * into v_new;
 insert into app_private.finance2_rule_history(project_id,version,old_data,new_data,changed_by)
 values(p_project_id,v_new.version,to_jsonb(v_old),to_jsonb(v_new),auth.uid());
 insert into app_private.finance2_audit(actor_id,event_type,project_id,details)
 values(auth.uid(),'project_rule_saved',p_project_id,jsonb_build_object('version',v_new.version));
 return to_jsonb(v_new);
end $$;

create or replace function public.finance2_my_task_earnings(p_limit integer default 150)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'submission_id',e.submission_id,'project_id',e.project_id,'project',p.project_name,
  'task_id',e.task_id,'role',e.work_role,'amount',e.amount,'currency',e.currency,
  'rate',e.unit_rate,'units',e.unit_count,'model',e.payment_model,'version',e.rule_version,
  'eligibility',coalesce(o.state,e.eligibility),'quality_status',s.status,
  'legacy_payment_status',sp.payment_status,'manual_paid_at',o.paid_at,
  'created_at',e.created_at) order by e.created_at desc)
  from (select * from app_private.finance2_task_earnings where contributor_id=auth.uid()
  order by created_at desc limit greatest(1,least(coalesce(p_limit,150),300))) e
  join public.project_lab p on p.id=e.project_id
  join public.submissions s on s.id=e.submission_id
  left join app_private.finance2_payment_overrides o on o.submission_id=e.submission_id
  left join public.submission_payments sp on sp.submission_id=e.submission_id
  ),'[]'::jsonb);
end $$;

create or replace function public.finance2_admin_task_earnings(p_project_id integer default null,p_limit integer default 250)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'submission_id',e.submission_id,'project_id',e.project_id,'project',p.project_name,
  'task_id',e.task_id,'contributor_id',e.contributor_id,'amount',e.amount,
  'currency',e.currency,'units',e.unit_count,'rate',e.unit_rate,
  'role',e.work_role,'model',e.payment_model,'rule_version',e.rule_version,
  'eligibility',coalesce(o.state,e.eligibility),'quality_status',s.status,
  'legacy_payment_status',sp.payment_status,'manual_paid_at',o.paid_at,
  'created_at',e.created_at) order by e.created_at desc)
  from (select * from app_private.finance2_task_earnings
   where p_project_id is null or project_id=p_project_id
   order by created_at desc limit greatest(1,least(coalesce(p_limit,250),1000))) e
  join public.project_lab p on p.id=e.project_id
  join public.submissions s on s.id=e.submission_id
  left join app_private.finance2_payment_overrides o on o.submission_id=e.submission_id
  left join public.submission_payments sp on sp.submission_id=e.submission_id
  ),'[]'::jsonb);
end $$;
revoke all on function public.finance2_my_task_earnings(integer),
 public.finance2_admin_task_earnings(integer,integer) from public,anon;
grant execute on function public.finance2_my_task_earnings(integer),
 public.finance2_admin_task_earnings(integer,integer) to authenticated;
commit;