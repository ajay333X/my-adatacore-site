revoke execute on function public.admin_application_analytics(timestamptz,timestamptz,text,text) from anon;
revoke execute on function public.admin_application_analytics(timestamptz,timestamptz,text,text) from public;
grant execute on function public.admin_application_analytics(timestamptz,timestamptz,text,text) to authenticated;
