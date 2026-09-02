create or replace function public.admin_trust_safety_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
as $$
declare
  v_profile jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_networks jsonb := '[]'::jsonb;
  v_devices jsonb := '[]'::jsonb;
  v_signals jsonb := '[]'::jsonb;
  v_total_sessions integer := 0;
  v_sessions_30d integer := 0;
  v_ips_30d integer := 0;
  v_devices_30d integer := 0;
  v_ips_24h integer := 0;
  v_devices_7d integer := 0;
  v_shared_accounts integer := 0;
  v_rapid_ips_2h integer := 0;
  v_recent_active_ips integer := 0;
  v_latest_ip text;
  v_latest_ua text;
  v_latest_session_created timestamptz;
  v_last_active_at timestamptz;
  v_last_sign_in_at timestamptz;
  v_latest_ip_prior_count integer := 0;
  v_latest_ua_prior_count integer := 0;
  v_attention text := 'normal';
  v_banned_until timestamptz;
  v_account_status text;
  v_email_confirmed boolean := false;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_staff_roles r
    join public.users me on me.id=r.user_id
    where r.user_id=auth.uid()
      and r.active=true
      and r.role='super_admin'
      and me."accountStatus"='active'
  ) then
    raise exception 'Super Admin access required';
  end if;

  select jsonb_build_object(
      'id',u.id,
      'full_name',u."fullName",
      'email',u.email,
      'uid',u."uniqueID",
      'account_status',u."accountStatus",
      'last_online',u."lastOnline",
      'legacy_role',u.role,
      'account_created_at',au.created_at,
      'last_sign_in_at',au.last_sign_in_at,
      'email_confirmed_at',au.email_confirmed_at,
      'email_confirmed',au.email_confirmed_at is not null,
      'banned_until',au.banned_until,
      'is_sso_user',coalesce(au.is_sso_user,false),
      'providers',coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id=u.id),'[]'::jsonb),
      'staff_roles',coalesce((select jsonb_agg(jsonb_build_object('role',sr.role,'project_id',sr.project_id) order by sr.role,sr.project_id nulls first) from public.admin_staff_roles sr where sr.user_id=u.id and sr.active=true),'[]'::jsonb)
    ), u."accountStatus", au.banned_until, (au.email_confirmed_at is not null), au.last_sign_in_at
  into v_profile, v_account_status, v_banned_until, v_email_confirmed, v_last_sign_in_at
  from public.users u
  left join auth.users au on au.id=u.id
  where u.id=p_user_id;

  if v_profile is null then
    raise exception 'Participant not found';
  end if;

  select count(*)::int,
         count(*) filter(where created_at >= now()-interval '30 days')::int,
         count(distinct ip) filter(where created_at >= now()-interval '30 days' and ip is not null)::int,
         count(distinct user_agent) filter(where created_at >= now()-interval '30 days' and nullif(user_agent,'') is not null)::int,
         count(distinct ip) filter(where created_at >= now()-interval '24 hours' and ip is not null)::int,
         count(distinct user_agent) filter(where created_at >= now()-interval '7 days' and nullif(user_agent,'') is not null)::int,
         max(coalesce(updated_at,created_at))
  into v_total_sessions, v_sessions_30d, v_ips_30d, v_devices_30d, v_ips_24h, v_devices_7d, v_last_active_at
  from auth.sessions
  where user_id=p_user_id;

  select s.ip::text, nullif(s.user_agent,''), s.created_at
  into v_latest_ip, v_latest_ua, v_latest_session_created
  from auth.sessions s
  where s.user_id=p_user_id
  order by s.created_at desc
  limit 1;

  if v_latest_ip is not null then
    select count(*)::int into v_latest_ip_prior_count
    from auth.sessions s
    where s.user_id=p_user_id
      and s.ip::text=v_latest_ip
      and s.created_at < coalesce(v_latest_session_created,now())-interval '1 second';
  end if;

  if v_latest_ua is not null then
    select count(*)::int into v_latest_ua_prior_count
    from auth.sessions s
    where s.user_id=p_user_id
      and s.user_agent=v_latest_ua
      and s.created_at < coalesce(v_latest_session_created,now())-interval '1 second';
  end if;

  with my_ips as (
    select distinct ip
    from auth.sessions
    where user_id=p_user_id
      and created_at >= now()-interval '30 days'
      and ip is not null
  )
  select count(distinct s.user_id)::int
  into v_shared_accounts
  from auth.sessions s
  join my_ips m on m.ip=s.ip
  where s.user_id<>p_user_id
    and s.created_at >= now()-interval '30 days';

  select count(distinct ip)::int
  into v_rapid_ips_2h
  from auth.sessions
  where user_id=p_user_id
    and created_at >= now()-interval '2 hours'
    and ip is not null;

  select count(distinct ip)::int
  into v_recent_active_ips
  from auth.sessions
  where user_id=p_user_id
    and coalesce(updated_at,created_at) >= now()-interval '30 minutes'
    and ip is not null;

  if v_account_status is distinct from 'active' then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','high','code','account_not_active','title','Account is not active','detail','Platform account status is '||coalesce(v_account_status,'unknown')||'.'));
  end if;
  if v_banned_until is not null and v_banned_until > now() then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','high','code','auth_banned','title','Authentication ban is active','detail','Supabase Auth has a current banned-until value.'));
  end if;
  if not v_email_confirmed then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','medium','code','email_unconfirmed','title','Email is not confirmed','detail','The authentication email has not been confirmed.'));
  end if;
  if v_ips_24h >= 4 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','medium','code','many_networks_24h','title','Several networks used recently','detail',v_ips_24h||' distinct IP addresses were used to create sessions in the last 24 hours. VPNs and mobile networks can cause this.'));
  end if;
  if v_rapid_ips_2h >= 3 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','medium','code','rapid_network_change','title','Rapid network changes','detail',v_rapid_ips_2h||' distinct IP addresses created sessions in the last 2 hours. Review alongside location and ISP information.'));
  end if;
  if v_recent_active_ips >= 2 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','info','code','multiple_recent_networks','title','Multiple networks active recently','detail',v_recent_active_ips||' distinct session IPs had activity or refreshes in the last 30 minutes. This may represent multiple devices, VPN changes or stale sessions.'));
  end if;
  if v_devices_7d >= 4 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','medium','code','many_devices_7d','title','Several device/browser signatures','detail',v_devices_7d||' distinct browser user-agent signatures created sessions in the last 7 days.'));
  end if;
  if v_shared_accounts >= 3 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','medium','code','shared_network','title','Network shared by multiple accounts','detail',v_shared_accounts||' other accounts used at least one exact IP also used by this account in the last 30 days. Shared Wi-Fi, offices, colleges, families, mobile carriers and VPNs can legitimately cause this.'));
  elsif v_shared_accounts > 0 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','info','code','shared_network','title','Shared network match','detail',v_shared_accounts||' other account'||case when v_shared_accounts=1 then '' else 's' end||' used an exact IP also seen on this account in the last 30 days. This is a correlation signal only.'));
  end if;
  if v_latest_ip is not null and v_latest_ip_prior_count=0 and v_total_sessions>1 and v_latest_session_created >= now()-interval '7 days' then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','info','code','new_network','title','New network on latest sign-in','detail','The IP used for the newest retained session was not used by an older retained session for this account.'));
  end if;
  if v_latest_ua is not null and v_latest_ua_prior_count=0 and v_total_sessions>1 and v_latest_session_created >= now()-interval '7 days' then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('severity','info','code','new_device','title','New device/browser signature','detail','The newest retained session used a browser user-agent signature not seen on an older retained session for this account.'));
  end if;

  if exists(select 1 from jsonb_array_elements(v_signals) e where e->>'severity'='high') then
    v_attention := 'elevated';
  elsif exists(select 1 from jsonb_array_elements(v_signals) e where e->>'severity'='medium') then
    v_attention := 'review';
  end if;

  select coalesce(jsonb_agg(row_data order by sort_at desc),'[]'::jsonb)
  into v_sessions
  from (
    select
      s.created_at as sort_at,
      jsonb_build_object(
        'id',s.id,
        'login_at',s.created_at,
        'last_active_at',coalesce(s.updated_at,s.created_at),
        'refreshed_at',s.refreshed_at,
        'not_after',s.not_after,
        'ip',s.ip::text,
        'user_agent',s.user_agent,
        'aal',s.aal::text,
        'recently_active',coalesce(s.updated_at,s.created_at) >= now()-interval '15 minutes',
        'shared_account_count',(
          select count(distinct x.user_id)::int
          from auth.sessions x
          where x.user_id<>p_user_id
            and x.ip=s.ip
            and s.ip is not null
            and x.created_at >= now()-interval '30 days'
        ),
        'shared_accounts',coalesce((
          select jsonb_agg(jsonb_build_object('id',z.id,'full_name',z."fullName",'email',z.email,'uid',z."uniqueID"))
          from (
            select distinct u2.id,u2."fullName",u2.email,u2."uniqueID"
            from auth.sessions x
            join public.users u2 on u2.id=x.user_id
            where x.user_id<>p_user_id
              and x.ip=s.ip
              and s.ip is not null
              and x.created_at >= now()-interval '30 days'
            order by u2."fullName" nulls last,u2.email
            limit 8
          ) z
        ),'[]'::jsonb)
      ) as row_data
    from auth.sessions s
    where s.user_id=p_user_id
    order by s.created_at desc
    limit 30
  ) q;

  with n as (
    select s.ip,
           min(s.created_at) as first_seen,
           max(s.created_at) as latest_login_at,
           max(coalesce(s.updated_at,s.created_at)) as last_active_at,
           count(*)::int as session_count,
           count(distinct nullif(s.user_agent,''))::int as device_count
    from auth.sessions s
    where s.user_id=p_user_id and s.ip is not null
    group by s.ip
    order by max(coalesce(s.updated_at,s.created_at)) desc
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ip',n.ip::text,
    'first_seen',n.first_seen,
    'latest_login_at',n.latest_login_at,
    'last_active_at',n.last_active_at,
    'session_count',n.session_count,
    'device_count',n.device_count,
    'is_latest',n.ip::text=v_latest_ip,
    'shared_account_count',(
      select count(distinct x.user_id)::int from auth.sessions x
      where x.user_id<>p_user_id and x.ip=n.ip and x.created_at >= now()-interval '30 days'
    ),
    'shared_accounts',coalesce((
      select jsonb_agg(jsonb_build_object('id',z.id,'full_name',z."fullName",'email',z.email,'uid',z."uniqueID"))
      from (
        select distinct u2.id,u2."fullName",u2.email,u2."uniqueID"
        from auth.sessions x
        join public.users u2 on u2.id=x.user_id
        where x.user_id<>p_user_id and x.ip=n.ip and x.created_at >= now()-interval '30 days'
        order by u2."fullName" nulls last,u2.email
        limit 8
      ) z
    ),'[]'::jsonb)
  ) order by n.last_active_at desc),'[]'::jsonb)
  into v_networks
  from n;

  with d as (
    select s.user_agent,
           min(s.created_at) as first_seen,
           max(s.created_at) as latest_login_at,
           max(coalesce(s.updated_at,s.created_at)) as last_active_at,
           count(*)::int as session_count,
           count(distinct s.ip)::int as network_count,
           (array_agg(s.ip::text order by coalesce(s.updated_at,s.created_at) desc) filter(where s.ip is not null))[1] as latest_ip
    from auth.sessions s
    where s.user_id=p_user_id and nullif(s.user_agent,'') is not null
    group by s.user_agent
    order by max(coalesce(s.updated_at,s.created_at)) desc
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_agent',d.user_agent,
    'first_seen',d.first_seen,
    'latest_login_at',d.latest_login_at,
    'last_active_at',d.last_active_at,
    'session_count',d.session_count,
    'network_count',d.network_count,
    'latest_ip',d.latest_ip,
    'is_latest',d.user_agent=v_latest_ua
  ) order by d.last_active_at desc),'[]'::jsonb)
  into v_devices
  from d;

  insert into app_private.platform_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'trust_safety.view','user',p_user_id::text,jsonb_build_object('attention_level',v_attention));

  return jsonb_build_object(
    'profile',v_profile || jsonb_build_object(
      'effective_last_sign_in_at',coalesce(v_last_sign_in_at,v_latest_session_created),
      'latest_session_created_at',v_latest_session_created,
      'last_active_at',v_last_active_at,
      'recently_active',v_last_active_at >= now()-interval '15 minutes'
    ),
    'attention_level',v_attention,
    'signals',v_signals,
    'metrics',jsonb_build_object(
      'total_sessions',v_total_sessions,
      'sessions_30d',v_sessions_30d,
      'distinct_ips_30d',v_ips_30d,
      'distinct_devices_30d',v_devices_30d,
      'distinct_ips_24h',v_ips_24h,
      'distinct_devices_7d',v_devices_7d,
      'shared_accounts_30d',v_shared_accounts,
      'rapid_ips_2h',v_rapid_ips_2h,
      'recent_active_ips_30m',v_recent_active_ips,
      'latest_session_at',v_latest_session_created,
      'last_active_at',v_last_active_at
    ),
    'sessions',v_sessions,
    'networks',v_networks,
    'devices',v_devices,
    'location',jsonb_build_object('status','available_on_demand','message','Approximate IP geolocation is loaded on demand for Super Admin review. IP location is approximate and can reflect a VPN, carrier gateway or ISP routing point.'),
    'disclaimer','Network, device and GeoIP signals are correlations, not proof of account sharing or abuse. Shared Wi-Fi, workplaces, colleges, families, mobile carriers, VPNs and inaccurate IP geolocation can produce legitimate matches.'
  );
end;
$$;

create or replace function public.admin_trust_safety_search(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
as $$
declare
  v_q text := lower(trim(coalesce(p_query,'')));
  v_limit integer := greatest(1,least(coalesce(p_limit,20),50));
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_staff_roles r
    join public.users me on me.id=r.user_id
    where r.user_id=auth.uid() and r.active=true and r.role='super_admin' and me."accountStatus"='active'
  ) then raise exception 'Super Admin access required'; end if;
  if length(v_q)<2 then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank_key,x.full_name nulls last,x.email),'[]'::jsonb)
  into v_result
  from (
    select u.id,u."fullName" as full_name,u.email,u."uniqueID" as uid,u."accountStatus" as account_status,
      au.created_at as account_created_at,au.last_sign_in_at,
      greatest(coalesce(au.last_sign_in_at,'epoch'::timestamptz),coalesce((select max(coalesce(s.updated_at,s.created_at)) from auth.sessions s where s.user_id=u.id),'epoch'::timestamptz)) as last_activity_at,
      au.email_confirmed_at is not null as email_confirmed,
      (select count(*) from auth.sessions s where s.user_id=u.id and s.created_at>=now()-interval '30 days')::int as sessions_30d,
      (select count(distinct s.ip) from auth.sessions s where s.user_id=u.id and s.created_at>=now()-interval '30 days' and s.ip is not null)::int as ips_30d,
      case when lower(coalesce(u.email,''))=v_q or lower(coalesce(u."uniqueID",''))=v_q then 0
           when lower(coalesce(u."fullName",'')) like v_q||'%' then 1
           when lower(coalesce(u.email,'')) like v_q||'%' then 2 else 3 end as rank_key
    from public.users u
    left join auth.users au on au.id=u.id
    where lower(coalesce(u."fullName",'')) like '%'||v_q||'%'
       or lower(coalesce(u.email,'')) like '%'||v_q||'%'
       or lower(coalesce(u."uniqueID",'')) like '%'||v_q||'%'
    order by rank_key,u."fullName" nulls last,u.email
    limit v_limit
  ) x;
  return v_result;
end;
$$;

create or replace function public.my_security_activity()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_rows jsonb;
  v_last_sign_in timestamptz;
  v_last_active timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select last_sign_in_at into v_last_sign_in from auth.users where id=auth.uid();
  select max(coalesce(updated_at,created_at)) into v_last_active from auth.sessions where user_id=auth.uid();

  select coalesce(jsonb_agg(x.row_data order by x.sort_at desc),'[]'::jsonb)
  into v_rows
  from (
    select s.created_at sort_at,
      jsonb_build_object(
        'login_at',s.created_at,
        'last_active_at',coalesce(s.updated_at,s.created_at),
        'recently_active',coalesce(s.updated_at,s.created_at)>=now()-interval '15 minutes',
        'ip_masked',case
          when s.ip is null then null
          when family(s.ip)=4 then split_part(s.ip::text,'.',1)||'.'||split_part(s.ip::text,'.',2)||'.'||split_part(s.ip::text,'.',3)||'.xxx'
          else regexp_replace(s.ip::text,'([0-9a-fA-F:]{1,})$','…') end,
        'user_agent',s.user_agent,
        'aal',s.aal::text
      ) row_data
    from auth.sessions s where s.user_id=auth.uid()
    order by s.created_at desc limit 8
  ) x;
  return jsonb_build_object('last_sign_in_at',v_last_sign_in,'last_active_at',v_last_active,'sessions',v_rows);
end;
$$;

revoke all on function public.admin_trust_safety_profile(uuid) from public;
revoke all on function public.admin_trust_safety_search(text,integer) from public;
revoke all on function public.my_security_activity() from public;
grant execute on function public.admin_trust_safety_profile(uuid) to authenticated;
grant execute on function public.admin_trust_safety_search(text,integer) to authenticated;
grant execute on function public.my_security_activity() to authenticated;
