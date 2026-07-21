/* Infinite Table — the Last Card rulebook. THE canonical one.

   A shedding game in the Crazy Eights family, played the way it's played here:
   match the colour or the number, actions bite, wilds turn the table, and you
   call "Last Card" before you go to one — or the table charges you two.

   House rules, pinned so nobody argues:
     - A Draw Four plays on anything, any time. No challenges, no lawyers.
     - Effects never stack. A Draw Two resolves on the seat it hits.
     - The call is deterministic: play down to one card without having called
       and the penalty is automatic. No race over the wire, no "I said it first".
     - Reverse in a two-player game is a Skip (as it must be).
     - Drawn card may be played immediately if it's legal; otherwise the turn ends.

   Pure: no DOM, no network, no opinions. The whole game lives in here so the
   harness can play a million turns of it without a browser.

   Aussie name, Aussie rules — "Last Card" is what this game is actually called
   at tables here; the deck is ours (Coral, Teal, Gold, Blue). */
(function (global) {
  'use strict';

  var RULEBOOK = '2026-07-21-lastcard-house';

  var COLOURS = {
    coral: { label: 'Coral', hex: '#D4756B' },
    teal:  { label: 'Teal',  hex: '#3B8B82' },
    gold:  { label: 'Gold',  hex: '#E0AB52' },
    blue:  { label: 'Blue',  hex: '#5A8CA8' },
  };
  var COLOUR_IDS = ['coral', 'teal', 'gold', 'blue'];

  /* ---- deterministic rng (mulberry32) — the harness replays every game ---- */
  function seededRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- the deck: 108 cards, ids minted once per game, never reused ----
     Per colour: one 0, two each of 1–9, two Skip, two Reverse, two Draw Two (25).
     Plus four Wilds and four Draw Fours. The CID lesson from M Deal applies:
     every card id is unique for the life of the game, reshuffles included. */
  function buildDeck() {
    var deck = [], id = 1;
    COLOUR_IDS.forEach(function (col) {
      deck.push({ id: id++, kind: 'num', colour: col, n: 0 });
      for (var n = 1; n <= 9; n++) {
        deck.push({ id: id++, kind: 'num', colour: col, n: n });
        deck.push({ id: id++, kind: 'num', colour: col, n: n });
      }
      ['skip', 'rev', 'd2'].forEach(function (k) {
        deck.push({ id: id++, kind: k, colour: col });
        deck.push({ id: id++, kind: k, colour: col });
      });
    });
    for (var w = 0; w < 4; w++) deck.push({ id: id++, kind: 'wild', colour: null });
    for (var f = 0; f < 4; f++) deck.push({ id: id++, kind: 'w4', colour: null });
    return deck;
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---- legality: wilds always; otherwise colour, number, or kind ---- */
  function canPlay(card, top, activeColour) {
    if (card.kind === 'wild' || card.kind === 'w4') return true;
    if (card.colour === activeColour) return true;
    if (card.kind === 'num') return top.kind === 'num' && top.n === card.n;
    return card.kind === top.kind;   // skip on skip, rev on rev, d2 on d2
  }

  function cardName(c) {
    if (c.kind === 'wild') return 'Wild';
    if (c.kind === 'w4') return 'Draw Four';
    var col = COLOURS[c.colour].label;
    if (c.kind === 'num') return col + ' ' + c.n;
    if (c.kind === 'skip') return col + ' Skip';
    if (c.kind === 'rev') return col + ' Reverse';
    return col + ' Draw Two';
  }

  /* ================= the game ================= */

  function newGame(seatCount, seed) {
    if (seatCount < 2 || seatCount > 5) throw new Error('Last Card seats 2–5');
    var rng = seededRng(seed == null ? Math.floor(Math.random() * 2 ** 31) : seed);
    var deck = shuffle(buildDeck(), rng);

    /* the flip card must be a number — swap the first number card up if not */
    var flipAt = seatCount * 7;
    if (deck[flipAt].kind !== 'num') {
      for (var i = flipAt + 1; i < deck.length; i++) {
        if (deck[i].kind === 'num') {
          var t = deck[flipAt]; deck[flipAt] = deck[i]; deck[i] = t;
          break;
        }
      }
    }

    var players = [];
    for (var s = 0; s < seatCount; s++) {
      players.push({ hand: deck.splice(0, 7), called: false });
    }
    var flip = deck.shift();

    return {
      players: players,
      deck: deck,
      discard: [flip],
      turn: 0,
      dir: 1,
      activeColour: flip.colour,
      phase: 'play',        // 'play' | 'drawn' (holding a fresh draw) | 'over'
      drawnId: null,        // in 'drawn' phase: the only card that may be played
      winner: null,
      turnCount: 0,
      events: [],           // consumed by the UI, cleared each apply
      _rng: rng,
    };
  }

  function top(g) { return g.discard[g.discard.length - 1]; }

  function nextSeat(g, from, steps) {
    var n = g.players.length, s = from;
    for (var i = 0; i < steps; i++) s = ((s + g.dir) % n + n) % n;
    return s;
  }

  /* deck runs dry → the discard (minus its top) shuffles back under it */
  function ensureDeck(g, need) {
    if (g.deck.length >= need) return;
    if (g.discard.length > 1) {
      var keep = g.discard.pop();
      shuffle(g.discard, g._rng);
      g.deck = g.deck.concat(g.discard.splice(0));
      g.discard = [keep];
      g.events.push({ e: 'reshuffle' });
    }
  }

  function drawTo(g, seat, n) {
    var got = 0;
    for (var i = 0; i < n; i++) {
      ensureDeck(g, 1);
      if (!g.deck.length) break;       // 108 cards across 5 hands: effectively unreachable
      g.players[seat].hand.push(g.deck.shift());
      got++;
    }
    if (g.players[seat].hand.length > 1) g.players[seat].called = false;
    return got;
  }

  function legalMoves(g, seat) {
    if (g.phase === 'over' || g.turn !== seat) return [];
    var p = g.players[seat], moves = [];
    if (g.phase === 'drawn') {
      var d = p.hand.find(function (c) { return c.id === g.drawnId; });
      if (d && canPlay(d, top(g), g.activeColour)) moves.push({ t: 'play', id: d.id });
      moves.push({ t: 'pass' });
    } else {
      p.hand.forEach(function (c) {
        if (canPlay(c, top(g), g.activeColour)) moves.push({ t: 'play', id: c.id });
      });
      moves.push({ t: 'draw' });
    }
    if (p.hand.length === 2 && !p.called) moves.push({ t: 'call' });
    return moves;
  }

  /* apply a move as a seat. Returns true if it stood, false if it bounced.
     The host calls this with client intents; a bounce is a nack, never a crash. */
  function apply(g, seat, move) {
    g.events = [];
    if (g.phase === 'over' || g.turn !== seat || !move) return false;
    var p = g.players[seat];

    if (move.t === 'call') {
      if (p.hand.length !== 2 || p.called) return false;
      p.called = true;
      g.events.push({ e: 'call', seat: seat });
      return true;                                  // calling never spends the turn
    }

    if (move.t === 'draw') {
      if (g.phase !== 'play') return false;
      drawTo(g, seat, 1);
      var d = p.hand[p.hand.length - 1];
      g.events.push({ e: 'draw', seat: seat, n: 1 });
      if (d && canPlay(d, top(g), g.activeColour)) {
        g.phase = 'drawn';
        g.drawnId = d.id;                           // their choice: play it or keep it
      } else {
        endTurn(g, 1);
      }
      return true;
    }

    if (move.t === 'pass') {
      if (g.phase !== 'drawn') return false;
      g.phase = 'play';
      g.drawnId = null;
      endTurn(g, 1);
      return true;
    }

    if (move.t === 'play') {
      var idx = -1;
      for (var i = 0; i < p.hand.length; i++) if (p.hand[i].id === move.id) { idx = i; break; }
      if (idx < 0) return false;
      var c = p.hand[idx];
      if (g.phase === 'drawn' && c.id !== g.drawnId) return false;
      if (!canPlay(c, top(g), g.activeColour)) return false;
      var isWild = c.kind === 'wild' || c.kind === 'w4';
      if (isWild && COLOUR_IDS.indexOf(move.colour) < 0) return false;

      p.hand.splice(idx, 1);
      g.discard.push(c);
      g.activeColour = isWild ? move.colour : c.colour;
      g.phase = 'play';
      g.drawnId = null;
      g.events.push({ e: 'play', seat: seat, card: c, colour: g.activeColour });

      /* the deterministic call: down to one without calling costs two, always */
      if (p.hand.length === 1 && !p.called) {
        var pen = drawTo(g, seat, 2);
        g.events.push({ e: 'penalty', seat: seat, n: pen });
      }

      if (p.hand.length === 0) {
        g.phase = 'over';
        g.winner = seat;
        g.events.push({ e: 'win', seat: seat });
        /* a Draw Two / Four on the way out still bites (official everywhere) */
        if (c.kind === 'd2' || c.kind === 'w4') {
          var v0 = nextSeat(g, seat, 1);
          var n0 = drawTo(g, v0, c.kind === 'd2' ? 2 : 4);
          g.events.push({ e: 'forced', seat: v0, n: n0 });
        }
        return true;
      }

      var steps = 1;
      if (c.kind === 'skip') { steps = 2; g.events.push({ e: 'skip', seat: nextSeat(g, seat, 1) }); }
      else if (c.kind === 'rev') {
        if (g.players.length === 2) { steps = 2; g.events.push({ e: 'skip', seat: nextSeat(g, seat, 1) }); }
        else { g.dir = -g.dir; g.events.push({ e: 'reverse' }); }
      }
      else if (c.kind === 'd2' || c.kind === 'w4') {
        var v = nextSeat(g, seat, 1);
        var n = drawTo(g, v, c.kind === 'd2' ? 2 : 4);
        g.events.push({ e: 'forced', seat: v, n: n });
        steps = 2;                                   // they draw and they sit
      }
      endTurn(g, steps);
      return true;
    }

    return false;
  }

  function endTurn(g, steps) {
    g.turn = nextSeat(g, g.turn, steps);
    g.turnCount++;
  }

  /* ---- the practice opponent: greedy, colour-aware, saves wilds ---- */
  function botMove(g, seat) {
    var moves = legalMoves(g, seat);
    if (!moves.length) return null;
    var p = g.players[seat];

    var call = moves.find(function (m) { return m.t === 'call'; });
    if (call) return call;                            // it never forgets to call

    var held = {};                                    // its strongest colour
    COLOUR_IDS.forEach(function (c) { held[c] = 0; });
    p.hand.forEach(function (c) { if (c.colour) held[c.colour]++; });
    var best = COLOUR_IDS.slice().sort(function (a, b) { return held[b] - held[a]; })[0];

    function score(m) {
      if (m.t !== 'play') return -1;
      var c = p.hand.find(function (x) { return x.id === m.id; });
      if (c.kind === 'w4') return p.hand.length <= 2 ? 9 : 1;   // wilds are for emergencies
      if (c.kind === 'wild') return p.hand.length <= 2 ? 8 : 2;
      if (c.kind === 'd2') return 7;
      if (c.kind === 'skip' || c.kind === 'rev') return 6;
      return 3 + (c.colour === best ? 2 : 0) + c.n / 20;        // sheds high, keeps its suit
    }
    var plays = moves.filter(function (m) { return m.t === 'play'; });
    if (!plays.length) return moves.find(function (m) { return m.t === 'draw' || m.t === 'pass'; });

    plays.sort(function (a, b) { return score(b) - score(a); });
    var pick = plays[0];
    var card = p.hand.find(function (x) { return x.id === pick.id; });
    if (card.kind === 'wild' || card.kind === 'w4') pick = { t: 'play', id: pick.id, colour: best };
    return pick;
  }

  var LastCard = {
    RULEBOOK: RULEBOOK,
    COLOURS: COLOURS,
    COLOUR_IDS: COLOUR_IDS,
    buildDeck: buildDeck,
    seededRng: seededRng,
    canPlay: canPlay,
    cardName: cardName,
    newGame: newGame,
    legalMoves: legalMoves,
    apply: apply,
    botMove: botMove,
    top: top,
    nextSeat: nextSeat,
  };

  global.LastCard = LastCard;
  if (typeof module !== 'undefined' && module.exports) module.exports = LastCard;
})(typeof window !== 'undefined' ? window : globalThis);
