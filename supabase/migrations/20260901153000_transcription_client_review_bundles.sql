create table if not exists public.transcription_client_bundles (
  id uuid primary key default gen_random_uuid(),
  transcription_project_id integer not null references public.project_lab(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  title text,
  active boolean not null default true,
  expires_at timestamptz not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transcription_client_bundle_items (
  bundle_id uuid not null references public.transcription_client_bundles(id) on delete cascade,
  item_id uuid not null references public.transcription_audio_items(id) on delete cascade,
  share_id uuid not null references public.transcription_client_shares(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (bundle_id,item_id),
  unique (bundle_id,position)
);

create index if not exists transcription_client_bundle_items_bundle_position_idx on public.transcription_client_bundle_items(bundle_id,position);
alter table public.transcription_client_bundles enable row level security;
alter table public.transcription_client_bundle_items enable row level security;
revoke all on public.transcription_client_bundles from public,anon,authenticated;
revoke all on public.transcription_client_bundle_items from public,anon,authenticated;

create or replace function public.tx_admin_create_client_bundle(p_project integer,p_items uuid[],p_token_hash text,p_expires_days integer default 30,p_title text default null)
returns jsonb language plpgsql security definer set search_path='public','app_private','extensions','pg_temp' as $$
declare v_bundle public.transcription_client_bundles;v_item uuid;v_share public.transcription_client_shares;v_hash text;v_days integer:=greatest(1,least(coalesce(p_expires_days,30),90));v_count integer;v_pos integer:=0;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid share token'; end if;
 if p_items is null or array_length(p_items,1) is null or array_length(p_items,1)<1 or array_length(p_items,1)>50 then raise exception 'Select 1 to 50 submitted tasks'; end if;
 if not exists(select 1 from public.project_lab where id=p_project and project_type='transcription') then raise exception 'Transcription project not found'; end if;
 select count(distinct a.id) into v_count from public.transcription_audio_items a where a.id=any(p_items) and a.transcription_project_id=p_project and a.submitted_at is not null and a.status in ('submitted','in_review','approved','changes_requested');
 if v_count<>(select count(distinct x) from unnest(p_items) x) then raise exception 'Every selected item must be a submitted task from this project'; end if;
 insert into public.transcription_client_bundles(transcription_project_id,token_hash,title,active,expires_at,created_by) values(p_project,p_token_hash,left(nullif(trim(coalesce(p_title,'')),''),160),true,now()+(v_days||' days')::interval,auth.uid()) returning * into v_bundle;
 foreach v_item in array p_items loop
  if exists(select 1 from public.transcription_client_bundle_items where bundle_id=v_bundle.id and item_id=v_item) then continue; end if;
  v_pos:=v_pos+1;v_hash:=encode(digest(p_token_hash||':'||v_item::text,'sha256'),'hex');
  insert into public.transcription_client_shares(item_id,token_hash,active,expires_at,created_by) values(v_item,v_hash,true,v_bundle.expires_at,auth.uid()) returning * into v_share;
  insert into public.transcription_client_bundle_items(bundle_id,item_id,share_id,position) values(v_bundle.id,v_item,v_share.id,v_pos);
 end loop;
 return jsonb_build_object('bundle_id',v_bundle.id,'project_id',p_project,'count',v_pos,'expires_at',v_bundle.expires_at,'active',true);
end $$;
revoke all on function public.tx_admin_create_client_bundle(integer,uuid[],text,integer,text) from public,anon;
grant execute on function public.tx_admin_create_client_bundle(integer,uuid[],text,integer,text) to authenticated;
