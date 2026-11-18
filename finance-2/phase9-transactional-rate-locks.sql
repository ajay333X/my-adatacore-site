-- Serialize rate updates and new earnings snapshots to avoid concurrent-rate mismatches.
begin;
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
 perform pg_advisory_xact_lock(87022,v_project_id);
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

create or replace function app_private.finance2_record_review_earning(
 p_project_id integer,p_reviewer uuid,p_source text,p_key text,p_submission integer,
 p_reviewer_task integer,p_decision text,p_audio_duration_ms integer)
returns void language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_rule app_private.finance2_project_rules;v_units numeric;v_state text;
begin
 perform pg_advisory_xact_lock(87022,p_project_id);
 select * into v_rule from app_private.finance2_project_rules where project_id=p_project_id;
 if v_rule.project_id is null or v_rule.currency<>'USD' or p_reviewer is null then return;end if;
 if v_rule.model='per_task' then v_units:=1;
 elsif v_rule.model='per_audio_minute' then
   if coalesce(p_audio_duration_ms,0)<=0 then return;end if;
   v_units:=p_audio_duration_ms/60000.0;
 else return;end if;
 v_state:=case
   when v_rule.earning_trigger='manual' then 'pending'
   when v_rule.earning_trigger='approved' and lower(p_decision) not in ('approved','approve','reviewed') then 'pending'
   else 'eligible' end;
 insert into app_private.finance2_review_earnings(
  project_id,reviewer_id,review_source,review_key,submission_id,reviewer_task_id,
  rule_version,payment_model,earning_trigger,unit_count,unit_rate,amount,currency,
  eligibility,decision)
 values(p_project_id,p_reviewer,p_source,p_key,p_submission,p_reviewer_task,
  v_rule.version,v_rule.model,v_rule.earning_trigger,v_units,v_rule.l2_rate,
  round(v_units*v_rule.l2_rate,4),'USD',v_state,p_decision)
 on conflict(review_source,review_key) do nothing;
end $$;
commit;
