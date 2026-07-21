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

## 0.2.0
- Mobile controls. Left half of the screen is an analog stick — drag anywhere and it anchors under your thumb; a partial stick is a walk, a full stick is a sprint. The rest of the screen drags to look.
- Thumb buttons: Fire (hold for auto-fire through the same fire-rate gate as mouse), Jump, and Reload. A Dash button appears only when the build has drafted a dash.
- Touch and keyboard share every code path — the stick feeds the same movement, the buttons set the same keys. The headless proof drives stick, look drag, pitch clamp, and held-fire through the real functions.
- Pointer lock is desktop-only now; touch devices never see the Click To Aim catch.
- Pinch zoom and scroll rubber-banding disabled during play.

## 0.3.0
- First to ten. The dot tally became a numeric score — twenty dots don't fit a phone.
- Draft picks are secret now. The fight reveals them.
- 13 new powerups (catalog `2026-07-21-duel-r2`, 66 total): Helium Rounds, Freight Train, Jackhammer, Drunk Rounds, Popcorn, Echo, Confetti Cannon, Dice Rounds, Rocket Boots, Hand Cannon, Sneaky Rounds, Bees, Sore Loser. Real engine support behind each: wobble steering, wall-burst pellets, delayed free echo shots, self-knockback explosions you can jump with, per-hit damage rolls, and three new bullet skins including nearly-invisible ones.
- Hand Cannon hard-sets the mag to one; picking Extended Mag afterwards is wasted, picking it before gives seven. Pick order matters — that's the game.
- Phone-first pass: portrait raises the field of view to 92° so the arena isn't a keyhole, draft cards shrink to fit narrow screens, iOS standalone metas and touch-callout suppression added.
- Headless proof extended: helium climb, popcorn wall-burst, drunk drift, hand-cannon order semantics, dice/rage flags.
