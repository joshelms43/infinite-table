# Infinite Table

Card games with your mates. Premium, phone-first, no installs, no emails, no ads. One shared design system — colour tokens, card physics, interaction patterns — many games. Built by Josh with Claude.

The lobby is the front door; games live in subfolders. Add to Home Screen for the app experience.

## Games

| Game | Status | Players |
|---|---|---|
| [Coastline](./coastline/) — Deal-style property scramble, Sunshine Coast theme | Live | Solo vs AI, or 2–4 online (bots can fill seats) |

## Structure

```
index.html              — lobby (front door, profile chip)
manifest.webmanifest    — PWA manifest + generated icon set
shared/config.js        — Supabase keys (single source of truth)
shared/identity.js      — accounts, friends, invites, stats, Elo (page-agnostic)
coastline/index.html    — the game (engine + UI + NET, single file by design)
coastline/CHANGELOG.md  — every version, every root cause
supabase/schema.sql     — full backend: run once in the Supabase SQL editor
tests/                  — three suites (see below)
```

## Architecture notes

**Identity** — accounts are exactly username + password. No email ever: logins key to synthetic internal addresses (`name@coastline.game`) that are never shown or sent to. Signed-out is a normal state; solo and online play need only a table name. Elo/stats/friends require an account; guests and bots play unrated. `shared/identity.js` needs a host page to provide `$`, `banner`, `openSheet`, `closeSheet`, `sfx`, `haptic`, `toggleReveal` — `NET` is optional (game pages only).

**Multiplayer** — host-authoritative over Supabase Realtime broadcast + presence only; zero database tables for rooms (a room is a channel named by its 4-letter code). Clients never mutate state: every executor gates into an intent; the host validates, executes as that seat, and broadcasts public state (hand counts only) plus per-seat hand messages. Mid-turn decisions (pay, No Deal, discard, Rent Hike) route as asks to whichever human owns them. Presence keys persist in localStorage, so refreshing keeps your seat; hosts hand seats back to returning keys. Host departure ends the table explicitly.

**Backend** — `supabase/schema.sql` is the whole thing: profiles / friends / matches with RLS, column-level grants (ratings move only through the `record_match` RPC — participant-only, rate-limited, atomic pairwise Elo K=32), friend codes private behind RPCs. Supabase auth settings required: Email provider ON, "Confirm email" OFF, "Secure email change" OFF, Anonymous OFF.

**Deep links** — `coastline/?join=CODE` joins a room; `coastline/?invite=FRIEND_ID` hosts and fires an invite. The lobby's invite buttons use these.

## Development

```
npm install
npm run check     # the pre-ship gate: engine suite, interaction flows, drop matrix
```

Suites: `tests/test.js` (engine + protocol assertions, headless), `tests/repro3.js` (jsdom interaction flows), `tests/repro2.js` (jsdom drag-drop matrix — every card kind on every zone). All three must pass before any push; the drop matrix exits nonzero on errors.

## Conventions

- Single-file vanilla HTML/JS per game, no build step. Complete files only. Vercel auto-deploys from `main`.
- Semver + a CHANGELOG entry for every change, including root causes of bugs and honest process notes.
- Patches are anchor-asserted string replacements — a missed anchor aborts the write. No diagnostic greps chained ahead of patches.
- Shared script includes carry `?v=NNN` cache-busters, bumped every release.
- Diagnose before fixing; tests are written for the bug that just happened.
