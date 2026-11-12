-- Admin contributor preview: list the selected user's assigned projects without
-- borrowing the administrator's own permissions or exposing anonymous access.
create or replace function public.admin_impersonation_project_hubs(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target uuid;
begin
  -- Validates the logged-in admin, session ownership, expiry and target.
  v_target := app_private.admin_impersonation_target(p_session_id);
  if v_target is null then
    raise exception 'IMPERSONATION_ACCESS_DENIED';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.project_name,
        'type', p.project_type,
        'description', p.description,
        'project_code', p.project_code,
        'lifecycle', p.lifecycle_status,
        'published', p.is_published
      ) order by p.project_name
    )
    from public.project_lab p
    where p.lifecycle_status='active'
      and p.is_published=true
      and (
        exists (
          select 1 from public.project_access_controls a
          where a.project_id=p.id and a.user_id=v_target
            and a.access_status='active' and coalesce(a.task_limit,0)>0
        )
        or exists (
          select 1 from public.tasks t
          join public.users u on u.id=v_target
          where t.title=p.project_name
            and (lower(t."assignedTo")=lower(u.email)
                 or t."assignedTo"=u."uniqueID")
        )
        or exists (
          select 1 from app_private.transcription_l1_allowances a
          where a.project_id=p.id and a.user_id=v_target
        )
      )
  ),'[]'::jsonb);
end;
$function$;
revoke all on function public.admin_impersonation_project_hubs(uuid) from public, anon;
grant execute on function public.admin_impersonation_project_hubs(uuid) to authenticated;
