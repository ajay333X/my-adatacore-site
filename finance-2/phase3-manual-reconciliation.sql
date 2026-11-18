-- Finance 2.0: prevent double-counting legacy approved work; add manual payout
-- reconciliation for finance-authorized non-approved exceptions.
begin;
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
 if lower(coalesce(v_sub.status,''))='approved' then raise exception 'USE_LEGACY_APPROVED_PAYMENT_FLOW';end if;
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

create or replace function public.finance2_mark_manual_paid(
 p_submission_id integer,p_payment_reference text)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
declare v_override app_private.finance2_payment_overrides; v_status text;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 if length(trim(coalesce(p_payment_reference,''))) < 6 then raise exception 'PAYMENT_REFERENCE_REQUIRED';end if;
 select * into v_override from app_private.finance2_payment_overrides
 where submission_id=p_submission_id for update;
 if v_override.submission_id is null then raise exception 'OVERRIDE_NOT_FOUND';end if;
 if v_override.state<>'eligible' or v_override.amount<=0 then raise exception 'NOT_PAYABLE';end if;
 select status into v_status from public.submissions where id=p_submission_id for update;
 if lower(coalesce(v_status,''))='approved' then raise exception 'USE_LEGACY_APPROVED_PAYMENT_FLOW';end if;
 if v_override.paid_at is not null then
   if v_override.payment_reference=trim(p_payment_reference) then
     return jsonb_build_object('status','already_recorded','submission_id',p_submission_id,
       'amount',v_override.amount,'currency',v_override.currency);
   end if;
   raise exception 'ALREADY_PAID_WITH_DIFFERENT_REFERENCE';
 end if;
 update app_private.finance2_payment_overrides
 set paid_at=now(),payment_reference=trim(p_payment_reference),updated_at=now()
 where submission_id=p_submission_id;
 insert into app_private.finance2_audit(actor_id,event_type,submission_id,project_id,details)
 values(auth.uid(),'manual_payment_recorded',p_submission_id,v_override.project_id,
 jsonb_build_object('amount',v_override.amount,'currency',v_override.currency,'reference',trim(p_payment_reference)));
 return jsonb_build_object('status','recorded','submission_id',p_submission_id,
   'amount',v_override.amount,'currency',v_override.currency);
end $$;

create or replace function public.finance2_my_exceptions()
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'submission_id',s.id,'project',p.project_name,'amount',o.amount,
    'currency',o.currency,'state',o.state,
    'paid_at',o.paid_at,'updated_at',o.updated_at
  ) order by o.updated_at desc)
  from app_private.finance2_payment_overrides o
  join public.submissions s on s.id=o.submission_id
  join public.project_lab p on p.id=o.project_id
  join public.users u on u.id=auth.uid()
  where s."workerUID"=u."uniqueID" or lower(s."workerUID")=lower(u.email)
 ),'[]'::jsonb);
end $$;
revoke all on function public.finance2_mark_manual_paid(integer,text),
 public.finance2_my_exceptions() from public,anon;
grant execute on function public.finance2_mark_manual_paid(integer,text),
 public.finance2_my_exceptions() to authenticated;
commit;
