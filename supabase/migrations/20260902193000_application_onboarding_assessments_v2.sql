-- Adatacore contributor application onboarding v2
-- Existing accounts at rollout are grandfathered; newly-created public.users rows must complete onboarding.

create table if not exists app_private.application_onboarding_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  version integer not null default 2,
  exempt boolean not null default false,
  primary_language_code text,
  primary_language_label text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table app_private.application_onboarding_state enable row level security;

create table if not exists app_private.contributor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  track text not null check (track in ('voice_acting','transcription')),
  language_code text not null,
  language_label text not null,
  status text not null default 'draft' check (status in ('draft','pending','under_review','changes_requested','approved','rejected','withdrawn')),
  profile_snapshot jsonb not null default '{}'::jsonb,
  equipment jsonb not null default '{}'::jsonb,
  submission jsonb not null default '{}'::jsonb,
  recording_bucket text,
  recording_path text,
  recording_duration_ms integer,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,track,language_code)
);
alter table app_private.contributor_applications enable row level security;
create index if not exists contributor_applications_status_idx on app_private.contributor_applications(status, submitted_at desc);
create index if not exists contributor_applications_language_track_idx on app_private.contributor_applications(language_code, track, status);
create index if not exists contributor_applications_user_idx on app_private.contributor_applications(user_id, created_at desc);

create table if not exists app_private.application_assessment_content (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('voice_acting','transcription')),
  language_code text not null,
  language_label text not null,
  title text not null,
  instructions text not null,
  prompt_text text,
  audio_bucket text,
  audio_path text,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  unique(track,language_code)
);
alter table app_private.application_assessment_content enable row level security;

create table if not exists app_private.application_project_map (
  track text not null check (track in ('voice_acting','transcription')),
  language_code text not null,
  project_id integer not null references public.project_lab(id) on delete cascade,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  primary key(track,language_code)
);
alter table app_private.application_project_map enable row level security;

insert into app_private.application_onboarding_state(user_id,version,exempt,completed_at)
select id,2,true,now() from public.users
on conflict(user_id) do nothing;

create or replace function app_private.application_onboard_new_user()
returns trigger language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
begin
  insert into app_private.application_onboarding_state(user_id,version,exempt)
  values(new.id,2,false) on conflict(user_id) do nothing;
  insert into app_private.contributor_operations_profile(user_id,application_state)
  values(new.id,'applicant')
  on conflict(user_id) do update set application_state='applicant',updated_at=now();
  return new;
end $$;

drop trigger if exists application_onboard_new_user on public.users;
create trigger application_onboard_new_user after insert on public.users
for each row execute function app_private.application_onboard_new_user();

create or replace function app_private.can_review_applications()
returns boolean language sql stable security definer
set search_path=public,app_private,pg_temp
as $$
  select auth.uid() is not null
     and exists(select 1 from public.users u where u.id=auth.uid() and u."accountStatus"='active')
     and (app_private.is_admin() or exists(select 1 from public.admin_staff_roles r where r.user_id=auth.uid() and r.active and r.role='qa_manager'));
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('application_assessments','application_assessments',false,26214400,array['audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/x-m4a'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists application_assessments_insert_own on storage.objects;
create policy application_assessments_insert_own on storage.objects for insert to authenticated
with check(bucket_id='application_assessments' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists application_assessments_read_own_or_reviewer on storage.objects;
create policy application_assessments_read_own_or_reviewer on storage.objects for select to authenticated
using(bucket_id='application_assessments' and ((storage.foldername(name))[1]=(select auth.uid())::text or app_private.can_review_applications()));
drop policy if exists application_assessments_delete_own on storage.objects;
create policy application_assessments_delete_own on storage.objects for delete to authenticated
using(bucket_id='application_assessments' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Initial Hindi transcription assessment sample stored in the existing private transcription bucket.
drop policy if exists application_transcription_assessment_read on storage.objects;
create policy application_transcription_assessment_read on storage.objects for select to authenticated
using(bucket_id='transcription_audio' and name='81/long/8a0ac24d-da4c-4842-8a33-70d0e711f409/017.wav');

insert into app_private.application_assessment_content(track,language_code,language_label,title,instructions,prompt_text,audio_bucket,audio_path,config,active)
values
('voice_acting','hi-IN','Hindi','Hindi Voice Acting Assessment',
 'Read the script naturally, as if you are speaking to one person. Do not use an announcement tone or overact. Keep a comfortable pace, use natural pauses, pronounce each word clearly, keep a steady microphone distance, and record in a quiet room without music or effects. You may listen and retry before submitting.',
 'आज सुबह जब मैं घर से निकला, तो मौसम बिल्कुल सामान्य लग रहा था। लेकिन रास्ते में अचानक तेज़ बारिश शुरू हो गई। मैं पहले थोड़ा घबराया, फिर खुद ही हँस पड़ा, क्योंकि छाता मैं फिर घर पर भूल आया था। दुकान तक पहुँचते-पहुँचते मैं पूरी तरह भीग चुका था, फिर भी उस अचानक हुई बारिश ने दिन को थोड़ा मज़ेदार बना दिया।',
 null,null,jsonb_build_object('recommended_seconds',35,'minimum_seconds',12,'maximum_seconds',120,'project_hint',66),true),
('voice_acting','mr-IN','Marathi','Marathi Voice Acting Assessment',
 'हा मजकूर अगदी नैसर्गिक संभाषणासारखा वाचा. घोषणेसारखा टोन वापरू नका आणि अनावश्यक अभिनय करू नका. गती आरामशीर ठेवा, नैसर्गिक विराम घ्या, शब्द स्पष्ट उच्चारा आणि शांत जागेत समान मायक्रोफोन अंतर ठेवून रेकॉर्ड करा. सबमिट करण्यापूर्वी रेकॉर्डिंग पुन्हा ऐकून हवे असल्यास पुन्हा रेकॉर्ड करू शकता.',
 'आज सकाळी घरातून बाहेर पडल्यावर हवामान अगदी सामान्य वाटत होतं. पण रस्त्यात अचानक जोरदार पाऊस सुरू झाला. क्षणभर गोंधळल्यासारखं झालं आणि मग स्वतःवरच हसू आलं, कारण छत्री पुन्हा घरीच राहिली होती. दुकानापर्यंत पोहोचेपर्यंत पूर्ण भिजायला झालं, तरी त्या अचानक आलेल्या पावसामुळे दिवस थोडा मजेशीर झाला.',
 null,null,jsonb_build_object('recommended_seconds',35,'minimum_seconds',12,'maximum_seconds',120),true),
('transcription','hi-IN','Hindi','Hindi Transcription Assessment',
 'Listen carefully and type exactly what you hear in Hindi. Do not summarize or translate. Preserve the spoken wording as closely as possible and use normal Hindi punctuation. You may replay the audio and change playback speed before submitting.',
 null,'transcription_audio','81/long/8a0ac24d-da4c-4842-8a33-70d0e711f409/017.wav',
 jsonb_build_object('minimum_characters',25,'project_hint',81,'review_reference','तो वह चीज बहुत साथा बढ़िया रहती है और मैं तो यही कहूंगी कि अपने गुस्से को जो है शांत रखिए ताकि उसकी वजह से आपके जो रिष्टे वगाना हैं वो जो है ना जादा परभावित ना होता है क्योंकि अगर आपके रिष्टे परभावित हो गए तो ब के लिए धन्यवाद मैं आशा करती हूं हमारी फिर उलाकात होगी किसी नए पॉइंट विषय पर जी धन्यवाद लुटिक'),true)
on conflict(track,language_code) do update set language_label=excluded.language_label,title=excluded.title,instructions=excluded.instructions,prompt_text=excluded.prompt_text,audio_bucket=excluded.audio_bucket,audio_path=excluded.audio_path,config=excluded.config,active=true,updated_at=now();

insert into app_private.application_project_map(track,language_code,project_id,active)
values('voice_acting','hi-IN',66,true),('transcription','hi-IN',81,true)
on conflict(track,language_code) do update set project_id=excluded.project_id,active=true,updated_at=now();

create or replace function public.get_application_catalog()
returns jsonb language sql stable security definer
set search_path=public,app_private,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('track',c.track,'language_code',c.language_code,'language_label',c.language_label,'title',c.title,'has_audio',c.audio_path is not null) order by c.language_label,c.track),'[]'::jsonb)
  from app_private.application_assessment_content c where c.active;
$$;

create or replace function public.get_my_application_onboarding()
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare
  u public.users%rowtype; s app_private.application_onboarding_state%rowtype;
  confirmed boolean:=false; profile_complete boolean:=false; apps jsonb:='[]'::jsonb;
  app_count integer:=0; action_count integer:=0; done boolean:=false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into u from public.users where id=auth.uid();
  if u.id is null then raise exception 'PROFILE_NOT_READY'; end if;
  select * into s from app_private.application_onboarding_state where user_id=auth.uid();
  if s.user_id is null then insert into app_private.application_onboarding_state(user_id,version,exempt,completed_at) values(auth.uid(),2,true,now()) returning * into s; end if;
  select email_confirmed_at is not null into confirmed from auth.users where id=auth.uid();
  profile_complete:=coalesce(trim(u."fullName"),'')<>'' and u."Date of Birth" is not null and coalesce(trim(u.phone_e164),'')<>'' and coalesce(trim(u.phone_country_iso2),'')<>'';
  select count(*),count(*) filter(where status in ('draft','changes_requested')),
    coalesce(jsonb_agg(jsonb_build_object('id',a.id,'track',a.track,'language_code',a.language_code,'language_label',a.language_label,'status',a.status,'submitted_at',a.submitted_at,'reviewed_at',a.reviewed_at,'reviewer_note',a.reviewer_note) order by a.created_at),'[]'::jsonb)
  into app_count,action_count,apps from app_private.contributor_applications a where a.user_id=auth.uid();
  done:=s.exempt or (confirmed and profile_complete and app_count>0 and action_count=0);
  if done and not s.exempt and s.completed_at is null then update app_private.application_onboarding_state set completed_at=now(),updated_at=now() where user_id=auth.uid(); end if;
  return jsonb_build_object('must_onboard',not s.exempt,'onboarding_complete',done,'email_confirmed',confirmed,'profile_complete',profile_complete,'primary_language_code',s.primary_language_code,'primary_language_label',s.primary_language_label,
    'profile',jsonb_build_object('full_name',u."fullName",'date_of_birth',u."Date of Birth",'education',u.education,'occupation',u.occupation,'country_iso2',u.phone_country_iso2,'phone_national',u.phone_national,'phone_e164',u.phone_e164,'email',u.email),'applications',apps);
end $$;

create or replace function public.application_choose_tracks(p_language_code text,p_language_label text,p_tracks text[])
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_language_code is null or trim(p_language_code)='' or p_tracks is null or array_length(p_tracks,1) is null then raise exception 'INVALID_SELECTION'; end if;
  foreach t in array p_tracks loop
    if t not in ('voice_acting','transcription') then raise exception 'INVALID_TRACK'; end if;
    if not exists(select 1 from app_private.application_assessment_content c where c.track=t and c.language_code=p_language_code and c.active) then raise exception 'ASSESSMENT_UNAVAILABLE:%:%',p_language_code,t; end if;
    insert into app_private.contributor_applications(user_id,track,language_code,language_label,status) values(auth.uid(),t,p_language_code,p_language_label,'draft')
    on conflict(user_id,track,language_code) do update set language_label=excluded.language_label,status=case when app_private.contributor_applications.status in ('changes_requested','rejected','withdrawn') then 'draft' else app_private.contributor_applications.status end,updated_at=now();
    if not exists(select 1 from public.contributor_skills where user_id=auth.uid() and skill_type='domain' and skill_key=t) then insert into public.contributor_skills(user_id,skill_type,skill_key,proficiency) values(auth.uid(),'domain',t,'intermediate'); end if;
  end loop;
  if not exists(select 1 from public.contributor_skills where user_id=auth.uid() and skill_type='language' and skill_key=p_language_code) then insert into public.contributor_skills(user_id,skill_type,skill_key,proficiency) values(auth.uid(),'language',p_language_code,'fluent'); end if;
  update app_private.application_onboarding_state set primary_language_code=p_language_code,primary_language_label=p_language_label,updated_at=now() where user_id=auth.uid();
  return public.get_my_application_onboarding();
end $$;

create or replace function public.get_my_application_assessment(p_application_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare a app_private.contributor_applications%rowtype; c app_private.application_assessment_content%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from app_private.contributor_applications where id=p_application_id;
  if a.id is null or (a.user_id<>auth.uid() and not app_private.can_review_applications()) then raise exception 'NOT_ALLOWED'; end if;
  select * into c from app_private.application_assessment_content where track=a.track and language_code=a.language_code and active;
  if c.id is null then raise exception 'ASSESSMENT_UNAVAILABLE'; end if;
  return jsonb_build_object('application_id',a.id,'track',a.track,'language_code',a.language_code,'language_label',a.language_label,'status',a.status,'title',c.title,'instructions',c.instructions,'prompt_text',case when a.track='voice_acting' then c.prompt_text else null end,'audio_bucket',c.audio_bucket,'audio_path',c.audio_path,'config',(c.config-'review_reference'));
end $$;

create or replace function public.submit_voice_application(p_application_id uuid,p_bucket text,p_path text,p_equipment jsonb,p_duration_ms integer)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare a app_private.contributor_applications%rowtype; u public.users%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from app_private.contributor_applications where id=p_application_id and user_id=auth.uid();
  if a.id is null or a.track<>'voice_acting' or a.status not in ('draft','changes_requested') then raise exception 'APPLICATION_NOT_SUBMITTABLE'; end if;
  if p_bucket<>'application_assessments' or p_path not like auth.uid()::text||'/%' then raise exception 'INVALID_RECORDING_PATH'; end if;
  if coalesce(p_duration_ms,0)<3000 or p_duration_ms>180000 then raise exception 'INVALID_RECORDING_DURATION'; end if;
  select * into u from public.users where id=auth.uid();
  update app_private.contributor_applications set status='pending',equipment=coalesce(p_equipment,'{}'::jsonb),recording_bucket=p_bucket,recording_path=p_path,recording_duration_ms=p_duration_ms,
    profile_snapshot=jsonb_build_object('full_name',u."fullName",'email',u.email,'country_iso2',u.phone_country_iso2,'education',u.education,'occupation',u.occupation),submitted_at=now(),reviewed_at=null,reviewed_by=null,reviewer_note=null,updated_at=now() where id=a.id;
  update app_private.contributor_operations_profile set application_state='applicant',updated_at=now() where user_id=auth.uid();
  return public.get_my_application_onboarding();
end $$;

create or replace function public.submit_transcription_application(p_application_id uuid,p_text text,p_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare a app_private.contributor_applications%rowtype; u public.users%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from app_private.contributor_applications where id=p_application_id and user_id=auth.uid();
  if a.id is null or a.track<>'transcription' or a.status not in ('draft','changes_requested') then raise exception 'APPLICATION_NOT_SUBMITTABLE'; end if;
  if length(trim(coalesce(p_text,'')))<25 or length(p_text)>12000 then raise exception 'INVALID_TRANSCRIPT_LENGTH'; end if;
  select * into u from public.users where id=auth.uid();
  update app_private.contributor_applications set status='pending',submission=jsonb_build_object('text',trim(p_text),'meta',coalesce(p_meta,'{}'::jsonb)),profile_snapshot=jsonb_build_object('full_name',u."fullName",'email',u.email,'country_iso2',u.phone_country_iso2,'education',u.education,'occupation',u.occupation),submitted_at=now(),reviewed_at=null,reviewed_by=null,reviewer_note=null,updated_at=now() where id=a.id;
  update app_private.contributor_operations_profile set application_state='applicant',updated_at=now() where user_id=auth.uid();
  return public.get_my_application_onboarding();
end $$;

create or replace function public.get_my_application_summary()
returns jsonb language sql stable security definer
set search_path=public,app_private,pg_temp
as $$
  select jsonb_build_object('applications',coalesce(jsonb_agg(jsonb_build_object('id',a.id,'track',a.track,'language_code',a.language_code,'language_label',a.language_label,'status',a.status,'submitted_at',a.submitted_at,'reviewed_at',a.reviewed_at,'reviewer_note',a.reviewer_note) order by a.created_at) filter(where a.id is not null),'[]'::jsonb),'pending_count',count(*) filter(where a.status in ('pending','under_review')),'action_count',count(*) filter(where a.status in ('draft','changes_requested'))) from app_private.contributor_applications a where a.user_id=auth.uid();
$$;

create or replace function public.admin_application_queue_v2(p_status text default null,p_track text default null,p_language text default null,p_query text default null)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
begin
  if not app_private.can_review_applications() then raise exception 'APPLICATION_REVIEW_REQUIRED'; end if;
  return coalesce((select jsonb_agg(row_to_json(q) order by q.submitted_at desc nulls last,q.created_at desc) from (select a.id,a.user_id,u.email,u."fullName" as name,u."uniqueID" as uid,a.track,a.language_code,a.language_label,a.status,a.submitted_at,a.reviewed_at,a.reviewer_note,a.equipment,a.created_at,case when a.track='voice_acting' then a.recording_duration_ms else length(coalesce(a.submission->>'text','')) end as sample_size from app_private.contributor_applications a join public.users u on u.id=a.user_id where (p_status is null or p_status='' or a.status=p_status) and (p_track is null or p_track='' or a.track=p_track) and (p_language is null or p_language='' or a.language_code=p_language) and (p_query is null or trim(p_query)='' or lower(coalesce(u.email,'')||' '||coalesce(u."fullName",'')||' '||coalesce(u."uniqueID",'')) like '%'||lower(trim(p_query))||'%')) q),'[]'::jsonb);
end $$;

create or replace function public.admin_application_detail(p_application_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare a app_private.contributor_applications%rowtype; u public.users%rowtype; c app_private.application_assessment_content%rowtype;
begin
  if not app_private.can_review_applications() then raise exception 'APPLICATION_REVIEW_REQUIRED'; end if;
  select * into a from app_private.contributor_applications where id=p_application_id; if a.id is null then raise exception 'NOT_FOUND'; end if;
  select * into u from public.users where id=a.user_id; select * into c from app_private.application_assessment_content where track=a.track and language_code=a.language_code;
  return jsonb_build_object('application',to_jsonb(a),'profile',jsonb_build_object('id',u.id,'email',u.email,'name',u."fullName",'uid',u."uniqueID",'dob',u."Date of Birth",'education',u.education,'occupation',u.occupation,'country_iso2',u.phone_country_iso2,'phone_e164',u.phone_e164),'assessment',jsonb_build_object('title',c.title,'instructions',c.instructions,'prompt_text',c.prompt_text,'audio_bucket',c.audio_bucket,'audio_path',c.audio_path,'config',c.config),'mapped_project',(select jsonb_build_object('project_id',m.project_id,'project_name',p.project_name) from app_private.application_project_map m join public.project_lab p on p.id=m.project_id where m.track=a.track and m.language_code=a.language_code and m.active));
end $$;

create or replace function public.admin_set_application_decision(p_application_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare a app_private.contributor_applications%rowtype; mapped integer;
begin
  if not app_private.can_review_applications() then raise exception 'APPLICATION_REVIEW_REQUIRED'; end if;
  if p_status not in ('under_review','changes_requested','approved','rejected') then raise exception 'INVALID_STATUS'; end if;
  select * into a from app_private.contributor_applications where id=p_application_id; if a.id is null then raise exception 'NOT_FOUND'; end if;
  update app_private.contributor_applications set status=p_status,reviewed_by=auth.uid(),reviewed_at=case when p_status in ('approved','rejected','changes_requested') then now() else reviewed_at end,reviewer_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=a.id;
  if p_status='approved' then
    select project_id into mapped from app_private.application_project_map where track=a.track and language_code=a.language_code and active;
    if mapped is not null then insert into public.project_access_controls(user_id,project_id,access_status,updated_by,updated_at) values(a.user_id,mapped,'active',auth.uid(),now()) on conflict(user_id,project_id) do update set access_status='active',updated_by=excluded.updated_by,updated_at=now(); end if;
    update app_private.contributor_operations_profile set application_state='active',updated_at=now() where user_id=a.user_id;
  elsif p_status='rejected' and not exists(select 1 from app_private.contributor_applications x where x.user_id=a.user_id and x.id<>a.id and x.status in ('pending','under_review','approved')) then
    update app_private.contributor_operations_profile set application_state='rejected',updated_at=now() where user_id=a.user_id;
  end if;
  return public.admin_application_detail(a.id);
end $$;

create or replace function public.admin_upsert_application_assessment(p_track text,p_language_code text,p_language_label text,p_title text,p_instructions text,p_prompt_text text default null,p_audio_bucket text default null,p_audio_path text default null,p_config jsonb default '{}'::jsonb,p_active boolean default true)
returns jsonb language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare r app_private.application_assessment_content%rowtype;
begin
  if not app_private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_track not in ('voice_acting','transcription') then raise exception 'INVALID_TRACK'; end if;
  insert into app_private.application_assessment_content(track,language_code,language_label,title,instructions,prompt_text,audio_bucket,audio_path,config,active,updated_by) values(p_track,p_language_code,p_language_label,p_title,p_instructions,p_prompt_text,p_audio_bucket,p_audio_path,coalesce(p_config,'{}'::jsonb),p_active,auth.uid())
  on conflict(track,language_code) do update set language_label=excluded.language_label,title=excluded.title,instructions=excluded.instructions,prompt_text=excluded.prompt_text,audio_bucket=excluded.audio_bucket,audio_path=excluded.audio_path,config=excluded.config,active=excluded.active,updated_by=auth.uid(),updated_at=now() returning * into r;
  return to_jsonb(r);
end $$;

-- Notify contributors as their review state changes.
create or replace function app_private.notify_application_status_change()
returns trigger language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare v_title text; v_body text; v_track text;
begin
  if new.status is not distinct from old.status or new.status not in ('under_review','changes_requested','approved','rejected') then return new; end if;
  v_track:=case when new.track='voice_acting' then 'Voice Acting' else 'Transcription' end;
  v_title:=case new.status when 'under_review' then v_track||' application is under review' when 'changes_requested' then 'Changes requested for your '||v_track||' application' when 'approved' then v_track||' application approved' when 'rejected' then v_track||' application reviewed' end;
  v_body:=case new.status when 'under_review' then 'Our team has started reviewing your '||new.language_label||' assessment.' when 'changes_requested' then coalesce(nullif(trim(new.reviewer_note),''),'Please open your application and submit the requested changes.') when 'approved' then 'Your '||new.language_label||' assessment was approved. Any mapped project access is now available in your Workspace.' when 'rejected' then coalesce(nullif(trim(new.reviewer_note),''),'Your application was not approved at this time.') end;
  insert into public.user_notifications(user_id,type,title,body,link,metadata) values(new.user_id,'application',v_title,v_body,'/apply',jsonb_build_object('application_id',new.id,'track',new.track,'language_code',new.language_code,'status',new.status));
  return new;
end $$;
drop trigger if exists contributor_application_status_notification on app_private.contributor_applications;
create trigger contributor_application_status_notification after update of status on app_private.contributor_applications for each row execute function app_private.notify_application_status_change();

-- Default Postgres function grants include PUBLIC; explicitly close every new RPC to anonymous callers.
revoke all on function public.get_application_catalog() from public,anon;
revoke all on function public.get_my_application_onboarding() from public,anon;
revoke all on function public.application_choose_tracks(text,text,text[]) from public,anon;
revoke all on function public.get_my_application_assessment(uuid) from public,anon;
revoke all on function public.submit_voice_application(uuid,text,text,jsonb,integer) from public,anon;
revoke all on function public.submit_transcription_application(uuid,text,jsonb) from public,anon;
revoke all on function public.get_my_application_summary() from public,anon;
revoke all on function public.admin_application_queue_v2(text,text,text,text) from public,anon;
revoke all on function public.admin_application_detail(uuid) from public,anon;
revoke all on function public.admin_set_application_decision(uuid,text,text) from public,anon;
revoke all on function public.admin_upsert_application_assessment(text,text,text,text,text,text,text,text,jsonb,boolean) from public,anon;
grant execute on function public.get_application_catalog() to authenticated;
grant execute on function public.get_my_application_onboarding() to authenticated;
grant execute on function public.application_choose_tracks(text,text,text[]) to authenticated;
grant execute on function public.get_my_application_assessment(uuid) to authenticated;
grant execute on function public.submit_voice_application(uuid,text,text,jsonb,integer) to authenticated;
grant execute on function public.submit_transcription_application(uuid,text,jsonb) to authenticated;
grant execute on function public.get_my_application_summary() to authenticated;
grant execute on function public.admin_application_queue_v2(text,text,text,text) to authenticated;
grant execute on function public.admin_application_detail(uuid) to authenticated;
grant execute on function public.admin_set_application_decision(uuid,text,text) to authenticated;
grant execute on function public.admin_upsert_application_assessment(text,text,text,text,text,text,text,text,jsonb,boolean) to authenticated;
