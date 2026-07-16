# 8-Ball — Changelog

## v0.3.1 — 2026-07-16
**Practice Solo.** A third door on the home screen: both seats, one thumb, zero network. The wire is a stub — `send()` into the void — and everything else is untouched, because shooter authority already made every stroke local. Whichever seat holds the turn, your thumb holds the cue: full rules, full clock (the turn seat self-forecloses; there is no waiter), alternating breaks, the works. Built for the bench and for testing the game without a second phone in the room. Four poolsim assertions drive both seats through a foul, a reply, and a clock foreclosure with `tx = null` underneath, proving the whole table runs wireless.

## v0.3.0 — 2026-07-16
**The touch shot, and the tailor.**

**Feel first: a tiny hit no longer crosses the county.** The power curve was linear from a floor of 0.55 m/s — the gentlest legal shot rolled over a metre. Engine r2 (`2026-07-16-basic-r2`): the floor drops to 0.25 m/s, the curve eases to p^1.7 so the bottom third of the bar is all touch shots (5% of the bar now rolls 14cm, 10% rolls 23cm), half the bar sits under 2.3 m/s, and a full pull still breaks at 7. Roll-off firmed slightly so slow balls die honestly. All six seeded bot games still reach verdicts on the new engine.

**Then the long sprucing.** The table is now painted once per resize onto an offscreen surface and laid down each frame — cheaper *and* richer: walnut rails with grain, a bevel highlight where wood meets cloth and an inner shadow where cloth meets wood, mother-of-pearl diamond sights at the regulation stations, leather-rimmed pockets that fall away into the dark, and a cloth with directional light and a fine speckle nap. Balls got a real lighting model — hard little window highlight, soft limb darkening — plus soft contact shadows on the cloth, and a pocket-drop flourish: a potted ball now slides into the dark, shrinking and fading, instead of blinking out of existence.

Chrome to match: an 8-ball orb wordmark, a felt hero on the home screen, focus rings and gradient buttons, a brass-lit table code, avatar-initial seats and player plates (gold vs chalk-blue), a pulsing gold turn glow, a tabular-numeral clock chip that throbs red when low, italic table talk in the log, and a game-over card with gilded type and a gold rule. The canvas itself now sits in a deep drop shadow like a piece of furniture.

Nothing behavioral changed outside the engine curve: same rules stamp, same networking, all suites green.

## v0.2.3 — 2026-07-16
**The bar gets off the cloth; the cue never leaves the table.** The power bar was drawn over the playing surface — functional, but it hid balls and read as an overlay, not equipment. The canvas now reserves a wooden gutter beside the table and the bar lives there, restyled the GamePigeon way: a recessed slot with quarter ticks and an actual cue stick standing in it, tip up — chalk, ferrule, shaft, butt, bumper — that you pull down the slot. The whole gutter is the bar's touch target; thumbs are not precise instruments.

And the cue stick on the table is no longer a charging effect: it sits behind the ball the entire time an aim exists, swinging as you adjust the line, drawing back off the ball as the slot cue comes down. Same two-tone taper, ferrule and chalk tip as its sibling in the slot.

One for the tooling ledger: this change briefly deleted `drawInHand` — a region replacement between two function anchors swallowed the function living between them. Lint and bootsim were structurally blind to it (nothing calls `draw()` headlessly at boot); **the pixel renderer caught it on the first frame**. The dev eye earns its keep.

## v0.2.2 — 2026-07-16
**Aim with one hand, power with the other.** The slingshot — direction and power in a single drag — made every shot a compromise: fine aim wanted a short careful drag, real power wanted a long one, and the two fought. Now they're separate, GamePigeon-style:

- **Aim is sticky.** Drag anywhere on the cloth and the cue line follows your finger; let go and the line stays put. A fresh turn opens already aimed at the nearest ball, never a blank stare. Adjust as many times as you like.
- **Power is the bar.** A vertical track on the right edge, thumb-sized hit target. Pull the handle down — the fill runs green through gold into red, and the cue stick draws back off the ball on the table as you pull. Let go to fire with whatever aim you've set; ride it back to the top to change your mind.
- Ball in hand is unchanged: the cue itself is still the thing you drag.

The guide (cue path, ghost ball, object line) now lives on the persistent aim, so you can study a shot with your thumb nowhere near the screen. Input state is exposed to the harnesses (AIMDIR, POWERDRAG) and the headless renderer draws the new bar and pull-back stick, pixel-verified.

## v0.2.1 — 2026-07-16
**Blips heal in silence; the table stands up.** Sub-second radio drops were reconnecting instantly and announcing it every time — a room full of BACK AT THE TABLE for outages nobody would have noticed. Reconnection now happens quietly for the first ten seconds of an outage; only a real one gets RECONNECTING… and a welcome back, and the retry loop's COULD NOT CONNECT stays quiet too. A quiet opponent now takes twenty seconds to mention instead of twelve.

And the table is portrait always — upright on every screen, phone-first like the rest of the platform, sized to fit the viewport height with the HUD, centered when the screen is wider than the table is tall. One orientation, one set of eyes-on renders, no aspect-dependent code paths left.

## v0.2.0 — 2026-07-16
**No host. Authority follows the turn.** Three patch releases fought the same enemy — a phone-shaped host that sleeps — and v0.1.3's answer was still "notice, hold, wait." The real answer was hiding in the architecture from day one: the simulation is deterministic and the rules are pure, so the game state is a function of (seed + ordered shots). Nobody needs to compute anything centrally, and in a strictly turn-based game, ordering is nearly free.

Now the shooter's phone is the authority for its own stroke: simulate, judge, fold, broadcast `{input + resulting state}`; the other phone replays the identical deterministic animation and lands on the identical state. Highest seq wins. What that removes: the ON ITS WAY wait, the intent watchdog, nonces, dedupe, the busy flag and its three-layer heal — the shooter answers to nobody. What that keeps: the no-spoiler wind-back (your own table still learns the result when the balls stop) and the never-dropped shot queue, both re-pinned in their new shape.

The clock is enforced by whoever's job it is: the turn player calls the timeout on themselves first; a waiter only claims a shooter who is eight seconds past dead, the claim carries a flag, and a rightful shot arriving at the claimed seq wins the tie — mutation-checked. A sleeping opponent is a note on their plate and a line in the hint; the game never stops for them. Healing is two rules: heartbeats carry seq, and anyone behind asks; a hello is answered with the state, by anyone who has one.

Rerack needed no referee either: the final stroke stamps `nextSeed` and `nextBreaker` into the game-over state, so either player's tap builds the identical rack — a two-tap race is idempotent by construction, and breaks alternate.

The lobby keeps its one privilege: assemble the roster, build the first rack, hand the game to the table. After that there is no host to be dependent on, because there is no host.

poolsim's page fixtures rewritten for the new shape: nineteen assertions across authority, healing, both clock jobs, the sleeping opponent, and the deterministic rerack.

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
