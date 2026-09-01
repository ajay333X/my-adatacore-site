# Adatacore Platform Roadmap

## Wave 1 — Reliability and security
- Remove anonymous access from Admin-only RPCs.
- Add authenticated browser error reporting.
- Add Operations Health to Admin Overview.
- Add CI syntax checks and production route smoke tests.
- Add missing foreign-key indexes.
- Audit `app_private.admin_emails` RLS before enabling it.
- Enable leaked-password protection in Supabase Auth when account configuration allows it.

## Wave 2 — Workforce experience
- Contributor notifications for review and payment events.
- Contributor Quality view with approval rate and reviewer feedback.
- Better blocked-work explanations.
- Onboarding checklist, language/skill profile, support escalation.

## Wave 3 — QA and transcription
- Stronger transcript structural validation.
- Language/project-specific QA rules and glossary support.
- Segment-level reviewer issue categories and severity.
- Gold/calibration tasks and reviewer agreement metrics.
- Reviewer scorecards and automatic task-limit policies.

## Wave 4 — Client portal
- Client approve / request-changes decisions.
- Decision history, comment resolution, review progress.
- Collection-level approval and downloadable final packages.
- Link expiry/revocation controls and optional client accounts.

## Wave 5 — Finance and permissions
- Immutable balance ledger.
- Payout cycles, batches, reconciliation, statements and exports.
- Staff-role framework: Super Admin, Project Manager, QA Manager, Finance, Support.
- Gradual capability enforcement by role/project.

## Wave 6 — Scale and public product
- Remove confirmed legacy tables/code paths.
- Optimize RLS policies and remaining indexes.
- Staging/develop release flow and release tracking.
- Product pages for Transcription, Voice Data, AI Evaluation and Human QA.
- Security/privacy/status pages and stronger client-facing positioning.
