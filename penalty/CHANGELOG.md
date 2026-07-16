# Penalty Shootout — Changelog

## LAB v0.6.0 — 2026-07-15
The punch list, item by item.

**Camera never reset between kicks** — real bug, found in code: setCam early-returned when the mode had not changed, so the flight-follow displacement survived into the next kick. It always re-homes now.

**No marker for where the ball is going** — the tell ring now appears at the ball's TRUE destination (spray included) the moment any shot launches, for shooter and keeper alike.

**Side aimer starts on the floor** — the side sweep rides the grass (was mid-air at 1.2m); the height tap lifts from there.

**Spray, meaner** — slightly worse below the red zone and severe inside it, measured: 0.6 power → 0.62m radius; 0.78 → 0.98m; 0.9 → 1.93m; full power → 3.27m. Blasting it can genuinely miss the stadium.

**Line markings** — the penalty arc (the D) drawn properly outside the box, all lines thickened.

**The goal** — sturdier rendered frame (physics stays honest at the real 6cm), finer net cells on the cloth.

**The look** — exposure pulled back so the ACES wash stops bleaching the greens; richer turf with stronger mow stripes.

**The keeper, third rebuild** — bent elbows with gloves ready at the waist, shoulder caps and collar, waistband stripe, sock-and-boot legs, a real crouch; dive poses stretch the lead arm with the trail tucked. Honest note: the headless viewer died mid-round, so this build's portraits ship for Josh's eyes rather than mine — the render pipeline wrote them, and the physics probes confirm the new rig springs correctly (whip to 3.05, impact dip to 2.70, settle 2.85), but the aesthetic call on the close-up belongs to whoever can currently see.

Both proof clips re-rendered on this build: the goal still catches in the cloth on arrival; the save still lands dive, contact, tumble.

## LAB v0.5.0 — 2026-07-15
"Still feels like it needs a full physics engine" — correct again, and for two reasons: half the scene was not simulated, and the half that was had a bug that made it feel random.

**The bug: uncompensated Magnus.** Spin applied ~18 m/s² of lateral force the launch solver knew nothing about, so every powered shot sailed roughly two metres wide of where you aimed. Shooting felt broken because it was. Magnus is tamed to a visible, playable curl, and the solver now compensates for its own spin — shots bend INTO the target like a real banana kick. Proven headless: the same aim that previously crossed the line 2.4m wide now resolves 'goal'.

**The net is cloth.** A Verlet particle grid pinned along the bar and pegged at the ground, deformed by the ball itself — the mesh you see is the simulation. It starts at constraint equilibrium (pre-settled fifty steps) and the probe shows exactly what a net should do: still, then a sharp 0.24m bulge the frame the ball arrives, then decay.

**The keeper is a body.** Limb poses are now spring targets that mass chases with lag and overshoot — a dive whips the lead arm to 3.15 rad past its 2.95 target; a save impact knocks it back to 2.80 before it recovers. Dives end in a real landing: bounce, slide along the turf with momentum, tumble flat. The crossbar rattles when struck.

**Moving proof, rendered headless** — tools/render-clip.js drives scripted kicks through the real pipeline under a deterministic clock and writes animated GIFs plus keyframes: a goal caught by the billowing net, and a full save with dive, contact flail, and landing. The lab stays off the door until the clips earn otherwise.

## v0.3.1 (door) + LAB v0.4.0 — 2026-07-15
"Looks like a child did it" — correct, and here is the honest reason: the 3D was being authored blind. Not one rendered frame was ever seen before it shipped. The 2D build looked good because it was crafted with eyes on it; the 3D was trigonometry and hope.

**Two structural fixes, not a polish pass:**

**The door goes back to the 2D build** (v0.3.1 — same game, restamped). It looks good, it plays, and the platform stops being embarrassing today. The 3D moves to `/penalty/lab/`, off the door, still under the boot gate so it cannot rot.

**The 3D gets eyes** — `tools/render-penalty.js` runs the lab page's real script with real Three.js and cannon.js against headless WebGL, and writes PNG frames of exactly what a phone would display. The scene is now iterated against actual renders, not guesses. First sighted pass, driven entirely by looking at frames: the "night stadium" was rendering as a cave — rebuilt with filmic tone mapping, a proper key/fill/backfill rig, floodlight towers with visibly glowing heads, floodlit turf, a crowd that glows under a lit rim, and a net you can read. The scarecrow keeper is gone: a human silhouette in a ready crouch — sphere head, hanging arms, soft knees — whose dive stretches a lead arm at the ball.

The lab returns to the door only when its rendered frames earn it.

## v0.3.0 — 2026-07-15
Two cameras for two jobs — the fix for "the goal is tiny and keeping feels wrong", which were the same bug.

One camera served both roles from 14.6 metres behind the shooter on a wide lens: the goal filled a third of the screen, and you played the keeper as a distant figurine, dragged through a mapping calibrated to a goal size that was never real. Now: SHOOT gets a telephoto from behind the spot (28° — the goal owns ~57% of the frame, broadcast-style, ball large in the foreground); KEEP gets a camera behind your own net (the keeper is big, the goal is ~90% of the frame, and the shot flies AT you, growing all the way).

The drag has a real ruler now — metres-per-pixel measured off the actual projected goalposts every camera change and resize, signed so the behind-the-goal mirror flip comes free from the projection itself. Sensitivity retuned from 3.2 (a twitch was a committed dive) to 1.3 against honest pixels: a dive now takes a deliberate fling. The keeper's tell ring grew a third for reading at the new distance. Everything else — the sacred three-tap and the fling-commit — untouched.

## v0.2.0 — 2026-07-15
The full rebuild: true 3D, a real physics engine, and the two mechanics that were always the game left exactly alone.

**The world is real now** — Three.js renders a night stadium (floodlights, mown stripes, crowd-speckled stands, a sagging net) and cannon.js owns the ball: a 0.43kg sphere flying eleven actual metres at a 7.32 × 2.44 goal. Gravity is 9.81. Spin applies Magnus force every fixed step, so power shots genuinely curl. The posts and bar are colliders — rebounds are physics, not scripts — and the keeper is a kinematic body with a glove sphere the ball really hits.

**The sacred mechanics, untouched** — three-tap shooting (side, height, power; harder is wilder, the red zone sprays) and the hold-drag-fling keeper (small drags shuffle the line, a fling past the threshold commits a dive with no take-backs, and gravity claims a finished dive). Same sweeps, same red zone, same countdown, same tell. Only the units changed: everything is metres and metres-per-second now.

**Deterministic where it counts** — the launch (velocity, spray, spin) derives from (shot, seed) through the same mulberry32, proven headless: identical inputs produce identical launches, and a 1000Hz integration of the solve lands within six centimetres of its analytic target. The fixed-step world replays what the seed decides — the online door is still open, and still shaped right.

**Honest alpha notes** — the keeper is posed low-poly primitives, not a rigged skeleton; the net catches but does not ripple; save physics is the engine's own contact response rather than a hand-tuned parry. All tunable once real thumbs report in. The 2D alpha lives one `git show` away in history.

## v0.1.0 — 2026-07-15
Game three arrives — Josh's build, on the door as-is.

An alpha penalty shootout with real bones: a 2.5D fixed-step ball simulation (gravity, spin, post and bar rebounds, net drag), three-tap shooting where power buys speed at the price of spray, and a hold-and-drag keeper who can shuffle his line or commit to a dive he cannot take back. Five modes: Solo, two-player pass-and-play, Kicks Only, Keeper Only, and CPU vs CPU. Three difficulties.

Deliberately offline for now, per the boss — but the door is already built: every kick resolves through a pure, deterministic Penalty.resolve(shot, dive, seed), so when this goes online, the same inputs and seed will produce the identical result on every phone. That is the exact property M Deal's host-authoritative model wants. The onInput hook sits waiting.

Platform touches only: a version header for the lint gate, a place in bootsim (it must boot in document order like everything else), and a pitch-green card on the front door. The game itself ships untouched — it is Josh's alpha, and the polish pass will be driven by play, the way it always is here.
