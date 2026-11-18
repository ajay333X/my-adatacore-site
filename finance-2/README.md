# Finance 2.0 — controlled release

## Implemented
- Dedicated protected admin interface `/admin/finance-2`, accessed from the existing admin and Project Lab navigation.
- Project-level payment models, earning-trigger preferences, L1/L2 rate configuration, and audit-backed rate versions.
- Reviewer recommendation controls in the L2 Review Results interface. A QA recommendation is separate from finance authorization.
- Finance-admin authorization of non-approved submission payment eligibility/hold/exclusion, with written reason.
- Manual payout reconciliation for these exceptions: authorized finance staff record a **transfer already sent externally**, with a unique submission record and bank reference; no transfer is initiated.
- Contributor earnings section lists their own authorized exceptions and recorded external payout status, separately from their existing wallet.
- Existing project budget and spend dashboard remains intact, with a separate Finance 2.0 exception-liability view.
- Backend RPC functions restricted by existing finance and scoped QA permissions, with private RLS-protected tables.
- A guard prevents Finance 2.0 payable exceptions from entering the legacy approved payment path until reconciled.
- Existing legacy approved-task payments, balances, and payout batches are not modified.

## Verified
- Supabase SQL migrations phase 2, 3, and 4 applied successfully; the earlier experimental private schema foundation is **not** applied.
- Backend read, rate update, review recommendation, authorization, manual-paid recording, and project dashboard were exercised in an SQL transaction that was rolled back. The test left zero rate rules, exception records, review recommendations or audit entries.
- Anonymous users have no direct table access; authenticated users cannot directly write the private finance tables.
- JavaScript syntax validated for entry pages and finance/review scripts.
- Vercel preview build succeeded. Browser-level QA, all role scenarios and actual money transfer testing remain outstanding.

## Not yet automated — intentionally
- Setting `valid_submission` or `review_complete` is **stored configuration**, not an automatic earning-accrual rule yet. Legacy approved work still follows the original payment processing.
- Finance 2.0 does **not** create or send bank transfers and does not alter the legacy contributor balance.
- Legacy project budget/spend calculations and finance exceptions are displayed separately; a unified cross-model spending reconciliation is not yet available.
- Non-generic task types (voice, transcription segments, application audio) require explicit payment mappings before enabling auto-accrual.
- No aggregator connected.

## Next acceptance gates before calling Finance 2.0 fully complete
1. End-to-end browser QA for super admin, finance staff, QA manager, contributor, and unauthorized user.
2. Agree and implement task-type mappings and unit measurements; only then activate pay-on-valid-submission and reviewer payment accrual.
3. Reconcile the exception ledger with the existing wallet, payout batches, budget reports, and any external payment processor.
4. Test historical rate snapshots, concurrency, refunds/adjustments, dispute handling and reconciliation with sample tasks.
5. Confirm legal/payment obligations and authorize provider integration.

## Rollout safety
No historical task balances are backfilled, no payments are executed automatically, and no legacy task is re-priced. Leave automated disbursement disabled. 
