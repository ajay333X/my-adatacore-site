-- Preserve existing transcription logic; only return the stored earning snapshot.
begin;
CREATE OR REPLACE FUNCTION public.tx_submit(p_item uuid, p_revision integer, p_action text DEFAULT 'submit'::text, p_feedback text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.transcription_audio_items;m text;rows jsonb;tid integer;u public.users;t public.tasks;newstatus text;subm public.submissions;pay numeric;cur text;
begin
 select * into u from public.users where id=auth.uid() for update;
 m:=app_private.tx_mode(p_item);if m='none' then raise exception 'This audio is not assigned to you'; end if;
 select * into a from public.transcription_audio_items where id=p_item for update;
 if a.queue_state='archived' then raise exception 'TASK_ARCHIVED: This transcription task was archived by an administrator';end if;
 if a.queue_state<>'queued' then raise exception 'Release this audio from the Vault before submitting it'; end if;
 if a.revision is distinct from p_revision then raise exception 'VERSION_CONFLICT: Reload the latest transcript'; end if;
 if not exists(select 1 from public.project_lab where id=a.transcription_project_id and lifecycle_status='active') then raise exception 'Project is paused'; end if;
 if p_action='submit' then
  if m not in ('contributor','admin') or a.status not in ('assigned','in_progress','changes_requested','unassigned') then raise exception 'Transcript cannot be submitted at this stage'; end if;
  tid:=a.task_id;newstatus:='submitted';
 elsif p_action in ('approve','request_changes') then
  if m not in ('reviewer','admin') or a.status not in ('submitted','in_review') then raise exception 'Review access required'; end if;
  if p_action='request_changes' and length(trim(coalesce(p_feedback,'')))<3 then raise exception 'Add feedback explaining the requested changes'; end if;
  tid:=a.review_task_id;newstatus:=case when p_action='approve' then 'approved' else 'changes_requested' end;
 else raise exception 'Invalid submission action';end if;
 -- Existing submission and payment logic is kept intact.
 -- Require unique playback coverage before contributors submit on project 93.
 if p_action='submit' and m in ('contributor','admin') and a.transcription_project_id=93 then
  if coalesce(nullif(a.duration_ms,0),a.duration_seconds*1000,0)<=0
    or not exists(
     select 1 from app_private.tx_audio_listening l
     where l.audio_item_id=a.id and l.user_id=auth.uid()
       and cardinality(l.heard_seconds)>=ceil(coalesce(nullif(a.duration_ms,0),a.duration_seconds*1000,0)/1000.0)::integer
    ) then raise exception 'LISTEN_REQUIRED: Play the entire recording before submitting this transcript';end if;
 end if;
 if m<>'admin' then perform app_private.consume_daily_work_slot(tid,auth.uid(),'task:'||tid);end if;
 rows:=app_private.tx_rows(a.id);
 if p_action<>'request_changes' then
  if jsonb_array_length(rows)=0 then raise exception 'Add at least one transcript segment'; end if;
  if exists(select 1 from public.transcription_segments s where s.audio_item_id=a.id and (s.end_ms<=s.start_ms or s.end_ms>a.duration_ms or trim(s.transcript)='')) then raise exception 'Fix empty text and invalid segment times before submission'; end if;
  if exists(select 1 from public.transcription_segments s join public.transcription_segments other on s.audio_item_id=other.audio_item_id and s.speaker_id=other.speaker_id and s.id<other.id and s.start_ms<other.end_ms and other.start_ms<s.end_ms where s.audio_item_id=a.id) then raise exception 'Resolve overlapping segments for the same speaker'; end if;
 end if;
 insert into app_private.transcription_history(audio_item_id,actor_id,revision,action,segments,speakers,feedback) values(a.id,auth.uid(),a.revision+1,p_action,rows,a.speakers,left(p_feedback,10000));
 update public.transcription_audio_items set status=newstatus,revision=revision+1,submitted_segments=case when p_action='submit' then rows else submitted_segments end,submitted_at=case when p_action='submit' then now() else submitted_at end,reviewed_at=case when p_action<>'submit' then now() else reviewed_at end,feedback=case when p_action<>'submit' then left(p_feedback,10000) else feedback end,updated_at=now() where id=a.id returning * into a;
 if tid is not null then update public.tasks set status='submitted' where id=tid;end if;
 if p_action='submit' and a.task_id is not null then
  select * into t from public.tasks where id=a.task_id for update;
  select * into u from public.users where lower(email)=lower(t."assignedTo") or lower("uniqueID")=lower(t."assignedTo") limit 1;
  pay:=coalesce(t.price,app_private.tx_earning_amount(a.transcription_project_id,a.duration_ms),0);
  select transcription_currency into cur from public.project_lab where id=a.transcription_project_id;
  update public.tasks set price=pay,rubric_data=coalesce(rubric_data,'{}'::jsonb)||jsonb_build_object('payment_basis','audio_duration','earned_amount',pay,'currency',coalesce(cur,'USD'),'duration_ms',a.duration_ms) where id=t.id;
  if not exists(select 1 from public.submissions where task_id=a.task_id) then
    insert into public.submissions("workerUID","projectTitle","earnedAmount","audioData",status,task_id) values(u."uniqueID",t.title,pay,'transcription:'||a.id,'Pending',t.id);
  else
    update public.submissions set status=case when status='Approved' then status else 'Pending' end,"earnedAmount"=case when status='Approved' then "earnedAmount" else pay end where task_id=a.task_id;
  end if;
 elsif p_action='request_changes' then
  update public.tasks set status='pending' where id=a.task_id and status='submitted';
  update public.transcription_audio_items set review_task_id=null where id=a.id;
 elsif p_action='approve' then
  select * into subm from public.submissions where task_id=a.task_id for update;
  if subm.id is not null then
    if coalesce(subm.status,'')<>'Approved' then
      update public.users set balance=coalesce(balance,0)+coalesce(subm."earnedAmount",0) where "uniqueID"=subm."workerUID";
    end if;
    update public.submissions set status='Approved',reviewed_at=now(),approved_at=coalesce(approved_at,now()),rejected_at=null where id=subm.id;
    insert into public.submission_payments(submission_id,payment_status,updated_at,updated_by) values(subm.id,'pending',now(),auth.uid()) on conflict(submission_id) do nothing;
  end if;
 end if;
 return jsonb_build_object('revision',a.revision,'status',newstatus,'earning',case when p_action='submit' then coalesce((select s."earnedAmount" from public.submissions s where s.task_id=a.task_id order by s.id desc limit 1),pay) else null end,'currency',case when p_action='submit' then cur else null end);
end $function$
;
commit;
