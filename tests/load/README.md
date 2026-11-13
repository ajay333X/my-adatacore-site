# Adatacore dummy-user capacity test (read-only baseline)

This is a **protected test harness**, not an executed load-test result. Only use it with an independently deployed, explicitly isolated staging site. **Existing admin test accounts are NOT safe load-test identities**: their RPCs currently connect to the live Supabase project. Never run 500 simulated sandbox users against that database.

## Requirements

- Deploy a separate Vercel staging project or isolated preview with its own **separate Supabase project**, auth, storage and sanitized synthetic tasks.
- Confirm the staging hostname is not an alias of production and its environment variables do **not** point at the production Supabase project.
- Install Grafana k6 locally. No tokens or real user credentials should be put in the script.
- No production emails, payouts, webhook deliveries, and AI transcription charges from the staging environment.

## Run only after isolation verification

```sh
DUMMY_BASE_URL=https://your-isolated-staging.vercel.app DUMMY_ISOLATED_ENV=YES DUMMY_VUS=25 k6 run tests/load/dummy-readonly.js
```

After verifying the low-load run, repeat with 50, 100, 250 and 500 VUs, with a health and billing check between each step. This probes read-only page delivery only; it **does not** establish 500 authenticated concurrent workers, task claims, writes, recordings, or review queues.

Safety gate: the script rejects the known production hostname and aliases and requires an explicit isolation flag. The flag alone is **not proof** of backend isolation; verify deployment environment bindings before running.

Review metrics: p50/p95/p99 HTTP latency, request failures, server errors, DB CPU/connections, Vercel function invocation volume and bandwidth, Supabase egress/storage. Terminate immediately for sustained errors, unusual costs, DB saturation, or unexpected production activity.

## Next phase, after isolated dummy DB exists

Build a second authenticated k6 scenario with synthetic credentials for **distinct** accounts (never owner-impersonated sessions), each with isolated L1 and L2 test inventory. Validate exclusive claim atomicity, retry-safe submissions, review routing, audio object lifecycle and integrity. Never call live admin_sandbox_real_claim or any production queue as a load target.

### Acceptance criteria (initial engineering targets)

- Zero duplicate exclusive claims or lost submissions.
- Below 1% HTTP error rate; p95 under 1.5s for read-only page requests during 500 VU steady load (not an end-to-end UX metric).
- No sustained DB connection saturation or uncontrolled concurrency.
- A passing static read-only test must **not** be reported as 500-workflow-user readiness.
