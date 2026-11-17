-- Adatacore Finance 2.0: review-only foundation (DO NOT run directly in production).
-- Private schema: privileged backend operations only. Requires deployment-specific
-- authorization checks in API before service-role access. No contributor client writes.
begin;
create schema if not exists finance;
revoke all on schema finance from public, anon, authenticated;
grant usage on schema finance to service_role;

create table if not exists finance.project_compensation (
  project_id integer primary key references public.project_lab(id) on delete restrict,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  model text not null default 'per_task'
    check(model in ('per_task','per_work_hour','per_audio_minute','per_1000_words')),
  earning_trigger text not null default 'valid_submission'
    check(earning_trigger in ('valid_submission','review_complete','approved','manual')),
  budget_limit numeric(18,2) check (budget_limit is null or budget_limit >= 0),
  enabled boolean not null default false,
  effective_version integer not null default 1 check (effective_version > 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists finance.compensation_rates (
  id bigint generated always as identity primary key,
  project_id integer not null references finance.project_compensation(project_id),
  policy_version integer not null check(policy_version > 0),
  work_role text not null check(work_role in ('L1','L2','specialist')),
  amount numeric(18,4) not null check(amount >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id,policy_version,work_role)
);
-- Record immutable events with signed amounts. A correction is a separate reversal
-- and replacement, never an UPDATE/DELETE of a historical earning event.
create table if not exists finance.earning_events (
  id bigint generated always as identity primary key,
  event_key text not null unique check(length(trim(event_key)) between 8 and 200),
  project_id integer not null references finance.project_compensation(project_id),
  contributor_id uuid not null references auth.users(id),
  submission_id integer references public.submissions(id),
  task_id integer references public.tasks(id),
  rate_id bigint references finance.compensation_rates(id),
  event_kind text not null check(event_kind in ('accrual','bonus','reversal','adjustment')),
  amount numeric(18,4) not null check(amount <> 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  eligibility text not null default 'pending'
    check(eligibility in ('pending','eligible','held')),
  reason text not null,
  reversal_of bigint unique references finance.earning_events(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((event_kind = 'reversal' and amount < 0 and reversal_of is not null)
       or (event_kind <> 'reversal' and reversal_of is null))
);
create index if not exists finance_earning_project_idx on finance.earning_events(project_id,created_at);
create index if not exists finance_earning_contributor_idx on finance.earning_events(contributor_id,created_at);
create index if not exists finance_earning_submission_idx on finance.earning_events(submission_id);

-- Reviewer recommendation is not authorization to pay.
create table if not exists finance.review_payment_decisions (
  id bigint generated always as identity primary key,
  submission_id integer not null references public.submissions(id),
  project_id integer not null references finance.project_compensation(project_id),
  reviewer_id uuid not null references auth.users(id),
  recommendation text not null check(recommendation in ('eligible','hold','exclude')),
  reason text not null check(length(trim(reason)) >= 5),
  authorized_by uuid references auth.users(id),
  authorization text check(authorization in ('approved','denied')),
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  check ((authorization is null and authorized_by is null and authorized_at is null)
      or (authorization is not null and authorized_by is not null and authorized_at is not null))
);
create index if not exists finance_decisions_submission_idx on finance.review_payment_decisions(submission_id,created_at desc);

create table if not exists finance.payout_batches (
  id bigint generated always as identity primary key,
  project_id integer references finance.project_compensation(project_id),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check(status in ('draft','authorized','processing','paid','failed','cancelled')),
  external_reference text,
  created_by uuid references auth.users(id),
  authorized_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  completed_at timestamptz
);
create table if not exists finance.payout_items (
  id bigint generated always as identity primary key,
  batch_id bigint not null references finance.payout_batches(id) on delete restrict,
  contributor_id uuid not null references auth.users(id),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  amount numeric(18,4) not null check(amount > 0),
  status text not null default 'pending'
    check(status in ('pending','processing','paid','failed','cancelled')),
  external_reference text,
  idempotency_key text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists finance.payout_allocations (
  payout_item_id bigint not null references finance.payout_items(id) on delete restrict,
  earning_event_id bigint not null unique references finance.earning_events(id),
  amount numeric(18,4) not null check(amount > 0),
  primary key(payout_item_id,earning_event_id)
);
-- Finance audit trail; never overwrite historical entries.
create table if not exists finance.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- Defense in depth even though finance is not an exposed Data API schema.
alter table finance.project_compensation enable row level security;
alter table finance.compensation_rates enable row level security;
alter table finance.earning_events enable row level security;
alter table finance.review_payment_decisions enable row level security;
alter table finance.payout_batches enable row level security;
alter table finance.payout_items enable row level security;
alter table finance.payout_allocations enable row level security;
alter table finance.audit_events enable row level security;
revoke all on all tables in schema finance from public, anon, authenticated;
grant select, insert, update on all tables in schema finance to service_role;
grant usage, select on all sequences in schema finance to service_role;
-- A real deployment must enforce append-only earning/audit rows using triggers,
-- and must add transactional payout validation + server-side permission gates.
commit;
