-- Finance 2.0 reconciliation dashboard: read-only health and anomaly detection.
-- Does not mutate balances, payout states, approved work or transfers.
begin;
create or replace function public.finance2_reconciliation_health()
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_checks jsonb;v_now timestamptz:=now();
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 with checks as (
   select 'earning_amount_drift'::text code,'critical'::text severity,
   'Task earnings snapshot does not match submission earned amount'::text issue,
   count(*)::integer occurrences
   from app_private.finance2_task_earnings e
   join public.submissions s on s.id=e.submission_id
   where round(coalesce(s."earnedAmount",0)::numeric,4)<>round(e.amount,4)
   union all
   select 'task_rate_arithmetic','critical','Task amount differs from snapshotted units × rate',
   count(*)::integer from app_private.finance2_task_earnings e
   where round(e.unit_count*e.unit_rate,4)<>e.amount
   union all
   select 'review_rate_arithmetic','critical','Review amount differs from snapshotted units × rate',
   count(*)::integer from app_private.finance2_review_earnings e
   where round(e.unit_count*e.unit_rate,4)<>e.amount
   union all
   select 'review_settlement_mismatch','critical','Recorded review transfer differs from earned amount or recipient',
   count(*)::integer from app_private.finance2_review_settlements p
   join app_private.finance2_review_earnings e on e.id=p.review_earning_id
   where p.amount<>e.amount or p.currency<>e.currency or p.reviewer_id<>e.reviewer_id or p.project_id<>e.project_id
   union all
   select 'settlement_without_eligibility','critical','Recorded L2 settlement is not eligible under current policy',
   count(*)::integer from app_private.finance2_review_settlements p
   join app_private.finance2_review_earnings e on e.id=p.review_earning_id
   where e.eligibility<>'eligible'
   union all
   select 'double_paid_task','critical','Finance 2.0 manual payment and existing task payout both marked paid',
   count(*)::integer from app_private.finance2_payment_overrides o
   join public.submission_payments sp on sp.submission_id=o.submission_id
   where o.paid_at is not null and sp.payment_status='paid'
   union all
   select 'manual_override_amount_drift','warning','Unpaid override differs from task earning snapshot',
   count(*)::integer from app_private.finance2_payment_overrides o
   join app_private.finance2_task_earnings e on e.submission_id=o.submission_id
   where o.paid_at is null and o.amount<>e.amount
   union all
   select 'approved_exception_open','warning','Approved task has an unresolved eligible Finance 2.0 exception',
   count(*)::integer from app_private.finance2_payment_overrides o
   join public.submissions s on s.id=o.submission_id
   where lower(coalesce(s.status,''))='approved' and o.state='eligible' and o.paid_at is null
   union all
   select 'unsupported_project_currency','warning','Configured rule uses a currency unsupported by existing USD-only wallet',
   count(*)::integer from app_private.finance2_project_rules r
   where r.currency<>'USD'
   union all
   select 'unsupported_payment_model','warning','Configured rule uses a payment model without trusted unit integration',
   count(*)::integer from app_private.finance2_project_rules r
   where r.model not in ('per_task','per_audio_minute')
   union all
   select 'review_payable_older_30d','info','Eligible unpaid L2 reviews older than 30 days',
   count(*)::integer from app_private.finance2_review_earnings e
   left join app_private.finance2_review_settlements s on s.review_earning_id=e.id
   where e.eligibility='eligible' and s.id is null and e.created_at<v_now-interval '30 days'
   union all
   select 'task_payable_older_30d','info','Eligible unpaid non-approved tasks older than 30 days',
   count(*)::integer from app_private.finance2_task_earnings e
   join public.submissions sub on sub.id=e.submission_id
   left join app_private.finance2_payment_overrides o on o.submission_id=e.submission_id
   where coalesce(o.state,e.eligibility)='eligible' and o.paid_at is null
   and lower(coalesce(sub.status,''))<>'approved'
   and e.created_at<v_now-interval '30 days'
 )
 select coalesce(jsonb_agg(jsonb_build_object(
    'code',code,'severity',severity,'issue',issue,'count',occurrences)
   order by case severity when 'critical' then 1 when 'warning' then 2 else 3 end,code),'[]'::jsonb)
 into v_checks from checks;
 return jsonb_build_object(
  'checked_at',v_now,
  'status',case when exists(select 1 from jsonb_array_elements(v_checks) j
      where j->>'severity'='critical' and (j->>'count')::int>0) then 'critical'
    when exists(select 1 from jsonb_array_elements(v_checks) j
      where j->>'severity'='warning' and (j->>'count')::int>0) then 'warning'
    else 'clear' end,
  'checks',v_checks,
  'configured_projects',(select count(*) from app_private.finance2_project_rules),
  'task_earning_records',(select count(*) from app_private.finance2_task_earnings),
  'review_earning_records',(select count(*) from app_private.finance2_review_earnings),
  'manual_review_settlements',(select count(*) from app_private.finance2_review_settlements)
 );
end $$;
revoke all on function public.finance2_reconciliation_health() from public,anon;
grant execute on function public.finance2_reconciliation_health() to authenticated;
commit;