# Last Card — Changelog

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
