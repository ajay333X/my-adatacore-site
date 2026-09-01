-- Run after the migration inside BEGIN ... ROLLBACK; fixtures never persist.
DO $$
declare uid uuid:=gen_random_uuid(); admin_id uuid; email text; proj text:='Account controls test '||gen_random_uuid(); pid integer; t1 integer;t2 integer;t3 integer;rt integer; sub1 integer;sub2 integer;result jsonb;blocked boolean;sid uuid;
begin
 email:='account-test-'||uid||'@example.invalid';
 insert into auth.users(id,email) values(uid,email);
 update public.users set "accountStatus"='active',"fullName"='Account controls test' where id=uid;
 insert into public.project_lab(project_name,is_published,config) values(proj,true,'{"mode":"solo_voice_recording"}') returning id into pid;
 insert into public.tasks("assignedTo",title,layer,status) values(email,proj,'L1','pending') returning id into t1;
 insert into public.tasks("assignedTo",title,layer,status) values(email,proj,'L1','pending') returning id into t2;
 insert into public.tasks("assignedTo",title,layer,status) values(email,proj,'L1','pending') returning id into t3;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 result:=public.update_my_profile('Account controls test',null,null,null,'IN','9876543210');
 if result->>'phone_e164'<>'+919876543210' then raise exception 'FAIL phone serialization: %',result; end if;
 blocked:=false;begin perform public.update_my_profile('Test',null,null,null,'IN','12345');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL invalid India number';end if;
 blocked:=false;begin perform public.update_my_profile('Test',null,null,null,'IN','abc9876543210');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL alphabetic phone';end if;
 blocked:=false;begin perform public.update_my_profile('Test',null,null,null,null,'9876543210');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL missing country';end if;
 blocked:=false;begin perform public.update_my_profile('Test',null,null,null,'CA','2025550123');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL US number accepted as Canada';end if;
 result:=public.update_my_profile('Test',null,null,null,'CA','4165550123');if result->>'phone_e164'<>'+14165550123' then raise exception 'FAIL Canada';end if;
 result:=public.update_my_profile('Test',null,null,null,'IT','0236618300');if result->>'phone_e164'<>'+390236618300' then raise exception 'FAIL leading zero';end if;
 blocked:=false;begin update public.users set daily_task_limit=999 where id=uid;exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL participant changed own daily limit';end if;
 blocked:=false;begin perform public.admin_set_daily_task_limit(uid,999);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL unauthorized limit RPC';end if;
 select id into admin_id from public.users where role='admin' and "accountStatus"='active' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.admin_set_daily_task_limit(uid,1);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.begin_assigned_task(t1);
 perform public.begin_assigned_task(t1);
 result:=public.get_my_account_controls();if (result->>'daily_tasks_started_today')::int<>1 then raise exception 'FAIL repeated start counted twice';end if;
 blocked:=false;begin perform public.begin_assigned_task(t2);exception when others then if SQLERRM like 'DAILY_TASK_LIMIT_REACHED%' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'FAIL second task exceeded limit';end if;
 blocked:=false;begin perform public.submit_assigned_task(t2,'fixture');exception when others then if SQLERRM like 'DAILY_TASK_LIMIT_REACHED%' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'FAIL direct submission bypass';end if;
 -- Resuming previously started work stays permitted at the cap.
 sid:=public.start_solo_voice_session(proj,t1);
 perform public.complete_voice_session(sid,sid::text||'_'||uid||'_record.webm',5);
 if (select status from public.tasks where id=t1)<>'submitted' then raise exception 'FAIL recorded wrong task';end if;
 if (select status from public.tasks where id=t2)<>'pending' then raise exception 'FAIL unrelated task changed';end if;
 -- UTC reset uses server timestamps, and admin changes apply immediately.
 update app_private.daily_task_starts set started_at=now()-interval '1 day' where user_id=uid;
 result:=public.get_my_account_controls();if (result->>'daily_tasks_remaining')::int<>1 then raise exception 'FAIL daily reset';end if;
 perform public.begin_assigned_task(t2);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform public.admin_set_daily_task_limit(uid,0);perform set_config('request.jwt.claim.sub',uid::text,true);
 blocked:=false;begin perform public.begin_assigned_task(t3);exception when others then if SQLERRM like 'DAILY_TASK_LIMIT_REACHED%' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'FAIL zero limit';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform public.admin_set_daily_task_limit(uid,null);perform set_config('request.jwt.claim.sub',uid::text,true);perform public.begin_assigned_task(t3);
 -- Each new L2 review consumes a separate slot, even under the same assignment.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.tasks("assignedTo",title,layer,status) values(email,proj,'L2','pending') returning id into rt;
 insert into public.submissions("workerUID","projectTitle","audioData",status) values('test-source',proj,'fixture-1.webm','Pending') returning id into sub1;
 insert into public.submissions("workerUID","projectTitle","audioData",status) values('test-source',proj,'fixture-2.webm','Pending') returning id into sub2;
 perform public.admin_set_daily_task_limit(uid,3);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.claim_next_voice_l2_review(rt);perform public.claim_next_voice_l2_review(rt);
 result:=public.get_my_account_controls();if (result->>'daily_tasks_started_today')::int<>3 then raise exception 'FAIL review consumption';end if;
 -- Legacy review endpoint must use the same quota guard.
 blocked:=false;begin perform public.review_submission(rt,sub2,'Rejected');exception when others then if SQLERRM like 'DAILY_TASK_LIMIT_REACHED%' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'FAIL next review quota';end if;
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;begin perform public.get_my_account_controls();exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL anonymous controls';end if;
end $$;
select 'Phone validation, authorization, limits, reset, resumes, direct submission, session mapping and review quota passed' as result;
