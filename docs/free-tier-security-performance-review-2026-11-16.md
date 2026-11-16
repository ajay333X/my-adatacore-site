# Adatacore free-tier readiness review — 2026-11-16

Scope: **read-only checks** of the live Supabase project, public repository, live Vercel deployment and CI, plus a reversible permission-only restriction on `can_review_application_audio()`. No purchases, new contributors, test payments or destructive load tests.

## Current observed data and workload

| Check | Observed |
| --- | --- |
| Supabase organization | Free |
| Database size | 255 MB (Free plan includes 500 MB) |
| Storage objects | 129 objects, ~206 MB (Free plan includes 1 GB) |
| Auth users | 56 total, 54 confirmed; 7 signed in within 30 days |
| Tables | All 70 public tables have RLS enabled |
| Pending tasks | L1: 31; L2: 2 |
| Submitted tasks | L1: 36; L2: 2 |
| Submission linkage | 0 orphaned task links; 0 duplicate current submission task groups |
| Reservations | 9 historical expired/unreleased records; zero active reservations at inspection |
| PostgreSQL waiting locks | 0 |
| Postgres table buffer cache hit ratio | 100% aggregate reported |
| Representative queries (cumulative stats since Aug 31) | `get_contributor_workspace`: ~39 ms mean; `get_my_contributor_home`: ~31 ms mean |
| Background jobs | Transcription AI dispatch + Slack sync every minute, each 1,440 successful runs in preceding 24h |

**Interpretation:** approximately 100 *registered* beta participants looks reasonable as an initial target within the user-count quota, **not** a certified capacity for 100 simultaneous active users or 100 concurrent audio uploads. Audio storage/egress and database size may hit free quotas before account counts do. Track actual usage and error rates. Do not do high-traffic production load testing.

## Security review
- All exposed public tables have RLS. The `users` update trigger protects privileged role/accountStatus/balance/identity fields against non-admin changes.
- Project media buckets are private, except intended public `project-ui-assets` images. No anonymous Storage object policy was found in inspected policy list.
- Prior fixes removed anonymous EXECUTE from 11 privileged admin/trigger RPCs. This audit additionally removed anonymous EXECUTE from `can_review_application_audio()`, leaving authenticated access. Anonymous SECURITY DEFINER advisor warnings now **2**, for intentional public status and recruitment tracking functions.
- Supabase still flags **368 authenticated-callable SECURITY DEFINER functions**; these should be reviewed by risk (admin, finance, impersonation, task claim, client delivery). The presence of a definer warning does not itself show an exploit. A source scan found roughly 15 functions lacking an obvious local auth predicate; many delegate to validated helpers, so deeper tests are necessary.
- **Before customer uploads:** review `public.project_lab` SELECT policy (`USING (true)` for any signed-in account). This exposes project metadata/config/rates to all authenticated users and may not match project membership rules. Do not change it without auditing every existing UI query for backward compatibility.
- The `get_my_contributor_home` and `get_my_operations_context` RPCs use authenticated identity, but appear not to test blocked account status directly. Verify whether suspended users must lose even their own dashboard/context data; evaluate a guard with authenticated regression tests before changing.
- The 102 `rls_enabled_no_policy` findings are on private-schema tables and mostly reflect intentional backend-only access; avoid adding blanket permissive policies.
- Leaked-password protection is **Pro-only**, therefore not available to enable on Free. The current sign-up UI requires at least 8 characters; backend authentication and recovery should be tested with controlled accounts.

## Performance review
- Supabase advisors: **113** unindexed foreign keys (mostly small/private tables), **19** auth RLS init-plan warnings, **67** unused-index notices, **1** table with overlapping permissive policies. These are prioritization hints, not 200 production incidents.
- No waiting locks were reported. Existing heavily used transcription queue indexes have large scan counts, suggesting queries do use them.
- Heavy cumulative query counts include two intended *once-per-minute* cron jobs; each is typically under a few tens of milliseconds. Do not slow Slack/AI dispatch just to reduce query counts without workflow acceptance testing.
- Avoid bulk index creation, removal of 'unused' indexes and blanket RLS rewrites on an unbacked-up live database.
- Prioritize query-plan evidence for the signed-in dashboard, L1/L2 queue claims, and project assignment; test 10/25/50/100 simultaneous sessions in an isolated environment before claiming 100-user concurrency.

## Critical workflow confidence
- Release pipeline has previous passing browser-route/API-availability checks and static smoke contracts. This review introduces CI regression checks for assignment center, L2 dashboard, transcription queue, editor review/diff flow, and review levels.
- New read-only anonymous REST smoke tests check that profile, project, task and submission rows cannot be enumerated using the public client key; and that anonymous reviewers cannot invoke the restricted review permission RPC. No test records or payments are created.
- **Still unverified:** real email confirmation, Google OAuth, password reset, blocked-account enforcement, simultaneous L1 claim/race, L2 review feedback notification, solo/duo media capture and file playback, full client delivery, and any payout/settlement. These require controlled authenticated test accounts and isolated media/tasks.
- Historical expired reservations are filtered out by the contributor context query. Verify new claim concurrency/expiry in the test environment before touching historical reservation rows.

## Free backup plan (not yet running)
The repository already contains a **manual-only encrypted database + Storage backup workflow**: `.github/workflows/adatacore-encrypted-backup.yml`. Configure the PostgreSQL connection URL and server-only Storage service key as *GitHub Actions secrets*, set an age **public recipient** in repository Actions variables, and retain its **private decryption identity only offline**. Run the workflow from the trusted default branch and restore into an isolated test environment. The current encrypted GitHub artifact retention is seven days; download additional encrypted copies to an independent drive/storage location. **No real recoverable backup has been verified yet.** Supabase Free lacks managed daily backups. A database dump alone does **not** include Storage binary objects.

## Cost policy
No Supabase, Vercel or payment subscriptions are changed. Free Supabase quotas are adequate for a limited user-count pilot if monitored. Vercel Hobby's terms explicitly limit it to personal/non-commercial usage; the absence of a paying client alone does not establish that a business website qualifies. Resolve hosting compliance before operating a commercial service (paid hosting or a suitable commercial-use-eligible free provider).

## Gates to opening a customer production project
1. Perform and restore-verify at least one encrypted offsite backup.
2. Complete authenticated user-role security and workflow testing.
3. Reconcile project metadata visibility / cross-user access and enable alerts on DB size, Storage/egress and errors.
4. Establish hosting terms compliance and client-data handling obligations.
5. Design payout settlement only when the business model requires it; current 'paid' flags are internal status, not settlement verification.
