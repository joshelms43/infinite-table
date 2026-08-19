/* Duel — Flatland renderer. One canvas-2D pipeline, drawn identically by the
   live page and the headless render tool, so what gets evaluated is what ships.

   The look: the house palette wearing an arena-brawler's grin. Chunky rounded
   fighters with a visor and a gun, thick outlines, squash and stretch, slow
   readable bullets with trails, a camera that breathes — zooming to hold both
   fighters like a spectator leaning in. */
(function (global) {
  'use strict';

  var VERSION = '2026-08-20-flatrender-r1';

  var PAL = {
    skyTop: '#182420', skyBot: '#0E1613',
    grid: 'rgba(242,238,226,0.045)',
    timber: '#4A3B28', timberEdge: '#241A0F', timberTop: '#6B563A',
    felt: '#1E3A32', feltEdge: '#101F1B',
    coral: '#E26A4B', coralDeep: '#B24A31',
    teal: '#3B8B82', tealDeep: '#256158',
    bone: '#F2EEE2', ink: '#10100E',
    gold: '#E8C57A', warn: '#D9A03F'
  };

  function newView() {
    return {
      cam: { x: 0, y: 5, z: 24, tx: 0, ty: 5, tz: 24 },
      parts: [], pops: [], flashT: 0, t: 0
    };
  }

  /* ---- events -> juice. Shared so the page and the tool feel the same. ---- */
  function feed(view, events, w) {
    events.forEach(function (e) {
      if (e.t === 'fx' && e.kind === 'land') burst(view, fighterX(w, e.k), fighterY(w, e.k) - 0.5, e.hard ? 8 : 4, PAL.bone, 0.5, 3);
      if (e.t === 'fx' && e.kind === 'jump') ringAt(view, fighterX(w, e.k), fighterY(w, e.k) - 0.4, 0.5, PAL.bone, 0.25);
      if (e.t === 'fx' && e.kind === 'dash') burst(view, fighterX(w, e.k), fighterY(w, e.k), 6, PAL.bone, 0.3, 5);
      if (e.t === 'fx' && e.kind === 'blink') { ringAt(view, e.from, fighterY(w, e.k), 0.8, PAL.gold, 0.3); ringAt(view, e.to, fighterY(w, e.k), 0.8, PAL.gold, 0.3); }
      if (e.t === 'fx' && e.kind === 'boom') { ringAt(view, e.x, e.y, e.r, PAL.warn, 0.45); burst(view, e.x, e.y, 12, PAL.gold, 0.6, 7); view.flashT = Math.max(view.flashT, 0.06); }
      if (e.t === 'fx' && e.kind === 'bounce') burst(view, e.x, e.y, 3, PAL.gold, 0.25, 4);
      if (e.t === 'fx' && e.kind === 'wallhit') burst(view, e.x, e.y, 4, PAL.bone, 0.3, 4);
      if (e.t === 'fx' && e.kind === 'catch') ringAt(view, fighterX(w, e.k), fighterY(w, e.k), 1.0, PAL.gold, 0.35);
      if (e.t === 'fx' && e.kind === 'deflect') ringAt(view, e.x, e.y, 0.7, PAL.bone, 0.3);
      if (e.t === 'fx' && e.kind === 'shield') ringAt(view, fighterX(w, e.k), fighterY(w, e.k), 1.1, '#7FB6DE', 0.3);
      if (e.t === 'fx' && e.kind === 'secondwind') ringAt(view, fighterX(w, e.k), fighterY(w, e.k), 1.4, PAL.gold, 0.6);
      if (e.t === 'fx' && e.kind === 'horn') ringAt(view, fighterX(w, e.k), fighterY(w, e.k), 2.2, PAL.warn, 0.4);
      if (e.t === 'fx' && e.kind === 'sneeze') burst(view, fighterX(w, e.k), fighterY(w, e.k), 10, PAL.bone, 0.4, 6);
      if (e.t === 'fx' && e.kind === 'popper') burst(view, fighterX(w, e.k), fighterY(w, e.k), 14, null, 0.8, 6);
      if (e.t === 'fx' && e.kind === 'split') burst(view, e.x, e.y, 5, PAL.gold, 0.3, 5);
      if (e.t === 'hit' || e.t === 'contact') {
        burst(view, e.x, e.y, e.crit ? 10 : 6, e.crit ? PAL.gold : PAL.bone, 0.4, 6);
        if (e.dmg != null) pop(view, e.x, e.y, Math.round(e.dmg), !!e.crit);
      }
      if (e.t === 'death') {
        burst(view, fighterX(w, e.k), fighterY(w, e.k), 22, null, 1.0, 9);
        view.flashT = Math.max(view.flashT, 0.09);
      }
    });
  }
  function fighterX(w, k) { var f = w.fighters[k]; return f ? f.x : 0; }
  function fighterY(w, k) { var f = w.fighters[k]; return f ? f.y : 0; }
  var CONF = [PAL.coral, PAL.teal, PAL.gold, '#5BB7E0', PAL.bone];
  function burst(view, x, y, n, color, life, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
      view.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2,
        life: life * (0.6 + Math.random() * 0.7), max: life,
        c: color || CONF[i % CONF.length], r: 0.09 + Math.random() * 0.12 });
    }
  }
  function ringAt(view, x, y, r, c, life) {
    view.parts.push({ ring: true, x: x, y: y, r0: r * 0.3, r1: r * 1.9, life: life, max: life, c: c });
  }
  function pop(view, x, y, n, crit) {
    view.pops.push({ x: x + (Math.random() - 0.5) * 0.6, y: y + 0.8, n: n, crit: crit, life: 0.7, max: 0.7 });
  }

  function stepView(view, w, dt, fitKeys) {
    view.t += dt;
    /* the camera leans in: hold every living fighter with padding */
    var xs = [], ys = [];
    (fitKeys || w.order).forEach(function (k) {
      var f = w.fighters[k];
      if (f && f.alive) { xs.push(f.x); ys.push(f.y); }
    });
    if (!xs.length) { xs = [0]; ys = [5]; }
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    view.cam.tx = (minX + maxX) / 2;
    view.cam.ty = (minY + maxY) / 2 + 1.2;
    var need = Math.max(maxX - minX + 14, (maxY - minY + 10) * (16 / 9), 18);
    view.cam.tz = Math.min(need, w.arena.w + 4);
    var L = 1 - Math.pow(0.0008, dt);
    view.cam.x += (view.cam.tx - view.cam.x) * L;
    view.cam.y += (view.cam.ty - view.cam.y) * L;
    view.cam.z += (view.cam.tz - view.cam.z) * L;
    /* clamp inside the arena so walls stay walls */
    var half = view.cam.z / 2;
    view.cam.x = Math.max(-w.arena.w / 2 + half - 2, Math.min(w.arena.w / 2 - half + 2, view.cam.x)) || view.cam.x;

    for (var i = view.parts.length - 1; i >= 0; i--) {
      var p = view.parts[i];
      p.life -= dt;
      if (!p.ring) { p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.life <= 0) view.parts.splice(i, 1);
    }
    for (var j = view.pops.length - 1; j >= 0; j--) {
      var q = view.pops[j];
      q.life -= dt; q.y += dt * 1.6;
      if (q.life <= 0) view.pops.splice(j, 1);
    }
    view.flashT = Math.max(0, view.flashT - dt);
  }

  /* ---- draw ---- */
  function draw(ctx, W, H, w, view, opts) {
    opts = opts || {};
    var cam = view.cam;
    var scale = W / cam.z;
    var shx = (Math.random() - 0.5) * w.shake * 14, shy = (Math.random() - 0.5) * w.shake * 10;

    /* sky */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.skyTop); g.addColorStop(1, PAL.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2 + shx, H / 2 + shy);
    ctx.scale(scale, -scale);
    ctx.translate(-cam.x, -cam.y);
    ctx.lineJoin = 'round';

    /* motion grid */
    ctx.strokeStyle = PAL.grid; ctx.lineWidth = 0.04;
    var A = w.arena;
    for (var gx = Math.ceil(-A.w / 2 / 3) * 3; gx <= A.w / 2; gx += 3) {
      line(ctx, gx, -1, gx, A.h);
    }
    for (var gy = 0; gy <= A.h; gy += 3) line(ctx, -A.w / 2, gy, A.w / 2, gy);

    /* platforms */
    A.plats.forEach(function (p, i) {
      var x = p[0] - p[2], y = p[1] - p[3], pw = p[2] * 2, ph = p[3] * 2;
      var floorish = ph > pw;
      ctx.fillStyle = PAL.timberEdge;
      rr(ctx, x - 0.14, y - 0.14, pw + 0.28, ph + 0.28, 0.3); ctx.fill();
      ctx.fillStyle = i === 0 ? PAL.felt : PAL.timber;
      rr(ctx, x, y, pw, ph, 0.22); ctx.fill();
      /* top light */
      ctx.fillStyle = i === 0 ? '#2A4A40' : PAL.timberTop;
      rr(ctx, x + 0.1, y + ph - 0.34, pw - 0.2, 0.26, 0.12); ctx.fill();
    });

    /* bullets under fighters */
    w.bullets.forEach(function (b) { drawBullet(ctx, b, view); });

    /* fighters */
    w.order.forEach(function (k) {
      var f = w.fighters[k];
      if (f) drawFighter(ctx, f, view, opts);
    });

    /* particles */
    view.parts.forEach(function (p) {
      var a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.ring) {
        var rr2 = p.r0 + (p.r1 - p.r0) * (1 - a);
        ctx.strokeStyle = p.c; ctx.lineWidth = 0.12 + 0.1 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr2, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a), 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    /* damage pops in screen space, upright */
    view.pops.forEach(function (q) {
      var sx = (q.x - cam.x) * scale + W / 2 + shx;
      var sy = H / 2 - (q.y - cam.y) * scale + shy;
      var a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      ctx.font = '700 ' + Math.round((q.crit ? 0.86 : 0.6) * scale) + 'px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(2, scale * 0.1);
      ctx.strokeStyle = PAL.ink;
      ctx.strokeText(String(q.n), sx, sy);
      ctx.fillStyle = q.crit ? PAL.gold : PAL.bone;
      ctx.fillText(String(q.n), sx, sy);
    });
    ctx.globalAlpha = 1;

    if (view.flashT > 0) {
      ctx.globalAlpha = Math.min(0.5, view.flashT * 6);
      ctx.fillStyle = PAL.bone; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function rr(ctx, x, y, w2, h, r) {
    r = Math.min(r, w2 / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w2, y, x + w2, y + h, r);
    ctx.arcTo(x + w2, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w2, y, r);
    ctx.closePath();
  }

  function drawFighter(ctx, f, view, opts) {
    var r = 0.62 * f.s.scale;
    var team = f.team === 'teal' || (opts.teamOf && opts.teamOf(f.key) === 'teal');
    var body = f.alive ? (team ? PAL.teal : PAL.coral) : '#3A3A36';
    var deep = team ? PAL.tealDeep : PAL.coralDeep;

    var sq = 1 + f.squash * 0.45 - f.stretch * 0.28;
    var st = 1 - f.squash * 0.35 + f.stretch * 0.35 + Math.min(0.18, Math.abs(f.vy) * 0.008);

    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.spinT > 0) ctx.rotate(f.spinT * 12);
    ctx.scale(sq, st);

    if (!f.alive) ctx.globalAlpha = 0.35;

    /* body */
    ctx.fillStyle = PAL.ink;
    ctx.beginPath(); ctx.arc(0, 0, r + 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.hurtT > 0 ? PAL.bone : body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    /* belly shade */
    ctx.fillStyle = deep;
    ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.78, Math.PI, 0, true); ctx.fill();
    ctx.globalAlpha = f.alive ? 1 : 0.35;

    /* gun along the aim */
    var ax = Math.cos(f.aim), ay = Math.sin(f.aim);
    ctx.save();
    ctx.rotate(f.aim);
    ctx.fillStyle = PAL.ink;
    rr(ctx, r * 0.25, -0.13, r * 1.15, 0.26, 0.1); ctx.fill();
    ctx.fillStyle = '#54514A';
    rr(ctx, r * 0.3, -0.09, r * 1.02, 0.18, 0.08); ctx.fill();
    if (f.muzzleT > 0) {
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.moveTo(r * 1.45, 0);
      ctx.lineTo(r * 1.95, 0.2); ctx.lineTo(r * 2.15, 0); ctx.lineTo(r * 1.95, -0.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* the visor eye, looking where you look */
    ctx.fillStyle = PAL.bone;
    ctx.beginPath();
    ctx.ellipse(ax * r * 0.42, ay * r * 0.42 + r * 0.12, r * 0.34, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.arc(ax * r * 0.52, ay * r * 0.52 + r * 0.12, r * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (!f.alive) return;

    /* hp ring — the round's story at a glance */
    var frac = Math.max(0, f.hp / f.s.hp);
    ctx.lineWidth = 0.13;
    ctx.strokeStyle = 'rgba(16,16,14,0.55)';
    ctx.beginPath(); ctx.arc(f.x, f.y, r + 0.32, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = frac > 0.5 ? PAL.gold : (frac > 0.25 ? PAL.warn : PAL.coral);
    ctx.beginPath();
    ctx.arc(f.x, f.y, r + 0.32, Math.PI / 2, Math.PI / 2 - Math.PI * 2 * frac, true);
    ctx.stroke();
    if (f.shield > 0) {
      ctx.strokeStyle = '#7FB6DE';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r + 0.5, Math.PI / 2, Math.PI / 2 - Math.PI * 2 * Math.min(1, f.shield / 50), true);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawBullet(ctx, b, view) {
    /* trail */
    if (b.style !== 'ghost' && b.trail.length > 1) {
      ctx.strokeStyle = b.style === 'bee' ? 'rgba(232,197,122,0.35)' : 'rgba(242,238,226,0.22)';
      ctx.lineWidth = b.r * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.trail[0][0], b.trail[0][1]);
      for (var i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i][0], b.trail[i][1]);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    var ang = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.style === 'chicken') {
      ctx.rotate(ang);
      ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(0, 0, b.r + 0.07, b.r * 0.8 + 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.bone; ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.coral;                        /* comb */
      ctx.beginPath(); ctx.arc(0, b.r * 0.75, b.r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.warn;                         /* beak */
      ctx.beginPath(); ctx.moveTo(b.r, 0.1); ctx.lineTo(b.r + 0.3, 0); ctx.lineTo(b.r, -0.1); ctx.fill();
      ctx.fillStyle = PAL.ink;                          /* eye */
      ctx.beginPath(); ctx.arc(b.r * 0.45, b.r * 0.3, 0.06, 0, Math.PI * 2); ctx.fill();
    } else if (b.style === 'bee') {
      ctx.rotate(ang);
      ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.ellipse(0, 0, b.r * 1.3, b.r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(-b.r * 0.5, -b.r, b.r * 0.45, b.r * 2);
      ctx.fillRect(b.r * 0.35, -b.r, b.r * 0.4, b.r * 2);
      ctx.globalAlpha = 0.6; ctx.fillStyle = PAL.bone;
      ctx.beginPath(); ctx.ellipse(-b.r * 0.2, b.r * (view.t % 0.1 > 0.05 ? 1.2 : 0.9), b.r * 0.6, b.r * 0.4, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (b.style === 'beach') {
      ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(0, 0, b.r + 0.06, 0, Math.PI * 2); ctx.fill();
      var cols = [PAL.coral, PAL.bone, PAL.teal, PAL.bone, PAL.warn, PAL.bone];
      for (var s2 = 0; s2 < 6; s2++) {
        ctx.fillStyle = cols[s2];
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, b.r, ang + s2 * Math.PI / 3, ang + (s2 + 1) * Math.PI / 3);
        ctx.closePath(); ctx.fill();
      }
    } else if (b.style === 'confetti') {
      ctx.rotate(view.t * 9 + b.x);
      ctx.fillStyle = CONF[Math.abs(Math.round(b.x * 7)) % CONF.length];
      ctx.fillRect(-b.r, -b.r * 0.6, b.r * 2, b.r * 1.2);
    } else if (b.style === 'ghost') {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = PAL.bone;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(0, 0, b.r + 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.cosmetic ? PAL.bone : PAL.gold;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  var api = { VERSION: VERSION, PAL: PAL, newView: newView, feed: feed, stepView: stepView, draw: draw };
  global.FlatRender = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
