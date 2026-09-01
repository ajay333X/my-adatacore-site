# Security hardening status

## Applied
- Anonymous execution revoked from Admin-only `admin_*`, `tx_admin_*`, and `is_active_admin` RPCs.
- Authenticated browser error reporting uses a JWT-protected Edge Function.
- Client review decision/comment/rating tables are not directly granted to anon/authenticated roles; public review access remains token-mediated through Edge Functions.
- New private operational/finance tables use RLS and no direct client grants.

## Pending explicit approval
Supabase currently flags `app_private.admin_emails` because RLS is disabled.

The only application dependency found is `app_private.handle_new_user()`, a `SECURITY DEFINER` trigger function that reads `admin_emails` to decide whether a new account is an Admin. The safe candidate migration is:

```sql
ALTER TABLE app_private.admin_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.admin_emails FROM anon, authenticated;
```

No direct client policy is expected to be necessary because the new-user trigger runs as a security definer. This must still be validated before production execution.

## Pending account-level configuration
- Enable Supabase Auth leaked-password protection.
- Review password strength and MFA policy for Admin accounts.
