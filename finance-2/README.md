# Finance 2.0: Automatic Task Earnings

## Production behavior (2026-11-18)

The engine is **implemented and enabled** for newly submitted tasks in projects after a finance administrator saves a supported policy under **Admin → Finance 2.0**. Existing projects with no saved Finance 2.0 policy continue using their current legacy earnings and review flow. No historical submissions are backfilled.

### Supported calculation and eligibility
- **Per task:** snapshot the configured L1 rate when the new `public.submissions` record is inserted. Exactly one task-earning snapshot per task ID.
- **Per audio minute:** calculate using the duration stored in a matching `transcription_audio_items` record; the configured rate is **per audio minute**, not per hour. Requires an existing transcription source item with trusted duration.
- **L2 reviews:** snapshot the L2 review rate for actual completed reviews from `voice_l2_reviews`, `transcription_review_assessments`, or the generic L2 review status change path. One record per source review, with idempotency key.
- **Eligibility rules:** valid submission (eligible immediately), review complete, approval only, or manual authorization. Review quality is independent of payment eligibility.
- **Rate versioning:** new work snapshots the version, role, units, unit rate, amount, and currency. Subsequent project-rate changes do not alter earlier amounts.
- **Amount consistency:** new Finance 2.0 submissions publish their fixed amount into `submissions.earnedAmount` and `tasks.price`. Resubmission retains the original snapshot. Earnings rate updates and submissions use a common advisory lock to prevent rate-change races.
- **USD only** for automatic calculation while the existing contributor balance has no multi-currency accounting. INR/EUR/etc are intentionally blocked rather than silently mixed.
- **Not yet supported:** automatic per-work-hour and per-1,000-word calculations, because a verified unit source has not been integrated.
- **Not mapped:** all specialized non-`submissions` task models, including some separate Voice Studio project/session flows. They remain on existing payout arrangements until explicitly mapped and tested.

### Contributor and admin views
- Contributor Workspace → Earnings shows automatic L1 and L2 compensation separately from regular wallet balance and manual review exceptions. `Earned/eligible` means the contractor has met the configured conditions, **not** that money has reached a bank.
- Admin → Finance 2.0 includes payment policy controls, all-task totals by project, individual L1 submissions, completed L2 reviews, finance eligibility overrides, and optional manual external payout recording.
- Per-project earning liabilities are summed **in the database without pagination**. Detailed task/review tables display the latest 1,000 records.
- Approved L1 task earnings are recognized as part of the existing wallet settlement flow and are excluded from the separate unapproved liability total to avoid double counting.

### Safety and limitations
- **No automatic bank transfer, payment-provider integration, or withdrawal is enabled.**
- **No automatic credit to `users.balance` before approval:** earned/eligible amounts are visible in Finance 2.0 until existing settlement or manual finance procedures take over. This preserves the legacy payout system and avoids duplicate credits.
- Existing `admin_update_submission_payment`, `submit_voice_l2_review`, `tx_submit`, `admin_set_submission_status`, and project budget/spend procedures are not rewritten.
- Finance 2.0 paid exceptions are prevented from being approved again through the legacy payment path without reconciliation.
- Finance 2.0 table rows are private, RLS-enabled, and accessed through permission-scoped RPCs. Sensitive writes use finance or scoped QA permissions.
- Manual "paid" means an authorized finance admin is **recording an external transfer that has actually occurred**, not initiating a bank transfer.
- No change is made to previously approved amounts, paid histories or old project rules.

### SQL changes
1. `phase5-automatic-task-earnings.sql` — new L1 task snapshots, triggers, read APIs, policy activation
2. `phase6-l2-review-earnings.sql` — L2 review ledger and capture triggers
3. `phase7-project-earning-totals.sql` — complete project aggregates
4. `phase8-publish-task-price.sql` — synchronize task pricing metadata
5. `phase9-transactional-rate-locks.sql` — serialize configuration and accrual

Earlier `phase2`–`phase4` migrations are still in place. The experimental `schema-foundation.sql` remains a non-deployed design artifact and is not used by the live system.

### Verification
- SQL migrations parsed and executed in rollback tests.
- Tested: valid submission eligibility, audio-minute calculation, review completion, immutable rate snapshots, retroactive rate change isolation, unauthorized finance reads and edits, currency/model rejection, duplicate task credit prevention, unchanged pre-approval legacy balance, contributor read authorization, L2 review snapshot idempotency, and project aggregation.
- JavaScript entry points passed syntax checks.
- Final browser regression testing with actual assigned participant, QA, finance, and admin sessions is still recommended before treating the system as fully operational for paying external contributors.

### Admin action required
Open **/admin/finance-2**, select one project, choose *per task* or *per audio minute*, set explicit **USD per-unit L1 and L2 rates**, choose *On valid submission* for earnings before QA approval, then **Save and activate rate version**. Only new submissions/reviews on that project use the new rule; no old work is repriced.


## 2026-11-18 reconciliation hardening

- Adds private, append-only `finance2_review_settlements` for payments **already sent externally** against an individual eligible L2 review earning.
- Each review earning can be settled **exactly once**, using a unique review-earning reference; repeating a request with the same transfer reference returns `already_recorded`, and a different reference is rejected.
- The admin Finance 2.0 interface now supports external transfer reconciliation for L2 reviews. Contributors see their paid L2 earnings separately from still-eligible earnings.
- Project liability totals now exclude settled L2 earnings from payable amounts and show L2 payments independently, avoiding paid-versus-unpaid double counting.
- Reviewer settlement RPC is restricted to Finance-capable admins, private tables remain inaccessible to ordinary clients, and the settlement record cannot be updated or deleted by application SQL paths.
- On first activation, project rate fields start **blank** rather than copying a possibly hourly legacy rate into a per-task configuration. The admin must explicitly enter rates and confirm the currency, payment unit, and eligibility before a project is activated.
- Rollback-only tests passed: unauthorized settlement attempt, first successful settlement, idempotent duplicate, different-reference rejection, immutable-row update rejection, and project total reconciliation.
- Bank transfer initiation remains disabled. This is manual *recording* of transfers that occurred outside the platform.
- Remaining issues before a defensible 10/10: real-browser cross-role verification; full compatibility with all specialized voice-task models; trusted work-hour and word-count units; multi-currency settlement in a separate wallet; external bank statement reconciliation with evidence; end-to-end refund/dispute handling. Do not claim these are complete.


## Reconciliation health (read-only)
Finance admins now have a dedicated reconciliation health panel. It checks:
- task amount drift versus original rate snapshot;
- arithmetic mismatches between verified units, rate and amount;
- L2 settlement amounts and payee consistency;
- double-paid submissions across Finance 2.0 and the legacy payout system;
- manual override amount drift and unresolved approved exceptions;
- unsupported currencies or compensation models;
- overdue eligible-but-unpaid task and reviewer earnings.

This is a **read-only audit**, not automatic error correction. `finance2_reconciliation_health` checks the complete earning tables rather than only paginated UI results, and is restricted to finance-capable staff. Authenticated browser role testing and independent production payment reconciliation still remain necessary before claiming 10/10.
