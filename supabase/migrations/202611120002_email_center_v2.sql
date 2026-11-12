-- Admin Email Center v2. Applied in production on 2026-11-12. Idempotent repository counterpart.
alter table public.admin_email_center_messages
  add column if not exists campaign_id uuid,
  add column if not exists content_mode text not null default 'rich',
  add column if not exists audience_kind text not null default 'individual',
  add column if not exists project_id integer,
  add column if not exists audience_level text not null default 'all';
alter table public.admin_email_center_messages drop constraint if exists admin_email_center_messages_kind_check;
alter table public.admin_email_center_messages add constraint admin_email_center_messages_kind_check check(kind in ('individual','multi','project','test'));
alter table public.admin_email_center_messages drop constraint if exists admin_email_body_limit;
alter table public.admin_email_center_messages add constraint admin_email_body_limit check(length(body_markdown) between 1 and 60000);
alter table public.admin_email_center_messages drop constraint if exists admin_email_content_mode_check;
alter table public.admin_email_center_messages add constraint admin_email_content_mode_check check(content_mode in ('rich','html'));
alter table public.admin_email_center_messages drop constraint if exists admin_email_audience_level_check;
alter table public.admin_email_center_messages add constraint admin_email_audience_level_check check(audience_level in ('all','l1','l2'));
create index if not exists admin_email_campaign_idx on public.admin_email_center_messages(campaign_id,created_at desc);

CREATE OR REPLACE FUNCTION public.admin_email_center_finish_batch(p_campaign_id uuid, p_results jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
 if p_campaign_id is null or jsonb_typeof(p_results) <> 'array'
  then raise exception 'INVALID_RESULTS'; end if;
 update public.admin_email_center_messages m
 set status = r.status,
     provider_message_id = nullif(r.provider_id,''),
     provider_response_code = r.provider_code,
     error_message = nullif(left(coalesce(r.error_text,''),400),''),
     finalized_at = now()
 from jsonb_to_recordset(p_results) as r(
    email text,status text,provider_id text,provider_code integer,error_text text
 )
 where m.campaign_id=p_campaign_id
   and m.recipient_email=lower(btrim(r.email))
   and m.status='processing'
   and r.status in ('accepted','failed','unknown');
 get diagnostics v_count=row_count;
 return v_count;
end $function$
;
revoke all on function public.admin_email_center_finish_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_email_center_finish_batch(uuid,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.admin_email_center_project_members(p_project_id integer, p_level text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_members jsonb;
begin
 if p_level not in ('all','l1','l2') or p_project_id is null then
  raise exception 'INVALID_AUDIENCE';
 end if;
 if not exists(select 1 from public.project_lab p where p.id=p_project_id) then
  raise exception 'PROJECT_NOT_FOUND';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
    'email', lower(btrim(u.email)),
    'name', coalesce(nullif(btrim(u."fullName"),''),'Contributor'),
    'user_id',u.id,
    'can_l1',coalesce(l.can_l1,d.can_l1,true),
    'can_l2',coalesce(l.can_l2,d.can_l2,false)
   ) order by lower(btrim(u.email))),'[]'::jsonb)
 into v_members
 from public.project_access_controls a
 join public.users u on u.id=a.user_id
 left join app_private.transcription_review_levels l
  on l.project_id=a.project_id and l.user_id=a.user_id
 left join app_private.project_daily_assignments d
  on d.project_id=a.project_id and d.user_id=a.user_id
 where a.project_id=p_project_id and a.access_status='active'
  and u."accountStatus"='active'
  and u.email is not null and btrim(u.email) <> ''
  and (
    p_level='all' or
    (p_level='l1' and coalesce(l.can_l1,d.can_l1,true)) or
    (p_level='l2' and coalesce(l.can_l2,d.can_l2,false))
  );
 return v_members;
end $function$
;
revoke all on function public.admin_email_center_project_members(integer,text) from public,anon,authenticated;
grant execute on function public.admin_email_center_project_members(integer,text) to service_role;

CREATE OR REPLACE FUNCTION public.admin_email_center_reserve_campaign(p_admin_id uuid, p_campaign_id uuid, p_recipients jsonb, p_from text, p_subject text, p_body text, p_kind text, p_content_mode text, p_project_id integer DEFAULT NULL::integer, p_level text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_recipients integer;
 v_hour integer;
 v_day integer;
 v_saved integer;
 v_item text;
begin
 if p_admin_id is null or p_campaign_id is null then raise exception 'INVALID_CAMPAIGN'; end if;
 if not exists(select 1 from public.users u where u.id=p_admin_id and u.role='admin' and u."accountStatus"='active')
 then raise exception 'ADMIN_REQUIRED';end if;
 if p_kind not in ('individual','multi','project','test') or p_content_mode not in ('rich','html')
 or p_level not in ('all','l1','l2') then raise exception 'INVALID_CAMPAIGN';end if;
 if p_from is null or length(p_from)>180 or p_subject is null or length(p_subject) not between 3 and 180
 or p_body is null or length(p_body) not between 5 and 60000 then raise exception 'INVALID_MESSAGE';end if;
 if jsonb_typeof(p_recipients)<>'array' then raise exception 'INVALID_RECIPIENTS';end if;
 select count(*),count(distinct lower(btrim(value)))
 into v_recipients,v_saved from jsonb_array_elements_text(p_recipients);
 if v_recipients<1 or v_recipients>250 or v_saved<>v_recipients then raise exception 'RECIPIENT_LIMIT_OR_DUPLICATE';end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('adatacore-email-center:'||p_admin_id::text));
 if exists(select 1 from public.admin_email_center_messages e where e.campaign_id=p_campaign_id)
 then
  return jsonb_build_object('already_processed',true,'count',
   (select count(*) from public.admin_email_center_messages e where e.campaign_id=p_campaign_id));
 end if;
 select count(*) into v_hour from public.admin_email_center_messages e
   where e.created_by=p_admin_id and e.created_at >= now()-interval '1 hour';
 select count(*) into v_day from public.admin_email_center_messages e
   where e.created_by=p_admin_id and e.created_at >= now()-interval '24 hours';
 if v_hour+v_recipients>250 then raise exception 'HOURLY_EMAIL_LIMIT';end if;
 if v_day+v_recipients>500 then raise exception 'DAILY_EMAIL_LIMIT';end if;

 insert into public.admin_email_center_messages(
   request_id,campaign_id,created_by,from_address,recipient_email,
   subject,body_markdown,kind,content_mode,audience_kind,project_id,audience_level,status
 )
 select md5(p_campaign_id::text||':'||lower(btrim(recipient)))::uuid,
   p_campaign_id,p_admin_id,p_from,lower(btrim(recipient)),p_subject,p_body,
   p_kind,p_content_mode,p_kind,p_project_id,p_level,'processing'
 from jsonb_array_elements_text(p_recipients) as recipient;
 get diagnostics v_saved=row_count;
 return jsonb_build_object('reserved',v_saved,'already_processed',false);
end $function$
;
revoke all on function public.admin_email_center_reserve_campaign(uuid,uuid,jsonb,text,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_email_center_reserve_campaign(uuid,uuid,jsonb,text,text,text,text,text,integer,text) to service_role;
