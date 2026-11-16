-- Additive, private dataset shortlisting decisions for voice-actor application recordings.
-- Dataset suitability decisions never change application hiring status.
CREATE TABLE IF NOT EXISTS public.dataset_studio_applicant_reviews (
 application_id uuid PRIMARY KEY,
 reviewed_by uuid NOT NULL REFERENCES auth.users(id),
 decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','selected','skipped','permission_needed','imported')),
 reviewer_note text NOT NULL DEFAULT '',
 explicit_consent_confirmed boolean NOT NULL DEFAULT false,
 consent_evidence text NOT NULL DEFAULT '',
 imported_source_id uuid REFERENCES public.dataset_studio_sources(id) ON DELETE SET NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT dataset_studio_candidate_consent_evidence_limit CHECK (length(consent_evidence)<=1000),
 CONSTRAINT dataset_studio_candidate_review_note_limit CHECK (length(reviewer_note)<=3000)
);
CREATE INDEX IF NOT EXISTS dataset_studio_applicant_reviews_decision_idx ON public.dataset_studio_applicant_reviews(decision,reviewed_at DESC);
ALTER TABLE public.dataset_studio_applicant_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dataset_studio_applicant_reviews' AND policyname='dataset_studio_applicant_reviews_admin') THEN
  CREATE POLICY dataset_studio_applicant_reviews_admin ON public.dataset_studio_applicant_reviews
  FOR ALL TO authenticated USING ((SELECT app_private.is_dataset_studio_admin()))
  WITH CHECK ((SELECT app_private.is_dataset_studio_admin()) AND reviewed_by=(SELECT auth.uid()));
 END IF;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dataset_studio_applicant_reviews TO authenticated;
