# Last Card — Changelog

## 0.3.0
The table comes alive, and the wire heals.
- One event table owns everything an engine event does at the glass: banner,
  sound, haptic, flight. Foe plays fly from their chip into the pile; every
  draw, sting and penalty flies card-backs off the deck to whoever pays;
  a Reverse spins the direction tag; a Skip flashes the skipped seat;
  winning rains the four house colours.
- M Deal's WebAudio synth ported: pick, drop, springback, draw, sting, the
  call fanfare, the win run. No assets, all oscillators.
- Presence heal: any join or rejoin mid-game makes the host re-push truth
  (debounced), so a phone that drops and comes back is whole again without
  anyone doing anything. Host migration remains the open gap.
- Refactor: one commit path for drop and raised-tap (`commitCard`); event
  names read from the pushed view, not a parallel roster copy; every rect
  read guarded the same way.
- Client end-screen now says who deals the next one.

## 0.2.0
The flagship's hands. M Deal's hand and drag grammar, ported whole:
- Fanned, overlapping hand — wrappers keyed by card id, FLIP slides on every
  change, arc bow via `--fan`/`--fanY`, draw-ins pop, overlap tightens as the
  hand grows.
- Direct manipulation: press squishes instantly; tap raises (neighbours part,
  the pile invites); tap the pile or drag to commit; any upward pull picks the
  card up; sideways is a scroll; hold 430ms inspects the card full-size.
- Drag clone with velocity tilt, dropok glow over the pile, magnetic 48px
  near-miss, springback with a denial shake for dead cards, flight animation
  onto the pile. Wilds drop first, then pick their colour.
- New gate `tests/lastcardtouch.js`: a real jsdom document driven by real
  pointer events — squish, raise, part, drag, chase, drop, deny, wild picker,
  hold-inspect all pinned. It also re-proved the call penalty from the glass.

## 0.1.0
First deal. The Aussie shedding game on the Infinite Table deck — Coral, Teal,
Gold, Blue.

- Rulebook `2026-07-21-lastcard-house` in `shared/lastcard-rules.js`: the whole
  game is pure and lives there — deck, legality, effects, the call, the bot.
  House rules pinned in the file header: Draw Four plays on anything, effects
  never stack, Reverse is a Skip heads-up, a drawn card may be played at once.
- The call is deterministic. Play down to one card without calling and the
  penalty (draw two) is automatic — no timing race over the wire, no arguments.
- Host-authoritative online for 2–5, same shape as M Deal: clients send
  intents, the host validates through `legalMoves`/`apply` and pushes truth
  (`state` to all, `hand` per seat). Spoofed seats, out-of-turn pokes and
  pre-deal intents all bounce — pinned in `tests/lastcardwire.js`.
- Practice mode: 1–4 local bots on the same rulebook. The bot never forgets
  to call (pinned).
- Gates: `tests/lastcardsim.js` (deck census, legality matrix, every effect,
  3,200 complete soaked games with card conservation and id uniqueness,
  seeded determinism) and `tests/lastcardwire.js` (three full page instances
  over a fake bus; every push must leave every client equal to host truth).

Known gaps, deliberately v1: no host-migration/reconnect healing (M Deal's
elaborate machinery not ported yet); a leaver mid-game stalls their seat.
