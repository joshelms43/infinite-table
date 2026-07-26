// supabase/functions/register/index.ts
// Username + password registration with ZERO email. (M Deal accounts)
//
// Why this exists at all:
//   Supabase's public /signup endpoint sends a confirmation mail, and the
//   built-in SMTP allows 2 per hour. That limit is what made sign-up
//   unusable. The admin API below never sends mail of any kind — accounts
//   are minted server-side, already confirmed. There is no verification
//   step to rate-limit, so the ceiling cannot be reached.
//
//   The address is synthetic (`name@coastline.game`). It is an internal
//   primary key, never a mailbox. Nothing is ever delivered to it.
//
// This function also mints the profile row, using the service role, so a
// fresh account is complete the moment it exists. Doing it here rather than
// from the browser removes an RLS-shaped failure the client could not report.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function friendCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Health probe: lets the client tell "not deployed" from "deployed but failing".
  if (req.method === "GET") return json({ ok: true, service: "register", email: "never" });

  if (req.method !== "POST") return json({ ok: false, err: "method" }, 405);

  let username: unknown, password: unknown;
  try {
    ({ username, password } = await req.json());
  } catch {
    return json({ ok: false, err: "badjson" }, 400);
  }

  const u = String(username ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
  if (u.length < 3) return json({ ok: false, err: "username" }, 400);
  if (typeof password !== "string" || password.length < 6) return json({ ok: false, err: "password" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, err: "serverconfig" }, 500);

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Mint the account, pre-confirmed. email_confirm:true is the switch that
  //    means "no verification mail" — do not remove it.
  const created = await admin.auth.admin.createUser({
    email: `${u}@coastline.game`,
    password,
    email_confirm: true,
    user_metadata: { username: u },
  });

  if (created.error) {
    const msg = created.error.message || "";
    if (/already|exists|registered|duplicate/i.test(msg)) return json({ ok: false, err: "taken" }, 409);
    return json({ ok: false, err: "create", detail: msg.slice(0, 140) }, 500);
  }

  const id = created.data.user?.id;
  if (!id) return json({ ok: false, err: "nouser" }, 500);

  // 2. Mint the profile. Friend codes are unique, so retry a few collisions.
  let profileErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const ins = await admin.from("profiles").insert({ id, name: u.slice(0, 12), friend_code: friendCode() });
    if (!ins.error) { profileErr = ""; break; }
    profileErr = ins.error.message || "insert failed";
    if (!/friend_code/.test(profileErr)) break;   // not a code collision — retrying won't help
  }

  // A missing profile is recoverable: the client creates one on first init.
  // Report it rather than failing the whole registration.
  return json({ ok: true, username: u, profile: profileErr ? false : true, note: profileErr.slice(0, 140) || undefined });
});
