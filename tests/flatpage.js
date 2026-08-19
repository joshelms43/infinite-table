/* flatpage — Flatland inside the real Duel page.
   Boots duel/index.html the way bootsim does (document order, real inline
   script, real shared modules) with a mechanical THREE stub, then plays a
   practice round where I own the Flatland powerup. Pins the promises:
   the round goes flat, my sim drives the body of record, contacts wound the
   foe through the page's own landHit -> applyHit pipeline, deaths end the
   round, and a round without the powerup stays 3D. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — flatpage never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

const ROOT = path.join(__dirname, '..');
const { partsFor } = require('./_document');

/* ---- a mechanical THREE: vectors that work, a scene graph that swallows ---- */
function V3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
V3.prototype = {
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
  clone() { return new V3(this.x, this.y, this.z); },
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; },
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); },
  length() { return Math.hypot(this.x, this.y, this.z); },
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; },
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); },
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; },
  cross(v) { return new V3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); },
  crossVectors(a, b) { return this.copy(a.cross(b)); },
  applyAxisAngle() { return this; }, applyQuaternion() { return this; }, applyEuler() { return this; },
  setFromMatrixPosition() { return this; }, lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
};
function Obj3D() {
  this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0, set() {} };
  this.scale = Object.assign(new V3(1, 1, 1), { setScalar(s) { this.x = this.y = this.z = s; return this; }, addScalar(s) { this.x += s; this.y += s; this.z += s; return this; } });
  this.children = []; this.visible = true; this.castShadow = false; this.receiveShadow = false;
  this.material = { opacity: 1, color: { set() {}, setHex() {} }, emissive: { set() {}, setHex() {} } };
}
Obj3D.prototype = {
  add(c) { this.children.push(c); return this; }, remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
  traverse(fn) { fn(this); this.children.forEach(c => c.traverse ? c.traverse(fn) : fn(c)); },
  lookAt() {}, getWorldPosition(t) { return t ? t.copy(this.position) : this.position.clone(); },
  updateMatrixWorld() {}
};
function mkTHREE(sandbox) {
  const O = () => new Obj3D();
  const cls = () => function () { Obj3D.call(this); Object.assign(this, ...arguments && typeof arguments[0] === 'object' ? [arguments[0]] : []); };
  const Geo = function () {}; Geo.prototype = { dispose() {}, translate() { return this; }, rotateX() { return this; }, rotateY() { return this; }, rotateZ() { return this; }, setFromPoints() { return this; }, setAttribute() { return this; }, computeVertexNormals() { return this; } };
  const Mat = function (o) { Obj3D.call(this); Object.assign(this, o || {}); this.color = (o && o.color !== undefined) ? { set() {}, setHex() {} } : { set() {}, setHex() {} }; this.dispose = () => {}; };
  const Mesh = function (g, m) { Obj3D.call(this); this.geometry = g; this.material = m || new Mat(); };
  Mesh.prototype = Object.create(Obj3D.prototype);
  const Group = function () { Obj3D.call(this); };
  Group.prototype = Object.create(Obj3D.prototype);
  let now = 0;
  return {
    Vector3: V3,
    Clock: function () { this.getDelta = () => 1 / 60; this.getElapsedTime = () => (now += 1 / 60); },
    Scene: function () { Obj3D.call(this); this.fog = null; this.background = null; this.add = Obj3D.prototype.add; this.remove = Obj3D.prototype.remove; this.traverse = Obj3D.prototype.traverse; },
    PerspectiveCamera: function () { Obj3D.call(this); this.fov = 75; this.aspect = 1; this.updateProjectionMatrix = () => {}; this.lookAt = () => {}; this.add = Obj3D.prototype.add; },
    WebGLRenderer: function () { return { setSize() {}, setPixelRatio() {}, render() {}, shadowMap: {}, domElement: sandbox.document.getElementById('gl'), setClearColor() {}, dispose() {} }; },
    BoxGeometry: Geo, SphereGeometry: Geo, CylinderGeometry: Geo, PlaneGeometry: Geo,
    CapsuleGeometry: Geo, ConeGeometry: Geo, TorusGeometry: Geo, BufferGeometry: Geo, CircleGeometry: Geo,
    MeshStandardMaterial: Mat, MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, LineBasicMaterial: Mat, SpriteMaterial: Mat, PointsMaterial: Mat,
    Mesh: Mesh, Group: Group, Object3D: function () { Obj3D.call(this); },
    Line: Mesh, LineLoop: Mesh, Points: Mesh, Sprite: Mesh,
    DirectionalLight: function () { Obj3D.call(this); this.target = new Obj3D(); this.shadow = { mapSize: {}, camera: {} }; },
    AmbientLight: function () { Obj3D.call(this); },
    PointLight: function () { Obj3D.call(this); },
    HemisphereLight: function () { Obj3D.call(this); },
    Fog: function () {}, FogExp2: function () {}, Color: function () { return { set() {}, setHex() {} }; },
    Float32BufferAttribute: function () {}, BufferAttribute: function () {},
    DoubleSide: 2, FrontSide: 0, PCFSoftShadowMap: 1, SRGBColorSpace: 'srgb', ACESFilmicToneMapping: 4
  };
}

/* ---- browser stub in the bootsim mould ---- */
function mkCtx2D() {
  /* an infinitely agreeable 2D context: every method exists, returns more of itself */
  const fn = function () { return anyv; };
  const anyv = new Proxy(fn, {
    get(t, k) {
      if (k === 'canvas') return { width: 8, height: 8 };
      if (k === 'width') return 0;
      if (k === 'data') return new Uint8ClampedArray(4);
      if (k === Symbol.toPrimitive) return () => 0;
      return anyv;
    },
    set() { return true; },
    apply() { return anyv; }
  });
  return anyv;
}
function stubBrowser() {
  const els = {};
  const el = (id) => {
    if (els[id]) return els[id];
    const base = {
      id, style: {}, innerHTML: '', textContent: '', className: '', value: '', checked: false,
      children: [], offsetWidth: 0, dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, removeEventListener() {},
      appendChild(c) { this.children.push(c); return c; }, remove() {},
      insertBefore(c) { this.children.push(c); return c; },
      firstChild: { style: {} },
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      focus() {}, blur() {}, click() {},
      getContext: () => mkCtx2D(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450, right: 800, bottom: 450 })
    };
    els[id] = base;
    return base;
  };
  const raf = { q: [] };
  const doc = {
    getElementById: el,
    createElement: (t) => el('_dyn' + Math.random()),
    body: Object.assign(el('_body'), { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    exitPointerLock() {}, pointerLockElement: null,
    hidden: false, visibilityState: 'visible'
  };
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError,
    parseInt, parseFloat, isNaN, isFinite, Promise, Map, Set, Uint8Array, Uint8ClampedArray, Float32Array, Infinity, NaN, undefined,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: (fn) => { raf.q.push(fn); return raf.q.length; },
    cancelAnimationFrame() {},
    document: doc,
    navigator: { vibrate() {}, userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
    location: { search: '', href: 'https://x/duel/', origin: 'https://x', pathname: '/duel/', hash: '', protocol: 'https:' },
    history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    innerWidth: 800, innerHeight: 450, devicePixelRatio: 1,
    performance: { now: () => Date.now() },
    AudioContext: undefined, webkitAudioContext: undefined,
    fetch: () => new Promise(() => {}),
    screen: { orientation: { lock: () => Promise.resolve(), addEventListener() {} } },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, randomUUID: () => 'u' + Math.random() }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.THREE = mkTHREE(sandbox);
  return { sandbox, raf };
}

(async () => {
  const { sandbox, raf } = stubBrowser();
  const ctx = vm.createContext(sandbox);
  const parts = partsFor('duel/index.html');
  for (const part of parts) {
    if (part.what && /three|supabase/i.test(part.what)) continue;   /* THREE is stubbed; no net */
    try {
      vm.runInContext(part.code, ctx, { filename: part.what });
    } catch (e) {
      T('duel boots headless (' + part.what + ')', false, e.message);
      finished = true;
      process.exit(1);
    }
  }
  const D = sandbox.window.DuelDebug || sandbox.DuelDebug;
  T('the page boots with the bridge up', !!D && !!D.FLAT && !!D.FlatDuel);

  const pump = (n) => { for (let i = 0; i < n; i++) { const q = raf.q.splice(0); q.forEach(fn => fn()); } };

  /* ---- a flat practice round ---- */
  D.startBot(5);
  D.G.seed = 12345;
  D.me.picks.push('flatland');
  sandbox.window.DuelDebug.G.phase = 'menu';        /* restart the round with the pick owned */
  D.G.round = 0;
  vm.runInContext('DuelDebug.me.stats = DuelDebug.PU.statsFor(DuelDebug.me.picks)', ctx);
  vm.runInContext('startCountdown()', ctx);

  T('owning Flatland flips the round flat', D.FLAT.active === true);
  T('the flat world stands on the current map', !!D.FLAT.w && !!D.FLAT.w.arena);
  T('my fighter and the foe are both in it',
    !!D.FLAT.w.fighters.me && !!D.FLAT.w.fighters.foe);
  T('the page owns damage, not the sim', D.FLAT.w.detectOnly === true);

  pump(60 * 3 + 10);                                 /* countdown burns off */
  T('the fight begins flat', D.G.phase === 'fight');

  const mine = D.FLAT.w.fighters.me;
  T('the sim drives the body of record',
    Math.abs(D.me.pos.x - mine.x) < 0.001 && Math.abs(D.me.pos.y - mine.y) < 0.001);

  /* aim at the foe and hold fire through the bridge */
  const foeHp0 = D.foe.hp;
  let frames = 0;
  while (frames < 60 * 20 && D.G.phase === 'fight') {
    const ff = D.FLAT.w.fighters.foe;
    D.FLAT.haveMouse = false;
    D.FLAT.mouseFire = true;
    D.FLAT.aim = Math.atan2(ff.y - mine.y, ff.x - mine.x);
    pump(1);
    frames++;
  }
  T('contacts wound the foe through the real pipeline', D.foe.hp < foeHp0,
    foeHp0 + ' -> ' + D.foe.hp);
  T('the round ends the usual way', D.G.phase !== 'fight',
    'phase=' + D.G.phase + ' after ' + frames + ' frames');
  T('somebody actually died', !D.foe.alive || !D.me.alive);

  /* ---- and a round without the powerup stays 3D ---- */
  D.me.picks.length = 0;
  D.foe.picks.length = 0;
  vm.runInContext('DuelDebug.me.stats = DuelDebug.PU.statsFor([])', ctx);
  vm.runInContext('DuelDebug.foe.stats = DuelDebug.PU.statsFor([])', ctx);
  vm.runInContext('startCountdown()', ctx);
  T('a clean round stays 3D', D.FLAT.active === false);

  finished = true;
  console.log(fails ? '\nflatpage: ' + fails + ' FAILURES' : '\nflatpage: all green');
  process.exit(fails ? 1 : 0);
})();
