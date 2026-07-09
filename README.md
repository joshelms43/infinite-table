# Infinite Table

A growing collection of premium, phone-first table games. One shared design system (colour tokens, card physics, interaction patterns), many games.

## Games
| Game | Path | Status |
|---|---|---|
| **Coastline** — Deal-style property card game, Sunshine Coast theme | `/coastline/` | v0.2.19 · playable |

## Structure
- `index.html` — Infinite Table lobby
- `coastline/` — each game is a self-contained single-file app with its own CHANGELOG
- `tests/` — headless engine suite (`npm test`), jsdom drop matrix (`npm run test:drops`), interaction flows (`npm run test:flows`); `npm install` first for jsdom

## Conventions
Single-file vanilla HTML/JS per game, no build step. Complete files only. Semver + CHANGELOG entry on every change; tests before every ship. Vercel auto-deploys from `main`.

## Roadmap
Coastline v0.3.0: Supabase Realtime multiplayer (rooms, 4-char join codes, presence, per-player private hands) — the pattern that then serves every future game on the Table.
