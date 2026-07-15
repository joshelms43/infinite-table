# Penalty Shootout — Changelog

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
