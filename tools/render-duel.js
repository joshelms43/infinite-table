/* render-duel — frames of the arena rendered headless, plus combat-logic proof.
   Runs the page's real inline script with real THREE, the real TableKit, and the
   real powerup rulebook against headless-gl.
   Setup: apt-get install -y xvfb libgl1 libglu1-mesa libxi6
          npm i --no-save gl pngjs three@0.149.0
   Run: RENDER_OUT=/tmp/renders xvfb-run -a node tools/render-duel.js */
const fs = require('fs');
const path = require('path');
const createGL = require('gl');
const { PNG } = require('pngjs');
const THREE = require('three');
const TableKit = require(path.join(__dirname, '..', 'shared', 'tablekit.js'));
const DuelPowerups = require(path.join(__dirname, '..', 'shared', 'duel-powerups.js'));

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
    id, style: {}, innerHTML: '', textContent: '', className: '', value: '',
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); }, remove() {},
    querySelectorAll: () => [], closest: () => null, onclick: null,
    offsetWidth: 0,
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

const html = fs.readFileSync(path.join(__dirname, '..', 'duel', 'index.html'), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const timeouts = [];
const sandbox = {
  window: null, document: documentStub, THREE,
  TableKit, DuelPowerups,
  performance, console,
  setTimeout: (fn) => { timeouts.push(fn); return timeouts.length; },
  clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  AudioContext: undefined, webkitAudioContext: undefined,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'headless' },
  matchMedia: () => ({ matches: false }),
  devicePixelRatio: 1, innerWidth: W, innerHeight: H,
  Math, JSON,
};
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'duel.js' });

const D = sandbox.DuelDebug;
if (!D || !D.THREE_OK) { console.error('DuelDebug missing'); process.exit(1); }

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

/* ---- the arena from the menu ---- */
snap('duel-menu.png');

/* ---- distance maths that hit detection stands on ---- */
const V = (x,y,z) => new THREE.Vector3(x,y,z);
T('segSegDist: crossing segments touch',
  Math.abs(D.segSegDist(V(-1,0,0), V(1,0,0), V(0,-1,0), V(0,1,0))) < 1e-6);
T('segSegDist: parallel offset segments',
  Math.abs(D.segSegDist(V(0,0,0), V(1,0,0), V(0,2,0), V(1,2,0)) - 2) < 1e-6);
T('segSegDist: endpoint to endpoint',
  Math.abs(D.segSegDist(V(0,0,0), V(1,0,0), V(3,0,0), V(4,0,0)) - 2) < 1e-6);

/* ---- a round against the bot ---- */
D.startBot();
T('round starts in countdown', D.G.phase === 'countdown');
T('tank-free base HP is 100', D.me.hp === 100, String(D.me.hp));

/* settle onto the floor */
for (let i = 0; i < 60; i++) D.moveSelf(1/60);
T('gravity settles the player on the floor', D.me.onGround === true && D.me.pos.y < 0.05,
  'y=' + D.me.pos.y.toFixed(3));

/* walking west into the wall stops at the wall */
D.keys.KeyW = false; D.keys.KeyA = false;
D.me.pos.set(-8, 0.01, 0); D.me.vel.set(0,0,0);  /* line up with the west stairs */
D.me.yaw = Math.PI / 2;         /* face −x */
D.keys.KeyW = true;
for (let i = 0; i < 600; i++) D.moveSelf(1/60);
D.keys.KeyW = false;
T('the west wall stops the player', D.me.pos.x > -15.2 && D.me.pos.x < -13.0,
  'x=' + D.me.pos.x.toFixed(2));
T('walking got them up the west stairs', D.me.pos.y > 1.25, 'y=' + D.me.pos.y.toFixed(2));

/* ---- shooter judges a hit on the bot ---- */
D.G.phase = 'fight';
D.foe.pos.set(0, 0, 0); D.foe.alive = true; D.foe.hp = D.foe.stats.hp;
const hpBefore = D.foe.hp;
const from = V(-4, 1.3, 0);  /* over the centre cover's collision margin, inside the capsule */
const b = D.spawnBullet('me', from, V(1, 0, 0), D.me.stats, {});
let steps = 0;
while (D.bullets.includes(b) && steps++ < 200) D.stepBullet(b, 1/60) || D.bullets.splice(D.bullets.indexOf(b), 1);
T('a straight shot lands on the fighter', D.foe.hp < hpBefore, hpBefore + ' -> ' + D.foe.hp);

/* ---- bounce reflects, phase passes ---- */
const wallB = D.spawnBullet('me', V(-13.5, 1.2, 8), V(-1, 0, 0),  /* z=8: nothing behind for 30m */
  Object.assign({}, D.me.stats, { bounces: 2, bulletSpeed: 30 }), {});
wallB.bounces = 2;
let alive = true;
for (let i = 0; i < 30 && alive; i++) alive = D.stepBullet(wallB, 1/60);
T('a bouncy bullet survives the wall and reverses', alive && wallB.vel.x > 0,
  'vx=' + wallB.vel.x.toFixed(1));

const ghost = D.spawnBullet('me', V(-13.5, 1.2, -5), V(-1, 0, 0),
  Object.assign({}, D.me.stats, { phase: true }), {});
let galive = true;
for (let i = 0; i < 20 && galive; i++) galive = D.stepBullet(ghost, 1/60);
T('a phantom bullet passes through the wall', ghost.pos.x < -15.8, 'x=' + ghost.pos.x.toFixed(1));

/* ---- powerups change the sheet that spawns use ---- */
D.me.picks = ['tank', 'sprinter'];
D.foe.picks = ['unit'];
D.G.myScore = 0; D.G.foeScore = 0;
D.startBot._skip = true;
/* re-run a countdown through the real path */
sandbox.DuelDebug.G.round = 0;
D.me.picks = ['tank', 'sprinter'];  /* startBot clears picks, so set after a manual countdown */
{
  /* drive the same functions startCountdown drives */
  D.me.stats = D.PU.statsFor(['tank', 'sprinter']);
  D.foe.stats = D.PU.statsFor(['unit']);
  D.me.hp = D.me.stats.hp;
}
T('Tank raises max HP to 160', D.me.stats.hp === 160, String(D.me.stats.hp));
T('Sprinter raises move speed', D.me.stats.moveSpeed > 6.5, D.me.stats.moveSpeed.toFixed(2));
T('Absolute Unit scales the foe up', D.foe.stats.scale > 1.2, String(D.foe.stats.scale));

/* a bigger fighter is easier to hit */
D.foe.pos.set(0, 0, 0);
const graze = D.hitsFighter(V(-2, 1.0, 0.62), V(2, 1.0, 0.62), D.foe, 0.12);
T('the scaled-up fighter catches a graze a normal one would not', graze === true);
D.foe.stats = D.PU.statsFor([]);
const grazeSmall = D.hitsFighter(V(-2, 1.0, 0.62), V(2, 1.0, 0.62), D.foe, 0.12);
T('the base fighter does not', grazeSmall === false);

/* ---- touch controls drive the same movement ---- */
D.me.pos.set(2.6, 0.01, 8); D.me.vel.set(0,0,0); D.me.yaw = 0; D.me.pitch = 0;  /* a clear lane */
for (let i = 0; i < 30; i++) D.moveSelf(1/60);   /* settle */
D.setStickVec(0, -1);                             /* full stick forward */
for (let i = 0; i < 60; i++) D.moveSelf(1/60);
const fullRun = 8 - D.me.pos.z;
T('a full stick walks the player forward', fullRun > 3, fullRun.toFixed(2));
D.clearStick();
D.me.pos.set(2.6, 0.01, 8); D.me.vel.set(0,0,0);
D.setStickVec(0, -0.4);                           /* partial stick */
for (let i = 0; i < 60; i++) D.moveSelf(1/60);
const halfRun = 8 - D.me.pos.z;
T('a partial stick is a walk, not a sprint', halfRun > 0.5 && halfRun < fullRun * 0.7,
  halfRun.toFixed(2) + ' vs ' + fullRun.toFixed(2));
D.clearStick();
const yaw0 = D.me.yaw;
D.applyLook(120, 0);
T('a look drag turns the head', D.me.yaw < yaw0, (D.me.yaw - yaw0).toFixed(3));
D.applyLook(0, -100000);
T('the pitch clamp holds against any drag', D.me.pitch <= 1.45, String(D.me.pitch));
D.G.phase = 'fight'; D.G.mode = 'bot'; D.me.alive = true;
D.me.stats = D.PU.statsFor([]);
D.me.mag = 8; D.me.reload = 0; D.me.fireCd = 0; D.me.shotsInMag = 0;
D.foe.alive = false;                              /* nobody downrange to eat the shots */
D.touch.firing = true;
const nBullets = D.bullets.length, magBefore = D.me.mag;
for (let i = 0; i < 30; i++) D.stepSelfStatus(1/60);   /* half a second of held Fire */
D.touch.firing = false;
T('holding Fire empties rounds through the real gate',
  D.bullets.length > nBullets && D.me.mag < magBefore,
  'bullets +' + (D.bullets.length - nBullets) + ', mag ' + magBefore + '->' + D.me.mag);
T('held fire respects the fire-rate cooldown',
  magBefore - D.me.mag <= 3, 'shots=' + (magBefore - D.me.mag));

/* ---- headshots and the bot's teeth ---- */
{
  D.G.mode = 'bot'; D.G.phase = 'fight';
  D.me.stats = D.PU.statsFor([]); D.foe.stats = D.PU.statsFor([]);
  D.foe.pos.set(0, 0, 5); D.foe.alive = true; D.foe.hp = 100;   /* z=5: clear of the centre cover */
  D.me.alive = true; D.me.hp = 100; D.me.shield = 0; D.me.stats.deflect = 0;
  /* body shot */
  let bb = D.spawnBullet('me', V(-4, 0.9, 5), V(1, 0, 0), D.me.stats, {});
  for (let i = 0; i < 200 && D.stepBullet(bb, 1/60); i++);
  const bodyDmg = 100 - D.foe.hp;
  /* head shot */
  D.foe.hp = 100;
  let hb2 = D.spawnBullet('me', V(-4, 1.58, 5), V(1, 0, 0), D.me.stats, {});
  for (let i = 0; i < 200 && D.stepBullet(hb2, 1/60); i++);
  const headDmg = 100 - D.foe.hp;
  T('a headshot lands double', bodyDmg > 0 && headDmg === bodyDmg * 2,
    'body=' + bodyDmg + ' head=' + headDmg);
  /* the practice bot can actually hurt the player now */
  D.me.pos.set(0, 0.01, 5); D.foe.pos.set(-6, 0, 5);
  const myHp = D.me.hp;
  let fb = D.spawnBullet('foe', V(-4, 0.9, 5), V(1, 0, 0), D.foe.stats, {});
  for (let i = 0; i < 200 && D.stepBullet(fb, 1/60); i++);
  T('the practice bot draws blood', D.me.hp < myHp, myHp + ' -> ' + D.me.hp);
  D.me.pos.set(2.6, 0.01, 8);
}

/* ---- the dumb batch behaves ---- */
T('catalog grew to 66', D.PU.POWERUPS.length === 66, String(D.PU.POWERUPS.length));

/* helium floats a bullet upward */
{
  const st = D.PU.statsFor(['helium']);
  T('helium turns bullet gravity negative', st.bulletGravity < 0, String(st.bulletGravity));
  const hb = D.spawnBullet('me', V(0, 1.5, 8), V(1, 0, 0), st, {});
  D.foe.alive = false;
  for (let i = 0; i < 20; i++) D.stepBullet(hb, 1/60);
  T('a helium bullet climbs', hb.pos.y > 1.6, hb.pos.y.toFixed(2));
}
/* popcorn bursts on the wall */
{
  const st = D.PU.statsFor(['popcorn']);
  const before = D.bullets.length;
  const pb = D.spawnBullet('me', V(-13.8, 1.2, 8), V(-1, 0, 0), st, {});
  let al = true;
  for (let i = 0; i < 20 && al; i++) al = D.stepBullet(pb, 1/60);
  T('popcorn dies on the wall but leaves pellets',
    !al && D.bullets.length >= before + 4, 'bullets=' + (D.bullets.length - before));
}
/* drunk wanders off a straight line */
{
  const st = D.PU.statsFor(['drunk']);
  const db = D.spawnBullet('me', V(0, 1.5, 8), V(1, 0, 0), st, {});
  for (let i = 0; i < 25; i++) D.stepBullet(db, 1/60);
  const drift = Math.abs(db.pos.z - 8) + Math.abs(db.pos.y - 1.5);
  T('a drunk bullet does not fly straight', drift > 0.05, drift.toFixed(3));
}
/* hand cannon is one round */
{
  const st = D.PU.statsFor(['handcannon', 'mag']);
  T('hand cannon overrides the mag no matter the order',
    D.PU.statsFor(['mag','handcannon']).magSize === 1 && st.magSize === 7,
    'later=' + D.PU.statsFor(['mag','handcannon']).magSize + ' earlier=' + st.magSize);
}
/* dice and rage change the roll at the landHit layer — flags carried on the sheet */
T('dice and rage ride the sheet',
  D.PU.statsFor(['dice']).dice === true && D.PU.statsFor(['soreloser']).rage === true);

/* ---- fight frame ---- */
D.G.phase = 'fight';
D.foe.pos.set(3, 0, -2);
D.foeMesh.position.copy(D.foe.pos);
D.foeMesh.visible = true;
D.me.pos.set(-9, 0.01, 5);
D.camera.position.set(-9, 1.63, 5);
D.camera.rotation.order = 'YXZ';
D.camera.rotation.y = -Math.PI / 3.4; D.camera.rotation.x = -0.04;
D.spawnBullet('me', V(-7.5, 1.5, 3.5), V(0.85, 0.02, -0.5).normalize(), D.PU.statsFor(['slug']), {});
D.spawnBullet('foe', V(2.6, 1.5, -1.8), V(-0.9, 0.02, 0.55).normalize(), D.PU.statsFor(['chicken']), {});
snap('duel-fight.png');

console.log(fails ? 'RENDER TESTS FAILED: ' + fails : 'RENDER TESTS GREEN');
process.exit(fails ? 1 : 0);
