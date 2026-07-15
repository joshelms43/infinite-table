# Penalty Shootout — Changelog

## v0.1.0 — 2026-07-15
Game three arrives — Josh's build, on the door as-is.

An alpha penalty shootout with real bones: a 2.5D fixed-step ball simulation (gravity, spin, post and bar rebounds, net drag), three-tap shooting where power buys speed at the price of spray, and a hold-and-drag keeper who can shuffle his line or commit to a dive he cannot take back. Five modes: Solo, two-player pass-and-play, Kicks Only, Keeper Only, and CPU vs CPU. Three difficulties.

Deliberately offline for now, per the boss — but the door is already built: every kick resolves through a pure, deterministic Penalty.resolve(shot, dive, seed), so when this goes online, the same inputs and seed will produce the identical result on every phone. That is the exact property M Deal's host-authoritative model wants. The onInput hook sits waiting.

Platform touches only: a version header for the lint gate, a place in bootsim (it must boot in document order like everything else), and a pitch-green card on the front door. The game itself ships untouched — it is Josh's alpha, and the polish pass will be driven by play, the way it always is here.
