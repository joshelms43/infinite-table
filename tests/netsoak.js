/* netsoak.js — the wire soak.
   Random games between two live instances over the in-process bus.
   After every turn: public state must converge, and the host's 106 cards
   must all still exist exactly once. Crashes fail loudly. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'coastline', 'index.html'), 'utf8');
const gameCode = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  + '\n;globalThis.__B = { get NET(){ return NET; }, get G(){ return G; }, get MYSEAT(){ return MYSEAT; } };';

let fails = 0;
const T = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fails++; };

function makeContext(name) {
  const el = () => new Proxy({ classList: { add(){}, remove(){}, toggle(){} }, style: {} }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set() { return true; }
  });
  const sandbox = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise, isNaN, parseInt, parseFloat, RegExp, Error, TypeError,
    document: { querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(), getElementById: () => el(), addEventListener: () => {}, body: { appendChild() {} } },
    addEventListener: () => {},
    location: { reload() {}, search: '', origin: '', pathname: '' },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    navigator: {}, URLSearchParams,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(gameCode, sandbox, { filename: name });
  return sandbox;
}

const pub = g => JSON.stringify({
  turn: g.__B.G.turn, playsLeft: g.__B.G.playsLeft, over: g.__B.G.over,
  players: g.__B.G.players.map(p => ({
    n: p.name, h: p.hand.length,
    b: p.bank.map(c => c.id).sort((a, b) => a - b),
    pr: Object.entries(p.props).map(([k, v]) => k + ':' + v.map(c => c.id).sort((a, b) => a - b).join('.')).sort(),
  })),
});

/* every physical card exists exactly once on the host */
function conserved(host) {
  const G = host.__B.G;
  const ids = [];
  const take = a => (a || []).forEach(c => { if (c && c.id != null) ids.push(c.id); });
  take(G.deck.filter(Boolean));
  take(G.discard.filter(Boolean));
  G.players.forEach(p => {
    take(p.hand); take(p.bank);
    Object.values(p.props).forEach(take);
    Object.values(p.bldg || {}).forEach(slots => Object.values(slots || {}).forEach(c => { if (c && c.id != null) ids.push(c.id); }));
  });
  return ids.length === 106 && new Set(ids).size === 106;
}

function rand(a) { return a[Math.floor(Math.random() * a.length)]; }

function playGame(gameNo) {
  const host = makeContext('host' + gameNo);
  const client = makeContext('client' + gameNo);
  const ctxs = [host, client];
  ctxs.forEach((ctx, idx) => {
    ctx.__B.NET.tx = {
      send(type, payload) {
        const p = JSON.stringify(payload);
        ctxs.forEach((other, j) => { if (j !== idx) other.__B.NET.onMessage(type, JSON.parse(p)); });
      },
      track() {}, presence() { return {}; },
    };
  });

  /* the client answers every ask like a compliant human */
  const cReal = client.__B.NET.onMessage.bind(client.__B.NET);
  client.__B.NET.onMessage = (t, m) => {
    cReal(t, m);
    if (t !== 'ask' || m.seat !== 1) return;
    const a = m.ask, me = client.__B.G.players[1], NETc = client.__B.NET;
    if (a.type === 'jsn') NETc.reply('jsn', { use: false });
    if (a.type === 'hike') NETc.reply('hike', { use: Math.random() < 0.5 });
    if (a.type === 'discard') NETc.reply('discard', { ids: me.hand.slice(0, a.need).map(c => c.id) });
    if (a.type === 'pay') {
      const pool = [...me.bank.map(c => ({ id: c.id, v: c.v })),
                    ...client.propList(me).map(x => ({ id: x.card.id, v: x.card.v }))].sort((x, y) => x.v - y.v);
      const ids = []; let owed = a.amount;
      for (const c of pool) { if (owed <= 0) break; ids.push(c.id); owed -= c.v; }
      NETc.reply('pay', { ids });
    }
  };

  const roster = [{ key: 'hk', name: 'Josh' }, { key: 'ck', name: 'Mick' }];
  client.__B.NET.pkey = 'ck'; client.__B.NET.mode = 'joining';
  host.__B.NET.pkey = 'hk'; host.__B.NET.mode = 'lobby-host';
  host.__B.NET.tx.send('start', { roster });
  host.__B.NET.onStart({ roster }, true);

  const H = host.__B.G;

  function hostTurn() {
    let guard = 0;
    while (!H.over && H.turn === 0 && H.playsLeft > 0 && guard++ < 6) {
      if (Object.keys(host.__B.NET.pendingAsks).length) break;
      const hand = H.players[0].hand;
      if (!hand.length) break;
      const props = hand.filter(c => c.t === 'prop');
      const rents = hand.filter(c => c.t === 'rent');
      const money = hand.filter(c => c.t === 'money');
      const favours = hand.filter(c => c.t === 'action' && c.kind === 'favour');
      const r = Math.random();
      if (props.length && r < 0.55) host.playProp(rand(props), rand(props).color);
      else if (rents.length && r < 0.70) {
        const rc = rand(rents);
        const owned = rc.colors.filter(col => (H.players[0].props[col] || []).length);
        if (owned.length) host.doRent(rc, rand(owned), 1, 0); else if (money.length) host.bankCard(rand(money));
        else break;
      }
      else if (favours.length && r < 0.80) host.doFavour(rand(favours), 1, 0);
      else if (money.length) host.bankCard(rand(money));
      else host.bankCard(rand(hand));
    }
    if (!H.over && H.turn === 0) host.endTurn();
  }

  function clientTurn() {
    const C = client.__B.G;
    let guard = 0;
    while (!C.over && C.turn === 1 && C.playsLeft > 0 && guard++ < 6) {
      const hand = C.players[1].hand;
      if (!hand.length) break;
      const props = hand.filter(c => c.t === 'prop');
      const money = hand.filter(c => c.t === 'money');
      const payday = hand.find(c => c.t === 'action' && c.kind === 'payday');
      const r = Math.random();
      if (props.length && r < 0.5) client.playProp(rand(props), rand(props).color);
      else if (payday && r < 0.65) client.playPayday(payday);
      else if (money.length) client.bankCard(rand(money));
      else client.bankCard(rand(hand));
    }
    if (!C.over && C.turn === 1) client.endTurn();
  }

  let turns = 0, diverged = false, leaked = false;
  while (!H.over && turns < 200) {
    if (H.turn === 0) hostTurn(); else clientTurn();
    turns++;
    if (pub(host) !== pub(client)) { diverged = true; break; }
    if (!conserved(host)) { leaked = true; break; }
  }
  return { turns, over: H.over, diverged, leaked };
}

const GAMES = 8;
let completed = 0, totalTurns = 0;
for (let g = 0; g < GAMES; g++) {
  let res;
  try { res = playGame(g); }
  catch (e) { T('game ' + g + ' crashed: ' + (e && e.message), false); continue; }
  totalTurns += res.turns;
  if (res.over) completed++;
  T('game ' + g + ': no divergence over ' + res.turns + ' turns', !res.diverged);
  T('game ' + g + ': all 106 cards conserved', !res.leaked);
}
console.log('completed naturally:', completed + '/' + GAMES, '· total turns:', totalTurns);
console.log(fails === 0 ? 'NETSOAK: ALL PASS' : 'NETSOAK FAILURES: ' + fails);
process.exit(fails === 0 ? 0 : 1);
