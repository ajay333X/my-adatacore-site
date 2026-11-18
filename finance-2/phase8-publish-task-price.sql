-- Publish the fixed, versioned task amount to existing task views.
-- No bank transfers or user.balance updates are made.
begin;
create or replace function app_private.finance2_publish_task_price()
returns trigger language plpgsql security definer
set search_path=public,app_private,pg_temp as $$
begin
 if new.task_id is not null then
  update public.tasks t set price=new.amount,
    rubric_data=coalesce(t.rubric_data,'{}'::jsonb)||
      jsonb_build_object('finance2_rate_version',new.rule_version,
        'finance2_rate',new.unit_rate,'finance2_units',new.unit_count,
        'finance2_model',new.payment_model,'finance2_currency',new.currency,
        'finance2_earned_snapshot',new.amount)
  where t.id=new.task_id and t.layer=new.work_role;
 end if;
 return new;
end $$;
drop trigger if exists finance2_publish_task_price on app_private.finance2_task_earnings;
create trigger finance2_publish_task_price
after insert on app_private.finance2_task_earnings
for each row execute function app_private.finance2_publish_task_price();
commit;