# Coastline — Changelog

## v0.6.6 — 2026-07-10
Rematch — because nobody plays one game.

- The win overlay's button is now seat-aware: hosts get Rematch (same table — humans and bots — fresh shuffle, everyone snaps straight back in), clients see "Waiting for the host…", and solo keeps Play again. Clients accept a start message at any time, not just while joining, and a fresh start clears win overlays and turn tracking on every screen.
- Rating note: record_match's 45-second rate limit means only games shorter than 45 seconds would go unrated on an instant rematch — real games comfortably clear it.

**Tests** — 53/53, flows 12/12, drop matrix 38/38.

## v0.6.5 — 2026-07-10
Infinite Table becomes installable.

- Web app manifest + generated icon set (512/192/apple-touch/favicon): a dark felt tile with three fanned cards in ivory, coral and brass — drawn programmatically from the design tokens. Both pages carry manifest, theme-color and icon tags; the favicon 404 from the very first bug report is finally dead.
- Add to Home Screen now yields a standalone app with the table-night splash. Deliberately no service worker yet: offline caching would fight the cache-busted module strategy, and a stale multiplayer client is worse than no offline mode. That trade can be revisited once update flow matures.

**Tests** — 52/52, flows 12/12.

## v0.6.4 — 2026-07-10
Remote players can double their rent — the last decision that discriminated by seat.

- v0.3.x boundary closed: when a remote player plays rent while holding a Rent Hike, the host now routes a hike ask through the standard decision protocol instead of silently charging base rent. The remote player gets the identical Rent Hike sheet the host would see; their choice threads back into execRent with the hike card spent only if used.
- Asserted end-to-end with genuine deck cards: the ask registers and transmits, and the reply resolves the full payment chain (the first draft of the assertion fabricated a card kind that doesn't exist and crashed cardName — real cards only in tests from now on).
- With this, every mid-turn decision — pay, No Deal, discard, hike — reaches whichever human owns it, wherever they sit.

**Tests** — 52/52, flows 12/12, drop matrix 38/38.

## v0.6.3 — 2026-07-10
Bots at online tables.

- Hosts can "Add a bot" in the lobby (Bazza, Shaz, Davo — removable with ✕, four seats max). Two mates plus a bot beats waiting for a third human — thin tables were online's biggest practical weakness.
- Nearly free by architecture: the host runs the full engine, and every AI path (turns, payments, No Deal calls, discards) already works per-seat. The roster simply carries isAI, clients render bots like any opponent, and AI plays now broadcast the same showcase event human plays do, so everyone sees Bazza's move rise centre-stage.
- Bots have no account, so their games are unrated exactly like guests: Elo records only among signed-in humans at the table (existing record_match participant rules cover it unchanged).

**Tests** — 50/50 (bot roster + serialize assertions), flows 12/12, drop matrix 38/38.

## v0.6.2 — 2026-07-10
Multiplayer resilience: reloads keep your seat, host departures speak.

- Persistent seat identity: the presence key now lives in localStorage, so a refresh mid-game keeps who you are. On rejoining, the host recognises the returning key and re-sends the roster — you land back in your seat with current state (asserted: known keys get the roster back, strangers get state only).
- The home screen offers "Rejoin CODE" whenever a room was joined within the last 30 minutes (cleared when a game ends).
- Host departure is now a clear ending for clients — banner, prompt, table closed — instead of a silent hang; hosts get a disconnect banner when a client drops (asserted both ways).
- Process note for the record: this patch silently failed to apply on first attempt — a diagnostic grep at the head of the command chain exited non-zero and short-circuited everything after it, while unrelated output made it look applied. The new assertions caught it immediately by failing against the unpatched file. Rule added to the drill: no diagnostic greps chained ahead of patches.

**Tests** — 48/48, flows 12/12, drop matrix 38/38.

## v0.6.1 — 2026-07-09
Navigation, honesty, and a subtitle cull.

- Back from everywhere: Coastline's home carries "‹ Infinite Table" back to the lobby, and the in-game COASTLINE logo now returns to the home screen — resume-aware (primary button reads Resume mid-game, with a small New game link).
- The lobby tile's hand-synced version number (stale at v0.2.19) is gone — replaced with "Solo & online · 2–4 players", which can't drift.
- Subtitle cull across both pages: the explanatory subtexts are gone — "for casual games", "no email, ever", the friends empty-state, POV's "tap anywhere to return", verbose lobby waits. Labels say one word where one word does.

**Tests** — 44/44, flows 12/12.

## v0.6.0 — 2026-07-09
Accounts are credentials-only. No anonymous accounts exist anymore.

**The model, final form**
- An account is exactly a username + password (still zero email — synthetic internal addresses). No credentials means no profile, no Elo, no stats, no friends — and that's a normal, unlabelled state, not an error.
- Playing stays fully open: solo and online rooms need only a table name. The profile sheet separates the two concepts explicitly: "Table name — for casual games" up top, "Account — for Elo, stats & friends" below with Create account / Sign in.
- The chip reads as an invitation when signed out ("? Sign in ›") and as identity when signed in ("J Josh · 1240 ›").
- Register signs you straight in (signUp with instant session; falls back to a sign-in if the project requires it); new profiles take the username as their initial display name. Anonymous conversion code removed entirely — you can switch the Anonymous provider back OFF in Supabase.
- Online games with mixed company: Elo records only among account holders in the match; guests play unrated. If the winner is a guest, the game is simply unrated.

**Tests** — 44/44, flows 12/12. Include tags busted to ?v=060.

## v0.5.2 — 2026-07-09
Identity diagnostics — the silent "offline" becomes a named failure.

- init() previously swallowed every failure into a mute offline state. Each step now reports itself: config, anonymous sign-in, profile read, profile create, re-read — surfacing the actual Supabase error as a red banner, in the console, and inside the profile sheet ("Last attempt — anonymous sign-in: Anonymous sign-ins are disabled"), with a Connect retry button.
- Script includes are now version-busted (?v=052) on both pages so cached module + fresh page can never desync again (the cause of the ghost error this morning).
- Likeliest culprits the diagnostics will name: anonymous provider toggle, or a v1→v2 policy remnant blocking the profile insert/read.

**Tests** — 44/44, flows 12/12.

## v0.5.1 — 2026-07-09
Hotfix: identity crashed on both pages ("this.myName_ is not a function").

- Root cause: the v0.5.0 extraction script rewrote every myName call site to a new method but the method definition itself targeted a property that never existed on ID (it lives on NET) — an unasserted .replace() that silently did nothing. The rule that every patch anchor must assert existed for exactly this reason; the extraction script skipped it and paid.
- myName_() is now properly defined (NET name → localStorage → empty), the one remaining raw NET reference in a legacy branch cleaned, all other v0.5.0 guards verified present, and shared/identity.js passes node --check as part of the fix.

**Tests** — 44/44, flows 12/12.

## v0.5.0 — 2026-07-09
Identity becomes platform infrastructure. First deliberate multi-file split.

**Shared modules (new top-level /shared)**
- shared/config.js — Supabase keys, single source of truth for every page.
- shared/identity.js — the entire ID module (accounts, username+password login, profile sheet, friends, invites, stats, Elo) extracted and decoupled: NET is now optional, so any page can host it by providing a handful of UI primitives.

**The lobby is the front door now**
- infinite-table's root page gains the profile chip under its header and the full profile sheet — log in, edit your name, see Elo/W-L, manage friends, all before ever entering a game. The lobby implements a minimal adapter (sheet, toast) on the same token system.
- Cross-page invites: inviting from the lobby deep-links your friend through ./coastline/?join=CODE; the invite button itself routes through ?invite=FRIEND, which auto-hosts a room and fires the invite on arrival. Coastline reads both params at boot.

**Coastline** — inline keys and identity removed in favour of the shared modules (with headless-safe fallbacks); everything else unchanged.

**Harnesses** — test suite and both jsdom harnesses now inline the shared module (external script tags don't execute headless); one more self-inflicted repro-path mangling caught and rebuilt by hand.

**Tests** — 44/44, flows 12/12, drop matrix 38/38, all from the repo.

## v0.4.5 — 2026-07-09
Username + password accounts (no email, ever) — plus the dead profile tap, root-caused.

**Why the profile tap did nothing**
- Sheets render at z-50; the home overlay sat at z-82. The profile sheet has been opening perfectly — underneath the home screen. Home now sits at z-48 (below sheets, above the board), and the structural cause is gone too: solo no longer auto-runs behind the menu. The board renders as a quiet backdrop, and the game deals only when you choose Play Solo (or a lobby starts).

**Accounts with no email**
- The profile sheet gains a collapsed "Save account — use on any device" panel: username (3-16, letters/numbers) + password (6+). Creating a login converts your existing anonymous identity in place — same profile row, Elo and friends carry over. Sign in with the same panel on any other device; Sign out returns you to a fresh anonymous session.
- Under the hood, Supabase keys the login to a synthetic internal address (username@coastline.game) that is never shown, never sent to, and never collected from anyone. Username uniqueness comes free from it.
- Nothing is required: solo needs no account, online needs no account — this exists purely so your rating can follow you between devices.

**Setup (Josh, three toggles in Supabase → Authentication):** enable the Email provider, turn OFF "Confirm email", and turn OFF "Secure email change". (The synthetic addresses can't receive confirmation mail, so both confirmations must be off.)

**Tests** — 44/44; flows 12/12 and drop matrix 38/38 (both harnesses updated for solo-on-choice, plus a repro path re-pin after I broke it again — deterministic this time).

## v0.4.4 — 2026-07-09
Identity becomes a whisper. There is no sign-up — and now it doesn't look like there is one either.

**The clarification** — auth was already invisible (anonymous, automatic, nothing to create), but the profile card front-and-centre made the home read like an account product. Wrong message for a game.

**Home is now five elements**
- Wordmark, tagline, PLAY SOLO (hero), PLAY ONLINE (expands to Host / Join-with-code on tap), and a slim identity whisper at the bottom: `⟨avatar⟩ Josh · 1240 ›`.
- Solo requires nothing, waits on nothing, works fully offline — guaranteed by construction (it's just closing the overlay).

**Everything identity lives in one sheet**
- Tapping the whisper opens a Profile sheet: name field (edits sync), Elo/Wins/Losses stat tiles, tap-to-copy friend code, friends list with Invite/remove, and add-by-code. Offline it shows your local name (still editable) with one quiet line about connecting.

**Tests** — 44/44 PASS.

## v0.4.3 — 2026-07-09
The home screen learns hierarchy. (Schema v2 is live — thanks for running it.)

**What was messy** — v0.4.0 stacked everything: profile card AND a separate name input, PLAY and FRIENDS fully expanded, eleven elements in one column.

**Now**
- One identity: the profile card is the only place your name lives — tap it (✎) to edit inline, Enter or blur to save. The floating name input is gone; Host/Join read the profile name.
- One hero: a big PLAY SOLO, with Host Online and Join Game as a compact secondary row.
- Progressive disclosure: Join reveals its code field only when tapped; FRIENDS is a collapsed section header with a live count and chevron — list and add-by-code appear on demand.
- Friend count badge, offline profile card shows your local name (still editable) with a quiet "connects online" note.

**Tests** — 44/44 PASS.

## v0.4.9 — 2026-07-10
Determinized Monte Carlo built (roadmap item 4) + an unattended CI ladder for decisive verdicts. No gameplay changes on main — the MCTS brain awaits its pre-committed test on branch `mcts-experiment`.

**ISMCTS-lite (branch `mcts-experiment`)**
- On CONTENTIOUS decisions only (greedy's top two candidates within 2.0 ev — obvious plays stay instant), the brain deals out 8 worlds consistent with everything it can see — opponents' hands sampled from the counting layer's exact unseen multiset, respecting known hand sizes — plays each world forward 16 half-turns with a fast synchronous greedy policy (real effects: actual payments with no-change semantics, No Deal chains resolved with the dealt hands, real draws/reshuffles), and picks the root action with the best average outcome across worlds (common random numbers: all actions face the same worlds).
- Overrides greedy on ~16% of decisions at full budget — by far the largest behavioural change of any engine iteration. Uses Math.random throughout, so seeded harness runs stay deterministic. Tests: determinized worlds conserve all 106 cards and respect hand knowledge; rollouts terminate and never touch the real game; the contentious gate skips Monte Carlo on forced wins. All suites green on the branch.
- Exploratory ladder at a deliberately thin budget (5 worlds, horizon 12): 50.9% ± 2.2pp over 1,002 paired games — leaning, not conclusive, and underpowered for a small effect. Decision: raise to the full budget (~0.6s per contentious decision — fine for humans, heavy for harnesses) and settle it with one PRE-COMMITTED 3,000-game run, ship iff the share CI excludes 50%.

**CI ladder (.github/workflows/engine-ladder.yml)**
- Actions → "engine ladder" → Run workflow: plays a candidate branch against a frozen ref over paired seeds on a GitHub runner (~60–90 min for 3,000 games), enforces green suites first, prints the verdict in the job summary, and commits the report + compressed per-game log to `ladder-results/` on the candidate branch — the verdict lands in git where any future session can read it. The measurement standard, now unattended.

**Tests** — main unchanged: 33/33 PASS (39/39 on the branch), flows 12/12, drops clean, trainer sanity 6/6, trainer parity 27/27.


## v0.4.8 — 2026-07-09
Strength experiment logged: turn-sequence planning (roadmap item 2) is a NULL — measured, not vibes. No behaviour changes; the code lives on branch `seqplan-experiment`, unmerged per the measurement standard.

**What was built**
A beam-search turn planner inside the AI section: clone the position, apply each candidate's expected effect silently (payments value-split, JSN-discounted), search ordered sequences up to the remaining plays, execute only the first play, re-plan. Three iterations, each ladder-tested against v0.4.7 with paired seeds:

1. **Positional-evaluator scoring (V): 42.8% ± 3.0pp — significantly worse** (n=1,002). An uncalibrated hand-built evaluator loses to the tuned greedy heuristics; depth cannot rescue a worse judge.
2. **Sum-of-tuned-evs scoring: 45.7% ± 2.8pp — still worse** (n=1,002). Diagnosis via a 15-game disagreement trace: the heuristic evs are not additive rewards, so the search *games* them — banking cards to shrink the hand so payday's low-hand bonus fires, reordering ties to harvest state-dependent bumps. Goodhart inside the search. (A real bug fell out too: the move-dedup key collapsed all dual rents/wilds into one, making the planner sometimes play the wrong rent card — deviation rate dropped 6.0%→0.7% once fixed.)
3. **Guarded override — greedy by default, deviate only for a physically real combo** (a sequence containing a rent whose charge grew vs the root position, clearing the best greedy-first sequence by a margin): **exploratory 50.6% ± 0.7pp (n=3,000), then a pre-committed fresh-seed confirmation: 49.9% ± 0.8pp (n=3,000) — null.** The exploratory lean was winner's curse; the two-stage protocol caught it, same as the trainer's promotion gate.

**What this buys the roadmap**
- Within-turn ordering is close to value-neutral in Coastline at this level: greedy-with-re-evaluation already captures nearly all of it (the profitable reordering fires on ~0.7% of decisions and washes out in the luck). Item 2 is now measured and closed — future sessions shouldn't re-explore it.
- The strength gaps must live elsewhere: opponent-response awareness (item 3), defence quality (payments/JSN, item 6), and information exploitation via determinized rollouts (item 4) — the sim layer built here (state clone, expected-effect apply, silent fast play) is exactly the plumbing ISMCTS needs, waiting on the branch.
- Methodology note for the future: at 0.7% behavioural divergence the paired ladder resolves ±0.7pp with just 3,000 games — tiny true effects are measurable, and still weren't there.

**Tests** — on this (unchanged) engine: 33/33 PASS, flows 12/12, drops clean, trainer sanity 6/6, trainer parity 27/27. The branch additionally carries the planner's combo-ordering assertions (35/35 there).


## v0.4.7 — 2026-07-09
Trainer: fix the overnight slowdown — an O(n²) leak in the engine logger. No gameplay changes.

- The engine's log() does `logs.unshift(msg)` on an array that is never trimmed or reset, plus rebuilds a 120-row HTML string, on every call — and a game logs ~30 lines. Fine in the UI (games are minutes long); lethal headless: after 100k games the array holds ~3M entries and every unshift walks all of them, so games/sec fades the longer the trainer runs. All three headless drivers (trainer worker core, tests/trainer.body.js, tests/ladder.body.js) now rebind log() to a no-op — presentation-only, zero effect on outcomes, verified by the unchanged bit-parity checks.
- Regression-proofed: the parity fingerprint now records the logs array's growth across thousands of headless games and fails if it ever moves again. 27/27 PASS.
- Dashboard honesty fixes: the games/sec ticker divides by real elapsed time (background tabs throttle timers, which silently inflated the reading), and the page log panel self-trims so an overnight run can't grow the DOM without bound.

**Tests** — 33/33 PASS, flows 12/12, drops clean, trainer sanity 6/6, ladder sanity 4/4, trainer parity 27/27.


## v0.4.6 — 2026-07-09
Trainer: pool scheduler extracted, hardened, and end-to-end tested — fixes the 0 games/sec freeze. No gameplay changes.

**The freeze**
- The dispatch scheduler lived untested in trainer.html's main script and had two real flaws. It derived the next seed index from `seedsDone + in-flight count`, so out-of-order completions caused duplicate dispatches of indices already in flight (wasted games); worse, a worker that hit an uncaught error stranded its job in the pending table forever — the in-flight count never drained, the dispatcher concluded the rung was covered, and the run froze at 0 games/sec with no visible reason.

**The fix (scheduler is now a shared, simulated block — pool-scheduler)**
- Dispatch computes the exact set of missing seed indices (committed ∪ buffered ∪ outstanding → first gap), so duplicates are structurally impossible and a lost job's index simply becomes dispatchable again.
- Worker `onerror` recycles the slot: its pending blocks return to the pool and replay. A seed whose game throws inside the engine posts back as an undecided block (counted, logged, skipped) instead of stranding the job — a deterministic bad seed can't loop or freeze the run.
- A 10-second watchdog reports stalls with context (in-flight count, idle workers, phase) and kicks the dispatcher if it ever goes quiet with nothing in flight; games/sec is now computed on a fixed 2-second ticker, so the dashboard reads honestly even when the answer is zero.

**Testing (the part that matters)**
- tests/trainer.parity.js part 4 drives the page's actual pool-scheduler block with hostile fake workers: randomized completion order, a mid-run simulated worker crash, generation cap. Asserts: no stall, no seed block dispatched twice, the crashed block recycles and replays, zero wasted games (plays × 6 === committed), and the final state is bit-identical to the sequential node run. 26/26 PASS.
- Every piece of the browser trainer now has node-side coverage: worker boot (part 2), main-thread eval scope (part 3), shared logic parity (part 1), scheduler pipeline (part 4).

**Tests** — 33/33 PASS, flows 12/12, drops clean, trainer sanity 6/6, trainer parity 26/26.


## v0.4.5 — 2026-07-09
Trainer hotfix: the other side of the eval-scope trap. No gameplay changes.

- v0.4.4 fixed the worker side (engine consts invisible *outside* the eval) — this releases the main-thread side of the same trap: the page does `eval(trainer-logic)` and calls the helpers from outside it, and in a direct eval function *declarations* leak to the caller but `const`/`let` do **not**. `cfg`, `pct`, `clone` and `shareOf` were const arrows, so every render crashed with "cfg is not defined" (games kept playing; the dashboard died and dispatch eventually starved). All shared-logic helpers are now function declarations, in both tests/trainer.body.js and the page — still verbatim twins.
- The lesson is now enforced, not remembered: `npm run test:trainer` gained a third part that evals the page's trainer-logic block in a function scope and asserts every helper the main script touches survives to the outside (12 API checks + a working-smoke), alongside the worker-boot simulation and the bit-parity run. 20/20 PASS. A const sneaking back into the shared block fails CI-style before it can ship.

**Tests** — 33/33 PASS, flows 12/12, drops clean, trainer sanity 6/6, trainer parity 20/20.


## v0.4.4 — 2026-07-09
Trainer hotfix + spectator dashboard. No gameplay changes, no efficiency cost.

**The bug (every trainer.html load died with "ENGINE ERROR: AI_W is not defined")**
- The worker boot posted its ready message with `AI_W` *after* the engine eval — but engine consts are eval-scoped (the long-documented harness quirk; the node harness avoids it by concatenating everything into one eval). Fix: the worker core posts `{ready, AI_W}` from inside the eval scope; the boot shell only catches fatals.
- This escaped because parity testing was a throwaway script that never exercised worker boot. It is now permanent: **tests/trainer.parity.js (`npm run test:trainer`)** runs the page's worker-boot block exactly as a browser worker would (boot → ready → seed blocks) and re-proves shared-logic bit-parity against `node tests/trainer.js` with worst-case reverse-order commits, every time. 6/6 PASS. (The test itself caught one of its own bugs on the way in: seedBlock attributes wins by object reference, so the mirror check must pass distinct clones — as postMessage's structured clone does in real runs.)

**Watchable training (main-thread only, throttled to 4 Hz — the pool never waits on the UI)**
- Generation race: every candidate gets a deterministic Aussie heat name (Davo, Muzza, Chooka…) and a live lane — share bar against the 50% line, seeds progress, 👑 on the leader, ✂ strikethrough fade on heat-1 eliminations, teal glow when someone's whole CI clears 50%.
- 🥊 Title fight card during confirmations: challenger by name vs the Champion, big running share ± CI, 1,002-game progress, "needs the whole CI above 50% to take the title".
- Season view: sparkline of every generation's best share (gold dots = new champions, red dots = rejected challenges) above the history table; hero stats (games played, games/sec, generations, reigns) and a champion status line.
- Same state schema, same exports, same efficiency: rendering is ~12 DOM rows and one small canvas at most 4×/sec.

**Tests** — 33/33 PASS, flows 12/12, drops clean, trainer sanity 6/6, trainer parity 6/6.


## v0.4.3 — 2026-07-09
Trainer efficiency pass: successive-halving rungs + a browser worker pool. Roughly 8–10× more search per overnight run at the same statistical bar. No gameplay changes.

**Successive-halving rungs (both trainers)**
- Generations grew from 8 to 12 candidates, but every candidate now starts with a cheap 16-seed screen (96 games); only the top 4 advance to the full 50-seed evaluation. Losers stop early — 1,968 games per generation instead of 2,400 while exploring 50% more of the genome space (~45% cheaper per candidate). Selection quality is preserved where it matters: survivors are ranked on full evals, and the CI-gated promotion path (confirmation on 1,002 fresh paired games, CI must exclude 50%) is untouched. Rungs buy more search per hour, never a lower bar.
- Config now lives in the state file (a run keeps its parameters even if defaults change later) and can be overridden at start: `node tests/trainer.js --state s.json --config '{"LAMBDA":16,"RUNG_SEEDS":[12,50]}'`. New `--gens N` cap. v1 state files are migrated on load (champion, history and ES state survive; the open generation restarts).

**Worker pool (coastline/trainer.html)**
- The page now boots one engine worker per CPU core (hardwareConcurrency − 1) and schedules seed blocks across them. Games are pure functions of (seed, genomes), so parallelism is a pure wall-clock multiplier — results are buffered and committed in seed order, keeping the state file bit-identical to a sequential run. Pause drains in-flight games before checkpointing.
- Live dashboard gains pool size and games/sec; export/import unchanged and still interchangeable with the node trainer.

**Verification**
- Trainer sanity extended to 6 checks: exact self-eval null, deterministic sampling, checkpoint/resume bit-identity across two full generations including rung cuts, rung cuts keep screen leaders, v1-state migration.
- Parity test: the browser page's shared-logic block, driven the way the pool drives it — including worst-case reverse-order block completion through the commit buffer — reproduces a `node tests/trainer.js` run bit-for-bit over 3 full generations (identical history, mean, sigma, champion, game counts). One real bug found and fixed by this test: the node driver's generation cap was checked before advance instead of after, playing one stray block past the cap.
- All suites green on v0.4.2 (AI section verified identical v0.4.1→v0.4.2): 33/33, flows 12/12, drops clean.

**What efficiency can and can't buy (setting expectations)**
- These are search-throughput improvements inside the 22-gene constant space, which ~10k games of tuning already showed is near a local optimum. If a real constants-level edge exists, an overnight pooled run now has the budget to find and *confirm* it — but per the project roadmap, the next real strength jumps live in structure (turn-sequence planning, exposure terms, determinized rollouts), which the ladder is ready to referee.


## v0.4.2 — 2026-07-09
Security hardening, prompted by Supabase's anonymous-auth warning ("anonymous users get the authenticated role — review your RLS").

**What the audit found in v0.4.0's schema**
- Self-service Elo: the update-own-profile policy had no column restriction — any signed-in user (anonymous included) could set their own elo/wins/games directly.
- Forgeable matches: record_match was callable with arbitrary player UUIDs — outsiders could record fake games involving anyone.
- Friend spam: profiles (with friend codes) were fully world-readable and friendships inserted directly, so strangers could harvest codes/UUIDs and befriend-spam.

**Schema v2 (supabase/schema.sql — safe to run over v1 or fresh)**
- Column-level grants: profiles select excludes friend_code; update grants cover only `name`. Ratings and counters can move ONLY through the security-definer RPC.
- record_match now requires the caller to be a match participant, validates 2-4 players and a participating winner, and rate-limits to one recorded match per participant per 45 seconds.
- Friend codes go private: own code via my_friend_code(); adding via add_friend(code) (server-side lookup + mutual row — possession of the code is the proof); remove_friend() and a ✕ on each friend row.

**Residual risk, stated honestly** — participants can still collude to self-report games (unavoidable without a server referee), and Realtime rooms remain open to anyone holding a 4-letter code. Both fine at mates-scale; both solvable later (server-validated games, private channels).

**Client** — profile/friends flows moved to the new RPC surfaces; friend list select trimmed to granted columns.

**Tests** — 44/44 PASS.

## v0.4.1 — 2026-07-09
Genome trainer, twice: a rigorous node trainer for Claude's container and a browser trainer page for overnight runs. No gameplay changes.

**The trainer (tests/trainer.js + tests/trainer.body.js, `npm run trainer`)**
- Paired-seed evolution strategy over the 22-gene AI_W genome, built around the measurement standard the old (retired) train.js violated: every candidate is evaluated against the reigning champion with paired seeds and common random numbers (6 games per seed — candidate solo in all 3 seats vs 2× champion, and the mirror), log-normal mutation around a search mean, geometric-mean parent update, and a step-size rule that counts only *statistically significant* winners (under paired mirroring a neutral candidate sits at ~50% by construction, so raw counts would inflate sigma in flat terrain).
- **CI-gated promotion**: a generation's best is confirmed on ≥1,002 fresh paired games only if its search CI already excludes 50%, and promoted only if the confirmation CI excludes 50% too. Selection optimism never touches the championship.
- Fully resumable: state checkpoints to JSON after every seed block; `--seconds` bounds wall time per invocation; candidate sampling is deterministic in (generation, index), so a resumed run is bit-identical to an uninterrupted one (sanity-checked). `--status`, `--export champion.json`, `--sanity`.

**The browser twin (coastline/trainer.html) — overnight runs without a terminal**
- Open it on the deployed site, press Start, leave the tab overnight: the engine runs full speed in a Web Worker (same headless stubs as the node harness), checkpoints to localStorage after every ~1.2s batch, requests a screen wake lock while running, and shows a live dashboard (generation history, shares ± CI, confirmations, promotions, games/sec).
- Export/Import state is byte-compatible with `node tests/trainer.js --state FILE` — an overnight browser run drops straight back into the container harness, and vice versa. Export champion writes the genome alone. One trainer tab at a time.
- Parity is enforced by construction (trainStep and the eval/stat/sampling functions are verbatim copies, flagged in both files) and verified by test: the embedded worker-core, run headless against the v0.4.0 engine, reproduces the node trainer's candidate-0 evaluation bit-for-bit (same genome, same 152/148 win tallies over 50 paired seeds).

**First training telemetry (exploratory, logged for the record)**
- Two short container runs (~18k games total, gens 1–4 then 1–3 after the sigma-rule fix). No promotions — consistent with the documented 10k-game null (constants near a local optimum).
- The gate caught a textbook winner's curse live: a gen-4 candidate at 56.7% ± 5.1% on search seeds regressed to 51.9% ± 2.7% on 1,002 fresh paired games and was rejected. That confirmation CI (49.2–54.6%) leans positive but includes 50% — exactly the kind of question an overnight browser run has the budget to settle.
- Champion genomes stay in the state file; promoting a trained genome into index.html's AI_W remains a separate, ladder-gated change.

**Tests** — 33/33 PASS, flows 12/12 zero window errors, drops all card×zone combos clean; trainer sanity 4/4; ladder sanity 4/4 on the v0.4.0 engine (AI section verified identical v0.3.4→v0.4.0).


## v0.4.0 — 2026-07-09
Accounts, friends, invites, stats, Elo — plus the two remaining live-game bugs (folded into this release; v0.3.4 is the engine ladder below).

**v0.3.4 fixes (from Josh's 10-game session)**
- "YOUR TURN for either person's turn": the turn banner fired for any non-AI turn, so the host saw YOUR TURN on every human's turn and clients saw none. Banners are now strictly local-seat (gold YOUR TURN for you, name banners for others), and clients get them from state transitions with a chime + haptic on their own.
- "Can still act while opponent pays": the v0.3.3 gate only blocked client intents — the host's own local actions bypassed it. New netBusy() blocks local play, End Turn, and card interaction on any seat while a payment/interrupt ask is outstanding.

**Accounts (zero-friction)**
- Anonymous Supabase auth on load — no signup, no email. A profile row is created with your name, a 6-letter friend code, Elo 1000, and W/L counters. Your name edits sync to your profile.
- New supabase/schema.sql (one paste into the Supabase SQL Editor): profiles, friends, matches, and an atomic record_match RPC — RLS on everything.

**The professional home**
- Profile card: gold avatar, name, W-L record, tap-to-copy friend code, and a brass Elo chip. Sectioned layout (PLAY / FRIENDS) with letterspaced labels, consistent card surfaces, and the token design system throughout. Offline shows a graceful placeholder; Solo never requires any of it.

**Friends & invites**
- Add mates by friend code; your list shows names + Elo with an Invite button per friend. Invites travel over each user's personal realtime channel: the friend gets a toast anywhere in the app — Join drops them straight into your lobby (auto-hosting a room first if you weren't). No polling, no tables.

**Stats & Elo**
- The host records each finished online game via the record_match RPC: match history row + atomic multi-player Elo (K=32, winner vs each loser pairwise, floor 100) + games/wins counters. Solo games don't touch ratings. Client-side eloDelta mirror is assertion-tested against the formula.

**Setup (Josh, two minutes)** — Supabase dashboard: (1) SQL Editor → paste supabase/schema.sql → Run. (2) Authentication → Sign In / Providers → enable Anonymous. Done.

**Tests** — engine suite 44/44 (elo assertions added), flows 12/12, drop matrix 38/38. Identity paths are guarded and inert offline/headless; live behaviour needs the schema applied and real devices — expect a shake-out round like v0.3.x had.

## v0.3.4 — 2026-07-09
Benchmark ladder — the engine-strength measurement foundation (strength roadmap item 1). No gameplay changes.

**The ladder (tests/ladder.js + tests/ladder.body.js, `npm run ladder`)**
- Frozen engine versions play round-robin head-to-head: `node tests/ladder.js <verA> <verB> [--seeds a..b] [--out f.jsonl]`, where a version is a git ref, a path to a frozen index.html, or `work` (working tree). `--report f.jsonl` aggregates chunked runs; `--sanity` self-checks the pairing mechanics.
- Host rules, frozen brains: the working-tree engine supplies the rules (offline path — NET stays 'off'); each version's AI section (AI→BOOT markers, versions ≥ v0.2.26) is evaluated in its own closure, and the engine's three brain call points (aiStep, aiShouldJSN, keepScore) become per-seat dispatchers. player.tuneW carries each version's genome into shared engine code (payment DP). Known limitation, documented in the file: structural changes to ENGINE-section AI logic (the payment DP itself) aren't swapped per version — move that logic behind a dispatchable function when it first diverges.
- Paired seeds: Math.random is a seeded PRNG per game, so one seed = one identical shuffle and opening deal across all seat assignments. Per seed and pair: 6 games (each side solo in all 3 seats vs 2× the other). The timer queue is drained per game — determinism required it (queued BOOT/previous-game callbacks were leaking into the next game).
- Stats: head-to-head share of decided wins (50% = equal) with seed-clustered 95% CI, plus each side's solo win rate vs the 33.3% baseline. A verdict is declared only when the share CI excludes 50%, matching the engine-project measurement standard (≥1,000 paired-seed games).
- Headless stubs mirror tests/test.js (the retired train.js stubs broke on aiShowcase's rect guard), except setTimeout, which is a drainable queue rather than setImmediate for deterministic replay.

**First ladder results (logged per the measurement standard)**
- Sanity 4/4 PASS on the v0.3.3 host: seed determinism, distinct shuffles across seeds, identical replay under identical seats, completion under rotated seats.
- Dispatch proof: a deliberately crippled brain (picks its worst candidate) collapses — solo 0.0%, healthy side 66.7% solo (12 games; degenerate worst-move games churn too long for large samples, which is all this check needed).
- **v0.3.3 vs v0.2.26 (922a14a): 1,002 paired games over 167 seeds — play-identical (share 50.0% ± 0.0pp, both solos exactly 33.3%).** Every seed's winner seat is invariant across seat assignments, i.e. the brains chose the same moves everywhere. Two facts confirmed: the AI section is textually unchanged v0.2.29→v0.3.3 and behaviorally unchanged v0.2.26→v0.2.29 (the genome/evaluator work was behavior-preserving), and the multiplayer work (v0.3.0–v0.3.3) did not perturb offline AI play. The baseline to beat is this single lineage brain, and the first real strength change (turn-sequence planning) now has a trustworthy referee.
- Throughput: ~14ms/game headless — a full 1,002-game pairing runs in ~14s.

## v0.3.3 — 2026-07-09
First live-network fixes, from the first real two-tab game.

**Seat identity by key, not name**
- Seats were matched by player name at game start — two tabs with the same (or defaulted) name collided, and a client could resolve itself to the wrong seat: the cause of "says your turn when it's not" plus downstream chaos (wrong hand, wrong asks). Every connection now carries a unique presence key; the start message sends a roster of {key, name} and clients find their seat by key. Asserted: three players all named "Josh" seat correctly.

**No acting while someone's paying**
- The host accepted new turn intents while a payment/interrupt ask was still outstanding, so the charging player could keep playing mid-chain. Host now drops non-reply intents while any ask is pending; state broadcasts carry waitFor, and clients whose turn it is see "Waiting for <name>…" with input held until the chain resolves.

**"Sent…" clears itself**
- The waiting prompt after sending an intent had no clearer. It's now flagged and dismissed the moment the next authoritative state arrives.

**Tests** — 42/42 (new seat-identity assertion), flows 12/12, drop matrix 38/38.

## v0.3.2 — 2026-07-09
Hotfix: human rent crashed ("b is not defined") + full actor-layer audit.

**The crash**
- The v0.3.0 actor threading declared the actor seat in doRent but the patched resolveBlock line lives in execRent — a separate function. Any human rent play threw a ReferenceError. It shipped because only the flows suite was run before the v0.3.0 push; the drop matrix (which force-plays rent) would have caught it. All three suites now run before every ship, no exceptions.

**The audit it triggered (remote-seat correctness)**
- Reading the crash site exposed that the whole exec layer still assumed the local player as actor — harmless in solo (actor = seat 0 = me) but wrong for host-applied client intents: spendAction was being passed a seat number where it expected a player object (seat 0's falsiness masked it), execRent hardcoded targets [1,2] and receiver seat 0, execSwipe/execSwapFinal delivered stolen/swapped cards to me() instead of the actor, execTakeoverD awarded sets to seat 0, and doRent read rent/hike from the local hand.
- All fixed: spendAction accepts seat or player; every exec resolves the actor player once and uses it for spends, transfers, targets (othersOf(actor)), payment receivers, and name-correct logs; the Rent-Hike prompt only appears for the local seat.

**Also** — the 404 in the console is just the missing favicon; harmless, a proper icon can come with the PWA pass.

**Tests** — engine suite 41/41, flows 12/12, drop matrix 38/38 — all three, from the repo.

## v0.3.1 — 2026-07-09
Online is live: Supabase project keys wired (anon public key — safe to ship client-side; rooms are pure Realtime channels, no database access to protect).

**Tests** — 41/41 PASS.

## v0.3.0 — 2026-07-09
Online multiplayer. Host-authoritative, Supabase Realtime, 2-4 humans.

**Home screen**
- The game now opens on a home card: name entry (persisted), Play Solo (unchanged single-player vs Bazza & Shaz), Host online game, or Join with a 4-letter room code. Lobby shows live presence; host starts at 2-4 players.

**Architecture — host-authoritative**
- The host runs the real engine; clients never mutate state. Every player-action executor gained a client gate: on a client it serialises to an intent and sends it; the host validates (turn/ownership), executes it as that seat, and broadcasts. Cheat-resistant by construction — clients only ever hold their own hand.
- State sync: public state (turn, plays, banks, tables, buildings, deck/pile counts, hand *counts*) broadcast after every host render; each player's actual cards sent per-seat. Clients hard-apply, so any divergence self-heals.
- Remote decisions: payments, No Deal calls, and hand-limit discards route as asks — the remote player gets the exact same direct-manipulation UI (pay from their board, tap-to-discard, interrupt sheet), and their reply resolves the host's pending chain. Invalid/short payment replies fall back to a fair smallest-first cover.
- Plays by other humans showcase exactly like AI plays (card rises centre-stage with their name tag) — the v0.2.22 showcase was quietly the multiplayer spectating system all along.
- Transport: Supabase Realtime broadcast + presence only — zero database tables; a room is just a channel named by its code. supabase-js loads lazily from CDN only when Online is chosen; Solo works fully offline.

**Prerequisite refactor (seat abstraction)**
- MYSEAT replaces every "human = seat 0" assumption: me()/isMyTurn(), opponent row (renders everyone-but-you, panels addressed by absolute seat), targeting, selection, showcases. All attack/payment/placement executors take an actor seat. Solo is behaviourally identical (MYSEAT=0).

**Config**
- SUPABASE_URL / SUPABASE_ANON constants at the top of the online script block — paste project URL + anon key to go live. Without them, Online politely explains itself and Solo is unaffected.

**Known v1 boundaries** — host leaving ends the game (no host migration); hand messages are technically sniffable via devtools (fine for mates, per-seat channels later); remote rent skips the Double-Rent add-on prompt; online seats are all-human (no mixed AI seats yet).

**Tests** — 4 new protocol assertions (serialize privacy, applyState hand-keeping, client intercept purity, host intent execution): 41/41 PASS; solo interaction flows 12/12 from the repo.

## v0.2.30 — 2026-07-09
Back to pure game: engine research moves to its own repo. Plus a fresh feel pass.

**Repo split**
- Trainer scripts and docs/ENGINE_PROJECT.md removed from infinite-table — the strongest-engine work gets a dedicated repository (the project prompt is delivered separately for it). This repo keeps the strong in-game AI (v0.2.26 brain: counting, EV, exact payments) and the full test suites. Review returns when the engine repo produces a judge worth trusting.

**Feel & smoothness**
- Hand fan arc: cards now sit with a subtle rotation (±4°) and dip toward the edges, like a hand actually held — raising a card straightens it as it lifts.
- New bank notes pop in with a spring instead of appearing mid-stack silently.
- Deck pill turns warning-amber below 10 cards — you can feel the reshuffle coming.
- Overscroll containment on the hand, table, and POV: no more page pull-to-refresh or scroll-chaining fighting your gestures mid-drag.
- App fades in composed on load; header icon buttons squish on press; opponent panels transition their turn-glow smoothly; POV hand backs stagger in card by card.

**Tests** — 33/33 PASS, 6-run soak clean.

## v0.2.29 — 2026-07-09
Review parked; engine-project handoff.

- The game-review recording and UI (v0.2.28) are removed pending a dedicated engine-strength project — review will return once the engine is strong enough to be a trustworthy judge. The valuable piece stays: brainCandidates(player) remains the shared, metadata-carrying evaluator (with test coverage), which is exactly the hook the engine project builds on.
- New: docs/ENGINE_PROJECT.md — the full project prompt for the "strongest Monopoly Deal engine" chat: codebase map, everything already learned (including the 10k-game null tuning result and harness quirks), the strength roadmap (benchmark ladder → sequence search → danger terms → determinized Monte Carlo → opponent pools), and the measurement standard for what counts as a real improvement.

**Tests** — 33/33 PASS.

## v0.2.28 — 2026-07-09
Game review foundations — the engine now judges your play, chess.com style.

**Shared evaluator**
- The AI's candidate generator was extracted into brainCandidates(player): the same card-counting EV engine that powers Bazza and Shaz can now score any player's options at any decision point, each candidate carrying metadata (card, mode, human-readable label).

**Move recording (captured live — can't be reconstructed later)**
- The moment you raise or drag a card, the engine silently snapshots every option you had and its EV. When the play commits (single choke point for both tap and drag routes), your choice is matched against that snapshot and stored: what you did, what was best, both scores.

**Review screen**
- The win card gains a gold "Game review" button: overall accuracy % plus every play classified — Best / Good / Inaccuracy / Mistake / Blunder — with the engine's preferred line shown wherever you strayed ("Best: Charge teal rent ($8M) — 6.2 vs 1.8 · turn 4").
- v1 scope: your card plays. Payment choices, No Deal decisions, and wild reassignments are future review dimensions.

**Test-harness fix**
- Reordered assertions so the interval-terminated full-game soak runs last; previous appends had been racing it (masked by a lucky G.over) and the new review tests exposed the hang. Full-game turn counts are meaningful again.

**Tests** — 4 new review assertions (evaluator coverage, recording, classification, accuracy): 36/36 PASS, 6-run soak; interaction flows 12/12.

## v0.2.27 — 2026-07-09
AI genome + self-play trainer. Default play unchanged (deliberately — see below).

**Genome extraction**
- All 22 judgment constants in the AI brain (set-progress values, Deal Breaker hold factor, rent efficiency, JSN margins, payment penalties, etc.) now live in one AI_W object, threaded per-player via tuneW — any player can run any genome, which is what makes self-play training possible.

**Self-play trainer (tests/train.js)**
- Evolutionary loop: mutants play full headless games (~40ms each) against the reigning champion with seat rotation, champion replaced only above a win-rate threshold, checkpointed every generation. `npm run train` / `npm run train:validate`.

**The honest result**
- ~13 generations, 10,000+ games: the evolved genome validated at 34.3% ± 4.5pp against defaults over 420 games — statistically flat. Per-generation "improvements" were winner's-curse noise. Conclusion: the strength came from the v0.2.26 structure (counting, EV, exact payments); the constants were already near a local optimum, and Deal's luck swamps ±30% weight changes in mirror matches. Defaults therefore retained.
- What finding real gains would take (documented for future sessions): paired-seat variance reduction, 1,000+ games per evaluation, CMA-ES over naive mutation, and/or training against exploitable styles rather than mirrors.

**Tests** — 32/32 PASS with the genome refactor.

## v0.2.26 — 2026-07-09
Expert AI: card counting, probability, and EV decisions. Bazza and Shaz got smart.

**Honest framing** — true "optimal" is impossible in Deal (hidden hands + shuffled deck), but this is how expert humans play: perfect counting plus probability-weighted decisions.

**Card counting**
- The AI derives the full 106-card census from the deck builder, then subtracts everything visible (discard, all tables, all banks, buildings, its own hand). What remains is exactly the deck + hidden hands — reshuffle-proof because it re-derives from state every decision.
- No Deal risk is a real hypergeometric: "2 of 3 JSNs unseen among 41 cards, you hold 6 → 27% you have one." Attack EVs are discounted accordingly, with credit for forcing a JSN burn.

**EV decision engine (replaces priority heuristics)**
- Every legal play is scored and the max taken: set-progress values for properties, supply-aware wild placement (won't chase colours that are exhausted), rent expected-collection against each target's actual liquidity with the Rent-Hike combo costed as a two-play investment, steal values counting both sides' completion swing, richest-target selection, hand-size-aware Payday, and Deal Breaker held early but never wasted.
- Win-line detection: any play completing a third set scores 1000 and is taken instantly — verified by assertion.
- The AI now plays Swap Meet (the old one never did) — but only for trades with genuine net completion gain.

**Spiteful payments (exact DP)**
- Payment selection is an exact minimisation over value given + strategic damage: complete-set cards heavily protected, near-sets guarded, wilds kept, and gifting the receiver a set-completing property is a 40-point penalty — effectively never. Verified by assertion.

**Smarter defence**
- No Deal decisions are EV-based, not random: always contest a Takeover, always protect against a near-winning attacker, otherwise weigh loss against JSN scarcity and counter-risk.
- End-of-turn discards keep by strategic value (No Deal 99, Takeover 90 … spare money last) instead of face value.

**Tests** — 6 new brain assertions (census exactness, unseen math, JSN bounds + zero-case, payment spite, instant win-line): suite 32/32 PASS, 12-run soak; interaction flows 12/12; drop matrix clean.

## v0.2.25 — 2026-07-09
Deck finalised against the internally consistent official list: 106 playing cards.

- The previous source's action itemization contradicted its own header (summed 36 vs claimed 34); the corrected list is consistent: 34 actions + 13 rent = 47, itemized 2 Deal Breaker / 3 Just Say No / 3 Sly Deal / 3 Forced Deal / 3 Debt Collector / 3 Birthday / 10 Pass Go / 3 House / 2 Hotel / 2 Double Rent.
- Accordingly: Swap Meet reverted 4 → 3, Beach Resort reverted 3 → 2. The 9th dual wild from v0.2.23 stays (both sources agree on 11 wildcards).
- Final deck: 28 properties + 11 wilds + 13 rent + 20 money + 34 actions = 106 playing cards; the physical deck's 4 rule cards remain the in-app Rules sheet (? button). Total canon: 110.

**Tests** — suite asserts the exact itemization: 26/26 PASS, 10-run soak clean.

## v0.2.24 — 2026-07-09
Final single-player polish pass. No rule changes. Next stop: multiplayer.

**Every overlay now transitions both ways**
- Sheets, the opponent POV, the fullscreen inspector, and the win screen previously popped in nicely but vanished instantly. All four now live permanently in the layout and animate on opacity/transform in both directions — sheets glide down as they leave, the POV settles out with a gentle scale, the win card re-pops on every reopen from the Results pill.

**Pacing & rhythm**
- Adaptive showcase: low-stakes AI cards (Payday, Rent Hike) hold centre stage for 520ms instead of the full 780ms attack-card beat — long games stop dragging without losing readability where it matters.
- The deck reshuffle gets its own banner and tick instead of a buried log line.

**Hand tactility**
- Raising a card now parts its neighbours 9px each way — the hand physically makes room.
- Tapping cards during an AI turn is no longer silent: the card shakes "no" with a soft descending tone and a haptic tick.

**Micro-feedback**
- Bank total pops whenever it changes; play dots fade out smoothly as plays are spent; the active opponent's panel shows a pulsing gold ▸ thinking marker; End Turn clicks with a tick and haptic; completed-set labels render in gold.

**Tests** — 26/26 PASS, 12-run soak; interaction flows 12/12; drop matrix clean from the repo.

## v0.2.23 — 2026-07-09
Deck brought to the official Monopoly Deal itemization; Rules sheet; win-card polish.

**Deck corrections (105 → 108 playing cards)**
- Audited against the official card list. Money (20, $57M, exact denominations), properties (28), and rent (13: five dual pairs ×2 + three wild) were already exact. Three counts were off: Swap Meet 3 → 4 (Forced Deal), Beach Resort 2 → 3 (Hotel), and wildcards 10 → 11 via a new Kawana/Transport dual (the Light Blue/Railroad analogue).
- Note: the source's own action itemization (2/3/3/4/3/3/10/3/3/2) sums to 36, not the 34 its header claims — the per-card list is authoritative and is what's implemented.
- The physical deck's 4 rule cards aren't shuffled into play; digitally they become a proper Rules sheet behind a new ? button in the header — turn structure, paying, protection, wilds & buildings, win condition.

**Polish**
- Win-card ✕ reseated: it now perches on the card's corner as a proper floating close button (felt-highlight disc with border and shadow, press feedback) instead of sitting awkwardly inside the padding.

**Tests** — suite updated to the new counts (deck 108, 36 actions, 11 wilds, conservation at 108): 26/26 PASS, 12-run soak; interaction flows 12/12; drop matrix clean.

## v0.2.22 — 2026-07-09
AI plays get a showcase; the finished board is browsable. No rule changes.

**Opponent plays: card first, result second**
- When an AI spends an action or rent card, it no longer just happens. The card rises from their panel to centre stage at 1.5×, wearing a gold name tag ("Bazza"), holds for ~0.8s so you can read it, then flies to the pile — and only then does the consequence reach you. A visual lock delays every downstream human-facing step (No Deal prompts, payment mode, the AI's own next play) until the showcase lands, so cause always precedes effect. AI No Deal counters get the same treatment, making interrupt chains fully readable as a card-for-card exchange.

**The win overlay is dismissible**
- ✕ (or tap outside the card) closes the results and returns you to the final table, fully browsable: inspect sets, open opponent POVs, review the play pile, hold-inspect your remaining hand (hold now works post-game). A gold "Results" pill sits top-right to bring the summary back any time.

**Tests** — 26/26 PASS, 12-run soak; interaction flows 12/12 and drop matrix clean from the repo (showcase timing verified compatible with all chains).

## v0.2.21 — 2026-07-09
Win overlay, readable bank, touch polish. No rule changes.

**Win happens at the table**
- Winning no longer cuts to a separate screen. The final play lands, the table sits for a ~0.7s beat, then a floating result card rises over a blurred, darkened view of the finished board — winner, winning sets, round count, and every bank total, with confetti falling over the real table. Play again button unchanged.

**Bank you can read**
- Note overlap halved (-30px → -14px): every note's value is visible even in a fat stack of $10Ms. Applies to your bank and opponent banks (POV/inspection share the component). Notes squash on press when they're tappable (pay mode).

**Touch**
- Pickable table cards (steal/swap/pay targeting) now compress on press like everything else — one consistent touch language across hand, notes, and board.
- CSS-integrity guard extended to cover the new win card.

**Tests** — 26/26 PASS, 12-run soak clean.

## v0.2.20 — 2026-07-09
Hotfix: v0.2.19 shipped with a large chunk of the stylesheet missing.

**What happened**
- The v0.2.19 cleanup used a greedy regex to delete a few retired payment-sheet CSS rules; it matched from the first retired rule to the last and swallowed everything between — the colour picker, the entire win screen, the log drawer, and the whole drag/manipulation block (drag clone, drop-zone highlights, prompt pill, player-select pulse, wild ghosts). Symptoms: unstyled log-drawer text visible below the hand, and glitchy dragging (the drag clone lost its fixed positioning).
- The JS suites couldn't catch it because none of them validated CSS.

**Fixed**
- All swallowed rules restored with current-era token values; the intended retirements (payment-sheet styles) stay removed.

**Never again**
- The engine suite now opens with a CSS-integrity assertion: 23 load-bearing selectors must exist in the stylesheet or the suite fails before anything else runs.

**Tests** — suite now 26/26 PASS (incl. CSS integrity), 15-run soak clean; interaction flows 12/12; drop matrix 38/38.

## v0.2.19 — 2026-07-09
Sheets retired for pay/select — everything happens on the boards. Plus: the turn-2 "Script error" root-caused and fixed.

**Your turn-2 crash: solved**
- Root cause: the POV screen (v0.2.16) kept its DOM after closing, only hidden — so its opponent panels lingered as ghosts. Unscoped `.opp` queries then miscounted players: dragging Hostile Takeover after ever peeking at an opponent indexed a non-existent player and threw. Reproduced in the jsdom drop matrix (three takeover paths failing), fixed by scoping all opponent queries to the live row and tearing the POV DOM down on close. Matrix now 38/38 clean again.

**Paying: pick straight off your table**
- The payment sheet is gone. When you owe, your bank notes and property cards become tappable in place — selected cards lift with an amber ring — while a persistent HUD bar shows "Pay Bazza — $5M of $8M" with a live meter (green when covered), Auto-select, and Pay. The hand dims; you literally hand cards over from your own table.

**Targeting: pick straight off theirs**
- Swipe/Takeover/Swap now open the opponent's POV board with the real cards pickable: eligible cards ringed gold, protected sets dimmed, complete sets tappable as whole stacks for Takeover. Swap then highlights your own eligible cards on your board for the give-away. Tap anywhere off the board to cancel (the action card returns unspent).

**Discarding: pick straight from your hand**
- End-of-turn discard is hand-tap selection with the same HUD pattern — no sheet.

**Retired** — payment sheet, discard sheet, and all four text-list target pickers (and their CSS). The tap-menu now routes into the same board-pick flows. Remaining sheets: No Deal interrupts, Rent Hike choice, card options, wild colour pick, recent plays — all genuinely modal decisions.

**Tests** — suite 25/25 PASS + 15-run soak; new jsdom end-to-end suite (pay-from-board, board-pick swipe, hand discard) 12/12 PASS; full drop matrix 38/38 clean.

## v0.2.18 — 2026-07-09
Flat background. No rule or interaction changes.

- App background is now a single flat Felt Green — the amber wash and highlight radials are gone. The POV screen matches (it mirrors the body), and the win screen goes flat Table Night for a quiet finish.
- All other surface treatments (card faces, notes, coins, card-back weave, sheet) untouched — depth now comes only from the objects on the table, not the table itself.

**Tests** — 25/25 PASS.

## v0.2.17 — 2026-07-09
Bug investigation + on-screen error reporting. No rule or interaction changes.

**The reported "Script error" (drag action card, turn 2)**
- Built a full-browser reproduction harness (jsdom): boots the game, plays through to turn 2, then drags every card type and force-drops it on every one of its legal zones — 38 drop combinations including bank, action zone, deck, opponents, set stacks, and ghost placeholders, with No Deal chains and payments allowed to settle after each. Result: zero errors. The core drag/drop/act pipeline is verified clean.
- The masked message ("Script error" with no detail) indicates the page is running where error details are hidden from the console (e.g. a sandboxed preview iframe), so the true message was unrecoverable this time.

**New: errors surface in-game**
- A global error trap now loads before everything else: any uncaught error or unhandled promise rejection appears as a red toast at the top of the screen with the real message, stack head, and line number (tap to dismiss; also written to the game log). Next time anything breaks, the toast says exactly what — screenshot it and the fix is trivial.

**Defensive hardening from the audit**
- Drag movement bails safely if the drag clone has been torn down mid-gesture; drops validate their zone before acting (spring back instead of throwing).

**Tests** — 25/25 PASS; jsdom drag harness clean across all 38 drop paths.

## v0.2.16 — 2026-07-09
Opponent inspection is now their literal point of view. No rule changes.

**POV screen**
- Tapping an opponent replaces the bottom-sheet summary with a fullscreen view of their seat, laid out exactly like your own screen: an opponents row from their perspective (you appear as a panel, avatar in the reserved Info Slate), the same table felt and lighting, their sets as full-size cascading stacks, their bank as notes, and their hand fanned across the bottom tray as face-down card backs with the same adaptive overlap your hand uses.
- The view is live — it re-renders with the game, so you can watch a turn unfold from their side of the table. Tap anywhere to return to your seat.
- Opponent panels now render through one shared component (used by the main screen and POV), so the two can never drift apart.
- Target-selection sheets (Swipe/Takeover/Swap) are unchanged — POV is for looking, the sheets are for aiming.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.15 — 2026-07-09
Raised-card headroom, mirrored opponent view, long-press inspector. No rule changes.

**Fixed: raised cards clipped at the top**
- overflow-x:auto on the hand strip forces vertical clipping too, so raised cards lost their tops. The hand now carries 48px of headroom (offset with a negative margin so total layout height is unchanged) — raised cards float visually over the board.

**Opponent view now mirrors your screen exactly**
- The set-stack cascade was extracted into one shared component (setStackHTML) used by both your board and the opponent sheet. Tapping a player now shows their table as the same full-size cascading stacks you have, their bank as the same notes, and their hand as face-down backs — identical layout, unknowns hidden.

**Long-press inspector**
- Hold any hand card ~0.4s: it enlarges to fullscreen (2.3×) over a scrim with a pop-in, haptic, and tick. Tap anywhere to dismiss. Movement, lifting, or starting a drag cancels the hold; the press squish plays during the hold so it feels continuous.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.14 — 2026-07-09
Refinement sweep. No rule changes.

**Visual/legibility**
- Property Charcoal lifted #3B3F3E → #474D4A — the Transport set was sinking into the felt at chip size (the tightest contrast pair in the new system).
- Play-pile chip now truncates long card names with an ellipsis instead of stretching the strip; prompt pill raised to clear the hand comfortably.

**Copy**
- All aiming hints rewritten tap-first ("Tap a player — they pay you $5M") since tap-to-raise is the primary interaction; drag still works everywhere the copy implies a tap.

**Feel**
- Cancelled drags now settle back with a soft descending "back" tone alongside the spring animation.
- The deck pill physically pops as draws leave it, tying the flight to its source.

**Code**
- Play-flight logic deduplicated: tap-route and drag-route both go through one playFlight() (tilt-aware, landing thock included) instead of two hand-rolled flyCard calls.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.13 — 2026-07-09
Premium global colour system installed — designed as the base style for a future multi-game app. Colour system only; no layout, rule, or interaction changes.

**The system (named tokens, six groups)**
- Base UI: Table Night #121A16 (app background), Felt Green #1D2B25 (surface), Felt Highlight #29392F, Text Ivory, Text Faint.
- Cards: Card Ivory #F7F2E6, Card Edge #D9D2C0, Ink Black #24241D, Muted Ink #6E6C5E.
- Actions: Primary Coral #E26A4B (the single saturated action colour) with pressed variant; Money Gold #BE8F41 — aged brass, deliberately not casino gold.
- Status: Success Green #3E8E68, Danger Red #B8483D, Warning Amber #D9A03F, Info Slate #5A8CA8 (reserved for multiplayer presence).
- Property colours: ten inks (Amber, Teal, Coral, Green, Purple, Orange, Brown, Sky, Sage, Charcoal) desaturated into a shared luminance band — instantly distinguishable, none louder than another, printed-ink rather than toy-plastic.
- Shadows/borders: ivory hairline pair, deep-base card/raise shadows, and a scrim token for overlays.

**Application**
- All legacy variables now alias through the token system; every hardcoded gradient (body wash, card-back weave, notes, coins, badge, success meter) re-anchored to the new families; brass replaces gold in note/coin metallics; overlay scrims unified on one token; all deep shadows now sit on the Table Night base.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.12 — 2026-07-09
Global colour scheme applied from spec + feel refinements. No rule changes.

**Design tokens (source of truth)**
- The supplied token set is now defined verbatim in :root (--ui-*, --action-*, --game-*), and every legacy variable resolves through it: table felt #163832 over deep #101820, soft highlight #1F4E45, ivory cards #F7F3E8 with #D8D2C3 edges, ink/muted ink, primary coral #E85D4F/#C94A3F, money gold #D9A441, and the ten game colours restored to their original hues (amber #E6A93A through charcoal #2B2F33).
- Every hardcoded gradient re-anchored to the token world: body wash, sheet, card back weave, win screen, bank notes, coin faces, turn badge. Global tint sweeps replaced all legacy amber/coral/shadow rgba values (shadows now sit on the deep #101820 base). Semantic tokens put to work: payment meter turns action-success green when covered, attack shake outlines in action-danger, prompt pill borders in action-warning. action-info is defined and reserved.

**Feel refinements**
- New "drop" thock: player-played cards now land with a low physical thud at the end of their flight (tap and drag routes).
- Payment meter gives an audible chime + haptic the instant your selection covers the debt — no more reading the number to know you're done.

**Stayed identical** — rules, engine, AI, layout, gestures.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.11 — 2026-07-09
Warmer palette, action play zone, full opponent view. No rule changes.

**Warmer colours (round two)**
- Felt moved fully into warm sunset kelp-green (#28553F family) with a stronger amber sunlight wash; sheet, card back, and win screen re-tinted warm. Hairlines now warm parchment. Foam text, cream cards, gold, and coral all nudged warmer; set identity colours re-balanced to match.

**Action play zone**
- Raising or dragging any non-building action card (Payday, Shout, Favour, Swipe, Swap, Takeover) morphs your property area into one big dashed gold "play here" panel naming the card and what happens next. Drop or tap it: instant plays fire immediately; targeted ones flow straight into tap-a-player selection. Buildings, rent cards, and No Deal keep their existing targets; the zone only appears when the play is currently legal. Opponent-panel drops still work as the fast path.

**Opponent view = their whole screen**
- Tapping a player now shows their hand as overlapping face-down card backs (count exact), their bank as the same money notes you have, and their sets at full size — the complete view of their side of the table.

**Cleaner**
- Empty-table placeholder text removed; an empty board is just an empty board.

**Stayed identical** — rules, engine, AI, gestures.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.10 — 2026-07-09
Golden-hour palette + second declutter sweep. No rule or interaction changes.

**Cozier colours**
- Felt shifted from cool sea-teal to warm pine-lagoon (#11504A family), with a stronger honey-gold sunlight wash at the top of the screen; sheet, card back, and win screen re-tinted to match.
- Coral softened from neon (#FF6B57 → #F87A5E), gold warmed to honey (#EFB44A), cream card faces and foam text warmed; UI hairlines now carry a warm cream tint instead of pure white.
- Set identity colours gently desaturated/warmed (teal, sky, green, purple, orange) while staying instantly distinguishable.

**Cleaner**
- The always-on log ticker is gone from the strip — the strip is now just Deck · Pile · turn badge, breathing. Full history still lives behind the ≡ drawer; banners and the prompt pill already carry live events.
- Card faces decluttered: all footer chatter removed ("Drag to your bank", "Or bank for $XM" — the corner coin already says the value), rent-card copy shortened, wild footers folded into the description line. Rent ladders lose their dashed rules for clean open rows; value coin slightly smaller.
- Header eyebrow shortened to "SUNSHINE COAST"; horizontal padding unified at 16px across opponents, strip, board, and hand; board sections given more air (12px gaps).

**Stayed identical** — rules, engine, AI, zones, gestures, flights. log() still records everything for the drawer.

**Tests** — 25/25 PASS, 15-run soak clean; zero cfoot references remain.

## v0.2.9 — 2026-07-09
Cozy pass + housekeeping. No rule changes, no interaction changes.

**Cozy**
- Warm sunlight tint added to the top of the felt (soft gold radial over the lagoon gradient); shadows softened across cards, buttons, and panels (less black, more diffuse).
- Opponent panels rounder (14px) with quieter borders; bottom sheet rounder (24px) and warmer; wild ghost placeholders glow gold instead of stark white; zone labels and the log ticker fade back so the cards own the screen.
- Copy softened and de-cluttered: shorter zone labels ("Your table", "Bank"), gentler empty-state and welcome lines, tutorial tip removed from the options sheet.

**Clean up (dead code from ten iterations removed)**
- Removed: .minicard family (replaced by cascades in v0.2.6), .bankchip (replaced by notes), .setgroup-hdr/.setcards, the entire dealt/dealIn hand animation path (superseded by deck flights in v0.2.4), and handCardHTML's vestigial dealIdx/stagger parameters. Verified zero remaining references.

**Stayed identical** — all rules, engine, AI, zones, gestures, flights.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.8 — 2026-07-09
Snap-back elimination. No rule changes.

**Fixed: drops randomly snapping back to hand**
- Primary cause: iOS could still hijack an in-progress drag as a scroll and fire pointercancel — pointermove.preventDefault() does not block scrolling; only a non-passive touchmove preventDefault does. That blocker now engages the moment a drag starts, so the browser can never steal an active drag.
- pointercancel while hovering a valid zone now completes the drop instead of punishing you for the browser's decision.
- Hit-testing now checks both the finger position and the card's centre — dropping when the card visually covers a zone counts even if your finger is off it.
- Magnetic release: letting go within 48px of a valid zone snaps the card in rather than bouncing it back.
- Zone forgiveness inflation raised 14px → 22px, and the drop routine is unified so pointerup and pointercancel behave identically.

**Stayed identical** — rules, engine, zones, visuals, all prior interactions.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.7 — 2026-07-09
Touch response: every press now lands. No rule changes.

**Fixed: inconsistent press feel ("can't crush them every time")**
- Press feedback previously relied on the CSS :active state, which iOS drops the moment a finger moves a pixel — so most touches showed nothing. The squish is now driven directly by pointerdown: every touch on a card compresses it instantly (scale .955, 70ms) with a light haptic, releasing into a bouncier spring curve (overshoot bezier). It fires on literally every contact, including mid-scroll grazes.

**More grabbable cards**
- Any upward pull of 8px now commits to a drag — diagonal pulls no longer get eaten by the old "more vertical than horizontal" rule. Sideways/downward movement still scrolls the hand.
- A raised card owns its gestures completely: touch-action is disabled on it while raised, and any-direction movement over 6px picks it up — the card you've committed to can always be moved.
- The drag clone now pops off the table (scale 1 → 1.07 over 130ms) instead of appearing pre-lifted.

**Stayed identical** — rules, engine, zones, flights, visuals.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.6 — 2026-07-09
Your side of the screen becomes the real table. No rule changes.

**Your table**
- Property sets now render as full-size cascading stacks: each 102×150 card offset 28px down from the one above, so every card's colour band and name stays readable while the top card shows in full — exactly how sets sit in front of you in the physical game. Sets sit side-by-side in a horizontally scrolling spread; complete sets get a gold ring around the whole stack. Buildings and set progress live in a small footer under each stack.
- Cash is now a pile of actual notes: overlapping gold bank-note cards with embossed values (non-money banked cards render as pale notes), with the running total beside the pile.
- Drop-zone ghosts for wilds are now full card-sized dashed placeholders, matching the table scale.

**Play pile shrunk to a widget (per request)**
- The centre pile from v0.2.5 is gone. The strip now shows a compact pile chip with the name of the last play and total pile count; it pops when a card lands. Tap it to open a reviewable, newest-first gallery of the recent plays at full size, each tagged with who played it.
- AI plays still fly face-up from their panel — now shrinking neatly into the pile widget.
- New drop semantics: Payday drops onto the deck itself (draw 2), Shout a Round drops onto the opponents' row.

**Stayed identical** — rules, engine, AI decisions, deck. All prior interaction behaviour (tap-raise, drag, flights, viewSet, wild moves) unchanged, retargeted where zones moved.

**Tests** — 25/25 PASS, 15-run soak clean.

## v0.2.5 — 2026-07-09
Centre table added: played cards land in the middle at full size. No rule changes.

**The table**
- A dashed table zone now sits at the top of the board. Every consumed play — actions, rent cards, Payday, No Deal! counters — lands there as a full 102×150 card, stacked with natural scatter (random tilt/offset per card), newest on top with a gold badge naming who played it. The last four plays stay visible; older ones slide under.
- No Deal! chains are now readable in the open: each counter physically lands on the pile as it's played.
- AI plays fly face-up from their panel to the table — you watch the actual rent card Bazza just played travel and land, instead of a shrinking card back heading for a counter pill.
- Payday and Shout a Round are now dropped (or tap-played) onto the table zone itself, and player flights aim there.

**Not on the table (by design)** — property, wild, money, and building plays still go where they live (your sets, your bank); end-of-turn discards skip the pile since they aren't plays.

**Stayed identical** — rules, engine, AI decisions, card faces. Pile is display-only state layered over the existing discard logic.

**Tests** — 25/25 PASS, 20-run soak clean.

## v0.2.4 — 2026-07-09
Physicality pass: cards now travel, tilt, and land. No rule changes.

**Cards travel instead of teleporting**
- Playing a card (tap-zone or drag-drop) sends a visual copy flying from your hand to its destination — shrinking toward the bank as a note, toward a set as a placed card — with a slight rotation and a landing snap on the zone. State updates instantly underneath; the flight is pure garnish, so nothing feels slower.
- Drawing: card backs (new woven-teal back design with the C monogram) fly from the deck counter into each new hand slot, then the face pops in with a tick. The opening five-card deal now uses the same flight, staggered — the game leads with motion. The hand auto-scrolls to reveal new arrivals.

**Cards have weight**
- Dragged cards tilt with horizontal velocity (damped, ±10°) and settle upright when you stop — the single cheapest "this is a physical card" cue.
- A raised card floats gently while you decide (2.6s idle bob).

**Opponents' plays are visible**
- When an AI consumes an action or rent card, a card back physically flies from their panel to the discard pile; property/bank plays flash their panel gold. You can now watch Bazza's turn happen instead of reading about it.

**Stayed identical** — rules, engine, AI decisions, layout, visual design system. All flight/tilt effects respect prefers-reduced-motion (global animation kill).

**Tests** — 25/25 PASS, 20-run soak clean (AI visual hooks verified inert in headless runs).

## v0.2.3 — 2026-07-09
One-line class of bug, big visual payoff.

**Fixed: cards genuinely different sizes at rest**
- Root cause: `.card` was sized via `flex-basis: 102px`, but flex-basis only applies when the parent is a flex container. The `.cardw` wrapper introduced in v0.1.3 is a plain block, so card widths silently fell back to shrink-wrapping their text — verbose rent descriptions produced wide cards, money cards came out narrow. User correctly diagnosed "I think it's the text."
- Every card now carries hard `width/min/max: 102px` and `height/min/max: 150px`; the wrapper is pinned to 102px. Identical dimensions in hand, sheets, inspection views, and the drag clone.

**Stayed identical** — everything else. Tests 25/25 PASS.

## v0.2.2 — 2026-07-09
Hand feel fix: uniform cards, persistent DOM, instant taps. No rule changes, no visual redesign.

**Fixed: cards looked different sizes in hand**
- The fan arc was the culprit — per-card rotation (up to 7°) plus vertical arc offsets made edge cards sit tilted and lower, reading as inconsistent sizes on a phone. The fan is gone: the hand is now a flat, flush row of identical 102×150 cards with uniform overlap. Deal-in animation loses its rotation too.

**Fixed: clunkiness**
- Root cause: the entire hand was rebuilt from scratch (innerHTML) on every game event — resetting your scroll position, restarting animations mid-flight, and discarding the raised card. The hand now uses keyed DOM reconciliation: existing card nodes persist across renders, only added/removed cards touch the DOM, spacing and stacking update in place. Scroll position survives everything; unchanged hands cost zero DOM churn during AI turns.
- Cards that shift position slide there (FLIP) instead of teleporting; removed cards leave without disturbing neighbours.
- Taps now fire on finger-lift (pointerup) instead of waiting for the browser click event — selection response is immediate, with the trailing click swallowed to prevent double-toggles.
- Raise/lower is now a single CSS class transition on the wrapper (one motion curve, no inline-style fighting).

**Stayed identical** — rules, deck, AI, payments, No Deal, win logic (25-assertion suite unchanged and green); visual design system; single-file structure.

**Tests** — 25/25 PASS, 20-run soak clean.

## v0.2.1 — 2026-07-09
Mobile reliability & feel fixes from drag/drop audit. Single file retained by request (module split deferred to the multiplayer version).

**Audit findings fixed**
- iOS drag failure diagnosed: with touch-action:pan-x, any horizontal finger drift during the pickup slop let Safari claim the gesture as a scroll and fire pointercancel, killing the drag. Diagonal pulls were near-impossible — this was the "moving cards feels impossible" bug.
- Drag clone sizing bug: the clone copied the rotated fan wrapper's bounding box, so edge-of-hand cards changed size on pickup. Clones are now a fixed uniform 102×150, centred on the card, rotation stripped — every card is the same size in every state.
- Ghost-tap bug: dropping on a set group also fired that group's click, opening the set viewer over the top of rent/steal flows and corrupting the interaction. A capture-phase click guard now swallows the post-drag click.

**New primary interaction: tap-to-raise**
- Tap a card: it lifts and stays raised while every legal destination lights up and the prompt pill explains the move. Tap a glowing zone to play there (snap + haptic), tap the card again — or anywhere empty — to lower it back into the hand. Tapping another card switches the selection.
- 100% reliable on iPhone because it never competes with scroll gestures. Drag remains as a secondary path (now with pointer capture and the fixes above).
- An Options button on the prompt pill opens the old per-card menu, so nothing is lost.

**Flow clarity**
- Rent Hike prompt now names who pays and reads as a clear either/or.
- Swipe and Swap target sheets dim protected (complete-set) cards to 40% so eligibility reads at a glance.
- Consistent motion curve (cubic-bezier(.2,1.15,.3,1), ~200ms) across raise, lower, press and fan reflow.

**Stayed identical**
- All rules, card data, deck composition, AI behaviour, payment/No Deal logic, win conditions: untouched — verified by the unchanged 25-assertion suite.
- Visual design system (colours, typography, card faces, layout): untouched per instruction.
- File structure: still one self-contained HTML file; internal sections remain labelled (ENGINE / UI / SELECTION / DRAG / ACTIONS / AI) for the future split.

**Tests** — 25/25 PASS, 20-run soak clean.

## v0.2.0 — 2026-07-09
Game-feel overhaul: direct manipulation replaces menu-driven play. Engine and rules unchanged. (Multiplayer moves to v0.3.0.)

**Pre-change audit findings** — every play needed tap → sheet → tap (3 interactions to bank $2M); no drag; fixed hand overlap that teleported on change; dismissible payment sheets could strand game state; interrupts looked like ordinary menus; targeted actions used text lists; opening deal had no presence; scroll-snap fought the finger; zero haptics.

**Drag-and-drop play (the core change)**
- Cards track the finger 1:1 via pointer events and translate3d — no transitions during drag, no offset jump (grab point preserved). Vertical pull lifts the card; horizontal swipe still scrolls the hand naturally (touch-action: pan-x).
- Pickup feedback: instant scale + drop-shadow lift, pick tick, light haptic (vibration API — fires on Android; iOS Safari doesn't expose web haptics, degrades silently).
- Legal drop zones outline on lift and glow gold + swell as the card enters them (14px forgiveness inflation); a slim prompt pill states the move ("Drop on a player — they pay you $5M"). Invalid drops spring back in 190ms with an overshoot curve; valid drops snap with a pop on the receiving zone.
- Per-type destinations: money → bank; properties → their set; wilds → any eligible set, with dashed ghost placeholders appearing for sets you don't own yet; rent → your matching set (wild rent then asks you to tap who pays); Favour/Swipe/Swap/Takeover → dropped directly on an opponent's panel; Payday/Shout → the table; buildings → eligible complete sets.
- Tap still opens the options sheet as a fallback for every card.

**Direct selection on the table**
- Swipe/Takeover/Swap now open the target's board with the stealable cards themselves highlighted and tappable — no more text-list menus. Wild-rent target choice is a tap on the opponent's panel with a persistent prompt bar.

**Hand**
- FLIP layout animation: cards slide (not teleport) to new positions whenever the hand changes.
- Adaptive overlap: spacing compresses smoothly as the hand grows (40px overlap ≤6 cards, up to 62px at 13+), keeping 12–15 cards browsable without endless scrolling. scroll-snap removed.

**Payments & interrupts**
- Payment sheet rebuilt: sticky header with a live progress meter (turns green at covered), running "$6M of $8M selected", one-tap Auto-select (bank-first, protects complete sets), grouped Bank/Properties sections with a plain-language warning that properties move to the receiver, and the sheet is locked — no accidental dismissal mid-debt.
- No Deal! prompts and payment demands carry a pulsing INTERRUPTION flag, name the attacker and action, and show how many No Deal! cards you hold. All other sheets now close on backdrop tap.

**Flow & moments**
- Opening deal: your five cards flip in staggered with ticks before the first turn starts — the app leads with motion.
- Set completion and win events add haptic patterns; win confetti toned down (32 pieces) and the winscreen title de-shouted.
- Sheets no longer stack awkwardly during multi-step flows; selection modes survive re-renders.

**Tests** — suite extended to 25 assertions covering the new shared attack executors (swipe/takeover/swap now run identical code from drag, direct-selection, and tap-menu paths): 25/25 PASS, 20-run soak clean.

## v0.1.3 — 2026-07-09
Readability & handling pass, from playtest feedback. No rule changes.

**Fixed**
- Value coin no longer overlaps the card title band — it now sits just below the band like a price tag, so long set names (Maroochydore, Mooloolaba) read clean.

**Hand overhaul (UNO-style)**
- Cards now overlap in a fanned arc with slight rotation and a raised centre; pressing a card lifts it above its neighbours.
- Hand auto-sorts every render: properties grouped by colour, then wilds, rent cards, actions, money — matching cards always sit together.
- Small hands centre themselves instead of hugging the left edge.

**Full-card inspection**
- Tap any of your set groups to open it: full-size card faces, current rent (buildings included), and a "Move wild" button per wild — replacing the fiddly mini-card tap.
- Tap any opponent panel to see their entire table: every placed card at full size per set, plus hand count, bank total, and complete-set tally. Scout before you Swipe.

**Under the hood**
- Card face rendering refactored into one shared `faceHTML` renderer (hand, inspection, and opponent views all draw from it); placed wilds render in their assigned colour with the rent ladder for that set.

**Tests** — full suite 20/20 PASS, 15-run soak clean.

## v0.1.2 — 2026-07-09
UI & professionalism pass. No rule changes.

**Card faces redesigned**
- Property cards now carry a full rent ladder (per-card-count payouts, ★ marking the complete-set tier) plus a gold value coin in the corner.
- Money cards restyled as bank notes with an embossed coin face.
- Wilds get a split-colour band and reassignment hint; rent and action cards get purpose footers ("Or bank for $XM").

**Table & chrome**
- Header lockup with eyebrow tagline; refined logo spacing.
- Opponent panels: coloured avatar initials, cleaner "N cards · $XM" meta, hover titles on set chips, ⌂/✦ building glyphs (replacing emoji).
- Discard pile counter added next to the deck counter.
- Consistent shadow/gradient token system across chips, buttons, pills, and sheets; bottom sheet gains a drag handle and blur backdrop; focus-visible outlines for keyboard use.

**Win screen**
- Match stats line: round count and every player's final bank.

**Tests** — full suite 20/20 PASS; 40-run extended soak clean (one earlier apparent failure traced to the test-runner's own 60s timeout on a slow run, not game logic).

## v0.1.1 — 2026-07-09
Feel & polish pass. No rule changes.

**Added**
- Turn banners ("YOUR TURN" / "BAZZA'S TURN") and drama banners for AI Hostile Takeovers and rent demands.
- Card deal animation: newly drawn cards flip up into your hand with a stagger (turn draws and Payday).
- Sound effects via WebAudio (card tick, coin chime, attack alert, set-complete jingle, win fanfare) with a 🔊/🔇 toggle in the header. No assets, all synthesised.
- Attack feedback: opponent panel shakes red when you hit them; alert sound + bottom-sheet slide-up when you're targeted or owe a payment.
- Set-completion celebration: gold pop + jingle the moment a set completes; confetti + fanfare on a win.
- End turn button pulses when you're out of plays; active opponent panel glows while thinking.
- AI turn pacing now varies (600–1150ms) instead of a fixed 900ms tick.
- `prefers-reduced-motion` now disables all animations, not just transitions.

**Tests** — full suite 20/20 PASS, 20-run soak clean after patch (DOM stubs extended for banners/confetti).

## v0.1.0 — 2026-07-09
Initial release. Single-file, local play: you vs 2 AI opponents (Bazza & Shaz).

**Game content**
- 105-card deck: 28 properties across 10 Sunshine Coast colour sets (Noosa, Mooloolaba, Maroochydore, Buderim, Caloundra, Coolum, Nambour, Kawana, Hinterland, Transport), 8 dual wilds + 2 Coastal Wilds, 20 money cards, 34 action cards, 13 rent cards.
- Actions: Hostile Takeover, No Deal!, Sneaky Swipe, Swap Meet, Call In a Favour, Shout a Round, Payday, Granny Flat, Beach Resort, Rent Hike.
- Set sizes and rent tiers deliberately differ from any existing published game's colour map.

**Rules implemented**
- Draw 2 per turn (5 on empty hand), up to 3 plays, 7-card hand limit with end-of-turn discard.
- Rent (dual = all players, wild rent = one player), Rent Hike doubling (costs an extra play).
- Full payment system: payer chooses cards, no change given, hand-over-everything when short, properties transfer with colour intact.
- No Deal! chains with counter-No Deals, works in both directions (you vs AI, AI vs AI).
- Complete sets are theft-proof except via Hostile Takeover; buildings transfer with stolen sets and are discarded when a set is broken.
- Free wild reassignment on your turn (tap a wild in your properties).
- Win: 3 complete sets. Card conservation verified at 105 every turn.

**Tests (20/20 PASS, 20-run soak clean)**
- Deck composition, rent maths incl. buildings, set completion/win detection, broken-set building cleanup, AI auto-payment, short-payer hand-over, full headless AI games reaching a winner with card conservation.

**Planned — v0.2.0**
- Supabase Realtime multiplayer: room creation, 4-char join code, presence, private hand per device (same pattern as the drinking game app scope).
