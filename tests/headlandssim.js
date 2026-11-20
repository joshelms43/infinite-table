/* headlandssim — Headlands under load.
   Pins: the census, every cost, the swap-ratio ladder, each Headline, both
   tokens (first-claim, strictly-more transfer, B-side tie priority), trades,
   the market flush, harvest arithmetic, the win-at-7 rule — then a soak of
   full bot games at 2/3/4 seats and frame-exact seeded determinism. */
const path = require('path');
const H = require(path.join(__dirname, '..', 'shared', 'headlands-rules.js'));

let fails = 0;
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || d == null ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

/* ---- census ---- */
T('the rulebook is stamped', H.RULEBOOK === '2026-11-20-headlands-house');
T('61 goods in the five coastal counts', (() => {
  const g = H.newGame(['A', 'B'], 1);
  const all = g.goods.concat(g.goodsDiscard, g.players[0].hand, g.players[1].hand);
  const c = {};
  all.forEach(x => c[x] = (c[x] || 0) + 1);
  return all.length === 61 - 0 - (g.players[0].hand.length + g.players[1].hand.length) + (g.players[0].hand.length + g.players[1].hand.length) &&
    c.clay === 11 && c.timber === 11 && c.wool === 14 && c.cane === 12 && c.stone === 13;
})());
T('34 build cards: 10 Tracks, 11 Shacks, 5 Towns, 8 Rangers', (() => {
  const g = H.newGame(['A', 'B'], 2);
  const all = g.deck.concat(g.market);
  const c = {};
  all.forEach(x => c[x] = (c[x] || 0) + 1);
  return all.length === 34 && c.track === 10 && c.shack === 11 && c.town === 5 && c.ranger === 8;
})());
T('7 Headlines with 3 Raiders among them', (() => {
  const g = H.newGame(['A', 'B'], 3);
  const c = {};
  g.events.forEach(x => c[x] = (c[x] || 0) + 1);
  return g.events.length === 7 && c.raiders === 3 && c.season === 1 && c.whip === 1 && c.tide === 1 && c.grant === 1;
})());
T('everyone starts with a Shack, a Track, and a 2-card hand plus harvest', (() => {
  const g = H.newGame(['A', 'B', 'C'], 4);
  return g.players.every((p, s) =>
    p.tracks === 1 && p.stacks.length === 1 && p.stacks[0][0] === 'shack' &&
    p.hand.length === (s === g.turn ? 3 : 3));
})());
T('the market shows five', H.newGame(['A', 'B'], 5).market.length === 5);

/* ---- a rigged table ---- */
function rig(seed, names) {
  const g = H.newGame(names || ['A', 'B'], seed == null ? 7 : seed);
  g.players.forEach(p => { p.hand = []; });
  return g;
}
function give(p, goods) { goods.forEach(x => p.hand.push(x)); }

/* ---- payments and the swap ladder ---- */
{
  const g = rig();
  const p = g.players[0];
  give(p, ['clay', 'timber']);
  T('an exact cost pays exactly', (() => {
    const pm = H.paymentFor(g, p, H.BUILDS.track.cost);
    return pm && !pm.sub && pm.pay.clay === 1 && pm.pay.timber === 1;
  })());
  T('two goods short cannot be covered', (() => {
    p.hand = ['clay'];
    return H.paymentFor(g, p, H.BUILDS.shack.cost) === null;
  })());
  T('one good short substitutes at 4:1 with one Track', (() => {
    p.hand = ['clay', 'timber', 'wool', 'stone', 'stone', 'stone', 'stone'];
    const pm = H.paymentFor(g, p, H.BUILDS.shack.cost);
    return pm && pm.sub && pm.sub.forGood === 'cane' && pm.sub.k === 4 && pm.pay.stone === 4;
  })());
  T('the ladder: 4, 3, 2, then 1 for 1', (() => {
    const r = t => { p.tracks = t; return H.subRatio(p); };
    const out = [r(1), r(2), r(3), r(4), r(9)].join(',');
    p.tracks = 1;
    return out === '4,3,2,1,1';
  })());
  T('substitution is once per turn', (() => {
    p.hand = ['clay', 'timber', 'wool', 'stone', 'stone', 'stone', 'stone'];
    g.subUsed = true;
    const pm = H.paymentFor(g, p, H.BUILDS.shack.cost);
    g.subUsed = false;
    return pm === null;
  })());
  T('subFrom steers which pile pays', (() => {
    p.hand = ['clay', 'timber', 'wool', 'stone', 'stone', 'stone', 'stone', 'wool', 'wool', 'wool', 'wool'];
    const pm = H.paymentFor(g, p, H.BUILDS.shack.cost, 'stone');
    return pm && pm.sub.from === 'stone';
  })());
}

/* ---- building ---- */
{
  const g = rig(11);
  g.turn = 0; g.market = ['shack', 'track', 'town', 'ranger', 'track'];
  const p = g.players[0];
  give(p, ['clay', 'timber', 'wool', 'cane']);
  const r = H.apply(g, 0, { t: 'build', slot: 0 });
  T('building a Shack scores it and makes a Headline', r.ok &&
    p.stacks.length === 2 && r.evts.some(e => e.e === 'headline') &&
    r.evts.some(e => e.e === 'built' && e.kind === 'shack'));
  T('the market refills to five', g.market.length === 5);
  T('goods spent reach the discard', g.goodsDiscard.length >= 4);

  give(p, ['cane', 'cane', 'stone', 'stone', 'stone']);
  g.market = ['town', 'track', 'track', 'ranger', 'track'];
  const r2 = H.apply(g, 0, { t: 'build', slot: 0 });
  T('a Town covers a Shack for 2 points', r2.ok &&
    p.stacks.some(st => H.topOf(st) === 'town') && H.vpOf(g, 0) >= 3);
  T('no second Town without an open Shack', (() => {
    g.players[0].stacks = [['shack', 'town']];
    give(p, ['cane', 'cane', 'stone', 'stone', 'stone']);
    g.market = ['town', 'track', 'track', 'ranger', 'track'];
    return H.apply(g, 0, { t: 'build', slot: 0 }).ok === false;
  })());
  T('a Resort needs an open Town and pays 3 Wool 1 Stone', (() => {
    p.hand = ['wool', 'wool', 'wool', 'stone'];
    const r3 = H.apply(g, 0, { t: 'build', slot: 'resort' });
    return r3.ok && p.stacks[0].length === 3 && H.vpOf(g, 0) === 3 + 0;
  })());
}

/* ---- the Headlines, one by one ---- */
function fireNamed(id, setup) {
  const g = rig(13, ['A', 'B']);
  g.turn = 0;
  g.events = [id];
  if (setup) setup(g);
  const p = g.players[0];
  give(p, ['clay', 'timber', 'wool', 'cane']);
  g.market = ['shack', 'track', 'track', 'track', 'track'];
  const r = H.apply(g, 0, { t: 'build', slot: 0 });
  return { g: g, evts: r.evts };
}
T('Good Season: 2 each for the tokenless', (() => {
  const { g } = fireNamed('season', g => { g.highway = 1; });
  return g.players[0].hand.length === 2 && g.players[1].hand.length === 0;
})());
T('Whip-Round: the leader hands one back', (() => {
  const { g, evts } = fireNamed('whip', g => {
    g.players[1].stacks = [['shack'], ['shack'], ['shack']];
    give(g.players[1], ['stone', 'stone']);
  });
  return evts.some(e => e.e === 'gift' && e.from === 1 && e.to === 0) &&
    g.players[0].hand.length === 1 && g.players[1].hand.length === 1;
})());
T('Raiders: over the limit loses half, rounded down', (() => {
  const { g, evts } = fireNamed('raiders', g => {
    give(g.players[1], ['stone', 'stone', 'stone', 'stone', 'wool', 'wool', 'wool', 'wool', 'clay']);
  });
  return evts.some(e => e.e === 'raided' && e.seat === 1 && e.n === 4) &&
    g.players[1].hand.length === 5;
})());
T('a Ranger raises the Raider limit', (() => {
  const { evts } = fireNamed('raiders', g => {
    g.players[1].rangers = 1;
    give(g.players[1], ['stone', 'stone', 'stone', 'stone', 'wool', 'wool', 'wool', 'wool']);
  });
  return !evts.some(e => e.e === 'raided');
})());
T('King Tide: 1 each, Headlines reshuffled whole', (() => {
  const { g } = fireNamed('tide', g => {
    g.events = ['season', 'whip', 'raiders', 'raiders', 'raiders', 'grant', 'tide'];
    g.eventsDone = [];
  });
  return g.players[1].hand.length === 1 && g.events.length === 7 && g.eventsDone.length === 0;
})());
T('Council Grant: 1 per open Shack', (() => {
  const { g } = fireNamed('grant', g => { g.players[1].stacks = [['shack'], ['shack', 'town']]; });
  /* builder has 2 open shacks after the build */
  return g.players[0].hand.length === 2 && g.players[1].hand.length === 1;
})());

/* ---- tokens ---- */
{
  const g = rig(17);
  g.turn = 0;
  const p = g.players[0], q = g.players[1];
  p.tracks = 3;
  let evts = [];
  H.apply(g, 0, { t: 'end' });            /* token checks ride on builds; force via build */
  g.turn = 0; g.market = ['track', 'track', 'track', 'track', 'shack'];
  give(p, ['clay', 'timber']);
  const r = H.apply(g, 0, { t: 'build', slot: 0 });
  T('three Tracks claim the Highway (+2)', g.highway === 0 && H.vpOf(g, 0) >= 3);
  T('the Highway moves only on strictly more', (() => {
    q.tracks = p.tracks;
    g.turn = 1; g.market = ['shack', 'shack', 'shack', 'shack', 'track'];
    give(q, ['clay', 'timber', 'wool', 'cane']);
    H.apply(g, 1, { t: 'build', slot: 0 });
    if (g.highway !== 0) return false;
    g.turn = 1; g.market = ['track', 'shack', 'shack', 'shack', 'shack'];
    give(q, ['clay', 'timber']);
    H.apply(g, 1, { t: 'build', slot: 0 });
    return g.highway === 1;
  })());
  T('a Roadhouse Resort takes the Highway on a tie', (() => {
    const g2 = rig(19);
    g2.players[0].resortsB = ['b-highway'];
    g2.players[1].tracks = 4; g2.highway = 1;
    g2.players[0].tracks = 3;
    g2.turn = 0; g2.market = ['track', 'shack', 'shack', 'shack', 'shack'];
    give(g2.players[0], ['clay', 'timber']);
    H.apply(g2, 0, { t: 'build', slot: 0 });
    return g2.highway === 0;
  })());
  T('two Rangers claim the Watch', (() => {
    const g2 = rig(23);
    g2.turn = 0; g2.players[0].rangers = 1;
    g2.market = ['ranger', 'shack', 'shack', 'shack', 'shack'];
    give(g2.players[0], ['wool', 'cane', 'stone']);
    H.apply(g2, 0, { t: 'build', slot: 0 });
    return g2.watch === 0 && H.vpOf(g2, 0) >= 3;
  })());
}

/* ---- trading ---- */
{
  const g = rig(29);
  g.turn = 0;
  give(g.players[0], ['clay', 'clay']);
  give(g.players[1], ['stone']);
  T('a like-for-like or empty offer bounces', (() => {
    const a = H.apply(g, 0, { t: 'trade', to: 1, give: ['clay'], want: ['clay'] });
    const b = H.apply(g, 0, { t: 'trade', to: 1, give: [], want: ['stone'] });
    return !a.ok && !b.ok;
  })());
  T('an accepted trade swaps goods and sweetens the partner', (() => {
    H.apply(g, 0, { t: 'trade', to: 1, give: ['clay'], want: ['stone'] });
    const r = H.apply(g, 1, { t: 'tradeResp', accept: true });
    return r.ok && H.held(g.players[0]).stone === 1 && H.held(g.players[1]).clay === 1 &&
      g.players[1].hand.length === 2 && g.tradeUsed;
  })());
  T('one completed trade per turn', (() => {
    const r = H.apply(g, 0, { t: 'trade', to: 1, give: ['clay'], want: ['stone'] });
    return !r.ok;
  })());
  T('a declined offer does not burn the trade', (() => {
    const g2 = rig(31);
    g2.turn = 0;
    give(g2.players[0], ['clay']);
    give(g2.players[1], ['stone']);
    H.apply(g2, 0, { t: 'trade', to: 1, give: ['clay'], want: ['stone'] });
    H.apply(g2, 1, { t: 'tradeResp', accept: false });
    const r = H.apply(g2, 0, { t: 'trade', to: 1, give: ['clay'], want: ['stone'] });
    return r.ok && !g2.tradeUsed;
  })());
}

/* ---- harvest ---- */
T('harvest: 1 each, plus Towns and Resorts for the turn-holder', (() => {
  const g = rig(37, ['A', 'B']);
  g.players[0].stacks = [['shack', 'town'], ['shack', 'town']];
  const st = ['shack', 'town', 'resort']; st.bSide = false;
  g.players[0].stacks.push(st);
  g.turn = 1;                              /* ending B's turn hands harvest to A? no — to 0 */
  g.players.forEach(p => p.hand = []);
  H.apply(g, 1, { t: 'end' });            /* turn passes to 0, harvest runs */
  return g.players[0].hand.length === 1 + 2 + 2 && g.players[1].hand.length === 1;
})());

/* ---- the win ---- */
T('7 points showing ends it at once', (() => {
  const g = rig(41);
  g.turn = 0;
  g.players[0].stacks = [['shack', 'town'], ['shack', 'town'], ['shack'], ['shack']];
  g.market = ['shack', 'track', 'track', 'track', 'track'];
  g.events = ['grant'];
  give(g.players[0], ['clay', 'timber', 'wool', 'cane']);
  const r = H.apply(g, 0, { t: 'build', slot: 0 });
  return r.ok && g.over && g.winner === 0 && r.evts.some(e => e.e === 'win');
})());

/* ---- market flush ---- */
T('five of a kind flushes the market', (() => {
  const g = rig(43);
  g.turn = 0;
  g.market = ['track', 'track', 'track', 'track', 'shack'];
  g.deck = ['shack', 'town', 'ranger', 'track'];
  give(g.players[0], ['clay', 'timber', 'wool', 'cane']);
  const r = H.apply(g, 0, { t: 'build', slot: 4 });   /* buy the shack, five tracks left */
  return r.evts.some(e => e.e === 'marketflush') &&
    !(g.market.length === 5 && g.market.every(c => c === g.market[0]));
})());

/* ---- soak: full bot games at every table size ---- */
{
  let done = 0, stalls = 0, broke = 0, longest = 0;
  for (let i = 0; i < 90; i++) {
    const n = 2 + (i % 3);
    const names = ['A', 'B', 'C', 'D'].slice(0, n);
    const g = H.newGame(names, 1000 + i);
    let guard = 0;
    while (!g.over && guard < 4000) {
      guard++;
      let moved = false;
      for (let s = 0; s < n; s++) {
        const mv = H.botMove(g, s);
        if (mv) { const r = H.apply(g, s, mv); if (r.ok) moved = true; }
        if (g.over) break;
      }
      if (!moved) break;
      const total = g.goods.length + g.goodsDiscard.length +
        g.players.reduce((s, p) => s + p.hand.length, 0);
      if (total !== 61) { broke++; break; }
    }
    if (g.over) { done++; longest = Math.max(longest, g.turnCount); }
    else if (!broke) stalls++;
  }
  T('soak: games end', done >= 85, 'done=' + done + ' stalls=' + stalls);
  T('soak: the 61 goods are conserved throughout', broke === 0, String(broke));
  console.log('     (soak: ' + done + '/90 decisive, longest ' + longest + ' turns)');
}

/* ---- determinism ---- */
T('the same seed plays the same game', (() => {
  function play(seed) {
    const g = H.newGame(['A', 'B', 'C'], seed);
    const trace = [];
    let guard = 0;
    while (!g.over && guard++ < 3000) {
      let moved = false;
      for (let s = 0; s < 3; s++) {
        const mv = H.botMove(g, s);
        if (mv && H.apply(g, s, mv).ok) moved = true;
        if (g.over) break;
      }
      if (!moved) break;
      if (guard % 10 === 0) trace.push([g.turn, H.vpOf(g, 0), H.vpOf(g, 1), H.vpOf(g, 2),
        g.players[0].hand.join(''), g.market.join(',')]);
    }
    trace.push([g.winner, g.turnCount]);
    return JSON.stringify(trace);
  }
  return play(606060) === play(606060);
})());

console.log(fails ? '\nheadlandssim: ' + fails + ' FAILURES' : '\nheadlandssim: all green');
process.exit(fails ? 1 : 0);
