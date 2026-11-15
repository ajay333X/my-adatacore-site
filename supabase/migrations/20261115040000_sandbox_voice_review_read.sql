-- Keep recording uploads restricted to active L1 test sessions.
-- Allow the owning authorized reviewer/manager to access previously submitted
-- test audio after a dummy contributor's short-lived sandbox session expires.
create or replace function public.sandbox_voice_storage_allowed(p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
  and split_part(p_path,'/',1)=(select auth.uid())::text
  and exists(
   select 1 from app_private.sandbox_voice_takes t
   where t.owner_id=(select auth.uid())
    and t.id::text=split_part(p_path,'/',2)
    and t.account_id::text=split_part(split_part(p_path,'/',3),'.',1)
    and (
      (p_write and t.state='recording' and exists(
        select 1 from app_private.sandbox_test_sessions s
        join app_private.sandbox_test_project_access a
          on a.account_id=s.account_id and a.project_id=s.project_id
        where s.owner_id=(select auth.uid()) and s.account_id=t.account_id
          and s.project_id=t.project_id and s.ended_at is null
          and s.expires_at>now() and a.level='L1'
      ))
      or
      (not p_write and (
        public.admin_has_capability('project_manage',t.project_id)
        or public.admin_has_capability('qa_review',t.project_id)
      ))
    )
  );
$$;
revoke all on function public.sandbox_voice_storage_allowed(text,boolean) from public,anon;
grant execute on function public.sandbox_voice_storage_allowed(text,boolean) to authenticated;
