import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_SITE_URL = 'https://www.adatacore.com'
const DEFAULT_FROM = 'Adatacore <applications@adatacore.com>'
const DEFAULT_LOGO_URL = 'https://www.adatacore.com/assets/adatacore-logo.jpg'

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function template(status: string, track: string, language: string, note: string | null, siteUrl: string, logoUrl: string, fullName: string | null) {
  const trackLabel = track === 'voice_acting' ? 'Voice Acting' : 'Transcription'
  const appUrl = `${siteUrl.replace(/\/$/, '')}/apply`
  const workspaceUrl = `${siteUrl.replace(/\/$/, '')}/workspace`
  const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'there'

  let subject = 'Application update from Adatacore'
  let eyebrow = 'Application update'
  let heading = 'Your application has been updated'
  let intro = `There is an update on your ${language} ${trackLabel} application.`
  let cta = 'Open application'
  let ctaUrl = appUrl
  let statusLabel = 'Updated'

  if (status === 'changes_requested') {
    subject = `Action required: retry your ${trackLabel} assessment`
    eyebrow = 'Action required'
    heading = 'Please retry your assessment'
    intro = `Your ${language} ${trackLabel} assessment needs another attempt before we can continue the review.`
    cta = 'Retry assessment'
    ctaUrl = appUrl
    statusLabel = 'Retry requested'
  } else if (status === 'approved') {
    subject = `${trackLabel} application approved`
    eyebrow = 'Application approved'
    heading = 'You’re approved'
    intro = `Your ${language} ${trackLabel} assessment has been approved. Any mapped project access is now available in your Workspace.`
    cta = 'Open Workspace'
    ctaUrl = workspaceUrl
    statusLabel = 'Approved'
  } else if (status === 'rejected') {
    subject = `Update on your ${trackLabel} application`
    eyebrow = 'Application reviewed'
    heading = 'Your application has been reviewed'
    intro = `Your ${language} ${trackLabel} application was not approved at this time.`
    cta = 'View application'
    ctaUrl = appUrl
    statusLabel = 'Not approved'
  }

  const feedback = note?.trim()
    ? `<tr><td style="padding:0 36px 8px"><div style="margin-top:8px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#667085;margin-bottom:8px">Reviewer feedback</div><div style="font-size:15px;line-height:1.65;color:#1f2937;white-space:pre-wrap">${escapeHtml(note.trim())}</div></div></td></tr>`
    : ''

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8">
      <tr>
        <td align="center" style="padding:36px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(17,24,39,.06)">
            <tr>
              <td style="padding:24px 36px;border-bottom:1px solid #eef0f3;background:#ffffff">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle">
                      <img src="${escapeHtml(logoUrl)}" alt="Adatacore" width="44" height="44" style="display:block;border:0;border-radius:10px;object-fit:cover">
                    </td>
                    <td valign="middle" style="padding-left:12px;font-size:21px;font-weight:700;letter-spacing:-.02em;color:#111827">Adatacore</td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;padding:7px 10px;border-radius:999px;background:#f3f4f6;font-size:12px;font-weight:700;color:#374151">${escapeHtml(statusLabel)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:36px 36px 18px">
                <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:12px">${escapeHtml(eyebrow)}</div>
                <h1 style="font-size:28px;line-height:1.25;letter-spacing:-.02em;margin:0 0 16px;color:#111827">${escapeHtml(heading)}</h1>
                <p style="font-size:15px;line-height:1.7;color:#4b5563;margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
                <p style="font-size:15px;line-height:1.7;color:#4b5563;margin:0">${escapeHtml(intro)}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 36px 8px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;background:#ffffff">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #eef0f3;width:42%">Assessment</td>
                    <td style="padding:14px 16px;font-size:13px;font-weight:700;color:#111827;border-bottom:1px solid #eef0f3">${escapeHtml(trackLabel)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#6b7280">Language</td>
                    <td style="padding:14px 16px;font-size:13px;font-weight:700;color:#111827">${escapeHtml(language)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            ${feedback}

            <tr>
              <td style="padding:20px 36px 36px">
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 20px;border-radius:9px">${escapeHtml(cta)}</a>
                <p style="font-size:13px;line-height:1.65;color:#6b7280;margin:22px 0 0">If the button does not work, sign in to Adatacore and open your application from the Workspace.</p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 36px;background:#fafafa;border-top:1px solid #eef0f3">
                <p style="font-size:12px;line-height:1.65;color:#8a94a6;margin:0">This is an automated transactional message about your Adatacore application. Please do not share assessment links or account access with anyone else.</p>
                <p style="font-size:12px;line-height:1.65;color:#8a94a6;margin:10px 0 0">© Adatacore · ${escapeHtml(siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const webhookSecret = Deno.env.get('APPLICATION_EMAIL_WEBHOOK_SECRET')
  if (webhookSecret && req.headers.get('x-application-email-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!resendApiKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing required server configuration' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }

  const payload = await req.json().catch(() => null)
  const record = payload?.record ?? payload
  if (!record?.id || !['changes_requested', 'approved', 'rejected'].includes(record.status)) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userRow, error: userError } = await admin.from('users').select('email, "fullName"').eq('id', record.user_id).maybeSingle()
  if (userError || !userRow?.email) {
    return new Response(JSON.stringify({ error: 'Applicant email not found' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }

  const siteUrl = Deno.env.get('SITE_URL') || DEFAULT_SITE_URL
  const from = Deno.env.get('APPLICATION_EMAIL_FROM') || DEFAULT_FROM
  const logoUrl = Deno.env.get('APPLICATION_EMAIL_LOGO_URL') || DEFAULT_LOGO_URL
  const { subject, html } = template(record.status, record.track, record.language_label || record.language_code || 'application', record.reviewer_note || null, siteUrl, logoUrl, userRow.fullName || null)

  const send = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      'content-type': 'application/json',
      'Idempotency-Key': `adatacore-application-decision/${record.id}/${record.status}/${record.reviewed_at || record.updated_at || 'latest'}`
    },
    body: JSON.stringify({ from, to: [userRow.email], subject, html })
  })

  const body = await send.text()
  if (!send.ok) {
    return new Response(JSON.stringify({ error: 'Email provider rejected request', provider_response: body }), { status: 502, headers: { 'content-type': 'application/json' } })
  }

  return new Response(body || JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
})
