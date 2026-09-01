-- Use Groq Whisper Large V3 Turbo for new AI transcription draft jobs.
alter table app_private.transcription_ai_jobs
  alter column model set default 'whisper-large-v3-turbo';
