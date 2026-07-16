/* netsim.js — the wire test.
   Two complete game instances in isolated vm contexts, joined by an in-process
   bus that plays Supabase Realtime (broadcast, self:false). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const { sourceFor, BRIDGE } = require('./_document');
const gameCode = sourceFor('mdeal', BRIDGE);   // the document decides the order

let fails = 0;
function conserve(ctx,label){
  const G=ctx.__B.G, ids=[];
  const take=a=>(a||[]).forEach(c=>{if(c&&c.id!=null)ids.push(c.id);});
  take(G.deck); take(G.discard);
  G.players.forEach(p=>{take(p.hand);take(p.bank);Object.values(p.props).forEach(take);
    Object.values(p.bldg||{}).forEach(sl=>Object.values(sl||{}).forEach(c=>{if(c&&c.id!=null)ids.push(c.id);}));});
  if(ids.length!==106||new Set(ids).size!==106){
    const seen={},d=[];ids.forEach(id=>{seen[id]=(seen[id]||0)+1;if(seen[id]===2)d.push(id);});
    console.log('  CONSERVE@'+label+': total',ids.length,'dupes',JSON.stringify(d));
    return false;
  }
  return true;
}
const T = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fails++; };
const DBG = !!process.env.NETSIM_DEBUG;

function makeContext(name) {
  const el = () => new Proxy({ classList: { add(){}, remove(){}, toggle(){} }, style: {} }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set() { return true; }
  });
  const sandbox = {
    performance: performance,   // the game clocks itself; every sandbox must carry a watch
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

const roster = [{ key: 'hk', name: 'Josh', uid: null }, { key: 'ck', name: 'Mick', uid: null }, { key: 'bot-b', name: 'Bazza', isAI: true }];
client.__B.NET.pkey = 'ck';
client.__B.NET.mode = 'joining';
host.__B.NET.pkey = 'hk';
host.__B.NET.mode = 'lobby-host';

host.__B.NET.tx.send('start', { roster, rules: { v:1, firstTurnAttack:false, clock:{ mode:'off' } } });
host.__B.NET.onStart({ roster }, true);

const pub = g => JSON.stringify({
  turn: g.__B.G.turn, playsLeft: g.__B.G.playsLeft, over: g.__B.G.over,
  players: g.__B.G.players.map(p => ({ n: p.name, h: p.hand.length, b: p.bank.map(c => c.id).sort(), pr: Object.keys(p.props).sort() })),
});

T('rules travel with the start broadcast', client.__B.RULES && client.__B.RULES.firstTurnAttack===false);
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

/* deterministic hands for the scripted plays — PULLED from the live world, never minted.
   The old version built a second deck for its stunt cards. Under the canonical catalog
   (ids reset every build — the property blob resurrection depends on) those clones
   collide with the real cards by id, and 106-card conservation dies at random depending
   on which originals happened to be replaced. Cards now come from wherever they already
   live, and the replaced originals go back to the deck: conservation by construction. */
const GH = host.__B.G;
function pull(pred){
  const scan=[GH.deck, ...GH.players.map(p=>p.hand), ...GH.players.map(p=>p.bank)];
  for(const arr of scan){ const i=arr.findIndex(pred); if(i>-1) return arr.splice(i,1)[0]; }
  throw new Error('netsim stacking: no card in the world satisfies the script');
}
const rentC = pull(c => c.t === 'rent' && c.colors);
const rcol = rentC.colors[0], rco2 = rentC.colors[1];
const rentC2 = pull(c => c.t === 'rent' && c.colors && c.colors[0] === rcol && c.colors[1] === rco2);
const propC = pull(c => c.t === 'prop' && c.color === rcol);
const m5a = pull(c => c.t === 'money' && c.v === 5), m5b = pull(c => c.t === 'money' && c.v === 5);
const ndS = pull(c => c.t === 'action' && c.kind === 'nodeal');
const mo3 = pull(c => c.t === 'money' && c.v === 3), mo4 = pull(c => c.t === 'money' && c.v === 4);
GH.players[0].hand.splice(0).forEach(c => GH.deck.push(c));   // the replaced originals return to the deck
GH.players[1].hand.splice(0).forEach(c => GH.deck.push(c));
GH.players[1].bank.splice(0).forEach(c => GH.deck.push(c));
GH.players[0].hand = [m5a, rentC, rentC2];
host.addProp(GH.players[0], propC, rcol);
GH.players[1].hand = [m5b, ndS];
GH.players[1].bank = [mo3, mo4];   // assets must exceed rent or the engine auto-strips with no ask
GH.turn = 0; GH.playsLeft = 3; GH.over = false;
host.__B.NET.pushState();
if(!conserve(host,'post-stacking')) throw new Error('stacking broke conservation');

host.bankCard(host.__B.G.players[0].hand[0]);
T('host local play reaches the client', pub(client) === pub(host) && client.__B.G.players[0].bank.length === 1);

/* rent at the client: no JSN popup — the pay ask itself carries the block option */
const asks = [];
const realOnMessage = client.__B.NET.onMessage.bind(client.__B.NET);
client.__B.NET.onMessage = (t, m) => { if (t === 'ask') asks.push(m); realOnMessage(t, m); };
const payId = client.__B.G.players[1].bank[0].id;
const ndCard = host.__B.G.players[1].hand.find(c => c.t === 'action' && c.kind === 'nodeal');
host.doRent(rentC, rcol, 1, 0);
T('the pay ask arrives directly, carrying the block option', asks.length === 1 && asks[0].seat === 1 && asks[0].ask.type === 'pay' && asks[0].ask.canBlock === true);
/* the demo bug: mid-ask, the charger tried to keep playing */
const chargerBankBefore = host.__B.G.players[0].bank.length;
const chargerHandBefore = host.__B.G.players[0].hand.length;
host.bankCard(host.__B.G.players[0].hand[0]);
T('the charger cannot act while a payment resolves', host.__B.G.players[0].bank.length === chargerBankBefore && host.__B.G.players[0].hand.length === chargerHandBefore);
/* the client blocks by playing its No Deal through the pay reply */
const bank1Pre = host.__B.G.players[1].bank.length;
client.__B.NET.reply('pay', { block: true, id: ndCard.id });
T('the block cancels the rent — no money moves', host.__B.G.players[1].bank.length === bank1Pre && host.__B.G.players[0].bank.length === 1);
T('the No Deal leaves the hand for the discard', !host.__B.G.players[1].hand.some(c => c.id === ndCard.id) && host.__B.G.discard.some(c => c.id === ndCard.id));
T('post-block state converges', pub(client) === pub(host));
/* second rent: the No Deal is spent, so this one gets paid */
host.doRent(rentC2, rcol, 1, 0);
T('the second pay ask has no block option', asks.length === 2 && asks[1].ask.type === 'pay' && !asks[1].ask.canBlock);
client.__B.NET.reply('pay', { ids: [payId] });
T('client payment reply moves the chosen card on the host', host.__B.G.players[0].bank.some(c => c.id === payId) && !host.__B.G.players[1].bank.some(c => c.id === payId) && host.__B.G.players[1].bank.length === 1);
T('post-payment state converges', pub(client) === pub(host));
T('mid-game conservation holds after the payment round', conserve(host,'post-payment'));

host.endTurn();
T('turn passes over the wire', host.__B.G.turn === 1 && client.__B.G.turn === 1);
const clientCard = client.__B.G.players[1].hand[0];
const hostHandBefore = host.__B.G.players[1].hand.length;
const bank1Before = host.__B.G.players[1].bank.length;
client.bankCard(clientCard);
T('client intent executes on the host as that seat', host.__B.G.players[1].bank.length === bank1Before + 1 && host.__B.G.players[1].hand.length === hostHandBefore - 1);
T('client sees its own play reflected back', pub(client) === pub(host));

/* wild movement travels as an intent: client drags, host validates and moves */
const wcard = pull(c => c.t === 'wild' && c.colors && c.colors.length === 2);
const wcolA = wcard.colors[0], wcolB = wcard.colors[1];
host.addProp(host.__B.G.players[1], pull(c => c.t === 'prop' && c.color === wcolA), wcolA);
host.addProp(host.__B.G.players[1], wcard, wcolA);
host.addProp(host.__B.G.players[1], pull(c => c.t === 'prop' && c.color === wcolB), wcolB);
host.__B.NET.pushState();
client.moveWildTo(wcard.id, wcolB);
const wdest = host.__B.G.players[1].props[wcolB] || [];
T('client rewild intent moves the wild on the host, landing at the bottom',
  wdest.length === 2 && wdest[1].id === wcard.id && !(host.__B.G.players[1].props[wcolA] || []).some(c => c.id === wcard.id));
T('post-rewild state converges', pub(client) === pub(host));

host.__B.G.turn = 0; host.__B.NET.pushState();
const bankBefore = host.__B.G.players[1].bank.length;
let nacks = 0;
const omN = client.__B.NET.onMessage;
client.__B.NET.onMessage = (t, m) => { if (t === 'nack' && m.seat === 1) nacks++; omN(t, m); };
client.__B.NET.tx.send('intent', { seat: 1, k: 'bank', a: { id: (client.__B.G.players[1].hand[0] || {}).id } });
T('out-of-turn intents are dropped by the host', host.__B.G.players[1].bank.length === bankBefore);
T('the dropped intent bounces back as a nack', nacks === 1);

/* ===== react over the wire: the steal window travels, block and pass both work ===== */
host.__B.G.turn = 0; host.__B.G.playsLeft = 3; host.__B.G.turnCount = 9;
const ndDecoy = pull(c => c.t === 'action' && c.kind === 'nodeal');   // pulled from wherever they live — physical moves, never clones
const ndR = pull(c => c.t === 'action' && c.kind === 'nodeal');
host.__B.G.players[1].hand.push(ndDecoy);   // seated EARLIER in the hand: an id-blind host burns this one instead
host.__B.G.players[1].hand.push(ndR);
host.__B.NET.pushState();
const asksR = [];
const omR = client.__B.NET.onMessage;
client.__B.NET.onMessage = (t, m) => { if (t === 'ask') asksR.push(m); omR(t, m); };
let stoleR = null;
const realERM = client.enterReactMode;
client.enterReactMode = () => {};   // sandbox timers are immediate: the real window would auto-pass before we could reply
host.resolveBlock(1, 0, 'Sneaky Swipe', b => { stoleR = !b; });
T('the react ask reaches the remote defender with the threatening card',
  asksR.length === 1 && asksR[0].ask.type === 'react' && asksR[0].ask.card && asksR[0].ask.card.kind === 'swipe');
T('nothing resolves until the window answers', stoleR === null);
client.__B.NET.reply('react', { use: true, id: ndR.id });
T('a remote block through the window cancels the steal', stoleR === false && host.__B.G.discard.some(c => c.id === ndR.id));
T('the host burned the exact card the player named — the decoy stays in hand',
  host.__B.G.players[1].hand.some(c => c.id === ndDecoy.id) && !host.__B.G.players[1].hand.some(c => c.id === ndR.id));
stoleR = null;
host.resolveBlock(1, 0, 'Swap Meet', b => { stoleR = !b; });
client.__B.NET.reply('react', { use: false });
T('a remote pass lets it happen', stoleR === true);

/* ===== keyed asks: a stale reply cannot detonate a live ask ===== */
host.__B.G.turn = 0; host.__B.G.playsLeft = 3;
const rentS = host.__B.G.deck.splice(host.__B.G.deck.findIndex(c => c.t === 'rent' && c.colors), 1)[0];
const rcolS = rentS.colors.find(cc => (host.__B.G.players[0].props[cc] || []).length) || rentS.colors[0];
if (!(host.__B.G.players[0].props[rcolS] || []).length) host.addProp(host.__B.G.players[0], host.__B.G.deck.splice(host.__B.G.deck.findIndex(c => c.t === 'prop' && c.color === rcolS), 1)[0], rcolS);
host.__B.G.players[0].hand.push(rentS);
host.doRent(rentS, rcolS, 1, 0);
T('the rent ask is pending on the host', Object.keys(host.__B.NET.pendingAsks).length === 1);
const liveAid = host.__B.NET.pendingAskInfo[1].aid;
host.__B.NET.tx.send('intent', { seat: 1, k: 'reply', a: { rt: 'react', use: false, aid: (liveAid || 0) - 1 } });
T('a stale reply bounces off a keyed ask', Object.keys(host.__B.NET.pendingAsks).length === 1);
client.__B.NET.reply('pay', { ids: [] });
T('the true reply resolves it', Object.keys(host.__B.NET.pendingAsks).length === 0);

client.enterReactMode = realERM;
client.__B.NET.onMessage = omR;


/* ===== the crown: host dies mid-game, resurrects from its blob, the client reconverges ===== */
host.__B.G.turn = 1; host.__B.NET.pushState();
const blob = host.__B.NET.persistBlob();
const host2 = makeContext('host2.js');
ctxs[0] = host2;   // the old host is gone; a new process takes its seat
wire(host2, 0);
host2.__B.NET.pkey = 'hk';
host2.__B.NET.code = blob.code;
host2.__B.NET.mode = 'host';
host2.__B.NET.restoreFromBlob(JSON.parse(JSON.stringify(blob)));
host2.__B.NET.tx.send('start', { roster: host2.__B.NET.roster });
host2.__B.NET.pushState();
T('the resurrected host rebuilds the table', pub(host2) === pub(client));
T('the client keeps its seat and real hand through the resurrection',
  client.__B.MYSEAT === 1 && client.__B.G.players[1].hand.length === host2.__B.G.players[1].hand.length);
const resHand = host2.__B.G.players[1].hand.length;
client.bankCard(client.__B.G.players[1].hand[0]);
T('play continues against the resurrected host', host2.__B.G.players[1].bank.length >= 1 && host2.__B.G.players[1].hand.length === resHand - 1 && pub(host2) === pub(client));

/* ===== migration: the host vanishes for good; the client inherits the table ===== */
client.__B.NET.gone = { hk: true };
const preMigHand = client.__B.G.players[1].hand.map(c => c.id).sort().join(',');
client.__B.NET.migrateFrom('hk');
client.__B.NET.finishPromotion();
T('the survivor promotes itself to host', client.__B.NET.mode === 'host' && client.__B.NET.hostKey === 'ck');
T('the departed host is eliminated as a loss', client.__B.G.players[0].out === true);
T('the heir keeps its own hand through the rebuild', client.__B.G.players[1].hand.map(c => c.id).sort().join(',') === preMigHand);
T('the bot survives migration (its unknown hand rebuilds; it will redraw)', client.__B.G.players[2].out !== true);
const idsAll = [];
const takeAll = a => (a || []).forEach(c => { if (c && c.id != null) idsAll.push(c.id); });
takeAll(client.__B.G.deck); takeAll(client.__B.G.discard);
client.__B.G.players.forEach(p => { takeAll(p.hand); takeAll(p.bank); Object.values(p.props).forEach(takeAll);
  Object.values(p.bldg || {}).forEach(sl => Object.values(sl || {}).forEach(c => { if (c && c.id != null) idsAll.push(c.id); })); });
if(process.env.NETSIM_DEBUG) console.log('  DBG conserve: total', idsAll.length, 'unique', new Set(idsAll).size, 'deck', client.__B.G.deck.length, 'hands', client.__B.G.players.map(p=>p.hand.length).join('/'));
T('the rebuilt table conserves all 106 cards exactly once', idsAll.length === 106 && new Set(idsAll).size === 106);
T('the game continues — two players still stand', client.__B.G.over === false && client.__B.G.turn === 1);


console.log(fails === 0 ? 'NETSIM: ALL PASS' : 'NETSIM FAILURES: ' + fails);
process.exit(fails === 0 ? 0 : 1);
