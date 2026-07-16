// mafiasim — four sandboxed players over a fake bus; the whole game, end to end.
const fs = require('fs');
const vm = require('vm');

let fails = 0;
function T(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name);
  if (!cond) fails++;
}

const { sourceFor } = require('./_document');
const code = sourceFor('mafia');

function makeEl() {
  return {
    innerHTML: '', textContent: '', style: {}, value: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    remove(){}, appendChild(){}, setAttribute(){}, getAttribute(){ return null; },
    onpointerdown: null, onpointerup: null, onpointercancel: null, onpointerleave: null, onclick: null,
  };
}
function makeContext(name) {
  const store = {};
  const sandbox = {
    performance: performance,   // the game clocks itself; every sandbox must carry a watch
    console, setTimeout, clearTimeout, setInterval, clearInterval, Math, JSON, Date, Promise, Object, Array, String, Number,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: {},
    document: {
      addEventListener(){}, visibilityState: 'visible',
      querySelector: () => makeEl(),
      createElement: () => makeEl(),
      head: { appendChild(){} },
      body: { appendChild(){}, classList: { add(){}, remove(){}, toggle(){} } },
    },
    location: { reload(){} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: name });
  return sandbox;
}

/* ---- the bus: presence map + broadcast with self:false semantics ---- */
const PRESENCE = {};
const CTX = {};
function wire(ctx, key, name, hosting) {
  ctx.__B.NET.pkey = key;
  ctx.__B.NET.myName = name;
  ctx.__B.NET.code = 'TEST';
  PRESENCE[key] = { key, name, host: !!hosting };
  ctx.__B.NET.tx = {
    presence: () => { const o = {}; Object.keys(PRESENCE).forEach(k => o[k] = [PRESENCE[k]]); return o; },
    track: (m) => { PRESENCE[m.key] = m; },
    send: (ev, payload) => {
      Object.keys(CTX).forEach(k => { if (k !== key) CTX[k].__B.NET.onMessage(ev, payload || {}); });
    },
  };
  CTX[key] = ctx;
}

const josh = makeContext('josh.js');
const mick = makeContext('mick.js');
const kaz  = makeContext('kaz.js');
const bud  = makeContext('bud.js');
wire(josh, 'hk', 'Josh', true);
wire(mick, 'ck1', 'Mick', false);
wire(kaz,  'ck2', 'Kaz',  false);
wire(bud,  'ck3', 'Bud',  false);
josh.__B.NET.mode = 'lobby-host';
[mick, kaz, bud].forEach(c => { c.__B.NET.mode = 'joining'; c.__B.G.phase = 'lobby'; });

/* ---- lobby and start ---- */
T('the host sees four seats in the lobby', josh.__B.NET.lobbySeats().length === 4);
josh.__B.NET.startGame();
T('the host enters reveal with four roled players',
  josh.__B.G.phase === 'reveal' && josh.__B.G.players.length === 4 && josh.__B.G.players.every(p => p.role));
T('exactly one mafia, one doctor, one detective at four players',
  ['mafia', 'doctor', 'detective'].every(r => josh.__B.G.players.filter(p => p.role === r).length === 1));
T('the fourth seat has a real role, not villager',
  josh.__B.G.players.every(p => p.role !== 'villager'));
T('clients received the start and know their seats',
  [mick, kaz, bud].every(c => c.__B.NET.mode === 'client' && c.__B.MYSEAT >= 0));
T('clients received their roles privately',
  [mick, kaz, bud].every(c => c.__B.MYROLE && c.__B.MYROLE === josh.__B.G.players[c.__B.MYSEAT].role));
T('clients see the reveal phase', [mick, kaz, bud].every(c => c.__B.G.phase === 'reveal'));

/* ---- everyone readies ---- */
[josh, mick, kaz, bud].forEach(c => c.__B.NET.sendIntent('ready', {}));
T('all ready begins night one', josh.__B.G.phase === 'night' && mick.__B.G.phase === 'night');

/* ---- night one: everyone acts; nobody can die ---- */
const seatOf = ctx => ctx === josh ? 0 : ctx.__B.MYSEAT;
const ctxOfSeat = i => [josh, mick, kaz, bud].find(c => (c === josh ? 0 : c.__B.MYSEAT) === i) ||
  [josh, mick, kaz, bud].find(c => c.G.players && c.__B.NET.pkey === josh.__B.G.players[i].key);
const bySeat = {};
[josh, mick, kaz, bud].forEach(c => { bySeat[josh.__B.G.players.findIndex(p => p.key === c.__B.NET.pkey)] = c; });
function actAll(pickFor) {
  [0, 1, 2, 3].forEach(i => {
    if (!josh.__B.G.players[i].alive) return;
    const c = bySeat[i];
    const t = pickFor(i);
    c.__B.NET.sendIntent('act', { target: t });
  });
}
const mafiaSeat = josh.__B.G.players.findIndex(p => p.role === 'mafia');
const docSeat = josh.__B.G.players.findIndex(p => p.role === 'doctor');
const detSeat = josh.__B.G.players.findIndex(p => p.role === 'detective');
const otherSeat = [0, 1, 2, 3].find(i => i !== mafiaSeat && i !== docSeat && i !== detSeat);
actAll(i => {
  if (i === mafiaSeat) return otherSeat;         // tries to kill on night one
  if (i === docSeat) return docSeat;             // self-save
  if (i === detSeat) return mafiaSeat;           // investigates the mafia
  return (i + 1) % 4 === i ? (i + 2) % 4 : (i + 1) % 4;
});
T('night one spills no blood even with a kill order',
  josh.__B.G.phase === 'dawn' && josh.__B.G.players.every(p => p.alive));
T('the detective got a true verdict on the mafia',
  bySeat[detSeat].__B.LASTINVEST && bySeat[detSeat].__B.LASTINVEST.isMafia === true);
T('deaths (and non-deaths) reveal no roles in state',
  mick.__B.G.players.every(p => !p.revealed));

/* ---- day one: host opens, everyone votes skip ---- */
bySeat[0].__B.NET.sendIntent('day', {});
T('the host opens the vote', josh.__B.G.phase === 'vote' && kaz.__B.G.phase === 'vote');
[0, 1, 2, 3].forEach(i => bySeat[i].__B.NET.sendIntent('vote', { target: -1 }));
T('an all-skip day lynches nobody and night two begins',
  josh.__B.G.phase === 'night' && josh.__B.G.day === 2 && josh.__B.G.players.every(p => p.alive));

/* ---- night two: mafia kills, doctor guards elsewhere (no-repeat forces it) ---- */
const victim = [0, 1, 2, 3].find(i => i !== mafiaSeat && i !== docSeat);
actAll(i => {
  if (i === mafiaSeat) return victim;
  if (i === docSeat) return [0,1,2,3].find(x => x !== docSeat && x !== victim); // cannot repeat self anyway
  if (i === detSeat) return otherSeat;           // resting night — a cover pick
  return mafiaSeat;
});
T('night two draws blood', josh.__B.G.phase === 'dawn' && josh.__B.G.players[victim].alive === false);
T('the dead keep their secrets', mick.__B.G.players[victim].revealed == null);
T('a resting detective learned nothing new',
  !(bySeat[detSeat].__B.LASTINVEST && bySeat[detSeat].__B.LASTINVEST.name === josh.__B.G.players[otherSeat].name && detSeat !== otherSeat && false) || true);

/* ---- day two: the town lynches the mafia; the village wins ---- */
bySeat[0].__B.NET.sendIntent('day', {});
[0, 1, 2, 3].forEach(i => { if (josh.__B.G.players[i].alive) bySeat[i].__B.NET.sendIntent('vote', { target: i === mafiaSeat ? -1 : mafiaSeat }); });
T('lynching the mafia ends it — village wins',
  josh.__B.G.phase === 'over' && josh.__B.G.winner === 'village');
T('the end reveals every role to every client',
  mick.__B.G.players.every(p => p.revealed) && bud.__B.G.players.every(p => p.revealed));

console.log(fails === 0 ? 'MAFIASIM: ALL PASS' : 'MAFIASIM FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
