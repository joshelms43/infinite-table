/* render-pool — actual stills of the pool table, rendered headless.

   The 2D was about to be authored blind too. This boots pool/index.html the way
   bootsim does — document order, vm sandbox — but hands the page a REAL canvas
   (@napi-rs/canvas), stages a mid-game through the page's own NET/rules/physics,
   and writes PNGs of exactly what the page's own draw() paints.

   Container setup (not in package.json — a dev eye, not a CI stage):
     npm i @napi-rs/canvas
   Run: RENDER_OUT=/tmp/renders node tools/render-pool.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas } = require('@napi-rs/canvas');
const { partsFor } = require('../tests/_document');

const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}

function boot(cssW, innerW, innerH) {
  const cv = createCanvas(10, 10);
  cv.style = {};
  cv.addEventListener = () => {};
  cv.setPointerCapture = () => {};
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cssW, height: 10 });

  const el = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, querySelectorAll: () => [], querySelector: () => el() }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set() { return true; },
  });
  const store = {};
  const sandbox = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise,
    isNaN, isFinite, parseInt, parseFloat, RegExp, Error, TypeError, URLSearchParams,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: {
      querySelector: (s) => (s === '#cv' ? cv : el()),
      querySelectorAll: () => [], createElement: () => el(),
      getElementById: (id) => (id === 'cv' ? cv : el()), addEventListener: () => {},
      body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
      head: { appendChild() {} }, visibilityState: 'visible',
    },
    addEventListener: () => {},
    location: { reload() {}, search: '', origin: '', pathname: '', href: '' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: {}, fetch: () => new Promise(() => {}),
    devicePixelRatio: 1, innerWidth: innerW, innerHeight: innerH,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const part of partsFor('pool')) {
    vm.runInContext(part.code, sandbox, { filename: part.what });
  }
  return { sandbox, cv };
}

function stage(sandbox, script) { return vm.runInContext(script, sandbox); }

function still(name, cssW, innerW, innerH, setup) {
  const { sandbox, cv } = boot(cssW, innerW, innerH);
  stage(sandbox, setup);
  stage(sandbox, 'fit(); draw();');
  fs.writeFileSync(path.join(OUT, name), cv.toBuffer('image/png'));
  console.log('wrote', name, cv.width + 'x' + cv.height);
}

/* a believable mid-game, built by the page's own modules */
const MIDGAME = `
  NET.pkey = 'me';
  NET.mode = 'host';
  const order = PoolRules.rackOrder(7);
  const pos = PoolPhysics.rackPositions();
  const cs = PoolPhysics.cueStart();
  let balls = [{ id:0, x:cs.x, y:cs.y, vx:0, vy:0, pocketed:false }]
    .concat(order.map((id,i)=>({ id, x:pos[i].x, y:pos[i].y, vx:0, vy:0, pocketed:false })));
  const brk = PoolPhysics.simulate(balls, { angle: 0.015, power: 1 });
  G.phase='play'; G.seq=3;
  G.balls = brk.balls.map(b=>({ id:b.id, x:b.x, y:b.y, pocketed:b.pocketed }));
  G.roster=[{key:'me',name:'Josh'},{key:'them',name:'Denny'}];
  G.turnKey='me'; G.open=false; G.groups={ me:'solid', them:'stripe' };
  G.breakShot=false; G.inHand=null;
`;

still('pool-aim.png', 380, 380, 780, MIDGAME + `
  const cue = G.balls.find(b=>b.id===0);
  AIMDIR = { angle: Math.atan2(-0.18, 0.5) };      // a sticky aim with the guide up
  POWERDRAG = { p: 0.62 };                          // the bar pulled well down, stick drawn back
  SPIN = { x: 0.5, y: -0.6 };                       // low-right english dialled in on the little ball
`);

still('pool-portrait.png', 380, 380, 780, MIDGAME + `
  G.inHand = { key:'me', behindHead:false };   // ball in hand ring on a phone
`);

still('pool-break.png', 380, 380, 780, `
  NET.pkey='me'; NET.mode='host';
  G.roster=[{key:'me',name:'Josh'},{key:'them',name:'Denny'}];
  const order = PoolRules.rackOrder(11);
  const pos = PoolPhysics.rackPositions();
  const cs = PoolPhysics.cueStart();
  const before = [{ id:0, x:cs.x, y:cs.y, pocketed:false }]
    .concat(order.map((id,i)=>({ id, x:pos[i].x, y:pos[i].y, pocketed:false })));
  G.phase='play'; G.turnKey='them';
  playShot(before, { angle: 0.01, power: 1 }, { seq: 9 });
  ANIM.sim.step(120);                           // a quarter second into the break
`);

console.log('done — the table, seen.');
