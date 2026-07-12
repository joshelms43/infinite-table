# One-time setup steps (Josh)

## THE GOLDEN RULE
**The files Claude shows you in chat are backups and test files — you never need to paste them anywhere.** Everything that needs deploying deploys itself when Claude pushes to GitHub (Vercel picks it up automatically). There is exactly ONE manual step in this whole project, and it's step 1 below.

## What needs nothing from you
- **M Deal** — no setup. Ever.
- **Mafia** — no setup. No SQL, no functions, no tables. It uses the same channels M Deal already uses.
- **Anything ending in .js from the tests folder** (netsim, mafiasim, etc.) — these run on Claude's machine before every push. They are not for Supabase, not for anywhere.

## 1. Accounts — deploy the register Edge Function
**This is TypeScript, not SQL — it does not go in the SQL editor.** (Pasting it there errors on line 1 at `import`.)

1. Supabase Dashboard → your project → **Edge Functions** (left sidebar, ⚡ icon)
2. **Deploy a new function** → choose "Via Editor"
3. Name it exactly: `register`
4. Delete the template code, paste the entire contents of `supabase/functions/register/index.ts`
5. **Deploy**. No secrets to configure — the service key is injected automatically.
6. Test: open M Deal → profile chip → Create Account.

## 2. Database schema (already done)
`supabase/schema.sql` ran successfully long ago — nothing to redo. If it's ever needed on a fresh project, it goes in **SQL Editor → New query**, run once.

## 3. Auth settings (verify once)
Authentication → Providers: **Email ON**, "Confirm email" **OFF**, "Secure email change" **OFF**, Anonymous **OFF**.
