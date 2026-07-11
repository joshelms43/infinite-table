# One-time setup steps (Josh)

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
