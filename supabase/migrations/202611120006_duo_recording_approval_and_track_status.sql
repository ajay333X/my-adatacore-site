-- Explicit two-party permission to start recording and server-backed per-actor progress.
ALTER TABLE public.vs_sessions
 ADD COLUMN IF NOT EXISTS recording_request_status text NOT NULL DEFAULT 'none',
 ADD COLUMN IF NOT EXISTS recording_requested_at timestamptz,
 ADD COLUMN IF NOT EXISTS actor_a_track_state text NOT NULL DEFAULT 'not_started',
 ADD COLUMN IF NOT EXISTS actor_b_track_state text NOT NULL DEFAULT 'not_started';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vs_recording_request_status_check' AND conrelid='public.vs_sessions'::regclass) THEN
  ALTER TABLE public.vs_sessions ADD CONSTRAINT vs_recording_request_status_check CHECK(recording_request_status IN ('none','pending','approved','declined'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vs_actor_a_track_state_check' AND conrelid='public.vs_sessions'::regclass) THEN
  ALTER TABLE public.vs_sessions ADD CONSTRAINT vs_actor_a_track_state_check CHECK(actor_a_track_state IN ('not_started','recording','stopped','submitted'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vs_actor_b_track_state_check' AND conrelid='public.vs_sessions'::regclass) THEN
  ALTER TABLE public.vs_sessions ADD CONSTRAINT vs_actor_b_track_state_check CHECK(actor_b_track_state IN ('not_started','recording','stopped','submitted'));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.vs_request_recording(p_session uuid)
RETURNS public.vs_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v public.vs_sessions; u uuid:=auth.uid();
BEGIN
 SELECT * INTO v FROM public.vs_sessions WHERE id=p_session FOR UPDATE;
 IF u IS NULL OR v.id IS NULL OR v.actor_a<>u THEN RAISE EXCEPTION 'SESSION_ACCESS_DENIED'; END IF;
 IF v.mode<>'duo' OR v.state<>'rehearsal' OR v.actor_b IS NULL OR NOT v.consent_a OR NOT v.consent_b OR v.rehearsal_started_at IS NULL OR now()<v.rehearsal_started_at+interval '60 seconds' THEN
  RAISE EXCEPTION 'REHEARSAL_NOT_COMPLETE';
 END IF;
 IF v.recording_request_status='approved' THEN RETURN v; END IF;
 UPDATE public.vs_sessions SET recording_request_status='pending', recording_requested_at=now(),updated_at=now()
 WHERE id=p_session RETURNING * INTO v;
 RETURN v;
END
$function$;
CREATE OR REPLACE FUNCTION public.vs_respond_recording(p_session uuid,p_accept boolean)
RETURNS public.vs_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v public.vs_sessions;u uuid:=auth.uid();
BEGIN
 SELECT * INTO v FROM public.vs_sessions WHERE id=p_session FOR UPDATE;
 IF u IS NULL OR v.id IS NULL OR v.actor_b<>u THEN RAISE EXCEPTION 'SESSION_ACCESS_DENIED'; END IF;
 IF v.mode<>'duo' OR v.state<>'rehearsal' OR v.recording_request_status<>'pending' THEN RAISE EXCEPTION 'NO_PENDING_RECORDING_REQUEST'; END IF;
 UPDATE public.vs_sessions SET recording_request_status=CASE WHEN p_accept THEN 'approved' ELSE 'declined' END,updated_at=now()
 WHERE id=p_session RETURNING * INTO v;
 RETURN v;
END
$function$;
CREATE OR REPLACE FUNCTION public.vs_begin(p_session uuid)
RETURNS public.vs_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v public.vs_sessions;u uuid:=auth.uid();
BEGIN
 SELECT * INTO v FROM public.vs_sessions WHERE id=p_session FOR UPDATE;
 IF v.id IS NULL OR u IS NULL OR NOT(u=v.actor_a OR u=v.actor_b) THEN RAISE EXCEPTION 'SESSION_ACCESS_DENIED';END IF;
 IF v.state='recording' THEN RETURN v;END IF;
 IF v.state<>'rehearsal' OR (v.mode='duo' AND (v.actor_b IS NULL OR u<>v.actor_a OR NOT v.consent_a OR NOT v.consent_b OR v.recording_request_status<>'approved' OR now()<v.rehearsal_started_at+interval '60 seconds')) THEN RAISE EXCEPTION 'RECORDING_APPROVAL_REQUIRED';END IF;
 UPDATE public.vs_sessions SET state='recording',recording_started_at=now(),updated_at=now()
 WHERE id=p_session RETURNING * INTO v;
 RETURN v;
END
$function$;
CREATE OR REPLACE FUNCTION public.vs_track_progress(p_session uuid,p_state text)
RETURNS public.vs_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v public.vs_sessions;u uuid:=auth.uid();previous text;
BEGIN
 SELECT * INTO v FROM public.vs_sessions WHERE id=p_session FOR UPDATE;
 IF v.id IS NULL OR u IS NULL OR NOT(u=v.actor_a OR u=v.actor_b) THEN RAISE EXCEPTION 'SESSION_ACCESS_DENIED';END IF;
 IF v.mode<>'duo' OR v.state NOT IN ('recording','submitted') OR p_state NOT IN ('recording','stopped') THEN RAISE EXCEPTION 'INVALID_TRACK_PROGRESS';END IF;
 previous:=CASE WHEN u=v.actor_a THEN v.actor_a_track_state ELSE v.actor_b_track_state END;
 IF previous='submitted' THEN RETURN v;END IF;
 IF p_state='recording' AND previous<>'not_started' THEN RAISE EXCEPTION 'TRACK_ALREADY_STARTED';END IF;
 IF p_state='stopped' AND previous NOT IN ('recording','stopped') THEN RAISE EXCEPTION 'TRACK_NOT_RECORDING';END IF;
 UPDATE public.vs_sessions
 SET actor_a_track_state=CASE WHEN u=actor_a THEN p_state ELSE actor_a_track_state END,
     actor_b_track_state=CASE WHEN u=actor_b THEN p_state ELSE actor_b_track_state END,
     updated_at=now()
 WHERE id=p_session RETURNING * INTO v;
 RETURN v;
END
$function$;
-- Submitted audio is authoritative even if the client disconnected before sending a stop status.
CREATE OR REPLACE FUNCTION public.vs_track_submitted_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 UPDATE public.vs_sessions
 SET actor_a_track_state=CASE WHEN actor_a=NEW.actor_id THEN 'submitted' ELSE actor_a_track_state END,
     actor_b_track_state=CASE WHEN actor_b=NEW.actor_id THEN 'submitted' ELSE actor_b_track_state END,
     updated_at=now()
 WHERE id=NEW.session_id;
 RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS vs_track_submitted_status_trg ON public.vs_tracks;
CREATE TRIGGER vs_track_submitted_status_trg AFTER INSERT ON public.vs_tracks
FOR EACH ROW EXECUTE FUNCTION public.vs_track_submitted_status();
REVOKE ALL ON FUNCTION public.vs_request_recording(uuid) FROM public,anon;
REVOKE ALL ON FUNCTION public.vs_respond_recording(uuid,boolean) FROM public,anon;
REVOKE ALL ON FUNCTION public.vs_track_progress(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.vs_request_recording(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vs_respond_recording(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vs_track_progress(uuid,text) TO authenticated;
