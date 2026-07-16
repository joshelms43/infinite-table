/* Infinite Table — the 8-Ball rulebook. THE canonical one.

   WPA 8-ball with one deliberate subtraction and two deliberate simplifications,
   all chosen on 2026-07-16:
     — no pocket calling, anywhere. A ball down is a ball down; the 8 wins the
       moment it drops legally. (The subtraction.)
     — an 8 pocketed on the break re-spots automatically; WPA offers the breaker
       a choice, and a choice is a UI. (Simplification one.)
     — a weak break (fewer than four object balls to a rail, nothing pocketed) is
       an ordinary break foul rather than a re-rack option: incoming player, cue
       in hand behind the head string. (Simplification two.)
   Everything else is the official game: open table after the break no matter
   what drops, first legal pot assigns the groups, own group first or it's a
   foul, something must reach a rail after contact, fouls are ball in hand
   anywhere (break fouls: in the kitchen), early 8 loses, 8 plus a foul loses.

   The physics engine reports what happened; this file alone says what it meant.
   The game must consume it, never copy it — the lint gate holds that line, the
   same line mdeal-rules holds for M Deal.

   Pure: no DOM, no physics, no network. */
(function (global) {
  'use strict';

  var RULEBOOK = '2026-07-16-wpa-nocall';

  var SOLIDS = [1, 2, 3, 4, 5, 6, 7];
  var STRIPES = [9, 10, 11, 12, 13, 14, 15];
  var EIGHT = 8;

  /* The regulation colours, so every client paints the same table. */
  var BALL_COLORS = {
    1: '#F2C230', 2: '#2457C5', 3: '#D03B30', 4: '#6E3AA8',
    5: '#E87722', 6: '#1E8A4C', 7: '#8A2F33', 8: '#1B1B1F',
    9: '#F2C230', 10: '#2457C5', 11: '#D03B30', 12: '#6E3AA8',
    13: '#E87722', 14: '#1E8A4C', 15: '#8A2F33',
  };

  function groupOf(id) {
    if (id === EIGHT) return 'eight';
    if (id >= 1 && id <= 7) return 'solid';
    if (id >= 9 && id <= 15) return 'stripe';
    return null;   // the cue belongs to nobody
  }

  /* Deterministic, seedable shuffle — the host racks, everyone gets the same rack. */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fifteen ball ids in rack-seat order: apex, then row by row. The 8 sits in the
     middle of the third row (seat 4) and the two back corners (seats 10 and 14)
     carry one of each group — regulation. */
  function rackOrder(seed) {
    var r = rng(seed);
    var pool = SOLIDS.concat(STRIPES);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var seats = new Array(15);
    seats[4] = EIGHT;
    var solids = pool.filter(function (id) { return groupOf(id) === 'solid'; });
    var stripes = pool.filter(function (id) { return groupOf(id) === 'stripe'; });
    seats[10] = solids.pop();
    seats[14] = stripes.pop();
    if (r() < 0.5) { var s = seats[10]; seats[10] = seats[14]; seats[14] = s; }
    var rest = solids.concat(stripes);
    for (var k = rest.length - 1; k > 0; k--) {
      var m = Math.floor(r() * (k + 1));
      var u = rest[k]; rest[k] = rest[m]; rest[m] = u;
    }
    var ri = 0;
    for (var seat = 0; seat < 15; seat++) if (seats[seat] == null) seats[seat] = rest[ri++];
    return seats;
  }

  /* The judgement. Everything it needs arrives as plain data:
       breakShot        — is this the opening shot of a rack
       open             — is the table still open
       myGroup          — 'solid' | 'stripe' | null while open
       ballsBefore      — object-ball ids on the table before the stroke (no cue)
       events           — the physics report: { firstHit, pocketed, railsAfterContact, railBalls }
     It answers with what the game must now do. It never touches the game to do it. */
  function judge(input) {
    var ev = input.events || {};
    var pocketed = ev.pocketed || [];
    var pottedObjs = pocketed.filter(function (id) { return id !== 0; });
    var scratch = pocketed.indexOf(0) >= 0;
    var eightDown = pottedObjs.indexOf(EIGHT) >= 0;
    var railBallCount = Object.keys(ev.railBalls || {}).length;

    var mine = input.myGroup
      ? input.ballsBefore.filter(function (id) { return groupOf(id) === input.myGroup; })
      : null;
    var onEight = !!input.myGroup && mine.length === 0;

    var foul = null;
    if (ev.firstHit == null) foul = 'never touched a ball';
    else if (!input.breakShot) {
      if (input.open) {
        if (ev.firstHit === EIGHT) foul = 'struck the 8 first on an open table';
      } else {
        var need = onEight ? 'eight' : input.myGroup;
        if (groupOf(ev.firstHit) !== need) {
          foul = onEight ? 'must strike the 8 first' : 'struck the wrong group first';
        }
      }
    } else if (pottedObjs.length === 0 && railBallCount < 4) {
      foul = 'weak break — four balls to a rail or one in a pocket';
    }
    if (!foul && !input.breakShot && pottedObjs.length === 0 && !(ev.railsAfterContact > 0) && !scratch) {
      foul = 'nothing reached a rail after contact';
    }
    if (scratch) foul = input.breakShot ? 'scratch on the break' : 'scratch';

    var out = {
      foul: foul,
      win: false, lose: false,
      again: false,
      assignShooter: null,
      nowOpen: input.open,
      respotEight: false,
      ballInHand: !!foul,
      behindHead: !!foul && !!input.breakShot,
    };

    if (eightDown) {
      if (input.breakShot) out.respotEight = true;   // never a decider on the break
      else if (foul) { out.lose = true; return out; }
      else if (!onEight) { out.lose = true; out.foul = out.foul || 'pocketed the 8 early'; return out; }
      else { out.win = true; return out; }
    }

    if (foul) return out;

    if (input.breakShot) {
      out.again = pottedObjs.length > 0;
      out.nowOpen = true;                            // open after the break regardless
    } else if (input.open) {
      var firstPot = pottedObjs.length ? pottedObjs[0] : null;
      if (firstPot != null && firstPot !== EIGHT) {
        out.assignShooter = groupOf(firstPot);
        out.nowOpen = false;
        out.again = true;
      }
    } else {
      out.again = pottedObjs.some(function (id) { return groupOf(id) === input.myGroup; });
    }
    return out;
  }

  /* How many of a group still stand — the HUD and the bots both ask. */
  function remaining(ballIds, group) {
    return ballIds.filter(function (id) { return groupOf(id) === group; }).length;
  }

  var PoolRules = {
    RULEBOOK: RULEBOOK,
    SOLIDS: SOLIDS, STRIPES: STRIPES, EIGHT: EIGHT,
    BALL_COLORS: BALL_COLORS,
    groupOf: groupOf,
    rackOrder: rackOrder,
    judge: judge,
    remaining: remaining,
  };

  global.PoolRules = PoolRules;
  if (typeof module !== 'undefined' && module.exports) module.exports = PoolRules;
})(typeof window !== 'undefined' ? window : globalThis);
