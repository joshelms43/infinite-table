/* settlerssim — Settlers under load.
   Pins: the census (island, numbers, ports, bank, dev deck), every cost, the
   distance rule, road connection, the snake draft, payouts incl. cities, the
   robber block and bank shortages, port rates, piece limits 5/4/15, longest
   road (claim, ties, transfers, breaks), largest army, the 7 (discards, the
   last-place robber, timeouts), dev cards (timing, once per interval, each
   kind), offers, the win. Then the authority's race cases: two claims on one
   spot, a 7 during a pending trade, one offer accepted twice, a tab asleep
   for ten rolls, the game ending with actions still in flight. Then the 2d6
   shape over many seeded rolls, bot-vs-bot soaks to completion with an audit
   after every action, replay determinism — and mutation proofs that the key
   pins actually bite. */
const fs = require('fs');
const path = require('path');
const SRC_PATH = path.join(__dirname, '..', 'shared', 'settlers-rules.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const S = require(SRC_PATH);

let fails = 0;
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || d == null ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

/* ================= rigging helpers ================= */
function topoOf(M) { return M.TOPO; }
function edgeOf(M, a, b) {
  return M.TOPO.edges.findIndex(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}
/* a game already past the draft: an empty island, nobody holding anything */
function blank(M, n, seed) {
  const g = M.newGame(Array.from({ length: n || 3 }, (_, i) => 'P' + i), seed || 7, { interval: 60000 });
  g.phase = 'play'; g.setup = null; g.now = 1000; g.nextRollAt = 1e12;
  return g;
}
function put(M, g, seat, o) {
  (o.settles || []).forEach(v => { g.vOwner[v] = seat; g.players[seat].left.settle--; });
  (o.cities || []).forEach(v => { g.vOwner[v] = seat; g.vCity[v] = true; g.players[seat].left.city--; });
  (o.roads || []).forEach(e => { g.eOwner[e] = seat; g.players[seat].left.road--; });
}
function give(g, seat, hand) {
  Object.keys(hand).forEach(r => { g.bank[r] -= hand[r]; g.players[seat].hand[r] += hand[r]; });
}
function setHand(g, seat, hand) {
  const p = g.players[seat];
  Object.keys(p.hand).forEach(r => { g.bank[r] += p.hand[r]; p.hand[r] = 0; });
  give(g, seat, hand);
}
/* a simple vertex path of `len` edges, found deterministically */
function pathOf(M, len, avoid) {
  avoid = avoid || new Set();
  const V = M.TOPO.verts;
  for (let s = 0; s < V.length; s++) {
    if (avoid.has(s)) continue;
    const out = walk([s]);
    if (out) return out;
  }
  function walk(p) {
    if (p.length === len + 1) return p;
    const last = p[p.length - 1];
    for (const n of V[last].adj) {
      if (p.includes(n) || avoid.has(n)) continue;
      /* keep the path free of chords so its length is exactly its edges */
      const r = walk(p.concat(n));
      if (r) return r;
    }
    return null;
  }
  return null;
}
function edgesOfPath(M, p) { const es = []; for (let i = 1; i < p.length; i++) es.push(edgeOf(M, p[i - 1], p[i])); return es; }
/* steer the dice: find a seed state whose next roll is `sum` */
function forceRoll(M, g, sum) {
  for (let k = 1; k < 100000; k++) {
    const c = JSON.parse(JSON.stringify(g));
    c.rs = (g.rs + k * 7919) | 0;
    c.nextRollAt = c.now;
    M.dispatch(c, -1, { t: 'clock', now: c.now });
    if (c.lastRoll && c.lastRoll[0] + c.lastRoll[1] === sum) {
      g.rs = (g.rs + k * 7919) | 0;
      g.nextRollAt = g.now;
      return M.dispatch(g, -1, { t: 'clock', now: g.now });
    }
  }
  throw new Error('could not steer the dice to ' + sum);
}
const snap = g => JSON.stringify(g);

/* ================= the pins (each a function of the module) ================= */
const PINS = {};
function pin(name, fn) { PINS[name] = fn; }

/* ---- census ---- */
pin('the island is 19 hexes in rows of 3-4-5-4-3', M => {
  const rows = {};
  M.TOPO.hexes.forEach(h => { rows[h.r] = (rows[h.r] || 0) + 1; });
  return M.TOPO.hexes.length === 19 && [-2, -1, 0, 1, 2].map(r => rows[r]).join('') === '34543';
});
pin('54 corners, 72 edges, 30 of them coast', M =>
  M.TOPO.verts.length === 54 && M.TOPO.edges.length === 72 && M.TOPO.coast.length === 30);
pin('terrain: 4 forest, 3 hills, 4 pasture, 4 fields, 3 mountains, 1 desert', M => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = M.newGame(['A', 'B'], seed), c = {};
    g.hexes.forEach(h => { c[h.res] = (c[h.res] || 0) + 1; });
    if (!(c.timber === 4 && c.clay === 3 && c.wool === 4 && c.grain === 4 && c.ore === 3 && c.desert === 1)) return false;
  }
  return true;
});
pin('numbers 2–12 without a 7, one each of 2 and 12, two of the rest; the desert has none and the robber', M => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = M.newGame(['A', 'B'], seed);
    const nums = g.hexes.filter(h => h.res !== 'desert').map(h => h.num).sort((a, b) => a - b).join(',');
    const desert = g.hexes.findIndex(h => h.res === 'desert');
    if (nums !== '2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12') return false;
    if (g.hexes[desert].num !== 0 || g.robber !== desert) return false;
  }
  return true;
});
pin('6s and 8s never touch, across 300 islands', M => {
  for (let seed = 1; seed <= 300; seed++) {
    const g = M.newGame(['A', 'B'], seed * 31);
    for (let i = 0; i < 19; i++) {
      if (g.hexes[i].num !== 6 && g.hexes[i].num !== 8) continue;
      if (M.TOPO.hexes[i].nb.some(j => g.hexes[j].num === 6 || g.hexes[j].num === 8)) return false;
    }
  }
  return true;
});
pin('9 ports on distinct coast edges: 4 at 3:1 and one 2:1 of each resource', M => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = M.newGame(['A', 'B'], seed), c = {};
    g.ports.forEach(p => { c[p.type] = (c[p.type] || 0) + 1; });
    const edges = new Set(g.ports.map(p => p.edge));
    if (g.ports.length !== 9 || edges.size !== 9) return false;
    if (!g.ports.every(p => M.TOPO.coast.includes(p.edge))) return false;
    if (!(c.any === 4 && M.RES.every(r => c[r] === 1))) return false;
  }
  return true;
});
pin('25 dev cards: 14 Knights, 5 VP, 2 Road Building, 2 Year of Plenty, 2 Monopoly', M => {
  const g = M.newGame(['A', 'B'], 3), c = {};
  g.devDeck.forEach(k => { c[k] = (c[k] || 0) + 1; });
  return g.devDeck.length === 25 && c.knight === 14 && c.vp === 5 && c.roads === 2 && c.plenty === 2 && c.monopoly === 2;
});
pin('the bank holds 19 of each', M => M.RES.every(r => M.newGame(['A', 'B'], 1).bank[r] === 19));
pin('costs: Road T+C, Settlement T+C+W+G, City 2G+3O, Dev W+G+O', M =>
  JSON.stringify(M.COST) === JSON.stringify({
    road: { timber: 1, clay: 1 }, settle: { timber: 1, clay: 1, wool: 1, grain: 1 },
    city: { grain: 2, ore: 3 }, dev: { wool: 1, grain: 1, ore: 1 }
  }));
pin('piece limits 15 roads, 5 settlements, 4 cities', M =>
  M.PIECES.road === 15 && M.PIECES.settle === 5 && M.PIECES.city === 4);
pin('first to 10, discards above 9, robber and discard timers 15s', M =>
  M.WIN_VP === 10 && M.DISCARD_OVER === 9 && M.DISCARD_MS === 15000 && M.ROBBER_MS === 15000);
pin('roll intervals 20s / 30s / 60s, default 60s', M =>
  M.INTERVALS.join(',') === '20000,30000,60000' && M.DEFAULT_INTERVAL === 60000 &&
  M.newGame(['A', 'B'], 1).interval === 60000 && M.newGame(['A', 'B'], 1, { interval: 20000 }).interval === 20000 &&
  M.newGame(['A', 'B'], 1, { interval: 12345 }).interval === 60000);

/* ---- the draft ---- */
pin('the draft snakes: every seat, then back again', M => {
  const g = M.newGame(['A', 'B', 'C', 'D'], 9);
  const o = g.setup.order;
  return o.length === 8 && o.slice(0, 4).join() === o.slice(4).reverse().join() &&
    new Set(o.slice(0, 4)).size === 4;
});
pin('the draft refuses the wrong seat and anything but placement', M => {
  const g = M.newGame(['A', 'B', 'C'], 9);
  const s = M.setupSeat(g), other = (s + 1) % 3;
  const v = M.legalSettles(g, s)[0];
  return M.dispatch(g, other, { t: 'settle', v }).why === 'turn' &&
    M.dispatch(g, s, { t: 'buyDev' }).why === 'phase' &&
    M.dispatch(g, s, { t: 'road', e: 0 }).why === 'phase';
});
pin('a draft road must touch the settlement just placed', M => {
  const g = M.newGame(['A', 'B'], 4);
  const s = M.setupSeat(g), v = M.legalSettles(g, s)[0];
  M.dispatch(g, s, { t: 'settle', v });
  const far = M.TOPO.edges.findIndex(e => e.a !== v && e.b !== v);
  const near = M.TOPO.verts[v].edges[0];
  return M.dispatch(g, s, { t: 'road', e: far }).why === 'illegal' && M.dispatch(g, s, { t: 'road', e: near }).ok;
});
pin('the second settlement pays its neighbours; the first pays nothing', M => {
  const g = M.newGame(['A', 'B'], 12);
  let firstPaid = null, secondOk = true;
  while (g.phase === 'setup') {
    const s = M.setupSeat(g), second = g.setup.i >= 2;
    const before = M.handSize(g.players[s].hand);
    const v = M.legalSettles(g, s).find(x => M.TOPO.verts[x].hexes.every(h => g.hexes[h].res !== 'desert')) ?? M.legalSettles(g, s)[0];
    M.dispatch(g, s, { t: 'settle', v });
    const gained = M.handSize(g.players[s].hand) - before;
    const expect = M.TOPO.verts[v].hexes.filter(h => g.hexes[h].res !== 'desert').length;
    if (!second) firstPaid = (firstPaid || 0) + gained;
    else if (gained !== expect) secondOk = false;
    M.dispatch(g, s, { t: 'road', e: M.legalRoads(g, s)[0] });
  }
  return firstPaid === 0 && secondOk && g.phase === 'play';
});
pin('a draft placement that times out is made for the player', M => {
  const g = M.newGame(['A', 'B'], 5, { now: 0 });
  const s = M.setupSeat(g);
  M.act(g, -1, { t: 'clock', now: M.SETUP_MS + 1 }, M.SETUP_MS + 1);
  return M.settlesOf(g, s).length === 1 && g.eOwner.filter(o => o === s).length === 1 && M.setupSeat(g) !== s;
});
pin('real time starts after the draft: the first roll comes on the clock', M => {
  const g = M.newGame(['A', 'B'], 5, { now: 0 });
  let t = 0;
  while (g.phase === 'setup') { t += 100; const s = M.setupSeat(g); M.act(g, s, M.botMove(g, s, 'trader'), t); }
  const at = g.nextRollAt;
  M.act(g, -1, { t: 'clock', now: at - 1 }, at - 1);
  const before = g.rollN;
  M.act(g, -1, { t: 'clock', now: at }, at);
  return at === t + M.FIRST_ROLL_MS && before === 0 && g.rollN === 1;
});

/* ---- building ---- */
pin('building costs exactly its price and a short hand changes nothing', M => {
  const g = blank(M, 2);
  const p = pathOf(M, 2);
  put(M, g, 0, { settles: [p[0]], roads: [edgeOf(M, p[0], p[1])] });
  setHand(g, 0, { timber: 1 });
  const before = snap(g);
  const r = M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) });
  const unchanged = snap(g) === before;
  setHand(g, 0, { timber: 1, clay: 1, ore: 2 });
  const r2 = M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) });
  const h = g.players[0].hand;
  return r.why === 'cost' && unchanged && r2.ok && h.timber === 0 && h.clay === 0 && h.ore === 2 &&
    g.bank.timber === 19 && g.bank.clay === 19;
});
pin('the distance rule: no settlement next to another, ours or anyone’s', M => {
  const g = blank(M, 2);
  const p = pathOf(M, 3);
  put(M, g, 0, { settles: [p[0]], roads: edgesOfPath(M, p) });
  put(M, g, 1, { settles: [p[3]] });
  setHand(g, 0, { timber: 3, clay: 3, wool: 3, grain: 3 });
  /* p[1] is next to our own corner, p[2] next to the rival's */
  return M.dispatch(g, 0, { t: 'settle', v: p[1] }).why === 'taken' &&
    M.dispatch(g, 0, { t: 'settle', v: p[2] }).why === 'taken';
});
pin('after the draft a settlement needs one of our roads', M => {
  const g = blank(M, 2);
  const p = pathOf(M, 3);
  put(M, g, 0, { settles: [p[0]], roads: [edgeOf(M, p[0], p[1])] });
  setHand(g, 0, { timber: 2, clay: 2, wool: 2, grain: 2 });
  const far = M.TOPO.verts.findIndex((v, i) => M.TOPO.verts[i].adj.every(a => g.vOwner[a] === -1) && g.vOwner[i] === -1 && !M.TOPO.verts[i].edges.some(e => g.eOwner[e] === 0));
  const noRoad = M.dispatch(g, 0, { t: 'settle', v: far }).why === 'illegal';
  M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) });
  return noRoad && M.dispatch(g, 0, { t: 'settle', v: p[2] }).ok;
});
pin('roads join our network and never pass through a rival’s settlement', M => {
  const g = blank(M, 2);
  const p = pathOf(M, 3);
  put(M, g, 0, { settles: [p[0]], roads: [edgeOf(M, p[0], p[1])] });
  put(M, g, 1, { settles: [p[1]] });
  g.vOwner[p[1]] = 1;
  setHand(g, 0, { timber: 3, clay: 3 });
  const through = M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) }).why === 'illegal';
  const loose = M.TOPO.edges.findIndex(e => ![e.a, e.b].some(x => M.TOPO.verts[x].edges.some(n => g.eOwner[n] === 0) || g.vOwner[x] === 0));
  return through && M.dispatch(g, 0, { t: 'road', e: loose }).why === 'illegal';
});
pin('a city upgrades our own settlement and returns the settlement piece', M => {
  const g = blank(M, 2);
  put(M, g, 0, { settles: [0] });
  put(M, g, 1, { settles: [10] });
  setHand(g, 0, { grain: 4, ore: 6 });
  const theirs = M.dispatch(g, 0, { t: 'city', v: 10 }).why === 'illegal';
  const ok = M.dispatch(g, 0, { t: 'city', v: 0 }).ok;
  const again = M.dispatch(g, 0, { t: 'city', v: 0 }).why === 'illegal';
  return theirs && ok && again && g.vCity[0] && g.players[0].left.city === 3 && g.players[0].left.settle === 5 &&
    M.vp(g, 0) === 2;
});
pin('piece limits: a 16th road, a 6th settlement, a 5th city are refused', M => {
  const g = blank(M, 2);
  const p = pathOf(M, 3);
  put(M, g, 0, { settles: [p[0]], roads: [edgeOf(M, p[0], p[1])] });
  setHand(g, 0, { timber: 4, clay: 4, wool: 4, grain: 6, ore: 6 });
  g.players[0].left.road = 0;
  const road = M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) }).why === 'limit';
  g.players[0].left.road = 5;
  M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) });
  g.players[0].left.settle = 0;
  const settle = M.dispatch(g, 0, { t: 'settle', v: p[2] }).why === 'limit';
  g.players[0].left.city = 0;
  const city = M.dispatch(g, 0, { t: 'city', v: p[0] }).why === 'limit';
  return road && settle && city;
});

/* ---- the dice ---- */
pin('a roll pays 1 to a settlement and 2 to a city on the matching hex', M => {
  const g = blank(M, 2);
  const hi = g.hexes.findIndex(h => h.num === 8);
  const [a, b] = M.TOPO.hexes[hi].corners;
  const c = M.TOPO.hexes[hi].corners[3];
  put(M, g, 0, { settles: [a] });
  put(M, g, 1, { cities: [c] });
  const res = g.hexes[hi].res;
  const b0 = g.players[0].hand[res], b1 = g.players[1].hand[res];
  forceRoll(M, g, 8);
  /* a corner can sit on two 8s? never — 8s don't touch — so this is exact */
  return g.players[0].hand[res] - b0 === 1 && g.players[1].hand[res] - b1 === 2 &&
    g.players[0].collected[res] === 1 && g.players[1].collected[res] === 2;
});
pin('the robber blocks its hex', M => {
  const g = blank(M, 2);
  const hi = g.hexes.findIndex(h => h.num === 6);
  put(M, g, 0, { settles: [M.TOPO.hexes[hi].corners[0]] });
  g.robber = hi;
  const res = g.hexes[hi].res, b0 = g.players[0].hand[res];
  forceRoll(M, g, 6);
  return g.players[0].hand[res] === b0;
});
pin('a bank that can’t pay everyone pays no one; a lone claimant takes what’s left', M => {
  const g = blank(M, 3);
  const hi = g.hexes.findIndex(h => h.num === 9);
  const cs = M.TOPO.hexes[hi].corners, res = g.hexes[hi].res;
  put(M, g, 0, { settles: [cs[0]] });
  put(M, g, 1, { settles: [cs[2]] });
  g.bank[res] = 1; g.players[2].hand[res] = 18;
  forceRoll(M, g, 9);
  const none = g.players[0].hand[res] === 0 && g.players[1].hand[res] === 0;
  const g2 = blank(M, 3);
  const cs2 = M.TOPO.hexes[hi].corners;
  put(M, g2, 0, { cities: [cs2[0]] });
  g2.bank[res] = 1; g2.players[2].hand[res] = 18;
  forceRoll(M, g2, 9);
  return none && g2.players[0].hand[res] === 1 && g2.bank[res] === 0;
});

/* ---- trading with the bank ---- */
pin('bank 4:1, a 3:1 port, a 2:1 port of its own resource', M => {
  const g = blank(M, 2);
  const generic = g.ports.find(p => p.type === 'any');
  const wool = g.ports.find(p => p.type === 'wool');
  const r0 = M.portRate(g, 0, 'wool');
  put(M, g, 0, { settles: [M.TOPO.edges[generic.edge].a] });
  const r1 = M.portRate(g, 0, 'wool'), r1o = M.portRate(g, 0, 'ore');
  put(M, g, 0, { settles: [M.TOPO.edges[wool.edge].a] });
  const r2 = M.portRate(g, 0, 'wool'), r2o = M.portRate(g, 0, 'ore');
  setHand(g, 0, { wool: 2 });
  const ok = M.dispatch(g, 0, { t: 'bank', give: 'wool', get: 'ore' }).ok;
  return r0 === 4 && r1 === 3 && r1o === 3 && r2 === 2 && r2o === 3 && ok &&
    g.players[0].hand.wool === 0 && g.players[0].hand.ore === 1;
});
pin('a bank trade short of the rate is refused and changes nothing', M => {
  const g = blank(M, 2);
  setHand(g, 0, { grain: 3 });
  const before = snap(g);
  return M.dispatch(g, 0, { t: 'bank', give: 'grain', get: 'ore' }).why === 'cost' && snap(g) === before;
});

/* ---- longest road ---- */
function lrRig(M) {
  const g = blank(M, 3);
  const a = pathOf(M, 6);
  const avoid = new Set(); a.forEach(v => { avoid.add(v); M.TOPO.verts[v].adj.forEach(n => avoid.add(n)); });
  const b = pathOf(M, 6, avoid);
  return { g, a, b };
}
pin('longest road: five roads claim it', M => {
  const { g, a } = lrRig(M);
  const ea = edgesOfPath(M, a);
  put(M, g, 0, { settles: [a[0]], roads: ea.slice(0, 4) });
  setHand(g, 0, { timber: 1, clay: 1 });
  const four = g.longest === -1;
  M.dispatch(g, 0, { t: 'road', e: ea[4] });
  return four && g.longest === 0 && M.vpParts(g, 0).longest === 2;
});
pin('longest road: a tie leaves it with the holder', M => {
  const { g, a, b } = lrRig(M);
  const ea = edgesOfPath(M, a), eb = edgesOfPath(M, b);
  put(M, g, 0, { settles: [a[0]], roads: ea.slice(0, 4) });
  put(M, g, 1, { settles: [b[0]], roads: eb.slice(0, 4) });
  setHand(g, 0, { timber: 1, clay: 1 }); setHand(g, 1, { timber: 2, clay: 2 });
  M.dispatch(g, 0, { t: 'road', e: ea[4] });
  M.dispatch(g, 1, { t: 'road', e: eb[4] });
  return g.longest === 0;
});
pin('longest road: strictly longer takes it', M => {
  const { g, a, b } = lrRig(M);
  const ea = edgesOfPath(M, a), eb = edgesOfPath(M, b);
  put(M, g, 0, { settles: [a[0]], roads: ea.slice(0, 4) });
  put(M, g, 1, { settles: [b[0]], roads: eb.slice(0, 4) });
  setHand(g, 0, { timber: 1, clay: 1 }); setHand(g, 1, { timber: 2, clay: 2 });
  M.dispatch(g, 0, { t: 'road', e: ea[4] });
  M.dispatch(g, 1, { t: 'road', e: eb[4] });
  M.dispatch(g, 1, { t: 'road', e: eb[5] });
  return g.longest === 1 && M.vpParts(g, 0).longest === 0;
});
/* a breaker: seat 2 owns a spur reaching the middle of seat 0's road */
function breakRig(M, otherLen) {
  const { g, a, b } = lrRig(M);
  const ea = edgesOfPath(M, a), eb = edgesOfPath(M, b);
  put(M, g, 0, { settles: [a[0]], roads: ea });             /* 6 long, holder */
  put(M, g, 1, { settles: [b[0]], roads: eb.slice(0, otherLen) });
  /* the middle corner of seat 0's road, and a spur onto it */
  const mid = a[3];
  const spur = M.TOPO.verts[mid].edges.find(e => g.eOwner[e] === -1);
  const w = M.TOPO.edges[spur].a === mid ? M.TOPO.edges[spur].b : M.TOPO.edges[spur].a;
  g.eOwner[spur] = 2; g.players[2].left.road--;
  g.vOwner[w] = 2; g.players[2].left.settle--;      /* rigged anchor (not a legal corner, by design) */
  M.dispatch(g, -1, { t: 'clock', now: g.now });
  g.longest = 0;
  setHand(g, 2, { timber: 1, clay: 1, wool: 1, grain: 1 });
  g.vOwner[w] = -1; g.players[2].left.settle++;
  /* seat 2 settles on the middle corner: allowed only because w is free again */
  const w2 = M.TOPO.verts[w].edges.find(e => e !== spur && g.eOwner[e] === -1);
  const x = M.TOPO.edges[w2].a === w ? M.TOPO.edges[w2].b : M.TOPO.edges[w2].a;
  g.eOwner[w2] = 2; g.players[2].left.road--;
  g.vOwner[x] = 2; g.players[2].left.settle--;
  const r = M.dispatch(g, 2, { t: 'settle', v: mid });
  return { g, r };
}
pin('longest road: cut below a rival, the rival takes it', M => {
  const { g, r } = breakRig(M, 5);
  return r.ok && g.players[0].roadLen === 3 && g.longest === 1;
});
pin('longest road: cut below a tie of rivals, nobody holds it', M => {
  const { g, a } = (() => { const o = breakRig(M, 5); return { g: o.g }; })();
  /* give seat 2 a five-road too, then cut again from fresh */
  const { g: g2, r } = (() => {
    const o = lrRig(M);
    const ea = edgesOfPath(M, o.a), eb = edgesOfPath(M, o.b);
    put(M, o.g, 0, { settles: [o.a[0]], roads: ea });
    put(M, o.g, 1, { settles: [o.b[0]], roads: eb.slice(0, 5) });
    /* seat 2's five: built far from both */
    const avoid = new Set();
    o.a.concat(o.b).forEach(v => { avoid.add(v); M.TOPO.verts[v].adj.forEach(n => { avoid.add(n); M.TOPO.verts[n].adj.forEach(m => avoid.add(m)); }); });
    const c = pathOf(M, 5, avoid);
    if (!c) return { g: o.g, r: { ok: false } };
    put(M, o.g, 2, { settles: [c[0]], roads: edgesOfPath(M, c) });
    o.g.longest = 0;
    /* seat 1 cuts seat 0 at its middle corner via a spur */
    const mid = o.a[3];
    const spur = M.TOPO.verts[mid].edges.find(e => o.g.eOwner[e] === -1);
    o.g.eOwner[spur] = 1; o.g.players[1].left.road--;
    setHand(o.g, 1, { timber: 1, clay: 1, wool: 1, grain: 1 });
    return { g: o.g, r: M.dispatch(o.g, 1, { t: 'settle', v: mid }) };
  })();
  /* after the cut seat 0 is at 3, seats 1 and 2 tie at 5 (seat 1's spur doesn't extend its chain) */
  return r.ok && g2.players[0].roadLen === 3 && g2.players[1].roadLen === 5 && g2.players[2].roadLen === 5 && g2.longest === -1;
});
pin('road length counts the longest single trail, not the total', M => {
  const g = blank(M, 2);
  /* a Y: three arms of 2 from one corner → longest trail is 4 */
  const hub = M.TOPO.verts.findIndex(v => v.adj.length === 3);
  const arms = M.TOPO.verts[hub].adj.map(n => {
    const nn = M.TOPO.verts[n].adj.find(m => m !== hub && !M.TOPO.verts[hub].adj.includes(m));
    return [edgeOf(M, hub, n), edgeOf(M, n, nn)];
  });
  put(M, g, 0, { settles: [hub], roads: arms.flat() });
  return M.roadLength(g, 0) === 4;
});

/* ---- largest army ---- */
function knightRig(M) {
  const g = blank(M, 3);
  put(M, g, 1, { settles: [M.TOPO.hexes[0].corners[0]] });
  give(g, 1, { wool: 5 });
  return g;
}
function playKnight(M, g, seat) {
  g.players[seat].dev.push({ k: 'knight', at: -1 });
  const hex = g.robber === 0 ? 1 : 0;
  const vs = M.robberVictims(g, seat, hex);
  const r = M.dispatch(g, seat, { t: 'dev', k: 'knight', hex, victim: vs.length ? vs[0] : -1 });
  g.rollN++;
  return r;
}
pin('largest army: three knights claim it, a tie doesn’t move it, more takes it', M => {
  const g = knightRig(M);
  playKnight(M, g, 0); playKnight(M, g, 0);
  const two = g.army === -1;
  playKnight(M, g, 0);
  const three = g.army === 0;
  playKnight(M, g, 2); playKnight(M, g, 2); playKnight(M, g, 2);
  const tie = g.army === 0;
  playKnight(M, g, 2);
  return two && three && tie && g.army === 2 && M.vpParts(g, 2).army === 2 && M.vpParts(g, 0).army === 0;
});

/* ---- the 7 ---- */
pin('a 7 pays nothing; hands above 9 discard half, rounded down; 9 keeps all', M => {
  const g = blank(M, 3);
  const hi = g.hexes.findIndex(h => h.num === 6);
  put(M, g, 0, { settles: [M.TOPO.hexes[hi].corners[0]] });
  setHand(g, 0, { wool: 4, ore: 7 });       /* 11 → loses 5 */
  setHand(g, 1, { grain: 9 });              /* 9 → safe */
  setHand(g, 2, { clay: 10 });              /* 10 → loses 5 */
  forceRoll(M, g, 7);
  return g.phase === 'discard' && g.discard.need[0] === 5 && g.discard.need[1] == null && g.discard.need[2] === 5;
});
pin('the table holds while a 7 resolves', M => {
  const g = blank(M, 3);
  setHand(g, 0, { ore: 10 });
  setHand(g, 1, { timber: 2, clay: 2 });
  put(M, g, 1, { settles: [0], roads: [M.TOPO.verts[0].edges[0]] });
  forceRoll(M, g, 7);
  const e = M.legalRoads(g, 1)[0];
  return M.dispatch(g, 1, { t: 'road', e }).why === 'frozen' && M.dispatch(g, 1, { t: 'bank', give: 'timber', get: 'ore' }).why === 'frozen';
});
pin('a discard must be exactly the owed count, from cards held', M => {
  const g = blank(M, 2);
  setHand(g, 0, { ore: 6, wool: 4 });
  forceRoll(M, g, 7);
  return M.dispatch(g, 0, { t: 'discard', cards: { ore: 4 } }).why === 'illegal' &&
    M.dispatch(g, 0, { t: 'discard', cards: { grain: 5 } }).why === 'illegal' &&
    M.dispatch(g, 0, { t: 'discard', cards: { ore: 3, wool: 2 } }).ok &&
    g.phase === 'robber';
});
pin('an unanswered discard picks itself at 15 seconds', M => {
  const g = blank(M, 2);
  setHand(g, 0, { ore: 6, wool: 6 });
  forceRoll(M, g, 7);
  const dl = g.discard.deadline;
  M.act(g, -1, { t: 'clock', now: dl - 1 }, dl - 1);
  const still = g.phase === 'discard';
  M.act(g, -1, { t: 'clock', now: dl }, dl);
  return still && g.phase === 'robber' && M.handSize(g.players[0].hand) === 6 && M.audit(g).length === 0;
});
pin('the last-place player moves the robber', M => {
  const g = blank(M, 3);
  put(M, g, 0, { settles: [0, 20] });
  put(M, g, 1, { settles: [40] });           /* seat 1: 1 point; seat 2: 0 */
  put(M, g, 1, { settles: [50] });
  forceRoll(M, g, 7);
  return g.phase === 'robber' && g.robberBy === 2;
});
pin('the robber can’t stay put, robs only a neighbour with cards, and steals exactly one', M => {
  const g = blank(M, 3);
  const hi = 5, cs = M.TOPO.hexes[hi].corners;
  put(M, g, 0, { settles: [cs[0]] });
  put(M, g, 1, { settles: [cs[3]] });
  setHand(g, 0, { ore: 3 });
  forceRoll(M, g, 7);
  g.robberBy = 2;
  const stay = M.dispatch(g, 2, { t: 'robber', hex: g.robber, victim: -1 }).why === 'illegal';
  const empty = M.dispatch(g, 2, { t: 'robber', hex: hi, victim: 1 }).why === 'illegal';   /* seat 1 has no cards */
  const notThere = M.dispatch(g, 2, { t: 'robber', hex: hi, victim: -1 }).why === 'illegal';
  const ok = M.dispatch(g, 2, { t: 'robber', hex: hi, victim: 0 }).ok;
  return stay && empty && notThere && ok && g.robber === hi && g.players[0].hand.ore === 2 && g.players[2].hand.ore === 1 &&
    g.phase === 'play' && g.nextRollAt === g.now + g.interval;
});
pin('a robber left unmoved moves itself at 15 seconds', M => {
  const g = blank(M, 2);
  forceRoll(M, g, 7);
  const dl = g.robberDeadline, from = g.robber;
  M.act(g, -1, { t: 'clock', now: dl }, dl);
  return g.phase === 'play' && g.robber !== from;
});

/* ---- dev cards ---- */
pin('a dev card can’t be played in the roll-interval it was bought', M => {
  const g = blank(M, 2);
  put(M, g, 1, { settles: [M.TOPO.hexes[3].corners[0]] });
  give(g, 1, { ore: 2 });
  g.devDeck.push('knight');
  setHand(g, 0, { wool: 1, grain: 1, ore: 1 });
  M.dispatch(g, 0, { t: 'buyDev' });
  const early = M.dispatch(g, 0, { t: 'dev', k: 'knight', hex: 3, victim: 1 }).why === 'early';
  g.rollN++;
  return early && M.dispatch(g, 0, { t: 'dev', k: 'knight', hex: 3, victim: 1 }).ok;
});
pin('one dev card per roll-interval', M => {
  const g = blank(M, 2);
  g.players[0].dev.push({ k: 'plenty', at: -1 }, { k: 'plenty', at: -1 });
  const a = M.dispatch(g, 0, { t: 'dev', k: 'plenty', res: ['ore', 'ore'] }).ok;
  const b = M.dispatch(g, 0, { t: 'dev', k: 'plenty', res: ['ore', 'ore'] }).why === 'once';
  g.rollN++;
  return a && b && M.dispatch(g, 0, { t: 'dev', k: 'plenty', res: ['wool', 'grain'] }).ok && g.players[0].hand.ore === 2;
});
pin('a Victory Point card counts at once and can’t be “played”', M => {
  const g = blank(M, 2);
  g.devDeck.push('vp');
  setHand(g, 0, { wool: 1, grain: 1, ore: 1 });
  M.dispatch(g, 0, { t: 'buyDev' });
  return M.vp(g, 0) === 1 && M.publicVp(g, 0) === 0 && M.dispatch(g, 0, { t: 'dev', k: 'vp' }).why === 'illegal';
});
pin('Monopoly takes every card of the named resource', M => {
  const g = blank(M, 3);
  g.players[0].dev.push({ k: 'monopoly', at: -1 });
  setHand(g, 1, { grain: 3, ore: 1 }); setHand(g, 2, { grain: 2 });
  return M.dispatch(g, 0, { t: 'dev', k: 'monopoly', res: 'grain' }).ok &&
    g.players[0].hand.grain === 5 && g.players[1].hand.grain === 0 && g.players[2].hand.grain === 0 && g.players[1].hand.ore === 1;
});
pin('Road Building lays two connected roads free', M => {
  const g = blank(M, 2);
  const p = pathOf(M, 3);
  put(M, g, 0, { settles: [p[0]], roads: [edgeOf(M, p[0], p[1])] });
  g.players[0].dev.push({ k: 'roads', at: -1 });
  const bad = M.dispatch(g, 0, { t: 'dev', k: 'roads', edges: [edgeOf(M, p[2], p[3]), edgeOf(M, p[1], p[2])] }).why === 'illegal';
  const ok = M.dispatch(g, 0, { t: 'dev', k: 'roads', edges: [edgeOf(M, p[1], p[2]), edgeOf(M, p[2], p[3])] }).ok;
  return bad && ok && g.eOwner[edgeOf(M, p[2], p[3])] === 0 && M.handSize(g.players[0].hand) === 0 && g.players[0].left.road === 12;
});

/* ---- offers ---- */
pin('an offer stands before the table; the first acceptance swaps atomically', M => {
  const g = blank(M, 3);
  setHand(g, 0, { wool: 2 }); setHand(g, 1, { ore: 1 }); setHand(g, 2, { ore: 1 });
  const o = M.dispatch(g, 0, { t: 'offer', give: { wool: 2 }, get: { ore: 1 } });
  const id = o.evts.find(e => e.e === 'offer').id;
  const r1 = M.dispatch(g, 1, { t: 'accept', id });
  const r2 = M.dispatch(g, 2, { t: 'accept', id });
  return r1.ok && r2.why === 'gone' && g.players[0].hand.ore === 1 && g.players[1].hand.wool === 2 &&
    g.players[2].hand.ore === 1 && g.offers.length === 0 && M.audit(g).length === 0;
});
pin('an offer the poster can no longer cover is withdrawn', M => {
  const g = blank(M, 3);
  const p = pathOf(M, 2);
  put(M, g, 0, { settles: [p[0]], roads: [edgeOf(M, p[0], p[1])] });
  setHand(g, 0, { timber: 1, clay: 1 }); setHand(g, 1, { ore: 1 });
  const id = M.dispatch(g, 0, { t: 'offer', give: { timber: 1 }, get: { ore: 1 } }).evts.find(e => e.e === 'offer').id;
  const r = M.dispatch(g, 0, { t: 'road', e: edgeOf(M, p[1], p[2]) });
  return r.ok && r.evts.some(e => e.e === 'offerGone' && e.id === id && e.why === 'afford') && g.offers.length === 0 &&
    M.dispatch(g, 1, { t: 'accept', id }).why === 'gone';
});
pin('offers can’t give and want the same thing, or give what isn’t held', M => {
  const g = blank(M, 2);
  setHand(g, 0, { wool: 1 });
  return M.dispatch(g, 0, { t: 'offer', give: { wool: 1 }, get: { wool: 1 } }).why === 'illegal' &&
    M.dispatch(g, 0, { t: 'offer', give: { ore: 1 }, get: { wool: 1 } }).why === 'cost' &&
    M.dispatch(g, 0, { t: 'offer', give: { wool: 1 }, get: {} }).why === 'illegal' &&
    M.dispatch(g, 0, { t: 'offer', give: { wool: -1 }, get: { ore: 1 } }).why === 'illegal';
});
pin('when everyone else declines, the offer closes', M => {
  const g = blank(M, 3);
  setHand(g, 0, { wool: 1 });
  const id = M.dispatch(g, 0, { t: 'offer', give: { wool: 1 }, get: { ore: 1 } }).evts.find(e => e.e === 'offer').id;
  M.dispatch(g, 1, { t: 'decline', id });
  const open = g.offers.length === 1;
  M.dispatch(g, 2, { t: 'decline', id });
  return open && g.offers.length === 0;
});
pin('offers expire on the clock', M => {
  const g = blank(M, 2);
  setHand(g, 0, { wool: 1 });
  M.dispatch(g, 0, { t: 'offer', give: { wool: 1 }, get: { ore: 1 } });
  M.act(g, -1, { t: 'clock', now: g.now + M.OFFER_MS }, g.now + M.OFFER_MS);
  return g.offers.length === 0;
});

/* ---- the win ---- */
pin('ten points ends it on the spot; nothing moves after', M => {
  const g = blank(M, 2);
  put(M, g, 0, { cities: [0, 10, 20, 30], settles: [40] });   /* 9 */
  g.devDeck.push('vp');
  setHand(g, 0, { wool: 2, grain: 2, ore: 2 });
  const r = M.dispatch(g, 0, { t: 'buyDev' });
  const after = snap(g);
  const blocked = M.dispatch(g, 0, { t: 'buyDev' }).why === 'over' && M.dispatch(g, 1, { t: 'bank', give: 'ore', get: 'wool' }).why === 'over';
  M.act(g, -1, { t: 'clock', now: g.now + 1e7 }, g.now + 1e7);
  return r.ok && g.over && g.winner === 0 && blocked && g.rollN === JSON.parse(after).rollN && g.phase === 'over';
});

/* ================= run the rule pins ================= */
Object.keys(PINS).forEach(n => {
  let ok = false, err = null;
  try { ok = !!PINS[n](S); } catch (e) { err = e.message; }
  T(n, ok, err);
});
T('the rulebook is stamped', S.RULEBOOK === '2026-11-20-settlers-realtime');

/* ================= the authority's race cases ================= */
{
  /* two players claim one corner in the same instant: first in the queue wins,
     the second is told the spot is taken and keeps every card */
  const g = blank(S, 3);
  const v = S.TOPO.verts.findIndex(x => x.adj.length === 3);
  const [n0, n1] = S.TOPO.verts[v].adj;
  const e0 = edgeOf(S, v, n0), e1 = edgeOf(S, v, n1);
  const far0 = S.TOPO.verts[n0].adj.find(x => x !== v), far1 = S.TOPO.verts[n1].adj.find(x => x !== v);
  put(S, g, 1, { roads: [e0, edgeOf(S, n0, far0)], settles: [far0] });
  put(S, g, 2, { roads: [e1, edgeOf(S, n1, far1)], settles: [far1] });
  setHand(g, 1, { timber: 1, clay: 1, wool: 1, grain: 1 });
  setHand(g, 2, { timber: 1, clay: 1, wool: 1, grain: 1 });
  const t = g.now + 5;
  const a = S.act(g, 1, { t: 'settle', v }, t);
  const hand2 = JSON.stringify(g.players[2].hand);
  const b = S.act(g, 2, { t: 'settle', v }, t);
  T('race: two claims on one corner — first wins', a.ok && g.vOwner[v] === 1);
  T('race: the second is told Spot Taken and keeps its cards', b.why === 'taken' && JSON.stringify(g.players[2].hand) === hand2);
  T('race: the island is still legal', S.audit(g).length === 0, S.audit(g).join());
  /* the same for one edge */
  const g2 = blank(S, 3);
  put(S, g2, 1, { settles: [v] });
  put(S, g2, 2, { roads: [e1], settles: [far1] });
  g2.eOwner[edgeOf(S, n1, far1)] = 2; g2.players[2].left.road--;
  setHand(g2, 1, { timber: 1, clay: 1 }); setHand(g2, 2, { timber: 1, clay: 1 });
  const target = edgeOf(S, v, n0);
  const vfree = S.TOPO.verts[v].adj.find(x => x !== n0 && x !== n1);
  /* seat 2 reaches the same edge from n0's side */
  put(S, g2, 2, { roads: [edgeOf(S, n0, far0)] });
  g2.vOwner[far0] = 2; g2.players[2].left.settle--;
  const c1 = S.act(g2, 2, { t: 'road', e: target }, g2.now + 1);
  const c2 = S.act(g2, 1, { t: 'road', e: target }, g2.now + 1);
  T('race: two claims on one edge — second gets Taken, no double ownership', c1.ok && c2.why === 'taken' && g2.players[1].hand.timber === 1);
}
{
  /* a 7 lands while an offer stands */
  const g = blank(S, 3);
  setHand(g, 0, { wool: 2, ore: 8 });   /* 10 → owes 5 */
  setHand(g, 1, { grain: 2 });
  const id = S.dispatch(g, 0, { t: 'offer', give: { wool: 2 }, get: { grain: 1 } }).evts.find(e => e.e === 'offer').id;
  forceRoll(S, g, 7);
  const frozen = S.dispatch(g, 1, { t: 'accept', id }).why === 'frozen';
  const stands = g.offers.length === 1;
  const d = S.dispatch(g, 0, { t: 'discard', cards: { wool: 2, ore: 3 } });
  T('7 mid-trade: acceptance holds while the 7 resolves', frozen && stands);
  T('7 mid-trade: discarding what was offered withdraws the offer', d.ok && g.offers.length === 0 &&
    d.evts.some(e => e.e === 'offerGone' && e.why === 'afford'));
  const ch = S.robberPick(g, g.robberBy);
  S.dispatch(g, g.robberBy, { t: 'robber', hex: ch.hex, victim: ch.victim });
  T('7 mid-trade: the stale accept bounces as gone', S.dispatch(g, 1, { t: 'accept', id }).why === 'gone' && S.audit(g).length === 0);
}
{
  /* one offer, two acceptances in the same instant */
  const g = blank(S, 4);
  setHand(g, 0, { clay: 1 });
  [1, 2, 3].forEach(s => setHand(g, s, { ore: 1 }));
  const id = S.dispatch(g, 0, { t: 'offer', give: { clay: 1 }, get: { ore: 1 } }).evts.find(e => e.e === 'offer').id;
  const t = g.now + 3;
  const rs = [1, 2, 3].map(s => S.act(g, s, { t: 'accept', id }, t));
  T('double accept: exactly one completes', rs.filter(r => r.ok).length === 1 && rs.filter(r => r.why === 'gone').length === 2);
  T('double accept: every card accounted for', S.audit(g).length === 0 && g.players[0].hand.ore === 1 && g.players[0].hand.clay === 0);
}
{
  /* a tab asleep for ten rolls wakes to one roll, then the normal rhythm */
  const g = blank(S, 2);
  g.nextRollAt = g.now + g.interval;
  const t0 = g.nextRollAt;
  S.act(g, -1, { t: 'clock', now: t0 + 10 * g.interval + 123 }, t0 + 10 * g.interval + 123);
  const one = g.rollN === 1 || (g.lastRoll && g.lastRoll[0] + g.lastRoll[1] === 7);
  const next = g.phase === 'play' ? g.nextRollAt === g.now + g.interval : true;
  T('asleep: waking rolls once, never a burst', g.rollN === 1 && one);
  T('asleep: the next roll is a full interval from waking', next);
  const before = snap(g);
  S.act(g, -1, { t: 'clock', now: g.now - 5000 }, g.now - 5000);
  T('time never runs backward', snap(g) === before);
  /* an absent player mid-7 never stalls the table */
  const g2 = blank(S, 3);
  setHand(g2, 1, { ore: 12 });
  forceRoll(S, g2, 7);
  S.act(g2, -1, { t: 'clock', now: g2.discard.deadline }, g2.discard.deadline);
  S.act(g2, -1, { t: 'clock', now: g2.robberDeadline }, g2.robberDeadline);
  T('absent through a 7: discard and robber resolve on the clock', g2.phase === 'play' && S.handSize(g2.players[1].hand) <= 6);
}
{
  /* the game ends with actions still queued behind the winner */
  const g = blank(S, 3);
  put(S, g, 0, { cities: [0, 10, 20, 30], settles: [40] });
  g.devDeck.push('vp');
  setHand(g, 0, { wool: 1, grain: 1, ore: 1 });
  setHand(g, 1, { wool: 1, grain: 1, ore: 1 });
  const t = g.now + 1;
  const w = S.act(g, 0, { t: 'buyDev' }, t);
  const late = S.act(g, 1, { t: 'buyDev' }, t);
  const tick = S.act(g, -1, { t: 'clock', now: t + 1e6 }, t + 1e6);
  T('ending: the winning action ends it, the queued one bounces', w.ok && g.over && late.why === 'over' && g.players[1].hand.wool === 1);
  T('ending: the clock stops rolling', !tick.evts.some(e => e.e === 'roll'));
}

/* ================= the dice are fair: 2d6 over 36,000 seeded rolls ================= */
{
  const g = blank(S, 2);
  g.nextRollAt = g.now;
  let t = g.now;
  for (let i = 0; i < 36000; i++) {
    S.dispatch(g, -1, { t: 'clock', now: t });
    if (g.phase === 'robber') { t = g.robberDeadline; S.dispatch(g, -1, { t: 'clock', now: t }); }
    t = g.nextRollAt;
  }
  const n = g.rollN;
  let chi = 0, mode = 2;
  for (let s = 2; s <= 12; s++) {
    const e = S.expected(s, n);
    chi += (g.hist[s] - e) * (g.hist[s] - e) / e;
    if (g.hist[s] > g.hist[mode]) mode = s;
  }
  T('2d6: 36,000 rolls fit the triangle (chi² ' + chi.toFixed(1) + ' < 29.6, p > 0.001)', n === 36000 && chi < 29.59);
  T('2d6: 7 is the most common roll', mode === 7);
  T('2d6: never a 1 or a 13', g.hist[0] === 0 && g.hist[1] === 0 && g.hist.length === 13);
  T('expected frequencies are the 2d6 shape', S.expected(7, 36) === 6 && S.expected(2, 36) === 1 && S.expected(12, 36) === 1);
}

/* ================= soak: bots against bots, to the end ================= */
const KINDS = ['builder', 'trader', 'expander'];
function soakGame(seed, n, interval, log) {
  const kinds = Array.from({ length: n }, (_, s) => KINDS[(s + seed) % 3]);
  const g = S.newGame(Array.from({ length: n }, (_, i) => 'Bot' + i), seed, { interval, now: 0 });
  let t = 0, rejected = 0, auditFail = null, actions = 0;
  const nextAt = kinds.map((_, s) => 1500 + s * 600);
  while (!g.over && t < 8 * 3600e3) {
    t += 250;
    const c = S.act(g, -1, { t: 'clock', now: t }, t);
    if (log) log.push({ seat: -1, a: { t: 'clock', now: t } });
    for (let s = 0; s < n && !g.over; s++) {
      if (t < nextAt[s]) continue;
      /* every 2–5 seconds, deterministically jittered */
      nextAt[s] = t + 2000 + ((seed * 131 + s * 977 + actions * 61) % 3000);
      const mv = S.botMove(g, s, kinds[s]);
      if (!mv) continue;
      const r = S.act(g, s, mv, t);
      if (log) log.push({ seat: s, a: mv });
      actions++;
      if (!r.ok) rejected++;
      const bad = S.audit(g);
      if (bad.length && !auditFail) auditFail = bad.join('; ');
    }
  }
  return { g, rejected, auditFail, actions, t, kinds };
}
{
  let finished = 0, rejected = 0, audits = [], maxRolls = 0, total = 0, lens = [];
  const persona = {};
  for (let i = 0; i < 36; i++) {
    const n = 2 + (i % 3), interval = S.INTERVALS[i % 3];
    const r = soakGame(1000 + i, n, interval);
    total++;
    if (r.g.over) { finished++; persona[r.kinds[r.g.winner]] = (persona[r.kinds[r.g.winner]] || 0) + 1; }
    rejected += r.rejected;
    if (r.auditFail) audits.push((1000 + i) + ': ' + r.auditFail);
    maxRolls = Math.max(maxRolls, r.g.rollN);
    lens.push(r.g.rollN);
  }
  lens.sort((a, b) => a - b);
  T('soak: 36/36 bot games at 2, 3 and 4 seats play to a winner (median ' + lens[18] + ' rolls, max ' + maxRolls + ')', finished === total);
  T('soak: no game needs more than 160 rolls — nothing stalls', maxRolls <= 160);
  T('soak: the bots never send an illegal action', rejected === 0, rejected + ' rejected');
  T('soak: the audit holds after every action (cards conserved, distance rule, pieces, roads anchored)', audits.length === 0, audits.slice(0, 3).join(' | '));
  T('soak: every personality wins some', KINDS.every(k => (persona[k] || 0) > 0), JSON.stringify(persona));
}

/* ================= determinism ================= */
{
  const log = [];
  const a = soakGame(4242, 4, 30000, log);
  const b = soakGame(4242, 4, 30000);
  T('determinism: the same seed plays the same game', snap(a.g) === snap(b.g) && a.g.over);
  /* replay the recorded action log into a fresh game */
  const g = S.newGame(['Bot0', 'Bot1', 'Bot2', 'Bot3'], 4242, { interval: 30000, now: 0 });
  let lastNow = 0;
  log.forEach(x => {
    if (x.seat === -1) { lastNow = x.a.now; S.act(g, -1, x.a, lastNow); }
    else S.act(g, x.seat, x.a, lastNow);
  });
  T('determinism: replaying the action log reproduces the state byte for byte', snap(g) === snap(a.g));
  const c = S.newGame(['A', 'B'], 1), d = S.newGame(['A', 'B'], 2);
  T('determinism: different seeds make different islands', JSON.stringify(c.hexes) !== JSON.stringify(d.hexes));
}

/* ================= mutation proofs: the key pins must bite ================= */
function mutant(from, to) {
  if (SRC.split(from).length !== 2) throw new Error('mutation anchor not unique: ' + from);
  const src = SRC.replace(from, to);
  const mod = { exports: {} };
  const sandbox = {};
  new Function('module', 'globalThis', 'window', src)(mod, sandbox, undefined);
  return mod.exports;
}
const MUTATIONS = [
  ['the distance rule: no settlement next to another, ours or anyone’s',
    "for (var i = 0; i < adj.length; i++) if (g.vOwner[adj[i]] !== -1) return false;", ''],
  ['longest road: a tie leaves it with the holder',
    'if (h >= 0 && lens[h] >= LONGEST_MIN && lens[h] >= max) next = h;', 'if (false) next = h;'],
  ['longest road: cut below a rival, the rival takes it',
    "if (len > 0 && g.vOwner[v] !== -1 && g.vOwner[v] !== seat) return;", ''],
  ['longest road: cut below a tie of rivals, nobody holds it',
    'next = top.length === 1 ? top[0] : -1;', 'next = top[0];'],
  ['largest army: three knights claim it, a tie doesn’t move it, more takes it',
    'if (g.army === -1 || k > g.players[g.army].knights) {', 'if (g.army === -1 || k >= g.players[g.army].knights) {'],
  ['the robber blocks its hex',
    'if (h.num !== sum || hi === g.robber) return;', 'if (h.num !== sum) return;'],
  ['a 7 pays nothing; hands above 9 discard half, rounded down; 9 keeps all',
    'if (n > DISCARD_OVER) { need[s] = Math.floor(n / 2); any = true; }', 'if (n >= DISCARD_OVER) { need[s] = Math.ceil(n / 2); any = true; }'],
  ['a dev card can’t be played in the roll-interval it was bought',
    'if (p.dev[i].k === k && p.dev[i].at < g.rollN) return i;', 'if (p.dev[i].k === k) return i;'],
  ['one dev card per roll-interval',
    "if (p.devPlayedAt === g.rollN) return 'once';", ''],
  ['an offer the poster can no longer cover is withdrawn',
    "var why = !canAfford(g.players[o.from].hand, o.give) ? 'afford' : (o.expires <= g.now ? 'expired' : null);",
    "var why = o.expires <= g.now ? 'expired' : null;"],
  ['the last-place player moves the robber',
    'var min = Math.min.apply(null, vps), low = [];', 'var min = Math.max.apply(null, vps), low = [];'],
  ['a bank that can’t pay everyone pays no one; a lone claimant takes what’s left',
    '} else if (seats.length === 1) {', '} else if (seats.length >= 1) {'],
  ['bank 4:1, a 3:1 port, a 2:1 port of its own resource',
    "else if (p.type === res) best = 2;", "else if (p.type === res) best = Math.min(best, 3);"],
  ['piece limits: a 16th road, a 6th settlement, a 5th city are refused',
    "if (p.left.settle <= 0) return 'limit';", ''],
  ['real time starts after the draft: the first roll comes on the clock',
    'g.nextRollAt = g.now + FIRST_ROLL_MS;', 'g.nextRollAt = g.now;'],
  ['building costs exactly its price and a short hand changes nothing',
    "if (!canAfford(p.hand, COST.road)) return 'cost';", ''],
  ['ten points ends it on the spot; nothing moves after',
    "if (g.over) return 'over';", ''],
];
MUTATIONS.forEach(([name, from, to]) => {
  let bit = false, err = null;
  try {
    const M = mutant(from, to);
    let ok;
    try { ok = !!PINS[name](M); } catch (e) { ok = false; }
    bit = !ok;
  } catch (e) { err = e.message; }
  T('mutation bites: ' + name, bit, err);
});
/* and the race pins, against their own mutations */
{
  const M = mutant("if (!spotOpen(g, v)) return 'taken';", "if (g.vOwner[v] !== -1 && false) return 'taken';");
  const g = blank(M, 3);
  const v = M.TOPO.verts.findIndex(x => x.adj.length === 3);
  const [n0, n1] = M.TOPO.verts[v].adj;
  put(M, g, 1, { roads: [edgeOf(M, v, n0)] }); put(M, g, 2, { roads: [edgeOf(M, v, n1)] });
  setHand(g, 1, { timber: 1, clay: 1, wool: 1, grain: 1 }); setHand(g, 2, { timber: 1, clay: 1, wool: 1, grain: 1 });
  M.act(g, 1, { t: 'settle', v }, g.now + 1);
  const b = M.act(g, 2, { t: 'settle', v }, g.now + 1);
  T('mutation bites: two claims on one corner', b.why !== 'taken');
}
{
  const M = mutant("if (ai < 0) return 'gone';", "if (ai < 0) ai = 0;");
  const g = blank(M, 3);
  setHand(g, 0, { clay: 1 }); setHand(g, 1, { ore: 1 }); setHand(g, 2, { ore: 1 });
  const id = M.dispatch(g, 0, { t: 'offer', give: { clay: 1 }, get: { ore: 1 } }).evts.find(e => e.e === 'offer').id;
  M.act(g, 1, { t: 'accept', id }, g.now + 1);
  let second;
  try { second = M.act(g, 2, { t: 'accept', id }, g.now + 1); } catch (e) { second = { ok: false, why: 'threw' }; }
  T('mutation bites: double accept', second.why !== 'gone');
}
{
  const M = mutant('if (g.nextRollAt <= now) g.nextRollAt = now + g.interval;', '');
  const g = blank(M, 2);
  g.nextRollAt = g.now + g.interval;
  const t0 = g.nextRollAt;
  M.act(g, -1, { t: 'clock', now: t0 + 10 * g.interval + 123 }, t0 + 10 * g.interval + 123);
  M.act(g, -1, { t: 'clock', now: g.now + 1 }, g.now + 1);
  T('mutation bites: asleep tab bursts rolls without the catch-up guard', g.rollN > 1 || g.phase !== 'play');
}

console.log(fails === 0 ? 'SETTLERSSIM: ALL PASS' : 'SETTLERSSIM FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
