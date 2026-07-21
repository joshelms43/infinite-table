/* render-range — frames of the gallery, rendered headless, plus shot-logic proof.
   Runs the page's real inline script with real THREE against headless-gl.
   Container setup (not in package.json — dev eye, not a CI stage):
     apt-get install -y xvfb libgl1 libglu1-mesa libxi6
     npm i --no-save gl pngjs three@0.149.0
   Run: RENDER_OUT=/tmp/renders xvfb-run -a node tools/render-range.js */
const fs = require('fs');
const path = require('path');
const createGL = require('gl');
const { PNG } = require('pngjs');
const THREE = require('three');

const W = 1280, H = 800;
const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';
fs.mkdirSync(OUT, { recursive: true });

const glctx = createGL(W, H, { preserveDrawingBuffer: true, antialias: true });
const fakeCanvas = {
  width: W, height: H, style: {}, clientWidth: W, clientHeight: H,
  addEventListener() {}, removeEventListener() {},
  getContext: () => glctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
};

const els = {};
function el(id) {
  if (els[id]) return els[id];
  const base = {
    id, style: {}, innerHTML: '', textContent: '', className: '',
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    querySelectorAll: () => [], closest: () => null, onclick: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
  els[id] = id === 'gl' ? Object.assign(base, fakeCanvas) : base;
  return els[id];
}
const documentStub = {
  getElementById: el,
  createElement: () => el('dyn_' + Math.random()),
  querySelectorAll: () => [], addEventListener() {}, body: el('body'),
};

const html = fs.readFileSync(path.join(__dirname, '..', 'range', 'index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const sandbox = {
  window: null, document: documentStub, THREE,
  performance, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  AudioContext: undefined, webkitAudioContext: undefined,
  localStorage: { getItem: () => null, setItem() {} },
  navigator: { userAgent: 'headless' },
  matchMedia: () => ({ matches: false }),
  devicePixelRatio: 1, innerWidth: W, innerHeight: H,
};
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'range.js' });

const D = sandbox.RangeDebug;
if (!D || !D.THREE_OK) { console.error('RangeDebug missing'); process.exit(1); }

let fails = 0;
function T(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
}

function snap(name) {
  D.renderer.render(D.scene, D.camera);
  const px = new Uint8Array(W * H * 4);
  glctx.readPixels(0, 0, W, H, glctx.RGBA, glctx.UNSIGNED_BYTE, px);
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) png.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png));
  console.log('wrote', name);
}

/* ---- stills: empty range, then a populated round ---- */
snap('range-empty.png');

D.startRound();
D.makeTarget(0, -1.8);
D.makeTarget(0, 1.5);
D.makeTarget(1, -3.5);
D.makeTarget(1, 3.0);
D.makeTarget(2, 0.5);
D.step(0.35);   /* let plates finish rising */
snap('range-live.png');

/* ---- shot-logic proof against real geometry ---- */
const tgt = D.targets[0];
tgt.root.updateMatrixWorld(true);

/* dead centre → bull */
const centre = new THREE.Vector3();
tgt.face.getWorldPosition(centre);
D.aimAtWorld(centre);
let r = D.resolveShot();
T('centre shot hits', r.hit === true);
T('centre shot is a bull', r.hit && r.ring === 2, r.hit ? 'ring ' + r.ring : 'miss');
T('bull on row 0 scores 100', r.hit && r.points === 100, String(r.points));
T('a hit knocks the plate over', tgt.state === 'falling');

/* outer edge of a fresh plate → face ring, 25 × row mult */
const t2 = D.targets.find(t => t.state === 'up' && t.row === 1);
t2.root.updateMatrixWorld(true);
const edge = new THREE.Vector3(t2.radius * 0.8, 0, 0);
t2.face.localToWorld(edge);
D.aimAtWorld(edge);
r = D.resolveShot();
T('edge shot hits', r.hit === true);
T('edge shot is outer ring', r.hit && r.ring === 0, r.hit ? 'ring ' + r.ring : 'miss');
T('outer on row 1 scores 50', r.hit && r.points === 50, String(r.points));

/* empty sky → miss, streak resets in fire() path (resolve just reports) */
D.setAim(0, 0.9);
r = D.resolveShot();
T('sky shot misses', r.hit === false);

/* fallen plates can no longer be hit */
tgt.root.updateMatrixWorld(true);
D.aimAtWorld(centre);
r = D.resolveShot();
T('a falling plate is dead to the ray', !(r.hit && r.tgt === tgt));

snap('range-after-shots.png');

console.log(fails ? 'RENDER TESTS FAILED: ' + fails : 'RENDER TESTS GREEN');
process.exit(fails ? 1 : 0);
