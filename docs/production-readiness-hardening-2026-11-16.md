# Adatacore production launch hardening (16 Nov 2026)

## Production changes completed
- Applied Supabase migration `20261116103031_restrict_anonymous_privileged_rpcs_20261116` to project `llmhyezgcnbognmmsnzq`.
- Removed anonymous EXECUTE permission from **eleven** administrator/trigger-only SECURITY DEFINER functions; preserved authenticated role grants.
- Security adviser anonymous SECURITY DEFINER findings decreased from 14 to **3**. The remaining functions are `can_review_application_audio` (returns a boolean based on authenticated access), `get_platform_status` (public status) and `public_log_voice_recruitment_event` (public recruitment analytics). Review the first one before deciding whether anonymous access is needed.
- The schema change was permission-only: **no tables, production data, payment states or task assignments were modified**.
- Earlier CI-only fix for stale CoreForge page title passed its PR checks and was separately merged as PR #72.

## Safe rollback of the RPC change
The original ACLs explicitly granted EXECUTE to `anon`, `authenticated`, `service_role`, and `PUBLIC`. If reverting is genuinely required, restore these grants only for the exact affected signatures; do not bulk grant every public function:

```sql
grant execute on function public.admin_delete_application(uuid) to public, anon;
grant execute on function public.admin_get_inactivity_policy(integer) to public, anon;
grant execute on function public.admin_get_quality_escalation_rule(integer) to public, anon;
grant execute on function public.admin_people360_set_project_limit(uuid,integer,integer) to public, anon;
grant execute on function public.admin_people_quality_timeline(uuid,integer) to public, anon;
grant execute on function public.admin_project_smart_groups(integer) to public, anon;
grant execute on function public.admin_set_inactivity_policy(integer,boolean,integer,integer,boolean) to public, anon;
grant execute on function public.admin_set_quality_escalation_rule(integer,boolean,integer,integer,integer,integer) to public, anon;
grant execute on function public.vs_script_prevent_rewriting_assigned() to public, anon;
grant execute on function public.vs_script_track_revision() to public, anon;
grant execute on function public.vs_track_submitted_status() to public, anon;
```
That rollback **reopens anonymous access** and is intended solely for an authenticated regression that cannot be remedied otherwise. Re-test security after any rollback.

## Encrypted backup tooling: NOT YET ACTIVE
`.github/workflows/adatacore-encrypted-backup.yml` is deliberately **manual only**. It does not claim that a backup has been taken. It will:
1. Dump the PostgreSQL database using the PostgreSQL 17 client and validate the resulting archive.
2. Export every current Supabase Storage bucket/object, with per-file SHA-256 recorded in a manifest.
3. Encrypt database and storage payloads with the **age** public recipient (private key remains outside GitHub).
4. Upload encrypted-only artifacts with a seven-day GitHub Actions retention.
5. Remove plaintext from the ephemeral runner.

### Required account setup
In GitHub repo **Settings → Secrets and variables → Actions**, configure:
- Secret `ADATACORE_BACKUP_DATABASE_URL`: privileged **session-mode or direct PostgreSQL 17** connection URL, configured for database dumps; never put it in source or chat.
- Secret `ADATACORE_BACKUP_SERVICE_ROLE_KEY`: Supabase **server-only** service-role key, permitted to read Storage buckets; never expose to browser code or logs.
- Variable `ADATACORE_BACKUP_AGE_RECIPIENT`: public recipient generated from an offline age key pair.
- Store the matching **age private identity key offline**, in a password manager or other recoverable secret vault, separate from GitHub. Loss of this key makes these encrypted backups unreadable.

The repository is public, so **only** ciphertext is permitted in Actions artifacts. Review repository and workflow permissions before enabling the workflow. Do not run untrusted PR code with these secrets.

### First backup validation
1. In GitHub Actions, manually run **Encrypted Adatacore backup (manual setup required)** from the reviewed default branch.
2. Confirm the run succeeds and produces **two encrypted** files, not plaintext data.
3. Download the artifact in a secure location and decrypt both files using the offline age identity.
4. Run `pg_restore --list database.dump` with PostgreSQL 17 to validate the custom archive.
5. Inspect the Storage manifest and SHA-256 hashes against extracted objects.
6. Perform a full **isolated restore** in a dedicated test PostgreSQL/Supabase environment, restoring Storage into a separate isolated bucket/project; verify sampled records, authentication profiles, tasks, audio file counts and access controls. **Never test restoration over production**.
7. Only after this succeeds, add an approved nightly schedule, resilient retention/offsite storage, failure alerts, and a monthly restore drill. Seven-day GitHub artifacts alone are not a sufficient long-term commercial backup system.

Supabase daily managed backups require an eligible paid plan and **do not include Storage objects**, so keep Storage backups even after upgrading.

## Other outstanding launch gates — do not mark complete
- **Hosting contract:** move commercial service from Vercel Hobby to an eligible commercial plan. Requires account-owner authorization for billing.
- **Passwords:** enable Supabase Auth leaked-password protection if available on the chosen plan; live-test reset/password/OAuth/session lifecycle.
- **Finance:** payout statuses currently live in database, but provider settlement and signed webhook verification have not been established. Do not treat internal status `paid` as external transfer proof; verify gateway, business KYC, settlements and reconciliation in a payment sandbox first. Never send real money solely to test an API without approval.
- **Task claiming:** nine old reservations are expired but not marked released. The current contributor context filters out expired reservations, so do **not** mutate historical records simply to make advisory totals zero. Validate claim concurrency and cleanup behavior in an isolated multi-user test.
- **Performance:** 113 foreign keys without indexes and 19 RLS init-plan warnings. Prioritize based on real EXPLAIN plans and representative traffic. Do not bulk-create indexes or rewrite every RLS policy on a live database before reliable backups.
- **Security:** audit the remaining 368 authenticated SECURITY DEFINER RPCs for meaningful server-side authorization, object ownership, tenant isolation and safe search paths. Automated advisor counts alone are not an exploit proof.
- **E2E:** complete authenticated integration tests for contributor sign-up/login/reset, active/blocked account, L1 claim/submit, L2 review and feedback, solo/duo recording, client handoff, admin sandbox, support and payment flow.
- **Scale:** verify 500 simultaneous user capacity in a representative **isolated** environment rather than pushing destructive load into production.

## Launch decision
**Not cleared for unrestricted commercial public launch.** Permission hardening and regression tooling improved; subscription changes, credential-protected backups, restoration, settlement evidence and live role-based end-to-end tests remain blockers.
