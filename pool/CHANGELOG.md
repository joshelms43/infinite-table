# 8-Ball — Changelog

## v0.1.0 — 2026-07-16
The first rack. Two-player online 8-ball, no spin, no called pockets.

**The architecture** — the first continuous-physics, turn-based game on the platform. A shot never crosses the wire as sixty positions a second; it crosses as `{angle, power}`. The host replays it through `shared/pool-physics.js` (fixed 1/480s timestep, fixed iteration order, zero randomness), judges it with `shared/pool-rules.js`, and broadcasts the input alongside the authoritative final positions. Every phone animates the same deterministic replay locally and snaps to the host's truth when the balls stop. Host-authoritative, exactly like Mafia — intents in, state out.

**The rules** — WPA 8-ball minus pocket calling, stamped `2026-07-16-wpa-nocall`. Open table after the break regardless of what drops, first legal pot assigns groups, wrong group first is a foul, something must reach a rail after contact, fouls are ball in hand (break fouls: kitchen only), early 8 loses, 8-plus-foul loses, clean 8 wins. Two deliberate simplifications, documented in the rulebook header: the 8 on the break auto-respots (WPA offers a choice; a choice is a UI), and a weak break is an ordinary kitchen-ball-in-hand foul (no re-rack option).

**The table** — canvas, portrait-aware: the table stands upright on a phone and lies flat on a desktop. Aim by dragging through your finger — the guide shows the cue path, the ghost ball at first contact, and the object ball's line; distance is power. Ball in hand is a drag of the cue itself, with the kitchen highlighted when the foul demands it.

**The clock** — 75 seconds per shot, enforced by the host on a 1-second interval rather than a timeout, because throttled tabs fire timeouts late and killed tabs never fire them at all — a stalled clock is a deadlock and we have shipped one of those before (M Deal v0.9.9/v0.9.10). Expiry is an ordinary foul: turn passes, ball in hand.

**The gate** — a new `poolsim` stage: physics invariants (nothing escapes the cloth, nothing overlaps at rest, energy only decreases, every shot comes to rest on its own) across seeded shot sequences; byte-identical determinism between `simulate()` and ragged `stepper()` runs — the networking model rests on it; the rulebook clause by clause, every foul and both 8-ball deaths; and six seeded full games played by ghost-ball bots that must reach a verdict, because a rule set that can strand a game is a deadlock too. Pool also joins lint (version discipline, rulebook single-source) and bootsim (document-order boot).

**One bug worth remembering** — the bots' random target pick originally lived *inside* a `find()` callback, so the dice re-rolled for every ball inspected and the search could match nothing. Rolled once, then looked. The kind of bug determinism testing exists to catch.
