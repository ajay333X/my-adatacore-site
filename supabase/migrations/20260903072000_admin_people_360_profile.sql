create or replace function public.admin_people_360(p_lookup text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','auth','pg_temp'
as $function$
declare
  v_user_id uuid;
  v_email text;
  v_uid text;
  v_base jsonb;
  v_trust jsonb;
  v_apps jsonb := '[]'::jsonb;
  v_access jsonb := '[]'::jsonb;
  v_support jsonb := '[]'::jsonb;
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

  if coalesce(trim(p_lookup),'')='' then return null; end if;

  select u.id,u.email,u."uniqueID"
  into v_user_id,v_email,v_uid
  from public.users u
  where u.id::text=trim(p_lookup)
     or (u.email is not null and lower(u.email)=lower(trim(p_lookup)))
     or (u."uniqueID" is not null and lower(u."uniqueID")=lower(trim(p_lookup)))
  order by case when u.id::text=trim(p_lookup) then 0 when u.email is not null and lower(u.email)=lower(trim(p_lookup)) then 1 else 2 end
  limit 1;

  if v_user_id is null then return null; end if;

  v_base := public.admin_get_participant_snapshot(coalesce(v_email,v_uid));
  if v_base is null then return null; end if;

  v_trust := public.admin_trust_safety_profile(v_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,
      'track',a.track,
      'language_code',a.language_code,
      'language_label',a.language_label,
      'status',a.status,
      'submitted_at',a.submitted_at,
      'reviewed_at',a.reviewed_at,
      'reviewer_note',a.reviewer_note,
      'equipment',case when a.track='voice_acting' then a.equipment else '{}'::jsonb end
    ) order by a.created_at desc),'[]'::jsonb)
  into v_apps
  from app_private.contributor_applications a
  where a.user_id=v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'project_id',p.id,
      'project_name',p.project_name,
      'project_type',p.project_type,
      'access_status',pac.access_status,
      'task_limit',pac.task_limit,
      'updated_at',pac.updated_at
    ) order by pac.updated_at desc),'[]'::jsonb)
  into v_access
  from public.project_access_controls pac
  join public.project_lab p on p.id=pac.project_id
  where pac.user_id=v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,
      'ticket_code',t.ticket_code,
      'category',t.category,
      'subject',t.subject,
      'status',t.status,
      'priority',t.priority,
      'created_at',t.created_at,
      'updated_at',t.updated_at,
      'resolved_at',t.resolved_at
    ) order by t.created_at desc),'[]'::jsonb)
  into v_support
  from (
    select * from public.support_tickets
    where user_id=v_user_id
    order by created_at desc
    limit 20
  ) t;

  insert into app_private.platform_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'people_360.view','user',v_user_id::text,jsonb_build_object('lookup',left(trim(p_lookup),180)));

  return v_base || jsonb_build_object(
    'applications',v_apps,
    'project_access',v_access,
    'support_tickets',v_support,
    'trust_summary',jsonb_build_object(
      'attention_level',v_trust->>'attention_level',
      'signals',coalesce(v_trust->'signals','[]'::jsonb),
      'metrics',coalesce(v_trust->'metrics','{}'::jsonb),
      'recently_active',coalesce((v_trust->'profile'->>'recently_active')::boolean,false),
      'last_sign_in_at',v_trust->'profile'->>'effective_last_sign_in_at',
      'last_active_at',v_trust->'profile'->>'last_active_at'
    )
  );
end;
$function$;

revoke all on function public.admin_people_360(text) from public,anon;
grant execute on function public.admin_people_360(text) to authenticated;
