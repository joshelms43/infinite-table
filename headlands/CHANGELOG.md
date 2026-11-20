# Headlands — Changelog

## v0.3.0 — 2026-11-20
Trading goes to the whole table, and the bots join the haggling.
- An offer no longer names one target: it stands before everyone, first
  to take it wins (and draws the sweetener). One pass leaves it open for
  the rest; when everyone passes it clears without burning your trade.
  An acceptance you can't actually cover counts as a pass. Root cause of
  the old shape: the trade intent carried a `to` seat copied from M
  Deal's targeted actions, which made multi-seat tables wait on one
  person who often had nothing to give.
- Bots now float offers of their own — when they're exactly one good
  short of their best build with real surplus to pay it, that good goes
  to the table (once per turn; a declined offer isn't re-floated).
  Soak-pinned: 90 bot games produce hundreds of offers, some taken.
- The offer sheet shows everyone the deal, greys Take when you don't
  hold what they want, and dismissing it passes — so the table never
  waits on a closed sheet. Practice mode waits for your answer only
  when every bot has already passed.

## v0.2.0 — 2026-11-20
The design pass v0.1.0 shipped without. Root cause of the ugliness: the
whole visual layer was programmer placeholder — unicode glyphs for art,
flat panels with identical thin borders, cost dots with no meaning,
goods as bare coloured rectangles.
- An original drawn-miniature system: every good (clay pan, timber log,
  wool bale, cane stalks, stone stack) and every build (winding track,
  tin-roof shack, clustered town, ranger flag, beach resort) is one
  inline SVG in the house palette, used everywhere — market cards, cost
  rows, hand, stacks, sheets, trade tiles.
- Market and goods became real cards: bone faces, ink linework, layered
  shadows; affordable builds lift and glow gold.
- Costs read as rows of mini good icons, dimmed where short.
- My stacks show the covered build peeking out from under the top; foe
  chips show the top alone (the peek mushed at 22px).
- Headlines flash as a proper dealt card, tilted, gold-rimmed.
- A drawn coastal masthead on the menu; felt vignette behind the whole
  table; reduced-motion respected.
Verified by phone-size screenshots of menu, table, build sheet, headline
and win screens before shipping.

## v0.1.0 — 2026-11-20
Rival towns on one coast. A faithful mechanical twin of the modern
travel-sized Catan card duel, wearing entirely our own skin — original
names, original card text, house theme. Same move as M Deal: the bones
are fair game, the expression is ours.

The game:
- Five goods in the faithful counts (Clay 11, Timber 11, Wool 14, Cane 12,
  Stone 13 — 61 total), no dice: everyone draws at harvest, the turn-holder
  draws extra for Towns and Resorts.
- The market row of five builds, refilled after every buy; five of a kind
  flushes the lot back in.
- Tracks ladder your swap rate 4:1 → 3:1 → 2:1 → 1:1 — one substitution per
  turn, at most one good of a cost covered by it.
- Every Shack makes a Headline (7 cards, 3 Raiders among them); King Tide
  reshuffles the lot.
- Towns over Shacks, Resorts over Towns; side A Resorts harvest 2, side B
  harvest 1 with a trick each (build-draws per Track or Ranger, tie
  priority for a token).
- The Highway (first to 3 Tracks) and the Watch (first to 2 Rangers), 2
  points each, moving on strictly more.
- One player trade per turn; the partner draws a bonus card for saying yes.
- First to 7 showing wins, immediately, on their turn.

The build:
- `shared/headlands-rules.js` — pure seeded engine, RULEBOOK
  `2026-11-20-headlands-house`.
- Practice vs 1–3 bots; online 2–4 over TableKit, host-authoritative with
  per-seat private hands, presence-heal re-push, spoof/nack discipline —
  the Last Card wire shape exactly.
- Gates: `headlandssim` (census, payments and the swap ladder, every
  Headline, both tokens incl. B-side tie priority, trades, harvest
  arithmetic, the win, market flush, 90/90 decisive soak at 2/3/4 seats
  with the 61 goods conserved throughout, seeded determinism) and
  `headlandswire` (three page instances over a fake bus, truth equality
  after every push, hand-drift zero, hostile intents bounced, a
  human-shaped trade across the wire, cold-host safety, full practice
  game).

House v1 pragmatics (candidates for v0.2):
- Raider discards and Whip-Round gifts are picked by the seeded rng, not
  the player — counts faithful, agency later.
- Substitution auto-picks the most abundant spare type (the engine takes a
  `subFrom`; the sheet doesn't offer the choice yet).
- The A/B Resort side is fixed to A for new tables (the engine and tests
  cover B; a room toggle is the missing piece).
- No touch-grammar suite yet — interactions are tap-sheets, covered by the
  wire test's UI entry points.
