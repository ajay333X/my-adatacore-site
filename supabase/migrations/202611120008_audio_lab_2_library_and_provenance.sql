-- Audio Lab 2: script provenance, change history, and safe publication controls.
ALTER TABLE public.vs_scripts
 ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS updated_by uuid,
 ADD COLUMN IF NOT EXISTS generation_id uuid;
CREATE TABLE IF NOT EXISTS public.vs_script_generations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id integer NOT NULL REFERENCES public.project_lab(id),
 script_id uuid REFERENCES public.vs_scripts(id) ON DELETE SET NULL,
 requested_by uuid REFERENCES auth.users(id),
 provider text NOT NULL DEFAULT 'Groq',
 model text NOT NULL DEFAULT 'openai/gpt-oss-120b',
 request_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 prompt_text text NOT NULL DEFAULT '',
 output_json jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vs_script_generations_project_time ON public.vs_script_generations(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vs_script_generations_script ON public.vs_script_generations(script_id);
CREATE TABLE IF NOT EXISTS public.vs_script_revisions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 script_id uuid NOT NULL REFERENCES public.vs_scripts(id) ON DELETE CASCADE,
 changed_by uuid,
 changed_at timestamptz NOT NULL DEFAULT now(),
 before_json jsonb NOT NULL,
 after_json jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS vs_script_revisions_history ON public.vs_script_revisions(script_id,changed_at DESC);
CREATE OR REPLACE FUNCTION public.vs_script_track_revision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF (to_jsonb(OLD) - 'updated_at' - 'updated_by') IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at' - 'updated_by') THEN
  NEW.updated_at=now();
  NEW.updated_by=auth.uid();
  INSERT INTO public.vs_script_revisions(script_id,changed_by,before_json,after_json)
   VALUES(OLD.id,auth.uid(),to_jsonb(OLD),to_jsonb(NEW));
 END IF;
 RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS vs_script_revision_trg ON public.vs_scripts;
CREATE TRIGGER vs_script_revision_trg BEFORE UPDATE ON public.vs_scripts
 FOR EACH ROW EXECUTE FUNCTION public.vs_script_track_revision();
ALTER TABLE public.vs_script_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vs_script_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vs_gen_admin_read ON public.vs_script_generations;
CREATE POLICY vs_gen_admin_read ON public.vs_script_generations FOR SELECT TO authenticated USING(public.vs_is_admin() AND project_id=94);
DROP POLICY IF EXISTS vs_rev_admin_read ON public.vs_script_revisions;
CREATE POLICY vs_rev_admin_read ON public.vs_script_revisions FOR SELECT TO authenticated
 USING(public.vs_is_admin() AND EXISTS(SELECT 1 FROM public.vs_scripts s WHERE s.id=script_id AND s.project_id=94));
GRANT SELECT ON public.vs_script_generations,public.vs_script_revisions TO authenticated;
