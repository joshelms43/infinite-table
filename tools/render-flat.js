/* render-flat — sighted proof for Flatland. Runs real FlatDuel fights with the
   shared FlatRender pipeline (the exact code the page draws with), captures
   frames, writes PNG keyframes and animated GIF clips.
   Usage: node tools/render-flat.js [scene]
     scenes: duel (default) | chickens | boom | beach | mobility | all
   Output: RENDER_OUT or /mnt/user-data/outputs */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const FD = require(path.join(__dirname, '..', 'shared', 'duel-flat.js'));
const FR = require(path.join(__dirname, '..', 'shared', 'duel-flat-render.js'));
const PU = require(path.join(__dirname, '..', 'shared', 'duel-powerups.js'));

const W = 1280, H = 720, GW = 640, GH = 360;
const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';
fs.mkdirSync(OUT, { recursive: true });

const SCENES = {
  duel:     { map: 'table',   a: ['sprinter', 'doublejump'], b: ['heavy', 'dash'], t: 14, seed: 11 },
  chickens: { map: 'table',   a: ['chicken', 'bounce'], b: ['bees'], t: 12, seed: 22 },
  boom:     { map: 'grounds', a: ['grenadier', 'cluster', 'mortar'], b: ['aegis', 'castle'], t: 14, seed: 33 },
  beach:    { map: 'table',   a: ['beachball'], b: ['boomerang', 'moonboots'], t: 12, seed: 44 },
  mobility: { map: 'grounds', a: ['blink', 'zoomies', 'confetti'], b: ['moonboots', 'airshow', 'disco'], t: 14, seed: 55 }
};

function renderScene(name, spec) {
  const w = FD.newWorld(spec.map, spec.seed);
  const A = FD.addFighter(w, 'A', PU.statsFor(spec.a), { x: w.arena.spawns[0], y: 2, team: 'coral' });
  const B = FD.addFighter(w, 'B', PU.statsFor(spec.b), { x: w.arena.spawns[1], y: 2, team: 'teal' });
  const view = FR.newView();
  view.cam.x = 0; view.cam.y = w.arena.h / 2; view.cam.z = w.arena.w + 2;

  const cvs = createCanvas(W, H);
  const ctx = cvs.getContext('2d');
  const gif = GIFEncoder();
  const gcvs = createCanvas(GW, GH);
  const gctx = gcvs.getContext('2d');

  const stA = {}, stB = {};
  const dt = 1 / 60;
  const frames = Math.round(spec.t * 60);
  const keyAt = [Math.round(frames * 0.15), Math.round(frames * 0.45), Math.round(frames * 0.8)];
  let keyN = 0;

  for (let i = 0; i < frames; i++) {
    FD.input(w, 'A', FD.botThink(w, 'A', 6, stA));
    FD.input(w, 'B', FD.botThink(w, 'B', 6, stB));
    const evts = FD.step(w, dt);
    FR.feed(view, evts, w);
    FR.stepView(view, w, dt);

    if (i % 3 === 0) {                     /* 20fps out */
      FR.draw(ctx, W, H, w, view, {});
      if (keyN < keyAt.length && i >= keyAt[keyN]) {
        fs.writeFileSync(path.join(OUT, 'flat-' + name + '-key' + keyN + '.png'), cvs.toBuffer('image/png'));
        keyN++;
      }
      gctx.drawImage(cvs, 0, 0, GW, GH);
      const { data } = gctx.getImageData(0, 0, GW, GH);
      const pal = quantize(data, 256);
      gif.writeFrame(applyPalette(data, pal), GW, GH, { palette: pal, delay: 50 });
    }
    if (!A.alive || !B.alive) {
      for (let k = 0; k < 30; k++) { FD.step(w, dt); FR.stepView(view, w, dt); }
      break;
    }
  }
  gif.finish();
  fs.writeFileSync(path.join(OUT, 'flat-' + name + '.gif'), Buffer.from(gif.bytes()));
  console.log('rendered', name, '→', path.join(OUT, 'flat-' + name + '.gif'),
    'A hp', A.hp.toFixed(0), 'B hp', B.hp.toFixed(0));
}

const which = process.argv[2] || 'duel';
if (which === 'all') Object.keys(SCENES).forEach(n => renderScene(n, SCENES[n]));
else renderScene(which, SCENES[which] || SCENES.duel);
