/* Infinite Table — pool physics. The table, the balls, and nothing else.

   This is the first game on the platform where the interesting state is continuous.
   The wire cannot afford sixty positions a second, so it doesn't carry them: a shot
   is four numbers, and every client that owns this file can replay it. The host's
   replay is the authoritative one — its final positions ship in the shot broadcast
   and everyone snaps to them when their own animation lands, so a stray ulp of
   Math.cos on someone's phone can never fork the game.

   Determinism inside a single replay is load-bearing: fixed timestep, fixed
   iteration order, no randomness, no time source. simulate() and a stepper fed the
   same input produce byte-identical outcomes — poolsim pins that.

   Pure: no DOM, no rules, no opinions about fouls. It reports what happened
   (first contact, pockets in order, rails after contact) and lets the rulebook
   judge it. */
(function (global) {
  'use strict';

  var ENGINE = '2026-07-17-mouths-r5';   /* r4: the honest ball. Every ball carries a
     surface-roll state (w) beside its velocity; sliding friction drags the two
     together at sphere ratios (1 : 2.5), and only a rolling ball feels rolling
     resistance. Draw and follow are nothing special any more — they are just
     backspin and topspin struck into the cue, grabbing the cloth after contact
     and curving the cue along the real tangent-line arc. Object balls slide
     then roll like real balls. Side english stays a cushion-tangent kick. */

  /* The table: a 9-footer in metres, head rail at x=0, foot rail at x=W.
     The kitchen is everything behind the head string. */
  var W = 2.24, H = 1.12;
  var R = 0.028575;                  // 57.15mm balls, regulation
  var HEADSTRING = W * 0.25;
  var FOOTSPOT = { x: W * 0.75, y: H / 2 };

  var DT = 1 / 480;                  // 2R is 5.7cm; at the 7 m/s cap a tick moves 1.5cm — no tunnelling
  var MAXTICKS = 480 * 30;           // thirty seconds of table time is a stuck ball, not a shot
  var STOP = 0.02;                   // below this a ball is at rest (m/s)
  var DRAG = 0.32;                   // exponential decay per second
  var ROLL = 0.24;                   // plus a linear floor so slow balls actually stop (m/s^2)
  var E_BALL = 0.95;                 // restitution, ball on ball
  var E_RAIL = 0.72;                 // restitution, ball on cushion
  var MINSPEED = 0.25, MAXSPEED = 8.5; // the slide phase eats ~30% of a stun shot, so the top end rises to keep the break honest
  var MU_SLIDE = 2.0;                // sliding friction (m/s^2) — the grab
  var SLIP_EPS = 0.02;               // below this surface slip, a ball is rolling
  var K_OFF = 1.8;                   // full-slider strike offset: w0 = v * K_OFF * sy — a touch past physical, for punch
  var W_RAIL_N = 0.55;               // roll state surviving a cushion, normal part (reversed)
  var W_RAIL_T = 0.92;               // and tangential part
  var SIDE_K = 0.4;                  // cushion tangent kick per unit side spin, scaled by impact speed
  var SIDE_FADE = 0.65;              // side spin surviving each cushion

  /* Pockets. Corner mouths sit on the corner points, side mouths just outside the
     long rails. A ball inside a mouth zone gets no cushion; inside the capture
     radius it drops. */
  /* r5: the pockets are where the artwork draws them. Corner holes sit outside
     the cloth corner on the diagonal, side holes outside the long rails; their
     rims kiss the nose line, so nothing is swallowed on the felt. */
  var POCKETS = [
    { x: -0.045, y: -0.045, cap: 0.062 }, { x: W + 0.045, y: -0.045, cap: 0.062 },
    { x: -0.045, y: H + 0.045, cap: 0.062 }, { x: W + 0.045, y: H + 0.045, cap: 0.062 },
    { x: W / 2, y: -0.067, cap: 0.062 }, { x: W / 2, y: H + 0.067, cap: 0.062 },
  ];
  /* rail openings, matching the drawn mouths: the cushion simply is not there */
  var CGAP = 0.115;                  // opening reach from each corner, along both rails
  var SGAP = 0.10;                   // opening half-width at the side pockets
  function openLong(x)  { return x < CGAP || x > W - CGAP || Math.abs(x - W / 2) < SGAP; }
  function openShort(y) { return y < CGAP || y > H - CGAP; }

  function speedFor(power) {
    var p = Math.max(0, Math.min(1, +power || 0));
    /* eased, not linear: the bottom third of the bar is all touch shots, the top
       still breaks. p^1.7 puts half the bar below 2.3 m/s. */
    return MINSPEED + Math.pow(p, 1.7) * (MAXSPEED - MINSPEED);
  }

  /* Fifteen rack seats, apex on the foot spot, rows marching toward the foot rail.
     Which ball sits in which seat is the rulebook's business. */
  function rackPositions() {
    var out = [], gap = R * 2 * 1.001, dx = gap * Math.sqrt(3) / 2;
    for (var row = 0; row < 5; row++) {
      for (var i = 0; i <= row; i++) {
        out.push({ x: FOOTSPOT.x + row * dx, y: FOOTSPOT.y + (i - row / 2) * gap });
      }
    }
    return out;
  }

  function cueStart() { return { x: HEADSTRING * 0.9, y: H / 2 }; }

  /* Where the 8 goes back when the break sinks it. Foot spot, or as near to it
     toward the foot rail as fits. */
  function respotPosition(balls) {
    for (var k = 0; k < 200; k++) {
      var x = FOOTSPOT.x + k * (R / 2);
      if (x > W - R) break;
      if (placeOK(balls, x, FOOTSPOT.y, false)) return { x: x, y: FOOTSPOT.y };
    }
    for (var m = 1; m < 200; m++) {   // a pathological cluster: walk back toward the head instead
      var hx = FOOTSPOT.x - m * (R / 2);
      if (hx < R) break;
      if (placeOK(balls, hx, FOOTSPOT.y, false)) return { x: hx, y: FOOTSPOT.y };
    }
    return { x: FOOTSPOT.x, y: FOOTSPOT.y };
  }

  /* May the cue ball sit here? On the cloth, off every live ball, and if the rules
     say kitchen, then in the kitchen. */
  function placeOK(balls, x, y, behindHead) {
    if (!(x >= R && x <= W - R && y >= R && y <= H - R)) return false;
    if (behindHead && x > HEADSTRING) return false;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.pocketed || b.id === 0) continue;
      var dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < (2 * R) * (2 * R)) return false;
    }
    return true;
  }

  function nearestPocket(x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < POCKETS.length; i++) {
      var dx = POCKETS[i].x - x, dy = POCKETS[i].y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = POCKETS[i]; }
    }
    return best;
  }

  function inMouth(x, y) {
    /* true where the rails are open: past-the-line travel here means the drop */
    if ((y < R && openLong(x)) || (y > H - R && openLong(x))) return nearestPocket(x, y);
    if ((x < R && openShort(y)) || (x > W - R && openShort(y))) return nearestPocket(x, y);
    return null;
  }

  /* One fixed tick. Mutates the ball array it is given; the stepper owns the copies.
     spin carries only the cue's side english: {z}. Top and back spin live in the
     balls themselves now, as roll state. */
  function tick(balls, ev, spin) {
    var i, j, b;
    spin.z *= (1 - 0.35 * DT);

    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.pocketed) continue;
      var ux = b.vx - b.wx, uy = b.vy - b.wy;
      var us = Math.sqrt(ux * ux + uy * uy);
      if (us > SLIP_EPS) {
        /* sliding: friction drags velocity and roll toward each other, 1 : 2.5 */
        var k = Math.min(MU_SLIDE * DT, us / 3.5);
        var fx = ux / us, fy = uy / us;
        b.vx -= k * fx;       b.vy -= k * fy;
        b.wx += 2.5 * k * fx; b.wy += 2.5 * k * fy;
      } else {
        /* rolling: the old gentle decay, roll locked to travel */
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp > 0) {
          var ns = sp * (1 - DRAG * DT) - ROLL * DT;
          if (ns < STOP) ns = 0;
          var f = ns / sp;
          b.vx *= f; b.vy *= f;
        }
        b.wx = b.vx; b.wy = b.vy;
      }
      b.x += b.vx * DT;
      b.y += b.vy * DT;
    }

    /* Pockets first — a ball in the jaws never sees a cushion. */
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.pocketed) continue;
      /* capture: on the pocket rim, or fallen over an open edge */
      var fell = null, pi, pp, pdx, pdy;
      for (pi = 0; pi < POCKETS.length; pi++) {
        pp = POCKETS[pi]; pdx = pp.x - b.x; pdy = pp.y - b.y;
        if (pdx * pdx + pdy * pdy < pp.cap * pp.cap) { fell = pp; break; }
      }
      if (!fell) {
        var deep = 0.5 * R;
        if ((b.y < -deep || b.y > H + deep) && openLong(b.x)) fell = nearestPocket(b.x, b.y);
        else if ((b.x < -deep || b.x > W + deep) && openShort(b.y)) fell = nearestPocket(b.x, b.y);
      }
      if (fell) {
        b.pocketed = true; b.vx = 0; b.vy = 0;
        ev.pocketed.push(b.id);
        continue;
      }
      var railed = false;
      var english = (b.id === 0 && spin.z !== 0);
      var oS = openShort(b.y), oL = openLong(b.x);
      if (b.x < R && !oS)      { b.x = R;     if (b.vx < 0) { b.vx = -b.vx * E_RAIL; b.wx = -b.wx * W_RAIL_N; b.wy *= W_RAIL_T; railed = true; if (english) { b.vy += spin.z * SIDE_K * b.vx;  spin.z *= SIDE_FADE; } } }
      if (b.x > W - R && !oS)  { b.x = W - R; if (b.vx > 0) { b.vx = -b.vx * E_RAIL; b.wx = -b.wx * W_RAIL_N; b.wy *= W_RAIL_T; railed = true; if (english) { b.vy += -spin.z * SIDE_K * (-b.vx); spin.z *= SIDE_FADE; } } }
      if (b.y < R && !oL)      { b.y = R;     if (b.vy < 0) { b.vy = -b.vy * E_RAIL; b.wy = -b.wy * W_RAIL_N; b.wx *= W_RAIL_T; railed = true; if (english) { b.vx += -spin.z * SIDE_K * b.vy;  spin.z *= SIDE_FADE; } } }
      if (b.y > H - R && !oL)  { b.y = H - R; if (b.vy > 0) { b.vy = -b.vy * E_RAIL; b.wy = -b.wy * W_RAIL_N; b.wx *= W_RAIL_T; railed = true; if (english) { b.vx += spin.z * SIDE_K * (-b.vy); spin.z *= SIDE_FADE; } } }
      if (railed) {
        if (ev.firstHit != null) ev.railsAfterContact++;
        if (b.id !== 0) ev.railBalls[b.id] = true;
      }
    }

    /* Ball on ball, index order — the order is part of the determinism contract. */
    for (i = 0; i < balls.length; i++) {
      var a = balls[i];
      if (a.pocketed) continue;
      for (j = i + 1; j < balls.length; j++) {
        var c = balls[j];
        if (c.pocketed) continue;
        var dx = c.x - a.x, dy = c.y - a.y;
        var d2 = dx * dx + dy * dy, min = 2 * R;
        if (d2 >= min * min || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        var push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        c.x += nx * push; c.y += ny * push;
        var rv = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rv > 0) {
          var imp = rv * (1 + E_BALL) / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          c.vx += imp * nx; c.vy += imp * ny;
          if (ev.firstHit == null && (a.id === 0 || c.id === 0)) {
            ev.firstHit = a.id === 0 ? c.id : a.id;
          }
        }
      }
    }
  }

  function atRest(balls) {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.pocketed) continue;
      if (b.vx !== 0 || b.vy !== 0) return false;
      var sx = b.vx - b.wx, sy2 = b.vy - b.wy;
      if (sx * sx + sy2 * sy2 > SLIP_EPS * SLIP_EPS) return false;   // spin still working the cloth
    }
    return true;
  }

  /* A live simulation you can advance a few ticks per animation frame.
     Copies its input; never touches the caller's state. */
  function stepper(balls, shot) {
    var sim = {
      balls: balls.map(function (b) {
        return { id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, wx: 0, wy: 0, pocketed: !!b.pocketed };
      }),
      events: { firstHit: null, pocketed: [], railsAfterContact: 0, railBalls: {} },
      ticks: 0,
      done: false,
      dt: DT,
    };
    var cue = null;
    for (var i = 0; i < sim.balls.length; i++) if (sim.balls[i].id === 0) cue = sim.balls[i];
    if (!cue || cue.pocketed) { sim.done = true; return sim; }
    var v = speedFor(shot.power);
    var cl = function (x) { return Math.max(-1, Math.min(1, +x || 0)); };
    cue.vx = Math.cos(shot.angle) * v;
    cue.vy = Math.sin(shot.angle) * v;
    var sy0 = cl(shot.sy);
    cue.wx = cue.vx * K_OFF * sy0;   // struck above centre rolls ahead of travel; below, against it
    cue.wy = cue.vy * K_OFF * sy0;
    sim._spin = { z: cl(shot.sx) };

    sim.step = function (n) {
      n = n || 1;
      while (n-- > 0 && !sim.done) {
        tick(sim.balls, sim.events, sim._spin);
        sim.ticks++;
        if (atRest(sim.balls) || sim.ticks >= MAXTICKS) sim.done = true;
      }
      return sim.done;
    };
    return sim;
  }

  /* The whole shot at once — what the host runs to judge, and what tests hammer. */
  function simulate(balls, shot) {
    var sim = stepper(balls, shot);
    while (!sim.done) sim.step(600);
    return { balls: sim.balls, events: sim.events, ticks: sim.ticks };
  }

  var PoolPhysics = {
    ENGINE: ENGINE,
    W: W, H: H, R: R,
    HEADSTRING: HEADSTRING, FOOTSPOT: FOOTSPOT,
    POCKETS: POCKETS,
    DT: DT, MAXTICKS: MAXTICKS,
    MINSPEED: MINSPEED, MAXSPEED: MAXSPEED,
    speedFor: speedFor,
    rackPositions: rackPositions,
    cueStart: cueStart,
    respotPosition: respotPosition,
    placeOK: placeOK,
    nearestPocket: nearestPocket,
    stepper: stepper,
    simulate: simulate,
  };

  global.PoolPhysics = PoolPhysics;
  if (typeof module !== 'undefined' && module.exports) module.exports = PoolPhysics;
})(typeof window !== 'undefined' ? window : globalThis);
