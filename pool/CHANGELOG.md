# 8-Ball — Changelog

## v0.1.3 — 2026-07-16
**The host is a phone, and phones sleep.** The remaining vanishing shots weren't lost messages — they were sent into a host whose app was backgrounded, JavaScript suspended, processing nothing. The watchdog re-sent three times into the void and gave up. And the RECONNECTING… banner fired on every 5-second heartbeat while a radio flapped, which is how "a lot of disconnected popups" happens.

Now the room knows when the host's table is asleep:
- The host heartbeats every five seconds during play. Three missed beats and the other phone stops accepting aim input, says plainly that the host went quiet, and waits — a held shot instead of a vanished one.
- The first word back from the host clears the hold, banners THE HOST IS BACK, and asks for the current state.
- A waking host (visibilitychange) re-arms the shot clock before its heartbeat can fire the timeout — nobody gets clock-fouled for the host's nap — and immediately re-pushes the truth to the room.
- Connection banners fire on transitions only: RECONNECTING… at most once per 15 seconds, BACK AT THE TABLE on success, nothing on the routine heartbeat.
- The player plates show " · away" from live presence when a seat's phone drops off the channel.

Six new poolsim assertions: the heartbeat goes out, the client notices three missed beats, the first word back recovers with a state request, and the waking host re-arms rather than fouls and re-pushes rather than assumes.

## v0.1.2 — 2026-07-16
**Two sides of one gap, both caught on the phones.**

**"On its way…" that never arrived (non-host).** A shot intent crossed the wire exactly once, fire-and-forget, over a phone websocket that dies quietly — the exact message-loss class the ghost-reply watchdog fixed in M Deal v0.9.7, shipped here without one. Now: every intent carries a nonce; the shooter's 1-second heartbeat re-sends an unacknowledged shot at 2.2s intervals, three times, then unlocks honestly with THE TABLE DIDN'T HEAR THAT. The host answers a nonce it has already played with the current state — never a second simulation — and re-broadcasts the final state when its animation lands, so a phone that missed the shot broadcast itself heals within one flight.

**The host knew the result before the balls did.** `applyIntent` wrote the final state into `G` and the HUD reads `G` — log line, group dots, turn highlight, even the WINS overlay landed the instant the shooter released, mid-roll. The host now broadcasts the truth, winds its visible table back to the pre-shot state, and watches its own animation like every other client; the result arrives when the balls stop. The stale-busy heal settles any frozen flight *before* freeing the lock, so the visible table can never become the base of the next simulation — that would fork the game.

The heartbeat consolidated into one `netTick()`: stale-busy settle, shot clock, and the shooter's watchdog — every recovery path that must not depend on the happy path, in one place, driven by tests directly. poolsim grew nine assertions across three fixtures: the no-spoiler wind-back, nonce dedupe answered with state, and the full watchdog lifecycle from first send to honest surrender.

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
