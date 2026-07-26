# One-time setup steps (Josh)

## THE GOLDEN RULE
**The files Claude shows you in chat are backups and test files — you never need to paste them anywhere.** Everything that needs deploying deploys itself when Claude pushes to GitHub (Vercel picks it up automatically). There is exactly ONE manual step in this whole project, and it's step 1 below.

## What needs nothing from you
- **M Deal** — no setup. Ever.
- **Mafia** — no setup. No SQL, no functions, no tables. It uses the same channels M Deal already uses.
- **Anything ending in .js from the tests folder** (netsim, mafiasim, etc.) — these run on Claude's machine before every push. They are not for Supabase, not for anywhere.

## 1. Accounts — deploy the register Edge Function
**Accounts are M Deal only for now.** The lobby is guest-first and asks nothing.
Sign-in lives at `/coastline/` → profile chip.

**Edge Functions do NOT deploy from a GitHub push.** Vercel deploys the site;
Supabase does not watch this repo. Pushing `index.ts` changes nothing on the
server. This step is manual, and it is the one thing that makes sign-up work.

**This is TypeScript, not SQL — it does not go in the SQL editor.** (Pasting it
there errors on line 1 at `import`.)

### Check whether it is already deployed — 5 seconds, phone is fine
Open this in any browser:

```
https://spkhqgzgnzeeizxrycjq.supabase.co/functions/v1/register
```

- **`{"ok":true,"service":"register","email":"never"}`** → deployed and healthy. Skip to step 3 below.
- **401 / "Missing authorization header"** → deployed. Fine — the app sends the key.
- **404 / "NOT_FOUND" / "Function not found"** → **not deployed.** This is why sign-up fails. Do the steps below.

### Deploy it
1. Supabase Dashboard → your project → **Edge Functions** (left sidebar, ⚡ icon)
2. **Deploy a new function** → choose "Via Editor"
3. Name it exactly: `register` (lowercase, no spaces — the URL is built from this)
4. Delete the template code, paste the entire contents of `supabase/functions/register/index.ts`
5. **Deploy**. No secrets to configure — the service key is injected automatically.
6. Re-open the URL above. It should now answer `{"ok":true,...}`.
7. Test: M Deal → profile chip → username + password → Create Account.

### If sign-up still fails, the screen now names the cause
The old build printed `SIGN UP: FAILED` for everything, which is why a function
that was never deployed looked exactly like a typo'd password. It now says:

| On screen | Means |
|---|---|
| `SIGN UP OFFLINE` | the function is not deployed (404) — do the steps above |
| `SIGN UP REJECTED` | Supabase refused the anon key — check `shared/config.js` |
| `SERVER NOT CONFIGURED` | the function deployed but has no service-role key |
| `USERNAME TAKEN` | pick another one |
| `NO CONNECTION` | the phone could not reach Supabase at all |
| `TOO MANY TRIES` | rate limited — wait a minute |

The profile sheet prints the longer reason underneath the buttons. Send me that
line and I can act on it directly.

## 2. Database schema (already done)
`supabase/schema.sql` ran successfully long ago — nothing to redo. If it's ever needed on a fresh project, it goes in **SQL Editor → New query**, run once.

## 3. Auth settings (verify once)
Authentication → Providers: **Email ON**, "Confirm email" **OFF**, "Secure email
change" **OFF**, Anonymous **OFF**.

### About the "2 verification emails per hour" wall
That ceiling is Supabase's built-in SMTP, and it only applies to mail Supabase
sends. **This project sends none.** Accounts are minted by the admin API with
`email_confirm: true`, which marks the address confirmed without delivering
anything — so there is no verification step left to rate-limit.

The wall was real: v0.6.0 registered users with `auth.signUp()`, which mails.
v0.7.4 replaced it with the Edge Function. Nothing has called a mailing method
since, and `tests/identitysim.js` now fails the gate if one ever comes back —
as a fallback, a convenience, or a one-line patch. Hitting that limit again
would take a code change the gate will not let through.

The address `username@coastline.game` is an internal primary key, not a mailbox.
Nothing is ever delivered to it, and it never needs to exist.
