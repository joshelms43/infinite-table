/* settlerspage — the Settlers page, played through its own UI.
   A real DOM (jsdom) with the page's scripts in document order, a hand-driven
   clock, and the one rAF loop stepped by hand. Your seat plays through the
   same entry points a thumb uses — the draft taps, the build buttons and
   board taps, the trade sheet, the discard picker, the robber — while three
   bots play theirs. Pins: the game reaches a winner with no page errors; the
   result waits for in-flight animation and then shows every section; a
   refused claim says Spot Taken and costs nothing; a sleeping tab doesn't
   roll a burst of dice on waking; nothing is accepted after the end. */
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { htmlFor, fileFor } = require('./_document');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — settlerspage never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || d == null ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

const errors = [];
const vcon = new VirtualConsole();
vcon.on('jsdomError', e => { if (!/Not implemented/.test(String(e && e.message))) errors.push(String(e && e.message)); });
vcon.on('error', m => errors.push(String(m)));

let FAKE = 1000;
const dom = new JSDOM(htmlFor('settlers'), {
  url: 'https://infinite-table.test/settlers/',
  runScripts: 'dangerously',
  pretendToBeVisual: false,
  virtualConsole: vcon,
  beforeParse(w) {
    /* the page's own randomness (seed, bot jitter, flyer arcs) seeded too, so
       this game is the same game every run */
    let a = 0x5e771e5;
    w.Math.random = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    w.performance.now = () => FAKE;
    w.requestAnimationFrame = () => 0;
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.navigator.vibrate = () => true;
    w.addEventListener('error', e => errors.push(String(e.message || e.error)));
  },
});
const w = dom.window;
const $ = id => w.document.getElementById(id);
const ev = (code) => w.eval(code);

/* one frame of the real loop */
function step(ms) { FAKE += ms; w.frame(FAKE); }
function click(el) { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }

T('the page boots with the engine loaded', typeof w.Settlers === 'object' && typeof w.frame === 'function' && errors.length === 0, errors.join(' | '));

/* start a practice game: three bots, 20-second rolls */
click($('practicebtn'));
click(w.document.querySelector('.sb[data-n="3"]'));
click(w.document.querySelector('.si[data-ms="20000"]'));
click($('gobtn'));
T('practice starts a four-seat game on a 20s clock', ev('G.players.length') === 4 && ev('G.interval') === 20000 && !$('hud').classList.contains('hidden'));
T('the bots are the three personalities', JSON.stringify(ev('KINDS.slice(1).sort()')) === '["builder","expander","trader"]');

/* your seat: a policy that uses the UI the way a player would */
let uiBuilds = 0, uiDiscards = 0, uiRobbers = 0, uiTrades = 0, sawSpotTaken = false;
function mySeat() {
  const G = ev('G');
  if (G.over) return;
  const MODEK = ev('MODEK');
  if (MODEK === 'setup') {
    const tv = Array.from(ev('TV')), te = Array.from(ev('TE'));
    const v = tv.indexOf(1), e = te.indexOf(1);
    if (G.setup.step === 'settle' && v >= 0) w.tapTarget({ v, e: -1, h: -1 });
    else if (e >= 0) w.tapTarget({ v: -1, e, h: -1 });
    return;
  }
  if (ev('SHEET') === 'discard') {
    const need = ev('DISCN');
    const hand = ev('G.players[0].hand');
    const order = w.Settlers.RES.slice().sort((a, b) => hand[b] - hand[a]);
    let left = need;
    for (const r of order) {
      const pk = w.document.querySelector('.pk.dk[data-res="' + r + '"]');
      for (let i = 0; i < hand[r] && left > 0; i++) { click(w.document.querySelector('.pk.dk[data-res="' + r + '"]')); left--; }
    }
    click($('dodisc'));
    uiDiscards++;
    return;
  }
  if (MODEK === 'robber' && ev('SHEET') !== 'victim') {
    const th = Array.from(ev('TH'));
    const choice = w.Settlers.robberPick(G, 0);
    w.tapTarget({ v: -1, e: -1, h: th[choice.hex] ? choice.hex : th.indexOf(1) });
    if (ev('SHEET') === 'victim') click(w.document.querySelector('.vic'));
    uiRobbers++;
    return;
  }
  if (G.phase !== 'play') return;
  /* build when the buttons say we can — through the button and a board tap */
  for (const k of ['city', 'settle', 'road']) {
    const btn = w.document.querySelector('.act[data-k="' + k + '"]');
    if (!btn.classList.contains('can')) continue;
    click(btn);
    const arr = Array.from(ev(k === 'road' ? 'TE' : 'TV'));
    let pick = -1;
    if (k === 'road') { const mv = w.Settlers.goalPlan(G, 0, w.Settlers.PERSONAS.expander).find(p => p.kind === 'road'); pick = mv && arr[mv.e] ? mv.e : arr.indexOf(1); }
    else pick = arr.lastIndexOf(1);
    if (pick >= 0) {
      const before = ev('G.actions');
      w.tapTarget(k === 'road' ? { v: -1, e: pick, h: -1 } : { v: pick, e: -1, h: -1 });
      if (ev('G.actions') > before) uiBuilds++;
    }
    return;
  }
  const dev = w.document.querySelector('.act[data-k="dev"]');
  if (dev.classList.contains('can') && w.Math.random() < 0.3) { click(dev); return; }
  /* a bank trade through the sheet when a 4:1 is sitting there */
  const hand = G.players[0].hand;
  const rich = w.Settlers.RES.find(r => hand[r] >= w.Settlers.portRate(G, 0, r) + 1);
  const poor = w.Settlers.RES.find(r => hand[r] === 0 && G.bank[r] > 0);
  if (rich && poor) {
    click(w.document.querySelector('.act[data-k="trade"]'));
    click(w.document.querySelector('.pk.give[data-res="' + rich + '"]'));
    click(w.document.querySelector('.pk.get[data-res="' + poor + '"]'));
    const before = ev('G.actions');
    click($('dobank'));
    if (ev('G.actions') > before) uiTrades++;
    w.closeSheet();
    return;
  }
  /* accept an offer that helps, from its toast */
  const t = w.document.querySelector('.toast.offer .acc:not(.off)');
  if (t && w.Math.random() < 0.5) click(t);
}

/* play the draft, then real time */
let frames = 0;
while (ev('G.phase') === 'setup' && frames < 20000) { step(50); if (frames % 4 === 0) mySeat(); frames++; }
T('the draft completes with two settlements and two roads each', ev('G.phase') !== 'setup' &&
  [0, 1, 2, 3].every(s => ev('Settlers.settlesOf(G,' + s + ').length') === 2 && ev('G.eOwner.filter(o=>o===' + s + ').length') === 2));

/* a claim on a taken corner says so and costs nothing */
{
  const occupied = ev('G.vOwner.findIndex(o => o > 0)');
  ev("(function(){ var p=G.players[0]; ['timber','clay','wool','grain'].forEach(function(r){ if(G.bank[r]>0){G.bank[r]--;p.hand[r]++;} }); })()");
  const hand = JSON.stringify(ev('G.players[0].hand'));
  w.sendMove({ t: 'settle', v: occupied });
  sawSpotTaken = Array.from(w.document.querySelectorAll('#toasts .toast')).some(el => el.textContent === 'Spot Taken');
  T('a claim on a taken corner toasts Spot Taken and keeps the cards', sawSpotTaken && JSON.stringify(ev('G.players[0].hand')) === hand);
}

/* a sleeping tab: one long gap, no burst of dice */
{
  for (let i = 0; i < 10; i++) step(50);
  const rolls = ev('G.rollN'), gm = ev('GAMEMS');
  step(5 * 60 * 1000);                    /* five minutes away */
  T('a sleeping tab rolls nothing while away and the game clock holds', ev('G.rollN') === rolls && ev('GAMEMS') === gm);
}

/* to the end */
let sawWinWhileAnimating = false, victoryEarly = false;
let guard = 0;
while (!ev('G.over') && guard < 400000) {
  step(50);
  if (guard % 3 === 0) mySeat();
  guard++;
}
T('the game reaches a winner', ev('G.over') && ev('G.winner') >= 0 && ev('Settlers.vp(G, G.winner)') >= 10, 'frames ' + guard + ', rolls ' + ev('G.rollN'));
T('your seat played through the UI: builds, a discard or robber when owed, trades',
  uiBuilds >= 2 && uiTrades >= 1 && uiDiscards + uiRobbers >= 1, JSON.stringify({ uiBuilds, uiDiscards, uiRobbers, uiTrades }));
/* the result waits for what's still moving */
victoryEarly = !$('victory').classList.contains('hidden');
const flying = ev('anyFlying() || PAYQ.length > 0 || DICE.on || ROB.on');
T('the result doesn’t cut off what’s in flight', !victoryEarly, 'flying=' + flying);
const after = w.sendMove({ t: 'buyDev' });
T('nothing is accepted after the end', after.why === 'over');
for (let i = 0; i < 120 && $('victory').classList.contains('hidden'); i++) step(50);
T('then the victory screen shows', !$('victory').classList.contains('hidden'));
T('it breaks down every player’s points', w.document.querySelectorAll('#vcard .vrow').length === 4);
T('it shows resources collected per type', w.document.querySelectorAll('#vcard table.coll tr').length === 5 &&
  w.document.querySelectorAll('#vcard table.coll th svg').length === 5);
T('it plots the dice against the 2d6 expectation', w.document.querySelectorAll('#hist .hb').length === 11 &&
  w.document.querySelectorAll('#hist .hb .exp').length === 11);
T('Play Again deals a fresh island', (() => {
  const seed = ev('G.seed');
  click($('vagain'));
  return ev('G.phase') === 'setup' && ev('G.seed') !== seed && $('victory').classList.contains('hidden');
})());
T('no page errors through a whole game', errors.length === 0, errors.slice(0, 3).join(' | '));
T('the error ledger stayed empty', (w.localStorage.getItem('it_errors') || '[]') === '[]', w.localStorage.getItem('it_errors'));

finished = true;
console.log(fails === 0 ? 'SETTLERSPAGE: ALL PASS' : 'SETTLERSPAGE FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
