# Release process

1. Build larger changes on `develop` or a feature branch.
2. Run the Platform smoke checks workflow.
3. Use the Vercel preview deployment to test Admin, Workspace, Transcription and Client Review flows.
4. Merge a tested batch to `main` instead of pushing many tiny production commits.
5. Confirm the Vercel production deployment is `READY`.
6. Verify critical production routes and assets.
7. Review Admin Operations Health and browser errors after release.

Critical user journeys to keep covered:
- Sign in → Workspace
- Workspace → assignment start
- Transcription claim → edit → save → submit
- Admin Overview / Access / Assignment Center
- Done Tasks → single and batch client links
- Client playback → note / rating / decision
- Approval → earnings → payout state
