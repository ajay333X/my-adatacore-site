-- Accurate uncapped project-wide earning liabilities.
begin;
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
  coalesce(sum(e.amount) filter(where eligibility='eligible'),0) l2_eligible,
  coalesce(sum(e.amount) filter(where eligibility='pending'),0) l2_pending,
  count(*) l2_count
  from app_private.finance2_review_earnings e group by e.project_id
 )
 select jsonb_agg(jsonb_build_object(
  'project_id',p.id,'project',p.project_name,'currency','USD',
  'l1_eligible',coalesce(l1.l1_eligible,0),'l1_pending',coalesce(l1.l1_pending,0),
  'l2_eligible',coalesce(l2.l2_eligible,0),'l2_pending',coalesce(l2.l2_pending,0),
  'legacy_approved',coalesce(l1.legacy_approved,0),
  'exception_paid',coalesce(l1.exception_paid,0),
  'l1_count',coalesce(l1.l1_count,0),'l2_count',coalesce(l2.l2_count,0))
 order by p.project_name)
 from public.project_lab p left join l1 on l1.project_id=p.id left join l2 on l2.project_id=p.id
 ),'[]'::jsonb);
end $$;
revoke all on function public.finance2_project_earning_totals() from public,anon;
grant execute on function public.finance2_project_earning_totals() to authenticated;
commit;