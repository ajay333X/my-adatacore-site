create or replace function public.tx_assign(p_project_id integer,p_user_keys text[],p_layer text default 'L1',p_quantity integer default 1,p_item_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare p public.project_lab;u public.users;a public.transcription_audio_items;k text;i integer;tid integer;pub text;result jsonb:='[]';allowance_result jsonb;
begin
 if not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if p_layer not in ('L1','L2') or p_layer is null or p_quantity is null or p_quantity not between 1 and 100 or coalesce(array_length(p_user_keys,1),0) not between 1 and 100 then raise exception 'Choose people, layer and a quantity between 1 and 100'; end if;
 select * into p from public.project_lab where id=p_project_id and project_type='transcription' for update;
 if p.id is null or p.lifecycle_status<>'active' then raise exception 'Choose an active transcription project'; end if;

 -- L1 is an allowance, never a batch of pre-bound audio tasks. The contributor
 -- claims the current Queue #1 only when they actually start the next task.
 if p_layer='L1' then
   allowance_result:=public.tx_set_l1_allowance(p_project_id,p_user_keys,p_quantity);
   return jsonb_build_object(
     'created',p_quantity*coalesce(cardinality(p_user_keys),0),
     'mode','allowance',
     'participants',coalesce(allowance_result->'participants','[]'::jsonb),
     'tasks','[]'::jsonb,
     'skipped','[]'::jsonb
   );
 end if;

 foreach k in array p_user_keys loop
  select * into u from public.users where lower(email)=lower(trim(k)) or "uniqueID"=trim(k) limit 1;
  if u.id is null or u."accountStatus"<>'active' or not app_private.user_has_project_access(u.id,p.project_name) then raise exception 'Participant unavailable or project access revoked: %',k; end if;
  for i in 1..p_quantity loop
   select ai.* into a from public.transcription_audio_items ai left join public.tasks t on t.id=ai.task_id left join public.tasks r on r.id=ai.review_task_id
   where ai.transcription_project_id=p_project_id and ai.queue_state='queued' and (p_item_ids is null or ai.id=any(p_item_ids))
   and ai.status in ('submitted','in_review') and (ai.review_task_id is null or r.status='cancelled')
   and lower(coalesce(t."assignedTo",'')) not in (lower(u.email),lower(coalesce(u."uniqueID",'')))
   order by ai.submitted_at asc nulls last,ai.created_at,ai.id limit 1 for update of ai skip locked;
   if a.id is null then raise exception 'Not enough submitted transcription modules are ready for L2 audit.'; end if;
   insert into public.tasks("assignedTo",title,price,layer,status,instructions) values(u.email,p.project_name,p.l2_rate,'L2','pending','Open the transcription workspace to audit the submitted transcript.') returning id,public_task_id into tid,pub;
   update public.transcription_audio_items set review_task_id=tid,status='in_review',updated_at=now() where id=a.id;
   result:=result||jsonb_build_array(jsonb_build_object('id',tid,'task_id',pub,'user',u.email,'audio_item_id',a.id));
  end loop;
 end loop;
 perform app_private.log_project_activity(p_project_id,'transcription.assigned','audio',null,jsonb_build_object('layer','L2','count',jsonb_array_length(result)));
 return jsonb_build_object('created',jsonb_array_length(result),'mode','direct','tasks',result,'skipped','[]'::jsonb);
end
$$;
