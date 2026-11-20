/* Settlers — the island, in real time. The engine.

   A resource-and-building game with no turns. A shared pair of dice rolls on
   an authoritative clock; every hex showing the number pays every settlement
   and city touching it, all at once. Between rolls everyone builds and trades
   whenever they like. First to 10 victory points wins.

   One state object. Every change goes through dispatch(g, seat, action), which
   validates first and mutates only on success — a refused action leaves the
   state exactly as it was. Time enters the engine only as an action: the
   authority sends {t:'clock', now} (seat -1), so the same seed plus the same
   action log reproduces the same game, byte for byte. act() is the authority's
   single entry point: advance the clock, then apply the action — callers queue
   actions and feed them through act() one at a time, which is the one ordering
   that makes simultaneous claims impossible to race.

   Pure, seeded, deterministic. No DOM. */
(function (global) {
  'use strict';

  var RULEBOOK = '2026-11-20-settlers-realtime';

  var RES = ['timber', 'clay', 'wool', 'grain', 'ore'];
  var RES_META = {
    timber: { n: 'Timber', terrain: 'forest',    tn: 'Forest' },
    clay:   { n: 'Clay',   terrain: 'hills',     tn: 'Hills' },
    wool:   { n: 'Wool',   terrain: 'pasture',   tn: 'Pasture' },
    grain:  { n: 'Grain',  terrain: 'fields',    tn: 'Fields' },
    ore:    { n: 'Ore',    terrain: 'mountains', tn: 'Mountains' }
  };
  var TERRAIN_COUNT = { timber: 4, clay: 3, wool: 4, grain: 4, ore: 3, desert: 1 };
  var TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  var BANK_EACH = 19;

  var COST = {
    road:   { timber: 1, clay: 1 },
    settle: { timber: 1, clay: 1, wool: 1, grain: 1 },
    city:   { grain: 2, ore: 3 },
    dev:    { wool: 1, grain: 1, ore: 1 }
  };
  var PIECES = { road: 15, settle: 5, city: 4 };

  var DEV_COUNT = { knight: 14, vp: 5, roads: 2, plenty: 2, monopoly: 2 };
  var DEV_META = {
    knight:   { n: 'Knight',         d: 'Move the robber and steal a card.' },
    vp:       { n: 'Victory Point',  d: 'One point, kept secret.' },
    roads:    { n: 'Road Building',  d: 'Place two roads free.' },
    plenty:   { n: 'Year of Plenty', d: 'Take any two from the bank.' },
    monopoly: { n: 'Monopoly',       d: 'Name a resource. Everyone hands theirs over.' }
  };

  var WIN_VP = 10;
  var DISCARD_OVER = 9;          /* hands above this lose half on a 7 */
  var LONGEST_MIN = 5;
  var ARMY_MIN = 3;
  var INTERVALS = [20000, 30000, 60000];   /* the presets */
  var MIN_INTERVAL = 5000, MAX_INTERVAL = 300000;   /* a custom clock: whole seconds, 5s to 5 min */
  var DEFAULT_INTERVAL = 60000;
  var SETUP_MS = 30000;          /* per placement in the draft */
  var FIRST_ROLL_MS = 4000;      /* from the end of the draft to the first roll */
  var DISCARD_MS = 15000;
  var ROBBER_MS = 15000;
  var OFFER_MS = 25000;

  /* ================= the island's shape =================
     Pointy-top hexes, axial (q, r), radius 2 → rows of 3-4-5-4-3. The shape
     never changes between games, so it is computed once; a game stores only
     what sits on it (terrain, numbers, ports). */
  var TOPO = (function () {
    var S3 = Math.sqrt(3);
    var hexes = [], verts = [], edges = [];
    var vkey = {}, ekey = {};
    for (var r = -2; r <= 2; r++) {
      for (var q = -2; q <= 2; q++) {
        if (Math.abs(q + r) > 2) continue;
        hexes.push({ q: q, r: r, x: S3 * (q + r / 2), y: 1.5 * r, corners: [], edges: [], nb: [] });
      }
    }
    function vid(x, y) {
      var k = Math.round(x * 1000) + ',' + Math.round(y * 1000);
      if (vkey[k] == null) { vkey[k] = verts.length; verts.push({ x: x, y: y, hexes: [], adj: [], edges: [] }); }
      return vkey[k];
    }
    hexes.forEach(function (h, hi) {
      for (var i = 0; i < 6; i++) {
        var ang = Math.PI / 180 * (60 * i - 90);
        var v = vid(h.x + Math.cos(ang), h.y + Math.sin(ang));
        h.corners.push(v);
        verts[v].hexes.push(hi);
      }
      for (var j = 0; j < 6; j++) {
        var a = h.corners[j], b = h.corners[(j + 1) % 6];
        var k = Math.min(a, b) + '-' + Math.max(a, b);
        if (ekey[k] == null) {
          ekey[k] = edges.length;
          edges.push({ a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
          verts[a].adj.push(b); verts[b].adj.push(a);
          verts[a].edges.push(ekey[k]); verts[b].edges.push(ekey[k]);
        }
        h.edges.push(ekey[k]);
        edges[ekey[k]].hexes.push(hi);
      }
    });
    hexes.forEach(function (h, hi) {
      hexes.forEach(function (o, oi) {
        if (oi === hi) return;
        var dq = o.q - h.q, dr = o.r - h.r;
        if (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) === 2) h.nb.push(oi);
      });
    });
    /* the coast, walked in order around the island */
    var coast = [];
    edges.forEach(function (e, i) { if (e.hexes.length === 1) coast.push(i); });
    coast.sort(function (i, j) {
      var a = edges[i], b = edges[j];
      var ax = (verts[a.a].x + verts[a.b].x) / 2, ay = (verts[a.a].y + verts[a.b].y) / 2;
      var bx = (verts[b.a].x + verts[b.b].x) / 2, by = (verts[b.a].y + verts[b.b].y) / 2;
      return Math.atan2(ay, ax) - Math.atan2(by, bx);
    });
    return { hexes: hexes, verts: verts, edges: edges, coast: coast };
  })();

  /* ================= seeded randomness, kept in the state ================= */
  function rnd(g) {
    var a = g.rs = (g.rs + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(g, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(g) * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function validInterval(ms) {
    return typeof ms === 'number' && ms % 1000 === 0 && ms >= MIN_INTERVAL && ms <= MAX_INTERVAL;
  }
  function pips(n) { return n ? 6 - Math.abs(7 - n) : 0; }
  function emptyHand() { return { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }; }
  function handSize(h) { return h.timber + h.clay + h.wool + h.grain + h.ore; }

  /* ================= a new island ================= */
  function makeBoard(g) {
    var terr = [];
    Object.keys(TERRAIN_COUNT).forEach(function (k) {
      for (var i = 0; i < TERRAIN_COUNT[k]; i++) terr.push(k);
    });
    shuffle(g, terr);
    var hexes = terr.map(function (t) { return { res: t, num: 0 }; });
    /* numbers: shuffle until no 6 or 8 touches another 6 or 8 */
    for (var tries = 0; tries < 500; tries++) {
      var toks = shuffle(g, TOKENS.slice()), ti = 0;
      hexes.forEach(function (h) { h.num = h.res === 'desert' ? 0 : toks[ti++]; });
      if (redsApart(hexes)) break;
    }
    /* nine ports around the coast, spaced 3-3-4 from a random start */
    var types = shuffle(g, ['any', 'any', 'any', 'any', 'timber', 'clay', 'wool', 'grain', 'ore']);
    var off = Math.floor(rnd(g) * TOPO.coast.length), gaps = [3, 3, 4], at = off, ports = [];
    for (var p = 0; p < 9; p++) {
      ports.push({ edge: TOPO.coast[at % TOPO.coast.length], type: types[p] });
      at += gaps[p % 3];
    }
    return { hexes: hexes, ports: ports };
  }
  function redsApart(hexes) {
    for (var i = 0; i < hexes.length; i++) {
      if (hexes[i].num !== 6 && hexes[i].num !== 8) continue;
      var nb = TOPO.hexes[i].nb;
      for (var j = 0; j < nb.length; j++) {
        var n = hexes[nb[j]].num;
        if (n === 6 || n === 8) return false;
      }
    }
    return true;
  }

  function newGame(names, seed, opts) {
    opts = opts || {};
    var g = {
      rulebook: RULEBOOK,
      seed: seed == null ? 1 : seed,
      rs: (seed == null ? 1 : seed) | 0,
      interval: validInterval(opts.interval) ? opts.interval : DEFAULT_INTERVAL,
      now: opts.now || 0,
      phase: 'setup',
      hexes: null, ports: null, robber: 0,
      vOwner: TOPO.verts.map(function () { return -1; }),
      vCity: TOPO.verts.map(function () { return false; }),
      eOwner: TOPO.edges.map(function () { return -1; }),
      bank: { timber: BANK_EACH, clay: BANK_EACH, wool: BANK_EACH, grain: BANK_EACH, ore: BANK_EACH },
      devDeck: [],
      players: names.map(function (nm) {
        return {
          name: nm, hand: emptyHand(), dev: [], devPlayedAt: -1, knights: 0,
          left: { road: PIECES.road, settle: PIECES.settle, city: PIECES.city },
          roadLen: 0, collected: emptyHand(), offeredAt: -1
        };
      }),
      setup: null, discard: null, robberBy: -1, robberDeadline: 0,
      nextRollAt: 0, rollN: 0, lastRoll: null, hist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      offers: [], offerSeq: 0,
      longest: -1, army: -1,
      over: false, winner: -1, actions: 0
    };
    var b = makeBoard(g);
    g.hexes = b.hexes; g.ports = b.ports;
    g.robber = g.hexes.findIndex(function (h) { return h.res === 'desert'; });
    Object.keys(DEV_COUNT).forEach(function (k) {
      for (var i = 0; i < DEV_COUNT[k]; i++) g.devDeck.push(k);
    });
    shuffle(g, g.devDeck);
    /* the draft: a random first seat, then round and back */
    var n = names.length, first = Math.floor(rnd(g) * n), order = [];
    for (var i = 0; i < n; i++) order.push((first + i) % n);
    g.setup = { order: order.concat(order.slice().reverse()), i: 0, step: 'settle',
      lastSettle: -1, deadline: g.now + SETUP_MS };
    return g;
  }

  /* ================= reading the state ================= */
  function setupSeat(g) { return g.phase === 'setup' ? g.setup.order[g.setup.i] : -1; }

  function portRate(g, seat, res) {
    var best = 4;
    g.ports.forEach(function (p) {
      var e = TOPO.edges[p.edge];
      if (g.vOwner[e.a] !== seat && g.vOwner[e.b] !== seat) return;
      if (p.type === 'any') best = Math.min(best, 3);
      else if (p.type === res) best = 2;
    });
    return best;
  }

  function canAfford(hand, cost) {
    for (var k in cost) if (hand[k] < cost[k]) return false;
    return true;
  }

  function settlesOf(g, seat) {
    var out = [];
    for (var v = 0; v < g.vOwner.length; v++) if (g.vOwner[v] === seat && !g.vCity[v]) out.push(v);
    return out;
  }
  function citiesOf(g, seat) {
    var out = [];
    for (var v = 0; v < g.vOwner.length; v++) if (g.vOwner[v] === seat && g.vCity[v]) out.push(v);
    return out;
  }

  function vpParts(g, seat) {
    var p = g.players[seat];
    return {
      settlements: settlesOf(g, seat).length,
      cities: citiesOf(g, seat).length * 2,
      longest: g.longest === seat ? 2 : 0,
      army: g.army === seat ? 2 : 0,
      cards: p.dev.filter(function (d) { return d.k === 'vp'; }).length
    };
  }
  function vp(g, seat) {
    var v = vpParts(g, seat);
    return v.settlements + v.cities + v.longest + v.army + v.cards;
  }
  /* what everyone else can see: the secret VP cards stay secret */
  function publicVp(g, seat) {
    var v = vpParts(g, seat);
    return v.settlements + v.cities + v.longest + v.army;
  }

  /* distance rule: the corner is free and no neighbour is built on */
  function crowded(g, v) {
    var adj = TOPO.verts[v].adj;
    for (var i = 0; i < adj.length; i++) if (g.vOwner[adj[i]] !== -1) return true;
    return false;
  }
  function spotOpen(g, v) {
    if (g.vOwner[v] !== -1) return false;
    var adj = TOPO.verts[v].adj;
    for (var i = 0; i < adj.length; i++) if (g.vOwner[adj[i]] !== -1) return false;
    return true;
  }
  function touchesOwnRoad(g, seat, v) {
    var es = TOPO.verts[v].edges;
    for (var i = 0; i < es.length; i++) if (g.eOwner[es[i]] === seat) return true;
    return false;
  }
  function settleOk(g, seat, v) {
    if (v == null || v < 0 || v >= TOPO.verts.length) return 'illegal';
    /* 'taken' is someone on this very corner (a race lost); 'close' is the
       distance rule — the toast must say which, or a free-looking corner reads
       as stolen */
    if (g.vOwner[v] !== -1) return 'taken';
    if (crowded(g, v)) return 'close';
    if (g.phase !== 'setup' && !touchesOwnRoad(g, seat, v)) return 'illegal';
    return null;
  }
  /* a road joins the network through an endpoint that is ours, or through a
     free corner where one of our roads already ends — never through a rival's
     settlement */
  function roadOk(g, seat, e) {
    if (e == null || e < 0 || e >= TOPO.edges.length) return 'illegal';
    if (g.eOwner[e] !== -1) return 'taken';
    var ed = TOPO.edges[e];
    if (g.phase === 'setup') {
      return (ed.a === g.setup.lastSettle || ed.b === g.setup.lastSettle) ? null : 'illegal';
    }
    var ends = [ed.a, ed.b];
    for (var i = 0; i < 2; i++) {
      var x = ends[i];
      if (g.vOwner[x] === seat) return null;
      if (g.vOwner[x] !== -1) continue;
      var es = TOPO.verts[x].edges;
      for (var j = 0; j < es.length; j++) if (es[j] !== e && g.eOwner[es[j]] === seat) return null;
    }
    return 'illegal';
  }

  function legalSettles(g, seat) {
    var out = [];
    for (var v = 0; v < TOPO.verts.length; v++) if (!settleOk(g, seat, v)) out.push(v);
    return out;
  }
  function legalRoads(g, seat) {
    var out = [];
    for (var e = 0; e < TOPO.edges.length; e++) if (!roadOk(g, seat, e)) out.push(e);
    return out;
  }
  /* hexes the robber may move to, and who could be robbed there */
  function robberVictims(g, seat, hex) {
    var out = [];
    TOPO.hexes[hex].corners.forEach(function (v) {
      var o = g.vOwner[v];
      if (o >= 0 && o !== seat && out.indexOf(o) < 0 && handSize(g.players[o].hand) > 0) out.push(o);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  /* ================= longest road ================= */
  function roadLength(g, seat) {
    var best = 0, used = {};
    function walk(v, len) {
      if (len > best) best = len;
      if (len > 0 && g.vOwner[v] !== -1 && g.vOwner[v] !== seat) return;   /* a rival's corner breaks the road */
      var es = TOPO.verts[v].edges;
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (g.eOwner[e] !== seat || used[e]) continue;
        used[e] = true;
        var ed = TOPO.edges[e];
        walk(ed.a === v ? ed.b : ed.a, len + 1);
        used[e] = false;
      }
    }
    for (var e = 0; e < TOPO.edges.length; e++) {
      if (g.eOwner[e] !== seat) continue;
      walk(TOPO.edges[e].a, 0);
      walk(TOPO.edges[e].b, 0);
    }
    return best;
  }
  /* the holder keeps it on a tie; a rival takes it only with strictly more;
     if the holder is broken below a tie of rivals, nobody holds it */
  function updateLongest(g, evts) {
    var lens = g.players.map(function (_, s) { return roadLength(g, s); });
    g.players.forEach(function (p, s) { p.roadLen = lens[s]; });
    var h = g.longest, max = Math.max.apply(null, lens), next = -1;
    if (h >= 0 && lens[h] >= LONGEST_MIN && lens[h] >= max) next = h;
    else if (max >= LONGEST_MIN) {
      var top = [];
      lens.forEach(function (l, s) { if (l === max) top.push(s); });
      next = top.length === 1 ? top[0] : -1;
    }
    if (next !== h) { g.longest = next; evts.push({ e: 'longest', seat: next, from: h }); }
  }
  function updateArmy(g, seat, evts) {
    var k = g.players[seat].knights;
    if (k < ARMY_MIN || g.army === seat) return;
    if (g.army === -1 || k > g.players[g.army].knights) {
      var from = g.army;
      g.army = seat;
      evts.push({ e: 'army', seat: seat, from: from });
    }
  }

  /* ================= moving resources ================= */
  function pay(g, p, cost) {
    for (var k in cost) { p.hand[k] -= cost[k]; g.bank[k] += cost[k]; }
  }
  function fromBank(g, p, res, n) {
    var got = Math.min(n, g.bank[res]);
    g.bank[res] -= got; p.hand[res] += got;
    return got;
  }
  function stealOne(g, from, to) {
    var h = g.players[from].hand, n = handSize(h);
    if (!n) return null;
    var pick = Math.floor(rnd(g) * n);
    for (var i = 0; i < RES.length; i++) {
      if (pick < h[RES[i]]) {
        h[RES[i]]--; g.players[to].hand[RES[i]]++;
        return RES[i];
      }
      pick -= h[RES[i]];
    }
    return null;
  }

  /* ================= the dice ================= */
  function roll(g, evts) {
    var d1 = 1 + Math.floor(rnd(g) * 6), d2 = 1 + Math.floor(rnd(g) * 6), sum = d1 + d2;
    g.rollN++;
    g.lastRoll = [d1, d2];
    g.hist[sum]++;
    evts.push({ e: 'roll', d: [d1, d2], sum: sum, n: g.rollN });
    if (sum === 7) { sevenRolled(g, evts); return; }
    /* who is owed what, before anything moves: a resource the bank can't cover
       for everyone goes to nobody, unless only one player is owed it */
    var owed = {}, flows = [];
    g.hexes.forEach(function (h, hi) {
      if (h.num !== sum || hi === g.robber) return;
      TOPO.hexes[hi].corners.forEach(function (v) {
        var o = g.vOwner[v];
        if (o < 0) return;
        var n = g.vCity[v] ? 2 : 1;
        owed[h.res] = owed[h.res] || {};
        owed[h.res][o] = (owed[h.res][o] || 0) + n;
        flows.push({ hex: hi, seat: o, res: h.res, n: n, v: v });
      });
    });
    RES.forEach(function (res) {
      if (!owed[res]) return;
      var seats = Object.keys(owed[res]), total = 0;
      seats.forEach(function (s) { total += owed[res][s]; });
      if (total <= g.bank[res]) {
        flows.forEach(function (f) {
          if (f.res !== res) return;
          fromBank(g, g.players[f.seat], res, f.n);
          g.players[f.seat].collected[res] += f.n;
          evts.push({ e: 'pay', hex: f.hex, seat: f.seat, res: res, n: f.n, v: f.v });
        });
      } else if (seats.length === 1) {
        var s = +seats[0], got = fromBank(g, g.players[s], res, owed[res][s]);
        g.players[s].collected[res] += got;
        if (got) evts.push({ e: 'pay', hex: flows.find(function (f) { return f.res === res; }).hex, seat: s, res: res, n: got, v: -1 });
        evts.push({ e: 'short', res: res });
      } else {
        evts.push({ e: 'short', res: res });
      }
    });
  }

  function sevenRolled(g, evts) {
    var need = {}, any = false;
    g.players.forEach(function (p, s) {
      var n = handSize(p.hand);
      if (n > DISCARD_OVER) { need[s] = Math.floor(n / 2); any = true; }
    });
    if (any) {
      g.phase = 'discard';
      g.discard = { need: need, deadline: g.now + DISCARD_MS };
      evts.push({ e: 'discardStart', need: JSON.parse(JSON.stringify(need)), deadline: g.discard.deadline });
    } else {
      enterRobber(g, evts);
    }
  }
  /* the player in last place moves the robber — fewest points showing, ties
     broken by the dice */
  function enterRobber(g, evts) {
    var vps = g.players.map(function (_, s) { return publicVp(g, s); });
    var min = Math.min.apply(null, vps), low = [];
    vps.forEach(function (v, s) { if (v === min) low.push(s); });
    g.robberBy = low.length === 1 ? low[0] : low[Math.floor(rnd(g) * low.length)];
    g.robberDeadline = g.now + ROBBER_MS;
    g.discard = null;
    g.phase = 'robber';
    evts.push({ e: 'robberStart', seat: g.robberBy, deadline: g.robberDeadline });
  }
  function moveRobber(g, seat, hex, victim, evts, why) {
    var from = g.robber;
    g.robber = hex;
    var stole = victim >= 0 ? stealOne(g, victim, seat) : null;
    evts.push({ e: 'robber', seat: seat, hex: hex, from: from, victim: victim, res: stole, why: why });
  }
  function robberChoiceOk(g, seat, hex, victim) {
    if (hex == null || hex < 0 || hex >= TOPO.hexes.length || hex === g.robber) return false;
    var vs = robberVictims(g, seat, hex);
    if (vs.length) return vs.indexOf(victim) >= 0;
    return victim === -1 || victim == null;
  }

  /* ================= offers ================= */
  function sweepOffers(g, evts) {
    for (var i = g.offers.length - 1; i >= 0; i--) {
      var o = g.offers[i];
      var why = !canAfford(g.players[o.from].hand, o.give) ? 'afford' : (o.expires <= g.now ? 'expired' : null);
      if (why) { g.offers.splice(i, 1); evts.push({ e: 'offerGone', id: o.id, from: o.from, why: why }); }
    }
  }
  function findOffer(g, id) {
    for (var i = 0; i < g.offers.length; i++) if (g.offers[i].id === id) return i;
    return -1;
  }
  function cleanCounts(c) {
    if (!c || typeof c !== 'object') return null;
    var out = {}, n = 0;
    for (var k in c) {
      if (RES.indexOf(k) < 0) return null;
      var v = c[k];
      if (typeof v !== 'number' || v !== Math.floor(v) || v < 0 || v > 19) return null;
      if (v) { out[k] = v; n += v; }
    }
    return n ? out : null;
  }

  /* ================= the clock ================= */
  function clock(g, now, evts) {
    if (typeof now !== 'number' || now < g.now) return;   /* time never runs backward */
    g.now = now;
    if (g.over) return;
    if (g.phase === 'setup') {
      if (now >= g.setup.deadline) {
        var seat = setupSeat(g);
        if (g.setup.step === 'settle') placeSetup(g, seat, { t: 'settle', v: autoSettle(g, seat) }, evts, true);
        if (!g.over && g.phase === 'setup' && g.setup.step === 'road' && setupSeat(g) === seat) {
          placeSetup(g, seat, { t: 'road', e: autoRoad(g, seat) }, evts, true);
        }
      }
    } else if (g.phase === 'discard') {
      if (now >= g.discard.deadline) {
        Object.keys(g.discard.need).forEach(function (s) {
          var cards = autoDiscard(g, +s, g.discard.need[s]);
          doDiscard(g, +s, cards, evts, true);
        });
        if (g.phase === 'discard') enterRobber(g, evts);
      }
    } else if (g.phase === 'robber') {
      if (now >= g.robberDeadline) {
        var ch = robberPick(g, g.robberBy);
        moveRobber(g, g.robberBy, ch.hex, ch.victim, evts, 'auto');
        resumePlay(g, evts);
      }
    } else if (g.phase === 'play') {
      if (now >= g.nextRollAt) {
        roll(g, evts);
        /* one roll per tick, never a burst: a clock that fell behind (a
           sleeping tab, a dropped socket) picks up from now */
        g.nextRollAt += g.interval;
        if (g.nextRollAt <= now) g.nextRollAt = now + g.interval;
      }
    }
    sweepOffers(g, evts);
  }
  function resumePlay(g, evts) {
    g.phase = 'play';
    g.robberBy = -1;
    g.nextRollAt = g.now + g.interval;   /* the clock restarts once the robber has moved */
    evts.push({ e: 'resume', next: g.nextRollAt });
  }

  /* ================= the draft ================= */
  function placeSetup(g, seat, a, evts, auto) {
    var s = g.setup;
    if (a.t === 'settle') {
      if (s.step !== 'settle') return 'phase';
      var why = settleOk(g, seat, a.v);
      if (why) return why;
      g.vOwner[a.v] = seat;
      g.players[seat].left.settle--;
      s.lastSettle = a.v;
      s.step = 'road';
      s.deadline = g.now + SETUP_MS;
      evts.push({ e: 'built', seat: seat, kind: 'settle', v: a.v, auto: !!auto });
      if (s.i >= g.players.length) {
        /* the second settlement pays out its neighbours to start */
        TOPO.verts[a.v].hexes.forEach(function (hi) {
          var r = g.hexes[hi].res;
          if (r === 'desert') return;
          var got = fromBank(g, g.players[seat], r, 1);
          g.players[seat].collected[r] += got;
          if (got) evts.push({ e: 'pay', hex: hi, seat: seat, res: r, n: 1, v: a.v, start: true });
        });
      }
      return null;
    }
    if (a.t === 'road') {
      if (s.step !== 'road') return 'phase';
      var w = roadOk(g, seat, a.e);
      if (w) return w;
      g.eOwner[a.e] = seat;
      g.players[seat].left.road--;
      evts.push({ e: 'built', seat: seat, kind: 'road', edge: a.e, auto: !!auto });
      s.i++;
      s.step = 'settle';
      s.lastSettle = -1;
      s.deadline = g.now + SETUP_MS;
      if (s.i >= s.order.length) {
        g.phase = 'play';
        g.setup = null;
        g.nextRollAt = g.now + FIRST_ROLL_MS;
        updateLongest(g, evts);
        evts.push({ e: 'go', next: g.nextRollAt });
      } else {
        evts.push({ e: 'setupTurn', seat: s.order[s.i] });
      }
      return null;
    }
    return 'phase';
  }

  /* ================= discards ================= */
  function doDiscard(g, seat, cards, evts, auto) {
    if (g.phase !== 'discard' || g.discard.need[seat] == null) return 'phase';
    var c = cleanCounts(cards), n = 0;
    if (!c) return 'illegal';
    for (var k in c) n += c[k];
    if (n !== g.discard.need[seat] || !canAfford(g.players[seat].hand, c)) return 'illegal';
    pay(g, g.players[seat], c);
    delete g.discard.need[seat];
    evts.push({ e: 'discarded', seat: seat, n: n, auto: !!auto });
    if (!Object.keys(g.discard.need).length) enterRobber(g, evts);
    return null;
  }

  /* ================= the dispatcher ================= */
  function dispatch(g, seat, a) {
    var evts = [];
    var why = route(g, seat, a || {}, evts);
    if (!why) {
      if (a && a.t !== 'clock') g.actions++;
      sweepOffers(g, evts);
      checkWin(g, seat, evts);
    }
    return { ok: !why, why: why || null, evts: evts };
  }

  function checkWin(g, actor, evts) {
    if (g.over) return;
    var order = [actor];
    g.players.forEach(function (_, s) { if (s !== actor) order.push(s); });
    for (var i = 0; i < order.length; i++) {
      var s = order[i];
      if (s < 0 || !g.players[s]) continue;
      if (vp(g, s) >= WIN_VP) {
        g.over = true; g.winner = s; g.phase = 'over';
        g.offers = [];
        evts.push({ e: 'win', seat: s, vp: vp(g, s) });
        return;
      }
    }
  }

  function route(g, seat, a, evts) {
    if (a.t === 'clock') {
      if (seat !== -1) return 'notyours';
      if (typeof a.now !== 'number' || a.now < g.now) return 'time';
      clock(g, a.now, evts);
      return null;
    }
    if (g.over) return 'over';
    var p = g.players[seat];
    if (!p) return 'notyours';

    if (g.phase === 'setup') {
      if (a.t !== 'settle' && a.t !== 'road') return 'phase';
      if (setupSeat(g) !== seat) return 'turn';
      return placeSetup(g, seat, a, evts, false);
    }
    if (a.t === 'discard') return doDiscard(g, seat, a.cards, evts, false);
    if (a.t === 'robber') {
      if (g.phase !== 'robber' || g.robberBy !== seat) return 'phase';
      if (!robberChoiceOk(g, seat, a.hex, a.victim)) return 'illegal';
      moveRobber(g, seat, a.hex, a.victim == null ? -1 : a.victim, evts, 'seven');
      resumePlay(g, evts);
      return null;
    }
    if (g.phase !== 'play') return 'frozen';   /* the table holds while a 7 resolves */

    switch (a.t) {
      case 'road': {
        if (p.left.road <= 0) return 'limit';
        var wr = roadOk(g, seat, a.e);
        if (wr) return wr;
        if (!canAfford(p.hand, COST.road)) return 'cost';
        pay(g, p, COST.road);
        g.eOwner[a.e] = seat; p.left.road--;
        evts.push({ e: 'built', seat: seat, kind: 'road', edge: a.e });
        updateLongest(g, evts);
        return null;
      }
      case 'settle': {
        if (p.left.settle <= 0) return 'limit';
        var ws = settleOk(g, seat, a.v);
        if (ws) return ws;
        if (!canAfford(p.hand, COST.settle)) return 'cost';
        pay(g, p, COST.settle);
        g.vOwner[a.v] = seat; p.left.settle--;
        evts.push({ e: 'built', seat: seat, kind: 'settle', v: a.v });
        updateLongest(g, evts);             /* a new corner can cut a rival's road */
        return null;
      }
      case 'city': {
        if (a.v == null || g.vOwner[a.v] !== seat || g.vCity[a.v]) return 'illegal';
        if (p.left.city <= 0) return 'limit';
        if (!canAfford(p.hand, COST.city)) return 'cost';
        pay(g, p, COST.city);
        g.vCity[a.v] = true; p.left.city--; p.left.settle++;
        evts.push({ e: 'built', seat: seat, kind: 'city', v: a.v });
        return null;
      }
      case 'buyDev': {
        if (!g.devDeck.length) return 'empty';
        if (!canAfford(p.hand, COST.dev)) return 'cost';
        pay(g, p, COST.dev);
        var k = g.devDeck.pop();
        p.dev.push({ k: k, at: g.rollN });
        evts.push({ e: 'buyDev', seat: seat, k: k, left: g.devDeck.length });
        return null;
      }
      case 'dev': return playDev(g, seat, a, evts);
      case 'bank': {
        if (RES.indexOf(a.give) < 0 || RES.indexOf(a.get) < 0 || a.give === a.get) return 'illegal';
        var rate = portRate(g, seat, a.give);
        if (p.hand[a.give] < rate) return 'cost';
        if (g.bank[a.get] < 1) return 'empty';
        p.hand[a.give] -= rate; g.bank[a.give] += rate;
        g.bank[a.get]--; p.hand[a.get]++;
        evts.push({ e: 'bank', seat: seat, give: a.give, get: a.get, rate: rate });
        return null;
      }
      case 'offer': {
        var give = cleanCounts(a.give), get = cleanCounts(a.get);
        if (!give || !get) return 'illegal';
        for (var r in give) if (get[r]) return 'illegal';
        if (!canAfford(p.hand, give)) return 'cost';
        for (var i = g.offers.length - 1; i >= 0; i--) {
          if (g.offers[i].from === seat) {
            evts.push({ e: 'offerGone', id: g.offers[i].id, from: seat, why: 'replaced' });
            g.offers.splice(i, 1);
          }
        }
        p.offeredAt = g.rollN;
        var o = { id: ++g.offerSeq, from: seat, give: give, get: get, at: g.now, expires: g.now + OFFER_MS, declined: {} };
        g.offers.push(o);
        evts.push({ e: 'offer', id: o.id, from: seat, give: give, get: get, expires: o.expires });
        return null;
      }
      case 'cancel': {
        var ci = findOffer(g, a.id);
        if (ci < 0) return 'gone';
        if (g.offers[ci].from !== seat) return 'notyours';
        g.offers.splice(ci, 1);
        evts.push({ e: 'offerGone', id: a.id, from: seat, why: 'cancel' });
        return null;
      }
      case 'accept': {
        var ai = findOffer(g, a.id);
        if (ai < 0) return 'gone';
        var off = g.offers[ai];
        if (off.from === seat) return 'notyours';
        var poster = g.players[off.from];
        if (!canAfford(poster.hand, off.give)) {
          g.offers.splice(ai, 1);
          evts.push({ e: 'offerGone', id: off.id, from: off.from, why: 'afford' });
          return 'gone';
        }
        if (!canAfford(p.hand, off.get)) return 'cost';
        /* one atomic swap */
        for (var gk in off.give) { poster.hand[gk] -= off.give[gk]; p.hand[gk] += off.give[gk]; }
        for (var wk in off.get) { p.hand[wk] -= off.get[wk]; poster.hand[wk] += off.get[wk]; }
        g.offers.splice(ai, 1);
        evts.push({ e: 'trade', id: off.id, from: off.from, by: seat, give: off.give, get: off.get });
        return null;
      }
      case 'decline': {
        var di = findOffer(g, a.id);
        if (di < 0) return 'gone';
        var od = g.offers[di];
        if (od.from === seat) return 'notyours';
        od.declined[seat] = true;
        evts.push({ e: 'declined', id: od.id, seat: seat });
        if (Object.keys(od.declined).length >= g.players.length - 1) {
          g.offers.splice(di, 1);
          evts.push({ e: 'offerGone', id: od.id, from: od.from, why: 'declined' });
        }
        return null;
      }
    }
    return 'illegal';
  }

  function playableDev(g, seat, k) {
    var p = g.players[seat];
    if (p.devPlayedAt === g.rollN) return -1;
    for (var i = 0; i < p.dev.length; i++) if (p.dev[i].k === k && p.dev[i].at < g.rollN) return i;
    return -1;
  }

  function playDev(g, seat, a, evts) {
    var p = g.players[seat];
    if (a.k === 'vp' || !DEV_META[a.k]) return 'illegal';
    var hasAny = p.dev.some(function (d) { return d.k === a.k; });
    if (!hasAny) return 'illegal';
    if (p.devPlayedAt === g.rollN) return 'once';
    var idx = playableDev(g, seat, a.k);
    if (idx < 0) return 'early';
    if (a.k === 'knight') {
      var victim = a.victim == null ? -1 : a.victim;
      if (!robberChoiceOk(g, seat, a.hex, victim)) return 'illegal';
      spendDev(p, idx, g);
      p.knights++;
      evts.push({ e: 'dev', seat: seat, k: 'knight' });
      moveRobber(g, seat, a.hex, victim, evts, 'knight');
      updateArmy(g, seat, evts);
      return null;
    }
    if (a.k === 'roads') {
      var edges = Array.isArray(a.edges) ? a.edges.slice(0, 2) : [];
      if (!edges.length) return 'illegal';
      /* trial on a copy of the road layer: both must be legal in order */
      var saved = g.eOwner.slice(), placed = 0, bad = null;
      for (var i = 0; i < edges.length; i++) {
        if (p.left.road - placed <= 0) { bad = 'limit'; break; }
        var w = roadOk(g, seat, edges[i]);
        if (w) { bad = w; break; }
        g.eOwner[edges[i]] = seat; placed++;
      }
      if (!bad && placed === 1) {
        /* one edge is enough only when a second couldn't go anywhere */
        if (p.left.road - 1 > 0 && legalRoads(g, seat).length) bad = 'illegal';
      }
      if (bad) { g.eOwner = saved; return bad; }
      p.left.road -= placed;
      spendDev(p, idx, g);
      evts.push({ e: 'dev', seat: seat, k: 'roads' });
      edges.slice(0, placed).forEach(function (e) { evts.push({ e: 'built', seat: seat, kind: 'road', edge: e, free: true }); });
      updateLongest(g, evts);
      return null;
    }
    if (a.k === 'plenty') {
      var rs = Array.isArray(a.res) ? a.res : [];
      if (rs.length !== 2 || rs.some(function (r) { return RES.indexOf(r) < 0; })) return 'illegal';
      var want = {};
      rs.forEach(function (r) { want[r] = (want[r] || 0) + 1; });
      for (var r in want) if (g.bank[r] < want[r]) return 'empty';
      spendDev(p, idx, g);
      rs.forEach(function (r) { g.bank[r]--; p.hand[r]++; });
      evts.push({ e: 'dev', seat: seat, k: 'plenty', res: rs.slice() });
      return null;
    }
    if (a.k === 'monopoly') {
      if (RES.indexOf(a.res) < 0) return 'illegal';
      spendDev(p, idx, g);
      var took = 0;
      g.players.forEach(function (o, s) {
        if (s === seat) return;
        took += o.hand[a.res];
        p.hand[a.res] += o.hand[a.res];
        o.hand[a.res] = 0;
      });
      evts.push({ e: 'dev', seat: seat, k: 'monopoly', res: a.res, n: took });
      return null;
    }
    return 'illegal';
  }
  function spendDev(p, idx, g) {
    p.dev.splice(idx, 1);
    p.devPlayedAt = g.rollN;
  }

  /* the authority's one door: bring the clock up to now, then the action */
  function act(g, seat, a, now) {
    var pre = dispatch(g, -1, { t: 'clock', now: now });
    if (seat === -1 && a && a.t === 'clock') return pre;
    var r = dispatch(g, seat, a);
    r.evts = pre.evts.concat(r.evts);
    return r;
  }

  /* ================= placement sense, shared by bots and timeouts ================= */
  var PERSONAS = {
    builder:  { n: 'Builder',  w: { timber: 0.8, clay: 0.8, wool: 0.9, grain: 1.3, ore: 1.4 }, port: 0.5, city: 1.6, settle: 1.0, road: 0.6, dev: 1.2, trade: 0.5 },
    trader:   { n: 'Trader',   w: { timber: 1, clay: 1, wool: 1, grain: 1, ore: 1 },             port: 1.6, city: 1.1, settle: 1.1, road: 0.8, dev: 0.9, trade: 1.6 },
    expander: { n: 'Expander', w: { timber: 1.1, clay: 1.1, wool: 1.0, grain: 1.1, ore: 1.0 },   port: 0.9, city: 1.3, settle: 1.7, road: 1.2, dev: 1.0, trade: 0.8 }
  };
  function persona(k) { return PERSONAS[k] || PERSONAS.trader; }

  /* what a corner is worth to this seat: pip-weighted production, a bonus for
     resources it lacks, and the port it opens */
  function spotValue(g, seat, v, per) {
    per = per || PERSONAS.trader;
    var have = {}, score = 0;
    for (var u = 0; u < g.vOwner.length; u++) {
      if (g.vOwner[u] !== seat) continue;
      TOPO.verts[u].hexes.forEach(function (hi) { var r = g.hexes[hi].res; if (r !== 'desert') have[r] = (have[r] || 0) + pips(g.hexes[hi].num); });
    }
    TOPO.verts[v].hexes.forEach(function (hi) {
      var h = g.hexes[hi];
      if (h.res === 'desert') return;
      var pp = pips(h.num) * per.w[h.res];
      if (hi === g.robber) pp *= 0.5;
      score += pp + (have[h.res] ? 0 : 1.2);
    });
    g.ports.forEach(function (pt) {
      var e = TOPO.edges[pt.edge];
      if (e.a !== v && e.b !== v) return;
      if (pt.type === 'any') score += 1.2 * per.port;
      else score += ((have[pt.type] || 0) >= 5 ? 3 : 0.8) * per.port;
    });
    return score;
  }
  function bestOf(list, score) {
    var best = list[0], bs = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var s = score(list[i]);
      if (s > bs) { bs = s; best = list[i]; }
    }
    return best;
  }
  function autoSettle(g, seat, per) {
    return bestOf(legalSettles(g, seat), function (v) { return spotValue(g, seat, v, per) - v * 1e-6; });
  }
  /* point the setup road at the best spot two steps away */
  function autoRoad(g, seat, per) {
    var roads = legalRoads(g, seat);
    return bestOf(roads, function (e) {
      var ed = TOPO.edges[e], far = ed.a === g.setup.lastSettle ? ed.b : ed.a, best = 0;
      TOPO.verts[far].adj.forEach(function (w) {
        if (spotOpen(g, w) && w !== g.setup.lastSettle) best = Math.max(best, spotValue(g, seat, w, per));
      });
      return best - e * 1e-6;
    });
  }
  /* keep what the next build needs, shed the rest */
  function autoDiscard(g, seat, n, per) {
    var h = {}, out = {};
    RES.forEach(function (r) { h[r] = g.players[seat].hand[r]; });
    var keep = goalCost(g, seat, per);
    for (var i = 0; i < n; i++) {
      var pick = null, ps = -Infinity;
      RES.forEach(function (r) {
        if (!h[r]) return;
        var s = h[r] - (keep[r] || 0) * 1.5 + RES.indexOf(r) * 1e-3;
        if (s > ps) { ps = s; pick = r; }
      });
      h[pick]--; out[pick] = (out[pick] || 0) + 1;
    }
    return out;
  }
  /* the robber goes where it hurts the leader most and never on us */
  function robberPick(g, seat) {
    var best = { hex: -1, victim: -1 }, bs = -Infinity;
    for (var hi = 0; hi < TOPO.hexes.length; hi++) {
      if (hi === g.robber) continue;
      var s = 0, mine = false;
      TOPO.hexes[hi].corners.forEach(function (v) {
        var o = g.vOwner[v];
        if (o < 0) return;
        if (o === seat) { mine = true; return; }
        s += pips(g.hexes[hi].num) * (g.vCity[v] ? 2 : 1) * (1 + publicVp(g, o) / 4);
      });
      if (mine) s -= 50;
      if (g.hexes[hi].res === 'desert') s -= 1;
      s -= hi * 1e-6;
      if (s > bs) { bs = s; best.hex = hi; }
    }
    var vs = robberVictims(g, seat, best.hex);
    best.victim = vs.length ? bestOf(vs, function (o) { return publicVp(g, o) * 10 + handSize(g.players[o].hand); }) : -1;
    return best;
  }

  /* ================= the bots =================
     Three personalities over one brain. Each call returns the single action
     the bot would take now, or null to keep saving. The brain reads only what
     a player at the table could see — its own hand, the board, counts — and is
     deterministic, so a soak is reproducible from its seed. */
  function goalPlan(g, seat, per) {
    per = per || PERSONAS.trader;
    var p = g.players[seat], plans = [];
    var settles = settlesOf(g, seat);
    if (settles.length && p.left.city > 0) {
      var cv = bestOf(settles, function (v) { return spotValue(g, seat, v, per); });
      plans.push({ kind: 'city', v: cv, cost: COST.city, w: per.city * (2 + spotValue(g, seat, cv, per) / 6) });
    }
    if (p.left.settle > 0) {
      var open = legalSettles(g, seat);
      if (open.length) {
        var sv = bestOf(open, function (v) { return spotValue(g, seat, v, per); });
        plans.push({ kind: 'settle', v: sv, cost: COST.settle, w: per.settle * (2.2 + spotValue(g, seat, sv, per) / 6) });
      } else if (p.left.road > 0) {
        var path = roadToward(g, seat, per);
        if (path) plans.push({ kind: 'road', e: path.e, cost: COST.road, w: per.road * (1.4 + path.val / 8) / path.d });
      }
    }
    if (p.left.road > 0 && g.longest !== seat) {
      var lead = 0;
      g.players.forEach(function (o, s) { if (s !== seat) lead = Math.max(lead, o.roadLen); });
      if (p.roadLen >= 3 && p.roadLen + 2 >= Math.max(LONGEST_MIN, lead)) {
        var ext = extendRoad(g, seat);
        if (ext >= 0) plans.push({ kind: 'road', e: ext, cost: COST.road, w: per.road * 1.5 });
      }
    }
    if (g.devDeck.length) plans.push({ kind: 'dev', cost: COST.dev, w: per.dev * 1.3 });
    plans.forEach(function (pl) {
      var short = 0;
      for (var k in pl.cost) short += Math.max(0, pl.cost[k] - p.hand[k]);
      pl.short = short;
      pl.score = pl.w - short * 0.55;
    });
    plans.sort(function (a, b) { return b.score - a.score; });
    return plans;
  }
  function goalCost(g, seat, per) {
    var plans = goalPlan(g, seat, per);
    return plans.length ? plans[0].cost : {};
  }
  /* BFS outward over free edges to the best settlement spot within 3 roads */
  function roadToward(g, seat, per) {
    var start = legalRoads(g, seat), best = null;
    var seen = {};
    var queue = start.map(function (e) { return { e: e, first: e, d: 1 }; });
    while (queue.length) {
      var it = queue.shift();
      if (seen[it.e]) continue;
      seen[it.e] = true;
      var ed = TOPO.edges[it.e];
      [ed.a, ed.b].forEach(function (x) {
        if (g.vOwner[x] !== -1 && g.vOwner[x] !== seat) return;
        if (spotOpen(g, x)) {
          var val = spotValue(g, seat, x, per);
          var sc = val / it.d;
          if (!best || sc > best.sc) best = { e: it.first, d: it.d, val: val, sc: sc };
        }
        if (it.d < 3 && g.vOwner[x] === -1) {
          TOPO.verts[x].edges.forEach(function (e2) {
            if (!seen[e2] && g.eOwner[e2] === -1) queue.push({ e: e2, first: it.first, d: it.d + 1 });
          });
        }
      });
    }
    return best;
  }
  function extendRoad(g, seat) {
    var roads = legalRoads(g, seat), cur = g.players[seat].roadLen, best = -1, bl = cur;
    for (var i = 0; i < roads.length; i++) {
      g.eOwner[roads[i]] = seat;
      var l = roadLength(g, seat);
      g.eOwner[roads[i]] = -1;
      if (l > bl) { bl = l; best = roads[i]; }
    }
    return best;
  }

  function botMove(g, seat, kind) {
    if (g.over) return null;
    var per = persona(kind), p = g.players[seat];
    if (g.phase === 'setup') {
      if (setupSeat(g) !== seat) return null;
      return g.setup.step === 'settle' ? { t: 'settle', v: autoSettle(g, seat, per) } : { t: 'road', e: autoRoad(g, seat, per) };
    }
    if (g.phase === 'discard') {
      var need = g.discard.need[seat];
      return need ? { t: 'discard', cards: autoDiscard(g, seat, need, per) } : null;
    }
    if (g.phase === 'robber') {
      if (g.robberBy !== seat) return null;
      var ch = robberPick(g, seat);
      return { t: 'robber', hex: ch.hex, victim: ch.victim };
    }
    if (g.phase !== 'play') return null;

    var plans = goalPlan(g, seat, per);
    var goal = plans[0];

    /* answer the table's offers first */
    for (var i = 0; i < g.offers.length; i++) {
      var o = g.offers[i];
      if (o.from === seat || o.declined[seat]) continue;
      return { t: wantsOffer(g, seat, o, goal, per) ? 'accept' : 'decline', id: o.id };
    }

    /* dev cards, played with intent */
    var dv = devPlay(g, seat, per, goal);
    if (dv) return dv;

    /* build whatever the plan says when we can pay for it; otherwise anything
       good we can already afford, cheapest regret first */
    for (var j = 0; j < plans.length; j++) {
      var pl = plans[j];
      if (pl.short) continue;
      if (j > 0 && plans[0].short <= 1 && !overLimit(p)) break;   /* one short of the goal: keep saving */
      return planAction(pl);
    }

    /* a port or the bank closes a one-card gap */
    if (goal && goal.short > 0 && goal.short <= 2) {
      var bt = bankTrade(g, seat, goal.cost);
      if (bt) return bt;
      /* or the table */
      var mine = g.offers.some(function (x) { return x.from === seat; });
      /* one offer per roll interval, so the table isn't a wall of toasts */
      if (!mine && p.offeredAt < g.rollN && goal.short === 1 && trickle(g, seat, per)) {
        var off = makeOffer(g, seat, goal.cost);
        if (off) return off;
      }
    }
    /* sitting on too many cards in front of a 7 is a gift to the table */
    if (overLimit(p)) {
      if (canAfford(p.hand, COST.dev) && g.devDeck.length) return { t: 'buyDev' };
      var any = bankTrade(g, seat, goal ? goal.cost : {}, true);
      if (any) return any;
    }
    return null;
  }
  function overLimit(p) { return handSize(p.hand) > DISCARD_OVER - 1; }
  /* the bots don't all spam the table: Traders offer every think, others now and then */
  function trickle(g, seat, per) {
    if (per.trade >= 1.5) return true;
    return ((g.actions + seat * 7 + g.rollN * 3) % 4) === 0;
  }
  function planAction(pl) {
    if (pl.kind === 'city') return { t: 'city', v: pl.v };
    if (pl.kind === 'settle') return { t: 'settle', v: pl.v };
    if (pl.kind === 'road') return { t: 'road', e: pl.e };
    return { t: 'buyDev' };
  }
  function surplus(g, seat, cost) {
    var h = g.players[seat].hand, out = {};
    RES.forEach(function (r) { out[r] = h[r] - (cost[r] || 0); });
    return out;
  }
  function bankTrade(g, seat, cost, anyway) {
    var h = g.players[seat].hand, sp = surplus(g, seat, cost);
    var missing = RES.filter(function (r) { return (cost[r] || 0) > h[r] && g.bank[r] > 0; });
    if (!missing.length && anyway) {
      missing = RES.filter(function (r) { return g.bank[r] > 0; }).sort(function (a, b) { return h[a] - h[b]; }).slice(0, 1);
    }
    if (!missing.length) return null;
    var best = null;
    RES.forEach(function (r) {
      if (missing.indexOf(r) >= 0 && !anyway) return;
      var rate = portRate(g, seat, r);
      if (sp[r] >= rate && r !== missing[0] && (!best || sp[r] - rate > best.left)) best = { give: r, left: sp[r] - rate };
    });
    return best ? { t: 'bank', give: best.give, get: missing[0] } : null;
  }
  function makeOffer(g, seat, cost) {
    var h = g.players[seat].hand, sp = surplus(g, seat, cost);
    var want = RES.filter(function (r) { return (cost[r] || 0) > h[r]; })[0];
    if (!want) return null;
    var give = null, most = 0;
    RES.forEach(function (r) { if (r !== want && sp[r] > most) { most = sp[r]; give = r; } });
    if (!give) return null;
    var gv = {}; gv[give] = most >= 3 ? 2 : 1;
    var gt = {}; gt[want] = 1;
    return { t: 'offer', give: gv, get: gt };
  }
  /* take a trade that closes a gap in the goal and only costs surplus;
     Traders also take any trade that comes out ahead on count */
  function wantsOffer(g, seat, o, goal, per) {
    var h = g.players[seat].hand;
    if (!canAfford(h, o.get)) return false;
    var cost = goal ? goal.cost : {};
    var before = 0, after = 0;
    RES.forEach(function (r) {
      var c = cost[r] || 0;
      var nh = h[r] - (o.get[r] || 0) + (o.give[r] || 0);
      before += Math.max(0, c - h[r]);
      after += Math.max(0, c - nh);
    });
    var gotN = 0, gaveN = 0;
    for (var a in o.give) gotN += o.give[a];
    for (var b in o.get) gaveN += o.get[b];
    /* never feed the leader a winning card */
    if (publicVp(g, o.from) >= WIN_VP - 2 && publicVp(g, o.from) > publicVp(g, seat)) return false;
    if (after < before) return true;
    if (per.trade >= 1.5 && after === before && gotN > gaveN) return true;
    return false;
  }
  function devPlay(g, seat, per, goal) {
    var p = g.players[seat];
    if (p.devPlayedAt === g.rollN) return null;
    /* a knight when the robber sits on us, or to take or hold the army */
    if (playableDev(g, seat, 'knight') >= 0) {
      var onUs = TOPO.hexes[g.robber].corners.some(function (v) { return g.vOwner[v] === seat; });
      var armyRace = p.knights + 1 >= ARMY_MIN && (g.army === -1 || (g.army !== seat && p.knights + 1 > g.players[g.army].knights));
      if (onUs || armyRace) {
        var ch = robberPick(g, seat);
        if (ch.hex >= 0) return { t: 'dev', k: 'knight', hex: ch.hex, victim: ch.victim };
      }
    }
    if (playableDev(g, seat, 'roads') >= 0 && p.left.road >= 1) {
      var e1 = roadToward(g, seat, per);
      if (e1) {
        g.eOwner[e1.e] = seat;
        var e2 = p.left.road >= 2 ? roadToward(g, seat, per) : null;
        var e2b = e2 ? e2.e : (p.left.road >= 2 ? (legalRoads(g, seat)[0]) : undefined);
        g.eOwner[e1.e] = -1;
        var edges = e2b != null ? [e1.e, e2b] : [e1.e];
        return { t: 'dev', k: 'roads', edges: edges };
      }
    }
    if (goal && goal.short >= 1 && goal.short <= 2 && playableDev(g, seat, 'plenty') >= 0) {
      var need = [];
      RES.forEach(function (r) { for (var i = p.hand[r]; i < (goal.cost[r] || 0); i++) need.push(r); });
      while (need.length < 2) need.push(need[0] || 'ore');
      need = need.slice(0, 2);
      var ok = true, cnt = {};
      need.forEach(function (r) { cnt[r] = (cnt[r] || 0) + 1; if (g.bank[r] < cnt[r]) ok = false; });
      if (ok) return { t: 'dev', k: 'plenty', res: need };
    }
    if (goal && goal.short >= 1 && playableDev(g, seat, 'monopoly') >= 0) {
      var others = 0;
      g.players.forEach(function (o, s) { if (s !== seat) others += handSize(o.hand); });
      if (others >= 3 * (g.players.length - 1)) {
        var want = RES.filter(function (r) { return (goal.cost[r] || 0) > p.hand[r]; })[0];
        if (want) return { t: 'dev', k: 'monopoly', res: want };
      }
    }
    return null;
  }

  /* ================= invariants, for the gate and for paranoia ================= */
  function audit(g) {
    var bad = [];
    RES.forEach(function (r) {
      var n = g.bank[r];
      g.players.forEach(function (p) { n += p.hand[r]; if (p.hand[r] < 0) bad.push('negative ' + r); });
      if (g.bank[r] < 0) bad.push('bank negative ' + r);
      if (n !== BANK_EACH) bad.push(r + ' conserved ' + n);
    });
    for (var v = 0; v < TOPO.verts.length; v++) {
      if (g.vOwner[v] < 0) continue;
      TOPO.verts[v].adj.forEach(function (u) { if (g.vOwner[u] >= 0) bad.push('distance ' + v + '/' + u); });
    }
    g.players.forEach(function (p, s) {
      var roads = g.eOwner.filter(function (o) { return o === s; }).length;
      var st = settlesOf(g, s).length, ct = citiesOf(g, s).length;
      if (roads + p.left.road !== PIECES.road) bad.push('roads ' + s);
      if (st + p.left.settle + ct !== PIECES.settle + ct) bad.push('settles ' + s);
      if (ct + p.left.city !== PIECES.city) bad.push('cities ' + s);
      if (p.left.road < 0 || p.left.settle < 0 || p.left.city < 0) bad.push('pieces ' + s);
      /* every road reaches one of our corners through our own network */
      for (var e = 0; e < TOPO.edges.length; e++) {
        if (g.eOwner[e] !== s) continue;
        if (!roadAnchored(g, s, e)) bad.push('floating road ' + e);
      }
    });
    var devs = g.devDeck.length;
    g.players.forEach(function (p) { devs += p.dev.length + p.knights; });
    if (devs > 25) bad.push('dev cards ' + devs);
    if (g.robber < 0 || g.robber >= TOPO.hexes.length) bad.push('robber');
    if (g.over && vp(g, g.winner) < WIN_VP) bad.push('winner short');
    return bad;
  }
  function roadAnchored(g, s, e0) {
    var seen = {}, stack = [e0];
    while (stack.length) {
      var e = stack.pop();
      if (seen[e]) continue;
      seen[e] = true;
      var ed = TOPO.edges[e], ends = [ed.a, ed.b];
      for (var i = 0; i < 2; i++) {
        var x = ends[i];
        if (g.vOwner[x] === s) return true;
        TOPO.verts[x].edges.forEach(function (n) { if (g.eOwner[n] === s && !seen[n]) stack.push(n); });
      }
    }
    return false;
  }

  /* the 2d6 shape, for the victory screen's histogram */
  function expected(sum, rolls) { return rolls * (6 - Math.abs(7 - sum)) / 36; }

  var api = {
    RULEBOOK: RULEBOOK, RES: RES, RES_META: RES_META, COST: COST, PIECES: PIECES,
    DEV_COUNT: DEV_COUNT, DEV_META: DEV_META, WIN_VP: WIN_VP, DISCARD_OVER: DISCARD_OVER,
    INTERVALS: INTERVALS, DEFAULT_INTERVAL: DEFAULT_INTERVAL, MIN_INTERVAL: MIN_INTERVAL, MAX_INTERVAL: MAX_INTERVAL, validInterval: validInterval, SETUP_MS: SETUP_MS,
    FIRST_ROLL_MS: FIRST_ROLL_MS, DISCARD_MS: DISCARD_MS, ROBBER_MS: ROBBER_MS, OFFER_MS: OFFER_MS,
    LONGEST_MIN: LONGEST_MIN, ARMY_MIN: ARMY_MIN, TERRAIN_COUNT: TERRAIN_COUNT, TOKENS: TOKENS,
    TOPO: TOPO, PERSONAS: PERSONAS,
    newGame: newGame, dispatch: dispatch, act: act,
    setupSeat: setupSeat, portRate: portRate, canAfford: canAfford, handSize: handSize,
    vp: vp, vpParts: vpParts, publicVp: publicVp, pips: pips,
    legalSettles: legalSettles, legalRoads: legalRoads, settleOk: settleOk, roadOk: roadOk,
    robberVictims: robberVictims, roadLength: roadLength, playableDev: playableDev,
    settlesOf: settlesOf, citiesOf: citiesOf, spotValue: spotValue,
    botMove: botMove, goalPlan: goalPlan, robberPick: robberPick, autoDiscard: autoDiscard,
    audit: audit, expected: expected, redsApart: redsApart
  };
  global.Settlers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
