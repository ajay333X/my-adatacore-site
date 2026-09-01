-- Prefer the more accurate Groq Whisper model for transcription QA workflows.
alter table app_private.transcription_ai_jobs
  alter column model set default 'whisper-large-v3';
