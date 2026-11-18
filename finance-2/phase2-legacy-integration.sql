-- Finance 2.0 incremental integration with existing Adatacore systems.
-- Apply only after staging test. Existing payment functions remain unchanged.
begin;
create table if not exists app_private.finance2_project_rules (
  project_id integer primary key references public.project_lab(id),
  model text not null default 'per_task' check (model in ('per_task','per_work_hour','per_audio_minute','per_1000_words')),
  earning_trigger text not null default 'approved' check (earning_trigger in ('approved','valid_submission','review_complete','manual')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  l1_rate numeric(16,4) not null default 0 check(l1_rate>=0),
  l2_rate numeric(16,4) not null default 0 check(l2_rate>=0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table if not exists app_private.finance2_rule_history (
 id bigint generated always as identity primary key,
 project_id integer not null references public.project_lab(id),
 version integer not null,
 old_data jsonb,
 new_data jsonb not null,
 changed_by uuid not null references auth.users(id),
 changed_at timestamptz not null default now(),
 unique(project_id,version)
);
create table if not exists app_private.finance2_payment_recommendations (
 id bigint generated always as identity primary key,
 submission_id integer not null references public.submissions(id),
 project_id integer not null references public.project_lab(id),
 recommendation text not null check(recommendation in ('eligible','hold','exclude')),
 reason text not null check(length(trim(reason)) >= 5),
 reviewer_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists finance2_recommendations_by_submission on app_private.finance2_payment_recommendations(submission_id,created_at desc);
create table if not exists app_private.finance2_payment_overrides (
 submission_id integer primary key references public.submissions(id),
 project_id integer not null references public.project_lab(id),
 state text not null check(state in ('eligible','hold','exclude')),
 amount numeric(16,4) not null check(amount>=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 paid_at timestamptz,
 payment_reference text,
 authorized_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 reason text not null check(length(trim(reason))>=5),
 check (paid_at is null or state='eligible')
);
create table if not exists app_private.finance2_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 event_type text not null,
 submission_id integer references public.submissions(id),
 project_id integer references public.project_lab(id),
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
revoke all on app_private.finance2_project_rules,app_private.finance2_rule_history,app_private.finance2_payment_recommendations,app_private.finance2_payment_overrides,app_private.finance2_audit from public,anon,authenticated;
alter table app_private.finance2_project_rules enable row level security;
alter table app_private.finance2_rule_history enable row level security;
alter table app_private.finance2_payment_recommendations enable row level security;
alter table app_private.finance2_payment_overrides enable row level security;
alter table app_private.finance2_audit enable row level security;

create or replace function public.finance2_read(p_project_id integer default null)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_projects jsonb; v_overrides jsonb; v_recommendations jsonb;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.project_name,'l1_rate',coalesce(r.l1_rate,p.l1_rate,0),
   'l2_rate',coalesce(r.l2_rate,p.l2_rate,0),'model',coalesce(r.model,'per_task'),
   'earning_trigger',coalesce(r.earning_trigger,'approved'),
   'currency',coalesce(r.currency,p.transcription_currency,'USD'),'version',coalesce(r.version,0),
   'exceptions_eligible',coalesce((select sum(o.amount) from app_private.finance2_payment_overrides o where o.project_id=p.id and o.state='eligible'),0),
   'exceptions_paid',coalesce((select sum(o.amount) from app_private.finance2_payment_overrides o where o.project_id=p.id and o.paid_at is not null),0)
 ) order by p.project_name),'[]'::jsonb) into v_projects
 from public.project_lab p left join app_private.finance2_project_rules r on r.project_id=p.id
 where p_project_id is null or p.id=p_project_id;
 select coalesce(jsonb_agg(jsonb_build_object('submission_id',s.id,'project_id',o.project_id,
  'worker_uid',s."workerUID",'submission_status',s.status,'amount',o.amount,
  'currency',o.currency,'state',o.state,'paid_at',o.paid_at,
  'payment_reference',o.payment_reference,'reason',o.reason,'updated_at',o.updated_at)
  order by o.updated_at desc),'[]'::jsonb) into v_overrides
 from app_private.finance2_payment_overrides o join public.submissions s on s.id=o.submission_id
 where p_project_id is null or o.project_id=p_project_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'submission_id',r.submission_id,
  'project_id',r.project_id,'recommendation',r.recommendation,'reason',r.reason,
  'reviewer_id',r.reviewer_id,'created_at',r.created_at)
  order by r.created_at desc),'[]'::jsonb) into v_recommendations
 from (select * from app_private.finance2_payment_recommendations order by created_at desc limit 100) r
 where p_project_id is null or r.project_id=p_project_id;
 return jsonb_build_object('projects',v_projects,'overrides',v_overrides,'recommendations',v_recommendations);
end $$;

create or replace function public.finance2_set_project_rule(
 p_project_id integer,p_model text,p_trigger text,p_currency text,
 p_l1_rate numeric,p_l2_rate numeric)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_old app_private.finance2_project_rules; v_new app_private.finance2_project_rules;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p_model not in ('per_task','per_work_hour','per_audio_minute','per_1000_words')
  or p_trigger not in ('approved','valid_submission','review_complete','manual')
  or p_currency !~ '^[A-Z]{3}$' or p_l1_rate is null or p_l2_rate is null
  or p_l1_rate < 0 or p_l2_rate < 0 then raise exception 'INVALID_RULE'; end if;
 perform pg_advisory_xact_lock(87022,p_project_id);
 select * into v_old from app_private.finance2_project_rules where project_id=p_project_id for update;
 insert into app_private.finance2_project_rules(project_id,model,earning_trigger,currency,l1_rate,l2_rate,version,updated_by)
 values(p_project_id,p_model,p_trigger,p_currency,p_l1_rate,p_l2_rate,coalesce(v_old.version,0)+1,auth.uid())
 on conflict(project_id) do update set model=excluded.model,earning_trigger=excluded.earning_trigger,
 currency=excluded.currency,l1_rate=excluded.l1_rate,l2_rate=excluded.l2_rate,
 version=excluded.version,updated_at=now(),updated_by=auth.uid()
 returning * into v_new;
 insert into app_private.finance2_rule_history(project_id,version,old_data,new_data,changed_by)
 values(p_project_id,v_new.version,to_jsonb(v_old),to_jsonb(v_new),auth.uid());
 insert into app_private.finance2_audit(actor_id,event_type,project_id,details)
 values(auth.uid(),'project_rule_saved',p_project_id,jsonb_build_object('version',v_new.version));
 return to_jsonb(v_new);
end $$;

create or replace function public.finance2_recommend(
 p_submission_id integer,p_decision text,p_reason text)
returns bigint language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_sub public.submissions; v_pid integer; v_id bigint;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into v_sub from public.submissions where id=p_submission_id;
 if v_sub.id is null then raise exception 'SUBMISSION_NOT_FOUND';end if;
 select id into v_pid from public.project_lab where project_name=v_sub."projectTitle" order by id limit 1;
 if v_pid is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if not (public.admin_has_capability('finance') or
   exists(select 1 from public.admin_staff_roles where user_id=auth.uid() and active=true
    and role='qa_manager' and project_id=v_pid)) then raise exception 'REVIEW_ACCESS_REQUIRED';end if;
 if p_decision not in ('eligible','hold','exclude') or length(trim(coalesce(p_reason,'')))<5
  then raise exception 'INVALID_RECOMMENDATION';end if;
 insert into app_private.finance2_payment_recommendations
 (submission_id,project_id,recommendation,reason,reviewer_id)
 values(p_submission_id,v_pid,p_decision,trim(p_reason),auth.uid()) returning id into v_id;
 insert into app_private.finance2_audit(actor_id,event_type,submission_id,project_id,details)
 values(auth.uid(),'payment_recommended',p_submission_id,v_pid,jsonb_build_object('recommendation_id',v_id));
 return v_id;
end $$;

-- Deliberately do not modify contributor balances or existing payout states here.
-- A compensation approval becomes payable only once the legacy wallet and payout
-- transition functions are reconciled and updated transactionally.
create or replace function public.finance2_authorize(
 p_submission_id integer,p_state text,p_reason text)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_sub public.submissions; v_pid integer; v_old app_private.finance2_payment_overrides;
 v_ccy text;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED'; end if;
 if p_state not in ('eligible','hold','exclude') or length(trim(coalesce(p_reason,'')))<5
 then raise exception 'INVALID_DECISION';end if;
 select * into v_sub from public.submissions where id=p_submission_id for update;
 if v_sub.id is null then raise exception 'SUBMISSION_NOT_FOUND';end if;
 select id into v_pid from public.project_lab where project_name=v_sub."projectTitle" order by id limit 1;
 if v_pid is null then raise exception 'PROJECT_NOT_FOUND';end if;
 select * into v_old from app_private.finance2_payment_overrides where submission_id=p_submission_id for update;
 if v_old.paid_at is not null and p_state<>'eligible' then raise exception 'PAID_OVERRIDE_CANNOT_BE_REVOKED';end if;
 select coalesce(r.currency,p.transcription_currency,'USD') into v_ccy from public.project_lab p
 left join app_private.finance2_project_rules r on r.project_id=p.id where p.id=v_pid;
 insert into app_private.finance2_payment_overrides
 (submission_id,project_id,state,amount,currency,authorized_by,reason)
 values(p_submission_id,v_pid,p_state,greatest(0,coalesce(v_sub."earnedAmount",0)),v_ccy,auth.uid(),trim(p_reason))
 on conflict(submission_id) do update set state=excluded.state,
 amount=case when app_private.finance2_payment_overrides.paid_at is null then excluded.amount else app_private.finance2_payment_overrides.amount end,
 currency=case when app_private.finance2_payment_overrides.paid_at is null then excluded.currency else app_private.finance2_payment_overrides.currency end,
 authorized_by=auth.uid(),reason=excluded.reason,updated_at=now();
 insert into app_private.finance2_audit(actor_id,event_type,submission_id,project_id,details)
 values(auth.uid(),'payment_override_authorized',p_submission_id,v_pid,
 jsonb_build_object('state',p_state,'previous_state',v_old.state));
 return jsonb_build_object('submission_id',p_submission_id,'state',p_state,'amount',coalesce(v_sub."earnedAmount",0),'currency',v_ccy,'payout_enabled',false);
end $$;

revoke all on function public.finance2_read(integer),public.finance2_set_project_rule(integer,text,text,text,numeric,numeric),
 public.finance2_recommend(integer,text,text),public.finance2_authorize(integer,text,text) from public,anon;
grant execute on function public.finance2_read(integer),public.finance2_set_project_rule(integer,text,text,text,numeric,numeric),
 public.finance2_recommend(integer,text,text),public.finance2_authorize(integer,text,text) to authenticated;
commit;