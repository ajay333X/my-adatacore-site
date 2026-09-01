-- Run in a transaction with the migration, then ROLLBACK; no provider calls escape.
do $$
declare admin_id uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid();pid integer;aid uuid;jid uuid;token uuid;result jsonb;draft jsonb;blocked boolean;original jsonb;
begin
 insert into auth.users(id,email) values(admin_id,'ai-admin-'||admin_id||'@example.invalid'),(outsider,'ai-outsider-'||outsider||'@example.invalid'),(worker,'ai-worker-'||worker||'@example.invalid');
 update public.users set role=case when id=admin_id then 'admin' else 'user' end,"accountStatus"='active' where id in(admin_id,outsider,worker);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 pid:=public.tx_create_project('AI fixture '||gen_random_uuid(),'Synthetic transaction only');
 insert into storage.objects(bucket_id,name,metadata) values('transcription_audio',pid||'/fixture.wav','{"size":32000}');
 aid:=public.tx_register_upload(pid,pid||'/fixture.wav','AI fixture','Tests',5000);
 if exists(select 1 from app_private.transcription_ai_jobs where audio_item_id=aid) then raise exception 'FAIL auto drafting default';end if;
 result:=public.tx_ai_enqueue(pid,array[aid]);
 if (result->>'added')::int<>1 then raise exception 'FAIL enqueue';end if;
 select id,dispatch_token into jid,token from app_private.transcription_ai_jobs where audio_item_id=aid;
 if token is null then raise exception 'FAIL dispatcher';end if;
 if public.tx_ai_claim(jid,gen_random_uuid()) is not null then raise exception 'FAIL invalid capability';end if;
 if public.tx_ai_claim(jid,token) is null then raise exception 'FAIL claim';end if;
 if public.tx_ai_claim(jid,token) is not null then raise exception 'FAIL replayed capability';end if;
 if (public.tx_ai_enqueue(pid,array[aid])->>'skipped')::int<>1 then raise exception 'FAIL duplicate job';end if;
 draft:=jsonb_build_object('duration_ms',5000,'speakers',jsonb_build_array(jsonb_build_object('id','speaker-1','label','Speaker 1','channel',0)),
 'segments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'speaker_id','speaker-1','start_ms',0,'end_ms',2000,'transcript','नमस्ते।')));
 perform public.tx_ai_finish(jid,token,draft);
 if (select revision from public.transcription_audio_items where id=aid)<>1 then raise exception 'FAIL prefill revision';end if;
 if not (select applied from app_private.transcription_ai_jobs where id=jid) then raise exception 'FAIL prefill marker';end if;
 if public.tx_ai_finish(jid,token,draft) then raise exception 'FAIL completed job overwritten';end if;
 original:=app_private.tx_rows(aid);
 -- Human changes are never overwritten by a later generated draft.
 perform public.tx_save(aid,1,jsonb_set(draft->'segments','{0,transcript}','"Human correction"'),draft->'speakers',5000);
 perform public.tx_ai_enqueue(pid,array[aid],true);
 select id,dispatch_token into jid,token from app_private.transcription_ai_jobs where audio_item_id=aid and status='dispatched';
 perform public.tx_ai_claim(jid,token);perform public.tx_ai_finish(jid,token,draft);
 if (app_private.tx_rows(aid)->0->>'transcript')<>'Human correction' then raise exception 'FAIL human edits overwritten';end if;
 if (select applied from app_private.transcription_ai_jobs where id=jid) then raise exception 'FAIL regeneration applied';end if;
 if (select count(*) from app_private.transcription_ai_jobs where audio_item_id=aid and status='ready')<>2 then raise exception 'FAIL baseline history lost';end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;begin perform public.tx_ai_item(aid);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL outsider sees AI text';end if;
 blocked:=false;begin perform public.tx_ai_enqueue(pid,array[aid]);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL outsider can spend API budget';end if;
 blocked:=false;begin perform public.tx_ai_settings(pid,true,'hi');exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL outsider changes setting';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.tx_ai_settings(pid,true,'hi');
 insert into storage.objects(bucket_id,name,metadata) values('transcription_audio',pid||'/auto.wav','{"size":32000}');
 aid:=public.tx_register_upload(pid,pid||'/auto.wav','Auto fixture','Tests',5000);
 if not exists(select 1 from app_private.transcription_ai_jobs where audio_item_id=aid and status='queued' and language='hi') then raise exception 'FAIL auto import';end if;
 -- If assignment occurs during generation, leave a reference instead of prefilling.
 perform app_private.tx_ai_dispatch();
 select id,dispatch_token into jid,token from app_private.transcription_ai_jobs where audio_item_id=aid;
 perform public.tx_ai_claim(jid,token);
 perform public.tx_assign(pid,array['ai-worker-'||worker||'@example.invalid'],'L1',1,array[aid]);
 perform public.tx_ai_finish(jid,token,jsonb_set(draft,'{segments,0,id}',to_jsonb(gen_random_uuid())));
 if (select revision from public.transcription_audio_items where id=aid)<>0 then raise exception 'FAIL assigned module overwritten';end if;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 if public.tx_ai_item(aid)->'draft' is null then raise exception 'FAIL assignee cannot read baseline';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.admin_set_project_access(worker,pid,'revoked');
 perform set_config('request.jwt.claim.sub',worker::text,true);
 blocked:=false;begin perform public.tx_ai_item(aid);exception when others then blocked:=true;end;if not blocked then raise exception 'FAIL revoked assignee reads baseline';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into storage.objects(bucket_id,name,metadata) values('transcription_audio',pid||'/large.wav','{"size":25000000}');
 aid:=public.tx_register_upload(pid,pid||'/large.wav','Large fixture','Tests',5000);
 if not exists(select 1 from app_private.transcription_ai_jobs where audio_item_id=aid and status='failed' and error_code='UNSUPPORTED_AUDIO') then raise exception 'FAIL oversized audio submitted';end if;
end $$;
do $$begin
 if has_function_privilege('authenticated','public.tx_ai_claim(uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.tx_ai_finish(uuid,uuid,jsonb,text,text)','EXECUTE') then raise exception 'FAIL privileged worker RPC exposed';end if;
 if has_table_privilege('authenticated','app_private.transcription_ai_jobs','SELECT') then raise exception 'FAIL private jobs exposed';end if;
end $$;
select 'PASS: enqueue, duplicate suppression, capabilities, prefill, immutable AI baselines, human edits, auto import, assignment race, access revocation, size limits and privilege isolation' as result;
