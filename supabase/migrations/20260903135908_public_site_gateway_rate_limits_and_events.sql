create table if not exists app_private.public_inquiry_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  last_seen_at timestamptz not null default now()
);

create table if not exists app_private.public_site_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  page_path text not null default '/',
  referrer_host text,
  session_hash text,
  created_at timestamptz not null default now()
);
create index if not exists public_site_events_created_at_idx on app_private.public_site_events(created_at desc);
create index if not exists public_site_events_event_name_idx on app_private.public_site_events(event_name, created_at desc);

create or replace function public.public_inquiry_rate_limit_hit(
  p_key_hash text,
  p_limit integer default 4,
  p_window_seconds integer default 3600
) returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_count integer;
  v_started timestamptz;
  v_now timestamptz := now();
  v_window interval;
begin
  if p_key_hash is null or length(p_key_hash) < 16 then raise exception 'INVALID_RATE_KEY'; end if;
  if p_limit < 1 or p_limit > 100 or p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'INVALID_RATE_CONFIG'; end if;
  v_window := make_interval(secs => p_window_seconds);

  insert into app_private.public_inquiry_rate_limits(key_hash, window_started_at, request_count, last_seen_at)
  values (p_key_hash, v_now, 1, v_now)
  on conflict (key_hash) do update
    set request_count = case when excluded.last_seen_at - app_private.public_inquiry_rate_limits.window_started_at >= v_window then 1 else app_private.public_inquiry_rate_limits.request_count + 1 end,
        window_started_at = case when excluded.last_seen_at - app_private.public_inquiry_rate_limits.window_started_at >= v_window then excluded.last_seen_at else app_private.public_inquiry_rate_limits.window_started_at end,
        last_seen_at = excluded.last_seen_at
  returning request_count, window_started_at into v_count, v_started;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'retry_after_seconds', greatest(0, ceil(extract(epoch from ((v_started + v_window) - v_now)))::integer)
  );
end;
$$;

create or replace function public.public_log_site_event(
  p_event_name text,
  p_page_path text default '/',
  p_referrer_host text default null,
  p_session_hash text default null
) returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if p_event_name not in ('page_view','project_inquiry_open','project_inquiry_submit_success','project_inquiry_submit_error','contributor_cta','teams_cta','trust_cta','help_cta') then raise exception 'INVALID_EVENT_NAME'; end if;
  insert into app_private.public_site_events(event_name, page_path, referrer_host, session_hash)
  values (left(p_event_name,80), left(coalesce(nullif(trim(p_page_path),''),'/'),240), nullif(left(coalesce(p_referrer_host,''),180),''), nullif(left(coalesce(p_session_hash,''),128),''));
end;
$$;

revoke all on function public.public_inquiry_rate_limit_hit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.public_log_site_event(text,text,text,text) from public, anon, authenticated;
grant execute on function public.public_inquiry_rate_limit_hit(text,integer,integer) to service_role;
grant execute on function public.public_log_site_event(text,text,text,text) to service_role;
