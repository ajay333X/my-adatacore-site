-- Keep the onboarding country selector compatible with existing clients that
-- request `name`, while the canonical table column remains `country_name`.
alter table public.phone_country_codes
  add column if not exists name text generated always as (country_name) stored;

comment on column public.phone_country_codes.name is
  'Compatibility alias for country_name used by contributor onboarding clients.';
