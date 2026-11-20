/* headlandsworld — the bay under glass.
   headlandssim proves the rules; headlandswire proves the truth moves; this
   one proves the WORLD: a real jsdom document, the page's own render path,
   real click events. Every rival's town stands in the one scene, tokens put
   a cart and a lighthouse there, dusk lights the windows, new buildings pop
   in exactly once, the event stream puts boats on the water, the backdrop is
   never rebuilt out from under what drifts on it, and a hostile name cannot
   become markup. */
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { sourceFor, htmlFor } = require('./_document');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — headlandsworld never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || d == null ? '' : '  [' + d + ']'));
  if (!c) fails++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(htmlFor('headlands'), { pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://it.test/headlands/' });
  const win = dom.window;
  win.requestAnimationFrame = fn => win.setTimeout(fn, 0);
  win.fetch = () => new Promise(() => {});
  win.navigator.vibrate = () => {};
  const ctx = dom.getInternalVMContext();
  vm.runInContext(sourceFor('headlands'), ctx, { filename: 'headlands.js' });
  const doc = win.document;
  const run = code => vm.runInContext(code, ctx);
  const q = sel => doc.querySelectorAll(sel);

  /* ---- a four-seat table, bots held still so the scene is ours to stage ---- */
  win.startBot(3);
  run('clearTimeout(BOTCLOCK)');
  const E = run('ENGINE');
  T('practice dealt through the real DOM', !!E && E.players.length === 4);
  T('the game is marked as playing, so the menu sky stands down', doc.body.classList.contains('playing'));

  /* a clean, fully-known position */
  E.players.forEach(p => { p.stacks = [['shack']]; p.tracks = 1; p.rangers = 0; p.hand = ['clay']; });
  E.highway = -1; E.watch = -1; E.turn = 0; E.pendingTrade = null;
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');

  T('three layers share the bay', !!doc.getElementById('worldbg').firstChild &&
    !!doc.getElementById('world').firstChild && !!doc.getElementById('worldfx'));
  T('every seat has a town to tap', [0, 1, 2, 3].every(s => q('#world [data-seat="' + s + '"]').length === 1));
  T('every rival is named on the far shore', ['Sandy', 'Reef', 'Dune'].every(n =>
    Array.from(q('#world text')).some(t => t.textContent === n)));
  T('one building each, so four chimneys smoke', q('#world .smoke').length === 4, String(q('#world .smoke').length));
  T('every dock has a boat moored', q('#world .bob').length === 4, String(q('#world .bob').length));
  T('nobody holds a token: no cart, no lighthouse',
    q('#world animateMotion').length === 0 && q('#world .beam').length === 0);
  T('early in the day every window is dark', q('#world .win').length === 4 && q('#world .win.lit').length === 0,
    q('#world .win').length + '/' + q('#world .win.lit').length);

  /* ---- the backdrop is built once: what drifts on it must never reset ---- */
  const sun0 = doc.getElementById('wsun'), boat0 = doc.querySelector('#worldbg [data-toy="boat"]');
  const cy0 = sun0.getAttribute('cy');
  E.players[1].hand.push('wool');
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('a hand change redraws the land', Array.from(q('#world text')).some(t => t.textContent === '2 cards'));
  T('but never rebuilds the backdrop', doc.getElementById('wsun') === sun0 &&
    doc.querySelector('#worldbg [data-toy="boat"]') === boat0);

  /* ---- buildings appear where they are built, and pop in exactly once ---- */
  E.players[2].stacks.push(['shack']);
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('a new Shack stands in the world', q('#world .smoke').length === 5);
  T('and it alone pops in', q('#world .popin').length === 1, String(q('#world .popin').length));
  E.players[0].hand.push('stone');
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('the pop does not replay on the next redraw', q('#world .popin').length === 0);
  E.players[2].stacks[0].push('town');
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('a Town rising over a Shack pops in too', q('#world .popin').length === 1);
  E.players[2].stacks[0].push('resort');
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('a Resort brings its umbrella', q('#world .sway').length === 1);

  /* ---- tokens are things you can see ---- */
  E.players[1].tracks = 3; E.highway = 1;
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('the Highway holder gets a cart on their road', q('#world animateMotion').length === 1);
  E.players[3].rangers = 2; E.watch = 3;
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('the Watch holder gets a lighthouse sweeping the bay', q('#world .beam').length === 1);
  T('rangers fly their flags on the point', q('#world .flag').length === 2);
  E.highway = 2;
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('a stolen Highway moves the cart, never duplicates it', q('#world animateMotion').length === 1);

  /* ---- the day follows the score ---- */
  E.players[2].stacks.push(['shack'], ['shack'], ['shack']);     /* seat 2 climbs */
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  const lead = run('Math.max.apply(null, V.players.map(function (p) { return p.vp; }))');
  T('the sun sinks as the leader climbs', parseFloat(doc.getElementById('wsun').getAttribute('cy')) > parseFloat(cy0),
    cy0 + ' -> ' + doc.getElementById('wsun').getAttribute('cy') + ' at ' + lead);
  T('and every window lights at dusk', lead >= 4 && q('#world .win').length > 4 &&
    q('#world .win.lit').length === q('#world .win').length,
    q('#world .win.lit').length + ' of ' + q('#world .win').length);
  T('past five builds a town counts the rest', Array.from(q('#world text')).some(t => /^\+\d+$/.test(t.textContent)) ===
    (E.players[2].stacks.length > 5));

  /* ---- whose turn it is shows on the land ---- */
  E.turn = 1;
  run('syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('the turn-holder\'s shore glows', q('#world .turnglow').length === 1 && q('#world .nameturn').length === 1);

  /* ---- the event stream plays out on the water ---- */
  const fx = () => doc.getElementById('worldfx');
  run('worldEvents([{ e: "tradeout", from: 0, by: 2, accept: true }])');
  T('a trade sends a boat each way across the bay', fx().querySelectorAll('.fxsail').length === 2);
  run('worldEvents([{ e: "tradeout", from: 0, accept: false }])');
  T('a failed trade launches nothing', fx().querySelectorAll('.fxsail').length === 2);
  run('worldEvents([{ e: "gift", from: 2, to: 1 }])');
  T('a Whip-Round gift rows across', fx().querySelectorAll('.fxsail').length === 3);
  run('worldEvents([{ e: "tradeoffer", from: 3, give: ["clay"], want: ["wool"] }])');
  await sleep(40);
  T('an offer rings out from the offerer\'s dock', fx().querySelectorAll('.fxring').length >= 1 &&
    Array.from(fx().querySelectorAll('.fxbubble')).some(t => t.textContent === 'Trade?'));
  run('worldEvents([{ e: "headline", id: "raiders" }, { e: "raided", seat: 1, n: 4 }])');
  await sleep(40);
  T('Raiders sail for the town they hit', fx().querySelectorAll('.fxsail').length === 4);
  run('worldEvents([{ e: "headline", id: "raiders" }])');
  T('Raiders with nobody to rob still cross the bay', fx().querySelectorAll('.fxsail').length === 5);
  run('worldEvents([{ e: "draw", seat: 0, n: 3 }])');
  await sleep(40);
  T('a harvest rises from the dock it lands at',
    Array.from(fx().querySelectorAll('.fxbubble')).some(t => t.textContent === '+3'));
  run('worldEvents([{ e: "headline", id: "tide" }])');
  T('King Tide takes the whole bay at once', doc.getElementById('worldwrap').classList.contains('tide'));
  run('worldEvents([{ e: "headline", id: "season" }])');
  T('Good Season lights the sky', doc.getElementById('worldwrap').classList.contains('season'));
  const before = fx().childNodes.length;
  run('worldEvents([{ e: "win", seat: 2 }])');
  await sleep(40);
  T('a win sets off fireworks over the winner', fx().childNodes.length > before);

  /* ---- the world answers a finger ---- */
  const tap = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  tap(doc.querySelector('#world [data-seat="2"]'));
  const sheet = () => doc.getElementById('sheet').textContent;
  T('tapping a rival\'s town tells its story', doc.getElementById('sheetwrap').classList.contains('show') &&
    sheet().includes('Reef') && sheet().includes('Resorts'));
  run('closeSheet()');
  tap(doc.querySelector('#world [data-seat="0"]'));
  T('tapping my own shore tells mine', sheet().includes('Your town'));
  run('closeSheet()');
  const rings = fx().querySelectorAll('.fxring').length;
  tap(doc.querySelector('#worldbg [data-toy="buoy"] rect'));
  await sleep(40);
  T('the buoy answers a tap', fx().querySelectorAll('.fxring').length > rings);

  /* ---- a hostile name stays text, in the scene and in the sheet ---- */
  run('ROSTER_NAMES[1] = "<img src=x onerror=1><b>x</b>"');
  run('WORLD.sig = ""; syncFromEngine([])'); run('clearTimeout(BOTCLOCK)');
  T('a hostile name cannot become markup in the world',
    q('#world img').length === 0 && q('#world b').length === 0);
  tap(doc.querySelector('#world [data-seat="1"]'));
  T('nor in the town sheet', doc.querySelectorAll('#sheet img').length === 0 &&
    doc.querySelectorAll('#sheet b').length === 0);
  run('closeSheet()');

  /* ---- the market row carries the Resort as its sixth card ---- */
  T('six cards in the row: five builds and the standing Resort',
    q('#market .mcard').length === 6 && q('#market .mcard.standing').length === 1);

  finished = true;
  console.log(fails ? '\nheadlandsworld: ' + fails + ' FAILURES' : '\nheadlandsworld: ALL PASS');
  process.exit(fails ? 1 : 0);
})();
