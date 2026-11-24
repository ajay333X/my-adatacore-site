alter table app_private.payment_batch_items add column reserved boolean not null default true;
update app_private.payment_batch_items i set reserved=false
from app_private.payment_batches b where b.id=i.batch_id and b.status='cancelled';
create unique index payment_batch_one_reservation on app_private.payment_batch_items(submission_id) where reserved;

CREATE OR REPLACE FUNCTION public.admin_create_payment_batch(p_label text, p_submission_ids integer[], p_currency text DEFAULT 'USD'::text, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  bid uuid;
  requested integer;
  inserted integer;
begin
  if not public.is_active_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select count(distinct id) into requested from unnest(p_submission_ids) ids(id);
  if upper(coalesce(p_currency,'USD'))<>'USD' then raise exception 'Unsupported payout currency'; end if;
  if requested=0 or array_position(p_submission_ids,null) is not null then
    raise exception 'Select approved submissions'; end if;
  perform 1 from public.submissions where id=any(p_submission_ids) order by id for update;
  insert into app_private.payment_batches(label,currency,scheduled_for,created_by)
  values(trim(p_label),upper(coalesce(p_currency,'USD')),p_scheduled_for,auth.uid()) returning id into bid;
  insert into app_private.payment_batch_items(batch_id,submission_id,amount,user_id)
  select bid,s.id,s."earnedAmount",u.id from public.submissions s
  join public.users u on u."uniqueID"=s."workerUID"
  left join public.submission_payments sp on sp.submission_id=s.id
  where s.id=any(p_submission_ids) and s.status='Approved' and s."earnedAmount">0
    and coalesce(sp.payment_status,'pending')='pending'
    and not exists(select 1 from app_private.finance2_payment_overrides o where o.submission_id=s.id and o.paid_at is not null);
  get diagnostics inserted=row_count;
  if inserted<>requested then raise exception 'Every submission must be approved, payable and pending'; end if;
  perform app_private.ops_log('payment_batch.create','payment_batch',bid::text,null,jsonb_build_object('label',p_label));
  return bid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_submission_payment(p_submission_id integer, p_payment_status text, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_payment_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_sub public.submissions;v_payment public.submission_payments;v_status text:=lower(trim(coalesce(p_payment_status,'')));
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;if v_status not in ('pending','scheduled','processing','paid','on_hold') then raise exception 'Invalid payment status';end if;select * into v_sub from public.submissions where id=p_submission_id for update;if v_sub.id is null then raise exception 'Submission not found';end if;if v_sub.status is distinct from 'Approved' then raise exception 'Only approved submissions can enter payout processing';end if;if v_status='paid' and exists(select 1 from app_private.finance2_payment_overrides o where o.submission_id=v_sub.id and o.paid_at is not null)
 then raise exception 'Submission already settled manually'; end if;
 if exists (
   select 1 from app_private.payment_batch_items i
   join app_private.payment_batches b on b.id=i.batch_id
   where i.submission_id=p_submission_id and i.reserved
     and (b.status<>v_status or b.status not in ('scheduled','processing','paid')
          or (b.status='paid' and b.reference is distinct from nullif(trim(p_payment_reference),'')))
 ) then raise exception 'Manage this submission through its payment batch'; end if;
 select * into v_payment from public.submission_payments where submission_id=p_submission_id for update;if v_status='paid' and nullif(trim(p_payment_reference),'') is null
 and (v_payment.payment_status is distinct from 'paid' or nullif(trim(v_payment.payment_reference),'') is null)
 then raise exception 'Payment reference required'; end if;
 if v_status='paid' and coalesce(v_payment.payment_status,'pending')<>'paid' then update public.users set balance=greatest(0,coalesce(balance,0)-coalesce(v_sub."earnedAmount",0)) where "uniqueID"=v_sub."workerUID";elsif coalesce(v_payment.payment_status,'pending')='paid' and v_status<>'paid' then update public.users set balance=coalesce(balance,0)+coalesce(v_sub."earnedAmount",0) where "uniqueID"=v_sub."workerUID";end if;insert into public.submission_payments(submission_id,payment_status,scheduled_for,processing_at,paid_at,payment_reference,updated_at,updated_by) values(p_submission_id,v_status,p_scheduled_for,case when v_status='processing' then now() else null end,case when v_status='paid' then now() else null end,nullif(trim(coalesce(p_payment_reference,'')),''),now(),auth.uid()) on conflict(submission_id) do update set payment_status=excluded.payment_status,scheduled_for=coalesce(excluded.scheduled_for,public.submission_payments.scheduled_for),processing_at=case when excluded.payment_status='processing' then coalesce(public.submission_payments.processing_at,now()) else public.submission_payments.processing_at end,paid_at=case when excluded.payment_status='paid' then coalesce(public.submission_payments.paid_at,now()) else null end,payment_reference=coalesce(excluded.payment_reference,public.submission_payments.payment_reference),updated_at=now(),updated_by=auth.uid();
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_set_payment_batch_status(p_batch uuid, p_status text, p_reference text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  b app_private.payment_batches;
  item record;
  ref text;
begin
  if not public.is_active_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status is null or p_status not in ('draft','scheduled','processing','paid','cancelled') then
    raise exception 'INVALID_STATUS'; end if;
  select * into b from app_private.payment_batches where id=p_batch for update;
  if not found then return false; end if;
  ref:=coalesce(nullif(trim(p_reference),''),nullif(trim(b.reference),''));
  if b.status in ('cancelled','paid') then
    if p_status=b.status and (p_reference is null or ref is not distinct from b.reference) then return true; end if;
    raise exception 'Finalized batch cannot be changed';
  end if;
  if p_status='draft' and b.status<>'draft' then raise exception 'Cancel the batch to release its submissions'; end if;
  if p_status='paid' and ref is null then raise exception 'Payment reference required'; end if;
  perform 1 from public.submissions s join app_private.payment_batch_items i on i.submission_id=s.id
    where i.batch_id=p_batch order by s.id for update of s;
  update app_private.payment_batches set status=p_status,reference=ref,updated_at=now() where id=p_batch;
  if p_status='cancelled' then
    update app_private.payment_batch_items set reserved=false where batch_id=p_batch;
  end if;
  if p_status<>'draft' then
    for item in select i.submission_id,i.amount,s."earnedAmount" current_amount,sp.payment_status
      from app_private.payment_batch_items i join public.submissions s on s.id=i.submission_id
      left join public.submission_payments sp on sp.submission_id=s.id where i.batch_id=p_batch order by s.id
    loop
      if p_status='cancelled' then
        if item.payment_status in ('scheduled','processing') then
          perform public.admin_update_submission_payment(item.submission_id,'pending',null,null);
        end if;
      else
        if item.amount is distinct from item.current_amount or item.payment_status='paid' then
          raise exception 'Submission amount or settlement state changed'; end if;
        perform public.admin_update_submission_payment(item.submission_id,p_status,b.scheduled_for,ref);
      end if;
    end loop;
  end if;
  perform app_private.ops_log('payment_batch.'||p_status,'payment_batch',p_batch::text);
  return true;
end;
$function$;
