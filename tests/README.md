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

# AI transcription drafts

Server code: `supabase/functions/transcription-ai/`. It uses the built-in Fetch API, with no third-party runtime dependencies. Deploy with `verify_jwt=false`: the body validates an expiring, single-use ticket against a job that only an administrator or enabled import trigger can enqueue. Worker database RPCs are executable only by `service_role`. The response never contains audio, a transcript, a secret or a reusable credential. pg_net is platform-managed; queue payloads contain only an already-authorized job ticket, not a provider/service-role key.

Set `OPENAI_API_KEY` in Supabase Edge Function secrets. The server uses `gpt-4o-transcribe-diarize`, `diarized_json`, `chunking_strategy=auto`, and an optional source-language hint. This is original-language transcription, not translation. All AI speaker lanes initially map to channel 0 because diarization does not identify physical audio channels.

Apply `20260901114802_transcription_ai_drafts.sql` after the original transcription migration. The cron job `transcription-ai-dispatch` runs every minute, starts at most two workers concurrently and marks abandoned jobs failed after five minutes. Provider requests time out after 95 seconds and are not retried automatically to avoid duplicate charges. Explicit retries create new jobs. Cancelling affects only queued/dispatched jobs. Pausing a project prevents new queued jobs from starting; a job already running may finish as a reference without prefilling.

Limits: 24,000,000 bytes, known duration <=15 minutes, <=3,000 segments, <=12 speakers, <=500 draft requests per project per UTC day. Unknown-duration legacy files are byte-bounded and subject to the provider timeout; returned durations over 15 minutes fail without changing the transcript. No automatic chunking/transcoding is included. Unsupported/oversized modules still support manual transcription.

Automatic drafting is opt-in per project, only for future imports. Existing modules require explicit selection. A result may prefill only a revision-zero, unassigned, empty module. Assignment or human edits during generation cause the result to remain reference-only. Regeneration preserves older AI baselines. The editor's “AI original” shows the latest successful baseline; earlier versions remain in the private job history. “Use in empty transcript” requires an empty, saved, editable L1/admin transcript and uses the existing optimistic-version autosave and undo protections. AI generation does not consume participant task allowances or mark tasks submitted.

The connection check verifies key/model access via the model endpoint without sending recordings; it does not verify prepaid credit or transcript accuracy. Provider quota errors are shown on individual draft jobs.

Run:

```sh
node tests/transcription-ai.test.mjs
node tests/transcription-model.test.cjs
node tests/transcription-ui.test.cjs
node tests/transcription-lab.test.cjs
node tests/transcription-ai-lab.test.cjs
```

The DOM tests require `jsdom@26.1.0`. Run `tests/transcription-ai.sql` inside `BEGIN; ... ROLLBACK;` after the migration. It verifies prefill, replay rejection, duplicate suppression, regeneration, concurrent assignment protection, imports, access revocation and size limits. Outgoing pg_net calls cannot escape a rolled-back test transaction. Also rerun the original transcription and account-control SQL checks.

Security advisories: private `app_private.transcription_ai_jobs` deliberately has RLS with no client policies and no client grants. Authenticated SECURITY DEFINER entry points are intentional checked APIs, with admin/assignment checks and empty search paths. Do not grant clients access to worker RPCs or private tables to silence the linter.
