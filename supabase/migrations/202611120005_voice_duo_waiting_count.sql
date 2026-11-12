-- Match waiting count to live lease-based queue.
CREATE OR REPLACE FUNCTION public.vs_waiting(p_project integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case when public.vs_can_join(p_project) then (select count(*)::integer from public.vs_sessions where project_id=p_project and mode='duo' and state='waiting' and actor_a<>(select auth.uid()) and updated_at>now()-interval '45 seconds') else 0 end
$function$
;