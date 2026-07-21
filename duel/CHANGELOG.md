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

## 0.4.0
- Headshots land double. The head zone is a sphere at the top of the capsule, scaled with body size — Pocket Size shrinks it, Absolute Unit grows it. Headshots ring and pop like crits.
- Practice bot bug: its bullets sparked but never damaged the player — the hit-judging path dropped non-player owners entirely. The bot draws blood now, with its full effect set (poison, slow, knockback, the lot).

## 0.4.1
- Landscape button on the menu for phones that support orientation lock: fullscreens and locks landscape, toggles back to Portrait. Hidden where the platform can't lock (iPhone Safari) — rotating by hand already works, the FOV adapts either way.

## 0.5.0
- The Landscape button now works on every phone. Where the platform has a real orientation lock it fullscreens and locks; where it doesn't — iOS Safari ships ScreenOrientation type/angle/onchange but no lock() — the game rotates itself 90° with a transform and remaps both thumbs, the stick zone, the look drag, and every screen-space projection into the rotated frame. Physically rotating the phone stands the forced rotation down automatically.
- Headless proof covers the coordinate mapping: axis trade, aspect follow, touch remap, origin placement, and the stand-down.

## 0.6.0
- Honest bots, levels 1–10. The rule: the bot cannot do anything the player can't. It moves through `moveFighter`, fires through `fireFighter`, takes damage through `applyHit`, and ticks status through `stepFighterStatus` — the exact functions the player uses. There is no bot-only physics, no bot-only damage maths, and no way to even ask for either.
- Levels scale skill only: per-shot aim scatter, reaction lag (it shoots at where you *were*), maximum aim turn speed, trigger discipline (won't fire until the aim has arrived), thinking pauses between bursts, footwork tempo, and draft judgement (level 6+ prefers a sensible tier list when dealt one). Level 10 changes nothing about the rules — it's just a person who's good.
- Practice opens a level picker; your last level is remembered and Play Again keeps it.
- Parity is enforced by the gate: gravity owns the bot, it cannot fire past its sheet's rate, it spends real ammunition and waits out real reloads, it cannot dash without drafting one, drafted blinks obey the same cooldown, poison ticks it down through the same status path, and one frame cannot snap its aim past the level's turn speed.
- Catalog r3's engine hooks landed inside the shared paths, so all 14 new powerups work identically for both fighters: Trickshot, Pinball Wizard, Grand Finale (the boom now rides the wire so remote last shots explode visually too), Anchor, Executioner, Fast Start, Momentum, Scavenger, Stand Your Ground, Showtime, Payback, Hoarder, Panic Hands, Zoomies. 80 total.
- Real physics bug found by the parity work: exact-contact float alignment let a body resting dead-centre on a crate read its own perch as a side collision and step-up-launch itself, forever. An epsilon skin in `collideBox` closes it — for both fighters, because there is only one `collideBox`.

## 0.7.0
- The bot drafts like it means it. Levels 4+ weigh general card value, 6+ add synergy with its own build (bounce packages, explosion packages, hand-cannon economies, air fighters), 8+ add counter-picks — a shielded opponent teaches it to draft dots, a damage-stacker teaches it Second Wind and Deflector, a runner teaches it Frost and Bloodhound.
- Information parity holds: it counters only powerups you have already used in fought rounds. Your current draft pick stays as secret from it as its pick is from you.
- Levels 1–3 still just grab things. A small jitter keeps even level 10 from being perfectly predictable, but never enough to flip a clear judgement — the gate proves all four tiers of behaviour.

## 0.8.0
- The silly batch (catalog `2026-07-21-duel-r4`, 94 total): Balloon Rounds (bullets inflate in flight — hitbox and all), Hay Fever (sometimes you sneeze the whole mag out at once), Trebuchet (hits launch them skyward), Disco Inferno (bullets lap the shooter before launching), Hiccups, Beach Ball, Battle Cry (reloading blasts a horn that shoves anyone close, judged like any shot), Crab Mode (speed follows how sideways you're going), Party Popper (one confetti blast per round), Dizzy Rounds (hits spin the view — which spins the bot's aim too, because the view is the aim for everyone), Tortoise Mode, Clown Shoes (every jump honks), Pickpocket (hits move a round from their mag to yours), Mule Kick (real recoil).
- All fourteen ride the shared fighter paths, so each works identically for both fighters and every effect is gate-proven: inflation, sneeze dumps, one-pop-per-round, recoil, launches, spins, thefts, damage shrugs, crab ratios, and the horn shove.
- No powerup is called Yeet.

## 0.8.1
- Touchscreen laptops are not phones. Boot mode now follows the primary pointer only (`pointer: coarse`), not the mere presence of touch hardware — the check that put thumb buttons on a desktop with a touchscreen. From there the truth is live: an actual touch brings the thumb UI up, an actual mouse click puts it away and restores pointer-lock aiming. Hybrids get both, whichever is in hand.
- The Landscape button follows the live mode instead of a boot-time verdict.

## 0.8.2
- Space after Play Again no longer restarts the match forever. Clicked buttons kept keyboard focus, and Space activates the focused button — so the first jump of the rematch clicked Play Again again. Buttons now blur on use, and Space is reserved for jumping during play.

## 0.8.3
- Double-joining a table is impossible now. The Join button's busy lock had CSS for the wrong button class, so a double-click opened two live channels — every event then processed twice or more: single shots rendered as shotgun volleys, and each hit applied to health repeatedly, one-shotting from round one with no powerups involved. joinRoom now refuses to run concurrently, closes any existing channel before opening one, quiet buttons actually lock while busy, and a dead table releases its channel instead of leaving it subscribed.
