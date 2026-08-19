/* Duel — Flatland. The whole duel, flat.

   One powerup ('flatland') flips the round into a complete 2D side-view duel —
   a game inside the game, played in the spirit of the arena shooters it tips
   its hat to: springy little fighters, readable slow bullets, squash and
   stretch, knockback that matters.

   THE RULE THAT MAKES IT WORK: this sim reads the exact same stats sheet the
   3D game reads (shared/duel-powerups.js). Every powerup is already a pure
   sheet mutation, so "every powerup translated to 2D" is not eighty special
   cases — it is one simulation honouring one sheet. Homing homes, mortars arc,
   chickens bounce, bees swarm, thorns bite, Second Wind saves you on 1 HP,
   here exactly as up there.

   Trust model matches Duel's favor-the-shooter netcode: a fighter is either
   simulated (mine) or a puppet (theirs, position fed from the wire). My
   bullets hurt puppets and emit hit events for routing; replayed peer shots
   are cosmetic. Pure: no DOM, no THREE, deterministic under a seed.  */
(function (global) {
  'use strict';

  var VERSION = '2026-08-20-flatland-r1';

  /* ---- tuning: the feel lives here ---- */
  var GRAV = 30;              // u/s^2 — heavy enough to feel planted
  var JUMP_K = 1.5;           // sheet.jumpPower -> takeoff velocity
  var MOVE_K = 1.15;          // sheet.moveSpeed -> run speed
  var ACCEL = 60, AIR_ACCEL = 38, FRICTION = 42;
  var COYOTE = 0.09, JUMPBUF = 0.11;
  var BSPEED_K = 0.62;        // sheet.bulletSpeed -> 2D bullet speed (readable)
  var BSIZE_K = 1.7;          // sheet.bulletSize -> 2D radius
  var R_BODY = 0.62;          // base fighter radius at scale 1
  var DASH_V = 16, DASH_T = 0.14, DASH_CD = 2, BLINK_D = 3.4;
  var HITSTOP = 0.055;        // both parties freeze a breath on a landed hit

  /* ---- 2D arenas keyed to Duel's map ids ---- */
  var ARENAS = {
    table: {
      name: 'The Table', w: 30, h: 17, spawns: [-11, 11],
      plats: [ /* [cx, cy, hx, hy] */
        [0, -0.5, 15, 0.5],                 // floor
        [-15.4, 8, 0.4, 9], [15.4, 8, 0.4, 9],   // walls
        [0, 16.9, 15.9, 0.4],               // lid
        [-6.5, 3.2, 2.2, 0.35], [6.5, 3.2, 2.2, 0.35],
        [0, 6.4, 2.6, 0.35],
        [-12.6, 5.6, 1.5, 0.35], [12.6, 5.6, 1.5, 0.35]
      ]
    },
    grounds: {
      name: 'The Grounds', w: 44, h: 22, spawns: [-17, 17],
      plats: [
        [0, -0.5, 22, 0.5],
        [-22.4, 10.5, 0.4, 11.5], [22.4, 10.5, 0.4, 11.5],
        [0, 21.9, 22.9, 0.4],
        [0, 3.4, 3.4, 0.5],                 // the keep
        [-11, 5.4, 2.6, 0.35], [11, 5.4, 2.6, 0.35],
        [-17.5, 9.0, 2.0, 0.35], [17.5, 9.0, 2.0, 0.35],
        [0, 9.8, 2.2, 0.35],
        [-6, 13.4, 1.8, 0.3], [6, 13.4, 1.8, 0.3]
      ]
    }
  };
  function arenaFor(mapId) { return ARENAS[mapId] || ARENAS.table; }

  function seededRng(seed) {
    var x = (seed >>> 0) || 1;
    return function () {
      x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  /* ================= world ================= */
  function newWorld(mapId, seed) {
    return {
      map: mapId, arena: arenaFor(mapId), rng: seededRng(seed == null ? 1 : seed),
      t: 0, fighters: {}, order: [], bullets: [], events: [],
      hitstop: 0, shake: 0, detectOnly: false
    };
  }

  function addFighter(w, key, sheet, opts) {
    opts = opts || {};
    var f = {
      key: key, s: sheet, puppet: !!opts.puppet, team: opts.team || key,
      x: opts.x != null ? opts.x : 0, y: opts.y != null ? opts.y : 2,
      vx: 0, vy: 0, aim: 0, facing: 1,
      onGround: false, coyote: 0, jumpBuf: 0, jumpsLeft: sheet.extraJumps,
      dashCd: 0, dashT: 0, dashDir: 1,
      hp: sheet.hp, shield: sheet.shieldStart, alive: true,
      mag: sheet.magSize, reloading: 0, cd: 0, shotIndex: 0,
      quiet: 0, still: 0, airborneShot: false,
      poison: 0, poisonT: 0, burn: 0, burnT: 0, slowT: 0, slowK: 0,
      blindT: 0, spinT: 0, payback: false, secondWindUsed: false,
      aliveT: 0, zoomT: 0, zoomOn: 0, hicT: 1.2 + 1.6 * 0.5,
      squash: 0, stretch: 0, hurtT: 0, muzzleT: 0, popper: !!sheet.partyPopper,
      lastHitBy: null
    };
    w.fighters[key] = f;
    w.order.push(key);
    return f;
  }
  function removeFighter(w, key) {
    delete w.fighters[key];
    w.order = w.order.filter(function (k) { return k !== key; });
    w.bullets = w.bullets.filter(function (b) { return b.owner !== key; });
  }
  function setPuppet(w, key, x, y, aim, alive) {
    var f = w.fighters[key];
    if (!f) return;
    var dx = x - f.x;
    f.x = x; f.y = y; f.aim = aim || 0;
    if (Math.abs(dx) > 0.01) f.facing = dx > 0 ? 1 : -1;
    if (alive != null) f.alive = !!alive;
  }
  function radiusOf(f) { return R_BODY * f.s.scale; }

  /* ---- AABB world collision for a circle ---- */
  function collideCircle(w, f, r) {
    var hitG = false;
    for (var i = 0; i < w.arena.plats.length; i++) {
      var p = w.arena.plats[i];
      var nx = Math.max(p[0] - p[2], Math.min(f.x, p[0] + p[2]));
      var ny = Math.max(p[1] - p[3], Math.min(f.y, p[1] + p[3]));
      var dx = f.x - nx, dy = f.y - ny;
      var d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      var d = Math.sqrt(d2) || 0.0001;
      var push = r - d;
      var ux = dx / d, uy = dy / d;
      if (d2 < 1e-8) { ux = 0; uy = 1; }
      f.x += ux * push; f.y += uy * push;
      if (uy > 0.55) {                      // landed on top
        hitG = true;
        if (f.vy < 0) {
          if (f.s.floorBounce && f.vy < -9) { f.vy = -f.vy * 0.55; hitG = false; }
          else f.vy = 0;
        }
      } else if (uy < -0.55) { if (f.vy > 0) f.vy = 0; }
      else { f.vx = 0; }
    }
    return hitG;
  }

  /* ================= movement ================= */
  function effMove(f, w) {
    var m = f.s.moveSpeed * MOVE_K;
    if (f.s.crabMode) m *= 1.3;             // in Flatland, everything is sideways
    if (f.s.adrenaline && f.hp < 40) m *= 1.3;
    if (f.s.fastStart && f.aliveT < 3) m *= 1.5;
    if (f.zoomOn > 0) m *= 1.6;
    if (f.slowT > 0) m *= (1 - f.slowK);
    return m;
  }
  function effFireRate(f) {
    var r = f.s.fireRate;
    if (f.s.adrenaline && f.hp < 40) r *= 1.3;
    if (f.s.fastStart && f.aliveT < 3) r *= 1.5;
    return Math.min(14, r);
  }

  function input(w, key, inp) {
    var f = w.fighters[key];
    if (!f || f.puppet || !f.alive) return;
    f.inp = {
      mx: Math.max(-1, Math.min(1, inp.mx || 0)),
      jump: !!inp.jump, dash: !!inp.dash,
      aim: inp.aim != null ? inp.aim : f.aim,
      fire: !!inp.fire
    };
  }

  function stepFighter(w, f, dt) {
    if (!f.alive) return;
    f.aliveT += dt;
    var inp = f.inp || { mx: 0, jump: false, dash: false, aim: f.aim, fire: false };
    f.aim = inp.aim;
    if (Math.abs(inp.mx) > 0.05) f.facing = inp.mx > 0 ? 1 : -1;
    else f.facing = Math.cos(f.aim) >= 0 ? 1 : -1;

    /* zoomies: every few seconds you just go faster */
    if (f.s.zoomies) {
      f.zoomT -= dt;
      if (f.zoomT <= 0) {
        if (f.zoomOn > 0) { f.zoomOn = 0; f.zoomT = 2.4 + w.rng() * 2.4; }
        else { f.zoomOn = 1; f.zoomT = 1.1; w.events.push({ t: 'fx', kind: 'zoom', k: f.key }); }
      }
      if (f.zoomOn > 0) f.zoomOn = Math.max(0, f.zoomOn - 0); // flag, timed by zoomT
    }

    /* hiccups: a small involuntary hop now and then */
    if (f.s.hiccups) {
      f.hicT -= dt;
      if (f.hicT <= 0) {
        f.hicT = 1.6 + w.rng() * 2.2;
        f.vy = Math.max(f.vy, 5.5);
        f.onGround = false;
        w.events.push({ t: 'fx', kind: 'hiccup', k: f.key });
      }
    }

    var target = inp.mx * effMove(f, w);
    var acc = f.onGround ? ACCEL : AIR_ACCEL;
    if (Math.abs(inp.mx) < 0.05 && f.onGround) {
      var s = Math.sign(f.vx);
      f.vx -= s * Math.min(Math.abs(f.vx), FRICTION * dt);
    } else {
      if (f.vx < target) f.vx = Math.min(target, f.vx + acc * dt);
      else if (f.vx > target) f.vx = Math.max(target, f.vx - acc * dt);
    }

    /* stillness bookkeeping (Stand Your Ground) */
    if (Math.abs(f.vx) < 0.4 && f.onGround) f.still += dt; else f.still = 0;

    /* jumping: coyote + buffer + extra jumps */
    f.coyote = f.onGround ? COYOTE : Math.max(0, f.coyote - dt);
    f.jumpBuf = inp.jump && !f._jHeld ? JUMPBUF : Math.max(0, f.jumpBuf - dt);
    if (f.jumpBuf > 0) {
      var can = f.coyote > 0 || f.jumpsLeft > 0;
      if (can) {
        if (f.coyote <= 0) f.jumpsLeft--;
        f.vy = f.s.jumpPower * JUMP_K;
        f.coyote = 0; f.jumpBuf = 0; f.onGround = false;
        f.stretch = 1;
        w.events.push({ t: 'fx', kind: 'jump', k: f.key, honk: !!f.s.honk });
      }
    }
    f._jHeld = inp.jump;

    /* dash / blink */
    f.dashCd = Math.max(0, f.dashCd - dt);
    if (inp.dash && !f._dHeld && f.s.dashCharges > 0 && f.dashCd <= 0 && f.dashT <= 0) {
      f.dashCd = DASH_CD;
      f.dashDir = f.facing;
      if (f.s.dashTeleport) {
        var tx = f.x + f.dashDir * BLINK_D;
        var old = f.x; f.x = tx;
        collideCircle(w, f, radiusOf(f));
        w.events.push({ t: 'fx', kind: 'blink', k: f.key, from: old, to: f.x });
      } else {
        f.dashT = DASH_T;
        w.events.push({ t: 'fx', kind: 'dash', k: f.key });
      }
    }
    f._dHeld = inp.dash;
    if (f.dashT > 0) {
      f.dashT -= dt;
      f.vx = f.dashDir * DASH_V;
      f.vy = 0;
    } else {
      var g = GRAV * (f.vy < 0 ? f.s.fallFactor : 1);
      f.vy -= g * dt;
    }
    f.vy = Math.max(-38, f.vy);

    var wasAir = !f.onGround, vyBefore = f.vy;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.onGround = collideCircle(w, f, radiusOf(f));
    if (f.onGround) {
      f.jumpsLeft = f.s.extraJumps;
      if (wasAir && vyBefore < -7) {
        f.squash = Math.min(1, -vyBefore / 22);
        w.events.push({ t: 'fx', kind: 'land', k: f.key, hard: vyBefore < -14 });
      }
    }
    f.squash = Math.max(0, f.squash - dt * 5);
    f.stretch = Math.max(0, f.stretch - dt * 5);
    f.hurtT = Math.max(0, f.hurtT - dt);
    f.muzzleT = Math.max(0, f.muzzleT - dt);

    /* dot effects, regen, shield */
    f.quiet += dt;
    if (f.poisonT > 0) { f.poisonT -= dt; hurtRaw(w, f, f.poison * dt, f.lastHitBy, 'poison'); }
    if (f.burnT > 0) { f.burnT -= dt; hurtRaw(w, f, f.burn * dt, f.lastHitBy, 'burn'); }
    f.slowT = Math.max(0, f.slowT - dt);
    f.blindT = Math.max(0, f.blindT - dt);
    f.spinT = Math.max(0, f.spinT - dt);
    if (f.s.regen > 0 && f.quiet > f.s.regenDelay && f.hp < f.s.hp) {
      f.hp = Math.min(f.s.hp, f.hp + f.s.regen * dt);
    }
    if (f.s.shieldRegen > 0 && f.quiet > 3 && f.shield < f.s.shieldStart) {
      f.shield = Math.min(f.s.shieldStart, f.shield + f.s.shieldRegen * dt);
    }

    /* gun cooldown + reload */
    f.cd = Math.max(0, f.cd - dt);
    if (f.reloading > 0) {
      f.reloading -= dt;
      if (f.reloading <= 0) { f.mag = f.s.magSize; f.shotIndex = 0; w.events.push({ t: 'fx', kind: 'reloaded', k: f.key }); }
    }

    /* sneeze: sometimes the whole mag goes at once */
    if (f.s.sneezeChance > 0 && f.inp && f.inp.fire && f.mag > 1 && f.reloading <= 0 &&
        f.cd <= 0 && w.rng() < f.s.sneezeChance * dt * 6) {
      var dump = f.mag;
      for (var i = 0; i < dump; i++) fireOne(w, f, (w.rng() - 0.5) * 0.5);
      w.events.push({ t: 'fx', kind: 'sneeze', k: f.key });
      startReload(w, f);
    } else if (f.inp && f.inp.fire) {
      tryFire(w, f);
    }
  }

  /* ================= shooting ================= */
  function startReload(w, f) {
    if (f.s.noReload) { f.mag = f.s.magSize; f.shotIndex = 0; return; }
    var t = f.s.reloadTime;
    if (f.s.emptyReload && f.mag === 0) t *= 0.5;
    f.reloading = t;
    if (f.s.hornBlast) {
      w.events.push({ t: 'fx', kind: 'horn', k: f.key });
      eachOther(w, f, function (o) {
        var dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy);
        if (d < 5 && !o.s.kbImmune) { o.vx += (dx / (d || 1)) * 14; o.vy += 6; }
      });
    }
  }

  function tryFire(w, f) {
    if (f.cd > 0 || f.reloading > 0 || !f.alive) return false;
    if (f.mag <= 0) { startReload(w, f); return false; }
    fireVolley(w, f);
    return true;
  }

  function fireVolley(w, f) {
    var s = f.s;
    f.cd = 1 / effFireRate(f);
    var n = s.bulletCount;
    var first = f.shotIndex === 0;
    var last = f.mag === 1;
    for (var i = 0; i < n; i++) {
      var off = n === 1 ? 0 : (i - (n - 1) / 2) * (s.spread * 3 + 0.04);
      fireOne(w, f, off + (w.rng() - 0.5) * s.spread * 2, { first: first, last: last });
    }
    f.mag--; f.shotIndex++;
    f.muzzleT = 0.07;
    if (s.muleKick > 0) { f.vx -= Math.cos(f.aim) * s.muleKick; f.vy -= Math.sin(f.aim) * s.muleKick * 0.4; }
    w.events.push({ t: 'shot', k: f.key, aim: f.aim, n: n, first: first, last: last });
    if (f.popper) {
      f.popper = false;
      for (var c = 0; c < 8; c++) spawnB(w, f, f.aim + (w.rng() - 0.5) * 1.6, { cosmetic: true, style: 'confetti', life: 0.9 });
      w.events.push({ t: 'fx', kind: 'popper', k: f.key });
    }
    if (s.echo) {
      f.echoAt = w.t + 0.22; f.echoAim = f.aim; f.echoFirst = first; f.echoLast = last;
    }
    if (f.mag <= 0) startReload(w, f);
  }

  function fireOne(w, f, aimOff, flags) {
    spawnB(w, f, f.aim + aimOff, {
      first: flags && flags.first, last: flags && flags.last
    });
  }

  function spawnB(w, f, ang, opts) {
    opts = opts || {};
    var s = f.s;
    var spd = s.bulletSpeed * BSPEED_K * (opts.speedK || 1);
    var r = radiusOf(f);
    var b = {
      owner: f.key, team: f.team, cosmetic: !!opts.cosmetic,
      x: f.x + Math.cos(ang) * (r + 0.25), y: f.y + Math.sin(ang) * (r + 0.25),
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      r: Math.min(1.4, s.bulletSize * BSIZE_K * (opts.sizeK || 1)),
      life: opts.life != null ? opts.life : ((s.boomerang && !opts.noBoomer) ? 5.5 : 3.2),
      bounces: (opts.noBounce ? 0 : s.bounces) + ((s.boomerang && !opts.noBoomer) ? 2 : 0), bounced: 0,
      style: opts.style || s.bulletStyle,
      first: !!opts.first, last: !!opts.last, air: !f.onGround,
      split: opts.noSplit ? 0 : s.splitCount, splitAt: 0.32,
      boomer: s.boomerang && !opts.noBoomer, phaseT: 0,
      orbitT: (s.orbit && !opts.noOrbit) ? 0.5 : 0, ocx: f.x, ocy: f.y, oa: ang,
      trail: []
    };
    if (b.orbitT > 0) { b.vx = 0; b.vy = 0; }
    if (w.bullets.length > 240) w.bullets.splice(0, w.bullets.length - 240);
    w.bullets.push(b);
    return b;
  }

  /* peer shot replay: cosmetic bullets from the wire */
  function spawnShot(w, key, ox, oy, angs, opts) {
    var f = w.fighters[key];
    if (!f) return;
    (angs || []).forEach(function (a) {
      var b = spawnB(w, f, a, { cosmetic: true });
      b.x = ox + Math.cos(a) * 0.4; b.y = oy + Math.sin(a) * 0.4;
    });
    f.muzzleT = 0.07;
  }

  function eachOther(w, f, fn) {
    w.order.forEach(function (k) {
      var o = w.fighters[k];
      if (o && o !== f && o.alive && o.team !== f.team) fn(o);
    });
  }
  function nearestEnemy(w, b) {
    var best = null, bd = 1e9;
    w.order.forEach(function (k) {
      var o = w.fighters[k];
      if (!o || !o.alive || o.team === b.team) return;
      var d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }

  function stepBullet(w, b, dt) {
    var f = w.fighters[b.owner];
    var s = f ? f.s : null;
    if (!s) { b.life = 0; return; }

    if (b.orbitT > 0) {                     // Disco Inferno: one lap, then launch
      b.orbitT -= dt;
      var prog = 1 - b.orbitT / 0.5;
      var a = b.oa + prog * Math.PI * 2;
      b.x = (f ? f.x : b.ocx) + Math.cos(a) * 1.6;
      b.y = (f ? f.y : b.ocy) + Math.sin(a) * 1.6;
      if (b.orbitT <= 0) {
        var spd = s.bulletSpeed * BSPEED_K;
        b.vx = Math.cos(b.oa) * spd; b.vy = Math.sin(b.oa) * spd;
      }
      return;
    }

    b.life -= dt;
    if (b.grown == null) b.grown = 0;
    if (s.grow > 0) { b.grown += dt; b.r = Math.min(1.6, b.r + s.grow * dt * 1.6); }
    if (s.wobble > 0) {
      var wob = Math.sin((b.life * 17) + b.x) * s.wobble;
      var pv = Math.hypot(b.vx, b.vy) || 1;
      b.vx += (-b.vy / pv) * wob * dt * 10;
      b.vy += (b.vx / pv) * wob * dt * 10;
    }
    b.vy -= s.bulletGravity * BSPEED_K * dt * 1.6;
    if (s.homing > 0 || (b.bounced > 0 && s.homingAfterBounce)) {
      var tgt = nearestEnemy(w, b);
      if (tgt) {
        var hp = s.homing > 0 ? s.homing : 2.2;
        var want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        var cur = Math.atan2(b.vy, b.vx);
        var diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        var turn = Math.max(-hp * dt, Math.min(hp * dt, diff));
        var sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
      }
    }
    if (b.boomer) {
      b.boomT = (b.boomT || 0) + dt;
      if (b.boomT > 0.45 && f && f.alive) {
        var wantB = Math.atan2(f.y - b.y, f.x - b.x);
        var spB = Math.hypot(b.vx, b.vy);
        var curB = Math.atan2(b.vy, b.vx);
        var diffB = Math.atan2(Math.sin(wantB - curB), Math.cos(wantB - curB));
        var homeD = Math.hypot(f.x - b.x, f.y - b.y);
        var rate = homeD < 4 ? 22 : 7;      /* snap home when close, or it orbits forever */
        var turnB = Math.max(-rate * dt, Math.min(rate * dt, diffB));
        b.vx = Math.cos(curB + turnB) * spB; b.vy = Math.sin(curB + turnB) * spB;
        /* catch it to refund the round — a generous hand */
        if (b.boomT > 0.6 && homeD < radiusOf(f) + b.r + 0.9) {
          if (!b.cosmetic) { f.mag = Math.min(f.s.magSize, f.mag + 1); w.events.push({ t: 'fx', kind: 'catch', k: f.key }); }
          b.life = 0; return;
        }
      }
    }

    /* split mid-flight */
    if (b.split > 0) {
      b.splitAt -= dt;
      if (b.splitAt <= 0) {
        var base = Math.atan2(b.vy, b.vx);
        for (var i = 0; i < b.split; i++) {
          var na = base + (i - (b.split - 1) / 2 === 0 ? 0.28 : (i % 2 ? 0.28 : -0.28)) * (1 + (i >> 1));
          var nb = spawnB(w, f, na, { cosmetic: b.cosmetic, noSplit: true, noOrbit: true, noBoomer: true });
          nb.x = b.x; nb.y = b.y;
        }
        b.split = 0;
        w.events.push({ t: 'fx', kind: 'split', x: b.x, y: b.y });
      }
    }

    var px = b.x, py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.trail.push([px, py]);
    if (b.trail.length > 7) b.trail.shift();

    /* world */
    var homing_home = b.boomer && (b.boomT || 0) > 0.45;   /* the return leg comes home through anything */
    if (!s.phase && !homing_home) {
      for (var pi = 0; pi < w.arena.plats.length; pi++) {
        var p = w.arena.plats[pi];
        if (Math.abs(b.x - p[0]) < p[2] + b.r && Math.abs(b.y - p[1]) < p[3] + b.r) {
          if (s.burstOnWall && !b.burst && !b.cosmetic) {
            b.burst = true;
            var baseA = Math.atan2(-b.vy, -b.vx);
            for (var bi = 0; bi < 4; bi++) {
              var pb = spawnB(w, f, baseA + (bi - 1.5) * 0.5, { noBounce: true, noSplit: true, noOrbit: true, noBoomer: true, sizeK: 0.7 });
              pb.x = px; pb.y = py; pb.burst = true; pb.life = Math.min(pb.life, 1.4);
            }
          }
          if (b.bounces > 0 || b.boomer) {
            if (b.bounces > 0) b.bounces--;
            b.bounced++;
            var ox = Math.abs(b.x - p[0]) / (p[2] + b.r);
            var oy = Math.abs(b.y - p[1]) / (p[3] + b.r);
            if (ox > oy) b.vx = -b.vx; else b.vy = -b.vy;
            if (!s.keepSpeedOnBounce) { b.vx *= 0.82; b.vy *= 0.82; }
            b.x = px; b.y = py;
            w.events.push({ t: 'fx', kind: 'bounce', x: b.x, y: b.y });
          } else {
            if (s.explosionRadius > 0 && !b.cosmetic) explode(w, b, f);
            b.life = 0;
            w.events.push({ t: 'fx', kind: 'wallhit', x: b.x, y: b.y });
            return;
          }
        }
      }
    }
    /* hard bounds even for phase */
    var A = w.arena;
    if (b.x < -A.w / 2 - 2 || b.x > A.w / 2 + 2 || b.y < -3 || b.y > A.h + 3) { b.life = 0; return; }

    /* fighters */
    if (!b.cosmetic) {
      var hitDone = false;
      w.order.forEach(function (k) {
        if (hitDone) return;
        var o = w.fighters[k];
        if (!o || !o.alive || o.team === b.team) return;
        if (Math.hypot(o.x - b.x, o.y - b.y) < radiusOf(o) + b.r) {
          landHit(w, b, f, o);
          hitDone = true;
        }
      });
      if (hitDone) return;
    }
  }

  function explode(w, b, f) {
    var s = f.s;
    var R = s.explosionRadius * 1.35;
    w.events.push({ t: 'fx', kind: 'boom', x: b.x, y: b.y, r: R });
    w.shake = Math.min(1, w.shake + 0.5);
    eachOther(w, f, function (o) {
      var d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < R + radiusOf(o)) {
        if (w.detectOnly) w.events.push({ t: 'contact', k: o.key, by: f.key, x: b.x, y: b.y,
          bounced: b.bounced, first: !!b.first, last: !!b.last, air: !!b.air, blast: true });
        else dealDamage(w, f, o, 0.8, b, true);
      }
    });
    /* Rocket Boots: the blast shoves the shooter too */
    if (s.selfPush) {
      var sd = Math.hypot(f.x - b.x, f.y - b.y);
      if (sd < R + radiusOf(f) + 0.6) {
        var ux = (f.x - b.x) / (sd || 1), uy = (f.y - b.y) / (sd || 1);
        f.vx += ux * 13; f.vy += Math.max(6, uy * 13);
        f.onGround = false;
      }
    }
    if (s.clusterCount > 0 && !b.clustered) {
      for (var i = 0; i < s.clusterCount; i++) {
        var ca = Math.PI * (0.15 + 0.7 * (i / Math.max(1, s.clusterCount - 1)));
        var cb = spawnB(w, f, ca, { noSplit: true, noOrbit: true, noBoomer: true, sizeK: 0.6, speedK: 0.55, noBounce: true });
        cb.x = b.x; cb.y = b.y + 0.2; cb.clusteredChild = true; cb.life = 1.1;
        cb.vy = Math.abs(cb.vy) + 3;
        cb.gravLocal = true;
      }
    }
  }

  /* ---- damage: the 3D game's semantics, honoured flat ---- */
  function computeDamage(w, sh, vic, b, scale) {
    var s = sh.s, dmg = s.damage * (scale || 1);
    if (b && b.first) dmg *= 1 + s.firstShotBonus;
    if (b && b.last) dmg *= 1 + s.lastShotBonus;
    if (b && b.bounced > 0 && s.bounceBonus) dmg *= 1.75;
    if (s.dice) dmg *= 0.25 + w.rng() * 2.25;
    var crit = s.crit > 0 && w.rng() < s.crit;
    if (crit) dmg *= 2;
    if (s.rage && sh.hp < 30) dmg *= 1.45;
    if (s.execute && vic.hp < vic.s.hp * 0.35) dmg *= 1.6;
    if (s.momentum) dmg *= 1 + Math.min(0.6, sh.aliveT * 0.04);
    if (s.airShot && !sh.onGround) dmg *= 1.4;
    if (sh.payback) { dmg *= 1.8; sh.payback = false; }
    if (vic.s.stillGuard && vic.still > 0.25) dmg *= 0.7;
    if (vic.s.dmgResist > 0) dmg *= 1 - vic.s.dmgResist;
    return { dmg: dmg, crit: crit };
  }

  function landHit(w, b, sh, vic) {
    if (w.detectOnly) {
      w.events.push({ t: 'contact', k: vic.key, by: sh.key, x: b.x, y: b.y,
        bounced: b.bounced, first: !!b.first, last: !!b.last, air: !!b.air, blast: false });
      if (sh.s.explosionRadius > 0) { explode(w, b, sh); }
      b.life = 0;
      w.hitstop = HITSTOP;
      w.shake = Math.min(1, w.shake + 0.3);
      return;
    }
    if (vic.s.deflect > 0 && w.rng() < vic.s.deflect) {
      b.vx = -b.vx * 0.6; b.vy = Math.abs(b.vy) * 0.6 + 2;
      b.team = vic.team; b.bounces = 0; b.life = Math.min(b.life, 0.5);
      w.events.push({ t: 'fx', kind: 'deflect', k: vic.key, x: b.x, y: b.y });
      return;
    }
    if (b && sh.s.explosionRadius > 0) { explode(w, b, sh); b.life = 0; return; }
    dealDamage(w, sh, vic, 1, b, false);
    b.life = 0;
  }

  function dealDamage(w, sh, vic, scale, b, isBlast) {
    var out = computeDamage(w, sh, vic, isBlast ? null : b, scale);
    var s = sh.s;
    hurt(w, vic, out.dmg, sh, out.crit);
    if (vic.alive) {
      if (s.pickpocket && vic.mag > 0) { vic.mag--; sh.mag = Math.min(s.magSize, sh.mag + 1); }
      if (s.poison > 0) { vic.poison = s.poison; vic.poisonT = Math.max(vic.poisonT, s.poisonDur); }
      if (s.burn > 0) { vic.burn = s.burn; vic.burnT = Math.max(vic.burnT, s.burnDur); }
      if (s.slowOnHit > 0) { vic.slowK = s.slowOnHit; vic.slowT = Math.max(vic.slowT, s.slowDur); }
      if (s.blindDur > 0) vic.blindT = Math.max(vic.blindT, s.blindDur);
      if (s.spinOnHit > 0) vic.spinT = Math.max(vic.spinT, 0.7);
      if (vic.s.payback) vic.payback = true;   /* their next shot bites back */
    }
    /* knockback / pull / launch */
    var dx = vic.x - (b ? b.x : sh.x), dy = vic.y - (b ? b.y : sh.y);
    var d = Math.hypot(dx, dy) || 1;
    if (!vic.s.kbImmune) {
      var kb = s.knockback * 0.55;
      if (s.pull) { vic.vx -= (dx / d) * 9; vic.vy += 1; }
      else { vic.vx += (dx / d) * kb; vic.vy += Math.abs(dy / d) * kb * 0.4 + kb * 0.18; }
      if (s.launchUp > 0) { vic.vy = Math.max(vic.vy, s.launchUp * 1.6); vic.onGround = false; }
    }
    if (s.lifesteal > 0) sh.hp = Math.min(sh.s.hp, sh.hp + out.dmg * s.lifesteal);
    if (s.refundOnHit) sh.mag = Math.min(s.magSize, sh.mag + 1);
    /* thorns bite back */
    if (vic.s.thorns > 0 && !isBlast) hurtRaw(w, sh, out.dmg * vic.s.thorns, vic.key, 'thorns');
    w.hitstop = HITSTOP;
    w.shake = Math.min(1, w.shake + (out.crit ? 0.6 : 0.3));
    w.events.push({ t: 'hit', k: vic.key, by: sh.key, dmg: out.dmg, crit: out.crit,
      x: vic.x, y: vic.y, blast: !!isBlast });
  }

  function hurt(w, f, dmg, by, crit) {
    f.lastHitBy = by ? by.key : f.lastHitBy;
    f.quiet = 0; f.hurtT = 0.18;
    if (f.shield > 0) {
      var absorbed = Math.min(f.shield, dmg);
      f.shield -= absorbed; dmg -= absorbed;
      if (absorbed > 0) w.events.push({ t: 'fx', kind: 'shield', k: f.key });
    }
    if (dmg <= 0) return;
    hurtRaw(w, f, dmg, by ? by.key : null, crit ? 'crit' : 'hit');
  }

  function hurtRaw(w, f, dmg, byKey, kind) {
    if (!f.alive || dmg <= 0) return;
    f.hp -= dmg;
    if (f.hp <= 0) {
      if (f.s.secondWind && !f.secondWindUsed) {
        f.secondWindUsed = true; f.hp = 1;
        w.events.push({ t: 'fx', kind: 'secondwind', k: f.key });
      } else {
        f.hp = 0; f.alive = false;
        w.events.push({ t: 'death', k: f.key, by: byKey });
        w.shake = 1;
      }
    }
  }

  /* ================= step ================= */
  function step(w, dt) {
    w.events = [];
    if (w.hitstop > 0) {                    // the whole world holds its breath
      w.hitstop -= dt;
      w.shake = Math.max(0, w.shake - dt * 2.4);
      return w.events;
    }
    w.t += dt;
    w.shake = Math.max(0, w.shake - dt * 2.4);
    w.order.forEach(function (k) {
      var f = w.fighters[k];
      if (!f) return;
      if (f.puppet) {
        f.squash = Math.max(0, f.squash - dt * 5);
        f.hurtT = Math.max(0, f.hurtT - dt);
        f.muzzleT = Math.max(0, f.muzzleT - dt);
        return;
      }
      stepFighter(w, f, dt);
      /* echo: a free ghost of the last shot */
      if (f.echoAt && w.t >= f.echoAt && f.alive) {
        var ea = f.echoAim; f.echoAt = 0;
        var eb = spawnB(w, f, ea, { first: f.echoFirst, last: f.echoLast, noOrbit: true });
        w.events.push({ t: 'echoshot', k: f.key, aim: ea });
      }
    });
    for (var i = w.bullets.length - 1; i >= 0; i--) {
      var b = w.bullets[i];
      if (b.gravLocal) b.vy -= GRAV * 0.6 * dt;
      stepBullet(w, b, dt);
      if (b.life <= 0) w.bullets.splice(i, 1);
    }
    return w.events;
  }

  /* ================= the practice opponent ================= */
  function botThink(w, key, level, st) {
    var f = w.fighters[key];
    if (!f || !f.alive) return { mx: 0, jump: false, dash: false, aim: 0, fire: false };
    st = st || {};
    var foe = nearestEnemy(w, { team: f.team, x: f.x, y: f.y });
    if (!foe) return { mx: 0, jump: false, dash: false, aim: f.aim, fire: false };
    var dx = foe.x - f.x, dy = foe.y - f.y;
    var lead = Math.min(0.5, Math.hypot(dx, dy) / (f.s.bulletSpeed * BSPEED_K + 1)) * (level >= 5 ? 1 : 0.4);
    var aim = Math.atan2(dy + foe.vy * lead, dx + foe.vx * lead) +
      (w.rng() - 0.5) * (0.5 - Math.min(0.42, level * 0.045));
    var wantD = 6 + (f.s.bulletSpeed < 14 ? -2 : 0);
    var d = Math.hypot(dx, dy);
    var mx = 0;
    if (d > wantD + 1.5) mx = Math.sign(dx);
    else if (d < wantD - 1.5) mx = -Math.sign(dx);
    else mx = (st.strafe || 1) * 0.8;
    if (w.rng() < 0.02) st.strafe = -(st.strafe || 1);
    var jump = (foe.y > f.y + 1 && w.rng() < 0.1) || (w.rng() < 0.02) ||
      (Math.abs(f.vx) < 0.2 && Math.abs(mx) > 0 && w.rng() < 0.25);
    var dash = f.hp < 35 && w.rng() < 0.05;
    var fire = d < 24 && w.rng() < (0.25 + level * 0.07);
    return { mx: mx, jump: jump, dash: dash, aim: aim, fire: fire };
  }

  var api = {
    VERSION: VERSION, ARENAS: ARENAS, arenaFor: arenaFor,
    GRAV: GRAV, R_BODY: R_BODY,
    newWorld: newWorld, addFighter: addFighter, removeFighter: removeFighter,
    setPuppet: setPuppet, input: input, step: step,
    tryFire: tryFire, spawnShot: spawnShot,
    radiusOf: radiusOf, botThink: botThink, seededRng: seededRng
  };
  global.FlatDuel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
