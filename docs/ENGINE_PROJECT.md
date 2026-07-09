# Project: The Strongest Monopoly Deal Engine

## Mission
Build the strongest possible engine for Deal-style play (our game is **Coastline**, a fully reskinned Monopoly Deal). Target: clearly superhuman, measured — not vibes. This engine will later power a chess.com-style game review (accuracy %, move classification), so **evaluation quality matters as much as win rate**: the engine must produce a trustworthy score for every legal option in any position, not just pick moves.

## Who you're working with
Josh builds through Claude entirely — browser + GitHub + Vercel, **no terminal**. Claude does all execution in its container. Non-negotiables: complete files only (never diffs); semver + CHANGELOG entry on every change; Claude acts as the test suite (run everything before shipping); diagnose before fixing; read the repo fresh at session start; deliver files via the file viewer.

## The codebase (github.com/joshelms43/infinite-table)
- `coastline/index.html` — the entire game, single-file vanilla HTML/JS (~2,600 lines), sections labelled ENGINE / AI BRAIN / UI. Rules are complete and correct: 106-card deck (28 props in 10 sets, 11 wilds = 9 dual + 2 rainbow, 13 rent, 20 money = $57M, 34 actions: 2 Deal Breaker, 3 JSN, 3 Sly, 3 Forced, 3 Debt, 3 Birthday, 10 Pass Go, 3 House, 2 Hotel, 2 Double Rent — under Coastline names). Draw 2 (5 on empty hand), 3 plays/turn, 7-card limit, payments from bank+table only with no change, complete-set theft protection, JSN counter-chains, buildings, win = 3 sets.
- **Current AI (the baseline to beat)**: exact card counting (census minus all visible zones, reshuffle-proof), hypergeometric JSN-risk model, EV-scored candidate selection via `brainCandidates(p, idx, next)` (shared evaluator — works for any seat, returns `{ev, run, cardId, mode, label}`), exact DP payments that never gift a set-completing card, EV-based JSN decisions, value-aware discards. All judgment constants live in the `AI_W` genome, per-player overridable via `player.tuneW`.
- `tests/` — `npm test`: 33-assertion suite (deck itemization, rent maths, payments, brain unit tests, full-game soak with card conservation; the full-game block must stay LAST — it terminates via an interval watching `G.over`). `npm run test:drops` and `test:flows`: jsdom harnesses. `tests/train.js` + `train.body.js` + `validate.body.js`: headless self-play (~40ms/game), evolutionary trainer with per-generation checkpointing, large-sample validator.

## What's already known (don't re-learn it)
- ~10,000 games of evolutionary tuning on the 22-gene genome vs itself: **flat** (34.3% ± 4.5pp vs 33.3% baseline). The constants are near a local optimum; strength lives in structure. Mirror-match self-play with 105-game evals is winner's-curse noise — any future tuning needs paired-seat variance reduction, 1,000+ games per eval, and CMA-ES or similar.
- Headless harness quirks: consts are eval-scoped (trainer concatenates sources into one eval); setTimeout is stubbed immediate; DOM is proxy-stubbed; `aiShowcase` and friends self-guard.

## The strength roadmap (explore in roughly this order)
1. **Benchmark ladder first.** Frozen engine versions play round-robin head-to-head matrices with seat rotation and shared shuffled-deck seeds (paired variance reduction); report win rates with CIs. No claimed improvement ships without beating the ladder. This is the foundation — build it before any strength work.
2. **Turn-sequence planning.** Current play selection is greedy-with-re-evaluation per play; search over ordered sequences of up to 3 plays (beam width ~6) to capture combos the greedy misses (setup-then-strike, Double-Rent timing, wild-then-complete ordering, discard-limit management).
3. **Exposure/danger term.** After a candidate sequence, evaluate the opponents' best responses one ply deep: penalise leaving a completed set takeover-able without JSN cover, penalise fat banks against held rent, reward JSN retention when threats loom.
4. **Determinized Monte Carlo (ISMCTS-lite).** The counting layer already knows the exact multiset of unseen cards — sample plausible opponent hands consistent with it, roll games out with the fast headless engine (40ms full games ⇒ thousands of rollouts feasible per decision offline; budget carefully for in-browser turn time), average outcomes. This is the likeliest path to a real strength jump.
5. **Opponent-pool training.** Train against a pool of exploitable styles (hoarder, rusher, aggro, current-EV) rather than mirrors — "beats humans" and "beats another counting bot" are different skills.
6. **Defensive evaluation.** Extend the evaluator to payment choices, JSN decisions, and discards so the future review can judge defence, not just attacks.

## Measurement standard
An engine change is real only if: new vs previous frozen version, ≥1,000 paired-seed games, win rate CI excluding 33.3%, and full test suite green. Log every ladder result in the CHANGELOG.

## Session start checklist
1. Clone the repo (Josh supplies a fresh fine-grained GitHub token — the old one is retired).
2. `npm install` (jsdom), run all three suites to confirm green baseline.
3. Read the AI BRAIN section of `coastline/index.html` end to end before proposing changes.
