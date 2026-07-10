/* netsim.js — the wire test.
   Two complete game instances in isolated vm contexts, joined by an in-process
   bus that plays Supabase Realtime (broadcast, self:false). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'coastline', 'index.html'), 'utf8');
const gameCode = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  + '\n;globalThis.__B = { get NET(){ return NET; }, get G(){ return G; }, get MYSEAT(){ return MYSEAT; } };';

let fails = 0;
const T = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fails++; };
const DBG = !!process.env.NETSIM_DEBUG;

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

const host = makeContext('host.js');
const client = makeContext('client.js');
const ctxs = [host, client];

function wire(ctx, idx) {
  ctx.__B.NET.tx = {
    send(type, payload) {
      const p = JSON.stringify(payload);
      ctxs.forEach((other, j) => { if (j !== idx) other.__B.NET.onMessage(type, JSON.parse(p)); });
    },
    track() {}, presence() { return {}; },
  };
}
wire(host, 0); wire(client, 1);

const roster = [{ key: 'hk', name: 'Josh', uid: null }, { key: 'ck', name: 'Mick', uid: null }];
client.__B.NET.pkey = 'ck';
client.__B.NET.mode = 'joining';
host.__B.NET.pkey = 'hk';
host.__B.NET.mode = 'lobby-host';

host.__B.NET.tx.send('start', { roster });
host.__B.NET.onStart({ roster }, true);

const pub = g => JSON.stringify({
  turn: g.__B.G.turn, playsLeft: g.__B.G.playsLeft, over: g.__B.G.over,
  players: g.__B.G.players.map(p => ({ n: p.name, h: p.hand.length, b: p.bank.map(c => c.id).sort(), pr: Object.keys(p.props).sort() })),
});

T('start seats both sides correctly', host.__B.MYSEAT === 0 && client.__B.MYSEAT === 1 && client.__B.NET.mode === 'client' && host.__B.NET.mode === 'host');
T('client converges to host public state after start', pub(client) === pub(host));
if (DBG) {
  console.log('  host seat1 hand:', host.__B.G.players[1].hand.map(c => c.id).join(','));
  console.log('  client own hand:', client.__B.G.players[1].hand.map(c => c.id).join(','));
}
const idset = h => JSON.stringify(h.map(c => c.id).sort());
T('client holds exactly its own real cards (order is display-local)',
  idset(client.__B.G.players[1].hand) === idset(host.__B.G.players[1].hand)
  && client.__B.G.players[0].hand.every(c => String(c.id)[0] === 'h'));

/* deterministic hands for the scripted plays */
const dk = host.buildDeck();
const m5 = k => dk.filter(c => c.t === 'money' && c.v === 5)[k];
const rentC = dk.find(c => c.t === 'rent' && c.colors);
const rcol = rentC.colors[0];
const propC = dk.find(c => c.t === 'prop' && c.color === rcol);
host.__B.G.players[0].hand = [m5(0), rentC];
host.addProp(host.__B.G.players[0], propC, rcol);
host.__B.G.players[1].hand = [m5(1), dk.find(c => c.t === 'action' && c.kind === 'nodeal')];
host.__B.G.players[1].bank = [dk.find(c => c.t === 'money' && c.v === 3), dk.find(c => c.t === 'money' && c.v === 4)];  // assets must exceed rent or the engine auto-strips with no ask
host.__B.G.turn = 0; host.__B.G.playsLeft = 3; host.__B.G.over = false;
host.__B.NET.pushState();

host.bankCard(host.__B.G.players[0].hand[0]);
T('host local play reaches the client', pub(client) === pub(host) && client.__B.G.players[0].bank.length === 1);

/* rent at the client: JSN ask first, then payment ask */
const asks = [];
const realOnMessage = client.__B.NET.onMessage.bind(client.__B.NET);
client.__B.NET.onMessage = (t, m) => { if (t === 'ask') asks.push(m); realOnMessage(t, m); };
const payId = client.__B.G.players[1].bank[0].id;
const realAsk = host.__B.NET.ask.bind(host.__B.NET);
host.__B.NET.ask = (seat, ask, cb) => { if(DBG) console.log('  host.ask called:', seat, ask.type); return realAsk(seat, ask, cb); };
const realRP = host.requestPayment;
host.doRent(rentC, rcol, 1, 0);
T('the No Deal ask reaches the owing client first', asks.length === 1 && asks[0].seat === 1 && asks[0].ask.type === 'jsn');
client.__B.NET.reply('jsn', { use: false });
if(DBG) console.log('  asks after jsn reply:', JSON.stringify(asks.map(a=>a.ask)));
if(DBG) console.log('  host pendingAsks:', JSON.stringify(Object.keys(host.__B.NET.pendingAsks)));
if(DBG) console.log('  full ask stream:', JSON.stringify(asks.map(a=>[a.seat,a.ask.type])));
T('declining No Deal produces the payment ask', asks.length === 2 && asks[1].ask.type === 'pay');
client.__B.NET.reply('pay', { ids: [payId] });
T('client payment reply moves the chosen card on the host', host.__B.G.players[0].bank.some(c => c.id === payId) && !host.__B.G.players[1].bank.some(c => c.id === payId) && host.__B.G.players[1].bank.length === 1);
T('post-payment state converges', pub(client) === pub(host));

host.endTurn();
T('turn passes over the wire', host.__B.G.turn === 1 && client.__B.G.turn === 1);
const clientCard = client.__B.G.players[1].hand[0];
const hostHandBefore = host.__B.G.players[1].hand.length;
const bank1Before = host.__B.G.players[1].bank.length;
client.bankCard(clientCard);
T('client intent executes on the host as that seat', host.__B.G.players[1].bank.length === bank1Before + 1 && host.__B.G.players[1].hand.length === hostHandBefore - 1);
T('client sees its own play reflected back', pub(client) === pub(host));

host.__B.G.turn = 0; host.__B.NET.pushState();
const bankBefore = host.__B.G.players[1].bank.length;
client.__B.NET.tx.send('intent', { seat: 1, k: 'bank', a: { id: (client.__B.G.players[1].hand[0] || {}).id } });
T('out-of-turn intents are dropped by the host', host.__B.G.players[1].bank.length === bankBefore);

console.log(fails === 0 ? 'NETSIM: ALL PASS' : 'NETSIM FAILURES: ' + fails);
process.exit(fails === 0 ? 0 : 1);
