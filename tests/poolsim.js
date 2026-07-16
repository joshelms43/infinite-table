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

/* ---- the table frees itself: v0.1.0 shipped a busy flag nothing ever cleared ----
   Caught live: the first shot of the match locked applyIntent forever — every later
   intent, including the shooter's own next ball-in-hand, nacked NOT RIGHT NOW, and
   the shot clock (which also defers to busy) went silent with it. This boots the
   real page and replays that exact afternoon. */
{
  const vm = require('vm');
  const { sourceFor } = require(path.join(__dirname, '_document'));
  const code = sourceFor('pool');
  const makeEl = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, value: '' }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; }, set() { return true; },
  });
  const store = {};
  const sandbox = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise, RegExp,
    isNaN, isFinite, parseInt, parseFloat, URLSearchParams,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { querySelector: () => makeEl(), querySelectorAll: () => [], createElement: makeEl, getElementById: makeEl, addEventListener() {}, visibilityState: 'visible', head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } } },
    addEventListener() {}, location: { reload() {}, search: '', href: '' }, navigator: {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 500,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'pool/index.html' });

  const B = sandbox.__B, NET = B.NET;
  const SENT = [];
  NET.pkey = 'me'; NET.myName = 'Host'; NET.code = 'TEST';
  NET.tx = {
    presence: () => ({ me: [{ key: 'me', name: 'Host', host: true }], them: [{ key: 'them', name: 'Guest' }] }),
    track() {}, alive: () => true, close() {},
    send: (ev, p) => { SENT.push({ ev, p }); },
  };
  NET.mode = 'lobby-host';
  NET.startGame();
  const G = () => B.G;
  T('deadlock repro — the match starts with the breaker in the kitchen', G().phase === 'play' && G().inHand && G().inHand.key === 'me');

  const nacksTo = key => SENT.filter(s => s.ev === 'nack' && s.p.key === key).length;
  NET.applyIntent({ key: 'me', k: 'shot', a: { angle: 0.2, power: 0.05 } });   // a whiffed break: a foul, but a legal intent
  T('deadlock repro — the first shot is accepted', SENT.some(s => s.ev === 'shot') && NET.busy === true);
  T('deadlock repro — busy carries a deadline, not a life sentence', isFinite(NET.busyUntil) && NET.busyUntil > Date.now());

  NET.applyIntent({ key: 'them', k: 'shot', a: { angle: 1, power: 0.5 } });    // mid-flight: correctly held off
  T('deadlock repro — mid-flight intents are held off', nacksTo('them') === 1);

  const realNow = sandbox.Date.now.bind(sandbox.Date);
  sandbox.Date.now = () => realNow() + 60000;                                  // the balls stopped long ago
  const before = nacksTo('them');
  NET.applyIntent({ key: 'them', k: 'shot', a: { angle: 1, power: 0.5 } });    // the shot that used to say NOT RIGHT NOW
  sandbox.Date.now = realNow;
  T('deadlock repro — the table frees itself for the next shot', nacksTo('them') === before && SENT.filter(s => s.ev === 'shot').length === 2);
  T('deadlock repro — and play actually moved on', G().seq >= 2 && G().phase === 'play');

  /* v0.1.1 caught live, part two: the host's HUD spoiled every shot — G held the
     final state while the balls were still rolling, so the log, the group dots,
     even the WINS overlay arrived before the 8 did. The host now winds the visible
     table back after broadcasting and learns the result when the animation lands. */
  T('no spoilers — the host holds the pre-shot state while the balls roll',
    B.ANIM !== null && G().seq === 2 && G().turnKey === 'them',
    'seq=' + G().seq + ' turn=' + G().turnKey);
  T('no spoilers — the truth waits inside the animation', B.ANIM.endState.seq === 3);
  T('no spoilers — freeing a stale busy settles the flight first, never forks the table',
    SENT.filter(s => s.ev === 'shot').length === 2);   // shot 2 simulated from shot 1's true end, not from the pre-state

  /* lost intents: phones drop websocket messages quietly. A re-sent intent the host
     already played must be answered with the state — never simulated twice. */
  sandbox.Date.now = () => realNow() + 120000;
  vm.runInContext('settle()', sandbox);                                        // land the flight, then ask whose table it is
  const who = G().turnKey;
  const nacksBefore = nacksTo(who);
  NET.applyIntent({ key: who, k: 'shot', a: { angle: 2, power: 0.4 }, n: 7 });
  const shotsAfter = SENT.filter(s => s.ev === 'shot').length;
  const statesBefore = SENT.filter(s => s.ev === 'state').length;
  NET.applyIntent({ key: who, k: 'shot', a: { angle: 2, power: 0.4 }, n: 7 });   // the watchdog's duplicate
  sandbox.Date.now = realNow;
  T('dedupe — a re-sent intent is answered with the state, not a second shot',
    SENT.filter(s => s.ev === 'shot').length === shotsAfter &&
    SENT.filter(s => s.ev === 'state').length === statesBefore + 1 &&
    nacksTo(who) === nacksBefore);

  /* the host is a phone. Phones sleep. Everyone else deserves to know. */
  const hbBefore = SENT.filter(s => s.ev === 'hb').length;
  for (let k = 0; k < 5; k++) vm.runInContext('netTick()', sandbox);
  T('sleeping host — the host heartbeats every five ticks', SENT.filter(s => s.ev === 'hb').length > hbBefore);

  NET.clockAt = Date.now() - 5000;                               // the clock "expired" during the nap
  const statesBeforeWake = SENT.filter(s => s.ev === 'state').length;
  NET.revive(true);                                              // eyes open
  T('sleeping host — waking re-arms the clock instead of fouling the waiter',
    NET.clockAt > Date.now());
  T('sleeping host — and re-pushes the truth to the room',
    SENT.filter(s => s.ev === 'state').length === statesBeforeWake + 1);
}

/* ---- the shooter's watchdog: ON ITS WAY must mean it arrives, or it says so ---- */
{
  const vm = require('vm');
  const { sourceFor } = require(path.join(__dirname, '_document'));
  const code = sourceFor('pool');
  const makeEl = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, value: '' }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; }, set() { return true; },
  });
  const sandbox = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise, RegExp,
    isNaN, isFinite, parseInt, parseFloat, URLSearchParams,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { querySelector: () => makeEl(), querySelectorAll: () => [], createElement: makeEl, getElementById: makeEl, addEventListener() {}, visibilityState: 'visible', head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } } },
    addEventListener() {}, location: { reload() {}, search: '', href: '' }, navigator: {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 500,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'pool/index.html' });
  const B = sandbox.__B, NET = B.NET;
  const SENT = [];
  NET.pkey = 'c'; NET.mode = 'client';
  NET.tx = { send: (ev, p) => SENT.push({ ev, p }), presence: () => ({}), track() {}, alive: () => true, close() {} };
  B.G.phase = 'play'; B.G.turnKey = 'c'; B.G.roster = [{ key: 'c', name: 'C' }, { key: 'h', name: 'H' }];

  const intents = () => SENT.filter(s => s.ev === 'intent').length;
  NET.sendIntent('shot', { angle: 1, power: 0.5 });
  T('watchdog — the shot goes out once, carrying a nonce', intents() === 1 && SENT[0].p.n === 1 && B.PENDING === true);

  const realNow = sandbox.Date.now.bind(sandbox.Date);
  let off = 0;
  sandbox.Date.now = () => realNow() + off;
  for (let k = 1; k <= 3; k++) {
    off += 3000;
    vm.runInContext('netTick()', sandbox);
    T('watchdog — unacknowledged after ' + (off / 1000) + 's, sent again', intents() === 1 + k && B.PENDING === true);
  }
  off += 3000;
  vm.runInContext('netTick()', sandbox);
  sandbox.Date.now = realNow;
  T('watchdog — three re-sends, then honesty: the shooter is unlocked', B.PENDING === false && intents() === 4);
  T('watchdog — every copy is the same nonce, so the host plays at most one',
    SENT.filter(s => s.ev === 'intent').every(s => s.p.n === 1));

  /* and the client's side of a sleeping host: notice, hold, recover on the first word */
  B.HOSTAT = Date.now() - 20000;
  vm.runInContext('netTick()', sandbox);
  T('sleeping host — three missed heartbeats and the client knows', B.HOSTDOWN === true);
  const hellosBefore = SENT.filter(s => s.ev === 'hello').length;
  NET.onMessage('hb', { t: Date.now() });
  T('sleeping host — the first word back clears it and asks for the state',
    B.HOSTDOWN === false && SENT.filter(s => s.ev === 'hello').length === hellosBefore + 1);
}

finished = true;
console.log(fails === 0 ? 'POOLSIM: ALL PASS' : 'POOLSIM FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
