create or replace function app_private.notify_application_decision_email()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('changes_requested','approved','rejected') then
    return new;
  end if;

  perform net.http_post(
    url := 'https://llmhyezgcnbognmmsnzq.supabase.co/functions/v1/application-decision-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-adatacore-webhook-secret', 'adatacore-app-decision-20260908'
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'contributor_applications',
      'schema', 'app_private',
      'old_record', to_jsonb(old),
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists contributor_application_decision_email on app_private.contributor_applications;
create trigger contributor_application_decision_email
after update of status on app_private.contributor_applications
for each row execute function app_private.notify_application_decision_email();
