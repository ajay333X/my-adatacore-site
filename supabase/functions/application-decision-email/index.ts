import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_SITE_URL = 'https://www.adatacore.com'
const DEFAULT_FROM = 'Adatacore <noreply@adatacore.com>'

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function template(status: string, track: string, language: string, note: string | null, siteUrl: string) {
  const trackLabel = track === 'voice_acting' ? 'Voice Acting' : 'Transcription'
  const appUrl = `${siteUrl.replace(/\/$/, '')}/apply`
  let subject = 'Application update from Adatacore'
  let heading = 'Your application has been updated'
  let intro = `There is an update on your ${language} ${trackLabel} application.`
  let cta = 'Open application'

  if (status === 'changes_requested') {
    subject = `Action required: retry your ${trackLabel} assessment`
    heading = 'Please retry your assessment'
    intro = `Your ${language} ${trackLabel} assessment needs another attempt before we can continue the review.`
    cta = 'Retry assessment'
  } else if (status === 'approved') {
    subject = `${trackLabel} application approved`
    heading = 'Your application is approved'
    intro = `Your ${language} ${trackLabel} assessment has been approved. Any mapped project access is now available in your Workspace.`
    cta = 'Open Workspace'
  } else if (status === 'rejected') {
    subject = `Update on your ${trackLabel} application`
    heading = 'Your application has been reviewed'
    intro = `Your ${language} ${trackLabel} application was not approved at this time.`
  }

  const feedback = note?.trim()
    ? `<div style="margin:24px 0;padding:16px 18px;background:#f6f7f9;border-radius:10px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#667085;margin-bottom:8px">Reviewer feedback</div><div style="font-size:15px;line-height:1.6;color:#1d2939;white-space:pre-wrap">${escapeHtml(note.trim())}</div></div>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#101828"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #eaecf0;border-radius:14px"><tr><td style="padding:32px"><div style="font-size:22px;font-weight:700;margin-bottom:18px">Adatacore</div><h1 style="font-size:24px;line-height:1.3;margin:0 0 14px">${escapeHtml(heading)}</h1><p style="font-size:15px;line-height:1.6;color:#475467;margin:0">${escapeHtml(intro)}</p>${feedback}<a href="${escapeHtml(appUrl)}" style="display:inline-block;margin-top:24px;background:#111827;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">${escapeHtml(cta)}</a><p style="font-size:12px;line-height:1.6;color:#98a2b3;margin:28px 0 0">This message was sent because the status of your Adatacore application changed.</p></td></tr></table></td></tr></table></body></html>`

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
  const { subject, html } = template(record.status, record.track, record.language_label || record.language_code || 'application', record.reviewer_note || null, siteUrl)

  const send = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [userRow.email], subject, html })
  })

  const body = await send.text()
  if (!send.ok) {
    return new Response(JSON.stringify({ error: 'Email provider rejected request', provider_response: body }), { status: 502, headers: { 'content-type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
})
