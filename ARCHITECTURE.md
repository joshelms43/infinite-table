# Infinite Table — architecture

Chess.com for card games. One platform, many games, no build step.

## Layout
```
index.html            the platform lobby (game cards; a game gets a card when it's ready)
coastline/index.html  M Deal — the flagship. Single file. URL path kept for history.
mafia/index.html      Mafia — PARKED (no lobby card; the URL still works). Kept green in the gate.
shared/tablekit.js    the platform layer: credentials, client, identity, room codes, channels
shared/config.js      Supabase URL + public anon key
shared/identity.js    accounts (username + password via an Edge Function)
tests/                the gate — seven stages, run on every push
tools/bump.js         version bumps, atomically
vercel.json           HTML revalidates on load (no more stale-page plagues)
```

## The rules that earn their keep

**The host is the authority.** One player's browser runs the game; everyone else sends
intents and renders state. Zero DB tables — Supabase Realtime broadcast + presence only.

**The host is a key, not a seat.** `hostKey` travels in every state. When a host dies, a
deterministic election promotes the lowest alive-present-human seat, which collects
survivors' hands and reshuffles everything unaccounted for. 106 cards, conserved,
wire-asserted.

**Presence is reconciled, never believed.** Transports emit spurious join/leave events.
Absence must survive a 3.5s debounce before it means anything. Every away-status verdict
comes from a snapshot, never an event.

**A dropped intent bounces.** Silence is the enemy: out-of-turn and mid-interrupt intents
return a nack rather than vanishing. Cards that vanish into an abyss are a bug we have
already shipped once.

**Asks are keyed and re-sent.** Every ask carries a sequence id; replies must echo it;
stale replies bounce. Unanswered asks re-send every 15 seconds, forever.

**A suspended socket lies still and smiles.** iOS kills backgrounded sockets while the
server keeps your presence alive. On wake, check `tx.alive()` — never trust the snapshot.

**Games end two ways only:** a winner, or one player standing. Never by departure.

## The gate (`npm run check`)
1. **lint** — inline scripts parse; every `<script src>` exists; a file's header, badge and
   cache-busters agree (drift shipped a 0.4.1 header on a 0.10.0 game).
2. **kitsim** — the connection seam against a fake Supabase: credential fallback, a
   subscribe that throws instead of hanging, a socket that admits when it is dead.
   Mutation-tested — reintroduce any of the three shipped connection bugs and it goes red.
3. **test** — engine assertions incl. the economy census (official Monopoly Deal values,
   pinned) and full-game soak with 106-card conservation.
4. **netsim** — the wire: two sandboxed players, host death, migration, reaction windows.
5. **netsoak** — random full games over the wire.
6. **repro3 / repro2** — jsdom flows and the drop matrix.
7. **mafiasim** — a complete four-player Mafia game over a fake bus.

Nothing ships red. Every push carries a changelog entry with the root cause, not the symptom.

## Conventions
- Anchor-asserted patches only (never line numbers); a failed anchor aborts atomically.
- Semver per game, not per platform. `npm run bump -- mdeal 0.10.3`.
- Rules of play are canonical in `joshelms43/infinite-ai` — that repo audits against the
  official game; this repo consumes the verdict (see the v0.10.0 economy alignment).
