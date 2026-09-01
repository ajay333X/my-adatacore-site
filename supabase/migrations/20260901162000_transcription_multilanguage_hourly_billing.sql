-- Transcription projects can have independent language and pay-per-audio-hour settings.
alter table public.project_lab add column if not exists transcription_language text;
alter table public.project_lab add column if not exists transcription_hourly_rate numeric(12,4) not null default 0;
alter table public.project_lab add column if not exists transcription_currency text not null default 'USD';

update public.project_lab set transcription_language=nullif(config->>'ai_language','') where project_type='transcription' and transcription_language is null;

alter table public.project_lab drop constraint if exists project_lab_transcription_hourly_rate_check;
alter table public.project_lab add constraint project_lab_transcription_hourly_rate_check check (transcription_hourly_rate>=0 and transcription_hourly_rate<=100000);
alter table public.project_lab drop constraint if exists project_lab_transcription_currency_check;
alter table public.project_lab add constraint project_lab_transcription_currency_check check (transcription_currency ~ '^[A-Z]{3}$');

create or replace function app_private.tx_earning_amount(p_project_id integer,p_duration_ms integer)
returns numeric language sql stable security definer set search_path='public','app_private','pg_temp' as $$
 select round((greatest(coalesce(p_duration_ms,0),0)::numeric/3600000::numeric)*coalesce(p.transcription_hourly_rate,0),4)
 from public.project_lab p where p.id=p_project_id and p.project_type='transcription'
$$;
revoke all on function app_private.tx_earning_amount(integer,integer) from public,anon,authenticated;

-- The production migration also installs tx_project_billing_get, tx_project_billing_set,
-- tx_create_project_v2 and updates tx_claim_next / tx_submit so task earnings are
-- snapshotted from audio duration and approved submissions credit the existing balance ledger.
