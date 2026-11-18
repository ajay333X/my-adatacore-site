-- Prevent double payouts when a non-approved compensation exception later
-- transitions into the legacy Approved payment path.
begin;
create or replace function app_private.finance2_guard_submission_update()
returns trigger language plpgsql security invoker
set search_path=public,app_private,pg_temp as $$
declare v_override app_private.finance2_payment_overrides;
begin
 select * into v_override from app_private.finance2_payment_overrides
 where submission_id=old.id;
 if v_override.submission_id is null then return new;end if;
 if v_override.paid_at is not null and (
   new."workerUID" is distinct from old."workerUID" or
   new."projectTitle" is distinct from old."projectTitle" or
   new."earnedAmount" is distinct from old."earnedAmount"
 ) then raise exception 'FINANCE2_PAID_SUBMISSION_LOCKED';end if;
 if lower(coalesce(new.status,''))='approved'
   and lower(coalesce(old.status,''))<>'approved'
   and (v_override.state='eligible' or v_override.paid_at is not null)
 then raise exception 'FINANCE2_EXCEPTION_RECONCILIATION_REQUIRED';
 end if;
 return new;
end $$;
drop trigger if exists finance2_submissions_status_guard on public.submissions;
create trigger finance2_submissions_status_guard
before update on public.submissions
for each row execute function app_private.finance2_guard_submission_update();
commit;