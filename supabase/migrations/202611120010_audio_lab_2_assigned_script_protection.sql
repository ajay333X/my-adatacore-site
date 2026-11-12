-- Protect the script originally assigned to any session from retrospective edits.
-- Admins may still archive/restore it; all other edits require a duplicate.
CREATE OR REPLACE FUNCTION public.vs_script_prevent_rewriting_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM public.vs_sessions WHERE script_id=OLD.id)
 AND (
  NEW.title IS DISTINCT FROM OLD.title OR
  NEW.mode IS DISTINCT FROM OLD.mode OR
  NEW.scenario IS DISTINCT FROM OLD.scenario OR
  NEW.emotion IS DISTINCT FROM OLD.emotion OR
  NEW.language IS DISTINCT FROM OLD.language OR
  NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds OR
  NEW.body IS DISTINCT FROM OLD.body
 ) THEN
  RAISE EXCEPTION 'SCRIPT_IN_USE_DUPLICATE_REQUIRED: Duplicate this script before editing so existing recording QA evidence is preserved.';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS vs_script_a_usage_guard_trg ON public.vs_scripts;
CREATE TRIGGER vs_script_a_usage_guard_trg BEFORE UPDATE ON public.vs_scripts
FOR EACH ROW EXECUTE FUNCTION public.vs_script_prevent_rewriting_assigned();
