/* headlandswire — the Headlands page under real multiplayer conditions.
   Three complete page instances in isolated vm contexts joined by an
   in-process bus playing Supabase broadcast (self:false): the host deals,
   every seat acts through its own UI entry points, and after every push the
   clients' view of the table must equal the host's truth exactly — goods
   conserved at 61 throughout. Then the ugly stuff: seat spoofing,
   out-of-turn intents, a human-shaped trade across the wire, intents before
   the deal, and a full practice game against the local bots. */
const vm = require('vm');
const path = require('path');
const { sourceFor } = require('./_document');
const H = require(path.join(__dirname, '..', 'shared', 'headlands-rules.js'));

const gameCode = sourceFor('headlands');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — headlandswire never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

function makeContext(name) {
  const el = () => new Proxy(
    { classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      style: {}, value: '', textContent: '', innerHTML: '', dataset: {},
      appendChild() {}, querySelectorAll: () => [], querySelector: () => el() },
    { get(t, k) { if (k in t) return t[k]; return () => {}; }, set() { return true; } });
  const store = {};
  const sandbox = {
    performance, console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise, Proxy,
    isNaN, parseInt, parseFloat, RegExp, Error, TypeError, URLSearchParams,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    document: {
      querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
      getElementById: () => el(), addEventListener: () => {},
      body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
      head: { appendChild() {} },
    },
    addEventListener: () => {},
    location: { reload() {}, search: '', origin: '', pathname: '', href: '' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: {}, fetch: () => new Promise(() => {}),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(gameCode, sandbox, { filename: name });
  return sandbox;
}

/* ---- the bus ---- */
const KEYS = ['hk', 'c1k', 'c2k'];
const NAMES = ['Josh', 'Mick', 'Shaz'];
const ctxs = KEYS.map((k) => makeContext(k + '.js'));
const presence = {};
KEYS.forEach((k, i) => { presence[k] = [{ key: k, name: NAMES[i], host: i === 0 }]; });

ctxs.forEach((ctx, i) => {
  ctx.TX = {
    key: KEYS[i],
    send(type, payload) {
      const p = JSON.stringify(payload);
      ctxs.forEach((other, j) => { if (j !== i) other.onWire(type, JSON.parse(p)); });
    },
    track() {}, presence: () => presence, alive: () => true, close() {},
  };
});
ctxs[0].HOSTING = true;

/* ---- the deal ---- */
ctxs[0].hostDeal();
const G = ctxs[0].ENGINE;
T('the host seats itself and enters host mode', ctxs[0].MODE === 'host' && ctxs[0].MYSEAT === 0);
T('both clients seat from the start broadcast',
  ctxs[1].MODE === 'client' && ctxs[2].MODE === 'client' &&
  ctxs[1].MYSEAT === 1 && ctxs[2].MYSEAT === 2,
  ctxs.map(c => c.MODE + '/' + c.MYSEAT).join(' '));
T('hands arrive private and true', ctxs.every((c, i) =>
  c.MYHAND.join(',') === G.players[i].hand.join(',')));
T('the market shows five to everyone', ctxs.every(c => c.V.market.length === 5));

/* ---- hostile intents ---- */
const handsBefore = JSON.stringify(G.players.map(p => p.hand.length));
ctxs[2].TX.send('intent', { key: 'c2k', seat: 1, move: { t: 'end' } });   // spoofing Mick's seat
T('a spoofed seat is ignored', JSON.stringify(G.players.map(p => p.hand.length)) === handsBefore);

const pub = (ctx) => JSON.stringify({
  turn: ctx.V.turn, over: ctx.V.over, winner: ctx.V.winner,
  market: ctx.V.market, highway: ctx.V.highway, watch: ctx.V.watch,
  resorts: ctx.V.resorts, trade: ctx.V.pendingTrade,
  players: ctx.V.players.map(p => ({ n: p.name, h: p.handN, vp: p.vp,
    t: p.tracks, r: p.rangers, s: p.stacks.map(x => x.top).join('') })),
});
function goodsTotal(g) {
  return g.goods.length + g.goodsDiscard.length +
    g.players.reduce((s, p) => s + p.hand.length, 0);
}

/* ---- a human-shaped trade across the wire ---- */
{
  /* rig hands so the turn-holder can offer clay for stone */
  const s = G.turn, t = (s + 1) % 3;
  G.players[s].hand.push(G.goods.splice(G.goods.indexOf('clay'), 1)[0]);
  G.players[t].hand.push(G.goods.splice(G.goods.indexOf('stone'), 1)[0]);
  ctxs[0].hostPush([]);
  ctxs[s].sendMove({ t: 'trade', to: t, give: ['clay'], want: ['stone'] });
  T('the offer reaches every view', ctxs.every(c => c.V.pendingTrade &&
    c.V.pendingTrade.from === s && c.V.pendingTrade.to === t));
  ctxs[t].sendMove({ t: 'tradeResp', accept: true });
  T('the accepted trade swaps goods and sweetens the partner over the wire',
    G.pendingTrade === null && G.tradeUsed === true &&
    H.held(G.players[s]).stone >= 1 && H.held(G.players[t]).clay >= 1);
  T('goods stayed at 61 through the trade', goodsTotal(G) === 61, String(goodsTotal(G)));
}

/* ---- a full game, every seat through its own UI, truth checked every push ---- */
let mismatches = 0, handDrift = 0, guard = 6000, offTurnBounces = 0, conserved = true;
while (!G.over && guard-- > 0) {
  const actor = G.pendingTrade ? G.pendingTrade.to : G.turn;

  if (!G.pendingTrade && G.turnCount % 9 === 4) {
    const rude = (G.turn + 1) % 3;
    const before = pub(ctxs[0]);
    ctxs[rude].sendMove({ t: 'end' });
    if (pub(ctxs[0]) === before) offTurnBounces++;
  }

  const mv = H.botMove(G, actor);
  if (!mv) break;
  ctxs[actor].sendMove(mv);

  if (goodsTotal(G) !== 61) { conserved = false; break; }
  const truth = pub(ctxs[0]);
  for (let j = 1; j < 3; j++) {
    if (pub(ctxs[j]) !== truth) mismatches++;
    const mine = G.players[j].hand.join(',');
    const theirs = ctxs[j].MYHAND.join(',');
    if (mine !== theirs) handDrift++;
  }
}
T('the game completes over the wire', G.over, 'guard=' + guard);
T('every push left every client agreeing with the host', mismatches === 0, String(mismatches));
T('no hand ever drifted from truth', handDrift === 0, String(handDrift));
T('out-of-turn intents always bounced', offTurnBounces > 0, String(offTurnBounces));
T('the 61 goods were conserved all game', conserved);
T('the winner is a real seat with 7 showing', G.winner >= 0 && G.winner <= 2 &&
  H.vpOf(G, G.winner) >= 7, G.winner + '/' + (G.winner >= 0 ? H.vpOf(G, G.winner) : '-'));
T('finished-game intents bounce', (() => {
  const before = pub(ctxs[0]);
  ctxs[1].sendMove({ t: 'end' });
  return pub(ctxs[0]) === before;
})());

/* ---- intents before any deal must not detonate a fresh host ---- */
{
  const cold = makeContext('cold.js');
  cold.HOSTING = true;
  cold.TX = { key: 'hk', send() {}, track() {}, presence: () => ({}), alive: () => true, close() {} };
  let blew = false;
  try { cold.onWire('intent', { key: 'x', seat: 0, move: { t: 'end' } }); } catch (e) { blew = true; }
  T('an intent before the deal is shrugged off', !blew);
}

/* ---- practice: a whole game against the bots, driven through the UI ---- */
{
  const solo = makeContext('solo.js');
  solo.startBot(3);
  T('practice deals four seats', solo.ENGINE.players.length === 4 && solo.MYSEAT === 0);
  let g2 = 8000;
  while (!solo.ENGINE.over && g2-- > 0) {
    const E = solo.ENGINE;
    const actor = E.pendingTrade ? E.pendingTrade.to : E.turn;
    if (actor === 0) {
      const mv = H.botMove(E, 0);
      if (!mv) break;
      solo.sendMove(mv);              // instant timers run the whole bot chain after ours
    } else {
      solo.botClock();
    }
  }
  T('the practice game completes', solo.ENGINE.over, 'guard=' + g2);
  T('practice conserved the goods', goodsTotal(solo.ENGINE) === 61);
}

finished = true;
console.log(fails ? '\nheadlandswire: ' + fails + ' FAILURES' : '\nheadlandswire: ALL PASS');
process.exit(fails ? 1 : 0);
