# Mafia — Changelog

## v0.2.5 — 2026-07-12
The zombie host. Joiners could see the host; the host saw nobody — because iOS had suspended the hosting phone's socket while the code was being shared around, and on resume the channel was dead-but-smiling: a stale snapshot that would never update again.

**Revival machinery** — waking the page checks the channel's real state: if it isn't joined, the whole connection rebuilds on the same code and key (a returning host re-broadcasts the roster and state; a returning player re-hellos). If it is joined, the client re-tracks its presence anyway — a nudge that forces a fresh diff both ways. A four-second lobby heartbeat does the same while seats are filling, so no phone can sit zombified in the one phase where seeing each other is the entire point.

Operationally: the hosting phone staying awake until Start is still the smooth path — but it no longer has to be.

## v0.2.2 — 2026-07-12
The observability paid for itself on its first outing. The banner read HOST FAILED: supabaseKey is required — createClient was being handed window.SUPABASE_ANON_KEY, a global that never existed; the config exports SUPABASE_ANON. One identifier, corrected. This is also exactly why the game logic simulator could never catch it: the sim stubs the connection, and the bug lived in the one line the stub replaced.

## v0.2.1 — 2026-07-12
"Host doesn't work" — so Mafia got what every game here gets eventually: a wire simulator.

**mafiasim** — four sandboxed players over a fake presence bus play a complete game: lobby, role deal and privacy, night-one no-kill, detective verdicts and rest nights, secret-keeping deaths, votes, the village win, the final reveal. Eighteen assertions, all green, now part of the permanent five-stage-plus-one gate. Verdict: the game logic is innocent — the failure lives in the live connection seam, the one part a simulator cannot reach.

**So the seam becomes observable** — subscribe now times out after eight seconds with COULD NOT CONNECT instead of hanging forever on a bad status; host and join are wrapped so any thrown error surfaces as a banner carrying its own message; the lobby-host acknowledges hellos cleanly. Whatever the phone hits next, the report writes itself.

## v0.2.0 — 2026-07-12
Everyone gets a role. Every role gets a leash.

**No more plain Villagers** — the spare seats become Bodyguard (stand beside someone; if the Mafia come for them, you take the hit — once, enforced by the dying), Insomniac (learn how many people circled your target — never who; the decoy picks keep it honestly fuzzy), and Mayor (no night power; your vote silently counts double).

**And every power weakened** — the Mafia's hands are tied on night one, and a second Mafia is only a voice. The Doctor can never protect the same person two nights running — last night's save greys out in the pick list, host-enforced too. The Detective must rest the night after an investigation, with a cover pick so nothing leaks.

**The global weakener: deaths keep their secrets** — kills and lynchings no longer reveal roles; everything comes out only at the end. Scarce information is what makes weak powers worth having.

Weaknesses are printed on the role cards themselves. Uniform night action still holds: everyone picks, every night, so timing tells nothing.

## v0.1.0 — 2026-07-12
Game two opens. Online lobbies, not pass-and-play — one phone each, same room codes and host-authoritative channel model M Deal proved out.

**The game** — host a 4-letter room, four to ten players join, roles deal privately (hold your card to peek — release and it hides). One Mafia (two at seven-plus, and they know each other), a Doctor, a Detective, the rest Villagers. Nights: everyone acts — Mafia picks a kill, Doctor a save (self allowed), Detective an investigation with a private verdict at dawn, and Villagers make a decoy pick, because uniform action means timing leaks nothing (the same principle as M Deal's reaction windows). Dawn announces the body, or the lack of one, with the victim's role revealed. Days: talk it out in person, then vote — strict majority sends someone out, role revealed. Village wins when the Mafia are gone; Mafia win at parity. The dead spectate with the full roster.

**Deliberately v0.1** — no host migration yet (games run ten minutes; a host drop closes the table honestly), no in-app chat (you're in a room or on a call with these people), no rejoin persistence. Those come if the game earns them.

**On the door** — the platform lobby's workshop slot goes live as a midnight-blue card; game three takes the dashed square.
