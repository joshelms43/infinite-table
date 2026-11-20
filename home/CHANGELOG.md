# Home — Changelog

## v0.1.0 — 2026-11-21
One front door, as a preview at `/home/`. The old lobby stays at `/` until
Josh swaps it in.
- Home: you (avatar, name, title, the month's pass and tier), two game
  cards — Settlers and Deal, each with its art and your rating beside its
  name — one Play button, any table you can walk back to, and friends with a
  Challenge button each. The other games are not listed; they still work at
  their own links.
- Play is the one lobby. Pick the game and how to play, see the table with
  each bot's rating beside its name, set the options (Settlers: bots and the
  roll clock, including Custom), and Start drops you on the table with no
  menu in between. Deal: bots, Host A Room, Join by code, or challenge a
  friend. Deal's tables are rated, so a guest is asked to sign in and then
  carried on to the table they asked for; Settlers lets a guest play
  unrated.
- Friends: your code, add by code, everyone with the rating for the chosen
  game beside their name, Challenge, remove.
- Profile: a rating and record per game; the pass — thirty tiers, 100 XP
  each, an item per tier — and equipping by tapping what you own. Sign Out.
- The pass: 30 XP for finishing a game, 30 more for a win, half against
  bots only, 60 for the first win of the Brisbane day. December's track is
  Coastline: four avatars, two frames, two banners, three titles; for
  Settlers four colours, three dice sets, two islands, two robbers; for
  Deal four tables and four card backs. The first pass opens early (now)
  so there is a full run at it. What you unlock stays yours: an item is
  `season:tier`, owned while your XP for that season reaches the tier.
- Art: Deal wears the card fan its lobby card always had. Settlers gets an
  island of five hexes with tokens, a road, a settlement and a city; the
  hexes drift apart under your thumb the way the fan splays.

The build:
- `supabase/home.sql` — `ratings` (one Elo per player per game, bots
  fixed), `pass_progress`, `profiles.loadout`, and two functions:
  `record_result` (ratings + match + XP in one call, under the existing
  45-second brake) and `set_loadout` (owned tiers in known slots only).
  `record_match` now delegates to it. **Josh must paste this file into the
  Supabase SQL editor once**; until then the home screen shows the Deal
  rating from where Deal keeps it and leaves the pass out of sight.
- `shared/pass.js` — the catalog and the maths, pure. `shared/account.js`
  — the reads and writes, no screen. Sign-in is still `shared/identity.js`.

Verification:
- `tools/sql-check.sh` runs schema.sql, accounts.sql and home.sql on a real
  local Postgres 16 (with a stand-in for Supabase's auth schema) and
  exercises them: the exact Elo for a win over three bots (+62), a loss
  (−10) and a head-to-head (+16/−16); bots never moving; XP, the daily
  bonus and its reset the next day; the brake; Deal's old call feeding the
  new tables and `profiles.elo`; every loadout refusal; that a browser role
  cannot write any of it; and that the files are safe to re-run.
- `passsim` (33 pins): the catalog is complete and drawable, seasons are
  Brisbane months, tiers, XP, Elo, owning, equipping — and the co-pin that
  the numbers in pass.js are the numbers in home.sql. Nine mutation proofs.
- `homesim` (55 pins): the real page in jsdom over an in-memory Supabase,
  through its own buttons; then Settlers and Deal as launched from it.
  Seven mutation proofs.
- `tools/render-home.js`: every tab, the sign-in sheet and a guest's view
  at phone size, plus Settlers wearing two islands — looked at before
  shipping.

Root causes of what the build caught:
- Equipping silently did nothing: the account module only learned who was
  signed in when a page asked it at boot, and the home screen signs in
  through identity.js, so `set_loadout` was refused as a guest. It now
  checks the session at the moment of the call. Caught by `homesim`.
- Two pass items shared a name (Sunset). Caught by `passsim`.
- `schema.sql` is not safe to run twice (it re-creates policies it does not
  drop) — found by the SQL check, pre-existing, left alone and noted in
  home.sql's header rather than changed under a live database.

Not in v0.1.0, and why:
- **Your Games for slow games.** It lists only a Deal table you can rejoin.
  Hour-a-move Deal and hourly Settlers need games that live on the server.
- **Settlers with friends, and Settlers challenges.** Settlers has no
  online rooms yet; the lobby says Coming Soon.
- **Deal's room waiting list is still drawn by the Deal page.** You reach
  it straight from the lobby and never see Deal's menu, but the list of
  who has joined is a live connection that cannot survive leaving one page
  for another; moving it means reworking Deal's netcode and deserves its
  own pass.
- **Other people seeing your cosmetics in a game, emotes, piece styles,
  Deal card faces, a paid track, matchmaking.** The loadout is stored on
  the server and friends' avatars already show on the home screen; in-game
  it is your own screen for now.
- **Bot difficulty levels.** The three Settlers bots are graded by measured
  strength; Deal's bots share one brain and one rating.
- **Game results are reported by the player's own device**, as Deal's
  always were. Fine among friends; a server-run game is the real fix and
  arrives with slow games.
