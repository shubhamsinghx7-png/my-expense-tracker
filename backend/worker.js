// stash AI advisor - Cloudflare Worker (live at https://stash-ai.shubhamsinghpage.workers.dev)
//
// What this does:
//   1. Accepts ONLY the weekly summary shape (see summary-schema.md).
//      No notes, no names, no free text - anything else is rejected.
//   2. Caps calls per day so the public endpoint can't be abused.
//   3. Asks a Workers AI model (same account, no external API key) to
//      pick ONE fact and suggest ONE small experiment.
//   4. Returns strict JSON: { "pattern_id", "suggestion" }.
//      The app renders every rupee figure itself from local data -
//      the model's text is never allowed to contain digits.
//
// Secrets/config: none in code. MODEL is an env var picked from the
// Workers AI catalog at deploy time.

const MAX_BYTES = 2048;
const DAILY_CAP = 12;              // generous for one user, tiny for abuse
const CATEGORY_ENUM = new Set(["food","travel","shopping","bills","college","fun","other"]);
const FACT_KINDS = new Set(["biggest_category","wants_majority","pace","no_budget","low_data"]);

function num(v, min, max) {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function validSummary(s) {
  if (!s || typeof s !== "object") return false;
  if (s.v !== 1) return false;
  if (!s.week || typeof s.week.start !== "string" || typeof s.week.end !== "string") return false;
  if (!num(s.week.days_elapsed, 1, 7)) return false;
  if (s.budget !== null && !num(s.budget, 1, 1000000)) return false;
  if (!num(s.spent_total, 0, 1000000)) return false;
  if (!num(s.entry_count, 0, 500)) return false;
  if (!s.categories || typeof s.categories !== "object") return false;
  for (const [k, v] of Object.entries(s.categories)) {
    if (!CATEGORY_ENUM.has(k) || !num(v, 0, 1000000)) return false;
  }
  if (!num(s.needs, 0, 1000000) || !num(s.wants, 0, 1000000)) return false;
  if (s.pace_projection !== null && !num(s.pace_projection, 0, 1000000)) return false;
  if (!Array.isArray(s.facts) || s.facts.length < 1 || s.facts.length > 8) return false;
  const ids = new Set();
  for (const f of s.facts) {
    if (!f || typeof f.id !== "string" || !/^P[1-8]$/.test(f.id)) return false;
    if (!FACT_KINDS.has(f.kind)) return false;
    if (ids.has(f.id)) return false;
    ids.add(f.id);
    for (const [k, v] of Object.entries(f)) {   // no string values beyond id/kind/category
      if (["id","kind","category"].includes(k)) continue;
      if (typeof v === "boolean") continue;
      if (!num(v, 0, 1000000)) return false;
    }
    if ("category" in f && !CATEGORY_ENUM.has(f.category)) return false;
  }
  return true;
}

const SYSTEM = [
  "You advise on one personal spending summary per request.",
  "Reply with ONLY a JSON object: {\"pattern_id\": \"...\", \"suggestion\": \"...\"}.",
  "pattern_id must be one of the fact ids provided.",
  "The facts list is ordered by the app, most relevant first.",
  "Always use the FIRST fact: set pattern_id to its id. Never pick a later one.",
  "If the chosen fact is kind pace, say the projection is only an estimate.",
  "The suggestion: 1-2 friendly sentences proposing ONE small experiment for next week.",
  "Rules: no digits anywhere, no amounts, no percentages, no shame or judgement,",
  "no new facts, no guarantees. Plain warm words, lowercase style is fine."
].join(" ");

// CORS: browsers send a preflight OPTIONS before the app can POST.
// Only the app's own origins may call - the GitHub Pages app and
// local test servers. Anything else gets no allow-header and the
// browser blocks it there.
const ALLOWED_ORIGINS = new Set([
  "https://shubhamsinghx7-png.github.io",
  "http://127.0.0.1:8611",
  "http://localhost:8611"
]);
function cors(request, extra) {
  const origin = request.headers.get("Origin") || "";
  const h = new Headers(extra);
  if (ALLOWED_ORIGINS.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  return h;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request, {
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400"
      }) });
    }
    if (request.method !== "POST") return new Response("method", { status: 405 });
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return new Response("too large", { status: 413 });

    let body;
    try { body = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
    if (!validSummary(body)) return new Response("bad shape", { status: 400 });

    // daily cap (Workers KV binding: STASH_LIMITS)
    const day = new Date().toISOString().slice(0, 10);
    const key = "calls:" + day;
    const used = Number(await env.STASH_LIMITS.get(key)) || 0;
    if (used >= DAILY_CAP) return new Response("quiet day", { status: 429, headers: cors(request) });
    // counter increments only after a successful, validated answer (below)

    const userPrompt = "Weekly summary (aggregates only):\n" + JSON.stringify(body);

    let out;
    try {
      out = await env.AI.run(env.MODEL, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 160
      });
    } catch {
      return new Response("model unavailable", { status: 502 });
    }

    const rawR = out && out.response;
    // some models return the JSON already parsed (object), others as text (possibly fenced)
    let parsed = null;
    if (rawR && typeof rawR === "object") {
      parsed = rawR;
    } else {
      const text = typeof rawR === "string" ? rawR : "";
      const jm = text.match(/\{[\s\S]*\}/);
      try { parsed = JSON.parse(jm ? jm[0] : ""); } catch { return new Response("model off-script", { status: 502 }); }
    }
    if (!parsed || typeof parsed !== "object") return new Response("model off-script", { status: 502 });
    const okId = body.facts.some(f => f.id === parsed.pattern_id);
    const clean = typeof parsed.suggestion === "string"
      && parsed.suggestion.length <= 280
      && !/[0-9]/.test(parsed.suggestion);       // no digits = no invented numbers
    if (!okId || !clean) return new Response("model off-script", { status: 502 });

    ctx.waitUntil(env.STASH_LIMITS.put(key, String(used + 1), { expirationTtl: 172800 }));
    return new Response(JSON.stringify({ pattern_id: parsed.pattern_id, suggestion: parsed.suggestion }), {
      status: 200,
      headers: cors(request, { "Content-Type": "application/json" })
    });
  }
};
