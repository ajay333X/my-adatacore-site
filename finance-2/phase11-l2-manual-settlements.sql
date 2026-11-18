-- Finance 2.0: append-only accounting for manually reconciled L2 review payouts.
-- Financial transfer initiation intentionally unsupported.
begin;
create table if not exists app_private.finance2_review_settlements (
 id bigint generated always as identity primary key,
 review_earning_id bigint not null unique references app_private.finance2_review_earnings(id) on delete restrict,
 reviewer_id uuid not null references public.users(id) on delete restrict,
 project_id integer not null references public.project_lab(id) on delete restrict,
 amount numeric(18,4) not null check (amount>0),
 currency text not null check (currency='USD'),
 reference text not null check (length(trim(reference))>=6),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists finance2_review_settlements_project_idx
on app_private.finance2_review_settlements(project_id,created_at desc);
alter table app_private.finance2_review_settlements enable row level security;
revoke all on app_private.finance2_review_settlements from public, anon, authenticated;
-- Financial amounts, references and timestamps must never be changed in place.
create or replace function app_private.finance2_protect_settlement()
returns trigger language plpgsql set search_path=app_private,public,pg_temp as $$
begin raise exception 'FINANCE_SETTLEMENT_IMMUTABLE';end $$;
drop trigger if exists finance2_review_settlement_immutable on app_private.finance2_review_settlements;
create trigger finance2_review_settlement_immutable before update or delete
on app_private.finance2_review_settlements for each row
execute function app_private.finance2_protect_settlement();

create or replace function public.finance2_record_l2_manual_paid(
 p_review_earning_id bigint,p_reference text)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare e app_private.finance2_review_earnings;pay app_private.finance2_review_settlements;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 if length(trim(coalesce(p_reference,'')))<6 then raise exception 'PAYMENT_REFERENCE_REQUIRED';end if;
 select * into e from app_private.finance2_review_earnings
 where id=p_review_earning_id for update;
 if e.id is null then raise exception 'REVIEW_EARNING_NOT_FOUND';end if;
 if e.eligibility<>'eligible' or e.amount<=0 then raise exception 'REVIEW_NOT_PAYABLE';end if;
 select * into pay from app_private.finance2_review_settlements
 where review_earning_id=e.id for update;
 if pay.id is not null then
  if pay.reference=trim(p_reference) then
   return jsonb_build_object('status','already_recorded','review_earning_id',e.id,
       'amount',pay.amount,'currency',pay.currency);
  end if;
  raise exception 'REVIEW_ALREADY_PAID_DIFFERENT_REFERENCE';
 end if;
 insert into app_private.finance2_review_settlements(
 review_earning_id,reviewer_id,project_id,amount,currency,reference,created_by)
 values(e.id,e.reviewer_id,e.project_id,e.amount,e.currency,trim(p_reference),auth.uid());
 insert into app_private.finance2_audit(actor_id,event_type,project_id,details)
 values(auth.uid(),'review_external_payment_recorded',e.project_id,
 jsonb_build_object('review_earning_id',e.id,'reference',trim(p_reference),
 'currency',e.currency,'amount',e.amount));
 return jsonb_build_object('status','recorded','review_earning_id',e.id,
  'amount',e.amount,'currency',e.currency);
end $$;
revoke all on function public.finance2_record_l2_manual_paid(bigint,text) from public,anon;
grant execute on function public.finance2_record_l2_manual_paid(bigint,text) to authenticated;

-- Add reconciliation status without ever presenting an external transfer as initiated.
create or replace function public.finance2_my_review_earnings(p_limit integer default 150)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'project_id',e.project_id,'project',p.project_name,'submission_id',e.submission_id,
  'reviewer_task_id',e.reviewer_task_id,'source',e.review_source,'units',e.unit_count,
  'rate',e.unit_rate,'amount',e.amount,'currency',e.currency,'eligibility',e.eligibility,
  'decision',e.decision,'rule_version',e.rule_version,'created_at',e.created_at,
  'paid_at',st.created_at,'payment_reference',st.reference)
 order by e.created_at desc)
 from (select * from app_private.finance2_review_earnings where reviewer_id=auth.uid()
 order by created_at desc limit greatest(1,least(coalesce(p_limit,150),300))) e
 join public.project_lab p on p.id=e.project_id
 left join app_private.finance2_review_settlements st on st.review_earning_id=e.id),'[]'::jsonb);
end $$;
create or replace function public.finance2_admin_review_earnings(p_limit integer default 300)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'project_id',e.project_id,'project',p.project_name,'reviewer_id',e.reviewer_id,
  'source',e.review_source,'submission_id',e.submission_id,'units',e.unit_count,
  'rate',e.unit_rate,'amount',e.amount,'currency',e.currency,'eligibility',e.eligibility,
  'decision',e.decision,'rule_version',e.rule_version,'created_at',e.created_at,
  'paid_at',st.created_at,'payment_reference',st.reference)
 order by e.created_at desc)
 from (select * from app_private.finance2_review_earnings order by created_at desc
 limit greatest(1,least(coalesce(p_limit,300),1000))) e
 join public.project_lab p on p.id=e.project_id
 left join app_private.finance2_review_settlements st on st.review_earning_id=e.id),'[]'::jsonb);
end $$;
create or replace function public.finance2_project_earning_totals()
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 return coalesce((
 with l1 as (
  select e.project_id,
  coalesce(sum(e.amount) filter(where lower(coalesce(s.status,''))<>'approved'
    and o.paid_at is null and coalesce(o.state,e.eligibility)='eligible'),0) as l1_eligible,
  coalesce(sum(e.amount) filter(where lower(coalesce(s.status,''))<>'approved'
    and o.paid_at is null and coalesce(o.state,e.eligibility)='pending'),0) as l1_pending,
  coalesce(sum(e.amount) filter(where lower(coalesce(s.status,''))='approved'),0) as legacy_approved,
  coalesce(sum(e.amount) filter(where o.paid_at is not null),0) as exception_paid,
  count(*) as l1_count
  from app_private.finance2_task_earnings e
  join public.submissions s on s.id=e.submission_id
  left join app_private.finance2_payment_overrides o on o.submission_id=e.submission_id
  group by e.project_id
 ),l2 as (
  select e.project_id,
  coalesce(sum(e.amount) filter(where e.eligibility='eligible' and st.id is null),0) l2_eligible,
  coalesce(sum(e.amount) filter(where e.eligibility='pending' and st.id is null),0) l2_pending,
  coalesce(sum(st.amount),0) l2_paid,
  count(*) l2_count
  from app_private.finance2_review_earnings e
  left join app_private.finance2_review_settlements st on st.review_earning_id=e.id
  group by e.project_id
 )
 select jsonb_agg(jsonb_build_object(
  'project_id',p.id,'project',p.project_name,'currency','USD',
  'l1_eligible',coalesce(l1.l1_eligible,0),'l1_pending',coalesce(l1.l1_pending,0),
  'l2_eligible',coalesce(l2.l2_eligible,0),'l2_pending',coalesce(l2.l2_pending,0),
  'legacy_approved',coalesce(l1.legacy_approved,0),
  'exception_paid',coalesce(l1.exception_paid,0),'l2_paid',coalesce(l2.l2_paid,0),
  'l1_count',coalesce(l1.l1_count,0),'l2_count',coalesce(l2.l2_count,0))
 order by p.project_name)
 from public.project_lab p left join l1 on l1.project_id=p.id left join l2 on l2.project_id=p.id
 ),'[]'::jsonb);
end $$;
commit;