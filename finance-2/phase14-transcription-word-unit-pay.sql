-- Deterministic source-backed per-1000-word pay for submitted transcription segments.
-- No hourly-time inference or payout transfer.
begin;
create or replace function app_private.finance2_transcription_word_units(p_task_id integer)
returns numeric language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_words integer;
begin
 if p_task_id is null then raise exception 'FINANCE2_TRANSCRIPTION_TASK_REQUIRED';end if;
 select count(*)::integer into v_words
 from public.transcription_audio_items a
 cross join lateral jsonb_array_elements(
   case when jsonb_typeof(a.submitted_segments)='array' then a.submitted_segments else '[]'::jsonb end
 ) seg
 cross join lateral regexp_split_to_table(btrim(coalesce(seg->>'transcript','')),'[[:space:]]+') token
 where a.task_id=p_task_id and token ~ '[[:alnum:]]';
 if coalesce(v_words,0)<=0 or v_words>50000 then
  raise exception 'FINANCE2_TRUSTED_WORD_COUNT_REQUIRED';
 end if;
 return v_words::numeric/1000.0;
end $$;
CREATE OR REPLACE FUNCTION app_private.finance2_record_review_earning(p_project_id integer, p_reviewer uuid, p_source text, p_key text, p_submission integer, p_reviewer_task integer, p_decision text, p_audio_duration_ms integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_rule app_private.finance2_project_rules;v_units numeric;v_state text;
begin
 perform pg_advisory_xact_lock(87022,p_project_id);
 select * into v_rule from app_private.finance2_project_rules where project_id=p_project_id;
 if v_rule.project_id is null or v_rule.currency<>'USD' or p_reviewer is null then return;end if;
 if v_rule.model='per_task' then v_units:=1;
 elsif v_rule.model='per_audio_minute' then
   if coalesce(p_audio_duration_ms,0)<=0 then return;end if;
   v_units:=p_audio_duration_ms/60000.0;
 elsif v_rule.model='per_1000_words' then
   if p_source<>'tx_l2' or p_submission is null then return;end if;
   v_units:=app_private.finance2_transcription_word_units((select s.task_id from public.submissions s where s.id=p_submission));
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
end $function$
;
CREATE OR REPLACE FUNCTION public.finance2_set_project_rule(p_project_id integer, p_model text, p_trigger text, p_currency text, p_l1_rate numeric, p_l2_rate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_old app_private.finance2_project_rules;v_new app_private.finance2_project_rules;
begin
 if not public.admin_has_capability('finance') then raise exception 'FINANCE_ACCESS_REQUIRED';end if;
 if not exists(select 1 from public.project_lab where id=p_project_id) then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_model not in ('per_task','per_audio_minute','per_1000_words') then raise exception 'AUTOMATIC_MODEL_NOT_YET_SUPPORTED';end if;
 if p_model in ('per_audio_minute','per_1000_words') and not exists(select 1 from public.transcription_audio_items where transcription_project_id=p_project_id) then
   raise exception 'AUDIO_MINUTE_REQUIRES_TRANSCRIPTION_PROJECT_WITH_AUDIO';end if;
 if p_trigger not in ('valid_submission','review_complete','approved','manual')
   or p_currency <> 'USD' or p_l1_rate is null or p_l2_rate is null or p_l1_rate<0 or p_l2_rate<0
   then raise exception 'INVALID_RULE_OR_UNSUPPORTED_CURRENCY';end if;
 perform pg_advisory_xact_lock(87022,p_project_id);
 select * into v_old from app_private.finance2_project_rules where project_id=p_project_id for update;
 insert into app_private.finance2_project_rules(project_id,model,earning_trigger,currency,l1_rate,l2_rate,version,updated_by)
 values(p_project_id,p_model,p_trigger,p_currency,p_l1_rate,p_l2_rate,coalesce(v_old.version,0)+1,auth.uid())
 on conflict(project_id) do update set model=excluded.model,earning_trigger=excluded.earning_trigger,
 currency=excluded.currency,l1_rate=excluded.l1_rate,l2_rate=excluded.l2_rate,
 version=excluded.version,updated_at=now(),updated_by=auth.uid() returning * into v_new;
 insert into app_private.finance2_rule_history(project_id,version,old_data,new_data,changed_by)
 values(p_project_id,v_new.version,to_jsonb(v_old),to_jsonb(v_new),auth.uid());
 insert into app_private.finance2_audit(actor_id,event_type,project_id,details)
 values(auth.uid(),'project_rule_saved',p_project_id,jsonb_build_object('version',v_new.version));
 return to_jsonb(v_new);
end $function$
;
CREATE OR REPLACE FUNCTION app_private.finance2_snapshot_earning()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_rule app_private.finance2_project_rules;v_task public.tasks;v_user public.users;
 v_project_id integer;v_unit_count numeric;v_unit_rate numeric;v_source text;v_item public.transcription_audio_items;
 v_elig text;
begin
 if tg_op='UPDATE' then
   if old.status is not distinct from new.status then return new;end if;
   update app_private.finance2_task_earnings e
   set eligibility=case
     when exists(select 1 from app_private.finance2_payment_overrides o
       where o.submission_id=new.id and o.state in ('hold','exclude')) then eligibility
     when e.eligibility='pending' and
       ((e.earning_trigger='review_complete' and lower(coalesce(new.status,'')) in ('reviewed','rejected','approved')) or
        (e.earning_trigger='approved' and lower(coalesce(new.status,''))='approved'))
     then 'eligible'
     else eligibility end,
   eligible_at=case when e.eligibility='pending' and
      ((e.earning_trigger='review_complete' and lower(coalesce(new.status,'')) in ('reviewed','rejected','approved')) or
       (e.earning_trigger='approved' and lower(coalesce(new.status,''))='approved'))
     then now() else eligible_at end
   where e.submission_id=new.id;
   return new;
 end if;
 if new.task_id is null then return new;end if;
 select * into v_task from public.tasks where id=new.task_id;
 if v_task.id is null or v_task.layer not in ('L1','L2') or v_task.title is distinct from new."projectTitle" then return new;end if;
 select id into v_project_id from public.project_lab where project_name=v_task.title order by id limit 1;
 if v_project_id is null then return new;end if;
 select * into v_rule from app_private.finance2_project_rules where project_id=v_project_id;
 if v_rule.project_id is null or v_rule.currency <> 'USD' then return new;end if;
 select * into v_user from public.users
 where "uniqueID"=new."workerUID" or lower(email)=lower(new."workerUID")
 order by case when "uniqueID"=new."workerUID" then 0 else 1 end limit 1;
 if v_user.id is null then raise exception 'FINANCE2_CONTRIBUTOR_NOT_FOUND';end if;
 if v_rule.model='per_task' then
   v_unit_count:=1;v_source:='completed_task';
 elsif v_rule.model='per_audio_minute' then
   select * into v_item from public.transcription_audio_items where task_id=new.task_id order by created_at desc limit 1;
   if v_item.id is null or coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000,0)<=0
     then raise exception 'FINANCE2_TRUSTED_AUDIO_DURATION_REQUIRED';end if;
   v_unit_count:=coalesce(nullif(v_item.duration_ms,0),v_item.duration_seconds*1000)/60000.0;
   v_source:='transcription_audio_items.duration_ms';
 elsif v_rule.model='per_1000_words' then
   v_unit_count:=app_private.finance2_transcription_word_units(new.task_id);
   v_source:='transcription_audio_items.submitted_segments.whitespace_tokens';
 else
   raise exception 'FINANCE2_UNSUPPORTED_AUTOMATIC_MEASUREMENT';
 end if;
 v_unit_rate:=case when v_task.layer='L2' then v_rule.l2_rate else v_rule.l1_rate end;
 v_elig:=case when v_rule.earning_trigger='valid_submission'
       or (v_rule.earning_trigger='approved' and lower(new.status)='approved')
       or (v_rule.earning_trigger='review_complete' and lower(new.status) in ('reviewed','rejected','approved'))
      then 'eligible' else 'pending' end;
 insert into app_private.finance2_task_earnings
 (submission_id,task_id,project_id,contributor_id,rule_version,work_role,payment_model,
  earning_trigger,unit_count,unit_rate,amount,currency,eligibility,measurement_source,eligible_at)
 values(new.id,new.task_id,v_project_id,v_user.id,v_rule.version,v_task.layer,v_rule.model,
  v_rule.earning_trigger,v_unit_count,v_unit_rate,round(v_unit_count*v_unit_rate,4),
  v_rule.currency,v_elig,v_source,case when v_elig='eligible' then now() end)
 on conflict(submission_id) do nothing;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION app_private.finance2_submission_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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
 elsif v_rule.model='per_1000_words' then
   v_units:=app_private.finance2_transcription_word_units(new.task_id);
 else
   raise exception 'FINANCE2_UNSUPPORTED_AUTOMATIC_MEASUREMENT';
 end if;
 v_rate:=case when v_task.layer='L2' then v_rule.l2_rate else v_rule.l1_rate end;
 v_amount:=round(v_units*v_rate,4);
 new."earnedAmount":=v_amount;
 return new;
end $function$
;
commit;
