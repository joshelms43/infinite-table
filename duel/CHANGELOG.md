# Duel — Changelog

## 0.1.0
- 1v1 first-person duel over the platform wire: host a code, join a code, or Practice against a bot.
- Every round ends in a draft: both players pick one powerup from three. First to four rounds wins the match.
- 53 powerups in `shared/duel-powerups.js` (catalog `2026-07-21-duel-r1`) across offence, bullet behaviour, on-hit effects, body, mobility, and ammo. Chickens included.
- Powerups are pure stat-sheet mutations; the engine simulates whatever the sheet says. `tests/duelsim.js` applies each alone, all 53 stacked, and 1000 random 8-pick builds — the sheet must stay playable every time.
- Favor-the-shooter netcode: each client judges its own hits, each player is the authority on their own health. State at 12Hz over TableKit.
- Drafts are dealt deterministically on both clients from a shared match seed — no deal messages, no drift. A pick arriving before the draft screen opens is buffered, not lost.
- Arena: one AABB list drives rendering, movement, and bullet collision. Stair rises are 0.45 against a 0.55 step-up allowance — a first cut had 0.6 rises nobody could climb; the headless walk test caught it.
- Headless proof in `tools/render-duel.js`: segment-segment distance cases, floor settle, wall stop, stair climb, straight shot landing, bounce reflection, phantom wall-pass, stat application, and scale-dependent hitboxes, plus rendered menu and fight frames.
