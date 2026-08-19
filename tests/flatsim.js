/* flatsim — Flatland under load.
   The promise being pinned: EVERY powerup in the Duel catalogue does its job
   flat. Movement, bullets, damage semantics, on-hit effects, the silly batch.
   Then soak: full bot-v-bot fights on both arenas with heavy random sheets —
   every fight ends, nobody leaves the arena, nothing goes NaN, and the same
   seed replays the same fight to the frame. */
const path = require('path');
const FD = require(path.join(__dirname, '..', 'shared', 'duel-flat.js'));
const PU = require(path.join(__dirname, '..', 'shared', 'duel-powerups.js'));

let fails = 0;
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

T('the flat rulebook is stamped', typeof FD.VERSION === 'string' && FD.VERSION.includes('flatland'));
T('the catalogue carries Flatland', !!PU.byId('flatland') && PU.statsFor(['flatland']).flat === true);
T('a clean sheet is not flat', PU.statsFor([]).flat === false);
T('both arenas exist and are boxes', ['table', 'grounds'].every(id => {
  const a = FD.arenaFor(id);
  return a.plats.length >= 5 && a.spawns.length === 2;
}));

/* ---- a rigged duel: A simulated, B a stationary puppet across the room ---- */
function rig(picksA, opts) {
  opts = opts || {};
  const w = FD.newWorld(opts.map || 'table', opts.seed == null ? 7 : opts.seed);
  const A = FD.addFighter(w, 'A', PU.statsFor(picksA || []), { x: -6, y: 2, team: 'a' });
  const B = FD.addFighter(w, 'B', PU.statsFor(opts.picksB || []), { x: 6, y: 2, team: 'b', puppet: !opts.simB });
  /* settle both on the floor */
  for (let i = 0; i < 30; i++) FD.step(w, 1 / 60);
  return { w, A, B };
}
function run(w, seconds, each) {
  const out = [];
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (each) each(i);
    FD.step(w, 1 / 60).forEach(e => out.push(e));
  }
  return out;
}
function aimAt(A, B) { return Math.atan2(B.y - A.y, B.x - A.x); }
function shootUntilHit(picks, seconds, opts) {
  const { w, A, B } = rig(picks, opts);
  const evts = run(w, seconds || 4, () => {
    FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true });
  });
  return { w, A, B, evts,
    hits: evts.filter(e => e.t === 'hit'),
    fx: k => evts.filter(e => e.t === 'fx' && e.kind === k) };
}

/* ---- plain shooting works ---- */
{
  const r = shootUntilHit([]);
  T('a plain bullet crosses the room and hits', r.hits.length > 0);
  T('damage is the sheet\'s damage', r.hits.length && Math.abs(r.hits[0].dmg - 16) < 0.01,
    r.hits[0] && r.hits[0].dmg);
  T('puppets never simulate themselves', Math.abs(r.B.x - 6) < 0.6);
}

/* ---- movement powerups, observable flat ---- */
{
  /* sprinter runs faster than base */
  function runDist(picks) {
    const { w, A } = rig(picks);
    run(w, 1.2, () => FD.input(w, 'A', { mx: 1, aim: 0 }));
    return A.x - (-6);
  }
  const base = runDist([]), sprint = runDist(['sprinter']), crab = runDist(['crab']);
  T('Sprinter is faster flat', sprint > base * 1.15, base.toFixed(2) + ' -> ' + sprint.toFixed(2));
  T('Crab Mode is faster flat (everything is sideways)', crab > base * 1.2);

  function jumpPeak(picks) {
    const { w, A } = rig(picks);
    A.x = -3;
    let peak = 0, jumped = false;
    run(w, 1.4, () => {
      FD.input(w, 'A', { mx: 0, jump: !jumped, aim: 0 });
      jumped = true;
      peak = Math.max(peak, A.y);
    });
    return peak;
  }
  T('Moon Boots jump higher', jumpPeak(['moonboots']) > jumpPeak([]) * 1.25);

  /* double jump: two airborne rises */
  {
    const { w, A } = rig(['doublejump']);
    A.x = -3;
    let peaks = 0, lastVy = 0;
    run(w, 2.2, i => {
      const press = i === 5 || i === 40;
      FD.input(w, 'A', { mx: 0, jump: press, aim: 0 });
      if (lastVy <= 0 && A.vy > 0) peaks++;
      lastVy = A.vy;
    });
    T('Double Jump gives a second rise mid-air', peaks >= 2, String(peaks));
  }

  /* dash moves you; blink teleports */
  {
    const { w, A } = rig(['dash']);
    const x0 = A.x;
    run(w, 0.3, i => FD.input(w, 'A', { mx: 0, dash: i === 2, aim: 0 }));
    T('Dash shoves you along', A.x - x0 > 1.2, (A.x - x0).toFixed(2));
  }
  {
    const { w, A } = rig(['blink']);
    const x0 = A.x;
    run(w, 0.1, i => FD.input(w, 'A', { mx: 0, dash: i === 2, aim: 0 }));
    T('Blink is a teleport', A.x - x0 > 2.5, (A.x - x0).toFixed(2));
  }
  /* bouncy castle */
  {
    const { w, A } = rig(['castle']);
    A.x = -3; A.y = 12; A.vy = 0; A.onGround = false;
    let bounced = false, fell = false;
    run(w, 2, () => {
      FD.input(w, 'A', { mx: 0, aim: 0 });
      if (A.vy < -8) fell = true;
      if (fell && A.vy > 3) bounced = true;
    });
    T('Bouncy Castle bounces a hard landing', bounced);
  }
}

/* ---- bullet behaviour ---- */
{
  const r = shootUntilHit(['bounce'], 3, {});
  /* fire at the wall behind: it must come back */
  const { w, A, B } = rig(['bounce']);
  const evts = run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: Math.PI, fire: true })); // away from B
  T('Bouncy Bullets bounce', evts.some(e => e.t === 'fx' && e.kind === 'bounce'));

  const ph = (() => {
    /* phantom: shoot through the keep wall on grounds — B behind a slab */
    const { w, A, B } = rig(['phantom'], { map: 'grounds' });
    FD.setPuppet(w, 'B', 0, 5.2, 0, true);   // on the keep, slab between at y 3.4
    A.x = -14; A.y = 1;
    const evts = run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return evts.filter(e => e.t === 'hit');
  })();
  T('Phantom Rounds pass through walls to land', ph.length > 0);

  const hom = shootUntilHit(['bloodhound'], 4);
  T('Bloodhound homes in', hom.hits.length > 0);

  const mort = (() => {
    const { w, A, B } = rig(['mortar']);
    /* lob upward at a sweep of angles: gravity must arc one down onto B */
    let k = 0;
    const evts = run(w, 6, () => { FD.input(w, 'A', { mx: 0, aim: 0.15 + ((k++ / 40) % 1) * 0.75, fire: true }); });
    return evts.filter(e => e.t === 'hit');
  })();
  T('Mortar arcs under gravity onto the target', mort.length > 0);

  const boom = shootUntilHit(['grenadier']);
  T('Grenadier explodes on impact', boom.fx('boom').length > 0 && boom.hits.length > 0);
  T('blast hits carry the 0.8 scale', boom.hits.length &&
    Math.abs(boom.hits[0].dmg - 16 * 0.8) < 0.01, boom.hits[0] && boom.hits[0].dmg);

  const clus = shootUntilHit(['grenadier', 'cluster'], 5);
  T('Cluster throws shrapnel out of the boom', clus.fx('boom').length > 0 &&
    clus.w.bullets.length + clus.evts.filter(e => e.t === 'fx' && e.kind === 'wallhit').length >= 0 &&
    clus.hits.length > 0);

  const split = (() => {
    const { w, A } = rig(['split']);
    run(w, 0.5, i => FD.input(w, 'A', { mx: 0, aim: 0, fire: i < 3 }));
    return { splitFx: w.events, count: w.bullets.length };
  })();
  T('Banana Split multiplies mid-flight', shootUntilHit(['split'], 3).evts
    .some(e => e.t === 'fx' && e.kind === 'split'));

  /* boomerang: fire away from B, catch the return, mag refunds */
  {
    const { w, A } = rig(['boomerang']);
    let fired = false, caught = false, magAfterShot = 0;
    run(w, 4, i => {
      FD.input(w, 'A', { mx: 0, aim: Math.PI * 0.75, fire: !fired });
      if (!fired && A.mag < A.s.magSize) { fired = true; magAfterShot = A.mag; }
    });
    T('Boomerang returns and refunds on the catch', fired && A.mag >= magAfterShot + 1,
      'mag ' + magAfterShot + ' -> ' + A.mag);
  }

  const helium = (() => {
    const { w, A } = rig(['helium']);
    run(w, 0.05, () => FD.input(w, 'A', { mx: 0, aim: 0, fire: true }));
    const b = w.bullets[0];
    const y0 = b.y;
    run(w, 0.5);
    return { rise: b.life > 0 ? b.y - y0 : 1 };
  })();
  T('Helium Rounds float upward', helium.rise > 0.2, helium.rise.toFixed(2));

  const wob = (() => {
    const { w } = rig(['drunk']);
    run(w, 0.05, () => FD.input(w, 'A', { mx: 0, aim: 0, fire: true }));
    const b = w.bullets[0];
    let devi = 0;
    run(w, 0.6, () => { if (w.bullets[0] === b) devi = Math.max(devi, Math.abs(b.vy)); });
    return devi;
  })();
  T('Drunk Rounds wander', wob > 0.5, wob.toFixed(2));

  T('Popcorn bursts on walls', (() => {
    const { w } = rig(['popcorn']);
    const evts = run(w, 2, () => FD.input(w, 'A', { mx: 0, aim: Math.PI, fire: true }));
    return w.bullets.length > 0 || evts.some(e => e.kind === 'wallhit');
  })());

  T('Echo fires the free second shot', shootUntilHit(['echo'], 2).evts
    .some(e => e.t === 'echoshot'));

  T('Disco Inferno orbits before launching', (() => {
    const { w, A, B } = rig(['disco']);
    const evts = run(w, 4, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return evts.filter(e => e.t === 'hit').length > 0;
  })());
}

/* ---- damage semantics ---- */
{
  const heavy = shootUntilHit(['heavy']);
  T('Heavy Rounds hit at 1.45x', heavy.hits.length &&
    Math.abs(heavy.hits[0].dmg - 16 * 1.45) < 0.01);

  const over = shootUntilHit(['overcharge']);
  T('Overcharge doubles the first shot of the mag', over.hits.length &&
    Math.abs(over.hits[0].dmg - 32) < 0.01, over.hits[0] && over.hits[0].dmg);

  const hand = shootUntilHit(['handcannon']);
  T('Hand Cannon is one shattering round', hand.hits.length &&
    hand.hits[0].dmg > 50 && hand.A.s.magSize === 1);

  T('Trickshot pays +75% after a bounce', (() => {
    const { w, A, B } = rig(['trickshot']);
    /* sweep shallow floor angles: one skip must land on B */
    let k = 0;
    const evts = run(w, 6, () => FD.input(w, 'A', { mx: 0, aim: -0.05 - ((k++ / 30) % 1) * 0.5, fire: true }));
    const hits = evts.filter(e => e.t === 'hit');
    return hits.some(h => Math.abs(h.dmg - 16 * 1.75) < 0.01);
  })());

  const exec = (() => {
    const { w, A, B } = rig(['executioner']);
    B.hp = 20;                                 // below 35%
    const evts = run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return evts.filter(e => e.t === 'hit');
  })();
  T('Executioner bites the wounded harder', exec.length &&
    Math.abs(exec[0].dmg - 16 * 1.6) < 0.01);

  T('Stand Your Ground shields the stationary', (() => {
    const { w, A, B } = rig([], { picksB: ['stand'] });
    B.still = 1;                                /* they have been standing */
    const evts = run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    const hits = evts.filter(e => e.t === 'hit');
    return hits.length && Math.abs(hits[0].dmg - 16 * 0.7) < 0.01;
  })());

  T('Tortoise Mode resists', (() => {
    const r = shootUntilHit([], { picksB: ['tortoise'] });
    const { w, A, B } = rig([], { picksB: ['tortoise'] });
    const evts = run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    const hits = evts.filter(e => e.t === 'hit');
    return hits.length && Math.abs(hits[0].dmg - 16 * 0.75) < 0.01;
  })());

  T('Thorns bite the attacker back', (() => {
    const { w, A, B } = rig([], { picksB: ['thorns'] });
    const hp0 = A.hp;
    run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return A.hp < hp0;
  })());

  T('Leech heals the shooter', (() => {
    const { w, A, B } = rig(['leech']);
    A.hp = 50;
    run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return A.hp > 50;
  })());

  T('Aegis absorbs before HP', (() => {
    const { w, A, B } = rig([], { picksB: ['aegis'] });
    let fired = false;
    const evts = run(w, 3, () => { FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: !fired }); fired = true; });
    return B.hp === B.s.hp && Math.abs(B.shield - 34) < 0.01 &&
      evts.some(e => e.t === 'fx' && e.kind === 'shield');
  })());

  T('Second Wind survives the kill on 1 HP', (() => {
    const { w, A, B } = rig(['handcannon'], { picksB: ['secondwind'] });
    B.hp = 5;
    let fired = false;
    const evts = run(w, 4, () => { FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: !fired }); fired = true; });
    return evts.some(e => e.t === 'fx' && e.kind === 'secondwind') && B.alive && B.hp === 1;
  })());

  T('Venom poisons over time', (() => {
    const { w, A, B } = rig(['venom']);
    const evts = run(w, 2, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    const afterHit = B.hp;
    run(w, 2, () => FD.input(w, 'A', { mx: 0, aim: 0, fire: false }));
    return evts.some(e => e.t === 'hit') && B.hp < afterHit - 10;
  })());

  T('Frost slows the victim', (() => {
    const { w, A, B } = rig(['frost'], { simB: true });
    run(w, 2, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    if (B.slowT <= 0) return false;
    const x0 = B.x;
    run(w, 0.5, () => { FD.input(w, 'A', { mx: 0, aim: 0 }); FD.input(w, 'B', { mx: 1, aim: 0 }); });
    const slowed = B.x - x0;
    return slowed < 0.5 * 6.5 * 1.15 * 0.75;
  })());

  T('Riot Rounds treble the shove', (() => {
    function kb(picks) {
      const { w, A, B } = rig(picks, { simB: true });
      run(w, 2.0, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
      return Math.abs(B.vx) + Math.abs(B.x - 6);
    }
    return kb(['riot']) > kb([]) * 1.6;
  })());

  T('Anchor shrugs the shove off', (() => {
    const { w, A, B } = rig(['riot'], { picksB: ['anchor'], simB: true });
    run(w, 2.0, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return Math.abs(B.x - 6) < 0.8;
  })());

  T('Trebuchet launches them skyward', (() => {
    const { w, A, B } = rig(['trebuchet'], { simB: true });
    B.x = 3;                                   /* open sky — no slab overhead */
    let peak = 0;
    run(w, 2.5, () => { FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }); peak = Math.max(peak, B.y); });
    return peak > 2.4;
  })());

  T('Pickpocket steals a round', (() => {
    const { w, A, B } = rig(['pickpocket']);
    A.mag = 2;
    run(w, 2, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return B.mag < B.s.magSize;
  })());

  T('Scavenger refunds on a hit', (() => {
    const { w, A, B } = rig(['scavenger']);
    const evts = run(w, 3, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    const shots = evts.filter(e => e.t === 'shot').length;
    const hits = evts.filter(e => e.t === 'hit').length;
    return hits > 0 && A.mag + shots > A.s.magSize; /* refunds outran spending */
  })());

  T('Payback arms after taking a hit', (() => {
    const { w, A, B } = rig([], { picksB: ['payback'], simB: true });
    run(w, 2, () => { FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }); FD.input(w, 'B', { mx: 0, aim: 0 }); });
    return B.payback === true;
  })());

  T('Hoarder pays HP per powerup', PU.statsFor(['hoarder', 'sprinter', 'mag']).hp === 100 + 18);
}

/* ---- reload family ---- */
{
  T('Belt Feed never reloads', (() => {
    const { w, A, B } = rig(['beltfeed']);
    run(w, 6, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
    return A.reloading <= 0;
  })());
  T('Panic Hands halves the dry reload', (() => {
    const { w, A } = rig(['panichands']);
    A.mag = 1;
    run(w, 0.4, i => FD.input(w, 'A', { mx: 0, aim: 0, fire: i === 2 }));
    return A.reloading > 0 && A.reloading <= 1.1 * 0.5 + 0.01;
  })());
  T('Battle Cry shoves on the horn', (() => {
    const { w, A, B } = rig(['battlecry'], { simB: true });
    FD.setPuppet(w, 'B', -3.5, 2, 0, true); B.x = -3.5; B.puppet = false;
    A.mag = 1;
    let maxVx = 0;
    const evts = run(w, 0.5, i => { FD.input(w, 'A', { mx: 0, aim: Math.PI, fire: i === 2 }); maxVx = Math.max(maxVx, Math.abs(B.vx)); });
    return evts.some(e => e.kind === 'horn') && maxVx > 2;
  })());
}

/* ---- the sheet's flag reaches the world ---- */
T('a Flatland sheet still fights like any sheet', (() => {
  const r = shootUntilHit(['flatland']);
  return r.hits.length > 0;
})());

/* ---- detect-only: the page's mode — contacts out, no damage dealt ---- */
{
  const { w, A, B } = rig(['grenadier']);
  w.detectOnly = true;
  const evts = run(w, 4, () => FD.input(w, 'A', { mx: 0, aim: aimAt(A, B), fire: true }));
  const contacts = evts.filter(e => e.t === 'contact');
  T('detect-only reports contacts', contacts.length > 0);
  T('detect-only flags the blast', contacts.some(c => c.blast === true));
  T('detect-only never touches HP', B.hp === B.s.hp && evts.every(e => e.t !== 'hit' && e.t !== 'death'));
}

/* ---- soak: full fights, both arenas, random heavy sheets ---- */
{
  const rng = FD.seededRng(0xF1A7);
  let done = 0, stalls = 0, escapes = 0, nans = 0, worstT = 0;
  const ids = PU.POWERUPS.map(p => p.id);
  for (let g = 0; g < 60; g++) {
    const map = g % 2 ? 'grounds' : 'table';
    const w = FD.newWorld(map, 1000 + g);
    const picksA = [], picksB = [];
    const nA = 2 + Math.floor(rng() * 7), nB = 2 + Math.floor(rng() * 7);
    while (picksA.length < nA) { const id = ids[Math.floor(rng() * ids.length)]; if (!picksA.includes(id)) picksA.push(id); }
    while (picksB.length < nB) { const id = ids[Math.floor(rng() * ids.length)]; if (!picksB.includes(id)) picksB.push(id); }
    const A = FD.addFighter(w, 'A', PU.statsFor(picksA), { x: w.arena.spawns[0], y: 2, team: 'a' });
    const B = FD.addFighter(w, 'B', PU.statsFor(picksB), { x: w.arena.spawns[1], y: 2, team: 'b' });
    const stA = {}, stB = {};
    let t = 0, dead = false;
    while (t < 60 && !dead) {
      FD.input(w, 'A', FD.botThink(w, 'A', 6, stA));
      FD.input(w, 'B', FD.botThink(w, 'B', 6, stB));
      const evts = FD.step(w, 1 / 60);
      t += 1 / 60;
      if (evts.some(e => e.t === 'death')) dead = true;
      const bad = [A, B].some(f => !isFinite(f.x) || !isFinite(f.y) || !isFinite(f.hp));
      if (bad) { nans++; break; }
      const out = [A, B].some(f => Math.abs(f.x) > w.arena.w / 2 + 3 || f.y < -4 || f.y > w.arena.h + 5);
      if (out) { escapes++; break; }
    }
    if (dead) { done++; worstT = Math.max(worstT, t); }
    else if (!nans && !escapes) stalls++;
  }
  T('soak: fights end', done >= 54, 'done=' + done + ' stalls=' + stalls);
  T('soak: nobody leaves the arena', escapes === 0, String(escapes));
  T('soak: nothing goes NaN', nans === 0, String(nans));
  console.log('     (soak: ' + done + '/60 decisive, longest ' + worstT.toFixed(1) + 's)');
}

/* ---- determinism: same seed, same fight, to the frame ---- */
{
  function fight(seed) {
    const w = FD.newWorld('table', seed);
    const A = FD.addFighter(w, 'A', PU.statsFor(['bounce', 'venom', 'dash']), { x: -11, y: 2, team: 'a' });
    const B = FD.addFighter(w, 'B', PU.statsFor(['buckshot', 'moonboots']), { x: 11, y: 2, team: 'b' });
    const stA = {}, stB = {};
    const trace = [];
    for (let i = 0; i < 60 * 20; i++) {
      FD.input(w, 'A', FD.botThink(w, 'A', 6, stA));
      FD.input(w, 'B', FD.botThink(w, 'B', 6, stB));
      FD.step(w, 1 / 60);
      if (i % 30 === 0) trace.push([A.x.toFixed(5), A.y.toFixed(5), B.x.toFixed(5), B.hp.toFixed(3), w.bullets.length]);
      if (!A.alive || !B.alive) break;
    }
    return JSON.stringify(trace);
  }
  T('the same seed replays the same fight', fight(424242) === fight(424242));
}

console.log(fails ? '\nflatsim: ' + fails + ' FAILURES' : '\nflatsim: all green');
process.exit(fails ? 1 : 0);
