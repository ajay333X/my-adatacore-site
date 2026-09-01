create table if not exists public.transcription_client_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.transcription_audio_items(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint transcription_client_shares_token_hash_chk check (token_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists transcription_client_shares_item_idx on public.transcription_client_shares(item_id,active,expires_at desc);

create table if not exists public.transcription_client_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.transcription_client_shares(id) on delete cascade,
  timestamp_ms integer not null default 0,
  author_name text not null,
  note text not null,
  created_at timestamptz not null default now(),
  constraint transcription_client_comments_time_chk check (timestamp_ms >= 0 and timestamp_ms <= 14400000),
  constraint transcription_client_comments_author_chk check (char_length(author_name) between 1 and 100),
  constraint transcription_client_comments_note_chk check (char_length(note) between 1 and 2000)
);
create index if not exists transcription_client_comments_share_idx on public.transcription_client_comments(share_id,created_at);

create table if not exists public.transcription_client_ratings (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.transcription_client_shares(id) on delete cascade,
  reviewer_name text,
  clarity_rating smallint not null,
  created_at timestamptz not null default now(),
  constraint transcription_client_ratings_rating_chk check (clarity_rating between 1 and 5),
  constraint transcription_client_ratings_name_chk check (reviewer_name is null or char_length(reviewer_name) <= 100)
);
create index if not exists transcription_client_ratings_share_idx on public.transcription_client_ratings(share_id,created_at);

alter table public.transcription_client_shares enable row level security;
alter table public.transcription_client_comments enable row level security;
alter table public.transcription_client_ratings enable row level security;
revoke all on public.transcription_client_shares from public,anon,authenticated;
revoke all on public.transcription_client_comments from public,anon,authenticated;
revoke all on public.transcription_client_ratings from public,anon,authenticated;

create or replace function public.tx_admin_create_client_share(p_item uuid,p_token_hash text,p_expires_days integer default 30)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare s public.transcription_client_shares; days integer:=greatest(1,least(coalesce(p_expires_days,30),90));
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid share token'; end if;
  if not exists(select 1 from public.transcription_audio_items a where a.id=p_item and a.submitted_at is not null and a.status in ('submitted','in_review','approved','changes_requested')) then raise exception 'A submitted transcription is required'; end if;
  update public.transcription_client_shares set active=false where item_id=p_item and active=true;
  insert into public.transcription_client_shares(item_id,token_hash,active,expires_at,created_by)
  values(p_item,p_token_hash,true,now()+(days||' days')::interval,auth.uid()) returning * into s;
  return jsonb_build_object('share_id',s.id,'item_id',s.item_id,'expires_at',s.expires_at,'active',s.active);
end $$;

create or replace function public.tx_admin_client_feedback(p_item uuid)
returns jsonb language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare share_ids uuid[]; comments jsonb; ratings jsonb; avg_rating numeric;
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.transcription_audio_items where id=p_item) then raise exception 'Transcription item not found'; end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into share_ids from public.transcription_client_shares where item_id=p_item;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'timestamp_ms',c.timestamp_ms,'author_name',c.author_name,'note',c.note,'created_at',c.created_at) order by c.timestamp_ms,c.created_at),'[]'::jsonb) into comments from public.transcription_client_comments c where c.share_id=any(share_ids);
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reviewer_name',r.reviewer_name,'clarity_rating',r.clarity_rating,'created_at',r.created_at) order by r.created_at),'[]'::jsonb),round(avg(r.clarity_rating)::numeric,2) into ratings,avg_rating from public.transcription_client_ratings r where r.share_id=any(share_ids);
  return jsonb_build_object('comments',comments,'ratings',ratings,'average_clarity',avg_rating,'comment_count',jsonb_array_length(comments),'rating_count',jsonb_array_length(ratings));
end $$;

revoke all on function public.tx_admin_create_client_share(uuid,text,integer) from public,anon;
revoke all on function public.tx_admin_client_feedback(uuid) from public,anon;
grant execute on function public.tx_admin_create_client_share(uuid,text,integer) to authenticated;
grant execute on function public.tx_admin_client_feedback(uuid) to authenticated;
