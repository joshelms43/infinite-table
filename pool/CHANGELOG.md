# 8-Ball — Changelog

## v0.1.1 — 2026-07-16
**The table said NOT RIGHT NOW to everyone, forever.** Caught live on the first two-phone rack: `applyIntent` raised the host's `busy` flag before simulating a shot and nothing anywhere lowered it — the opening break locked every later intent out of the match, and the shot clock (which also defers to `busy`) went silent with it. The M Deal clock deadlocks (v0.9.9, v0.9.10) taught that any flag that can stop play needs a path back down that doesn't depend on the happy path; this one had no path at all.

Three layers down, none trusting the others:
- `busy` now carries `busyUntil` — the shot's actual flight time plus 600ms — and `applyIntent` self-heals a stale flag on entry. A shot holds the table for its flight, never forever.
- The host's animation completing clears it on the spot (the happy path, now merely the fast path).
- The 1-second clock interval clears it too, because a backgrounded host tab never steps its animation at all.

Also fixed while in there: a `shot` broadcast arriving while a client was still animating the previous one used to be **dropped** — the client would freeze on stale state until the next push. Shots now queue (bounded at 4) and play in order; an authoritative `state` beyond the queue snaps past everything.

The gate grew the repro: poolsim now boots the real page, replays that exact afternoon — break, then the next shot — and fails if the table ever holds itself hostage again. Mutation-checked: with the self-heal removed, the test goes red.

## v0.1.0 — 2026-07-16
The first rack. Two-player online 8-ball, no spin, no called pockets.

**The architecture** — the first continuous-physics, turn-based game on the platform. A shot never crosses the wire as sixty positions a second; it crosses as `{angle, power}`. The host replays it through `shared/pool-physics.js` (fixed 1/480s timestep, fixed iteration order, zero randomness), judges it with `shared/pool-rules.js`, and broadcasts the input alongside the authoritative final positions. Every phone animates the same deterministic replay locally and snaps to the host's truth when the balls stop. Host-authoritative, exactly like Mafia — intents in, state out.

**The rules** — WPA 8-ball minus pocket calling, stamped `2026-07-16-wpa-nocall`. Open table after the break regardless of what drops, first legal pot assigns groups, wrong group first is a foul, something must reach a rail after contact, fouls are ball in hand (break fouls: kitchen only), early 8 loses, 8-plus-foul loses, clean 8 wins. Two deliberate simplifications, documented in the rulebook header: the 8 on the break auto-respots (WPA offers a choice; a choice is a UI), and a weak break is an ordinary kitchen-ball-in-hand foul (no re-rack option).

**The table** — canvas, portrait-aware: the table stands upright on a phone and lies flat on a desktop. Aim by dragging through your finger — the guide shows the cue path, the ghost ball at first contact, and the object ball's line; distance is power. Ball in hand is a drag of the cue itself, with the kitchen highlighted when the foul demands it.

**The clock** — 75 seconds per shot, enforced by the host on a 1-second interval rather than a timeout, because throttled tabs fire timeouts late and killed tabs never fire them at all — a stalled clock is a deadlock and we have shipped one of those before (M Deal v0.9.9/v0.9.10). Expiry is an ordinary foul: turn passes, ball in hand.

**The gate** — a new `poolsim` stage: physics invariants (nothing escapes the cloth, nothing overlaps at rest, energy only decreases, every shot comes to rest on its own) across seeded shot sequences; byte-identical determinism between `simulate()` and ragged `stepper()` runs — the networking model rests on it; the rulebook clause by clause, every foul and both 8-ball deaths; and six seeded full games played by ghost-ball bots that must reach a verdict, because a rule set that can strand a game is a deadlock too. Pool also joins lint (version discipline, rulebook single-source) and bootsim (document-order boot).

**One bug worth remembering** — the bots' random target pick originally lived *inside* a `find()` callback, so the dice re-rolled for every ball inspected and the search could match nothing. Rolled once, then looked. The kind of bug determinism testing exists to catch.
