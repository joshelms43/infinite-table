/* poolsim — the pool table, proven before a phone ever racks.

   Continuous physics has failure modes no card game has: balls that tunnel through
   cushions, pairs that jitter forever and never come to rest, energy that grows,
   a stuck simulation that quietly never ends. Every one of those is an invariant
   here, hammered across seeded shot sequences that never change between runs.

   Determinism is the networking model: the host's replay is the truth everyone
   snaps to, and simulate()/stepper() must agree byte for byte. That's pinned too.

   Then the rulebook, clause by clause — every foul, both 8-ball deaths, the win,
   the open table, the break — and finally whole games: two ghost-ball bots play
   seeded racks to a verdict, because a rule set that can strand a game in a state
   no shot escapes is a deadlock, and we've shipped those in other games. */
'use strict';
const path = require('path');
const PP = require(path.join(__dirname, '..', 'shared', 'pool-physics.js'));
const PR = require(path.join(__dirname, '..', 'shared', 'pool-rules.js'));

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — poolsim never finished: something hung'); process.exitCode = 1; }
});
function T(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function freshRack(seed) {
  const order = PR.rackOrder(seed);
  const pos = PP.rackPositions();
  const cs = PP.cueStart();
  return [{ id: 0, x: cs.x, y: cs.y, vx: 0, vy: 0, pocketed: false }]
    .concat(order.map((id, i) => ({ id, x: pos[i].x, y: pos[i].y, vx: 0, vy: 0, pocketed: false })));
}
function checkTable(balls, label) {
  let escaped = 0, nan = 0, overlaps = 0;
  for (const b of balls) {
    if (b.pocketed) continue;
    if (!isFinite(b.x) || !isFinite(b.y)) nan++;
    else if (b.x < PP.R - 1e-9 || b.x > PP.W - PP.R + 1e-9 || b.y < PP.R - 1e-9 || b.y > PP.H - PP.R + 1e-9) escaped++;
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], c = balls[j];
    if (a.pocketed || c.pocketed) continue;
    const d = Math.hypot(a.x - c.x, a.y - c.y);
    if (d < 2 * PP.R - 1e-6) overlaps++;
  }
  T(label + ' — nothing left the cloth', escaped === 0 && nan === 0, escaped + ' escaped, ' + nan + ' NaN');
  T(label + ' — no resting overlaps', overlaps === 0, String(overlaps));
}

/* ---- the rack itself ---- */
{
  T('the rulebook is stamped', typeof PR.RULEBOOK === 'string' && PR.RULEBOOK.length > 0, PR.RULEBOOK);
  T('the engine is stamped', typeof PP.ENGINE === 'string' && PP.ENGINE.length > 0, PP.ENGINE);
  for (const seed of [1, 7, 42, 12345]) {
    const order = PR.rackOrder(seed);
    T('rack ' + seed + ' — fifteen distinct balls', new Set(order).size === 15 && order.every(id => id >= 1 && id <= 15));
    T('rack ' + seed + ' — the 8 in the middle', order[4] === 8);
    const c1 = PR.groupOf(order[10]), c2 = PR.groupOf(order[14]);
    T('rack ' + seed + ' — mixed back corners', c1 !== c2 && c1 !== 'eight' && c2 !== 'eight', c1 + '/' + c2);
    T('rack ' + seed + ' — seeded means repeatable', JSON.stringify(order) === JSON.stringify(PR.rackOrder(seed)));
  }
  const pos = PP.rackPositions();
  let touchOk = true;
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < 2 * PP.R - 1e-9) touchOk = false;
  }
  T('rack seats never start overlapped', touchOk);
}

/* ---- determinism: the whole networking model rests on it ---- */
{
  const balls = freshRack(42);
  const shot = { angle: 0.013, power: 1 };
  const a = PP.simulate(balls, shot);
  const b = PP.simulate(balls, shot);
  T('two replays of one shot agree exactly', JSON.stringify(a.balls) === JSON.stringify(b.balls) && a.ticks === b.ticks);
  const s = PP.stepper(balls, shot);
  while (!s.done) s.step(7);   // ragged step sizes must not change the outcome
  T('the stepper lands where simulate lands', JSON.stringify(s.balls) === JSON.stringify(a.balls));
  T('the events agree too', JSON.stringify(s.events) === JSON.stringify(a.events));
  T('the input was never touched', balls.every(x => x.vx === 0 && x.vy === 0 && !x.pocketed));
}

/* ---- energy only leaves the table ---- */
{
  const s = PP.stepper(freshRack(9), { angle: -0.02, power: 1 });
  let prev = Infinity, rose = 0, samples = 0;
  while (!s.done) {
    s.step(Math.round(0.5 / PP.DT));
    const e = s.balls.reduce((sum, b) => sum + (b.pocketed ? 0 : b.vx * b.vx + b.vy * b.vy), 0);
    if (e > prev + 1e-9) rose++;
    prev = e; samples++;
  }
  T('kinetic energy never grows between samples', rose === 0, rose + ' of ' + samples + ' rose');
}

/* ---- pockets take what they're given ---- */
{
  const cs = PP.cueStart();
  const dx = PP.W - cs.x, dy = PP.H - cs.y, d = Math.hypot(dx, dy);
  const bx = PP.W - (dx / d) * 0.35, by = PP.H - (dy / d) * 0.35;   // the 1, on the cue-to-corner line
  const balls = [
    { id: 0, x: cs.x, y: cs.y, vx: 0, vy: 0, pocketed: false },
    { id: 1, x: bx, y: by, vx: 0, vy: 0, pocketed: false },
  ];
  const angle = Math.atan2(dy, dx);   // dead at the corner, through the 1
  const out = PP.simulate(balls, { angle, power: 0.8 });
  T('a ball driven at a corner pocket drops', out.events.pocketed.indexOf(1) >= 0, JSON.stringify(out.events.pocketed));
  T('and the first contact was recorded', out.events.firstHit === 1);
}
{
  const balls = [{ id: 0, x: PP.W / 2 - 0.4, y: PP.H / 2, pocketed: false }];
  const out = PP.simulate(balls, { angle: 0, power: 0.4 });
  T('a lone cue ball comes to rest on the cloth', !out.balls[0].pocketed && out.ticks < PP.MAXTICKS);
  T('an untouched table reports no contact', out.events.firstHit === null);
}

/* ---- a hundred seeded shots, invariants held throughout ---- */
{
  const r = rng(2026);
  let balls = freshRack(2026), shots = 0, capped = 0;
  for (let i = 0; i < 100; i++) {
    const cue = balls.find(b => b.id === 0);
    if (cue.pocketed) { cue.pocketed = false; cue.x = PP.cueStart().x; cue.y = PP.cueStart().y; }
    if (balls.filter(b => !b.pocketed && b.id !== 0).length === 0) balls = freshRack(i + 3);
    const out = PP.simulate(balls, { angle: r() * Math.PI * 2, power: 0.15 + r() * 0.85 });
    if (out.ticks >= PP.MAXTICKS) capped++;
    balls = out.balls; shots++;
  }
  T('a hundred random shots all came to rest on their own', capped === 0, capped + ' of ' + shots + ' hit the tick cap');
  checkTable(balls, 'after the hundredth shot');
}

/* ---- placement law ---- */
{
  const balls = freshRack(5);
  T('the cue start is a legal kitchen placement', PP.placeOK(balls, PP.cueStart().x, PP.cueStart().y, true));
  T('the kitchen line is enforced', !PP.placeOK(balls, PP.HEADSTRING + 0.05, PP.H / 2, true));
  T('you cannot place a ball inside another', !PP.placeOK(balls, PP.FOOTSPOT.x, PP.FOOTSPOT.y, false));
  T('you cannot place a ball in the rail', !PP.placeOK(balls, 0.001, PP.H / 2, false));
  const spot = PP.respotPosition(balls.filter(b => b.id !== 8));
  T('the 8 respots on a clear foot spot', Math.abs(spot.y - PP.FOOTSPOT.y) < 1e-9 && spot.x >= PP.FOOTSPOT.x);
}

/* ---- the rulebook, clause by clause ---- */
{
  const all = PR.SOLIDS.concat([8]).concat(PR.STRIPES);
  const ev = (over) => Object.assign({ firstHit: 1, pocketed: [], railsAfterContact: 3, railBalls: {} }, over);
  const J = (over, evOver) => PR.judge(Object.assign({
    breakShot: false, open: false, myGroup: 'solid', ballsBefore: all.slice(), events: ev(evOver),
  }, over));

  let r = J({}, { pocketed: [0] });
  T('a scratch is a foul with ball in hand', r.foul === 'scratch' && r.ballInHand && !r.behindHead && !r.again);
  r = J({}, { firstHit: null });
  T('an air ball is a foul', !!r.foul && r.ballInHand);
  r = J({}, { firstHit: 9 });
  T('striking the wrong group first is a foul', /wrong group/.test(r.foul || ''));
  r = J({ open: true, myGroup: null }, { firstHit: 8 });
  T('striking the 8 first on an open table is a foul', /8 first/.test(r.foul || ''));
  r = J({}, { pocketed: [], railsAfterContact: 0 });
  T('nothing to a rail after contact is a foul', /rail/.test(r.foul || ''));
  r = J({}, { pocketed: [3] });
  T('potting your own keeps you at the table', !r.foul && r.again && !r.win && !r.lose);
  r = J({}, { pocketed: [11] });
  T('potting only theirs hands the table over', !r.foul && !r.again);
  r = J({ open: true, myGroup: null }, { firstHit: 9, pocketed: [9] });
  T('the first legal pot closes the table', r.assignShooter === 'stripe' && r.nowOpen === false && r.again);
  r = J({ open: true, myGroup: null }, { firstHit: 2, pocketed: [] });
  T('a dry open shot keeps the table open', !r.foul && r.nowOpen === true && r.assignShooter === null && !r.again);
  r = J({}, { pocketed: [8] });
  T('the early 8 loses the game', r.lose === true);
  r = J({}, { pocketed: [8, 0] });
  T('the 8 with a scratch loses the game', r.lose === true);
  r = J({ ballsBefore: [8].concat(PR.STRIPES) }, { firstHit: 8, pocketed: [8] });
  T('the clean 8 wins the game', r.win === true && !r.lose);
  r = J({ ballsBefore: [8].concat(PR.STRIPES) }, { firstHit: 9 });
  T('on the 8, the 8 must be struck first', /8 first/.test(r.foul || ''));
  r = J({ ballsBefore: [8].concat(PR.STRIPES) }, { firstHit: 8, pocketed: [8, 0] });
  T('the 8 falling with the cue still loses', r.lose === true);

  const BR = (evOver) => PR.judge({ breakShot: true, open: true, myGroup: null, ballsBefore: all.slice(), events: ev(evOver) });
  r = BR({ pocketed: [], railBalls: { 1: 1, 2: 1, 3: 1, 4: 1 } });
  T('a spread break is legal', !r.foul && !r.again && r.nowOpen === true);
  r = BR({ pocketed: [5], railBalls: {} });
  T('a break that pots stays at an open table', !r.foul && r.again && r.nowOpen === true && r.assignShooter === null);
  r = BR({ pocketed: [], railBalls: { 1: 1, 2: 1 } });
  T('a weak break is kitchen ball in hand', /weak break/.test(r.foul || '') && r.ballInHand && r.behindHead);
  r = BR({ pocketed: [8], railBalls: { 1: 1, 2: 1, 3: 1, 4: 1 } });
  T('the 8 on the break respots, never decides', r.respotEight === true && !r.win && !r.lose);
  r = BR({ pocketed: [0, 8], railBalls: { 1: 1, 2: 1, 3: 1, 4: 1 } });
  T('a break scratch respots the 8 and yields the kitchen', r.respotEight && /scratch/.test(r.foul || '') && r.behindHead && !r.lose);
}

/* ---- whole games: two ghost-ball bots, seeded, must reach a verdict ---- */
{
  function ghostAim(cue, target, pocket) {
    const dx = target.x - pocket.x, dy = target.y - pocket.y;
    const d = Math.hypot(dx, dy) || 1;
    const gx = target.x + (dx / d) * 2 * PP.R, gy = target.y + (dy / d) * 2 * PP.R;
    return Math.atan2(gy - cue.y, gx - cue.x);
  }
  function playGame(seed) {
    const r = rng(seed);
    let balls = freshRack(seed);
    let st = { turn: 0, open: true, groups: [null, null], breakShot: true, inHand: { turn: 0, behindHead: true } };
    for (let shot = 0; shot < 300; shot++) {
      const cue = balls.find(b => b.id === 0);
      if (st.inHand) {
        // the bot just takes the first legal spot it finds
        let placed = false;
        for (let k = 0; k < 500 && !placed; k++) {
          const x = PP.R + ((st.inHand.behindHead ? PP.HEADSTRING : PP.W) - 2 * PP.R) * r();
          const y = PP.R + (PP.H - 2 * PP.R) * r();
          if (PP.placeOK(balls, x, y, st.inHand.behindHead)) { cue.x = x; cue.y = y; cue.pocketed = false; placed = true; }
        }
        if (!placed) return { verdict: 'stuck-placing', shots: shot };
      }
      const mine = st.groups[st.turn];
      const legalIds = st.breakShot || st.open
        ? balls.filter(b => !b.pocketed && b.id > 0 && b.id !== 8).map(b => b.id)
        : (() => {
            const own = balls.filter(b => !b.pocketed && PR.groupOf(b.id) === mine).map(b => b.id);
            return own.length ? own : [8];
          })();
      const pickFrom = legalIds.length ? legalIds : [8];   // an open table down to the 8: someone has to end it
      const pickId = pickFrom[Math.floor(r() * pickFrom.length)];   // roll once, then look — a roll inside find() re-rolls per ball
      const target = balls.find(b => b.id === pickId);
      const pocket = PP.nearestPocket(target.x, target.y);
      const angle = ghostAim(cue, target, pocket) + (r() - 0.5) * 0.06;
      const power = st.breakShot ? 1 : 0.45 + r() * 0.4;

      const before = balls.filter(b => !b.pocketed && b.id !== 0).map(b => b.id);
      const out = PP.simulate(balls, { angle, power });
      const res = PR.judge({ breakShot: st.breakShot, open: st.open, myGroup: mine, ballsBefore: before, events: out.events });
      balls = out.balls;
      if (res.respotEight) {
        const eight = balls.find(b => b.id === 8);
        const spot = PP.respotPosition(balls);
        eight.pocketed = false; eight.x = spot.x; eight.y = spot.y;
      }
      if (out.events.firstHit != null || out.events.pocketed.length) st.breakShot = false;
      if (res.assignShooter) { st.groups[st.turn] = res.assignShooter; st.groups[1 - st.turn] = res.assignShooter === 'solid' ? 'stripe' : 'solid'; }
      st.open = res.nowOpen;
      if (res.win) return { verdict: 'win', shots: shot + 1 };
      if (res.lose) return { verdict: 'lose', shots: shot + 1 };
      const next = (res.again && !res.foul) ? st.turn : 1 - st.turn;
      st.inHand = res.foul ? { turn: next, behindHead: res.behindHead } : null;
      if (res.foul && balls.find(b => b.id === 0).pocketed) { /* the placer will restore it */ }
      st.turn = next;
      checkNoNaN(balls);
    }
    return { verdict: 'never-ended', shots: 300 };
  }
  let nanSeen = false;
  function checkNoNaN(balls) { for (const b of balls) if (!isFinite(b.x) || !isFinite(b.y)) nanSeen = true; }

  for (const seed of [11, 22, 33, 44, 55, 66]) {
    const g = playGame(seed);
    T('game ' + seed + ' reached a verdict (' + g.verdict + ' in ' + g.shots + ' shots)',
      g.verdict === 'win' || g.verdict === 'lose');
  }
  T('no game ever produced a NaN position', !nanSeen);
}

/* ---- shooter authority: nobody waits for anybody to be awake ----
   v0.2.0 removed the host. The shooter's phone simulates, judges, folds and
   broadcasts its own stroke; authority follows the turn; highest seq wins; the
   clock is enforced by whoever's job it is. Every lesson from the host era is
   re-pinned here in its new shape: the no-spoiler wind-back, the never-dropped
   shot queue, the claim-versus-rightful-shot tie-break, and the deterministic
   rerack that makes a two-tap race idempotent by construction. */
function bootPool() {
  const vm = require('vm');
  const { sourceFor } = require(path.join(__dirname, '_document'));
  const makeEl = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, value: '' }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; }, set() { return true; },
  });
  const sandbox = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise, RegExp,
    isNaN, isFinite, parseInt, parseFloat, URLSearchParams, performance,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { querySelector: () => makeEl(), querySelectorAll: () => [], createElement: makeEl, getElementById: makeEl, addEventListener() {}, visibilityState: 'visible', head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } } },
    addEventListener() {}, location: { reload() {}, search: '', href: '' }, navigator: {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 500,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sourceFor('pool'), sandbox, { filename: 'pool/index.html' });
  const SENT = [];
  const B = sandbox.__B, NET = B.NET;
  NET.pkey = 'me'; NET.myName = 'Me'; NET.code = 'TEST';
  NET.tx = {
    presence: () => ({ me: [{ key: 'me', name: 'Me', host: true }], them: [{ key: 'them', name: 'Them' }] }),
    track() {}, alive: () => true, close() {},
    send: (ev, p) => { SENT.push({ ev, p }); },
  };
  const run = (js) => vm.runInContext(js, sandbox);
  return { sandbox, B, NET, SENT, run, count: ev => SENT.filter(x => x.ev === ev).length };
}

{
  const t = bootPool();
  const { B, NET, SENT, run } = t;
  const G = () => B.G;
  NET.mode = 'lobby-host';
  NET.startGame();
  T('authority — the lobby hands the game straight to the table', G().phase === 'play' && NET.mode === 'peer' && t.count('start') === 1);
  T('authority — the breaker starts in the kitchen', G().inHand && G().inHand.key === 'me' && G().inHand.behindHead === true);

  NET.shoot({ angle: 0.2, power: 0.05 });   // a whiffed break: a foul, but my stroke, applied here
  T('authority — my shot needs nobody: applied and broadcast immediately', t.count('shot') === 1 && B.ANIM !== null);
  T('no spoilers — the visible table still shows the pre-shot state', G().seq === 1 && G().turnKey === 'me');
  T('no spoilers — the truth waits inside the animation', B.ANIM.endState.seq === 2);

  NET.shoot({ angle: 1, power: 0.5 });      // mid-flight: my own animation blocks me, silently
  T('authority — a second stroke mid-flight goes nowhere', t.count('shot') === 1);

  run('settle()');                          // the balls land
  T('authority — the foul passed the table', G().seq === 2 && G().turnKey === 'them' && G().inHand.key === 'them');

  /* their stroke arrives as a broadcast — replayed here, snapped to their truth */
  const theirState = run('JSON.parse(JSON.stringify(snapshot()))');
  theirState.seq = 3; theirState.by = 'them'; theirState.turnKey = 'me'; theirState.inHand = null;
  const beforeBalls = G().balls.map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));
  NET.onMessage('shot', { seq: 3, shooter: 'them', before: beforeBalls, shot: { angle: 2, power: 0.1 }, state: theirState });
  T('authority — their broadcast stroke animates here', B.ANIM !== null && B.ANIM.endState.seq === 3);

  /* a second shot while the first still flies: queued, never dropped */
  const s4 = JSON.parse(JSON.stringify(theirState)); s4.seq = 4; s4.turnKey = 'me';
  NET.onMessage('shot', { seq: 4, shooter: 'them', before: beforeBalls, shot: { angle: 2.5, power: 0.1 }, state: s4 });
  T('authority — a shot arriving mid-flight queues', B.SHOTQ.length === 1);
  run('settle()');
  T('authority — settle plays the whole queue to the last truth', G().seq === 4 && B.SHOTQ.length === 0 && B.ANIM === null);

  /* the wire hiccuped and they are ahead: their heartbeat says so, we ask */
  const hellosBefore = t.count('hello');
  NET.onMessage('hb', { seq: 9 });
  T('healing — a heartbeat from ahead triggers a state request', t.count('hello') === hellosBefore + 1);
  const statesBefore = t.count('state');
  NET.onMessage('hello', { key: 'them' });
  T('healing — a hello is answered with the state', t.count('state') === statesBefore + 1);
}

{ /* the clock, both jobs */
  const t = bootPool();
  const { B, NET, run } = t;
  const G = () => B.G;
  NET.mode = 'lobby-host';
  NET.startGame();

  /* my clock, my foul */
  B.DEADLINE = Date.now() - 1000;
  run('netTick()');
  T('clock — the turn player calls the timeout on themselves', G().turnKey === 'them' && G().to === false && G().inHand.key === 'them');

  /* their clock, long gone: the waiter claims */
  B.DEADLINE = Date.now() - 9000;
  run('netTick()');
  T('clock — the waiter claims a long-gone shooter, flagged as a claim', G().turnKey === 'me' && G().to === true);

  /* ...but a rightful shot at the same seq beats the claim */
  const claimSeq = G().seq;
  const st = run('JSON.parse(JSON.stringify(snapshot()))');
  st.seq = claimSeq; st.by = 'them'; st.to = false; st.turnKey = 'me';
  const beforeBalls = G().balls.map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));
  NET.onMessage('shot', { seq: claimSeq, shooter: 'them', before: beforeBalls, shot: { angle: 2, power: 0.1 }, state: st });
  T('clock — a rightful shot at the claimed seq wins the tie', B.ANIM !== null && B.ANIM.endState.by === 'them');
}

{ /* the sleeping opponent — the entire reason for v0.2.0 */
  const t = bootPool();
  const { B, NET, run } = t;
  NET.mode = 'lobby-host';
  NET.startGame();
  B.OPPAT = Date.now() - 25000;   // past the 20s threshold — short quiets stay unmentioned
  run('netTick()');
  T('sleeping opponent — noted after three missed heartbeats', B.OPPQUIET === true);
  const shots = t.count('shot');
  NET.shoot({ angle: 0.3, power: 0.06 });
  T('sleeping opponent — and I keep playing anyway', t.count('shot') === shots + 1 && B.ANIM !== null);
  NET.onMessage('hb', { seq: 0 });
  T('sleeping opponent — the first word back clears the note', B.OPPQUIET === false);
}

{ /* rerack: a pure function of the stamped seed — a two-tap race is idempotent */
  const t = bootPool();
  const { B, NET, run } = t;
  const G = () => B.G;
  NET.mode = 'lobby-host';
  NET.startGame();
  run('settle()');
  B.G.phase = 'over'; B.G.seq = 10; B.G.nextSeed = 424242; B.G.nextBreaker = 'them'; B.G.winner = 'them';
  const a = run('JSON.stringify(buildRack({ seq:11, seed:G.nextSeed, breakerKey:G.nextBreaker, roster:G.roster, by:"me" }))');
  const b = run('JSON.stringify(buildRack({ seq:11, seed:G.nextSeed, breakerKey:G.nextBreaker, roster:G.roster, by:"them" }))');
  T('rerack — both taps build the identical rack, author aside',
    JSON.parse(a).balls.length === 16 && a.replace('"by":"me"', '"by":"them"') === b);
  NET.rerack();
  T('rerack — one tap starts the next game with breaks alternated',
    G().phase === 'play' && G().seq === 11 && G().turnKey === 'them' && t.count('start') === 2);
  const seqNow = G().seq;
  NET.rerack();
  T('rerack — a duplicate tap after the rack is a no-op', G().seq === seqNow);
}

finished = true;
console.log(fails === 0 ? 'POOLSIM: ALL PASS' : 'POOLSIM FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
