alter table public.transcription_audio_items
  add column if not exists upload_group_id uuid,
  add column if not exists source_original_name text,
  add column if not exists source_chunk_index integer,
  add column if not exists source_chunk_count integer,
  add column if not exists source_start_ms integer,
  add column if not exists source_end_ms integer,
  add column if not exists source_split_mode text;

create index if not exists transcription_audio_items_upload_group_idx
  on public.transcription_audio_items(upload_group_id)
  where upload_group_id is not null;

create or replace function public.tx_register_split_upload(
  p_project_id integer,
  p_path text,
  p_name text,
  p_folder text,
  p_duration_ms integer,
  p_upload_group_id uuid,
  p_original_name text,
  p_chunk_index integer,
  p_chunk_count integer,
  p_start_ms integer,
  p_end_ms integer,
  p_split_mode text default 'pause_aware'
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare aid uuid;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id and project_type='transcription' and lifecycle_status='active') then raise exception 'Choose an active transcription project'; end if;
 if split_part(p_path,'/',1)<>p_project_id::text or not exists(select 1 from storage.objects where bucket_id='transcription_audio' and name=p_path) then raise exception 'Upload the audio before registering it'; end if;
 if p_duration_ms is null or p_duration_ms not between 250 and 900000 then raise exception 'Split chunks must be between 0.25 seconds and 15 minutes'; end if;
 if p_upload_group_id is null then raise exception 'Upload group is required'; end if;
 if p_chunk_index is null or p_chunk_count is null or p_chunk_index < 1 or p_chunk_count < 1 or p_chunk_index > p_chunk_count then raise exception 'Invalid chunk position'; end if;
 if p_start_ms is null or p_end_ms is null or p_start_ms < 0 or p_end_ms <= p_start_ms then raise exception 'Invalid chunk timestamps'; end if;
 if p_split_mode not in ('pause_aware','fixed') then raise exception 'Invalid split mode'; end if;
 insert into public.transcription_audio_items(
   transcription_project_id,storage_bucket,recording_path,display_name,source_project_title,source_folder,
   duration_seconds,duration_ms,upload_group_id,source_original_name,source_chunk_index,source_chunk_count,
   source_start_ms,source_end_ms,source_split_mode
 ) values(
   p_project_id,'transcription_audio',p_path,left(coalesce(nullif(trim(p_name),''),'Uploaded audio'),200),
   'External upload',left(coalesce(nullif(trim(p_folder),''),'Uploads'),120),ceil(p_duration_ms/1000.0),p_duration_ms,
   p_upload_group_id,left(coalesce(nullif(trim(p_original_name),''),'Long audio'),300),p_chunk_index,p_chunk_count,
   p_start_ms,p_end_ms,p_split_mode
 ) returning id into aid;
 return aid;
end
$function$;

revoke all on function public.tx_register_split_upload(integer,text,text,text,integer,uuid,text,integer,integer,integer,integer,text) from public;
grant execute on function public.tx_register_split_upload(integer,text,text,text,integer,uuid,text,integer,integer,integer,integer,text) to authenticated;

create or replace function public.tx_register_split_upload_batch(
  p_project_id integer,
  p_upload_group_id uuid,
  p_original_name text,
  p_folder text,
  p_split_mode text,
  p_chunks jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare x jsonb; aid uuid; n integer:=0; expected_count integer;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.project_lab where id=p_project_id and project_type='transcription' and lifecycle_status='active') then raise exception 'Choose an active transcription project'; end if;
 if p_upload_group_id is null then raise exception 'Upload group is required'; end if;
 if p_split_mode not in ('pause_aware','fixed') then raise exception 'Invalid split mode'; end if;
 if jsonb_typeof(p_chunks) is distinct from 'array' or jsonb_array_length(p_chunks) not between 1 and 500 then raise exception 'Split upload must contain between 1 and 500 chunks'; end if;
 expected_count:=jsonb_array_length(p_chunks);
 for x in select value from jsonb_array_elements(p_chunks) loop
   if coalesce((x->>'duration_ms')::integer,0) not between 250 and 900000 then raise exception 'Each split chunk must be between 0.25 seconds and 15 minutes'; end if;
   if coalesce((x->>'chunk_index')::integer,0) not between 1 and expected_count then raise exception 'Invalid chunk position'; end if;
   if coalesce((x->>'start_ms')::integer,-1) < 0 or coalesce((x->>'end_ms')::integer,0) <= coalesce((x->>'start_ms')::integer,-1) then raise exception 'Invalid chunk timestamps'; end if;
   if split_part(x->>'path','/',1)<>p_project_id::text or not exists(select 1 from storage.objects where bucket_id='transcription_audio' and name=x->>'path') then raise exception 'A split audio file is missing from storage'; end if;
   insert into public.transcription_audio_items(
     transcription_project_id,storage_bucket,recording_path,display_name,source_project_title,source_folder,
     duration_seconds,duration_ms,upload_group_id,source_original_name,source_chunk_index,source_chunk_count,
     source_start_ms,source_end_ms,source_split_mode
   ) values(
     p_project_id,'transcription_audio',x->>'path',left(coalesce(nullif(trim(x->>'name'),''),'Uploaded audio'),200),
     'External upload',left(coalesce(nullif(trim(p_folder),''),'Uploads'),120),ceil(((x->>'duration_ms')::integer)/1000.0),(x->>'duration_ms')::integer,
     p_upload_group_id,left(coalesce(nullif(trim(p_original_name),''),'Long audio'),300),(x->>'chunk_index')::integer,expected_count,
     (x->>'start_ms')::integer,(x->>'end_ms')::integer,p_split_mode
   ) returning id into aid;
   n:=n+1;
 end loop;
 perform app_private.log_project_activity(p_project_id,'transcription.long_audio_split','audio',p_upload_group_id::text,
   jsonb_build_object('original_name',left(coalesce(p_original_name,''),300),'chunks',n,'split_mode',p_split_mode,'folder',left(coalesce(p_folder,''),120)));
 return jsonb_build_object('registered',n,'upload_group_id',p_upload_group_id);
end
$function$;

revoke all on function public.tx_register_split_upload_batch(integer,uuid,text,text,text,jsonb) from public;
grant execute on function public.tx_register_split_upload_batch(integer,uuid,text,text,text,jsonb) to authenticated;
