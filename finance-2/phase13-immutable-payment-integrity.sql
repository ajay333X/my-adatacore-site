-- Finance 2.0 integrity safeguards; never initiates a bank transfer.
begin;
create unique index if not exists finance2_override_unique_transfer_ref
 on app_private.finance2_payment_overrides(lower(trim(payment_reference)))
 where paid_at is not null and payment_reference is not null;
create unique index if not exists finance2_review_unique_transfer_ref
 on app_private.finance2_review_settlements(lower(trim(reference)));

create or replace function app_private.finance2_guard_money_history()
returns trigger language plpgsql set search_path=app_private,public,pg_temp as $$
begin raise exception 'FINANCE_HISTORY_IMMUTABLE';end $$;
drop trigger if exists finance2_audit_append_only on app_private.finance2_audit;
create trigger finance2_audit_append_only before update or delete
 on app_private.finance2_audit for each row execute function app_private.finance2_guard_money_history();
drop trigger if exists finance2_rate_history_append_only on app_private.finance2_rule_history;
create trigger finance2_rate_history_append_only before update or delete
 on app_private.finance2_rule_history for each row execute function app_private.finance2_guard_money_history();
drop trigger if exists finance2_review_earning_append_only on app_private.finance2_review_earnings;
create trigger finance2_review_earning_append_only before update or delete
 on app_private.finance2_review_earnings for each row execute function app_private.finance2_guard_money_history();

create or replace function app_private.finance2_guard_task_snapshot()
returns trigger language plpgsql set search_path=app_private,public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'FINANCE_TASK_SNAPSHOT_IMMUTABLE';end if;
 if (to_jsonb(new)-'eligibility'-'eligible_at') <>
    (to_jsonb(old)-'eligibility'-'eligible_at') then raise exception 'FINANCE_TASK_SNAPSHOT_IMMUTABLE';end if;
 if old.eligibility='eligible' and new.eligibility='pending'
 then raise exception 'ELIGIBLE_EARNING_CANNOT_REVERT_TO_PENDING';end if;
 return new;
end $$;
drop trigger if exists finance2_task_snapshot_immutable on app_private.finance2_task_earnings;
create trigger finance2_task_snapshot_immutable before update or delete
 on app_private.finance2_task_earnings for each row execute function app_private.finance2_guard_task_snapshot();

create or replace function app_private.finance2_guard_paid_override()
returns trigger language plpgsql set search_path=app_private,public,pg_temp as $$
begin
 if tg_op='DELETE' then
  if old.paid_at is not null then raise exception 'PAID_OVERRIDE_IMMUTABLE';end if;
  return old;
 end if;
 if old.paid_at is not null then raise exception 'PAID_OVERRIDE_IMMUTABLE';end if;
 if new.paid_at is not null then
  if new.state<>'eligible' or new.amount<=0 or length(trim(coalesce(new.payment_reference,'')))<6
  then raise exception 'INVALID_PAID_OVERRIDE';end if;
  perform pg_advisory_xact_lock(hashtext('finance2_transfer:'||lower(trim(new.payment_reference))));
  if exists(select 1 from app_private.finance2_review_settlements r
   where lower(trim(r.reference))=lower(trim(new.payment_reference)))
  then raise exception 'EXTERNAL_TRANSFER_REFERENCE_ALREADY_USED';end if;
 end if;
 return new;
end $$;
drop trigger if exists finance2_override_payout_guard on app_private.finance2_payment_overrides;
create trigger finance2_override_payout_guard before update or delete
 on app_private.finance2_payment_overrides for each row execute function app_private.finance2_guard_paid_override();

create or replace function app_private.finance2_guard_review_payment()
returns trigger language plpgsql security definer
 set search_path=public,app_private,pg_temp as $$
declare e app_private.finance2_review_earnings;
begin
 select * into e from app_private.finance2_review_earnings where id=new.review_earning_id for update;
 if e.id is null or e.eligibility<>'eligible' or e.amount<=0 or e.amount<>new.amount
  or e.currency<>new.currency or e.reviewer_id<>new.reviewer_id or e.project_id<>new.project_id
 then raise exception 'REVIEW_SETTLEMENT_DOES_NOT_MATCH_EARNING';end if;
 perform pg_advisory_xact_lock(hashtext('finance2_transfer:'||lower(trim(new.reference))));
 if exists(select 1 from app_private.finance2_payment_overrides o
 where o.paid_at is not null and lower(trim(o.payment_reference))=lower(trim(new.reference)))
 then raise exception 'EXTERNAL_TRANSFER_REFERENCE_ALREADY_USED';end if;
 return new;
end $$;
drop trigger if exists finance2_review_payment_consistency on app_private.finance2_review_settlements;
create trigger finance2_review_payment_consistency before insert
 on app_private.finance2_review_settlements for each row execute function app_private.finance2_guard_review_payment();

-- Preserve original function implementation; remove its paid-state reauthorization loophole.
do $do$
declare fn text; old_text text:='if v_old.paid_at is not null and p_state<>''eligible'' then raise exception ''PAID_OVERRIDE_CANNOT_BE_REVOKED'';end if;';
 new_text text:='if v_old.paid_at is not null then raise exception ''PAID_OVERRIDE_IMMUTABLE'';end if;';
begin
 select pg_get_functiondef('public.finance2_authorize(integer,text,text)'::regprocedure) into fn;
 if position(old_text in fn)=0 then raise exception 'FINANCE_AUTHORIZE_IMPLEMENTATION_CHANGED';end if;
 execute replace(fn,old_text,new_text);
end $do$;
commit;