/* Headlands — rival towns on the coast. The engine.

   A faithful mechanical twin of the modern travel-sized Catan card duel,
   wearing entirely our own skin: original names, original text, house theme.
   No dice — the coast provides by the card. Build Tracks to trade cheap,
   Shacks to score and stir up Headlines, Towns to harvest harder, Resorts to
   finish it. First to 7 points showing wins, immediately, on their turn.

   House v1 pragmatics (noted in the changelog):
   - Raider discards and Whip-Round gifts are chosen by the seeded rng, not
     the player. Counts are faithful; the agency comes later.
   - Substitution picks the most abundant spare type unless the intent names
     one.

   Pure, seeded, deterministic. No DOM. */
(function (global) {
  'use strict';

  var RULEBOOK = '2026-11-20-headlands-house';

  /* ---- the five goods of the coast ---- */
  var GOODS = ['clay', 'timber', 'wool', 'cane', 'stone'];
  var GOOD_META = {
    clay:   { n: 'Clay',   count: 11, hex: '#C96F4A' },
    timber: { n: 'Timber', count: 11, hex: '#6B8F4E' },
    wool:   { n: 'Wool',   count: 14, hex: '#E8E2D0' },
    cane:   { n: 'Cane',   count: 12, hex: '#E8C57A' },
    stone:  { n: 'Stone',  count: 13, hex: '#8B95A3' }
  };

  /* ---- what you can build ---- */
  var BUILDS = {
    track:  { n: 'Track',  count: 10, cost: { clay: 1, timber: 1 },
      d: 'Every Track sharpens your swap rate: 4, 3, 2, then 1 for 1.' },
    shack:  { n: 'Shack',  count: 11, cost: { clay: 1, timber: 1, wool: 1, cane: 1 },
      d: '1 point. Raising one makes a Headline.' },
    town:   { n: 'Town',   count: 5,  cost: { cane: 2, stone: 3 },
      d: '2 points, built over a Shack. Harvests one extra card.' },
    ranger: { n: 'Ranger', count: 8,  cost: { wool: 1, cane: 1, stone: 1 },
      d: 'Keeps one more card from the Raiders. Two Rangers claim the Watch.' }
  };
  var RESORT = { n: 'Resort', cost: { wool: 3, stone: 1 },
    d: '3 points, built over a Town.' };

  /* the four Resorts: side A is plain and rich, side B has a trick each */
  var RESORT_B = [
    { id: 'b-tracks',  n: 'Highway Resort', d: 'On build: draw a card for every Track you own.' },
    { id: 'b-rangers', n: 'Lookout Resort', d: 'On build: draw a card for every Ranger you own.' },
    { id: 'b-highway', n: 'Roadhouse Resort', d: 'You take the Highway on ties.' },
    { id: 'b-watch',   n: 'Beacon Resort',  d: 'You take the Watch on ties.' }
  ];

  /* ---- the Headlines (events), fired by every new Shack ---- */
  var HEADLINES = [
    { id: 'season',  n: 'Good Season',   count: 1,
      d: 'Everyone without the Highway or the Watch draws 2.' },
    { id: 'whip',    n: 'Whip-Round',    count: 1,
      d: 'The points leader gives 1 card to someone behind.' },
    { id: 'raiders', n: 'Raiders',       count: 3,
      d: 'Over your hand limit? Lose half, rounded down.' },
    { id: 'tide',    n: 'King Tide',     count: 1,
      d: 'Everyone draws 1. The Headlines reshuffle.' },
    { id: 'grant',   n: 'Council Grant', count: 1,
      d: 'Draw 1 for every Shack still on top.' }
  ];

  var WIN_VP = 7;
  var HAND_LIMIT = 7;        /* Raiders bite above this, +1 per Ranger */
  var MARKET_SIZE = 5;
  var HIGHWAY_AT = 3;        /* Tracks to first claim the Highway */
  var WATCH_AT = 2;          /* Rangers to first claim the Watch */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ================= setup ================= */
  function newGame(names, seed, opts) {
    opts = opts || {};
    var rng = mulberry32(seed == null ? 1 : seed);
    var goods = [];
    GOODS.forEach(function (g) { for (var i = 0; i < GOOD_META[g].count; i++) goods.push(g); });
    shuffle(goods, rng);

    var deck = [];
    Object.keys(BUILDS).forEach(function (k) {
      for (var i = 0; i < BUILDS[k].count; i++) deck.push(k);
    });
    shuffle(deck, rng);

    var events = [];
    HEADLINES.forEach(function (h) { for (var i = 0; i < h.count; i++) events.push(h.id); });
    shuffle(events, rng);

    var g = {
      rulebook: RULEBOOK, seed: seed == null ? 1 : seed, _rng: rng,
      side: opts.side === 'B' ? 'B' : 'A',
      goods: goods, goodsDiscard: [],
      deck: deck, market: [],
      events: events, eventsDone: [],
      resorts: 4, resortBLeft: RESORT_B.map(function (r) { return r.id; }),
      players: names.map(function (nm) {
        return { name: nm, hand: [], tracks: 1, rangers: 0,
          stacks: [['shack']],            /* the starting Shack — no Headline */
          resortsB: [] };
      }),
      highway: -1, watch: -1,             /* seat holding each token */
      turn: Math.floor(rng() * names.length),
      phase: 'action',
      subUsed: false, tradeUsed: false, offered: false,
      pendingTrade: null,                 /* {from,give:[],want:[],resp:{seat:true=declined}} */
      over: false, winner: -1,
      turnCount: 0
    };
    for (var m = 0; m < MARKET_SIZE; m++) g.market.push(g.deck.pop());
    g.players.forEach(function (p) { drawGoods(g, p, 2, null); });
    var evts = [];
    runHarvest(g, evts);                  /* the first turn harvests too */
    return g;
  }

  /* ================= small helpers ================= */
  function drawGoods(g, p, n, evts) {
    var got = [];
    for (var i = 0; i < n; i++) {
      if (!g.goods.length) {
        if (!g.goodsDiscard.length) break;
        g.goods = shuffle(g.goodsDiscard.splice(0), g._rng);
      }
      var c = g.goods.pop();
      p.hand.push(c); got.push(c);
    }
    if (evts && got.length) evts.push({ e: 'draw', seat: g.players.indexOf(p), n: got.length });
    return got;
  }
  function spend(g, p, counts) {
    Object.keys(counts).forEach(function (good) {
      for (var i = 0; i < counts[good]; i++) {
        var at = p.hand.indexOf(good);
        p.hand.splice(at, 1);
        g.goodsDiscard.push(good);
      }
    });
  }
  function held(p) {
    var h = {};
    GOODS.forEach(function (good) { h[good] = 0; });
    p.hand.forEach(function (c) { h[c]++; });
    return h;
  }
  function subRatio(p) {
    return p.tracks >= 4 ? 1 : p.tracks === 3 ? 2 : p.tracks === 2 ? 3 : 4;
  }
  function handLimit(p) { return HAND_LIMIT + p.rangers; }
  function topOf(stack) { return stack[stack.length - 1]; }
  function stackVP(stack) {
    var t = topOf(stack);
    return t === 'shack' ? 1 : t === 'town' ? 2 : 3;
  }
  function vpOf(g, seat) {
    var p = g.players[seat];
    var v = p.stacks.reduce(function (s, st) { return s + stackVP(st); }, 0);
    if (g.highway === seat) v += 2;
    if (g.watch === seat) v += 2;
    return v;
  }
  function uncovered(p, kind) {
    return p.stacks.filter(function (st) { return topOf(st) === kind; }).length;
  }

  /* ---- can this player pay this cost, and how? ----
     At most one good of the cost may be substituted: K cards of ONE other
     type stand in for 1 of the missing good (K = the player's swap ratio),
     once per turn. Returns {pay:{...}} or null. */
  function paymentFor(g, p, cost, subFrom) {
    var have = held(p), pay = {}, missing = null, missN = 0;
    Object.keys(cost).forEach(function (good) {
      var want = cost[good];
      var use = Math.min(want, have[good]);
      pay[good] = use;
      if (use < want) { missing = good; missN += want - use; }
    });
    if (!missing) return { pay: pay, sub: null };
    if (missN > 1 || g.subUsed) return null;
    var K = subRatio(p);
    var pool = GOODS.filter(function (good) {
      return good !== missing && have[good] - (pay[good] || 0) >= K;
    });
    if (subFrom) pool = pool.filter(function (good) { return good === subFrom; });
    if (!pool.length) return null;
    /* most abundant spare, deterministically */
    pool.sort(function (a, b) {
      return (held(p)[b] - (pay[b] || 0)) - (held(p)[a] - (pay[a] || 0)) ||
        GOODS.indexOf(a) - GOODS.indexOf(b);
    });
    var from = pool[0];
    pay[from] = (pay[from] || 0) + K;
    return { pay: pay, sub: { from: from, k: K, forGood: missing } };
  }

  /* ================= the Headlines ================= */
  function fireHeadline(g, evts) {
    if (!g.events.length) g.events = shuffle(g.eventsDone.splice(0), g._rng);
    var id = g.events.pop();
    g.eventsDone.push(id);
    evts.push({ e: 'headline', id: id });
    if (id === 'season') {
      g.players.forEach(function (p, s) {
        if (g.highway !== s && g.watch !== s) drawGoods(g, p, 2, evts);
      });
    } else if (id === 'whip') {
      var tops = g.players.map(function (_, s) { return vpOf(g, s); });
      var max = Math.max.apply(null, tops);
      var leaders = [], behind = [];
      tops.forEach(function (v, s) { (v === max ? leaders : behind).push(s); });
      if (behind.length) {
        leaders.forEach(function (ls) {
          var lp = g.players[ls];
          if (!lp.hand.length) return;
          var to = behind[Math.floor(g._rng() * behind.length)];
          var card = lp.hand.splice(Math.floor(g._rng() * lp.hand.length), 1)[0];
          g.players[to].hand.push(card);
          evts.push({ e: 'gift', from: ls, to: to });
        });
      }
    } else if (id === 'raiders') {
      g.players.forEach(function (p, s) {
        if (p.hand.length > handLimit(p)) {
          var lose = Math.floor(p.hand.length / 2);
          for (var i = 0; i < lose; i++) {
            var at = Math.floor(g._rng() * p.hand.length);
            g.goodsDiscard.push(p.hand.splice(at, 1)[0]);
          }
          evts.push({ e: 'raided', seat: s, n: lose });
        }
      });
    } else if (id === 'tide') {
      g.players.forEach(function (p) { drawGoods(g, p, 1, evts); });
      g.events = shuffle(g.events.concat(g.eventsDone.splice(0)), g._rng);
    } else if (id === 'grant') {
      g.players.forEach(function (p) {
        var n = uncovered(p, 'shack');
        if (n) drawGoods(g, p, n, evts);
      });
    }
  }

  /* ================= tokens ================= */
  function checkTokens(g, seat, evts) {
    var p = g.players[seat];
    /* the Highway */
    if (g.highway === -1) {
      if (p.tracks >= HIGHWAY_AT) { g.highway = seat; evts.push({ e: 'token', which: 'highway', seat: seat }); }
    } else if (seat !== g.highway) {
      var cur = g.players[g.highway].tracks;
      var tie = p.tracks === cur && p.resortsB.indexOf('b-highway') >= 0;
      if (p.tracks > cur || tie) { g.highway = seat; evts.push({ e: 'token', which: 'highway', seat: seat }); }
    }
    /* the Watch */
    if (g.watch === -1) {
      if (p.rangers >= WATCH_AT) { g.watch = seat; evts.push({ e: 'token', which: 'watch', seat: seat }); }
    } else if (seat !== g.watch) {
      var curW = g.players[g.watch].rangers;
      var tieW = p.rangers === curW && p.resortsB.indexOf('b-watch') >= 0;
      if (p.rangers > curW || tieW) { g.watch = seat; evts.push({ e: 'token', which: 'watch', seat: seat }); }
    }
  }

  function checkWin(g, evts) {
    var v = vpOf(g, g.turn);
    if (v >= WIN_VP) {
      g.over = true; g.winner = g.turn;
      evts.push({ e: 'win', seat: g.turn, vp: v });
    }
  }

  /* ================= market ================= */
  function refillMarket(g, evts) {
    while (g.market.length < MARKET_SIZE && g.deck.length) g.market.push(g.deck.pop());
    /* five of a kind: tip the lot back in and deal again */
    if (g.market.length === MARKET_SIZE &&
        g.market.every(function (c) { return c === g.market[0]; })) {
      g.deck = shuffle(g.deck.concat(g.market.splice(0)), g._rng);
      for (var i = 0; i < MARKET_SIZE && g.deck.length; i++) g.market.push(g.deck.pop());
      evts.push({ e: 'marketflush' });
    }
  }

  /* ================= harvest ================= */
  function runHarvest(g, evts) {
    var n = g.players.length;
    for (var i = 0; i < n; i++) {
      var s = (g.turn + i) % n;
      var p = g.players[s];
      var take = 1;
      if (i === 0) {
        take += uncovered(p, 'town');
        p.stacks.forEach(function (st) {
          if (topOf(st) === 'resort') take += st.bSide ? 1 : 2;
        });
      }
      drawGoods(g, p, take, evts);
    }
    evts.push({ e: 'harvest', seat: g.turn });
  }

  /* ================= intents ================= */
  function legalBuilds(g, seat) {
    if (g.over || g.phase !== 'action' || seat !== g.turn) return [];
    var p = g.players[seat], out = [];
    g.market.forEach(function (kind, i) {
      if (kind === 'town' && !uncovered(p, 'shack')) return;
      if (paymentFor(g, p, BUILDS[kind].cost)) out.push({ t: 'build', slot: i });
    });
    if (g.resorts > 0 && uncovered(p, 'town') && paymentFor(g, p, RESORT.cost)) {
      out.push({ t: 'build', slot: 'resort' });
    }
    return out;
  }

  function apply(g, seat, intent) {
    var evts = [];
    if (g.over) return { ok: false, evts: evts };
    var p = g.players[seat];
    if (!p) return { ok: false, evts: evts };

    /* a trade answer is the one move that isn't the turn-holder's. The offer
       stands before the whole table: anyone may take it, first answer wins. */
    if (intent.t === 'tradeResp') {
      var tr = g.pendingTrade;
      if (!tr || tr.from === seat || tr.resp[seat]) return { ok: false, evts: evts };
      if (intent.accept) {
        var A = g.players[tr.from], B = g.players[seat];
        var okA = tr.give.every(function (good) { return held(A)[good] >= tr.give.filter(function (x) { return x === good; }).length; });
        var okB = tr.want.every(function (good) { return held(B)[good] >= tr.want.filter(function (x) { return x === good; }).length; });
        if (okA && okB) {
          g.pendingTrade = null;
          tr.give.forEach(function (good) { A.hand.splice(A.hand.indexOf(good), 1); B.hand.push(good); });
          tr.want.forEach(function (good) { B.hand.splice(B.hand.indexOf(good), 1); A.hand.push(good); });
          g.tradeUsed = true;
          drawGoods(g, B, 1, evts);       /* the agreeing partner's sweetener */
          evts.push({ e: 'tradeout', from: tr.from, by: seat, accept: true });
          return { ok: true, evts: evts };
        }
        /* can't actually cover it — counts as passing */
      }
      tr.resp[seat] = true;
      if (Object.keys(tr.resp).length >= g.players.length - 1) {
        g.pendingTrade = null;
        evts.push({ e: 'tradeout', from: tr.from, accept: false });
      } else {
        evts.push({ e: 'tradepass', seat: seat });
      }
      return { ok: true, evts: evts };
    }

    if (seat !== g.turn || g.phase !== 'action') return { ok: false, evts: evts };

    if (intent.t === 'build') {
      var kind, cost;
      if (intent.slot === 'resort') {
        if (g.resorts <= 0 || !uncovered(p, 'town')) return { ok: false, evts: evts };
        kind = 'resort'; cost = RESORT.cost;
      } else {
        kind = g.market[intent.slot];
        if (!kind) return { ok: false, evts: evts };
        if (kind === 'town' && !uncovered(p, 'shack')) return { ok: false, evts: evts };
        cost = BUILDS[kind].cost;
      }
      var pm = paymentFor(g, p, cost, intent.subFrom);
      if (!pm) return { ok: false, evts: evts };
      spend(g, p, pm.pay);
      if (pm.sub) { g.subUsed = true; evts.push({ e: 'sub', seat: seat, from: pm.sub.from, k: pm.sub.k, forGood: pm.sub.forGood }); }

      if (kind === 'track') { p.tracks++; }
      else if (kind === 'ranger') { p.rangers++; }
      else if (kind === 'shack') { p.stacks.push(['shack']); }
      else if (kind === 'town') {
        var st = p.stacks.find(function (x) { return topOf(x) === 'shack'; });
        st.push('town');
      } else if (kind === 'resort') {
        var tn = p.stacks.find(function (x) { return topOf(x) === 'town'; });
        tn.push('resort');
        tn.bSide = g.side === 'B';
        g.resorts--;
        if (g.side === 'B') {
          var pickId = intent.pick && g.resortBLeft.indexOf(intent.pick) >= 0
            ? intent.pick : g.resortBLeft[0];
          g.resortBLeft.splice(g.resortBLeft.indexOf(pickId), 1);
          tn.bId = pickId;
          p.resortsB.push(pickId);
          if (pickId === 'b-tracks') drawGoods(g, p, p.tracks, evts);
          if (pickId === 'b-rangers') drawGoods(g, p, p.rangers, evts);
        }
      }
      if (intent.slot !== 'resort') { g.market.splice(intent.slot, 1); refillMarket(g, evts); }
      evts.push({ e: 'built', seat: seat, kind: kind, bId: kind === 'resort' ? (p.resortsB[p.resortsB.length - 1] || null) : null });
      if (kind === 'shack') fireHeadline(g, evts);
      checkTokens(g, seat, evts);
      checkWin(g, evts);
      return { ok: true, evts: evts };
    }

    if (intent.t === 'trade') {
      if (g.tradeUsed || g.pendingTrade) return { ok: false, evts: evts };
      if (!intent.give.length || !intent.want.length) return { ok: false, evts: evts };
      /* no like-for-like and nothing for free */
      if (intent.give.some(function (good) { return intent.want.indexOf(good) >= 0; })) return { ok: false, evts: evts };
      var mine = held(p);
      var need = {};
      intent.give.forEach(function (good) { need[good] = (need[good] || 0) + 1; });
      if (Object.keys(need).some(function (good) { return mine[good] < need[good]; })) return { ok: false, evts: evts };
      g.offered = true;
      g.pendingTrade = { from: seat, give: intent.give.slice(), want: intent.want.slice(), resp: {} };
      evts.push({ e: 'tradeoffer', from: seat, give: intent.give.slice(), want: intent.want.slice() });
      return { ok: true, evts: evts };
    }

    if (intent.t === 'end') {
      if (g.pendingTrade) { g.pendingTrade = null; }
      g.turn = (g.turn + 1) % g.players.length;
      g.subUsed = false; g.tradeUsed = false; g.offered = false;
      g.turnCount++;
      evts.push({ e: 'turn', seat: g.turn });
      runHarvest(g, evts);
      return { ok: true, evts: evts };
    }

    return { ok: false, evts: evts };
  }

  /* ================= the bot ================= */
  /* the trade a bot would float: the one good missing from its best build,
     paid with its deepest surplus */
  function botOffer(g, seat) {
    var p = g.players[seat];
    var have = held(p);
    var wants = [];
    if (uncovered(p, 'town') && g.resorts > 0) wants.push(RESORT.cost);
    if (uncovered(p, 'shack')) wants.push(BUILDS.town.cost);
    wants.push(BUILDS.shack.cost, BUILDS.ranger.cost, BUILDS.track.cost);
    for (var i = 0; i < wants.length; i++) {
      var cost = wants[i], missing = null, missN = 0;
      Object.keys(cost).forEach(function (good) {
        var short = cost[good] - Math.min(cost[good], have[good]);
        if (short > 0) { missing = good; missN += short; }
      });
      if (!missing || missN !== 1) continue;
      var give = null, best = 1;         /* only part with a real surplus */
      GOODS.forEach(function (good) {
        var spare = have[good] - (cost[good] || 0);
        if (good !== missing && spare > best) { best = spare; give = good; }
      });
      if (give) return { t: 'trade', give: [give], want: [missing] };
    }
    return null;
  }

  function botMove(g, seat) {
    if (g.over) return null;
    var p = g.players[seat];
    var tr = g.pendingTrade;
    if (tr && tr.from !== seat && !tr.resp[seat]) {
      /* take a trade when it hands over more than it takes, or sheds a double */
      var good = tr.give.length > tr.want.length ||
        (tr.give.length === tr.want.length && tr.want.every(function (x) { return held(p)[x] >= 2; }));
      return { t: 'tradeResp', accept: !!good };
    }
    if (seat !== g.turn || g.phase !== 'action' || tr) return null;
    /* build the biggest thing we can, resorts first */
    var builds = legalBuilds(g, seat);
    if (builds.length) {
      var rank = { resort: 5, town: 4, shack: 3, ranger: 2, track: 1 };
      builds.sort(function (a, b) {
        var ka = a.slot === 'resort' ? 'resort' : g.market[a.slot];
        var kb = b.slot === 'resort' ? 'resort' : g.market[b.slot];
        return rank[kb] - rank[ka];
      });
      var pick = builds[0];
      if (pick.slot === 'resort' && g.side === 'B') {
        pick = { t: 'build', slot: 'resort',
          pick: p.tracks >= p.rangers ? 'b-tracks' : 'b-rangers' };
        if (g.resortBLeft.indexOf(pick.pick) < 0) pick.pick = g.resortBLeft[0];
      }
      return pick;
    }
    if (!g.tradeUsed && !g.offered) {
      var offer = botOffer(g, seat);
      if (offer) return offer;
    }
    return { t: 'end' };
  }

  var api = {
    RULEBOOK: RULEBOOK, GOODS: GOODS, GOOD_META: GOOD_META,
    BUILDS: BUILDS, RESORT: RESORT, RESORT_B: RESORT_B, HEADLINES: HEADLINES,
    WIN_VP: WIN_VP, HAND_LIMIT: HAND_LIMIT, MARKET_SIZE: MARKET_SIZE,
    newGame: newGame, apply: apply, botMove: botMove,
    legalBuilds: legalBuilds, paymentFor: paymentFor, vpOf: vpOf,
    held: held, subRatio: subRatio, handLimit: handLimit,
    uncovered: uncovered, topOf: topOf, mulberry32: mulberry32
  };
  global.Headlands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
