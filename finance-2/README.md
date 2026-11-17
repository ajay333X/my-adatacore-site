# Finance 2.0 — safe implementation slice

Status: **foundation only, not installed or deployed**.

This branch introduces a private Postgres finance data model that is deliberately isolated from the existing Adatacore submission-payments, project rates, review screens, and contributor balances.

## Existing schema discovered
- `public.project_lab` uses integer IDs and already has `l1_rate`, `l2_rate`, and transcription rate/currency.
- `public.submissions` has integer IDs and `earnedAmount`, `status`, `workerUID`, and `projectTitle`.
- `public.submission_payments` already tracks payment state.
- `public.voice_l2_reviews` stores review decision/feedback.
- Existing projects and recordings are in production. **Do not overwrite or backfill payments from these columns without reconciliation.**

## Intended modules
1. Project Finance tab: rates by role, effective version, compensation basis and earning trigger, currency, budget.
2. Review UI: reviewer selects eligible/hold/exclude and provides reason; finance admin separately authorizes.
3. Ledger service: idempotency keys, stored rate snapshot, immutable credits/reversals, no double-crediting.
4. Finance dashboard: per-project payable, committed, paid, and budget remaining (all amounts by currency).
5. Contributor wallet: earned, held, payable, processing, paid, failed; distinguish review approval from pay status.
6. Payout batches: admin approval and manual transfer reconciliation first; no automatic transfers.
7. Testing and rollout: staging, authorization tests, rate change test, simultaneous submission retry, payout retry, ledger reconciliation, zero-impact regression checks.

## Blocking decisions before enabling
- Confirm which existing task types/source tables should generate payable earnings. Audio items, voice sessions, and generic submissions may need different task ID and completion semantics.
- Confirm each project's compensation policy and existing historical balances.
- Decide who has finance authorization rights, whether contributors see estimates or guaranteed earning amounts, and which currencies are legally payable.
- Add application backend with verified role checks and atomic transactional APIs. **Never perform finance writes directly from browser credentials.**
- Add enforced append-only triggers to immutable tables, and transactionally validate payout eligibility and exact event allocations.
- Add tests for role isolation, duplicate events, retroactive policy changes, reversals, concurrent payouts, refunds, and audit tampering.
- Validate Supabase grants, RLS, data-access surface and deployment migrations in staging; do not run this foundation SQL in production yet.

This branch must stay as an unmerged draft PR until those pieces are implemented and tested.
