/* lastcardsim — the Last Card rulebook under load.
   The deck census, the legality matrix, every effect fired in anger, the
   deterministic call penalty, and thousands of complete games at every seat
   count: no stall, no dangling state, no card ever minted twice. */
const path = require('path');
const LC = require(path.join(__dirname, '..', 'shared', 'lastcard-rules.js'));

let fails = 0;
function T(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
}

/* ---- the rulebook is stamped ---- */
T('the rulebook is stamped', typeof LC.RULEBOOK === 'string' && LC.RULEBOOK.indexOf('lastcard') >= 0, LC.RULEBOOK);

/* ---- deck census: 108 cards, exact counts, unique ids ---- */
const deck = LC.buildDeck();
T('the deck is 108 cards', deck.length === 108, String(deck.length));
T('every id is unique', new Set(deck.map(c => c.id)).size === deck.length);
const count = (f) => deck.filter(f).length;
LC.COLOUR_IDS.forEach(col => {
  T(col + ' has one 0', count(c => c.colour === col && c.kind === 'num' && c.n === 0) === 1);
  T(col + ' has two of each 1–9', [...Array(9)].every((_, i) =>
    count(c => c.colour === col && c.kind === 'num' && c.n === i + 1) === 2));
  ['skip', 'rev', 'd2'].forEach(k =>
    T(col + ' has two ' + k, count(c => c.colour === col && c.kind === k) === 2));
});
T('four Wilds', count(c => c.kind === 'wild') === 4);
T('four Draw Fours', count(c => c.kind === 'w4') === 4);
T('wilds carry no colour', deck.every(c => (c.kind === 'wild' || c.kind === 'w4') ? c.colour === null : !!c.colour));
T('every card has a name', deck.every(c => LC.cardName(c).length > 2));

/* ---- legality matrix ---- */
const topT5 = { kind: 'num', colour: 'teal', n: 5 };
T('colour match plays', LC.canPlay({ kind: 'num', colour: 'teal', n: 9 }, topT5, 'teal'));
T('number match plays across colours', LC.canPlay({ kind: 'num', colour: 'gold', n: 5 }, topT5, 'teal'));
T('no match bounces', !LC.canPlay({ kind: 'num', colour: 'gold', n: 9 }, topT5, 'teal'));
T('a wild plays on anything', LC.canPlay({ kind: 'wild', colour: null }, topT5, 'teal'));
T('a Draw Four plays on anything (house)', LC.canPlay({ kind: 'w4', colour: null }, topT5, 'teal'));
T('skip matches skip across colours', LC.canPlay({ kind: 'skip', colour: 'gold' },
  { kind: 'skip', colour: 'teal' }, 'teal'));
T('the active colour rules after a wild', LC.canPlay({ kind: 'num', colour: 'coral', n: 2 },
  { kind: 'wild', colour: null }, 'coral')
  && !LC.canPlay({ kind: 'num', colour: 'gold', n: 7 }, { kind: 'wild', colour: null }, 'coral'));

/* ---- a fresh game is sane ---- */
let g = LC.newGame(4, 42);
T('everyone holds seven', g.players.every(p => p.hand.length === 7));
T('the flip card is a number', LC.top(g).kind === 'num');
T('the active colour is the flip colour', g.activeColour === LC.top(g).colour);
T('108 cards are accounted for', g.deck.length + g.discard.length +
  g.players.reduce((s, p) => s + p.hand.length, 0) === 108);
T('seat counts outside 2–5 refuse', (() => {
  try { LC.newGame(1, 1); return false; } catch (e) { return true; }
})() && (() => { try { LC.newGame(6, 1); return false; } catch (e) { return true; } })());

/* ---- forced effects, driven directly ---- */
function rig(seats, hand0, topCard) {
  const G = LC.newGame(seats, 7);
  G.discard = [topCard];
  G.activeColour = topCard.colour || 'teal';
  G.players[0].hand = hand0;
  G.turn = 0; G.dir = 1; G.phase = 'play';
  return G;
}
let idm = 10000;
const N = (col, n) => ({ id: idm++, kind: 'num', colour: col, n });
const K = (kind, col) => ({ id: idm++, kind, colour: col || null });

g = rig(3, [K('d2', 'teal'), N('teal', 1), N('coral', 2)], N('teal', 5));
let victimBefore = g.players[1].hand.length;
T('a Draw Two applies', LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id }));
T('the victim draws two', g.players[1].hand.length === victimBefore + 2);
T('the victim also sits', g.turn === 2);

g = rig(3, [K('w4'), N('teal', 1), N('coral', 2)], N('teal', 5));
victimBefore = g.players[1].hand.length;
T('a Draw Four needs a colour', !LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id }));
T('a Draw Four with a colour applies', LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id, colour: 'gold' }));
T('the victim draws four', g.players[1].hand.length === victimBefore + 4);
T('the table turns gold', g.activeColour === 'gold');

g = rig(3, [K('skip', 'teal'), N('teal', 1), N('coral', 2)], N('teal', 5));
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('a Skip skips', g.turn === 2);

g = rig(3, [K('rev', 'teal'), N('teal', 1), N('coral', 2)], N('teal', 5));
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('a Reverse reverses', g.dir === -1 && g.turn === 2);

g = rig(2, [K('rev', 'teal'), N('teal', 1), N('coral', 2)], N('teal', 5));
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('heads-up, a Reverse is a Skip', g.dir === 1 && g.turn === 0);

/* ---- the call ---- */
g = rig(2, [N('teal', 1), N('teal', 2)], N('teal', 5));
T('two cards may call', LC.legalMoves(g, 0).some(m => m.t === 'call'));
T('calling stands', LC.apply(g, 0, { t: 'call' }));
T('calling keeps the turn', g.turn === 0);
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('a called exit is clean', g.players[0].hand.length === 1);

g = rig(2, [N('teal', 1), N('teal', 2)], N('teal', 5));
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('an uncalled exit costs two', g.players[0].hand.length === 3);
T('the penalty clears the call for later', !g.players[0].called);

g = rig(2, [N('teal', 1), N('coral', 7), N('coral', 8)], N('teal', 5));
T('three cards may not call', !LC.legalMoves(g, 0).some(m => m.t === 'call'));

/* ---- winning ---- */
g = rig(2, [N('teal', 9)], N('teal', 5));
g.players[0].called = true;
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('an empty hand wins', g.phase === 'over' && g.winner === 0);
T('a finished game refuses moves', !LC.apply(g, 1, { t: 'draw' }));

g = rig(2, [K('d2', 'teal')], N('teal', 5));
g.players[0].called = true;
victimBefore = g.players[1].hand.length;
LC.apply(g, 0, { t: 'play', id: g.players[0].hand[0].id });
T('a Draw Two on the way out still bites', g.winner === 0 && g.players[1].hand.length === victimBefore + 2);

/* ---- the drawn-card phase ---- */
g = rig(2, [N('coral', 9), N('coral', 8), N('coral', 7)], N('teal', 5));
g.deck.unshift(N('teal', 3));                        // the next draw is playable
LC.apply(g, 0, { t: 'draw' });
T('a playable draw offers the choice', g.phase === 'drawn');
const lm = LC.legalMoves(g, 0);
T('only the drawn card or a pass', lm.every(m => m.t === 'pass' || m.id === g.drawnId));
T('holding it passes the turn', LC.apply(g, 0, { t: 'pass' }) && g.turn === 1 && g.phase === 'play');

g = rig(2, [N('coral', 9), N('coral', 8), N('coral', 7)], N('teal', 5));
g.deck.unshift(N('gold', 1));                        // the next draw is dead
LC.apply(g, 0, { t: 'draw' });
T('a dead draw ends the turn itself', g.phase === 'play' && g.turn === 1);

/* ---- out-of-turn and junk intents bounce ---- */
g = LC.newGame(3, 99);
T('out-of-turn bounces', !LC.apply(g, 1, { t: 'draw' }));
T('a foreign card id bounces', !LC.apply(g, 0, { t: 'play', id: 999999 }));
T('junk bounces', !LC.apply(g, 0, { t: 'nonsense' }) && !LC.apply(g, 0, null));

/* ---- the soak: complete games at every seat count ---- */
let soaked = 0, stalls = 0, worstTurns = 0, reshuffles = 0, penalties = 0;
for (let seats = 2; seats <= 5; seats++) {
  for (let i = 0; i < 800; i++) {
    const G = LC.newGame(seats, seats * 100000 + i);
    const ids = new Set();
    let guard = 4000;
    while (G.phase !== 'over' && guard-- > 0) {
      const mv = LC.botMove(G, G.turn);
      if (!mv || !LC.apply(G, G.turn, mv)) { stalls++; break; }
      G.events.forEach(e => {
        if (e.e === 'reshuffle') reshuffles++;
        if (e.e === 'penalty') penalties++;
      });
    }
    if (G.phase !== 'over') { stalls++; continue; }
    worstTurns = Math.max(worstTurns, G.turnCount);
    /* conservation + uniqueness after everything, reshuffles included */
    let all = G.deck.concat(G.discard);
    G.players.forEach(p => { all = all.concat(p.hand); });
    all.forEach(c => ids.add(c.id));
    if (all.length !== 108 || ids.size !== 108) stalls++;
    soaked++;
  }
}
T('3200 games finish, cards conserved, ids unique', stalls === 0 && soaked === 3200,
  'stalls=' + stalls + ' done=' + soaked);
T('games end in sane time', worstTurns > 0 && worstTurns < 2500, 'worst=' + worstTurns);
T('reshuffles happen and survive', reshuffles > 0, String(reshuffles));
console.log('     (soak: worst game ' + worstTurns + ' turns, ' + reshuffles +
  ' reshuffles, ' + penalties + ' uncalled penalties — the bot never pays one itself: ' +
  (penalties === 0 ? 'true' : 'FALSE')) + ')';
T('the bot always calls', penalties === 0, String(penalties));

/* ---- determinism: same seed, same game ---- */
const A = LC.newGame(4, 777), B = LC.newGame(4, 777);
for (let i = 0; i < 200 && A.phase !== 'over'; i++) {
  LC.apply(A, A.turn, LC.botMove(A, A.turn));
  LC.apply(B, B.turn, LC.botMove(B, B.turn));
}
T('the same seed replays the same game',
  JSON.stringify(A.players.map(p => p.hand.map(c => c.id))) ===
  JSON.stringify(B.players.map(p => p.hand.map(c => c.id))));

console.log(fails ? '\nlastcardsim: ' + fails + ' FAILURES' : '\nlastcardsim: all green');
process.exit(fails ? 1 : 0);
