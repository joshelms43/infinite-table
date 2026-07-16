/* render-clip — MOVING proof. Runs a scripted kick through the lab's real pipeline
   under a deterministic clock, captures every frame, and writes an animated GIF plus
   PNG keyframes. Same container setup as render-penalty.js.
   Usage: RENDER_OUT=/tmp/clips xvfb-run -a node tools/render-clip.js goal|save */
const fs = require('fs');
const path = require('path');
const createGL = require('gl');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const THREE = require('three');
const CANNON = require('cannon');

const W = 1280, H = 800, GW = W >> 1, GH = H >> 1;   // render full, GIF at half
const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';
const WHICH = process.argv[2] || 'goal';

const glctx = createGL(W, H, { preserveDrawingBuffer: true, antialias: true });
const fakeCanvas = { width: W, height: H, style: {}, clientWidth: W, clientHeight: H,
  addEventListener() {}, removeEventListener() {}, getContext: () => glctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) };

/* ---- mini 2D context for the texture painters (same as render-penalty) ---- */
function miniCanvas() {
  let Wd = 0, Hh = 0, data = null;
  const alloc = () => { data = new Uint8ClampedArray(Wd * Hh * 4); };
  function parse(col) {
    if (col[0] === '#') return [parseInt(col.slice(1,3),16), parseInt(col.slice(3,5),16), parseInt(col.slice(5,7),16), 255];
    const m = /rgba?\(([^)]+)\)/.exec(col); const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3]*255) : 255];
  }
  function blend(x, y, c) {
    if (x < 0 || y < 0 || x >= Wd || y >= Hh) return;
    const i = (y*Wd + x)*4, a = c[3]/255, ia = 1-a;
    data[i] = c[0]*a + data[i]*ia; data[i+1] = c[1]*a + data[i+1]*ia;
    data[i+2] = c[2]*a + data[i+2]*ia; data[i+3] = Math.min(255, c[3] + data[i+3]*ia);
  }
  const ctx = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect(x, y, w, h) { const c = parse(this.fillStyle);
      for (let yy = y|0; yy < y+h; yy++) for (let xx = x|0; xx < x+w; xx++) blend(xx, yy, c); },
    clearRect(x, y, w, h) { for (let yy = y|0; yy < y+h; yy++) for (let xx = x|0; xx < x+w; xx++) { const i=(yy*Wd+xx)*4; if(data&&i>=0&&i<data.length){data[i]=data[i+1]=data[i+2]=data[i+3]=0;} } },
    beginPath() {}, moveTo(x, y) { this._px = x; this._py = y; },
    lineTo(x, y) { this._lx0 = this._px; this._ly0 = this._py; this._px = x; this._py = y; },
    stroke() { const c = parse(this.strokeStyle), lw = Math.max(1, Math.round(this.lineWidth));
      const x0 = this._lx0, y0 = this._ly0, x1 = this._px, y1 = this._py;
      if (x0 === x1) { for (let yy = Math.min(y0,y1)|0; yy <= Math.max(y0,y1); yy++) for (let k = 0; k < lw; k++) blend((x0|0)+k, yy, c); }
      else { for (let xx = Math.min(x0,x1)|0; xx <= Math.max(x0,x1); xx++) for (let k = 0; k < lw; k++) blend(xx, (y0|0)+k, c); } },
    arc(x, y, r) { this._ax = x; this._ay = y; this._ar = r; },
    fill() { if (this._ar == null) return; const c = parse(this.fillStyle), r = this._ar;
      for (let yy = Math.floor(this._ay-r); yy <= this._ay+r; yy++) for (let xx = Math.floor(this._ax-r); xx <= this._ax+r; xx++)
        if ((xx-this._ax)**2 + (yy-this._ay)**2 <= r*r) blend(xx, yy, c);
      this._ar = null; },
    getImageData: (x, y, w, h) => ({ width: w, height: h, data }) };
  const canvas = { style: {}, getContext: () => ctx };
  Object.defineProperty(canvas, 'width',  { get: () => Wd, set(v) { Wd = v; if (Hh) alloc(); } });
  Object.defineProperty(canvas, 'height', { get: () => Hh, set(v) { Hh = v; if (Wd) alloc(); } });
  return canvas;
}

const els = {};
function el(id) {
  if (els[id]) return els[id];
  const base = { id, style: {}, innerHTML: '', textContent: '', className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [],
    closest: () => null, onclick: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) };
  els[id] = id === 'gl' ? Object.assign(base, fakeCanvas) : base;
  return els[id];
}
const documentStub = { getElementById: el,
  createElement: (tag) => tag === 'canvas' ? miniCanvas() : el('dyn_' + Math.random()),
  querySelectorAll: () => [], addEventListener() {}, body: el('body') };

const RealTHREE = THREE;
class HeadlessCanvasTexture extends RealTHREE.DataTexture {
  constructor(c) {
    const im = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    super(new Uint8Array(im.data), c.width, c.height, RealTHREE.RGBAFormat);
    this.needsUpdate = true; this.flipY = true;
    this.minFilter = RealTHREE.LinearFilter; this.generateMipmaps = false;
  }
}
const THREE_PATCHED = Object.create(RealTHREE);
THREE_PATCHED.CanvasTexture = HeadlessCanvasTexture;

/* ---- deterministic clock: the page's whole sense of time is ours ---- */
let CLOCK = 0;
const html = fs.readFileSync(path.join(__dirname, '..', 'penalty', 'lab', 'index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const sandbox = {
  window: null, document: documentStub, THREE: THREE_PATCHED, CANNON,
  performance: { now: () => CLOCK * 1000 },
  console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: (cb) => { sandbox.__raf = cb; return 1; }, cancelAnimationFrame() {},
  AudioContext: undefined, webkitAudioContext: undefined,
  localStorage: { getItem: () => null, setItem() {} },
  navigator: { userAgent: 'headless' }, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  Math,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'penalty-lab.js' });
const D = sandbox.PenaltyDebug;
if (!D) { console.error('no PenaltyDebug'); process.exit(1); }

/* ---- frames -> GIF ---- */
const gif = GIFEncoder();
const full = new Uint8Array(W * H * 4);
const small = new Uint8ClampedArray(GW * GH * 4);
function grabFrame(alsoPng) {
  glctx.readPixels(0, 0, W, H, glctx.RGBA, glctx.UNSIGNED_BYTE, full);
  // flip + 2x2 box downscale
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const sy = H - 2 - y*2, sx = x*2;
    for (let c = 0; c < 4; c++) {
      const a = full[(sy*W + sx)*4 + c], b = full[(sy*W + sx+1)*4 + c],
            d = full[((sy+1)*W + sx)*4 + c], e = full[((sy+1)*W + sx+1)*4 + c];
      small[(y*GW + x)*4 + c] = (a + b + d + e) >> 2;
    }
  }
  const palette = quantize(small, 256);
  gif.writeFrame(applyPalette(small, palette), GW, GH, { palette, delay: 40 });
  if (alsoPng) {
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) png.data.set(full.subarray((H-1-y)*W*4, (H-y)*W*4), y*W*4);
    fs.writeFileSync(path.join(OUT, alsoPng), PNG.sync.write(png));
    console.log('wrote', alsoPng);
  }
}

/* ---- the clip scripts ---- */
const FPS = 25, DT = 1 / FPS;
function tick() { CLOCK += DT; const cb = sandbox.__raf; sandbox.__raf = null; if (cb) cb(CLOCK * 1000); }

let frames, keyAt, name;
if (WHICH === 'goal') {
  name = 'clip-goal.gif';
  D.testKick({ aim: [2.35, 1.05], power: 0.62 }, 777001, 'keep');
  frames = 42; keyAt = { 8: 'key-goal-incoming.png', 14: 'key-goal-netcatch.png', 22: 'key-goal-settle.png' };
} else {
  name = 'clip-save.gif';
  D.testKick({ aim: [-2.5, 1.45], power: 0.5 }, 424242, 'keep');
  const K = D.getK();
  // a committed dive to the shooter's left, launched just after the kick
  setTimeoutFrames = 3;
  frames = 46; keyAt = { 6: 'key-save-dive.png', 12: 'key-save-contact.png', 26: 'key-save-landing.png' };
}

const PROBE = { cloth: [], arm: [], ball: [] };
function sandbox_ball() {
  const m = D.ballMesh.position;
  const K2 = D.getK();
  return m.x.toFixed(2) + ',' + m.y.toFixed(2) + ',' + m.z.toFixed(2) + (K2 && K2.outcome ? '=' + K2.outcome : '');
}
const clothRest = D.getCloth().P.map(p => ({ x: p.x, y: p.y, z: p.z }));
for (let f = 0; f < frames; f++) {
  if (WHICH === 'save' && f === 2) {
    const K = D.getK();
    K.dragging = true; K.diving = true; K.dirX = -1;
    K.dragTarget = [-2.35, 1.55];
  }
  if (WHICH === 'save' && f === 9) { D.getK().dragging = false; }   // gravity takes over: the landing
  tick();
  if (f === 2) {
    let red = 0;
    for (let i = 0; i < small.length; i += 4) {
      if (small[i] > 170 && small[i+1] < 110 && small[i+2] < 130) red++;
    }
    console.log('MARKER: tell.visible=' + D.tell.visible + ', red marker pixels in keep-cam frame=' + red + ', net opacity=' + D.netMat.opacity);
    if (red < 40) { console.error('MARKER REGRESSION: the tell is not visibly rendering from the keeper seat'); process.exitCode = 1; }
  }
  const CP = D.getCloth().P;
  let mx = 0;
  for (let i = 0; i < CP.length; i++) {
    const dx = CP[i].x - clothRest[i].x, dy = CP[i].y - clothRest[i].y, dz = CP[i].z - clothRest[i].z;
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz); if (d > mx) mx = d;
  }
  PROBE.cloth.push(mx);
  PROBE.arm.push(D.GK.children.find(c => c.type === 'Group' && c.position.y > 1.4 && c.position.x < 0).rotation.z);
  const KB = D.getK(), bb = KB && KB.launch ? null : null;
  PROBE.ball.push(sandbox_ball());
  grabFrame(keyAt && keyAt[f]);
}
gif.finish();
fs.writeFileSync(path.join(OUT, name), Buffer.from(gif.bytes()));
const K = D.getK();
console.log('wrote', name, '| outcome:', K && K.outcome, '| wood:', K && K.wood);
/* physics probes — the numbers that prove motion when eyes are unavailable */
if (PROBE.cloth.length) {
  console.log('cloth max deflection per frame (m):', PROBE.cloth.map(v => v.toFixed(2)).join(' '));
}
if (PROBE.arm.length) {
  console.log('lead-arm angle per frame (rad):', PROBE.arm.map(v => v.toFixed(2)).join(' '));
}
console.log('ball x,y,z per frame:');
console.log(PROBE.ball.join(' | '));
