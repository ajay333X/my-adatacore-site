-- Audio Dataset Studio: additive, idempotent schema. Production project was migrated via Supabase MCP.
-- Private storage and super-admin-only RLS; no existing transcription or contributor tables changed.
CREATE TABLE IF NOT EXISTS public.dataset_studio_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  source_url text,
  source_kind text NOT NULL CHECK (source_kind IN ('commons','archive','youtube','external','upload')),
  language text NOT NULL DEFAULT 'hi',
  title text NOT NULL DEFAULT 'Untitled recording',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','inspected','unsupported','downloaded','uploaded','error')),
  rights_confirmed boolean NOT NULL DEFAULT false,
  license_name text,
  license_url text,
  author text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  source_bytes bigint,
  source_mime text,
  duration_seconds numeric,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dataset_studio_source_url_length CHECK (source_url IS NULL OR length(source_url)<=2048)
);
CREATE TABLE IF NOT EXISTS public.dataset_studio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.dataset_studio_sources(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  language text NOT NULL,
  start_ms integer NOT NULL CHECK (start_ms>=0),
  end_ms integer NOT NULL CHECK (end_ms>start_ms),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 15000 AND 120000),
  storage_path text NOT NULL UNIQUE,
  transcript text NOT NULL DEFAULT '',
  transcript_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript_status text NOT NULL DEFAULT 'not_started' CHECK (transcript_status IN ('not_started','ai_draft','edited','human_verified')),
  model_name text,
  qa_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dataset_studio_sources_created_idx ON public.dataset_studio_sources(created_by,created_at DESC);
CREATE INDEX IF NOT EXISTS dataset_studio_clips_source_idx ON public.dataset_studio_clips(source_id,created_at DESC);
CREATE OR REPLACE FUNCTION app_private.is_dataset_studio_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.admin_staff_roles r JOIN public.users u ON u.id=r.user_id
  WHERE r.user_id=auth.uid() AND r.role='super_admin' AND r.active=true AND u."accountStatus"='active'
 );
$$;
REVOKE ALL ON FUNCTION app_private.is_dataset_studio_admin() FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_dataset_studio_admin() TO authenticated;
ALTER TABLE public.dataset_studio_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_studio_clips ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dataset_studio_sources' AND policyname='dataset_studio_sources_admin') THEN
  CREATE POLICY dataset_studio_sources_admin ON public.dataset_studio_sources FOR ALL TO authenticated
   USING ((SELECT app_private.is_dataset_studio_admin()))
   WITH CHECK ((SELECT app_private.is_dataset_studio_admin()) AND created_by=(SELECT auth.uid()));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dataset_studio_clips' AND policyname='dataset_studio_clips_admin') THEN
  CREATE POLICY dataset_studio_clips_admin ON public.dataset_studio_clips FOR ALL TO authenticated
   USING ((SELECT app_private.is_dataset_studio_admin()))
   WITH CHECK ((SELECT app_private.is_dataset_studio_admin()) AND created_by=(SELECT auth.uid()));
 END IF;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dataset_studio_sources TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dataset_studio_clips TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('adatacore-dataset-studio','adatacore-dataset-studio',false,52428800,
 ARRAY['audio/wav','audio/x-wav','audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/flac','audio/x-m4a','audio/opus','audio/aac']::text[])
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dataset_studio_audio_admin_read') THEN
  CREATE POLICY dataset_studio_audio_admin_read ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='adatacore-dataset-studio' AND (SELECT app_private.is_dataset_studio_admin()));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dataset_studio_audio_admin_insert') THEN
  CREATE POLICY dataset_studio_audio_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='adatacore-dataset-studio' AND (SELECT app_private.is_dataset_studio_admin()));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dataset_studio_audio_admin_update') THEN
  CREATE POLICY dataset_studio_audio_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING(bucket_id='adatacore-dataset-studio' AND (SELECT app_private.is_dataset_studio_admin()))
  WITH CHECK(bucket_id='adatacore-dataset-studio' AND (SELECT app_private.is_dataset_studio_admin()));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dataset_studio_audio_admin_delete') THEN
  CREATE POLICY dataset_studio_audio_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING(bucket_id='adatacore-dataset-studio' AND (SELECT app_private.is_dataset_studio_admin()));
 END IF;
END $$;
