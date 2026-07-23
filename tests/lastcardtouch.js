/* lastcardtouch — the fan under a finger.
   bootsim proves the page loads; lastcardwire proves the truth moves; this one
   proves the glass works. A real jsdom document, real pointer events: press
   squish, tap-to-raise, neighbours parting, upward-pull picking the card up,
   the clone chasing the pointer, dropok over the pile, a drop that actually
   plays the card, and an illegal card denied with a springback. */
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { sourceFor, htmlFor } = require('./_document');
const LC = require(path.join(__dirname, '..', 'shared', 'lastcard-rules.js'));

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — lastcardtouch never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 1800) => {          // load-proof: wait for the STATE, not a guess at the clock
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(12); }
  return fn();
};

(async () => {
  const dom = new JSDOM(htmlFor('lastcard'), { pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://it.test/lastcard/' });
  const win = dom.window;
  win.requestAnimationFrame = fn => win.setTimeout(fn, 0);
  win.fetch = () => new Promise(() => {});
  win.navigator.vibrate = () => {};
  const ctx = dom.getInternalVMContext();
  vm.runInContext(sourceFor('lastcard'), ctx, { filename: 'lastcard.js' });

  const doc = win.document;
  const pd = (el, type, x, y) => el.dispatchEvent(new win.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y }));

  /* ---- deal a practice game with a rigged, fully-known hand ---- */
  win.startBot(1);
  const E = ctx.ENGINE ?? vm.runInContext('ENGINE', ctx);
  T('practice dealt through the real DOM', !!E && E.players.length === 2);

  /* rig my hand and the pile so legality is exactly known */
  let idm = 90000;
  const N = (col, n) => ({ id: idm++, kind: 'num', colour: col, n });
  E.players[0].hand = [N('teal', 9), N('coral', 3), { id: idm++, kind: 'wild', colour: null }];
  E.discard = [N('teal', 5)];
  E.activeColour = 'teal';
  E.turn = 0; E.phase = 'play';
  vm.runInContext('syncFromEngine([])', ctx);
  await sleep(20);

  const wraps = [...doc.querySelectorAll('#hand .cardw')];
  T('the fan renders one wrapper per card', wraps.length === 3);
  const wrapOf = id => doc.querySelector('#hand .cardw[data-cid="' + id + '"]');
  const legalW = wrapOf(E.players[0].hand[0].id);   // teal 9 on teal 5
  const deadW = wrapOf(E.players[0].hand[1].id);    // coral 3 — dead
  const wildW = wrapOf(E.players[0].hand.find(c => c.kind === 'wild').id);
  T('legality is painted on the fan', !legalW.classList.contains('dead') &&
    deadW.classList.contains('dead') && !wildW.classList.contains('dead'));
  const fans = wraps.map(w => w.style.getPropertyValue('--fan'));
  T('the fan actually fans', new Set(fans).size === 3, fans.join(' '));

  /* ---- press squish ---- */
  pd(legalW, 'pointerdown', 50, 500);
  T('a press squishes instantly', legalW.classList.contains('pressed'));

  /* ---- tap raises, neighbours part, tap again lowers ---- */
  pd(doc, 'pointerup', 51, 501);
  await sleep(10);
  T('a tap raises the card', wrapOf(legalW.dataset.cid).classList.contains('raised'));
  T('the neighbour parts to make room',
    [...doc.querySelectorAll('#hand .cardw')].some(w =>
      w.classList.contains('part-l') || w.classList.contains('part-r')));
  T('the pile invites while a legal card is raised',
    doc.getElementById('pilewrap').classList.contains('droppable'));
  await sleep(420);                                  // outlive the ghost-tap suppressor
  pd(wrapOf(legalW.dataset.cid), 'pointerdown', 50, 500);
  pd(doc, 'pointerup', 50, 500);
  await sleep(10);
  T('a second tap lowers it', !wrapOf(legalW.dataset.cid).classList.contains('raised') &&
    !doc.getElementById('pilewrap').classList.contains('droppable'));

  /* ---- an upward pull becomes a drag; the clone chases; a drop plays ---- */
  await sleep(420);
  const dragW = wrapOf(legalW.dataset.cid);
  const playedId = +dragW.dataset.cid;
  const handBefore = E.players[0].hand.length;
  pd(dragW, 'pointerdown', 60, 500);
  pd(doc, 'pointermove', 60, 488);                  // dy −12: committed
  T('an upward pull picks the card up', vm.runInContext('DRAG.active', ctx) === true);
  T('a clone exists and the source hides',
    !!doc.querySelector('.dragclone') && dragW.classList.contains('hidden-src'));
  pd(doc, 'pointermove', 30, 200);
  const tf = doc.querySelector('.dragclone').style.transform;
  T('the clone chases the pointer with tilt', /translate3d\(-30px,-288px/.test(tf) && /rotate\(/.test(tf), tf);
  /* jsdom rects are all zeros, so the pile "is" at the origin — drop there */
  pd(doc, 'pointermove', 0, 0);
  T('hovering the pile lights it up', doc.getElementById('pilewrap').classList.contains('dropok'));
  pd(doc, 'pointerup', 0, 0);
  await sleep(30);
  T('the drop played the card', E.players[0].hand.length === handBefore - 1 &&
    !E.players[0].hand.some(c => c.id === playedId) &&
    LC.top(E).id === playedId);
  T('the drag engine is clean after the drop', vm.runInContext('DRAG.active', ctx) === false &&
    !doc.querySelector('.dragclone'));

  /* ---- the bot answers; wait for my turn back ---- */
  for (let i = 0; i < 60 && E.turn !== 0; i++) await sleep(60);
  E.turn = 0; E.phase = 'play';                     // make certain, then repaint
  E.discard.push(N('teal', 5)); E.activeColour = 'teal';
  vm.runInContext('syncFromEngine([])', ctx);
  await sleep(20);

  /* ---- an illegal card springs back with a denial ---- */
  const deadNow = [...doc.querySelectorAll('#hand .cardw')].find(w => w.classList.contains('dead'));
  T('a dead card is on the fan for the refusal test', !!deadNow);
  if (deadNow) {
    const handN = E.players[0].hand.length;
    pd(deadNow, 'pointerdown', 80, 500);
    pd(doc, 'pointermove', 80, 486);
    T('even a dead card can be picked up', vm.runInContext('DRAG.active', ctx) === true);
    T('but the pile never invites it', !doc.getElementById('pilewrap').classList.contains('droppable'));
    pd(doc, 'pointermove', 0, 0);
    T('and never lights for it', !doc.getElementById('pilewrap').classList.contains('dropok'));
    pd(doc, 'pointerup', 0, 0);
    await until(() => !doc.querySelector('.dragclone') && deadNow.classList.contains('denied'));
    T('it springs back with the denial shake', !doc.querySelector('.dragclone') &&
      deadNow.classList.contains('denied') && E.players[0].hand.length === handN);
    await until(() => !deadNow.classList.contains('denied') && !deadNow.classList.contains('hidden-src'));
    T('and settles clean', !deadNow.classList.contains('denied') &&
      !deadNow.classList.contains('hidden-src') && E.players[0].hand.length === handN);
  }

  /* ---- a wild drop opens the colour picker; picking sends the play ---- */
  await until(() => !doc.querySelector('.dragclone'));
  await sleep(60);
  const wildNow = [...doc.querySelectorAll('#hand .cardw')].find(w => {
    const c = E.players[0].hand.find(x => x.id === +w.dataset.cid);
    return c && c.kind === 'wild';
  });
  T('the wild is still on the fan', !!wildNow);
  if (wildNow) {
    const handN = E.players[0].hand.length;
    pd(wildNow, 'pointerdown', 90, 500);
    pd(doc, 'pointermove', 90, 486);
    pd(doc, 'pointermove', 0, 0);
    pd(doc, 'pointerup', 0, 0);
    await until(() => doc.getElementById('overlay').classList.contains('show') &&
                      doc.querySelectorAll('#swatches .swatch').length === 4);
    T('a wild drop opens the colour picker',
      doc.getElementById('overlay').classList.contains('show') &&
      doc.querySelectorAll('#swatches .swatch').length === 4);
    const _sw = doc.querySelectorAll('#swatches .swatch');
    if (_sw[1]) _sw[1].click();     // teal
    await until(() => E.players[0].hand.length === handN - 1 + 2 &&
                      LC.top(E).kind === 'wild' && E.activeColour === 'teal', 4500);
    /* the play leaves one card, uncalled — the table charges two, automatically */
    T('picking a colour plays the wild and the uncalled exit costs two',
      E.players[0].hand.length === handN - 1 + 2 &&
      LC.top(E).kind === 'wild' && E.activeColour === 'teal');
  }

  /* ---- hold to inspect ---- */
  E.turn = 0; E.phase = 'play';
  vm.runInContext('syncFromEngine([])', ctx);
  await sleep(20);
  const anyW = doc.querySelector('#hand .cardw');
  pd(anyW, 'pointerdown', 50, 500);
  await sleep(480);
  T('holding a card inspects it', doc.getElementById('inspect').classList.contains('show') &&
    !!doc.querySelector('#inspect .card'));
  pd(doc.getElementById('inspect'), 'pointerdown', 200, 200);
  pd(doc, 'pointerup', 50, 500);
  await sleep(80);
  T('tapping the inspector closes it', !doc.getElementById('inspect').classList.contains('show'));

  /* ---- the table speaks: event-driven animation from sayEvents ---- */
  E.turn = 0; E.phase = 'play';
  vm.runInContext('syncFromEngine([])', ctx);
  await sleep(20);
  vm.runInContext('sayEvents([{ e: "play", seat: 1, card: { id: 1, kind: "num", colour: "teal", n: 4 } }])', ctx);
  await sleep(10);
  T('a foe play flies across the table', !!doc.querySelector('.flyer'));
  vm.runInContext('sayEvents([{ e: "draw", seat: 1, n: 1 }])', ctx);
  await sleep(10);
  T('a foe draw flies off the deck', !!doc.querySelector('.flyback'));
  vm.runInContext('sayEvents([{ e: "reverse" }])', ctx);
  T('a reverse spins the direction tag', doc.getElementById('dirtag').classList.contains('spin'));
  vm.runInContext('sayEvents([{ e: "skip", seat: 1 }])', ctx);
  T('a skip flashes the skipped seat',
    doc.querySelector('#foes .foe[data-seat="1"]').classList.contains('flash'));
  vm.runInContext('MYSEAT = 0; sayEvents([{ e: "win", seat: 0 }])', ctx);
  T('winning rains confetti', doc.querySelectorAll('.confetti').length >= 20);
  await sleep(700);

  finished = true;
  console.log(fails === 0 ? 'LASTCARDTOUCH: ALL PASS' : 'LASTCARDTOUCH FAILURES: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL — ' + e.stack); finished = true; process.exit(1); });
