# Account control checks

Run `node tests/phone-fields.test.cjs` for country mismatch, formatting, missing-country and invalid-input checks.

The Supabase migration is in `supabase/migrations/20260901090115_finish_account_phone_and_daily_limits.sql`. It builds on the account-control schema already present in the Adatacore database. Apply using the normal migration workflow.

Run `tests/account-controls.sql` inside `BEGIN; ... ROLLBACK;` on a database with that migration applied. It creates temporary test fixtures in the transaction and checks phone validation, privilege restrictions, task/review consumption, resumes, UTC reset, zero/unlimited limits, direct submission and voice-session task mapping. Do not commit the test transaction.

Daily limits apply to new task starts and individual review claims. Resuming the same work does not consume another slot. Day boundaries use UTC; participant and admin controls display 05:30 IST as the corresponding reset time. Existing limits are preserved, and unset limits remain unlimited.
