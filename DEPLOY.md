# One-time setup steps (Josh)

## THE GOLDEN RULE
**The files Claude shows you in chat are backups and test files — you never need to paste them anywhere.** Everything that needs deploying deploys itself when Claude pushes to GitHub (Vercel picks it up automatically). There is exactly ONE manual step in this whole project, and it's step 1 below.

## What needs nothing from you
- **M Deal** — no setup. Ever.
- **Mafia** — no setup. No SQL, no functions, no tables. It uses the same channels M Deal already uses.
- **Anything ending in .js from the tests folder** (netsim, mafiasim, etc.) — these run on Claude's machine before every push. They are not for Supabase, not for anywhere.

## 1. Accounts — run ONE SQL file

**Accounts are M Deal only.** The lobby is guest-first and asks nothing. Sign-in
lives at `/coastline/` → profile chip.

### Do this
1. Supabase Dashboard → **SQL Editor** → New query
2. Paste the whole of **`supabase/accounts.sql`**
3. **Run**

That is the entire setup. It is idempotent — running it again is harmless.

It installs one function, `create_account(username, password)`, which mints the
user already-confirmed, bcrypts the password, and creates the profile row with a
friend code. **It sends no email**, so the two-mails-an-hour ceiling is never
approached.

### The old TypeScript file is not this
`supabase/functions/register/index.ts` does the same job as an Edge Function.
It still works and the app still falls back to it, but **Edge Functions only
deploy from the dashboard's Functions page — never from a GitHub push**, which
is why sign-up was broken. Pasting that file into the SQL editor gives you:

```
ERROR: 42601: syntax error at or near "//"
```

That error means you have the TypeScript file in the SQL editor. You want
`accounts.sql` instead — it starts with `-- ====`, not `// supabase/`.

### If sign-up still fails, the screen names the cause
The old build printed `SIGN UP: FAILED` for everything, so a backend that was
never installed looked exactly like a typo'd password. It now says:

| On screen | Means |
|---|---|
| `SIGN UP NOT INSTALLED` | neither backend is installed — run `accounts.sql` |
| `TOO MANY SIGNUPS` | more than 40 accounts in an hour; the abuse brake |
| `USERNAME TAKEN` | pick another one |
| `SIGN UP OFFLINE` | the Edge Function 404'd (only reached if SQL is absent) |
| `SIGN UP REJECTED` | Supabase refused the anon key — check `shared/config.js` |
| `NO CONNECTION` | the phone could not reach Supabase at all |

The profile sheet prints the longer reason under the buttons. Send me that line.

## 1b. The bots need seeding too

`accounts.sql` grew a second half in v0.11.7 that seeds Bazza and Shazza as real
accounts. **If you ran the file before that, re-run it** — it is idempotent, so
running it again costs nothing.

Without those two rows, a solo win records the game and counts the win but does
not move your rating at all. `record_match` skips its Elo loop for any player it
cannot read an Elo for, so an opponent with no row means there is nowhere for
the points to come from — and it fails silently in the database.

### Check it in one query
SQL Editor → New query → Run:

```sql
select name, elo, friend_code from profiles
where id in ('ba22a000-0000-4000-8000-000000000001',
             '5a22a000-0000-4000-8000-000000000002');
```

- **Two rows (Bazza, Shazza)** → seeded, solo games will rate.
- **No rows** → re-run `supabase/accounts.sql`.

The game now says this for itself: win a solo game and the rating screen will
name whoever is missing and point at the file, rather than showing a silent ±0.

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
