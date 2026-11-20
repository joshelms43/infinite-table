# Settlers — Changelog

## v0.1.0 — 2026-11-20
The island in real time. No turns: a shared roll lands on the clock (20s,
30s or 60s) and every matching hex pays everyone at once. Between rolls the
whole table builds and trades whenever it likes. First to 10.

The game:
- A seeded 19-hex island in rows of 3-4-5-4-3: 4 forest, 3 hills, 4 pasture,
  4 fields, 3 mountains, 1 desert. Numbers 2–12 without a 7, re-dealt until
  no 6 or 8 touches another. Nine ports on the coast, 4 at 3:1 and one 2:1 of
  each resource. A bank of 19 each and a 25-card development deck.
- A snake draft (P1→P4, P4→P1) of two settlements and two roads, turn-based
  with a 30s timer per placement (it places for you when it runs out). The
  second settlement pays its neighbours. Real time begins after the draft.
- Roads, settlements, cities and dev cards at the standard costs; the
  distance rule; roads and settlements must connect; 15/5/4 piece limits.
- Simultaneous claims are ordered by the engine: first valid claim wins, the
  other player gets Spot Taken and keeps every card.
- Rolling a 7: no payout; hands over 9 discard half (rounded down) through a
  picker that picks for you at 15s; then the player in last place (fewest
  points showing, ties by the dice) moves the robber and steals one card.
- Trading: bank 4:1, 3:1 and 2:1 at your ports; offers posted to the whole
  table, first acceptance swaps atomically, withdrawn the moment the poster
  can no longer cover it.
- Dev cards: 14 Knights, 5 VP, 2 Road Building, 2 Year of Plenty, 2 Monopoly.
- Longest Road (5+) and Largest Army (3+), 2 points each, transferring on
  strictly more; a cut road can hand Longest Road to a rival or to nobody.
- The win is checked after every action. The victory screen shows each
  player's points broken down, resources collected per type, and the dice
  histogram against the expected 2d6 shape.
- Practice against 1–3 bots — Bazza the Builder (cities, ore and grain, dev
  cards), Shazza the Trader (ports and table offers) and Davo the Expander
  (roads and settlements). Each acts every 2–5 seconds and reads only what a
  player could see.

The build:
- `shared/settlers-rules.js` — a pure seeded engine, RULEBOOK
  `2026-11-20-settlers-realtime`. One state object and one validated
  dispatcher. A refused action leaves the state byte-identical. Time enters
  only as a clock action, so the same seed plus the same action log
  reproduces a game exactly. `act()` is the authority's single entry point:
  bring the clock up to now, then apply the action.
- `settlers/index.html` — a canvas board (the static island cached offscreen
  at display scale, so it stays sharp when zoomed) plus a DOM HUD, with one
  requestAnimationFrame loop for the clock, the bots and both canvases. No
  per-frame allocation: effects come from preallocated pools and typed
  arrays. Pinch-zoom, pan, double-tap to fit, tap placement, haptics, and
  the house synth.

Verification:
- `settlerssim` (102 pins): census, every cost, the distance rule, roads,
  the draft, payouts incl. cities, the robber block, bank shortages, port
  rates, piece limits, Longest Road (claim, ties, transfer, cuts to a rival
  and to nobody), Largest Army, the 7 (discards, timeouts, last-place
  robber), dev cards (timing, one per interval, each kind), offers, and the
  win. Race cases at the authority: two claims on one corner and on one
  edge, a 7 during a pending trade, three acceptances of one offer in the
  same instant, a tab asleep for ten rolls, a game ending with actions still
  queued. 2d6 over 36,000 seeded rolls (chi² well under p = 0.001), 36 bot
  soaks at 2/3/4 seats to a winner with an audit after every action and zero
  illegal bot actions, and byte-for-byte replay determinism. Twenty
  mutation proofs confirm the key pins go red when their rule is broken.
- `settlerspage`: the real page in jsdom, one seeded four-seat game with
  your seat played through the UI — draft taps, build buttons and board
  taps, the bank sheet, the discard picker, the robber. Checks Spot Taken,
  the sleeping tab, the result waiting for in-flight animation, nothing
  accepted after the end, and every section of the victory screen. Each of
  its three key pins is mutation-proven.
- `tools/render-settlers.js`: phone-size screenshots of the menu, the draft
  (incl. your own pick), the first roll, the live board, both build modes,
  both trade tabs, an incoming offer, the discard picker, the robber, zoom
  and the victory screen. Frame gap 16.7 ms median and p95.

Root causes of what the build caught before shipping:
- Payouts could be stranded mid-air: flyer landing, dice settling and the
  robber's arc were advanced inside the drawing code, so a missing canvas
  (or a draw that threw) froze them, kept hand counts hidden and held back
  the result forever. Animation state now advances on the clock in its own
  step; drawing only reads it. Caught by `settlerspage`, not by review.
- The pop-in ease overshoots from a hair below zero on its first frame,
  which threw an IndexSizeError from canvas `ellipse`. It is now clamped
  above zero.
- The board was sized before the bottom panel had filled in, so it sat low
  and small. Layout now follows the HUD with a ResizeObserver.
- A clock tick from the past was counted as an action. It is now refused,
  and clock ticks never count as actions (the bots' pacing reads that
  counter).
- The bots spammed the table (about 5,000 offers in 60 soak games). Each bot
  now posts at most one offer per roll interval.

Simplified for v0.1.0, and why:
- **No online rooms yet.** Josh asked for practice first. That leaves out
  2–4 player rooms with bot fill, rated accounts, fixed-UUID account rows
  for the bots, presence-heal, and wire-level netsim (a socket dropping
  mid-roll). The engine is already built for it: one ordering through
  `act()`, an authoritative clock as an action, and the race cases pinned at
  the authority. The lobby card says Practice vs Bots until then.
- **Practice pauses while the tab is hidden.** It's solo, so rolling dice
  nobody sees would only cost you payouts. Separately, the engine never
  bursts: a clock that fell behind rolls once and picks up from now. That is
  the rule online will rely on.
- Real-time translations of turn rules, each a deliberate choice:
  - One dev card per roll interval: the real-time twin of one per turn.
  - Building and trading hold while a 7 resolves (up to 30s), so a discard
    can't be dodged by spending, and the roll clock restarts after the
    robber moves.
  - VP cards count the moment they're bought, since there is no "your turn"
    to reveal them on.
  - The robber mover is picked on visible points, so hidden VP cards aren't
    leaked.
  - The first roll comes 4s after the draft.
  - Offers expire after 25s, one standing offer per player.
