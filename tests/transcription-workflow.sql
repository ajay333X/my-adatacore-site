-- Execute inside BEGIN / ROLLBACK after the migration. All fixtures are synthetic.
do $$
declare admin_id uuid:=gen_random_uuid();worker uuid:=gen_random_uuid();reviewer uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();pid integer;aid uuid;aid2 uuid;tid integer;result jsonb;blocked boolean;rev integer;segs jsonb;sp jsonb:='[{"id":"speaker-1","label":"Speaker 1","channel":0},{"id":"speaker-2","label":"Speaker 2","channel":0}]';source_path text;source_bucket text;
begin
 insert into auth.users(id,email) values(admin_id,'tx-admin-'||admin_id||'@example.invalid'),(worker,'tx-worker-'||worker||'@example.invalid'),(reviewer,'tx-reviewer-'||reviewer||'@example.invalid'),(outsider,'tx-outsider-'||outsider||'@example.invalid');
 update public.users set role=case when id=admin_id then 'admin' else 'user' end,"accountStatus"='active' where id in (admin_id,worker,reviewer,outsider);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 pid:=public.tx_create_project('TX workflow test '||gen_random_uuid(),'Synthetic test');
 select name,bucket_id into source_path,source_bucket from storage.objects where bucket_id='recordings' limit 1;
 result:=public.tx_import_sources(pid,jsonb_build_array(jsonb_build_object('bucket',source_bucket,'path',source_path)));
 if (result->>'imported')::int<>1 then raise exception 'FAIL source import';end if;
 result:=public.tx_import_sources(pid,jsonb_build_array(jsonb_build_object('bucket',source_bucket,'path',source_path)));
 if (result->>'duplicates')::int<>1 then raise exception 'FAIL duplicate import';end if;
 select id into aid from public.transcription_audio_items where transcription_project_id=pid;
 -- An upload is registered only if it already exists in the private bucket.
 blocked:=false;begin perform public.tx_register_upload(pid,pid||'/not-uploaded.wav','Missing','Uploads',10000);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL nonexistent upload registered';end if;
 insert into storage.objects(bucket_id,name) values('transcription_audio',pid||'/fixture.wav');
 aid2:=public.tx_register_upload(pid,pid||'/fixture.wav','External fixture','Uploads',10000);
 result:=public.tx_assign(pid,array['tx-worker-'||worker||'@example.invalid'],'L1',1,array[aid]);
 tid:=(result->'tasks'->0->>'id')::int;
 perform public.tx_assign(pid,array['tx-worker-'||worker||'@example.invalid'],'L1',1,array[aid2]);
 perform public.admin_set_daily_task_limit(worker,1);
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;begin perform public.tx_open(aid);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL unrelated audio opened';end if;
 if public.tx_can_read_audio(source_bucket,source_path) then raise exception 'FAIL unrelated storage access';end if;
 blocked:=false;begin perform public.tx_get_lab(pid);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL nonadmin lab access';end if;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 result:=public.tx_open(aid);if result->>'mode'<>'contributor' or not (result->>'editable')::boolean then raise exception 'FAIL contributor access';end if;
 if not public.tx_can_read_audio(source_bucket,source_path) then raise exception 'FAIL assigned storage access';end if;
 perform public.tx_open(aid);if (select count(*) from app_private.daily_task_starts where user_id=worker)<>1 then raise exception 'FAIL resume double counted';end if;
 blocked:=false;begin perform public.tx_open(aid2);exception when others then if sqlerrm like 'DAILY_TASK_LIMIT_REACHED%' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'FAIL transcription quota';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_contributor_workspace()->'tasks') t where t->>'transcription_item_id'=aid::text) then raise exception 'FAIL contributor route mapping';end if;
 blocked:=false;begin perform public.submit_assigned_task(tid,'bypass');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL direct submission bypass';end if;
 segs:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'speaker_id','speaker-1','start_ms',0,'end_ms',3000,'transcript','नमस्ते।'),jsonb_build_object('id',gen_random_uuid(),'speaker_id','speaker-2','start_ms',1000,'end_ms',4000,'transcript','जी, नमस्ते।'));
 result:=public.tx_save(aid,0,segs,sp,10000);if (result->>'revision')::int<>1 then raise exception 'FAIL save revision';end if;
 blocked:=false;begin perform public.tx_save(aid,0,segs,sp,10000);exception when others then if sqlerrm like 'VERSION_CONFLICT%' then blocked:=true;else raise;end if;end;if not blocked then raise exception 'FAIL stale version overwritten';end if;
 -- Same-speaker overlap blocks submission; different speakers may overlap.
 perform public.tx_save(aid,1,jsonb_set(segs,'{1,speaker_id}','"speaker-1"'),sp,10000);
 blocked:=false;begin perform public.tx_submit(aid,2,'submit','');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL same-speaker overlap';end if;
 perform public.tx_save(aid,2,segs,sp,10000);result:=public.tx_submit(aid,3,'submit','');if result->>'status'<>'submitted' then raise exception 'FAIL submit';end if;
 blocked:=false;begin perform public.tx_save(aid,4,segs,sp,10000);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL post-submit edits';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 blocked:=false;begin perform public.tx_assign(pid,array['tx-worker-'||worker||'@example.invalid'],'L2',1,array[aid]);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL self review assigned';end if;
 -- Existing Project Lab assignment API delegates to real audio inventory.
 result:=public.admin_bulk_assign_project_tasks(pid,'L2',array['tx-reviewer-'||reviewer||'@example.invalid'],null,1);
 if (result->>'created')::int<>1 then raise exception 'FAIL generic assignment integration';end if;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 result:=public.tx_open(aid);if result->>'mode'<>'reviewer' then raise exception 'FAIL reviewer access';end if;
 blocked:=false;begin perform public.tx_submit(aid,4,'request_changes','');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL empty return feedback';end if;
 result:=public.tx_submit(aid,4,'request_changes','Please check speaker timing.');if result->>'status'<>'changes_requested' then raise exception 'FAIL return';end if;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 result:=public.tx_open(aid);if not (result->>'editable')::boolean then raise exception 'FAIL returned task unavailable';end if;
 perform public.tx_save(aid,5,segs,sp,10000);perform public.tx_submit(aid,6,'submit','');
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.tx_assign(pid,array['tx-reviewer-'||reviewer||'@example.invalid'],'L2',1,array[aid]);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.tx_open(aid);result:=public.tx_submit(aid,7,'approve','Checked all segments.');if result->>'status'<>'approved' then raise exception 'FAIL approval';end if;
 if (select count(*) from app_private.transcription_history where audio_item_id=aid)<>4 then raise exception 'FAIL review history';end if;
 -- Revoking project access also revokes assigned audio reads.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform public.admin_set_project_access(worker,pid,'revoked');
 perform set_config('request.jwt.claim.sub',worker::text,true);if public.tx_can_read_audio(source_bucket,source_path) then raise exception 'FAIL revoked storage access';end if;
 perform set_config('tx_test.outsider',outsider::text,true);perform set_config('tx_test.path',pid||'/fixture.wav',true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('tx_test.outsider'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='transcription_audio' and name=current_setting('tx_test.path')) then raise exception 'FAIL RLS leaked private audio';end if;
 if exists(select 1 from public.transcription_audio_items) then raise exception 'FAIL direct transcription table access';end if;
 if has_table_privilege(current_user,'public.transcription_audio_items','TRUNCATE') then raise exception 'FAIL truncate permission';end if;
end $$;
reset role;
select 'PASS: imports, duplicates, external upload, assignment, audio RLS, daily quota, draft versioning, segment validation, submission, reviewer return and approval' as result;
