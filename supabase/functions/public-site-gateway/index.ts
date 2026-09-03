import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const allowedOrigins = new Set(["https://www.adatacore.com", "https://adatacore.com"]);
const allowedEvents = new Set(["page_view","project_inquiry_open","project_inquiry_submit_success","project_inquiry_submit_error","contributor_cta","teams_cta","trust_cta","help_cta"]);

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://www.adatacore.com",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8"
});
const json = (body: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), { status, headers: cors(origin) });
const clean = (v: unknown, max: number) => String(v ?? "").trim().replace(/\u0000/g, "").slice(0, max);
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,"0")).join("");
}
function clientIp(req: Request) {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400, origin); }
  const action = clean(body?.action, 40);

  if (action === "event") {
    const eventName = clean(body?.event_name, 80);
    if (!allowedEvents.has(eventName)) return json({ error: "Invalid event" }, 400, origin);
    const session = clean(body?.session_id, 120);
    const { error } = await db.rpc("public_log_site_event", {
      p_event_name: eventName,
      p_page_path: clean(body?.page_path, 240) || "/",
      p_referrer_host: clean(body?.referrer_host, 180) || null,
      p_session_hash: session ? await sha256(session) : null
    });
    if (error) { console.error("site event", error.message); return json({ ok: false }, 500, origin); }
    return json({ ok: true }, 200, origin);
  }

  if (action !== "inquiry") return json({ error: "Invalid action" }, 400, origin);
  if (clean(body?.website, 200)) return json({ ok: true }, 200, origin);

  const fullName = clean(body?.full_name, 120);
  const companyName = clean(body?.company_name, 160);
  const email = clean(body?.email, 254).toLowerCase();
  const stage = clean(body?.project_stage, 120) || null;
  const details = clean(body?.project_details, 5000);
  const startedAt = Number(body?.started_at || 0);
  if (fullName.length < 2 || companyName.length < 2 || !emailOk(email) || details.length < 10) return json({ error: "Please complete all required fields." }, 400, origin);
  if (startedAt && Date.now() - startedAt < 1200) return json({ error: "Please review the form and try again." }, 400, origin);

  const rateKey = await sha256(`${clientIp(req)}|${email}`);
  const { data: rate, error: rateError } = await db.rpc("public_inquiry_rate_limit_hit", { p_key_hash: rateKey, p_limit: 4, p_window_seconds: 3600 });
  if (rateError) { console.error("rate limit", rateError.message); return json({ error: "Unable to submit right now." }, 503, origin); }
  if (rate?.allowed === false) return json({ error: "Too many requests. Please try again later." }, 429, origin);

  const { error } = await db.from("company_inquiries").insert({ full_name: fullName, company_name: companyName, email, budget_range: stage, project_details: details });
  if (error) { console.error("inquiry insert", error.message); return json({ error: "We could not submit your inquiry right now. Please try again." }, 500, origin); }
  return json({ ok: true }, 201, origin);
});
