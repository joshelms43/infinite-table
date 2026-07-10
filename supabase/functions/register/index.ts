// supabase/functions/register/index.ts
// Username + password registration with zero email.
// The public /signup endpoint validates email deliverability (MX), which
// rejects our synthetic addresses. The admin API does not — so accounts
// are created here, server-side, pre-confirmed.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const bad = (msg: string, code = 400) =>
    new Response(JSON.stringify({ ok: false, err: msg }), { status: code, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { username, password } = await req.json();
    const u = String(username || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
    if (u.length < 3) return bad("username");
    if (typeof password !== "string" || password.length < 6) return bad("password");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { error } = await admin.auth.admin.createUser({
      email: `${u}@coastline.game`,
      password,
      email_confirm: true,
      user_metadata: { username: u },
    });

    if (error) {
      const taken = /already|exists|registered|duplicate/i.test(error.message);
      return bad(taken ? "taken" : error.message, taken ? 409 : 500);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (_e) {
    return bad("bad request");
  }
});
