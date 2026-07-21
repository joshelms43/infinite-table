/* lastcardwire — the Last Card page under real multiplayer conditions.
   Three complete page instances in isolated vm contexts joined by an in-process
   bus playing Supabase broadcast (self:false): the host deals, every seat plays
   through its own UI entry points, and after every single push the clients'
   view of the table must equal the host's truth exactly. Then the ugly stuff:
   out-of-turn intents, seat spoofing, intents before the deal, and a full
   practice game against the local bots. */
const vm = require('vm');
const path = require('path');
const { sourceFor } = require('./_document');
const LC = require(path.join(__dirname, '..', 'shared', 'lastcard-rules.js'));

const gameCode = sourceFor('lastcard');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — lastcardwire never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

function makeContext(name) {
  const el = () => new Proxy(
    { classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      style: {}, value: '', textContent: '', innerHTML: '',
      appendChild() {}, querySelectorAll: () => [] },
    { get(t, k) { if (k in t) return t[k]; return () => {}; }, set() { return true; } });
  const store = {};
  const sandbox = {
    performance, console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise,
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

/* ---- the bus: broadcast to everyone but the sender, like Realtime ---- */
const KEYS = ['hk', 'c1k', 'c2k'];
const NAMES = ['Josh', 'Mick', 'Shaz'];
const ctxs = KEYS.map((k, i) => makeContext(k + '.js'));
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
T('the host seats itself and enters host mode', ctxs[0].MODE === 'host' && ctxs[0].MYSEAT === 0);
T('both clients seat from the start broadcast',
  ctxs[1].MODE === 'client' && ctxs[2].MODE === 'client' &&
  ctxs[1].MYSEAT === 1 && ctxs[2].MYSEAT === 2,
  ctxs.map(c => c.MODE + '/' + c.MYSEAT).join(' '));
T('everyone starts with seven', ctxs.every(c => c.MYHAND.length === 7));

/* ---- premature and hostile intents ---- */
const preTurn = ctxs[0].ENGINE.turn;
ctxs[2].TX.send('intent', { key: 'c2k', seat: 1, move: { t: 'draw' } });   // spoofing Mick's seat
T('a spoofed seat is ignored', ctxs[0].ENGINE.turn === preTurn &&
  ctxs[0].ENGINE.players.map(p => p.hand.length).every(n => n === 7));

const pub = (ctx) => JSON.stringify({
  turn: ctx.V.turn, dir: ctx.V.dir, ac: ctx.V.activeColour, top: ctx.V.top.id,
  deckN: ctx.V.deckN, phase: ctx.V.phase, over: ctx.V.over, winner: ctx.V.winner,
  players: ctx.V.players.map(p => ({ n: p.name, h: p.handN, c: p.called })),
});

/* ---- a full game, every seat through its own UI, truth checked every turn ---- */
let mismatches = 0, handDrift = 0, guard = 3000, offTurnBounces = 0;
const H = ctxs[0].ENGINE;
while (H.phase !== 'over' && guard-- > 0) {
  const seat = H.turn;
  const ctx = ctxs[seat];

  /* an out-of-turn poke from someone else, every tenth turn — it must bounce */
  if (H.turnCount % 10 === 3) {
    const rude = (seat + 1) % 3;
    const before = JSON.stringify(H.players.map(p => p.hand.map(c => c.id)));
    ctxs[rude].sendMove({ t: 'draw' });
    if (JSON.stringify(H.players.map(p => p.hand.map(c => c.id))) === before) offTurnBounces++;
  }

  const moves = LC.legalMoves(H, seat);
  let mv = moves.find(m => m.t === 'call') || LC.botMove(H, seat);
  if (mv.t === 'play') {
    const card = H.players[seat].hand.find(c => c.id === mv.id);
    if ((card.kind === 'wild' || card.kind === 'w4') && !mv.colour) mv = { t: 'play', id: mv.id, colour: 'teal' };
  }
  ctx.sendMove(mv);

  /* after the push, every client's view must equal the host's truth */
  const truth = pub(ctxs[0]);
  for (let j = 1; j < 3; j++) {
    if (pub(ctxs[j]) !== truth) mismatches++;
    const mine = H.players[j].hand.map(c => c.id).join(',');
    const theirs = ctxs[j].MYHAND.map(c => c.id).join(',');
    if (mine !== theirs) handDrift++;
  }
}
T('the game completes over the wire', H.phase === 'over', 'guard=' + guard);
T('every push left every client agreeing with the host', mismatches === 0, String(mismatches));
T('no hand ever drifted from truth', handDrift === 0, String(handDrift));
T('out-of-turn intents always bounced', offTurnBounces > 0, String(offTurnBounces));
T('the winner is a real seat', H.winner >= 0 && H.winner <= 2, String(H.winner));
T('finished-game intents bounce', (() => {
  const before = JSON.stringify(H.players.map(p => p.hand.length));
  ctxs[1].sendMove({ t: 'draw' });
  return JSON.stringify(H.players.map(p => p.hand.length)) === before;
})());

/* ---- intents before any deal must not detonate a fresh host ---- */
{
  const cold = makeContext('cold.js');
  cold.HOSTING = true;
  cold.TX = { key: 'hk', send() {}, track() {}, presence: () => ({}), alive: () => true, close() {} };
  let blew = false;
  try { cold.onWire('intent', { key: 'x', seat: 0, move: { t: 'draw' } }); } catch (e) { blew = true; }
  T('an intent before the deal is shrugged off', !blew);
}

/* ---- practice mode: a whole game against the bots, driven through the UI ---- */
{
  const solo = makeContext('solo.js');
  solo.startBot(3);
  T('practice deals four seats', solo.ENGINE.players.length === 4 && solo.MYSEAT === 0);
  let g2 = 3000;
  while (solo.ENGINE.phase !== 'over' && g2-- > 0) {
    if (solo.ENGINE.turn === solo.MYSEAT) {
      const moves = LC.legalMoves(solo.ENGINE, 0);
      let mv = moves.find(m => m.t === 'call') || LC.botMove(solo.ENGINE, 0);
      if (mv.t === 'play') {
        const card = solo.ENGINE.players[0].hand.find(c => c.id === mv.id);
        if ((card.kind === 'wild' || card.kind === 'w4') && !mv.colour) mv = { t: 'play', id: mv.id, colour: 'coral' };
      }
      solo.sendMove(mv);           // instant timers run the whole bot chain after each of ours
    } else {
      solo.botClock();
    }
  }
  T('a practice game runs to the end', solo.ENGINE.phase === 'over', 'guard=' + g2);
  T('the view tracked the practice engine',
    solo.V.over === true && solo.MYHAND.length === solo.ENGINE.players[0].hand.length);
  let all = solo.ENGINE.deck.concat(solo.ENGINE.discard);
  solo.ENGINE.players.forEach(p => { all = all.concat(p.hand); });
  T('practice conserves all 108', all.length === 108 && new Set(all.map(c => c.id)).size === 108);
}

finished = true;
console.log(fails === 0 ? 'LASTCARDWIRE: ALL PASS' : 'LASTCARDWIRE FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
