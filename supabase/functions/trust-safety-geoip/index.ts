import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

function cors(origin: string | null) {
  const allowed = !!origin && (
    origin === "https://adatacore.com" ||
    origin === "https://www.adatacore.com" ||
    /^https:\/\/[-a-z0-9]+-ajays-projects-42da78a5\.vercel\.app$/i.test(origin)
  );
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://adatacore.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "Authentication required" }, 401, origin);

  try {
    const accessRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_admin_access`, {
      method: "POST",
      headers: {
        "Authorization": auth,
        "apikey": ANON_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!accessRes.ok) return json({ error: "Unable to verify Admin access" }, 403, origin);
    const access = await accessRes.json();
    if (!access?.allowed || !access?.is_super_admin) return json({ error: "Super Admin access required" }, 403, origin);

    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.ips) ? body.ips : [];
    const ips = [...new Set(raw.map((v: unknown) => String(v || "").trim()).filter((v: string) => v.length > 0 && v.length <= 64 && /^[0-9a-f:.]+$/i.test(v)))].slice(0, 12);
    if (!ips.length) return json({ results: [] }, 200, origin);

    const results: Record<string, unknown>[] = [];
    for (const ip of ips) {
      try {
        const url = `https://ipwho.is/${encodeURIComponent(ip)}?fields=ip,success,message,type,continent,continent_code,country,country_code,region,region_code,city,latitude,longitude,postal,flag,connection,timezone`;
        const response = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "Adatacore-TrustSafety/1.0" } });
        if (!response.ok) {
          results.push({ ip, success: false, message: response.status === 429 ? "GeoIP daily lookup limit reached" : `GeoIP lookup failed (${response.status})` });
          continue;
        }
        const x = await response.json();
        if (!x?.success) {
          results.push({ ip, success: false, message: x?.message || "Location unavailable" });
          continue;
        }
        results.push({
          ip,
          success: true,
          type: x.type || null,
          continent: x.continent || null,
          continent_code: x.continent_code || null,
          country: x.country || null,
          country_code: x.country_code || null,
          region: x.region || null,
          region_code: x.region_code || null,
          city: x.city || null,
          latitude: Number.isFinite(x.latitude) ? x.latitude : null,
          longitude: Number.isFinite(x.longitude) ? x.longitude : null,
          postal: x.postal || null,
          flag_emoji: x.flag?.emoji || null,
          asn: x.connection?.asn || null,
          organization: x.connection?.org || null,
          isp: x.connection?.isp || null,
          domain: x.connection?.domain || null,
          timezone: x.timezone?.id || null,
          timezone_abbr: x.timezone?.abbr || null,
          utc_offset: x.timezone?.utc || null,
        });
      } catch (error) {
        results.push({ ip, success: false, message: String(error?.message || "Location lookup failed") });
      }
    }

    return json({
      results,
      provider: "ipwho.is",
      approximate: true,
      note: "IP geolocation is approximate and can reflect a VPN, mobile carrier gateway, ISP routing location or other network infrastructure rather than the user's physical location.",
    }, 200, origin);
  } catch (error) {
    return json({ error: String(error?.message || "Trust & Safety GeoIP lookup failed") }, 500, origin);
  }
});
