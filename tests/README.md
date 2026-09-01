# Account control checks

Run `node tests/phone-fields.test.cjs` for country mismatch, formatting, missing-country and invalid-input checks.

The Supabase migration is in `supabase/migrations/20260901090115_finish_account_phone_and_daily_limits.sql`. It builds on the account-control schema already present in the Adatacore database. Apply using the normal migration workflow.

Run `tests/account-controls.sql` inside `BEGIN; ... ROLLBACK;` on a database with that migration applied. It creates temporary test fixtures in the transaction and checks phone validation, privilege restrictions, task/review consumption, resumes, UTC reset, zero/unlimited limits, direct submission and voice-session task mapping. Do not commit the test transaction.

Daily limits apply to new task starts and individual review claims. Resuming the same work does not consume another slot. Day boundaries use UTC; participant and admin controls display 05:30 IST as the corresponding reset time. Existing limits are preserved, and unset limits remain unlimited.
# Transcription workflow verification

Run `node tests/transcription-model.test.cjs` for timing, speaker overlaps, split/merge and exports.
With `jsdom@26.1.0` available, run `node tests/transcription-ui.test.cjs` and `node tests/transcription-lab.test.cjs` for editor and admin controls. The editor check covers typing while an earlier autosave is pending.

Run `transcription-workflow.sql` inside `BEGIN; … ROLLBACK;` after the transcription migration. It creates synthetic users and checks imports, duplicate prevention, external upload registration, L1/L2 assignment, direct storage RLS, quotas, stale draft conflicts, submitted-state locks, reviewer return and approval. It never persists fixtures. Existing recordings are referenced temporarily and left unchanged.

`transcription-preview-data.js` supplies synthetic, in-memory audio for optional visual checks. It is excluded from production by `.vercelignore`; do not add it to a production entry point. The remote browser required sign-in and could not complete a reliable authenticated visual check in this session.
