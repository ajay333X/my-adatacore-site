# Adatacore Supabase Auth email templates

These templates are intentionally short and transactional for better deliverability. They use Supabase's `{{ .ConfirmationURL }}` variable so the existing client-side confirmation/recovery flow continues to work.

> Activation note: paste the relevant HTML into Supabase Dashboard → Authentication → Emails → Templates. The repository cannot change hosted Supabase Auth templates by itself.

## Confirm signup

**Subject:** Confirm your Adatacore email

```html
<div style="margin:0;padding:32px 16px;background:#f5f5f8;font-family:Inter,Arial,sans-serif;color:#17171f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5ec;border-radius:18px;overflow:hidden">
    <div style="padding:22px 26px;background:#0b0b16;color:#fff">
      <div style="font-size:20px;font-weight:800;letter-spacing:-.03em">Adatacore</div>
      <div style="margin-top:5px;font-size:11px;color:#c4b5fd">Secure workspace access</div>
    </div>
    <div style="padding:28px 26px">
      <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">Confirm your email address</h1>
      <p style="font-size:14px;line-height:1.65;color:#5f5f6d;margin:0 0 22px">Confirm this email address to finish setting up your Adatacore account.</p>
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Confirm email</a>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:22px 0 0">If you did not create an Adatacore account, you can ignore this email.</p>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:8px 0 0"><strong>Can't find this message later?</strong> Please check your Spam or Junk folder as well.</p>
    </div>
  </div>
  <div style="max-width:560px;margin:12px auto 0;text-align:center;font-size:10px;color:#90909c">Adatacore · Secure transactional email</div>
</div>
```

## Reset password

**Subject:** Reset your Adatacore password

```html
<div style="margin:0;padding:32px 16px;background:#f5f5f8;font-family:Inter,Arial,sans-serif;color:#17171f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5ec;border-radius:18px;overflow:hidden">
    <div style="padding:22px 26px;background:#0b0b16;color:#fff">
      <div style="font-size:20px;font-weight:800;letter-spacing:-.03em">Adatacore</div>
      <div style="margin-top:5px;font-size:11px;color:#c4b5fd">Account recovery</div>
    </div>
    <div style="padding:28px 26px">
      <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">Reset your password</h1>
      <p style="font-size:14px;line-height:1.65;color:#5f5f6d;margin:0 0 22px">We received a request to reset your Adatacore password. Use the secure link below to choose a new password.</p>
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Choose a new password</a>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:22px 0 0">If you did not request a password reset, you can ignore this email and your password will stay unchanged.</p>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:8px 0 0"><strong>Don't see the email in your inbox?</strong> Please check your Spam or Junk folder as well.</p>
    </div>
  </div>
  <div style="max-width:560px;margin:12px auto 0;text-align:center;font-size:10px;color:#90909c">Adatacore · Secure transactional email</div>
</div>
```

## Magic link

**Subject:** Your secure Adatacore sign-in link

```html
<div style="margin:0;padding:32px 16px;background:#f5f5f8;font-family:Inter,Arial,sans-serif;color:#17171f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5ec;border-radius:18px;overflow:hidden">
    <div style="padding:22px 26px;background:#0b0b16;color:#fff"><div style="font-size:20px;font-weight:800">Adatacore</div></div>
    <div style="padding:28px 26px">
      <h1 style="font-size:22px;margin:0 0 12px">Sign in securely</h1>
      <p style="font-size:14px;line-height:1.65;color:#5f5f6d;margin:0 0 22px">Use this one-time link to access your Adatacore account.</p>
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Sign in to Adatacore</a>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:22px 0 0">If you did not request this link, you can ignore this message.</p>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:8px 0 0">Please check your Spam or Junk folder if an expected Adatacore email is not visible in your inbox.</p>
    </div>
  </div>
</div>
```

## Invite user

**Subject:** You're invited to Adatacore

```html
<div style="margin:0;padding:32px 16px;background:#f5f5f8;font-family:Inter,Arial,sans-serif;color:#17171f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5ec;border-radius:18px;overflow:hidden">
    <div style="padding:22px 26px;background:#0b0b16;color:#fff"><div style="font-size:20px;font-weight:800">Adatacore</div><div style="margin-top:5px;font-size:11px;color:#c4b5fd">Workspace invitation</div></div>
    <div style="padding:28px 26px">
      <h1 style="font-size:22px;margin:0 0 12px">You've been invited</h1>
      <p style="font-size:14px;line-height:1.65;color:#5f5f6d;margin:0 0 22px">Use the secure invitation below to continue to Adatacore.</p>
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Accept invitation</a>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:22px 0 0">If you weren't expecting an invitation, you can ignore this email.</p>
      <p style="font-size:12px;line-height:1.6;color:#777785;margin:8px 0 0">Please check your Spam or Junk folder if an expected Adatacore email is not visible in your inbox.</p>
    </div>
  </div>
</div>
```
