/* render-penalty — actual frames of the lab scene, rendered headless.
   The 3D was being authored blind, and it showed. This runs the page's real script
   with real THREE + cannon against headless-gl, and writes PNG stills of what a
   phone would actually display.
   Container setup (not in package.json — this is a dev eye, not a CI stage):
     apt-get install -y xvfb libgl1 libglu1-mesa libxi6
     npm i gl pngjs three@0.149.0 cannon@0.6.2
   Run: RENDER_OUT=/tmp/renders xvfb-run -a node tools/render-penalty.js */
const fs = require('fs');
const path = require('path');
const createGL = require('gl');
const { PNG } = require('pngjs');
const THREE = require('three');
const CANNON = require('cannon');

const W = 1280, H = 800;
const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';

/* ---- a canvas that is really headless-gl underneath ---- */
const glctx = createGL(W, H, { preserveDrawingBuffer: true, antialias: true });
const fakeCanvas = {
  width: W, height: H, style: {}, clientWidth: W, clientHeight: H,
  addEventListener() {}, removeEventListener() {},
  getContext: () => glctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
};

/* ---- just enough document for the page script ---- */
const els = {};
function el(id) {
  if (els[id]) return els[id];
  const base = {
    id, style: {}, innerHTML: '', textContent: '', className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], closest: () => null, onclick: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
  els[id] = id === 'gl' ? Object.assign(base, fakeCanvas) : base;
  return els[id];
}
/* a tiny raster 2D context — exactly the operations the texture painters use:
   fillRect, axis-aligned strokes, filled arcs, clearRect, getImageData. */
function miniCanvas() {
  let W = 0, Hh = 0, data = null;
  const alloc = () => { data = new Uint8ClampedArray(W * Hh * 4); };
  function parse(col) {
    if (col[0] === '#') return [parseInt(col.slice(1,3),16), parseInt(col.slice(3,5),16), parseInt(col.slice(5,7),16), 255];
    const m = /rgba?\(([^)]+)\)/.exec(col);
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3]*255) : 255];
  }
  function blend(x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= Hh) return;
    const i = (y*W + x)*4, a = c[3]/255, ia = 1-a;
    data[i]   = c[0]*a + data[i]*ia;
    data[i+1] = c[1]*a + data[i+1]*ia;
    data[i+2] = c[2]*a + data[i+2]*ia;
    data[i+3] = Math.min(255, c[3] + data[i+3]*ia);
  }
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, _px: 0, _py: 0,
    fillRect(x, y, w, h) { const c = parse(this.fillStyle);
      for (let yy = y|0; yy < y+h; yy++) for (let xx = x|0; xx < x+w; xx++) blend(xx, yy, c); },
    clearRect(x, y, w, h) { for (let yy = y|0; yy < y+h; yy++) for (let xx = x|0; xx < x+w; xx++) { const i=(yy*W+xx)*4; if(i>=0&&i<data.length){data[i]=data[i+1]=data[i+2]=data[i+3]=0;} } },
    beginPath() { this._sx = null; }, moveTo(x, y) { this._px = x; this._py = y; },
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
    getImageData: (x, y, w, h) => ({ width: w, height: h, data }),
  };
  const canvas = { style: {}, getContext: () => ctx };
  Object.defineProperty(canvas, 'width',  { get: () => W,  set(v) { W = v;  if (Hh) alloc(); } });
  Object.defineProperty(canvas, 'height', { get: () => Hh, set(v) { Hh = v; if (W)  alloc(); } });
  return canvas;
}
const documentStub = {
  getElementById: el,
  createElement: (tag) => tag === 'canvas' ? miniCanvas() : el('dyn_' + Math.random()),
  querySelectorAll: () => [], addEventListener() {}, body: el('body'),
};

/* node-canvas can paint, but headless-gl cannot upload its canvas object — so
   CanvasTexture becomes a DataTexture built from the painted pixels. */
const RealCanvasTexture = THREE.CanvasTexture;
class HeadlessCanvasTexture extends THREE.DataTexture {
  constructor(c) {
    const ctx = c.getContext('2d');
    const im = ctx.getImageData(0, 0, c.width, c.height);
    super(new Uint8Array(im.data), c.width, c.height, THREE.RGBAFormat);
    this.needsUpdate = true; this.flipY = true;
    this.minFilter = THREE.LinearFilter; this.generateMipmaps = false;
  }
}
const THREE_PATCHED = Object.create(THREE);
THREE_PATCHED.CanvasTexture = HeadlessCanvasTexture;

/* pull the lab page's inline script */
const html = fs.readFileSync(path.join(__dirname, '..', 'penalty', 'lab', 'index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const sandbox = {
  window: null, document: documentStub, THREE: THREE_PATCHED, CANNON,
  performance, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => { sandbox.__raf = cb; return 1; },
  cancelAnimationFrame() {},
  AudioContext: undefined, webkitAudioContext: undefined,
  localStorage: { getItem: () => null, setItem() {} },
  navigator: { userAgent: 'headless' },
  devicePixelRatio: 1,
};
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'penalty-lab.js' });

const D = sandbox.PenaltyDebug;
if (!D || !D.THREE_OK) { console.error('PenaltyDebug missing — is the lab exposing it?'); process.exit(1); }

/* textures made from 2D canvases could not build headless — note which materials went flat */
function snap(name) {
  D.renderer.render(D.scene, D.camera);
  const px = new Uint8Array(W * H * 4);
  glctx.readPixels(0, 0, W, H, glctx.RGBA, glctx.UNSIGNED_BYTE, px);
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {           // GL reads bottom-up
    png.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  }
  fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png));
  console.log('wrote', name);
}

D.setCam('shoot');
snap('cam-shoot.png');

D.setCam('keep');
snap('cam-keep.png');

/* a committed dive, ball at the goal line — the moment that must read clearly */
D.poseKeeper(1.9, 1.7, true, 1);
D.ballMesh.position.set(-2.4, 1.6, 0.4);
snap('cam-keep-dive.png');

D.setCam('shoot');
D.poseKeeper(0, 0, false, 0);
D.ballMesh.position.set(0.8, 1.2, 4.5);
snap('cam-shoot-flight.png');

/* keeper portraits — the model must survive a close-up */
function settle(n) { for (let i = 0; i < n; i++) D.GK.userData.stepLimbs && D.GK.userData.stepLimbs(1/60); }
D.camera.position.set(1.5, 1.35, 2.7); D.camera.lookAt(-0.1, 1.05, 0.05);
D.camera.fov = 38; D.camera.updateProjectionMatrix();
D.poseKeeper(0, 0, false, 0); settle(90);
snap('portrait-idle.png');
D.poseKeeper(0.9, 1.5, true, 1); settle(16);
D.camera.position.set(1.2, 1.5, 3.1); D.camera.lookAt(0.7, 0.9, 0.05); D.camera.updateProjectionMatrix();
snap('portrait-dive.png');
console.log('done');
